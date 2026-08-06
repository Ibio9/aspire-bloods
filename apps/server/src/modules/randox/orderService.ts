import type { RandoxCollectionMethod } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { nexusLabClient } from './clients/index.js';
import { isCollectionMethodEnabled, enabledCollectionMethods, loadIdMap, randoxClinicId, isRandoxEnabled } from './config.js';
import { RandoxWindowExpiredError } from './errors.js';
import { orderStatusFromCode } from './types.js';
import { scheduleFirstPoll } from './pollingJob.js';
import type { CreatePendingOrderRequest, RandoxPatientPayload } from './types.js';

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
 * Result of an operation that has a limited window. `windowExpired` is a
 * normal outcome, not a failure: Randox refused because the change came
 * too late. Callers show the message and move on; nothing retries.
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

/**
 * Builds the patient block Randox need. Decrypts only the fields the order
 * actually requires — a Randox order is a disclosure of patient data, so
 * it carries the minimum that identifies the sample, not the whole profile.
 */
async function buildPatientPayload(patientId: string): Promise<{ payload: RandoxPatientPayload; reference: string }> {
  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    include: { patientProfile: true },
  });
  if (!patient || patient.role !== 'PATIENT') {
    throw new RandoxOrderError('No patient account with that id.', 404);
  }
  if (!patient.patientProfile) {
    throw new RandoxOrderError('This patient has not completed their profile, so an order cannot be placed yet.', 409);
  }

  const profile = patient.patientProfile;
  return {
    // Our own patient id is the reference Randox echo back on the result —
    // that echo is how an inbound delivery is matched to an account.
    reference: patient.id,
    payload: {
      firstName: profile.firstName,
      lastName: profile.lastName,
      dateOfBirth: decryptField(profile.dobEncrypted).slice(0, 10),
      sex: profile.sex === 'MALE' ? 'Male' : profile.sex === 'FEMALE' ? 'Female' : 'Unknown',
      email: patient.email,
      phoneNumber: safeDecrypt(profile.contactNumberEncrypted),
      addressLine1: safeDecrypt(profile.addressEncrypted),
      postcode: profile.postcode,
    },
  };
}

function safeDecrypt(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptField(value);
  } catch {
    return null;
  }
}

export interface PlaceOrderInput {
  patientId: string;
  /** Our catalogue Panel.key values. Translated to Randox ids via the id map. */
  panelKeys: string[];
  /** Our catalogue Marker.key values, for markers ordered outside a panel. */
  markerKeys: string[];
  collectionMethod: RandoxCollectionMethod;
  placedById: string | null;
}

/**
 * CreatePendingOrder. The Order Number that comes back is the reference for
 * everything downstream, so it is persisted in the same breath as the call
 * returning — an order we placed but failed to record would be invisible
 * to polling and would never be ingested.
 */
export async function placeOrder(input: PlaceOrderInput) {
  assertEnabled();

  if (!isCollectionMethodEnabled(input.collectionMethod)) {
    throw new RandoxOrderError(
      `Collection method ${input.collectionMethod} is not enabled. Enabled: ${enabledCollectionMethods().join(', ') || '(none)'}. This is set by RANDOX_COLLECTION_METHODS and must match what Randox have contractually agreed we may offer.`,
      409,
    );
  }

  const idMap = loadIdMap();

  const panelIds: string[] = [];
  const unmappedPanels: string[] = [];
  for (const key of input.panelKeys) {
    const randoxId = idMap.panels[key];
    if (randoxId) panelIds.push(randoxId);
    else unmappedPanels.push(key);
  }

  const testIds: string[] = [];
  const unmappedTests: string[] = [];
  for (const key of input.markerKeys) {
    const randoxId = idMap.tests[key];
    if (randoxId) testIds.push(randoxId);
    else unmappedTests.push(key);
  }

  // Sending a partial order silently would mean the patient is billed and
  // bled for tests that were never ordered. Refuse the whole thing.
  if (unmappedPanels.length > 0 || unmappedTests.length > 0) {
    throw new RandoxOrderError(
      `No Randox identifier is configured for ${[...unmappedPanels, ...unmappedTests].join(', ')}. Add them to the id map (RANDOX_ID_MAP_FILE) before ordering — the order was not placed.`,
      409,
    );
  }

  if (panelIds.length === 0 && testIds.length === 0) {
    throw new RandoxOrderError('An order needs at least one panel or one test.', 400);
  }

  const clinicId = randoxClinicId();
  if (!clinicId) {
    throw new RandoxOrderError('RANDOX_CLINIC_ID is not set, so no order can be attributed to this clinic.', 503);
  }

  const { payload, reference } = await buildPatientPayload(input.patientId);

  const request: CreatePendingOrderRequest = {
    clinicId,
    panelIds,
    testIds,
    patient: payload,
    externalPatientReference: reference,
    collectionMethod: input.collectionMethod,
  };

  const response = await nexusLabClient().createPendingOrder(request);

  const order = await prisma.randoxOrder.create({
    data: {
      orderNumber: response.orderNumber,
      patientId: input.patientId,
      placedById: input.placedById,
      randoxPanelIds: panelIds,
      randoxTestIds: testIds,
      collectionMethod: input.collectionMethod,
      status: (response.statusCode !== null ? orderStatusFromCode(response.statusCode) : null) ?? 'INCOMPLETE',
      rawStatusCode: response.statusCode,
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
      patientId: input.patientId,
      panelIds,
      testIds,
      collectionMethod: input.collectionMethod,
    },
  });

  return order;
}

/**
 * UpdatePendingOrder. Windowed — once Randox have moved the order on, an
 * amendment is refused, and that refusal is reported to the caller as a
 * closed window rather than raised as an error.
 */
export async function amendOrder(
  orderNumber: string,
  changes: { panelKeys?: string[]; markerKeys?: string[] },
  actorUserId: string | null,
): Promise<WindowedResult> {
  assertEnabled();
  const order = await mustFindOrder(orderNumber);
  const idMap = loadIdMap();

  const panelIds = changes.panelKeys?.map((k) => idMap.panels[k]).filter(Boolean) as string[] | undefined;
  const testIds = changes.markerKeys?.map((k) => idMap.tests[k]).filter(Boolean) as string[] | undefined;

  try {
    await nexusLabClient().updatePendingOrder({ orderNumber, panelIds, testIds });
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
      randoxPanelIds: panelIds ?? order.randoxPanelIds,
      randoxTestIds: testIds ?? order.randoxTestIds,
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

/** CancelOrder. Windowed. */
export async function cancelOrder(
  orderNumber: string,
  reason: string,
  actorUserId: string | null,
): Promise<WindowedResult> {
  assertEnabled();
  const order = await mustFindOrder(orderNumber);

  try {
    await nexusLabClient().cancelOrder(orderNumber, reason);
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
    metadata: { orderNumber, reason },
  });

  return { ok: true, windowExpired: false, message: 'Order cancelled.' };
}

export async function mustFindOrder(orderNumber: string) {
  const order = await prisma.randoxOrder.findUnique({ where: { orderNumber } });
  if (!order) throw new RandoxOrderError(`No Randox order with number ${orderNumber}.`, 404);
  return order;
}
