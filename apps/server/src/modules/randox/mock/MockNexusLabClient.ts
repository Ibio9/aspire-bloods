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
  /** The identity the order was created with, as the real API would hold it. */
  identity: { firstName: string; lastName: string; dateOfBirth: string } | null;
}

/**
 * Whether, and how truthfully, the mock echoes patient identity back on the
 * result payload.
 *
 * 'none' is the default because it is what Randox's published response
 * example does — the field set simply isn't there. The other three exist so
 * the corroboration rules in identityCheck.ts can be exercised end to end
 * through the ordinary flow rather than only in a unit test: a laboratory
 * that confirms the identity, one that returns somebody else's date of
 * birth, and one that returns somebody else's name.
 */
export type IdentityEcho = 'none' | 'matching' | 'mismatched-dob' | 'mismatched-name';

/**
 * In-memory Nexus Lab implementing the documented contracts from
 * specs/nexus-openapi3.json. This is what the integration runs against until
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

  /** Test hook: what the lab claims about identity on the result payload. */
  identityEcho: IdentityEcho = 'none';

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
      identity: {
        firstName: request.FirstName,
        lastName: request.LastName,
        dateOfBirth: request.DateOfBirth,
      },
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
    const detail = FIXTURE_BUILDERS[order.scenario](order.orderId, order.orderNumber);
    return { ...detail, ...this.identityFields(order) };
  }

  /**
   * The identity block, as the configured echo mode would have Randox report
   * it. A mismatch is a DIFFERENT person's details, not a typo — the rule
   * being exercised is exact agreement, and a near-miss would test nothing
   * the exact case doesn't.
   */
  private identityFields(order: MockOrder): Partial<GetOrderResultDetailResponse> {
    if (this.identityEcho === 'none' || !order.identity) return {};
    const { firstName, lastName, dateOfBirth } = order.identity;
    if (this.identityEcho === 'mismatched-dob') {
      return { patientFirstName: firstName, patientLastName: lastName, patientDateOfBirth: '1970-01-01' };
    }
    if (this.identityEcho === 'mismatched-name') {
      return { patientFirstName: 'Someone', patientLastName: 'Else', patientDateOfBirth: dateOfBirth };
    }
    return { patientFirstName: firstName, patientLastName: lastName, patientDateOfBirth: dateOfBirth };
  }

  async getOrderResultReports(ref: OrderRef): Promise<string | null> {
    const order = this.mustFind(ref.orderNumber);
    // Nothing to publish for an order with no reportable results.
    if (order.scenario === 'fully-voided') return null;
    return FIXTURE_PDF_BASE64;
  }

  // --- Reference data ------------------------------------------------------
  //
  // NO cost AND NO currency ANYWHERE BELOW, and their absence is the point.
  // The wire carries both on GetPanels and GetTests; the live client deletes
  // them at the transport boundary (stripPricing in clients/NexusLabClient.ts)
  // so they never reach the database or an API response. This client stands in
  // for the transport, so it stands in for that too — a mock that returned
  // prices would make the pricing test pass against Randox and fail against
  // the fixtures, which is the wrong way round. The mock HTTP SERVER in
  // mock/specServer.ts DOES serve them, because it is serving the spec's own
  // examples verbatim, and the real client strips them there.

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
      },
      {
        id: '640',
        name: 'Full Blood Count',
        code: 'FBC',
        stabilityTime: 1,
        sampleTubes: [{ id: '2', name: 'EDTA (Purple)', quantityRequired: 1 }],
      },
    ];
  }

  async getClinicStaff() {
    return [
      { userId: 'ce02dec0-9a46-4cfa-90c5-32gsdw52y223', firstName: 'Fixture', lastName: 'Laboratory', active: true, role: 'Laboratory' },
      { userId: 'ce02dec0-9a46-4cfa-90c5-32gsdw52y224', firstName: 'Fixture', lastName: 'Management', active: true, role: 'Management' },
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
  seedOrder(
    orderNumber: string,
    scenario: FixtureScenario,
    statusId = 4,
    orderId = 999,
    identity: MockOrder['identity'] = null,
  ): void {
    this.byNumber.set(orderNumber, {
      orderId,
      orderNumber,
      scenario,
      statusId,
      amendableUntil: Date.now() + 30 * 60 * 1000,
      cancelled: statusId === 5,
      identity,
    });
  }

  reset(): void {
    this.byNumber.clear();
    this.pollCounts.clear();
    this.scenarioOverride = null;
    this.identityEcho = 'none';
    this.nextOrderId = 10300;
  }
}

function describeStatus(code: number): string {
  return (
    { 1: 'Incomplete', 2: 'Submitted', 3: 'Pending Results', 4: 'Complete', 5: 'Cancelled' }[code] ?? `Unknown (${code})`
  );
}
