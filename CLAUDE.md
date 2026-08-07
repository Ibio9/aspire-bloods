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

## Status tints — traffic-light coding IS wanted (changed Aug 2026)
This overrides the old "no green, amber or red anywhere" rule. Patients expect
traffic-light coding on a blood result and the clinic asked for it. Do not revert it.
- Five tints as a soft background wash on result cards and rows: red significantly
  out, orange out, green in range. Tokens only (`bg-tint-*`), never a hex.
- Tint is a SURFACE WASH ONLY. Text, borders, headings and icons stay in the
  existing palette. No red body text, no warning icons, no pulsing.
- The shape-and-label layer is unchanged and still carries status on its own:
  level mark in range, chevron out, doubled chevron significantly out, plus the
  word. Colour is reinforcement, never the sole carrier.
- Low-saturation and warm-leaning, sitting on cream and on the dark browns.
  It must still read as a premium warm product, not a dashboard.

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

# Rules
- Never colour alone for status — text label + icon shape carry it first
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
