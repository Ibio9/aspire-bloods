import { RandoxHttpClient } from '../http/RandoxHttpClient.js';
import { nexusConnection } from '../config.js';
import { env } from '../../../config/env.js';
import type { NexusLabClient } from './types.js';
import { asObject, pickArray, pickBoolean, pickNumber, pickString, requireNumber, requireString, toUtcIso, fromEuropeLondon } from './parse.js';
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
} from '../types.js';

/**
 * Nexus Lab API — verified against specs/nexus-openapi.json.
 *
 * Two things about this API that are easy to get wrong and are therefore
 * stated here rather than left to be rediscovered:
 *
 *  1. Every /Order/* endpoint is POST, INCLUDING the Get* ones —
 *     GetOrderStatus, GetOrderResultDetail and GetOrderResultReports all
 *     take a JSON body. The reference-data endpoints, by contrast, are
 *     plain GET with no body at all. Both are as the spec declares them.
 *
 *  2. The order-creating endpoints return the string order reference as
 *     `externalNumber`, not `orderNumber`. Reading `orderNumber` off a
 *     CreatePendingOrder response gets undefined.
 *
 * The reference-data endpoints are the one place the documentation and the
 * verbal guidance disagree (spec says GET, Randox say "everything is POST"),
 * so the verb is configuration with an auto-detecting default — see
 * referenceRequest() below and RANDOX_REFERENCE_DATA_METHOD.
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
    const body = await this.http.request<unknown>('Order/CreatePendingOrder', {
      method: 'POST',
      body: request,
      // The one call in the integration that must never be repeated
      // automatically: a 502 says nothing about whether the order reached
      // the laboratory, and a retry would bleed and bill a patient twice.
      retryable: false,
    });
    return this.readCreateResponse(body, 'CreatePendingOrder');
  }

  async updatePendingOrder(request: UpdatePendingOrderRequest): Promise<CreateOrderResponse> {
    const body = await this.http.request<unknown>('Order/UpdatePendingOrder', {
      method: 'POST',
      body: request,
      windowedOperation: { name: 'UpdatePendingOrder', orderNumber: request.OrderNumber },
    });
    return this.readCreateResponse(body, 'UpdatePendingOrder');
  }

  async cancelOrder(request: CancelOrderRequest): Promise<void> {
    await this.http.request<unknown>('Order/CancelOrder', {
      method: 'POST',
      body: request,
      windowedOperation: { name: 'CancelOrder', orderNumber: request.OrderNumber },
    });
  }

  async getOrderStatus(ref: Pick<OrderRef, 'orderId' | 'orderNumber'>): Promise<GetOrderStatusResponse> {
    const body = await this.http.request<unknown>('Order/GetOrderStatus', {
      method: 'POST',
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
    const body = await this.http.request<unknown>('Order/GetOrderResultDetail', {
      method: 'POST',
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
    const body = await this.http.request<unknown>('Order/GetOrderResultReports', {
      method: 'POST',
      body: { orderId: ref.orderId, orderNumber: ref.orderNumber, clinicId: ref.clinicId },
    });
    const value = pickString(body, 'reportResults', 'ReportResults');
    return value && value.trim() !== '' ? value : null;
  }

  // --- Reference data ------------------------------------------------------

  /**
   * A reference-data call, on whichever verb this API actually answers.
   *
   * The spec declares these seven GET. Randox's verbal guidance is that
   * every endpoint is POST. Both cannot be true of the same gateway, and
   * being wrong is not a subtle failure — it is seven endpoints returning
   * 404 or 405, which presents as "the catalogue refresh does nothing".
   *
   * So under the default 'auto' the declared verb is tried first and a
   * 404/405/501 — the three ways an HTTP API says "not with that verb" —
   * causes exactly one repeat as POST with an empty JSON body. Whichever
   * answers is remembered for the process. Any other status is a real error
   * and is thrown as one; this fallback must not turn a 500 into a second
   * request. Pinning RANDOX_REFERENCE_DATA_METHOD to get or post skips the
   * probe entirely once we know which it is.
   */
  private async referenceRequest<T>(path: string): Promise<T> {
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
    const body = await this.referenceRequest<unknown>('TestPanel/GetPanels');
    return pickArray(body, 'panels', 'Panels').map((raw) => ({
      ...mapTestItem(raw),
      panelType: pickString(raw, 'panelType', 'PanelType'),
      specialInstructions: pickString(raw, 'specialInstructions', 'SpecialInstructions'),
      fastingRequired: pickBoolean(raw, 'fastingRequired', 'FastingRequired'),
      sampleStabilityTime: pickNumber(raw, 'sampleStabilityTime', 'SampleStabilityTime'),
      testItems: pickArray(raw, 'testItems', 'TestItems').map((t) => ({
        id: pickString(t, 'id', 'Id') ?? '',
        name: pickString(t, 'name', 'Name') ?? '',
      })),
    }));
  }

  async getTests(): Promise<RandoxTestItem[]> {
    const body = await this.referenceRequest<unknown>('TestItem/GetTests');
    return pickArray(body, 'tests', 'Tests', 'testItems').map(mapTestItem);
  }

  async getBiologicalSexes(): Promise<RandoxLookupItem[]> {
    return mapLookups(await this.referenceRequest<unknown>('BiologicalSex/GetBiologicalSex'));
  }

  async getEthnicities(): Promise<RandoxLookupItem[]> {
    return mapLookups(await this.referenceRequest<unknown>('Ethnicity/GetEthnicity'));
  }

  async getTestingReasons(): Promise<RandoxLookupItem[]> {
    return mapLookups(await this.referenceRequest<unknown>('TestReason/GetTestingReasons'));
  }

  async getCancellationReasons(): Promise<RandoxLookupItem[]> {
    return mapLookups(await this.referenceRequest<unknown>('CancellationReason/GetCancellationReasons'));
  }

  async getMyClinicDetails(): Promise<RandoxClinicDetails> {
    const body = await this.referenceRequest<unknown>('Clinic/GetMyClinicDetails');
    return {
      ...mapClinicLocation(body),
      clinicTestLocations: pickArray(body, 'clinicTestLocations', 'ClinicTestLocations').map(mapClinicLocation),
    };
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

function mapTestItem(raw: unknown): RandoxTestItem {
  return {
    id: pickString(raw, 'id', 'Id') ?? '',
    name: pickString(raw, 'name', 'Name') ?? '',
    code: pickString(raw, 'code', 'Code'),
    stabilityTime: pickNumber(raw, 'stabilityTime', 'StabilityTime'),
    sampleTubes: pickArray(raw, 'sampleTubes', 'SampleTubes').map((t) => ({
      id: pickString(t, 'id', 'Id') ?? '',
      name: pickString(t, 'name', 'Name') ?? '',
      quantityRequired: pickNumber(t, 'quantityRequired', 'QuantityRequired'),
    })),
    cost: pickNumber(raw, 'cost', 'Cost'),
    currency: pickString(raw, 'currency', 'Currency'),
  };
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
