-- The Clinic Booking identifiers the Postman collection says these calls take.
--
-- CancelRandoxBooking takes ONE field and it is `RandoxBookingOrderId`, a
-- Randox-side integer (32285 in their example) — not the string reference this
-- code had been inventing, and not GPExternalNumber. So the id has to be
-- captured from CreateRandoxBooking and stored, or an appointment can be made
-- and never cancelled. Same reasoning as the three order identifiers on
-- RandoxOrder: a distinct identifier gets a distinct column, because the
-- alternative is one column that means different things on different rows.
--
-- serviceId is stored beside it because the service (787 UK / 788 ROI) is part
-- of the appointment's identity on their side, and a deployment that ever
-- serves both regions must not have to infer which one a booking was made
-- under from a config value that has since changed.
ALTER TABLE "RandoxAppointment" ADD COLUMN "randoxBookingOrderId" INTEGER;
ALTER TABLE "RandoxAppointment" ADD COLUMN "serviceId" INTEGER;

-- The BookingId/AppointmentId pair CreateRandoxBooking sends. They come back
-- from the hold and are consumed by the create, so they live only as long as
-- the hold does — nullable, and cleared with it.
ALTER TABLE "RandoxAppointment" ADD COLUMN "holdBookingId" INTEGER;
ALTER TABLE "RandoxAppointment" ADD COLUMN "holdAppointmentId" INTEGER;

-- The slot's own id, which every call after availability references. It was
-- never stored: the hold sent it and nothing kept it, so a create could only
-- be built from a hold made in the same request.
ALTER TABLE "RandoxAppointment" ADD COLUMN "slotReference" TEXT;
