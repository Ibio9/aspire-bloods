import { describe, it, expect, beforeEach } from 'vitest';
import { MockNexusLabClient } from '../src/modules/randox/mock/MockNexusLabClient.js';
import { MockClinicBookingClient } from '../src/modules/randox/mock/MockClinicBookingClient.js';
import { RandoxWindowExpiredError } from '../src/modules/randox/errors.js';
import { orderStatusFromCode } from '../src/modules/randox/types.js';
import {
  FIXTURE_UNKNOWN_CODE,
  FIXTURE_UNMAPPED_MARKER,
  FIXTURE_VOID_CODE,
} from '../src/modules/randox/mock/fixtures.js';

/**
 * These exercise the documented contracts through the mock, which is the
 * only thing we can run against until sandbox access arrives. They are
 * written against the contract, not against our own ingestion code, so
 * they stay meaningful when the live client replaces the mock.
 */

const orderRequest = (patientRef: string) => ({
  clinicId: 'TEST-CLINIC',
  panelIds: ['RDX-PANEL-CORE'],
  testIds: [],
  patient: {
    firstName: 'Test',
    lastName: 'Patient',
    dateOfBirth: '1985-04-02',
    sex: 'Female',
    email: 'test@example.com',
    phoneNumber: null,
    addressLine1: null,
    postcode: 'M1 1AA',
  },
  externalPatientReference: patientRef,
  collectionMethod: 'IN_CLINIC',
});

describe('order status codes', () => {
  it('maps the five documented statuses', () => {
    expect(orderStatusFromCode(1)).toBe('INCOMPLETE');
    expect(orderStatusFromCode(2)).toBe('SUBMITTED');
    expect(orderStatusFromCode(3)).toBe('PENDING_RESULTS');
    expect(orderStatusFromCode(4)).toBe('COMPLETE');
    expect(orderStatusFromCode(5)).toBe('CANCELLED');
  });

  // Never guess. An unknown status must not become "complete".
  it('returns null for an unrecognised status code rather than guessing', () => {
    expect(orderStatusFromCode(6)).toBeNull();
    expect(orderStatusFromCode(0)).toBeNull();
  });
});

describe('MockNexusLabClient', () => {
  let nexus: MockNexusLabClient;
  beforeEach(() => {
    nexus = new MockNexusLabClient();
  });

  it('requires at least one panel or test', async () => {
    await expect(nexus.createPendingOrder({ ...orderRequest('p1'), panelIds: [], testIds: [] })).rejects.toThrow(
      /at least one panel id or test id/i,
    );
  });

  it('requires a clinic id', async () => {
    await expect(nexus.createPendingOrder({ ...orderRequest('p1'), clinicId: '' })).rejects.toThrow(/clinic id/i);
  });

  it('returns an Order Number that keys every later call', async () => {
    const { orderNumber } = await nexus.createPendingOrder(orderRequest('p1'));
    expect(orderNumber).toBeTruthy();
    const status = await nexus.getOrderStatus(orderNumber);
    expect(status.orderNumber).toBe(orderNumber);
  });

  it('advances through pending results before reaching complete', async () => {
    const { orderNumber } = await nexus.createPendingOrder(orderRequest('p1'));
    expect((await nexus.getOrderStatus(orderNumber)).statusCode).toBe(3);
    expect((await nexus.getOrderStatus(orderNumber)).statusCode).toBe(4);
  });

  it('reports an order whose results are all voided as cancelled (5)', async () => {
    const { orderNumber } = await nexus.createPendingOrder(orderRequest('p1+fully-voided'));
    await nexus.getOrderStatus(orderNumber);
    expect((await nexus.getOrderStatus(orderNumber)).statusCode).toBe(5);
  });

  it('rejects an amendment once the order has moved on, as a closed window', async () => {
    const { orderNumber } = await nexus.createPendingOrder(orderRequest('p1'));
    await nexus.getOrderStatus(orderNumber); // advances to 3
    await expect(nexus.updatePendingOrder({ orderNumber })).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  it('rejects cancellation once results are reported, as a closed window', async () => {
    const { orderNumber } = await nexus.createPendingOrder(orderRequest('p1'));
    await nexus.getOrderStatus(orderNumber);
    await nexus.getOrderStatus(orderNumber); // now 4
    await expect(nexus.cancelOrder(orderNumber, 'changed mind')).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  it('allows cancellation while the order is still amendable', async () => {
    const { orderNumber } = await nexus.createPendingOrder(orderRequest('p1'));
    await nexus.cancelOrder(orderNumber, 'patient withdrew');
    expect((await nexus.getOrderStatus(orderNumber)).statusCode).toBe(5);
  });
});

describe('result fixtures', () => {
  let nexus: MockNexusLabClient;
  beforeEach(() => {
    nexus = new MockNexusLabClient();
  });

  it('normal: every analyte has a value and a reference range', async () => {
    nexus.seedOrder('ORD-1', 'patient-1', 'normal');
    const detail = await nexus.getOrderResultDetail('ORD-1');
    expect(detail.results).toHaveLength(3);
    for (const r of detail.results) {
      expect(r.value).not.toBeNull();
      expect(r.referenceLow).not.toBeNull();
      expect(r.referenceHigh).not.toBeNull();
      expect(r.voidCodes).toHaveLength(0);
    }
  });

  it('partially voided: carries a void code on an otherwise plausible value', async () => {
    nexus.seedOrder('ORD-2', 'patient-1', 'partially-voided');
    const detail = await nexus.getOrderResultDetail('ORD-2');
    const voided = detail.results.find((r) => r.voidCodes.includes(FIXTURE_VOID_CODE));
    expect(voided).toBeDefined();
    // The point of the fixture: the number looks perfectly normal, and must
    // still never be shown.
    expect(voided!.value).toBe(4.2);
  });

  it('fully voided: the void is at order level, applying to every analyte', async () => {
    nexus.seedOrder('ORD-3', 'patient-1', 'fully-voided');
    const detail = await nexus.getOrderResultDetail('ORD-3');
    expect(detail.voidCodes).toContain(FIXTURE_VOID_CODE);
    expect(detail.results.length).toBeGreaterThan(0);
  });

  it('unmapped marker: includes a marker absent from any catalogue, plus an unknown code', async () => {
    nexus.seedOrder('ORD-4', 'patient-1', 'unmapped-marker');
    const detail = await nexus.getOrderResultDetail('ORD-4');
    expect(detail.results.some((r) => r.testName === FIXTURE_UNMAPPED_MARKER)).toBe(true);
    expect(detail.results.some((r) => r.caveatCodes.includes(FIXTURE_UNKNOWN_CODE))).toBe(true);
  });

  it('partial: some analytes are still pending and carry no value', async () => {
    nexus.seedOrder('ORD-5', 'patient-1', 'partial-results');
    const detail = await nexus.getOrderResultDetail('ORD-5');
    const pending = detail.results.filter((r) => r.pending);
    expect(pending.length).toBe(2);
    for (const r of pending) expect(r.value).toBeNull();
  });

  it('returns no PDF for an order with nothing reportable', async () => {
    nexus.seedOrder('ORD-6', 'patient-1', 'fully-voided');
    expect(await nexus.getOrderResultReports('ORD-6')).toHaveLength(0);
  });
});

describe('MockClinicBookingClient', () => {
  let booking: MockClinicBookingClient;
  beforeEach(() => {
    booking = new MockClinicBookingClient();
  });

  it('returns availability in UTC with an explicit Z', async () => {
    const [location] = await booking.getServiceLocations();
    const slots = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) expect(slot.startUtc.endsWith('Z')).toBe(true);
  });

  it('books a held slot against the Nexus order number', async () => {
    const [location] = await booking.getServiceLocations();
    const [slot] = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    const hold = await booking.holdAvailabilityBooking(location.id, slot.slotReference);
    const result = await booking.createRandoxBooking({
      holdReference: hold.holdReference,
      serviceLocationId: location.id,
      gpExternalNumber: 'ORD-1',
      startUtc: slot.startUtc,
    });
    expect(result.bookingReference).toBeTruthy();
  });

  it('refuses to book without the Nexus order number', async () => {
    const [location] = await booking.getServiceLocations();
    const [slot] = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    const hold = await booking.holdAvailabilityBooking(location.id, slot.slotReference);
    await expect(
      booking.createRandoxBooking({
        holdReference: hold.holdReference,
        serviceLocationId: location.id,
        gpExternalNumber: '',
        startUtc: slot.startUtc,
      }),
    ).rejects.toThrow(/GPExternalNumber/);
  });

  it('treats a lapsed 30-minute hold as a closed window, not a fault', async () => {
    booking.expireHoldsImmediately = true;
    const [location] = await booking.getServiceLocations();
    const [slot] = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    const hold = await booking.holdAvailabilityBooking(location.id, slot.slotReference);
    await expect(
      booking.createRandoxBooking({
        holdReference: hold.holdReference,
        serviceLocationId: location.id,
        gpExternalNumber: 'ORD-1',
        startUtc: slot.startUtc,
      }),
    ).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  it('will not reuse a hold that has already been converted to a booking', async () => {
    const [location] = await booking.getServiceLocations();
    const [slot] = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    const hold = await booking.holdAvailabilityBooking(location.id, slot.slotReference);
    const request = {
      holdReference: hold.holdReference,
      serviceLocationId: location.id,
      gpExternalNumber: 'ORD-1',
      startUtc: slot.startUtc,
    };
    await booking.createRandoxBooking(request);
    await expect(booking.createRandoxBooking(request)).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  it('reschedules a confirmed booking', async () => {
    const [location] = await booking.getServiceLocations();
    const slots = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    const hold = await booking.holdAvailabilityBooking(location.id, slots[0].slotReference);
    const created = await booking.createRandoxBooking({
      holdReference: hold.holdReference,
      serviceLocationId: location.id,
      gpExternalNumber: 'ORD-1',
      startUtc: slots[0].startUtc,
    });
    const moved = await booking.rescheduleAppointment(
      created.bookingReference,
      'ORD-1',
      slots[2].slotReference,
      slots[2].startUtc,
    );
    expect(moved.startUtc).toBe(slots[2].startUtc);
  });

  it('treats cancelling an unknown booking as a closed window', async () => {
    await expect(booking.cancelRandoxBooking('NOPE', 'ORD-1')).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });
});
