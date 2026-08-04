import helmet from 'helmet';

/**
 * Strict CSP: no external hosts anywhere (fonts/scripts are self-hosted via
 * @fontsource + Vite bundling, so there is nothing to allow-list).
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // 'unsafe-inline' on style-src only (never script-src): Recharts/SVG
      // libraries set inline style attributes for positioning. Inline
      // style injection is a materially lower-severity risk than script
      // injection, so this is an accepted, documented tradeoff.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' },
});
