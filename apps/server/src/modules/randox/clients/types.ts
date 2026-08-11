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
  RandoxClinicStaffMember,
  RandoxServiceLocation,
  RandoxAvailabilitySlot,
  HoldAvailabilityBookingResponse,
  CreateRandoxBookingRequest,
  CreateRandoxBookingResponse,
} from '../types.js';

/**
 * The two clients are interfaces, not classes, precisely so the mock and
 * the live implementation are interchangeable. Nothing above this layer
 * knows which one it has — swapping is `RANDOX_TRANSPORT`, a config change
 * with no code change (see clients/index.ts).
 */

export interface NexusLabClient {
  createPendingOrder(request: CreatePendingOrderRequest): Promise<CreateOrderResponse>;
  /** Windowed: throws RandoxWindowExpiredError once the order has moved on. */
  updatePendingOrder(request: UpdatePendingOrderRequest): Promise<CreateOrderResponse>;
  /** Windowed. Takes a CancellationReasonId, not free text. */
  cancelOrder(request: CancelOrderRequest): Promise<void>;

  getOrderStatus(ref: Pick<OrderRef, 'orderId' | 'orderNumber'>): Promise<GetOrderStatusResponse>;
  getOrderResultDetail(ref: OrderRef): Promise<GetOrderResultDetailResponse>;
  /** Base64 PDF, or null when Randox have none for this order. */
  getOrderResultReports(ref: OrderRef): Promise<string | null>;

  // Self-serve reference data. Cached by referenceDataService.ts rather
  // than called per request — none of it changes often, and hardcoding any
  // of it is how our catalogue drifted from Randox's in the first place.
  getPanels(): Promise<RandoxPanel[]>;
  getTests(): Promise<RandoxTestItem[]>;
  getBiologicalSexes(): Promise<RandoxLookupItem[]>;
  getEthnicities(): Promise<RandoxLookupItem[]>;
  getTestingReasons(): Promise<RandoxLookupItem[]>;
  getCancellationReasons(): Promise<RandoxLookupItem[]>;
  getMyClinicDetails(): Promise<RandoxClinicDetails>;
  /** GET /Clinic/GetClinicStaff — the eighth reference endpoint. */
  getClinicStaff(): Promise<RandoxClinicStaffMember[]>;
}

/**
 * UNVERIFIED — no Randox specification for the Clinic Booking API has been
 * provided; access is still pending. The method set and call order come
 * from the flow PDFs, which document the endpoint paths and sequence but
 * not the request or response bodies. See types.ts.
 */
export interface ClinicBookingClient {
  getServiceLocations(): Promise<RandoxServiceLocation[]>;
  /** `from`/`to` are ISO dates; slots come back in UTC (documented). */
  availabilityDetails(serviceLocationId: string, fromIsoDate: string, toIsoDate: string): Promise<RandoxAvailabilitySlot[]>;
  /** Holds a slot for 30 minutes (documented). */
  holdAvailabilityBooking(serviceLocationId: string, slotReference: string): Promise<HoldAvailabilityBookingResponse>;
  /** Windowed: fails once the 30-minute hold has lapsed. */
  createRandoxBooking(request: CreateRandoxBookingRequest): Promise<CreateRandoxBookingResponse>;
  /** Windowed. */
  cancelRandoxBooking(bookingReference: string, orderNumber: string): Promise<void>;
  /** Windowed. */
  rescheduleAppointment(
    bookingReference: string,
    orderNumber: string,
    newSlotReference: string,
    newStartUtc: string,
  ): Promise<CreateRandoxBookingResponse>;
}
