import type { RandoxCollectionMethod } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { decryptField, encryptField } from '../../lib/crypto.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { nexusLabClient } from './clients/index.js';
import {
  isCollectionMethodEnabled,
  enabledCollectionMethods,
  loadIdMap,
  randoxClinicId,
  randoxTestClinicLocationId,
  defaultTestReason,
  defaultCancellationReasonId,
  isRandoxEnabled,
} from './config.js';
import { RandoxWindowExpiredError } from './errors.js';
import { orderStatusFromCode } from './types.js';
import { scheduleFirstPoll } from './pollingJob.js';
import { mappedRandoxIdFor } from './catalogueLookup.js';
import type { CreatePendingOrderRequest, OrderRef } from './types.js';

export class RandoxOrderError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'RandoxOrderError';
  }
}

/**
 * Result of an operation with a limited window. `windowExpired` is a normal
 * outcome, not a failure: Randox refused because the change came too late.
 * Callers show the message and move on; nothing retries.
 */
export interface WindowedResult {
  ok: boolean;
  windowExpired: boolean;
  message: string;
}

function assertEnabled(): void {
  if (!isRandoxEnabled()) {
    throw new RandoxOrderError('The Randox integration is switched off (RANDOX_ENABLED=false).', 503);
  }
}

/** The identifier triple most Nexus endpoints want. */
export function orderRefOf(order: { orderNumber: string; randoxOrderId: number | null; clinicId: number | null }): OrderRef {
  const clinicId = order.clinicId ?? randoxClinicId();
  if (order.randoxOrderId === null || clinicId === null) {
    throw new RandoxOrderError(
      `Order ${order.orderNumber} is missing the numeric order id or clinic id Randox require. It predates those being captured, or was created while RANDOX_CLINIC_ID was unset.`,
      409,
    );
  }
  return { orderId: order.randoxOrderId, orderNumber: order.orderNumber, clinicId };
}

/**
 * The patient block CreatePendingOrder requires.
 *
 * The spec makes FirstName, LastName, DateOfBirth and BiologicalSexId all
 * required — so a real date of birth and a biological sex must exist on the
 * profile before any order can be placed at all. Both are refused here
 * rather than being defaulted: guessing a sex changes which reference
 * ranges the laboratory applies, and a wrong date of birth is the single
 * strongest signal the result-linking flow relies on.
 */
async function buildOrderIdentity(patientId: string) {
  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    include: { patientProfile: true },
  });
  if (!patient || patient.role !== 'PATIENT') {
    throw new RandoxOrderError('No patient account with that id.', 404);
  }
  const profile = patient.patientProfile;
  if (!profile) {
    throw new RandoxOrderError('This patient has not completed their profile, so an order cannot be placed yet.', 409);
  }

  let dateOfBirth: string;
  try {
    dateOfBirth = decryptField(profile.dobEncrypted).slice(0, 10);
  } catch {
    throw new RandoxOrderError('This patient’s date of birth could not be read, so an order cannot be placed.', 409);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new RandoxOrderError(
      `This patient’s date of birth is not a usable date ("${dateOfBirth}"). Randox require it in yyyy-mm-dd form.`,
      409,
    );
  }

  if (profile.sex !== 'MALE' && profile.sex !== 'FEMALE') {
    throw new RandoxOrderError(
      'Randox require a biological sex on every order (BiologicalSexId is mandatory) and this patient has none recorded. Sex-specific reference ranges depend on it, so it cannot be defaulted.',
      409,
    );
  }

  // GetBiologicalSex returns {"1": Male, "2": Female} in the documented
  // example. Resolved through the cached catalogue when a refresh has run,
  // so a different id in production doesn't need a code change.
  const biologicalSexId = await resolveBiologicalSexId(profile.sex);

  return {
    patient,
    profile,
    firstName: profile.firstName,
    lastName: profile.lastName,
    dateOfBirth,
    biologicalSexId,
  };
}

async function resolveBiologicalSexId(sex: 'MALE' | 'FEMALE'): Promise<number> {
  const wanted = sex === 'MALE' ? 'male' : 'female';
  const entry = await prisma.randoxCatalogueEntry.findFirst({
    where: { kind: 'BIOLOGICAL_SEX', isCurrent: true, name: { equals: wanted, mode: 'insensitive' } },
  });
  const fromCatalogue = entry ? Number(entry.randoxId) : NaN;
  if (Number.isInteger(fromCatalogue)) return fromCatalogue;

  // Documented default. Only reached before the first reference-data
  // refresh; a mismatch surfaces as a Randox 400 rather than a silent
  // wrong-sex order, because the ids are validated on their side.
  return sex === 'MALE' ? 1 : 2;
}

export interface PlaceOrderInput {
  patientId: string;
  /** Our catalogue Panel.key values. */
  panelKeys: string[];
  /** Our catalogue Marker.key values, for markers ordered outside a panel. */
  markerKeys: string[];
  collectionMethod: RandoxCollectionMethod;
  placedById: string | null;
}

/**
 * POST /Order/CreatePendingOrder.
 *
 * Both identifiers it returns are persisted in the same breath as the call
 * returning: an order we placed but failed to record is invisible to
 * polling and will never be ingested, and — since CreatePendingOrder has no
 * field for a client-side patient reference — our own row is the ONLY link
 * between the order and the account.
 */
export async function placeOrder(input: PlaceOrderInput) {
  assertEnabled();

  if (!isCollectionMethodEnabled(input.collectionMethod)) {
    throw new RandoxOrderError(
      `Collection method ${input.collectionMethod} is not enabled. Enabled: ${enabledCollectionMethods().join(', ') || '(none)'}. Set by RANDOX_COLLECTION_METHODS, which must match what Randox have contractually agreed we may offer.`,
      409,
    );
  }

  const clinicId = randoxClinicId();
  const testClinicLocationId = randoxTestClinicLocationId();
  if (clinicId === null || testClinicLocationId === null) {
    throw new RandoxOrderError(
      'RANDOX_CLINIC_ID is not set, so no order can be attributed to this clinic. It comes from GET /Clinic/GetMyClinicDetails.',
      503,
    );
  }

  const testReason = defaultTestReason();
  if (!testReason) {
    throw new RandoxOrderError(
      'RANDOX_DEFAULT_TEST_REASON_ID is not set. CreatePendingOrder requires a non-empty TestReasons array; valid ids come from GET /TestReason/GetTestingReasons.',
      503,
    );
  }

  // Panel/test ids are integers on the wire. Resolved through the admin's
  // catalogue mapping first, falling back to the static id map file.
  const panelIds: number[] = [];
  const testIds: number[] = [];
  const unmapped: string[] = [];

  for (const key of input.panelKeys) {
    const id = await mappedRandoxIdFor('PANEL', key, loadIdMap().panels[key]);
    if (id === null) unmapped.push(key);
    else panelIds.push(id);
  }
  for (const key of input.markerKeys) {
    const id = await mappedRandoxIdFor('TEST', key, loadIdMap().tests[key]);
    if (id === null) unmapped.push(key);
    else testIds.push(id);
  }

  // Sending a partial order silently would mean the patient is bled and
  // billed for tests that were never actually ordered.
  if (unmapped.length > 0) {
    throw new RandoxOrderError(
      `No Randox identifier is mapped for ${unmapped.join(', ')}. Add them to RANDOX_ID_MAP_FILE (config/randox/id-map.json) before ordering. The order was not placed.`,
      409,
    );
  }

  if (panelIds.length === 0 && testIds.length === 0) {
    throw new RandoxOrderError('An order needs at least one panel or one test.', 400);
  }

  const identity = await buildOrderIdentity(input.patientId);

  const request: CreatePendingOrderRequest = {
    FirstName: identity.firstName,
    LastName: identity.lastName,
    DateOfBirth: identity.dateOfBirth,
    BiologicalSexId: identity.biologicalSexId,
    TestClinicLocationId: testClinicLocationId,
    PanelIds: panelIds,
    TestIds: testIds,
    // Asks for the patient-facing scalebar report rather than the tabular
    // laboratory one. See types.ts.
    IsHealthCheckPanelReport: env.RANDOX_HEALTH_CHECK_PANEL_REPORT,
    IsCvScoreRequired: env.RANDOX_CV_SCORE_REQUIRED,
    TestReasons: [testReason],
  };

  const response = await nexusLabClient().createPendingOrder(request);

  const order = await prisma.randoxOrder.create({
    data: {
      // THREE IDENTIFIERS, AND ONLY TWO OF THEM EXIST YET.
      //
      // Creation returns orderId and externalNumber. It does NOT return
      // orderNumber — that name first appears on GetOrderStatus, and the
      // spec's two examples spell the two values differently
      // (GC1123-00010300 vs GP-THE-00000130). So externalNumber is stored as
      // itself, orderNumber is SEEDED from it because it is the only string
      // available now and a great deal is keyed on it, and the row is marked
      // unconfirmed until Randox state one. reconcileOrderNumber() below does
      // the stating, and shouts if the two turn out to differ.
      orderNumber: response.externalNumber,
      externalNumber: response.externalNumber,
      orderNumberConfirmed: false,
      randoxOrderId: response.orderId,
      clinicId,
      patientId: input.patientId,
      placedById: input.placedById,
      randoxPanelIds: panelIds.map(String),
      randoxTestIds: testIds.map(String),
      // The identity actually sent to the laboratory, snapshotted here rather
      // than re-read from the profile when the result comes back. This is
      // what makes an automatic link corroborable: if the account is edited
      // between the sample being taken and the result arriving, comparing the
      // account to itself would agree and this does not. See identityCheck.ts.
      orderedFirstName: request.FirstName,
      orderedLastName: request.LastName,
      orderedDobEncrypted: encryptField(request.DateOfBirth),
      collectionMethod: input.collectionMethod,
      status: 'INCOMPLETE',
      nextPollAt: scheduleFirstPoll(new Date()),
    },
  });

  await recordAuditLog({
    actorUserId: input.placedById,
    actorType: input.placedById ? 'USER' : 'SYSTEM',
    action: 'RANDOX_ORDER_CREATED',
    targetType: 'RandoxOrder',
    targetId: order.id,
    metadata: {
      orderNumber: order.orderNumber,
      randoxOrderId: response.orderId,
      clinicId,
      patientId: input.patientId,
      panelIds,
      testIds,
      collectionMethod: input.collectionMethod,
    },
  });

  return order;
}

/**
 * ---------------------------------------------------------------------------
 * THE ONE ASSERTION THAT SETTLES THE externalNumber / orderNumber QUESTION.
 * ---------------------------------------------------------------------------
 *
 * Creation gives us `externalNumber`; every later endpoint gives us
 * `orderNumber`. They are widely assumed to be the same string, and they may
 * well be — but the spec's own two examples spell them differently
 * ("GC1123-00010300" from CreateOrder, "GP-THE-00000130" from GetOrderStatus),
 * and nothing in the document says one is the other. So it is a HYPOTHESIS,
 * and this is where it gets tested against reality.
 *
 * Called with whatever GetOrderStatus (or a result payload) says the order
 * number is. If it agrees with what we stored, the row is marked confirmed and
 * nothing else happens. If it DISAGREES, the first real order to prove that is
 * worth a great deal:
 *
 *   · it is logged loudly, with both values, and audited;
 *   · the stored orderNumber is replaced with what Randox actually use, since
 *     that is the value every subsequent request and every result row carries;
 *   · externalNumber is left exactly as it was, because it is the value
 *     CreateRandoxBooking has to send as GPExternalNumber.
 *
 * Automatic linking does not depend on the answer either way — it joins on
 * randoxOrderId, the one identifier that provably appears on both sides — so
 * this can be wrong without a result reaching the wrong patient. It is
 * measurement, not a load-bearing guess. Add it to the list of things to
 * confirm with Randox.
 */
export async function reconcileOrderNumber(
  order: { id: string; orderNumber: string; externalNumber: string | null; orderNumberConfirmed: boolean; randoxOrderId: number | null },
  observed: string | null,
): Promise<string> {
  if (!observed || observed.trim() === '') return order.orderNumber;
  const stated = observed.trim();

  if (stated === order.orderNumber) {
    if (!order.orderNumberConfirmed) {
      await prisma.randoxOrder.update({ where: { id: order.id }, data: { orderNumberConfirmed: true } });
    }
    return order.orderNumber;
  }

  console.error(
    `[randox] ORDER NUMBER MISMATCH on Randox order id ${order.randoxOrderId ?? '(unknown)'}: ` +
      `we stored orderNumber "${order.orderNumber}" (seeded from the creation response's externalNumber ` +
      `"${order.externalNumber ?? '(none)'}"), and Randox have stated orderNumber "${stated}". ` +
      'This is the first evidence that externalNumber and orderNumber are NOT the same value. ' +
      'The stored orderNumber has been replaced with theirs; externalNumber is untouched because ' +
      'CreateRandoxBooking sends it as GPExternalNumber. Linking is unaffected — it joins on orderId. ' +
      'Confirm the relationship between the two with Randox.',
  );

  await prisma.randoxOrder.update({
    where: { id: order.id },
    data: { orderNumber: stated, orderNumberConfirmed: true },
  });

  await recordAuditLog({
    actorType: 'SYSTEM',
    action: 'RANDOX_ORDER_NUMBER_RECONCILED',
    targetType: 'RandoxOrder',
    targetId: order.id,
    metadata: {
      randoxOrderId: order.randoxOrderId,
      storedOrderNumber: order.orderNumber,
      externalNumber: order.externalNumber,
      randoxOrderNumber: stated,
      note: 'externalNumber and orderNumber are not the same value on this order.',
    },
  });

  return stated;
}

/**
 * POST /Order/UpdatePendingOrder. Windowed.
 *
 * The whole order is resent, not a delta: UpdateOrder documents that
 * anything omitted is treated as a removal, and there is no reason to
 * assume UpdatePendingOrder differs. Sending a partial body would silently
 * drop panels.
 */
export async function amendOrder(
  orderNumber: string,
  changes: { panelKeys?: string[]; markerKeys?: string[] },
  actorUserId: string | null,
): Promise<WindowedResult> {
  assertEnabled();
  const order = await mustFindOrder(orderNumber);
  const ref = orderRefOf(order);

  const testReason = defaultTestReason();
  if (!testReason) {
    throw new RandoxOrderError('RANDOX_DEFAULT_TEST_REASON_ID is not set, so the order cannot be resent in full.', 503);
  }

  const panelIds: number[] = [];
  const testIds: number[] = [];
  const unmapped: string[] = [];

  if (changes.panelKeys) {
    for (const key of changes.panelKeys) {
      const id = await mappedRandoxIdFor('PANEL', key, loadIdMap().panels[key]);
      if (id === null) unmapped.push(key);
      else panelIds.push(id);
    }
  } else {
    panelIds.push(...order.randoxPanelIds.map(Number).filter(Number.isInteger));
  }

  if (changes.markerKeys) {
    for (const key of changes.markerKeys) {
      const id = await mappedRandoxIdFor('TEST', key, loadIdMap().tests[key]);
      if (id === null) unmapped.push(key);
      else testIds.push(id);
    }
  } else {
    testIds.push(...order.randoxTestIds.map(Number).filter(Number.isInteger));
  }

  if (unmapped.length > 0) {
    throw new RandoxOrderError(`No Randox identifier is mapped for ${unmapped.join(', ')}. The order was not amended.`, 409);
  }

  const identity = await buildOrderIdentity(order.patientId);
  const testClinicLocationId = randoxTestClinicLocationId();
  if (testClinicLocationId === null) {
    throw new RandoxOrderError('RANDOX_CLINIC_ID is not set.', 503);
  }

  try {
    await nexusLabClient().updatePendingOrder({
      OrderId: ref.orderId,
      OrderNumber: ref.orderNumber,
      FirstName: identity.firstName,
      LastName: identity.lastName,
      DateOfBirth: identity.dateOfBirth,
      BiologicalSexId: identity.biologicalSexId,
      TestClinicLocationId: testClinicLocationId,
      PanelIds: panelIds,
      TestIds: testIds,
      IsHealthCheckPanelReport: env.RANDOX_HEALTH_CHECK_PANEL_REPORT,
      IsCvScoreRequired: env.RANDOX_CV_SCORE_REQUIRED,
      TestReasons: [testReason],
    });
  } catch (e) {
    if (e instanceof RandoxWindowExpiredError) {
      await recordAuditLog({
        actorUserId,
        action: 'RANDOX_ORDER_AMEND_WINDOW_EXPIRED',
        targetType: 'RandoxOrder',
        targetId: order.id,
        metadata: { orderNumber, message: e.message },
      });
      return { ok: false, windowExpired: true, message: e.message };
    }
    throw e;
  }

  await prisma.randoxOrder.update({
    where: { id: order.id },
    data: {
      randoxPanelIds: panelIds.map(String),
      randoxTestIds: testIds.map(String),
      // An amendment resends the whole order, identity included, so the
      // snapshot has to move with it — otherwise the corroboration check
      // would later compare the result against a name the laboratory no
      // longer holds and refuse a link that is perfectly sound.
      orderedFirstName: identity.firstName,
      orderedLastName: identity.lastName,
      orderedDobEncrypted: encryptField(identity.dateOfBirth),
    },
  });

  await recordAuditLog({
    actorUserId,
    action: 'RANDOX_ORDER_AMENDED',
    targetType: 'RandoxOrder',
    targetId: order.id,
    metadata: { orderNumber, panelIds, testIds },
  });

  return { ok: true, windowExpired: false, message: 'Order updated.' };
}

/**
 * POST /Order/CancelOrder. Windowed.
 *
 * Takes a CancellationReasonId from GetCancellationReasons — an id, not
 * free text. Our own free-text reason is kept locally for the audit trail,
 * because Randox have nowhere to put it.
 */
export async function cancelOrder(
  orderNumber: string,
  reason: string,
  actorUserId: string | null,
  cancellationReasonId?: string,
): Promise<WindowedResult> {
  assertEnabled();
  const order = await mustFindOrder(orderNumber);
  const ref = orderRefOf(order);

  const reasonId = cancellationReasonId ?? defaultCancellationReasonId();
  if (!reasonId) {
    throw new RandoxOrderError(
      'RANDOX_DEFAULT_CANCELLATION_REASON_ID is not set and no reason id was supplied. CancelOrder requires one; valid ids come from GET /CancellationReason/GetCancellationReasons.',
      503,
    );
  }

  try {
    await nexusLabClient().cancelOrder({
      ClinicId: ref.clinicId,
      OrderId: ref.orderId,
      OrderNumber: ref.orderNumber,
      CancellationReasonId: reasonId,
    });
  } catch (e) {
    if (e instanceof RandoxWindowExpiredError) {
      await recordAuditLog({
        actorUserId,
        action: 'RANDOX_ORDER_CANCEL_WINDOW_EXPIRED',
        targetType: 'RandoxOrder',
        targetId: order.id,
        metadata: { orderNumber, message: e.message },
      });
      return { ok: false, windowExpired: true, message: e.message };
    }
    throw e;
  }

  await prisma.randoxOrder.update({
    where: { id: order.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason,
      // A cancelled order will never produce results — stop polling it.
      nextPollAt: null,
    },
  });

  await recordAuditLog({
    actorUserId,
    action: 'RANDOX_ORDER_CANCELLED',
    targetType: 'RandoxOrder',
    targetId: order.id,
    metadata: { orderNumber, reason, cancellationReasonId: reasonId },
  });

  return { ok: true, windowExpired: false, message: 'Order cancelled.' };
}

export async function mustFindOrder(orderNumber: string) {
  const order = await prisma.randoxOrder.findUnique({ where: { orderNumber } });
  if (!order) throw new RandoxOrderError(`No Randox order with number ${orderNumber}.`, 404);
  return order;
}

export { orderStatusFromCode };
