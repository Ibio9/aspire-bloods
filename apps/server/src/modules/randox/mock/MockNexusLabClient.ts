import { randomUUID } from 'node:crypto';
import { RandoxWindowExpiredError } from '../errors.js';
import type { NexusLabClient } from '../clients/types.js';
import type {
  CreatePendingOrderRequest,
  CreatePendingOrderResponse,
  UpdatePendingOrderRequest,
  GetOrderStatusResponse,
  GetOrderResultDetailResponse,
  RandoxResultReport,
} from '../types.js';
import { FIXTURE_BUILDERS, FIXTURE_PDF_BASE64, type FixtureScenario } from './fixtures.js';

interface MockOrder {
  orderNumber: string;
  patientRef: string;
  scenario: FixtureScenario;
  statusCode: number;
  /** Once past this, windowed operations are rejected — as the real API does. */
  amendableUntil: number;
  cancelled: boolean;
}

/**
 * In-memory Nexus Lab implementing the documented contracts. This is what
 * the whole integration runs against until the sandbox subscription keys
 * arrive; swapping to the real thing is RANDOX_TRANSPORT=live.
 *
 * It is deliberately not a permissive stub — it enforces the parts of the
 * contract that our code has to cope with:
 *   - the Order Number is the only handle on an order,
 *   - status advances 2 → 3 → 4 rather than jumping straight to results,
 *   - windowed operations start failing once the order has progressed,
 *   - a fully voided order reports status 5.
 *
 * Which fixture an order gets is chosen by a marker in the patient
 * reference (see scenarioFor) so a test can ask for a specific scenario
 * without a bespoke API.
 */
export class MockNexusLabClient implements NexusLabClient {
  private readonly orders = new Map<string, MockOrder>();

  /** How many GetOrderStatus calls before an order reaches COMPLETE. */
  private static readonly POLLS_UNTIL_COMPLETE = 2;
  private readonly pollCounts = new Map<string, number>();

  /** Test hook: force the next created order onto a given scenario. */
  scenarioOverride: FixtureScenario | null = null;

  async createPendingOrder(request: CreatePendingOrderRequest): Promise<CreatePendingOrderResponse> {
    if (request.panelIds.length === 0 && request.testIds.length === 0) {
      throw new Error('CreatePendingOrder requires at least one panel id or test id.');
    }
    if (!request.clinicId) {
      throw new Error('CreatePendingOrder requires a clinic id.');
    }

    const orderNumber = `MOCK-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.orders.set(orderNumber, {
      orderNumber,
      patientRef: request.externalPatientReference,
      scenario: this.scenarioOverride ?? scenarioFor(request.externalPatientReference),
      statusCode: 2,
      // The real amendment window isn't documented; 30 minutes here just
      // gives the window-expired path something to exercise.
      amendableUntil: Date.now() + 30 * 60 * 1000,
      cancelled: false,
    });
    this.scenarioOverride = null;
    return { orderNumber, statusCode: 2 };
  }

  async updatePendingOrder(request: UpdatePendingOrderRequest): Promise<void> {
    const order = this.mustFind(request.orderNumber);
    if (Date.now() > order.amendableUntil || order.statusCode >= 3) {
      throw new RandoxWindowExpiredError(
        'UpdatePendingOrder',
        order.orderNumber,
        `Order ${order.orderNumber} can no longer be amended — it has already been submitted for processing.`,
      );
    }
  }

  async cancelOrder(orderNumber: string, _reason: string): Promise<void> {
    const order = this.mustFind(orderNumber);
    if (order.statusCode >= 4) {
      throw new RandoxWindowExpiredError(
        'CancelOrder',
        orderNumber,
        `Order ${orderNumber} can no longer be cancelled — results have already been reported.`,
      );
    }
    order.cancelled = true;
    order.statusCode = 5;
  }

  async getOrderStatus(orderNumber: string): Promise<GetOrderStatusResponse> {
    const order = this.mustFind(orderNumber);

    if (!order.cancelled && order.statusCode < 4) {
      const polls = (this.pollCounts.get(orderNumber) ?? 0) + 1;
      this.pollCounts.set(orderNumber, polls);
      order.statusCode = polls >= MockNexusLabClient.POLLS_UNTIL_COMPLETE ? 4 : 3;
    }

    // An order whose every result is voided is reported as cancelled —
    // documented behaviour, and the case ingestion has to handle without
    // creating an empty report.
    if (order.statusCode === 4 && order.scenario === 'fully-voided') {
      order.statusCode = 5;
    }

    return {
      orderNumber,
      statusCode: order.statusCode,
      statusDescription: describeStatus(order.statusCode),
    };
  }

  async getOrderResultDetail(orderNumber: string): Promise<GetOrderResultDetailResponse> {
    const order = this.mustFind(orderNumber);
    return FIXTURE_BUILDERS[order.scenario](orderNumber, order.patientRef);
  }

  async getOrderResultReports(orderNumber: string): Promise<RandoxResultReport[]> {
    const order = this.mustFind(orderNumber);
    // Nothing to publish for an order with no reportable results.
    if (order.scenario === 'fully-voided') return [];
    return [
      { filename: `randox-${orderNumber}.pdf`, contentBase64: FIXTURE_PDF_BASE64, mimeType: 'application/pdf' },
    ];
  }

  private mustFind(orderNumber: string): MockOrder {
    const order = this.orders.get(orderNumber);
    if (!order) throw new Error(`Mock Nexus: unknown order number "${orderNumber}".`);
    return order;
  }

  /** Test helper — registers an order without going through create. */
  seedOrder(orderNumber: string, patientRef: string, scenario: FixtureScenario, statusCode = 4): void {
    this.orders.set(orderNumber, {
      orderNumber,
      patientRef,
      scenario,
      statusCode,
      amendableUntil: Date.now() + 30 * 60 * 1000,
      cancelled: statusCode === 5,
    });
  }

  reset(): void {
    this.orders.clear();
    this.pollCounts.clear();
    this.scenarioOverride = null;
  }
}

function describeStatus(code: number): string {
  return (
    { 1: 'Incomplete', 2: 'Submitted', 3: 'Pending results', 4: 'Complete', 5: 'Cancelled' }[code] ?? `Unknown (${code})`
  );
}

/**
 * Picks a fixture from the patient reference. Any reference containing
 * "+voided", "+partial" etc. selects that scenario; everything else gets
 * the normal one — so ordinary use of the mock looks ordinary.
 */
function scenarioFor(patientRef: string): FixtureScenario {
  const ref = patientRef.toLowerCase();
  if (ref.includes('+fully-voided')) return 'fully-voided';
  if (ref.includes('+voided')) return 'partially-voided';
  if (ref.includes('+unmapped')) return 'unmapped-marker';
  if (ref.includes('+partial')) return 'partial-results';
  return 'normal';
}
