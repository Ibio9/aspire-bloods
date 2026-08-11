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
not the problem.** `tailwind.config.ts` imports the tokens from
`@aspire-bloods/shared`, whose package `main` points at `dist/`. Start Vite
without building that package and jiti resolves the import to nothing,
`Object.keys(typeScale)` throws inside PostCSS, and the app is served with NO
STYLESHEET AT ALL — which looks exactly like a botched type migration and sends
people hunting through the tokens. `npm run dev:web` and `dev:server` build
shared first for this reason, and the config throws with a named message if it
is ever reached unbuilt.

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
   and orange to red, with the result plotted in its own state's colour.
3. Trend charts — the reference range as a soft green band, yellow immediately
   above and below, red beyond the significantly-out thresholds, orange as the
   transition. Bands sit behind the data at low weight. Points take their own
   state's colour. Band boundaries come from THAT result's reference range and
   THAT marker's severity threshold (sent as `severityThreshold` on the DTO,
   see `statusBands()` in packages/shared) — never a fixed scale.
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

# Sessions
- Patient idle timeout is **90 minutes**. Staff is **15** and is a separate
  constant — raising one must never raise the other, and idleSession.test.ts
  asserts the pair. Neither is the access-token lifetime (15m) or the refresh
  token (30d); those are security primitives and stay untouched.
- The "stay signed in" warning lead is a share of the window, capped:
  5 minutes for a patient, 3 for staff (`idleWarningLeadMsForRole`).

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
- Markers declare a resultType: MEASURED / GENETIC / SENSITIVITY / COMPOSITION.
  Only MEASURED reaches the results grid, the counts strip, the category bars and
  Trends. The other three get their own sections and their own framing, and never
  a status, a tint, a reference range or an optimal band.
- Markers group by health area (MarkerCategory), many-to-many — one Albumin record
  in four areas, never four Albumin records
- Auth cards never scroll internally at any viewport. If a step doesn't fit,
  restructure the step; never add a scrollbar.
- Optimal ranges: published guidance with a named source, or an explicit entry with
  low/high null and the reason. Never invent one, never extrapolate from a related
  marker.
- Reference ranges live on the result, not the marker
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
  unsourceable stays as it is and goes on the list. Explanation copy may be
  corrected for punctuation and for the fixed non-diagnostic vocabulary table,
  and for nothing else: ~350 of them were written by an assistant and none has
  been read by a clinician, so replacing text that looks wrong with more
  unreviewed text relabels the risk rather than reducing it. Both audits
  regenerate into `docs/audits/` (`npm run audit:explanations` /
  `audit:ranges` in apps/server) and both are read-only.
- Demo values must be ones a clinician would not find absurd. The severity
  threshold is a multiple of the range WIDTH, which invents a chloride of 65 and
  a neutrophil count of 19.5 — so the demo carries an outpatient envelope
  (`DEMO_ENVELOPE`) and a marker whose required excursion falls outside it is not
  chosen for that quota. Never clamped instead: a clamped value computes to a
  different status than the one it was generated for.
- Nothing auto-publishes; release is an explicit state change
- Admin role only via ADMIN_EMAILS, checked per request
- Editing a released report versions, never overwrites
- Every admin view of patient data is audited, not just edits
- No hard deletes anywhere
