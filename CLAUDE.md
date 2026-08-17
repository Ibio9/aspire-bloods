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
shared:  accent #5A6472 · ink #14161A   (`bronze` / `espresso`, both themes)
light:   surface #EDEFF3 · border #DCE0E7   (`lightNeutral`, light only)
dark:    surface #E7E9ED · border #C7CBD3   (`brand.cream` / `brand.taupe`, the dark seeds)

⚠ **THE SURFACE AND THE BORDER ARE PER THEME SINCE Aug 2026** — see "Light mode
is bright" below. `brand.cream` and `brand.taupe` are the DARK theme's seeds and
nothing else; the light page and the light hairline are `lightNeutral`. The
accent and the ink are shared by both themes on purpose.

⚠ **THE PALETTE IS NEUTRAL AND COOL. IT WAS WARM UNTIL Aug 2026, AND MOST OF
THIS FILE STILL DESCRIBES THE WARM ONE.** Where a note below says brown, bronze,
cream, taupe, espresso, gold or "warm", read it as the ROLE it names — the
reasoning is almost always still correct and only the hue has moved. The
retheme is written up under "The palette went neutral" below; that section wins
over any colour claim anywhere else in this file.
Match the Aspire Rota sign-in for craft level. No default browser styling anywhere —
no native selects, no Chrome autofill blue, no native focus rings.
Reference theaspireclinic.com for register: dark, atmospheric, spacious, restrained.

## Light is a WARM ground with a COOL pastel on it (Aug 2026, second pass)

⚠ **THIS SUPERSEDES "Light mode went pastel" BELOW**, which is the first pass and
came back with the same complaint. Read this one first; the structural half of
the older note (light's surfaces are `lightNeutral`, `brand.cream`/`taupe` are
the DARK seeds) is unchanged and still correct.

**THE COMPLAINT, TWICE: light reads as a flat grey wash.** The first pass tinted
the PAGE with the accent — `mix('#F1F3F6', accent.teal, 0.15)`, which resolves to
#d3dfe3 — and that IS the reason it came back. **Mixing a dark, low-chroma teal
into a cool near-white produces a blue-grey.** The page carried a cast rather
than a colour and the ink over it was the only warm thing on the screen. A
surface whose OKLab chroma is 0.012 is a grey however it was arrived at.

**SO THE GROUND IS WARM AND THE COLOUR IS SOMEWHERE ELSE.** Two surfaces leaning
in opposite directions, which is the whole idea:

    surface  #F3EADF  THE PAGE. A warm off-white ivory, r > g > b, no accent
                      mixed into it at all. Not grey (nothing cool in it), not
                      brown (within a few percent of white).
    pastel   #e1f2f4  THE SECONDARY TINT. Section grounds, every pane. Built at
                      the teal's own HUE ANGLE with a stated saturation and
                      lightness (`reHsl`), never by mixing the dark accent into
                      white — that operation is what produced the grey.
    rail     #b7dfe4  THE SIDEBAR. The same pastel `LIGHT_RAIL_DROP` lower in
                      lightness. ⚠ A STEP DOWN, NOT A MIX TOWARD THE INK: both
                      put it below the page, only one keeps it a colour. The ink
                      is warm and the pastel is cool, so mixing them cancels —
                      measured on a screenshot, the rail was the largest surface
                      still rendering blue-grey.
    card     #fefefd  1.18:1 off the page, and that step is deliberately small.

**FIVE NUMBERS, AND EVERYTHING FOLLOWS THEM** (`LIGHT_BASE`,
`LIGHT_PASTEL_SATURATION`, `LIGHT_PASTEL_LIGHTNESS`, `LIGHT_RAIL_DROP`,
`LIGHT_HAIRLINE`). Change one and the page, the card, the panes, the rail, the
hairline, the hover states and the chart furniture all move. ⚠ `LIGHT_RAIL_DROP`
was SWEPT, not picked: under ~0.09 the rail fails the 1.08:1 floor off the page,
past ~0.14 it overtakes the card's own step and the page → panel → card ladder
inverts. It is 0.115, the middle of that window.

**⚠ `GLASS.panel` IN LIGHT WENT 0.46 → 0.60, AND THAT IS WHAT MAKES A PANE READ
AS A PANE.** A pane is the pastel now rather than the glass colour with a trace
of accent in it, and at 0.46 over a WARM page fewer than half its channels
survived: a cool tint at half strength over a warm ground is a NEUTRAL, so the
pane rendered as exactly the flat grey box this pass exists to remove. The alpha
is what decides how much of a colour reaches the screen. Still the most
transparent of the three glass surfaces, which is the claim that is asserted.

**SEPARATION IS SHADOW AND GLASS, NOT A GREY RULE.** The card/page tone step is
1.18:1 on purpose, the hairline is softer (`LIGHT_HAIRLINE` 0.045 → 0.075 off a
much lighter base, i.e. a quieter line), and the card's diffuse shadow is longer
again (16 → 24px, 36 → 46 on hover, `--shadow-diffuse` 0.11 → 0.13). A short
shadow under a white card on a warm off-white page reads as an OUTLINE; a long
one reads as HEIGHT.

**THE INK, THE RADII AND THE TYPE ARE UNTOUCHED.** `lightNeutral.ink` #1A1714 is
still the warm near-black, the radii are still 1.5rem / 0.875rem, and Fraunces /
Plex / Plex Mono are untouched — this pass is colour, surface, depth and shape.

## Four ambient sources in both themes, and one of them is a ribbon (Aug 2026)

⚠ **THIS SUPERSEDES "Two ambient sources" further down.** The ramp, the anchoring
argument and the "a light must be a SOURCE" reasoning there are all still
correct and still the reason this works; the count, the hues and the peaks moved.

    key      96% 1%    #DDF0F4 dark · #6CB6C6 light   0.40 / 0.13
    fill     20% 98%   #7BA6F2 dark · #5E7FD6 light   0.38 / 0.11
    green    99% 99%   #8FE3AE dark · #57B584 light   0.32 / 0.10
    ribbon   diagonal  #DCEAFF dark · #8FB0D8 light   0.15 / 0.055

**THE FILL IS A PROPER BLUE NOW.** It was the teal accent, which put it about
10° from the key once the key went cool — and two lights 10° apart are one light
with a wide falloff, the exact failure this file has recorded twice. Key, fill
and green are pairwise >20° apart and `tokenContrast.test.ts` asserts it
PAIRWISE, which is what stops a fourth source being dropped into the gap.

**⚠ THE GREEN IS A MINT, AND THAT IS A CONSTRAINT.** Blue is never strictly its
lowest channel, so no alpha of it over any surface can arrive at the shape of a
STATUS colour. An ambient green in the corner of a results page is the one
ambient decision capable of being read as a finding. Asserted.

**THE GREEN IS AT ITS CORNER AND THE FILL IS NOT**, and the asymmetry is the
sidebar and nothing else: 288px of opaque column sits over the bottom left, so a
light there has its core behind it. Nothing covers the bottom right.

**THE RIBBON IS FIVE BLOBS ON A BOWED DIAGONAL, ON `html::before`.** A slow
curved sweep from the top left to the bottom right, in the spirit of the XMB
wave. Two decisions worth keeping:

- **NOT a rotated bar.** A `linear-gradient` cannot curve, and the obvious
  alternative — one elongated radial with `transform: rotate()` — is refused
  because **a transform on a fixed element changes the containing block for
  every fixed descendant inside it.** A rule that is only safe while nobody
  nests anything is a trap. Five soft blobs whose centres follow a quadratic
  Bézier from (4%,8%) through (62%,26%) to (96%,92%), each overlapping its
  neighbours by well over half its radius, so what paints is one band. The two
  END blobs are at 45% and 60% of the peak, which fades it INTO the corners.
- **On `html` rather than as a sixth layer of `body::before`.** `body` creates a
  stacking context, so everything it paints — including its own `z-index: -1`
  pseudo-elements — is painted ABOVE any positioned box of `html`. That puts the
  ribbon under the three radials, under the grain and under all content, and
  keeps it one declaration instead of two.

Static at every motion preference: the "sweep" is the SHAPE, never an animation.
Off in print with the rest of the ambient layer.

**⚠ THE DARK PEAKS ARE AT A MEASURED CEILING, NOT A TASTE.** 0.43 on the key was
tried and fails twice — `--c-bronze` at 2.98:1 against its own core (floor 3.0)
and an /80 label on a lit pane at 4.44:1 (floor 4.5). 0.40 is the last step that
clears both. **`darkBronze` went 0.58 → 0.72 in the same pass, and it is the
same mechanism as last time: THE ACCENT IS MEASURED AGAINST THE LIGHT**, so a
brighter room is a lighter accent, every time.

**AND THE SAMPLER MEASURES ALL FOUR.** `tokenContrast.test.ts` composites the
ribbon and the three radials at every point of a 61×61 grid in paint order and
asserts every text token clears its floor at the worst ground it finds — light
13.40:1, dark 5.44:1, floor 4.5. Adding a source without adding it there would
leave that measurement describing a page nobody is looking at, so the test also
asserts the ribbon resolves to something at its own brightest blob.

## The marker card's status ground is a PLATE, not a wash (Aug 2026)

⚠ **THIS SUPERSEDES "The dark card status tint is solved for colour now" BELOW.**

**THE COMPLAINT: the card tint reads muddy — yellow dingy, red tomato.**

**THE FIRST QUESTION HAD A DEFINITE ANSWER: IT IS NOT TRANSLUCENT.** `bg-tint-*`
resolves through `rgb(var(--c-tint-high) / <alpha-value>)` with no modifier, so
it paints at alpha 1 in both themes. **A light plate placed BEHIND the card would
have done nothing at all** — it would have been covered pixel for pixel. So the
tint itself had to move.

**WHY THE OPAQUE VALUE WAS STILL MUDDY, WHICH IS THE USEFUL PART.** `--c-tint-*`
in dark is `solveWash`'s answer: the hue rendered at the LIGHTNESS OF A DARK
CARD. That is the wall this file has now recorded from five directions — **a
yellow at a dark lightness is a brown and a red at a dark lightness is a
maroon**, in any colour space, at any chroma. #453700 and #5b2922 are the most
colourful renderings that exist at 1.35:1 off a near-black card. Nothing was
mis-solved; the card being dark was the problem.

**SO THE CARD STOPS BEING DARK.** One family, five entries, no theme branch:

    status                plate      light ink   status word
    In range              #d2f9b3    15.2:1      6.91:1
    Below / Above range   #f9eab3    14.8:1      5.69:1
    Significantly out     #f9bcb3    10.9:1      4.86:1

**⚠ DEEPENED ONE STEP (Aug 2026), AND THE STATUS WORD IS WHAT BOUNDS IT.** The
first setting was 0.82 / 0.895 and read as faint pastels — #e2face, #faf1ce,
#fad4ce, chroma 0.044–0.063. At 0.86 / 0.84 the family carries 0.061–0.100 and
reads as a tint somebody chose. **There is about one more step in the whole
family and no more**: the light red status word measures 4.86:1 on the red plate
against a floor of 4.5, and it fails before the ink does. Deepen these by eye
without checking the WORD and the one piece of type in the product that carries
a status colour goes under AA on its own ground.

`STATUS_PLATE` in tokens.ts, from TWO numbers (`PLATE.saturation` 0.86,
`PLATE.lightness` 0.84) at each hue's own angle, so the five read as one family
and the pair to tune by eye is two numbers rather than ten hexes. This is the
composition the gauge already draws — its five fills are solved against
`PLOT_SURFACE`, a light ground, and are byte-identical in both themes. A light
plate under a light arc is one object; a light arc on a near-black card was two.

**⚠ A LIGHT PLATE IN DARK MODE NEEDS THE INK TO COME WITH IT.** `--c-espresso` is
a near-white cream in dark and `--c-status-yellow` is #F5CE3E, so a card that
changed only its background would be unreadable in the one place a wrong colour
is a clinical statement. `.dark .card-status-plate` re-emits the LIGHT token set
inside the card — **the same mechanism `@media print` already uses**, at a
selector that beats `.dark` — so the value, the name, the status word, the
hairline and the meta lines are all light's own by construction. COLOURS ONLY:
the shadow and glass alphas are not re-emitted, because the card is still sitting
on the dark page. The gauge does not move at all — `--c-hue-*-fill`,
`--c-rangemark` and `--c-chart-reference-edge` are theme-identical already.

**THE AT-A-GLANCE STRIP TAKES THE SAME PLATE (Aug 2026).** It was carrying the
identical muddy `bg-tint-*` fills the cards used to, on the same screen as the
cards, so the two halves of one summary disagreed about what a status looks like.
Both call `statusPlateClass` now, which is what makes them one system BY
CONSTRUCTION rather than by two call sites happening to agree. Only the segment
GROUNDS changed: the counts, the labels, the chevrons, the selection ring and the
dividers are untouched.

**AND `statusTintClass` IS DELETED, BECAUSE THAT WAS ITS LAST CALLER.** A helper
that paints the exact colour a pass has just removed, left in the tree with no
callers, is the "one autocomplete away" failure this file records elsewhere.
⚠ `--c-tint-*` and the `bg-tint-*` UTILITIES ARE UNTOUCHED and are still written
directly by the alert cards and the toasts — ordinary surfaces inside the
ordinary theme, with ordinary text on them. Two token families because there are
two jobs; what went is the helper, not the wash.

`.status-plate` (renamed from `.card-status-plate` when the strip took it, since
it is no longer card-only) is the island, and `statusPlateClass` emits it with
the colour — neither is useful without the other and nothing else applies either.

## Light mode went pastel, and it is three numbers (Aug 2026, first pass)

⚠ **SUPERSEDED — see "Light is a WARM ground with a COOL pastel on it" above.**

**THE COMPLAINT: light read as flat grey and white and looked cheap.** The
direction is a soft, modern, premium light theme: a calm pastel carrying the
surfaces, near-black ink, generous whitespace, large soft forms, one restrained
accent. ⚠ **THIS IS A FIRST PASS MEANT TO BE TUNED**, which is why everything
below is derived from three constants in `lightNeutral` rather than scattered.

**THE PASTEL IS `accent.teal`, WHICH WAS ALREADY IN THE PALETTE.** It passes the
one rule that matters: blue is never strictly its lowest channel, so no tint or
shade of it can be mistaken for a STATE. It was chosen against the other two
candidates rather than by default. **AMBER IS REFUSED OUTRIGHT** (it lands
between bronze and the status gold, so a page tinted with it is the hue of ABOVE
RANGE at a lower saturation, and no opacity makes that safe). **SLATE would work**
and is what the pane carried, but it sits ~20° from the accent, so a slate page
under a slate accent reads as one wash. Teal is 130° off the accent, which leaves
the accent the only thing on the page that looks like a decision.

    LIGHT_TINT      0.15    how much accent the page carries
    LIGHT_HAIRLINE  0.045   how far the border sits toward the ink
    LIGHT_BASE      #F1F3F6 the neutral the pastel is mixed into

    page      #d3dfe3     card      #fdfdfe     card/page 1.34:1
    sidebar   #c6d1d5     hairline  #cbd6da     body      13.1:1
    pane tint #e7eef0     vellum    #e8eef1     accent    #5A6472 (bronze, untouched)

**THE INK IS WARM NEAR-BLACK, IN LIGHT ONLY: `lightNeutral.ink` #1A1714.** A cool
near-black on a cool pastel is two cool greys, which is the flat look this is
getting away from. ⚠ `brand.espresso` is UNTOUCHED, because it seeds `nightBase`
and every dark surface derived from it; warming it would be a dark-mode change
wearing a light-mode label. `scales.espresso`, the light shadow and the light
chart furniture all build from the light ink instead.

**⚠ `buildScale`'s 50 STEP WENT 0.9 → 0.95, AND IT IS THE CARD.** With a pastel
page, a card at 0.9 inherits a tenth of the tint (#fbfcfc) and the composition
this is for — WHITE cards floating on a tinted ground — stops happening. It also
cost the trend line real room: its five colours are solved at 4.5:1 off the card,
and a card two levels darker pushed the light green and gold to 0.0899 of OKLab
separation against a floor of 0.09.

**SHAPE AND SPACING MOVED FOR BOTH THEMES, WHICH IS DELIBERATE.** Radii card
1rem → **1.5rem** and input 0.625 → **0.875rem**; card padding one step up
throughout. ⚠ **THE RADIUS AND THE PADDING ARE ONE DECISION** — a 1.5rem corner
on a card padded at 1.75rem reads as a rounded box, because the corner eats most
of the gap between the edge and the first line of type. Two themes of different
SHAPE would be worse than one shape, so these are shared; only colour is
light-only. The light SHADOW is softer and longer (`--shadow-blur`, per theme:
28px light against 16px dark), because a short shadow on a pale ground reads as
an outline and a long one reads as height.

## The dark card status tint is solved for colour now (Aug 2026)

⚠ **SUPERSEDED — see "The marker card's status ground is a PLATE, not a wash"
above.** The diagnosis here (matching light's CHROMA was the bug) is right and the
wash it produced still paints the counts strip and the alert cards; what is wrong
is the conclusion that a dark card can carry a clean status colour at all.

**THE COMPLAINT: the dark card tint read muddy while light's read clean.** "The
tint is translucent" is the right diagnosis of the RECIPE even though the applied
value was always an opaque hex: `matchLight` mixes the hue INTO the card in light
and then solves dark to the same CHROMA and the same presence. Dark carried
exactly light's colourfulness by design (0.0228 against 0.0235 in green). **The
matching was the bug.**

**⚠ THE SAME CHROMA IS NOT THE SAME COLOUR AT A DIFFERENT LIGHTNESS.** A given
OKLab chroma on a near-white ground is a clear pastel and on a near-black one is
a grey with a rumour of hue in it. Nothing was mismeasured; the target was wrong.

`solveWash` + `DARK_WASH` in tokens.ts: **2.6× light's chroma at 1.35:1 off the
card** (light's own wash is 1.09:1 off ITS card, and copying that number into
dark is what produced a tint nobody could see). Three floors bind it and are what
stop it becoming a filled alert card: body copy at AA on the wash, the STATUS
WORD at AA on the wash, and the wash lighter than the card rather than a hole in
it. Measured on the gold: 10.51:1 body, 7.66:1 status word.

    tint                  light      dark       dark chroma
    In range              #dce5d5    #293c1a    2.58x light
    Below / Above range   #fbf3d6    #453700    1.80x light
    Significantly out     #edd4d1    #5b2a23    2.60x light

**⚠ GOLD CANNOT REACH THE GAIN AND IS CAPPED BY THE GAMUT** — a dark yellow is a
brown, which is the wall this file has now recorded from four directions. It
takes the most sRGB holds at its lightness (1.8×) and the solve returns it.
**LIGHT IS UNTOUCHED AND IS THE REFERENCE.** The gauge is unaffected: it paints
`--c-hue-*-fill`, which is theme-identical and carries no wash.

**AND THE MARKER CARD'S TINT IS BACK.** It was removed for one revision on the
grounds that the dark wash was muddy; that was true of the wash and not of the
idea. The gauge arc, the chevron and the word still carry the status on their own
and the wash reinforces them, which is the rule as it always was.

## Light mode is bright, and it has its own two hexes (Aug 2026)

⚠ **SUPERSEDED BY "Light mode went pastel" ABOVE**, which keeps the structure
described here (light's surface and border are `lightNeutral`, not `brand`) and
changes the values: the surface is a soft teal pastel rather than a cool
near-white grey, and there is a third entry, the warm ink.

**THE BRIEF: a bright, modern, premium light theme.** White cards on a soft
near-white page, separation from tone steps, shadow and the glass rather than
from a grey fill, light neutral hairlines, and the accent as the one interactive
thread with everything structural around it neutral. **No dark-mode surface moves.**

**SO THE SURFACE AND THE BORDER ARE PER THEME NOW, AND THAT IS THE WHOLE
STRUCTURAL CHANGE.** `nightLift` is `mix(espresso, taupe, …)`, `darkText` is
`mix(cream, white, …)` and `darkBronze` is `mix(bronze, cream, …)` — so one pair
of hexes cannot be both "the light page" and "the direction dark lifts in" and be
changed for one of those reasons only. `lightNeutral` in tokens.ts holds the light
pair; `scales.cream` / `scales.taupe` (light-only families) build from it and
`brand.cream` / `brand.taupe` go on seeding dark, untouched.

    surface  #EDEFF3   was #E7E9ED, a mid light grey. Card #FDFDFE at 1.13:1 off
                       the page (was 1.20), pane 1.06, sidebar 1.09 — page, pane,
                       panel, card, in order. Body copy GAINS contrast, 14.90 →
                       15.73:1. ⚠ THERE IS A FLOOR JUST BELOW: at #F4F6F9 a card
                       is 1.07:1 off the page and the sidebar cannot fit between
                       the two at all.
    border   #DCE0E7   1.30:1 on a card against the old 1.60 — a light hairline
                       rather than a grey rule.

**THE LIGHT SIDEBAR IS A RECESSED RAIL NOW, WHICH IS DARK'S OWN IDEA.** It was
the card tone, so on a bright page it was a near-white sheet on a near-white
page — and the white specular lifted it **1% where the material's own test asks
for 2%**, with the alpha that would buy 2% being 0.625, i.e. white paint. It goes
DOWN off the page instead (the page taken three quarters toward the hairline):
1.09:1 off the page, sheen lift 5.2%, every label on it gaining contrast.
`--c-panel` is now its own colour in BOTH themes; the MATERIAL is still shared and
is still asserted.

**SHADOWS CARRY MORE IN LIGHT** (`--shadow-diffuse` 0.08 → 0.11, and the diffuse
layer's blur 8 → 16px, 24 → 36 on hover). The tone step between page and card
nearly halved; the separation moved onto the hairline, the glass and this. A short
shadow under a card on a near-white page reads as an outline; a long one reads as
height.

**THE INK AND THE ACCENT ARE SHARED AND WERE NOT TOUCHED.** `espresso` #14161A is
already a near-black — a hair cool rather than warm — and it is the seed of every
dark surface, so warming it is a dark-mode change wearing a light-mode label.
`bronze` #5A6472 stays the single interactive accent (buttons, links, focus rings,
active nav); note that it is a cool slate today rather than a warm bronze, and the
key is a role name.

## The status yellow is #F5CE3E and the gauge paints it, byte for byte (Aug 2026)

**IT TOOK THREE PASSES AND THE FIRST TWO CHANGED THE WRONG THING.** There are two
yellows and only one of them renders. `statusHue.yellow` is the SEED; the gauge
paints `--c-hue-yellow-fill`, which `BAND_FILL` **re-derived from the seed at its
own fixed lightness and saturation**. So the seed went #C79A16 → #EAB308 and the
screen went #cbab4c → #d1aa33 — still a dark gold, both times, and a test on the
seed would have passed both times.

**THE FILL IS PINNED TO THE HUE ITSELF NOW.** `BAND_FILL.yellow` is
`{ saturation: 0.902, lightness: 0.602 }`, which is #F5CE3E's own saturation and
lightness, so `reLightness` returns it unchanged: **`--c-hue-yellow-fill` ===
`statusHue.yellow`, byte for byte, identical in both themes**, and
`tokenContrast.test.ts` asserts that identity rather than a derived value. It also
holds a floor — r ≥ 0xF2, g ≥ 0xC0 — so a future solve cannot walk it back into
gold without failing.

**⚠ AND PINNING IT COST THE CONTRAST RUNG, DELIBERATELY.** A clean light yellow is
LIGHTER than the light green: 1.28:1 off the plot against green's 1.51, where the
rung asked for 1.85. Pinning the value and holding the rung are contradictory, and
the rung is what gave — because `BAND_CONTRAST` is a CHART BAND concept (bands were
context behind a trend line and had to escalate in weight without out-reading it),
the trend chart has drawn no bands since Aug 2026, and the only instrument left
painting these fills is the ARC GAUGE, where the five slices are the instrument
rather than the background to one. Three assertions moved with it:

- "in range is the faintest of the five" → **every adjacent pair is a visible
  step**, measured in OKLab (floor 0.045, all five ≥ 0.0567), and every band
  stands off the plot.
- "escalates continuously by contrast" → **escalates continuously by HUE ANGLE**:
  93.3° 64.4° 47.2° 29.5° 7.8°, strictly falling, green through clean yellow to
  red. That is what a traffic light IS, it holds in both themes, and unlike the
  contrast ordering it is not in tension with pinning any one of the five.
- the chroma SHARE → yellow takes the whole ceiling rather than 85% of it, because
  it IS the hue. The rule that protects the palette — a band may never be MORE
  colourful than the hue it derives from — holds with equality.

**EVERY BLEND BETWEEN TWO STATUS COLOURS IS OKLCH NOW, NOT sRGB.** This is the
other half of "green to yellow olives out", and it is a fact about the
INTERPOLATION rather than about either endpoint — no choice of yellow could have
fixed it. A straight line between two sRGB points passes through the middle of the
cube and the middle of the cube is grey: sRGB's midpoint of the green fill and
#F5CE3E is **#cdae62**, a dull gold LESS colourful than either endpoint. OKLCH's is
**#c9d165**, a bright yellow-green. `oklchMix` in tokens.ts is the one blend
operation (lightness and chroma linear, hue along the SHORTER arc), the hinges are
computed with it, and the test asserts the hinge equals the OKLCH midpoint AND is
NOT the sRGB one — because a `mix()` creeping back would still be "a midpoint" and
would still pass the luminance check.

**AND THE GRADIENT ITSELF INTERPOLATES `in oklch`, WITH AN sRGB FALLBACK.** The
component emits two ramps with identical stops as `--ring-paint` /
`--ring-paint-oklch`, and `@supports` in globals.css picks. ⚠ It cannot be done as
`background: var(--a); background: var(--b)`: a `var()` resolving to something
unparseable is invalid at COMPUTED-VALUE time, which falls back to the property's
initial value — no gradient at all — rather than to the declaration above it. The
fallback is not degraded either: every boundary carries a stop at its own OKLCH
midpoint, so even in sRGB the browser interpolates across half a blend with the
correct colour pinned at the centre.

**⚠ A LIGHT TRACK ROUND THE ARC WAS TRIED AND REMOVED IN THE SAME WEEK (Aug
2026). DO NOT ADD IT BACK.** The reasoning that produced it stands and is the
reason this note exists: the arc's hexes are byte-identical in both themes and
nothing composites them, so the remaining explanation for "the yellow looks dark
in dark mode" is SIMULTANEOUS CONTRAST, and the only lever left is the ground.
`PLOT_SURFACE` is the surface the five fills were solved against, so a channel of
it under the ring is the principled ground.

**The cure was worse than the complaint.** A pale ring round the arc reads as a
SECOND RING, part of the instrument rather than its ground, and it took the space
the value in the middle needs. The arc is the single opaque coloured stroke again,
at its original thickness and diameter (33.5–39 of the box). `ArcGauge.test.tsx`
asserts the absence rather than merely not testing for it, because "add a subtle
ground behind the arc" is a reasonable-sounding idea that has now been tried.

**AND THE VALUE IN THE MIDDLE IS SIZED BY THE RING, NOT THE PAGE.** The marker
page's gauge carried `.hero-value`, a clamp that runs on the VIEWPORT — so at 1440
it was 52px inside a ring whose interior is a fixed share of a 300px instrument,
and "24.6 mIU/L" arrived at the arc with nothing between the two. `.gauge-frame`
makes every gauge a `container-type: inline-size` query container and `cqw` is then
a share of THE GAUGE: `.gauge-value` (Fraunces, the marker page) and
`.gauge-numeric` (mono, everything else) each fit their own ring with no second set
of numbers to keep in step. Measured: 300px ring → 38px Fraunces in a 168px well;
176px card ring → 20px mono in a 99px well. **The clamp bounds are steps of the
type scale** — fluid type between two steps is the pattern `.display-heading`
already uses; what is new is that the middle term is the container rather than the
viewport. `GaugeValue`'s `size` prop is gone with it: a size chosen by the caller is
a size chosen by somebody who cannot see the space. ⚠ A REFUSAL renders its value
with no ring round it, so both refusal roots carry `.gauge-frame` too and the clamp
holds the result inside the same two steps either way.

**NOTHING DARKENS THE ARC AT RENDER, AND IT IS MEASURED OFF THE PAGE NOW.** No
alpha on any stop, no `opacity`, no blend mode, no filter, no track showing through
(the mask's interior is opaque white), and nothing above it. `.arc-gauge__ring`
DECLARES `opacity: 1; mix-blend-mode: normal; filter: none` even though none of
them was set — those three are the only ways this identity can be broken silently,
and in opposite directions in the two themes.

**⚠ AND THE HALF A COMPONENT TEST CANNOT SEE IS THE ANCESTORS.** `opacity`,
`filter` and `mix-blend-mode` on an ancestor reach down and cannot be undone from
the ring, so a declaration on the ring proves nothing on its own.
`e2e/arc-gauge.spec.ts` walks from the ring to the document root and fails on any
of the three, and calls `elementsFromPoint` at four places on the ring to get the
BROWSER's own answer to "what is above this" rather than an inference from z-index.
Audited and clear: the page grain, both ambient glows, the vignette and the panes'
streak and grain are all `z-index: -1`, i.e. painted before content. **The only
things above the arc are its four boundary hairlines**, which are marks ON it — the
greyscale carrier the status rules require, one theme-independent colour over one
theme-independent band, under 1% of the arc's area.

**AND THE STATUS WORD IN DARK IS THE HUE ITSELF NOW.** It had been solved to
**#dbad00** — a denser, darker gold than the band it names — because the solver
maximises chroma subject to AA and nothing told it to prefer the palette's own
colour. The rule is now "take the hue where it clears the floor, solve only where
it does not", which is general: yellow clears 8.19–13.53:1 on every dark surface
and is taken unchanged; green and red do not and are still solved.

**⚠ LIGHT CANNOT, AND THE NUMBER IS THE REASON.** `#F5CE3E` measures **1.50:1 on
the light card**, 1.37 on its own wash, 1.32 on the page. A light yellow on a
near-white surface is not a legible word at any size, and this is the ONE piece of
text in the product carrying a status colour. Light stays derived (#675a27,
6.73:1); dark is #F5CE3E (10.46:1). Every FIELD of the colour is the exact hex in
both themes; the one piece of TYPE is the exact hex wherever it can be read, and
the test asserts the light ratio as the reason so nobody "corrects" the asymmetry
without meeting the number first.

`statusHue.olive` **#939328 → #A7AF36**, the OKLCH midpoint of green and the new
yellow. Orange is untouched as a seed; the gauge's orange hinge is the OKLCH
midpoint of the yellow and red FILLS (#fca24b). `DARK_FILL_HUE` yellow 0.82 → 0.7
and olive 0.9 → 0.8, because both key swatches came up with their hues and the
boundary hairline across them fell under its 1.3:1 greyscale floor. **The chevron
shape layer is untouched on every status.**

## Every card in a row is the height of the tallest card in it (Aug 2026)

`.card-row` in globals.css, on every card grid. This REVERSES the `items-start`
ragged-bottom rule this file used to argue for in three places. That rule was
answering a real failure — a stretched short card drawing its slack as empty card
— and the cause is not the stretching, it is a card whose CONTENT is pinned to the
top of a box that grew. The card is a flex column, so the slack falls between its
blocks.

**⚠ `align-items: stretch` ON ITS OWN DOES NOTHING HERE.** A grid already
stretches its items; what breaks is the chain of PASS-THROUGH WRAPPERS between
the item and the card — an `<li>`, a `Reveal`, and the `<a>` that makes a card its
own click target. Each sizes to its own content, so the cell is full height and
the card in it is not. Each wrapper is NAMED in the selector rather than reached
with a descendant, because `height: 100%` on everything inside a card is a
different bug. ⚠ **NOT ON A GRID OF CONTROLS** — it stretches an Input's wrapper
to the tallest cell.

## The palette went neutral, and it is four hexes (Aug 2026)

⚠ **THE LIGHT HALF OF THIS IS SUPERSEDED** by "Light mode is bright" above: the
light surface and border are `lightNeutral` now and the two hexes named here are
the DARK seeds. The reasoning about what is derived and what is not is why that
split was two lines rather than a sweep, and the four re-solved numbers at the
foot of it are still the list of things that move whenever a palette does.

**Raheel rejected the warm theme.** The brief was explicit: a clean black/dark
theme, no brown, no amber, no tan, cool whites and greys, one clean accent,
status colours untouched.

**IT IS DONE IN `brand` AND ALMOST NOWHERE ELSE, WHICH IS THE WHOLE POINT.**
Nothing in this codebase writes a colour except tokens.ts. Every surface, tint,
border, shadow, chart fill and status wash is a `mix()` of four hexes resolved
through a custom property — so re-theming two apps was those four, plus the
handful of places that had named a warm hue explicitly. **There was no sweep
through components, because there was nothing in the components to sweep**: a
grep for hardcoded hex across `apps/web/src` returns seven, all inside one
comment recording measured values.

    accent    #5A6472   was bronze  #8a5e45
    ink       #14161A   was espresso #423c36
    surface   #E7E9ED   was cream   #e3dfd3
    border    #C7CBD3   was taupe   #c9bca9

**THE KEYS DID NOT CHANGE AND THAT IS DELIBERATE.** `text-espresso`,
`bg-cream-50`, `border-taupe`, `scales.bronze[700]` appear several hundred times
across two apps, in Tailwind's colour map, in specs that read class names and in
the PDF builders. Renaming them is a mechanical sweep with no visual result and
a large surface for a mistake, on a change whose entire risk is visual. They are
ROLE NAMES with historical spellings, which is what they always were; `role` in
tokens.ts exports the same four under the names they actually mean.

**THE FIVE THINGS THAT WERE NOT DERIVED, AND THEREFORE WOULD HAVE SURVIVED:**

1. **`--c-glow`** — an explicit gold (`mix(bronze, '#f0bd6a', …)`), the one place
   in tokens.ts that named a hue rather than deriving one. A gold corner glow
   over a clean black interface is not a leftover, it is the most visible warm
   thing on the screen. It is a cool white-blue now.
2. **The second accent** — `plum` renamed to `slate` (#6B4260 → #3F4B63). A
   muted plum was "the bridge back to bronze"; there is no bronze to bridge to.
3. **`index.html`'s two `theme-color` metas** — literal copies of the old page
   colours, driving the browser's own address bar on mobile. A `<meta>` cannot
   read a custom property, so they stay literals and are flagged as such.
4. **Both PDF builders** — `pdfSummary.ts` and `gpHandover.ts` each held their
   own copies of the brand hexes, and were the only things left printing warm
   brown, in a document a patient hands to a doctor. They import `brand` now.
5. **`nightLift`** — *where the brown actually came from*, and it took the blame
   for years. Every raised dark surface is `mix(nightBase, nightLift, t)`, so the
   lift decides the HUE of every card and panel; it pointed at taupe, so the more
   a surface was lifted the browner it got. That is why "raising the surfaces
   until a card separated turned the whole viewport brown" was true, and why the
   fix at the time was to darken the PAGE rather than to fix the direction.

**THE STATUS COLOURS ARE UNTOUCHED, AND ONE TOKEN IS PINNED TO KEEP THEM SO.**
`statusHue` is unchanged and asserted as literals. `PLOT_SURFACE` — the gauge
track, the ground the five band fills are SOLVED against — is now a **literal
neutral grey at the old value's exact relative luminance (0.8238)**. WCAG
contrast depends on luminance and not hue, so every ratio in `BAND_CONTRAST`,
`BAND_FILL`, `MARK_FILL`, the optimal narrowing and the boundary hairline is
arithmetically unchanged and the five fills are the same five hexes. The track
simply stopped being brown. ⚠ Do not re-derive it from `brand.cream`; that
coupling is what would silently re-solve the clinical palette.

`SOLVED` (washes, labels, lines) DID move, because those are solved against the
card, the page and an input, and all three changed. Light's green line came out
byte-identical; dark's moved one step. Nothing was picked by eye —
`tokenContrast.test.ts` re-runs `solveTokens()` and asserts the literals equal it.

**FOUR NUMBERS HAD TO BE RE-SOLVED, AND EACH FAILED LOUDLY FIRST:**

- **`nightBase` 0.74 → 0.45.** The old figure was right for a warm brown ink at
  26% luminance. The ink is already near-black, so 0.74 landed on #050506 — past
  where a page is a colour, with no room under it for the sidebar to recess into.
- **`cream` #F3F4F6 → #E7E9ED.** The first pass used a near-white and **the whole
  light ladder collapsed**: a card is the surface taken 90% to white, so a page
  starting at 96% white left page→card at 1.05:1 against 1.30. Every light
  surface lives in the gap between this and white, so this value IS that gap.
- **`glassColour` (light) 0.35 → 0.5 toward the surface.** A WHITE specular on a
  96%-white pane has nowhere to go — measured, it lifted by 0.4% where the
  material's own test asks for 2%.
- **`darkBronze` 0.42 → 0.58, and the chart hairline 0.317 → 0.37.** The accent is
  measured against the KEY LIGHT'S CORE, and a cool white-blue glow is a far
  brighter ground than the gold it replaced (2.76:1, under the 3:1 floor). The
  hairline is squeezed from both sides — >1.6:1 drawn at 55% over every band, and
  >1.3:1 as a rule on the dark key swatches — so it was swept at 0.01 across
  0.30–0.50 rather than nudged. The window is 0.35–0.39.

**AND THE SUITE CAUGHT A REAL FAULT THE RETHEME INTRODUCED.** With the key light
gone cool, the light theme's two ambient sources measured **4° apart in hue** —
one light with a wide falloff, which is precisely the failure the second source
exists to avoid. The fill is teal in both themes now. Two assertions had to be
rewritten rather than fixed, because their PREMISE was the warm palette: "the
brand accent is blue-lowest" (it is a slate now, and the rule narrowed to the
status hues, where it belongs) and "the key light is warm" (both are cool; what
is measured is that they are 20°+ apart).

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
/80). `.card-label` is the explanation card's ONE label class — all four of its
labels, 16px, Plex 600, sentence case, 0.01em, full tone. `.sublabel` is the
quiet label half of a pair inside a card whose heading is elsewhere (12px,
semibold, sentence case), which since Aug 2026 means Compare's "Common
comparisons" and nothing else. The weight stays at medium or above in all three:
a thin 12px label disappears on the dark page, and "quieter" must never become
"fainter". All three carry `break-after: avoid` in `@media print`.

**THE EXPLANATION CARD. SIXTH SETTING, AND THE FIRST FIVE ASKED THE WRONG
QUESTION (Aug 2026).** Every one of them was the same move: adjust the size of
the card's HEADING against something else in the card. Five different answers —
12px → 14 → 16 → 28 → 16, with the definition dragged down to 21px in the fourth
to get out of the way — because the question had no answer. A heading and three
sub-labels of the same kind, in a card that small, is a contest nothing wins.

**THERE IS NO HEADING. ALL FOUR LABELS ARE ONE CLASS.** "What this marker
means", "If it's high", "If it's low", "Lifestyle context" — one size, one
weight, one case, one tone, rendered by one component so no call site can
disagree with the other one. That is the whole change, and it is why this
setting is different in kind from the five before it rather than a sixth guess.

**AND THE LADDER INVERTED WITH IT: THE LABELS LEAD.** The card is a reference
somebody scans for the one question they have, not an essay — so the labels are
the most prominent text in it and the prose is subordinate to them:

    .card-label      16px  Plex 600, sentence, 0.01em, full tone  ← scanned
    the definition   14px  Fraunces 400, opsz-small, full tone
    the answers      12px  Plex 400, sentence, 0, /85

Every other eyebrow in the product is 12px and stays 12px.

**UPPERCASE IS THE LOAD-BEARING CHANGE, NOT THE SIZES.** Uppercase at 0.14em
reads as loud REGARDLESS OF SIZE, which is the sentence the whole history was
missing and is why five attempts to referee this by size alone all failed: 16px
uppercase and tracked has the footprint and all of the shout of a 21px
sentence-case line, so "make it smaller" bought a quieter number and the same
volume. Drop the case and 16px IS the middle ground between the old heading
(16px uppercase, too loud) and the old sub-labels (12px sentence, too quiet).

⚠ **THE ANSWERS SIT AT THE FLOOR OF THE TYPE SCALE.** 12px is as small as
anything in this product is allowed to be and body copy is not usually set
there. It is deliberate and it is the price of the ordering above: three
descending steps starting at 16 is 16/14/12, and the scale has nothing under 12.
If it ever has to give, RAISE THE ANSWERS and take the labels to 18 with them,
keeping the order. Do not open a fourth level, and do not set the four labels
differently from each other.

**THE SPACING IS MEASURED AT THE PAINT, NOT AT THE MARGIN.** Half-leading is
part of what a reader sees: a 12px answer at 1.5 carries ~3px above its own
first line and a 16px label ~4.8px below its last. So 36px between blocks and
14px inside a pair land at about 28px against 6px on screen. An earlier setting
of 24/6 read as 4:1 in the source and rendered at barely 2:1, which is exactly
"a sub-label sits almost as far from its own answer as from the block above".
The first label sits the same 14px above the definition as every other label
sits above its answer, because that is what the pair is.

⚠ **MEASURE BEFORE TOUCHING ANY OF THE THREE.** It has been adjusted by eye five
times and come back wrong in a new direction each time.
`e2e/explanation-card-hierarchy.spec.ts` reads the computed size, weight,
tracking, case and colour of all three levels off the rendered card in both
themes, plus the painted gaps, and asserts the ORDER rather than the values —
including that all four labels are byte-identical to each other and all three
answers are byte-identical to each other.

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

**BOTH PDFs PUT THE COLUMNS IN THE ORDER range · result · status (Aug 2026),**
in every table in both documents. It was `RESULT · UNIT · RANGE · STATUS`; it now
reads as the comparison it is — "133–146, and this one is 128, so: below range" —
rather than a number followed some columns later by the thing it would have to be
compared with. The UNIT stays beside the RESULT, because it is a property of that
number rather than a column anybody scans. The x offsets are recomputed rather
than permuted: the widths differ per column and moving the labels over the old
offsets prints each header over its neighbour's cells.

**AND BOTH TABLES NOW GO THROUGH `formatReferenceRange`,** which they did not —
they interpolated `${low}–${high}`, so an eGFR printed **"60–999"** in a document
a patient keeps and a converted range printed as
"3.884960761896305–5.494444506110488". That is the one thing CLAUDE.md says
every reference range reaching a screen or a PDF must not be, and the claim that
the fix was "complete by construction" was false for these two.

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

## The palette has a second family, and it is picked by a rule (Aug 2026)

**Raheel asked for more colour and said not to treat the existing palette as a
limitation.** Written down as a measurement rather than a matter of taste: bronze,
espresso, cream, taupe and all five status hues live between **10° and 90° of
hue**, so the product had no cool colour at all and the only accent anything
could reach for was the brand one.

**TWO ACCENTS. `accent` in tokens.ts.**

    teal  #2F6F6B  ~176°  bronze's near-complement, 86° from the nearest status
                          hue. Green-leaning rather than blue-leaning, which is
                          what lets it sit WITH warm brown — teal and bronze is
                          the oxidised-copper pairing. The cool fill in dark.
    plum  #6B4260  ~313°  red-dominant like bronze, so a plum glow and a bronze
                          glow read as two lamps in one room rather than two
                          brands. The warm fill in light.

**THE CONSTRAINT IS NOT AESTHETIC AND IT IS MACHINE-CHECKABLE.** An accent may
never be mistakable for a STATE. "Looks different enough" is not a check, so:

    BLUE IS STRICTLY THE LOWEST CHANNEL IN EVERY STATUS HUE AND IN BRONZE.
    IT IS NEVER STRICTLY THE LOWEST IN EITHER ACCENT, AT ANY STEP.

It holds through the whole 50–900 ladder in both themes because mixing toward
white, espresso or the page moves all three channels together and cannot reorder
them. `tokenContrast.test.ts` asserts it, on every step, both themes.

**BURNT AMBER WAS THE THIRD CANDIDATE AND IS REJECTED BY THAT SAME RULE**, which
is the useful half: it lands around 35–40°, between bronze at 22° and the status
gold at 45°, so it is the hue of ABOVE RANGE at a lower saturation on the same
screen. There is no opacity at which that becomes safe. The test asserts the
rejection, so it can be re-run rather than merely recorded.

**WHERE THEY ARE USED:** the second ambient glow in each theme, the tint and the
lit edge of the page-surface pane, and nothing else yet. **WHERE THEY ARE
FORBIDDEN, and this is not a style note:** nothing on a marker card, in a range
gauge, on a trend chart or in a status badge. Those are status surfaces, and a
decorative hue beside them reads as a state. Bronze, espresso and cream are
untouched and are still the foundation; **the status colours are untouched**.

## Two ambient sources, in both themes (Aug 2026)

⚠ **SUPERSEDED — see "Four ambient sources in both themes, and one of them is a
ribbon" above.** Everything below about the RAMP, about a light having to be a
source rather than a wash, and about why the fill is at 20% rather than at the
corner is unchanged and is why the current version works.

Dark had one warm glow in the top right. There are two now, in both themes: a
warm KEY at 96% 1% and a cooler, quieter FILL at 20% 98%. One light gives a page
a DIRECTION; two give it DEPTH.

**LIGHT MODE PAINTS BOTH NOW**, and the key cannot be the same hex as dark's: on
near-black a glow is LIGHT ADDED and must be lighter than the page, while on
cream a pale gold measures 1.02:1 and what reads as warmth is colour taken
slightly DOWN. Same source, same position, opposite direction — the identical
reasoning as the trend chart's spark halo.

**THE FILL IS AT 20%, NOT AT THE CORNER, AND THAT WAS FOUND ON A SCREENSHOT.**
At 4% 99% it was invisible: the patient sidebar is 288px, which is 20% of a 1440
viewport and is a pane at 78% of an opaque colour, so the only bright part of the
ramp was behind a column and the second light existed nowhere a reader could see
it. Moving it inward puts more of the page in the ramp's TAIL, which is why
`GLOW.secondary` in dark is 0.26 rather than the 0.20 it was at the corner.

**ONE RAMP SHAPE, WRITTEN ONCE.** Nine stops as multiples of one peak per source
per theme (`GLOW` in tokens.ts, emitted as `--glow-1` / `--glow-2`). Four
hand-written gradients would drift.

**THEY ARE BIGGER NOW — 88% x 80%, from 62% x 58% (Aug 2026).** Same anchors,
same colours, same peaks, same ramp SHAPE: the alpha at any given fraction of the
radius is unchanged and the radius is longer, so every stop lands further out and
the falloff per pixel is gentler. The vignette grew with the light it is anchored
to (125% -> 150%), or it would have begun its descent INSIDE the key rather than
outside it and the two would have cancelled across the middle of the page.

⚠ **AND THEY NOW OVERLAP, WHICH THEY DELIBERATELY DID NOT.** At 62% they were
2.07 radii apart, so at every point at least one had reached zero — and THAT was
the entire justification for measuring the two cores separately. At 88% they are
1.49 apart. So the measurement changed rather than the claim being quietly
dropped: `tokenContrast.test.ts` **SAMPLES THE VIEWPORT ON A 61x61 GRID**,
composites both ramps at every point in paint order, and asserts every text token
clears its floor at the worst ground it finds. Measured: light 7.13:1 at 20%,98%;
dark 8.12:1 at 97%,2%, against floors of 4.5. That is strictly stronger than the
corners were — they are two of the points it visits — and unlike them it survives
somebody enlarging these again, moving one, or adding a third.

**⚠ THE DARK KEY CAME DOWN FROM 0.40 TO 0.36, AND IT WAS A PRE-EXISTING BUG.**
Checking every corner is what found it: at 0.40 `--c-bronze` measured **2.94:1
against its own core**, under the 3:1 floor, on a page token, in the one corner
the design draws attention to. That was true before any of this pass. 0.36 gives
bronze 3.22, body copy 7.84, taupe-900 5.32 — and the page is not darker for it,
because there are two lamps now. `PANEL_SHEEN.peak.dark` came down with it
(0.07 → 0.064): the sidebar's sheen is bounded by "a reflection is never brighter
than the light it reflects", so less light means less reflection, and the test
caught it in the same run.

**LIGHT'S PEAKS ARE A QUARTER OF DARK'S AND THAT IS A BOUND, NOT A TASTE.** Dark's
glow ADDS light to near-black, which moves text contrast the safe way; light's two
both DARKEN cream. The pair is held to spending at most **15% of the bare page's
own body-copy contrast** — measured at 12.5%, which is as strong as they go.

## Glass is the default surface; a status tint is the exception (Aug 2026)

**IT WAS OPT-IN AND IS NOW THE DEFAULT.** The old rule was a hand-maintained
list of "page-level structural surfaces", which meant most of the product stayed
flat while a handful of screens had a material — and a list of exceptions kept in
step across forty call sites is forty chances to forget. `Card`'s `surface`
defaults to `glass`; what is opaque is named: **anything carrying a status tint**
(refused in Card.tsx rather than by convention), the auth card, the mobile
drawer, and the two CHART cards.

**THE EFFECT IS HARDER.** blur 10 → **20px**, saturate 1.08 → **1.55**, fill
0.68/0.62 → **0.46/0.42**. The blur is free — what a backdrop filter costs is the
EXISTENCE of the pass, not the radius (2px measured the same as 14px), so the
only argument for 10px was about a number that turns out not to depend on it.
The lower fill means **the fill is no longer what separates a pane**: the streak
and the lit edge are, and the contrast test measures the streaked pane rather
than the flat body.

**AND THE THREE ALPHAS INVERTED.** A pane is now the most TRANSPARENT of the
three translucent surfaces rather than the most opaque. What each has behind it
decides how much it must OBSCURE: the control bar (0.62/0.58) has the reader's
own results scrolling under it, the sidebar (0.75/0.68) is navigation that must
not be read through the page it navigates, and a pane has nothing moving under it
and covers more of the viewport than either.

⚠ **THE TWO CHART CARDS STAY OPAQUE, ON A MEASUREMENT.** The trend line's five
colours are solved at 4.5:1 against `--c-cream-50`. On a pane, in light, they
fall from 4.53–4.82:1 to **3.73:1**, and to **3.44:1** under the key light — the
clinical palette failing its own solve because a decorative surface moved out
from under it. `tokenContrast.test.ts` pins that measurement and **retires
itself**: if the palette is ever re-solved so a pane clears the target, that test
fails and the exception can be deleted with evidence rather than by taste.

**MEASURED after the change**, 166 cards, 3s scroll, headless Chromium: 25fps as
shipped, 26fps with the panes filter removed, 60fps with no glass at all. The
panes cost nothing; the cost is the backdrop pass that was already there.

## The sidebar is near-black, not brown (Aug 2026)

`--c-panel` in dark is `nightBase` taken a further 60% toward black (#070605),
not the card tone. The whole dark surface scale lifts toward a warm mid-brown, so
at 78% over the page the column resolved to #252220 — a brown rail beside a
near-black page, which is exactly the register `nightBase`'s own note warns
against.

**IT IS A RECESSED COLUMN NOW, NOT A RAISED ONE**, and that is the change of
idea: a panel darker than the page is a thing the page is lit in FRONT of, which
is what a navigation rail beside a lit room actually is. Every measured claim
gets easier in that direction — the labels gain contrast rather than losing it.

**MORE TRANSPARENT AND DARKER AT ONCE** (`PANEL_WASH_ALPHA.dark` 0.78 → 0.68).
Not a contradiction: those were only ever coupled while the FILL was the thing
being asked to look like a panel. At 0.78 the lit half of the column stood 1.09:1
above the unlit half, which reads as a lid; at 0.68 it is 1.16:1.

⚠ **THE LADDER FLOOR IS DIRECTION-AWARE AND THE ARITHMETIC IS WHY.** WCAG's ratio
is (L1+0.05)/(L2+0.05) and the dark page's luminance is 0.0055, so a PURE BLACK
sidebar — which the palette forbids — would measure 1.11:1. Asking for the old
1.08 downward is asking for a panel 3% off black. Dark is held at 1.03 and the
separation is carried by `--c-panel-edge` at 3.40:1, which that token's own note
already called "the whole of the separation wherever the glow does not reach".

**AND `--c-panel` IS NO LONGER `--c-glass`.** That unification was right about
the MATERIAL — same blur, saturation, streak, lit edge and grain, all still
shared — and wrong about the colour for this one surface.

## Page surfaces are glass; result cards are not (Aug 2026)

A third alpha in the glass family (`GLASS.panel`, 0.68 / 0.62), between the
sidebar's 0.75/0.78 and the control bar's 0.62/0.58 — the three differ only in
what is BEHIND them. `.glass-panel` in globals.css carries the material:
translucent fill over the shared backdrop blur, a specular streak at 208° from
the corner nearest the key light, a lit edge along the top and right, and grain.
`Card` takes `surface="glass"` or `surface="vellum-glass"`.

**THE BOUNDARY IS A RULE, NOT A PREFERENCE.** A surface is a PANE if it is one of
a handful of containers a screen is built out of. It stays an ordinary CARD if it
is one of many instances of one repeating object, **or if it carries a status
colour**.

    glass   the at-a-glance strip · the Results section containers · the
            Documents cards · the marker explanation card (on vellum) · the
            out-of-range contact card · the Overview's latest-panel card and its
            Go-deeper tiles.
    card    every marker result card · the Overview's attention and
            What's-changed cards · the auth card · the mobile drawer.

**⚠ AND THE MARKER PAGE'S OWN TWO CARDS STAY CARDS, WHICH IS CORRECTNESS RATHER
THAN JUDGEMENT.** The trend chart's five line colours and both gauges' five band
fills are SOLVED at a fixed ratio against `--c-cream-50` (`LINE_FILL_TARGET`).
Making that card a translucent pane moves the ground a CLINICAL palette was
measured on, silently. `Card` refuses the pane material on a tinted card outright
rather than leaving it to a call site to remember.

**GLASS IS A MATERIAL AND VELLUM IS A COLOUR**, and they are orthogonal. The
explanation card wants both: `.glass-vellum` swaps `--glass-surface` and touches
no number in the material.

**⚠ THE REST OF THIS SECTION IS THE FIRST PASS AND IS SUPERSEDED BY THE TWO
ABOVE.** Kept for the reasoning about what the material is and why the blur
cannot carry it on its own; the alphas, the boundary and the default are all
restated above.

**MEASURED, HEADLESS CHROMIUM, 166 CARDS, 3s CONTINUOUS SCROLL:** 27fps as
shipped, 27fps with the panes' filter removed, 60fps with every backdrop filter
gone. **The panes cost nothing measurable**; the cost is the pre-existing glass,
and it is the EXISTENCE of the backdrop pass rather than the radius — which is
the same finding already on `GLASS.blur` and the reason the radius was not
reduced again. Software raster is a floor, not a verdict.

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
0. **THE AT-A-GLANCE COUNTS STRIP IS THREE SEGMENTS, NOT FIVE (Aug 2026).**
   ⚠ Its segment GROUNDS are the status PLATE now, not `bg-tint-*` — see "The
   marker card's status ground is a PLATE, not a wash" above. Everything in this
   item about the fold, the two gold segments and the directional filter is
   unchanged.
   Below range · In range · Above range, in that order. Significantly below
   counts as below and significantly above as above — `STRIP_STATE` in
   lib/markerCopy.ts is the one place that folding is written down. **The five
   states are untouched everywhere else**: the status word, the chevron, the
   range bar, the chart and the card tint still separate all five, and a result
   is still described as "Significantly above range" on its own card. Both gold
   segments are the SAME colour by construction (`low` and `high` resolve to one
   hue); direction is the chevron and the word. A segment selects the
   DIRECTIONAL filter (`BELOW_ANY` / `ABOVE_ANY`), never the specific state, or
   a segment reading 4 would filter to 3.
1. ⚠ **THE MARKER RESULT CARD'S BACKGROUND CARRIES NO STATUS (Aug 2026).**
   It was a soft wash (`bg-tint-*`) and it is the product's ordinary card
   surface now: `bg-cream-50`, ONE ground for every card whatever the result
   (light #fdfdfe, dark #202225). A wash is the hue mixed INTO the card, so on a
   near-black surface it is a MUDDIER version of that hue by construction rather
   than a quieter one — above range read as dark olive-brown and below range as
   another muted tone, and the wash was working hardest on exactly the results a
   patient cares most about.
   **NO STATUS SIGNAL WAS LOST, WHICH IS WHAT MAKES IT SAFE.** Three carriers
   remain on the card and all three survive greyscale and a colourblind reader:
   the GAUGE ARC (the five colours at full strength on the one surface where
   they are solved rather than washed), the CHEVRON, and the WORD. The wash was
   the fourth statement of a fact already made three times, and the only one of
   the four that was ever ambiguous.
   ⚠ **`surface="card"` HAS TO BE STATED NOW.** Glass is `Card`'s default and
   the tint was incidentally forcing the marker grid opaque; without both, 165
   translucent streaked panes appear on one grid, with a moving highlight over
   the one instrument on the card whose colours are solved.
   `statusTintClass` and `bg-tint-*` are untouched and still paint the counts
   strip; a tinted card still refuses the pane material in `Card.tsx`.
2. **THE RANGE BAR IS AN ARC GAUGE, AND ITS RING IS FIXED (Aug 2026).**

   **THE GRADIENT IS ALLOCATED BY BAND, SYMMETRICALLY, AND NEVER BY THE VALUE.**
   Five slices at four constant angles — significantly-below red at the start,
   gold, green in the centre, gold, significantly-above red at the end — with
   equal angular space either side of centre (`GAUGE_BOUNDARIES` / `GAUGE_SLICES`
   in lib/rangeScale.ts, at 15 / 34 / 66 / 85%). `RING_GRADIENT` is computed ONCE
   at module scope, and that is the change stated as code: **a gradient that
   cannot take an argument cannot vary between two cards on one grid.**

   **⚠ THE ARC IS FULLY OPAQUE, AND THAT WAS THE "MUDDY GOLD IN DARK MODE" FIX
   (Aug 2026). DO NOT REACH FOR THE COLOURS AGAIN.** The five fills are
   BYTE-IDENTICAL in the two themes and always have been — #a5cd85 / #b8bc69 /
   #cbab4c / #db955e / #ea7f6f, solved once against `PLOT_SURFACE` and emitted
   with no theme branch, asserted by `tokenContrast.test.ts`. The complaint was
   real and had been "fixed" twice by re-solving hues, which could never have
   reached it: **what was translucent was the MASK.** It was a radial gradient
   feathered at both edges (`RING_INNER ± 0.4`, plus a 99%→100% fade), which on a
   176px card gauge is 1.8px at the inner edge and 0.7px at the outer against a
   9.7px ring — **a quarter of the band composited against the card**, resolving
   toward near-black in dark and toward cream in light. One colour, two grounds,
   opposite results. The mask is a STROKED CIRCLE now (an inline SVG `<circle>`,
   `fill="none"`, opaque white stroke at the ring's own width, `mask-size: 100%
   100%`), so the edge is the browser's own sub-pixel antialiasing and the
   interior is opaque. Every figure in it is derived from `GEO`, never typed.
   **NOTHING IN THE ARC MAY CARRY AN ALPHA** — not a stop, not the mask, not a
   blend mode, an opacity, a filter, a sheen or a glow; `ArcGauge.test.tsx` reads
   the ring's own computed style and fails on any of them. The two boundary
   hairlines are the named exception: they are marks ON the arc, they are the
   greyscale carrier the status rules require, and they composite one
   theme-independent colour over one theme-independent band, so their result is
   identical in both themes too.

   **THE VALUE IN THE MIDDLE IS `GaugeValue`, AND IT IS ONE STEP SMALLER.** It
   was written out at three call sites — the result card at 28px, the Overview's
   attention cards and the walkthrough at 38px — which had already drifted on the
   gap between the number and its unit. One component, two sizes (`card` 21px,
   `section` 28px), each a step of the type scale. The value was filling the
   ring's interior corner to corner; the room it has is the inscribed square of
   the inner circle, which is a fixed share of the instrument. ⚠ **IT IS MONO AND
   STAYS MONO** — the single hero value on a marker detail page is the ONE
   Fraunces exception in the whole type system and it is not this component. ⚠
   **THE UNIT STAYS AT 12px**, which moves the ratio: holding the old proportion
   through a step down asks for 9px, and 12px is the floor of the scale.

   **WHY, AND IT IS A FAILURE A STRAIGHT BAR CANNOT HAVE.** Mapped to the numeric
   axis the green MOVED: an above-range value slid the in-range arc toward the
   start of the ring and a below-range value slid it toward the end. A ring is
   read as a SHAPE before any number, so the one thing a reader takes in at a
   glance meant something different on every card in a grid of 165.

   **THE MARK IS PLACED BY WHICH BAND THE VALUE IS IN** and where inside it,
   mapped onto that band's fixed slice — so the colour under the mark always
   agrees with the status word beside it, by construction rather than by two
   derivations happening to agree. **STILL NEVER CLAMPED**: the two outer bands
   are unbounded in value and finite in angle, so the placement SATURATES toward
   the end of the arc and never arrives.

   ⚠ **WHAT IT COST, AND IT IS REAL.** Distance inside the two red slices is no
   longer to scale — ORDER is preserved, magnitude is compressed. "How far out am
   I" is answered by the figure in the middle of the gauge and by the status
   word, not by the geometry. That is the right way round for this instrument: a
   patient asks "is this inside the range" first and "by how much" second.

   **AND ONE REFUSAL WENT AWAY WITH THE SCALE.** `reference-range-too-small` is
   gone — a fixed ring cannot squeeze the green into a sliver, so a result that
   used to be refused in words is now simply drawn, in the right band. Four
   refusals remain, all about the RANGE rather than about the drawing.

   **THE LABELS ARE THE TWO REFERENCE BOUNDS AND NOTHING ELSE.** The arc's ends
   mean "significantly below" and "significantly above" — states rather than
   quantities — so the two scale-end figures are gone. The two derived thresholds
   get hairlines at the trend chart's lighter weight but no numbers: printing a
   figure we computed beside two a laboratory stated would lend our arithmetic
   the lab's authority. A card prints no figures at all and keeps all four
   hairlines.

   `rangeScale.property.test.ts` runs the new invariant over ~5,000 generated
   inputs — the mark is always in the slice its own status names, is monotonic,
   and never reaches either end. `e2e/arc-gauge.spec.ts` asserts every gauge on a
   real 144-card report paints a BYTE-IDENTICAL ring across all five states.

   *The rest of this item is the bar's own record, and everything in it except
   the value-mapped geometry still describes the arc:* `components/ui/ArcGauge.tsx`
   replaced `RangeBar.tsx`, which is deleted. It is the same instrument bent
   round: the same scale (`lib/rangeScale.ts`, untouched), the same five states,
   the same `bandRampStops` derivation, the same boundary treatment, the same
   never-clamped mark, the same five refusals in words, the same `rangemark`
   token. **A `linear-gradient` became a `conic-gradient`** — the polar form of
   the identical statement, so a stop at `pct` along the scale is a stop at
   `pct × 0.75` of the circle and nothing is resampled into segments. The ring
   is cut out of it by a radial `mask-image`; the 90° gap is a HARD STOP inside
   the gradient rather than a second mask, so no `mask-composite` is involved.
   **AN ARC, NOT A RING, AND THAT IS THE FIRST DECISION.** A full circle says
   the scale WRAPS, which a value between two bounds does not. It sweeps
   CLOCKWISE FROM THE LOWER LEFT TO THE LOWER RIGHT, 270° with a 90° gap at the
   bottom — and **the gap is where the two scale ends are printed**, which is
   the argument for it being at the bottom.
   **THE VALUE MOVED INTO THE MIDDLE**, with its unit and the status word under
   it, on the marker page, on a result card and on the Overview's attention
   cards. That is one object where there were three stacked ones. `.hero-value`
   tops out at 52px rather than 72px because it now sits inside a ring with a
   fixed interior; it still clears the marker's name at 38px, so the ladder is
   unchanged.
   **THE CARD GAUGE DROPS THE BOUND LABELS AND KEEPS THE TICKS.** The one
   judgement call, and the same one the card bar made: four figures round a
   148px arc collide, and the SCALE ENDS are the pair that cannot be recovered
   from anything else on the card. It also does not sweep on mount — 165 marks
   moving at once is a page that appears to be loading.
   **THE MARK SWEEPS BY ROTATION**, not by moving two coordinates: transitioning
   `left` and `top` would carry it across the CHORD, straight through the middle
   of the gauge, rather than round the ring it is describing.
   `ArcGauge.test.tsx` (20 tests) and `e2e/arc-gauge.spec.ts` replace the bar's
   own; the e2e one reads the angle out of the computed transform MATRIX, so it
   is the browser's answer rather than the component's. **The trend chart is
   untouched.**

   *What follows is the bar's own record, and every word of it still describes
   the arc:* flat green across the reference range, flat gold outside it,
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
3. **Trend charts — THE BANDS ARE GONE AND THE LINE IS THE WHOLE CHART
   (Aug 2026). EVERYTHING BELOW THIS PARAGRAPH IS HISTORY.**

   The single-marker trend chart draws NO FILLED REGIONS of any kind: no status
   bands, no ramp gradients, no optimal narrowing, no inset plot panel. What it
   draws, and this is the list: the LINE on the card, carrying status along its
   own length; FOUR BOUNDARY RULES (the two reference bounds solid, the two
   significantly-out thresholds dashed and lighter) each labelled with its value
   on the axis; the POINTS; and the axis with the unit above it.

   **AND ALL OF IT IS LIT, AND EVERY POINT IS THE SAME WHITE SPARK (Aug
   2026).** A point is a tight WHITE core inside a wide radial falloff,
   identical at every status — same colour, same size, same treatment, whatever
   the value is doing — with the most recent one brighter and slightly larger,
   which is the only variation permitted. The line carries a faint casing of
   light along its length, in whatever STATUS colour it is at that stretch.
   `SPARK` in tokens.ts is the whole of it: the core radius, the halo's multiple
   of it, the ramp, and one strength per theme.

   **THE POINTS ARE WHITE AND THE LINE IS THE STATUS.** A point drawn in its own
   state's colour is the same fact the line already carries at that exact x, and
   it costs the point the one thing it is uniquely placed to say, which is where
   it is. The chevrons, triangles and doubled chevrons that used to be the point
   marks are OFF THIS CHART — see the named exception under "Non-negotiables"
   below, which is where the reasoning lives and is the note to read before
   putting them back.

   **TWO THEMES, TWO PHENOMENA, ONE IDEA.** In dark the halo is WHITE — light
   added to a near-black card, which reads as emission. In light a white halo on
   a cream card measures 1.05:1, which is not a dim bloom but nothing at all, so
   the halo there is a warm DARK and the same white core reads as the brightest
   thing inside a soft shadow. The two alphas (0.22 dark, 0.34 light) are
   therefore NOT comparable with each other and the old "dark carries more of
   it" rule is retired with the colour it was about; what is asserted instead is
   that the halo lands at the same measured presence in both rooms — 2.06:1 and
   1.87:1 off the card.

   **AND THE CORE FLIPS TO ESPRESSO IN PRINT.** The halo goes to zero on paper
   with every other glow, and with no shape layer left on this chart a white
   bead would then be a white dot on white paper — every point simply gone from
   a printed trend. `--c-chart-spark-core` is espresso under `@media print`;
   `zz-print.spec.ts` reads the painted fill off a printed point rather than
   trusting the stylesheet.

   **IT DOES NOT REOPEN "NO FILLED REGIONS".** That rule is about REGIONS OF THE
   PLOT — bands, the optimal narrowing, the inset panel — areas of colour that
   said where the range sits and out-read the reader's own result doing it. A
   halo is part of the point mark, drawn at the mark and nowhere else, and one
   has been drawn here all along: it was a flat 13px disc at 0.16, which is what
   made it read as a dot inside a ring rather than as light. A disc of constant
   alpha has an EDGE; a falloff cannot be written as one number.

   **NO FILTER, AND THAT IS A PERFORMANCE DECISION ALREADY ON THE RECORD.**
   `feGaussianBlur` is the obvious way to draw a glow: a filter inside a
   Recharts SVG is re-rasterised as the tooltip moves, which is the same reason
   the plot panel's inner shadow was two gradients rather than a filter. The
   spark is a `radialGradient` and the casing is three wider strokes of the
   line's own path at 0.4 / 0.7 / 1 of one alpha — painted like any other fill,
   free per frame, and an exact falloff rather than an approximated one.

   **SOLVED PER THEME, BECAUSE IT IS TWO DIFFERENT PHENOMENA.** In dark the halo
   is LIGHT ADDED to a near-black card and reads as emission; in light the same
   tokens are dark colours (#507e2c, #c14836) on a near-white card, so the
   identical gradient is a soft coloured SHADOW under the point. Ink carries
   further per unit of alpha than light does, hence roughly half the strength —
   `core` 0.34 light / 0.58 dark, the casing 0.08 / 0.13. **The first pass
   shipped one steeper ramp and light came out FAINTER than the flat disc it
   replaced**, which is the one direction this was not allowed to go; the second
   used two casing layers at a flat alpha and dark grew a visible EDGE down each
   side of the line — a second, wider, dimmer line. Both were found by looking
   at the render, not at the numbers (screenshots/line).

   **WHAT IT MAY NOT DO.** Change a status colour — the glow is applied to
   colours already solved at `LINE_FILL_TARGET` off the card and it changes none
   of them. Cost the point its legibility: the pair that carries a mark is its
   stroke against its own card-coloured INTERIOR, the halo sits behind the glyph
   (the ramp's plateau ends exactly at the glyph's edge), and
   `tokenContrast.test.ts` holds the point at 1.75× its own halo's separation
   from the card and the line at 3× its casing's — the same ordering the bands
   used to answer to. Be noticed AS an effect: if it reads as decorative it is
   too strong. It is also OFF IN PRINT, at the token layer with the shadow
   alphas, and `zz-print.spec.ts` reads the applied `fill-opacity` off a printed
   point rather than trusting the stylesheet.

   **THE COMPARISON CHART AND THE RANGE BARS ARE UNTOUCHED.** Neither carries a
   status colour along a line, and a glow on a range bar's mark would be light
   spilling across the segment boundaries the bar exists to draw.

   **WHY, IN ONE SENTENCE.** The bands were re-solved four times and every solve
   hit the same wall: they had to be legible enough to say where the range is
   and quiet enough that the reader's own result out-read them, and every gain
   on one was a loss on the other. The LINE paid for all of it — its colour was
   solved to clear five painted regions, which is what produced a near-white
   line on the dark plot and three near-black browns on the light one. With
   nothing behind it the line answers to ONE surface, the card, and can be as
   colourful as the palette allows. Measured: light's green went #265600 →
   #507e2c and its red #941a08 → #c14836; dark's went from a pale cream line to
   #73a14f / #bf8f00 / #e46956.

   **THE RANGE BARS ARE UNTOUCHED and keep their five painted segments.** A bar
   is a different instrument: one value against a scale, with no line to carry
   the colour. `bandRampStops`, `BAND_CONTRAST`, `BAND_FILL`, `OPTIMAL_FILL` and
   `--c-hue-*-fill` all still exist and all still serve it, solved against
   `PLOT_SURFACE` exactly as before. So does the normalised COMPARISON chart,
   which is why `chart.line` and `LINE_LIFT` survive.

   **THE LINE TRAVELS THROUGH EVERY REGION IT PASSES, not only the boundaries.**
   A stop at each crossing in that boundary's hinge colour, AND a stop at the
   midpoint of each stretch between crossings in that region's own colour.
   Measured on AFP (125–375): 429 down to 65 crosses the whole reference range,
   and with crossing-stops alone it read gold → olive → olive → gold and never
   once green. `--c-hue-*-mark` is the line and the point marks, solved per
   theme against the CARD at 4.5:1 (`LINE_FILL_TARGET`).

   **A KEY MAY NOT NAME A MARK THE CHART DID NOT DRAW.** The threshold entry is
   shown only when a threshold is actually inside the y domain, which on most
   in-range markers it is not.

   **THE SOLVED COLOURS SHIP AS LITERALS** (`SOLVED` in tokens.ts) and
   `solveTokens()` re-derives them. Run at module scope the grid searches cost
   **605ms, measured**, and tokens.ts is in the entry chunk — 605ms of blocked
   first paint for every patient. `tokenContrast.test.ts` re-runs the solve and
   asserts the literals equal it, so they cannot drift.

   `e2e/chart-bands.spec.ts` and `e2e/status-colour.spec.ts` measure the NEW
   evidence: zero filled regions, the line's gradient stops in the token
   colours, the line's weight, the two rule weights, and the period geometry
   read off the boundary rules rather than off band rects — plus, since the
   glow, that every point is lit at its own theme's declared strength, in its
   own status colour, ending at nothing at the rim, with the latest brightest.
   **Both select `.trend-line-core .recharts-line-curve` and neither may go back
   to the bare class**: the casing is three more `.recharts-line-curve` paths
   under the line, so a `querySelector` for the bare class silently measures the
   outermost one — 21px, painted with the glow gradient — and goes on passing
   about the wrong element.

   ---

   **WHAT FOLLOWS IS THE BAND ERA, KEPT BECAUSE THE RANGE BARS STILL RUN ON IT
   and because the reasoning is worth having. Where it says "the chart", read
   "the range bar" — except the plot panel, the optimal region and the band
   rects, which no chart draws any more.**

   **AND THE PLOT AREA WAS LIGHT IN BOTH THEMES (Aug 2026).**

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
- The shape-and-label layer carries status on its own everywhere except the
  trend chart's own points (see the exception below): level mark in range,
  chevron out, doubled chevron significantly out, plus the word. Colour is
  reinforcement, never the sole carrier — red and green are the commonest
  confusion pair there is. A chart band therefore always carries a boundary
  hairline AND its bounds stated in figures on the axis; every POINT state is
  named in words in the key and in the tooltip. (Until Aug 2026 the bands
  themselves had key entries; the axis labels replaced them, which is more
  specific and equally greyscale-legible. What may never happen is a band with
  neither.)
- ⚠ **THE ONE NAMED EXCEPTION: THE TREND CHART'S POINTS ARE UNIFORM WHITE
  SPARKS (Aug 2026). DO NOT PUT THE SHAPES BACK.** Every point on the
  single-marker trend chart is the same white bead inside the same soft
  falloff — no chevrons, no doubled chevrons, no per-status colour, no
  variation of any kind except the most recent point being brighter and
  slightly larger. Three kinds of mark on one line is noise, and it was noise
  saying what the line already says in colour along its own length at that
  exact x.
  **WHAT MAKES THIS SAFE, and it is not "colour is enough":** the chart has a
  second non-colour carrier no other surface has — every point's POSITION
  against four labelled boundary rules, each drawn across the plot and printed
  with its own value on the axis. A reader who cannot separate the green
  stretch of line from the red one still sees which side of the reference bound
  each point falls on, which is more specific than a chevron and survives
  greyscale and a printed page in full. The status is still named IN WORDS on
  every point in the tooltip and in the key, and the key's swatches are
  stretches of LINE in each state's colour — the mark the chart actually draws,
  never a coloured rectangle.
  **THE EXCEPTION IS THE CHART'S POINTS AND NOTHING ELSE.** Result cards, range
  bars, the counts strip, the status words, the badges and both PDFs keep the
  shape layer exactly as it is. `e2e/status-colour.spec.ts` asserts the plot
  draws zero `<polygon>`s and exactly ONE spark gradient, so both halves of
  this come back as a test failure rather than as a review comment.
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
- ~~Dark surfaces are warm near-black browns derived from espresso. No pure
  black, no cool grey.~~ **REVERSED Aug 2026.** Dark surfaces are neutral
  near-blacks derived from the ink, lifted toward a cool grey. See the retheme
  section below.
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
  Group of Companies, 27 Mortimer Street, London". **THE ADDRESS IS 29-35
  MORTIMER STREET, LONDON, W1T 3JG (corrected Aug 2026)** — it was 27 with no
  postcode. One constant each side (`CLINIC_ADDRESS` in web/lib/clinicContact.ts,
  `addressLines` in server/modules/content/clinicContact.ts); the auth panel used
  to type it out and now reads the constant, which is why it was wrong there
  longest.
- Source labels: `Analysed by Randox Health` where the result genuinely came
  from Randox. In-house results carry NO source line at all (sourceLabel is
  empty for `aspire_inhouse`), so every render site guards it.
  **IT IS OFF EVERY PATIENT SURFACE AND ON EXACTLY ONE DOCUMENT (Aug 2026).**
  The clinician console still shows it, and the GP HANDOVER PDF names the
  laboratory in its identity grid — see below. `sourceLabel` is imported by
  `patients/service.ts` and `reports/service.ts` and **by nothing else**;
  `sourceAttribution.test.ts` pins that list, because the field went on being
  computed and sent on six patient-portal payloads for months after the last
  render of it was deleted, and a field nothing renders is one autocomplete away
  from being printed again.
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

# Clinic Booking — the surface is the spec, the bodies are the collection (Aug 2026)

**TWO DOCUMENTS, AND THE NEWER ONE DOES NOT WIN ON BOTH HALVES.**
`specs/clinic-booking-openapi3.json` is the portal's own API definition — seven
operations, one GET and six POSTs, downloaded from the API-definition dropdown.
`specs/Clinic Booking Platform Testing APIs.postman_collection.json` covers five
of those seven with a complete REQUEST body and no response examples at all.

    THE SPEC        the SURFACE. Which operations exist, their verbs, and -
                    for RescheduleAppointment alone — a `required` list and a
                    response schema.
    THE COLLECTION  the BODIES of the five it covers. Its examples are newer
                    and coherent where the spec's are neither.

The spec's request examples are demonstrably stale: the hold sends
`"ServiceId": "488"` where only 787 and 788 exist, both slot examples put a DATE
in the time field (`"appointmentSlotTime": "2024-04-11"`), and the create omits
`GPExternalNumber` — the only field joining a booking to a laboratory order. The
collection's example is self-consistent to the second. So: **definition for the
surface, collection for the bodies, and the definition alone where it is the
only source.** Do not read "we have the OpenAPI file now" as "the API is
documented" — six of the seven responses are still undocumented.

**Every guessed request body was wrong, and that is the lesson.** The client had
`{serviceLocationId, slotReference}` for a hold and `{holdReference, startUtc}`
for a booking, read tolerantly so a wrong guess would "degrade gracefully".
Tolerance is right for a RESPONSE and worthless for a REQUEST: a misread
response loses a field, a misspelled request is refused whole. Not one guessed
name was right.

**Six POSTs and one GET**, same rule as Nexus — takes a body, POST.
`GetServiceLocations`, `AvailabilityDetails`, `HoldAvailabilityBooking`,
`CreateRandoxBooking`, `RescheduleAppointment`, `CancelRandoxBooking`;
`GetServiceRegions` is the GET. `CLINIC_BOOKING_ENDPOINTS` in endpoints.ts is
the table and `bookingVerbForPath` throws on anything not in it.

**`GetBiologicalSex` IS NOT ONE OF THEM AND IT 404'd.** It was in the table as
the one GET, on the strength of the CB auth document's worked example; the
sandbox answered `404 {"statusCode": 404, "message": "Resource not found"}` and
the portal's operation list does not contain it. That document is stale on the
point. What survives is a ghost — the spec still declares a
`BiologicalSexResponse` schema (Id / Name / DisplayOrder) that **no path
references**, so the endpoint was WITHDRAWN rather than never existing, which is
why the id list is unenumerable rather than merely absent.

**So the BiologicalSexId is DOCUMENTED IN PROSE AND IS AN ASSUMPTION.** The
`CreateRandoxBooking` operation's own description says "Note - Biological Sex
Id: Male = 1, Female = 2" (their hyphen, quoted verbatim), and that pair is
`RANDOX_DOCUMENTED_BOOKING_BIOLOGICAL_SEX` in documentedDefaults.ts. It is a
Clinic Booking statement about Clinic Booking, which is why it is used rather
than borrowing the Nexus id across two gateways — Nexus returns the same pair,
and the sandbox pass reports that agreement as CORROBORATION rather than as the
source. A name the note does not cover is **refused, never guessed**: this field
decides which reference ranges a laboratory applies. ANSWERS.md files it as
question 10, labelled an assumption.

**AND `GetServiceRegions` IS THE CREDENTIAL PROBE NOW.** A GET with no body, no
order and nothing to clean up, and it fails for exactly the reasons a bad
subscription key or a bad scope fails. The old probe hit an endpoint that does
not exist, so a 404 was indistinguishable from a working key — the one thing a
probe must never be. Observed: a bare array of `{Id, Name, CurrencyCode,
DisplayOrder}`, eight regions, CurrencyCode UK or ROI. **That is NOT the 787/788
decision**; a region groups clinic locations (each carries a `RegionId`) and no
document relates the two.

**THE SERVICE ID IS REQUIRED AND IS NOT DISCOVERABLE.** 787 (UK) and 788 (ROI),
and there is no third. Not in any document — Chris Caulfield's email. It is
CONFIGURATION picked by `RANDOX_BOOKING_REGION` rather than an argument: which
country a booking is made in is a fact about the deployment, and a parameter
that could be either would eventually be the wrong one, offering a UK patient
Irish clinics with nothing in the response to say so.

**THE SAME FIELD TAKES TWO DATE FORMATS IN ONE FLOW.** `AppointmentSlotDate` is
`"16/10/2025"` on the hold and `"2025-10-16T00:00:00Z"` on the create, two
requests apart. Each endpoint is sent what its OWN example uses, which is the
rule the Nexus side already runs on.

**`AppointmentSlotTIme` IS A CASE VARIANT, NOT A MISSPELLING (Aug 2026).** This
note said the capital I was a misspelling whose correction "would produce a
request with no slot time in it" — a guess with a consequence attached, repeated
in four files. `AppointmentSlotTIme` and the spec's `appointmentSlotTime` differ
in ONE CHARACTER'S CASE and nothing else, and the two documents differ in case
on **every field of every shared endpoint** — the spec is not even consistent
with itself, PascalCase on the hold and camelCase on the create. That is what
ASP.NET Core's default case-insensitive model binding looks like from outside.
Nothing changed on the wire: the collection's spelling still goes, because it is
the coherent example and there is no reason to alter a request the moment before
testing it. What is retired is the anxiety, and the mock no longer 400s a case
variant. Pinned by `randoxBookingContract.test.ts`.

**A SLOT IS TWO STRINGS, AND EVERY FIELD NAME WE GUESSED WAS WRONG (observed Aug
2026).** AvailabilityDetails returns a **bare top-level array** of

    { "Id": "slot-room33-2026-08-17T07:00-staff19",
      "Date": "17/08/2026", "Time": "07:00", "AvailableQuantity": 1 }

- a day-first date and a bare HH:mm in **two separate fields**, with no combined
datetime, no offset, no `Z` and no epoch anywhere. The client read
`appointmentSlotDateTime` and four other invented names, found none, and turned
**114 real slots into an empty diary**, which is indistinguishable from a clinic
with no availability. That is the whole reason the pass exists.

**THE SLOT ID IS A SECOND FORMAT.** The collection's `"72164:72164::1760607000:"`
is not what the sandbox returns, and the epoch it embeds was the entire proof
that the slot fields are the UTC wall clock. The observed id carries a bare wall
clock instead — and is exactly the shape of the OpenAPI file's
RescheduleAppointment example, which makes that example real rather than the
placeholder it looked like. Two formats is why **nothing parses a slot id**: it
is opaque, it is echoed, and that is all.

**SO UTC IS FORCED RATHER THAN CHOSEN, AND ONLY FOR THE WIRE.** `Date` and
`Time` are, to the character, the two fields HoldAvailabilityBooking wants back
as `AppointmentSlotDate` and `AppointmentSlotTIme`. Reading them as UTC in
`slotInstantFromWireParts` is the only reading under which our own formatters
reproduce them exactly — read them as London and a 07:00 slot goes back to
Randox as 06:00, booking a time they never offered. **That is not a claim about
what Randox mean; it is the only interpretation that makes the request equal the
response**, and it is asserted on the real captured values.

What is NOT settled is the DISPLAY. The documents say UTC (the flow diagram, and
the collection's own epoch), so `slot.local` renders 07:00Z as 08:00 on a clinic
wall in August; but the observed diary runs 07:00-14:45, which is an ordinary
phlebotomy day read as local time. The exposure is **exactly one hour on one
rendered string, never on what is booked**. `slot.wireDate` / `slot.wireTime`
carry Randox's own strings untouched beside `local` so a caller can show theirs.
**For Randox: are a slot's `Date` and `Time` UTC or clinic-local?**

`slotDateDayFirst`, `slotDateIsoMidnightZ` and `slotTimeOfDay` in
clients/parse.ts use `getUTC*` throughout. The other direction is
`londonWallClock`, and every slot carries its UK-local rendering BESIDE the
instant (`slot.local`) so a consumer cannot accidentally localise into the
READER's zone — right only by accident, and wrong for anyone booking from
abroad.

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

**RescheduleAppointment IS SPECIFIED AT LAST, AND PRODUCTION STILL DOES NOT USE
IT (Aug 2026).** Both halves matter, and the endpoint has now been through all
three states in order — which is the argument for the middle one existing:

    FICTIONAL   wrong. Demoted here because it is absent from both Postman
                collections, from the API-overview flow diagram and from both
                auth documents. Every check was right; the inference was not,
                because a TESTING collection does not claim to be exhaustive.
    NAMED ONLY  right, from page 3 of
                specs/20241028-Corporate-Customer-API-Flow.pdf (1-Nov-24):
                "there is a window of opportunity for the clinic booking record
                to be rescheduled to a different clinic location, date and
                time." Worth knowing how the earlier reading stayed wrong for
                so long: **that PDF's text is not mechanically greppable** — its
                fonts carry no usable ToUnicode, so a search over the
                decompressed streams returns nothing for a string plainly on
                the page.
    SPECIFIED   now. POST `RandoxBookings/RescheduleAppointment`, four REQUIRED
                fields (appointmentId, serviceId, locationId,
                newAppointmentSlotId) and a response schema — the only request
                on this API with a schema rather than an example behind it, and
                the only documented response of the seven.

Had it been left at FICTIONAL, the spec's arrival would have read as "a new
endpoint appeared" rather than "the one Randox told us about in 2024 finally got
written down". `NAMED_BUT_UNSPECIFIED_ENDPOINTS` in endpoints.ts keeps the
middle state; `GetOrderStatusDetails` — home-dispatch tracking and kit URNs,
page 2 of the same document, absent from the Nexus spec's seventeen — is what is
left in it.

**THE CLIENT CALLS IT. `bookingService.rescheduleBooking` STILL COMPOSES hold ->
create -> cancel, AND THE REASON IS NEW.** The last two justifications were
"there is no such endpoint" and "there is no way to spell a call to it"; both
argued from a gap in the documents and both expired. This one argues from what
the documents SAY: **the documented reschedule takes no hold.** One call, an
appointment id and a slot id, with no HoldAvailabilityBooking in front of it -
so there is no way to learn whether the new slot is free before giving up the
one the patient already has. Its own response schema says the same from the
other side: it carries a `SuccessFailCode`, so it can refuse, and by then the
request has been made. **The order is the whole design**: hold the new slot,
book the new slot, then cancel the old one. Cancelling first is simpler and
loses somebody's appointment when step 2 fails. Whether Randox accept a second
booking against one `GPExternalNumber` is unknown and this ordering is safe
under both answers — refused, the original stands; accepted, step 3 leaves
exactly one. If step 3 fails the new appointment is KEPT and audited: a stale
booking is a phone call, no appointment is a wasted trip. The sandbox pass now
calls the real endpoint (question 9), so this is a decision to revisit **on a
capture, not on a schema**.

**AND IT IS THE ONE CALL ON EITHER API THAT REFUSES INSIDE A 200.** Everywhere
else a refusal is a 4xx and the transport throws, so a caller who forgets to
check gets an exception. Here the response resolves with `SuccessFailCode` set
to something else, and a caller reading only the HTTP status tells a patient
their appointment moved when it did not. `rescheduleSucceeded()` in
clients/parse.ts is the single place that judgement is made and **defaults to
failure**: an absent code, an empty one, an unrecognised word or a populated
`FailureDescription` all mean no. The two mistakes are not symmetrical — a false
success puts somebody at a clinic on the wrong day, a false failure tells them
to try again. Both mocks model the soft refusal, because a fixture that always
succeeds makes that bug untestable.

**THE MOCK IS GENERATED FROM BOTH DOCUMENTS AND ENFORCES WHERE THEY AGREE.**
`mock/bookingSpecServer.ts` reads the OpenAPI file for the route set and the
collection for the bodies, then rejects a request whose fields, JSON types or
string SHAPES differ from what the two agree on — so swapping the hold's and the
create's date formats is a 400, and an invented `SearchTo` is a 400 rather than
a field a real API would ignore while returning an unbounded range.

**Where the two DISAGREE it accepts either**, and that is the design rather than
a loosening: enforcing one side of a genuine disagreement is enforcing a coin
toss, with the authority of a document behind it. So a case variant passes (they
differ in case on every shared field), the hold's `ServiceId` passes as a number
or a string (787 against `"488"` — the only type disagreement anywhere), and
`GPExternalNumber` passes because the collection has it even though the spec's
example does not. A field NEITHER document names is still a 400, and a genuinely
misspelled one still is too: case-insensitive is not name-insensitive.

It requires BOTH credentials, unlike the Nexus mock, because the CB document
requires both and the Nexus spec does not mention one: the two mocks differ
exactly where the two documents differ. Responses are fixtures and live in
`mock/bookingScenarios.ts`, separately and labelled, because only one of the
seven has ever been documented.

**AND THE FIXTURES NOW MODEL THE OBSERVED PAYLOADS, WHICH IS THE WHOLE POINT.**
Availability was a wrapped `{availability: [{AppointmentSlotId,
AppointmentSlotDateTime}]}` — a shape invented to match what the client was
asking for, so every test passed while the client could not read one real slot.
Locations and regions are bare arrays with `Id` as a string, and a slot is
`{Id, Date, Time, AvailableQuantity}`. **A fixture that models the document
rather than the API tests nothing.**

`tests/randoxBookingContract.test.ts` runs the real client over HTTP through the
whole documented flow — Nexus create → locations → availability → hold → booking
carrying the order number → reschedule → status 1–4 → reports and detail — plus the four
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
calendar week has to survive gaps. Observed at Crumlin: **5 dates, consecutive,
114 slots at 15-minute intervals** — so "usually 7" is a description and not a
guarantee, and the gap case has still never been seen. Note that the dates
arrive day-first, which sorts by day of month: anything checking
consecutiveness has to convert first or it answers the wrong question at a month
boundary.

# The sandbox pass — both APIs called end to end, and it is where the defects came from (Aug 2026)

`npm run sandbox:pass --workspace=apps/server` walks the whole documented flow
against the `stes-` sandbox and writes every response body **verbatim** into
`modules/randox/specs/sandbox-responses/`, one file per call, each carrying the
request that produced it, the HTTP status, the parsed body and the RAW response
text — because "this is what our helpers made of it" is not a record of what
Randox sent. Then `ANSWERS.md`, which answers the ten open questions from the
capture and writes `UNANSWERED` in as many words where the run did not settle
one — and `UNASKED` where it never got to ask. **A blank is a result and is
written as one.**

**BOTH HALVES HAVE NOW BEEN CALLED (14 Aug 2026).** Clinic 1298, panel 451
"Signature woman" (137 test items), Crumlin (LocationId 30). Q1 and Q2 are
answered from evidence — the orderNumber GetOrderStatus returns IS
byte-identical to the creation response's externalNumber, on one order, and all
eight reference endpoints answered 200 to GET. `reconcileOrderNumber()` STAYS
regardless: one order agreeing is evidence and not a contract, and it is the
half that would silently break a lookup. Q3 still waits on status 4, which a
pending order never reaches.

**THIS SECTION IS THE ARGUMENT FOR THE PASS EXISTING.** Every item below is
something no amount of reading the documents would have found, and several were
live defects sitting behind green tests. The pattern is the same each time: a
fixture built to match what the client believed, agreeing with the client.

**WHAT THE NEXUS HALF TAUGHT, and the first two were live defects:**
- **The eight reference endpoints return BARE TOP-LEVEL ARRAYS**, not
  `{panels: [...]}`. `pickArray` handles that as its first case so the
  production client was always right — the SCRIPT had reinvented the helper
  and got it wrong, which sent `PanelIds: []` and produced the 400.
- **A THIRD ERROR-BODY SHAPE, and it is the one that names the field.**
  ASP.NET ProblemDetails: `{"errors":{"Request":["No panels or test items
  provided"]},"title":…,"status":400,"traceId":…}`, with **no `message`
  anywhere**. `parseRandoxErrorBody` read `status` and returned `message:
  null`, so the only sentence explaining the refusal was dropped and the log
  said "failed with HTTP 400". Fixed; `randoxErrorBody.test.ts` pins it with
  the captured body verbatim.
- **`statusDate` carries NO timezone** (`2026-08-14T09:42:38.39`), not the
  documented .NET round-trip form. `toUtcIso` already appends `Z` absent a
  zone, so this CONFIRMS an assumption rather than exposing a bug.
- **`externalNumber` is `<clinic code>-<zero-padded orderId>`** — a THIRD
  prefix format after the spec's two. Infer nothing from it.

**WHAT THE BOOKING HALF TAUGHT, and THREE of the four were live defects.** The
booking client had never made a real call before this, and not one of its
response readings survived contact:

- **A SLOT IS `{Id, Date, Time, AvailableQuantity}` IN A BARE ARRAY.** No
  combined datetime, no offset, no epoch. The client looked for
  `appointmentSlotDateTime` and four other invented names and **turned 114 real
  slots into an empty diary** — which is indistinguishable from a clinic with no
  availability, so nothing would have looked broken. See the Clinic Booking
  section above for why UTC is then forced rather than chosen.
- **THE HOLD RETURNS ONE ID AND THE CREATE NEEDS TWO.** A successful hold is
  `{"BookingId": 87819, "SuccessFailCode": "Success", "FailureDescription":
  null, "NewAppointmentDateTime": null}` — **no AppointmentId at all**. The
  create went out without one and Randox answered
  `400 "Randox Booking failure, invalid appointment id."`, naming the field.
  They are the same number: the collection's own example sends 1144015 twice,
  and the hold is the only call before the create that could produce either.
- **THE HOLD USES THE SAME ENVELOPE AS THE RESCHEDULE, SO A HOLD CAN REFUSE
  INSIDE A 200.** The OpenAPI file declares those four fields as
  `RescheduleAppointmentResponse`, on that one operation, which is how it was
  read at first. It is the shared envelope for booking mutations. A refused hold
  is therefore a successful HTTP response that the transport does not throw on -
  read as success it yields a null booking id and a create that 400s two
  requests later, where the failure makes no sense. `bookingOutcomeSucceeded()`
  is the one place that judgement is made, for both calls, and it defaults to
  failure.
- **A FOURTH ERROR-BODY SHAPE: A BARE JSON STRING.** `"Randox Booking failure,
  invalid appointment id."`, quotes and all — not an object, so
  `parseRandoxErrorBody` refused it and dropped the only sentence that named the
  broken field. **That is the identical failure as the ProblemDetails one above,
  in a new shape, from the other API** — which is why the parser now ends at
  "whatever prose there is" rather than at "an object I recognise".
- **GetServiceRegions and GetServiceLocations are bare arrays too**, with `Id`
  as a STRING on a location and a `RegionId` joining the two. Five dates of
  availability came back, consecutive, 114 slots at 15-minute intervals — so the
  flow document's "usually 7" is a description and the non-consecutive case has
  still never been observed.

**NOTHING IN THE ORDER IS DEFAULTED ANY MORE.** Every id it sends is read from
a reference capture — panel, testing reason, biological sex BY NAME from Nexus's
own GetBiologicalSex, and TestClinicLocationId from `clinicTestLocations` rather
than from the clinic id. (The BOOKING body's BiologicalSexId is the exception
and cannot be one of these: Clinic Booking has no endpoint for it, so it comes
from the documented pair and is reported as an ASSUMPTION — see the Clinic
Booking section.) A value that cannot be resolved is REFUSED BY NAME and the create
is not sent. That rule comes from the first run: the `?? 1` fallback on
TestReasons fired, and id 1 happens to be a real reason in this sandbox — so it
passed validation on a value nobody had read off anything. **A default that is
accidentally valid is worse than one that is obviously wrong.** The panel
defaults to the one with the most test items, which also cannot land on the 25
of 616 panels that have none.

**A RERUN CLEARS THE DIRECTORY FIRST.** Captures are numbered by step, so a
shorter run leaves the tail of a longer earlier one behind — two orders, two
days, one directory, nothing in the filenames to say so. That guard is
sequential and cannot help with two runs at once: the second clears, then both
write into the same numbering. **Do not start a pass while one is polling** -
and note that killing the shell does not kill the node process, which keeps
writing.

## Leave one booking standing, and ask after it in the morning (Aug 2026)

**THE SANDBOX ORDER HAS ONLY EVER REACHED STATUS 1, AND THE PASS IS WHY.** It
books an appointment and then cancels it at the end of the run, so the order it
created has nothing attached to it — and an order nobody attends is an order the
laboratory never runs. Questions 3 and 8 (what does a status 4 look like, and
what does GetOrderResultDetail actually return) have therefore never been
askable, and they are the two that matter most now that a clean delivery releases
itself: **the analyte map has never been confirmed against a real payload**, and
that map is what stands between a delivery and a patient's screen.

**`SANDBOX_LEAVE_BOOKING=true` skips TWO steps and it has to be both** — the
cancel, and the SECOND create against the same GPExternalNumber (question 7).
The last run showed that second create SUCCEEDS and produces a distinct
appointment, so skipping only the cancel would leave TWO live bookings against
one order, which is worse than none: nothing then says which one the laboratory
is working from. Off by default, because a run that leaves a booking behind has
taken a slot in somebody's diary. The order number and the booking id are printed
LAST, after several hundred lines of output, with the exact `sandbox:poll`
command to paste in the morning — a value somebody has to go looking for is a
value they will re-derive by starting another run, which creates another order,
which is the thing this option exists to avoid.

**`npm run sandbox:poll --workspace=apps/server -- <order number>`** asks after
an order that already exists and **creates nothing**. GetOrderStatus, and if the
status is 4, GetOrderResultReports and GetOrderResultDetail, both captured. It
polls at the pass's one-minute cadence for `SANDBOX_POLL_MINUTES`, which is **0
by default — one call, then exit**: this is the command somebody runs over coffee
to find out where an order got to, and a script that then sits there for twenty
minutes is a script they stop running.

**THE GUARDS AND THE CAPTURE FORMAT ARE SHARED, NOT RETYPED.**
`scripts/sandboxShared.ts` holds the credential check, the stes--only host check,
the NODE_ENV refusal, the connection builders and `call()`. A second script with
its own copy of any of those is a second script that can be wrong about
production while the first is right. What is NOT shared is any flow.

**THE POLL DOES NOT CLEAR THE DIRECTORY AND PREFIXES ITS FILENAMES**
(`poll-<orderNumber>-NN-…`). It runs hours after the pass, against the order the
pass created, so joining the pass's `NN-` sequence would put two runs in one
numbering with nothing in the filenames to say so — the exact failure
`clearPreviousRun` exists to prevent. A second poll of the same order replaces
its own captures and nobody else's. ⚠ **A later `sandbox:pass` WILL delete
them**, because that command clears the directory on purpose.

**The clinic id is FETCHED here too.** The poll has no database, so it cannot use
`loadDiscoveredClinicId` — it calls GetMyClinicDetails and refuses rather than
guessing, because a wrong clinic id on GetOrderResultDetail is a request for
somebody else's order. `RANDOX_CLINIC_ID` overrides, exactly as on the server.

**THE PANEL AND TEST CAPTURES CARRY RANDOX PRICING** (~1.5 MB, all 616 panels
and 1189 tests). Deliberate: `stripPricing()` runs in the CLIENT, this script
bypasses it, and a capture is the raw wire or it is not evidence. Commercial
question, not a patient-data one.

The pass needs THREE things this repository does not have and cannot have:
`RANDOX_NEXUS_SUBSCRIPTION_KEY`, `RANDOX_USERNAME` and `RANDOX_PASSWORD`. They
go in `apps/server/.env.sandbox` (gitignored, `.env.sandbox.example` beside it),
which the script loads itself.

**IT IS STANDALONE, AND THE SERVER'S CONFIG IS NOT ITS BUSINESS (Aug 2026).**
It imported `src/config/env.ts`, which parses the whole server configuration at
module scope — so it demanded `APP_BASE_URL`, `API_BASE_URL`, `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`, `ENCRYPTION_KEY` and
`FILE_SIGNING_SECRET` before making one call, and named none of the three
credentials it actually wanted. It reads `process.env` directly now, for the
Randox settings only, and refuses BY NAME. It does not want `RANDOX_ENABLED` or
`RANDOX_TRANSPORT` either: those are the server's switches and this script is
the live call by definition.

**WHAT IT DOES NOT DO IS RE-IMPLEMENT THE TRANSPORT.** It builds a
`RandoxApiConnection` and hands it to the real `RandoxHttpClient` — real B2C
ROPC auth, real headers, real pacing, real retry, real 401 handling. A capture
taken through a second implementation is a record of the second implementation.
That is what `modules/randox/connection.ts` is for: the connection SHAPE, with
pacing/retry/bearer on it, and no environment anywhere. `config.ts` builds one
from `env` for the server; the script builds one from three credentials.

**AND EVERY DOCUMENTED NON-SECRET VALUE IS IN ONE FILE, `documentedDefaults.ts`,
WHICH `config/env.ts` DEFAULTS FROM AS WELL.** Both base URLs, both client ids,
both scopes, the token endpoint, 787/788, LocationId 30. Two copies of the Nexus
scope is a second chance to lose the hyphen out of it, and the wrong copy would
be the one the sandbox pass sent.

**THE CLINIC BOOKING HALF IS OPTIONAL AND ITS ABSENCE IS A RECORDED RESULT.**
`RANDOX_BOOKING_SUBSCRIPTION_KEY` is a separate key from a separate developer
portal, and booking is out of this portal's scope. Unset, the Nexus flow runs
alone and `ANSWERS.md` says questions 4–7 went UNASKED and why. **"We did not
ask" and "we asked and learned nothing" are different states and are written
down differently** — only one of them is worth rerunning for a key. Refusing to
take a Nexus capture for want of an unrelated key would be the script choosing
all-or-nothing on somebody's behalf.

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

# Console analytics (Aug 2026)

`/admin/analytics`. Five questions in the order a practice asks them: how many
patients, how much is coming through, how long it takes, what comes back out of
range, and what is being ordered. One window control at the top applied to
everything, so two figures on the screen are always comparable — which is the
whole reason they are on one screen.

**THREE RULES, and they are constraints rather than descriptions.**

1. **NOTHING NEW IS TRACKED.** Every figure comes from columns the pipeline
   already writes — `Report.receivedDate` / `releasedAt` / `status` / `voidedAt`,
   `ReportResult.status`, `Panel`, `User`. No event table, no counter, no
   analytics column. The same constraint the work queue runs on.
2. **AGGREGATE ONLY, AND SMALL CELLS ARE SUPPRESSED.** No row names a patient or
   carries a value. `SUPPRESS_BELOW` is 5, the published-health-statistics
   convention: a per-marker count of 1 or 2 crossed with a week is a pointer at
   an individual. The TOTALS are exact and only the breakdown is suppressed, and
   **the suppressed rows are stated in the table rather than dropped** — a table
   that quietly omits its own tail reads as complete and is not.
3. **IT COUNTS RELEASED REPORTS** and excludes voided ones. A report a clinician
   has not released is not yet a fact about the practice's output.

**NO CHARTS, deliberately.** On a practice this size a weekly volume series is
six or eight points, and a chart of eight points is a picture of noise with a
trend implied over it. Figures and tables; a table is what somebody reads a row
out of into an email.

**EVERY NUMBER SAYS WHAT IT MEANS.** "42" under "Reports" is a number nobody can
check — released or received, in what window, voided included or not — so each
block carries a sentence and each figure carries its own definition.

**CSV IS A RENDERING OF THE SAME OBJECT**, from one service call, so the
spreadsheet cannot disagree with the screen. Sections separated by a blank line
and a new header row (every spreadsheet reads that as separate tables); every
cell quoted; a UTF-8 BOM so Excel does not open "Anti-Müllerian Hormone" as
mojibake; CRLF.

**IT IS STILL AUDITED, and separately from the page view.** "Every admin view of
patient data is audited" is a rule about the ACT of looking, not the shape of
what comes back: a screen saying which markers most often come back out of range
is derived entirely from patients' results. `ANALYTICS_VIEWED` and
`ANALYTICS_EXPORTED` are distinct actions — a download leaves the building and a
page view does not, and an audit log where reading one patient's file and
reading a rate per thousand look identical cannot answer the question it exists
for.

**COVERAGE COUNTS MEASURED MARKERS ON BOTH SIDES.** Without that filter it
reported 437 ever-reported against 171 in the catalogue — the 207 food
sensitivities and the genetic panel on one side only — with "never reported"
clamped to 0 to stop it printing a negative. Two populations under one heading,
and the clamp hiding it.

# The clinician console: FIVE screens, and far less prose (Aug 2026)

**THE ROUTE LIST, AFTER.** `/` (Overview) · `/admin` (Reports) ·
`/admin/reports/:id` · `/admin/patients` · `/admin/patients/:id` ·
`/admin/analytics` · `/admin/settings`. Seven routes, of which two are detail
pages, plus **seven redirects**: `/admin/queue` → `/`, `/admin/linking` →
`/admin#unmatched`, and `/admin/panels`, `/admin/content`, `/admin/markers`,
`/admin/ingestion-log`, `/admin/audit-log` → the matching `#hash` on
`/admin/settings`.

**IT WAS ELEVEN ROUTES AND NINE SIDEBAR ITEMS.** Nine peers in a navigation is
an index rather than a navigation, and six of the nine were screens a practice
opens a few times a year — so the three opened every day were outnumbered two to
one. The previous pass tried to fix that with two BAND HEADINGS ("Every day",
"Records & setup") and a one-line hint under each label. Both are gone with the
four entries they existed to manage: a list of five needs no headings, and a
label that needs a sublabel to be understood needs rewriting.

**THE FIVE, AND WHAT EACH ABSORBED:**

    Overview   `/`. What needs doing, then the analytics headlines. Replaced
               the work queue, which replaced the console landing page.
    Reports    every report, and — as a section at its foot — the results
               nobody could place, absorbed from `/admin/linking`.
    Patients   its own item on purpose: daily clinical work rather than
               configuration, and what somebody reaches for when a patient
               rings.
    Analytics  the full set, windowed.
    Settings   one page, five disclosures: Edit packages, Marker library,
               Ingestion log, Audit log, Backup status.

**OVERVIEW IS TWO SECTIONS AND NOTHING ELSE.** *What needs doing* — everything
waiting on a person, oldest first, one list rather than three, every row a link
to the place the work is done. Then *Analytics*, three figures (released, median
turnaround, out-of-range per 1,000 over 30 days), each linked through. The four
bands that came off the work queue each moved somewhere they belong rather than
being deleted: the backup state to Settings (it is a thing you check, not a row
you clear), the turnaround figures to Analytics (a figure over a window belongs
with the other figures over that window), and the BUCKET SUMMARY nowhere at all,
because it was a second arrangement of the list directly beneath it.

**REPORTS ABSORBED RESULT LINKING BECAUSE AN UNMATCHED RESULT IS A REPORT.** A
separate screen for one class of report meant two places to look for the same
thing, and the second was normally empty — automatic linking means an admin
checking it daily finds nothing almost every day, which is how a screen stops
being checked at all. It is `#unmatched` at the foot of Reports, ADMIN only as
the route was, and the Overview's own row links straight to that anchor.

**SETTINGS MOUNTS THE OLD PAGES UNCHANGED.** `ConsoleSection` (ConsolePage.tsx)
is a context that tells `ConsolePage` to render its children without a heading
or a purpose line, so each section is the component that used to be the page,
mounted as it is. A context rather than an `embedded` prop because the wrapper
appears in three branches of most of those files (loading, error, real) and a
prop would be forgotten in whichever branch nobody looks at. Each section's
component is behind `lazyPage` INSIDE SettingsPage, so the four chunks are still
four chunks, fetched when a disclosure opens — importing all five eagerly there
would undo four lazy boundaries at once and be invisible in the entry size.
**"Edit packages", not "Panels"**: the clinic sells packages; panel is the
laboratory's word and the schema's.

**A REDIRECT INTO SETTINGS CARRIES A HASH AND THE SECTION OPENS ITSELF.**
Landing somebody on a page of shut disclosures answers "where is the audit log"
with "somewhere under one of these". `admin-route-console.spec.ts` asserts the
URL AND `aria-expanded` on the disclosure, because the URL half passes on its
own with the door shut.

**THE COMMAND PALETTE OUTLIVES THE SIDEBAR ENTRIES.** All five screens plus the
five things that stopped being screens, each pointing at its own anchor. That is
the argument for a palette existing: a destination not worth a permanent
navigation entry is still worth being able to type the name of. The `hint` stays
there — it is what tells "Audit log" from "Ingestion log" in a list of search
results, where there is room for it and no truncation.

## And the prose was cut hard

**THE TARGET IS A LIMIT, NOT A STYLE NOTE: no console screen carries more than
ONE SENTENCE of prose above the data.** Everything else is the data.

- **`purpose` IS OPTIONAL NOW.** Reports carried 46 words describing a list of
  reports, above a list of reports, on the screen a clinician opens every day —
  and it is one of five that were two or three sentences. A purpose line is read
  on the first day and is in the way on every day after it. Reports, Overview
  and Settings carry none at all; the rest carry one clause naming the DECISION
  the screen supports.
- **THE ANALYTICS NOTES ARE BEHIND ONE AFFORDANCE.** Eighteen figures each
  carried a sentence and seven bands each carried a paragraph — roughly 25
  explanations on one screen, including three sentences on what a median is.
  None of it is deleted: all of it is in `DEFINITIONS` in AnalyticsPage.tsx,
  behind a closed "How to read these figures" disclosure at the top. The
  reasoning for those sentences was always right — "42" under "Reports" is a
  number nobody can check — and what was wrong was the placement.
- **SIDEBAR HINTS ARE GONE ENTIRELY.** They also said what the screen says: the
  work queue's hint read "What is waiting, oldest first" above a screen headed
  "What needs doing" above a purpose line saying it a third time. **Say a thing
  once.**

**THE UNIT SITS AGAINST ITS NUMBER.** `36 h ago` was set with an ordinary space,
which at the 2xl step is about 9px of nothing between a figure and the letter
that gives it meaning — three things rather than one measurement. U+202F NARROW
NO-BREAK SPACE now, about a third the width and unable to leave "36" at the end
of a line with "h" at the start of the next. Every duration in the console goes
through `formatDuration` in workQueueData.ts or the one in AnalyticsPage.tsx,
both of which use the `UNIT` constant. ⚠ It is written as `' '` and never
as the literal character: ESLint's `no-irregular-whitespace` refuses one in
source, rightly — a whitespace character nobody can see is one nobody can
review.

## Analytics: what was added, and the two rules that did not move

**MARKERS OUT OF RANGE, BY PACKAGE** is the new breakdown. "Ferritin is our
commonest out-of-range result" is interesting; "Ferritin is our commonest
out-of-range result on Signature" is something the owner of the catalogue can
act on, because a package is a thing they choose the contents of. Grouped by
(marker, report) in the database and folded onto the package in node, because
Prisma's `groupBy` cannot reach through a relation — the row count is bounded by
the number of OUT-OF-RANGE results rather than by all results, which is the
status filter doing roughly an order of magnitude of work and is what keeps this
off the "pull tens of thousands of rows into node" list. A report released
inside the window but received before it is fetched rather than dropped.

**SUPPRESSION BITES HARDER ON IT, and that is correct rather than unfortunate.**
Splitting a count across the packages it came from makes every cell smaller, so
more fall under the threshold — and a (package, marker) cell of 2 points at one
person more sharply than a marker total of 2, because the package narrows it
further. The withheld rows are stated, as everywhere else.

**NO PRICES AND NO REVENUE, in the console as in the portal.** `stripPricing()`
deletes Randox's `cost` and `currency` at the transport boundary and nothing
here reintroduces them. **Nothing new is tracked**, aggregate only, small cells
suppressed and stated, CSV is a rendering of the same object from one service
call, and both the view and the export are audited as distinct actions.

# The clinician work queue → Overview (Aug 2026)

`/` renders Overview; `/admin/queue` redirects to it. What survives from the
work queue is the LIST — everything waiting on a person, sorted by time in its
current state, longest first, with each held report's own reasons printed under
it rather than a count of them.

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

# What a result card carries, and what came off it (Aug 2026)

A marker card is: the NAME, the range bar, the value with its unit, the status
chevron and word, then the package and the date. Nothing else.

**FIVE LINES WERE REMOVED**, and each for its own reason rather than to save
space: the LAB REFERENCE RANGE (the bar above it draws that range, ticks both
bounds and prints the scale, and the line was the widest thing on the card, so
it was setting the 15rem grid floor); the OPTIMAL BAND'S FIGURES (a card needs
the answer, not the interval — it reads **"Outside optimal"** and nothing more,
and nothing at all when the answer is "within"); the RESULT COUNT ("3 results"
is a fact about the history and the history is one click away with a chart on
it); the CATALOGUE GLOSS (a definition clamped to two lines is a definition
truncated mid-sentence — the `note` prop is gone, not merely unused); and
"ANALYSED BY RANDOX HEALTH". **"Amended 3 February 2026" STAYS** and is the one
that was not cut: it says this number changed after the patient saw it.

**THE PACKAGE IS LABELLED AND THE DATE IS ITS OWN LINE.** "Package: Signature"
then the date. "Signature" alone is a word with no job in the sentence.

**THE ABBREVIATION LEADS, THE EXPANSION IS THE QUIET SECOND LINE.**
`hs-CRP` over `High-Sensitivity C-Reactive Protein`, never
`hs-CRP (High-Sensitivity C-Reactive Protein)` wrapping across four lines of
eyebrow. `splitMarkerName` (packages/shared) is the one derivation, used by the
card and by the marker page's own h1, and **it refuses far more often than it
splits**: 32 of 254 parenthesised names in the live database. It reads BOTH
orders, because the product has both — the catalogue writes
`Mean Cell Haemoglobin (MCH)` and the database mostly writes
`ALT (Alanine Aminotransferase)`, and the first implementation handled only the
catalogue's, so `ALT (ALANINE AMINOTRANSFERASE)` shipped unchanged on a card two
along from one that split correctly. Four tests, all four required: one token,
at least two capitals, the same first letter case-insensitively, and shorter
than what it stands for. **Do not invent abbreviations** — every one of the 207
foods keeps `(IgG)`, all nine urinalysis pads keep `(urine)` (which is
load-bearing: it is what stops a dipstick glucose merging into a plasma one),
and `Lipoprotein (a)` keeps its `(a)`.

**"ANALYSED BY RANDOX HEALTH" IS GONE FROM EVERY PATIENT SURFACE (Aug 2026).**
It said something about the practice's laboratory arrangements and nothing about
the results beside it. Removed from: the marker page, the report header, the By
test cards, the Overview's latest-panel card, the Documents list, the chart
tooltip, the report list, Compare, and the PATIENT summary PDF.

**AND IT IS BACK ON THE GP HANDOVER, WHICH IS THE ONE PLACE IT EARNS ITS LINE.**
It was removed from there too, and flagged at the time as the one removal that
cost something. It did. **The argument is the same one in both directions:** on a
patient's result card the laboratory's name is a fact about the practice's
commercial arrangements; on a doctor's page it is the reason two numbers might
not be comparable, because a REFERENCE INTERVAL IS ASSAY-SPECIFIC. The handover's
identity grid carries a `Laboratory` row again — a field a GP can find, rather
than a clause inside the paragraph, which is where it used to be. It stays off
the patient PDF.

**AND THE FIELD IS OFF THE PATIENT DTOs, not merely unrendered.** It was still
being computed and sent on six `portalService.ts` payloads long after the last
render of it was deleted — dormant rather than removed, invisible to any
screenshot review, and one autocomplete away from the screens it was taken off.
Deleted, the way `nextSteps` was deleted with the Overview section that rendered
it. `sourceLabel` is imported by `patients/service.ts` and `reports/service.ts`
only (both ADMIN read models), and `sourceAttribution.test.ts` pins that list,
pins the handover's row and pins its absence from the patient PDF.

# The marker page: two cards, 37.5/62.5, then everything else (Aug 2026)

**THE STATUS IS THE SECOND THING ON THE PAGE (Aug 2026).** It was a 14px label —
the same one a card in a grid of forty gets — in a row of small print between the
value and three more lines of small print, on a page whose whole subject is one
result. `StatusBadge size="lead"` is the reading step with a 22px chevron, with
28px above and below it against the 12px it had; the space is doing as much as
the size. Still below the value and still smaller than the marker's name, so the
ladder is unchanged. The amendment note left that row: beside a lead-sized status
a footnote about the record read as part of the finding.

**FOUR THINGS CAME OFF THE PAGE.** The "Marker detail" standfirst (it labelled
the page as a page about a marker, under a breadcrumb ending in the marker's name
and above the marker's name at 38px — three statements of one fact, of which it
was the one carrying nothing); the lab reference range line (the bar draws it);
the optimal figures line (the card further down says it in a sentence WITH its
published source, which is the form advisory guidance belongs in); and "Analysed
by Randox Health".

**THE CHART IS 24rem AT lg AND THE CARD TAKES 62.5% OF THE ROW (Aug 2026).** It
went 30rem → 22 → 28 by adding and removing HEIGHT alone, which is the axis that
was already wrong: at 28rem in a 60% card the plot was about 490 × 432, which is
very nearly square, and a trend read in a square is a trend read at 45° where
every movement looks like a cliff.

Both dimensions move a little, in opposite directions. The grid is **eight
columns split three and five** (it was five split two and three) and the plot
loses 64px. The inner plot goes from about 490 × 432 to 514 × 368 — from 1.13:1
to **1.40:1**, a landscape chart rather than a squat one, on 2.5% of width and
14% of height. The LEFT card now sets the row height, which is the right way
round: its content is fixed and the plot's is elastic.

**`e2e/marker-pair-fit.spec.ts` measures the pair at 1440 × 900 in both themes**
— that file is NEW, because TrendChart's comment had cited a spec for this
figure through three different heights and the file it named did not exist. A
number protected by a comment pointing at nothing reads as covered and is worse
than an uncovered number that admits it.


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

# "What's changed" is two cards across (Aug 2026)

⚠ **THE "EACH ITS OWN HEIGHT" HALF IS REVERSED** — see `.card-row` near the top
of this file. The WIDTH argument below is untouched and is still why this section
is two across; the row is equalised now and the hole it used to open is closed by
the card being a flex column instead.

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

# The explanation card is the size of the text in it (Aug 2026)

`padding="roomy"` is 48px on every side at sm+, on a card whose content is a
label, a sentence and three short label/answer pairs — that plus a 32px gap
under the heading was roughly 130px of air. It takes the ORDINARY card padding
(28px / 36px) and 36px between blocks. **The ladder inside it is a separate
decision from the padding around it** and has since been rebuilt to three
levels — 16px labels, a 14px Fraunces definition, 12px answers (see "THE
EXPLANATION CARD" near the top of this file). What this note settles is the
card's own padding, and that is unchanged by the rebuild. The block ratio
(roughly four to one between blocks and within a pair, measured at the PAINTED
gap) is what does the grouping.

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
- **By marker is the first Results tab and the default view.** **By test** (it
  was "By report" until Aug 2026 — a patient books a TEST and receives a report
  about it, and the tab is what a patient reads) is one press away, and every
  emailed link opens /reports/:id, which pins that view regardless. The default
  view is the one with NO `?view=` parameter, so /results and
  /results?view=by-marker are one URL. `?view=by-report` still RESOLVES — it is
  in bookmarks, and `LEGACY_VIEW_ALIASES` maps it on the way in and never on the
  way out, so a legacy link ends up on the current URL.
- The results control bar's filters panel is opened and closed by the READER
  only — one boolean, closed on load, toggled by the disclosure, closed by
  Escape, an outside click and a change of view. Nothing derived from scroll
  may write it; that is what made the disclosure fail to toggle. It is
  unmounted when shut, so it cannot overlap or displace the search field or
  the tab switcher.
- **THE FOUR PICKERS ARE A GRID, NOT FOUR FIXED WIDTHS (Aug 2026).** They were
  192 + 224 + 160 + 208 plus three 16px gaps = 832px, against a content column of
  about 832px at 1280 with the sidebar out — so Show, Category and Group by took
  the line and **Sort by dropped to a second row on its own**, under most of a row
  of empty space. Three-and-one reads as a failure to fit. `grid-cols-1
  sm:grid-cols-2 lg:grid-cols-4`, which cannot go three-and-one at any viewport
  and cannot drift when somebody adds a longer option label; the fallback below
  `lg` is **two and two**, which reads as a block of controls. The column count
  follows the number of controls, because `scope` is null on the report list and
  on Compare where Group by and Sort by are not rendered at all — a four-column
  grid holding two pickers sets them at a quarter width with half the panel
  empty. `e2e/filter-panel-layout.spec.ts` measures the painted tops at 1280,
  1440 and 1920, and that the four cover more than 80% of the row.
- **THE CATEGORY FILTER CARRIES A THIRD VOCABULARY: "Not compared to a range" /
  "Compared to a range" (Aug 2026).** The nine measured markers that keep an
  empty unit on purpose and every physical measurement have no reference range
  and never will, so they render as untinted cards reading "Not compared to a
  range" — correct, and until now nothing a reader could do about a block of
  them. Two options, EXACT COMPLEMENTS, both self-describing so the chip names
  itself wherever it is carried, worded as the sentence already printed on the
  cards (`NO_STATUS_LABEL`). Never "qualitative": not a word a patient has, and
  not even the right one, since this cuts ACROSS the result types. It lives in
  `reportSections.ts` beside `RESULT_TYPE_FILTERS` because `categoryFilter` is
  ONE string carrying three vocabularies and the prefixes are what stop a
  catalogue key colliding with ours — three prefixed lists in one file cannot
  drift apart. It narrows the MEASURED GRID and hides the personal-measurements
  section under "Compared to a range"; the sections below the grid have no range
  either and are not what anybody asking this means, and each already has its own
  entry in the picker.
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
- **THE DOCUMENTS PAGE IS THREE BUTTONS ON ONE LINE (Aug 2026).** The GP
  handover used to sit below the other two behind its own rule with four lines of
  explanation under it — "one page, take it to your GP", which is what the button
  already says. Both the rule and the paragraph were doing the LABEL's job:
  "Summary for your doctor" is unambiguous about whose document it is.
  Hierarchy is the button variants, not a divider.
  **AND "(PDF)" CAME OFF ALL THREE.** Three buttons on one row each ending in
  the same parenthesis is the format stated three times and distinguishing
  none of them — 42 characters of the row spent saying one thing. It is said
  ONCE, in an eyebrow above the row, where it is a property of the group. With
  it gone and the labels cut to their subjects (**Aspire summary · Original lab
  report · Summary for your doctor**) the three fit one line from `lg` up.
  **`flex-col lg:flex-row`, NEVER `flex-wrap`** — wrapping is what put them on
  two ragged lines at desktop widths, and a row that CAN wrap eventually will.
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

# Results release automatically. There is no human gate (Aug 2026)

The pipeline is **UPLOADED → PARSED → RELEASED**, with CHANGES_REQUESTED as a
loop back rather than a fourth forward stage. **A clean parse reaches the patient
with no human step, significantly out-of-range results included.**

**The practice's decision, and the reasoning is Richard's:** a patient not seeing
their own abnormal result is worse than them seeing it, and a result sitting in a
queue nobody opens is the real risk.

**ADMIN_VERIFIED went first, CLINICIAN_REVIEWED has followed it, and neither is
coming back.** Both are removed from the enum. Reports sitting at
CLINICIAN_REVIEWED are migrated to RELEASED — a clinician had already said yes
and the only thing left was a second press — and PARSED reports with nothing held
AND results actually written are released too, which is where automation would
have left them. A parsed PDF with no `ReportResult` rows is NOT released by that
migration: it would put an empty report in front of a patient.
`20260814140000_automatic_release`. Every `REPORT_REVIEWED_APPROVED` audit entry
stays exactly where it is.

**WHAT REPLACED THE GATE, AND IT IS NOT NOTHING.** Two refusals, both in
`lib/reportTransitions.ts`, both server-side:

1. **`release` is permitted only from PARSED.** A file nobody has read cannot
   reach anybody, and a report somebody has sent back (CHANGES_REQUESTED) cannot
   either.
2. **`releaseBlockedByHolds()`.** A report carrying `holdReasons` cannot be
   released — by automation or by a person pressing a button — until those
   reasons are acknowledged in the same action. **This is the only checkpoint
   left and it is a REFUSAL rather than a queue**, which is the point: a refusal
   cannot be defeated by nobody opening a screen. Nothing automatic may pass the
   acknowledgement; a machine acknowledging its own question is not an
   acknowledgement.

**`review` SURVIVES AND IS NOT A STAGE.** It is what a person does about a HELD
report: approving means "I have read these reasons and it goes out anyway", and
it lands on RELEASED directly, because there is no intermediate status left and
inventing one would be the gate returning under another name. Rejecting lands on
CHANGES_REQUESTED. The console sends a held report through `/review` (a real
clinical decision, audited as one) and a clean unreleased one through `/release`
(nobody reviewed anything, and an audit entry saying REPORT_REVIEWED_APPROVED
about that is a review nobody did).

**`verify` is still a CORRECTION, not a stage.** It fixes a value or keys in a
report that never came through the API, it may repeat, and it lands back on
PARSED — it does NOT release, because saving a form is not the same act as
sending it. It still CLEARS the holds, because a person has just entered every
row deliberately. The one-step publish path is verify → release and reads the
holds BEFORE verify clears them, or it would launder one.

**`materialiseParsedReport` releases what it wrote, OUTSIDE the transaction.**
Escalation is a network call to a third party and holding a row lock across it
would put a mail provider's latency on a patient's results. The two failure modes
are not symmetrical: written-but-not-released is a report at PARSED that the work
queue shows as NOT_RELEASED and a person releases in one press;
released-but-not-written cannot happen, because the write has already committed.
A failed release is audited (`REPORT_AUTO_RELEASE_FAILED`) and does not fail the
ingestion — turning it into one would make the poller retry the whole delivery
and lose the record of what arrived.

## Escalation fires BEFORE the release commits, and severity changes what arrives

It used to run after a successful release, from the route. Both halves of that
were right until release stopped being a human act: with a gate, the escalation
told the practice about something one of their own people had just done; with
automatic release, **the patient and the clinic learn at the same moment**, so
anything arriving afterwards is an email about a conversation the patient may
already be having.

`checkAndEscalate` is now awaited by `releaseReport` **before the status write**,
rather than by the two routes that used to remember to call it — so a route that
forgets is no longer a thing that can exist. `automaticRelease.test.ts` measures
the ORDER rather than asserting it: the mock reads the report row at the moment
escalation runs and the test fails if it says RELEASED.

**IT CANNOT BLOCK THE RELEASE.** A mail provider being down is caught, audited as
`ESCALATION_FAILED`, and the release proceeds. The whole argument for automatic
release is that a result nobody can see is the worse outcome; making it
conditional on Resend would reintroduce exactly that with a third party holding
the switch.

**SEVERITY IS NOT A LABEL ANY MORE.** Significant and mild used to differ by four
words in a subject line, which on a busy morning is no difference at all. They
now differ in the three places a difference is noticed:

- the **subject** leads with `URGENT` and carries the count, so the inbox list
  sorts by eye;
- the mail carries `Importance: high` / `X-Priority: 1` — **on SIGNIFICANT
  only**, because a sender that marks everything important is one nobody
  believes twice. `EmailMessage.headers` exists for this and nothing else;
- the **body splits the two groups**. "Significantly outside range: Ferritin"
  over "Also outside range: ALT, GGT" is a triage instruction; one
  comma-separated list of five markers is a list.

The SMS still carries no values and no marker names — it is a ping at a phone
that may be on a waiting-room table — and what differs is the instruction. Every
escalation now says, in as many words, that **the report is being released to the
patient now**, because the clinician's question is no longer "should this go out"
but "does this need a call today".

**`releaseReport({ escalate: false })` has ONE caller in the product and it is
the demo seeder**, which drives real reports through the real pipeline and would
otherwise email `ESCALATION_EMAIL` for every fabricated out-of-range result. It
writes its own `EscalationEvent` with `channelsNotified: []`, which says
truthfully that nothing was sent.

## What "a clean parse" means, and it is now the ONLY checkpoint

`lib/cleanParse.ts` is the single definition, because anything it lets through
goes **straight onto a patient's screen** and anything it holds is the only thing
that stops it. The conditions are a CLOSED LIST of five — `HOLD_CONDITIONS` is
the array as well as the type, and `cleanParse.test.ts` pins both, so a sixth
cannot be added without being named:

1. **UNMAPPED_ANALYTE** — a row the laboratory sent that no marker answered to.
   The commonest one in practice: the analyte map has never been confirmed
   against a real payload. With nobody reviewing, this is the one that matters
   most.
2. **UNFILED_ROW** — matched a marker but could not be written (no usable
   two-sided range, an unparseable value, a duplicate marker on one report).
3. **UNRECOGNISED_CODE** — a void or caveat code not in the configured map. It is
   already treated as void and the result withheld, which is the safe default,
   and it means a test the patient paid for is absent for a reason nobody has
   read. This is the ONE case where a withheld-by-the-lab exclusion holds. ⚠ It
   got MORE important when the gate came off, not less: an unrecognised code used
   to be caught by a clinician looking at the report and there is no longer a
   clinician looking at the report. **The production boot guard that refuses to
   start with `RANDOX_TRANSPORT=live` while the code map is the checked-in
   placeholder is untouched and is not to be weakened.**
4. **LAB_DISAGREEMENT** — Randox's own `lowHigh` contradicts the status we
   computed from the value and the range they sent.
5. **PARTIAL_DELIVERY** — the laboratory has not finished reporting the order.

**Two deliberate non-conditions.** A result withheld under a RECOGNISED void code
does not hold — that report is complete as far as anyone here can make it and the
exclusion is on the record.

**NOR DOES AN OUT-OF-RANGE RESULT, INCLUDING A SIGNIFICANTLY OUT-OF-RANGE ONE,
AND THIS WAS RECONSIDERED WHEN THE GATE CAME OFF AND DELIBERATELY LEFT ALONE.**
It is the whole reasoning behind automatic release. Holding on severity would make
the exception queue the entire report list, which is the queue nobody opens
wearing a safety label. What a significant result does instead is escalate,
harder than a mild one and before the release commits.

## A hold is a property of the report, not a stage

`Report.holdReasons` (plus `heldAt`, `holdsAcknowledgedAt/ById`). A three-state
pipeline has no state left to park a problem in, and the failure that has to be
impossible is a report with an unmapped analyte in it looking identical, on a
work queue, to one with nothing wrong. So:

- PARSED with no holds is NOT_RELEASED; PARSED with holds is HELD. `queueState()`
  on the server and in `lib/reportStatus.ts` is the one place that distinction is
  made, and every label function takes the holds as well as the status. A
  function that only sees the status cannot tell them apart.
- **AWAITING_REVIEW is gone with the gate.** Nothing is awaiting review — a clean
  report is released by the call that wrote it. What sits at PARSED with nothing
  held is a PDF nobody has keyed in, or a release that failed; both need a person
  and neither is "awaiting review", which is why the bucket says NOT_RELEASED.
- `releaseReport` and `reviewReport` both REFUSE a held report without
  `acknowledgeHolds`. The acknowledgement is stamped on the report and the
  reasons AS THEY STOOD are copied into the audit entry, because the report's own
  holds are cleared by the next correction. Requesting changes needs no
  acknowledgement — sending a held report back is the right answer to a hold.
- A new hold retracts any previous acknowledgement (`holdFieldsFor`), or a
  clinician who acknowledged one problem would have silently pre-cleared the next
  delivery's.
- The work queue leads with HELD, and it is now the ONLY thing between a bad
  parse and a patient's screen rather than between a bad parse and a clinician's.

`reportTransitions.test.ts`, `cleanParse.test.ts` and `automaticRelease.test.ts`
pin all of it, including that `clean` is exactly "no holds" rather than a second
judgement that could drift from the list.

**A REDELIVERY OF A RELEASED ORDER IS IGNORED, AND THAT BRANCH FIRES FAR MORE
OFTEN NOW.** `MERGEABLE_STATUSES` in ingestionService.ts is UPLOADED / PARSED /
CHANGES_REQUESTED, and a clean delivery is RELEASED by the time a second copy
arrives — so it no longer quietly overwrites results a patient has read.
Amending a released value goes through `editReleasedReportResult`, which
versions. A PARTIAL delivery is HELD and therefore still at PARSED, so the merge
case that actually matters — the rest of the panel arriving — is untouched. **A
VOIDED report is not a duplicate**: somebody deliberately took it away, usually
by unlinking it from the wrong account, so a redelivery goes to the admin queue
rather than being dropped as "nothing to do here".

## What the catalogue reference range fallbacks are still for

They were built to suggest a range in the verify form. That form has not been a
gate for some time and there is now no gate at all, so the honest answer to "does
that work retain its purpose":

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
