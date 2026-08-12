# Working style
- Move fast. No preamble, no narration, no post-summaries.
- Never ask for approval mid-task. Pick the sensible option, note it at the end.
- Don't re-read files already in context.
- Batch edits — don't read/edit/read/edit the same file repeatedly.
- One brief report at the end only.

# Stack
React 18 + TS + Vite + Tailwind (apps/web) · Express + TS (apps/server) · Postgres + Prisma
Deploy: Vercel (web) + Railway (api, db)
Live: blood.aspireshield.com · api.blood.aspireshield.com

# Design
bronze #8a5e45 · espresso #423c36 · cream #e3dfd3 · taupe #c9bca9
Match the Aspire Rota sign-in for craft level. No default browser styling anywhere —
no native selects, no Chrome autofill blue, no native focus rings.
Reference theaspireclinic.com for register: dark, atmospheric, spacious, restrained.

## Typography — three roles, two superfamilies (changed Aug 2026)
**Jost and Inter are retired. Do not bring either back.**

- **Fraunces** (variable, OFL) — display. Page titles, section headings, card
  titles, the at-a-glance numbers, and the one hero value on a marker page.
  Axes are fixed as tokens, never improvised: `opsz` tracks the rendered size
  (144 hero, 72 section, 24 under 24px, as `opsz-hero` / `opsz-section` /
  `opsz-small`), `SOFT` 30, **`WONK` 0 always** — the wonky axis is where
  Fraunces gets whimsical and this is a medical results portal. `font-display`
  carries SOFT and WONK with it so a call site cannot forget them.
- **IBM Plex Sans** (variable, OFL) — body and ALL UI. Body copy, labels, nav,
  **buttons**, form fields, eyebrows. Chosen over Inter because Inter is the
  default everything reaches for and Plex has a voice.
- **IBM Plex Mono** (OFL, static cuts) — **numerics only**, via `.numeric`:
  reference ranges, values in cards and tables, chart axis labels, units, and
  dates rendered AS DATA (in a table or card metadata, never inside a prose
  sentence). Never in prose, a button or a heading.

**The one exception:** the single hero value on a marker detail page stays
Fraunces 600 at `opsz-hero`, with the mono unit beside it at a much smaller
size. Every other number in the product is mono.

**One type scale, nine steps** — 12 / 14 / 16 / 18 / 21 / 28 / 38 / 52 / 72,
in `typeScale` (packages/shared). Tailwind's `fontSize` is REPLACED, not
extended, so `text-5xl`/`text-6xl`/`text-7xl` and arbitrary `text-[13px]` do
not exist. Line height and tracking are per step, not per component. One
eyebrow tracking value everywhere (`EYEBROW_TRACKING`, 0.14em). Body copy caps
at `max-w-measure` (68ch). Tabular figures on every number without exception —
`.numeric` for mono data, `.tabular` for a number inside a sentence.

**Loading.** Self-hosted from this origin, latin only, from
`apps/web/public/assets/fonts` — see the README there for why the files are
vendored rather than `@import`ed from the fontsource packages (preload needs
stable, unhashed URLs). No Google Fonts request anywhere.

**If the whole product suddenly renders in Times and system-ui, the fonts are
not the problem — the STYLESHEET IS MISSING.** This has now cost three rounds of
hunting through the type tokens, so: `tailwind.config.ts` used to import the
tokens through `@aspire-bloods/shared`, whose package `main` points at `dist/`.
Start Vite before that package is built and jiti resolves the import to nothing,
`Object.keys(typeScale)` throws inside PostCSS, and the dev server answers EVERY
request for the stylesheet with a 500 — so the app is served with no rules at
all and every element falls back to the browser's own faces. Measured: the
marker explanation card's body copy resolved to `"Times New Roman"`.

**What made it worse than a first-run annoyance:** Tailwind loads its config
ONCE per process and caches the result, so the failure is STICKY. Building the
shared package afterwards does not clear it — the running dev server goes on
serving 500s until it is restarted, which is why the symptom kept coming back
after the "fix".

Fixed at the root (Aug 2026): `tailwind.config.ts` now imports
`../../packages/shared/src/tokens` DIRECTLY. tokens.ts has no imports of its
own, so jiti transpiles it alone and the stylesheet has no dist dependency at
all. `apps/web`'s own `dev` and `build` scripts also build shared first, so
every way of starting it works. The guard and its named message stay, for any
other way this could come back undefined.

**Punctuation is part of the type system.** Curly apostrophes everywhere
(`it’s`, not `it's`); an en dash joining two words becomes a hyphen
(`acid-base`); a numeric range KEEPS its en dash (`3.9–5.1`), which is how every
reference range in the product and the PDF is set. Source files are swept by an
AST-based pass over JSX text and string literals only — never comments, never
`markerCatalogue.ts`, whose names are matching keys rather than copy. Stored
copy is swept by `applyHouseStyle` in `src/lib/houseStyle.ts` on every seed,
which is punctuation-only and asserted word-for-word identical by
`houseStyle.test.ts`.

**The PDF keeps the three ROLES in the PDF base-14 faces** — Times for display,
Helvetica for body and UI, Courier for numerics. Do not try to embed Fraunces
or IBM Plex there again: PDFKit subsets through fontkit, and fontkit's TTF
subsetter throws on all of these faces once a document has enough distinct
glyphs (reproduced with woff and woff2, static and variable, latin subset and
full). It embeds a sample line fine and dies on a real 180-marker panel — and
the throw happens inside the stream flush, so it is an UNCAUGHT EXCEPTION that
kills the Node process rather than failing one request. The long note at the
top of modules/export/pdfSummary.ts has the detail.

**Every PDF goes through `renderPdf()` (lib/pdfRender.ts) and every download
route answers through `streamPdf`/`pdfFailure` (lib/pdfResponse.ts).** Those
close the three failure modes that are closeable — the builder throwing, the
document emitting 'error' (an unhandled 'error' on a stream exits the process),
and a document that never ends (which used to hang the request on an open
socket) — and turn each into a 500 carrying the sentence the client toasts
verbatim. They cannot catch an exception thrown inside a stream's own callback,
which is the fontkit case above and the reason that decision stands.
tests/pdfGeneration.test.ts pins all of it over real HTTP.

## Two radii, and only two
The rule governs SURFACES: `rounded-card` (1rem) for surfaces, `rounded-input`
(0.625rem) for controls, and nothing else. Tailwind's `borderRadius` is
replaced rather than extended, so `rounded-sm`, bare `rounded` and arbitrary
radii do not exist.

Two tokens sit outside that rule because they are not surface corners, and
neither is an escape hatch from it:
- `rounded-full` is a SHAPE — avatars, pills, the range-bar dot, the radio
  glyph (a radio genuinely is a circle).
- `rounded-mark` (0.25rem) is ICON GEOMETRY, for the CHECKBOX glyph and
  nothing else. An 18px square at the control radius renders as a circle,
  which is a radio button — and a control meaning "several of these" must not
  be the shape of one meaning "exactly one of these". That is correctness, not
  taste. If `rounded-mark` ever appears on a card, a panel or a button, delete
  it from there rather than widening its remit.

Shadows are espresso-derived in both themes, never neutral grey.

## Traffic-light status — wanted, everywhere (changed Aug 2026)
This overrides the old "no green, amber or red anywhere" rule. Patients expect
traffic-light coding on a blood result and the clinic asked for it. Do not revert it.

**The five states and their three hues.** Significantly below and significantly
above are RED. Below and above are YELLOW. In range is GREEN. ORANGE is the
transition between yellow and red — the gradient stop in the range bar and the
shoulder of a chart band — and is never a state a result can be in.
Five states, three hues: direction is carried by the chevron and the word, never
by colour, which is why high and low share a hue and both significants share one.

**Where it appears, and it must appear in all of them:**
1. Result cards and rows — soft background wash (`bg-tint-*`).
2. The range bar — green across the reference range, shading out through yellow
   and orange to red. **The MARK on it is NOT a status colour (Aug 2026).** It
   is the `rangemark` token: pure white in dark, espresso in light, always
   inside a ring of the opposite tone. A mark drawn in its own state's colour is
   a mark drawn in the shade of the segment it is standing on — a green dot on
   the green band, pale gold on the gold one — and the mark's job is POSITION.
   The fill inverts between themes because it was measured: white against the
   four track colours is 4.69–5.71:1 in dark and 1.73–2.72:1 in light, and the
   pale green in-range track is 2.11:1, which is a white dot that vanishes.
   Status is still carried four times over by the segment, the chevron, the
   word and the card's own wash. Applies to both bars — the card-sized pointer
   is an SVG triangle rather than a CSS border trick precisely so it can take
   the same ring.
3. Trend charts — the reference range as a soft green band, yellow immediately
   above and below, red beyond the significantly-out thresholds, orange as the
   transition. Bands sit behind the data at low weight. Points take their own
   state's colour. Band boundaries come from THAT result's reference range and
   THAT marker's severity threshold (sent as `severityThreshold` on the DTO,
   see `statusBands()` in packages/shared) — never a fixed scale.
   **BANDS ARE DRAWN PER PERIOD, NOT PER POINT, AND NEVER AS A SLIVER (Aug
   2026).** Consecutive results sharing a reference range are ONE period and get
   ONE band set, so a series on one range spans the whole plot. Where the range
   genuinely changes, the step goes MIDWAY between the two samples it happened
   between — we know it changed between those draws and not when, and the
   midpoint is also what guarantees every period is at least half a sampling gap
   wide. Drawing a band from each point to the next put the LAST result's range
   in the padding gutter: measured at 24px against a 510px plot on a marker
   whose range changed on the most recent result. A change of range is also
   SAID — a dashed rule at the step, an entry in the key, and a sentence naming
   both ranges and their dates, because a silent change of reference range
   between two results is exactly what misleads someone reading their own trend.
   The key is a two-column grid, not two rows of wrapping flex items.
   **WHETHER THE RANGE CHANGED IS ONE QUESTION WITH ONE ANSWER (Aug 2026).**
   `sameReferenceRange` (statusBands.ts) decides it, and it is NOT a float
   compare, because the bounds reaching a chart have been through a unit
   conversion: a fasting glucose reported as 3.9–5.5 mmol/L and then as
   70–99 mg/dL is one interval written twice, and 99/18.0182 =
   5.494444506110488 is not float-equal to 5.5. So the chart stepped, drew the
   dashed rule, named the change in the key, printed both ranges on the axis,
   and stated in a sentence that the laboratory had changed a range it had
   never touched — with 5.494444506110488 set as an inline axis label.
   Identity is decided at the precision a range is READ at
   (`roundReferenceBound`: 3 decimals under 0.2, then 2, then 1, then whole
   numbers — per BOUND, so TSH's 0.27 floor keeps its precision beside a 4.2
   ceiling), and the same rounding is what gets printed. **A step therefore
   exists exactly when the two printed ranges differ**, which is what stops the
   drawn step and the written sentence ever disagreeing;
   `referenceRangeIdentity.test.ts` pins the biconditional. The BAND GEOMETRY
   still uses the exact numbers the server sent — a period takes its first
   row's — so no band edge moves to suit a rounding. **No reference range is
   ever interpolated raw into copy**: `formatReferenceRange` is the only way one
   reaches a screen, in the chart's tooltip, sentence and axis labels and in
   the two "Lab reference range" lines on MarkerDetailPage and
   MarkerResultCard.
   **THE STEP LOOKS THE SAME EVERY TIME IT HAPPENS.** One dashed vertical
   hairline, the full plot height, at the midpoint — `chart.stepDashArray` /
   `stepWidth` / `stepOpacity`, tokens rather than literals because the pattern
   was written out twice (the rule on the plot and the swatch in the key) and
   two copies of one appearance is one edit away from drifting. Every band in a
   period is drawn to ONE x extent held on the period, so "all the bands step
   together" is structural rather than four expressions agreeing; the boundary
   hairlines run only across their own period and meet the step. Every period's
   bounds are labelled at the right-hand end of its OWN extent, not just the
   last period's — a reader could previously see that the range had stepped and
   not read what it stepped from. `e2e/chart-bands.spec.ts` measures all of it:
   two overlapping boxes and a 1px band edge out of place are facts you
   measure, not things anybody notices in a screenshot.
   **THE DEMO SEED DOES NOT DRIFT A RANGE BY ACCIDENT.** Three markers were
   stepping and one meant to. `fasting-insulin` is deliberate and load-bearing
   (2–25 → 2–10 is what makes 24.6 significantly high rather than a shrug);
   `vitamin-d` (50–250 → 75–200) and `ferritin` (30–400 → 20–200) were
   hand-written rows that happened to differ, and both computed to the SAME
   status against either range — so the step was drawn, named and explained over
   a change that did nothing. Both are constant now.
   `DECLARED_RANGE_CHANGES` in demoSeedData.ts is the closed list, and
   `buildDemoReports` THROWS on any change not on it, including one produced by
   the fall-through where a scripted range on one report meets the catalogue's
   own band on the next — which is how fasting-insulin's step actually arises
   and is invisible in the narrative table alone.
   **THE BANDS ARE CONTEXT AND THE LINE IS CONTENT (redesigned Aug 2026).**
   They were four opaque saturated slabs edge to edge with a near-solid rule
   over every boundary, which is a fill tool rather than a chart: at equal
   weight and full strength five regions of colour ARE the picture and the
   reader's own result is a detail on top of them. Four things changed and they
   are one thing. **Weight** — a band is COMPOSITED at `BAND_WEIGHT`
   (statusBands.ts) rather than painted, and the five weights are unequal: in
   range 0.10, out 0.17, significantly out 0.24. **Falloff** — each band fades
   to nothing over `bandEdgeFade` of its own height at both ends, so it is a
   region and not a block; the geometry is CLAMPED TO THE DOMAIN first, because
   `ifOverflow="hidden"` clips with a clip-path rather than shortening the rect,
   so an unclamped band puts its fade in the part that was clipped away and sits
   at full weight against the plot edge. **Hairlines** — boundaries are 1px at
   low opacity, and the reference bounds are LABELLED INLINE at the right edge
   of the plot. **Axes** — round tick values only (the y-axis read 0, 8, 16, 24,
   31.9, and 31.9 is not a number anybody chose), four of them, no gridlines and
   no box. The `plot` role in tokens.ts is the composited hue, per theme and
   solved so a band lands at the same weight in both — brighter and far more
   saturated in dark, but LOWER in lightness, since a near-black card amplifies
   a luminance step a cream one damps. Orange survives only in the
   significantly-out bands: below-range is a fifth visible at a typical axis
   scale, so ramping it out to orange painted the transition-into-significant
   immediately below the reference bound. The range bar keeps the full ramp.
4. Sparklines, the counts strip, the per-category summary bars.
5. Tooltips and legends — the status word carries the colour.

**Non-negotiables.**
- The shape-and-label layer is unchanged and still carries status on its own:
  level mark in range, chevron out, doubled chevron significantly out, plus the
  word. Colour is reinforcement, never the sole carrier — red and green are the
  commonest confusion pair there is. Chart bands therefore always carry a
  boundary line AND a written entry in the key.
- Surfaces and marks, not body copy. A tinted card keeps its taupe border,
  espresso text and ordinary shadow. The one text that takes a status colour is
  the status word itself. No warning icons, no pulsing.
- **NO COLOURED CARD OUTLINES (Aug 2026).** No red or orange border, ring or
  outline on any card — the out-of-range contact card, marker cards, result
  cards, alert cards, toasts, all of them. A card carries the warm neutral
  hairline or no border at all. The TINTED FILLS STAY exactly as they are:
  this removed the coloured stroke around the box, never the colour inside it.
  An alert that had a red border and no fill now takes `bg-tint-*` instead, so
  status is still on the surface. Form fields keep their error border — a field
  is a control, not a card, and that border is its only non-text error state.
- Never diagnostic. The bands show where the lab's range sits, nothing more.
  Never label anything good, healthy, bad, concerning or danger. The vocabulary
  is: in range, above range, below range, significantly out. Out-of-range still
  points calmly at the GP with contact details inline.
- Low-saturation and warm-leaning, on cream and on the dark browns — but NOT so
  muted it reads as beige. That was the previous failure: a 12% wash of an
  orange is indistinguishable from cream. See the note on `statusHue`.
- Dark tints are re-derived against the dark surface, never reused.

**⚠ Runtime tokens are `rgb(var(--x))`, never bare `var(--x)`.** The custom
properties hold bare channels so Tailwind can composite an opacity into them, so
a bare `var()` in a `style` prop, an SVG `fill` or a gradient stop is not a valid
colour — the browser drops it silently and the element renders black or
inherited. That single mistake is what made the whole status layer invisible.
Use `status.*.cssVar` / `statusTint` / `hueTint` / `chart.*`, which wrap it;
`apps/server/tests/tokenContrast.test.ts` enforces the shape and the reference.

## Light and dark — DARK IS THE DEFAULT (changed Aug 2026)
Dark is what a new visitor and anyone with no stored preference gets. A stored
choice still wins outright, "System" is still an option in Account & privacy
and still follows the device when chosen, and the toggle is unchanged. The
resolution rule lives in exactly two places that must not drift —
`readStoredThemePreference` / `THEME_BOOTSTRAP_SCRIPT` in lib/theme.ts and
public/theme-bootstrap.js, pinned by theme.test.ts. Anything that is not
'light' and not 'system' resolves to dark, so the empty case lands on dark
without a second branch and there is no flash.

**Dark mode is NEAR-BLACK PLUS ONE CORNER GLOW, never a brown wash (changed
Aug 2026).** The page reads black at a glance and warm on inspection —
`nightBase` is espresso taken 74% to black (#110F0D). It went 0.60 → 0.44 → 0.74,
and the middle value is the one worth remembering: raising the surfaces until a
card separated on its own turned the whole viewport brown, which is the opposite
of the register the clinic's own site is in. Separation now comes from the card
being genuinely lifted off the page (the surface scale's raised steps are far
apart, because a lift is a RATIO and the same mix that showed on #25211E is
invisible on #110F0D), from the hairline border, and only then from the light.

**The glow is ONE radial with a real falloff.** 62% × 58% anchored just inside
the top-right corner, a 0.40 core, and eight unevenly-spaced stops that roughly
halve every 12% of the radius. What it replaced was two radials at 112% and 140%
of the viewport, which put every pixel inside the bright part of the curve — a
falloff that existed and was invisible, i.e. a flat gold wash. The tail ends at
`rgb(var(--c-glow) / 0)` and never at `transparent`, because `transparent` is
rgba(0,0,0,0) and interpolating toward it takes the ramp through a grey
shoulder. Fixed, static at every motion preference, `z-index: -1`.

**Nothing may paint an opaque background over it.** The page colour sits on
`<html>` and body is transparent — but the trap is one element further down:
the patient and admin shell roots carried `bg-cream`, which drew an opaque sheet
over `body::before` and hid the glow on every signed-in screen. They carry no
background now. Turn the glow off entirely and the interface must still work;
that is the test.

**Dark status colours are re-derived, and a FILL is mixed from black.** The wash
under a card is still mixed from the card, because it is that card's own
background. A band, a track and an edge are not: they are regions of colour, and
mixing them from a warm brown near-black adds red to every hue at once — which
is what made the chart bands read as three shades of mud. They are mixed from
neutral black toward the hue instead, with per-hue strengths, so green reads
green and red reads red. See `DARK_FILL` / `DARK_HUE_LIFT` in tokens.ts;
`tokenContrast.test.ts` holds the separation and the AA floors.

Every colour resolves through a CSS custom property, so one class name is right in
both themes (`text-espresso` is espresso in light, warm cream in dark). Tokens live
in packages/shared/src/tokens.ts; tailwind.config.ts injects them via addBase.
- `cream` = surfaces, `espresso` = text, `taupe` = borders, `bronze` = accent,
  `white` = the recessed input surface. All four flip with the theme.
- `night` and `oncolor` are STATIC: the atmospheric dark panels (auth split,
  tooltips, fasting notice) are dark in both themes and their text stays light.
- `onaccent` is theme-aware and is the text on a FILLED accent (bronze button,
  selected option). It is white in light and near-black in dark — a light label on
  dark mode's lightened bronze measures under 2:1.
- Dark surfaces are warm near-black browns derived from espresso. No pure black,
  no cool grey.
- Text opacity ladder is 100 / 90 / 85 / 80 and stops there. `/70` and below fail
  AA in light mode; anything fainter is for placeholders, disabled controls and
  decorative icons only. apps/server/tests/tokenContrast.test.ts enforces all of it.

# Booking is in this codebase and is deliberately off (Aug 2026)
The patient-facing booking flow is complete and stays in the tree, behind ONE
build-time flag: `VITE_BOOKING_ENABLED`, unset (off) by default, read in exactly
one place, `apps/web/src/lib/features.ts`. Do not add a second flag, and do not
delete the flow.

**Why.** Appointments are taken on the clinic's main website now. This portal is
results only. Off means: no "Book a test" in the sidebar, /book and
/appointments redirect to /overview (they are in bookmarks, so redirect, never
404), no appointment cards on Overview, no report → appointment provenance link,
no fasting or preparation notices. Rollup folds the flag, so none of
features/booking or lib/booking reaches the production bundle.

**What is NOT behind it, and must keep working:** the server's whole Randox
chain — placeOrder/amend/cancel, GetServiceLocations, AvailabilityDetails,
HoldAvailabilityBooking, CreateRandoxBooking, the mock transport, every test
over them. That is what whatever books on the main site will call, and it has
its own separate switch (`RANDOX_ENABLED`). Results ingestion, polling and the
order lifecycle are untouched by the flag.

Turning it back on is `VITE_BOOKING_ENABLED=true` in Vercel and a redeploy.
Two e2e expectations are written against "off" (sidebar link count in
patient-sidebar.spec.ts; the "no booking entry point" test in
route-console.spec.ts). See DEPLOYMENT.md → Feature flags for the full note.

# Naming and contact details (Aug 2026)
- The practice is **Aspire Clinic** in everything a patient reads. "Aspire Group
  of Companies" is gone from product copy, seeded copy blocks, emails and the
  PDF. It survives only in PRIVACY.md and SECURITY.md, where it is genuinely
  the legal entity.
- Contact details render **one item per line, never comma-joined**: address,
  opening hours, emergency line, email, with the phone above them when
  `CLINIC_PHONE` is set. One component — `ClinicContactLines` in
  components/patient/ClinicContact.tsx — is used everywhere on screen, and
  `drawClinicContact` renders the same four lines in the PDF. They come from
  `getClinicContact()`; do NOT paste them onto the end of a copy block again,
  which is how the out-of-range card ended up saying "Aspire Clinic, Aspire
  Group of Companies, 27 Mortimer Street, London".
- Source labels: `Analysed by Randox Health` where the result genuinely came
  from Randox. In-house results carry NO source line at all (sourceLabel is
  empty for `aspire_inhouse`), so every render site guards it.
- **`ESCALATION_EMAIL` and `CLINIC_CONTACT_EMAIL` ARE TWO VARIABLES (Aug
  2026).** They were one, and `getClinicContact()` read the escalation address
  — so the address a clinician is paged at was also the address printed in the
  portal sidebar on every screen, beside every out-of-range result and in the
  footer of every PDF. Pointing the escalation at a named individual, which is
  what a small practice actually wants, published their personal address to
  every patient and into every PDF already downloaded. ESCALATION_EMAIL is
  STAFF ONLY and is read in exactly two places (the escalation itself and the
  boot check); CLINIC_CONTACT_EMAIL is what a patient sees and should be a
  shared inbox that outlives whoever is on the rota.
  `tests/escalationRouting.test.ts` pins the separation, including the list of
  files allowed to read the escalation address. Production refuses to boot
  without a routable ESCALATION_EMAIL — and that check deliberately stops at
  "is it an address", because no code can tell whether a mailbox is read.

# Randox Nexus — the OpenAPI spec is the source of truth (Aug 2026)

`apps/server/src/modules/randox/specs/nexus-openapi3.json` (+ `.yaml`) is the
real document from the developer portal: **GP Test Portal v1.0**, server
`https://stes-gpto-appapi-001-apim.azure-api.net/api`, **17 endpoints**. IT
OUTRANKS the flow and auth PDFs beside it, and it outranks anything anyone has
said in an email. The client was built on four assumptions the spec contradicts
and all four are now corrected.

**EIGHT ENDPOINTS ARE GET, NINE ARE POST.** The rule is one sentence: *takes a
body, POST; takes nothing, GET.* The table lives in `modules/randox/endpoints.ts`
and nothing guesses a verb — `verbForPath()` throws on a path it has never read
off the spec. The nine POSTs are all under `/Order` and DO include the Get* ones
(GetOrderStatus, GetOrderResultDetail, GetOrderResultReports each take an order
identifier in a body); the eight GETs are the reference-data endpoints and take
nothing at all. `RANDOX_REFERENCE_DATA_METHOD` now defaults to `get` rather than
probing; `auto` survives as an escape hatch, not as a hedge.

**THE SPEC DECLARES ONLY A SUBSCRIPTION KEY. THE BEARER IS UNCONFIRMED.**
`securitySchemes` has exactly two entries and both are the same key
(`Ocp-Apim-Subscription-Key` as a header, `subscription-key` as a query
parameter). There is no OAuth or bearer scheme anywhere in the document. The
auth PDFs describe an Azure B2C ROPC grant, so the gateway probably does want
one — "probably" being the honest word. So: the key always goes, in the HEADER
(never the query form, which puts a credential in every access log), and the
bearer is switchable by `RANDOX_BEARER_TOKEN_ENABLED` (default on). A 401 logs
which combination was sent, so the first live call diagnoses itself.

**THE 401 BODY USES A DIFFERENT KEY.** 200/400/500 return
`{"statusCode": "...", "message": "..."}`; the 401 returns
`{"status": "401", "message": "..."}`. Both are parsed (`parseRandoxErrorBody`).
`statusCode` is documented as an integer and returned as a string in every
example — treat EVERY scalar this API produces as a string and coerce at the
boundary (`asRandoxInt` / `asRandoxIdString`).

**THREE ORDER IDENTIFIERS, THREE COLUMNS, AND LINKING JOINS ON `orderId`.**
Creation returns `{orderId, externalNumber}`; everything afterwards returns
`orderNumber`; and the spec's own two examples spell them differently
(`GC1123-00010300` vs `GP-THE-00000130`). "externalNumber is orderNumber under
another name" is an UNVERIFIED HYPOTHESIS. `RandoxOrder` stores `randoxOrderId`,
`externalNumber` and `orderNumber` separately and none overwrites another;
automatic linking joins on **`randoxOrderId`**, the one identifier that provably
appears on both sides. `reconcileOrderNumber()` logs loudly and audits the first
time a real order shows the two differing. On the list for Randox.

**RESULTS IDENTIFY A MARKER BY AN ANALYTE STRING, NOT A CODE.** Each row in
`reportResults` is orderNumber, dateOfReceipt, dateOfReport, analyte, group,
result, units, refLow, refHigh, lowHigh, sampleType, caveat, displayName — no
marker id and no marker code. `modules/randox/analyteMap.ts` is the whole
bridge: **exact match, then a normalised match (case, whitespace, punctuation),
and nothing beyond.** No fuzzy matching, no similarity scoring, no substring
fallback — the shared matcher in `reports/matchMarker.ts` has all of those and is
right to, because it feeds a table an admin corrects; this path has no admin in
it, and "Magnesium"/"RBC Magnesium" and "Testosterone"/"Free Testosterone" are
each two different tests. An unmapped analyte does NOT vanish and is NOT invented
into a marker: it becomes an `UNMAPPED_ANALYTE` exclusion carrying the raw
analyte, group and display name, it is logged and audited with the exact
spelling, and **it holds the report at PARSED** — a clinician must never be shown
a panel with a result silently missing from it. `sampleType` is part of the
IDENTITY: Randox print the urinalysis pads bare ("Glucose", "Protein",
"Bilirubin"), which are the same strings as three serum markers and are not the
same tests.

**THE MAP IS UNVERIFIED, AND THAT IS NOW ON A SCREEN (Aug 2026).** 186 clinical
markers resolve from their own catalogue names, 0 have been confirmed against a
real Randox payload, and **86 answer to exactly one spelling** — so one
difference in how Randox print any of those loses a result. That is
self-consistency, not confirmation. Inventing plausible Randox spellings to
close it is still refused and is not to be revisited: the exception queue
catches an ABSENT mapping and nothing catches a wrong one.

What changed is that the uncertainty is visible rather than buried:

- **`RandoxAnalyteObservation`** records every analyte STRING that arrives and
  what became of it — RESOLVED with the pass that answered, or UNMAPPED. The
  confirmed figure is counted from deliveries, which is evidence, and it is
  shown BESIDE the code's own claim rather than merged into it.
- **`analyteMappingCoverage().confirmedAgainstRealPayload` STAYS HARDCODED AT
  ZERO.** It answers "what does the code claim on its own evidence" and the
  honest answer is nothing. It must never become computed — every computation
  available to it counts assumptions. `analyteObservations.ts` answers the other
  question from the other source. `tests/analyteObservations.test.ts` pins the
  zero.
- **The exception queue is on the ingestion log screen**, with the closest
  catalogue candidates as SUGGESTIONS — from `matchMarker.ts`, the fuzzy matcher
  the map itself refuses, which is right here and only here because an admin
  looks at the answer before anything is written. Nothing is pre-selected: a
  pre-filled picker on a fuzzy suggestion is an auto-apply with an extra click
  in front of it.
- **An accepted mapping is a learned override**, stamped `via = 'ADMIN'`, read
  per delivery by `normaliseResultDetail` and PASSED INTO `resolveAnalyte` —
  never cached, because a stale mapping in a clinical path is worse than a
  query. It loses to the sourced override table where the two disagree, and it
  is keyed by `analyteIdentity()` (normalised name PLUS sample type), so
  accepting a urine "Glucose" cannot file a serum one.
- `npm run audit:analytes` writes `docs/audits/analyte-mapping.md`, which names
  all 86 as the check-first list.
- **THE FOOD-SENSITIVITY SUFFIX IS ACCEPTED BOTH WAYS (Aug 2026).** Our
  catalogue holds every food item as `Cod (IgG)` and that suffix is OURS, so
  while it was the only spelling any of them answered to, Randox printing the
  food name bare put all 207 in the exception queue at once — an outage with a
  list rather than a queue. The BARE form is now an alias on every sensitivity
  marker (`bareSensitivityName` in markerCatalogue.ts), so both resolve. This
  is not a guess at a Randox spelling and does not weaken the rule above:
  exact and normalised matching only, still no fuzzy matching anywhere. It is
  our own name accepted with and without a suffix we added ourselves. If a
  bare food name ever collides with a real analyte, the index records both
  claims and refuses the row as AMBIGUOUS — and `analyteObservations.test.ts`
  fails first, in `npm test`, before a collision can reach a delivery.

**PRICES ARE STRIPPED AT THE TRANSPORT BOUNDARY.** GetPanels and GetTests both
carry `cost` and `currency`. `stripPricing()` in `clients/NexusLabClient.ts`
deletes them recursively on the way in, so they never reach the database and are
never one `select` away from a patient's screen. `RandoxTestItem` has no field
to put them in. `tests/randoxPricing.test.ts` asserts it at both levels.

**ORDER CREATION.** `TestReasons` is REQUIRED and required non-empty by the
spec's own schema — `placeOrder()` and `amendOrder()` refuse to build a request
without one rather than finding out from a 400. `CreatePendingOrder` is the
minimal form (no ethnicity, no measurements, no sample collection);
`CreateOrder` is the full one, with a nested Patient and a SampleCollection
block. The examples are internally inconsistent about types — `TestReasons[].Id`
is an integer on CreatePendingOrder and a STRING on CreateOrder/UpdatePendingOrder,
biological sex ids come back as strings, ethnicity ids as integers,
CancellationReasonId as a string. Accept both in, send whatever THAT endpoint's
example uses. Dates are the .NET round-trip form
(`2024-08-01T08:45:10.0000000+00:00`): `toUtcIso` handles it, but
`z.string().datetime()` REJECTS it (zod wants a literal `Z`), so a Randox
timestamp is validated by `randoxDateTime` from `clients/parse.ts`.

**REFERENCE DATA IS SYNCED, NEVER HARDCODED.** All eight GETs are pulled on boot
(`syncReferenceDataOnBoot`, after `listen` and never fatal — the whole portal
works without them) and on demand, cached to `RANDOX_REFERENCE_DATA_TTL_MINUTES`.
`assertReferenceDataUsable()` throws on an empty lookup the order path depends
on: a silent zero leaves `resolveBiologicalSexId` on its 1/2 default forever, and
a wrong BiologicalSexId changes which ranges the laboratory applies. Our records
keep OUR values; the Randox id is a mapping, not a replacement.

**THE MOCK IS GENERATED FROM THE SPEC.** `mock/specServer.ts` reads every route,
verb and 200 body out of the document and enforces the verb (a GET called with
POST answers 405), the key (missing → the spec's own 401 body) and the body. It
SERVES prices, because the spec does — the strip has to be provable in the
client. `mock/scenarios.ts` adds the payloads the spec does not provide and
production certainly will: a caveat, `"< 5.0"`, `"Not detected"`, an empty
refLow, an unmapped analyte, a `lowHigh` that contradicts the range, and a urine
analyte sharing a serum name. `tests/randoxSpecContract.test.ts` runs the real
client over HTTP against it, so **a future spec update surfaces as a test failure
rather than as a production 400.** Nothing real goes near the sandbox: no real
names, no real dates of birth.

**THE BOOT GUARD IS UNTOUCHED.** There is still no endpoint anywhere in the spec
returning void or caveat codes, which confirms they come only from the Randox Web
Developer team. Production still refuses to start with `RANDOX_TRANSPORT=live`
while the code map is the checked-in placeholder. Do not weaken it.

# Sessions
- Patient idle timeout is **90 minutes**. Staff is **15** and is a separate
  constant — raising one must never raise the other, and idleSession.test.ts
  asserts the pair. Neither is the access-token lifetime (15m) or the refresh
  token (30d); those are security primitives and stay untouched.
- The "stay signed in" warning lead is a share of the window, capped:
  5 minutes for a patient, 3 for staff (`idleWarningLeadMsForRole`).

# The sidebar (Aug 2026)

- **It is a TRANSLUCENT WASH, in both shells (changed Aug 2026).** It went
  `bg-cream-50` → nothing → `.panel-wash`, and the middle state is the one
  worth remembering: an opaque fill drew a 288px vertical slab across the
  corner glow, and removing it entirely fixed the seam by removing the panel —
  the column became the same tone as the page, so a signed-in screen read as
  one undifferentiated dark field with a title floating in it. `.panel-wash`
  (globals.css) is a panel in FRONT of the light rather than on top of it.
  One colour and one alpha, both tokens: `--c-panel` is BRAND ESPRESSO IN BOTH
  THEMES and `--panel-wash` is `PANEL_WASH_ALPHA` (6% light, 38% dark). The
  single colour is what makes it work in both directions — espresso dims a
  cream page and LIFTS a #110F0D one, which is the only direction available in
  dark, because a darker wash on a near-black page measures 1.02:1 however far
  it is pushed (the same trap recorded on `darkWhite`). Measured: 1.10:1 and
  1.17:1 against the page, which sits it between the page and a card (1.44:1) —
  page, panel, card. Over the glow it knocks the core back to 1.10:1 of itself
  while the lit part of the panel stays 1.78:1 above the unlit part, so the
  light is visibly still there and continuous across the seam.
- **The hairline is `border-panel-edge`, not `border-taupe`.** One step
  stronger: 1.88:1 against the light page (was 1.40) and 3.40:1 against the
  dark one (was 2.17). It is the whole of the separation wherever the glow does
  not reach — which on a wide window is most of the column, since the glow's
  ellipse ends well before x=288px at 1440.
- **NO BACKDROP BLUR, and that is a decision.** The only thing behind the panel
  is the page colour on `html` and one fixed radial. Blurring a smooth gradient
  returns the same gradient, so `backdrop-filter` buys a compositing layer on a
  sticky element and no visible difference at all. The place it would earn
  itself is the MOBILE DRAWER, which has scrimmed content behind it — and that
  keeps its opaque surface instead, because navigation read through the page it
  navigates is worse than either.
- `apps/server/tests/tokenContrast.test.ts` holds all of it: separation from
  the page, that it stays below a card, that it dims the light without blocking
  it, that every label on it clears AA lit AND unlit, and that the hairline
  beats the border it replaced.
- **Nav labels are `.nav-label`** (globals.css): IBM Plex Sans at the small
  step, medium, 0.01em of tracking. One step down from the reading size they
  used to take, because a nav label set at reading size beside a Fraunces page
  title reads as a second heading competing with the first. Inactive is
  `text-taupe-900` (5.43:1 on the light page, 11.05:1 on the dark one); active
  is `text-espresso`, which is cream in dark.
- **Active is a bronze rule and a whisper of warm fill** (`bg-bronze/[0.08]`),
  never the filled block it was — a solid tile pasted over the glow.
- **No `truncate` on a nav label.** A navigation label that has been cut off is
  a destination whose name you cannot read. "Understanding your results" became
  "Understanding results" and the row wraps rather than clipping.
- **One icon size and one stroke weight**: 20×20 viewBox at 1.4, rendered at
  18px from the call site so a glyph cannot arrive at its row a different size
  from its neighbours.
- **THE ACCOUNT ROW IS ALWAYS ON SCREEN.** The column itself never scrolls.
  What gives, in order: the contact details scroll inside their own border
  first, then the nav, and the account row never. The footer band is capped at
  45% of the panel — the largest cap that still leaves every nav row standing at
  700px with the contact card open. Pinned at 900/800/700, open and shut, by
  `e2e/patient-sidebar.spec.ts`.
- **The name and avatar are a second route into Account & privacy**, beside the
  nav item, with Sign out as a SIBLING and never a child: a button inside an
  anchor is invalid markup and gives one control two behaviours.

# Rules
- Never colour alone for status — text label + icon shape carry it first
- **By marker is the first Results tab and the default view.** By report is one
  press away, and every emailed link opens /reports/:id, which pins the report
  view regardless. The default view is the one with NO `?view=` parameter, so
  /results and /results?view=by-marker are one URL.
- The results control bar's filters panel is opened and closed by the READER
  only — one boolean, closed on load, toggled by the disclosure, closed by
  Escape, an outside click and a change of view. Nothing derived from scroll
  may write it; that is what made the disclosure fail to toggle. It is
  unmounted when shut, so it cannot overlap or displace the search field or
  the tab switcher.
- Results screens (a report, All markers) share one search/filter/sort contract,
  in lib/markerCopy.ts: name+alias search, status filter, health-area filter,
  and sort by health area (grouped under headings) / name / needs-attention.
  They compose, they show a live count and an intentional empty state, they
  never persist across sessions, and they change what is DISPLAYED and never
  what is fetched. A marker with no result renders nowhere — never a
  placeholder, never an empty row.
- Non-measured sections (food sensitivity, genetic, microbiome) carry their own
  search and group filter, scoped to the section — 197 food items are unusable
  without one, and the page-level status filter can never apply to them.
- Markers declare a resultType: MEASURED / GENETIC / SENSITIVITY / COMPOSITION
  / **QUALITATIVE** (added Aug 2026). Only MEASURED reaches the results grid,
  the counts strip, the category bars and Trends. The other four get their own
  sections and their own framing, and never a status, a tint, a reference range
  or an optimal band.
  **QUALITATIVE is a finding rather than an amount** — the nineteen UTI
  organisms and resistance markers, the resting ECG, the body composition
  analyser and the prostate cancer risk score. Twenty-two entries that were
  MEASURED with no unit, not because a unit was missing but because there is no
  quantity to put one on, sitting in the grid next to a potassium looking
  exactly as clinical. COMPOSITION was the obvious home for the bacteria and is
  the wrong one: its framing says gut microbiome as a proportion of the whole,
  and a urine PCR panel is neither. See `RESULT_TYPE_RULES.QUALITATIVE`.
- **NINE MEASURED markers keep an empty unit ON PURPOSE**, and the list is
  closed: `h-pylori` (a serum antibody assay reported positive/negative) and the
  EIGHT urinalysis dipstick pads (`ph-urine` is the ninth pad and is genuinely
  numeric, so it has one). A pad IS a measurement, read off a strip against a
  printed scale, and a patient expects it beside their other results. It renders
  correctly with no numeric range because the read path already handles a value
  with no comparison: `valueText` with `status: null` shows the reading, takes
  no tint, no chevron and no range bar, is labelled "Not compared to a range",
  and is excluded from every tally by `countable()` in resultPresence.ts.
  Nothing about the at-a-glance strip depends on the resultType alone. Never
  invent a unit to clear that list.
- Markers group by health area (MarkerCategory), many-to-many — one Albumin record
  in four areas, never four Albumin records
- Auth cards never scroll internally at any viewport. If a step doesn't fit,
  restructure the step; never add a scrollbar.
- Optimal ranges: published guidance with a named source, or an explicit entry with
  low/high null and the reason. Never invent one, never extrapolate from a related
  marker.
- Reference ranges live on the result, not the marker
- **A CATALOGUE RANGE CARRIES A PROVENANCE TIER, AND IT IS ON SCREEN (Aug
  2026).** `ReferenceRange.provenance` is `RANDOX` / `PUBLISHED` / `UNSOURCED`,
  with the citation (document, publisher, date, URL) stored on the row beside
  it, and the tier is shown in the admin verify form with a sentence saying
  what to do about it. `source` was a sentence, so nothing could sort or count
  on it and an unverified standard adult band looked identical to a range
  transcribed from the Randox report — in the one place the difference matters,
  in front of somebody holding the paper. **A RANDOX RANGE IS NEVER OVERWRITTEN
  BY A PUBLISHED ONE**: reference intervals are assay-specific and belong to
  the analyser, method and population a laboratory validated against.
  Provenance is also the TIE-BREAK in `resolveReferenceRange()` and only the
  tie-break — specificity first, always, because the wrong sex is a bigger
  error than a weaker citation.
- **Ten sex-specific ranges are loaded from NHS Lothian, at the weaker tier**
  (`prisma/publishedReferenceRanges.ts`). Ten more are deliberately WITHHELD
  with the reason on each, and the flag stays on all of them — ferritin and
  iron because the source prints the female band higher than the male, which is
  the wrong direction and reads as a transposition; GGT because a Randox range
  already covers it; HDL because 1.55 is a desirable threshold and not an
  interval; every hormone because the source excludes them. **Both bands go in
  and the blanket `ANY` row is deleted**, since leaving it keeps answering for
  a patient with no sex on file. Two rows need a unit conversion and each is
  asserted twice, independently — against the declared factor AND against the
  literal expected number — because a conversion error produces a correctly
  formatted number in the right column that is out by a factor of a thousand.
- **THE CATALOGUE AND THE PER-RESULT RECORD ARE TWO TABLES (Aug 2026).**
  `ReferenceRange` is the catalogue of fallbacks the verify form suggests.
  `ResultReferenceRange` holds one row per result — what one laboratory printed
  on one report — and `ReportResult.referenceRangeId` is UNIQUE, so a record
  belongs to one result and correcting it can never reach another patient. A
  Marker relates to both, under separate names, and `resolveReferenceRange()`
  can only ever be handed the catalogue.
  They were one table, which is not a tidiness complaint: a `findFirst` on
  marker-and-sex landed on a RESULT record far more often than on the catalogue
  row (3,080 against 89 here), and updating one rewrote a patient's history to
  say their laboratory printed a range it did not. A seed run did exactly that
  to ten rows; four still carry the sentence recording it, because what was
  printed is not recoverable.
  The `results: { none: {} }` guard that stood in for this is GONE, and do not
  bring it back — it was also unsound. A re-verify orphans the record it
  replaces, and an orphaned result record satisfies it exactly as a catalogue
  row does; 152 were sitting in the catalogue that way.
  **Every catalogue write goes through `lib/catalogueRanges.ts`**, which asserts
  the row it is about to touch is a catalogue row first. That is not a
  tautology: ids were preserved across the split, so an id from an old log or an
  un-redeployed client still resolves, and it resolves to a clinical document.
  `referenceRangeSplit.test.ts` pins the schema shape, the write-path list, and
  that the resolver's tie-break (specificity → provenance → `createdAt` → `id`)
  is a total order rather than Postgres row order.
- **The seed never marks an explanation reviewed, and retracts the ones it used
  to.** A review is a NAMED PERSON WHO READ IT: a status with no `reviewedById`
  is a row somebody clicked, and one attributed to an account the seed creates
  is a fixture whatever its job title says. 72 rows were reported as checked
  when the honest number was zero, which is worse than DRAFT because nobody
  goes back to something already ticked off. `lib/explanationReview.ts` holds
  the one definition; the seed retracts with an audit entry per row. A real
  person's decision is NEVER retracted, including a non-clinical one — saying
  an administrator's approval is not a clinical sign-off is the audit's job,
  not the sweep's.
- **Label/value rows are an explicit GRID, never a flex row.** `.value-row` in
  globals.css: declared columns with measured minimums, the list as the
  container-query context so every row switches arrangement together and the
  heights stay uniform, three columns where there is room and two clean lines
  where there is not. It replaced a `justify-between` flex row with a `min-w-0`
  value group — which is a layout that reads correctly right up until the content
  is wider than the box, at which point the group shrinks past its own children
  and they paint over the date beside them. On the marker page's 40%-width card
  that was not an edge case, it was every out-of-range marker. A grid track
  cannot be overflowed by a sibling; a flex item can. Used by the
  previous-results list and by the genetic / sensitivity / microbiome rows, and
  pinned geometrically by `e2e/previous-results-layout.spec.ts` — two boxes
  overlapping is a fact you measure, not something you review a screenshot for.
- **Reference ranges and marker explanations are sourced or clinician-signed,
  never authored by a session.** A range comes from the result, then from the
  Randox documents in `modules/randox/specs/` (transcribed with a page reference
  in `scripts/auditReferenceRanges.ts`), and from nothing else — anything
  unsourceable stays as it is and goes on the list. **`GetTests` does NOT return
  reference ranges and there is no endpoint that does (confirmed against the
  OpenAPI spec, Aug 2026).** It returns id, name, code, stabilityTime,
  sampleTubes, cost and currency: no units, no refLow, no refHigh. Ranges arrive
  per marker on the RESULT, in GetOrderResultDetail. So the fallbacks in
  `markerCatalogue.ts` cannot be sourced from the API — they come from the
  Pathology Services Catalogue PDFs, and nobody should go looking for an API
  route to them again. Explanation copy may be
  corrected for punctuation and for the fixed non-diagnostic vocabulary table,
  and for nothing else: ~350 of them were written by an assistant and none has
  been read by a clinician, so replacing text that looks wrong with more
  unreviewed text relabels the risk rather than reducing it. All THREE audits
  regenerate into `docs/audits/` (`npm run audit:explanations` / `audit:ranges`
  / `audit:analytes` in apps/server) and all three are read-only.
  **What the finished range audit found, so nobody re-derives it (Aug 2026):**
  the HSC5 Basic Screen example report is the ONLY document in `specs/` that
  carries ranges, so Basic Screen (34 markers, 33 sourced) is the only sourced
  tier and Standard Screen, Standard Screen Plus, Advanced GP2 and Advanced GP3
  cannot be sourced from anything we hold. That is the absence of a document,
  not a gap somebody forgot — **ask Randox for the Pathology Services Catalogue
  and for a FEMALE example report.** 22 analytes are sex-dependent and 20 of
  them store one blanket `ANY` range, which is silent: it renders an ordinary,
  correctly-formatted suggestion that is wrong for half of patients. None is
  corrected, because the example report prints ONE range and never says whose —
  adopting it blind swaps a bug for the same bug facing the other way.
- Demo values must be ones a clinician would not find absurd. The severity
  threshold is a multiple of the range WIDTH, which invents a chloride of 65 and
  a neutrophil count of 19.5 — so the demo carries an outpatient envelope
  (`DEMO_ENVELOPE`) and a marker whose required excursion falls outside it is not
  chosen for that quota. Never clamped instead: a clamped value computes to a
  different status than the one it was generated for.
- Nothing auto-publishes; release is an explicit state change

# One human gate, and it is a clinician (Aug 2026)

The pipeline is **UPLOADED → PARSED → CLINICIAN_REVIEWED → RELEASED**, with
CHANGES_REQUESTED as a loop back rather than a fifth forward stage.

**ADMIN_VERIFIED is gone. Do not bring it back.** It existed to catch
transcription errors from a PDF, and results arrive structured through the Randox
API now — so there was nothing being transcribed and nothing for the step to
catch, and a person retyping what the laboratory already sent added a delay and a
typo risk without adding a check. CLINICIAN_REVIEWED stays and is the only gate:
one click, and it is a clinician deciding a patient can see this, which is a
different question from whether the numbers copied across correctly. Enforced
server-side in `lib/reportTransitions.ts` — `review` only from PARSED, `release`
only from CLINICIAN_REVIEWED. No bypass, no setting that skips it.

**`verify` is a CORRECTION, not a stage.** It is how a clinician fixes a value or
keys in a report that never came through the API, it may repeat, and it lands
back on PARSED. If it ever lands on a status of its own again, that status is a
gate whether or not anybody meant it to be, because `review` would have to be
permitted from it. It also CLEARS the holds, because a person has just entered
every row deliberately.

**The console reads clinician.** "Clinician console" in every eyebrow and in the
sidebar; the `/admin` routes keep their URLs because they are in bookmarks. The
button that said "Save & mark as verified" says "Save results, review later" —
a label claiming a check that no longer exists is the removed stage surviving as
a word. Release audit entries name the clinician and mean a clinician judged this
releasable. `ADMIN_EMAILS` still governs who may act; no new non-clinical role
was invented, and if one is ever added it does not get the release action.

## What "a clean parse" means, and it is load-bearing

`lib/cleanParse.ts` is the single definition, because anything it lets through
reaches a clinician who has no way to know something is missing. The conditions
are a CLOSED LIST of five, each a fact about the delivery:

1. **UNMAPPED_ANALYTE** — a row the laboratory sent that no marker answered to.
   The commonest one in practice: the analyte map has never been confirmed
   against a real payload.
2. **UNFILED_ROW** — matched a marker but could not be written (no usable
   two-sided range, an unparseable value, a duplicate marker on one report).
3. **UNRECOGNISED_CODE** — a void or caveat code not in the configured map. It is
   already treated as void and the result withheld, which is the safe default,
   and it means a test the patient paid for is absent for a reason nobody has
   read. This is the ONE case where a withheld-by-the-lab exclusion holds.
4. **LAB_DISAGREEMENT** — Randox's own `lowHigh` contradicts the status we
   computed from the value and the range they sent.
5. **PARTIAL_DELIVERY** — the laboratory has not finished reporting the order.

**Two deliberate non-conditions.** A result withheld under a RECOGNISED void code
does not hold — that report is complete as far as anyone here can make it and the
exclusion is on the record. Nor does an out-of-range result: a significantly
raised marker is a clinical finding, which is exactly what the clinician is being
asked to look at, and holding on it would make the queue the whole report list.

## A hold is a property of the report, not a stage

`Report.holdReasons` (plus `heldAt`, `holdsAcknowledgedAt/ById`). A four-state
pipeline has no state left to park a problem in, and the failure that has to be
impossible is a report with an unmapped analyte in it looking identical, on a
clinician's queue, to one with nothing wrong. So:

- PARSED with no holds is "awaiting clinician review"; PARSED with holds is HELD.
  `queueState()` on the server and in `lib/reportStatus.ts` is the one place that
  distinction is made, and every label function takes the holds as well as the
  status. A function that only sees the status cannot tell them apart.
- `reviewReport` REFUSES to approve a held report without `acknowledgeHolds`. The
  acknowledgement is stamped on the report and the reasons AS THEY STOOD are
  copied into the audit entry, because the report's own holds are cleared by the
  next correction. Requesting changes needs no acknowledgement — sending a held
  report back is the right answer to a hold.
- This is NOT a second gate: it is part of the one review action.
- A new hold retracts any previous acknowledgement (`holdFieldsFor`), or a
  clinician who acknowledged one problem would have silently pre-cleared the next
  delivery's.
- The work queue leads with HELD. It used to lead with CLINICIAN_REVIEWED on the
  reasoning that those patients have waited longest — still true, and no longer
  the most urgent thing, because held is now the only thing standing between a
  bad parse and a clinician's screen.

`reportTransitions.test.ts` and `cleanParse.test.ts` pin all of it, including
that `clean` is exactly "no holds" rather than a second judgement that could
drift from the list.

## What the catalogue reference range fallbacks are still for

They were built to suggest a range in the verify form. That form is no longer a
gate, so the honest answer to "does that work retain its purpose":

- **Yes, and unchanged in kind.** `resolveReferenceRange()` is read in exactly
  two places, and NEITHER was the gate: `reports/service.ts` (the parse
  response's per-row `fallback`, `fallbackProvenance` and
  `fallbackUnavailableReason`) and `panels/router.ts` (the marker-library
  suggestion endpoint). Both still run — the verify form still exists as the
  correction and manual-entry route, and it is now a CLINICIAN who sees the
  suggestion and its provenance tier rather than an administrator.
- **Its importance went up, not down.** A missing or one-sided range is an
  UNFILED_ROW, which holds the report. The fallback is what a clinician uses to
  clear that hold, so a catalogue with a sourced range is now the difference
  between a report a clinician can release and one that sits in the exception
  queue.
- The provenance tier being on screen matters more for the same reason: the
  person reading it is now the person releasing the report, not somebody handing
  it to them.
- Nothing about the sourcing rules changes. `RANDOX` is never overwritten by
  `PUBLISHED`, specificity beats provenance in the tie-break, unsourced stays
  flagged, and the twenty blanket `ANY` rows on sex-dependent analytes are still
  the open problem recorded in docs/audits/reference-ranges.md.
- Admin role only via ADMIN_EMAILS, checked per request
- Editing a released report versions, never overwrites
- Every admin view of patient data is audited, not just edits
- No hard deletes anywhere
