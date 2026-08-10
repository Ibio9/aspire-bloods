import { useEffect, useState } from 'react';
import { ErrorState } from '../../components/ui/ErrorState';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { ExplanationReviewQueue } from './ExplanationReviewQueue';
import { apiFetch, ApiError } from '../../lib/api';

/**
 * The analyte catalogue and everything written about it.
 *
 * This is where three things went when "Panels & content" was cut back to panel
 * configuration. None of them was redundant and none of them is managed
 * anywhere else:
 *
 *   - the marker catalogue itself (create an analyte, retire one),
 *   - the review queue that lets patient-facing explanation copy out of DRAFT,
 *     without which the copy is written and never seen, and
 *   - the explanation editor and the two patient-facing copy blocks.
 *
 * They belong together: all four tabs are about an analyte and the words the
 * patient reads next to it. Panels are about what the clinic sells.
 *
 * Reference ranges are deliberately NOT here. A range lives on the result it
 * came from, not on the marker — the catalogue's seeded ranges exist only to
 * pre-fill the verify form, and what an admin confirms at verify time is what
 * is stored.
 */

interface MarkerRow {
  id: string;
  key: string;
  name: string;
  defaultUnit: string;
  resultType: 'MEASURED' | 'GENETIC' | 'SENSITIVITY' | 'COMPOSITION';
  severityMultiplier: number;
  crossSourceComparable: boolean;
  isActive: boolean;
}

interface MarkerExplanationDetail {
  id: string;
  markerId: string;
  whatItIs: string;
  highMeans: string | null;
  lowMeans: string | null;
  lifestyleContext: string | null;
  reviewStatus: 'DRAFT' | 'REVIEWED' | 'PUBLISHED';
}

interface CopyBlockRow {
  id: string;
  slug: string;
  body: string;
  version: number;
}

const RESULT_TYPE_LABEL: Record<MarkerRow['resultType'], string> = {
  MEASURED: 'Measured',
  GENETIC: 'Genetic',
  SENSITIVITY: 'Sensitivity',
  COMPOSITION: 'Body composition',
};

function MarkersTab() {
  const { show } = useToast();
  const [markers, setMarkers] = useState<MarkerRow[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [newMarkerKey, setNewMarkerKey] = useState('');
  const [newMarkerName, setNewMarkerName] = useState('');
  const [newMarkerUnit, setNewMarkerUnit] = useState('');
  const [creating, setCreating] = useState(false);
  const [showRetired, setShowRetired] = useState(false);

  async function load() {
    setLoadError(null);
    try {
      setMarkers(await apiFetch<MarkerRow[]>('/panels/markers?all=true'));
    } catch (e) {
      // A failed load used to render as an empty catalogue, which reads as
      // "there are no markers" rather than "we couldn't ask".
      setLoadError(e);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createMarker() {
    setCreating(true);
    try {
      await apiFetch('/panels/markers', {
        method: 'POST',
        body: JSON.stringify({ key: newMarkerKey, name: newMarkerName, defaultUnit: newMarkerUnit }),
      });
      setNewMarkerKey('');
      setNewMarkerName('');
      setNewMarkerUnit('');
      show('Marker created.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not create marker.', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function toggleMarkerActive(marker: MarkerRow) {
    try {
      await apiFetch(`/panels/markers/${marker.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !marker.isActive }),
      });
      show(
        marker.isActive
          ? 'Marker retired. Results already filed against it are untouched.'
          : 'Marker reactivated.',
        'success',
      );
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not update marker.', 'error');
    }
  }

  if (loadError != null) {
    return <ErrorState error={loadError} subject="the marker catalogue" onRetry={() => void load()} />;
  }

  if (!markers) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading markers">
        {[0, 1, 2].map((i) => (
          <Card key={i} padding="tight">
            <Skeleton className="h-5 w-56" />
          </Card>
        ))}
      </div>
    );
  }

  const activeMarkers = markers.filter((m) => m.isActive);
  const retired = markers.filter((m) => !m.isActive);

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex max-w-xl flex-col gap-3">
        <p className="eyebrow">New marker</p>
        <p className="text-sm leading-relaxed text-espresso/80">
          Most analytes arrive with the Randox catalogue import. Add one here only where the clinic measures
          something Randox doesn't supply.
        </p>
        <Input
          label="Key"
          name="markerKey"
          value={newMarkerKey}
          onChange={(e) => setNewMarkerKey(e.target.value)}
          hint="lowercase-with-hyphens"
        />
        <Input label="Name" name="markerName" value={newMarkerName} onChange={(e) => setNewMarkerName(e.target.value)} />
        <Input
          label="Default unit"
          name="markerUnit"
          value={newMarkerUnit}
          onChange={(e) => setNewMarkerUnit(e.target.value)}
        />
        <Button
          onClick={createMarker}
          loading={creating}
          disabled={!newMarkerKey || !newMarkerName || !newMarkerUnit}
          disabledReason="A key, a name and a unit are all needed."
          className="self-start"
        >
          Create marker
        </Button>
      </Card>

      <div>
        <p className="eyebrow mb-4">
          {activeMarkers.length} marker{activeMarkers.length === 1 ? '' : 's'} in the catalogue
        </p>
        {activeMarkers.length === 0 ? (
          <EmptyState
            title="No markers yet"
            description="Run the catalogue import, or add one above, before it can be put on a panel."
          />
        ) : (
          <Card>
            <div className="flex flex-col gap-2">
              {activeMarkers.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 border-b border-taupe pb-2 last:border-b-0">
                  <span className="flex-1 text-sm text-espresso">
                    {m.name}
                    {m.defaultUnit && <span className="text-espresso/80"> ({m.defaultUnit})</span>}
                    {m.resultType !== 'MEASURED' && (
                      <span className="ml-2 text-xs text-espresso/80">{RESULT_TYPE_LABEL[m.resultType]}</span>
                    )}
                  </span>
                  <Checkbox
                    name={`marker-active-${m.id}`}
                    checked={m.isActive}
                    onChange={() => toggleMarkerActive(m)}
                    label="Active"
                  />
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {retired.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowRetired((s) => !s)}
            aria-expanded={showRetired}
            className="rounded-sm text-sm font-medium text-bronze-600 underline underline-offset-2 hover:no-underline"
          >
            {showRetired ? 'Hide' : 'Show'} {retired.length} retired marker{retired.length === 1 ? '' : 's'}
          </button>
          {showRetired && (
            <Card className="mt-4">
              <p className="mb-3 text-sm leading-relaxed text-espresso/80">
                Not offered any more. Kept rather than deleted: results already filed against them still refer to
                them.
              </p>
              <div className="flex flex-col gap-2">
                {retired.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-3 border-b border-taupe pb-2 last:border-b-0">
                    <span className="flex-1 text-sm text-espresso">{m.name}</span>
                    <Button variant="ghost" onClick={() => toggleMarkerActive(m)}>
                      Reactivate
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ExplanationsTab() {
  const { show } = useToast();
  const [markers, setMarkers] = useState<MarkerRow[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<MarkerExplanationDetail | null>(null);
  const [form, setForm] = useState({ whatItIs: '', highMeans: '', lowMeans: '', lifestyleContext: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void apiFetch<MarkerRow[]>('/panels/markers').then(setMarkers);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void apiFetch<MarkerExplanationDetail>(`/panels/markers/${selectedId}/explanation`).then((d) => {
      setDetail(d);
      setForm({
        whatItIs: d.whatItIs,
        highMeans: d.highMeans ?? '',
        lowMeans: d.lowMeans ?? '',
        lifestyleContext: d.lifestyleContext ?? '',
      });
    });
  }, [selectedId]);

  async function save(reviewStatus?: 'DRAFT' | 'REVIEWED' | 'PUBLISHED') {
    if (!selectedId) return;
    setSaving(true);
    try {
      const updated = await apiFetch<MarkerExplanationDetail>(`/panels/markers/${selectedId}/explanation`, {
        method: 'PATCH',
        body: JSON.stringify({
          whatItIs: form.whatItIs,
          highMeans: form.highMeans || null,
          lowMeans: form.lowMeans || null,
          lifestyleContext: form.lifestyleContext || null,
        }),
      });
      setDetail(updated);
      if (reviewStatus) {
        await apiFetch(`/panels/markers/${selectedId}/explanation/review-status`, {
          method: 'PATCH',
          body: JSON.stringify({ reviewStatus }),
        });
        setDetail((d) => (d ? { ...d, reviewStatus } : d));
      }
      show('Explanation saved.', 'success');
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not save.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!markers) {
    return (
      <Card className="max-w-md" aria-busy="true" aria-label="Loading markers">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-3 h-11 w-full" />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-md">
        <Select
          label="Marker"
          name="explanationMarker"
          searchable
          emptyMessage={<>No markers in the catalogue yet. Add one under the Markers tab.</>}
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">Select a marker…</option>
          {markers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
      </Card>

      {selectedId && (
        <Card className="flex flex-col gap-4">
          <p className="text-sm text-espresso/80">
            Status: {detail?.reviewStatus ?? 'DRAFT'}. Editing resets it to draft until reviewed again.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="whatItIs" className="text-sm font-medium text-espresso">
              What it is
            </label>
            <textarea
              id="whatItIs"
              className="input-base min-h-24"
              value={form.whatItIs}
              onChange={(e) => setForm((f) => ({ ...f, whatItIs: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="highMeans" className="text-sm font-medium text-espresso">
              If it's high
            </label>
            <textarea
              id="highMeans"
              className="input-base min-h-20"
              value={form.highMeans}
              onChange={(e) => setForm((f) => ({ ...f, highMeans: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lowMeans" className="text-sm font-medium text-espresso">
              If it's low
            </label>
            <textarea
              id="lowMeans"
              className="input-base min-h-20"
              value={form.lowMeans}
              onChange={(e) => setForm((f) => ({ ...f, lowMeans: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="lifestyleContext" className="text-sm font-medium text-espresso">
              Lifestyle context
            </label>
            <textarea
              id="lifestyleContext"
              className="input-base min-h-20"
              value={form.lifestyleContext}
              onChange={(e) => setForm((f) => ({ ...f, lifestyleContext: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button loading={saving} onClick={() => save()} disabled={!form.whatItIs}>
              Save draft
            </Button>
            <Button variant="secondary" loading={saving} onClick={() => save('REVIEWED')} disabled={!form.whatItIs}>
              Save and mark reviewed
            </Button>
            <Button variant="secondary" loading={saving} onClick={() => save('PUBLISHED')} disabled={!form.whatItIs}>
              Save and publish
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function CopyBlocksTab() {
  const { show } = useToast();
  const [blocks, setBlocks] = useState<CopyBlockRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    const rows = await apiFetch<CopyBlockRow[]>('/admin/copy-blocks');
    setBlocks(rows);
    setDrafts(Object.fromEntries(rows.map((b) => [b.slug, b.body])));
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(slug: string) {
    setSaving(slug);
    try {
      await apiFetch(`/admin/copy-blocks/${slug}`, { method: 'PATCH', body: JSON.stringify({ body: drafts[slug] }) });
      show('Saved.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not save.', 'error');
    } finally {
      setSaving(null);
    }
  }

  if (!blocks) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading copy blocks">
        {[0, 1].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-4 h-32 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {blocks.map((b) => (
        <Card key={b.id} className="flex flex-col gap-3">
          <p className="eyebrow">{b.slug.replace(/_/g, ' ')}</p>
          <textarea
            aria-label={b.slug}
            className="input-base min-h-32"
            value={drafts[b.slug] ?? ''}
            onChange={(e) => setDrafts((d) => ({ ...d, [b.slug]: e.target.value }))}
          />
          <Button
            className="self-start"
            loading={saving === b.slug}
            onClick={() => save(b.slug)}
            disabled={drafts[b.slug] === b.body}
            disabledReason="Nothing has changed yet."
          >
            Save
          </Button>
        </Card>
      ))}
    </div>
  );
}

// Named for the admin side explicitly: features/patient has its own
// MarkerLibraryPage, which is the patient-facing explanation library.
export function AdminMarkerLibraryPage() {
  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Marker library" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        Every analyte the clinic can report, and the wording a patient reads beside it. Explanation copy isn't
        visible to patients until it has been reviewed.
      </p>

      <div className="mt-10">
        <Tabs
          items={[
            // Review sits first: approving existing copy is the routine job,
            // writing new copy is the occasional one.
            { id: 'review', label: 'Review queue', content: <ExplanationReviewQueue /> },
            { id: 'markers', label: 'Markers', content: <MarkersTab /> },
            { id: 'explanations', label: 'Marker explanations', content: <ExplanationsTab /> },
            { id: 'copy', label: 'Patient-facing wording', content: <CopyBlocksTab /> },
          ]}
        />
      </div>
    </>
  );
}
