/*
 * The theme, applied before the first paint.
 *
 * A FILE, served from this origin, rather than an inline <script> in
 * index.html. Inline is what it used to be, and the portal's own
 * Content-Security-Policy — `script-src 'self'`, see vercel.json — blocked it
 * outright: "Executing inline script violates the following Content Security
 * Policy directive", on every route, on every load. The policy was right and
 * the script was wrong. Nothing here is dynamic, so there was never anything
 * inline to gain, and 'unsafe-inline' on a medical portal's script-src to
 * silence a console message would trade the whole protection for a tidy log.
 *
 * Still parser-blocking, and still in <head>: a deferred or bundled version
 * runs after the browser has already painted the light default, which is the
 * cream flash this exists to prevent. One extra request, answered from the
 * same origin, before any pixels — the only thing that changed is where the
 * bytes come from.
 *
 * The body is generated from THEME_BOOTSTRAP_SCRIPT in src/lib/theme.ts, so
 * the storage key and the resolution rules are defined once and this file
 * cannot drift from them. theme.test.ts fails if it does.
 */
(function () {
  try {
    var p = localStorage.getItem('aspire-theme');
    var dark = p === 'dark' || (p !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
