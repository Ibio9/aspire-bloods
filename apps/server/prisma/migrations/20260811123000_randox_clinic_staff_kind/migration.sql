-- Clinic/GetClinicStaff is the eighth GET endpoint in the Nexus spec. It is
-- synced with the other seven so the reference-data job covers everything the
-- spec publishes; nothing on the order path depends on it.
ALTER TYPE "RandoxCatalogueKind" ADD VALUE IF NOT EXISTS 'CLINIC_STAFF';
