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
Cormorant Garamond display · Inter body and all numerics (tabular figures)
Match the Aspire Rota sign-in for craft level. No default browser styling anywhere —
no native selects, no Chrome autofill blue, no native focus rings.

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

## Light and dark
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

# Rules
- Never colour alone for status — text label + icon shape carry it first
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
- Nothing auto-publishes; release is an explicit state change
- Admin role only via ADMIN_EMAILS, checked per request
- Editing a released report versions, never overwrites
- Every admin view of patient data is audited, not just edits
- No hard deletes anywhere
