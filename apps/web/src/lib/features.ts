/**
 * Product feature flags. One constant per flag, resolved once, at build time.
 *
 * ── Booking ────────────────────────────────────────────────────────────────
 * The patient-facing booking flow is finished and stays in the tree, but the
 * clinic's main website now takes appointments, so this portal is results
 * only. `VITE_BOOKING_ENABLED=true` at build time gives it back: the sidebar
 * item, /book, /appointments, the appointment cards on Overview, the fasting
 * notice and the report → appointment provenance link. Anything else is off,
 * and every booking route redirects to Overview rather than rendering a shell
 * with nothing behind it.
 *
 * This flag governs the PORTAL UI only. The server's Randox chain — ordering,
 * GetServiceLocations, AvailabilityDetails, HoldAvailabilityBooking,
 * CreateRandoxBooking, the mock transport — is untouched by it and is what
 * whatever books on the main site will call. That side has its own switch,
 * RANDOX_ENABLED, which is a different question and unaffected.
 *
 * Vite substitutes `import.meta.env.VITE_*` literally at build time, so with
 * the variable unset this folds to `false` and Rollup drops the booking
 * screens out of the bundle entirely rather than shipping unreachable code.
 */
export const BOOKING_ENABLED: boolean = import.meta.env.VITE_BOOKING_ENABLED === 'true';
