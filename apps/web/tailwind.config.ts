import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';
// FROM SOURCE, NOT FROM THE PACKAGE ENTRY POINT — see the note above the guard
// below. tokens.ts is a leaf module with no imports of its own, so jiti can
// transpile it on its own and this config no longer depends on
// packages/shared/dist existing.
import {
  brand,
  hexToRgbChannels,
  typeScale,
  typographyCssVars,
  themeCssVars,
  staticTokens,
  EYEBROW_TRACKING,
  MEASURE,
  PANEL_WASH_ALPHA,
  GLASS,
  PANEL_SHEEN,
  SPARK,
  type TypeStep,
} from '../../packages/shared/src/tokens';

/**
 * Colour reaches Tailwind as a CSS custom property rather than a literal hex,
 * so one class name resolves to the right value in either theme:
 *
 *   text-espresso  →  espresso in light, warm cream in dark
 *   bg-cream-50    →  the card surface in both
 *
 * The `<alpha-value>` placeholder is what keeps `text-espresso/70` working —
 * Tailwind substitutes the opacity into the rgb() at build time, which is only
 * possible because the variables hold bare `r g b` channels, not `#rrggbb`.
 *
 * The two exceptions are `night` and `oncolor` (see staticTokens): surfaces
 * that are dark in both themes and the light text that sits on them.
 */
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

/**
 * The one failure this config can have that looks like a design bug — and the
 * reason the import above reaches into `packages/shared/src` rather than at
 * `@aspire-bloods/shared`.
 *
 * The package `main` points at `dist/`. While the tokens were imported through
 * it, starting Vite before that package was built made jiti resolve the import
 * to nothing: `typeScale` came back `undefined`, `Object.keys` threw inside
 * PostCSS, and the dev server answered every request for the stylesheet with a
 * 500 — so the app was served with NO STYLESHEET AT ALL and rendered in the
 * browser's own faces. That reads exactly like a botched font migration (body
 * copy in Times, headings in something else again) and sends whoever sees it
 * hunting through the type tokens for a bug that is not there.
 *
 * What made it worse than a first-run annoyance: Tailwind loads this config
 * ONCE per process and caches the result, so the failure is sticky. Building
 * the shared package afterwards does not clear it — the running dev server goes
 * on serving 500s until it is restarted, which is why the symptom kept coming
 * back after the "fix".
 *
 * tokens.ts has no imports of its own, so reading it straight from source costs
 * nothing and removes the dist dependency from the stylesheet entirely. The
 * guard stays as the message for any other way this could come back undefined.
 */
if (!typeScale || typeof typeScale !== 'object') {
  throw new Error(
    'Tailwind cannot read the design tokens: @aspire-bloods/shared has not been built. ' +
      'Run `npm run build --workspace=packages/shared` (or use `npm run dev:web`, which does it for you). ' +
      'Without this the app is served with no stylesheet and renders in the browser default fonts.',
  );
}

const scaleVars = (family: string) => ({
  DEFAULT: v(`--c-${family}`),
  50: v(`--c-${family}-50`),
  100: v(`--c-${family}-100`),
  200: v(`--c-${family}-200`),
  300: v(`--c-${family}-300`),
  400: v(`--c-${family}-400`),
  500: v(`--c-${family}-500`),
  600: v(`--c-${family}-600`),
  700: v(`--c-${family}-700`),
  800: v(`--c-${family}-800`),
  900: v(`--c-${family}-900`),
});

/** `{'--c-cream-50': '251 250 247'}` → the shape addBase wants. */
const asBaseVars = (mode: 'light' | 'dark') => themeCssVars(mode) as Record<string, string>;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Class-based, not media-based: the toggle in the account area has to be
  // able to override the system preference, and a media-query dark mode
  // structurally cannot be overridden by a user choice.
  darkMode: 'class',
  theme: {
    /**
     * THE TYPE SCALE, replacing Tailwind's rather than extending it — nine
     * steps, roughly 12 / 14 / 16 / 18 / 21 / 28 / 38 / 52 / 72, each carrying
     * its own line height and tracking. Defined in packages/shared
     * (`typeScale`) so the PDF pipeline and anything else that has to agree
     * with the screen reads the same numbers.
     *
     * Replacing is the point. `text-5xl`, `text-6xl`, `text-7xl` and every
     * arbitrary `text-[13px]` simply stop existing, so there is no way to set
     * a size off the scale without noticing. The four steps whose value was
     * already on the scale (xs, sm, base, and the long-form `reading` step)
     * keep their names; the larger ones were retuned and their call sites
     * swept down a step to match.
     */
    fontSize: Object.fromEntries(
      (Object.keys(typeScale) as TypeStep[]).map((step) => [
        step,
        [typeScale[step].size, { lineHeight: typeScale[step].leading, letterSpacing: typeScale[step].tracking }],
      ]),
    ) as Record<TypeStep, [string, { lineHeight: string; letterSpacing: string }]>,
    /**
     * TWO SURFACE RADII, and that is the rule: `card` for surfaces, `input`
     * for controls. A replacement rather than an extension, so `rounded-sm`,
     * `rounded-md`, bare `rounded` and every arbitrary radius are gone —
     * a third surface value is how a page ends up with three subtly different
     * corners nobody chose.
     *
     * The other two are not surface radii and are not an escape hatch from
     * that rule:
     *
     *  · `full` is a SHAPE — avatars, pills, the range-bar dot, the segmented
     *    control's thumb. Nothing about it is a corner.
     *  · `mark` is ICON GEOMETRY, and it exists for the CHECKBOX glyph and
     *    nothing else — components/ui/Checkbox.tsx and the two bespoke
     *    checkboxes in the booking steps. A checkbox glyph is 18–20px square;
     *    at `input`'s 0.625rem its corners meet in the middle and it renders
     *    as a circle, which is a radio button. The control that says "several
     *    of these" must not be the shape of the one that says "exactly one of
     *    these", so this is a correctness constraint rather than a stylistic
     *    one. (The radio glyph itself is `full`, because a radio genuinely is
     *    a circle.)
     *
     * `mark` is therefore never to be used on a surface. If it starts showing
     * up on a card, a panel or a button, the fix is to delete it from there,
     * not to widen its remit.
     */
    borderRadius: {
      none: '0',
      // Dropdown panels, cards, tiles, modals — the softer of the two.
      card: '1rem',
      // Controls: inputs, buttons, chips, focus rings.
      input: '0.625rem',
      // The checkbox glyph ONLY. See above.
      mark: '0.25rem',
      full: '9999px',
    },
    extend: {
      colors: {
        bronze: scaleVars('bronze'),
        espresso: scaleVars('espresso'),
        cream: scaleVars('cream'),
        taupe: scaleVars('taupe'),
        white: v('--c-white'),
        // Frozen light values — see staticTokens. `night` is the atmospheric
        // dark panel in both themes; `oncolor` is the light text on it and on
        // any filled accent.
        night: {
          DEFAULT: staticTokens.night.DEFAULT,
          soft: staticTokens.night.soft,
          accent: staticTokens.night.accent,
          border: staticTokens.night.border,
          hover: staticTokens.night.hover,
          deep: staticTokens.night.deep,
        },
        // Light text on the always-dark night panels. Frozen — see staticTokens.
        oncolor: staticTokens.oncolor,
        // Text on a filled accent (bronze button, selected option, avatar).
        // Theme-aware, because bronze itself flips from dark to light.
        onaccent: v('--c-onaccent'),
        // The sidebar panel. `panel` is the wash COLOUR only — the alpha is
        // `--panel-wash` below and the two are combined by `.panel-wash` in
        // globals.css, because the alpha differs per theme and a Tailwind
        // opacity modifier is a build-time literal. `panel-edge` is its
        // hairline and is an ordinary colour.
        panel: {
          DEFAULT: v('--c-panel'),
          edge: v('--c-panel-edge'),
        },
        // THE SECOND SURFACE REGISTER — the warm reading ground under
        // explanatory prose, and nothing else. See `--c-vellum` in tokens.ts
        // for what it is for and why it goes in opposite directions in the two
        // themes, and `.card-vellum` in globals.css for how a card takes it.
        vellum: v('--c-vellum'),
        // Retained under its original name so nothing that already referenced
        // the deep warm near-black has to change; `night` is the same scale
        // with a name that says what it is for.
        ink: {
          DEFAULT: staticTokens.night.DEFAULT,
          soft: staticTokens.night.soft,
          accent: staticTokens.night.accent,
          border: staticTokens.night.border,
          hover: staticTokens.night.hover,
          deep: staticTokens.night.deep,
        },
        status: {
          inRange: v('--c-status-in-range'),
          high: v('--c-status-high'),
          low: v('--c-status-low'),
          significantHigh: v('--c-status-significant-high'),
          significantLow: v('--c-status-significant-low'),
        },
        // The status wash and its stronger relatives. `bg-tint-high` is a
        // background and only ever a background — there is no text-tint-* on
        // purpose, because the one piece of text that takes a status colour is
        // the status word itself, and that uses `text-status-*` above.
        //
        // `-bar` is the category summary bar fill, `-band` a chart band,
        // `-edge` a band's boundary line, `-mark` a plotted point's fill.
        tint: {
          inRange: v('--c-tint-in-range'),
          high: v('--c-tint-high'),
          low: v('--c-tint-low'),
          significantHigh: v('--c-tint-significant-high'),
          significantLow: v('--c-tint-significant-low'),
          'inRange-bar': v('--c-tint-in-range-bar'),
          'high-bar': v('--c-tint-high-bar'),
          'low-bar': v('--c-tint-low-bar'),
          'significantHigh-bar': v('--c-tint-significant-high-bar'),
          'significantLow-bar': v('--c-tint-significant-low-bar'),
          'inRange-band': v('--c-tint-in-range-band'),
          'high-band': v('--c-tint-high-band'),
          'low-band': v('--c-tint-low-band'),
          'significantHigh-band': v('--c-tint-significant-high-band'),
          'significantLow-band': v('--c-tint-significant-low-band'),
          'inRange-edge': v('--c-tint-in-range-edge'),
          'high-edge': v('--c-tint-high-edge'),
          'low-edge': v('--c-tint-low-edge'),
          'significantHigh-edge': v('--c-tint-significant-high-edge'),
          'significantLow-edge': v('--c-tint-significant-low-edge'),
        },
        // The result mark on a range bar, and the ring around it. Deliberately
        // NOT one of the status colours: the mark says where the result sits,
        // and it sits on a track made of the status colour, so a mark in that
        // colour is a mark drawn in the shade it is standing on. See the note
        // beside --c-rangemark in tokens.ts for the measured reason the fill
        // inverts between the two themes.
        rangemark: {
          DEFAULT: v('--c-rangemark'),
          ring: v('--c-rangemark-ring'),
        },
        // Per-hue, which is the only way to reach orange — the transition
        // between yellow and red, used in the range-bar gradient and the
        // shoulder of a chart band, and never a status of its own.
        hue: {
          'green-wash': v('--c-hue-green-wash'),
          'green-band': v('--c-hue-green-band'),
          'green-track': v('--c-hue-green-track'),
          'green-edge': v('--c-hue-green-edge'),
          'yellow-wash': v('--c-hue-yellow-wash'),
          'yellow-band': v('--c-hue-yellow-band'),
          'yellow-track': v('--c-hue-yellow-track'),
          'yellow-edge': v('--c-hue-yellow-edge'),
          'orange-wash': v('--c-hue-orange-wash'),
          'orange-band': v('--c-hue-orange-band'),
          'orange-track': v('--c-hue-orange-track'),
          'orange-edge': v('--c-hue-orange-edge'),
          'red-wash': v('--c-hue-red-wash'),
          'red-band': v('--c-hue-red-band'),
          'red-track': v('--c-hue-red-track'),
          'red-edge': v('--c-hue-red-edge'),
        },
      },
      // Families reach Tailwind as custom properties for exactly the same
      // reason colours do: one place decides what "display" is, and no
      // component ever writes a font name. The properties are emitted by
      // typographyCssVars() in the plugin below.
      fontFamily: {
        // `font-display` carries Fraunces' axis settings with it, so the SOFT
        // and WONK values cannot be forgotten at a call site — WONK 0 in
        // particular, which is the difference between a serif with warmth and
        // a serif doing a bit. The optical size defaults to the section step
        // (opsz 72); `opsz-hero` and `opsz-small` below move it.
        display: ['var(--font-display)', { fontVariationSettings: 'var(--fvs-display-section)' }],
        body: ['var(--font-body)'],
        // Numerics only. See the note on `typography.numeric` in tokens.ts:
        // reference ranges, values, axis labels, dates as data, units. It must
        // not reach prose, buttons or headings.
        mono: ['var(--font-mono)'],
        // The eyebrow is the body face at a small size with wide tracking, not
        // a fourth family. Kept as a name so `.eyebrow` reads as one decision.
        eyebrow: ['var(--font-body)'],
      },
      letterSpacing: {
        eyebrow: EYEBROW_TRACKING,
      },
      maxWidth: {
        // 65–75 characters a line. Every long-form paragraph gets this rather
        // than a max-w-2xl chosen by eye, which is how three different
        // measures ended up on three pages that read the same way.
        measure: MEASURE,
        /**
         * THE PATIENT SHELL'S CONTENT COLUMN — and it is not a measure.
         *
         * It was `max-w-5xl` (1024px), a Tailwind default doing duty as a
         * layout decision, and it capped every patient screen including the two
         * whose content is a card grid. Measured on the by-marker view: 3
         * columns at 1440 (missing a fourth by 28px), and still 1024px of grid
         * at 1920 with 608px of the window left empty.
         *
         * 1280 is chosen against the grid rather than against a line of text:
         * the marker card's floor is 15rem and the gap is 20px, so 1280 holds
         * FOUR columns with 260px to spare (a fifth arrives around 1600) where
         * 1024 holds four only exactly. Reading width is unaffected because it
         * was never this element's job — every paragraph in the product carries
         * `max-w-measure` itself.
         */
        content: '80rem',
      },
      minHeight: {
        // WCAG 2.5.8 minimum touch target. One token, not forty copies of
        // min-h-[44px].
        tap: '2.75rem',
      },
      spacing: {
        // The admin console's sticky top bar height — the two sticky
        // elements that sit beneath it (report context bar, review-queue
        // action bar) offset by exactly this. One token instead of a magic
        // number that silently breaks when the bar's padding changes.
        topbar: '3.8125rem',
        // The patient shell's own top bar, which exists only below md (the
        // desktop layout is sidebar-and-content, no header). The results
        // control bar pins directly underneath it, so the two numbers have
        // to agree — hence a token rather than the same measurement written
        // down in two files.
        'topbar-patient': '4.0625rem',
      },
      boxShadow: {
        // Every shadow is derived from a single themed colour variable, never
        // a neutral grey — a grey shadow under a warm palette is the single
        // thing that makes depth read as cheap. In light that variable is
        // espresso; in dark it is black, because a warm shadow on a warm dark
        // surface is a smudge rather than a shadow.
        //
        // Each level is two layers: one tight shadow that describes the
        // edge contact, one wide diffuse one that describes the distance
        // from the surface below. That pairing is what separates "floating"
        // from "outlined".
        card: '0 1px 2px 0 rgb(var(--c-shadow) / var(--shadow-tight)), 0 2px 8px -2px rgb(var(--c-shadow) / var(--shadow-diffuse))',
        'card-hover':
          '0 2px 4px 0 rgb(var(--c-shadow) / var(--shadow-tight)), 0 10px 24px -6px rgb(var(--c-shadow) / calc(var(--shadow-diffuse) * 1.75))',
        // Auth form card — deliberately the heaviest surface in the product;
        // it has to genuinely float off the page, not sit flush on it.
        float:
          '0 2px 4px 0 rgb(var(--c-shadow) / var(--shadow-tight)), 0 18px 44px -12px rgb(var(--c-shadow) / calc(var(--shadow-diffuse) * 2.75))',
        // Buttons: tight contact shadow + wide lift, so the fill gradient
        // reads as lit from above rather than merely being two-tone.
        btn: '0 1px 1px 0 rgb(var(--c-shadow) / calc(var(--shadow-tight) * 1.6)), 0 2px 6px -1px rgb(var(--c-shadow) / calc(var(--shadow-diffuse) * 2))',
        'btn-hover':
          '0 1px 2px 0 rgb(var(--c-shadow) / calc(var(--shadow-tight) * 2)), 0 6px 14px -2px rgb(var(--c-shadow) / calc(var(--shadow-diffuse) * 2.75))',
        // Pressed: shadow collapses inward instead of spreading out.
        'btn-active': 'inset 0 2px 4px 0 rgb(var(--c-shadow) / calc(var(--shadow-tight) * 4.5))',
        // Inputs read as recessed, the inverse of every raised surface.
        inset: 'inset 0 1px 2px 0 rgb(var(--c-shadow) / calc(var(--shadow-tight) * 1.6))',
        'inset-focus': 'inset 0 1px 3px 0 rgb(var(--c-shadow) / calc(var(--shadow-tight) * 2))',
        popover:
          '0 4px 8px -2px rgb(var(--c-shadow) / calc(var(--shadow-tight) * 1.6)), 0 16px 32px -8px rgb(var(--c-shadow) / calc(var(--shadow-diffuse) * 2.5))',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      backgroundImage: {
        // Lighter at the top so the fill reads as lit from above. The stop
        // at 55% keeps the gradient from looking like a two-tone band.
        'btn-primary':
          'linear-gradient(to bottom, rgb(255 255 255 / 0.16) 0%, rgb(255 255 255 / 0.04) 55%, rgb(var(--c-shadow) / 0.06) 100%)',
        'btn-secondary':
          'linear-gradient(to bottom, rgb(var(--c-white) / 0.85) 0%, rgb(var(--c-white) / 0.35) 55%, rgb(var(--c-shadow) / 0.03) 100%)',
        // Part Five's category summary bars have to survive greyscale, so each
        // status segment carries a distinct hatch on top of its tint rather
        // than relying on the tint alone.
        'hatch-dense':
          'repeating-linear-gradient(45deg, rgb(var(--c-shadow) / 0.16) 0 2px, transparent 2px 5px)',
        'hatch-open':
          'repeating-linear-gradient(45deg, rgb(var(--c-shadow) / 0.13) 0 2px, transparent 2px 9px)',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        riseIn: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },

      },
      animation: {
        // Short, eased, purposeful (brief §3.8) — motion-safe: variants at
        // every call site respect prefers-reduced-motion automatically.
        fadeIn: 'fadeIn 200ms ease-out',
        riseIn: 'riseIn 250ms ease-out',
      },
    },
  },
  plugins: [
    // The theme itself. Emitted from the token package rather than written out
    // by hand in CSS, so there is exactly one place a colour is decided and no
    // way for the two themes to fall out of step.
    plugin(({ addBase }) => {
      addBase({
        ':root': {
          ...asBaseVars('light'),
          // The three families and Fraunces' fixed axis settings. Same
          // reasoning as the colours: one place decides, and no component
          // writes a font name.
          ...typographyCssVars(),
          // Shadow opacity is part of the theme too: the same alpha that reads
          // as a soft warm shadow on cream disappears entirely on near-black.
          '--shadow-tight': '0.06',
          '--shadow-diffuse': '0.08',
          // How much of `--c-panel` survives on the sidebar. Per theme for the
          // same reason the shadow alphas are: the wash DIMS a cream page and
          // LIFTS a near-black one, and the two directions do not need the same
          // amount of it. From the token package rather than written here, so
          // tokenContrast.test.ts measures the number the stylesheet uses.
          '--panel-wash': String(PANEL_WASH_ALPHA.light),
          // The glass material: one blur and one saturation everywhere, a
          // per-surface alpha. See GLASS in tokens.ts for why the number is a
          // frame budget rather than a taste.
          '--glass-wash': String(GLASS.wash.light),
          '--glass-blur': GLASS.blur,
          '--glass-saturate': GLASS.saturate,
          // What makes the sidebar read as a PANE rather than as a wash. The
          // blur cannot do it on its own — there is nothing behind the column
          // but a flat colour and a smooth gradient, and blurring a smooth
          // gradient returns it unchanged. See PANEL_SHEEN in tokens.ts.
          '--panel-sheen': String(PANEL_SHEEN.peak.light),
          '--panel-sheen-top': String(PANEL_SHEEN.edge.top.light),
          '--panel-sheen-right': String(PANEL_SHEEN.edge.right.light),
          '--panel-grain': String(PANEL_SHEEN.grain.light),
          // How brightly a trend point sparks and how much light the line
          // carries. Per theme because the same alpha is EMISSION on a
          // near-black card and a coloured SHADOW on a near-white one — see
          // SPARK in tokens.ts. These are opacities, not colours: a bare var()
          // is what the call site wants.
          '--chart-spark': String(SPARK.core.light),
          '--chart-spark-past': String(SPARK.core.light * SPARK.pastShare),
          '--chart-line-glow': String(SPARK.line.alpha.light),
          'color-scheme': 'light',
        },
        '.dark': {
          ...asBaseVars('dark'),
          '--shadow-tight': '0.3',
          '--shadow-diffuse': '0.36',
          '--panel-wash': String(PANEL_WASH_ALPHA.dark),
          '--glass-wash': String(GLASS.wash.dark),
          '--glass-blur': GLASS.blur,
          '--glass-saturate': GLASS.saturate,
          '--panel-sheen': String(PANEL_SHEEN.peak.dark),
          '--panel-sheen-top': String(PANEL_SHEEN.edge.top.dark),
          '--panel-sheen-right': String(PANEL_SHEEN.edge.right.dark),
          '--panel-grain': String(PANEL_SHEEN.grain.dark),
          '--chart-spark': String(SPARK.core.dark),
          '--chart-spark-past': String(SPARK.core.dark * SPARK.pastShare),
          '--chart-line-glow': String(SPARK.line.alpha.dark),
          'color-scheme': 'dark',
        },
        /**
         * ── PRINT IS LIGHT, WHATEVER THE SCREEN IS ────────────────────────
         *
         * A patient reading in dark mode who presses Ctrl+P got a near-black
         * page: on a colour printer that is a cartridge of warm brown ink and
         * on a mono one it is a grey slab with white text knocked out of it.
         *
         * It is fixed at the TOKEN layer rather than by overriding colours
         * component by component, because every colour in this product already
         * resolves through these custom properties — so re-emitting the light
         * set under `@media print`, at a selector that beats `.dark`, turns the
         * whole interface light in one place and leaves every `text-espresso`
         * and `bg-cream-50` in the codebase untouched. Anything added later is
         * covered by construction rather than by remembering.
         *
         * The shadow alphas go to zero with it: a warm drop shadow is a grey
         * smudge on paper and costs ink to say nothing.
         */
        '@media print': {
          ':root, .dark': {
            ...asBaseVars('light'),
            '--shadow-tight': '0',
            '--shadow-diffuse': '0',
            '--panel-wash': '0',
            '--glass-wash': '0',
            '--glass-blur': '0px',
            '--glass-saturate': '1',
            '--moment-blur': '0px',
            '--moment-wash': '0',
            '--moment-shade': '0',
            '--panel-sheen': '0',
            '--panel-sheen-top': '0',
            '--panel-sheen-right': '0',
            '--panel-grain': '0',
            // A glow costs ink to say nothing on paper, and a halo printed on a
            // mono laser is a grey smudge round the one mark on the chart that
            // has to stay sharp.
            //
            // ⚠ AND THE CORE HAS TO FLIP WITH IT. With the halo at zero a white
            // core is a white dot on white paper — the points would vanish from
            // a printed chart altogether, which is the one thing this must not
            // do. Espresso here; the line keeps its own status colours, which
            // the light token set above already supplies. So a printed trend is
            // dark points on a white ground with no glow anywhere, which is what
            // a chart in a document should be.
            '--c-chart-spark-core': hexToRgbChannels(brand.espresso),
            '--chart-spark': '0',
            '--chart-spark-past': '0',
            '--chart-line-glow': '0',
            'color-scheme': 'light',
          },
        },
      });
    }),
    // Fraunces' optical-size axis, as three utilities rather than an inline
    // style. `font-display` already carries the section step; these move it.
    plugin(({ addUtilities }) => {
      addUtilities({
        '.opsz-hero': { fontVariationSettings: 'var(--fvs-display-hero)' },
        '.opsz-section': { fontVariationSettings: 'var(--fvs-display-section)' },
        '.opsz-small': { fontVariationSettings: 'var(--fvs-display-small)' },
      });
    }),
  ],
} satisfies Config;
