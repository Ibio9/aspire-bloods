import { useCallback, useEffect, useState } from 'react';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Card } from '../../components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { apiFetch } from '../../lib/api';

/**
 * Randox's live catalogue against ours.
 *
 * Ours was seeded from a pricing email rather than a spec sheet, so
 * divergence from what Randox will actually accept is expected. Three
 * distinct problems, kept separate because the fix differs for each:
 *
 *   Randox offer it, we haven't mapped it  → cannot be ordered until mapped
 *   We list it, Randox don't have it       → in-house, or never really sold
 *   Mapped, then Randox withdrew it        → existing reports fine, new
 *                                             orders will fail
 *
 * Nothing is mapped automatically. A name match between "01 LIPIDS" and our
 * "Lipid Profile" is suggestive, not conclusive, and a wrong panel mapping
 * orders the wrong tests for a real person.
 */

interface CatalogueEntry {
  id: string;
  kind: string;
  randoxId: string;
  name: string;
  code: string | null;
  mappedKey: string | null;
  isCurrent: boolean;
  lastSeenAt: string;
}

interface SideSummary {
  label: 'panel' | 'test';
  randoxTotal: number;
  ourTotal: number;
  mapped: number;
  unmappedRandox: { randoxId: string; name: string; code: string | null }[];
  unmappedOurs: { key: string; name: string }[];
  retired: { randoxId: string; name: string; mappedKey: string | null }[];
}

interface Reconciliation {
  stale: boolean;
  lastRefreshedAt: string | null;
  panels: SideSummary;
  tests: SideSummary;
}

type Tab = 'PANEL' | 'TEST';

export function RandoxCataloguePage() {
  const [summary, setSummary] = useState<Reconciliation | null>(null);
  const [entries, setEntries] = useState<CatalogueEntry[] | null>(null);
  const [tab, setTab] = useState<Tab>('PANEL');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (kind: Tab) => {
    setError(null);
    setEntries(null);
    try {
      const [recon, list] = await Promise.all([
        apiFetch<Reconciliation>('/randox/catalogue'),
        apiFetch<CatalogueEntry[]>(`/randox/catalogue/${kind}`),
      ]);
      setSummary(recon);
      setEntries(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the Randox catalogue.');
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      await apiFetch('/randox/catalogue/refresh', { method: 'POST' });
      await load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  }

  async function saveMapping(entry: CatalogueEntry, mappedKey: string) {
    setSavingId(entry.id);
    setError(null);
    try {
      await apiFetch(`/randox/catalogue/entry/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ mappedKey: mappedKey === '' ? null : mappedKey }),
      });
      await load(tab);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that mapping.');
    } finally {
      setSavingId(null);
    }
  }

  const side = summary ? (tab === 'PANEL' ? summary.panels : summary.tests) : null;
  const ourOptions = side?.unmappedOurs ?? [];

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Randox catalogue" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        What Randox actually offer, against what our own catalogue lists. Ours was built from a pricing email rather
        than a spec sheet, so expect them to differ. A panel or test with no mapping cannot be ordered. The order is
        refused rather than sent with a guessed identifier.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh from Randox'}
        </Button>
        {summary && (
          <span className="text-sm text-espresso/70">
            {summary.lastRefreshedAt
              ? `Last refreshed ${new Date(summary.lastRefreshedAt).toLocaleString('en-GB')}`
              : 'Never refreshed'}
            {summary.stale && ', out of date'}
          </span>
        )}
      </div>

      {error && (
        // Inline rather than the full-page ErrorState: the rest of the
        // screen is still usable when a refresh fails, and the cached
        // catalogue below is exactly what an admin wants to see when it does.
        <div role="alert" className="mt-4 rounded-input border border-bronze/50 bg-bronze/5 p-4 text-sm text-espresso">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-2" role="tablist" aria-label="Catalogue type">
        {(['PANEL', 'TEST'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-tap rounded-full px-4 py-1.5 text-sm transition duration-150 ease-out ${
              tab === t ? 'bg-bronze text-white shadow-btn' : 'bg-taupe/30 text-espresso hover:bg-taupe/50'
            }`}
          >
            {t === 'PANEL' ? 'Panels' : 'Tests'}
          </button>
        ))}
      </div>

      {side && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-espresso/70">Mapped</p>
            <p className="text-2xl tabular text-espresso">
              {side.mapped}
              <span className="text-base text-espresso/60"> / {side.randoxTotal}</span>
            </p>
            <p className="mt-1 text-xs text-espresso/60">Randox entries with one of ours against them.</p>
          </Card>
          <Card>
            <p className="text-sm text-espresso/70">Not mapped</p>
            <p className="text-2xl tabular text-espresso">{side.unmappedRandox.length}</p>
            <p className="mt-1 text-xs text-espresso/60">Randox offer these; we can't order them yet.</p>
          </Card>
          <Card>
            <p className="text-sm text-espresso/70">Only in our catalogue</p>
            <p className="text-2xl tabular text-espresso">{side.unmappedOurs.length}</p>
            <p className="mt-1 text-xs text-espresso/60">Aspire in-house, or not actually sold by Randox.</p>
          </Card>
        </div>
      )}

      {side && side.retired.length > 0 && (
        <div className="mt-4 rounded-input border border-bronze/50 bg-bronze/5 p-4">
          <p className="text-sm font-medium text-espresso">
            Withdrawn by Randox: {side.retired.length} mapped {side.retired.length === 1 ? 'entry' : 'entries'}
          </p>
          <p className="mt-1 text-sm text-espresso/75">
            Existing reports are unaffected. New orders using these will be rejected.
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-espresso/80">
            {side.retired.map((r) => (
              <li key={r.randoxId}>
                {r.name} <span className="text-espresso/60">(mapped to {r.mappedKey})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entries === null ? (
        <div className="mt-6 flex flex-col gap-2" aria-busy="true" aria-label="Loading catalogue">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing cached yet"
            description="Refresh from Randox to pull their current panel and test list. This needs the API credentials to be configured."
          />
        </div>
      ) : (
        <div className="mt-6">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Randox name</TableHeaderCell>
                <TableHeaderCell>Randox id</TableHeaderCell>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Our {tab === 'PANEL' ? 'panel' : 'marker'}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.name}</TableCell>
                  <TableCell className="tabular">{entry.randoxId}</TableCell>
                  <TableCell>{entry.code ?? '—'}</TableCell>
                  <TableCell>
                    {/* Text label first, never colour alone — house rule. */}
                    {!entry.isCurrent
                      ? 'Withdrawn by Randox'
                      : entry.mappedKey
                        ? 'Mapped'
                        : 'Not mapped, cannot be ordered'}
                  </TableCell>
                  <TableCell>
                    <Select
                      label={`Our ${tab === 'PANEL' ? 'panel' : 'marker'} for ${entry.name}`}
                      hideLabel
                      name={`map-${entry.id}`}
                      optional
                      disabled={savingId === entry.id}
                      value={entry.mappedKey ?? ''}
                      onChange={(e) => void saveMapping(entry, e.target.value)}
                    >
                      <option value="">Not mapped</option>
                      {entry.mappedKey && <option value={entry.mappedKey}>{entry.mappedKey}</option>}
                      {ourOptions.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.name}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
