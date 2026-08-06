import type { Config } from 'tailwindcss';
import { brand, scales, status, typography, ink, inkScale } from '@aspire-bloods/shared';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bronze: { ...scales.bronze, DEFAULT: brand.bronze },
        espresso: { ...scales.espresso, DEFAULT: brand.espresso },
        cream: { ...scales.cream, DEFAULT: brand.cream },
        taupe: { ...scales.taupe, DEFAULT: brand.taupe },
        white: brand.white,
        ink: { ...inkScale, DEFAULT: ink },
        status: {
          inRange: status.inRange.hex,
          high: status.high.hex,
          low: status.low.hex,
          significantHigh: status.significantHigh.hex,
          significantLow: status.significantLow.hex,
        },
      },
      fontFamily: {
        display: [typography.display.fontFamily],
        eyebrow: [typography.eyebrow.fontFamily],
        body: [typography.body.fontFamily],
      },
      letterSpacing: {
        eyebrow: typography.eyebrow.letterSpacing,
      },
      borderRadius: {
        // Soft, generous radii (brief §3: "soft radius" on dropdowns/cards) — card and input are
        // deliberately different values so a dropdown panel or date popover sitting on top of an
        // input reads as a distinct, slightly softer surface rather than a uniform stack.
        card: '1rem',
        input: '0.625rem',
      },
      boxShadow: {
        // Every shadow is derived from espresso (66 60 54), never neutral
        // grey — a grey shadow under a warm palette is the single thing
        // that makes depth read as cheap, so there are no neutral values in
        // this scale at all.
        //
        // Each level is two layers: one tight shadow that describes the
        // edge contact, one wide diffuse one that describes the distance
        // from the surface below. That pairing is what separates "floating"
        // from "outlined".
        card: '0 1px 2px 0 rgb(66 60 54 / 0.06), 0 2px 8px -2px rgb(66 60 54 / 0.08)',
        'card-hover': '0 2px 4px 0 rgb(66 60 54 / 0.07), 0 10px 24px -6px rgb(66 60 54 / 0.14)',
        // Auth form card — deliberately the heaviest surface in the product;
        // it has to genuinely float off the cream, not sit flush on it.
        float: '0 2px 4px 0 rgb(66 60 54 / 0.06), 0 18px 44px -12px rgb(66 60 54 / 0.22)',
        // Buttons: tight contact shadow + wide lift, so the fill gradient
        // reads as lit from above rather than merely being two-tone.
        btn: '0 1px 1px 0 rgb(66 60 54 / 0.10), 0 2px 6px -1px rgb(66 60 54 / 0.16)',
        'btn-hover': '0 1px 2px 0 rgb(66 60 54 / 0.12), 0 6px 14px -2px rgb(66 60 54 / 0.22)',
        // Pressed: shadow collapses inward instead of spreading out.
        'btn-active': 'inset 0 2px 4px 0 rgb(66 60 54 / 0.28)',
        // Inputs read as recessed, the inverse of every raised surface.
        inset: 'inset 0 1px 2px 0 rgb(66 60 54 / 0.10)',
        'inset-focus': 'inset 0 1px 3px 0 rgb(66 60 54 / 0.12)',
        popover: '0 4px 8px -2px rgb(66 60 54 / 0.10), 0 16px 32px -8px rgb(66 60 54 / 0.20)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
      },
      backgroundImage: {
        // Lighter at the top so the fill reads as lit from above. The stop
        // at 55% keeps the gradient from looking like a two-tone band.
        'btn-primary': 'linear-gradient(to bottom, rgb(255 255 255 / 0.16) 0%, rgb(255 255 255 / 0.04) 55%, rgb(66 60 54 / 0.06) 100%)',
        'btn-secondary': 'linear-gradient(to bottom, rgb(255 255 255 / 0.85) 0%, rgb(255 255 255 / 0.35) 55%, rgb(66 60 54 / 0.03) 100%)',
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
  plugins: [],
} satisfies Config;
