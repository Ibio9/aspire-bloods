import { useEffect, useState } from 'react';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { Tabs } from '../../components/ui/Tabs';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { apiFetch, ApiError } from '../../lib/api';

interface MarkerRow {
  id: string;
  key: string;
  name: string;
  defaultUnit: string;
  severityMultiplier: number;
  crossSourceComparable: boolean;
  isActive: boolean;
  addOnPriceGBP: number | null;
}

interface PanelMarkerRow {
  id: string;
  markerId: string;
  sortOrder: number;
  isAddOn: boolean;
  marker: MarkerRow;
}

interface PanelRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isActive: boolean;
  b2bPriceGBP: number | null;
  markers: PanelMarkerRow[];
}

function formatGBP(value: number | null): string {
  return value == null ? '—' : `£${value.toFixed(2).replace(/\.00$/, '')}`;
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

function PanelsAndMarkersTab() {
  const { show } = useToast();
  const [panels, setPanels] = useState<PanelRow[] | null>(null);
  const [markers, setMarkers] = useState<MarkerRow[] | null>(null);
  const [newPanelKey, setNewPanelKey] = useState('');
  const [newPanelName, setNewPanelName] = useState('');
  const [newPanelPrice, setNewPanelPrice] = useState('');
  const [newMarkerKey, setNewMarkerKey] = useState('');
  const [newMarkerName, setNewMarkerName] = useState('');
  const [newMarkerUnit, setNewMarkerUnit] = useState('');
  const [newMarkerAddOnPrice, setNewMarkerAddOnPrice] = useState('');
  const [addToPanel, setAddToPanel] = useState<Record<string, string>>({});

  async function load() {
    const [p, m] = await Promise.all([
      apiFetch<PanelRow[]>('/panels/all'),
      apiFetch<MarkerRow[]>('/panels/markers?all=true'),
    ]);
    setPanels(p);
    setMarkers(m);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPanel() {
    try {
      await apiFetch('/panels', {
        method: 'POST',
        body: JSON.stringify({
          key: newPanelKey,
          name: newPanelName,
          b2bPriceGBP: newPanelPrice ? Number(newPanelPrice) : undefined,
        }),
      });
      setNewPanelKey('');
      setNewPanelName('');
      setNewPanelPrice('');
      show('Panel created.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not create panel.', 'error');
    }
  }

  async function createMarker() {
    try {
      await apiFetch('/panels/markers', {
        method: 'POST',
        body: JSON.stringify({
          key: newMarkerKey,
          name: newMarkerName,
          defaultUnit: newMarkerUnit,
          addOnPriceGBP: newMarkerAddOnPrice ? Number(newMarkerAddOnPrice) : undefined,
        }),
      });
      setNewMarkerKey('');
      setNewMarkerName('');
      setNewMarkerUnit('');
      setNewMarkerAddOnPrice('');
      show('Marker created.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not create marker.', 'error');
    }
  }

  async function togglePanelActive(panel: PanelRow) {
    try {
      await apiFetch(`/panels/${panel.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !panel.isActive }) });
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not update panel.', 'error');
    }
  }

  async function updatePanelPrice(panel: PanelRow, value: string) {
    const b2bPriceGBP = value.trim() === '' ? null : Number(value);
    if (b2bPriceGBP !== null && Number.isNaN(b2bPriceGBP)) return;
    try {
      await apiFetch(`/panels/${panel.id}`, { method: 'PATCH', body: JSON.stringify({ b2bPriceGBP }) });
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not update price.', 'error');
    }
  }

  async function toggleMarkerActive(marker: MarkerRow) {
    try {
      await apiFetch(`/panels/markers/${marker.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !marker.isActive }) });
      show(marker.isActive ? 'Marker deactivated.' : 'Marker reactivated.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not update marker.', 'error');
    }
  }

  async function toggleMarkerAddOn(panelId: string, panelMarker: PanelMarkerRow) {
    try {
      await apiFetch(`/panels/${panelId}/markers/${panelMarker.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isAddOn: !panelMarker.isAddOn }),
      });
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not update.', 'error');
    }
  }

  async function addMarkerToPanel(panelId: string) {
    const markerId = addToPanel[panelId];
    if (!markerId) return;
    try {
      await apiFetch(`/panels/${panelId}/markers`, { method: 'POST', body: JSON.stringify({ markerId }) });
      show('Marker added to panel.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not add marker.', 'error');
    }
  }

  async function reorderMarker(panelId: string, panelMarkerId: string, sortOrder: number) {
    try {
      await apiFetch(`/panels/${panelId}/markers/${panelMarkerId}`, { method: 'PATCH', body: JSON.stringify({ sortOrder }) });
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not reorder.', 'error');
    }
  }

  async function removeMarkerFromPanel(panelId: string, panelMarkerId: string) {
    try {
      await apiFetch(`/panels/${panelId}/markers/${panelMarkerId}`, { method: 'DELETE' });
      show('Marker removed from panel.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not remove.', 'error');
    }
  }

  if (!panels || !markers) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <p className="eyebrow">New panel</p>
          <Input label="Key" name="panelKey" value={newPanelKey} onChange={(e) => setNewPanelKey(e.target.value)} hint="lowercase-with-hyphens" />
          <Input label="Name" name="panelName" value={newPanelName} onChange={(e) => setNewPanelName(e.target.value)} />
          <Input
            label="B2B price (GBP)"
            name="panelPrice"
            optional
            type="number"
            step="0.01"
            min="0"
            value={newPanelPrice}
            onChange={(e) => setNewPanelPrice(e.target.value)}
            hint="Leave blank if no price has been agreed yet"
          />
          <Button onClick={createPanel} disabled={!newPanelKey || !newPanelName} className="self-start">
            Create panel
          </Button>
        </Card>
        <Card className="flex flex-col gap-3">
          <p className="eyebrow">New marker</p>
          <Input label="Key" name="markerKey" value={newMarkerKey} onChange={(e) => setNewMarkerKey(e.target.value)} hint="lowercase-with-hyphens" />
          <Input label="Name" name="markerName" value={newMarkerName} onChange={(e) => setNewMarkerName(e.target.value)} />
          <Input label="Default unit" name="markerUnit" value={newMarkerUnit} onChange={(e) => setNewMarkerUnit(e.target.value)} />
          <Input
            label="Add-on price (GBP)"
            name="markerAddOnPrice"
            optional
            type="number"
            step="0.01"
            min="0"
            value={newMarkerAddOnPrice}
            onChange={(e) => setNewMarkerAddOnPrice(e.target.value)}
            hint="Only if this marker is sold as an add-on"
          />
          <Button onClick={createMarker} disabled={!newMarkerKey || !newMarkerName || !newMarkerUnit} className="self-start">
            Create marker
          </Button>
        </Card>
      </div>

      {panels.map((panel) => (
        <Card key={panel.id}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-espresso">{panel.name}</p>
              <p className="text-sm text-espresso/80">{panel.key}</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-espresso/80">B2B price</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  aria-label={`B2B price for ${panel.name}`}
                  className="input-base w-28 py-1.5 tabular"
                  defaultValue={panel.b2bPriceGBP ?? ''}
                  placeholder="—"
                  onBlur={(e) => updatePanelPrice(panel, e.target.value)}
                />
              </label>
              <Checkbox
                name={`active-${panel.id}`}
                checked={panel.isActive}
                onChange={() => togglePanelActive(panel)}
                label="Active"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {panel.markers.map((pm) => (
              <div key={pm.id} className="flex flex-wrap items-center gap-3 border-b border-taupe pb-2 last:border-b-0">
                <span className="flex-1 text-sm text-espresso">
                  {pm.marker.name}
                  {pm.marker.addOnPriceGBP != null && (
                    <span className="ml-2 text-xs text-espresso/80">({formatGBP(pm.marker.addOnPriceGBP)})</span>
                  )}
                  {!pm.marker.isActive && <span className="ml-2 text-xs text-status-significantHigh">deactivated</span>}
                </span>
                <Checkbox
                  name={`addon-${pm.id}`}
                  checked={pm.isAddOn}
                  onChange={() => toggleMarkerAddOn(panel.id, pm)}
                  label="Add-on"
                />
                <input
                  type="number"
                  aria-label={`Sort order for ${pm.marker.name}`}
                  className="input-base w-20 py-1.5 tabular"
                  defaultValue={pm.sortOrder}
                  onBlur={(e) => reorderMarker(panel.id, pm.id, Number(e.target.value))}
                />
                <Button variant="ghost" onClick={() => removeMarkerFromPanel(panel.id, pm.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-48">
              <Select
                label="Add marker"
                name={`add-${panel.id}`}
                searchable
                emptyMessage="Every active marker is already on this panel."
                value={addToPanel[panel.id] ?? ''}
                onChange={(e) => setAddToPanel((s) => ({ ...s, [panel.id]: e.target.value }))}
              >
                <option value="">Select a marker…</option>
                {markers
                  .filter((m) => m.isActive && !panel.markers.some((pm) => pm.markerId === m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </Select>
            </div>
            <Button variant="secondary" onClick={() => addMarkerToPanel(panel.id)} disabled={!addToPanel[panel.id]}>
              Add to panel
            </Button>
          </div>
        </Card>
      ))}

      <Card>
        <p className="eyebrow mb-4">All markers</p>
        <div className="flex flex-col gap-2">
          {markers.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 border-b border-taupe pb-2 last:border-b-0">
              <span className="flex-1 text-sm text-espresso">
                {m.name} <span className="text-espresso/80">({m.defaultUnit})</span>
                {m.addOnPriceGBP != null && <span className="ml-2 text-xs text-espresso/80">{formatGBP(m.addOnPriceGBP)} add-on</span>}
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

  if (!markers) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-md">
        <Select
          label="Marker"
          name="explanationMarker"
          searchable
          emptyMessage="No markers configured yet."
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
            Status: {detail?.reviewStatus ?? 'DRAFT'} — editing resets it to draft until reviewed again.
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

  if (!blocks) return <Skeleton className="h-64 w-full" />;

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
          >
            Save
          </Button>
        </Card>
      ))}
    </div>
  );
}

export function ContentConfigPage() {
  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic — Admin console" title="Content & configuration" />

      <div className="mt-8">
        <Tabs
          items={[
            { id: 'panels', label: 'Panels & markers', content: <PanelsAndMarkersTab /> },
            { id: 'explanations', label: 'Marker explanations', content: <ExplanationsTab /> },
            { id: 'copy', label: 'Patient-facing wording', content: <CopyBlocksTab /> },
          ]}
        />
      </div>
    </>
  );
}
