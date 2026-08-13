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

  /**
   * ClinicId optional BY TYPE and always supplied in practice: the flow
   * diagram requires it, the OpenAPI and Postman examples omit it. See
   * LiveNexusLabClient.getOrderStatus for why it is sent.
   */
  getOrderStatus(ref: Pick<OrderRef, 'orderId' | 'orderNumber'> & { clinicId?: number }): Promise<GetOrderStatusResponse>;
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
 * REQUESTS VERIFIED AGAINST THE POSTMAN COLLECTION, RESPONSES STILL ASSUMED.
 * The method set and call order are the flow diagram's; every request body is
 * the collection's, literally. See ../types.ts for what that asymmetry means.
 */
export interface ClinicBookingClient {
  /** POST. Takes the configured ServiceId (787 UK / 788 ROI). */
  getServiceLocations(): Promise<RandoxServiceLocation[]>;
  /**
   * POST. Slots come back UTC (documented) and carry a UK-local rendering
   * beside the instant.
   *
   * `until` is applied to the RESULT, not sent: the API takes a SearchFrom and
   * has no SearchTo.
   */
  availabilityDetails(
    locationId: string,
    searchFromIsoDate: string,
    untilIsoDate?: string,
  ): Promise<RandoxAvailabilitySlot[]>;
  /**
   * POST. Holds a slot for 30 minutes (documented).
   *
   * Takes the slot's UTC instant as well as its id, because the wire wants the
   * date and the time as separate fields and both are derived from it.
   */
  holdAvailabilityBooking(
    locationId: string,
    slotReference: string,
    startUtc: string,
  ): Promise<HoldAvailabilityBookingResponse>;
  /** POST. Windowed: fails once the 30-minute hold has lapsed. */
  createRandoxBooking(request: CreateRandoxBookingRequest): Promise<CreateRandoxBookingResponse>;
  /**
   * POST. Windowed. Takes Randox's own integer booking-order id — the only
   * field the cancel example carries.
   */
  cancelRandoxBooking(randoxBookingOrderId: number, orderNumber: string): Promise<void>;
  /**
   * NOT A DOCUMENTED ENDPOINT. Throws RandoxUnsupportedOperationError. Kept on
   * the interface rather than deleted so that the absence is visible where
   * somebody would go looking for it, instead of being a method that quietly
   * never existed. See LiveClinicBookingClient.rescheduleAppointment.
   */
  rescheduleAppointment(): Promise<never>;
}
