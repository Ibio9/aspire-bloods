/**
 * Aspire Bloods design tokens — single source of truth for color, type, and
 * status semantics. Tailwind config and every component consume this file;
 * no raw hex belongs anywhere else in the codebase.
 */

// ---------------------------------------------------------------------------
// THE PALETTE — NEUTRAL AND COOL SINCE Aug 2026. IT USED TO BE WARM.
// ---------------------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  FOUR TONES, AND THEY ARE NEUTRAL NOW — THE PRODUCT WAS BROWN (Aug 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This block used to read "exact, from Aspire Clinic brand guidelines — do not
 * alter" and hold bronze #8a5e45, espresso #423c36, cream #e3dfd3, taupe
 * #c9bca9. Every surface, every border, every shadow and both themes' entire
 * dark scale were derived from those four, so the whole interface was warm by
 * construction — which was the intent and is exactly what was rejected. The
 * instruction is Raheel's and it is explicit: a clean black/dark theme, no
 * brown, no amber, no tan.
 *
 * ── IT IS DONE HERE AND ALMOST NOWHERE ELSE, WHICH IS THE POINT ────────────
 *
 * Nothing in this codebase writes a colour except this file. Every surface, tint,
 * border, shadow, chart fill and status wash is a `mix()` of these four, resolved
 * through a CSS custom property, so re-theming the product is four hexes and the
 * handful of places that named a warm hue explicitly (the glows, the second
 * accent family, the two PDF builders). There was no sweep through components,
 * because there was nothing in the components to sweep.
 *
 * ── WHAT EACH ONE BECAME, AND WHY THAT VALUE ──────────────────────────────
 *
 *   accent    #5A6472  A cool slate. It is the one filled colour in the product
 *                      — buttons, the focus ring, active nav, links — and it has
 *                      to carry WHITE TEXT at AA in light mode, which is what
 *                      sets its darkness: 5.72:1, where a lighter slate would
 *                      have repeated the mistake cream-on-bronze made at 4.18.
 *   ink       #14161A  Text in light, and the seed of every dark surface. A
 *                      hair cool rather than a true neutral (b > g > r by two
 *                      levels): a dead-neutral near-black reads as flat grey
 *                      next to white, and a trace of blue is what makes it read
 *                      as BLACK rather than as dark grey.
 *   surface   #E7E9ED  The light page. Cool light grey, not cream.
 *                      ⚠ NOT a near-white. The first pass used #F3F4F6 and the
 *                      whole LIGHT LADDER collapsed: a card is `cream-50`, which
 *                      is the surface taken 90% to white, so a page that starts
 *                      at 96% white leaves a page→card separation of 1.05:1
 *                      against the 1.30:1 it had. Every surface in light mode —
 *                      card, panel, pane, vellum — lives in the gap between this
 *                      and white, so this value IS that gap.
 *   border    #C7CBD3  The hairline. Cool grey, not taupe.
 *
 * ── THE NAMES DID NOT CHANGE, AND THAT IS DELIBERATE ──────────────────────
 *
 * `bronze` / `espresso` / `cream` / `taupe` are the KEYS of the whole token
 * system: `text-espresso`, `bg-cream-50`, `border-taupe` and `scales.bronze[700]`
 * appear several hundred times across two apps, plus in Tailwind's colour map, in
 * every spec that reads a class name, and in the PDF builders. Renaming them is a
 * mechanical sweep with no visual result and a large surface for a mistake, on a
 * change whose entire risk is visual.
 *
 * So they are ROLE NAMES that happen to have historical spellings — `bronze` is
 * "the accent", `espresso` is "the ink", `cream` is "the surface", `taupe` is
 * "the border" — which is what they always actually were. The aliases below say
 * so in the type system for anything written from here on.
 */
export const brand = {
  /** THE ACCENT. Buttons, focus, active nav, links. Was a warm bronze. */
  bronze: '#5A6472',
  /** THE INK. Body text in light, and the seed of every dark surface. Was a warm espresso. */
  espresso: '#14161A',
  /** THE SURFACE. The light page and the base of every light card. Was cream. */
  cream: '#E7E9ED',
  /** THE BORDER. Every hairline. Was taupe. */
  taupe: '#C7CBD3',
  white: '#ffffff',
} as const;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LIGHT MODE HAS ITS OWN SURFACE AND HAIRLINE (Aug 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE BRIEF: light mode is a bright, modern, premium light theme. White cards
 * on a soft near-white page, separation from tone steps, shadow and the glass
 * rather than from a grey fill, light neutral hairlines, and the accent as the
 * one interactive thread with everything structural around it neutral.
 *
 * ── WHY THESE ARE NOT `brand.cream` / `brand.taupe` ───────────────────────
 *
 * Because those two are the DARK theme's seeds as well, and the brief is
 * explicit that no dark-mode surface moves. `nightLift` is `mix(espresso,
 * taupe, …)`, so the border decides the hue of every raised dark surface;
 * `darkText` is `mix(cream, white, …)` and `darkBronze` is `mix(bronze, cream,
 * …)`, so the surface decides the dark theme's body copy and its accent. One
 * pair of hexes cannot be both "the light page" and "the direction dark lifts
 * in" and be changed for one of those reasons only.
 *
 * So the light SURFACE family and the light HAIRLINE family are built from
 * these, and `brand.cream` / `brand.taupe` go on seeding dark and are untouched.
 * `brand.bronze` and `brand.espresso` are shared by both themes on purpose: the
 * accent is the one thread that runs through both, and the ink is a near-black
 * in light and the seed of the page in dark, which are the same decision.
 *
 * ── THE TWO VALUES, AND WHAT DECIDED THEM ─────────────────────────────────
 *
 *   surface  #EDEFF3  The PAGE. A card is this taken 90% to white, so the whole
 *                     light ladder lives in the gap between this and white and
 *                     this value IS that gap. Measured: card #FDFDFE at 1.132:1
 *                     off the page, the pane at 1.056 and the sidebar at 1.113 —
 *                     page, then pane, then panel, then card, in order, with the
 *                     hairline and the shadow carrying what the tone step no
 *                     longer does. It was #E7E9ED, which is a mid light grey
 *                     rather than a near-white; body copy gains contrast in the
 *                     move (14.90 → 15.73:1).
 *                     ⚠ THERE IS A FLOOR AND IT IS NOT FAR BELOW. At #F4F6F9 the
 *                     card is 1.073:1 off the page and the sidebar cannot fit
 *                     between them at all. Brighter than this and the ladder has
 *                     nowhere to stand.
 *   border   #DCE0E7  The HAIRLINE. 1.30:1 on a card, against the 1.60:1 the old
 *                     one measured — a light neutral line rather than a grey
 *                     rule, which is the difference between a card that is drawn
 *                     and a card that is outlined. The 900 step is still body
 *                     copy on the sidebar and still clears AA, because the
 *                     shades run toward the ink rather than away from it.
 */

/**
 * The four by what they ARE, for anything written after the retheme. Same
 * values, same objects — this is a second set of names and never a second set
 * of colours.
 */
export const role = {
  accent: brand.bronze,
  ink: brand.espresso,
  surface: brand.cream,
  border: brand.taupe,
  white: brand.white,
} as const;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SECOND FAMILY — TWO ACCENTS, AND THE RULE THAT PICKED THEM (Aug 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The palette was bronze, espresso, cream and taupe, plus five status hues, and
 * EVERY ONE OF THOSE NINE COLOURS LIVES BETWEEN 10° AND 90° OF HUE. Written
 * down like that the austerity stops being a matter of taste and becomes a
 * measurement: the product had no cool colour at all, so every surface that
 * needed to be something other than a card had to be a lighter or darker brown,
 * and the only accent anything could reach for was bronze.
 *
 * ── THE ONE CONSTRAINT, AND IT IS NOT AESTHETIC ────────────────────────────
 *
 * An accent may never be mistakable for a STATE. Green, gold and red are solved,
 * measured and clinically load-bearing, and a decorative hue that lands near one
 * of them turns a page furniture colour into a reading about somebody's blood.
 * "Looks different enough" is not a check, so here is one that a test can run:
 *
 *     EVERY STATUS HUE HAS BLUE AS ITS LOWEST CHANNEL.
 *     NEITHER ACCENT DOES.
 *
 *   green  #5E8C3A  94 140  58   ·  teal   #2A6C74   42 108 116   B is not lowest
 *   olive  #939328 147 147  40   ·  slate  #3F4B63   63  75  99   B is not lowest
 *   yellow #C79A16 199 154  22
 *   orange #C4711F 196 113  31
 *   red    #B23A28 178  58  40
 *   bronze #8a5e45 138  94  69
 *
 * That is a structural separation rather than a hopeful one, it holds at every
 * tint and shade `buildScale` produces (mixing toward white or espresso moves
 * all three channels together and cannot reorder them), and
 * `tokenContrast.test.ts` asserts it.
 *
 * ── WHAT WAS PICKED ────────────────────────────────────────────────────────
 *
 *   teal   #2A6C74  ~188°  Unchanged in role, nudged bluer with the retheme.
 *                          86° from the nearest status hue. It was picked as a
 *                          COOL counter-light against a warm palette, and a
 *                          palette that is cool throughout has not made it wrong
 *                          — it has made it the only chromatic thing on the
 *                          page, which is what an accent is. THE COUNTER-LIGHT
 *                          IN BOTH THEMES now (see `--c-glow-2`).
 *   slate  #3F4B63  ~222°  WAS `plum` (#6B4260). A muted plum was chosen as "the
 *                          bridge back" to bronze — red-dominant, so a plum glow
 *                          and a bronze glow read as two lamps in one room.
 *                          There is no bronze to bridge back to, and a magenta
 *                          wash in the corner of a clean black interface is the
 *                          single most obviously WARM thing that would have
 *                          survived the retheme.
 *                          It is THE QUIET ONE: the pane tint in light, and the
 *                          family anything needing a second neutral-cool hue
 *                          reaches for. It is deliberately NOT the counter-light
 *                          — being 4° from the key light made the two one light
 *                          rather than two, which the contrast suite caught.
 *
 * ── AND BURNT AMBER WAS REJECTED, WHICH IS THE USEFUL HALF ─────────────────
 *
 * It was on the list and it fails the one rule that cannot bend. Amber lands
 * around 35–40°: between bronze at 19° and the status gold at 44°. A burnt-amber
 * glow in the corner of a results page is the same hue as ABOVE RANGE, at a
 * lower saturation, on the same screen as the thing it would be confused with.
 * There is no opacity at which that becomes safe, because the failure is not one
 * of strength. Nothing else was rejected: it is the only candidate that landed
 * inside the reserved arc.
 *
 * ── WHERE THEY ARE USED, AND WHERE THEY ARE FORBIDDEN ──────────────────────
 *
 * Used: the second ambient glow in each theme, the tint and the lit edge of the
 * page-surface glass, and the section rail. Forbidden, and this is not a style
 * note: NOTHING on a marker card, in a range gauge, on a trend chart or in a
 * status badge. Those are status surfaces, and a decorative hue next to them
 * reads as a state.
 */
export const accent = {
  teal: '#2A6C74',
  slate: '#3F4B63',
} as const;

export type AccentHue = keyof typeof accent;

// ---------------------------------------------------------------------------
// Color math — tints/shades are derived programmatically from the four brand
// hues only. Tints mix toward white; shades mix toward espresso (the brand's
// own darkest tone) since pure black is not permitted anywhere in the system.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = hex.replace('#', '');
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}

function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r: RGB = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  return rgbToHex(r);
}

/**
 * THE SAME HUE AT A DIFFERENT LIGHTNESS AND SATURATION — the one operation
 * `mix` cannot do.
 *
 * Every other colour in this file is a mix between two hexes, and a mix can
 * only ever move a colour along the straight line joining them. That is the
 * right tool for a wash (the surface plus a little of the hue) and the wrong
 * one for "the same gold, brighter" — mixing gold toward white raises its
 * lightness and DROPS its saturation, and a gold with the saturation taken out
 * of it is beige. Mixing it toward black keeps the saturation and drops the
 * lightness, and a dark yellow is olive. Those two dead ends are the whole of
 * why the dark chart bands read as mud: there was no way to say "brighter AND
 * still gold" with the tools this file had.
 *
 * So: convert to HSL, keep the hue angle, set the other two outright.
 */
function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6 : max === gn ? ((bn - rn) / d + 2) / 6 : ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

/** `hex`'s own hue angle, at the saturation and lightness given. */
function reHsl(hex: string, saturation: number, lightness: number): string {
  const [h] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, saturation, lightness]));
}

/**
 * `hex`'s own HUE ANGLE, at a saturation and a lightness that are both solved.
 *
 * The operation an OPAQUE band fill needs. It used to take the hue's own
 * saturation capped at one shared number, and that cap is what this replaced —
 * see `BAND_FILL` for the measurement and `bandChroma` for what a saturation is
 * solved against now. Only the hue angle survives untouched, which is what
 * keeps a band the brand colour rather than a new one.
 */
function reLightness(hex: string, lightness: number, saturation: number): string {
  const [h] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h, saturation, lightness]));
}

/** A hex's own saturation — for the call sites that deliberately keep it. */
function ownSaturation(hex: string): number {
  return rgbToHsl(hexToRgb(hex))[1];
}

/**
 * HOW COLOURFUL SOMETHING LOOKS — the OKLab chroma, i.e. the distance from the
 * neutral axis in a space built so that equal distances look equally colourful.
 *
 * It exists because the two obvious measures both lie, and both lies are
 * recorded in this file's history:
 *
 *  · HSL SATURATION is a ratio. It calls a pale pink and a fire-engine red the
 *    same figure, and it was the thing being capped when the bands read as
 *    "green mutters, red shouts".
 *  · THE RGB SPAN (max − min channel) is what tokenContrast.test.ts measures as
 *    a FLOOR, and it is right for a floor and wrong for a target. Solved for an
 *    equal RGB span the three bands came out `#98db65`, `#cfb158`, `#eb8677` —
 *    a highlighter green beside a dull gold — because a green at 63% lightness
 *    can hold an enormous RGB span while looking ordinary and a red cannot.
 *
 * Not exported: it is used to solve `BAND_FILL` at authoring time and the
 * solved numbers are what ship. Kept here rather than in a script because the
 * numbers below are meaningless without it.
 */
function okChroma(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return Math.hypot(
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  BLENDING TWO STATUS COLOURS PERCEPTUALLY — AND WHY `mix()` CANNOT (Aug 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `mix()` interpolates in sRGB, which is the right tool for a wash (a surface
 * plus a little of a hue) and the wrong one for the HINGE between two status
 * colours. A straight line between two sRGB points passes through the middle of
 * the cube, and the middle of the cube is grey: the sRGB midpoint of the green
 * band and a clean yellow is **#cdae62**, a dull gold that is less colourful
 * than either of the colours it joins. That is the whole of "green to yellow
 * passes through a dull olive" — a fact about the interpolation space, not about
 * either endpoint, and it survives any choice of yellow.
 *
 * OKLab is built so that a straight line between two colours holds its
 * colourfulness, and its POLAR form (OKLCH) is what actually walks the hue round
 * rather than cutting the corner off it: lightness and chroma interpolate
 * linearly, and the hue takes the SHORTER of the two arcs between them. Measured
 * on the same pair: **#cbcc55**, which is a bright yellow-green — the colour a
 * reader expects halfway between a green and a yellow.
 *
 * ⚠ THE HUE ARC IS THE PART THAT HAS TO BE SHORT. Taking the long way round
 * between green (~130°) and yellow (~100°) is a 330° journey through blue,
 * magenta and red, which would draw a rainbow along a reference bound. Every
 * pair this is used on is well under 180° apart, so the shorter arc is the
 * obvious one — and it is written down rather than assumed, because the day
 * somebody blends two colours that are nearly opposite it stops being obvious.
 */
type OKLab = [number, number, number];

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, c * 255));
}

function hexToOklab(hex: string): OKLab {
  const [r, g, b] = hexToRgb(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToHex([L, A, B]: OKLab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  return rgbToHex([
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ]);
}

/**
 * `t` of the way from `a` to `b` IN OKLCH — lightness and chroma linear, hue
 * along the shorter arc. The one blend operation the status colours use.
 */
export function oklchMix(a: string, b: string, t: number): string {
  const [la, aa, ba] = hexToOklab(a);
  const [lb, ab, bb] = hexToOklab(b);
  const ca = Math.hypot(aa, ba);
  const cb = Math.hypot(ab, bb);
  const ha = Math.atan2(ba, aa);
  const hb = Math.atan2(bb, ab);
  // The shorter arc, in radians. See the warning above.
  let dh = hb - ha;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  const L = la + (lb - la) * t;
  const C = ca + (cb - ca) * t;
  const H = ha + dh * t;
  return oklabToHex([L, Math.cos(H) * C, Math.sin(H) * C]);
}

/**
 * THE CEILING ON A BAND FILL'S COLOURFULNESS, PER HUE — and it is not a number
 * anybody typed in.
 *
 * A band fill may be as colourful as the BRAND HUE it is derived from, and no
 * more. That is what "still in the palette" means, stated as something
 * measurable: `statusHue.green` is the greenest green this product has, so a
 * green band as chromatic as it is cannot be out of the palette, and one more
 * chromatic than it has left. Per hue by construction, because the three brand
 * hues are not equally colourful — 0.1235, 0.1405 and 0.1590 in OKLab chroma —
 * and forcing them to one figure is the single-cap mistake wearing a different
 * hat.
 */
/**
 * HOW MUCH OF THAT CEILING A BAND ACTUALLY TAKES (Aug 2026).
 *
 * A band used to take all of it. That was right while the bands carried the
 * traffic light; it is wrong now the LINE does, and the measurement that says
 * so is that the green band carried 0.123 of OKLab chroma against the green
 * line's 0.096 — the context more colourful than the content.
 *
 * The bands are context, so they take 60% and the line keeps the rest. It is a
 * share rather than an absolute floor because the three hues cannot hold equal
 * chroma at the lightnesses the ladder puts them at, which is the whole reason
 * `bandChromaCeiling` is per hue; a flat number here would reintroduce the
 * single-cap mistake one level up.
 *
 * NOT APPLIED AT RUNTIME. `BAND_FILL`'s saturations are solved against it at
 * authoring time and the solved numbers are what ship — this is exported so the
 * contrast test can assert the share was actually taken rather than trusting a
 * comment.
 */
export const BAND_CHROMA_SHARE = 0.85;

export function bandChromaCeiling(hue: 'green' | 'yellow' | 'red'): number {
  return okChroma(statusHue[hue]);
}

/** Tailwind-style 50-900 scale: light tints (toward white) through the base
 * hue (500) to dark shades (toward espresso, never toward pure black). */
function buildScale(baseHex: string): Record<number, string> {
  const steps: Record<number, number> = {
    // ── 50 WENT 0.9 → 0.95 WITH THE PASTEL (Aug 2026) ────────────────────
    // Step 50 is THE LIGHT CARD, and the light page is a soft pastel now rather
    // than a near-neutral. At 0.9 the card inherited a tenth of the page's tint
    // and came out #fbfcfc, which is a pastel card on a pastel ground: the two
    // surfaces read as one wash and the whole composition this is for — WHITE
    // cards floating on a tinted ground — stops happening.
    //
    // It also cost the trend line real room. The five line colours are solved at
    // 4.5:1 off the card, and a card two levels darker pushed the light green
    // and gold to 0.0899 of OKLab separation against a floor of 0.09. At 0.95
    // the card is #fdfdfe and they are 0.0906.
    50: -0.95, 100: -0.75, 200: -0.55, 300: -0.35, 400: -0.15,
    500: 0, 600: 0.2, 700: 0.4, 800: 0.6, 900: 0.8,
  };
  const scale: Record<number, string> = {};
  for (const [step, t] of Object.entries(steps)) {
    if (t === 0) scale[Number(step)] = baseHex;
    else if (t < 0) scale[Number(step)] = mix(baseHex, brand.white, -t);
    else scale[Number(step)] = mix(baseHex, brand.espresso, t);
  }
  return scale;
}

/**
 * THE LIGHT THEME'S FAMILIES. `cream` and `taupe` are built from `lightNeutral`
 * rather than from `brand` — see the note there: those two brand hexes are the
 * DARK theme's seeds and do not move when light mode is redesigned. The accent
 * and the ink are shared with dark on purpose and are built from `brand`.
 */
/**
 * ── LIGHT IS A WARM GROUND WITH A COOL PASTEL ON IT (Aug 2026, second pass) ─
 *
 * THE COMPLAINT, TWICE: light mode reads as a flat grey wash. The first pass
 * answered it by tinting the PAGE with the teal accent — `mix('#F1F3F6',
 * accent.teal, 0.15)`, which resolves to #d3dfe3 — and that is the whole reason
 * it came back. **Mixing a dark, low-chroma teal into a cool near-white
 * produces a blue-grey**, so the page carried a cast rather than a colour, and
 * the ink over it was the only warm thing on the screen. A page whose OKLab
 * chroma is 0.012 is a grey however it was arrived at.
 *
 * ── SO THE GROUND IS WARM AND THE COLOUR IS SOMEWHERE ELSE ────────────────
 *
 * Two surfaces rather than one, and they lean in opposite directions:
 *
 *   `surface`  THE PAGE. A soft warm off-white — an ivory, r > g > b, no accent
 *              mixed into it at all. It is not grey because there is nothing
 *              cool in it, and it is not brown because it sits within a few
 *              percent of white.
 *   `pastel`   THE SECONDARY TINT. Every SECTION ground, every pane and the
 *              sidebar. This is where the colour lives, and it is a genuine
 *              pastel rather than a wash: built at the teal's own hue angle at a
 *              stated saturation and lightness (`reHsl`) rather than by mixing
 *              the dark accent into white, which is exactly the operation that
 *              produced a grey last time.
 *
 * A warm ground under cool panes is the composition; one tone flooded across
 * everything was the problem.
 *
 * ── THE PASTEL IS THE SANCTIONED ACCENT'S HUE, NOT A NEW ONE ──────────────
 *
 * `accent.teal` (#2A6C74) is already in the palette and already passes the one
 * rule that matters: blue is never strictly its lowest channel, so it cannot be
 * mistaken for a STATE at any tint or shade. AMBER is still refused outright —
 * it lands between bronze and the status gold, so a surface tinted with it is
 * the hue of ABOVE RANGE at a lower saturation. SLATE sits about 20° from the
 * accent, so a slate pane under a slate accent reads as one wash. Teal is 130°
 * off the accent: the accent stays the only thing on the page that looks like a
 * decision, and the pastel reads as a ground.
 *
 * ── AND THE INK IS WARM, IN LIGHT ONLY ────────────────────────────────────
 *
 * #1A1714 is r > g > b and near-black: warm on inspection, black at a glance.
 * ⚠ It is LIGHT'S OWN and `brand.espresso` is untouched, because that one seeds
 * `nightBase` and every dark surface derived from it — warming it would be a
 * dark-mode change wearing a light-mode label.
 *
 * ── FOUR NUMBERS, AND EVERYTHING ELSE FOLLOWS THEM ────────────────────────
 *
 * The base, the pastel's saturation and lightness, and how far the hairline
 * sits toward the ink. Change any one and the page, the card, the panel, the
 * panes, the hairline, the hover states and the chart furniture all move with
 * it — which is what makes this tunable by eye afterwards rather than a set of
 * hexes somebody has to keep in step by hand.
 *
 * ⚠ THE HAIRLINE IS DELIBERATELY SOFTER THAN IT WAS (0.045 → 0.075 off a much
 * lighter base, which is a QUIETER line in absolute terms — see `--c-taupe`
 * measured against the new page). The brief is separation from shadow and glass
 * rather than from hard grey rules, and a border is the one thing that cannot
 * be softened without measuring, because `--c-panel-edge` is derived from it
 * and is the whole of the sidebar's separation where the light does not reach.
 */
const LIGHT_BASE = '#F3EADF';
const LIGHT_PASTEL_SATURATION = 0.45;
const LIGHT_PASTEL_LIGHTNESS = 0.92;
/**
 * How far below the pastel the navigation rail sits. Swept rather than picked:
 * the window is narrow at both ends and both ends are asserted — under about
 * 0.09 the rail fails the 1.08:1 floor off the page, and past about 0.14 it
 * overtakes the CARD's own step off the page, at which point the rail has
 * climbed past a card and the page → panel → card ladder is inverted.
 */
const LIGHT_RAIL_DROP = 0.115;
const LIGHT_HAIRLINE = 0.075;

export const lightNeutral = {
  /** The light page: a soft warm off-white, and the base of the whole light surface family. */
  surface: LIGHT_BASE,
  /**
   * The secondary register — section grounds, every pane, the sidebar rail.
   * Built at the accent's HUE rather than mixed from it: mixing a dark teal into
   * a near-white is what produced a blue-grey page in the first pass, and no
   * amount of it produces a pastel.
   */
  pastel: reHsl(accent.teal, LIGHT_PASTEL_SATURATION, LIGHT_PASTEL_LIGHTNESS),
  /**
   * The navigation rail: the SAME pastel a few steps down, so the column and
   * the panes read as one register.
   *
   * ⚠ A STEP DOWN IN LIGHTNESS, NOT A MIX TOWARD THE INK. Both put the rail
   * below the page, which is the claim the ladder makes; only one of them keeps
   * it a colour. The ink is warm and the pastel is cool, so mixing them cancels
   * — measured on a screenshot, the rail rendered as the blue-grey this whole
   * pass exists to get rid of, and it was the largest single surface still doing
   * it. Dropping the lightness at the same hue and saturation cannot desaturate
   * anything.
   */
  rail: reHsl(accent.teal, LIGHT_PASTEL_SATURATION, LIGHT_PASTEL_LIGHTNESS - LIGHT_RAIL_DROP),
  /** Type and structural accents in light. Warm near-black, never grey. */
  ink: '#1A1714',
  /**
   * Every hairline and divider in light. The page carried toward the ink rather
   * than a grey of its own, so a hairline on a warm ground is that ground a few
   * steps down instead of a foreign colour drawn across it.
   */
  border: mix(LIGHT_BASE, '#1A1714', LIGHT_HAIRLINE),
} as const;

export const scales = {
  bronze: buildScale(brand.bronze),
  // ⚠ LIGHT'S INK IS `lightNeutral.ink`, NOT `brand.espresso`. The brand one
  // seeds `nightBase` and every dark surface derived from it; this family is
  // type and structural accents in LIGHT, and it is a warm near-black.
  espresso: buildScale(lightNeutral.ink),
  cream: buildScale(lightNeutral.surface),
  taupe: buildScale(lightNeutral.border),
} as const;

/**
 * The two accents on the same ladder every brand hue is on — tints toward
 * white, shades toward espresso.
 *
 * Toward ESPRESSO and not toward black, exactly as the brand families are: a
 * teal shaded toward black is a cold slate and stops belonging to this palette
 * the moment it is put next to a card. Shading it toward the product's own
 * darkest warm tone is what keeps a dark teal a member of the family.
 */
export const accentScales = {
  teal: buildScale(accent.teal),
  slate: buildScale(accent.slate),
} as const;

/**
 * A deeper-than-espresso tone for large dark surfaces (e.g. a split-panel
 * login background) — mixed a controlled 32% toward true black, same
 * derivation method as the tint/shade scales above. Deliberately NOT
 * '#000000': the brand rules forbid pure black anywhere, so this stays a
 * warm, dark espresso rather than a neutral black. Large dark surfaces
 * only — never body text (espresso itself already covers that).
 */
export const ink = mix(brand.espresso, '#000000', 0.32);

/**
 * A handful of ink shades for dark-surface chrome (headers, hero panels,
 * dark nav) that needs more than one dark tone to read as layered rather
 * than flat — a border or hover state on a dark panel can't borrow the
 * light-surface `taupe`/`cream-200` tokens, they'd disappear or clash.
 * `border` sits between `ink` and `cream` for hairline dividers on dark
 * surfaces; `hover` and `deep` mix further toward black for interactive
 * states and the darkest gradient stop, same "never pure black" rule as
 * `ink` itself.
 */
export const inkScale = {
  DEFAULT: ink,
  border: mix(ink, brand.cream, 0.22),
  hover: mix(ink, '#000000', 0.18),
  deep: mix(ink, '#000000', 0.4),
} as const;

// ---------------------------------------------------------------------------
// The traffic-light hues.
//
// Three hues carry the five states, plus TWO HINGES that are never states:
//
//   significantLow / significantHigh → RED
//   low            / high            → YELLOW
//   inRange                          → GREEN
//   OLIVE is the transition between green and yellow, drawn at a REFERENCE
//          BOUND. ORANGE is the transition between yellow and red, drawn at a
//          SIGNIFICANTLY-OUT THRESHOLD. Neither is ever a status of its own.
//
// THERE ARE TWO HINGES BECAUSE THERE ARE TWO BOUNDARIES (Aug 2026). Orange was
// on its own for as long as the ramp ran ACROSS a band — yellow at the
// reference bound shading out to orange at the threshold — which put the
// colour change in the middle of a region and a hard edge at the boundary. The
// gradient sits AT each boundary now, centred on it, so a value one unit inside
// the range and one unit outside it are drawn a hair apart rather than in two
// different colours. That needs a colour for the midpoint of green→yellow in
// exactly the way the threshold already had one for yellow→red.
//
// They cannot be derived from a palette with no green/yellow/red in it, so
// they are picked — but picked against two constraints at once, which is what
// keeps them from turning a blood result into a dashboard:
//
//  1. Warm-leaning and low-saturation enough to sit on cream and on the warm
//     near-black browns. Every one of them is pulled off its pure hue toward
//     the bronze/espresso axis; none is a web red, a lemon or a signal green.
//  2. Saturated ENOUGH that a soft wash of it is still unmistakably the colour
//     it is meant to be. The previous tint bases failed this second test: at a
//     12% wash the orange read as beige and the red as pink, which is the cost
//     of colour-coding with none of the benefit.
//
// Everything downstream — washes, bars, chart bands, boundary lines, point
// fills, and the status text colours themselves — is mixed from these four and
// from nothing else, per theme.
// ---------------------------------------------------------------------------

export const statusHue = {
  /** Warm leaf-green. Unmistakably green, never a signal green. */
  green: '#5E8C3A',
  /**
   * The hinge at a REFERENCE BOUND — never a state.
   *
   * The exact RGB midpoint of green and yellow, written out rather than
   * computed so the palette stays a list of hexes somebody can read: (0x5E +
   * 0xEA)/2 = 0xA4, (0x8C + 0xB3)/2 = 0xA0, (0x3A + 0x08)/2 = 0x21. It has to
   * be the midpoint, because the whole claim the gradient makes is that a
   * result sitting exactly on the limit is drawn exactly half in each colour.
   *
   * Recomputed when the yellow was replaced (Aug 2026) — a hinge that is not
   * the midpoint of its own two neighbours is a third colour with a hinge's
   * name on it, which is what drew a chartreuse stripe along a reference bound
   * the last time one was chosen independently.
   */
  olive: '#A7AF36',
  /**
   * ── A CLEAN YELLOW, SET DELIBERATELY (Aug 2026) ──────────────────────────
   *
   * It was #C79A16, and the complaint was that it read as a muddy, dingy
   * mustard — worst where the green transitions into it and the blend olives
   * out. That is two faults and only one of them is the hue.
   *
   * THE HUE: #C79A16 carries 0.1405 of OKLab chroma at 43% HSL lightness, which
   * is a dark gold. Every band fill is bounded by `bandChromaCeiling` — the
   * colourfulness of the brand hue it derives from — so a dull seed puts a
   * ceiling on how clean the band can ever be, and no amount of re-solving the
   * BAND could lift it. #EAB308 is 0.1617: the same 45° gold at nearly full
   * saturation, which is a clean yellow rather than a brown with a yellow name.
   * Blue is still strictly the lowest channel, so the accent-separation rule
   * that keeps a decorative hue from reading as a state is untouched.
   *
   * THE OTHER FAULT IS GEOMETRY AND IT IS FIXED IN `ArcGauge`: the green→gold
   * blend spanned 19% of the arc, so a fifth of the ring was the midpoint of
   * two colours rather than either of them. Narrowing it is what stops the
   * gauge reading green, olive, gold; the hue is what stops the gold reading
   * brown. Neither alone was enough, which is why this had come back twice.
   */
  yellow: '#F5CE3E',
  /** The hinge at a SIGNIFICANTLY-OUT THRESHOLD — never a state. */
  orange: '#C4711F',
  /** Warm brick-red. Unmistakably red, never a web #f00 alert. */
  red: '#B23A28',
} as const;

export type StatusHue = keyof typeof statusHue;

/**
 * The status TEXT/ICON colour, per state.
 *
 * Derived from the hue above by mixing toward espresso until it clears AA for
 * body text on every surface it lands on — the page, a card, an input, and its
 * own wash. That is why the green is a deep leaf rather than the hue itself:
 * `statusHue.green` on cream measures about 3:1, which is fine for a band and
 * not fine for a word.
 *
 * `high` and `low` share a colour and `significantHigh`/`significantLow` share
 * a colour, exactly as before. Direction is carried by the icon and by the
 * word; the hue carries severity only.
 */
function statusTextHex(hue: StatusHue): string {
  // Yellow has by far the highest intrinsic luminance, so it needs the most
  // pulling down to reach 4.5:1 — the amount is per hue rather than one
  // constant, so each lands just past the threshold instead of all three
  // being dragged to the darkest one's level.
  // Olive is carried for completeness — it is a hinge, never a state, so no
  // status label is ever set in it — and it sits between its two neighbours.
  const toward: Record<StatusHue, number> = { green: 0.45, olive: 0.54, yellow: 0.63, orange: 0.49, red: 0.22 };
  return mix(statusHue[hue], brand.espresso, toward[hue]);
}

export const status = {
  inRange: {
    label: 'In range',
    hex: statusTextHex('green'),
    icon: 'dash', // level/dash mark
    hue: 'green' as StatusHue,
    /** Runtime color, theme-aware. Use this anywhere the value is applied to a live element. */
    cssVar: 'rgb(var(--c-status-in-range))',
  },
  high: {
    label: 'Above range',
    hex: statusTextHex('yellow'),
    icon: 'chevron-up',
    hue: 'yellow' as StatusHue,
    cssVar: 'rgb(var(--c-status-high))',
  },
  low: {
    label: 'Below range',
    hex: statusTextHex('yellow'), // same tone as `high`; direction is carried by icon, not colour
    icon: 'chevron-down',
    hue: 'yellow' as StatusHue,
    cssVar: 'rgb(var(--c-status-low))',
  },
  significantHigh: {
    label: 'Significantly above range',
    hex: statusTextHex('red'),
    icon: 'chevron-double-up',
    hue: 'red' as StatusHue,
    cssVar: 'rgb(var(--c-status-significant-high))',
  },
  significantLow: {
    label: 'Significantly below range',
    hex: statusTextHex('red'),
    icon: 'chevron-double-down',
    hue: 'red' as StatusHue,
    cssVar: 'rgb(var(--c-status-significant-low))',
  },
} as const;

export type StatusKey = keyof typeof status;

// ---------------------------------------------------------------------------
// Status TINTS — a deliberate, documented change to the design system.
//
// The system's original rule was "no green, amber or red anywhere". That rule
// was about not turning a person's blood results into a dashboard, and it is
// still the reason everything below is a *wash* rather than a fill. But
// patients arrive expecting traffic-light coding on a blood result, and
// withholding it made the page harder to scan without making it any calmer.
//
// So: five tints, from three hues, on every surface that shows a result — the
// card, the row, the range bar, the chart bands, the sparkline, the counts
// strip, the category bars, and the status word in a tooltip.
//
//   significantLow  → red      significantHigh → red
//   low             → yellow   high            → yellow
//   inRange         → green    (orange = the transition, never a state)
//
// Four rules hold, and the colour is worthless without them:
//
//  1. Colour is the LAST thing that carries status, never the first. The
//     level mark / chevron / doubled chevron and the word ("Above range")
//     are unchanged and still carry the whole meaning in greyscale and to a
//     colourblind reader. Red and green are the most commonly confused pair
//     there is; delete every colour here and nothing is lost. Chart bands
//     therefore carry a boundary line and a written key, never hue alone.
//  2. Surfaces and marks, not body copy. A tinted card keeps its taupe border,
//     its espresso text and its ordinary shadow. The one text that takes a
//     status colour is the status word itself, which is a label for that
//     colour rather than content sitting in it.
//  3. Low-saturation and warm-leaning, but not to the point of beige. See the
//     note on `statusHue`: the wash has to still read as the colour it is.
//  4. Nothing escalates beyond the colour. No pulse, no warning triangle, no
//     red body copy, no "danger"/"healthy" vocabulary anywhere. Someone
//     reading a bad number is not to be frightened by the interface; the
//     out-of-range prompt points calmly at their GP with contact details.
// ---------------------------------------------------------------------------

const STATUS_TINT_HUE: Record<StatusKey, StatusHue> = {
  significantLow: 'red',
  low: 'yellow',
  inRange: 'green',
  high: 'yellow',
  significantHigh: 'red',
};

/**
 * How much of the hue survives, per role. Each is a mix from the surface the
 * thing actually sits on toward the hue, so nothing needs an opacity at the
 * call site and the two themes cannot drift.
 *
 *  · `wash`  — the card/row/tile background. The faintest of them, because it
 *              sits under body text that has to stay comfortably readable; but
 *              raised from the old 12% because at 12% the yellow and red were
 *              indistinguishable from the cream card they replaced.
 *  · `band`  — a chart band. Sits behind a line and points, so it stays calm,
 *              but it is a field of colour with no body text on it and can
 *              carry more hue than the wash.
 *  · `track` — the range-bar track and the category summary bars. A field of
 *              colour with nothing on top at all; at wash strength it would
 *              simply disappear.
 *  · `edge`  — a boundary line, a band's own hairline, the ring on a plotted
 *              point. Nearly the hue itself.
 *  · `mark`  — the fill of a plotted point or a range-bar dot. The one role
 *              NOT mixed from the surface: it sits on a band of its own colour
 *              and would wash into it, so it is the hue itself taken a step
 *              past full strength — deepened in light, lifted in dark. Checked
 *              at 3:1 against its own band by tokenContrast.test.ts, because
 *              "the point disappeared into the band" is a chart that has lost
 *              the shape layer status actually depends on.
 */
const TINT_MIX = {
  wash: 0.21,
  // Eased from 0.28 when the dark page and card were lifted (see nightBase).
  // A wash is a mix from the surface toward the hue, so a lighter surface with
  // the same mix lands lighter — and the status LABEL then has to be dragged
  // most of the way to the text tone to keep AA against its own wash, which
  // costs it the chroma that makes it recognisably green or gold. Giving up
  // two points of wash buys back the label. It still measures ~1.5:1 against
  // the card it replaces, which is a wash you can see across a room.
  washDark: 0.2,
  band: 0.3,
  bandDark: 0.32,
  track: 0.58,
  trackDark: 0.6,
  edge: 0.92,
  edgeDark: 0.82,
} as const;

/**
 * ═══ STATUS IS AN OUTLINE ON A GLASS CARD NOW (Aug 2026) ═══════════════════
 *
 * ── WHAT THIS REPLACED, AND THE TWO RULES IT REVERSES ─────────────────────
 *
 * The marker result card filled its whole surface with the status colour, and
 * that idea was iterated to the end of its rope: a translucent wash first, then
 * an opaque plate, deepened three times. Each round improved the colour and none
 * of them changed the thing that was actually wrong, which is that a grid of 165
 * cards, each a large field of green or gold or red, is a page shouting a
 * summary at somebody who came to read one result.
 *
 * The body is GLASS now, identical whatever the status: the same frosted
 * translucent material, the same backdrop blur, the same specular streak, the
 * same inset hairline as every other pane in the product. The status moves to
 * the BORDER.
 *
 * ⚠ TWO RULES IN CLAUDE.md ARE REVERSED BY THIS AND BOTH ARE WORTH NAMING.
 * "NO COLOURED CARD OUTLINES" was written when an out-of-range card carried a
 * red ring AND a red fill AND a red word, which is one statement made three
 * times in the loudest available register; a single confident outline on an
 * otherwise neutral card is the opposite of that. "A TINTED CARD IS NEVER A
 * PANE" was about a translucent sheet with a moving highlight over a coloured
 * FIELD, where the material and the meaning fight for the same pixels. Neither
 * applies to a neutral pane with a coloured edge.
 *
 * ── THE OUTLINE IS DEEP, AND IT IS SOLVED PER THEME ───────────────────────
 *
 * A border is a thin object, so it needs contrast rather than area. The values
 * are the status hues rendered deep and rich (`OUTLINE_FILL`), and the two
 * themes get their own because the ground is not the same ground: on the light
 * pane a deep colour has 3.3–7.3:1 to spend, and the identical value on the dark
 * pane would be a black line on a near-black card. Dark is LIFTED, per hue, by
 * as much as each needs and no more.
 *
 * ⚠ AND THE FLOOR IS 3:1, WHICH IS A GRAPHICAL FLOOR AND NOT A TEXT ONE. Status
 * is still carried by the gauge arc, the chevron and the word, so the outline is
 * reinforcement rather than the sole carrier, and it answers to WCAG 1.4.11
 * rather than to 1.4.3. `tokenContrast.test.ts` holds every one of them there,
 * against the composited pane in its own theme.
 */
const OUTLINE_SEED: Record<'green' | 'yellow' | 'red', string> = {
  /** A fresh leaf rather than the status green's muted one: an outline is thin and a muted hue reads as grey at 2px. */
  green: '#63C132',
  /**
   * ⚠ AN AMBER AT 40 DEGREES, NOT THE STATUS YELLOW AT 45. Deep is where an
   * outline lives, and a deep 45-degree yellow is an OLIVE while a deep
   * 40-degree one is still an amber. Five degrees is the whole difference
   * between the colour asked for and the colour this file has recorded as the
   * failure five times over.
   */
  yellow: '#E8A317',
  /**
   * `statusHue.red` itself. It is already a warm red at 8 degrees, and deepening
   * it is all "rich" needs here.
   */
  red: statusHue.red,
};

/**
 * How deep each outline is rendered, per theme. Same shape as `BAND_FILL` and
 * for the same reason: one lightness cannot serve three hues, because at any
 * given lightness a green is darker than an amber by a long way.
 */
const OUTLINE_FILL: Record<'light' | 'dark', Record<'green' | 'yellow' | 'red', { saturation: number; lightness: number }>> = {
  light: {
    green: { saturation: 0.78, lightness: 0.27 },
    // The shallowest of the six, and the binding one: past about 0.37 an amber
    // stops clearing 3:1 on the light pane. Everything else has room.
    yellow: { saturation: 0.9, lightness: 0.36 },
    red: { saturation: 0.78, lightness: 0.32 },
  },
  dark: {
    green: { saturation: 0.68, lightness: 0.43 },
    yellow: { saturation: 0.82, lightness: 0.46 },
    // Lifted furthest of the three, because red is the darkest hue in the
    // palette at any given lightness and it is the one that disappears first on
    // a near-black pane. Measured rather than guessed: at 0.46 it is 3.4:1 and
    // at 0.56 it is 4.6:1.
    red: { saturation: 0.66, lightness: 0.56 },
  },
};

/** Which of the three hues each of the five states resolves to. Both golds are one colour by construction. */
const OUTLINE_HUE: Record<StatusKey, 'green' | 'yellow' | 'red'> = {
  inRange: 'green',
  high: 'yellow',
  low: 'yellow',
  significantHigh: 'red',
  significantLow: 'red',
};

/** The outline for a hue in one theme: its seed's own angle at that theme's stated depth. */
function statusOutline(mode: 'light' | 'dark', hue: 'green' | 'yellow' | 'red'): string {
  const fill = OUTLINE_FILL[mode][hue];
  return reHsl(OUTLINE_SEED[hue], fill.saturation, fill.lightness);
}

/**
 * ── THE WEIGHT, AND IT IS ONE NUMBER FOR EVERY SURFACE THAT TAKES ONE ─────
 *
 * A hairline reads as the card's ordinary border and says nothing; a slab reads
 * as a filled alert with a hole in it. 2px is the weight at which a border is
 * plainly a decision, and it is the SAME on every card and on the strip, so the
 * two read as one system rather than as two things that happen to be outlined.
 *
 * A length rather than a colour, so it is emitted by tailwind.config.ts beside
 * the other non-colour theme values rather than through `themeCssVars`.
 */
export const STATUS_OUTLINE_WIDTH = '2px';

/**
 * The point fill, per hue, as a distance from the hue itself — toward espresso
 * in light and toward the theme's text tone in dark.
 *
 * Per hue rather than one constant for the same reason `statusTextHex` is:
 * yellow starts far brighter than the others, so a single value that made
 * yellow legible on its own band would drag green and red into mud.
 *
 * RE-SOLVED WITH THE OPAQUE BANDS (Aug 2026), and every value went up. A mark
 * stands on its own state's band and has to clear 3:1 against it; the bands
 * are painted now rather than composited at 15–40%, so each one is between a
 * third and a half again as far from the surface as it was, and the mark has to
 * step further off the hue to stay visible on it. Solved per hue for the
 * SMALLEST shift clearing 3.2:1 — every step past that is chroma spent for
 * nothing — and green is solved against the OPTIMAL fill as well as its own
 * band, since an in-range point can land inside the narrowing.
 *
 * The cost is real and is recorded rather than hidden: light's gold mark is
 * #6b592c and its amber #6f4f2e, which are dark warm browns rather than the
 * gold and amber they were. Status is still carried by the mark's SHAPE, by the
 * word in the tooltip and by the word in the key; the mark's own colour has
 * never been the thing that says it, and a mark that has vanished into its band
 * loses the shape layer, which is the thing that does.
 */
/**
 * ═══ THE COLOURS THE TREND LINE IS DRAWN IN — AND THE POINT MARKS WITH IT
 *     (re-derived Aug 2026) ═══════════════════════════════════════════════
 *
 * WHAT THIS ROLE IS FOR NOW. It used to be only the point marks: five glyphs
 * on a plot, each standing on the band of its own hue. The LINE is drawn in
 * these too since the status moved onto it, gradiented along its own length —
 * so a gold segment crosses the GREEN band on its way up to an out-of-range
 * result, and every one of the five has to clear every one of the five plus the
 * optimal narrowing. Measured against the old heavy bands the worst pair was
 * **1.10:1**, which is what forced the bands down to context weight.
 *
 * ── AND IT IS SOLVED NOW, NOT MIXED ───────────────────────────────────────
 *
 * This was `MARK_SHIFT` / `MARK_SHIFT_DARK`: the hue MIXED TOWARD the theme's
 * text tone by an amount per hue. That is fine for nudging a glyph clear of its
 * own band and hopeless for a line that has to READ as green, then gold, then
 * red — because mixing toward a brown-grey darkens and DESATURATES at once, so
 * every step taken to clear a band was paid for in the colour that was the
 * whole point. It showed: light's green and gold came out #567639 and #836a26,
 * two dark khakis ΔE 0.070 apart, which on a 4px line is one colour.
 *
 * It is solved exactly as `BAND_FILL` is, and that is the point — one
 * derivation for both, differing only in what they are solved TO:
 *
 *   · the HUE ANGLE is the brand hue's own and is never touched;
 *   · the LIGHTNESS is solved so the colour clears 3:1 on every band;
 *   · the SATURATION is taken to the hue's chroma ceiling.
 *
 * THE CEILING IS THE SAME ONE, AND THAT IS THE ORDERING MADE ARITHMETIC. A band
 * takes `BAND_CHROMA_SHARE` (0.6) of `bandChromaCeiling`; the line takes ALL of
 * it. So the line is 1.67× the band's colourfulness by construction rather than
 * by luck, and it is still inside the palette by the palette's own definition —
 * a green as chromatic as `statusHue.green` cannot be out of it, because that
 * IS the palette's green. Solved with the saturation free instead, dark came
 * out #74ff00 and #ffff00: a highlighter green beside a pure yellow, which is
 * the "signal green and web red" failure this ceiling exists to prevent.
 *
 * Measured, before → after, in OKLab chroma and in the separation between the
 * three states (the number that decides whether a reader can tell the segments
 * apart at all):
 *
 *     light   chroma 0.096 0.091 0.159  →  0.124 0.110 0.159
 *             ΔE green|gold 0.070 → 0.145,  gold|red 0.134 → 0.131
 *     dark    chroma 0.100 0.137 0.104  →  0.124 0.140 0.159
 *             ΔE green|gold 0.118 → 0.128,  gold|red 0.143 → 0.144
 *
 * THE TWO HINGES ARE MIDPOINTS, exactly as the band hinges are: olive is the
 * RGB midpoint of the solved green and gold, orange of the gold and red. A
 * hinge is where the line crosses a boundary, so it has to be half of each on
 * the same terms the bands use — and solving one independently is what once
 * drew a chartreuse stripe down the middle of a blend.
 *
 * `toward: 'ground'` is gone with the mixing, and with it the one hue that had
 * to step the other way. Dark's gold could not step toward the text tone while
 * the out-of-range band was lifted off the ladder to 4.45; that band is back on
 * the ladder and no direction-per-hue is needed by anything.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE BANDS ARE GONE FROM THE TREND CHART, AND THE LINE IS THE WHOLE CHART
 *  (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Everything above this — `BAND_FILL`, `BAND_CHROMA_SHARE`, `bandChromaCeiling`,
 * `PLOT_SURFACE`, `bandRampStops` in statusBands.ts — is still live and still
 * correct. It now serves ONE instrument: the range bars. A bar has no line to
 * carry colour along, so its five painted segments ARE the traffic light, and
 * nothing about them changes.
 *
 * THE TREND CHART HAS NO FILLED REGIONS AT ALL. No band rects, no ramp
 * gradients, no optimal narrowing drawn as a shape, no plot panel: the chart is
 * a line, four boundary hairlines with their values on the axis, the points,
 * the axis and the unit, drawn straight onto the card.
 *
 * ── WHAT THAT FREES, AND IT IS THE WHOLE ARGUMENT ──────────────────────────
 *
 * Every previous solve of the line's colour was a solve against the BANDS. The
 * line had to clear five painted regions at AA-large, and each of those regions
 * had a luminance fixed by its own rung of the ladder, so the line's lightness
 * was decided by whichever band it happened to cross. That is what produced
 * #ffebdf (a white line with a rumour of warmth) on the near-black plot, and
 * #265600 / #604800 / #941a08 (three very dark browns) on the light one. Both
 * are recorded above, and both were correct answers to a constraint that has
 * just been deleted.
 *
 * With nothing behind it the line answers to ONE surface — the card — and it
 * can sit at whatever lightness holds the most colour there.
 *
 * ── SOLVED, NOT PICKED, AND PER THEME AGAIN ────────────────────────────────
 *
 * The objective is one sentence: **the most colourful version of this brand hue
 * that stands `LINE_FILL_TARGET`:1 off this theme's card**, bounded by
 * `bandChromaCeiling` so a "more emphatic" green can never become a signal
 * green. Where several (lightness, saturation) pairs reach the ceiling, the one
 * closest to the target wins — see `CHROMA_TIE` for why that tie-break is
 * bucketed rather than exact, and for what it produced when it was not.
 *
 * THE TARGET IS 4.5, WHICH IS NOT THE REQUIREMENT. A 5px line is a graphical
 * object and AA-large (3:1) is what it must clear. It is solved to AA for TEXT
 * instead, in both themes, because the line is now the only thing on the chart
 * carrying status and "just legible" is the wrong bar for it. The requirement
 * is the floor and this is where it sits; `tokenContrast.test.ts` asserts the
 * floor.
 *
 * PER THEME, and that is a return rather than a regression: a light card wants
 * a dark line and a near-black card wants a light one, and the single-record
 * era above only existed because both themes drew on one light plot. There is
 * no plot now.
 *
 * MEASURED — the five hues, contrast off the card:
 *
 *     light   #507e2c 4.69   #727719 4.68   #936f06 4.53   #aa5c1e 4.80   #c14836 4.82
 *     dark    #73a14f 4.91   #999828 4.87   #bf8f00 5.06   #d27c2b 4.71   #e46956 4.57
 *
 * ── THE ONE HUE THAT CANNOT WIN, AND IT IS THE SAME ONE AS ALWAYS ──────────
 *
 * On the LIGHT card the line has to be dark to clear 4.5:1, and a dark yellow
 * is a brown in any colour space. That fact is recorded three times in this
 * file already, from three different grounds, and it arrives here for a fourth:
 * light's gold lands at #936f06, which is a deep amber rather than the gold it
 * is in dark. Green and red are unambiguous in both themes. Nothing is done
 * about it, because the only lever is to stop clearing contrast.
 */
const LINE_FILL_TARGET = 4.5;

/**
 * The most chromatic rendering of `hue` that stands `target`:1 off `surface`,
 * with its OKLab chroma bounded by `ceiling`.
 *
 * A grid search rather than an inversion, because there is no closed form: HSL
 * saturation and lightness both move luminance AND chroma, and the boundary of
 * the sRGB gamut is what limits the answer. ~10,000 evaluations per hue, run
 * once at module load for three hues in two themes.
 *
 * Ties on chroma go to the SMALLEST ratio that still clears the target: past
 * the target every further step is lightness spent walking the hue toward black
 * or white, which costs colour and buys nothing anybody can see.
 */
/**
 * HOW CLOSE TWO CHROMAS COUNT AS THE SAME, and this constant is the whole
 * difference between a solve and a lottery.
 *
 * The first version of this took the single highest chroma and tie-broke on
 * contrast at 1e-6, which is far below the noise a 0.02 saturation step
 * produces — so the tie-break never fired once, and dark's green came back as
 * **#c9faa3 at 12.52:1**: a pale mint that happened to score 0.12349 against a
 * mid green's 0.12347. Two colours nobody could tell apart on the measure being
 * optimised, and the wrong one chosen every time.
 *
 * 0.002 of OKLab chroma is about a fiftieth of the distance between the
 * palette's green and its red — below the threshold of "these are different
 * colours" and comfortably above the grid's own noise. Inside that band the
 * CONTRAST tie-break decides, which is the answer that was wanted.
 */
const CHROMA_TIE = 0.002;

function solveAgainst(hue: string, surfaces: string[], target: number, ceiling: number): string {
  const candidates: { hex: string; chroma: number; ratio: number }[] = [];
  for (let lightness = 0.04; lightness <= 0.96001; lightness += 0.005) {
    for (let saturation = 0.2; saturation <= 1.00001; saturation += 0.02) {
      const hex = reHsl(hue, Math.min(1, saturation), lightness);
      // The WORST of the surfaces it can land on — a colour that clears the
      // page and fails on its own wash has not cleared anything.
      const ratio = surfaces.reduce((worst, s) => Math.min(worst, contrastRatio(hex, s)), Infinity);
      if (ratio < target) continue;
      const chroma = okChroma(hex);
      if (chroma > ceiling) continue;
      candidates.push({ hex, chroma, ratio });
    }
  }
  // Unreachable for any real surface — a hue that cannot clear the target at
  // ANY lightness does not exist — but a colour is required and a silent
  // `undefined` in an SVG stroke renders black. See the warning on tintSet.
  if (candidates.length === 0) return hue;
  const mostChromatic = Math.max(...candidates.map((c) => c.chroma));
  // TWO PASSES, not one comparison. Everything within CHROMA_TIE of the best is
  // as colourful as the best; among those the smallest ratio that still clears
  // the target wins, because past the target every further step is lightness
  // spent walking the hue toward black or white.
  return candidates
    .filter((c) => c.chroma >= mostChromatic - CHROMA_TIE)
    .reduce((best, c) => (c.ratio < best.ratio ? c : best)).hex;
}

/**
 * A NEUTRAL AT A TARGET CONTRAST — the hue's OWN saturation, and the lightness
 * that lands nearest the ratio asked for.
 *
 * A different objective from `solveAgainst` and a separate function for that
 * reason. A boundary hairline is furniture: it is wanted at a specific weight
 * against the card, and "as colourful as taupe will go" is not a question
 * anybody asked of it. Solved with the max-chroma objective it came back
 * **#140c01 at 18.89:1** — a near-black rule, three times the weight of the
 * line it is meant to sit behind.
 */
function solveNeutral(hue: string, surface: string, target: number): string {
  let best: { hex: string; miss: number } | null = null;
  const saturation = ownSaturation(hue);
  for (let lightness = 0.02; lightness <= 0.98001; lightness += 0.002) {
    const hex = reHsl(hue, saturation, lightness);
    const miss = Math.abs(contrastRatio(hex, surface) - target);
    if (!best || miss < best.miss) best = { hex, miss };
  }
  return best?.hex ?? hue;
}

/**
 * WHAT WAS HERE. `MARK_FILL` — three hand-solved (saturation, lightness) pairs
 * producing #265600 / #604800 / #941a08, solved to clear five painted bands on
 * a light plot. The bands are gone from the chart, the plot is gone with them,
 * and the numbers were only ever true of that constraint. `solveAgainst` above
 * replaces it and is solved per theme against the card.
 */

/**
 * How far each hue is lifted toward the theme's text tone before anything in
 * dark is derived from it.
 *
 * Small, and smaller than it used to be (it was a flat 0.34). A lift toward a
 * near-white desaturates, and on a near-black page the hue does not need much
 * of one to be visible — what it needs is to stay chromatic. Yellow gets the
 * least because it starts brightest; red gets the most because a brick red is
 * the darkest of the four and the one most at risk of disappearing.
 */
const DARK_HUE_LIFT: Record<StatusHue, number> = { green: 0.2, olive: 0.15, yellow: 0.1, orange: 0.14, red: 0.26 };

/**
 * The strength of a dark FILL — the fraction of the lifted hue that survives
 * against black — per role and then per hue.
 *
 * Per role: a band sits behind data and stays calm; a track has nothing on it
 * at all and can carry far more; an edge is nearly the hue itself.
 *
 * Per hue: the multiplier corrects for the fact that the four hues do not
 * start at the same luminance. Yellow at the same fraction as green is a
 * headlight; red at the same fraction as yellow is a smear. These are the
 * numbers at which the three read as green, gold and red side by side on
 * #110F0D, checked by tokenContrast.test.ts for separation and for the point
 * mark still standing off its own band.
 */
const DARK_FILL = { band: 0.46, track: 0.78, edge: 0.94 } as const;
// ── YELLOW 0.82 → 0.7 AND OLIVE 0.9 → 0.8 (Aug 2026) ───────────────────────
// A per-hue multiplier corrects for the four hues not starting at the same
// luminance, and two of them started somewhere else when the status yellow went
// to a clean #F5CE3E and the olive hinge followed it. Both are LIGHTER now, so
// their dark KEY SWATCHES came up with them and the boundary hairline drawn
// across each fell under its 1.3:1 floor — 1.19 on yellow, 1.29 on olive. That
// is a boundary you cannot see, on the one surface where a boundary has to
// survive greyscale. 0.7 and 0.8 put them at 1.43 and 1.48.
//
// ⚠ THIS IS THE 18×12 KEY SWATCH IN MultiTrendChart AND NOTHING ELSE. The GAUGE
// paints `--c-hue-*-fill`, which is the hue itself and carries no multiplier —
// see BAND_FILL. A change here cannot darken the arc.
const DARK_FILL_HUE: Record<StatusHue, number> = { green: 1, olive: 0.8, yellow: 0.7, orange: 0.9, red: 1.08 };

/**
 * ---------------------------------------------------------------------------
 * THE `fill` ROLE — A BAND IS PAINTED NOW, NOT COMPOSITED (Aug 2026).
 * ---------------------------------------------------------------------------
 *
 * This role was called `plot` and was "the hue as the browser should composite
 * it", drawn at 15% / 28% / 40% over whatever was underneath. That is what made
 * the bands read washed out, and no amount of re-solving the hue could fix it,
 * because the failure was structural rather than chromatic: **the chroma of a
 * composited band is very nearly `weight × chroma(hue)`**, so at 15% the
 * in-range band could carry at most 15% of any colour that exists. Three
 * separate re-solves of this record are recorded in the git history, each
 * chasing "the bands are muddy" round the same ceiling. The ceiling was the
 * alpha.
 *
 * A band is now a SOLID FILL. No alpha anywhere in the chain: the rect is
 * opaque, the gradient stops are opaque, and nothing behind a band shows
 * through it. The weight ladder did not go away — it moved from the alpha into
 * the colour, which is what `BAND_CONTRAST` (statusBands.ts) states and what
 * this record solves for.
 *
 * WHAT IS FREE NOW AND WHAT IS NOT. Chroma is free: an opaque fill can be as
 * saturated as it likes, which is why every band roughly doubled its colour
 * without moving a single rung of the ladder. Saturation is therefore the thing
 * that has to be held DOWN rather than pushed up — an unconstrained solve for
 * maximum chroma returns #66e900 and #ff7c68, a highlighter green and a neon
 * salmon, which are correct answers to the wrong question.
 *
 * ── THE CAP IS PER HUE NOW, AND IT IS SOLVED (Aug 2026) ────────────────────
 *
 * It was ONE saturation cap, `BAND_FILL_SAT_CAP = 0.6`, applied to all three:
 * green kept its own 41% (under the cap, so untouched), gold and red were both
 * pulled to 60%. The complaint that produced this rewrite was that red read as
 * red while green read as olive and gold as brown, and the cause is exactly
 * that one number.
 *
 * A SINGLE CAP CANNOT WORK, because HSL saturation is a RATIO and the three
 * hues sit at very different lightnesses — the ladder puts them there on
 * purpose. Measured, at the old numbers, in OKLab chroma (how colourful a thing
 * actually looks):
 *
 *     light   green 0.0915   gold 0.1242   red 0.1037     spread 36%
 *     dark    green 0.0696   gold 0.0727   red 0.1412     spread 103%
 *
 * So one cap flattered gold in light and red in dark and starved green in both.
 * "Green has less headroom at its lightness than red does" is a fact about the
 * sRGB gamut, and a cap that ignores it is a cap that hits one hue and misses
 * the others.
 *
 * WHAT IT IS SOLVED AGAINST. Each hue is given as much chroma as it can carry
 * at the lightness its own rung puts it at, bounded by `bandChromaCeiling` —
 * the colourfulness of the BRAND HUE it derives from. A green band as chromatic
 * as `statusHue.green` cannot be out of the palette, because that IS the
 * palette's green; one more chromatic than it has left. So the bound is per hue
 * by construction and is not a number anybody chose. Both the saturation and
 * the lightness are then solved together, since changing one moves the other's
 * contrast.
 *
 * MEASURED AFTER, same units:
 *
 *     light   green 0.1234   gold 0.1407   red 0.1341     spread 14%
 *     dark    green 0.0985   gold 0.0812   red 0.1593     spread 96%
 *
 * Every band gained: green +35% / +42%, gold +13% / +11%, red +29% / +13%. In
 * light the three are now within 14% of each other, which is what "comparable
 * intensity" looks like as a number.
 *
 * DARK'S GOLD IS THE ONE THAT IS STILL SHORT, and the reason is worth writing
 * down so nobody re-solves it hoping for a different answer. The rungs are
 * contrast ratios against a near-black surface, so a dark band's LUMINANCE is
 * fixed low by the ladder: gold's rung of 1.88 puts it at 21% lightness, and a
 * yellow at 21% lightness is a brown in any colour space, because that is what
 * a dark yellow is. Its 0.0812 is the most sRGB will hold there. Lifting the
 * whole ladder ~30% buys gold 0.0937 and costs the chart the thing the ladder
 * is for — the bands are context and the line is content — so it was measured
 * and not taken.
 *
 * ── WHICH SURFACE THE LADDER IS MEASURED AGAINST, AND WHY IT IS BOTH ────────
 *
 * One fill is drawn on two surfaces: the chart's plot panel and the card a
 * range bar sits on. Those two are not the same distance apart in the two
 * themes — light's plot is a step DOWN from its card and dark's plot is a step
 * down from its card as well, which pushes a light (darker) band closer to the
 * plot and a dark (lighter) band further from it. Measured: solving the ladder
 * against the card alone leaves the CHART's bands 33% apart between themes;
 * solving it against the plot alone leaves the RANGE BAR's 30% apart. Neither
 * instrument is the junior one.
 *
 * So the ladder is the GEOMETRIC MEAN of the two contrasts, which splits the
 * difference exactly: both instruments land within 16% across the two themes,
 * inside the 20% tolerance tokenContrast.test.ts has always held bands to.
 *
 * Measured, at these values — contrast off the card / off the plot panel:
 *
 *     light   green 1.62 / 1.39   gold 2.04 / 1.74   red 2.49 / 2.12
 *     dark    green 1.41 / 1.59   gold 1.78 / 2.01   red 2.16 / 2.44
 *
 * and CHROMA, as the composited band was → as the painted fill is:
 *
 *     light   green 0.114 → 0.243   gold 0.200 → 0.776   red 0.400 → 0.396
 *     dark    green 0.125 → 0.157   gold 0.224 → 0.333   red 0.337 → 0.490
 *
 * ── THE THREE THINGS THAT MOVE WITH IT ─────────────────────────────────────
 *
 * BAND_FILL, LINE_LIFT AND MARK_SHIFT ARE ONE DECISION, exactly as PLOT_LIFT,
 * BAND_WEIGHT and MARK_SHIFT were. A stronger band is closer to the trend line
 * and closer to the point mark standing on it, and both have to move away from
 * it — the line by getting brighter (never the band by getting duller: the line
 * is the content and the bands are the context, and that ordering is a fact
 * about the chart rather than about how much ink is on it), the mark by taking
 * a bigger step off its own hue. Change any rung of `BAND_CONTRAST` and all
 * three are solved again.
 *
 * ── THE TWO HINGES ARE NOT SOLVED, THEY ARE MIDPOINTS ──────────────────────
 *
 * Only the three STATES are solved. Olive and orange are the exact RGB midpoint
 * of the two fills either side of them, computed where they are drawn rather
 * than taken from `statusHue`, and that is the whole claim a boundary blend
 * makes: a result sitting exactly on the limit is drawn exactly half in each.
 * Solving a hinge independently broke it — `statusHue.olive` is 57% saturated
 * against green's 41%, so an independently-solved olive came out MORE chromatic
 * than either neighbour and drew a bright chartreuse stripe along the reference
 * bound, which is the opposite of a blend.
 */
interface BandFill {
  /** Solved per hue against `bandChromaCeiling`, never one shared cap. */
  saturation: number;
  /** Solved so the fill lands on its own rung of BAND_CONTRAST. */
  lightness: number;
}

/**
 * ═══ SOLVED AGAIN, MUCH QUIETER, BECAUSE THE LINE CARRIES THE STATUS NOW
 *     (Aug 2026) ══════════════════════════════════════════════════════════
 *
 * Everything about HOW these are derived is unchanged — hue angle untouched,
 * lightness solved to the rung, saturation taken to the hue's own palette
 * chroma ceiling. Only the rung moved, and it moved a long way down.
 *
 * WHAT THE BANDS ARE FOR CHANGED. The trend line used to be one bronze stroke
 * and the bands were how a reader knew where a value sat, so they carried the
 * whole traffic light and were solved to be seen. The line is drawn in the
 * status hues now, gradiented along its own length, so it says green, gold and
 * red by itself — and the bands' job drops to the one thing the line cannot do:
 * show WHERE the regions are. That is context, and context should be quiet.
 *
 * Measured, contrast off the plot panel:
 *
 *     light   1.39 1.58 1.74 1.94 2.12   →   1.14 1.21 1.27 1.35 1.42
 *     dark    1.59 2.74 4.74 3.29 2.44   →   1.32 1.37 1.47 1.47 1.64
 *
 * Dark is the dramatic one and it is the point: its out-of-range band stood
 * **4.74** off the plot while the line cleared it at 3.05, so THE BAND WAS
 * LOUDER THAN THE LINE — the ordering the whole design rests on, inverted, in
 * the theme most people read in. The line-to-loudest-band lead goes from 0.64x
 * to 1.84x there and 1.58x to 2.11x in light.
 *
 * WHAT IS NOT LOST. The five regions stay tellable apart, and the measure for
 * that is perceptual distance rather than contrast ratio: contrast only sees
 * luminance, and a gold beside an orange at the same luminance measures 1.00:1
 * and is obviously two colours. Green-to-gold and gold-to-red in OKLab ΔE:
 * light 0.113/0.141 → 0.097/0.129, dark 0.290/0.194 → 0.077/0.132. And the
 * faintest band still stands ΔE 0.127 (light) / 0.118 (dark) off the plot
 * ground, which is a region of colour rather than a suggestion of one — the
 * 1.14:1 ratio undersells it badly because most of that difference is HUE.
 *
 * ── AND THE REAL FAULT WAS CHROMA, NOT LUMINANCE ──────────────────────────
 *
 * Solved on the rung alone, the bands came out PALE BUT VIVID — light pastels
 * at very nearly the brand hues' own colourfulness. Put side by side with the
 * line the measurement was embarrassing: the green band carried 0.123 of chroma
 * against the green LINE's 0.096. **The context was more colourful than the
 * content**, which is the same inversion the rung was lowered to fix, surviving
 * in the one dimension nobody had looked at.
 *
 * So a band takes a SHARE of `bandChromaCeiling` rather than all of it —
 * `BAND_CHROMA_SHARE`, 0.6 — and the ordering is now true in both dimensions at
 * once. Per hue, band against the line drawn in that same hue:
 *
 *     light   band 0.073 0.075 0.084 0.075 0.091
 *             line 0.096 0.088 0.091 0.104 0.159
 *     dark    band 0.072 0.066 0.070 0.074 0.094
 *             line 0.100 0.115 0.137 0.123 0.104
 *
 * The ceiling itself is untouched and still does its original job: it is the
 * bound the share is a share OF, so a band can never be more colourful than its
 * own brand hue however the share is set. What stops "quieter" becoming "grey"
 * is now the share being asserted rather than the ceiling being reached —
 * tokenContrast.test.ts holds each fill at its allotted share and holds every
 * band strictly less chromatic than the line of the same hue.
 */
const BAND_FILL: Record<'green' | 'yellow' | 'red' | 'optimal', BandFill> = {
  // ONE RECORD, NOT TWO. The plot is the same warm off-white in both themes
  // (PLOT_SURFACE), and both instruments — the chart and the range bars — draw
  // their bands on it, so there is one ground and therefore one answer. The
  // "geometric mean of the card and the plot" that used to be needed here is
  // gone with the second surface it was averaging over.
  //
  // The hue angle is the brand hue's own and is never touched. The lightness is
  // solved to the rung (BAND_CONTRAST) against PLOT_SURFACE; the saturation to
  // BAND_CHROMA_SHARE of the palette's own ceiling for that hue.
  green: { saturation: 0.415, lightness: 0.663 }, // #a5cd85, 1.50:1, okC 0.1058
  // ── RE-SOLVED FOR THE CLEAN YELLOW (Aug 2026) ────────────────────────────
  // The rung did not move — 1.85:1 off the plot, so the band sits exactly where
  // it sat in the ladder and the boundary hairline over it is unchanged. What
  // moved is the CHROMA: the seed's ceiling went 0.1405 → 0.1617, so 85% of it
  // is 0.1374 rather than 0.1194, and holding that at the same contrast costs
  // four points of HSL lightness. Measured: #d1aa33, 1.85:1, okC 0.1377 — a 15%
  // gain in colourfulness with no change to where it lands on the ladder.
  yellow: { saturation: 0.902, lightness: 0.602 }, // #f5ce3e, 1.24:1, okC 0.1682
  red: { saturation: 0.75, lightness: 0.678 }, // #ea7f6f, 2.25:1, okC 0.1348
  // The optimal narrowing: the same green, one small step deeper. 1.15:1 off
  // the in-range band — a visible shading-in, nothing like a boundary.
  optimal: { saturation: 0.355, lightness: 0.616 }, // #99c07a, 1.72:1
};

/**
 * ═══ WHY DARK'S YELLOW IS THE ONE BAND OFF ITS RUNG ═══════════════════════
 *
 * `BAND_CONTRAST` puts the out-of-range band 1.88:1 off the surface it is drawn
 * on. Against a near-black plot that fixes its luminance low, and **a yellow at
 * a low luminance is a brown in any colour space** — not because the hue was
 * badly chosen but because that is what a dark yellow is. The previous note
 * here recorded that as a gamut limit and stopped. This is what happens if you
 * do not stop.
 *
 * ── THE MEASUREMENT THAT DECIDES EVERYTHING ───────────────────────────────
 *
 * The most chroma sRGB will hold at hue 88°, by lightness:
 *
 *     okL 0.42   0.084     okL 0.55   0.113     okL 0.65   0.133
 *     okL 0.50   0.102     okL 0.60   0.123     okL 0.70   0.143  ← ceiling
 *
 * So yellow cannot reach its own palette chroma (`bandChromaCeiling`, 0.1405)
 * below okL 0.69, where green manages it from 0.44 and red from 0.405. Yellow
 * is the hue with the least room, and the ladder was putting it in the least
 * roomy part of it.
 *
 * ── SO IT WAS RAISED, AND FOUR THINGS HAD TO MOVE WITH IT ─────────────────
 *
 * Rendered at okL 0.42 / 0.55 / 0.60 / 0.62 / 0.66 / 0.70 and looked at: it
 * stops reading as olive somewhere around 0.60 and is unambiguously gold by
 * 0.66. It is set at **0.63**, and that number is not a taste — it is the
 * highest the rest of the chart survives:
 *
 *  1. THE TREND LINE has to clear every band at AA-large, and the band it
 *     cannot clear is now this one. At okL 0.63 the line has to reach 0.931
 *     lightness (#ffe9dc, 3.02:1 on the yellow band); at 0.65 it is #fff3ed and
 *     at 0.66 it is white outright. See LINE_LIFT.
 *  2. THE BOUNDARY HAIRLINE is ONE neutral drawn over all five bands, and it
 *     has to stay inside 1.6–3.5:1 on each. Solved over every (tone, opacity)
 *     pair: 0.63 passes at 1.62–3.48, **0.64 fails and every value above it
 *     fails**. That is the binding constraint, and it is why this is 0.63 and
 *     not 0.66 — the hairline is the greyscale carrier, the thing that says
 *     where the bound is when the colour is taken away, and it does not get
 *     traded for a slightly better yellow.
 *  3. THE POINT MARK on this band can no longer step toward the text colour:
 *     the band is lighter than any lifted gold. It steps toward the GROUND
 *     instead — see MARK_SHIFT_DARK, which is a direction per hue now.
 *  4. THE LADDER'S ORDERING IS BROKEN BY THIS BAND AND CANNOT BE REPAIRED.
 *     Measured, dark, geometric mean off card and plot:
 *
 *         green 1.49   olive 2.58   yellow 4.47   orange 3.10   red 2.29
 *
 *     Yellow is now the loudest band on the plot. Red cannot be lifted past
 *     it: every band's luminance is capped by the line that has to clear it,
 *     and at that cap red reaches 4.71 against yellow's 4.84 at okL 0.65 — it
 *     runs out of room first, in both directions. This was solved for, not
 *     assumed.
 *
 *     WHAT CARRIES THE ESCALATION INSTEAD IS CHROMA, and it is monotonic
 *     across all five where the contrast ladder is not:
 *
 *         0.0971 → 0.1035 → 0.1294 → 0.1313 → 0.1583
 *
 *     plus the hue itself, which is the layer that was always doing most of
 *     this work. A traffic light is the same shape of thing: its amber is
 *     brighter than its red and nobody reads amber as the more serious of the
 *     two. Direction and severity are still stated in the chevron, the word
 *     and the figures on the axis, exactly as before.
 *
 * ── LIGHT IS UNTOUCHED ────────────────────────────────────────────────────
 *
 * Light's band is DARKER than its surface, so the ladder pushes it toward
 * okL 0.77 rather than away from it, and #d8ae35 is already a gold carrying its
 * full ceiling chroma. None of the above applies there and none of it was
 * changed there.
 *
 * The rung this band actually lands on is `bandRung()` in statusBands.ts, which
 * is what the tests measure against — so the exception is a value in the source
 * rather than a relaxed assertion.
 */

/**
 * THE TREND LINE, AND IT IS BRIGHTER BECAUSE THE BANDS ARE (Aug 2026).
 *
 * It was `bronze-700` in light and `bronze-500` in dark, and on the opaque
 * significantly-out band those measure 2.87:1 and 2.42:1 — under AA-large,
 * i.e. a line buried by its own context. The rule when that happens is written
 * down and is one direction only: brighten the LINE.
 *
 * Solved rather than stepped along the scale, and for a reason worth stating.
 * The bronze scale's dark end is mixed toward espresso, so `bronze-900` clears
 * the band comfortably (3.73:1) at a chroma of 0.090 — a warm grey, a line that
 * has stopped being bronze on a plot where bronze is the one colour that means
 * "your series". Solved at bronze's OWN saturation and nothing higher (the
 * bronze hue sits at 19°, between the status red at 8° and the status orange at
 * 30°, so a saturated bronze line would read as a status colour crossing the
 * plot) it lands at 3.36:1 in light and 3.33:1 in dark, at a chroma of 0.20 —
 * darker AND more bronze than the step it replaces.
 *
 * ── AND IN DARK IT IS NOW A PALE CREAM, WHICH IS A REAL LOSS (Aug 2026) ────
 *
 * The out-of-range band moved to a lightness where a yellow is a yellow (see
 * BAND_FILL), and the line has to clear it at AA-large. That takes the line to
 * 0.936 lightness — #ffebdf, an OKLab chroma of 0.029 against the 0.20 it
 * carried before. **There is no bronze left in it.** Solved at full HSL
 * saturation rather than bronze's own precisely to keep what warmth the gamut
 * still allows at that luminance: the old rule against a saturated line (it
 * would read as a status colour, bronze sitting at 19° between the status red
 * and orange) is about a MID-lightness line, and at 0.93 even a fully saturated
 * bronze is a pale cream that could not be mistaken for a band.
 *
 * The alternative was a darker line, and it is impossible rather than merely
 * worse: to clear the in-range band from below, a line would need a luminance
 * under zero. Measured both ways before this was taken.
 */
interface LineLift {
  lightness: number;
  /** Bronze's own, except where the gamut leaves so little that it is spent. */
  saturation: number | 'own';
}

/**
 * ── AND THE BRONZE CAME BACK (Aug 2026) ────────────────────────────────────
 *
 * WHICH LINE THIS IS, first, because there are two now: the SINGLE-marker trend
 * chart draws its line in the status hues, gradiented along its length, and no
 * longer uses this at all. This is the COMPARISON chart's line — two or three
 * markers on one normalised axis — where the line says "this is your series"
 * and must not borrow a status hue, because on that chart it would be a verdict
 * on the wrong marker.
 *
 * It was solved against bands that stood 1.39–2.12 (light) and 1.59–4.74 (dark)
 * off the plot, and clearing the dark one at AA-large drove it to a lightness of
 * 0.936 — #ffebdf, an OKLab chroma of 0.028, which is a white line with a
 * rumour of warmth in it. The previous note here recorded that as unavoidable
 * and it was, at those bands: a darker line would have needed a luminance below
 * zero to clear the in-range band from underneath.
 *
 * With the bands at 1.14–1.42 and 1.32–1.64 the constraint is simply not
 * binding any more. Re-solved for the MOST CHROMATIC bronze that still clears
 * every band at 3:1, at bronze's own saturation and nothing higher (the hue
 * sits at 19°, between the status red at 8° and the status orange at 30°, so a
 * saturated bronze line would read as a status colour crossing the plot):
 *
 *     light  #654532 chroma 0.053  →  #916248 chroma 0.072   (3.03:1 worst)
 *     dark   #ffebdf chroma 0.028  →  #b28064 chroma 0.074   (3.00:1 worst)
 *
 * Dark is the one worth noticing: it is a bronze line again rather than a white
 * one, and the two themes are now the same colour at two lightnesses instead of
 * two different ideas.
 *
 * BOTH AT BRONZE'S OWN SATURATION, which is what `'own'` says and is a
 * constraint rather than a default: solved with the saturation free, dark came
 * out #bd7c57 at chroma 0.096, and a bronze that saturated at 19° is close
 * enough to the status orange at 30° to read as one crossing the plot. The
 * lightness does the work; the hue stays where the palette put it.
 */
const LINE_LIFT: LineLift = { lightness: 0.31, saturation: 'own' }; // #694835, 3.01:1 worst on a band, 6.77:1 off the plot

// ---------------------------------------------------------------------------
// Dark mode.
//
// Every token below has a dark counterpart, derived rather than hand-picked so
// the two themes cannot drift. Dark surfaces are the warm near-black browns
// the palette already contains (espresso mixed toward black), never a pure
// black and never a cool grey — a neutral-grey dark mode under this palette
// looks like a different product with the logo swapped in.
//
// The scales invert by ROLE, not by number:
//  - `cream` is the surface family. In both themes a lower step number means
//    a more raised surface: light gets brighter, dark gets brighter too.
//  - `espresso` (text), `bronze` (accent) and `taupe` (borders) are contrast
//    families. In both themes a higher step number means more contrast
//    against the page: light gets darker, dark gets lighter.
//  - `white` is the recessed input surface. Light: actual white, brighter
//    than the card. Dark: darker than the card, so a field still reads as cut
//    into the surface rather than floating on it.
//
// Status tints are re-derived against the dark surface rather than reused —
// a 12% wash tuned for cream is invisible on a near-black brown.
// ---------------------------------------------------------------------------

/**
 * The darkest warm tone in the system: espresso taken most of the way to
 * black, never past it.
 *
 * 0.60 → 0.44 → 0.74. The middle value is the one worth explaining, because it
 * was the wrong answer to a real problem. Dark mode read as a cave, so the
 * surfaces were lifted until a card separated from the page without any help —
 * and the result was a page that read BROWN. Not dark and warm: brown. At 0.44
 * this base is #25211E, and a whole viewport of #25211E with a wide, low-
 * contrast glow washed over it is a mid-brown field, which is the opposite of
 * the near-black, atmospheric register the clinic's own site is in.
 *
 * 0.74 is #110F0D: black at a glance, warm on inspection (r > g > b, never a
 * neutral #111 and never a cool one). Separation is no longer asked of the base
 * being light; it comes from the card being genuinely lifted off it (see the
 * surface scale below), from the hairline border, and from the one corner of
 * warm light — in that order, so the interface still works with the glow turned
 * off entirely.
 */
/**
 * ── 0.74 → 0.45, AND THE ARITHMETIC CHANGED UNDER IT (Aug 2026) ────────────
 *
 * The old figure is the right number for a DIFFERENT ink. It was espresso — a
 * warm brown at 26% luminance — and 74% of the way to black was what it took to
 * stop a whole viewport of it reading brown. The ink is #14161A now, which is
 * already near-black, so the same 0.74 would land on #050506: past the point
 * where a page stops being a colour and becomes an absence, and with no room
 * left below it for the sidebar to recess into.
 *
 * 0.45 gives **#0B0C0E** — the near-black the brief asks for, a hair cool
 * (b > g > r), and with enough space beneath it that a panel can still go darker
 * and a card can still lift without either becoming grey.
 */
const nightBase = mix(brand.espresso, '#000000', 0.45);
/**
 * The lift direction for dark surfaces — toward a NEUTRAL mid-grey now.
 *
 * This is where the brown actually came from, and it is worth being precise
 * because the page colour got the blame for years. Every raised surface in dark
 * is `mix(nightBase, nightLift, t)`, so the lift decides the HUE of every card,
 * every panel and every hover state. It used to point at taupe, so the further a
 * surface was lifted the browner it got — which is why "raising the surfaces
 * until a card separated on its own turned the whole viewport brown" was true,
 * and why the fix at the time was to darken the page instead of to fix the
 * direction it was being lifted in.
 *
 * The inputs are neutral now, so this resolves to a plain cool grey and a lifted
 * card is a lighter version of the page rather than a browner one.
 */
const nightLift = mix(brand.espresso, brand.taupe, 0.55);

/** Surface family in dark: lower step = more raised. */
function buildDarkSurfaceScale(base: string): Record<number, string> {
  // The raised steps are a long way apart, and they have to be: a lift is a
  // RATIO against the surface under it, so the same 0.10 mix that visibly
  // raised a card off #25211E is nearly invisible against #110F0D. The card
  // (step 50) lands about 1.5:1 above the page, which is a step you can see
  // across a room and still well below the point where the page stops reading
  // as black.
  const steps: Record<number, number> = {
    50: 0.2, 100: 0.27, 200: 0.35, 300: 0.45, 400: 0.58,
    500: 0, 600: -0.2, 700: -0.4, 800: -0.6, 900: -0.8,
  };
  const out: Record<number, string> = {};
  for (const [step, t] of Object.entries(steps)) {
    const n = Number(step);
    out[n] = t === 0 ? base : t > 0 ? mix(base, nightLift, t) : mix(base, '#000000', -t);
  }
  return out;
}

/** Contrast family in dark: higher step = brighter, i.e. more contrast against the page. */
function buildDarkContrastScale(base: string, page: string): Record<number, string> {
  const steps: Record<number, number> = {
    50: -0.86, 100: -0.72, 200: -0.52, 300: -0.32, 400: -0.14,
    500: 0, 600: 0.16, 700: 0.32, 800: 0.5, 900: 0.68,
  };
  const out: Record<number, string> = {};
  for (const [step, t] of Object.entries(steps)) {
    const n = Number(step);
    out[n] = t === 0 ? base : t < 0 ? mix(base, page, -t) : mix(base, brand.white, t);
  }
  return out;
}

const darkPage = nightBase;
/** Text: a warm light cream, never pure white — white body text on a warm dark surface glares. */
const darkText = mix(brand.cream, brand.white, 0.45);
/** Accent: bronze lifted far enough to clear AA against the dark page. */
/**
  * 0.42 → 0.58 with the retheme. The accent is measured against the KEY LIGHT'S
  * CORE as well as the page, and the cool white-blue glow is a far brighter
  * ground than the gold it replaced: at 0.42 the accent came out #959CA4 and
  * measured 2.76:1 there, under the 3:1 floor for large text and UI. A lighter
  * accent on near-black is the register this theme wants in any case.
  *
  * ── AND 0.58 → 0.72 WHEN THE ROOM GOT BRIGHTER (Aug 2026) ─────────────────
  *
  * The identical mechanism a second time, and it is the whole reason this token
  * is a derivation rather than a hex. The dark page gained a third source and a
  * diagonal ribbon and the key went 0.36 → 0.40, so the brightest ground on the
  * page moved up — and the accent measured **2.68:1 at the key's own core**,
  * under the same 3:1 floor it failed at in 2026's first pass. THE ACCENT IS
  * MEASURED AGAINST THE LIGHT, so more light is more accent, every time.
  */
const darkBronze = mix(brand.bronze, brand.cream, 0.72);
/** Borders: a warm mid-brown that shows against every dark surface without becoming a line of light. */
const darkTaupe = mix(brand.taupe, nightBase, 0.66);

export const darkScales = {
  cream: buildDarkSurfaceScale(darkPage),
  espresso: buildDarkContrastScale(darkText, darkPage),
  bronze: buildDarkContrastScale(darkBronze, darkPage),
  taupe: buildDarkContrastScale(darkTaupe, darkPage),
} as const;

/**
 * The accents in dark, re-derived rather than reused — the same rule the status
 * hues answer to and for the same reason. #2F6F6B on a #110F0D page measures
 * 1.9:1: a teal that reads as a considered colour on cream is a dark smudge on
 * near-black, and lightening it at the call site would desaturate it twice.
 *
 * Lifted toward the theme's own TEXT tone rather than toward white, so it
 * arrives warm-adjacent instead of arriving as a pastel — the same operation
 * `darkBronze` is, at the same kind of amount. The contrast ladder is then built
 * off that lifted base, so step 500 in dark is a colour that can carry a
 * hairline and step 300 one that can carry a glow.
 */
const darkTeal = mix(accent.teal, darkText, 0.36);
const darkSlate = mix(accent.slate, darkText, 0.36);

export const darkAccentScales = {
  teal: buildDarkContrastScale(darkTeal, darkPage),
  slate: buildDarkContrastScale(darkSlate, darkPage),
} as const;

/**
 * The recessed input surface. Light: literal white, one step brighter than
 * the card. Dark: one step *darker* than the card, which is what makes the
 * same inset shadow read as recessed in both themes.
 *
 * Eased from 0.35 to 0.18 when the page went to #110F0D. A field cut 35% below
 * a near-black page is #0B0A09, which is not a recessed surface, it is a hole —
 * and the depth cue stops working the moment there is no further down to go.
 * The card is now lifted far enough that a field sitting just below the PAGE
 * still reads as recessed relative to the card it is drawn on.
 */
const darkWhite = mix(darkPage, '#000000', 0.18);

/**
 * The status label colour in dark, re-derived from the HUE rather than
 * lightened from the light-mode value.
 *
 * Lightening the light-mode hex is what a naive dark mode does here, and it
 * desaturates twice: the light value is already pulled toward espresso to
 * clear AA on cream, and pulling that toward a warm cream as well lands on a
 * beige that is no longer recognisably green or gold. Starting from the hue
 * each time keeps the chroma and only spends contrast where it is needed.
 *
 * Lifted further than the light-mode equivalent is darkened, because a status
 * label in dark has to clear AA against its OWN wash as well as the page — and
 * the dark wash carries more hue (26% against light's 16%), so it is the
 * tighter of the two constraints.
 */
/**
 * ── AND THE DARK STATUS LABEL IS SOLVED AGAINST ITS OWN WASH (Aug 2026) ────
 *
 * `darkStatusHex` below was a hand-tuned mix per hue, solved against the wash
 * as it then was. The washes have just been re-solved to match light's chroma
 * (see `solveTint`), which moved every one of them — and the red label
 * immediately measured **4.27:1 on its own wash**, under AA, on the card a
 * patient reads when a result is significantly out.
 *
 * A number tuned against a surface that has since moved is a number that is
 * wrong and does not say so. This takes the surfaces as arguments and solves,
 * so the next time a wash changes the label follows it.
 *
 * THE OBJECTIVE IS THE SAME ONE AS EVERYWHERE ELSE IN THIS FILE: the most
 * chromatic rendering of the brand hue that clears the floor on EVERY surface
 * it can land on. Chroma is what makes a status colour recognisable as green or
 * gold rather than as a warm grey, so it is what is maximised; contrast is the
 * constraint, not the goal.
 */
// It IS `solveAgainst`, handed four surfaces instead of one and bounded by the
// same `bandChromaCeiling`. Solved without that bound the dark green label came
// back **#70ff00** — a highlighter, and precisely the "signal green" the
// palette forbids. See the call site.

function darkStatusHex(hue: StatusHue): string {
  // Re-derived a second time (Aug 2026) against the near-black base. The
  // surfaces went DOWN this round rather than up, so every one of these has
  // more room than it had and can keep more of its own chroma: the binding
  // constraint is still AA against its own wash, and the wash is now a mix from
  // a much darker card. Solved per hue for the smallest lift that clears 4.5:1
  // on the wash, the page, the card and the input — spending more than that is
  // spending chroma for nothing, and chroma is the whole reason a status colour
  // exists.
  const toward: Record<StatusHue, number> = { green: 0.44, olive: 0.39, yellow: 0.34, orange: 0.42, red: 0.5 };
  return mix(statusHue[hue], darkText, toward[hue]);
}

/** Every colour token, per theme, as a flat map of CSS custom property → hex. */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE PLOT IS LIGHT IN BOTH THEMES (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The card and the page stay dark in dark mode. Only the plot — the chart's
 * own panel, and the track a range bar is drawn on — is a warm off-white,
 * always, and it is the SAME off-white in both themes.
 *
 * ── WHY THE GROUND MOVED INSTEAD OF THE COLOURS ────────────────────────────
 *
 * The band colours have been re-solved four times in this file's history and
 * every solve hit the same wall from a different side. The wall is one
 * sentence: **a dark ladder fixes each band's luminance low, and a yellow at a
 * low luminance is a brown in any colour space.** It is not a matter of picking
 * a better gold. The measurements are all still above — dark's out-of-range
 * band came out #604b0b, was lifted right off the ladder to #ad8100 to rescue
 * it, and that exception then inverted the ladder (yellow louder than red),
 * forced the point mark to step toward the ground instead of the text, and
 * drove the comparison line to #ffebdf, a white line with a rumour of warmth.
 * Every one of those was a consequence of the plot being near-black.
 *
 * So the ground changed. On a pale ground a band is DARKER than what it sits
 * on, which puts all three hues in the part of the gamut where they hold their
 * colour, and it puts the LINE in the part where it holds both colour and
 * contrast — dark rather than bright, with no ceiling above it.
 *
 * ── WHAT IT BOUGHT, MEASURED ───────────────────────────────────────────────
 *
 *   band chroma   light 0.073 0.084 0.091 → 0.106 0.119 0.135   (+45/+42/+48%)
 *                 dark  0.072 0.070 0.094 → the same three      (+47/+70/+43%)
 *   the ordering  line off plot ÷ loudest band off plot
 *                 light 2.13× · dark 1.83×  →  3.22× in both
 *
 * The ordering number is the one that matters: the line is the content and the
 * bands are the context, and that lead has never been this wide. It is bought
 * by the line being able to go dark — 7.2:1 off the plot, where the old lifted
 * line managed 3.05 against a band standing 4.74.
 *
 * ── AND FOUR RECORDS COLLAPSED TO ONE EACH ─────────────────────────────────
 *
 * BAND_FILL, MARK_FILL, LINE_LIFT and the boundary hairline were all
 * per-theme, and they were per-theme because the surface was. One ground, one
 * answer. The "geometric mean of the card and the plot" that BAND_FILL used to
 * be solved against is gone with it: both instruments draw on this.
 *
 * ── IT IS NOT A HOLE IN THE PAGE ───────────────────────────────────────────
 *
 * A bright rectangle on a near-black card is exactly what this must not be,
 * and three things stop it — see `chart.plotFrame`, `chart.plotInset` and the
 * `.chart-plot` rules in globals.css: a warm hairline frame, a soft inner
 * shadow along the top and left inside edges, and the card's own padding
 * holding it off the card's border. An inset panel, not a cut-out.
 *
 * THE VALUE ITSELF IS UNCHANGED FROM LIGHT MODE'S OLD PLOT, deliberately: the
 * light theme's chart ground does not move at all, so this change is "dark
 * mode's plot becomes light mode's plot" and nothing else.
 */
/**
 * ── NEUTRAL, AND AT THE OLD ONE'S EXACT LUMINANCE (Aug 2026) ───────────────
 *
 * This is the ground the five status band fills are SOLVED against — the gauge's
 * track, and the surface `BAND_CONTRAST`'s whole ladder is measured on. The
 * brief says keep the status colours as-is, and this is the one token where that
 * instruction has teeth: change this surface and every clinical colour in the
 * product has to be re-solved against it.
 *
 * It was `mix(cream, white, 0.35)` = #edeae2, a warm off-white, and deriving it
 * from the new neutral surface would have moved it. So it is pinned instead, at
 * a NEUTRAL GREY OF THE SAME RELATIVE LUMINANCE (0.8238) as the value it
 * replaces — which is the whole trick: WCAG contrast depends on luminance and
 * not on hue, so every ratio in `BAND_CONTRAST`, `BAND_FILL`, `MARK_FILL`, the
 * optimal narrowing and the boundary hairline is arithmetically unchanged. The
 * five fills are the same five hexes they were before the retheme. The track
 * they sit on simply stopped being brown.
 *
 * ⚠ IT IS A LITERAL ON PURPOSE. Deriving it from `brand.cream` is what would
 * make a future change to the page colour silently re-solve the clinical
 * palette, which is exactly the coupling this note exists to break.
 */
const PLOT_SURFACE = '#ebebeb';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  DARK'S TRANSLUCENT TINTS ARE SOLVED TO MATCH LIGHT'S (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE COMPLAINT, and it was right: "a green card in dark should read as green
 * with the same confidence a green card in light does; right now light is
 * better and dark is muddy."
 *
 * ── WHY DARK WAS MUDDY, AND IT IS ONE LINE OF ARITHMETIC ───────────────────
 *
 * Every dark tint was `mix(card, themedHue(hue), weight)`, and `themedHue` in
 * dark is `mix(statusHue, darkText, DARK_HUE_LIFT)` — the hue carried toward a
 * warm near-white so it would be visible on a near-black page. **A mix toward a
 * near-neutral DESATURATES.** So the input to the wash had already lost part of
 * its colour before the wash diluted it again, and two desaturating steps in a
 * row is what "muddy" is. Measured, OKLab chroma of the card wash:
 *
 *     light   green 0.0257   yellow 0.0325   red 0.0345
 *     dark    green 0.0146   yellow 0.0212   red 0.0189
 *
 * Dark carried 57%, 65% and 55% of light's colour. It was not a slightly
 * different green; it was a little over half a green.
 *
 * ── WHAT IS SOLVED, AND AGAINST WHAT ───────────────────────────────────────
 *
 * Light is the reference and dark is re-derived to two of its measurements at
 * once — never reused directly, which is the trap a naive dark mode falls into
 * and which this file has warned about since it was written:
 *
 *  1. THE SAME OKLab CHROMA. "Reads as green with the same confidence" is a
 *     statement about colourfulness, and OKLab chroma is the measure of it that
 *     does not lie (see `okChroma`). Matching the number is matching the claim.
 *  2. THE SAME PRESENCE ON ITS OWN CARD. A tint's job is to separate a tinted
 *     card from an untinted one, and that is a CONTRAST against the card it
 *     replaces — 1.09:1 for a light wash. Matching the ratio rather than the
 *     colour is what makes the two themes feel equally tinted on two surfaces
 *     that are nothing like each other.
 *
 * Both, lexicographically: candidates within a tolerance of light's contrast
 * first, then the one closest to light's chroma. The tolerance widens in steps
 * so a hue that cannot hit the ratio exactly still gets the nearest answer
 * rather than nothing.
 *
 * THE HUE ANGLE IS THE BRAND HUE'S OWN and is never touched, exactly as in
 * every other solve in this file. Only saturation and lightness move.
 *
 * `DARK_HUE_LIFT` survives for `darkFill`, which is a different operation on a
 * different kind of thing.
 */
function solveTint(hue: string, surface: string, targetContrast: number, targetChroma: number): string {
  /**
   * ── AND IT HAS TO BE ON THE RIGHT SIDE OF THE CARD ────────────────────
   *
   * A contrast ratio is SYMMETRIC: a wash 1.20:1 darker than the card matches
   * the target exactly as well as one 1.20:1 lighter. Solved without this,
   * dark's gold wash came back **#1e1702** and its red **#0c0201** — washes
   * DARKER than a near-black card, which is a hole punched in the surface
   * rather than a tint on it, and unreadable body copy sitting in it.
   *
   * A tint moves away from the card in the direction that theme's surfaces
   * move: darker on a light card, lighter on a dark one. That is the same rule
   * the surface scale itself runs on, applied to the one thing that had been
   * getting it by accident.
   */
  const surfaceLuminance = relativeLuminance(surface);
  const lighter = surfaceLuminance < 0.5;
  for (const tolerance of [0.01, 0.02, 0.05, 0.12, 0.4]) {
    let best: { hex: string; miss: number } | null = null;
    for (let lightness = 0.02; lightness <= 0.98001; lightness += 0.004) {
      for (let saturation = 0.05; saturation <= 1.00001; saturation += 0.02) {
        const hex = reHsl(hue, Math.min(1, saturation), lightness);
        const luminance = relativeLuminance(hex);
        if (lighter ? luminance <= surfaceLuminance : luminance >= surfaceLuminance) continue;
        if (Math.abs(contrastRatio(hex, surface) - targetContrast) > tolerance) continue;
        const miss = Math.abs(okChroma(hex) - targetChroma);
        if (!best || miss < best.miss) best = { hex, miss };
      }
    }
    if (best) return best.hex;
  }
  // Unreachable: at tolerance 0.4 the whole lightness ladder is in range.
  return hue;
}

/**
 * INK ON THE PLOT, and it is STATIC like `night` and `oncolor` are.
 *
 * The plot is light in both themes, so everything drawn on it in text —
 * the axis ticks, the reference-bound labels, the unit, the number beside the
 * most recent point — is dark in both themes. Reaching for `--c-espresso`
 * here would be the bug: espresso resolves to a near-white cream in dark, and
 * a cream tick label on a #edeae2 plot measures 1.09:1.
 */
// REMOVED with the plot panel (Aug 2026). `PLOT_INK` / `PLOT_INK_MUTED` were
// the static espresso pair for text drawn on the light panel. Nothing is drawn
// on a panel any more; the axis is on the card and follows the theme.

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SOLVED VALUES ARE WRITTEN DOWN, NOT COMPUTED ON EVERY PAGE LOAD.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `solveAgainst`, `solveTint` and `solveNeutral` are grid searches — roughly a
 * quarter of a million contrast-and-chroma evaluations between them. Run at
 * module scope they cost **605ms**, MEASURED, and this module is in the entry
 * chunk: that is 605ms of blocked first paint for every patient on every visit,
 * on a phone rather more.
 *
 * So the file goes back to its own long-standing rule, which is the first line
 * of the note on `okChroma`: **solve at authoring time, ship the numbers.**
 * `SOLVED` below is what ships. `solveTokens()` is exported so the search can
 * be re-run, and `tokenContrast.test.ts` runs it and asserts these literals are
 * exactly what it produces — so a hand-edited hex, or a change to `statusHue`
 * or to a card surface that ought to move one of these, fails a test rather
 * than silently shipping a stale colour.
 *
 * Module init after: 605ms → under 2ms.
 */
export interface SolvedTokens {
  /** The trend line and its point marks. Solved against the CARD. */
  line: Record<StatusHue, string>;
  /** The card wash under a tinted result. Solved to light's chroma and presence. */
  wash: Record<StatusHue, string>;
  /** The summary-bar and chip fill. Same. */
  track: Record<StatusHue, string>;
  /** The status word, solved against its own wash, the page, the card and an input. */
  label: Record<'green' | 'yellow' | 'red', string>;
  /** The chart's boundary hairline, on the card. */
  bound: string;
}

/**
 * RE-RUN THE SEARCH. Slow by construction — authoring time and tests only.
 *
 * Everything a value depends on is a parameter of the theme, so this takes the
 * mode and nothing else: change `statusHue`, `TINT_MIX.wash`, the card surface
 * or `LINE_FILL_TARGET` and this returns different numbers, which is exactly
 * what the test compares against.
 */
/**
 * HOW PRESENT AND HOW COLOURFUL THE DARK CARD WASH IS — the two knobs, in one
 * place, because this is the pair somebody will want to tune by eye afterwards.
 *
 *   contrast    how far the wash stands off the card. Light's own wash is 1.09:1
 *               off ITS card, and copying that number into dark is what produced
 *               a tint nobody could see; 1.35 is as present as the AA floors on
 *               the wash allow with all three hues still solvable.
 *   chromaGain  how much more colour than light's wash carries. Not 1: see the
 *               note at the call site — the same chroma at a much lower
 *               lightness is a grey with a rumour of hue in it.
 */
const DARK_WASH = { contrast: 1.35, chromaGain: 2.6 } as const;

/**
 * The rendering of `hue` closest to `targetChroma` that stands
 * `DARK_WASH.contrast` off `surface`, lighter than it, with every colour in
 * `floors` still clearing AA on it.
 *
 * A different objective from `solveTint`, which matches a contrast AND a chroma
 * measured somewhere else. This one takes the contrast as the constraint and the
 * chroma as the goal, so a hue that cannot reach the goal (gold, at a dark
 * lightness) returns the most it can hold rather than failing.
 */
function solveWash(hue: string, surface: string, targetChroma: number, floors: string[]): string {
  let best: { hex: string; miss: number } | null = null;
  for (let lightness = 0.02; lightness <= 0.5; lightness += 0.002) {
    for (let saturation = 0.05; saturation <= 1.00001; saturation += 0.01) {
      const hex = reHsl(hue, Math.min(1, saturation), lightness);
      if (Math.abs(contrastRatio(hex, surface) - DARK_WASH.contrast) > 0.02) continue;
      // Lighter than the card, never darker: a wash below a near-black card is
      // a hole punched in the surface rather than a tint on it.
      if (relativeLuminance(hex) <= relativeLuminance(surface)) continue;
      if (floors.some((ink) => contrastRatio(ink, hex) < 4.5)) continue;
      const miss = Math.abs(okChroma(hex) - targetChroma);
      if (!best || miss < best.miss) best = { hex, miss };
    }
  }
  // Unreachable for any real card: the whole lightness ladder is searched and
  // some rung always clears a 1.35:1 step off a near-black surface.
  return best?.hex ?? hue;
}

export function solveTokens(mode: 'light' | 'dark'): SolvedTokens {
  const dark = mode === 'dark';
  const card = dark ? darkScales.cream[50] : scales.cream[50];
  const lightCard = scales.cream[50];
  const matchLight = (hue: StatusHue, weight: number): string => {
    const reference = mix(lightCard, statusHue[hue], weight);
    return dark ? solveTint(statusHue[hue], card, contrastRatio(reference, lightCard), okChroma(reference)) : reference;
  };
  const hues = Object.keys(statusHue) as StatusHue[];
  const byHue = (f: (h: StatusHue) => string) =>
    Object.fromEntries(hues.map((h) => [h, f(h)])) as Record<StatusHue, string>;

  const line = byHue((hue) =>
    // The two hinges are MIDPOINTS of their neighbours, never solved
    // independently — see the note in buildThemeTokens.
    hue === 'olive' || hue === 'orange'
      ? mix(
          solveAgainst(statusHue[hue === 'olive' ? 'green' : 'yellow'], [card], LINE_FILL_TARGET, bandChromaCeiling(hue === 'olive' ? 'green' : 'yellow')),
          solveAgainst(statusHue[hue === 'olive' ? 'yellow' : 'red'], [card], LINE_FILL_TARGET, bandChromaCeiling(hue === 'olive' ? 'yellow' : 'red')),
          0.5,
        )
      : solveAgainst(statusHue[hue], [card], LINE_FILL_TARGET, bandChromaCeiling(hue as 'green' | 'yellow' | 'red')),
  );
  /**
   * ═══ THE CARD WASH IN DARK IS SOLVED FOR COLOUR NOW, NOT MATCHED ═══════
   *
   * ── THE COMPLAINT: THE DARK CARD TINT READS MUDDY ─────────────────────
   *
   * It did, and "the tint is translucent" is the right diagnosis of the RECIPE
   * even though the applied colour was always an opaque hex. `matchLight` mixes
   * the hue INTO the card in light and then solves dark to the same CHROMA and
   * the same presence — so dark's wash carried exactly light's colourfulness by
   * design (0.0228 against light's 0.0235 in green, 0.0382 against 0.0389 in
   * gold). Matching was the bug.
   *
   * ⚠ THE SAME CHROMA IS NOT THE SAME COLOUR AT A DIFFERENT LIGHTNESS. A given
   * OKLab chroma on a near-white ground is a clear pastel and on a near-black
   * one is a grey with a rumour of hue in it. Light's wash reads as a green
   * card; dark's read as a brown-grey card. Nothing was translucent and nothing
   * was mismeasured; the target was wrong.
   *
   * ── SO DARK ASKS FOR MORE, AND IS HELD BY WHAT A CARD HAS TO DO ────────
   *
   * `DARK_WASH.chromaGain` of light's chroma, at `DARK_WASH.contrast` off the
   * card, with the hue's own channel ratios kept (it is solved in the hue's own
   * HSL angle, never mixed from the warm near-black card, which is the same
   * reason `DARK_FILL` mixes a band from black). Three floors bind it and they
   * are what stop this becoming a filled alert card: body copy at AA on the
   * wash, the STATUS WORD at AA on the wash, and the wash lighter than the card
   * rather than a hole cut in it.
   *
   * ⚠ GOLD CANNOT REACH THE GAIN AND IS CAPPED BY THE GAMUT, WHICH IS THE SAME
   * WALL THIS FILE HAS RECORDED FOUR TIMES: a dark yellow is a brown, so gold
   * takes the most sRGB holds at its lightness (1.7× rather than 2.6×) and the
   * solve simply returns it. Green and red reach the gain exactly.
   *
   * LIGHT IS UNTOUCHED. It reads clean already and it is the reference.
   */
  const wash = byHue((hue) => {
    const reference = mix(lightCard, statusHue[hue], TINT_MIX.wash);
    if (!dark) return reference;
    return solveWash(statusHue[hue], card, okChroma(reference) * DARK_WASH.chromaGain, [
      darkText,
      // The status word stands ON its own wash, and it is the tighter of the
      // two: solved against the hue itself where the hue clears the floor.
      darkStatusHex(hue),
    ]);
  });
  /**
   * ═══ THE STATUS WORD, AND IT IS THE HUE ITSELF WHERE THE HUE WILL DO ═══
   *
   * ── THE COMPLAINT: "Below range" READ MUDDY IN DARK (Aug 2026) ──────────
   *
   * It did, and the cause is the objective rather than a stale number. The dark
   * label is solved for the MOST CHROMATIC rendering of the hue that clears AA
   * on every surface it lands on — and with the search free to move lightness,
   * "most chromatic" for a yellow is a DARKER, denser gold than the palette's
   * own: it returned **#dbad00** where `statusHue.yellow` is **#F5CE3E**. Both
   * clear the floor; the solver had no reason to prefer the one a reader
   * recognises as the status colour, because nothing told it to.
   *
   * ── SO THE HUE ITSELF WINS WHENEVER IT CAN ─────────────────────────────
   *
   * A search is for the case where the palette colour does NOT clear the floor.
   * Where it does, solving is spending chroma to arrive somewhere else for no
   * reason — and it costs the one thing a status word is for: being the same
   * colour as the band it names. So: take `statusHue[hue]` if it clears AA on
   * the wash, the page, the card and an input; solve only if it does not.
   *
   * MEASURED on the dark surfaces, which is why only the yellow qualifies —
   * this is a general rule rather than a yellow-shaped exception:
   *
   *     yellow #F5CE3E   8.19 – 13.53:1   → taken, unchanged, byte for byte
   *     green  #5E8C3A   under the floor  → solved, as before
   *     red    #B23A28   under the floor  → solved, as before
   *
   * ⚠ AND LIGHT CANNOT DO THIS, WHICH IS NOT AN INCONSISTENCY. The same
   * #F5CE3E measures **1.50:1 on the light card**, 1.37 on its own wash and
   * 1.32 on the page. A light yellow on a near-white surface is not a legible
   * word at any size, and the status word is the ONE piece of text in the
   * product that carries a status colour. Light stays derived (#675a27,
   * 6.73:1). Every FIELD of the colour is the exact hex in both themes; the one
   * piece of TYPE is the exact hex wherever it can be read.
   */
  /**
   * ⚠ AND LIGHT IS THE AUTHORED VALUE AGAIN, BECAUSE THE PLATE HAS ITS OWN.
   *
   * For one revision this solved against the status PLATE as well, a filled
   * ground the word used to stand on, and the plate then needed a second label
   * of its own so that clearing it did not drag every status word in light mode
   * toward a near-black. Both are gone with the plate: the word stands on GLASS
   * now, which is within a rounding of the card this token was always solved
   * against.
   */
  const label = Object.fromEntries(
    (['green', 'yellow', 'red'] as const).map((hue) => {
      if (!dark) return [hue, statusTextHex(hue)];
      const surfaces = [wash[hue], darkPage, darkScales.cream[50], darkWhite];
      // The literal rather than `WCAG_AA_TEXT`, which is a `const` declared far
      // below this — a temporal-dead-zone throw at module load, not a lint nit.
      const floor = 4.5;
      const worst = surfaces.reduce((lowest, s) => Math.min(lowest, contrastRatio(statusHue[hue], s)), Infinity);
      return [hue, worst >= floor ? statusHue[hue] : solveAgainst(statusHue[hue], surfaces, floor, bandChromaCeiling(hue))];
    }),
  ) as Record<'green' | 'yellow' | 'red', string>;

  return {
    line,
    wash,
    track: byHue((hue) => matchLight(hue, TINT_MIX.track)),
    label,
    bound: solveNeutral(dark ? brand.taupe : lightNeutral.border, card, 2.6),
  };
}

/**
 * WHAT SHIPS. Produced by `solveTokens` above and pinned by
 * `tokenContrast.test.ts`, which re-runs the search and asserts equality — so
 * these cannot drift from their own derivation without a test failing.
 *
 * Do not hand-edit. Change the INPUT (a brand hue, `TINT_MIX.wash`, a card
 * surface, `LINE_FILL_TARGET`) and regenerate.
 */
const SOLVED: Record<'light' | 'dark', SolvedTokens> = {
  /**
   * ── RE-SOLVED FOR THE NEUTRAL SURFACES (Aug 2026), NOT RE-CHOSEN ──────────
   *
   * Every value here is the output of `solveTokens()`, which is re-run by
   * `tokenContrast.test.ts` and asserted equal to these literals — so this block
   * cannot drift from its own derivation, and it moved because the SURFACES
   * moved and for no other reason.
   *
   * The brief says keep the status colours as-is, and this is what that means in
   * practice: `statusHue` is untouched, so the five HUES are the five hues. What
   * a solve produces is the lightness and saturation at which each hue clears
   * its contrast floor ON A GIVEN GROUND, and the grounds all changed — a wash
   * is mixed from the card, a label is solved against the page, the card, an
   * input and its own wash, and a line against the card. Light's green line came
   * out byte-identical (#507e2c); dark's moved one step (#73a14f → #6b9948)
   * because the card it is measured on went from a warm #2a2723 to a neutral
   * #1f2124. Nothing here was picked by eye.
   *
   * The gauge's five BAND FILLS are not in this block and did not move at all —
   * they are solved against `PLOT_SURFACE`, which was deliberately pinned at the
   * old value's exact luminance for precisely this reason. See the note there.
   */
  light: {
    line: { green: '#507e2c', olive: '#717816', yellow: '#917200', orange: '#a95d1b', red: '#c14836' },
    wash: { green: '#dce6d4', olive: '#ecedd3', yellow: '#fcf4d5', orange: '#f2e0ce', red: '#eed5d0' },
    track: { green: '#a1bc8c', olive: '#ccd08a', yellow: '#f9e28e', orange: '#dcac7c', red: '#d28c81' },
    label: { green: '#3d572c', yellow: '#675a27', red: '#8f3225' },
    bound: '#b49c81',
  },
  dark: {
    line: { green: '#6b9948', olive: '#a3a324', yellow: '#dbad00', orange: '#de8929', red: '#e06452' },
    // ⚠ SOLVED FOR COLOUR, NOT MATCHED TO LIGHT'S — see the wash solve above.
    // Green and red reach 2.6x light's chroma exactly; gold is capped by the
    // gamut at 1.7x, which is the "a dark yellow is a brown" wall this file has
    // now recorded from four different directions.
    wash: { green: '#273d16', olive: '#373b00', yellow: '#453700', orange: '#582d02', red: '#5b2922' },
    track: { green: '#415a2d', olive: '#424601', yellow: '#403301', orange: '#764719', red: '#935147' },
    // ⚠ The yellow is `statusHue.yellow` UNCHANGED — see the label solve above.
    label: { green: '#80ae5b', yellow: '#F5CE3E', red: '#f97c6a' },
    bound: '#5a6272',
  },
};

/**
 * How much of the theme's second accent goes into a page pane's glass — see
 * `GLASS.tint`, which is this number and exports it for the contrast test.
 *
 * It lives up here rather than in `GLASS` because `themeTokens` is built at
 * module scope, several hundred lines before `GLASS` is declared, and a `const`
 * read before its initialiser is a temporal-dead-zone throw at import time
 * rather than a type error somebody sees.
 */
const GLASS_ACCENT_TINT = 0.08;

function buildThemeTokens(mode: 'light' | 'dark'): Record<string, string> {
  const dark = mode === 'dark';
  const s = dark ? darkScales : scales;
  const surface = dark ? darkScales.cream[500] : lightNeutral.surface;
  // A tint washes toward the surface it sits on: the card in light mode, the
  // card in dark mode too — both are `cream-50`, which is what a tinted card
  // actually replaces.
  const tintTowards = dark ? darkScales.cream[50] : scales.cream[50];

  /**
   * The hue as it exists in THIS theme, before any wash.
   *
   * Dark is re-derived rather than reusing the light hue: the same brick red
   * that sits calmly on cream is a muddy near-invisible smear on a warm
   * near-black, and the same gold is a glare. Lifting toward the theme's own
   * text tone puts every hue at roughly the weight of body copy in its own
   * theme, which is what makes a 30% band read the same in both.
   */
  const themedHue = (hue: StatusHue): string => (dark ? mix(statusHue[hue], darkText, DARK_HUE_LIFT[hue]) : statusHue[hue]);

  /**
   * A FILL of colour in dark: a chart band, a range-bar segment, a boundary
   * line. Mixed from BLACK toward the hue, not from the warm surface toward it,
   * and that difference is the whole of why the chart bands read as green,
   * gold and red now instead of as three shades of mud.
   *
   * A wash is a tint OF THE CARD and is still mixed from the card, because it
   * is the card's own background and has to belong to it. A band is not: it is
   * a region of colour drawn over the plot, and mixing it from a warm brown
   * near-black adds red to every hue at once. On the old base that produced a
   * green band of #434A36 — a colour with more red in it than green — and a red
   * band a shade away from it. Mixing from neutral black keeps each hue's own
   * channel ratios and only takes lightness away, so green stays green.
   *
   * The per-hue strengths exist for the same reason `statusTextHex` and
   * `MARK_SHIFT` have per-hue values: yellow starts far brighter than the other
   * three, and one constant that made green visible would make yellow glare.
   */
  const darkFill = (hue: StatusHue, role: 'band' | 'track' | 'edge'): string =>
    // Clamped at 1: red's edge multiplier takes it fractionally past the hue
    // itself, and "past the hue" is not a colour anybody chose.
    mix('#000000', themedHue(hue), Math.min(1, DARK_FILL[role] * DARK_FILL_HUE[hue]));

  const out: Record<string, string> = {};

  for (const family of ['bronze', 'espresso', 'cream', 'taupe'] as const) {
    const scale = s[family];
    // `scale[500]` IS the family's own base in both themes — `buildScale` and
    // both dark builders return the base untouched at 500 — so this is one
    // expression rather than a branch that has to name four hexes and be kept in
    // step with where each of them now comes from. Light's `cream` and `taupe`
    // are seeded from `lightNeutral` and its `bronze` and `espresso` from
    // `brand`; the scale knows which without this line being told.
    out[`--c-${family}`] = scale[500];
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      out[`--c-${family}-${step}`] = scale[step];
    }
  }

  /**
   * The two accents, per theme, on the same 50–900 shape every other family
   * has — so `text-teal-700` is a colour in both themes and no call site ever
   * branches on the theme to reach one. See `accent` at the top of this file for
   * what they are and for the channel rule that keeps them off the status hues.
   */
  for (const family of ['teal', 'slate'] as const) {
    const scale = dark ? darkAccentScales[family] : accentScales[family];
    out[`--c-${family}`] = scale[500];
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      out[`--c-${family}-${step}`] = scale[step];
    }
  }

  out['--c-white'] = dark ? darkWhite : brand.white;
  out['--c-page'] = surface;

  /**
   * ── THE SIDEBAR IS THE GLASS MATERIAL NOW, NOT A WASH OF ITS OWN ────────
   *
   * It was `brand.espresso` at 6% / 38%, which is a different colour from
   * every other translucent surface in the product, and the reason given was
   * that a sidebar has nothing but the page and the glow behind it while a
   * pinned control bar has the reader's own results. That reasoning is about
   * ALPHA and it was applied to the COLOUR, which is what made the column read
   * as a slightly-tinted piece of page rather than as a panel in front of one.
   * Measured: 1.10:1 off the light page and 1.17:1 off the dark one. A card is
   * 1.30:1 and 1.28:1. So a "panel" that is a tenth of the way to being a
   * surface, on a page whose surfaces are subtle to begin with.
   *
   * Same colour as `--c-glass` now — the CARD tone — set from one expression so
   * the two cannot drift, and kept under its own name because Tailwind's
   * `panel` colour resolves through it. The alpha is still the sidebar's own
   * (`PANEL_WASH_ALPHA`), because that part of the old reasoning was right.
   *
   * WHAT THAT CHANGES, MEASURED. Light 1.10 → 1.16:1, and the column now sits
   * ABOVE the page rather than below it, which is the same direction the
   * control bar's glass and the dark theme's panel both go. Dark 1.17 → 1.20:1,
   * with the glow knocked back to 1.58:1 of itself and the lit part of the
   * panel still 1.20:1 above the unlit part — light through it, dimmer,
   * continuous across the seam.
   *
   * THE CEILING IS THE GLOW, NOT THE CARD. Past about 80% in dark, the panel
   * stops transmitting: the lit and unlit halves converge and it becomes a lid.
   * That is what `stillLit` in tokenContrast.test.ts holds, and it binds before
   * the "stays below a card" rule does.
   */
  /**
   * ── LIGHT MOVED OFF NEAR-WHITE SO THE SPECULAR HAS ROOM (Aug 2026) ──────
   * 0.35 of the way from white toward the surface put this at 96% white, and a
   * WHITE highlight on a 96%-white pane has nowhere to go: measured, the sheen
   * lifted it by 0.4% where the material's own test asks for 2%. That is not a
   * number to relax — it is a surface with no headroom above it. 0.5 keeps the
   * pane above the page and below a card and leaves the highlight somewhere to
   * land.
   */
  const glassColour = dark ? darkScales.cream[50] : mix(brand.white, lightNeutral.surface, 0.4);
  // The two ambient sources, resolved here because three tokens further down
  // are derived from them (`--c-glass-edge`, `--c-sheen`, and the glows
  // themselves) and a colour computed twice is a colour that can differ from
  // itself. See the long note on `--c-glow` / `--c-glow-2` below for what they
  // are and why each goes the other way per theme.
  /**
   * ── THE KEY LIGHT IS COOL NOW, AND IT WAS THE LAST GOLD IN THE PRODUCT ────
   *
   * It was `mix(bronze, '#f0bd6a', …)` — an explicit warm gold, the one place in
   * this file that named a hue rather than deriving one, and therefore the one
   * thing that would have survived a retheme of the four brand tones untouched.
   * A gold corner glow over a clean black interface is not a leftover, it is the
   * single most visible warm thing on the screen.
   *
   * It is a cool white-blue in dark: light with a trace of blue in it reads as
   * DAYLIGHT, where a dead-white glow reads as a blown highlight and a warm one
   * reads as a lamp. In light it has to DARKEN the page to register at all (a
   * pale anything over #F3F4F6 measures nothing), so it is the same hue taken
   * down — the identical inversion the trend chart's spark halo makes, and for
   * the identical reason.
   */
  const glowPrimary = dark ? '#DDF0F4' : '#6CB6C6';
  /**
   * ── THE FILL IS TEAL IN BOTH THEMES NOW (Aug 2026) ───────────────────────
   *
   * It was the slate accent in light, and the contrast suite caught what that
   * actually produced once the key had gone cool with the retheme: a cool
   * blue-grey key beside a blue-slate fill measured **4° apart in hue**. Two
   * lights 4° apart are one light with a wide falloff, which is exactly the
   * failure the original pair of viewport-sized radials had and exactly what a
   * second source exists to avoid.
   *
   * Teal is 30° off the key and is already the fill in dark, so both themes are
   * lit the same way now: a blue-white key and a green-blue fill. The reason
   * light used to differ was that a cool hue over CREAM desaturates rather than
   * tints — that was a fact about cream, and there is no cream any more.
   */
  /**
   * ── THE FILL IS A PROPER BLUE NOW, NOT A SECOND CYAN (Aug 2026) ──────────
   *
   * It was the teal accent, which put it about 10° from the key once the key
   * went cool — and 10° apart is one light with a wide falloff, the exact
   * failure the second source exists to avoid and the one this file has already
   * recorded once. The key is a near-white with a cyan cast, the fill is a
   * genuine blue about 30° off it, and the third source below is green. Three
   * hues that a reader can name separately is what makes a page read as lit
   * rather than tinted.
   */
  const glowSecondary = dark ? '#7BA6F2' : '#5E7FD6';
  /**
   * ── THE THIRD SOURCE: A SOFT GREEN, BOTTOM RIGHT (Aug 2026) ──────────────
   *
   * The brief is a dark base with depth and colour in it — blue, white and a
   * touch of green — rather than one flat dark field, and the two existing
   * sources are both cool blues in the two LEFT-hand and TOP corners. The
   * bottom right had nothing in it at all.
   *
   * ⚠ IT IS A MINT, AND THAT IS A CONSTRAINT RATHER THAN A PREFERENCE. The rule
   * every non-status hue in this palette answers to is that blue is never
   * strictly its lowest channel — a colour with blue at the floor is the shape
   * of a STATE, and a status green in the corner of a results page is the one
   * ambient decision that could be read as a finding. #8FE3AE has red lowest,
   * so no alpha of it over any surface can arrive at the shape of `statusHue
   * .green`. It also sits 47° off the key and 77° off the fill.
   */
  const glowTertiary = dark ? '#8FE3AE' : '#57B584';
  /**
   * ── AND THE DIAGONAL STREAK, WHICH IS NOT A RADIAL AT ALL ────────────────
   *
   * A slow curved ribbon of light sweeping corner to corner, top-left to
   * bottom-right, behind everything. Drawn in globals.css as five soft blobs
   * along a bowed diagonal rather than as a rotated bar, because a `linear-
   * gradient` cannot curve and a `transform` on a fixed pseudo-element is a
   * containing-block change waiting to catch a modal.
   *
   * The COLOUR goes in opposite directions per theme for the same reason every
   * other ambient source in this file does: on near-black a ribbon of light is
   * light ADDED and has to be lighter than the page; on a warm off-white there
   * is nothing to add, so what reads as a sweep of light is the ground taken
   * very slightly down and cool.
   */
  const glowStreak = dark ? '#DCEAFF' : '#8FB0D8';
  /**
   * ── AND IN DARK IT IS NEAR-BLACK AGAIN, NOT THE CARD TONE (Aug 2026) ────
   *
   * The column read BROWN. That is not a misperception: `darkScales.cream[50]`
   * is the card, and the whole dark surface scale lifts toward `nightLift` — a
   * warm mid-brown — so the more of it a surface takes the browner it gets. At
   * 78% over the page the sidebar was #252220, which is a brown column beside a
   * near-black page, and it is the exact register the note on `nightBase`
   * warns about: "raising the surfaces until a card separated on its own turned
   * the whole viewport brown".
   *
   * So it goes the OTHER WAY off the page rather than up: `nightBase` taken a
   * further 35% toward black. Warm (r > g > b, still espresso-derived), never
   * neutral and never #000, and a long way from brown.
   *
   * A RECESSED COLUMN RATHER THAN A RAISED ONE, and that is the change of idea.
   * A panel lighter than the page is a thing lifted off it; a panel darker than
   * the page is a thing the page is lit in FRONT of, which is what a navigation
   * rail beside a lit room actually is. Every measured claim gets easier in
   * that direction: the labels on it gain contrast rather than losing it, and
   * the light still passes through at the sidebar's own alpha.
   *
   * ⚠ IT IS NO LONGER THE SAME COLOUR AS `--c-glass`, which it has been since
   * the two were unified. That unification was right about the MATERIAL and is
   * untouched — same blur, same saturation, same streak, same lit edge, same
   * grain — and wrong about the colour for this one surface, for the reason
   * above. `tokenContrast.test.ts` asserts the material is shared and no longer
   * asserts the colour is.
   */
  /**
   * ── AND LIGHT IS A RECESSED RAIL NOW TOO, WHICH IS THE SAME IDEA (Aug 2026)
   *
   * It was `glassColour` — the CARD tone — so on a bright page the column was a
   * near-white sheet on a near-white page. Two things went wrong at once and
   * both are arithmetic rather than taste:
   *
   *  1. There was no room left for it to separate. A card is 1.13:1 off this
   *     page and a panel has to sit inside that, under it.
   *  2. THE SPECULAR HAD NOWHERE TO GO. A white highlight on a 0.946-luminance
   *     pane lifted it by 1%, where the material's own test asks for 2% — and
   *     the alpha that would have bought 2% is 0.625, which is not a highlight,
   *     it is white paint. That is the identical failure recorded on
   *     `glassColour` when light's pane sat at 96% white, arriving from the
   *     other side.
   *
   * So the light column goes DOWN off the page rather than up — the page taken
   * three quarters of the way to the hairline tone — and that is the same change
   * of idea dark made: a panel darker than the page is a thing the page is lit
   * IN FRONT OF, which is what a navigation rail beside a lit room is. Measured:
   * 1.09:1 off the page (floor 1.08, card 1.13), the sheen lifts it 5.2% where
   * the floor is 2%, and every label on it gains contrast rather than losing it.
   *
   * ⚠ IT IS NO LONGER `--c-glass`, IN EITHER THEME. The MATERIAL is still shared
   * — same blur, saturation, streak, lit edge and grain, and the contrast suite
   * asserts that — and only the colour is the surface's own.
   */
  /**
   * ── AND LIGHT'S RAIL IS THE PASTEL NOW, NOT THE PAGE TAKEN DOWN (Aug 2026) ─
   *
   * The direction is unchanged and so is every measured claim about it: the
   * column is BELOW the page, it is the surface the page is lit in front of.
   * What changed is where the tone comes from. It was `mix(surface, ink, 0.07)`
   * — the page a few steps toward black, which is a page-coloured column, i.e.
   * the flat monotone the second pass exists to answer. It is `lightNeutral
   * .pastel` a touch further down instead, so the rail carries the same
   * secondary colour every pane does and the two read as one register.
   */
  out['--c-panel'] = dark
    ? mix(nightBase, '#000000', 0.72)
    : lightNeutral.rail;
  // The alpha itself is PANEL_WASH_ALPHA below rather than a variable here,
  // because it is an opacity and not a colour: everything in this map is a hex
  // that themeCssVars turns into channels.

  /**
   * The sidebar's right-hand hairline — and it is PER THEME, which the `taupe`
   * step it replaced was not.
   *
   * It is the whole of the separation wherever the glow does not reach, which
   * on a wide window is most of the column, so it has to hold on its own. One
   * step of the taupe scale is worth very different amounts against a cream
   * page and a near-black one: taupe[600] measures 1.88:1 in light and 3.40:1
   * in dark. So light takes another step (taupe[700], 2.58:1) and dark stays
   * where it is — a further step there would be 5.12:1, which is a line of
   * light down the side of the page rather than a hairline.
   */
  out['--c-panel-edge'] = dark ? darkScales.taupe[600] : scales.taupe[700];

  /**
   * ── GLASS ──────────────────────────────────────────────────────────────
   *
   * GLASS, NOT FILL, IS HOW A SURFACE SEPARATES ITSELF FROM THE PAGE HERE.
   *
   * The rule the whole dark theme turns on is that nothing may paint an opaque
   * background over the corner glow — and that rule is what unpinned the
   * results control bar, because a sticky element with no surface has the page
   * scrolling straight through it and the only fix anybody reached for was a
   * solid fill. Glass answers both at once: it is a surface, and the light and
   * the content behind it still come through, diffused.
   *
   * THIS IS THE COLOUR, and it is the CARD surface rather than the page. A
   * glass sheet the colour of the page is invisible against the page; the card
   * tone is the one already established as "a thing sitting above the page",
   * so the bar reads as the same material family as everything else on it.
   *
   * The alpha is GLASS.wash and the blur is GLASS.blur, both emitted by
   * tailwind.config.ts, because an opacity and a length are not colours and
   * everything in this map is a hex.
   *
   * THE SIDEBAR TAKES THIS COLOUR TOO, at its own alpha (changed Aug 2026 —
   * see `--c-panel` above, which is now set from the same expression). It used
   * to take espresso, on the reasoning that its alpha is decided by what is
   * behind it. Its ALPHA is; its colour is not, and giving one translucent
   * surface in the product a colour of its own is what stopped the column
   * reading as the same material as everything else pinned to the page.
   */
  out['--c-glass'] = glassColour;

  /**
   * ── THE PAGE-SURFACE PANE'S OWN TINT ───────────────────────────────────
   *
   * The same glass, carrying a trace of the theme's SECOND ACCENT — teal in
   * dark, slate in light, matching the counter-light each theme is lit by, so a
   * pane looks like glass in a room with two lamps in it rather than like a
   * fifth surface colour.
   *
   * A SEPARATE TOKEN RATHER THAN A CHANGE TO `--c-glass`, and that is the whole
   * reason it exists. `--c-glass` is shared with `--c-panel`: tinting it would
   * move the sidebar, the pinned control bar, the chart tooltip and the download
   * button at once, and every one of those has a contrast figure pinned in
   * tokenContrast.test.ts against a surface whose colour is part of the
   * measurement. A new surface takes a new colour; nothing already solved moves.
   */
  /**
   * ⚠ THE LIGHT SIDE TINTS TOWARD A LIGHT STEP, NOT THE BASE. Mixing a
   * near-white pane 8% toward `slate[500]` darkened it back down ONTO the page —
   * measured at 1.000:1, a pane indistinguishable from the surface behind it.
   * The tint is meant to be a cast, not a shade, so on a light ground it comes
   * from a light step of the same hue. Dark keeps the base: there, mixing toward
   * the accent lifts, which is the direction that surface wants anyway.
   */
  /**
   * ── AND IN LIGHT IT IS THE SECONDARY REGISTER ITSELF (Aug 2026) ──────────
   *
   * It was the glass colour with 8% of a light teal step mixed in, which on a
   * near-white pane is a cast rather than a colour — and with the alpha at 0.46
   * over the page, less than half of that cast reached the screen. A section on
   * this page is meant to CARRY the pastel, so the light pane takes
   * `lightNeutral.pastel` outright and the tint constant applies to dark only.
   * The pane is still bounded by the same three claims it always was: a visible
   * surface, below a card, and every label on it at AA over its own streak.
   */
  out['--c-glass-panel'] = dark
    ? mix(glassColour, darkAccentScales.teal[500], GLASS_ACCENT_TINT)
    : lightNeutral.pastel;

  /**
   * The hairline of light along a pane's top and lit side. Warm white in light,
   * and in dark the sheen colour carried a little toward the teal fill — the
   * edge of a pane picks up whatever is lighting it, and in dark the thing
   * nearest most panes' lower-left edge is the second source.
   */
  out['--c-glass-edge'] = dark ? mix(mix('#ffffff', glowPrimary, 0.34), darkAccentScales.teal[400], 0.22) : brand.white;

  /**
   * ── VELLUM: THE SECOND SURFACE REGISTER (Aug 2026) ──────────────────────
   *
   * The product had exactly one move — near-black plus a gold corner glow, or
   * cream plus the same layout — and every screen was therefore the same
   * weight. Nothing changed as a reader moved between pages, so nothing told
   * them they had moved.
   *
   * ONE CLASS OF CONTENT GETS THIS, AND IT IS EXPLANATORY PROSE: the marker
   * explanation card, and the same component wherever else it appears
   * (Understanding results). It is the only content in the portal that is
   * WRITING rather than DATA — everything else on a results page is a number, a
   * range, a status or a date — and the move from "what was measured" to "what
   * it means" is the one boundary in this product worth marking with a change
   * of ground rather than another heading. It also happens to be where somebody
   * settles in to read a few hundred words, and a reading surface is a real
   * thing rather than a decorative one.
   *
   * THE OPERATION IS "TOWARD PAPER", NOT "UP ONE RUNG", and that is why it goes
   * in opposite directions in the two themes. Paper is warm and mid-toned: on a
   * near-black page it is lighter than the card, and on a page whose card is
   * already a near-white it is a shade deeper and distinctly warmer. Measured:
   *
   *     light  #f0ede7 — 1.14:1 off the page, 1.14:1 off the card, text 9.3:1
   *     dark   #3d3933 — 1.66:1 off the page, 1.30:1 off the card, text 9.8:1
   *
   * IT DOES NOT BREAK THE LADDER. page → panel → card is untouched in both
   * themes and tokenContrast.test.ts still holds it; the vellum is a REGISTER
   * beside that ladder rather than a rung on it. And it does not fight the
   * glow, because it is a card-sized surface and not a page background — the
   * rule that nothing may paint over the glow is about the shell, and cards
   * have always been opaque.
   *
   * NO NEW HUE. Light is cream carried toward white; dark is the night base
   * carried toward the same warm mid-brown the surface scale already lifts
   * with. Both are inside bronze / espresso / cream / taupe.
   */
  out['--c-vellum'] = dark ? mix(nightBase, nightLift, 0.36) : mix(scales.cream[50], lightNeutral.surface, 0.5);

  /**
   * Text and icons on a FILLED accent — a bronze button, a selected option, an
   * avatar, the current step of a progress bar.
   *
   * This has to flip with the theme, and it is the one pairing that a naive
   * dark mode gets wrong every time. In dark, bronze is LIGHTENED so it clears
   * AA against a near-black page — at which point a light label on it measures
   * about 1.9:1, which is unreadable. So in dark the label goes dark instead.
   *
   * In light it is white rather than cream, and that is not a stylistic
   * preference either: cream on bronze measures 4.18:1, which fails AA for the
   * label on the product's primary button. White clears it. The "never pure
   * white" rule this palette carries is about SURFACES — a hard-white card on
   * cream reads as a cutout — and has never applied to type sitting on a fill.
   *
   * Deliberately NOT the same token as `oncolor` (staticTokens), which is the
   * light text on the atmospheric night panels. Those are dark in both themes
   * and their text must stay light in both; these fills are not.
   */
  out['--c-onaccent'] = dark ? mix(darkPage, '#000000', 0.25) : brand.white;

  /**
   * THE OPAQUE BAND FILLS, solved before the per-role loop because the two
   * HINGES are derived from the three STATES rather than from their own brand
   * hue — see BAND_FILL. Olive is exactly half of the green fill and the gold
   * one; orange is exactly half of the gold and the red. That is the claim a
   * boundary blend makes, made where the blend is actually drawn.
   *
   * ── AND "HALF" IS MEASURED IN OKLCH NOW, NOT IN sRGB (Aug 2026) ──────────
   *
   * The claim was always "a result sitting exactly on the limit is drawn exactly
   * half in each colour". `mix()` made that claim in sRGB, where a straight line
   * between two colours passes through the middle of the cube — and the middle
   * of the cube is grey. Measured on the green fill and the clean yellow:
   * sRGB's midpoint is **#cdae62**, a dull gold LESS colourful than either
   * endpoint, which is the whole of "green to yellow passes through olive".
   * OKLCH's is **#c9d165**, a bright yellow-green.
   *
   * The claim is unchanged; the space it is measured in is one where "half"
   * means what a reader thinks it means. See `oklchMix`.
   */
  const bandFill = (hue: 'green' | 'yellow' | 'red' | 'optimal'): string => {
    const { saturation, lightness } = BAND_FILL[hue];
    return reLightness(hue === 'optimal' ? statusHue.green : statusHue[hue], lightness, saturation);
  };
  const FILL: Record<StatusHue, string> = {
    green: bandFill('green'),
    yellow: bandFill('yellow'),
    red: bandFill('red'),
    olive: oklchMix(bandFill('green'), bandFill('yellow'), 0.5),
    orange: oklchMix(bandFill('yellow'), bandFill('red'), 0.5),
  };

  /**
   * ═══ THE TREND LINE AND ITS POINT MARKS — SOLVED AGAINST THE CARD ═══════
   *
   * The chart has no bands and no plot panel any more (Aug 2026): the line is
   * drawn straight onto the card, so the card is the only surface it has to
   * clear and `tintTowards` IS the card. See `solveAgainst` and
   * `LINE_FILL_TARGET` for the objective; the short version is "the most
   * colourful this brand hue gets while still standing 3.2:1 off the card".
   *
   * NOT `themedHue`. The dark lift exists to make a hue visible as a WASH on a
   * near-black surface; here the solver is already looking at that surface and
   * pre-lifting the input would bound the answer for no reason.
   *
   * THE TWO HINGES ARE MIDPOINTS, unchanged in kind from every previous solve:
   * olive is exactly half the green and the gold, orange half the gold and the
   * red. A hinge is where the line crosses a boundary, so it has to be half of
   * each on the same terms — and solving one independently is what once drew a
   * chartreuse stripe through the middle of a blend.
   */
  const MARK: Record<StatusHue, string> = SOLVED[mode].line;

  // The five hues, per role. Emitted per HUE and not only per status because
  // the two HINGES are real tokens here — olive at a reference bound, orange at
  // a significantly-out threshold, each the midpoint of the gradient centred on
  // its own boundary — while neither is ever a status of its own.
  /**
   * ── LIGHT IS THE REFERENCE FOR EVERY TRANSLUCENT TINT (Aug 2026) ─────────
   *
   * The light wash and the light bar fill are computed FIRST, in both themes,
   * and dark is then solved to their chroma and to their presence on their own
   * card — see `solveTint`. That is the whole of "bring dark into line with
   * light's, re-derived for the dark ground rather than reused directly": the
   * numbers being matched are measurements of light, and the colour that
   * matches them is solved against the dark card.
   */
  for (const hue of Object.keys(statusHue) as StatusHue[]) {
    const h = themedHue(hue);
    // THE CARD WASH and THE BAR FILL are the two translucent tints a patient
    // reads — the wash under a result card, and the fill of a summary bar or a
    // chip. Both are matched to light rather than mixed from a pre-lifted hue.
    out[`--c-hue-${hue}-wash`] = SOLVED[mode].wash[hue];
    out[`--c-hue-${hue}-band`] = dark ? darkFill(hue, 'band') : mix(tintTowards, h, TINT_MIX.band);
    // THE OPAQUE BAND FILL — the chart's bands and the range bars' track, one
    // colour, drawn at full opacity in both. It used to be `-plot`, a hue meant
    // to be composited at BAND_WEIGHT; see BAND_FILL for why an alpha was the
    // ceiling on how much colour a band could carry.
    out[`--c-hue-${hue}-fill`] = FILL[hue];
    // The summary bars and the breakdown chips. Matched to light for the same
    // reason the wash is: a gold segment in a category bar was a different
    // gold in the two themes, and dark's was the weaker one.
    out[`--c-hue-${hue}-track`] = SOLVED[mode].track[hue];
    out[`--c-hue-${hue}-edge`] = dark ? darkFill(hue, 'edge') : mix(tintTowards, h, TINT_MIX.edge);
    // THE TREND LINE'S OWN COLOUR AT THIS HUE, and the point mark standing on
    // it. Solved against every band rather than mixed toward the text tone —
    // see MARK_FILL for why the mixing had to go.
    out[`--c-hue-${hue}-mark`] = MARK[hue];
  }

  for (const key of Object.keys(status) as StatusKey[]) {
    // SOLVED IN DARK, against the four surfaces a status word actually lands
    // on — its own wash first, because that is the tightest of them and the one
    // that moved. See `solveTokens`. Light stays as the authored
    // `statusTextHex`, which measures 4.74:1 at its worst against the same four
    // and did not move (light's washes are unchanged by the tint re-solve).
    //
    // Only the three STATES have a label. Olive and orange are hinges and are
    // never a status, so `status[key].hue` is one of three by construction —
    // stated in the type rather than left to a `Record` lookup returning
    // undefined, which is how a bare `var()` reaches an element and renders it
    // black. See the warning on tintSet.
    out[`--c-status-${kebab(key)}`] = SOLVED[mode].label[status[key].hue as 'green' | 'yellow' | 'red'];
    // Aliases onto the hue this state resolves to. Kept as their own variables
    // so a component asks for "the significantly-high tint" rather than having
    // to know that significantly-high happens to be red.
    const hue = STATUS_TINT_HUE[key];
    for (const [role, name] of [
      ['wash', ''],
      ['bar', '-bar'],
      ['band', '-band'],
      ['fill', '-fill'],
      ['edge', '-edge'],
      ['mark', '-mark'],
    ] as const) {
      const source = role === 'bar' ? 'track' : role;
      out[`--c-tint-${kebab(key)}${name}`] = out[`--c-hue-${hue}-${source}`];
    }
    // The marker card's status OUTLINE, aliased onto the state so a component
    // asks for "the significantly-high outline" rather than having to know that
    // significantly-high happens to be red. Per theme, unlike the plate it
    // replaced: a border is thin, so what matters is how it stands off the pane
    // it is drawn on, and the two panes are nothing like each other.
    out[`--c-outline-${kebab(key)}`] = statusOutline(mode, OUTLINE_HUE[key]);
  }

  /**
   * The same outline per HUE rather than per state, which is the only way to
   * reach the two HINGES. The at-a-glance strip's ring runs gold to green to
   * gold across its own three segments, and the colour halfway between two
   * status colours is a hinge: olive between green and gold, orange between gold
   * and red, exactly as the gauge's own gradient uses them.
   *
   * ⚠ AND THE HINGE IS THE OKLCH MIDPOINT OF THE TWO OUTLINES, not `statusHue
   * .olive` rendered at the same depth. A straight sRGB line between a green and
   * a gold passes through the middle of the cube and the middle of the cube is
   * grey, which is the fact this file records against the gauge's own ramp. Same
   * blend, same reason, one ring further out.
   */
  const outlineHue = (hue: 'green' | 'yellow' | 'red') => statusOutline(mode, hue);
  out['--c-outline-green'] = outlineHue('green');
  out['--c-outline-yellow'] = outlineHue('yellow');
  out['--c-outline-red'] = outlineHue('red');
  out['--c-outline-olive'] = oklchMix(outlineHue('green'), outlineHue('yellow'), 0.5);
  out['--c-outline-orange'] = oklchMix(outlineHue('yellow'), outlineHue('red'), 0.5);

  // Charts. The bands and the point fills now take the status hues above (see
  // `--c-tint-*-band`); everything structural — axes, gridlines, the trend
  // line itself, the optimal band — stays on the four brand hues, so the only
  // colour in a chart that means anything is the colour that means status.
  /**
   * THE LINE, BRIGHTENED BECAUSE THE BANDS GOT HEAVIER (Aug 2026).
   *
   * The rule the redesign was given is the right way round and worth keeping
   * written down: if brighter bands bury the line, brighten the LINE — never
   * dull the bands back down. The line is the content and the bands are the
   * context, and that ordering is a fact about the chart rather than about how
   * much ink is on it.
   *
   * So it steps AWAY from the surface in each theme rather than staying at the
   * brand bronze. It was `bronze-700` light / `bronze-500` dark, which cleared
   * the composited bands and does NOT clear the painted ones — 2.87:1 and
   * 2.42:1 on the significantly-out red, i.e. under AA-large, a line lost in
   * its own context. It is solved now, at bronze's own hue and saturation and
   * at the lightness that clears 3.3:1 on every band including the optimal
   * narrowing: see LINE_LIFT for why it is solved rather than stepped further
   * along a scale whose dark end has had the bronze mixed out of it.
   * Paired with `chart.lineWidth`.
   */
  // Bronze's OWN saturation, and nothing higher — the bronze hue sits at 19°,
  // between the status red at 8° and the status orange at 30°, so a saturated
  // bronze line would read as a status colour crossing the plot.
  out['--c-chart-line'] = reLightness(
    brand.bronze,
    LINE_LIFT.lightness,
    LINE_LIFT.saturation === 'own' ? ownSaturation(brand.bronze) : LINE_LIFT.saturation,
  );
  out['--c-chart-point'] = out['--c-chart-line'];
  /**
   * ── THE BOUNDARY HAIRLINES, ON THE CARD (Aug 2026) ──────────────────────
   *
   * With the bands gone these four rules are the ONLY thing on the chart
   * saying where the reference range is, so they matter more than they ever
   * did — and they are drawn on the card rather than on a painted band, which
   * means the old `--c-chart-reference-edge` (solved against the five fills,
   * and still right for the range bar's ticks) is solved against the wrong
   * surface for them.
   *
   * Solved here at **2.6:1 off the card**, in each theme. That window is the
   * one this product has always held a boundary to: below about 1.6 it is a
   * rumour, and past about 3.5 it starts competing with the reader's own line.
   * 2.6 sits in the middle and is "thin, quiet, unmistakably there".
   *
   * Neutral by construction — it is derived from `taupe`, which is the
   * palette's border family, and never from a status hue. It is the layer that
   * has to survive the colour being taken away, so it cannot be made of
   * colour.
   */
  out['--c-chart-bound'] = SOLVED[mode].bound;
  /**
   * The ring around a plotted point, and it is THE CARD'S OWN SURFACE in both
   * themes rather than white in light and the card in dark.
   *
   * A point is drawn on top of the line, so the ring is what makes the line
   * appear to pass BEHIND it rather than to stop at it — and that illusion only
   * works if the ring is the colour the plot would be if nothing were drawn
   * there. In dark that was already the card. In light it was pure white, which
   * on a `cream-50` card is a faint cold halo around every point; small, and
   * the sort of small that reads as a rendering artefact rather than as a
   * choice.
   */
  // The ring that makes the line appear to pass BEHIND a point rather than to
  // stop at it. It only works if the ring is the colour the ground would be
  // with nothing drawn there — and since the chart has no plot panel any more,
  // that ground is THE CARD, in each theme. It was `PLOT_SURFACE`, which on a
  // dark card would now paint a pale halo round every point.
  out['--c-chart-point-ring'] = tintTowards;
  /**
   * The hairline that bounds a band — AND IT WENT DARKER IN LIGHT (Aug 2026).
   *
   * It has one job that nothing else can do: with the bands blending across a
   * boundary rather than meeting at a step, this line is the only thing saying
   * exactly where the reference bound is, and it is the thing that has to
   * survive the colour being taken away. At `taupe-600` over the new
   * significantly-out band it measured **1.11:1** — a line nobody can see,
   * drawn across the one region where being able to see it matters most.
   *
   * `taupe-900` in light and `taupe-800` in dark: 2.05:1 and 2.32:1 on that
   * same band, which is a hairline in both themes rather than a hairline in one
   * and a rumour in the other. It is deliberately not `espresso`, which at
   * 2.57:1 starts to compete with the trend line — the boundary is furniture
   * and the reader's own result is not.
   */
  // ── AND SINCE Aug 2026 THIS IS THE RANGE BAR'S, AND ONLY THE RANGE BAR'S.
  // It is solved against the five painted band FILLS, which is exactly right
  // for the two reference-bound ticks and the optimal edges on a bar and
  // exactly wrong for the trend chart, whose boundary rules are now drawn on
  // the card. Those take `--c-chart-bound` above, solved against the card in
  // each theme. Two grounds, two tokens; one token drawn on two grounds is how
  // a hairline ends up at 1.1:1 on one of them.
  //
  // SOLVED AT ITS DRAWN OPACITY, not as a bare token — the hairline is
  // composited at `chart.referenceEdgeOpacity` over the band, and the only
  // number that means anything is what that composite measures against the band
  // underneath it. At this value the DRAWN line runs 1.70–2.04:1 across all
  // five fills and the optimal narrowing, which is inside the 1.6–3.5 window
  // this has always been held to: visible on every band, and never the loudest
  // thing on the plot.
  //
  // Deliberately not espresso, which starts to compete with the trend line — a
  // boundary is furniture and the reader's own result is not.
  /**
   * 0.317 → 0.37 with the retheme, and it is squeezed from BOTH sides — which
   * is why it was solved rather than nudged. The hairline is drawn at 55% over a
   * band, and it has to be strong enough to mark the boundary there (>1.6:1 on
   * every fill) and light enough to be visible as a rule on the DARK key
   * swatches (>1.3:1). Those pull in opposite directions, and the neutral border
   * tone it is derived from moved both.
   *
   * Swept at 0.01 across 0.30–0.50: below 0.35 the dark green swatch fails
   * (1.15:1 at the old figure — a boundary you cannot see on the one surface
   * where a boundary must survive greyscale), and at 0.40 and above the yellow
   * band's boundary drops under 1.6. The window is 0.35–0.39 and this sits in
   * the middle of it: boundary 1.675–1.968, swatch 1.403.
   */
  out['--c-chart-reference-edge'] = reLightness(brand.taupe, 0.37, ownSaturation(brand.taupe));
  /**
   * THE OPTIMAL NARROWING, AS AN OPAQUE FILL of its own (Aug 2026).
   *
   * It was the green band's own colour drawn OVER the green band at a small
   * alpha — 0.09 on the chart, 0.24 of the green edge on a range bar, two
   * numbers for one idea, and both of them alpha in a system where a band no
   * longer has any. So the deepening is a colour now, in the one place colours
   * are decided: the same green as the in-range band, one rung further along
   * the ladder. 1.14:1 off the band it sits inside, in both themes — visible as
   * a shading-in and nothing like the step a boundary makes.
   *
   * The two bronze tokens that used to be here (`--c-chart-optimal-band` /
   * `-edge`) are gone with the hatched band they painted; see the note on
   * `chart` below.
   */
  out['--c-band-optimal'] = bandFill('optimal');
  /**
   * ── AND EVERYTHING DRAWN ON THE CHART IS THEME-AWARE AGAIN (Aug 2026) ────
   *
   * These were STATIC, and the note here said so in capitals: the plot was a
   * #edeae2 panel in both themes, so a tick label taken from the theme's own
   * scales put a near-white cream on a near-white panel at 1.09:1.
   *
   * There is no panel. The axis, its ticks and the cursor are drawn on the
   * CARD now, so the exact opposite is true — a static espresso tick label on
   * a near-black dark card measures about 1.1:1, which is the identical
   * failure with the themes swapped. They follow the theme.
   */
  out['--c-chart-axis-line'] = dark ? darkScales.taupe[500] : mix(lightNeutral.border, lightNeutral.ink, 0.22);
  out['--c-chart-axis-text'] = dark ? darkScales.espresso[600] : mix(lightNeutral.ink, lightNeutral.surface, 0.25);
  out['--c-chart-gridline'] = dark ? darkScales.taupe[400] : mix(lightNeutral.surface, lightNeutral.border, 0.5);
  out['--c-chart-cursor'] = dark ? darkScales.taupe[700] : mix(lightNeutral.border, lightNeutral.ink, 0.42);
  // The card the chart is drawn on — what a point mark is filled with so the
  // line passes behind it. One expression with `tintTowards`, which is the
  // same card every wash is mixed from.
  out['--c-chart-surface'] = tintTowards;
  /**
   * ── THE SPARK: A WHITE CORE, AND A HALO THAT IS NOT ALWAYS WHITE ─────────
   *
   * The core is pure white in BOTH themes and carries no status — see SPARK.
   * Under `@media print` tailwind.config.ts overrides it to espresso, because
   * the halo is zero there and a white dot on white paper is no dot at all.
   *
   * The halo is the half that has to differ, and it differs in KIND rather
   * than in amount. In dark it is white: light added to a near-black card,
   * which is what emission is. In light a white halo on a cream card measures
   * 1.05:1 — it is not a dim bloom, it is nothing — so it is a warm DARK
   * instead and the core reads as the brightest point inside a soft shadow.
   * Espresso rather than black, for the same reason every shadow in this
   * product is espresso-derived: a neutral grey smudge on cream is the one
   * thing the palette has never allowed.
   */
  out['--c-chart-spark-core'] = '#ffffff';
  out['--c-chart-spark-halo'] = dark ? '#ffffff' : brand.espresso;
  /**
   * ── THE GROUND THE BAND LADDER IS SOLVED AGAINST (Aug 2026) ─────────────
   *
   * `PLOT_SURFACE` outlived the plot. It is no longer a panel anybody draws —
   * the chart is on the card — but it is still the surface `BAND_CONTRAST`
   * measures each of the five fills against, and it is still VISIBLE in one
   * place: the ring around a range bar's mark, which is what makes the mark
   * read as sitting on the track rather than in it.
   *
   * So the token stays, and its meaning has narrowed rather than gone. It is
   * what `tokenContrast.test.ts` measures the ladder against, and if it ever
   * moves the five fills are solved again.
   */
  out['--c-chart-plot-surface'] = PLOT_SURFACE;
  /**
   * ── THE PLOT PANEL IS GONE, AND SO ARE ITS FOUR TOKENS (Aug 2026) ────────
   *
   * `--c-chart-plot-surface`, `-plot-frame`, `-plot-inset`, `-plot-ink` and
   * `-plot-ink-muted` were the light inset panel the bands were drawn on: a
   * warm off-white rectangle, a frame at two weights, a two-gradient inner
   * shadow, and a static ink pair for everything printed inside it. With no
   * bands there is nothing to give a ground to, and a bright rectangle on a
   * near-black card with a line in it is a picture pasted into the page. The
   * chart is drawn ON the card.
   *
   * `PLOT_SURFACE` itself survives, because the RANGE BAR still paints its
   * five segments and still needs a ground for its own mark's ring.
   */
  /**
   * A reference bound on the axis: full ink against the muted ticks, so the
   * difference between "where the scale happens to be marked" and "a clinical
   * threshold" is carried by weight rather than by a hue. Theme-aware now,
   * with everything else that moved off the panel and onto the card.
   */
  out['--c-chart-bound-label'] = dark ? darkScales.espresso[500] : brand.espresso;

  /**
   * THE RESULT MARK ON A RANGE BAR — the dot on the full bar and the pointer on
   * the card-sized one — and the ring around it.
   *
   * It used to be filled with its own status hue. On a track made of that same
   * hue that is a mark drawn in the colour it is standing on: the dot on an
   * in-range result was a green dot on a green segment, and the one on a high
   * result was pale yellow on gold. The mark's job is POSITION — "your result is
   * here" — and the status is already said by the segment it lands on, by the
   * chevron, by the word and by the card's own wash. So the mark stops carrying
   * colour and starts being visible.
   *
   * THE FILL IS NOT THE SAME IN BOTH THEMES, and it is measured rather than
   * chosen. Against the four track colours, pure white gives 4.69–5.71:1 in
   * dark and only 1.73–2.72:1 in light — the pale green in-range track is
   * 2.11:1, which is a white dot that vanishes. So dark gets the white that was
   * asked for and light gets espresso, which is 4.00–6.29:1 on the same four.
   * The ring inverts with it, so there is always a dark mark inside a light ring
   * or a light mark inside a dark one, whichever way round the theme is.
   *
   * `#ffffff` and not `cream`: cream in dark mode is #f0ede7, which against a
   * gold track reads as a slightly dirty version of the track. This is the one
   * pure white in the product and it is a 14px dot.
   */
  // ONE COLOUR IN BOTH THEMES, since the bar is drawn on PLOT_SURFACE in both.
  // It used to invert — white in dark, espresso in light — because the track's
  // ground did. Measured on the five band fills the bar actually paints:
  // espresso is 4.02–6.05:1, white is 1.80–2.71:1. There is nothing left for a
  // white dot to be the right answer to.
  out['--c-rangemark'] = brand.espresso;
  out['--c-rangemark-ring'] = PLOT_SURFACE;

  // Shadow colour, derived from espresso in BOTH themes — nothing in this
  // system is ever a neutral grey, shadows least of all.
  //
  // Light is espresso itself, so depth stays warm. Dark is espresso taken 88%
  // of the way to black rather than to black outright: the depth on a warm
  // near-black surface has to come from darkness, and a shadow with much warmth
  // left in it is a smudge — but a shadow with NONE is the one cool thing on an
  // entirely warm page, and at the corner of a card it shows.
  out['--c-shadow'] = dark ? mix(brand.espresso, '#000000', 0.88) : lightNeutral.ink;

  /**
   * The ambient light source (dark mode only — see `.dark body::before` in
   * globals.css).
   *
   * ONE radial gradient, anchored at one corner of the viewport, with a defined
   * bright centre that falls away to nothing well before the opposite corner.
   * It is a light SOURCE and has to read as one: brightest at a point, dimming
   * outward, gone. What it was instead was a pair of radials at 112% and 140%
   * of the viewport, which put the entire page inside the bright part of the
   * curve — every pixel got roughly the same 5–15% of gold, so it was not a
   * glow at all, it was a flat brown wash over a brown page. The falloff was
   * technically present and nowhere visible.
   *
   * Gold-bronze, and pushed further toward gold than it was: the brand accent
   * alone reads as a brown stain, and a neutral white glow turns the whole warm
   * palette grey the moment it lands on anything. The centre is bright enough
   * to be a source on a #110F0D page and the tail reaches zero at the hue
   * itself rather than at `transparent` — see globals.css, where fading to
   * `transparent` would fade through a grey shoulder.
   *
   * ── AND LIGHT MODE PAINTS IT NOW, AT ITS OWN VALUE (Aug 2026) ──────────
   *
   * This used to be emitted in light and never drawn, so one hex covered both
   * themes by not being used in one of them. Light mode was flat cream with
   * nothing happening in it, which is the same complaint the dark page had
   * before the glow existed, and the fix is the same fix.
   *
   * BUT IT CANNOT BE THE SAME HEX, because a glow on a light ground is not the
   * same phenomenon. On near-black, a glow is LIGHT ADDED and has to be lighter
   * than the page. On cream there is nothing to add — a pale gold over #e3dfd3
   * is invisible, measured at 1.02:1 — so what reads as warmth in a corner is
   * colour taken slightly DOWN and further into the hue. Same source, same
   * position, opposite direction, exactly as the trend chart's spark halo goes
   * white in dark and warm-dark in light for the identical reason.
   */
  out['--c-glow'] = glowPrimary;

  /**
   * ── THE SECOND SOURCE (Aug 2026) ───────────────────────────────────────
   *
   * One light in one corner gives a page a direction. Two give it DEPTH, and
   * the second one has to differ in hue or the two read as one wash that
   * happens to be wide — which is precisely the failure the original pair of
   * radials had, recorded above.
   *
   * It is anchored down the LEFT EDGE (see globals.css) and it
   * is the cooler, quieter of the two in both themes: a key light and a fill,
   * which is what a room actually has. It never approaches the primary's
   * strength — `GLOW.secondary` is half of `GLOW.primary` in dark and a little
   * under it in light — because two equal sources cancel each other's direction
   * and the page goes flat again with more colour in it.
   *
   * WHY THE HUE DIFFERS BETWEEN THE THEMES, and it is the same argument as the
   * primary's. In dark the counter-light is TEAL: a cool fill against a warm key
   * is what separates two sources, and on near-black there is room for a
   * genuinely cool colour. In light it is SLATE, and teal is refused there — a
   * cool hue at a visible alpha over cream does not tint it, it DESATURATES it,
   * and a grey-green cast across half a medical results page is worse than no
   * second source at all. Slate is red-dominant, so it warms the corner it sits
   * in exactly as the brief asked, while being 294° from the primary and
   * nowhere near a status hue.
   */
  out['--c-glow-2'] = glowSecondary;

  /**
   * The third source, bottom right — see `glowTertiary` above for why it is a
   * mint rather than a green and why it may not be a green.
   */
  out['--c-glow-3'] = glowTertiary;

  /**
   * The diagonal ribbon. Drawn on `html::before` rather than as another layer of
   * `body::before`, so it sits BELOW the three radials in paint order and is one
   * declaration shared by both themes with only its colour and its peak per
   * theme. See `glowStreak` above.
   */
  out['--c-streak'] = glowStreak;

  /**
   * ── THE COLOUR OF LIGHT ON A PANE ──────────────────────────────────────
   *
   * What the specular sheen and the two edge highlights on the sidebar are
   * drawn in (see `PANEL_SHEEN` and `.panel-wash` in globals.css). It is not
   * `--c-glow`, which is the light SOURCE and is a saturated gold: a gold
   * streak down a 288px column reads as a stain rather than as a highlight.
   * It is a warm white — white in light, and white carried a little way toward
   * the glow in dark, so a reflection on this page picks up the colour of the
   * one thing lighting it without becoming that colour.
   */
  out['--c-sheen'] = dark ? mix('#ffffff', out['--c-glow'], 0.34) : brand.white;

  return out;
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

export const themeTokens = {
  light: buildThemeTokens('light'),
  dark: buildThemeTokens('dark'),
} as const;

/**
 * How much of the glass colour survives on the sidebar, per theme. Emitted as
 * `--panel-wash` by tailwind.config.ts and consumed by `.panel-wash` in
 * globals.css.
 *
 * 0.06 / 0.38 OF ESPRESSO → 0.75 / 0.78 OF THE CARD TONE (Aug 2026). The two
 * are not comparable numbers: the old pair was a faint tint of a colour far
 * from the surfaces around it, and this is most of a colour close to them. It
 * is the same alpha family as the control bar's 0.62 / 0.58, which is the
 * point — one material, one look, a per-surface alpha.
 *
 * SOLVED RATHER THAN CHOSEN, against the four things tokenContrast.test.ts
 * holds, and the binding constraint is not the one anybody expects. It is not
 * "stay below a card": it is that past roughly 0.80 in dark the panel stops
 * TRANSMITTING — its lit and unlit halves converge and the glow reads as
 * having stopped at the seam.
 *
 * ── DARK CAME DOWN TO 0.68 WHEN THE COLOUR WENT NEAR-BLACK (Aug 2026) ──────
 *
 * 0.78 was set just under that transmission ceiling for a panel drawn in the
 * CARD tone — a pale colour, where most of the alpha is spent making the
 * surface look like a surface. A near-black panel does not need the alpha for
 * that: the colour is already doing it, and every point of alpha spent is a
 * point of the ambient light thrown away. Measured across the four candidate
 * colours: at 0.78 the lit half of the column stands 1.09:1 above the unlit
 * half, which is under the floor and reads as a lid; at 0.68 it is 1.16:1, and
 * the glow adds 0.0083 of luminance where it lands rather than 0.0043.
 *
 * So it is more transparent AND darker, which is not a contradiction — those
 * were only ever coupled because the fill was the thing being asked to look
 * like a panel.
 */
export const PANEL_WASH_ALPHA = { light: 0.86, dark: 0.68 } as const;

/**
 * THE GLASS MATERIAL, in three numbers, shared by every surface that uses it.
 *
 * One blur radius and one saturation across the product, so the pinned control
 * bar, the sidebar, the chart tooltip and the download button are the same
 * material rather than four things that happen to be blurred. Only the alpha
 * differs per surface, and only because what is behind them differs — see the
 * note on `--c-glass`.
 *
 * `blur` WAS 14px "as a budget rather than a taste", which is a guess with a
 * unit on it. It has now been measured, and the measurement changed the number
 * and — more usefully — the reasoning.
 *
 * MEASURED (e2e/zz-render-timing.spec.ts, "glass scroll cost"): a continuous
 * 3-second scroll of the by-marker view, 166 cards, with the control bar
 * pinned so the filter is actually compositing.
 *
 *     backdrop-filter off   60 fps · median 16.7ms · 0 frames over 20ms
 *     blur 14px             23 fps · median 50.0ms · 66 frames over 20ms
 *     blur 10px             39 fps · median 16.7ms · 50 frames over 20ms
 *     blur  8px             31 fps · median 33.3ms
 *     blur  6px             25 fps · median 33.4ms
 *     blur  2px             25 fps · median 33.4ms
 *
 * THE RADIUS IS NOT THE COST. 2px is as expensive as 14px and both are a third
 * of the frame rate with the filter absent — so what is being paid for is the
 * EXISTENCE of the backdrop pass (a render surface, re-composited every frame
 * the element is on screen), not the work inside it. "Reduce the radius until
 * it stops dropping frames" has no answer above zero.
 *
 * WHAT THAT MEASUREMENT IS AND IS NOT. It is headless Chromium, which rasterises
 * in software (SwiftShader) — the worst case for a backdrop filter and not what
 * anybody's browser does. A GPU-composited backdrop filter is close to free.
 * So this is a floor, not a verdict, and it is NOT grounds for replacing the
 * material with an opaque fill: that would paint over the corner glow, which is
 * the thing glass exists to avoid.
 *
 * WHAT WAS DONE. 10px, because it is the only value that measured better and it
 * costs nothing to take — the diffusion is still unambiguous at 10 (body copy
 * underneath is a wash, not letters). WHAT IS STILL OPEN: measure this on a
 * GPU-backed browser before drawing any conclusion about the design. The number
 * to change is here; the spec that produces the table is committed.
 *
 * `saturate` is barely above 1: glass that desaturates reads as fog, and glass
 * that saturates hard reads as a colour filter. This is enough that the warm
 * page underneath stays warm through it.
 */
export const GLASS = {
  wash: { light: 0.62, dark: 0.58 },
  /**
   * ── 10px → 20px (Aug 2026) ───────────────────────────────────────────────
   *
   * The measurement above still stands and is the reason this is FREE: what a
   * backdrop filter costs is the EXISTENCE of the pass, not the work inside it
   * — 2px measured the same as 14px, a third of the frame rate with the filter
   * absent. So a radius that reads as frost costs the same as one that does
   * not, and the only argument for 10px was that it was the cheapest value that
   * measured better than 14. That argument was about a number that turns out
   * not to depend on the radius.
   *
   * Re-measured after this change with the same spec, and the frame rate is
   * where it was.
   *
   * ⚠ THE BLUR STILL SHOWS NOTHING BEHIND A FLAT SURFACE. Doubling the radius
   * does not change the note further down: blurring a smooth radial returns the
   * same smooth radial. It earns its place where content genuinely scrolls
   * under a pane, and the streak, the lit edge and the grain are what make the
   * material read as glass everywhere else.
   */
  blur: '20px',
  /**
   * ── 1.08 → 1.55 ──────────────────────────────────────────────────────────
   *
   * The old value was chosen so the warm page underneath "stays warm through
   * it", which is a floor rather than a design. What frost actually does to a
   * light source behind it is CONCENTRATE its colour: the diffusion spreads the
   * light over more of the pane and the eye reads the result as more saturated,
   * not less. At 1.08 the glow arriving through a pane was the same gold as the
   * glow beside it, so the pane was doing nothing to the light.
   *
   * The ceiling is where it stops being glass and starts being a colour filter,
   * which is roughly where a neutral surface under it picks up a visible cast.
   * 1.55 lifts the two glows clearly and leaves the cream and the near-black
   * neutral.
   */
  saturate: '1.55',
  /**
   * ── THE PAGE-SURFACE PANE (Aug 2026) ─────────────────────────────────────
   *
   * A third alpha in the family, for the big structural surfaces — the Overview
   * sections, the Results section containers, the Documents cards, the
   * explanation card, the contact card, the at-a-glance strip. It sits BETWEEN
   * the sidebar (0.75/0.78, which has only the page behind it) and the pinned
   * control bar (0.62/0.58, which has moving body copy behind it): these panes
   * have other CARDS and headings behind them when the page scrolls, which is
   * more structure than the sidebar has to diffuse and less than the bar does.
   *
   * ── 0.68 / 0.62 → 0.46 / 0.42 (Aug 2026), AND THE BOUNDARY MOVED WITH IT ──
   *
   * The panes read as "slightly glassy", and the fill was most of the reason: a
   * pane at 0.68 is two thirds an opaque card, so two thirds of whatever is
   * behind it — the ambient light most of all — was being painted over. Under
   * half lets the glow through as light rather than as a rumour of one, which
   * is the whole point of the material existing.
   *
   * ⚠ WHAT THIS COSTS, AND IT IS NOT NOTHING. A pane is a weaker surface at
   * this alpha: it sits closer to the page and further from a card, so the
   * page → pane → card ladder is tighter than it was. That is the trade the
   * lower fill buys and it is asserted rather than assumed —
   * `tokenContrast.test.ts` still holds the ladder, still holds every label on
   * a pane at AA against the brightest backdrop the material can produce, and
   * the streak and the lit edge are now carrying more of the separation than
   * the fill is.
   *
   * ⚠ AND THE ONE EXCLUSION IS NOW THE TINTED CARD, NOT THE RESULT CARD. This
   * used to say a marker result card may never be a pane, on the grounds that
   * 165 streaks is a texture rather than a material. The rule is narrower and
   * better: a card is opaque IF IT CARRIES A STATUS TINT, because that tint is
   * a clinical statement and a translucent sheet with a moving highlight over it
   * makes the one surface whose colour means something the least legible of the
   * lot. On a real report almost every measured card has a status, so almost
   * every one of those 165 is still opaque — the difference is that the rule now
   * names the reason instead of the count. `Card` refuses the two together
   * outright rather than leaving it to a call site.
   */
  /**
   * ⚠ LIGHT WENT 0.46 → 0.60 WHEN THE PANE BECAME THE SECONDARY REGISTER
   * (Aug 2026), and the reason is a screenshot rather than a preference. A pane
   * is now `lightNeutral.pastel` rather than the glass colour with a trace of
   * accent in it, and at 0.46 over a WARM page fewer than half the pastel's own
   * channels survived: a cool tint at half strength over a warm ground is a
   * NEUTRAL, and the pane rendered as the flat grey box this whole pass exists
   * to get rid of. It is the alpha that decides how much of a colour reaches the
   * screen, so a pane asked to carry a colour needs a higher one.
   *
   * Still the most transparent of the three glass surfaces, which is the claim
   * that matters and is asserted: 0.60 < the control bar's 0.62 < the sidebar's
   * 0.75.
   */
  panel: { light: 0.6, dark: 0.42 },
  /**
   * How much of the theme's SECOND ACCENT is mixed into a page pane's tint.
   *
   * Not into `--c-glass` itself, which is shared with the sidebar and the
   * control bar and whose contrast figures are pinned — this is a separate
   * colour for the new surface, so nothing already measured moves. Small on
   * purpose: at 0.08 the pane is the card tone with a cast, which is what glass
   * over a coloured room looks like; past about 0.15 it is a coloured panel and
   * the product has a fifth surface colour nobody chose.
   */
  tint: GLASS_ACCENT_TINT,
  /**
   * ── WHAT MAKES A PAGE PANE READ AS GLASS ─────────────────────────────────
   *
   * The same three effects as the sidebar, and for the same reason, which is
   * worth restating because it is the single most misdiagnosed thing in this
   * file: `backdrop-filter: blur()` blurs WHAT IS BEHIND, and behind most of
   * these panes there is a flat page colour and two smooth radials. A Gaussian
   * blur of a smooth gradient is the same smooth gradient. The blur earns its
   * place where a pane genuinely has cards scrolling under it and does nothing
   * at all where it does not, so it cannot be what carries the material.
   *
   *   peak   the specular streak, one soft diagonal band running from the top
   *          right — the corner nearest the warm key light — and gone by about
   *          two thirds across.
   *   edge   a hairline of light just inside the border along the top and the
   *          right, so border and highlight together read as thickness.
   *   grain  below the threshold of being noticed as texture and above the
   *          threshold of being noticed as absent.
   *
   * LOWER THAN THE SIDEBAR'S ON GRAIN AND HIGHER ON THE STREAK, and both for
   * the same reason: a pane is wider than it is tall where the sidebar is the
   * reverse, so a 208° band crosses far less of it and needs a little more
   * strength to register, while the grain covers several times the area and
   * needs less. Every one of these composites over the pane before any text
   * sits on it, and `tokenContrast.test.ts` runs the AA floors against the
   * brightest backdrop the streak can produce rather than against the flat
   * body colour.
   */
  sheen: {
    peak: { light: 0.33, dark: 0.09 },
    edge: { top: { light: 0.5, dark: 0.16 }, right: { light: 0.7, dark: 0.26 } },
    grain: { light: 0.022, dark: 0.038 },
  },
} as const;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TWO LIGHT SOURCES, IN BOTH THEMES — THE PEAK OF EACH RAMP (Aug 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One number per source per theme. The RAMP SHAPE is written once in
 * globals.css as multiples of these, so the two sources and the two themes are
 * the same curve at four strengths rather than four hand-written gradients that
 * drift — and so this file stays the only place a strength is decided.
 *
 * ── THE NUMBERS ARE BOUNDED BY CONTRAST, NOT BY TASTE ──────────────────────
 *
 * A glow sits at `z-index: -1` behind every scrap of content, so it cannot
 * reduce the contrast of a character directly — but it changes the GROUND that
 * character stands on, and the page is a ground. `tokenContrast.test.ts`
 * composites each source at its peak over the page and over a card and re-runs
 * every text token against the result, at the corner where each is strongest
 * AND at the corner where the two overlap. Light is the tighter case by a long
 * way: dark's glow ADDS light to a near-black page, which moves text contrast
 * the safe direction, while light's two sources both DARKEN cream, which eats
 * into the espresso-on-cream ratio directly.
 *
 * Which is why light's peaks are a quarter of dark's. They are not "subtle
 * because light mode should be subtle" — they are as strong as they can be with
 * the AA floor intact under both of them at once.
 */
export const GLOW = {
  /**
   * The key light, TOP CENTRE since Aug 2026 (it was the top-right corner).
   * Horizontally centred, hard against the top edge, so the page reads as lit
   * from above rather than from over one shoulder. Colour, radii and peak are
   * untouched; only the anchor moved.
   *
   * ── DARK CAME DOWN FROM 0.40 TO 0.36, AND IT WAS A MEASUREMENT (Aug 2026) ─
   *
   * 0.40 was the value that turned this from a flat gold wash into a light
   * SOURCE, and that reasoning is untouched. What it also did, and what nothing
   * had measured until the second source arrived and every corner was checked,
   * is put `--c-bronze` at **2.94:1 against its own core** — under the 3:1 floor
   * for large text and UI, on a page token, on the one corner of the page the
   * design draws attention to. That was true before any of this pass and would
   * have gone on being true.
   *
   * 0.36 is the nearest step that clears it with room: bronze 3.22:1, body copy
   * 7.84:1, taupe-900 5.32:1. And the room is not darker for it — there are two
   * lamps now, so the key no longer has to carry the whole page on its own, and
   * the total light on a dark viewport goes UP rather than down.
   */
  primary: { light: 0.13, dark: 0.4 },
  /**
   * The cool fill, at the left edge, vertically centred.
   *
   * ── IT HAS MOVED TWICE (Aug 2026): 20% 98% → 20% 50% → 0% 50% ───────────
   * Same colour, same radii, same peak each time; only the anchor. Off the
   * bottom corner first, because a source there reads as light coming from
   * under the page, which is not a thing a room does. Then out to the left
   * edge, so the light arrives from beside the page rather than from inside it.
   * Nothing derived from this token moved either time, and the viewport sampler
   * in `tokenContrast.test.ts` re-found the worst ground at the new position on
   * its own, which is the check that makes moving a source cheap.
   *
   * ⚠ THE 20% WAS THERE FOR A REASON AND THAT REASON IS NOW THE INTENT. The
   * patient shell's sidebar is 288px, which at 1440 is 20% of the viewport, so
   * a source at the literal edge has its CORE behind an opaque column. At 0%
   * that is deliberate: the rail is lit from behind and what reaches the
   * reading area is the ramp rather than the core.
   *
   * DARK IS HIGHER THAN IT LOOKS BECAUSE IT IS FURTHER AWAY. The fill is
   * anchored off the corner (see globals.css: the
   * patient shell's sidebar is 288px, which is 20% of a 1440 viewport, so a
   * light in the corner has its core behind an opaque column and exists nowhere
   * the reader can see it) — and moving the anchor inward puts most of the
   * content in the tail of the ramp rather than near its head. 0.26 at the core
   * is what makes it visible where it now lands. Bronze measures 4.3:1 against
   * that core, against the 3:1 floor.
   *
   * LIGHT IS BOUNDED BY SOMETHING ELSE ENTIRELY, and it is the tighter of the
   * two constraints in this whole record: slate is a far darker hue than the
   * key's gold, so it costs more contrast per unit of alpha, and light mode's
   * two sources both DARKEN cream where dark mode's add light to near-black.
   * 0.095 is as strong as it goes with the page still inside the 15% contrast
   * budget `tokenContrast.test.ts` holds the pair to — 12.5% of the bare page's
   * own body-copy ratio, measured. It is deliberately as high as that allows
   * rather than as low as looks safe: light mode was flat cream with nothing
   * happening in it, which is the complaint this exists to answer.
   */
  secondary: { light: 0.11, dark: 0.38 },
  /**
   * ── THE GREEN, BOTTOM RIGHT (Aug 2026) ────────────────────────────────────
   *
   * Quieter than the fill, which keeps the ordering key > fill > accent and
   * stops the page having three equal lamps in it — three equal sources cancel
   * each other's direction exactly as two do, with more colour in the result.
   *
   * It is anchored at the corner rather than pulled inward the way the fill was,
   * because nothing opaque covers the bottom right: the sidebar is on the left,
   * which is the whole reason the fill had to move.
   */
  tertiary: { light: 0.1, dark: 0.32 },
  /**
   * The diagonal ribbon's own peak, at the brightest point of its brightest
   * blob. Lowest of the four in both themes and deliberately so — it crosses the
   * whole viewport, so it is the source with the most of the page inside it, and
   * anything a reader notices AS a streak is too strong.
   */
  streak: { light: 0.055, dark: 0.15 },
} as const;

/**
 * ── GLASS IS NOT THE BLUR. THE BLUR IS DOING NOTHING HERE (Aug 2026) ───────
 *
 * The sidebar's computed style has been right for a while — `blur(10px)
 * saturate(1.08)`, `rgba(42,39,35,0.78)`, measured off the element by
 * e2e/patient-sidebar.spec.ts — and the column still read as a flat panel. It
 * was going to keep reading as one, and the reason is physical rather than a
 * matter of finding the right number.
 *
 * `backdrop-filter: blur()` blurs WHAT IS BEHIND THE ELEMENT. Behind this
 * element there is a flat page colour and one smooth radial gradient, and a
 * Gaussian blur of a smooth gradient is the same smooth gradient. There is
 * nothing with an edge back there to smear, so the filter has nothing to show
 * and no radius makes it appear. A previous session diagnosed exactly this and
 * was overruled; it was right. (The blur STAYS: content does scroll behind the
 * pinned control bar and the chart tooltip, which share this material, and
 * removing it there would cost something real.)
 *
 * So the panel is made to read as glass by the things that actually signal a
 * pane, none of which depend on there being texture behind it:
 *
 *   `peak`   A SPECULAR SHEEN. One soft diagonal band of light across the
 *            column, brightest at its top-right — the corner nearest the
 *            glow — and gone by roughly two thirds of the way down. This is
 *            the largest of the four effects and the one that does most of
 *            the work: a flat surface with a highlight travelling across it
 *            is read as reflective before anything else is considered.
 *   `edge`   AN INNER HIGHLIGHT ALONG THE TOP AND THE RIGHT EDGE. A hairline
 *            of light just inside the border, as though the cut edge of the
 *            pane catches the light. The right edge is stronger than the top:
 *            it is the edge that faces the room, and it sits immediately
 *            inside `--c-panel-edge`, so the two together read as thickness.
 *   `grain`  A VERY FAINT NOISE. What stops a large flat area reading as a
 *            fill; it is below the threshold of being noticed as texture and
 *            above the threshold of being noticed as absent.
 *
 * WHAT WAS ASKED FOR AND NOT DONE, AND WHY. The brief also said to raise the
 * panel's own translucency toward the glow and lower it away, so the wash has
 * a gradient rather than one value. Taken literally that is backwards in dark
 * mode: `--c-panel` is a PALE tone over a near-black page, so more of it away
 * from the light makes the far end LIGHTER than the lit end and the gradient
 * runs the wrong way — and it walks the unlit panel up toward the card, which
 * the ladder in tokenContrast.test.ts (page, then panel, then card) forbids.
 * The same intent from the other side is what is implemented: the pane is
 * brighter where the light reaches it and returns to its flat body value where
 * it does not, so the surface does have a gradient across it, drawn in light
 * rather than in opacity. `PANEL_WASH_ALPHA` is untouched and every number the
 * token tests pin still describes the panel at its darkest point.
 *
 * The peaks are held under what the AA check allows on top of the lit panel —
 * see `keeps every label on it at AA` in tokenContrast.test.ts, which now
 * composites the sheen into the brightest backdrop a nav label ever stands on.
 */
export const PANEL_SHEEN = {
  /**
   * ── DARK CAME DOWN WITH THE LIGHT IT REFLECTS (Aug 2026) ─────────────────
   *
   * 0.07 → 0.064, and it is the physical bound above doing exactly what it was
   * written to do rather than a taste adjustment. The dark key light dropped
   * from 0.40 to 0.36 (see `GLOW.primary`, where the reason is a measured
   * contrast failure on `--c-bronze`), so the amount of light landing on this
   * column dropped with it — and a reflection that stayed put would then have
   * been brighter than its own source. The test caught it in the same run.
   */
  peak: { light: 0.2, dark: 0.064 },
  edge: { top: { light: 0.45, dark: 0.14 }, right: { light: 0.65, dark: 0.24 } },
  grain: { light: 0.035, dark: 0.055 },
} as const;

/** `#8a5e45` → `138 94 69`, the channel triplet Tailwind's `<alpha-value>` syntax needs. */
export function hexToRgbChannels(hex: string): string {
  return hexToRgb(hex).join(' ');
}

/**
 * The two custom-property blocks, ready for Tailwind's `addBase`. Light is on
 * `:root` so it is the default before any JS runs; dark is on `.dark`, set by
 * the theme provider from the persisted choice or the system preference.
 */
export function themeCssVars(mode: 'light' | 'dark'): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, hex] of Object.entries(themeTokens[mode])) {
    out[name] = hexToRgbChannels(hex);
  }
  return out;
}

/**
 * Static tokens — the two families that do NOT flip with the theme.
 *
 * `night` is the atmospheric dark panel (the auth split, tooltips, the fasting
 * notice, the sidebar's hover labels). Those surfaces are dark on purpose in
 * both themes; inverting them in dark mode would turn the one deliberately
 * dark thing on the page into the one deliberately light thing.
 *
 * `oncolor` is the light text that sits on them, and on any filled accent
 * (a bronze button, a selected option). It is `cream` frozen at its light
 * value — using the theme-aware `cream` there would put dark text on a bronze
 * fill the moment someone switched to dark mode.
 */
export const staticTokens = {
  oncolor: brand.cream,
  night: {
    ...inkScale,
    /** The shallowest of the dark tones — espresso itself. The top stop of the auth panel's gradient. */
    soft: brand.espresso,
    /**
     * The brand accent AS IT APPEARS ON A NIGHT PANEL — a lightened bronze.
     * Frozen for the same reason the panel is: `bronze-300` is a pale tint in
     * light mode and a near-black one in dark, so the wordmark's dot on the
     * auth panel would simply disappear the moment someone chose dark.
     */
    accent: scales.bronze[300],
  },
} as const;

/**
 * Status tint utilities, by status key. Values are theme-aware CSS variables,
 * so the same string is right in light and in dark.
 *
 *  surface — the card/row/tile wash
 *  bar     — the category summary bar fill
 *  band    — a chart band behind the data
 *  edge    — that band's boundary line, and the ring on a point
 *  mark    — the fill of a plotted point or a range-bar dot
 */
/**
 * ⚠ Every runtime token below is `rgb(var(--x))`, never a bare `var(--x)`.
 *
 * This is not a style choice, it is the bug that made the whole status colour
 * layer invisible. The custom properties hold BARE CHANNELS ("205 218 193")
 * rather than a colour, because that is the only form Tailwind's
 * `<alpha-value>` syntax can composite an opacity into — see the note in
 * tailwind.config.ts. A bare `var(--c-status-high)` therefore resolves to the
 * string "205 218 193", which is not a valid colour value: the browser drops
 * the declaration and the element falls back to inherited text colour or to
 * black. No error, no warning, nothing in the console. It simply renders in
 * the wrong colour, which is exactly what a status badge, an SVG `fill` and a
 * gradient stop had all been doing.
 *
 * Anything applied through a `style` prop, an SVG paint attribute or a
 * gradient stop must go through these helpers. Anything applied as a Tailwind
 * class (`bg-tint-high`) must NOT — Tailwind adds the `rgb()` itself.
 */
function tintSet(key: StatusKey) {
  const k = kebab(key);
  return {
    surface: `rgb(var(--c-tint-${k}))`,
    bar: `rgb(var(--c-tint-${k}-bar))`,
    band: `rgb(var(--c-tint-${k}-band))`,
    /** The opaque band fill — a chart band and a range-bar segment. See BAND_FILL. */
    fill: `rgb(var(--c-tint-${k}-fill))`,
    edge: `rgb(var(--c-tint-${k}-edge))`,
    mark: `rgb(var(--c-tint-${k}-mark))`,
  } as const;
}

export const statusTint = {
  inRange: tintSet('inRange'),
  high: tintSet('high'),
  low: tintSet('low'),
  significantHigh: tintSet('significantHigh'),
  significantLow: tintSet('significantLow'),
} as const;

/**
 * The same five roles per HUE rather than per status — the only way to reach
 * the two HINGES, which are the midpoint of the gradient drawn at a boundary
 * (olive at a reference bound, orange at a significantly-out threshold) and are
 * never statuses.
 */
function hueSet(hue: StatusHue) {
  return {
    wash: `rgb(var(--c-hue-${hue}-wash))`,
    band: `rgb(var(--c-hue-${hue}-band))`,
    fill: `rgb(var(--c-hue-${hue}-fill))`,
    track: `rgb(var(--c-hue-${hue}-track))`,
    edge: `rgb(var(--c-hue-${hue}-edge))`,
    mark: `rgb(var(--c-hue-${hue}-mark))`,
  } as const;
}

export const hueTint = {
  green: hueSet('green'),
  olive: hueSet('olive'),
  yellow: hueSet('yellow'),
  orange: hueSet('orange'),
  red: hueSet('red'),
} as const;

/**
 * THE OPTIMAL NARROWING'S OWN FILL — opaque, and the same colour on the trend
 * chart and on both range bars.
 *
 * One token because it is one region: the part of the reference range that is
 * also optimal, drawn as the in-range green taken a rung deeper. It replaced
 * two different alphas of two different greens applied in two components, which
 * is how one idea ends up looking like two.
 */
export const OPTIMAL_FILL = 'rgb(var(--c-band-optimal))';

// ---------------------------------------------------------------------------
// Charts — structure from the brand palette, status from the status hues.
//
// A trend chart now shades where the lab's range sits: the reference range
// itself as a soft green band, a yellow band immediately above and below it,
// and red beyond the significantly-out thresholds, with orange as the
// transition into it. Every one of those boundaries is derived from THAT
// result's own reference range and severity threshold — there is no fixed
// scale anywhere, and a marker whose range is 20–42 gets bands 20–42 wide.
//
// What has NOT changed, and is what makes the bands safe:
//  · Status is still carried by the POINT'S SHAPE and by the word in the
//    tooltip and the key. The bands are reinforcement.
//  · Every band carries a boundary line and a written entry in the key, so it
//    is legible in greyscale and to a colourblind reader.
//  · The bands say where the range sits and nothing more. They are never
//    labelled good, healthy, bad, concerning or danger — the vocabulary is
//    in range / above / below / significantly out, and stops there.
//
// Everything structural — axes, gridlines, the trend line, the optimal band,
// the cursor, the surface — still derives from bronze/espresso/cream/taupe and
// `ink`, so the only colour in a chart that carries meaning is status.
// ---------------------------------------------------------------------------

// Every value here is a CSS custom property rather than a literal hex, so a
// chart follows the light/dark theme without any component needing to know
// which one is active — SVG `fill`/`stroke` resolve custom properties the same
// way any other CSS colour does. The concrete hexes per theme live in
// `themeTokens` above; only the opacities are literal, because they are the
// same in both.
export const chart = {
  /**
   * SERIES IDENTITY, AND SINCE Aug 2026 THAT IS ALL IT IS.
   *
   * Bronze — it says "this is your series", not "this is good". It WAS the
   * Compare chart's three lines, which were all one colour because no three
   * hues could be separated against the opaque bands in dark. Those bands are
   * gone and those lines carry the traffic light along their own length now, so
   * a hue on that plot means a STATE. What this paints is the dash-and-shape
   * SeriesMark beside each marker's name — the chip, the summary card, the
   * legend row, the tooltip — which is the one thing on that screen still
   * saying which line rather than how it is.
   */
  line: 'rgb(var(--c-chart-line))',
  /**
   * And its weight. A token rather than a literal on the `<Line>` because it is
   * half of one decision with `BAND_CONTRAST` — and in Aug 2026 that decision
   * went the other way for the first time: the bands dropped back to context
   * and the line got HEAVIER, so the ordering is carried twice over rather than
   * by contrast alone.
   *
   * 4, up from 3. It is also carrying a gradient now (see StatusLineGradient),
   * and a colour that changes along a 3px stroke is a colour nobody can read —
   * the extra pixel is what makes "gold here, green there" legible as well as
   * true.
   */
  /**
   * 5, up from 4 (Aug 2026). The line is the entire chart now — there is
   * nothing behind it and nothing beside it except four hairlines — and it is
   * carrying a gradient along its own length, so a colour that changes across
   * a 4px stroke is a colour nobody can read. Every pixel here is a pixel of
   * legibility for the one thing on the plot that says anything.
   */
  lineWidth: 5,
  point: 'rgb(var(--c-chart-point))',
  /** Ring around every point so it stays legible against the band it lands on. */
  pointRing: 'rgb(var(--c-chart-point-ring))',
  /**
   * The hairline on a RANGE BAR — its two reference-bound ticks and the edges
   * of an optimal narrowing. Neutral taupe rather than the band's own hue, on
   * purpose: it is the thing that has to stay visible when the colour is taken
   * away, so it cannot be made of colour.
   *
   * SOLVED AGAINST THE PAINTED BAND FILLS, which is why the trend chart no
   * longer uses it: the chart's boundary rules are drawn on the card and take
   * `bound` below.
   */
  referenceEdge: 'rgb(var(--c-chart-reference-edge))',
  /**
   * ── THE CHART'S FOUR BOUNDARY RULES (Aug 2026) ─────────────────────────
   *
   * With the bands removed these are the ONLY thing telling a patient where
   * their range is, so they matter more than they did and they are drawn at
   * two weights that are distinguishable without colour:
   *
   *     REFERENCE BOUNDS       solid, full weight
   *     SIGNIFICANTLY-OUT      dashed AND lighter
   *
   * Both, rather than one or the other, because either alone is a guess about
   * what a given reader notices first.
   *
   * A DASHED HORIZONTAL IS NOT THE DASHED VERTICAL. The step rule — "the
   * laboratory changed your reference range here" — is also dashed, and this
   * file already carries a warning against two marks differing only in their
   * dash pattern. That warning was about the CURSOR, which is vertical like
   * the step rule and was made solid for exactly that reason. These run across
   * the plot rather than down it, which is a difference no reader has to be
   * taught, and they are labelled with their own values on the axis besides.
   */
  bound: 'rgb(var(--c-chart-bound))',
  boundWidth: 1,
  boundOpacity: 1,
  thresholdOpacity: 0.6,
  thresholdDashArray: [4, 4],
  /**
   * How heavily a RANGE BAR draws its hairlines: the reference-bound ticks and
   * an optimal narrowing's own edges. Composited over the painted band fills,
   * which is what `--c-chart-reference-edge` is solved against.
   *
   * This was the chart's as well until Aug 2026. Both charts' boundary rules
   * take `boundOpacity` / `thresholdOpacity` above, because they are drawn on
   * the card and one opacity solved over a pale gold band means nothing over a
   * near-black card.
   *
   * ⚠ `severityEdgeOpacity` (0.38) IS GONE WITH THE COMPARE CHART'S BANDS (Aug
   * 2026). It was the lighter of the pair, and its last caller was that chart's
   * significantly-out rules, which are drawn on the card now and take
   * `thresholdOpacity` like every other threshold rule in the product. A value
   * left behind after the pass that removed its only caller is one autocomplete
   * away from being applied over a ground it was never solved against.
   */
  referenceEdgeOpacity: 0.55,
  /**
   * THE STEP: where a marker's reference range changed between two results.
   *
   * One dashed vertical hairline, the full height of the plot, at the midpoint
   * between the two samples the change happened between. These three values are
   * tokens rather than literals because the requirement on them is that it looks
   * the SAME every time it happens — and the pattern is stated in two places (the
   * rule on the plot and the swatch in the key) which drifted apart the moment
   * either was edited. The colour is `referenceEdge`, the same neutral every
   * other boundary in the chart is drawn in: the step is a boundary, and a
   * boundary that carries a hue is a boundary competing with the status layer.
   *
   * Held as a tuple rather than the "3 3" string SVG wants, so it stays a
   * non-colour token — tokenContrast.test.ts asserts every STRING in here is an
   * `rgb(var(--x))` colour, which is the check that stops a bare `var()` reaching
   * an SVG attribute and rendering black.
   */
  stepDashArray: [3, 3],
  stepOpacity: 0.7,
  stepWidth: 1,
  /**
   * ── THE BANDS AND THE PLOT PANEL ARE GONE FROM THE CHART (Aug 2026) ──────
   *
   * `plotSurface`, `plotFrame`, `plotFrameOpacity`, `plotFrameOpacityDark`,
   * `plotInset`, `plotInsetOpacity`, `plotInk` and `plotInkMuted` are removed
   * with the inset panel they described. The chart draws on the card: the
   * ticks take `axisText` and the bound labels take `boundLabel`, both of
   * which follow the theme again.
   *
   * The BAND vocabulary itself — `--c-hue-*-fill`, `bandRampStops`,
   * `BAND_CONTRAST`, `OPTIMAL_FILL` — is untouched and still serves the range
   * bars, which have no line to carry colour along and whose five painted
   * segments are the traffic light.
   */
  /**
   * A reference bound printed on the left axis, distinct from a tick value.
   *
   * The tick values are the SCALE and the bounds are a CLINICAL THRESHOLD, and
   * a reader has to be able to tell one from the other at a glance. Same mono
   * face and the same size; the bound is set in the text colour with a short
   * lead rule to its own hairline, and the ticks are muted. That is a weight
   * difference and a mark, never a hue — a coloured axis label would be the
   * status layer leaking into the furniture.
   */
  boundLabel: 'rgb(var(--c-chart-bound-label))',
  /**
   * `haloOpacity` IS GONE — see `SPARK` below (Aug 2026).
   *
   * It was one number, 0.16, painted as a flat 13px disc behind the most recent
   * point. A disc of constant alpha has an EDGE, so what it drew was a dot
   * inside a ring rather than a point that is lit: the halo ended somewhere,
   * visibly, and where it ended was a second circle nobody had asked for. A
   * falloff cannot be expressed as one alpha, and it is not a chart token any
   * more because it is a ramp and a per-theme strength rather than a colour.
   */
  /**
   * THE OPTIMAL BAND HAS NO TOKENS OF ITS OWN ANY MORE (Aug 2026), and their
   * absence is the point.
   *
   * `optimalBand` / `optimalBandOpacity` / `optimalEdge` were a bronze fill, a
   * bronze hatch and a bronze dashed rule — a whole second visual vocabulary
   * for a region that overlaps the reference range, which on screen read as two
   * competing systems making two claims about one result. An optimal range is a
   * NARROWING of in-range, so it is drawn as one: the same green taken a rung
   * deeper (`OPTIMAL_FILL`, opaque like every other band since Aug 2026) over
   * the part of the lab's range that is also optimal, bounded by the same
   * neutral `referenceEdge` every other boundary in this chart uses. Nothing
   * here needs to name it.
   */
  /** Axis rule and ticks. */
  axisLine: 'rgb(var(--c-chart-axis-line))',
  axisText: 'rgb(var(--c-chart-axis-text))',
  gridline: 'rgb(var(--c-chart-gridline))',
  /** Cursor/crosshair on hover. */
  cursor: 'rgb(var(--c-chart-cursor))',
  /** Warm off-white (light) / raised warm near-black (dark) for chart card surfaces — never pure white, never grey. */
  surface: 'rgb(var(--c-chart-surface))',
  /**
   * The white bead at the middle of every point, and the falloff around it.
   * See SPARK below: the core is white on screen in both themes and espresso
   * in print; the halo is white in dark and a warm dark in light, because
   * those are two different phenomena rendering one idea.
   */
  sparkCore: 'rgb(var(--c-chart-spark-core))',
  sparkHalo: 'rgb(var(--c-chart-spark-halo))',
} as const;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE POINTS ARE LIT, AND SO IS THE LINE (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A point on the trend chart is a SPARK: a tight WHITE core inside a wide, soft
 * falloff, identical at every status, with the most recent one brightest and
 * slightly larger. The line carries a faint casing of light along its length,
 * in whatever status colour it is at that stretch.
 *
 * ── THE POINTS ARE UNIFORM AND THE LINE CARRIES THE STATUS ─────────────────
 *
 * Every point is the same mark. No shapes, no per-status colour, no variation
 * of any kind except the most recent one being brighter and a little larger.
 * The chevrons, triangles and doubled chevrons are OFF THE CHART and are not to
 * be put back — three kinds of mark on one line is noise, and it was noise
 * saying what the line already says in colour along its own length.
 *
 * THIS IS A NAMED EXCEPTION TO "NEVER COLOUR ALONE" AND IT IS THE ONLY ONE.
 * The shape-and-label layer is mandatory everywhere else in the product —
 * result cards, range bars, the counts strip, status words, the tooltip, the
 * key — and nothing here weakens that. What makes the chart different is that
 * it has a SECOND non-colour carrier the other surfaces do not: every point's
 * POSITION against four labelled boundary rules, each printed with its own
 * value on the axis. A reader who cannot separate the green stretch from the
 * red one still sees which side of the reference bound each point falls on,
 * which is a more precise answer than a chevron and one a greyscale page keeps
 * in full. The status is also still named IN WORDS in the tooltip, on every
 * point, and in the key.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 *
 * It is not neon, and the difference is not a matter of degree. Neon is a
 * saturated hue on black; this is an effect applied to colours that are already
 * solved (`--c-hue-*-mark`, at LINE_FILL_TARGET off the card) and it may not
 * change one of them. There is no second line, no echo, no mirrored curve and
 * no grid. If a reader notices the glow AS an effect it is too strong — the
 * whole of the intent is that the chart reads as considered rather than as
 * decorated.
 *
 * ── WHY A GRADIENT AND NOT A BLUR ──────────────────────────────────────────
 *
 * `feGaussianBlur` is the obvious way to draw a glow and it is the wrong one
 * here, for the reason already written down against the plot panel's inner
 * shadow: a filter on an element inside a Recharts SVG is re-rasterised as the
 * tooltip moves, and the tooltip moves continuously. A radial gradient is
 * painted like any other fill and costs nothing per frame, and it gives an
 * exact falloff rather than an approximated one. Two overlapping translucent
 * strokes do the same job for the line: the outer one alone at `alpha`, both
 * together at 1−(1−alpha)² nearer the core, which is a two-step ramp for the
 * price of two paths.
 *
 * ── THE GEOMETRY IS SHARED, THE STRENGTH IS PER THEME ──────────────────────
 *
 * `radius`, `ramp` and `glyph` are one shape in both themes: a spark is the
 * same object whichever room it is in. What differs is the halo's COLOUR and
 * its strength, and it has to, because a white bloom is not available on a
 * near-white card. This is two different physical phenomena rendering one idea:
 *
 *   DARK   a white core with a WHITE falloff — light added to a near-black
 *          card, which reads as emission, which is what it is.
 *   LIGHT  a white core with a WARM DARK falloff — the same core, sitting in a
 *          soft shadow rather than a bloom. A white halo on a cream card is
 *          nothing at all (1.05:1), so reusing dark's value there would delete
 *          the point rather than dim it. What makes the core read is that it is
 *          the BRIGHTEST thing inside a dark smudge, which is how a lit bead on
 *          paper reads. Ink carries further per unit of alpha than light does,
 *          hence roughly half the strength.
 *
 * ── AND IN PRINT THE CORE FLIPS TO INK ─────────────────────────────────────
 *
 * The halo goes to zero on paper with every other glow, which would leave a
 * white dot on white paper: the points would simply vanish from a printed
 * chart. `--c-chart-spark-core` is therefore espresso under `@media print`.
 * A printed trend is dark points on white with no glow, which is what a chart
 * in a document should be. `e2e/zz-print.spec.ts` reads both off a printed
 * point rather than trusting the stylesheet.
 *
 * ── THE POINT'S LEGIBILITY IS THE CORE AGAINST THE CARD ────────────────────
 *
 * With no stroke and no status fill, a point reads by exactly one pair: the
 * white core against the card. That is 1.05:1 in light on its own — which is
 * why the halo is not decoration there but the thing that makes the mark
 * exist — and 15:1 in dark. `tokenContrast.test.ts` holds the light case at
 * the HALO's own separation from the card instead, since that is the pair
 * doing the work, and holds the core above the halo in both themes so the
 * bead is always the brightest part of its own spark.
 *
 * ── WHERE THE NUMBERS ARE CONSUMED ─────────────────────────────────────────
 *
 * The three strengths are emitted as `--chart-spark`, `--chart-spark-past` and
 * `--chart-line-glow` by tailwind.config.ts, in both themes and at ZERO under
 * `@media print` — the same treatment the shadow alphas get, and for the same
 * reason: a glow costs ink to say nothing on paper. They are OPACITIES rather
 * than colours, so a bare `var(--x)` is correct at the call site and the
 * `rgb(var(--x))` rule (which exists because the colour properties hold bare
 * channels) does not apply to them. The two COLOURS are ordinary colour tokens
 * and do take `rgb(var(--x))`: `chart.sparkCore` and `chart.sparkHalo`.
 */
export const SPARK = {
  /**
   * ── EVERY POINT IS THE SAME WHITE SPARK (Aug 2026) ────────────────────────
   *
   * The chart used to draw a level dot, a chevron, or a DOUBLED chevron at each
   * point, stroked in that point's own status colour — three marks of different
   * kinds on one line. That is off the chart entirely and is not to be put
   * back; see `SPARK_EXCEPTION` below for the reasoning and for where the shape
   * layer is still mandatory, which is everywhere else in the product.
   *
   * A point is now a bright white CORE inside a wide soft falloff, identical at
   * every status: same colour, same size, same treatment, whatever the value is
   * doing. The one permitted variation is the most recent point, which is
   * slightly larger and sparks brighter — it is the one the reader came for.
   *
   * WHITE, AND WHITE IN BOTH THEMES, because the point's job here is POSITION
   * and nothing else. A point drawn in its own status colour on a line already
   * carrying that colour is the same fact stated twice, and it costs the point
   * its one distinction from the line running through it.
   */
  glyph: {
    /** The white core's radius in px. Tight — the falloff is what carries the size. */
    r: 3.2,
    /** The most recent point. Slightly larger, and that is the only size variation. */
    rLatest: 4.2,
  },
  /**
   * How far the halo reaches, as a multiple of the CORE's own radius.
   *
   * 4.5, up from 3.3 — and the number went up because the core got much
   * smaller. A halo 3.3× a 5px status glyph and a halo 4.5× a 3.2px core are
   * about the same number of pixels across; what changed is the RATIO, which
   * is the whole of what makes this read as light rather than as a dot. A wide
   * falloff around a fat glyph is a disc with soft edges.
   */
  radius: 4.5,
  /**
   * The falloff: `[offset, share of the core alpha]`, offsets as fractions of
   * the halo's radius.
   *
   * TIGHT CORE, WIDE TAIL, and the shape is the whole effect. The plateau ends
   * at 0.22, which is exactly where the white core's own edge is (a core of
   * radius r inside a halo of 4.5r), so the hottest part of the gradient is
   * under the core and everything that leaks out around it is already on the
   * falloff — which is what "lit from within" means geometrically. The alpha
   * then loses half of itself in the next fifth of the radius and trails to
   * nothing over the remaining half.
   *
   * An even ramp reads as a filled circle with soft edges, which is a disc, and
   * a disc of constant alpha reads as a dot inside a ring. Both are the things
   * this replaced.
   *
   * IT WAS STEEPER AND THAT MADE THE SPARK FAINTER THAN THE DISC IT REPLACED.
   * At 0.42 and 0.14 the only part of the halo outside the glyph that carried
   * any weight was a couple of pixels, so in light — where the effect is a
   * shadow rather than an emission and is quiet to begin with — the most recent
   * point read as LESS marked than it had with the old flat 0.16 disc, which is
   * the one direction this change was not allowed to go. Measured off the
   * rendered plot, not reasoned about: see screenshots/line.
   */
  ramp: [
    [0, 1],
    // 0.23 rather than 0.222: the plateau must reach the core's edge (1/4.5)
    // and not stop a hair inside it, or the falloff starts under the bead and
    // the brightest ring of the halo is a hairline around it. Pinned by
    // tokenContrast.test.ts, which computes the edge from `radius` rather than
    // trusting this number.
    [0.23, 1],
    [0.42, 0.5],
    [0.68, 0.18],
    [1, 0],
  ],
  /**
   * The core alpha of the MOST RECENT point's halo — the one the reader came
   * for.
   *
   * ── THE TWO NUMBERS ARE NOT COMPARABLE WITH EACH OTHER (Aug 2026) ────────
   *
   * They used to be, and there was a rule about it: dark's alpha was higher
   * than light's because both halos were the same status colour and "ink
   * carries further per unit of alpha than light does". That rule is retired
   * with the colour it was about. The halos are now DIFFERENT COLOURS —
   * white on a near-black card, espresso on a near-white one — so their alphas
   * are two answers to two different questions and one being larger says
   * nothing at all.
   *
   * What IS comparable is what they measure, and both were chosen at the
   * measurement rather than by eye:
   *
   *     dark   0.22 → the halo stands 2.06:1 off the card, core 7.21:1 off it
   *     light  0.34 → the halo stands 1.87:1 off the card, core 1.92:1 off it
   *
   * Near-equal presence in the two rooms, which is what "the same spark in both
   * themes" has to mean when the two are made of different light. `SPARK` is
   * pinned at both ends by tokenContrast.test.ts: the bead always out-reads its
   * own halo, and the halo never reaches a card's worth of separation from the
   * card — past that it stops being light around a mark and becomes a filled
   * region on the plot, which is the one thing removing the bands was for.
   *
   * ⚠ WHITE AT 0.58 — dark's previous number, carried over unchanged when the
   * halo went white — measured 5.99:1. That is not a glow, it is a lamp: a
   * white disc most of a card's separation brighter than everything around it,
   * on a chart whose whole intent is that the effect is not noticed as one.
   */
  core: { light: 0.34, dark: 0.22 },
  /**
   * Every earlier point, as a share of it. The history is context for the
   * latest result in exactly the way the size difference already says; this
   * says it a second time in light, which is the difference between "the last
   * point is bigger" and "the last point is the one that is lit".
   */
  pastShare: 0.45,
  /**
   * ── THE LINE'S CASING: THREE LAYERS, NOT TWO ───────────────────────────
   *
   * Each layer is a stroke `extra` pixels wider than the line, painted with the
   * line's own gradient at `alpha` × its own `share`, outermost first. The
   * light around the line is therefore the colour the line is at that stretch,
   * by construction rather than by two derivations agreeing.
   *
   * TWO LAYERS AT ONE ALPHA LEFT A VISIBLE EDGE, which is the failure a glow
   * cannot have: an outermost stroke at a flat alpha ends AT ITS OWN WIDTH, so
   * what the dark plot showed was not a line that glows but a second, wider,
   * dimmer line with a hard boundary down each side. Three layers whose alphas
   * step 0.4 / 0.7 / 1 give four composited levels between the card and the
   * line (0.4a, then ~1.1a, then ~1.8a, then the line), and the outermost is
   * faint enough that its edge is below the threshold of being an edge.
   */
  line: {
    layers: [
      { extra: 16, share: 0.4 },
      { extra: 9, share: 0.7 },
      { extra: 4, share: 1 },
    ],
    alpha: { light: 0.08, dark: 0.13 },
  },
} as const;

// ---------------------------------------------------------------------------
// WCAG contrast utilities — used by the status colors above (verified at
// authoring time) and available at runtime/in tests to guard future changes.
// ---------------------------------------------------------------------------

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(hexA: string, hexB: string): number {
  const l1 = relativeLuminance(hexA);
  const l2 = relativeLuminance(hexB);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/** AA thresholds: 4.5:1 body text, 3:1 large text / UI components & graphics. */
export const WCAG_AA_TEXT = 4.5;
export const WCAG_AA_LARGE_TEXT = 3;

/**
 * Known contrast facts (computed against brand.cream unless noted), so
 * components don't guess:
 * - espresso on cream: ~8.16:1 — primary body/heading text.
 * - bronze on cream: ~4.18:1 — passes AA for large text/UI (>=3:1) but NOT
 *   small body copy. Use bronze for accents, icons, large headings, focus
 *   rings — pair with espresso for small text.
 * - taupe on cream: ~1.40:1 — borders/dividers/gridlines/disabled only,
 *   never text.
 * - sage/ochre/terracotta on cream: 4.90 / 5.13 / 5.05:1 — all clear AA for
 *   text-sized status labels.
 */

// ---------------------------------------------------------------------------
// Typography — three roles across two superfamilies.
//
// Jost and Inter are retired. What replaced them, and why each:
//
//  · DISPLAY — Fraunces. A warm, high-contrast serif with an optical-size
//    axis, so one family is right at 72px and at 20px. It has weight in the
//    stems, which is the reason it survives dark mode being the default:
//    hairline serifs disappear on a warm near-black.
//  · BODY AND UI — IBM Plex Sans. Chosen over Inter because Inter is the
//    default everything reaches for and Plex has a voice: slightly
//    institutional, unambiguous letterforms, drawn for interfaces where
//    misreading costs something.
//  · NUMERICS — IBM Plex Mono, and ONLY numerics. Same superfamily as the
//    body face, so the two harmonise without being asked to. Lab reference
//    ranges, values in cards and tables, chart axis labels, dates rendered as
//    data, units beside values. It puts a quiet lab-instrument register on the
//    data and lets Fraunces carry all the warmth. It must never leak into
//    prose, buttons or headings.
//
// The one exception to "every number is mono": the single hero value on a
// marker detail page stays Fraunces 600 at opsz 144. It is the emotional
// anchor of that page and should read as a headline, with the mono unit beside
// it at a much smaller size.
//
// Both superfamilies are OFL and self-hosted from this origin, latin subset
// only — see apps/web/public/assets/fonts and the @font-face block in
// apps/web/src/styles/globals.css. There is no Google Fonts request anywhere.
// ---------------------------------------------------------------------------

/**
 * The three families, as complete stacks. The local fallbacks are chosen for
 * metric proximity rather than availability: a serif page falling back to
 * Arial reflows to a different length entirely.
 */
export const fontFamilies = {
  display: `'Fraunces Variable', Fraunces, 'Iowan Old Style', Georgia, 'Times New Roman', serif`,
  body: `'IBM Plex Sans Variable', 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  mono: `'IBM Plex Mono', ui-monospace, SFMono-Regular, 'Cascadia Mono', Consolas, 'Liberation Mono', monospace`,
} as const;

/**
 * Fraunces' variable axes, fixed as tokens rather than improvised per
 * component.
 *
 *  · `opsz` tracks the RENDERED size, which is the whole reason this face was
 *    picked. 144 for hero and page titles, 72 for section headings and large
 *    values, 24 for anything under 24px.
 *  · `SOFT` at 30 softens the terminals just enough to read warm rather than
 *    surgical.
 *  · `WONK` at 0. Always. The wonky axis is where Fraunces gets whimsical, and
 *    this is a medical results portal. Discipline is the point.
 */
const SOFT = 30;
const WONK = 0;

export const displayAxes = {
  /** Hero and page titles. */
  hero: `'opsz' 144, 'SOFT' ${SOFT}, 'WONK' ${WONK}`,
  /** Section headings and large values. */
  section: `'opsz' 72, 'SOFT' ${SOFT}, 'WONK' ${WONK}`,
  /** Anything set under 24px. */
  small: `'opsz' 24, 'SOFT' ${SOFT}, 'WONK' ${WONK}`,
} as const;

/**
 * ONE type scale. Nine steps, roughly 12 / 14 / 16 / 18 / 21 / 28 / 38 / 52 /
 * 72, with the line height and the tracking defined per STEP rather than per
 * component — which is what stops a heading three screens away from quietly
 * having its own leading.
 *
 * Tracking goes progressively negative as the size climbs (large type set at
 * body tracking reads gappy) and stays at zero or a hair positive at the small
 * end. The one wide-tracked thing in the product is the uppercase eyebrow, and
 * it has a single value of its own below.
 *
 * The names are Tailwind's so the class names read normally; the values are
 * ours. `reading` is the long-form body step — every paragraph a patient
 * actually reads at length is set at it.
 */
export const typeScale = {
  xs: { size: '0.75rem', leading: '1.5', tracking: '0.004em' },
  sm: { size: '0.875rem', leading: '1.55', tracking: '0.002em' },
  base: { size: '1rem', leading: '1.6', tracking: '0em' },
  reading: { size: '1.125rem', leading: '1.65', tracking: '0em' },
  lg: { size: '1.3125rem', leading: '1.45', tracking: '-0.004em' },
  xl: { size: '1.75rem', leading: '1.25', tracking: '-0.01em' },
  '2xl': { size: '2.375rem', leading: '1.14', tracking: '-0.016em' },
  '3xl': { size: '3.25rem', leading: '1.06', tracking: '-0.022em' },
  '4xl': { size: '4.5rem', leading: '1.0', tracking: '-0.028em' },
} as const;

export type TypeStep = keyof typeof typeScale;

/** One value, everywhere. The eyebrows used to carry three different ones. */
export const EYEBROW_TRACKING = '0.14em';

/**
 * The measure. Body copy is capped between 65 and 75 characters a line; 68ch
 * is the middle of that at the reading step.
 */
export const MEASURE = '68ch';

export const typography = {
  display: {
    fontFamily: fontFamilies.display,
    axes: displayAxes,
    role: 'Page titles, section headings, card titles, the at-a-glance numbers, the one hero value',
  },
  eyebrow: {
    fontFamily: fontFamilies.body,
    textTransform: 'uppercase',
    letterSpacing: EYEBROW_TRACKING,
    role: 'Section labels, uppercase headings, the label half of every label/value pair',
  },
  body: {
    fontFamily: fontFamilies.body,
    role: 'Body copy, UI chrome, navigation, buttons, form fields',
  },
  numeric: {
    fontFamily: fontFamilies.mono,
    fontVariantNumeric: 'tabular-nums slashed-zero',
    role: 'Reference ranges, values, chart axis labels, dates as data, units. Numbers only, never prose',
  },
  scale: typeScale,
  measure: MEASURE,
} as const;

/**
 * The families and the axis settings as custom properties, so a component
 * references a token and never a font name. Emitted once on `:root` by
 * tailwind.config.ts, alongside the colour tokens.
 */
export function typographyCssVars(): Record<string, string> {
  return {
    '--font-display': fontFamilies.display,
    '--font-body': fontFamilies.body,
    '--font-mono': fontFamilies.mono,
    '--fvs-display-hero': displayAxes.hero,
    '--fvs-display-section': displayAxes.section,
    '--fvs-display-small': displayAxes.small,
    '--tracking-eyebrow': EYEBROW_TRACKING,
    '--measure': MEASURE,
  };
}
