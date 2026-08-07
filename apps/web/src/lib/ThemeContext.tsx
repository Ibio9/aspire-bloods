import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  readStoredThemePreference,
  systemTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

/**
 * Light / dark, across the patient portal and the admin console alike.
 *
 * Three states, not two. "System" is the default and is a genuinely different
 * setting from "light": someone whose phone flips to dark at sunset expects
 * this to follow, and collapsing that into a boolean at first paint loses the
 * distinction for ever. Choosing light or dark explicitly pins it and stops
 * the OS overriding them.
 *
 * The choice is per-device rather than per-account: it belongs to the screen
 * being read, not to the person. Someone on a bright clinic monitor and a
 * phone in bed wants different answers on each, and syncing it to the account
 * would give them one answer for both. It is also, deliberately, not clinical
 * data — nothing about it is worth sending to the server.
 *
 * The storage key and the resolution rule live in ./theme.ts, because the
 * inline script in index.html needs the same two facts before React exists.
 * Import ThemePreference and ResolvedTheme from there too.
 */

interface ThemeContextValue {
  /** What the patient chose. */
  preference: ThemePreference;
  /** What that resolves to right now, once the system preference is taken into account. */
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredThemePreference);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  // Only matters while the preference is "system", but the listener is kept
  // attached regardless: subscribing and unsubscribing as the preference
  // changes would mean a stale `system` value the moment someone switched
  // back to it.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? system : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    // Native chrome — scrollbars, form controls we haven't fully restyled,
    // the browser's own find-in-page highlight — reads this and nothing else.
    root.style.colorScheme = resolved;
  }, [resolved]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      // See readStoredThemePreference: the choice still applies to this tab.
    }
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside a ThemeProvider');
  return ctx;
}
