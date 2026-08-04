# Aspire Bloods — Privacy Documentation

**Status: working document.** This describes the data protection design of the Aspire Bloods patient portal as built, and is intended as a starting point for the practice's Data Protection Impact Assessment (DPIA) — it is not itself a substitute for legal advice or a completed DPIA, and should be reviewed by Aspire Clinic's Data Protection Officer before go-live.

## 1. What personal data this system holds

| Category | Examples | Where it lives |
|---|---|---|
| Identity & contact | Name, title, DOB, address, postcode, phone, email | `PatientProfile` (most fields encrypted at rest, see §3) |
| Special category health data | Blood test results, reference ranges, marker status | `Report`, `ReportResult` (values encrypted at rest) |
| Health-adjacent | GP name/address, current medication, allergies, emergency contact | `PatientProfile` (encrypted) |
| Account & auth | Password hash, 2FA method, session tokens | `User`, `RefreshToken`, `OtpCode`, `TrustedDevice` |
| Consent | Granted/withdrawn status, timestamp, IP, consent text version | `ConsentRecord`, `ConsentVersion` |
| Activity | Logins, views, uploads, releases, exports, admin actions | `AuditLogEntry` (insert-only) |
| Source documents | Original Randox PDF reports, generated Aspire summary PDFs | `StoredFile` (local disk, signed-URL access only) |

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
- Every view, upload, edit, release, export, login, failed login, consent change, and admin action is written to the immutable `AuditLogEntry` table (actor, action, target, IP, timestamp). Audit rows are never updated or deleted by application code.

## 5. Retention & erasure

- Retention periods are configurable per data category (`RetentionPolicy` table), reviewed automatically by a scheduled job that flags data past its retention window for human review (`jobs/retentionReview.ts`) — **it does not auto-delete clinical records**; the practice's DPO must sign off on any clinical-record deletion given the legal retention obligations on health records.
- **Right to erasure**: a patient can request erasure from Account & Privacy. This creates an `ErasureRequest`; once an admin schedules it, a background job (`jobs/erasurePurge.ts`) anonymises the patient's identifying PII (name, DOB, contact, address, GP details, medication, allergies, emergency contact) and disables the account. **Clinical `Report`/`ReportResult` rows are retained**, de-identified from directly-searchable PII, in line with the documented clinical-records retention exception — full deletion of clinical records is not automated and requires separate DPO-approved action once the retention period has genuinely lapsed.
- Seed default retention period: 8 years for clinical reports, audit log, and consent records (a common NHS-guidance starting point) — **this must be confirmed against Aspire Clinic's actual policy before go-live**, it is a placeholder, not a legal determination.

## 6. Data Subject Access Requests (DSAR)

Patients can self-serve a full export (Account & Privacy → "Download my data") containing their profile, all report results, consent history, and relevant audit log entries, plus copies of their original lab PDFs, bundled as a zip — no staff intervention required for the common case.

## 7. Sub-processors

| Sub-processor | Purpose | Data shared |
|---|---|---|
| **Randox Health** | Laboratory testing partner | Sample/order identifiers, results (source of the health data itself) |
| **Resend** | Transactional email (OTP codes, invites, escalation notices) | Recipient email address, message content (never raw result values in escalation emails — marker names only) |
| **Twilio** | SMS (2FA codes, escalation "review required" pings) — **disabled by default**, only active once the practice enables `SMS_ENABLED` | Recipient phone number, OTP code, or a generic review-required message (never clinical values) |
| **Hosting provider (Railway)** | Application hosting, managed Postgres | All of the above, at rest and in transit |

This list should be reflected in Aspire Clinic's Records of Processing Activities (ROPA) and any patient-facing privacy notice.

## 8. Breach procedure (starting point)

1. **Contain**: revoke affected sessions/tokens, rotate secrets if credential compromise is suspected, take the affected component offline if containment requires it.
2. **Assess**: determine what data was involved (special category health data raises the severity), how many patients, and whether the breach is likely to result in risk to individuals.
3. **Notify**: the ICO must be notified within 72 hours of the practice becoming aware, where notification is required. Affected individuals must be notified without undue delay where the breach is likely to result in high risk to them.
4. **Record**: every breach (notifiable or not) must be logged internally with cause, effect, and remedial action, per UK GDPR accountability requirements.
5. **Review**: the `AuditLogEntry` table is the primary forensic source for reconstructing who accessed what and when.

This is a skeleton procedure — the practice should adopt a full incident response plan naming specific responsible individuals, contact routes, and escalation thresholds.

## 9. Site-wide disclaimer

Every page footer carries: *"The information in this portal is provided for your information and does not constitute a diagnosis or medical advice. If you have concerns about your results, please contact your GP or the Aspire clinical team. In a medical emergency, call 999 or NHS 111."* — sourced from the editable `CopyBlock` table (`footer_disclaimer`), not hardcoded, so clinical staff can revise the wording without a deploy.
