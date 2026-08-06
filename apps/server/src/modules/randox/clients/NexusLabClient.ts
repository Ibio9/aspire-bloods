import { RandoxHttpClient } from '../http/RandoxHttpClient.js';
import { nexusConnection } from '../config.js';
import type { NexusLabClient } from './types.js';
import { asObject, pickArray, pickBoolean, pickCodeList, pickNumber, pickString, requireString, toUtcIso } from './parse.js';
import type {
  CreatePendingOrderRequest,
  CreatePendingOrderResponse,
  UpdatePendingOrderRequest,
  GetOrderStatusResponse,
  GetOrderResultDetailResponse,
  RandoxResultItem,
  RandoxResultReport,
} from '../types.js';

/**
 * Nexus Lab API — the ordering and results side.
 *
 * Endpoint NAMES are documented; their exact paths and verbs are not, so
 * they are assembled as `{base}/{EndpointName}` which is how the APIM
 * product is laid out for the operation names we were given. If a path
 * turns out to differ, it changes here and nowhere else.
 */
export class LiveNexusLabClient implements NexusLabClient {
  private readonly http = new RandoxHttpClient(nexusConnection());

  async createPendingOrder(request: CreatePendingOrderRequest): Promise<CreatePendingOrderResponse> {
    const body = await this.http.request<unknown>('CreatePendingOrder', { method: 'POST', body: request });
    return {
      // Without the Order Number nothing downstream can happen, so this is
      // the one field we refuse to guess at or default.
      orderNumber: requireString(body, 'the Order Number', 'orderNumber', 'OrderNumber', 'orderNo', 'order_number', 'id'),
      statusCode: pickNumber(body, 'statusCode', 'StatusCode', 'status', 'orderStatus'),
    };
  }

  async updatePendingOrder(request: UpdatePendingOrderRequest): Promise<void> {
    await this.http.request<unknown>('UpdatePendingOrder', {
      method: 'POST',
      body: request,
      windowedOperation: { name: 'UpdatePendingOrder', orderNumber: request.orderNumber },
    });
  }

  async cancelOrder(orderNumber: string, reason: string): Promise<void> {
    await this.http.request<unknown>('CancelOrder', {
      method: 'POST',
      body: { orderNumber, reason },
      windowedOperation: { name: 'CancelOrder', orderNumber },
    });
  }

  async getOrderStatus(orderNumber: string): Promise<GetOrderStatusResponse> {
    const body = await this.http.request<unknown>('GetOrderStatus', { query: { orderNumber } });
    const statusCode = pickNumber(body, 'statusCode', 'StatusCode', 'status', 'orderStatus', 'orderStatusId');
    if (statusCode === null) {
      throw new Error(`GetOrderStatus for order ${orderNumber} returned no recognisable status code.`);
    }
    return {
      orderNumber: pickString(body, 'orderNumber', 'OrderNumber') ?? orderNumber,
      statusCode,
      statusDescription: pickString(body, 'statusDescription', 'StatusDescription', 'statusName', 'description'),
    };
  }

  async getOrderResultDetail(orderNumber: string): Promise<GetOrderResultDetailResponse> {
    const body = await this.http.request<unknown>('GetOrderResultDetail', { query: { orderNumber } });
    const root = asObject(body);

    return {
      orderNumber: pickString(root, 'orderNumber', 'OrderNumber') ?? orderNumber,
      externalPatientReference: pickString(
        root,
        'externalPatientReference',
        'ExternalPatientReference',
        'patientReference',
        'externalPatientId',
        'clientPatientReference',
      ),
      randoxPanelId: pickString(root, 'panelId', 'PanelId', 'profileId', 'testProfileId', 'panelCode'),
      sampleCollectedAt: toUtcIso(pickString(root, 'sampleCollectedAt', 'SampleCollectedAt', 'sampleDate', 'collectionDate')),
      reportedAt: toUtcIso(pickString(root, 'reportedAt', 'ReportedAt', 'resultDate', 'reportDate')),
      voidCodes: pickCodeList(root, 'voidCodes', 'VoidCodes', 'voidCode', 'orderVoidCodes'),
      caveatCodes: pickCodeList(root, 'caveatCodes', 'CaveatCodes', 'caveatCode', 'orderCaveatCodes'),
      results: pickArray(root, 'results', 'Results', 'tests', 'analytes', 'resultDetails').map(mapResultItem),
    };
  }

  async getOrderResultReports(orderNumber: string): Promise<RandoxResultReport[]> {
    const body = await this.http.request<unknown>('GetOrderResultReports', { query: { orderNumber } });

    // A single-report response may not be wrapped in an array at all.
    const entries = pickArray(body, 'reports', 'Reports', 'documents', 'files');
    const candidates = entries.length > 0 ? entries : [body];

    return candidates
      .map((entry): RandoxResultReport | null => {
        const contentBase64 = pickString(entry, 'contentBase64', 'ContentBase64', 'content', 'fileContent', 'data', 'base64');
        if (!contentBase64) return null;
        return {
          filename: pickString(entry, 'filename', 'FileName', 'name') ?? `randox-${orderNumber}.pdf`,
          contentBase64,
          mimeType: pickString(entry, 'mimeType', 'MimeType', 'contentType') ?? 'application/pdf',
        };
      })
      .filter((r): r is RandoxResultReport => r !== null);
  }
}

function mapResultItem(raw: unknown): RandoxResultItem {
  const flag = pickString(raw, 'abnormalFlag', 'AbnormalFlag', 'flag', 'highLowIndicator', 'hiLo');
  const normalisedFlag = flag ? flag.trim().toUpperCase().charAt(0) : null;

  return {
    testCode: pickString(raw, 'testCode', 'TestCode', 'code', 'analyteCode'),
    testName: pickString(raw, 'testName', 'TestName', 'name', 'analyteName', 'marker') ?? '(unnamed test)',
    value: pickNumber(raw, 'value', 'Value', 'result', 'numericResult', 'resultValue'),
    textValue: pickString(raw, 'textValue', 'TextValue', 'resultText', 'stringResult'),
    unit: pickString(raw, 'unit', 'Unit', 'units', 'uom'),
    referenceLow: pickNumber(raw, 'referenceLow', 'ReferenceLow', 'refLow', 'lowerLimit', 'rangeLow', 'normalLow'),
    referenceHigh: pickNumber(raw, 'referenceHigh', 'ReferenceHigh', 'refHigh', 'upperLimit', 'rangeHigh', 'normalHigh'),
    abnormalFlag: normalisedFlag === 'H' || normalisedFlag === 'L' || normalisedFlag === 'N' ? normalisedFlag : null,
    voidCodes: pickCodeList(raw, 'voidCodes', 'VoidCodes', 'voidCode'),
    caveatCodes: pickCodeList(raw, 'caveatCodes', 'CaveatCodes', 'caveatCode', 'comments'),
    pending: pickBoolean(raw, 'pending', 'Pending', 'isPending', 'awaitingResult'),
  };
}
