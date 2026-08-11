import { RandoxHttpClient } from '../http/RandoxHttpClient.js';
import { nexusConnection } from '../config.js';
import { NEXUS_ENDPOINTS, verbForPath } from '../endpoints.js';
import { env } from '../../../config/env.js';
import type { NexusLabClient } from './types.js';
import { asObject, asRandoxIdString, pickArray, pickBoolean, pickNumber, pickString, requireNumber, requireString, toUtcIso, fromEuropeLondon } from './parse.js';
import type {
  CreatePendingOrderRequest,
  UpdatePendingOrderRequest,
  CancelOrderRequest,
  CreateOrderResponse,
  OrderRef,
  GetOrderStatusResponse,
  GetOrderResultDetailResponse,
  RandoxReportResultRow,
  RandoxLookupItem,
  RandoxPanel,
  RandoxTestItem,
  RandoxClinicDetails,
  RandoxClinicLocation,
  RandoxClinicStaffMember,
} from '../types.js';

/**
 * Nexus Lab API — reconciled against specs/nexus-openapi3.json, which is the
 * source of truth ahead of the flow and auth PDFs beside it.
 *
 * Four things about this API that are easy to get wrong and are therefore
 * stated here rather than left to be rediscovered:
 *
 *  1. EIGHT ENDPOINTS ARE GET AND NINE ARE POST, by one rule: takes a body,
 *     POST; takes nothing, GET. The nine POSTs are all under /Order and
 *     include the Get* ones — GetOrderStatus, GetOrderResultDetail and
 *     GetOrderResultReports each take an order identifier in a body. The
 *     eight GETs are the reference-data endpoints and take nothing at all.
 *     The table is in ../endpoints.ts and nothing here guesses a verb.
 *
 *  2. The order-creating endpoints return the string order reference as
 *     `externalNumber`, not `orderNumber`. Reading `orderNumber` off a
 *     CreatePendingOrder response gets undefined. Whether that string is the
 *     SAME string GetOrderStatus later calls `orderNumber` is UNCONFIRMED —
 *     the spec's own two examples use different prefixes (GC1123-00010300 vs
 *     GP-THE-00000130). See readCreateResponse and modules/randox/orderService.
 *
 *  3. GETTESTS DOES NOT RETURN REFERENCE RANGES, and never will. It returns
 *     id, name, code, stabilityTime, sampleTubes, cost and currency — no
 *     units, no refLow, no refHigh. Ranges arrive per marker on the RESULT,
 *     in GetOrderResultDetail, which is what product rule 2 already says.
 *     Fallback ranges in markerCatalogue.ts therefore cannot come from this
 *     API and have to come from the Pathology Services Catalogue PDFs.
 *
 *  4. PRICES ARE STRIPPED HERE, at the transport boundary — see
 *     stripPricing(). GetPanels and GetTests both carry cost and currency,
 *     and this product shows a patient no prices anywhere. Removing them at
 *     the edge rather than hiding them in the UI means they are never in the
 *     database and never on a response the web client could read.
 */
export class LiveNexusLabClient implements NexusLabClient {
  private readonly http = new RandoxHttpClient(nexusConnection());

  /**
   * Which verb each reference path answered to, once we know. Per process,
   * not persisted: it costs one extra call after a restart and cannot go
   * stale across a Randox-side change.
   */
  private readonly referenceVerb = new Map<string, 'GET' | 'POST'>();

  // --- Orders (POST) -------------------------------------------------------

  async createPendingOrder(request: CreatePendingOrderRequest): Promise<CreateOrderResponse> {
    const body = await this.http.request<unknown>(NEXUS_ENDPOINTS.createPendingOrder.path, {
      method: NEXUS_ENDPOINTS.createPendingOrder.verb,
      body: request,
      // The one call in the integration that must never be repeated
      // automatically: a 502 says nothing about whether the order reached
      // the laboratory, and a retry would bleed and bill a patient twice.
      retryable: false,
    });
    return this.readCreateResponse(body, 'CreatePendingOrder');
  }

  async updatePendingOrder(request: UpdatePendingOrderRequest): Promise<CreateOrderResponse> {
    const body = await this.http.request<unknown>(NEXUS_ENDPOINTS.updatePendingOrder.path, {
      method: NEXUS_ENDPOINTS.updatePendingOrder.verb,
      // TestReasons[].Id AS A STRING on this endpoint, and as an integer on
      // CreatePendingOrder. That is not a transcription slip on our part: the
      // spec's own two examples type the same field differently, and each is
      // sent as its own example types it. asRandoxIdString does the flip so
      // the request type upstream stays one shape.
      body: {
        ...request,
        TestReasons: request.TestReasons.map((r) => ({ Id: asRandoxIdString(r.Id) ?? String(r.Id), Details: r.Details })),
      },
      windowedOperation: { name: 'UpdatePendingOrder', orderNumber: request.OrderNumber },
    });
    return this.readCreateResponse(body, 'UpdatePendingOrder');
  }

  async cancelOrder(request: CancelOrderRequest): Promise<void> {
    await this.http.request<unknown>(NEXUS_ENDPOINTS.cancelOrder.path, {
      method: NEXUS_ENDPOINTS.cancelOrder.verb,
      body: request,
      windowedOperation: { name: 'CancelOrder', orderNumber: request.OrderNumber },
    });
  }

  async getOrderStatus(ref: Pick<OrderRef, 'orderId' | 'orderNumber'>): Promise<GetOrderStatusResponse> {
    const body = await this.http.request<unknown>(NEXUS_ENDPOINTS.getOrderStatus.path, {
      method: NEXUS_ENDPOINTS.getOrderStatus.verb,
      body: { OrderNumber: ref.orderNumber, OrderId: ref.orderId },
    });

    const statusId = pickNumber(body, 'statusId', 'StatusId');
    if (statusId === null) {
      throw new Error(`GetOrderStatus for order ${ref.orderNumber} returned no statusId.`);
    }

    return {
      orderNumber: pickString(body, 'orderNumber', 'OrderNumber') ?? ref.orderNumber,
      orderId: pickNumber(body, 'orderId', 'OrderId') ?? ref.orderId,
      statusId,
      statusDescription: pickString(body, 'statusDescription', 'StatusDescription'),
      statusDate: toUtcIso(pickString(body, 'statusDate', 'StatusDate')),
      arrangementType: pickString(body, 'arrangementType', 'ArrangementType'),
      arrangementStatus: pickString(body, 'arrangementStatus', 'ArrangementStatus'),
    };
  }

  async getOrderResultDetail(ref: OrderRef): Promise<GetOrderResultDetailResponse> {
    const body = await this.http.request<unknown>(NEXUS_ENDPOINTS.getOrderResultDetail.path, {
      method: NEXUS_ENDPOINTS.getOrderResultDetail.verb,
      body: { orderId: ref.orderId, orderNumber: ref.orderNumber, clinicId: ref.clinicId },
    });
    const root = asObject(body);

    return {
      orderId: pickNumber(root, 'orderId', 'OrderId') ?? ref.orderId,
      orderNumber: pickString(root, 'orderNumber', 'OrderNumber') ?? ref.orderNumber,
      // Documented UTC.
      orderCreatedDate: toUtcIso(pickString(root, 'orderCreatedDate', 'OrderCreatedDate')),
      sampleCollectionDate: toUtcIso(pickString(root, 'sampleCollectionDate', 'SampleCollectionDate')),
      sampleAccessioningDate: toUtcIso(pickString(root, 'sampleAccessioningDate', 'SampleAccessioningDate')),
      sampleCancellationDate: toUtcIso(pickString(root, 'sampleCancellationDate', 'SampleCancellationDate')),
      resultsUploadDate: toUtcIso(pickString(root, 'resultsUploadDate', 'ResultsUploadDate')),

      reportResults: pickArray(root, 'reportResults', 'ReportResults').map(mapResultRow),

      patientHeight: pickNumber(root, 'patientHeight', 'PatientHeight'),
      patientWeight: pickNumber(root, 'patientWeight', 'PatientWeight'),
      patientWaist: pickNumber(root, 'patientWaist', 'PatientWaist'),
      patientHip: pickNumber(root, 'patientHip', 'PatientHip'),
      patientPulse: pickNumber(root, 'patientPulse', 'PatientPulse'),
      patientSystolicBloodPressure: pickNumber(root, 'patientSystolicBloodPressure', 'PatientSystolicBloodPressure'),
      patientDiastolicBloodPressure: pickNumber(root, 'patientDiastolicBloodPressure', 'PatientDiastolicBloodPressure'),
      patientIsDiabetic: nullableBoolean(root, 'patientIsDiabetic', 'PatientIsDiabetic'),
      patientIsSmoker: nullableBoolean(root, 'patientIsSmoker', 'PatientIsSmoker'),
      patientKnownVascularDisease: nullableBoolean(root, 'patientKnownVascularDisease', 'PatientKnownVascularDisease'),
      // Randox's own casing: lower-case "for" in the middle. Not a typo here.
      patientOnMedicationforHypertension: nullableBoolean(
        root,
        'patientOnMedicationforHypertension',
        'patientOnMedicationForHypertension',
        'PatientOnMedicationforHypertension',
      ),
      patientEthnicity: pickString(root, 'patientEthnicity', 'PatientEthnicity'),
      // Read as a string OR a number, because Randox type biological sex both
      // ways across their own endpoints. Normalised (and refused if
      // unrecognised) in ingestionService.ts — never guessed, because it
      // selects which cohort's optimal band a patient is shown.
      patientBiologicalSex:
        pickString(root, 'patientBiologicalSex', 'PatientBiologicalSex', 'biologicalSex', 'BiologicalSex') ??
        pickNumber(root, 'patientBiologicalSexId', 'PatientBiologicalSexId', 'biologicalSexId', 'BiologicalSexId'),

      // Identity, when Randox echo it back on the result. Absent from the
      // spec's own response example, which is why every plausible spelling
      // is tried and absence is a first-class outcome rather than an error:
      // this is the corroborating check on an automatic link, and a field we
      // guessed the name of must degrade to "not supplied", never to "agrees".
      // See modules/randox/identityCheck.ts.
      patientFirstName: pickString(root, 'patientFirstName', 'PatientFirstName', 'firstName', 'FirstName'),
      patientLastName: pickString(root, 'patientLastName', 'PatientLastName', 'lastName', 'LastName'),
      patientDateOfBirth: pickString(
        root,
        'patientDateOfBirth',
        'PatientDateOfBirth',
        'dateOfBirth',
        'DateOfBirth',
        'patientDob',
        'PatientDob',
      ),
    };
  }

  /**
   * Returns the report PDF as base64, or null when Randox have none for
   * this order. Note `reportResults` here is a single base64 string — a
   * different type from the identically-named array on the result detail.
   */
  async getOrderResultReports(ref: OrderRef): Promise<string | null> {
    const body = await this.http.request<unknown>(NEXUS_ENDPOINTS.getOrderResultReports.path, {
      method: NEXUS_ENDPOINTS.getOrderResultReports.verb,
      body: { orderId: ref.orderId, orderNumber: ref.orderNumber, clinicId: ref.clinicId },
    });
    const value = pickString(body, 'reportResults', 'ReportResults');
    return value && value.trim() !== '' ? value : null;
  }

  // --- Reference data ------------------------------------------------------

  /**
   * A reference-data call. GET, because the spec says GET.
   *
   * All eight of these take no parameters and no body, which by the rule in
   * ../endpoints.ts makes them GET, and the default of
   * RANDOX_REFERENCE_DATA_METHOD is now 'get' rather than 'auto' to say so.
   * The probe below is kept as an escape hatch rather than as a hedge: if the
   * sandbox ever contradicts its own spec, 'auto' sends the declared verb and
   * a 404/405/501 — the three ways an HTTP API says "not with that verb" —
   * causes exactly one repeat as POST with an empty JSON body, remembered for
   * the life of the process. Any other status is a real error and is thrown
   * as one; this fallback must not turn a 500 into a second request.
   *
   * The path is checked against the endpoint table on the way through, so a
   * typo is an error here rather than a 404 from Azure.
   */
  private async referenceRequest<T>(path: string): Promise<T> {
    if (verbForPath(path) !== 'GET') {
      throw new Error(`${path} is declared POST in the spec; it must not be called through referenceRequest().`);
    }
    const configured = env.RANDOX_REFERENCE_DATA_METHOD;
    if (configured === 'get') return this.http.request<T>(path, { method: 'GET' });
    if (configured === 'post') return this.http.request<T>(path, { method: 'POST', body: {} });

    const known = this.referenceVerb.get(path);
    if (known === 'POST') return this.http.request<T>(path, { method: 'POST', body: {} });
    if (known === 'GET') return this.http.request<T>(path, { method: 'GET' });

    const { res, text } = await this.http.requestRaw(path, { method: 'GET' });
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      const viaPost = await this.http.request<T>(path, { method: 'POST', body: {} });
      this.referenceVerb.set(path, 'POST');
      console.log(`[randox] ${path} does not accept GET (HTTP ${res.status}); using POST for the rest of this process.`);
      return viaPost;
    }
    this.referenceVerb.set(path, 'GET');
    // Reuses the client's own body handling so a non-JSON or error body
    // fails identically whichever branch produced it.
    return this.http.readReferenceBody<T>(path, res, text);
  }

  async getPanels(): Promise<RandoxPanel[]> {
    const body = await this.referenceRequest<unknown>(NEXUS_ENDPOINTS.getPanels.path);
    return pickArray(body, 'panels', 'Panels').map((raw) =>
      // stripPricing as well as mapTestItem's own: the panel adds fields of
      // its own after the spread, and a strip that only ran on the inner
      // object would be one refactor away from letting `cost` back in.
      stripPricing({
        ...mapTestItem(raw),
        panelType: pickString(raw, 'panelType', 'PanelType'),
        specialInstructions: pickString(raw, 'specialInstructions', 'SpecialInstructions'),
        fastingRequired: pickBoolean(raw, 'fastingRequired', 'FastingRequired'),
        sampleStabilityTime: pickNumber(raw, 'sampleStabilityTime', 'SampleStabilityTime'),
        // {id, name} only — no codes. Same identity problem as the result
        // rows: a panel's members can only be matched to our catalogue by
        // name, which is why the analyte map in ../analyteMap.ts is explicit
        // and reviewable rather than fuzzy.
        testItems: pickArray(raw, 'testItems', 'TestItems').map((t) => ({
          id: pickString(t, 'id', 'Id') ?? '',
          name: pickString(t, 'name', 'Name') ?? '',
        })),
      }),
    );
  }

  async getTests(): Promise<RandoxTestItem[]> {
    const body = await this.referenceRequest<unknown>(NEXUS_ENDPOINTS.getTests.path);
    return pickArray(body, 'tests', 'Tests', 'testItems').map(mapTestItem);
  }

  async getBiologicalSexes(): Promise<RandoxLookupItem[]> {
    return mapLookups(await this.referenceRequest<unknown>(NEXUS_ENDPOINTS.getBiologicalSex.path));
  }

  async getEthnicities(): Promise<RandoxLookupItem[]> {
    return mapLookups(await this.referenceRequest<unknown>(NEXUS_ENDPOINTS.getEthnicity.path));
  }

  async getTestingReasons(): Promise<RandoxLookupItem[]> {
    return mapLookups(await this.referenceRequest<unknown>(NEXUS_ENDPOINTS.getTestingReasons.path));
  }

  async getCancellationReasons(): Promise<RandoxLookupItem[]> {
    return mapLookups(await this.referenceRequest<unknown>(NEXUS_ENDPOINTS.getCancellationReasons.path));
  }

  async getMyClinicDetails(): Promise<RandoxClinicDetails> {
    const body = await this.referenceRequest<unknown>(NEXUS_ENDPOINTS.getMyClinicDetails.path);
    return {
      ...mapClinicLocation(body),
      clinicTestLocations: pickArray(body, 'clinicTestLocations', 'ClinicTestLocations').map(mapClinicLocation),
    };
  }

  async getClinicStaff(): Promise<RandoxClinicStaffMember[]> {
    const body = await this.referenceRequest<unknown>(NEXUS_ENDPOINTS.getClinicStaff.path);
    return pickArray(body, 'staff', 'Staff').map((raw) => ({
      userId: pickString(raw, 'userId', 'UserId') ?? '',
      firstName: pickString(raw, 'firstName', 'FirstName'),
      lastName: pickString(raw, 'lastName', 'LastName'),
      // pickBoolean, not a cast: one of the spec's own examples returns the
      // string "Kent" in this boolean field. Anything unrecognised reads
      // false, which is the safe direction for "is this person active".
      active: pickBoolean(raw, 'active', 'Active'),
      role: pickString(raw, 'role', 'Role'),
    }));
  }

  // --- helpers -------------------------------------------------------------

  private readCreateResponse(body: unknown, operation: string): CreateOrderResponse {
    return {
      orderId: requireNumber(body, `the orderId from ${operation}`, 'orderId', 'OrderId'),
      // `externalNumber` is the documented name for what the rest of the
      // integration calls the order number. `orderNumber` is accepted as a
      // fallback in case a future revision renames it, but it is not what
      // the current spec returns.
      externalNumber: requireString(
        body,
        `the externalNumber (order number) from ${operation}`,
        'externalNumber',
        'ExternalNumber',
        'orderNumber',
        'OrderNumber',
      ),
    };
  }
}

function mapResultRow(raw: unknown): RandoxReportResultRow {
  return {
    orderNumber: pickString(raw, 'orderNumber', 'OrderNumber'),
    // These two, and only these two, are Europe/London wall-clock — stated
    // in the GetOrderResultDetail description. Everything else on the
    // payload is UTC and goes through toUtcIso above.
    dateOfReceipt: fromEuropeLondon(pickString(raw, 'dateOfReceipt', 'DateOfReceipt')),
    dateOfReport: fromEuropeLondon(pickString(raw, 'dateOfReport', 'DateOfReport')),
    analyte: pickString(raw, 'analyte', 'Analyte'),
    group: pickString(raw, 'group', 'Group'),
    // Left as the string it is. Parsing happens in parseResult.ts, where
    // "< 5.0" and "Not detected" are handled without becoming numbers.
    result: pickString(raw, 'result', 'Result'),
    units: pickString(raw, 'units', 'Units'),
    refLow: pickString(raw, 'refLow', 'RefLow'),
    refHigh: pickString(raw, 'refHigh', 'RefHigh'),
    lowHigh: pickString(raw, 'lowHigh', 'LowHigh'),
    sampleType: pickString(raw, 'sampleType', 'SampleType'),
    caveat: pickString(raw, 'caveat', 'Caveat'),
    displayName: pickString(raw, 'displayName', 'DisplayName'),
  };
}

/**
 * WHAT A TEST IS, MINUS WHAT IT COSTS.
 *
 * GetTests returns `cost` and `currency` on every item and GetPanels returns
 * them on every panel. Product rule 4 says no prices anywhere in the
 * patient-facing product, and the way to keep a rule like that is to make it
 * impossible to break rather than to remember it at each render site: the two
 * fields are dropped HERE, at the transport boundary, so they never reach the
 * catalogue table, never reach an API response, and are never one `select`
 * away from a patient's screen. See stripPricing() and the assertion in
 * tests/randoxPricing.test.ts.
 *
 * NOTE WHAT IS ALSO NOT HERE: units, refLow and refHigh. GetTests does not
 * return reference ranges — it never has and, per the spec, it does not have
 * fields for them. Ranges live on the result, per marker, and the fallbacks in
 * markerCatalogue.ts come from the Pathology Services Catalogue PDFs.
 */
function mapTestItem(raw: unknown): RandoxTestItem {
  return stripPricing({
    id: pickString(raw, 'id', 'Id') ?? '',
    name: pickString(raw, 'name', 'Name') ?? '',
    code: pickString(raw, 'code', 'Code'),
    stabilityTime: pickNumber(raw, 'stabilityTime', 'StabilityTime'),
    sampleTubes: pickArray(raw, 'sampleTubes', 'SampleTubes').map((t) => ({
      id: pickString(t, 'id', 'Id') ?? '',
      name: pickString(t, 'name', 'Name') ?? '',
      quantityRequired: pickNumber(t, 'quantityRequired', 'QuantityRequired'),
    })),
  });
}

/**
 * The named price fields, in the casings the API uses and the two it might.
 * A list rather than a regex: a regex over key names would also eat
 * `sampleStabilityTime` the day somebody adds `costingCode`, and a silent
 * over-strip is as much a bug as a leak.
 */
const PRICE_FIELDS = ['cost', 'Cost', 'currency', 'Currency', 'price', 'Price'] as const;

/**
 * Deletes every price field from an object, recursively, and returns it.
 *
 * Recursive because a panel carries `testItems`, and a nested price is still a
 * price. Applied at the edge of the client so that "no prices in this product"
 * is a property of the data rather than a discipline in the UI.
 *
 * Exported for the test that asserts it, and for the mock client, which serves
 * the spec's own examples and therefore serves prices unless they are taken
 * off the same way.
 */
export function stripPricing<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) stripPricing(item);
    return value;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const field of PRICE_FIELDS) delete record[field];
    for (const nested of Object.values(record)) stripPricing(nested);
  }
  return value;
}

function mapClinicLocation(raw: unknown): RandoxClinicLocation {
  return {
    id: pickString(raw, 'id', 'Id') ?? '',
    name: pickString(raw, 'name', 'Name') ?? '',
    code: pickString(raw, 'code', 'Code'),
    addressLine1: pickString(raw, 'addressLine1', 'AddressLine1'),
    addressLine2: pickString(raw, 'addressLine2', 'AddressLine2'),
    townCity: pickString(raw, 'townCity', 'TownCity'),
    county: pickString(raw, 'county', 'County'),
    postalCode: pickString(raw, 'postalCode', 'PostalCode'),
  };
}

/**
 * The four lookup endpoints return a bare array of {id, name}. Randox type
 * the id inconsistently across them — string for biological sex and
 * cancellation reasons, number for ethnicity and testing reasons — so it is
 * normalised to string here and converted back at each call site that needs
 * an integer.
 */
function mapLookups(body: unknown): RandoxLookupItem[] {
  return pickArray(body, 'items').map((raw) => ({
    id: pickString(raw, 'id', 'Id') ?? '',
    name: pickString(raw, 'name', 'Name') ?? '',
  }));
}

/**
 * Distinguishes "false" from "not supplied" — pickBoolean can't, because it
 * treats anything unrecognised as false. For a field like
 * patientIsDiabetic that difference is clinically meaningful: "not
 * diabetic" and "nobody asked" are not the same record.
 */
function nullableBoolean(source: unknown, ...names: string[]): boolean | null {
  const present = names.some((n) => pickString(source, n) !== null || pickNumber(source, n) !== null);
  if (!present) return null;
  return pickBoolean(source, ...names);
}
