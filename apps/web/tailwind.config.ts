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
        card: '0 1px 2px 0 rgb(66 60 54 / 0.05)',
      },
      transitionDuration: {
        DEFAULT: '150ms',
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
