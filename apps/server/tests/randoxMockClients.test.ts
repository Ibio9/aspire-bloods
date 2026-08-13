import { describe, it, expect, beforeEach } from 'vitest';
import { MockNexusLabClient } from '../src/modules/randox/mock/MockNexusLabClient.js';
import { MockClinicBookingClient } from '../src/modules/randox/mock/MockClinicBookingClient.js';
import { RandoxUnsupportedOperationError, RandoxWindowExpiredError } from '../src/modules/randox/errors.js';
import { orderStatusFromCode } from '../src/modules/randox/types.js';
import type { CreateRandoxBookingRequest } from '../src/modules/randox/types.js';
import {
  FIXTURE_UNKNOWN_CODE,
  FIXTURE_UNMAPPED_MARKER,
  FIXTURE_VOID_CODE,
} from '../src/modules/randox/mock/fixtures.js';

/**
 * These exercise the contracts as declared in specs/nexus-openapi3.json.
 * They are written against the contract, not against our own ingestion
 * code, so they stay meaningful when the live client replaces the mock.
 */

/** Invented. Nothing real goes near the sandbox or these fixtures. */
const FIXTURE_BOOKING_PATIENT: CreateRandoxBookingRequest['patient'] = {
  firstName: 'Fixture',
  lastName: 'Patient',
  dateOfBirth: '1990-01-01',
  biologicalSexId: 2,
  email: 'fixture.patient@example.test',
  contactNumber: '07700900000',
  addressLine1: '1 Fixture Street',
  addressLine2: '',
  townCity: 'Fixtureton',
  postalCode: 'M1 1AA',
  countryId: 1,
};

const orderRequest = () => ({
  FirstName: 'Test',
  LastName: 'Patient',
  DateOfBirth: '1985-04-02',
  BiologicalSexId: 2,
  TestClinicLocationId: 147,
  PanelIds: [71],
  TestIds: [],
  IsHealthCheckPanelReport: true,
  IsCvScoreRequired: false,
  TestReasons: [{ Id: 1, Details: 'Private health screening.' }],
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

describe('MockNexusLabClient — CreatePendingOrder', () => {
  let nexus: MockNexusLabClient;
  beforeEach(() => {
    nexus = new MockNexusLabClient();
  });

  // The order number comes back as `externalNumber`. Reading `orderNumber`
  // off this response gets undefined — the spec says so in three places.
  it('returns the order number as externalNumber, plus the integer orderId', async () => {
    const response = await nexus.createPendingOrder(orderRequest());
    expect(response.externalNumber).toMatch(/^GC1123-\d{8}$/);
    expect(Number.isInteger(response.orderId)).toBe(true);
    expect(response).not.toHaveProperty('orderNumber');
  });

  it('enforces every field the spec marks required', async () => {
    await expect(nexus.createPendingOrder({ ...orderRequest(), FirstName: '' })).rejects.toThrow(/FirstName/);
    await expect(nexus.createPendingOrder({ ...orderRequest(), DateOfBirth: '' })).rejects.toThrow(/DateOfBirth/);
    await expect(
      nexus.createPendingOrder({ ...orderRequest(), BiologicalSexId: undefined as unknown as number }),
    ).rejects.toThrow(/BiologicalSexId/);
    await expect(nexus.createPendingOrder({ ...orderRequest(), TestReasons: [] })).rejects.toThrow(/TestReason/);
  });

  it('requires at least one panel or test', async () => {
    await expect(nexus.createPendingOrder({ ...orderRequest(), PanelIds: [], TestIds: [] })).rejects.toThrow(
      /at least one valid Panel Id or Test Id/i,
    );
  });
});

describe('MockNexusLabClient — lifecycle', () => {
  let nexus: MockNexusLabClient;
  beforeEach(() => {
    nexus = new MockNexusLabClient();
  });

  it('advances through pending results before reaching complete', async () => {
    const { orderId, externalNumber } = await nexus.createPendingOrder(orderRequest());
    const ref = { orderId, orderNumber: externalNumber };
    expect((await nexus.getOrderStatus(ref)).statusId).toBe(3);
    expect((await nexus.getOrderStatus(ref)).statusId).toBe(4);
  });

  // Documented: "In the event that all results have been voided then the
  // status will automatically move to status 5 (cancelled)."
  it('reports an order whose results are all voided as cancelled (5)', async () => {
    nexus.scenarioOverride = 'fully-voided';
    const { orderId, externalNumber } = await nexus.createPendingOrder(orderRequest());
    const ref = { orderId, orderNumber: externalNumber };
    await nexus.getOrderStatus(ref);
    expect((await nexus.getOrderStatus(ref)).statusId).toBe(5);
  });

  it('rejects an amendment once the order has moved on, as a closed window', async () => {
    const { orderId, externalNumber } = await nexus.createPendingOrder(orderRequest());
    await nexus.getOrderStatus({ orderId, orderNumber: externalNumber }); // advances to 3
    await expect(
      nexus.updatePendingOrder({ ...orderRequest(), OrderId: orderId, OrderNumber: externalNumber }),
    ).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  // CancelOrder takes a CancellationReasonId from GetCancellationReasons,
  // not free text.
  it('requires a cancellation reason id', async () => {
    const { orderId, externalNumber } = await nexus.createPendingOrder(orderRequest());
    await expect(
      nexus.cancelOrder({ ClinicId: 146, OrderId: orderId, OrderNumber: externalNumber, CancellationReasonId: '' }),
    ).rejects.toThrow(/CancellationReasonId/);
  });

  it('rejects cancellation once results are reported, as a closed window', async () => {
    const { orderId, externalNumber } = await nexus.createPendingOrder(orderRequest());
    const ref = { orderId, orderNumber: externalNumber };
    await nexus.getOrderStatus(ref);
    await nexus.getOrderStatus(ref); // now 4
    await expect(
      nexus.cancelOrder({ ClinicId: 146, OrderId: orderId, OrderNumber: externalNumber, CancellationReasonId: '1' }),
    ).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  it('requires a clinicId on the result endpoints', async () => {
    nexus.seedOrder('ORD-1', 'normal');
    await expect(
      nexus.getOrderResultDetail({ orderId: 999, orderNumber: 'ORD-1', clinicId: undefined as unknown as number }),
    ).rejects.toThrow(/clinicId/);
  });

  // GetOrderResultReports returns ONE base64 string, not an array — a
  // different type from the identically-named field on the result detail.
  it('returns the report PDF as a single base64 string', async () => {
    nexus.seedOrder('ORD-2', 'normal');
    const pdf = await nexus.getOrderResultReports({ orderId: 999, orderNumber: 'ORD-2', clinicId: 146 });
    expect(typeof pdf).toBe('string');
    expect(Buffer.from(pdf!, 'base64').toString('utf-8')).toContain('%PDF');
  });

  it('returns no PDF for an order with nothing reportable', async () => {
    nexus.seedOrder('ORD-3', 'fully-voided');
    expect(await nexus.getOrderResultReports({ orderId: 999, orderNumber: 'ORD-3', clinicId: 146 })).toBeNull();
  });
});

describe('result fixtures', () => {
  let nexus: MockNexusLabClient;
  const ref = (orderNumber: string) => ({ orderId: 999, orderNumber, clinicId: 146 });
  beforeEach(() => {
    nexus = new MockNexusLabClient();
  });

  it('normal: every analyte has a value and a two-sided range', async () => {
    nexus.seedOrder('ORD-1', 'normal');
    const detail = await nexus.getOrderResultDetail(ref('ORD-1'));
    expect(detail.reportResults).toHaveLength(3);
    for (const r of detail.reportResults) {
      expect(r.result).toBeTruthy();
      expect(r.refLow).toBeTruthy();
      expect(r.refHigh).toBeTruthy();
      expect(r.caveat).toBeNull();
    }
  });

  it('carries patient measurements on the payload', async () => {
    nexus.seedOrder('ORD-M', 'normal');
    const detail = await nexus.getOrderResultDetail(ref('ORD-M'));
    expect(detail.patientHeight).toBe(178);
    expect(detail.patientSystolicBloodPressure).toBe(128);
    expect(detail.patientIsSmoker).toBe(false);
    expect(detail.patientEthnicity).toBe('White');
  });

  it('partially voided: carries a void code on an otherwise plausible value', async () => {
    nexus.seedOrder('ORD-2', 'partially-voided');
    const detail = await nexus.getOrderResultDetail(ref('ORD-2'));
    const voided = detail.reportResults.find((r) => r.caveat === FIXTURE_VOID_CODE);
    expect(voided).toBeDefined();
    // The point of the fixture: the number looks perfectly normal and must
    // still never be shown.
    expect(voided!.result).toBe('5.03');
  });

  it('fully voided: every analyte carries the void code', async () => {
    nexus.seedOrder('ORD-3', 'fully-voided');
    const detail = await nexus.getOrderResultDetail(ref('ORD-3'));
    expect(detail.reportResults.length).toBeGreaterThan(0);
    for (const r of detail.reportResults) expect(r.caveat).toBe(FIXTURE_VOID_CODE);
  });

  it('unmapped marker: includes a marker absent from any catalogue, plus an unknown code', async () => {
    nexus.seedOrder('ORD-4', 'unmapped-marker');
    const detail = await nexus.getOrderResultDetail(ref('ORD-4'));
    expect(detail.reportResults.some((r) => r.analyte === FIXTURE_UNMAPPED_MARKER)).toBe(true);
    expect(detail.reportResults.some((r) => r.caveat === FIXTURE_UNKNOWN_CODE)).toBe(true);
  });

  it('partial: some analytes are on the order but not yet reported', async () => {
    nexus.seedOrder('ORD-5', 'partial-results');
    const detail = await nexus.getOrderResultDetail(ref('ORD-5'));
    const unreported = detail.reportResults.filter((r) => !r.result);
    expect(unreported).toHaveLength(2);
  });

  it('awkward values: one-sided ranges, a comparator and a qualitative result', async () => {
    nexus.seedOrder('ORD-6', 'awkward-values');
    const detail = await nexus.getOrderResultDetail(ref('ORD-6'));

    const cholesterol = detail.reportResults.find((r) => r.analyte === 'Total Cholesterol')!;
    expect(cholesterol.refLow).toBe('');
    expect(cholesterol.refHigh).toBe('5.0');

    const egfr = detail.reportResults.find((r) => r.analyte?.includes('eGFR'))!;
    expect(egfr.refLow).toBe('≥60');

    const hscrp = detail.reportResults.find((r) => r.analyte?.includes('hsCRP'))!;
    expect(hscrp.result).toBe('< 0.3');

    const hep = detail.reportResults.find((r) => r.analyte?.includes('Hepatitis'))!;
    expect(hep.result).toBe('Not detected');
  });
});

describe('reference data', () => {
  const nexus = new MockNexusLabClient();

  it('returns lookups with string ids, as the spec examples do', async () => {
    const sexes = await nexus.getBiologicalSexes();
    expect(sexes).toContainEqual({ id: '1', name: 'Male' });
    expect(sexes).toContainEqual({ id: '2', name: 'Female' });
  });

  it('returns cancellation reasons for CancelOrder', async () => {
    expect(await nexus.getCancellationReasons()).toContainEqual({ id: '1', name: 'Cancellation By Clinic' });
  });

  it('returns the clinic and its test locations separately', async () => {
    const clinic = await nexus.getMyClinicDetails();
    expect(clinic.id).toBe('146');
    expect(clinic.clinicTestLocations[0].id).toBe('147');
  });
});

describe('MockClinicBookingClient', () => {
  let booking: MockClinicBookingClient;
  const ORDER_NUMBER = 'GC1123-00010300';

  beforeEach(() => {
    booking = new MockClinicBookingClient();
  });

  /** The location Randox say actually has availability: 30, Crumlin. */
  async function crumlin() {
    const locations = await booking.getServiceLocations();
    return locations.find((l) => l.id === '30')!;
  }

  async function bookFirstSlot(orderNumber = ORDER_NUMBER) {
    const location = await crumlin();
    const [slot] = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    const hold = await booking.holdAvailabilityBooking(location.id, slot.slotReference, slot.startUtc);
    const created = await booking.createRandoxBooking({
      holdReference: hold.holdReference,
      bookingId: hold.bookingId!,
      appointmentId: hold.appointmentId!,
      serviceLocationId: location.id,
      slotReference: slot.slotReference,
      startUtc: slot.startUtc,
      gpExternalNumber: orderNumber,
      patient: FIXTURE_BOOKING_PATIENT,
    });
    return { location, slot, hold, created };
  }

  it('returns availability in UTC with an explicit Z, and a UK-local rendering beside it', async () => {
    const location = await crumlin();
    const slots = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.startUtc.endsWith('Z')).toBe(true);
      expect(slot.local.timeZone).toBe('Europe/London');
    }
    // 1 September is inside BST, so the two readings differ by an hour. The
    // instant and its rendering are carried separately for exactly this
    // reason — a consumer showing the UTC clock would be an hour early.
    const nine = slots.find((s) => s.startUtc.includes('T09:00'))!;
    expect(nine.local.time).toBe('10:00');
  });

  it('an empty diary is an answer, not a failure', async () => {
    // Location 15 is the collection's own, and Randox warn it may have no
    // slots. A caller must not read that as a broken integration.
    const slots = await booking.availabilityDetails('15', '2026-09-01', '2026-09-01');
    expect(slots).toEqual([]);
  });

  it('books a held slot against the Nexus order number', async () => {
    const { created } = await bookFirstSlot();
    expect(created.bookingReference).toBeTruthy();
    // The id CancelRandoxBooking takes, and the only field it takes.
    expect(created.randoxBookingOrderId).toBeTypeOf('number');
  });

  it('refuses to book without the Nexus order number', async () => {
    const location = await crumlin();
    const [slot] = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    const hold = await booking.holdAvailabilityBooking(location.id, slot.slotReference, slot.startUtc);
    await expect(
      booking.createRandoxBooking({
        holdReference: hold.holdReference,
        bookingId: hold.bookingId!,
        appointmentId: hold.appointmentId!,
        serviceLocationId: location.id,
        slotReference: slot.slotReference,
        startUtc: slot.startUtc,
        gpExternalNumber: '',
        patient: FIXTURE_BOOKING_PATIENT,
      }),
    ).rejects.toThrow(/GPExternalNumber/);
  });

  it('treats a lapsed 30-minute hold as a closed window, not a fault', async () => {
    booking.expireHoldsImmediately = true;
    await expect(bookFirstSlot()).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  it('a slot taken between availability and hold is a closed window', async () => {
    booking.nextHoldSlotTaken = true;
    const location = await crumlin();
    const [slot] = await booking.availabilityDetails(location.id, '2026-09-01', '2026-09-01');
    await expect(
      booking.holdAvailabilityBooking(location.id, slot.slotReference, slot.startUtc),
    ).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  it('will not reuse a hold that has already been converted to a booking', async () => {
    const { location, slot, hold } = await bookFirstSlot();
    await expect(
      booking.createRandoxBooking({
        holdReference: hold.holdReference,
        bookingId: hold.bookingId!,
        appointmentId: hold.appointmentId!,
        serviceLocationId: location.id,
        slotReference: slot.slotReference,
        startUtc: slot.startUtc,
        gpExternalNumber: ORDER_NUMBER,
        patient: FIXTURE_BOOKING_PATIENT,
      }),
    ).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  it('cancels by Randox’s own booking-order id', async () => {
    const { created } = await bookFirstSlot();
    await expect(booking.cancelRandoxBooking(created.randoxBookingOrderId!, ORDER_NUMBER)).resolves.toBeUndefined();
  });

  it('treats cancelling an unknown booking as a closed window', async () => {
    await expect(booking.cancelRandoxBooking(999999, ORDER_NUMBER)).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });

  it('refuses to reschedule, because there is no such endpoint', async () => {
    // The mock refuses exactly as the live client does. A mock that quietly
    // supported an endpoint Randox do not document would make the absence
    // invisible until production. See ClinicBookingClient.rescheduleAppointment.
    await expect(booking.rescheduleAppointment()).rejects.toBeInstanceOf(RandoxUnsupportedOperationError);
  });
});
