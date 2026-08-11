import { useCallback, useEffect, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { apiFetch } from '../../lib/api';

/**
 * ---------------------------------------------------------------------------
 * Which of our panels is which of Randox's — the mapping, on the panels page.
 * ---------------------------------------------------------------------------
 *
 * RELOCATED, not new. This used to be a separate "Randox catalogue" screen in
 * the sidebar. That screen is gone: it was a browsable dump of seven reference
 * sets, six of which nobody ever needs to look at, and it sat in the
 * navigation of a console whose daily job is patients and reports.
 *
 * But one thing on it was load-bearing and had nowhere else to live. Ordering
 * refuses outright to place an order for a panel with no Randox identifier
 * mapped against it — deliberately, because sending a partial order means a
 * patient is bled and billed for tests that were never ordered. So an unmapped
 * panel is not a cosmetic gap; it is a panel that cannot be sold. That
 * decision belongs beside the panels themselves, which is here.
 *
 * Nothing about it is automatic. A name match between "01 LIPIDS" and our
 * "Lipid Profile" is suggestive and not conclusive, and a wrong mapping orders
 * the wrong tests for a real person. An admin says which is which, and the
 * server records who and when.
 *
 * The other five reference sets — biological sexes, ethnicities, testing and
 * cancellation reasons, clinic locations — are still fetched and cached by the
 * refresh below, because the ordering code reads them. They are values, not
 * decisions, so there is nothing here for anyone to do with them and no screen
 * that lists them.
 */

interface CatalogueEntry {
  randoxId: string;
  name: string;
  code: string | null;
}

interface OurEntry {
  key: string;
  name: string;
}

interface Reconciliation {
  stale: boolean;
  lastRefreshedAt: string | null;
  panels: Side;
  tests: Side;
}

interface Side {
  label: string;
  randoxTotal: number;
  ourTotal: number;
  mapped: number;
  unmappedRandox: CatalogueEntry[];
  unmappedOurs: OurEntry[];
  retired: { randoxId: string; name: string; mappedKey: string | null }[];
}

interface CatalogueRow {
  id: string;
  randoxId: string;
  name: string;
  code: string | null;
  mappedKey: string | null;
  isCurrent: boolean;
}

export function RandoxMappingSection({ ourPanels }: { ourPanels: { key: string; name: string }[] }) {
  const { show } = useToast();
  const [summary, setSummary] = useState<Reconciliation | null>(null);
  const [entries, setEntries] = useState<CatalogueRow[] | null>(null);
  // "Randox is switched off in this environment" and "the request failed" are
  // different facts, and this section renders nothing in the first case rather
  // than showing an admin an error about an integration nobody enabled.
  const [unavailable, setUnavailable] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([
        apiFetch<Reconciliation>('/randox/catalogue'),
        apiFetch<CatalogueRow[]>('/randox/catalogue/PANEL'),
      ]);
      setSummary(s);
      setEntries(e);
    } catch {
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await apiFetch('/randox/catalogue/refresh', { method: 'POST' });
      await load();
      show('Randox reference data refreshed.');
    } catch (e) {
      // A partial refresh saved what it could and names what it could not.
      show(e instanceof Error ? e.message : 'The refresh failed.', 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function setMapping(id: string, mappedKey: string) {
    setSaving(id);
    try {
      await apiFetch(`/randox/catalogue/entry/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ mappedKey: mappedKey === '' ? null : mappedKey }),
      });
      await load();
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not save that mapping.', 'error');
    } finally {
      setSaving(null);
    }
  }

  if (unavailable) return null;

  if (summary === null || entries === null) {
    return (
      <div className="mt-16" aria-busy="true" aria-label="Loading the Randox mapping">
        <p className="eyebrow mb-4">Randox panel mapping</p>
        <Skeleton className="h-32 w-full max-w-3xl" />
      </div>
    );
  }

  const current = entries.filter((e) => e.isCurrent);

  return (
    <section className="mt-16" aria-labelledby="randox-mapping-heading">
      <h2 id="randox-mapping-heading" className="font-display text-2xl text-espresso">
        Randox panel mapping
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-espresso/85">
        Which of our panels each of Randox’s corresponds to. A panel with nothing mapped against it cannot be
        ordered — ordering refuses rather than sending a partial order, because a partial order means a patient is
        bled for tests that were never placed.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button variant="secondary" loading={refreshing} onClick={() => void refresh()}>
          Refresh from Randox
        </Button>
        <p className="text-xs text-espresso/80">
          {summary.lastRefreshedAt
            ? `Last refreshed ${new Date(summary.lastRefreshedAt).toLocaleDateString('en-GB')}`
            : 'Never refreshed'}
          {summary.stale && ' · out of date'}
          {` · ${summary.panels.mapped} of ${summary.panels.randoxTotal} panels mapped`}
        </p>
      </div>

      {current.length === 0 ? (
        <Card className="mt-5 max-w-3xl">
          <p className="text-sm leading-relaxed text-espresso">
            Randox’s panel list has not been fetched yet. Refresh above — it is a handful of calls and only needs
            doing when their catalogue changes.
          </p>
        </Card>
      ) : (
        <Card className="mt-5 max-w-3xl">
          <ul>
            {current.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-end justify-between gap-4 border-b border-taupe py-3.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-espresso">{entry.name}</p>
                  <p className="tabular text-xs text-espresso/80">
                    Randox id {entry.randoxId}
                    {entry.code ? ` · ${entry.code}` : ''}
                  </p>
                </div>
                <div className="min-w-56">
                  <Select
                    label="Our panel"
                    name={`map-${entry.id}`}
                    value={entry.mappedKey ?? ''}
                    disabled={saving === entry.id}
                    onChange={(e) => void setMapping(entry.id, e.target.value)}
                  >
                    <option value="">Not mapped</option>
                    {ourPanels.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {summary.panels.retired.length > 0 && (
        <Card className="mt-4 max-w-3xl">
          <p className="eyebrow mb-2">Withdrawn by Randox</p>
          <p className="text-sm leading-relaxed text-espresso/85">
            {summary.panels.retired.map((r) => r.name).join(', ')}. Reports already filed against these keep working;
            new orders for them will be refused.
          </p>
        </Card>
      )}
    </section>
  );
}
