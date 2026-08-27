# Aspire Bloods — Go-Live Compliance Tracker

One place for every outstanding compliance item before the portal accepts live
patient data. Consolidated from docs/DPIA.md, PRIVACY.md, and the engineering
compliance notes. Each item names who has to act, what "done" looks like, and
whether it hard-blocks go-live.

This tracker does not replace legal advice. The portal processes UK GDPR
Article 9 special-category health data, the highest-risk tier. The lawful-basis
determination and the DPIA sign-off must be owned by someone with data-protection
responsibility for the practice.

Status key: NOT STARTED / IN PROGRESS / DONE / DECISION NEEDED FIRST
Owner: Practice = Raheel/Richard/DPO, Clinical = Richard, Eng = Ibrahim.

## Hard blockers — go-live should not happen until these are done

1. Lawful basis + Art. 9 condition confirmed in writing. Check consent is not
   asked to carry weight it cannot. Owner: Practice/DPO. BLOCKS. Status: DECISION NEEDED.
2. DPIA signed off (docs/DPIA.md section 6 is blank). Owner: Practice+DPO. BLOCKS. Status: NOT STARTED.
3. Art. 28 DPA — Randox, incl. transfer mechanism. Owner: Practice. BLOCKS. Status: NOT STARTED.
4. Art. 28 DPA — Railway, region confirmed UK/EEA. Owner: Practice. BLOCKS. Status: NOT STARTED.
5. Decision on the Anthropic PDF-extraction path (unredacted PDF text leaves to Anthropic
   when key is set). Keep with DPA+transfer+notice, or unset key. Owner: Practice. BLOCKS. Status: DECISION NEEDED. Until decided, leave key UNSET in prod.
6. Clinical review of the 442 marker explanations. Owner: Clinical (Richard). BLOCKS. Status: NOT STARTED.
7. Named DPO + recorded advice. Owner: Practice. BLOCKS. Status: NOT STARTED.

## Region / transfer confirmations — quick dashboard checks, real transfer questions

11. Railway region confirmed UK/EEA (Amsterdam adequate; US/Singapore need IDTA+TRA). Owner: Eng confirm, Practice accept. BLOCKS. Status: NOT STARTED.
12. Cloudflare R2 backup bucket jurisdiction (nightly full pg_dump lands here; most likely quiet failure point). Owner: Eng confirm, Practice accept. BLOCKS. Status: NOT STARTED.
13. Resend sending region noted in ROPA. Owner: Eng. Recommended. Status: NOT STARTED.
14. Vercel: note no patient data at rest, metadata only. Owner: Eng. Low. Status: NOT STARTED.

## Processor agreements — rest of the sub-processor list

21. Art. 28 DPA — Anthropic (only if item 5 keeps the key). Owner: Practice. Status: DECISION NEEDED.
22. Art. 28 DPA — Resend. Owner: Practice. Recommended. Status: NOT STARTED.
23. Art. 28 DPA — Twilio (only if SMS_ENABLED; off by default). Owner: Practice. Status: N/A while disabled.
24. Art. 28 DPA — Vercel. Owner: Practice. Recommended. Status: NOT STARTED.
25. Art. 28 DPA — Cloudflare (holds full dumps). Owner: Practice. BLOCKS. Status: NOT STARTED.

## ROPA and organisational measures

31. ROPA (Art. 30) built from the PRIVACY.md sub-processor table. Owner: Practice. Recommended. Status: NOT STARTED.
32. Retention periods confirmed (8-year default is a placeholder). Owner: Practice/DPO. BLOCKS. Status: NOT STARTED.
33. Who reads the audit log, and how often (detective control). Owner: Practice. Recommended. Status: NOT STARTED.
34. Who monitors ESCALATION_EMAIL (currently raheelmalik@me.com — confirm monitored). Owner: Practice. BLOCKS. Status: DECISION NEEDED.
35. Incident-response plan with names (PRIVACY.md section 8 has none). Owner: Practice. Recommended. Status: NOT STARTED.
36. Privacy notice published, reflecting sub-processors, Anthropic path, and 35-day backup-outlives-erasure window. Owner: Practice. BLOCKS. Status: NOT STARTED.

## Reference-range clinical gap

41. Sex-specific reference ranges: 20 sex-dependent analytes, 10 sourced, 10 not.
    Resolver already refuses where sex unknown, so nothing wrong is shown. Closed by
    Randox Pathology Services Catalogue + female HSC5 report. Owner: Clinical+Eng. Partial. Status: IN PROGRESS.

## Done, for the record (do not re-chase)

- Void/caveat codes loaded; codes-in-result-field detected (confirmed vs live payload Aug 2026).
- Results endpoints proven vs real Randox data; FBC panel maps cleanly.
- AES-256-GCM at rest, Argon2id passwords, mandatory 2FA, server-side access control, session timeouts.
- Every admin view of patient data audited, not just edits.
- Nothing auto-links; DOB must agree or link refused; unlink voids the report.
- No hard deletes; erasure anonymises and disables, clinical rows retained de-identified.
- Nightly off-platform encrypted pg_dump, fails loudly.
- Non-diagnostic vocabulary enforced and swept each seed; status never colour-alone; site-wide disclaimer.
- Booking boot guard separated behind RANDOX_BOOKING_ENABLED.
