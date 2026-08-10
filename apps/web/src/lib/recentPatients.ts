const STORAGE_KEY = 'aspire_recent_patients';
const MAX_ENTRIES = 6;

export interface RecentPatient {
  id: string;
  name: string;
  viewedAt: string;
}

/** Per-browser only (localStorage) — a convenience shortcut back to whoever an admin was just
 * looking at, not an audit trail (the real one is server-side and unaffected by this). */
export function recordPatientView(id: string, name: string): void {
  try {
    const existing = readRecentPatients().filter((p) => p.id !== id);
    const next = [{ id, name, viewedAt: new Date().toISOString() }, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private browsing, quota) — this is a convenience feature,
    // never worth surfacing an error for.
  }
}

export function readRecentPatients(): RecentPatient[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Dropped on sign-out, for the same reason the sidebar's marker index is
 * (see resetPatientPortalCaches).
 *
 * This is six real patients' names, written to disk on a clinic workstation.
 * Signing out doesn't reload the page and localStorage outlives the session
 * regardless, so without this the next person to use that browser opened the
 * admin dashboard onto the previous clinician's list of who they had just
 * been looking at — and the names sat on the disk indefinitely afterwards.
 */
export function clearRecentPatients(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Same reasoning as recordPatientView: storage can be unavailable, and
    // this is never worth surfacing an error for.
  }
}
