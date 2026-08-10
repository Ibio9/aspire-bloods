/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * The clinic's public phone number, for the "call us" affordances in the
   * auth flows. Optional by design — see lib/clinicContact.ts for why there
   * is no hard-coded fallback.
   */
  readonly VITE_CLINIC_PHONE?: string;
  /**
   * "true" turns the patient-facing booking flow back on. Off by default —
   * the clinic's main website takes appointments now. See lib/features.ts.
   */
  readonly VITE_BOOKING_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
