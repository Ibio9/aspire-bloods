import type {
  CreatePendingOrderRequest,
  CreatePendingOrderResponse,
  UpdatePendingOrderRequest,
  GetOrderStatusResponse,
  GetOrderResultDetailResponse,
  RandoxResultReport,
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
  createPendingOrder(request: CreatePendingOrderRequest): Promise<CreatePendingOrderResponse>;
  /** Windowed: throws RandoxWindowExpiredError once the order has moved on. */
  updatePendingOrder(request: UpdatePendingOrderRequest): Promise<void>;
  /** Windowed. */
  cancelOrder(orderNumber: string, reason: string): Promise<void>;
  getOrderStatus(orderNumber: string): Promise<GetOrderStatusResponse>;
  getOrderResultDetail(orderNumber: string): Promise<GetOrderResultDetailResponse>;
  /** Empty array when Randox have no PDF for this order (yet). */
  getOrderResultReports(orderNumber: string): Promise<RandoxResultReport[]>;
}

export interface ClinicBookingClient {
  getServiceLocations(): Promise<RandoxServiceLocation[]>;
  /** `from`/`to` are ISO dates; slots come back in UTC. */
  availabilityDetails(serviceLocationId: string, fromIsoDate: string, toIsoDate: string): Promise<RandoxAvailabilitySlot[]>;
  /** Holds a slot for 30 minutes. */
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
