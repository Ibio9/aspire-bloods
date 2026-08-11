# Data Protection Impact Assessment — Aspire Bloods patient portal

> ## This is a preparation, not a DPIA.
>
> **The DPIA is Aspire Clinic's document. This is groundwork for it.**
>
> Everything below marked **ANSWERED FROM THE CODEBASE** is a factual description of what the software does, checked against the source in August 2026 and citable to a file. Everything marked **⚠ FOR THE PRACTICE** is left deliberately empty, because it is a decision or a fact that only Aspire Clinic holds — a lawful basis, a retention period, a named DPO, the terms of a contract with a laboratory. A technical document that filled those in would be inventing policy, and a DPIA that a supplier wrote and the practice signed is not a DPIA the practice can defend.
>
> Nobody here has signed this, and it is not legal advice. It needs a Data Protection Officer to complete, a data controller to own, and — given that it processes special category health data at scale — very likely a legal review before go-live.
>
> Under UK GDPR Art. 35 a DPIA is **required** here rather than advisable: this is large-scale processing of special category (health) data. Art. 35(3)(b) is the relevant limb.

**Version:** draft 1, August 2026. **Prepared by:** engineering, from the codebase. **Owner:** ⚠ FOR THE PRACTICE.

---

## 1. Describe the processing

### 1.1 What the system is — ANSWERED FROM THE CODEBASE

A patient portal for blood test results. A patient registers, verifies their email, and signs in with mandatory two-factor authentication. Clinical staff upload or receive laboratory reports, verify the extracted values against the paper, a clinician reviews and releases them, and only then does the patient see them.

It is **results only**. The appointment booking flow is built and switched off (`VITE_BOOKING_ENABLED`, unset); appointments are taken on the clinic's main website. See [DEPLOYMENT.md](../DEPLOYMENT.md) → Feature flags.

### 1.2 Nature, scope, context and purposes

| Question | Answer |
|---|---|
| **What data** | See [PRIVACY.md §1](../PRIVACY.md#1-what-personal-data-this-system-holds). Identity and contact details, special category health data (blood results), health-adjacent data (GP, medication, allergies), authentication material, consent records, an audit trail, laboratory order records, and the original laboratory PDFs. **ANSWERED FROM THE CODEBASE** |
| **How it is collected** | Directly from the patient at registration and in Account & privacy; from Randox Health as laboratory results (by API or by an uploaded PDF); from clinical staff during verification. **ANSWERED FROM THE CODEBASE** |
| **How many people** | ⚠ FOR THE PRACTICE — the expected patient population, and whether that is "large scale" for Art. 35 purposes. (It is special category data either way, which is the limb that already triggers the requirement.) |
| **How long it is kept** | Configurable per category (`RetentionPolicy`), seeded at 8 years for clinical reports, audit log and consent records. **That figure is a placeholder taken from common NHS guidance, not a determination.** ⚠ FOR THE PRACTICE |
| **Purposes** | Providing patients with their own test results; enabling clinical review before release; escalating an out-of-range result to a clinician. **ANSWERED FROM THE CODEBASE** |
| **Relationship with the individuals** | Patients of the practice. ⚠ FOR THE PRACTICE — whether any are children, and whether any are processed under a relationship other than direct patient care |
| **Prior consultation** | ⚠ FOR THE PRACTICE — whether patients or a representative group have been consulted on the design, as Art. 35(9) expects where appropriate |

### 1.3 Data flows — ANSWERED FROM THE CODEBASE

```
                    ┌──────────────────────────┐
  Patient ─────────▶│  Web app (Vercel, static)│
   (browser)        └────────────┬─────────────┘
                                 │ HTTPS, httpOnly session cookies
                                 ▼
                    ┌──────────────────────────┐
  Clinical staff ──▶│  API (Railway)           │──▶ Postgres (Railway, managed)
   (browser)        │                          │──▶ Railway Volume — original PDFs
                    └──┬────────┬────────┬─────┘
                       │        │        │
                       │        │        └──▶ Resend      — OTP codes, invites,
                       │        │                            escalation emails
                       │        │        └──▶ Twilio      — SMS, OFF by default
                       │        │
                       │        └───────────▶ Anthropic   — raw report TEXT, for
                       │                                     assisted extraction
                       │
                       └────────────────────▶ Randox      — orders out (name, DOB,
                                                             sex), results in
                                 │
                                 ▼
                    Nightly pg_dump ──────────▶ Cloudflare R2 (or S3) — 35-day retention
```

Three flows in that picture are the ones a reader is most likely to miss, so they are named explicitly:

1. **A PDF upload is not a local operation.** When `ANTHROPIC_API_KEY` is set, the raw text of an uploaded laboratory report — up to 150,000 characters, unredacted, including whatever identity the laboratory printed on it — is sent to Anthropic's API for extraction. Nothing about the upload screen says so. Without the key, a regex extractor runs instead and nothing leaves the server. `modules/result-sources/llmExtraction.ts`.
2. **Identity goes OUT to Randox, not just results in.** Placing an order sends the patient's first name, last name, date of birth and biological sex. `modules/randox/orderService.ts`.
3. **The nightly backup is a full database dump** to off-platform object storage, retained 35 days. Fields encrypted at the application layer stay encrypted inside it; everything else does not.

---

## 2. Consultation

⚠ **FOR THE PRACTICE.** Who has been asked, and what they said. At minimum: the DPO, the clinical lead, and — where the processing is high-risk, which this is — consideration of whether to seek the views of patients under Art. 35(9).

---

## 3. Necessity and proportionality

| Question | Status |
|---|---|
| **Lawful basis, Art. 6** | ⚠ FOR THE PRACTICE. The codebase and [PRIVACY.md §2](../PRIVACY.md#2-lawful-basis) currently assume Art. 6(1)(b), performance of a contract. That is an assumption made by engineering and needs the practice's determination. |
| **Special category condition, Art. 9** | ⚠ FOR THE PRACTICE. Assumed to be Art. 9(2)(h), health care provision under the responsibility of a health professional — which carries its own conditions, including the professional secrecy obligation. Needs confirming, along with the DPA 2018 Sch. 1 condition relied on. |
| **Is consent doing work it cannot do?** | Consent IS captured, granularly, versioned and withdrawable (`ConsentVersion` / `ConsentRecord`). ⚠ FOR THE PRACTICE to confirm it is recorded as an additional transparency measure rather than as the Art. 9 condition — if clinical processing is presented as consent-based, withdrawing it would have to stop the processing, and it does not (and arguably should not). **This is the single most likely place for the paperwork to contradict the software.** |
| **Data minimisation** | Partly answered. Prices are stripped from Randox responses at the transport boundary; SMS escalations carry no name, marker or value; the ingestion diagnostics table records analyte names with no patient identifier. **⚠ Not minimised:** the full report text sent to Anthropic is not redacted first. That is a live decision, not an oversight — redacting a document before extracting from it risks removing the very lines the extraction needs. |
| **Accuracy** | Nothing auto-publishes. Extracted values are always confirmed by an admin against the paper; a result whose analyte cannot be resolved holds the whole report rather than being guessed at; release is an explicit act by a named clinician. **ANSWERED FROM THE CODEBASE** |
| **Individual rights** | Access: self-service export (profile, results, consent history, audit entries, original PDFs, as a zip). Erasure: request in-portal → admin schedules → background job anonymises identifying PII and disables the account, retaining de-identified clinical rows. Rectification, objection, portability: ⚠ FOR THE PRACTICE to state the process, including who a patient contacts and how quickly. |
| **International transfers** | ⚠ FOR THE PRACTICE. Where Railway, Vercel, Resend, Anthropic, Cloudflare and Randox each process and store, and what transfer mechanism covers each. None of that is determinable from the code. |
| **Processor contracts** | ⚠ FOR THE PRACTICE. An Art. 28 agreement is needed with every sub-processor in [PRIVACY.md §7](../PRIVACY.md#7-sub-processors). The Randox DPA is the one most likely to already exist in some form and least likely to cover the API integration specifically. |

---

## 4. Risks

Scored **before** mitigation. Likelihood and severity are engineering's view of the technical risk and are a starting point for the practice's own assessment, not a substitute for it.

| # | Risk | Likelihood | Severity | Mitigation in place | Residual |
|---|---|---|---|---|---|
| 1 | **Results shown to the wrong patient.** The worst failure this system has. | Low | Severe | Nothing is linked automatically. A name is never sufficient — date of birth must agree, and if the laboratory supplied none the link is refused outright. The admin restates the DOB they matched on and the server checks it. Linking and unlinking are both audited with *what agreed* on the entry. Unlinking voids the report immediately, including after release. | ⚠ FOR THE PRACTICE |
| 2 | **Unauthorised access to an account.** | Medium | Severe | Argon2id passwords; mandatory 2FA on every login; rate limiting backed by Postgres (survives restarts); no user enumeration; short access tokens with rotating single-use refresh tokens; 90/15-minute idle timeouts. | ⚠ |
| 3 | **Staff browsing records they have no reason to see.** | Medium | High | **Every admin view of patient data is audited**, not only every edit — `PATIENT_DATA_VIEWED` names the staff member, the patient and the time. Roles are separated and enforced server-side. ⚠ The control is detective, not preventive: nothing stops the view, and it only works if somebody reads the log. **Who reviews it, and how often, is FOR THE PRACTICE.** | ⚠ |
| 4 | **Report text disclosed to a third-party model provider.** | Certain, by design, when the key is set | Medium | Not persisted by the extraction path; output always verified by an admin. The processing is real and unredacted, so the mitigation is contractual and transparency-based rather than technical. ⚠ Needs an Art. 28 agreement, a transfer mechanism, and a line in the privacy notice — or the key left unset, which falls back to the regex extractor. | ⚠ |
| 5 | **A patient misreads a result and acts on it.** | Medium | High | Non-diagnostic vocabulary throughout, enforced by a fixed table and swept on every seed; status is never carried by colour alone; the out-of-range card points calmly at the GP with contact details inline; a site-wide disclaimer on every page, editable by clinical staff without a deploy. | ⚠ |
| 6 | **A reference range suggested at verify time is wrong for this patient.** | Medium | Medium | Every range a patient SEES comes off their own result, never from the catalogue. The catalogue only pre-fills a suggestion for an admin who is holding the paper. Since August 2026 each suggestion carries a provenance tier on screen (from Randox / published third party / unverified) so an unverified band no longer looks identical to a sourced one, and the resolver refuses to answer at all where a marker splits by sex and the patient's sex is unknown. **⚠ Twenty analytes are sex-dependent; ten now carry sourced sex-specific bands and ten do not.** See `docs/audits/reference-ranges.md`. | ⚠ |
| 7 | **Patient-facing explanatory copy is clinically wrong.** | Medium | High | It is explanatory, never diagnostic, and it says nothing about the reader's own result. **⚠ None of the 442 explanations has been read by a clinician.** The product now reports that honestly — an earlier seed marked 72 of them approved under fixture accounts, and the seed retracts every one with an audit entry. **A clinical review is outstanding and is FOR THE PRACTICE.** | ⚠ |
| 8 | **Loss of data.** | Low | High | Managed Postgres plus a nightly off-platform `pg_dump` to separate infrastructure, deliberately not the same provider — a provider-only backup does not help if the incident is the provider. The backup script fails loudly rather than silently skipping. | ⚠ |
| 9 | **Data persisting after an erasure.** | Certain, for a bounded window | Medium | Erasure anonymises identifying PII and disables the account; clinical rows are retained de-identified under the clinical-records exception. **⚠ Backups are retained 35 days and are not selectively editable, so an erasure is not reflected in backups taken before it until they age out.** The practice must be able to say this when answering a request. | ⚠ |
| 10 | **A result outside its range is released and nobody acts on it.** | Low | High | An escalation email fires on release for any out-of-range result, to `ESCALATION_EMAIL`, carrying the patient's name and the flagged marker names but no values. Production refuses to boot without a routable address. ⚠ The check cannot tell whether the mailbox is read; **who monitors it is FOR THE PRACTICE.** | ⚠ |

---

## 5. Measures to reduce risk

⚠ **FOR THE PRACTICE.** The technical measures are described in [SECURITY.md](../SECURITY.md) and summarised above. What belongs here is the organisational half: staff training, access review cadence, who reads the audit log and how often, the incident response plan with names against it, and the review date for this document.

---

## 6. Sign-off

| | Name | Date | Notes |
|---|---|---|---|
| Measures approved by | ⚠ | | |
| Residual risks approved by | ⚠ | | |
| DPO advice provided | ⚠ | | Art. 35(2) requires the DPO's advice to be sought and recorded |
| DPO advice accepted or overruled | ⚠ | | If overruled, the reasons must be recorded |
| Consultation responses reviewed by | ⚠ | | |
| This DPIA will be kept under review by | ⚠ | | |

**If any residual risk remains high after mitigation, Art. 36 requires consultation with the ICO before the processing begins.**

---

## Appendix — the shortest list of what is actually outstanding

Everything above in one place, for whoever has to chase it.

1. Lawful basis and Art. 9 condition, determined and written down — and check that consent is not being asked to do work it cannot do.
2. Retention periods confirmed against the practice's own policy; the 8-year default is a placeholder.
3. A named DPO, and their recorded advice.
4. Art. 28 processor agreements: Randox, Anthropic, Resend, Twilio, Railway, Vercel, Cloudflare. International transfer mechanism for each.
5. A decision on the Anthropic extraction path: keep it and cover it contractually and in the privacy notice, or unset the key and accept the weaker regex extractor.
6. Who reads the audit log, and how often.
7. Who monitors `ESCALATION_EMAIL`.
8. A clinical review of the 442 marker explanations.
9. The Randox Pathology Services Catalogue and a female HSC5 example report, which is what closes the remaining sex-specific reference range gap.
10. An incident response plan with names against the steps in [PRIVACY.md §8](../PRIVACY.md#8-breach-procedure-starting-point).
