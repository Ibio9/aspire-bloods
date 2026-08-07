/**
 * The theme's storage key and its resolution rule, in one place.
 *
 * Separate from ThemeContext.tsx because the same two facts are needed by
 * something that runs before React exists: the inline script in index.html
 * that applies the theme before the first paint. Without that script, every
 * dark-mode user gets a full-page cream flash on every cold load — which, on a
 * page about their own blood results at eleven at night, is a genuinely
 * unpleasant way to be greeted.
 *
 * The script is inline in index.html rather than imported, because a bundled
 * module runs after the browser has already painted, which is precisely the
 * flash it exists to prevent. THEME_BOOTSTRAP_SCRIPT below is the source of
 * truth for what that inline copy should say.
 */

export const THEME_STORAGE_KEY = 'aspire-theme';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export function readStoredThemePreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Private browsing, or storage disabled entirely. Falling back to the
    // system preference is the right answer either way — it just means the
    // choice doesn't survive the tab.
  }
  return 'system';
}

export function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/** Keep index.html's inline `<script>` byte-identical to this body. */
export const THEME_BOOTSTRAP_SCRIPT = `
(function () {
  try {
    var p = localStorage.getItem('${THEME_STORAGE_KEY}');
    var dark = p === 'dark' || (p !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;
