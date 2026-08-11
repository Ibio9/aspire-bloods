/**
 * The theme's storage key and its resolution rule, in one place.
 *
 * Separate from ThemeContext.tsx because the same two facts are needed by
 * something that runs before React exists: public/theme-bootstrap.js, loaded
 * from <head> in index.html, which applies the theme before the first paint.
 * Without it, every dark-mode user gets a full-page cream flash on every cold
 * load — which, on a page about their own blood results at eleven at night, is
 * a genuinely unpleasant way to be greeted.
 *
 * It is a separate FILE rather than an inline block or a bundled import, for
 * two reasons that pull in opposite directions and are both binding: a bundled
 * module runs after the browser has already painted, which is precisely the
 * flash it exists to prevent; and an inline block is refused outright by the
 * portal's `script-src 'self'` CSP. A parser-blocking file from this origin is
 * the only shape that satisfies both.
 *
 * THEME_BOOTSTRAP_SCRIPT below is the source of truth for what that file says,
 * and theme.test.ts fails if the two drift apart.
 */

export const THEME_STORAGE_KEY = 'aspire-theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/**
 * DARK IS THE DEFAULT (Aug 2026).
 *
 * Not "system", which is what it used to be. The portal is a dark,
 * atmospheric, spacious thing — that is the register the clinic's own site is
 * in and the one this product is designed for, and a first visit on a
 * light-mode laptop was landing on the theme the design is least about.
 *
 * Three things this does NOT change, and each of them is the reason it is
 * safe: a stored choice still wins outright, "System" is still an option in
 * Account & privacy and still follows the device when chosen, and the toggle
 * is still one press from anywhere. The default is what happens when nobody
 * has said anything, and it is now dark.
 */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark';

export function readStoredThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Private browsing, or storage disabled entirely. Falling back to the
    // default is the right answer either way — it just means the choice
    // doesn't survive the tab.
  }
  return DEFAULT_THEME_PREFERENCE;
}

export function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Keep public/theme-bootstrap.js's body byte-identical to this.
 *
 * The resolution rule, and it is the same one readStoredThemePreference
 * follows: an explicit 'dark' or 'light' wins; 'system' consults the device;
 * and ANYTHING ELSE — no stored value, a corrupted one, storage unavailable —
 * is dark, because dark is the default. That last clause is why the condition
 * is written as `p !== 'light'` rather than as a check for 'dark': the empty
 * case has to land on dark without a second branch, or a first visit paints
 * cream and then flips.
 */
export const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var p = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = p === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : p !== 'light';
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;
