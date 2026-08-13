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

**THREE LABEL CLASSES, AND A CARD MAY NOT USE ONE OF THEM TWICE.**
`.eyebrow` is the ordinary section label. It cannot also be the HEADING of a
card whose contents carry labels, and on the marker explanation card it was
exactly that: "What this marker means" in `.eyebrow` above three of "If it's
high" in `.eyebrow` — four peers, in which the one that is a heading had nothing
to say so, and three repetitions of a treatment out-read one instance of it. So
`.card-eyebrow` is the heading and `.sublabel` is the label half of a pair
inside such a card, in **sentence case** with no tracking. What a subordinate
label gives up is the SHOUT — uppercase at 0.14em is what makes a label loud —
and never the size or the tone. The weight stays at medium in all three:
"quieter" must never become "fainter". All three carry `break-after: avoid` in
`@media print`.

**A LABEL GOES ABOVE THE TEXT IT LABELS, IN BOTH SENSES (Aug 2026, fourth and
last attempt).** The three classes are **21 / 28 / 21px**, not 12 / 16 / 12, and
every label in the product is now LARGER than the copy it introduces:

    .card-eyebrow   28px semibold uppercase tracked   a card's heading
    .eyebrow        21px medium   uppercase tracked   every section label
    .sublabel       21px medium   sentence case       a label inside a heading
    body copy       14 / 16 / 18px

`WHAT THIS MARKER MEANS` at 16px stood over a 28px sentence; `LATEST RESULT`,
`TREND OVER TIME` and `PREVIOUS RESULTS` at 12px stood over 14–18px body copy.
**The three previous attempts all moved WEIGHT, TONE, TRACKING and SPACE and
left the SIZE alone, and all three failed for one reason: at two-thirds the size
of what it labels, no amount of weight makes a label the stronger element.**

**TWO THINGS A LABEL MAY NEVER OVERTAKE**, and both are content rather than
chrome: **the value on a result** (`LATEST RESULT` sits over a 72px hero value
and a card's figures are 28px) and **a page title in Fraunces**
(`.display-heading` clamp(38→72px), `.section-heading` 38px). That is what fixes
the eyebrow at 21px exactly — one step above the largest body copy (18px) and
one step below the smallest thing it may not beat (28px, which is both a card's
numeric value and the Fraunces lead in the explanation card). It is the only
step that satisfies both, so it is a step of the scale and not a number.

**`.card-eyebrow` is the one that stops at EQUAL rather than larger**, and
deliberately: the step past 28px is 38px, and a 38px uppercase tracked label
sets "WHAT THIS MARKER MEANS" at ~670px, wraps in the card and reads as the
page's title. Equal size plus semibold plus uppercase plus 0.14em against
Fraunces regular is not a close contest.

**AN EYEBROW IS SIZED AGAINST WHAT IT LABELS, AND IN CHROME THAT IS 14px.**
`.chrome .eyebrow` is 16px — still a step above what it names. `.chrome` is a
closed list of surfaces where an eyebrow labels navigation or controls rather
than reading matter: both shells' sidebars and their mobile drawers, the account
menu, a Listbox popup and the command palette. NOT a fourth label class and
never put on a page, a card or a section. Two measured reasons, both from the
288px sidebar: `OPENING HOURS` and `EMERGENCY LINE` at 21px are 250px and 268px
in a 232px column, so both wrapped and the contact block then clipped its own
last line; and `PATIENT PORTAL` at 21px was larger than every nav label under it
and louder than the wordmark above it, which is `.nav-label`'s own recorded
argument one level up. The same component can land on both sides of the line —
`ClinicContactLines` renders ADDRESS at 16px in the sidebar and 21px in the
out-of-range card, which is right in both places because the content beside it
differs.

**A LABEL THAT WRAPS SHOULD LOOK LIKE IT MEANT TO.** `text-wrap: balance` on
`.eyebrow` and `.card-eyebrow`. At 21px with 0.14em a long label is half again
as wide as it was, so on a phone some now take two lines — the problem is not
the wrap, it is the ORPHAN: `ASPIRE CLINIC · PATIENT PORTAL` broke after
"PATIENT" and left PORTAL alone under a 30-character run.

**AND A ROW OF LABEL/VALUE PAIRS ALIGNS ITS VALUES.** A wider label wraps in
more places, and in the Overview's most-recent-panel strip "In the usual range"
is 267px of text in a 237px cell while "Markers" is 118px — so one figure of
three sat 31px below the other two. `flex flex-col` on the pair and `mt-auto` on
the value pins every figure to the floor of its own cell, for a label of any
length. It costs a uniform gap under the short labels and that is the cheaper
half of the trade.

**If this ever looks wrong again, MEASURE the computed style, the margins AND
the natural width of the longest label before touching a value** — it has been
eyeballed wrongly three times.

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

## Glass, not fill, is how a surface separates itself from the page (Aug 2026)

**Reach for glass before you reach for a colour.** The corner glow means nothing
may paint an opaque background over the page, and that single rule is what
unpinned the results control bar, kept the sidebar a flat 6% wash, and made
every sticky surface in the product a choice between "invisible" and "paints
over the light". Glass is both at once: a translucent warm sheet over a backdrop
blur is a surface, and the light and the content behind it still come through.

**One material, three numbers, one class.** `GLASS` in tokens.ts holds the blur
radius, the saturation and the per-theme alpha; `.glass` in globals.css is the
only place they are applied.

**THE BLUR IS MEASURED, AND THE RADIUS IS NOT THE COST.** It was written down as
"14px, a frame budget", which is a guess with a unit on it. Profiled over a
3-second scroll of the by-marker view with the bar pinned
(`e2e/zz-render-timing.spec.ts`): **60fps with the filter off, 23fps at 14px,
and 25fps at 2px.** What is paid for is the EXISTENCE of the backdrop pass, not
the work inside it, so "reduce the radius until it stops dropping frames" has no
answer above zero. It is 10px now — the only value that measured better, and
free to take.

**That measurement is headless Chromium, which rasterises in software** — the
worst case for a backdrop filter and not what a patient's browser does. It is a
floor, not a verdict, and it is **not** grounds for going back to an opaque
fill, which would paint over the corner glow. Measure it on a GPU-backed
browser before concluding anything about the design.

**The colour is the CARD tone, never the page.** Glass the colour of the page is
invisible against the page.

**Only the alpha differs per surface, and only because what is behind them
differs.** The sidebar keeps `--panel-wash` (6% light / 38% dark) because nothing
passes under it but the page and the glow, and its measured contrasts are pinned
to that number. The control bar, the chart tooltip and the download button take
`--glass-wash` (62% / 58%) because the reader's own results pass under them, and
a 6% wash over moving body copy is not a surface, it is a smear.

**The mobile drawer keeps its opaque fill.** It is a layer over scrimmed content,
not part of the page, and navigation read through the page it navigates is worse
than either.

**`@supports not (backdrop-filter)` goes almost solid rather than transparent.**
Body copy legible straight through a pinned bar is worse than losing the glow on
one browser.

## The results control bar is pinned again, on glass (Aug 2026)

Sticky, unboxed, and the glass **appears only once it pins** and **fades in**
rather than snapping — a sheet of glass over the page at rest is a panel nobody
asked for, and a surface that appears from nowhere on the first wheel click reads
as a fault. It reaches past the content column by exactly the shell's own page
padding, so nothing sharp shows beside it.

**Only ONE boolean is written by the scroll handler and it is the glass.** The
rule from the last time this bar was pinned stands unchanged: nothing derived
from scroll may write the filters panel's open state. That is what made the
disclosure fail to toggle, and the panel is the reader's.

It pins to `--shell-sticky-top` (globals.css): zero on desktop, `3.5rem` below
md, which is the patient shell's mobile header. That header carries `h-14`
rather than vertical padding **precisely so the number can be written down** — a
height derived from whatever the tallest child happens to be is a number that
changes when somebody swaps an icon, and the bar would then pin a few pixels off
with a strip of scrolling content showing through the gap.

## Traffic-light status — wanted, everywhere (changed Aug 2026)
This overrides the old "no green, amber or red anywhere" rule. Patients expect
traffic-light coding on a blood result and the clinic asked for it. Do not revert it.

**The five states, their three hues and their two hinges.** Significantly below
and significantly above are RED. Below and above are YELLOW. In range is GREEN.
OLIVE is the transition between green and yellow, drawn AT a reference bound;
ORANGE is the transition between yellow and red, drawn AT a significantly-out
threshold. Neither hinge is ever a state a result can be in — each is the middle
of a blend centred on a boundary, and olive exists because the gradient moved to
the boundaries and the green→yellow one needed the midpoint colour the
yellow→red one already had. Five states, three hues: direction is carried by the
chevron and the word, never by colour, which is why high and low share a hue and
both significants share one.

**Where it appears, and it must appear in all of them:**
1. Result cards and rows — soft background wash (`bg-tint-*`).
2. The range bar — flat green across the reference range, flat gold outside it,
   flat red beyond the thresholds, with a BLEND CENTRED ON each of the four
   boundaries between them. The same instrument as the chart's bands, from the
   same derivation (`bandRampStops`), so the two speak one visual language; the
   whole track is ONE CSS gradient rather than five abutting segments, which is
   what stops two neighbours disagreeing by a rounding at the seam.
   **AND THE SAME FIVE COLOURS, SINCE THE BANDS WENT OPAQUE (Aug 2026).**
   `bandRampStops` used to take a ROLE — `plot` for the chart, whose bands were
   composited at an alpha, `track` for a bar, whose segments were painted. Two
   palettes for one vocabulary: a marker card showed a bar in one green directly
   under a chart drawn in another, and the bar had no weight ladder on it at all
   (its old track colours measured 2.05, 1.86, 1.68, 2.01, 2.65 off the card —
   gold FAINTER than in range). The role parameter is gone, both instruments
   paint `--c-hue-*-fill`, and the ladder is on the bar for the first time.
   **THE SCALE IS NOT THE REFERENCE RANGE, AND THE PRINTED ENDS SAY WHICH IT
   IS (Aug 2026).** The two numbers under the bar were `low` and `high`
   whatever scale had actually been drawn, so the picture was right and the
   axis on it was false — the worst of the three available combinations. Two
   live examples in opposite directions: 122 against 0–41 drew the mark hard
   against the right-hand end under a label reading "41" (a patient reads that
   as "just at the top of my range"; it is three times the upper limit), and 65
   against 125–375 drew the mark INSIDE a bar labelled 125 to 375, a range the
   value is entirely below. `rangeBarScale` (apps/web/src/lib/rangeScale.ts) is
   the one derivation, shared by both bars: it always contains the value with
   headroom, always contains the reference range, rounds its ends OUTWARD to a
   1/2/2.5/5 ladder so the printed number is one somebody would have chosen,
   and the reference bounds are marked and labelled WITHIN it — muted ends, the
   bounds in the text colour on a tick, and a scale end dropped where a bound
   would print over it. **THE MARK IS NEVER CLAMPED**; the scale is built to
   contain it, so there is no edge to pin it to. Where the value is so far out
   that the reference range would be under 5% of the bar, NOTHING IS DRAWN and
   the fact is said in words instead. `rangeScale.test.ts` pins both live
   examples by their own numbers.
   **A BAR WITH NO AXIS IS A BAR WHOSE AXIS IS WHATEVER FIGURES ARE NEAREST
   (Aug 2026).** The card bar printed nothing at all, on the reasoning that the
   card already says the reference range in words underneath and repeating it
   would be the same fact twice in a space with none to spare. That was about
   the wrong two numbers. The third live example: 3.4 against 3.8–5.8 drew its
   mark correctly, at 23% of a scale running 2 to 8, on a card whose only
   figures anywhere near the bar were "Lab reference range 3.8–5.8" two lines
   below — so the bar read as running 3.8 to 5.8 and a value BELOW the entire
   range read as one inside it. Exactly the failure the full bar had just been
   rebuilt to stop making, surviving in the one place nothing was printed. The
   card bar now prints its two ends (muted, mono, one line); four labels do not
   fit at 15rem, so the reference bounds keep their ticks there and are named in
   words below. **Never print a range bar without its scale.**
   **THE LABELS COME OFF THE SCALE OBJECT** (`minLabel`/`maxLabel`), not from a
   formatter in the component, so a bar cannot print a number describing a
   different scale — `Number(minLabel) === min` exactly. And where a bound
   collides with a scale end, the one that survives is the one still true of the
   end: identical text drops the end (0 and 0), **different text keeps the end
   and drops the bound's number**, since a range of 1–1,000,000 on a scale from
   0 would otherwise leave "1" standing at the far left of a bar starting at 0.
   **THERE ARE FOUR REASONS NOT TO DRAW, AND ONE SENTENCE EACH** — no reference
   range, a range with no width, no numeric value, and too far out to show both.
   They shared one sentence about being far outside the range, which was true of
   one of them; `RANGE_BAR_UNAVAILABLE` in rangeScale.ts holds the copy, so a
   new reason without its words is a type error. `rangeBarScale` takes nullable
   bounds and a nullable value BY TYPE and refuses each by name — typing them as
   plain numbers never stopped a null arriving, it only stopped the function
   being written to survive one, and `NaN - undefined` reaches `left: NaN%`.
   `min`/`max` are finite and `max > min` in every case including the refusals.
   **`rangeScale.property.test.ts` runs the invariant over ~5,000 generated
   inputs** — an enumerated spread of range shapes crossed with value positions,
   plus a seeded sweep across twelve orders of magnitude — asserting that the
   mark's drawn fraction equals the value's true position on the PRINTED scale,
   that the printed ends bound everything the bar contains, that a value below
   the range is drawn left of it, and that the mark lands in the segment its own
   status names. Seeded and deterministic: a property test that cannot reproduce
   its own failure is a rumour. `RangeBar.test.tsx` pins the card bar at the
   reported numbers through `react-dom/server` (no jsdom, no testing-library).
   **The MARK on it is NOT a status colour (Aug 2026).** It
   is the `rangemark` token: pure white in dark, espresso in light, always
   inside a ring of the opposite tone. A mark drawn in its own state's colour is
   a mark drawn in the shade of the segment it is standing on — a green dot on
   the green band, pale gold on the gold one — and the mark's job is POSITION.
   The fill inverts between themes because it was measured: white against the
   four track colours was 4.69–5.71:1 in dark and 1.73–2.72:1 in light, and the
   pale green in-range track 2.11:1, which is a white dot that vanishes. It is
   re-measured against the band fills the bar paints now (Aug 2026) —
   4.25–6.52:1 in light, 6.88–10.58:1 in dark — and `tokenContrast.test.ts`
   holds it at AA-large on every segment it can stand on, the optimal narrowing
   included. Status is still carried four times over by the segment, the
   chevron, the word and the card's own wash. Applies to both bars — the card-sized pointer
   is an SVG triangle rather than a CSS border trick precisely so it can take
   the same ring.
3. Trend charts — the reference range as a soft green band, gold immediately
   above and below, red beyond the significantly-out thresholds, with the two
   hinges at the boundaries between them. Same ramp as the range bar.
   **THE OPTIMAL RANGE IS A NARROWING OF IN-RANGE AND IS DRAWN AS ONE (Aug
   2026).** It was a hatched bronze band with a dashed edge and its own key
   entry, over a green reference band — two overlapping green things in two
   textures, reading as two systems making competing claims about one result.
   It is one region now, on the bar and on the chart alike: the same green
   taken a rung deeper (`OPTIMAL_FILL`, an opaque token since Aug 2026 — it was
   `OPTIMAL_DEEPEN`, 0.09 of alpha on the chart, against a different green at
   0.24 on the bar, which is two alphas of two colours for one idea) over the
   INTERSECTION with the reference range, bounded by the same neutral hairline
   every other boundary uses. Drawn as the intersection deliberately — a published band whose
   ceiling sits above the lab's has no narrowing to draw past that point, and
   green painted over the gold segment is the two-systems problem in a worse
   form. `chart.optimalBand` / `optimalBandOpacity` / `optimalEdge` are GONE.
   It is named ONCE, inline, where the value already says "outside optimal":
   the chart tooltip and the line above the chart. **No key entry, no hatch,
   no second texture.** Bands sit behind the data at low weight. Points take their own
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
   **THE DEMO SEED CONTAINS NO STEP AT ALL — ONE REFERENCE RANGE PER MARKER,
   FOR THE WHOLE OF A PATIENT'S HISTORY (changed Aug 2026).** It was an
   allow-list (`DECLARED_RANGE_CHANGES`) with `fasting-insulin` on it, catching
   `vitamin-d` and `ferritin`, which had drifted because three rows of a
   hand-written table happened to differ and both computed to the SAME status
   against either range. An allow-list is a check on a thing that can still
   happen. **`resolveBand` in demoSeedData.ts answers ONCE PER MARKER** —
   NARRATIVE_RANGE, then the catalogue, then a synthetic band — and every report
   reads that same object, so there is no second source for a band and
   `findRangeChanges` on a built demo is empty by construction.
   `buildDemoReports` throws on ANY change and there is no list to add a marker
   to. fasting-insulin's story is unchanged: the functional band (2–10) is
   simply the band on all three draws, and 24.6 against it is still
   significantly high.
   **THE STEP MACHINERY STAYS AND IS TESTED FROM EXPLICIT FIXTURES.** Randox
   will move a range for real eventually. `referenceRangePeriods` /
   `periodStepBoundaries` (packages/shared/src/statusBands.ts) are the one
   derivation the chart's bands, step rules, per-period bound labels and
   range-change sentence all read, pinned by
   `apps/server/tests/referenceRangePeriods.test.ts`; and
   `e2e/chart-bands.spec.ts` BUILDS its stepped series — two reports, one
   marker, 30–400 then 20–200 — rather than hunting the demo for one. A test
   that depends on the demo happening to contain a step goes quiet the moment
   the demo stops.
   **THE BANDS ARE CONTEXT AND THE LINE IS CONTENT.** They were four opaque
   saturated slabs edge to edge with a near-solid rule over every boundary,
   which is a fill tool rather than a chart: at equal weight and full strength
   five regions of colour ARE the picture and the reader's own result is a
   detail on top of them. What that ordering means is unchanged and is the
   thing to keep: the reader meets the line first and the bands second.
   **Hairlines** — boundaries are 1px at low opacity, and the reference bounds
   are LABELLED INLINE on the axis. **Axes** — round tick values only (the
   y-axis read 0, 8, 16, 24, 31.9, and 31.9 is not a number anybody chose), four
   of them, no gridlines and no box.
   **AND A BAND IS OPAQUE (Aug 2026). THERE IS NO ALPHA IN ONE ANYWHERE.**
   Not on the rect, not in a gradient stop, not on the optimal narrowing over
   it: nothing behind a band shows through it. This replaced a band COMPOSITED
   at `BAND_WEIGHT` over the plot, and it is worth knowing why that could never
   be tuned into working. **The chroma of a composited band is very nearly
   `weight × chroma(hue)`**, so a band drawn at 15% of a colour carries at most
   15% of a colour whatever colour it is given — which is what "washed out" was,
   and why the git history holds three separate re-solves of the hue all hitting
   the same ceiling. The ceiling was the alpha. `bandEdgeFade` went with it for
   a second reason: a band that fades at its own edges has no edge, on a plot
   whose entire subject is a boundary.
   **THE LADDER DID NOT GO AWAY — IT MOVED INTO THE COLOUR.** In range lightest,
   out-of-range more, significantly out most, exactly as before, now stated as
   `BAND_CONTRAST` (statusBands.ts): the contrast each rung's fill is solved to
   stand off the surface it is drawn on — **1.5 / 1.88 / 2.3**, with the two
   hinges at the derived midpoints. `--c-hue-*-fill` is the painted colour and
   `BAND_FILL` (tokens.ts) is the solve. Only the HUE ANGLE is the brand hue's
   own; the lightness and the saturation are both solved.
   **THE CHROMA CAP IS PER HUE, AND IT IS DERIVED FROM THE PALETTE (Aug 2026).**
   It was ONE saturation cap, `BAND_FILL_SAT_CAP = 0.6`, applied to all three —
   green kept its own 41% and gold and red were both pulled to 60% — and the
   complaint that killed it was that red read as red while green read as olive
   and gold as brown. **A single cap cannot work**, because HSL saturation is a
   RATIO and the ladder deliberately puts the three hues at very different
   lightnesses. Measured in OKLab chroma at the old numbers: light 0.0915 /
   0.1242 / 0.1037, dark 0.0696 / 0.0727 / 0.1412 — one cap flattering gold in
   light and red in dark and starving green in both.
   Each hue now gets as much chroma as it can carry at its own rung's lightness,
   bounded by **`bandChromaCeiling`: the colourfulness of the BRAND HUE it
   derives from**. A green band as chromatic as `statusHue.green` cannot be out
   of the palette, because that IS the palette's green. Per hue by construction,
   and not a number anybody typed in. After: light 0.1234 / 0.1407 / 0.1341
   (within 14% of each other), dark 0.0985 / 0.0812 / 0.1593. Every band gained
   — green +35%/+42%, gold +13%/+11%, red +29%/+13%.
   **THE MEASURE IS OKLab CHROMA, NEVER HSL SATURATION AND NEVER THE RGB SPAN.**
   Saturation is a ratio and calls a pale pink and a fire-engine red the same
   figure. The RGB span is the FLOOR tokenContrast.test.ts holds and is right for
   a floor; solved for an equal RGB span the three came out `#98db65`, `#cfb158`,
   `#eb8677` — a highlighter green beside a dull gold — because a green at 63%
   lightness holds an enormous span while looking ordinary and a red does not.
   **DARK'S GOLD IS THE ONE THAT IS STILL SHORT, and it is the GAMUT and not the
   cap.** The rungs are contrasts against a near-black surface, so gold's 1.88
   puts it at 21% lightness, and a yellow at 21% lightness is a brown in any
   colour space. Uncapping its saturation entirely buys 7% and still returns a
   dark ochre; lifting the whole ladder ~30% buys 15% and costs the chart the
   thing the ladder is for. Both were measured and neither was taken.
   **THE MEASURE IS THE GEOMETRIC MEAN OF TWO SURFACES.** One fill is drawn on
   the chart's plot panel and on the card a range bar sits on, and those two are
   not the same distance apart in the two themes. Solving against the card alone
   left the CHART's bands 33% apart between light and dark; against the plot
   alone, the BAR's 30% apart. The geometric mean splits it: both instruments
   land within 16%, inside the 20% tolerance tokenContrast.test.ts has always
   held bands to.
   Orange survives only in the significantly-out bands: below-range is a fifth
   visible at a typical axis scale, so ramping it out to orange painted the
   transition-into-significant immediately below the reference bound.
   **THE GRADIENT IS AT THE BOUNDARY, NOT ACROSS THE BAND (Aug 2026).** It has
   now been flat slabs, then a ramp running the whole width of each band, and
   both were wrong in the same place. A hard edge at the reference bound says
   the bound is a cliff — a value one unit inside a range and one unit outside
   it are not clinically different — and a ramp across a whole band says the
   opposite falsehood, that the middle of "above range" is a transition. So
   each of the four boundaries is drawn as a blend CENTRED ON ITSELF, at a
   fixed share of the DRAWN EXTENT (`TRANSITION_SHARE`, 11%, ±5.5% either side)
   rather than of the range — so the blend is the same handful of pixels on a
   3.9–5.1 marker and a 30–400 one. Flat green across the range, blend at the
   bound, flat gold, blend at the threshold, flat red. The bound sits at the
   MIDPOINT of its blend, so a result exactly on the limit is drawn exactly
   half in each colour, and the boundary hairline runs through the middle of
   the gradient rather than along its edge. `bandRampStops` (statusBands.ts) is
   the ONE derivation, shared by the chart and by both range bars — the bar and
   the chart speak one visual language, and the mini bar's old "flat segments,
   a ramp at this size is a smear" objection went with the ramp it was about.
   **THERE ARE TWO HINGES NOW, AND NEITHER IS EVER A STATE.** Orange was on its
   own for as long as the ramp ran across a band. A blend centred on a
   reference bound needs a midpoint colour in exactly the way the threshold
   already had one, so `statusHue.olive` is the fifth hue: the exact RGB
   midpoint of green and yellow, written out, because "half of each" is the
   whole claim the gradient makes. OLIVE at a reference bound, ORANGE at a
   severity threshold.
   **AND A HINGE IS A MIDPOINT WHERE IT IS DRAWN, NOT A HUE THAT IS SOLVED
   (Aug 2026).** Only the three STATES get a solved `BAND_FILL` lightness; olive
   is the exact RGB midpoint of the green fill and the gold one, orange of the
   gold and the red. Solving a hinge on its own broke the very thing it is for:
   `statusHue.olive` is 57% saturated against green's 41%, so an
   independently-solved olive came out MORE chromatic than either neighbour and
   drew a bright chartreuse stripe down the middle of the blend. A hinge cannot
   also be held to a rung — an RGB midpoint is not a contrast midpoint, because
   WCAG luminance is not linear in RGB — so what is asserted of it is that it IS
   the channel-wise midpoint and that it lands between its neighbours.
   **THE LADDER IS CONTINUOUS ACROSS A BOUNDARY.** Both adjacent bands name the
   same stop, at the same value, in the same colour, so the fill is continuous
   across a boundary drawn as two separate shapes. `markerCopy.test.ts` pins the
   hand-over; `status-colour.spec.ts` reads the painted stops off the plot and
   checks that every one of them is opaque, that each is one of the five fill
   tokens, and that both sides carry each hinge.
   **THE GRADIENT IS PLACED BY VALUE, NOT BY THE RECT.** A band can reach past
   the domain and the outer two are open-ended, so the rect is clamped — and a
   gradient laid out across the clamped rect finishes its ramp early, putting
   orange somewhere in the middle of the above-range region rather than at the
   threshold where orange means something. Every stop is placed by its value
   and converted onto the rect's own extent, which is why there is ONE GRADIENT
   PER DRAWN BAND rather than one per status. **And only the NEAREST stop
   outside the rect survives on each side**: where two clamp to the same edge
   the one that paints it is whichever the sort left last, which on an HDL with
   a 1–999 range put the orange from a threshold at 3495 across the top of a
   plot ending at 1250. Keeping the nearest gives the colour that is true at
   the edge. The range bar clamps the same way for the same reason.
   **"READS AS GREEN" IS ABOUT CHROMA** — distance from the neutral axis — not
   about HSL saturation, which is a ratio and reports a pale pink and a
   saturated red as the same figure. That is why every earlier attempt to fix
   the muted bands by re-picking a hue failed, and why the fix in the end was
   removing the alpha rather than choosing a better colour. Measured chroma of
   the painted fill against the composited band it replaced: light green
   0.114 → 0.243, gold 0.200 → 0.525, red 0.400 → 0.373 (lower, and a deeper
   opaque salmon rather than a milky one); dark green 0.125 → 0.157, gold
   0.224 → 0.275, red 0.337 → 0.467.
   **THE POINT MARK IS SOLVED SEPARATELY, AND THAT IS THE POINT.** "A mark
   clears 3:1 on its own band" used to be a constraint inside the band solve,
   which meant the BAND was being desaturated to suit the mark: dark red's
   ceiling under it was a 36%-saturation band, i.e. the maroon this has been
   through twice. The mark moves and the band does not — `MARK_SHIFT` and
   `MARK_SHIFT_DARK` are two records because the two themes fail in opposite
   directions, and each is the SMALLEST shift that clears 3.2:1 on its own
   band, because every step past that is chroma spent for nothing. Green is
   solved against the OPTIMAL fill as well, since an in-range point can land
   inside the narrowing. Every value went UP in light with the opaque bands and
   three of the five went to ZERO in dark, and that asymmetry is real rather
   than a slip: a dark band is LIGHTER than the plot it sits on, so the lifted
   hue is already clear of it, while a light band moved toward the mark. The
   cost in light is recorded rather than hidden — the gold mark is #6b592c and
   the amber #6e4e2e, dark warm browns rather than the gold and amber they were.
   Status is carried by the mark's SHAPE and by the word in the tooltip and the
   key; a mark that has vanished into its band loses the shape layer, which is
   the thing that carries it.
   **BAND_CONTRAST, BAND_FILL, LINE_LIFT AND MARK_SHIFT ARE ONE DECISION —
   change any rung and all of it is solved again.**
   **IF BRIGHTER BANDS BURY THE LINE, BRIGHTEN THE LINE.** Never dull the bands
   back down: the line is the content and the bands are the context, and that
   ordering is a fact about the chart rather than about how much ink is on it.
   `chart.lineWidth` is 3 and `chart.line` steps away from the surface in each
   theme. **It is SOLVED now rather than a step on the bronze scale (Aug
   2026).** It was `bronze-700` light / `bronze-500` dark, which cleared the
   composited bands and does not clear the opaque ones — 2.87:1 and 2.42:1 on
   the significantly-out red, i.e. under AA-large. The scale's dark end is mixed
   toward espresso, so `bronze-900` clears the band at a chroma of 0.090, a warm
   grey where bronze is the one colour on the plot meaning "your series". So
   `LINE_LIFT` solves the lightness at bronze's OWN saturation and nothing
   higher — the bronze hue sits at 19°, between the status red at 8° and the
   status orange at 30°, so a saturated bronze line would read as a status
   colour crossing the plot. It lands at 3.36:1 light and 3.33:1 dark, chroma
   0.20: darker AND more bronze in light, brighter AND more bronze in dark.
   The boundary hairline went the same way — `taupe-900` in light, where at
   `taupe-600` it measured **1.11:1** against the significantly-out band, a line
   nobody can see drawn across the region where seeing it matters most.
   `tokenContrast.test.ts` holds the line above every band it crosses (including
   the optimal narrowing), the hairline visible on all of them and below the
   line, the range-bar mark at AA-large on every segment it can stand on, and
   every band's chroma above 0.15.
   **A TICK IS DROPPED WHERE IT WOULD PRINT ON A REFERENCE BOUND**, because the
   bound is the number that means something. `TICK_BOUND_GAP` is 8% of the
   domain — 16px on the shortest plot this chart is drawn at — and it is a
   share of the DOMAIN standing in for a distance on screen, which is why 2%
   let a tick at 400 land on a bound at 375. Dropping one reruns the ladder at
   a finer step rather than falling back to the unfiltered set, which is what
   used to put the collision straight back.
   **THE PLOT IS AN INSET PANEL.** One hairline frame, no shadow, no inner
   border, a surface fractionally away from the card. "No box" was right while
   the bands were slabs tiling the area edge to edge; with flat low-weight bands
   there is real ground showing, and ground needs an edge. It is NOT a
   `ReferenceArea` — that class is what `e2e/chart-bands.spec.ts` measures band
   periods through, and a full-width panel drawn as one would register as an
   extra period.
   **THE LINE IS STRAIGHT AND HAS NO AREA UNDER IT.** `type="linear"`, never
   `monotone`: a spline between two blood draws three months apart invents a
   shape for the whole quarter that nobody measured.
   **THE MOST RECENT POINT PRINTS ITS OWN NUMBER (Aug 2026).** Every mark on
   this chart was anonymous: reading what one WAS meant hovering, which is a
   gesture that does not exist on a phone and is not one anybody thinks to try
   on a page they came to read. The latest result is the one the reader came
   for — it is already drawn larger and haloed for that reason — so it says its
   value beside itself. **ONE point, not all of them**: a number beside every
   mark is a table drawn on top of a chart, it fights the line and it collides
   with itself on a tight series. The history stays a shape; the latest result
   is a figure. **The NUMBER only, no unit** — the unit is stated once above the
   axis already. **No box behind it**: a stroke in the plot's own ground under
   `paint-order: stroke`, which is a halo the shape of the letters rather than a
   second small rectangle on a plot that already has a frame and five regions.
   **A POINT IS AN OUTLINE ON THE PLOT'S GROUND**, filled with the plot surface
   and stroked in its status colour — so the line visibly passes behind it and
   the interior is a hole in the band rather than more saturated colour. The
   most recent one is a step larger with a soft halo.
   **THE REFERENCE BOUNDS ARE PRINTED ON THE LEFT AXIS**, level with their own
   hairline, in the mono face, with a short lead rule and in the text colour
   against the muted ticks — a tick value is where the scale happens to be
   marked and a reference bound is a clinical threshold, and the difference is
   carried by weight and a mark, never by a hue. Only the CURRENT period's
   bounds go on the axis, because the axis has one left gutter; earlier periods
   keep their labels at the right-hand end of their own extent.
   **THE KEY HAS NO BAND ENTRIES.** This narrows the older rule below and does
   not break it: the bands are still never carried by colour alone, but what
   names them is now the FIGURES on the axis rather than a coloured swatch
   beside a sentence — which is a better answer to "where does my range start"
   and one a greyscale reader gets in full. The key keeps the point states, in
   words and in the marks the chart actually draws, plus the optimal band and
   the step rule. **Never a coloured rectangle.**
   The unit is printed ONCE above the axis rather than on every tick.
4. Sparklines, the counts strip, the per-category summary bars.
5. Tooltips and legends — the status word carries the colour.

**Non-negotiables.**
- The shape-and-label layer is unchanged and still carries status on its own:
  level mark in range, chevron out, doubled chevron significantly out, plus the
  word. Colour is reinforcement, never the sole carrier — red and green are the
  commonest confusion pair there is. A chart band therefore always carries a
  boundary hairline AND its bounds stated in figures on the axis; every POINT
  state is named in words in the key and in the tooltip. (Until Aug 2026 the
  bands themselves had key entries; the axis labels replaced them, which is more
  specific and equally greyscale-legible. What may never happen is a band with
  neither.)
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
- The practice is **Aspire Clinic** in everything a patient reads — including
  inside a longer phrase. It was "the Aspire clinical team" in ten places
  (screen copy, the source label, two seeded copy blocks); it is "the Aspire
  Clinic clinical team". **The `supersedes` arrays in seed.ts are HISTORY and
  are not editable**: they are matched exactly against what is stored, so a
  find-and-replace that "tidied" them would strand every database still holding
  the old text, which would then be left alone for ever on the grounds that a
  human must have written it. Add the outgoing body to the list instead. "Aspire Group
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

# The web bundle is route-split, and the boundaries are load-bearing (Aug 2026)

It was ONE 993 kB script, warned on every build. First load is now **81.5 kB of
entry + 165.6 kB of react-vendor + 74.2 kB of CSS**, and every screen beyond the
sign-in form is a chunk of its own.

- **`lazyPage` (lib/lazyPage.tsx) is the only way a route is declared.** It
  takes the module loader and the export NAME as a key of the module's own type,
  so a renamed export is a compile error rather than a blank screen on one route.
- **Suspense is per route, never once around `<Routes>`.** A single boundary at
  the top suspends the shell, so the sidebar unmounts and remounts on every
  navigation.
- **Four things load eagerly and only these**: LoginPage, HomeRouter, the two
  route guards, and PatientShell. AdminShell is deliberately NOT among them —
  most people signing in are patients and will never render the console.
  **HomeRouter must keep both its branches lazy**: it runs on "/" for everybody,
  so a static import of AdminDashboard there is a hole straight through the
  boundary.
- **recharts is 386 kB with its dependency tree** (d3-*, decimal.js-light,
  es-toolkit, and — recharts 3 keeps its state in a store — redux, react-redux,
  reselect, immer). It is reachable from two screens and is imported ONLY by
  `components/ui/LazyCharts.tsx`, whose prop types come through `import type` so
  the edge is erased before Rollup sees the graph.
- **`manualChunks` names react/react-dom/router and NOTHING else.** Naming a
  package there OVERRIDES Rollup's own splitting and pulls it back into a chunk
  the entry depends on, which is how a manual chunk map quietly undoes a lazy
  boundary.
- **`packages/shared` declares `sideEffects: false`.** Without it Rollup has to
  assume the barrel's `export * from './schemas/auth.js'` might matter and keeps
  it — which put the whole of zod (53 kB) in the ENTRY chunk on a path that
  never validates anything.
- **Splitting a feature and switching one off are different things.** With
  booking off, `lazyPage(() => import(...))` at module scope is still reachable
  from the graph, so Rollup emits the chunk and the flow sits at a URL on the
  CDN — a regression on what the flag promises that is invisible in the entry
  size. The four booking pages are declared INSIDE the `BOOKING_ENABLED`
  ternary so the arrow function holding the import folds away with it.

# The food sensitivity list is window-virtualised above 30 items (Aug 2026)

The Signature report is 23,862px tall and the 207 food items are most of it.
Virtualised **against the page's own scroll**, not inside a box: two spacers
stand in for the rows that are not rendered, so the list keeps its natural height
and there is no scrolling region inside a scrolling page. A virtualised row is
invisible to Ctrl+F and absent from the accessibility tree, which is a real loss
— so it applies only above `VIRTUALISE_ABOVE` (30), and only to a section that
already carries its own search over the food name a patient reads. The row pitch
is MEASURED from the first rendered row rather than hardcoded; a hardcoded pitch
drifts the moment somebody changes a padding token. **The framing copy is
untouched**: IgG indicates exposure, not intolerance, and no food carries a tint.

# The clinician work queue (Aug 2026)

`/admin/queue`. What is waiting and what is stuck: the buckets with a count and
the oldest item in each, every open report sorted by time in its current state
longest first, arrival-to-release median and worst over 30 days, and **the
exception queue leading the page** — with the verification stage gone it is the
only thing between a bad parse and a clinician's screen, and it was invisible.

**Nothing here is new tracking, and that is a constraint.** Every figure comes
from the report's own columns (`receivedDate`, `heldAt`, `reviewedAt`,
`releasedAt`) or from audit entries the pipeline already writes. AWAITING_REVIEW
is the one state with no column of its own — a report reaches it through parse,
re-parse, a correction that cleared the last hold, or a re-ingest — so its entry
time comes from the latest REPORT_PARSED / REPORT_VERIFIED audit entry.
`updatedAt` is not that timestamp: it moves when anything on the row changes.
The median takes the LOWER of two middles rather than averaging, so every
duration on the screen is one a real report actually took.

# Backups: THE JOB HAD NEVER RUN (Aug 2026)

**The R2 bucket was 0 bytes, empty, zero operations, and there was no backup
service in Railway at all.** The Dockerfile and the script had been in the
repository for months. Nothing deployed them and nothing scheduled them, so the
practice had no off-platform copy of its database and **nothing anywhere could
have said so** — the only evidence a run produced was a log line in a service
that did not exist.

**A backup job's failure mode is being ABSENT, and absence is silent.** Three
things close that, and all three matter:

1. **`railway.backup.json`** — config-as-code for the cron service: the backup
   Dockerfile, `/backup.sh`, `15 3 * * *`, `restartPolicyType: NEVER` (a failed
   run has already emailed and recorded itself; restarting sends the same alert
   three more times at 3am). A service must be pointed at this path explicitly,
   or Railway builds the API's Dockerfile and runs it as an always-on web
   service. DEPLOYMENT.md has the click-by-click.
2. **`BackupRun`** — every run writes a row, success or failure, over the same
   private `DATABASE_URL` it already holds. Not an API call with a shared
   secret and not a marker object in the bucket: both are a second credential
   and a second network path. FAILED rows are as important as succeeded ones —
   "no row since Tuesday" and "a row every night saying it failed" are
   different problems.
3. **The clinician work queue leads with it.** Three states, not two: never
   run, stale (over 48h), and last-run-failed. Never run says so in as many
   words rather than reading as "unknown".

**It emails `ESCALATION_EMAIL`** on failure and on a dump under 60% of the last
successful one's size — the fixed floor catches an empty dump, and only a
comparison with this database's own history catches the one that actually
happens: a valid, restorable dump a third the size it was last night. That one
**warns and still uploads**, because refusing it would turn a suspicion into a
night with no backup at all. curl + python3 in the image, because it is
postgres:18-alpine and has no Node.

**Never `CLINIC_CONTACT_EMAIL`** — a backup failure is not something a patient
is told about.

# Backups: verified nightly, drilled by hand (Aug 2026)

`scripts/backup.sh` runs as a Railway cron service against the PRIVATE
`DATABASE_URL` — never a publicly-exposed Postgres, which is why it is not a
GitHub Action. **An untested backup is not a backup**, so the job now does the
half of the test a client-only container can:

0. **THE CLIENT MAJOR VERSION MUST BE >= THE SERVER'S, AND THAT IS CHECKED AT
   RUNTIME (Aug 2026).** `pg_dump` refuses outright to dump a server newer than
   itself. The image was pinned at `postgres:16-alpine` to match
   `docker-compose.yml` — the LOCAL database, which is not the one this
   container dumps — and Railway's Postgres is 18.4, so the first real run
   failed at the DUMP stage having uploaded nothing. The pin follows the SERVER
   and it is `postgres:18-alpine`. The Dockerfile already carried a comment
   saying to bump it, which is why the fix is a CHECK: `STAGE="VERSION"` reads
   `server_version_num` and `pg_dump --version` before dumping and fails with
   both numbers and the file to edit named. Railway will upgrade again.
0b. **IT RUNS ON BUSYBOX, NOT ON GNU COREUTILS, AND THAT COST A SECOND NIGHT
   (Aug 2026).** bash is installed, so the SHELL is real bash — but every
   ordinary command is a BusyBox applet with a reduced flag set. `gzip -l`
   does not exist there. It printed a usage string to stderr, the uncompressed
   size came back as the EMPTY STRING, the empty string lost the numeric
   comparison, and a perfectly good 324 kB dump was refused with "The dump is
   bytes uncompressed, below the 262144 floor" — a sentence with a hole in it
   describing a data-loss scenario that had not happened. The size is
   `gzip -dc | wc -c` now, which both implementations have and which is also
   right about an archive over 4 GB, and every command in the file is audited
   in a block at the top. **An empty value is a FAILED MEASUREMENT and never a
   small number**: `is_positive_integer` guards each one and says "could not
   determine the size" rather than printing a message with a blank in it.
   Three secondary fixes came out of the same pass. `grep -q` under `pipefail`
   is a LIVE BUG rather than a portability one — grep exits on the first match,
   the gzip upstream takes SIGPIPE, pipefail reports 141, so
   `if ! gzip -dc … | grep -q …` was true exactly when the table WAS found;
   confirmed in the real image and never reached before because the job had
   never got past VERIFY. It is `grep -c` (reads to EOF) now. The prune
   validates its cutoff date's shape and SKIPS rather than deleting on a date
   nobody could parse. And a handled command's stderr is captured and attached
   to the failure under its stage name, instead of leaking three raw lines into
   the log ABOVE a sentence that does not mention them.
1. `set -o pipefail` matters — `pg_dump | gzip` exits with gzip's status, and
   gzip happily compresses a truncated stream. **This is what made the version
   failure safe**: gzip turns an empty stream into a valid 20-byte archive, so
   without it the job would have uploaded that and recorded SUCCEEDED. Do not
   remove it as redundant.
2. `gzip -t`, an uncompressed-size floor, and a check that the dump contains
   `COPY public."Report" / "ReportResult" / "User"`. A dump against an empty
   database, a wrong URL or a role with no read permission all produce a
   perfectly valid small gzip.
3. **It reads the object back and compares SHA-256.** `aws s3 cp` exiting 0 says
   the CLI finished, not that the bytes on somebody else's system are the ones
   that left.

The other half is `scripts/restore-drill.sh`, run by a person: restore into a
scratch database with `ON_ERROR_STOP` (without it psql prints errors, carries on
and exits 0 — a half-restored database reported as a success), compare EVERY
table's row count against the source, and hash one released report's results.
It refuses to run unless the target database's name contains "drill" or
"scratch". Retention is **35 days**, which matches PRIVACY.md §5 and §7.

# Sessions
- Patient idle timeout is **90 minutes**. Staff is **15** and is a separate
  constant — raising one must never raise the other, and idleSession.test.ts
  asserts the pair. Neither is the access-token lifetime (15m) or the refresh
  token (30d); those are security primitives and stay untouched.
- The "stay signed in" warning lead is a share of the window, capped:
  5 minutes for a patient, 3 for staff (`idleWarningLeadMsForRole`).

# The sidebar (Aug 2026)

- **THE BLUR IS NOT WHAT MAKES IT GLASS, AND NO RADIUS WILL BE. STOP TUNING IT.**
  The computed style was right — `blur(10px) saturate(1.08)` over
  `rgba(42,39,35,0.78)`, read off the element — and the column still read as a
  flat panel, because `backdrop-filter` blurs WHAT IS BEHIND, and behind this
  column there is a flat page colour and one smooth radial. A Gaussian blur of
  a smooth gradient is the same smooth gradient. Nothing back there has an edge
  to smear. A previous session diagnosed exactly this and was overruled; it was
  right. The blur STAYS, because the same material is the pinned control bar and
  the chart tooltip and the reader's own results DO scroll behind those.
  What makes it a pane is `PANEL_SHEEN` (tokens.ts), applied only in
  `.panel-wash`: a **specular sheen** (one soft 208deg band brightest at the
  top-right corner, the one nearest the glow, gone by 62%), an **inner
  highlight** along the top and right edges as an inset box-shadow just inside
  `--c-panel-edge`, and **grain** — an SVG turbulence tile at `soft-light`,
  because a grey noise at any plain opacity LIFTS the panel instead of texturing
  it. Both pseudo-elements are `z-index: -1`: at `auto` an absolutely-positioned
  pseudo paints AFTER in-flow content, so the sheen would be a sheet of light
  over the navigation rather than under it.
  **WHAT WAS ASKED FOR AND DELIBERATELY NOT DONE:** varying the panel's own
  ALPHA across its height. Taken literally that is backwards in dark —
  `--c-panel` is a PALE tone over a near-black page, so more of it away from the
  light makes the far end lighter than the lit end — and it walks the unlit
  panel up toward the card, which the page/panel/card ladder forbids.
  `PANEL_WASH_ALPHA` is untouched and every pinned number still describes the
  panel at its darkest point.
  **THE SHEEN IS BOUNDED IN LUMINANCE, NOT IN CONTRAST RATIO.** The first
  version of that test used `contrastRatio` and was nonsense in both directions:
  against a #11100e page WCAG's +0.05 floor makes two RGB levels of white
  measure 1.26:1 (a card is 1.28), so it capped the dark sheen at ~0.022 —
  invisible — while waving 0.30 of PURE WHITE through in light. The bound is
  now per theme and physical: in dark **a reflection is never brighter than the
  light it reflects** (the sheen may add at most what the glow itself adds), and
  in light, where no glow is drawn at all, it stays below a card.

- **IT IS THE GLASS MATERIAL, AND SINCE Aug 2026 THE GLASS COLOUR TOO.** The
  blur and the saturation were shared with `.glass` already; the COLOUR was
  not, and that is what kept the column reading as a flat piece of page rather
  than a surface in front of one. It was brand espresso at 6% / 38% — a faint
  tint of a colour far from every surface around it — measuring 1.10:1 off the
  light page and 1.17:1 off the dark one, against a card's 1.30 / 1.28. A tenth
  of the way to being a panel. `--c-panel` is now set from the SAME EXPRESSION
  as `--c-glass` (the card tone) so the two cannot drift, and `PANEL_WASH_ALPHA`
  is 75% / 78% against the control bar's 62% / 58%. One material, one look, a
  per-surface alpha — which was always the stated intent and was being
  contradicted by the colour. Measured after: 1.16:1 light (and the column now
  sits ABOVE the page rather than below it, the same direction as the control
  bar's glass) and 1.20:1 dark, with the glow knocked back to 1.58:1 of itself
  and the lit part still 1.20:1 above the unlit part.
  **THE CEILING IS THE GLOW, NOT THE CARD.** Past about 80% in dark the panel
  stops transmitting — its lit and unlit halves converge and it becomes a lid —
  and that binds before "stays below a card" does. `stillLit` in
  tokenContrast.test.ts is what holds it.
  **THE MATERIAL IS MEASURED ON THE ELEMENT, NOT REVIEWED.** A screenshot
  cannot settle whether the backdrop filter is there: blurring a smooth radial
  returns the same radial. And the failure mode is silent — the declaration is
  `blur(var(--glass-blur)) saturate(var(--glass-saturate))`, so one missing
  custom property makes the WHOLE declaration invalid and the browser drops it
  to `none` with no warning. `e2e/patient-sidebar.spec.ts` reads
  `backdrop-filter` and `background-color` off the aside in both themes and
  prints them.
- **The hairline is `border-panel-edge`, not `border-taupe`, and it is PER
  THEME.** One step of the taupe scale is worth very different amounts against
  a cream page and a near-black one, so light takes `taupe[700]` (2.58:1, was
  1.88 at taupe[600] and 1.40 at bare taupe) and dark stays at `taupe[600]`
  (3.40:1) — a further step there measures 5.12:1, which is a line of light
  down the side of the page rather than a hairline. It is the whole of the
  separation wherever the glow does not reach, which on a wide window is most
  of the column, since the glow's ellipse ends well before x=288px at 1440.
- **THE MOBILE DRAWER KEEPS ITS OPAQUE SURFACE.** It is a floating layer over
  scrimmed content, and navigation read through the page it navigates is worse
  than either.
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

# The marker page: two cards, 40/60, then everything else (Aug 2026)

**LATEST RESULT and TREND OVER TIME are one row of two cards**, with PREVIOUS
RESULTS inside the left card beneath the range bar, and then the explanation and
the out-of-range card below. It spent a spell uncarded and stacked full width;
what that cost was the two facts belonging together — the number and the shape
it sits at the end of are ONE answer read side by side, and stacked they became
two screens with the second below the fold.

**40/60, not an even split**, because the two are not equal weight: the left
card holds a number, a bar and a short history, the right holds the chart that
is the reason to be on this page. Five columns split two and three, the closest
simple ratio. Below `lg` they stack full width, where a 60% plot would be a
slot.

**SAME HEIGHT, DRIVEN BY CONTENT**, which is what a grid row does on its own
(`align-items: stretch`) — so neither card carries a height. **NOT `flex
flex-col` with `mt-auto` on the history**: that pair is what opened a dead zone
last time, pinning PREVIOUS RESULTS to the floor of a card whose height comes
from the chart beside it. Sections follow each other at ordinary spacing and any
slack falls at the bottom, where slack reads as nothing at all.

**THE PAIR FITS ONE WINDOW.** 1440×900 with the page header still visible and no
scroll to reach either card — measured at 380×613 + 584×613, ending at 821 of
900, by `e2e/zz-label-scale-shots.spec.ts`, which also asserts the two heights
are equal. `PREVIOUS_SHOWN` is 3 for this reason and the reason is recorded on
it: at four rows in the two-line arrangement it overflowed.

**WHAT THE UNCARDED VERSION WON IS KEPT, and it was never about the cards:**

- **THE VALUE IS BIGGER THAN THE MARKER'S NAME.** The name is a
  `.section-heading` (38px) and the value is `.hero-value` (clamp 38→72px). It
  used to be the other way round — `.display-heading` at 72px over a `text-3xl`
  value at 52px — so a page about somebody's result was headed by the word
  "Ferritin" set half again as large as the number they came for.
- **THE MOST RECENT POINT PRINTS ITS OWN NUMBER** beside itself on the chart.
- **THE EXPLANATION COMES BEFORE THE OUT-OF-RANGE CARD.** Somebody who has just
  been told their result is outside the usual range wants to know what the
  marker IS before they are told who to ring about it — the definition is
  context for the prompt, not a footnote to it.

# Vellum: the second surface register (Aug 2026)

The product had one move — near-black plus a gold corner glow — so every screen
was the same weight and nothing told a reader they had moved. `--c-vellum` is
the second register and **ONE class of content takes it: explanatory prose**,
i.e. the marker explanation card and the same component in Understanding
results. It is the only content in the portal that is WRITING rather than DATA,
and the move from "what was measured" to "what it means" is the one boundary
worth marking with a change of ground rather than another heading.

**The operation is "toward paper", not "up one rung"**, which is why it goes in
opposite directions in the two themes: paper is warm and mid-toned, so on a
near-black page it is lighter than the card and on a page whose card is already
near-white it is a shade deeper and distinctly warmer. Measured — light #f0ede7
(1.14:1 off the page, 1.14:1 off the card, text 9.3:1), dark #3d3933 (1.66:1,
1.30:1, 9.8:1). It does NOT break the page → panel → card ladder, which is
untouched in both themes: the vellum is a register beside that ladder rather
than a rung on it. No new hue — light is cream toward white, dark is the night
base toward the same warm mid-brown the surface scale already lifts with.
Applied by `.card-vellum`, which changes the background and nothing else.

# The results-ready moment (Aug 2026)

A patient signs in, a released report they have never opened is waiting, and
before the Overview they get one full-screen screen: their name, "your results
are ready", and a button. It is the only moment in the product allowed to be
about a feeling rather than a number, and **the whole of its value is that it
happens once**.

**`Report.resultsReadySeenAt` — per REPORT, on the report.** Not the session,
not localStorage, not "have they signed in before". The failure this exists
against is a moment that fires on EVERY sign-in, which is a splash screen, and
the cause of that failure is always the same shape: **a condition keyed on
something that resets**. A session resets on every sign-in; localStorage resets
on their phone, in a private window and after any cookie clear-out; a column on
the report resets never. `/auth/me` carries `resultsReadyPending` as a boolean
(same reasoning as `walkthroughSeen`: the only question is "send them there or
not", and shipping the report id invites something to render it), and HomeRouter
decides — introduction FIRST, then the moment, because announcing an answer to
somebody who has not been shown the question is the wrong order.

**Both exits spend it**, and so does opening the report by any other route: a
patient who followed an emailed link has seen that their results are ready.
It is a route OUTSIDE the patient shell — no sidebar, no breadcrumbs, no
footer — and it stands aside for the Overview when nothing is waiting, because
a moment about a report that is not there is worse than no moment.
`e2e/results-ready.spec.ts` builds its own patient and report rather than
borrowing the demo: "has this person seen this report" is one-way by design, so
a spec on the demo account would pass once per re-seed and assert nothing after.

**IT STANDS ON THE READER'S OWN OVERVIEW, BLURRED, AND ON THE FLOOR OF THE
WINDOW (Aug 2026).** Two changes, one composition: a doorway with the thing it
opens into visibly on the other side of it.

- **The ground is the real `PatientOverview`**, live, with this patient's own
  results in it — not a screenshot and not card-shaped rectangles — laid out in
  the patient shell's own geometry so the masses land where their results
  actually land. Blurred at `MOMENT_BACKDROP.blur` (24px), then veiled with the
  page colour and the shadow tone. **The blur is bounded from both sides and
  was measured by looking**: at 16px the greeting is a legible word shape, at
  32px the ground stops reading as results and becomes a texture. The veil is a
  contrast BUDGET — two alphas multiply, so 33% of the Overview's own
  separation survives in light and 24% in dark, and the arch out-reads
  everything behind it by about three to one. `tokenContrast.test.ts` holds the
  multiplier, that ratio, and every word on the arch at AA, since the arch is
  glass and its text is now set over this ground rather than over a surface.
- **`MomentBackdrop` is PORTALLED onto `<body>` at `z-index: -2`**, which is
  the only place a layer can sit UNDER the corner glow at -1. Rendered in
  place it would be trapped in `PageTransition`'s temporary stacking context
  and blink the glow out on arrival. `aria-hidden` + `pointer-events: none` +
  **`inert`** — the third is the one the other two miss, and thirty-odd
  invisible links in the tab order is what it prevents.
- **NOTHING IN IT ANIMATES.** `StillContext` (components/motion/still.ts) plus
  the `.moment-backdrop` rules: no `stagger-in`, no `Reveal`, no counting
  numbers. A blurred layer is re-rasterised in full whenever anything inside it
  changes, and the Overview's own entrance is ~1s of change landing exactly as
  the moment arrives. **Measured: a flat 60fps on a GPU-backed browser, frame
  for frame identical to the moment with no background at all.** The 9fps in
  headless Chromium is SwiftShader and the same artefact already recorded on
  GLASS; layer promotion was tried four ways and changed nothing there, and the
  only thing asking for a frame on this screen is the 12px breathing dot.
- **The arch reaches the bottom edge of the window** — crown in view, sides
  running off the bottom, `border-b-0`, no gap. A doorway you can see the
  bottom of is a window; one hanging in mid-air is a shape. Everything that was
  below it moved inside it ("Not just now" under the button) and the wordmark
  is gone from this screen rather than squeezed in beside an eyebrow that
  already says Aspire Clinic.
- **`padding-top: 50%` puts the content on the spring line**, because the crown
  is exactly half the width tall — and a percentage padding resolves against
  the CONTAINING BLOCK'S width, not the element's own, which is why the width
  cap lives on a wrapper one level up. Got wrong once: with the cap on the arch
  itself, 50% was half of 1392px and the button sat 700px below the floor.
- **The crown is hit-tested, never read off `getComputedStyle`**, which returns
  the specified 9999px whatever was drawn. A crown flattens into two
  quarter-rounds with a straight top between them once the box is under half as
  tall as it is wide, so `e2e/results-ready.spec.ts` probes the shape at 900,
  800, 700 and on a phone.

**WelcomePage navigates to "/" and not "/overview"**, so HomeRouter re-decides.
Going straight to the Overview jumped over that decision and skipped the moment
on the one sign-in it is most obviously for.

# Motion, texture and the arch (Aug 2026)

**MOTION.** Restraint is the whole point: if a reader notices the animation as
animation it is too much. `.stagger-in` is a CONTAINER CLASS and that is the
mechanism rather than a preference — a CSS animation runs when the NODE is
created and never again, so React re-rendering cannot replay it on a filter
change, a hover, a state update or a scroll back. Direct children, 55ms apart,
capped at the sixth. Everything else was already here and is unchanged: `Reveal`
for scroll entrance (once, never again), `AnimatedNumber` for counts only and
never for a clinical value, `PageTransition` for the route crossfade, and the
trend chart's own mount (the line draws, the bands fade up under it). All of it
off under `prefers-reduced-motion`, and `.stagger-in` also off in `@media print`
— a page whose content is mid-animation prints at whatever opacity it paused at,
which is the failure `.reveal` already had.

**GRAIN AND THE VIGNETTE.** The sidebar's turbulence tile at `soft-light` now
covers the page too, at 0.018 light / 0.03 dark against the panel's 0.035 /
0.055 — lower because it covers a hundred times the area. The test is that it is
invisible as texture and visible in its absence. The vignette is DARK-ONLY and
is anchored to the GLOW rather than to the centre of the screen: it is the same
radial as the light source running the other way, so the page darkens with
distance FROM the light, which is what an unlit corner of a room does. A centred
vignette is a photographic effect applied to a document. Light mode gets none —
there is no source to be far from, and darkening the edges of a cream page is
just a smaller page.

**THE ARCH.** A rectangle with one semicircular end, standing upright. A
doorway. It appears in **exactly three places**: the results-ready moment (full
size and standing on the floor of the window — the only time it is large, see
that section for the geometry), empty states (a single faint hairline behind
the message, `.arch-outline`), and the section rail's nodes (already built, laid
on its side, unchanged and not this class). It does NOT appear on the Overview,
on Results, on a report, on a marker page, in the sidebar, or anywhere else
carrying real data — **nothing with content in it gets a shape behind it**. A
patient should meet it three or four times ever. `border-radius` rather than a
clip-path or an SVG, so the shape is correct at every size without a viewBox to
keep in step — but the element must be TALLER than half its own width or the
browser caps the radii and a doorway becomes a rounded box. The first empty
state got that wrong (`h-[150%]` inside an `overflow-hidden` card) and drew two
bare vertical hairlines through the sentence. **What the cap actually does is
worth knowing, because it is not a squash**: both radii are reduced by ONE
factor, so the corners stay circular and what appears instead is a FLAT TOP
between two quarter-rounds. And it is invisible to `getComputedStyle`, which
returns the specified 9999px whatever was drawn — the shape has to be
hit-tested.

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
- **Auth cards never scroll internally at any viewport, and the PAGE now may
  (changed Aug 2026).** These were one rule and they are two. A scrollbar
  inside the card is still forbidden — it is the moment somebody stops trusting
  they have seen the whole form they are about to agree to — but that was being
  enforced by pinning the whole shell to exactly one viewport at md+, which
  made every screen's height a hard budget, and the registration form paid for
  it in field widths and the gaps between them. A first-name box that clips
  "Ibrahi" is the same failure the no-scrollbar rule exists to prevent. So: the
  page scrolls when a screen needs more than a viewport, the card grows to its
  content and never scrolls, and the dark panel is `sticky` at md+ so it stays
  the fixed half of the composition. Every screen that fits is unchanged —
  `min-h-screen` plus `my-auto` still centres it in one viewport.
- **The name row is TWO ACROSS, and Title is on its own capped line.** Three
  equal columns gave "Mr" as much room as a surname and a first name about
  150px, which clips at six characters. The gap BETWEEN fields is 1.35
  `--auth-step` against roughly 6px inside one — it was 0.9, which at a 720px
  laptop is 12.6px against 6px, near enough the same number that the form read
  as one undifferentiated stack of boxes.
- **THE DATE PICKER'S MONTH AND YEAR ARE DROPDOWNS, and it opens IN FLOW (Aug
  2026).** The header used to be a button that zoomed out a level — day grid to
  a 12-month grid to a 12-year grid, three taps to any date, and a genuine
  improvement on the ±1-month arrows it replaced. It is still three taps and it
  is three taps nobody finds: a header reading "March 1985" looks like a
  caption and the affordance saying otherwise is a hover state. Two Listboxes
  (never a native select) say what they do while sitting still, the year one
  searchable because 120 of them is a scroll otherwise. And the panel is no
  longer absolutely positioned: it pushed the two fields after it out of sight,
  and a calendar that hides the form it is part of makes a person close it to
  check what they were doing. In flow it takes its own room, which is only
  affordable because the auth page scrolls now.
- **The biological-sex explanation belongs to the CONTROL.** Full-width helper
  text under the label, with the control itself capped — it used to sit in the
  right-hand half of a two-column row, so one sentence wrapped every three or
  four words. `BIOLOGICAL_SEX_PURPOSE` no longer names ferritin and
  haemoglobin: that is a fact about which analytes are sex-dependent offered to
  somebody who has not yet had a blood test.
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
- **PHYSICAL MEASUREMENTS DISPLAY WITH NO RANGE AND NO STATUS AT ALL (Aug
  2026).** Weight, height, waist, hip, waist/hip ratio, pulse, both blood
  pressures and oxygen saturation — `PHYSICAL_MEASUREMENT_KEYS` in
  lib/personalMeasurements.ts is the closed list. They are not assays and have
  no reference interval, and **blood pressure is the clearest reason rather than
  the exception**: NICE's thresholds are DIAGNOSTIC, acted on after a repeat
  reading and usually after ambulatory monitoring, so colouring one clinic
  reading red against 140/90 is this product making a diagnosis in the place it
  would do the most harm. A weight is not high or low, it is a weight. The read
  path already supports this exactly (`status: null` → the reading, no tint, no
  chevron, no range bar, "Not compared to a range", outside every tally).
  `syntheticBand` THROWS for one of these keys, which is what stops the demo
  reinventing a waist circumference of 13–38 cm.
- **A RANGE WITH NO WIDTH IS NOT A RANGE.** `deriveStatus` refuses `high <= low`
  before any arithmetic and returns unevaluable. Without it `computeMarkerStatus`
  builds a severity threshold from a zero-width band and returns
  SIGNIFICANT_HIGH for every positive number — which is how every weight, pulse
  and blood pressure in the demo arrived on a patient's screen in a red wash
  with the word "Significantly above range" on it.
- **FOURTEEN ANALYTES NEED AN AGE BAND AND ZERO CARRY ONE, AND NONE IS
  INVENTED.** `ageMin`/`ageMax` and the resolver's scoring have always been
  there; the gap is a document. No document in the tree carries an age-banded
  interval (the HSC5 report prints one interval per analyte and does not say
  whose; NHS Lothian is sex-specific by title; there is no API route to ranges),
  so `AGE_BANDED_RANGES` is EMPTY and all fourteen stay flagged. **Loading a
  partially-right set from memory is the one change here capable of doing
  harm** — an age-banded row is MORE specific, so the resolver prefers it, and a
  wrong specific answer beats a right general one every time. ALP, IGF-1, Total
  PSA and DHEAS are the four where an adult-wide band is close to meaningless.
  The loader runs on every seed over the empty list, so adding a row is a data
  change; `npm run audit:age-ranges` writes docs/audits/age-specific-ranges.md.
  Unlike the sex-specific loader it does NOT delete the blanket row: a sex split
  is exhaustive and a set of age brackets is not.
- **THE FIRST SIGN-IN WALKTHROUGH IS A SEQUENCE, NOT A DOCUMENT (Aug 2026).**
  One heading at a time, forward and back, arrow keys, Skip on every step, and
  the SAME progress bar the registration form uses — a person arriving here has
  filled that form in ten seconds ago. Not one word of the copy changed and it
  is still not a tour: nothing points at parts of an interface they have not
  seen. **EVERY STEP IS IN THE DOM AT ALL TIMES** and one is shown, via
  `.welcome-step` in globals.css — a display toggle rather than a conditional
  render, so `@media print` reveals all four in order and Ctrl+F finds copy on
  a step that is not on screen. `display: none` specifically, so a hidden step
  is not a tab stop.
- **REGISTRATION ASKS FOR ONE CODE, ONCE (Aug 2026).** Verifying the email used
  to answer with a fresh OTP challenge, so a new patient read one six-digit
  code out of an email and then a SECOND one out of a second email on a screen
  that looked identical. Both are one-time codes to the same mailbox and the
  second proved nothing the first had not; what a patient experienced was one
  step repeating itself, which reads as a fault. `verifyEmail` issues the
  session directly. **Nothing is relaxed:** the account still cannot become
  ACTIVE without the emailed code, `login()` still refuses
  PENDING_VERIFICATION, no device is trusted at enrolment, and two-factor
  sign-in is untouched and mandatory from the next sign-in onwards —
  `self-signup.spec.ts` has a test whose entire job is to hold that.
- **THE FIRST SIGN-IN WALKTHROUGH IS TRACKED SERVER-SIDE**
  (`User.walkthroughSeenAt`), never in localStorage — a first sign-in is a fact
  about the person, and a flag in storage brings the screen back on their phone,
  in a private window and after any cookie clear-out. It is a ROUTE (`/welcome`)
  and never a modal over somebody's results; dismissing counts as seen; it is
  reachable afterwards from Understanding results. The client reads
  `walkthroughSeen === false` and not `!walkthroughSeen`, so an older payload's
  `undefined` means SEEN — a returning patient shown an introduction because a
  deploy was mid-flight is the one failure this screen cannot have.
- **THE GP HANDOVER PDF CARRIES NOTHING INTERPRETIVE.** One page, on the
  Documents page, clearly labelled as being for a doctor: name, date of birth,
  sample date, and every marker outside its reference range with the range and
  the status. No explanations, no advice, no optimal ranges. A GP does not need
  our patient-facing copy; ~350 of those explanations have never been read by a
  clinician; and a handover that interprets is a referral letter, which is
  signed by a named person who has read it. Streamed rather than stored, unlike
  the patient summary, because it is a derived view for a conversation rather
  than a record.
- **RENDER THE PRINT. READING THE STYLESHEET IS NOT REVIEWING IT.**
  `e2e/zz-print.spec.ts` renders the report, marker and library pages through
  Chromium's real print path in both themes and measures what comes out.
  Writing the stylesheet and reading it back found none of these four, and all
  four were live:
  · **The whole sidebar printed on every page.** `print:hidden` loses to
  `md:flex` on source order (Tailwind emits the `print` variant BEFORE the
  responsive ones), and A4 at 96dpi is **794px — above the `md` breakpoint**.
  Chrome is hidden with **`.print-hide`** and its `!important` now, never
  `print:hidden`.
  · **And the rule meant to help was un-hiding it.** `.print-flow > *` set
  `display: block !important` on the shell's direct children, which includes
  the sidebar, after the hide rule and at equal specificity. It is
  `:not(.print-hide)`.
  · **Half of every report printed blank.** `.reveal` starts at `opacity: 0`
  and is lifted by an IntersectionObserver; printing does not scroll, so every
  card below the fold had never intersected. The "turn off animation" rule
  killed the transition and the transform and left the opacity — the only one
  of the three that was hiding anything.
  · **The repeating footer was 290px of a 1017px page**, on all 56 pages of the
  library. The full contact block moved OUT of the running footer and into the
  end of the document, once; what repeats is two lines. `@page`'s bottom margin
  is what reserves the band, and the spec asserts the footer fits in it.
- **PRINTING IS A DOCUMENT, NOT A SCREENSHOT OF AN APP.** The theme is forced
  LIGHT at the token layer (`@media print` in tailwind.config.ts re-emits the
  light set at a selector that beats `.dark`), so every colour in the product
  follows and anything written later is covered by construction. What is chrome
  and what is content is decided per call site with Tailwind's `print:hidden`,
  because only the component knows which it is. A card is never split across a
  page and a heading is never left at the foot of one. **No browser engine
  implements `@page` margin boxes**, so the `counter(page)` rule is declared
  because it is correct and the numbering a reader actually gets is the print
  dialog's own — do not "fix" this with JavaScript pagination.
- **"WORTH A CONVERSATION" COLLAPSES, AND THE FACT DOES NOT.** Open by default;
  the heading and the count line stay on the page when it is shut, because
  collapsing hides the CARDS, not that there are results outside the range.
  Only the list is inside the region. Persisted per
  PATIENT (`aspire_overview_attention_open:<userId>`), because an admin who is
  also a patient shares a browser with their own account. Escape closes it only
  when focus is inside, and returns focus to the disclosure. Every out-of-range
  result stays in the list: no cap, no "show more".
  **THE SECOND COLUMN IS GONE WITH THE CARD THAT WAS IN IT (Aug 2026).** The
  grid was two-plus-one at lg so "Talk to someone" could travel beside the list.
  That card is removed from the Overview entirely — the clinic's details are in
  the sidebar on every screen and this was their third appearance on one page —
  so there is nothing left to put in a second column and the list is the
  section's full width, which is also what the range bars in it wanted (a
  two-thirds column at 1440 drew a scale into about 380px).
  **AND THE NON-DIAGNOSTIC FRAMING MOVED IN RATHER THAN OUT.** It used to be
  `outOfRangeNotice` — the seeded `out_of_range_prompt` block — in a card BELOW
  the list, where its opening sentence restated the count line above it. It is
  two sentences now (`ATTENTION_FRAMING` in PatientOverview.tsx), inside the
  section, outside the collapsing region, and ABOVE the results, so a reader
  meets "This is not a diagnosis" on the way in rather than as a footnote. Both
  lines outside the region are asserted visible open AND shut.
  **The copy block itself is untouched** and is still read in full by the two
  surfaces where nothing else says it — the marker detail page and the "Next
  steps" block of both PDFs — so it is not shortened for them. It is no longer
  on the Overview DTO at all; `nextSteps` went with it.
  **`.collapse-region` animates `grid-template-rows` from `0fr` to `1fr`**, so
  the browser interpolates to the content's own height without anybody
  measuring it — and `visibility: hidden` (delayed by the duration on the way
  out) is the other half, because `overflow: hidden` at zero height leaves every
  link inside still focusable, which is a tab stop trap.
- **THE OVERVIEW COUNT AND A REPORT'S COUNTS STRIP ARE DIFFERENT NUMBERS ON
  PURPOSE, AND THE SENTENCE NOW SAYS SO.** The strip counts one report; the
  Overview counts the most recent result for EVERY marker across every released
  report, because a flagged ferritin does not stop mattering when the next panel
  omits it. On the demo patient that is **37 against 2 out of 12**, and the
  sentence used to read "37 of your results sit outside the usual reference
  range" with nothing saying which set it meant. It now says markers rather than
  results, and names the scope in the same breath.
- **THE OVERVIEW IS FOUR SECTIONS IN ONE ORDER, AND "NEXT STEPS" IS NOT ONE OF
  THEM (Aug 2026).** After the header: **Worth a conversation, Your most recent
  panel, Go deeper, What's changed** — nothing between them. That is the order a
  patient asks the questions in: is anything worth worrying about, what did my
  last test say, where do I look next, what has moved. "Next steps" was three
  cards whose load-bearing one was TITLED "Worth a conversation" and said in a
  paragraph what that section says with the actual results in it; the other two
  were a pending-results notice the empty state and the reports list both carry,
  and a retest prompt, which is a booking affordance on a portal whose booking
  flow is deliberately off. Removed from the DTO as well as the page: a computed
  field nothing renders is one autocomplete away from bringing the section back.
- **A SECTION RAIL ON THE RIGHT, IN TWO STATES (redesigned Aug 2026).**
  AT REST it is a list of horizontal labels in page order — ordinary text you
  can read without doing anything to it, one step below the reading size and in
  the muted tone. ONCE THE READER SCROLLS (`COLLAPSE_AT`, 24px — zero flickers
  on a rubber-band and on a restored scroll position) it collapses to a line
  with one node per section, and position is the only thing it still carries.
  **THE NODE IS AN ARCH**: a rectangle with one semicircular end, laid on its
  side with the flat edge against the line and the curve pointing into the
  page. A circle would be a bullet — a mark meaning "an item" — and this has to
  mean "a position on this line". The active one is filled and longer; both
  dimensions move, so the state is not carried by brightness alone.
  **WHAT THIS REPLACED, AND WHY THE OLD REASONING WAS WRONG.** It was rotated
  labels on the LEFT, and the note here argued at length that a bare dot "is
  not an index — it is a promise". That argument was right, and it was an
  argument for the EXPANDED state rather than for rotation: rotated text is
  harder to read than horizontal text, and the cost was being paid permanently
  to solve a problem that only exists once the reader has started scrolling.
  **THE LABEL IS TAKEN OUT OF FLOW, NEVER OUT OF THE TREE.** `opacity: 0` and
  `position: absolute` when collapsed — a rail whose links have no accessible
  names is four anonymous shapes to a screen reader — and it comes back on
  hover or focus, to the LEFT of its node, on the GLASS material, because
  revealed it is drawn over somebody's results and at rest it is not.
  **IT CANNOT COLLIDE, BY CONSTRUCTION rather than by numbers that happened to
  work.** A horizontal label is 100–130px where a rotated one was 12, and the
  gutter does not have it: at 1440 with the sidebar expanded the free space to
  the right of the column IS `main`'s 80px of padding. So the space is
  RESERVED — the sections wrapper carries `xl:pr-36` (144px) and the remaining
  48px come out of that padding, which is empty by definition. 168px of rail,
  24px of gap, 32px of clearance to the window in the worst case. **The
  reservation does not change with the state**, so the page does not reflow
  under the reader on their first scroll. Below `xl` it is `display: none`.
  The sticky top is 8rem because the sidebar's collapse toggle hangs past the
  panel edge and ends at 124px.
  Every node is a REAL `href="#id"` anchor, so it works before hydration; the
  handler only upgrades it to a smooth scroll (`auto` under reduced motion),
  `replaceState`s the hash and moves focus with `preventScroll` — a plain
  `focus()` jumps the viewport and cancels the scroll it was intercepting for.
  Active is picked from scroll POSITION (the last section whose top has passed
  30% of the viewport, and the last section outright at the bottom of the
  document) rather than from an IntersectionObserver, which has both a
  nothing-in-the-band state and a two-in-the-band state and a filled node has
  neither — and the same read decides both booleans in one frame, so the rail
  cannot be collapsed about one scroll position and active about another.
  `e2e/overview-rail.spec.ts` measures the boxes in BOTH states at 1280, 1440
  and 1920.
- Nothing auto-publishes; release is an explicit state change

# A report says what is on it (Aug 2026)

A Signature report is 433 results and **249 of them are below the marker
grid** — the genetic indicators, 207 food sensitivities, the microbiome panel.
Nothing on the first screen said so, so a patient who scrolled to the end of
the markers and stopped had seen a little over a third of what they paid for
with no reason to think otherwise: the page looked finished. Three things fixed
it, and each was a SILENT failure — nothing on screen looks broken when a
search quietly does not cover two thirds of a page.

- **A SECTION INDEX, directly under the at-a-glance strip.** One quiet chip per
  section the report actually has, naming it and its count ("Measured 165 ·
  Genetic 32 · Gut microbiome 10 · Findings 22 · Food sensitivity 207").
  Deliberately smaller than the strip above it: that is the headline, this is a
  table of contents, and an index at the strip's weight would be a second
  headline making a different kind of claim. Small type, no fill, a hairline at
  most, and the separation is SPACE rather than a rule. **No chip for a section
  the report does not contain**, and **no index at all below two** — a one-item
  table of contents says "here is a list of the one thing you can already see".
  Every chip is a real `href="#id"` anchor to a real `<section>`; the handler
  adds the smooth scroll and opens whatever that section keeps collapsed, since
  landing on nine shut disclosures answers "is it in here" with "yes, somewhere
  under this". `REPORT_SECTION_IDS` in features/patient/reportSections.ts is
  the one list.
- **THE SEARCH REACHES EVERY RESULT TYPE.** It used to narrow only the measured
  markers, so typing "cod" or "APOE" produced "Nothing matches those filters"
  over an empty grid. The page query now applies IN ADDITION to each section's
  own field — the bar narrows the whole page, the section's field narrows
  within it — and a section that matches opens itself and says so upward. Where
  the grid is left empty and something below did match, the page scrolls to it:
  once per query rather than once per keystroke, and never while the grid still
  has results in it, so a search that found markers cannot move the page under
  somebody's hands.
- **"HEALTH AREA" IS "CATEGORY", and it holds result types as well.** Narrowing
  to Food sensitivity and narrowing to Kidney health are the same kind of
  request, and until this they had to be asked in two completely different
  ways. Result types sit ABOVE the areas under their own heading, because one
  names a whole section and the other names a slice through the markers in one
  of them — grouped rather than merged, since they are not the same KIND of
  answer. `Listbox` gained one-level groups (a real `role="group"` with its own
  name, and every option keeps its FLAT index so arrow keys, type-ahead and
  `aria-activedescendant` are untouched); `Select` parses `<optgroup>` for it.
  Offered only where they can return something — an open report — which is the
  same rule the health-area picker already followed. The chip row reads the
  label off the CLOSED LIST rather than off what the current view offers, so a
  filter carried out of a report still names itself.

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
