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
`.eyebrow` is the ordinary section label (12px, medium, uppercase, tracked,
/80). It cannot also be the HEADING of a card whose contents carry labels, and
on the marker explanation card it was exactly that: "What this marker means" in
`.eyebrow` above three of "If it's high" in `.eyebrow` — four peers, in which
the one that is a heading had nothing to say so, and three repetitions of a
treatment out-read one instance of it. So `.card-eyebrow` is the heading and
`.sublabel` is the label half of a pair inside such a card (12px, medium, /80,
**sentence case**). 12px is the floor of the type scale and /80 the floor of the
opacity ladder, so what a subordinate label gives up is the SHOUT — uppercase at
0.14em is what makes 12px loud. The weight stays at medium in all three: a thin
12px label disappears on the dark page, and "quieter" must never become
"fainter". All three carry `break-after: avoid` in `@media print`.

**ONE LABEL IS LARGER THAN THE COPY UNDER IT, AND IT IS THE ONLY ONE (Aug
2026).** `.card-eyebrow` is **28px**, over a lead sentence brought DOWN to 21px.
Every other eyebrow in the product is 12px and stays 12px.

    .card-eyebrow   28px  uppercase, tracked, semibold, full tone
    the lead        21px  Fraunces, opsz-section — down from 28px
    the answers     18px
    .sublabel       12px

The card's own ladder decides both numbers uniquely: the answers are 18px and
the sub-labels 12px, neither of which moves, so the lead has to clear 18 and the
heading has to clear the lead. **THE LEAD CAME DOWN RATHER THAN THE HEADING
GOING FURTHER UP** — the step past 28px is 38px, and a 38px uppercase tracked
label sets "WHAT THIS MARKER MEANS" at ~670px, wider than the card at any width
this product is read at. On a phone it is a two-line label whatever it is set in
(493px of text in a 286px card), so `text-wrap: balance` decides where it
breaks: "WHAT THIS / MARKER MEANS" rather than an orphan.

**AND EVERY OTHER EYEBROW WENT TO 21px FOR A DAY. DO NOT DO IT AGAIN.**
The inverted hierarchy was real and was confined to that one card. Raising the
whole product's labels to fix it was the wrong shape of fix, and the damage was
measurable everywhere:

- `ALT (ALANINE AMINOTRANSFERASE)` on a result card broke **mid-word** across
  three lines in a 15rem column — a marker's name hyphenated inside the analyte.
- `IN THE USUAL RANGE` became 267px of label in a 237px cell, so one figure of
  three sat 31px below its neighbours and needed cell-alignment scaffolding.
- `OPENING HOURS` and `EMERGENCY LINE` wrapped in the 288px sidebar and the
  contact block clipped its own last line — which needed a `.chrome .eyebrow`
  exception to survive. **An exception invented to hold up a change is the
  change telling you it is wrong**, and that is the signal to watch for.

A label is not improved by being big; it is improved by being unambiguous about
what it labels, which at 12px uppercase and tracked it already was. If the
hierarchy looks inverted again, change the ONE card where it genuinely is.

**A MARKER'S NAME NEVER BREAKS MID-WORD.** No `break-words` on a name anywhere —
not the result card, not the change card, not the marker page's own h1. It wraps
at spaces and at the seams the name already has (`Gamma-Glutamyltransferase`,
`Microalbumin/Creatinine Ratio`) and the CARD GETS TALLER when it needs to; a
grid row is allowed to grow and a name is not allowed to be wrong. The longest
atomic run in the catalogue is `Glutamyltransferase` at 19 characters, ~161px
against the ~200px a 15rem card gives it. `e2e/marker-name-wrapping.spec.ts`
checks it two ways and **needs both**: the painted line breaks (every
character's rect, so the check is on glyphs rather than on CSS) AND the computed
`overflow-wrap` / `word-break` / `hyphens`. At 12px in a 267px column nothing
breaks whatever the CSS permits, so a painted-only check would have passed the
exact markup that caused this.

**If this ever looks wrong again, MEASURE the computed style, the margins AND
the natural width of the longest label before touching a value** — it has been
eyeballed wrongly four times.

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
   **DRAWN ON THE LIGHT PLOT, LIKE THE CHART (Aug 2026).** The track is
   `PLOT_SURFACE` in both themes and the five fills are the chart's own, so a
   bar and the chart above it on the same card are the same five colours by
   construction rather than by two records agreeing. The MARK is espresso in
   both themes now — it used to invert, white on dark and espresso on light,
   because the track's ground did — and the two reference-bound ticks moved off
   `bg-espresso/60` onto the chart's static hairline, because `espresso`
   resolves to a near-white cream in dark and would be invisible on a pale green
   segment.
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
   **THERE ARE FIVE REASONS NOT TO DRAW, AND ONE SENTENCE EACH** — no reference
   range, a range with no width, no numeric value, too far out to show both, and
   **an open-topped range (Aug 2026)**. The fifth is the one the others were
   written for and missed: four markers have no clinical upper bound — eGFR,
   HDL, the Omega-3 Index, progesterone — and the catalogue writes
   `OPEN_UPPER_BOUND` (999) for the ceiling, because a reference range in this
   schema is two numbers. Rule 2 then does what it says: a 60–999 range produces
   a scale of roughly 0 to 2000, and **a perfectly healthy eGFR of 97 landed at
   5% of the bar**, hard against the left-hand end of a green band. A patient
   reads that as "only just inside my range". It is an excellent result. That is
   the same correct-picture-false-axis failure as the three above, surviving in
   the one input nobody had put through it, because 999 is an ordinary number to
   arithmetic. Nothing is drawn now. Drawing an OPEN-ENDED bar instead — a green
   region running from the lower bound off the right-hand end, no upper hairline
   and no upper label — is the right rendering, is a design change across two
   components rather than a scale correction, and is on the list for Richard
   (docs/audits/randox-band-mapping.md).
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
   **The MARK on it is NOT a status colour (Aug 2026).** It is the `rangemark`
   token, and its job is POSITION. A mark drawn in its own state's colour is a
   mark drawn in the shade of the segment it is standing on — a green dot on the
   green band, pale gold on the gold one. It used to INVERT between themes
   (white in dark, espresso in light) because the track's ground did; with the
   track light in both themes it is **espresso in both**, measured at 4.02–6.05:1
   on the five fills the bar paints, inside a ring of the plot's own tone.
   Status is still carried four times over by the segment, the chevron, the word
   and the card's own wash. Applies to both bars — the card-sized pointer is an
   SVG triangle rather than a CSS border trick precisely so it can take the same
   ring. `tokenContrast.test.ts` holds it at AA-large on every segment it can
   stand on, the optimal narrowing included.
3. **Trend charts — AND THE PLOT AREA IS LIGHT IN BOTH THEMES (Aug 2026).**

   **THE GROUND MOVED, WHICH IS WHY THE COLOURS FINALLY WORK.** The band
   colours had been re-solved four times and every solve hit the same wall from
   a different side. The wall is one sentence: **a dark ladder fixes each
   band’s luminance low, and a yellow at a low luminance is a brown in any
   colour space.** It is not a matter of picking a better gold. Dark’s
   out-of-range band came out #604b0b; it was lifted right off the ladder to
   #ad8100 to rescue it; that exception then inverted the ladder (yellow louder
   than red), forced the point mark to step toward the ground instead of the
   text, and drove the comparison line to #ffebdf — a white line with a rumour
   of warmth. Every one of those was a consequence of the plot being
   near-black.

   So the plot — the chart’s own panel, and the track a range bar is drawn on —
   is a warm off-white, **the same one in both themes** (`PLOT_SURFACE`,
   `mix(cream, white, 0.35)` = #edeae2). **The card and the page stay dark in
   dark mode; only the plot is light.** The value is unchanged from light
   mode’s old plot, deliberately: this change is "dark mode’s plot becomes
   light mode’s plot" and nothing else.

   **WHAT IT BOUGHT, MEASURED.**

       band chroma   light 0.073 0.084 0.091 → 0.106 0.119 0.135  (+45/+42/+48%)
                     dark  0.072 0.070 0.094 → the same three     (+47/+70/+43%)
       the ordering  line off plot ÷ loudest band off plot
                     light 2.13× · dark 1.83×  →  3.22× in both

   The ordering number is the one that matters — the line is the content and
   the bands are the context — and that lead has never been this wide. It is
   bought by the line being able to go DARK: 7.2:1 off the plot, where the old
   lifted line managed 3.05 against a band standing 4.74.

   **FOUR RECORDS COLLAPSED TO ONE EACH.** `BAND_FILL`, `MARK_FILL`,
   `LINE_LIFT` and the boundary hairline were per-theme, and they were
   per-theme because the surface was. One ground, one answer. `BAND_RUNG` is
   flat and equal to `BAND_CONTRAST`; the geometric mean of the card and the
   plot that `BAND_FILL` used to be solved against is gone with the second
   surface it was averaging. `tokenContrast.test.ts` now asserts the two themes
   are **byte-identical** on every chart token rather than within 20% of each
   other — a much stronger claim, and one that catches a theme-derived value
   creeping back immediately.

   **THE LADDER WENT BACK UP.** `BAND_CONTRAST` is **1.5 / 1.85 / 2.25** (from
   1.24 / 1.38 / 1.54), with the two hinges at the derived midpoints, and
   `BAND_CHROMA_SHARE` is **0.85** (from 0.6). The five fills are:

       green #a5cd85  olive #b8bc69  gold #cbab4c  orange #db955e  red #ea7f6f

   **THE LINE IS DARKER, NOT BRIGHTER**, and that is the whole difference a
   light ground makes. Every previous solve had to LIFT the line off a
   near-black plot, which runs into a ceiling — past a certain lightness there
   is no chroma left and the line becomes white. Downward there is no such
   wall. `MARK_FILL` is solved for the smallest lightness clearing **3.2:1 on
   every band** including the optimal narrowing, at each hue’s full palette
   chroma: **#265600 / #604800 / #941a08**, 7.2:1 off the plot.

   **AND THE CHROMA ORDERING NOW HAS ONE NAMED EXCEPTION, WHICH IS A GAMUT
   FACT AND NOT A FUDGE.** "The band is less colourful than the line drawn over
   it" holds for green and red and CANNOT hold for gold: a line has to be dark
   to clear a pale band, and a dark yellow is a brown — the identical fact
   recorded twice above for the old near-black plot, arriving from the other
   side. The gold line reaches 0.0851 of chroma against a gold band’s 0.1194,
   and closing that gap needs the band’s share down to ~0.46 of its ceiling,
   which would make the bands LESS colourful than they were on the dark plot.
   So the PRIMARY carrier is asserted for all five — every line hue stands **at
   least 3× as far off the plot as its own band** — and the chroma check is
   exempted for gold, olive and orange, by name, in the test.

   **EVERYTHING DRAWN ON THE PLOT IS STATIC.** The axis ticks, the reference-
   bound labels, the unit, the number beside the most recent point, the
   boundary hairline, the point ring and the range-bar mark. This is the block
   where forgetting would show: `--c-espresso` resolves to a near-white cream
   in dark, and a cream tick on a #edeae2 plot measures 1.09:1.
   `chart.plotInk` (espresso, 9.04:1) and `chart.plotInkMuted` (#6d6861,
   4.59:1) are the two.

   **IT IS AN INSET PANEL, NOT A HOLE PUNCHED IN THE PAGE.** A bright rectangle
   on a near-black card is exactly what this must not be, and three things stop
   it: the frame at **full weight in dark and half in light** (in light it
   separates two similar tones; in dark it is the boundary between a light
   panel and a dark card, and a half-alpha line there is a suggestion of an
   edge rather than one); a soft **inner shadow** along the top and left inside
   edges, drawn INSIDE the panel because a drop shadow lifts a panel toward the
   reader and this one sits into the card; and the card’s own padding holding
   it clear of the card’s border. The inner shadow is two 6px gradients rather
   than a filter — a filter on a rect inside a Recharts SVG is re-rasterised on
   every tooltip move.

   **THE BOUNDARY HAIRLINE IS SOLVED AT ITS DRAWN OPACITY**, not as a bare
   token: it is composited at `referenceEdgeOpacity` over the band, and the
   only number that means anything is what that composite measures against the
   band underneath. #63543e gives 1.70–2.04:1 across all five fills and the
   optimal narrowing.

   **THE RANGE BARS GET THE SAME TREATMENT**, which is the point of doing it at
   the token layer: both instruments paint `--c-hue-*-fill` on `PLOT_SURFACE`,
   so a bar and the chart above it are the same five colours. The bar’s mark is
   **espresso in both themes** now (4.02–6.05:1 on the five fills) rather than
   inverting white/espresso, and its two reference-bound ticks moved off
   `bg-espresso/60` onto the chart’s own hairline for the same reason the axis
   text did. `RangeBar.test.tsx` matches those ticks on the MARKUP rather than
   on a Tailwind colour class, because pinning a geometric test to a colour it
   is not about turns a colour change into "0 bounds found".

   **WHAT DID NOT CHANGE, and none of it should:** the boundary gradients are
   still centred on their bounds at `TRANSITION_SHARE` 40% of the drawn extent,
   with the hairline through the middle; the line still carries status along
   its own length as one user-space gradient with a stop at each point and at
   each boundary crossing; bands are still opaque with no alpha anywhere; still
   drawn PER PERIOD with a step midway between the two samples a range changed
   between; the optimal range is still a narrowing of in-range drawn as one
   region; the key still has no band entries and never a coloured rectangle;
   the line is still `type="linear"` with no area under it; the most recent
   point still prints its own number; a tick is still dropped where it would
   print on a reference bound; and every state is still named in words in the
   key and the tooltip. `bandRampStops` is still the one derivation shared by
   the chart and both bars.

   **`chart.line` IS THE COMPARISON CHART’S LINE ONLY** — two or three markers
   on one normalised axis, where the line says "which marker" and must not
   borrow a status hue. Re-solved on the light plot to **#694835**, a proper
   bronze at 3.01:1 worst on a band and 6.77:1 off the plot, at bronze’s own
   saturation and nothing higher (the bronze hue sits at 19°, between the
   status red at 8° and the status orange at 30°, so a saturated bronze line
   would read as a status colour crossing the plot).

   **BAND_CONTRAST, BAND_CHROMA_SHARE, BAND_FILL, MARK_FILL, LINE_LIFT, THE
   HAIRLINE AND PLOT_SURFACE ARE ONE DECISION.** Change any of them and all of
   it is solved again. The Aug 2026 pass is the worked example: moving the
   ground re-solved every one of the others, retired three per-theme records
   and closed one documented exception while opening a different one.

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
HoldAvailabilityBooking, CreateRandoxBooking, CancelRandoxBooking, the mock
transport, every test over them. That is what whatever books on the main site
will call, and it has its own separate switch (`RANDOX_ENABLED`). Results ingestion, polling and the
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

**THE BEARER IS REQUIRED, ALONGSIDE THE KEY. SETTLED (Aug 2026).** The Nexus
`securitySchemes` has exactly two entries and both are the same key
(`Ocp-Apim-Subscription-Key` as a header, `subscription-key` as a query
parameter), with no OAuth or bearer scheme anywhere in the document — and this
note used to say the bearer was therefore "probably" wanted. **The CB STES auth
document settles it in one sentence**: "Authorisation will be the bearer token
and in the header section include the following key:
Ocp-Apim-Subscription-Key." Both, together, on every request; its Postman
screenshot shows exactly that pair and both collections carry a
collection-level bearer beside a per-request key. The spec's silence was a GAP
IN THE SPEC rather than evidence — `securitySchemes` describes what the APIM
gateway checks, and the bearer is checked by the B2C policy in front of it,
which is not inferable from the OpenAPI file at all.
`RANDOX_BEARER_TOKEN_ENABLED` stays as a LEVER rather than a hedge: it exists
so an unexplained 401 can be bisected in one redeploy. The key always goes, in
the HEADER, never the query form.

**AND THE NEXUS SCOPE WAS WRONG BY ONE HYPHEN, WHICH WOULD HAVE 401'd EVERY
LIVE CALL (Aug 2026).** It read `gptestorderportal-externalapi`; it is
`gptestorderportal-external-api`, per the auth PDF's own LINK TARGET and the
Nexus Postman collection. The typo came from transcribing the PDF's RENDERED
PARAGRAPH, where the hyphen falls on a line break and disappears — the CB scope
is mangled identically two paragraphs later in its own document, which is what
makes the error recognisable rather than mysterious. A wrong scope means B2C
issues no token at all, so the symptom is a 401 about the token and never about
the scope. **Transcribe a URL from the link target or the collection, never
from the paragraph.** Pinned, both ways, by `randoxBookingContract.test.ts`.

**THE 401 BODY USES A DIFFERENT KEY.** 200/400/500 return
`{"statusCode": "...", "message": "..."}`; the 401 returns
`{"status": "401", "message": "..."}`. Both are parsed (`parseRandoxErrorBody`).
`statusCode` is documented as an integer and returned as a string in every
example — treat EVERY scalar this API produces as a string and coerce at the
boundary (`asRandoxInt` / `asRandoxIdString`).

**THREE ORDER IDENTIFIERS, THREE COLUMNS, AND LINKING JOINS ON `orderId`.**
Creation returns `{orderId, externalNumber}`; everything afterwards returns
`orderNumber`; and the spec's own two examples spell them differently
(`GC1123-00010300` vs `GP-THE-00000130`). `RandoxOrder` stores `randoxOrderId`,
`externalNumber` and `orderNumber` separately and none overwrites another;
automatic linking joins on **`randoxOrderId`**, the one identifier that provably
appears on both sides.

**THE Aug 2026 DOCUMENTS RESOLVE THE INPUT HALF AND NOT THE OUTPUT HALF, AND
THE DIFFERENCE IS WHY THE THREE COLUMNS STAY.** Two new statements bear on it.
The flow diagram: capture the Order Number from `CreatePendingOrder` — whose
response carries only `externalNumber`, so that IS the string it means — and
send it to Clinic Booking as `GPExternalNumber`. The Nexus Postman collection,
on five separate endpoints: `"orderNumber": "xxx001-000xxxxx" // this can be
either orderid or orderNumber (externalNumber)`.
So **what to SEND is settled**: the creation response's `externalNumber` is
what every later Nexus call and the booking both accept, which is exactly what
`orderNumber` is seeded from. **What Randox RETURN is not.** Whether the
`orderNumber` on a GetOrderStatus response is byte-identical to the
`externalNumber` we were given is still unstated — a parenthetical gloss in a
collection comment is evidence, not a schema — and it is the half that would
silently break a lookup. `reconcileOrderNumber()` therefore stays exactly as it
is: it logs loudly and audits the first time a real order shows the two
differing. Still on the list for Randox, now as one narrow question rather than
a general one.

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

**THE HSC5 REPORT IS READABLE AFTER ALL, AND IT CONFIRMS 34 SPELLINGS (Aug
2026).** This file and analyteMap.ts both said the sample report "uses subset
fonts with a custom encoding and its analyte column cannot be extracted
mechanically". That was a misdiagnosis, and the cost was real: the one document
in the tree carrying Randox's own names for 34 analytes was being treated as
unreadable.

**What was actually happening:** every font in that PDF is `/Encoding
/Identity-H` — TWO-BYTE CIDs. Read one byte at a time the text comes out as a
substitution cipher offset by the subset's first glyph ("Haemoglobin" reads as
"+DePoJloELn"), which looks exactly like a custom encoding nobody can undo.
Decoded two bytes at a time through the font's own ToUnicode CMap it is ordinary
text. The one remaining trap is that the document carries several subsets whose
CMaps cover different code ranges, so picking the wrong one per font resolves
some glyphs and not others — which makes the failure look partial rather than
total.

`HSC5_ANALYTE_STRINGS` holds all 34, in the report's own order, with the page
each is printed on. It is a CHECK LIST and not a second override table: nothing
resolves through it, `analyteMappingCoverage()` counts how many the map answers
to, and `analyteObservations.test.ts` fails if one stops resolving — so a
catalogue rename that breaks a Randox spelling is caught by a test rather than
by a held report.

**TWO OF THE 34 DID NOT RESOLVE**, and both would have gone to the exception
queue on the first real delivery:

- `Red Blood Cell Mean Cell Volume (MCV)` — we hold "Red Blood Cell Mean
  Volume (MCV)". One word, "Cell", and it is the difference between a match and
  a held report.
- `Estimated Glomerular Filtration Rate (eGFR)` — we hold "eGFR" with
  "Estimated Glomerular Filtration Rate" as an alias. Randox print the full name
  AND the abbreviation together, which is neither.

Both are now sourced overrides. **Every entry in `ANALYTE_OVERRIDES_SOURCED`
carries its provenance** — `RANDOX_REPORT` (read off a document Randox
produced) or `CATALOGUE_NOTE` (our own record of a correction we made, which is
evidence about US and weaker) — because a mapping files a measurement against an
analyte on somebody's record and "who says so" should travel with it. There is
no third kind and there is not going to be one called GUESS.

**THERE ARE NOW TWO CONFIRMED FIGURES AND THEY ARE NEVER ADDED TOGETHER.**
`confirmedAgainstSourcedDocument` is 34 of 34 and may grow.
`confirmedAgainstRealPayload` **stays hardcoded at zero** and must never become
computed. A rendered PDF proves how Randox NAME a test; it does not prove which
JSON field on GetOrderResultDetail carries that name or how it is spelled there,
and that field is what the ingestion path actually reads. (An override keyed on
the printed string is safe either way, because `resolveAnalyte` tries the
override table against `analyte` AND `displayName`.)

**THE REST OF THE MAP IS STILL UNVERIFIED, AND THAT IS STILL ON A SCREEN.** 186
clinical markers resolve from their own catalogue names and **86 answer to
exactly one spelling** — so one difference in how Randox print any of those
loses a result. That is self-consistency, not confirmation. Inventing plausible
Randox spellings to close it is still refused and is not to be revisited: the
exception queue catches an ABSENT mapping and nothing catches a wrong one.

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

**THE CLINIC ID IS FETCHED, NOT CONFIGURED (Aug 2026).** Three endpoints
require it — GetOrderStatus, GetOrderResultReports and GetOrderResultDetail —
and the API-overview flow diagram says the same four words for each: "Clinic Id
must be your current Clinic Id (/Clinic/GetMyClinicDetails)". All three send it
and always have; what changed is where the number comes from. It was
`RANDOX_CLINIC_ID`, and the diagram is the argument against that:
GetMyClinicDetails is not a hint about where a human might look the value up, it
is the authority for what the value IS on the credentials this deployment holds.
A typed-in id is a second source for a fact with one source, and a wrong clinic
id on GetOrderResultDetail is a request for somebody else's order.

So the boot sync records it, and it survives a restart because it is read back
out of the catalogue (`loadDiscoveredClinicId`) — the sync is SKIPPED inside its
TTL, which makes "learned only on sync" lose it on most restarts. The clinic
entry is flagged `isClinic` in its stored payload so it can be told from its own
test locations, which share the kind and the shape; absent that flag nothing is
inferred and the id stays unknown, because "there is one row so it must be the
clinic" is true of a single-site clinic and silently wrong of every other.
`RANDOX_CLINIC_ID` survives as an OVERRIDE for a support session and is no
longer in the boot guard's required list — refusing to start over a value the
only entitled party is about to state is the wrong failure. What guards the real
one is `assertReferenceDataUsable()`, on the order path, where an unknown clinic
id refuses an ORDER rather than the portal.

**`RANDOX_TEST_CLINIC_LOCATION_ID` STAYS A SETTING**, and the asymmetry is the
point: GetMyClinicDetails answers "which clinic are you" with one value and
"which of your sites should this be drawn at" with a LIST. A list is a question.

**STATUS 5 HAS TWO CAUSES AND THEY ARE NOT THE SAME EVENT (Aug 2026).** Randox
document both: we cancelled it, or — "In the event that all results have been
voided then the status will automatically move to status 5 (cancelled)" (flow
document, page 3). The second is a DELIVERY: the laboratory ran the samples,
could not report any of them, and every void code saying why is sitting on
GetOrderResultDetail. It used to be handled as "cancelled, stop polling", which
threw all of that away — the order ended as a bare CANCELLED row with no
exclusions recorded and nothing anywhere saying a test had been run.
`order.cancelledAt` separates them, because our own cancel path is the only
thing that writes it; an unexplained status 5 is ingested ONCE so the void codes
are on the record, best-effort, and only then closed off.

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
returning void or caveat codes, and **none of the four documents that arrived in
Aug 2026 contains the list either** — which confirms it comes only from the
Randox Web Developer team. Production still refuses to start with
`RANDOX_TRANSPORT=live` while the code map is the checked-in placeholder. Do not
weaken it.

**GetOrderStatus TAKES THE CLINIC ID, ON THE STRENGTH OF THE FLOW DIAGRAM
AGAINST TWO SILENT EXAMPLES (Aug 2026).** Three documents, two answers: the
OpenAPI example sends `{OrderNumber, OrderId}`, the Postman collection sends
`{orderNumber}`, and the flow diagram says "Clinic Id must be your current
Clinic Id". It is SENT, and the asymmetry is the whole reason — an example that
does not show a field is SILENT about it, while the diagram positively asserts
one is needed, so sending satisfies both readings and omitting satisfies only
the weaker. Both result endpoints have always taken it and their examples say
so. PascalCase on GetOrderStatus and camelCase on the two result endpoints,
because that is how each endpoint's own example is written; this API is not
consistent with itself and imposing consistency on it is how a 400 gets
invented.

# Clinic Booking — requests verified, responses not (Aug 2026)

`specs/Clinic Booking Platform Testing APIs.postman_collection.json` is the real
collection. It gives every REQUEST body literally — path, verb, field names,
value types — and **no response examples at all**. That asymmetry is the shape
of the whole client: what we send is built to the collection, what we receive is
still read through the tolerant helpers in `clients/parse.ts`. Do not read "we
have the collection" as "the API is documented".

**Every guessed request body was wrong, and that is the lesson.** The client had
`{serviceLocationId, slotReference}` for a hold and `{holdReference, startUtc}`
for a booking, read tolerantly so a wrong guess would "degrade gracefully".
Tolerance is right for a RESPONSE and worthless for a REQUEST: a misread
response loses a field, a misspelled request is refused whole. Not one guessed
name was right.

**Five POSTs and one GET**, same rule as Nexus — takes a body, POST.
`GetServiceLocations`, `AvailabilityDetails`, `HoldAvailabilityBooking`,
`CreateRandoxBooking`, `CancelRandoxBooking`; `GetBiologicalSex` is the GET.
`CLINIC_BOOKING_ENDPOINTS` in endpoints.ts is the table and `bookingVerbForPath`
throws on anything not in it.

**THE SERVICE ID IS REQUIRED AND IS NOT DISCOVERABLE.** 787 (UK) and 788 (ROI),
and there is no third. Not in any document — Chris Caulfield's email. It is
CONFIGURATION picked by `RANDOX_BOOKING_REGION` rather than an argument: which
country a booking is made in is a fact about the deployment, and a parameter
that could be either would eventually be the wrong one, offering a UK patient
Irish clinics with nothing in the response to say so.

**THE SAME FIELD TAKES TWO DATE FORMATS IN ONE FLOW.** `AppointmentSlotDate` is
`"16/10/2025"` on the hold and `"2025-10-16T00:00:00Z"` on the create, two
requests apart. **`AppointmentSlotTIme` is misspelled** — capital I — in both.
Each endpoint is sent what its OWN example uses, which is the rule the Nexus
side already runs on, and correcting the spelling would produce a request with
no slot time in it.

**AND THE SLOT FIELDS ARE THE UTC WALL CLOCK, WHICH THE COLLECTION PROVES ON ITS
OWN.** Their `AppointmentSlotId` is `"72164:72164::1760607000:"`, and 1760607000
as an epoch is `2025-10-16T09:30:00Z` — the same 09:30 they send as
`AppointmentSlotTIme`. In London that instant reads 10:30, because 16 October is
inside BST. So a formatter using LOCAL getters on a UK-hosted server would have
held a slot an hour from the one the patient chose, for seven months of every
year, with nothing in any response to say so. `slotDateDayFirst`,
`slotDateIsoMidnightZ` and `slotTimeOfDay` in clients/parse.ts use `getUTC*`
throughout and the arithmetic is pinned against the collection's own example.
The other direction is `londonWallClock`, and every slot carries its UK-local
rendering BESIDE the instant (`slot.local`) so a consumer cannot accidentally
localise into the READER's zone — right only by accident, and wrong for anyone
booking from abroad.

**THE 30-MINUTE HOLD IS ENFORCED HERE, BEFORE RANDOX ARE ASKED (Aug 2026).**
"Slots will be held for a 30 minute period" is the flow document's own sentence
(page 3). Until now the only thing that noticed a lapsed hold was Randox
refusing the create, and the catch turned that into the right message — correct
as a BACKSTOP and wrong as the only check, for two reasons. It sends a full
patient record (name, date of birth, address, contact number) to a third party
on a request we already know cannot succeed; and a create is deliberately not
retryable, so "we knew it had expired and asked anyway" is the one way this path
can produce an appointment nobody intended. `confirmBooking` refuses on
`holdExpiresAt` and marks the row EXPIRED in the same breath. The catch stays:
a slot can be taken by somebody else well inside the thirty minutes, and only
Randox know that.

**CANCEL TAKES A RANDOX INTEGER, WHICH HAD TO BE CAPTURED AND WASN'T.**
`CancelRandoxBooking` takes one field, `RandoxBookingOrderId`, and not the
string reference this code was inventing and not `GPExternalNumber` — a cancel
that would have been refused every time, discovered by the first patient who
tried to cancel. It comes back from `CreateRandoxBooking` and is stored on
`RandoxAppointment.randoxBookingOrderId`, alongside `slotReference`,
`holdBookingId`, `holdAppointmentId` and `serviceId`: a distinct identifier gets
a distinct column, the same rule as the three order identifiers. Everything the
create needs is written at the HOLD, because the create is a separate request
and possibly after a reload.

**THERE IS A RESCHEDULE ENDPOINT AND WE CANNOT CALL IT — THE PREVIOUS NOTE HERE
WAS WRONG (corrected Aug 2026).** This said `RescheduleAppointment` came from
somebody's recollection and did not exist. It is on **page 3 of
specs/20241028-Corporate-Customer-API-Flow.pdf, "Last Updated: 1-Nov-24"**,
listed under "Clinic Booking · Primary endpoints are:" — "there is a window of
opportunity for the clinic booking record to be rescheduled to a different
clinic location, date and time."

Every CHECK behind the earlier reading was correct: it genuinely is absent from
both Postman collections, from the API-overview flow diagram and from both auth
documents. The INFERENCE was not — a TESTING collection does not claim to list
every endpoint, and absence from one is not evidence of absence from the API.
Worth knowing how it stayed wrong: **that PDF's text is not mechanically
greppable**. Its fonts carry no usable ToUnicode, so a search over the
decompressed streams returns nothing for a string that is plainly on the page.

**SO THERE ARE THREE STATES, NOT TWO**, and `NAMED_BUT_UNSPECIFIED_ENDPOINTS`
in endpoints.ts is where the middle one lives: SPECIFIED (path, verb and body),
NAMED ONLY (named in a Randox document, no request shape anywhere), FICTIONAL
(nobody has written it down). Collapsing the middle into either neighbour has
now caused a mistake in each direction. `GetOrderStatusDetails` — home-dispatch
tracking and kit URNs, page 2 of the same document, absent from the OpenAPI
file's seventeen — is the other NAMED ONLY entry.

**NOTHING ABOUT THE CODE CHANGES, AND THE REASON IS BETTER.** No document gives
the reschedule's path, verb or one field of its body, and a guessed REQUEST on
this API is refused whole — which is the lesson this entire client was rebuilt
around. An endpoint we cannot spell is exactly as uncallable as one that does
not exist. So the client and the mock still throw
`RandoxUnsupportedOperationError` (501), and moving an appointment is still
COMPOSED from three documented calls — but the justification is now "there is no
way to spell a call to it" rather than "there is no such endpoint", and the ASK
for Randox narrows from "does this exist?" to "what body does it take?".
**The order is the whole design**: hold the new slot,
book the new slot, then cancel the old one. Cancelling first is simpler and
loses somebody's appointment when step 2 fails. Whether Randox accept a second
booking against one `GPExternalNumber` is unknown and this ordering is safe
under both answers — refused, the original stands; accepted, step 3 leaves
exactly one. If step 3 fails the new appointment is KEPT and audited: a stale
booking is a phone call, no appointment is a wasted trip.

**THE MOCK IS GENERATED FROM THE COLLECTION AND CHECKS WHAT WE SEND, FIELD BY
FIELD.** `mock/bookingSpecServer.ts` rejects a body whose fields, JSON types or
string SHAPES differ from the collection's own example — so correcting the
misspelling is a 400, swapping the two date formats is a 400, sending
`ServiceId` as a number where that endpoint's example says `"787"` is a 400, and
an invented `SearchTo` is a 400 rather than a field a real API would ignore
while returning an unbounded range. It requires BOTH credentials, unlike the
Nexus mock, because the CB document requires both and the Nexus spec does not
mention one: the two mocks differ exactly where the two documents differ.
Responses are fixtures and live in `mock/bookingScenarios.ts`, separately and
labelled, because nobody has documented one.
`tests/randoxBookingContract.test.ts` runs the real client over HTTP through the
whole documented flow — Nexus create → locations → availability → hold → booking
carrying the order number → status 1–4 → reports and detail — plus the four
failure paths that are OUTCOMES rather than faults: a slot taken between
availability and hold, a lapsed hold, a create that fails after a hold (which is
NOT dressed up as a lost slot — the slot is still held and trying again is the
right advice), and a cancel. A create is never retried, for the same reason
`CreatePendingOrder` is not.

**AvailabilityDetails HAS NO SearchTo.** It takes a single `SearchFrom`. The
upper bound is applied to the RESULT, on our side; adding a request field the
API has never been shown to accept would be silently ignored and would return
months of slots.

**AND THE DATES IT RETURNS ARE NOT NECESSARILY CONSECUTIVE**, which the flow
document states in as many words (page 2): "The number of days presented is
controlled by Randox. This is usually 7 days of available appointment slots for
primary clinics and a longer period for pop-up style locations. The objective is
to present 7 dates of available appointments, which depending on availability,
**may not be consecutive dates**." Anything that renders availability as a
calendar week has to survive gaps.

# The sandbox pass — one command, and it has NOT been run (Aug 2026)

`npm run sandbox:pass --workspace=apps/server` walks the whole documented flow
against the `stes-` sandbox and writes every response body **verbatim** into
`modules/randox/specs/sandbox-responses/`, one file per call, each carrying the
request that produced it, the HTTP status, the parsed body and the RAW response
text — because "this is what our helpers made of it" is not a record of what
Randox sent. Then `ANSWERS.md`, which answers the seven open questions from the
capture and writes `UNANSWERED` in as many words where the run did not settle
one. **A blank is a result and is written as one.**

**THE DIRECTORY IS EMPTY AND THAT IS THE STATE OF THE WORK.** The pass needs
four things this repository does not have and cannot have: the two subscription
keys (each from its own developer portal) and the ROPC username/password. Every
other setting — both base URLs, both client ids, both scopes, the token
endpoint — is already defaulted in `config/env.ts` and is correct.

**NOTHING IS WRITTEN THERE IN ADVANCE.** The Clinic Booking collection carries
no response examples at all, so these files will be the ONLY record of those
shapes that exists. A plausible-looking fixture placed there would be
indistinguishable from a real capture the moment anybody read it, and the whole
value of the directory is that it is evidence. Same rule the analyte map runs
on: an absent mapping is caught, a wrong one is not.

The script refuses to run without both credentials, against any host that is not
`stes-`, or under `NODE_ENV=production`. Its patient is invented and obviously
invented; nothing in it reads the database; request headers are never captured,
so neither credential can end up in a file. It uses **LocationId 30** ("Clinic
Location Crumlin"), which Randox confirm has availability — every example in the
collection uses 15, which may have an empty diary, and an empty diary and a
broken integration look identical from the outside.

**THREE OF THE SEVEN ALREADY HAVE A DOCUMENTED ANSWER**, which is not the same
as an observed one and does not remove them from the list: the hold is 30
minutes, AvailabilityDetails returns "usually 7" dates that "may not be
consecutive", and the eight reference endpoints are declared GET.

# The HSC5 report's band labels against our five states (Aug 2026)

`docs/audits/randox-band-mapping.md`. Every band label Randox print on the one
example report we hold, mapped onto `SIGNIFICANT_LOW / LOW / IN_RANGE / HIGH /
SIGNIFICANT_HIGH`, with every case that is not mechanical **flagged and left
unresolved**.

**THE HEADLINE: 13 LABELS ACROSS 5 DIFFERENT SCHEMES, AND ONLY 4 OF THE LABELS
ARE POSITIONAL.** Low / Optimal / High / Normal describe where a number sits.
The other nine carry a judgement (Desirable, Satisfactory), a severity
(Moderately raised), a risk tier (Low / Average / High Risk) or a **diagnosis**
(Pre-diabetic, Stage 3 CKD, Stage 4&5 CKD). 19 of the 34 analytes map safely; 15
do not, and none of those 15 is resolved here. Naming a CKD stage or calling
somebody pre-diabetic is not this product's to do — see the non-diagnostic rule
above — and deciding that "Moderately raised" IS our HIGH would be inventing a
clinical judgement and calling it a rename. Randox's own escalation for ALT is
5× the upper bound; our default multiplier puts it at 1.5× the range width.

**AND "OPTIMAL" IS OVERLOADED.** Randox use it for the reference interval; we
use it for a narrowing INSIDE one, from published guidance. If a Randox band
label ever reaches a screen unmapped, two different things will be called
optimal on one page.

## What eGFR and HDL actually do — measured, and the feared failure is not the one

Both are stored 60–999 and 1.55–999, where 999 is the seed's way of writing "no
clinical ceiling". Measured through `computeMarkerStatus`:

    egfr 130 → IN_RANGE   97 → IN_RANGE   59 → LOW   45 → LOW   4 → LOW
    hdl  3.2 → IN_RANGE  2.0 → IN_RANGE  1.14 → LOW  0.6 → LOW  0.3 → LOW

**A high eGFR is NOT rendered as "above range" in gold**, and neither is a high
HDL. Nothing about good kidney function or good cholesterol is being flagged at
a patient. That was worth checking and it is worth writing down.

**Three other things did happen. Two are fixed.**

1. The reference range **printed as "60–999 mL/min/1.73m²"** — on the marker
   page, the result card, the chart tooltip, its axis and both PDFs. FIXED:
   `formatReferenceRange` sets an open-topped range in words ("60 or above"),
   and every reference range that reaches a screen or a PDF goes through that
   one function, so the fix is complete by construction.
2. The **range bar was drawn on a scale of roughly 0 to 2000** and put a healthy
   eGFR of 97 at 5% of it. FIXED by refusing to draw — see the range bar section
   above.
3. ⚠ The **severity threshold is derived from the sentinel width**, so it comes
   out at 1408 and an eGFR of **4** computes `LOW`, indistinguishable from 59.
   **NOT FIXED, deliberately.** The mechanism exists (`severityAbsoluteDelta`,
   an explicit per-marker number that bypasses the multiplier); what does not
   exist is anybody entitled to choose the number. **For Richard.**

**`OPEN_UPPER_BOUND` (999) IS DECLARED IN statusBands.ts** and shared by the
writer and the readers, which makes recognising it a lookup rather than a guess
about a magic number. It does **not** make the model able to express "higher is
better" — nothing in it can; there is no polarity on `Marker`, on
`ReferenceRange` or on `ResultReferenceRange`. What it cannot express is a
ONE-SIDED range, which is the more accurate description and the smaller thing to
add: a nullable `referenceHigh` would remove the sentinel, the printed 999, the
false bar scale and the nonsense threshold in one move, and make the four
affected markers findable by query rather than by knowing to grep for 999. It
needs a migration and a pass over every `deriveStatus` caller, which is why it
is written down rather than done. A laboratory range is never affected — Randox
send real intervals.

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

**A SESSION'S CLOCKS BELONG TO THE SESSION, NOT TO THE ROUTE (Aug 2026).**
A patient was signed out ~15 minutes into an ordinary session, mid-use, with no
warning. It looked exactly like an idle-timeout bug and was not one.

`useNavigate()` memoises its callback on the current pathname — read it in
react-router's own source, the deps are `[basename, navigator,
routePathnamesJson, locationPathname, dataRouterContext]` — so it returns a NEW
IDENTITY ON EVERY ROUTE CHANGE. `SessionGuard`'s `signOutAndRedirect` closed
over it, the main effect depended on that, and the effect's first three lines
reset the activity, refresh and ping timestamps. **So every navigation restarted
every clock in the guard.** The token rotation runs every 10 minutes and never
reached it, the 15-minute access token lapsed on its own wall clock, and the
next request came back 401 → "Your session has expired."

Measured, before the fix, by `e2e/zz-session-endurance.spec.ts`: a session
navigating every 30 seconds made **zero** `/auth/refresh` calls, **zero**
`/auth/activity` calls, and was signed out at **t+922s**. The 90-minute idle
window was working correctly the whole time — a reader who scrolls WITHOUT
navigating was never affected, which is why reading was the case that worked.

What holds it now, and all four matter:
- **`navigate` is behind a ref**, so nothing route-derived is in a dependency
  list. The effect depends on `userId` and the two window lengths.
- **The reset is keyed on the session id**, not on the effect running. A stable
  dependency list is one innocuous callback away from breaking again; a reset
  guarded on the session cannot break that way at all.
- **Every decision is `lib/sessionClock.ts`**, pure, so three hours of use can
  be pushed through it in a millisecond. `sessionClock.test.ts` runs five
  rhythms across 180 minutes and asserts survival AND that the gap between
  rotations never reaches the access token's TTL — a run that never goes idle
  but leaves a 20-minute hole is a session that dies on the next request. One
  test models the old resets and asserts it reproduces the failure.
- **The countdown is the SERVER's deadline.** `/auth/activity` already returned
  `idleDeadlineMs` and the client threw it away; it aligns to it now, so the two
  cannot drift. Signing out needs both clocks to agree the window is gone.

**ANY interaction counts**: `mousemove` and `pointermove` are the additions that
mattered (reading with the mouse in hand used to register as idle unless you
also scrolled), plus `focus` and `visibilitychange`. Throttled to one timestamp
write a second.

**AND FIXING THE TIMER IS NOT SUFFICIENT, BECAUSE A TIMER CAN BE MISSED.**
`apiFetch` gives a 401 that is NOT an idle timeout **one silent rotation and one
retry** (lib/api.ts). A suspended laptop, a backgrounded tab, a page reload, one
slow request — any of them can put the 15-minute access token past its life, and
none of them is a reason to end somebody's session mid-read. **The access
token's lifetime is bookkeeping and the idle window is the decision**, and only
the second may end a session.

Four rules, each with a failure behind it:
- **The idle 401 is never retried.** It carries `IDLE_TIMEOUT_ERROR_CODE` and is
  the server exercising the timeout; retrying would be the client trying to talk
  it out of one.
- **`/auth/refresh`, `/auth/login`, `/auth/logout` and `/auth/otp/verify` are
  never retried**, or a dead refresh token loops.
- **ONE rotation at a time, shared.** A page mid-load can have six requests in
  flight; six rotations would revoke each other — the refresh token rotates on
  use — and five would come back 401 for real, turning a recoverable moment into
  a sign-out.
- **The single-flight promise is cleared SYNCHRONOUSLY**, not on a timer. It was
  on a timer for one revision, which is a stale-answer bug wearing a tidy hat: a
  later 401 could be handed the `true` from a rotation that had already
  finished, skip its own, and retry against the same dead token. `api.test.ts`
  caught it.
- **The CSRF header is re-read per attempt.** A rotation issues a new csrf
  cookie, so a retry replaying the old header fails CSRF instead of succeeding —
  which would look exactly like the failure the retry exists to prevent.

**A FULL PAGE LOAD RESTARTS EVERY CLIENT TIMER**, so somebody reloading more
often than the rotation interval never reaches one either. No cadence fixes
that — the timer is what is being reset — and the retry above is what makes it
harmless. `e2e/zz-session-endurance.spec.ts` covers both: clicking links for 18
minutes, and reloading every 2.5 minutes for 18. **It clicks links and never
calls `page.goto`** — the first version used `goto`, which is a full document
load, so the app remounted every 30 seconds and the run failed identically with
or without the bug. It was measuring the harness.

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

# "What's changed" is two cards across, each its own height (Aug 2026)

Three columns inside a section that already gives 144px of its width to the
rail left each card about 270px at 1440 — narrow enough that a marker's name
took three lines while the card below it was mostly empty. These cards hold a
name, two figures with an arrow between them, a movement label, a date and a
badge: a wide, short shape forced into a tall, thin one with a hole in it.

Two things fix it and both are needed. **`sm:grid-cols-2`** gives each card the
room its content wants. **`items-start`, and no `h-full` on the card**, is what
closes the hole: a grid stretches its items, so the tallest card in a row was
setting the height of every card beside it and that space was drawn as empty
card rather than as nothing at all. A row of unequal things is allowed to be
ragged along the bottom. `e2e/marker-name-wrapping.spec.ts` measures the slack
below each card's last element and holds it at its own bottom padding.

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

# The results-ready moment is GONE (Aug 2026)

There was a full-screen screen between a sign-in and the Overview: an arch, the
patient's name, "your results are ready", and a button, shown once per released
report. **It is removed — the route, the component, the blurred backdrop, the
`Report.resultsReadySeenAt` column, the `resultsReadyPending` field on
`/auth/me`, the `StillContext` that froze the backdrop, the spec and the
screenshot walk.** Do not rebuild it.

**Why, in one sentence:** a patient who signs in because they were told their
results are ready does not need to be told again on the way to them. The
announcement was correct; the placement was the product standing between
somebody and the thing they came for.

**What survives, and it is the part worth keeping.** The mechanism was right
about one thing and it is written down here because the next once-only screen
will need it: a "show this once" flag must be keyed on something that does not
reset. That screen was keyed per REPORT, on the report — not on the session
(which resets every sign-in, making it a splash screen) and not on localStorage
(which resets on their phone, in a private window and after any cookie
clear-out). The first-sign-in walkthrough still works exactly that way, on
`User.walkthroughSeenAt`.

**The adding migration is still in the tree.** `20260812194755_results_ready_seen`
stays and `20260814090000_remove_results_ready_seen` drops the column forward.
Prisma records applied migrations by name, so deleting a directory a deployed
database has already recorded turns the next `migrate deploy` into a drift
error — the same principle as the `supersedes` arrays in seed.ts.

**`/results-ready` is NOT redirected**, unlike `/book` and `/appointments`. It
was only ever reached by an internal redirect and was never linked to or
emailed, so there are no bookmarks to honour and a redirect would be scaffolding
standing in for a screen nobody has a route to.

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
doorway. It appears in **exactly two places**: empty states (a single faint
hairline behind the message, `.arch-outline`) and the section rail's nodes
(already built, laid on its side, unchanged and not this class). It used to be
three — the results-ready moment drew it full size, standing on the floor of the
window, and that was the only place it was ever large. That screen is gone
(Aug 2026) and **nothing else may claim the large one**. It does NOT appear on
the Overview, on Results, on a report, on a marker page, in the sidebar, or
anywhere else carrying real data — **nothing with content in it gets a shape
behind it**. A patient should meet it two or three times ever. `border-radius` rather than a
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
