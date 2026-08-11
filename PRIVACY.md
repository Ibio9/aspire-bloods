# Aspire Bloods — Privacy Documentation

**Status: working document.** This describes the data protection design of the Aspire Bloods patient portal as built, and is a starting point for the practice's Data Protection Impact Assessment — see [docs/DPIA.md](docs/DPIA.md), which is the DPIA skeleton this feeds. It is not a substitute for legal advice and not itself a completed DPIA, and should be reviewed by Aspire Clinic's Data Protection Officer before go-live.

Sections marked **⚠ GAP** describe something the product does that only the practice can decide the position on. They are deliberately not answered here; inventing a policy in a technical document is how a practice ends up with two of them.

**Last checked against the codebase: August 2026.**

## 1. What personal data this system holds

| Category | Examples | Where it lives |
|---|---|---|
| Identity & contact | Name, title, DOB, address, postcode, phone, email | `PatientProfile` (most fields encrypted at rest, see §3) |
| Special category health data | Blood test results, reference ranges, marker status | `Report`, `ReportResult` (values encrypted at rest) |
| Health-adjacent | GP name/address, current medication, allergies, emergency contact | `PatientProfile` (encrypted) |
| Account & auth | Password hash, 2FA method, session tokens | `User`, `RefreshToken`, `OtpCode`, `TrustedDevice` |
| Consent | Granted/withdrawn status, timestamp, IP, consent text version | `ConsentRecord`, `ConsentVersion` |
| Activity | Logins, **every admin view of patient data**, uploads, releases, exports, admin actions | `AuditLogEntry` (insert-only) |
| Source documents | Original Randox PDF reports, generated Aspire summary PDFs | `StoredFile` (Railway Volume, signed-URL access only) |
| **Laboratory orders** | The identity submitted to Randox with an order: first name, last name, date of birth, biological sex, plus the three Randox order identifiers | `RandoxOrder` (the ordered DOB is encrypted; the ordered name is stored in clear so a later delivery can be matched against what was actually sent) |
| **Erasure & escalation** | Erasure requests and their lifecycle; the fact that a released report was escalated, its severity and which markers were flagged | `ErasureRequest`, `EscalationEvent` |
| **Ingestion diagnostics** | Every analyte STRING a Randox delivery contained and whether it resolved to a marker | `RandoxAnalyteObservation` — analyte names and counts, **no patient identifier and no values** |

## 2. Lawful basis

- **Special category health data** (UK GDPR Art. 9(2)(h)): processing for the provision of health care, under Aspire Clinic's responsibility as a healthcare provider.
- **Personal data generally** (Art. 6(1)(b)): performance of a contract — providing the patient with their test results.
- **Explicit consent** is additionally captured and recorded at account activation for: data processing, results storage, and each communication channel (email, SMS) — see `ConsentVersion`/`ConsentRecord`. Consent is granular per purpose, versioned (so a change in wording produces a new version rather than overwriting history), and withdrawable at any time from Account & Privacy in the portal. Withdrawing a communications consent stops that channel; it does not, by itself, trigger deletion of clinical records (see §5).

## 3. Encryption & access control

- **At rest**: identifying and health-adjacent fields (DOB, contact number, address, GP details, medication, allergies, emergency contact, marker result values) are encrypted at the application layer with AES-256-GCM before being written to Postgres (`lib/crypto.ts`). The encryption key (`ENCRYPTION_KEY`) is a deployment secret, never committed, and distinct from the key used to hash tokens/OTPs.
- **In transit**: TLS is required in production (enforced by the hosting platform / reverse proxy); cookies are marked `Secure` outside development.
- **Passwords**: Argon2id, industry-standard memory-hard hashing — never reversible, never logged.
- **Files**: original lab PDFs and generated summaries are stored outside any public path and are only ever served via short-expiry, HMAC-signed download tokens (`lib/signedUrl.ts`) — there is no public bucket or directory listing.
- **No PII in logs**: application logging avoids printing decrypted health/identity fields; errors are logged with generic messages to clients and full detail server-side only.

## 4. Access model

- Patients can only ever see their **own** `RELEASED` reports — never a report mid-pipeline, never another patient's data. Enforced server-side on every request (not just hidden in the UI).
- Staff roles are separated: `ADMIN` (upload, parse, verify, patient/panel administration) and `CLINICIAN` (clinical review, release, sign-off). Neither role can act outside its own permitted transitions in the report state machine.
- **Every admin view of patient data is audited, not just every edit.** Opening a patient's record, their report list, a single report, the linking queue or a DSAR export writes a `PATIENT_DATA_VIEWED` entry naming the staff member, the patient and the time (`modules/admin/router.ts`, `modules/patients/router.ts`, `modules/reports/router.ts`). This is the control that answers "who looked at my results", which is a question an edit log cannot answer. One deliberate exception is documented in the code: listing the unmatched-result QUEUE does not write one per patient, because at that point no patient is identified.
- Every upload, edit, release, export, login, failed login, consent change, and admin action is likewise written to the immutable `AuditLogEntry` table (actor, action, target, IP, timestamp). Audit rows are never updated or deleted by application code.
- **Sessions time out on inactivity**: 90 minutes for a patient, 15 for staff (`packages/shared/src/session.ts`). Staff is deliberately much shorter — a clinic workstation is a shared physical space and a patient's own device is not. Both are separate from the access-token lifetime (15 minutes) and the refresh-token lifetime (30 days), which are security primitives rather than a screen-lock policy.

## 5. Retention & erasure

- Retention periods are configurable per data category (`RetentionPolicy` table), reviewed automatically by a scheduled job that flags data past its retention window for human review (`jobs/retentionReview.ts`) — **it does not auto-delete clinical records**; the practice's DPO must sign off on any clinical-record deletion given the legal retention obligations on health records.
- **Right to erasure**: a patient can request erasure from Account & Privacy. This creates an `ErasureRequest`; once an admin schedules it, a background job (`jobs/erasurePurge.ts`) anonymises the patient's identifying PII (name, DOB, contact, address, GP details, medication, allergies, emergency contact) and disables the account. **Clinical `Report`/`ReportResult` rows are retained**, de-identified from directly-searchable PII, in line with the documented clinical-records retention exception — full deletion of clinical records is not automated and requires separate DPO-approved action once the retention period has genuinely lapsed.
- Seed default retention period: 8 years for clinical reports, audit log, and consent records (a common NHS-guidance starting point) — **this must be confirmed against Aspire Clinic's actual policy before go-live**, it is a placeholder, not a legal determination.
- **⚠ GAP — backups outlive erasure by up to 35 days.** The nightly off-platform `pg_dump` (§7) is retained for 35 days and is not selectively editable: an erasure carried out today remains present in every backup taken before it until those backups age out. This is normal and is not a defect, but it is a fact the practice has to be able to state when answering an erasure request, and the 35 days is a number somebody should confirm they are content with.

## 6. Data Subject Access Requests (DSAR)

Patients can self-serve a full export (Account & Privacy → "Download my data") containing their profile, all report results, consent history, and relevant audit log entries, plus copies of their original lab PDFs, bundled as a zip — no staff intervention required for the common case.

## 7. Sub-processors

| Sub-processor | Purpose | Data shared |
|---|---|---|
| **Randox Health** | Laboratory testing partner, and — where `RANDOX_ENABLED` is on — a live API integration. Orders are **sent** to Randox carrying the patient's first name, last name, date of birth and biological sex; results are **received** carrying analyte names, values, units and reference ranges | Patient identity as above, sample/order identifiers, results (the source of the health data itself) |
| **Anthropic** | **Assistive extraction of uploaded laboratory PDFs.** Active whenever `ANTHROPIC_API_KEY` is set (`modules/result-sources/llmExtraction.ts`); the regex extractor runs instead when it is not | **The raw text of the laboratory report, up to 150,000 characters — which is the whole document, including whatever patient identity the laboratory printed on it.** Nothing is redacted before the call. Extracted values are shown to an admin for verification and are never saved without it |
| **Resend** | Transactional email (OTP codes, invites, escalation notices) | Recipient email address, message content. An escalation email carries the patient's name and the names of the flagged markers, and never a value — see [DEPLOYMENT.md](DEPLOYMENT.md) |
| **Twilio** | SMS (2FA codes, escalation "review required" pings) — **disabled by default**, only active once the practice enables `SMS_ENABLED` | Recipient phone number, OTP code, or a generic review-required message (never a patient name, never a marker name, never a value) |
| **Railway** | Application hosting, managed Postgres, and the Volume that stores uploaded PDFs | All of the above, at rest and in transit |
| **Vercel** | Static hosting for the patient-facing web app | No patient data is stored there — the app is a static bundle that talks to the API on another origin. Vercel sees request metadata (IP, user agent) for page loads |
| **Cloudflare R2** (or another S3-compatible target) | Nightly off-platform database backup, 35-day retention | **A full `pg_dump` of the database**, which is every category in §1. Encrypted-at-rest fields stay encrypted inside the dump; everything else does not |

**⚠ GAP — the Randox data processing agreement.** The technical integration is built and documented; whether a DPA is in place, what it covers, and where Randox process and store the data are questions for the practice. Same for Anthropic, whose involvement is the one most likely to be missed because it is not obvious from the outside that uploading a PDF sends its text to a third party.

This list should be reflected in Aspire Clinic's Records of Processing Activities (ROPA) and any patient-facing privacy notice.

## 7a. What this portal deliberately does NOT do

Worth stating because the code for some of it is present and a reader might otherwise assume it is live.

- **No appointment booking.** The patient-facing booking flow is complete and is switched off behind one build-time flag (`VITE_BOOKING_ENABLED`, unset). Appointments are taken on the clinic's main website; this portal is results only. With the flag off, none of the booking code reaches the production bundle at all, so no availability lookup, no held slot and no appointment record is created from here. See [DEPLOYMENT.md](DEPLOYMENT.md) → Feature flags.
- **No automatic linking of results to patients.** A result whose owner cannot be resolved is parked in a queue for a human. See [SECURITY.md](SECURITY.md) → Result linking.
- **No automatic publication.** Release is an explicit state change made by a named clinician.
- **No profiling, no automated decision-making** in the Art. 22 sense. Marker status is arithmetic against a reference range; it produces no decision about the person and no clinical conclusion.

## 8. Breach procedure (starting point)

1. **Contain**: revoke affected sessions/tokens, rotate secrets if credential compromise is suspected, take the affected component offline if containment requires it.
2. **Assess**: determine what data was involved (special category health data raises the severity), how many patients, and whether the breach is likely to result in risk to individuals.
3. **Notify**: the ICO must be notified within 72 hours of the practice becoming aware, where notification is required. Affected individuals must be notified without undue delay where the breach is likely to result in high risk to them.
4. **Record**: every breach (notifiable or not) must be logged internally with cause, effect, and remedial action, per UK GDPR accountability requirements.
5. **Review**: the `AuditLogEntry` table is the primary forensic source for reconstructing who accessed what and when.

This is a skeleton procedure — the practice should adopt a full incident response plan naming specific responsible individuals, contact routes, and escalation thresholds.

## 9. Site-wide disclaimer

Every page footer carries: *"The information in this portal is provided for your information and does not constitute a diagnosis or medical advice. If you have concerns about your results, please contact your GP or the Aspire clinical team. In a medical emergency, call 999 or NHS 111."* — sourced from the editable `CopyBlock` table (`footer_disclaimer`), not hardcoded, so clinical staff can revise the wording without a deploy.
