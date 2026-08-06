import { useCallback, useEffect, useState } from 'react';
import type { PatientBiologicalSex } from '@aspire-bloods/shared';
import { apiFetch } from './api';

/**
 * The patient's biological sex, and whether it's been recorded yet.
 *
 * It's optional at registration on purpose — an extra required field on the
 * sign-up form costs registrations, and a brand-new account holds no results
 * for a reference range to apply to anyway. But two things downstream need
 * it and neither can be fudged:
 *
 *  - Randox's CreatePendingOrder requires a BiologicalSexId, so an account
 *    without one literally cannot have a test ordered;
 *  - sex-specific reference ranges can't be resolved without it, and the
 *    server now refuses to guess rather than quietly applying the "any"
 *    range (see server lib/resolveReferenceRange.ts).
 *
 * So it's asked for at the two moments it actually matters — before booking,
 * and on the account page if it's missing — and this hook is what both of
 * those read. `recorded === false` is a normal state, not an error state.
 */
export interface BiologicalSexState {
  sex: PatientBiologicalSex | null;
  /** Randox's own id for the value, resolved server-side. Null when unrecorded. */
  randoxBiologicalSexId: number | null;
  canOrderTests: boolean;
  hasProfile: boolean;
}

export function useBiologicalSex() {
  const [state, setState] = useState<BiologicalSexState | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await apiFetch<BiologicalSexState>('/patient/me/biological-sex'));
      setFailed(false);
    } catch {
      // A prompt that can't load is a prompt that doesn't render. It must
      // never block the screen it sits on — booking and the account page
      // both stay usable, they just don't nag.
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (sex: PatientBiologicalSex) => {
    const next = await apiFetch<BiologicalSexState>('/patient/me/biological-sex', {
      method: 'PUT',
      body: JSON.stringify({ sex }),
    });
    setState(next);
    return next;
  }, []);

  return { state, failed, reload: load, save };
}
