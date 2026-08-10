import { RandoxWindowExpiredError } from '../errors.js';
import type { NexusLabClient } from '../clients/types.js';
import type {
  CreatePendingOrderRequest,
  UpdatePendingOrderRequest,
  CancelOrderRequest,
  CreateOrderResponse,
  OrderRef,
  GetOrderStatusResponse,
  GetOrderResultDetailResponse,
  RandoxLookupItem,
  RandoxPanel,
  RandoxTestItem,
  RandoxClinicDetails,
} from '../types.js';
import {
  FIXTURE_BUILDERS,
  FIXTURE_PDF_BASE64,
  FIXTURE_BIOLOGICAL_SEXES,
  FIXTURE_CANCELLATION_REASONS,
  FIXTURE_ETHNICITIES,
  FIXTURE_TESTING_REASONS,
  type FixtureScenario,
} from './fixtures.js';

interface MockOrder {
  orderId: number;
  orderNumber: string;
  scenario: FixtureScenario;
  statusId: number;
  amendableUntil: number;
  cancelled: boolean;
}

/**
 * In-memory Nexus Lab implementing the documented contracts from
 * specs/nexus-openapi.json. This is what the integration runs against until
 * the subscription keys arrive; swapping to real is RANDOX_TRANSPORT=live.
 *
 * It enforces the parts of the contract our code has to survive rather than
 * being a permissive stub:
 *   - CreatePendingOrder validates every field the spec marks required,
 *   - it returns the order number as `externalNumber`, as the real API does,
 *   - status advances 2 → 3 → 4 rather than jumping straight to results,
 *   - windowed operations fail once the order has progressed,
 *   - an order whose results are all voided reports status 5,
 *   - GetOrderResultReports returns ONE base64 string, not an array.
 */
export class MockNexusLabClient implements NexusLabClient {
  private readonly byNumber = new Map<string, MockOrder>();
  private nextOrderId = 10300;

  /** How many GetOrderStatus calls before an order reaches COMPLETE. */
  private static readonly POLLS_UNTIL_COMPLETE = 2;
  private readonly pollCounts = new Map<string, number>();

  /** Test hook: force the next created order onto a given scenario. */
  scenarioOverride: FixtureScenario | null = null;

  async createPendingOrder(request: CreatePendingOrderRequest): Promise<CreateOrderResponse> {
    // Required by the CreatePendingOrderRequest schema in the spec.
    for (const field of ['FirstName', 'LastName', 'DateOfBirth'] as const) {
      if (!request[field]) throw new Error(`CreatePendingOrder requires ${field}.`);
    }
    if (!Number.isInteger(request.BiologicalSexId)) {
      throw new Error('CreatePendingOrder requires an integer BiologicalSexId.');
    }
    if (!Number.isInteger(request.TestClinicLocationId)) {
      throw new Error('CreatePendingOrder requires an integer TestClinicLocationId.');
    }
    if (typeof request.IsHealthCheckPanelReport !== 'boolean') {
      throw new Error('CreatePendingOrder requires IsHealthCheckPanelReport.');
    }
    if (!Array.isArray(request.TestReasons) || request.TestReasons.length === 0) {
      throw new Error('CreatePendingOrder requires at least one TestReason.');
    }
    // Documented by the flow PDF rather than the schema.
    if (request.PanelIds.length === 0 && request.TestIds.length === 0) {
      throw new Error('CreatePendingOrder requires at least one valid Panel Id or Test Id.');
    }

    const orderId = this.nextOrderId++;
    const orderNumber = `GC1123-${String(orderId).padStart(8, '0')}`;
    this.byNumber.set(orderNumber, {
      orderId,
      orderNumber,
      scenario: this.scenarioOverride ?? 'normal',
      statusId: 2,
      // The real amendment window isn't documented ("a window of
      // opportunity, depending on the sample collection method"), so this
      // only exists to exercise the window-expired path.
      amendableUntil: Date.now() + 30 * 60 * 1000,
      cancelled: false,
    });
    this.scenarioOverride = null;

    // Note the field name: externalNumber, not orderNumber.
    return { orderId, externalNumber: orderNumber };
  }

  async updatePendingOrder(request: UpdatePendingOrderRequest): Promise<CreateOrderResponse> {
    const order = this.mustFind(request.OrderNumber);
    if (Date.now() > order.amendableUntil || order.statusId >= 3) {
      throw new RandoxWindowExpiredError(
        'UpdatePendingOrder',
        order.orderNumber,
        `Order ${order.orderNumber} can no longer be amended. It has already been submitted for processing.`,
      );
    }
    return { orderId: order.orderId, externalNumber: order.orderNumber };
  }

  async cancelOrder(request: CancelOrderRequest): Promise<void> {
    const order = this.mustFind(request.OrderNumber);
    if (!request.CancellationReasonId) {
      throw new Error('CancelOrder requires a CancellationReasonId.');
    }
    if (order.statusId >= 4) {
      throw new RandoxWindowExpiredError(
        'CancelOrder',
        order.orderNumber,
        `Order ${order.orderNumber} can no longer be cancelled. Results have already been reported.`,
      );
    }
    order.cancelled = true;
    order.statusId = 5;
  }

  async getOrderStatus(ref: Pick<OrderRef, 'orderId' | 'orderNumber'>): Promise<GetOrderStatusResponse> {
    const order = this.mustFind(ref.orderNumber);

    if (!order.cancelled && order.statusId < 4) {
      const polls = (this.pollCounts.get(order.orderNumber) ?? 0) + 1;
      this.pollCounts.set(order.orderNumber, polls);
      order.statusId = polls >= MockNexusLabClient.POLLS_UNTIL_COMPLETE ? 4 : 3;
    }

    // Documented: "In the event that all results have been voided then the
    // status will automatically move to status 5 (cancelled)."
    if (order.statusId === 4 && order.scenario === 'fully-voided') {
      order.statusId = 5;
    }

    return {
      orderNumber: order.orderNumber,
      orderId: order.orderId,
      statusId: order.statusId,
      statusDescription: describeStatus(order.statusId),
      statusDate: new Date().toISOString(),
      arrangementType: 'Own Clinic',
      arrangementStatus: order.statusId >= 3 ? 'Samples received' : 'Awaiting samples',
    };
  }

  async getOrderResultDetail(ref: OrderRef): Promise<GetOrderResultDetailResponse> {
    const order = this.mustFind(ref.orderNumber);
    if (!Number.isInteger(ref.clinicId)) {
      throw new Error('GetOrderResultDetail requires a clinicId.');
    }
    return FIXTURE_BUILDERS[order.scenario](order.orderId, order.orderNumber);
  }

  async getOrderResultReports(ref: OrderRef): Promise<string | null> {
    const order = this.mustFind(ref.orderNumber);
    // Nothing to publish for an order with no reportable results.
    if (order.scenario === 'fully-voided') return null;
    return FIXTURE_PDF_BASE64;
  }

  // --- Reference data ------------------------------------------------------

  async getPanels(): Promise<RandoxPanel[]> {
    return [
      {
        id: '71',
        name: 'Aspire Core Screen',
        code: 'CORE',
        panelType: 'Custom',
        specialInstructions: '',
        fastingRequired: true,
        sampleStabilityTime: 1,
        stabilityTime: 1,
        cost: 50,
        currency: 'Pounds',
        sampleTubes: [{ id: '1', name: 'SST Gel Separator Vacutainer (8ml Gold)', quantityRequired: 1 }],
        testItems: [
          { id: '632', name: '01 LIPIDS' },
          { id: '640', name: 'Full Blood Count' },
        ],
      },
    ];
  }

  async getTests(): Promise<RandoxTestItem[]> {
    return [
      {
        id: '632',
        name: '01 LIPIDS',
        code: 'LIPIDS',
        stabilityTime: 1,
        sampleTubes: [{ id: '1', name: 'SST Gel Separator Vacutainer (8ml Gold)', quantityRequired: 1 }],
        cost: 0,
        currency: null,
      },
      {
        id: '640',
        name: 'Full Blood Count',
        code: 'FBC',
        stabilityTime: 1,
        sampleTubes: [{ id: '2', name: 'EDTA (Purple)', quantityRequired: 1 }],
        cost: 0,
        currency: null,
      },
    ];
  }

  async getBiologicalSexes(): Promise<RandoxLookupItem[]> {
    return FIXTURE_BIOLOGICAL_SEXES;
  }

  async getEthnicities(): Promise<RandoxLookupItem[]> {
    return FIXTURE_ETHNICITIES;
  }

  async getTestingReasons(): Promise<RandoxLookupItem[]> {
    return FIXTURE_TESTING_REASONS;
  }

  async getCancellationReasons(): Promise<RandoxLookupItem[]> {
    return FIXTURE_CANCELLATION_REASONS;
  }

  async getMyClinicDetails(): Promise<RandoxClinicDetails> {
    return {
      id: '146',
      name: 'Aspire Clinic',
      code: '345865',
      addressLine1: '1 Example Street',
      addressLine2: '',
      townCity: 'Manchester',
      county: 'Greater Manchester',
      postalCode: 'M1 1AA',
      clinicTestLocations: [
        {
          id: '147',
          name: 'Aspire Clinic — Manchester',
          code: 'fdh456',
          addressLine1: '1 Example Street',
          addressLine2: '',
          townCity: 'Manchester',
          county: 'Greater Manchester',
          postalCode: 'M1 1AA',
        },
      ],
    };
  }

  // --- test helpers --------------------------------------------------------

  private mustFind(orderNumber: string): MockOrder {
    const order = this.byNumber.get(orderNumber);
    if (!order) throw new Error(`Mock Nexus: unknown order number "${orderNumber}".`);
    return order;
  }

  /** Registers an order without going through create. */
  seedOrder(orderNumber: string, scenario: FixtureScenario, statusId = 4, orderId = 999): void {
    this.byNumber.set(orderNumber, {
      orderId,
      orderNumber,
      scenario,
      statusId,
      amendableUntil: Date.now() + 30 * 60 * 1000,
      cancelled: statusId === 5,
    });
  }

  reset(): void {
    this.byNumber.clear();
    this.pollCounts.clear();
    this.scenarioOverride = null;
    this.nextOrderId = 10300;
  }
}

function describeStatus(code: number): string {
  return (
    { 1: 'Incomplete', 2: 'Submitted', 3: 'Pending Results', 4: 'Complete', 5: 'Cancelled' }[code] ?? `Unknown (${code})`
  );
}
