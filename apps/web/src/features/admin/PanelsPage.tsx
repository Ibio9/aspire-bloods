import { useEffect, useState } from 'react';
import { ErrorState } from '../../components/ui/ErrorState';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Checkbox } from '../../components/ui/Checkbox';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { apiFetch, ApiError } from '../../lib/api';

/**
 * Panel configuration, and only panel configuration.
 *
 * This screen used to be the first of four tabs on "Panels & content", sharing
 * a page with the marker catalogue, the explanation editor, the review queue
 * and the patient-facing copy blocks. Those are all still here — they moved to
 * the Marker library, which is where analyte wording belongs — and what is left
 * is the one question this screen is actually about: which test levels the
 * clinic sells, and what is in each.
 *
 * The clinic offers three: Core, Insight 360 and Signature. They are seeded
 * from the real Randox catalogue (prisma/seedCatalogue.ts) and are fully
 * editable from here — rename, change composition, activate, deactivate. An
 * admin can add more; a panel is a name and a set of markers, and nothing about
 * the three is structurally special.
 *
 * Nothing here deletes a panel. A report filed against a panel keeps its title
 * for as long as the report exists, so a panel the clinic has stopped selling is
 * deactivated: it leaves the pickers and stays intact behind every report that
 * used it.
 */

interface MarkerRow {
  id: string;
  key: string;
  name: string;
  defaultUnit: string;
  severityMultiplier: number;
  crossSourceComparable: boolean;
  isActive: boolean;
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
  compositionConfirmed: boolean;
  markers: PanelMarkerRow[];
}

/**
 * The three test levels the clinic sells. Used for ordering and for the "custom
 * panel" heading below — not as a permission: every control on this page works
 * the same way on all four kinds of row, because the brief is explicit that the
 * three stay editable.
 */
const CLINIC_PANEL_KEYS = ['core', 'insight-360', 'signature'];

function panelRank(p: PanelRow): number {
  const i = CLINIC_PANEL_KEYS.indexOf(p.key);
  return i === -1 ? CLINIC_PANEL_KEYS.length : i;
}

export function PanelsPage() {
  const { show } = useToast();
  const [panels, setPanels] = useState<PanelRow[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [markers, setMarkers] = useState<MarkerRow[] | null>(null);
  const [newPanelKey, setNewPanelKey] = useState('');
  const [newPanelName, setNewPanelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [addToPanel, setAddToPanel] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<Record<string, string>>({});

  // Without this, a failed load left the skeleton up for ever AND every
  // picker on the page reading "no panels configured yet" — which is a
  // confidently wrong answer, and one that invites someone to create a
  // duplicate of a panel that already exists.
  async function load() {
    setLoadError(null);
    try {
      const [p, m] = await Promise.all([
        apiFetch<PanelRow[]>('/panels/all'),
        apiFetch<MarkerRow[]>('/panels/markers?all=true'),
      ]);
      setPanels(p);
      setMarkers(m);
    } catch (e) {
      setLoadError(e);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPanel() {
    setCreating(true);
    try {
      await apiFetch('/panels', {
        method: 'POST',
        body: JSON.stringify({ key: newPanelKey, name: newPanelName }),
      });
      setNewPanelKey('');
      setNewPanelName('');
      show('Panel created. Add markers to it below.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not create panel.', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function renamePanel(panel: PanelRow) {
    const name = (renaming[panel.id] ?? '').trim();
    if (!name || name === panel.name) {
      setRenaming((r) => ({ ...r, [panel.id]: '' }));
      return;
    }
    try {
      await apiFetch(`/panels/${panel.id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      setRenaming((r) => ({ ...r, [panel.id]: '' }));
      show('Panel renamed.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not rename panel.', 'error');
    }
  }

  async function confirmComposition(panel: PanelRow) {
    try {
      await apiFetch(`/panels/${panel.id}`, { method: 'PATCH', body: JSON.stringify({ compositionConfirmed: true }) });
      show('Marked as confirmed against the real panel spec.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not update panel.', 'error');
    }
  }

  async function togglePanelActive(panel: PanelRow) {
    try {
      await apiFetch(`/panels/${panel.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !panel.isActive }) });
      show(
        panel.isActive
          ? 'Panel deactivated. It leaves the pickers; reports already filed against it are untouched.'
          : 'Panel reactivated.',
        'success',
      );
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not update panel.', 'error');
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
      setAddToPanel((s) => ({ ...s, [panelId]: '' }));
      show('Marker added to panel.', 'success');
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not add marker.', 'error');
    }
  }

  async function reorderMarker(panelId: string, panelMarkerId: string, sortOrder: number) {
    try {
      await apiFetch(`/panels/${panelId}/markers/${panelMarkerId}`, {
        method: 'PATCH',
        body: JSON.stringify({ sortOrder }),
      });
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

  if (loadError != null) {
    return <ErrorState error={loadError} subject="the panel catalogue" onRetry={() => void load()} />;
  }

  if (!panels || !markers) {
    return (
      <>
        <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Panels" />
        <div className="mt-10 flex flex-col gap-6" aria-busy="true" aria-label="Loading panels">
          {[0, 1].map((i) => (
            <Card key={i}>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </Card>
          ))}
        </div>
      </>
    );
  }

  const ordered = [...panels].sort((a, b) => panelRank(a) - panelRank(b) || a.name.localeCompare(b.name));
  const active = ordered.filter((p) => p.isActive);
  const archived = ordered.filter((p) => !p.isActive);

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Panels" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        The test levels the clinic offers, and what each contains. A panel is optional on a report: one with no
        panel is titled by its marker count and date.
      </p>

      {active.length === 0 && (
        <div className="mt-8">
          <EmptyState
            title="No active panels"
            description="Reports can still be uploaded, verified and released without a panel. Reactivate or create one to bring it back to the pickers."
          />
        </div>
      )}

      <div className="mt-8 flex flex-col gap-6">
        {active.map((panel) => (
          <PanelCard
            key={panel.id}
            panel={panel}
            markers={markers}
            renamingValue={renaming[panel.id] ?? ''}
            onRenamingChange={(v) => setRenaming((r) => ({ ...r, [panel.id]: v }))}
            onRename={() => renamePanel(panel)}
            onConfirmComposition={() => confirmComposition(panel)}
            onToggleActive={() => togglePanelActive(panel)}
            onToggleAddOn={(pm) => toggleMarkerAddOn(panel.id, pm)}
            onReorder={(pmId, order) => reorderMarker(panel.id, pmId, order)}
            onRemove={(pmId) => removeMarkerFromPanel(panel.id, pmId)}
            addValue={addToPanel[panel.id] ?? ''}
            onAddValueChange={(v) => setAddToPanel((s) => ({ ...s, [panel.id]: v }))}
            onAdd={() => addMarkerToPanel(panel.id)}
          />
        ))}
      </div>

      <div className="mt-14">
        <p className="eyebrow mb-4">Add a custom panel</p>
        <Card className="flex max-w-xl flex-col gap-3">
          <Input
            label="Key"
            name="panelKey"
            value={newPanelKey}
            onChange={(e) => setNewPanelKey(e.target.value)}
            hint="lowercase-with-hyphens. Permanent: it is what reports and orders refer to."
          />
          <Input label="Name" name="panelName" value={newPanelName} onChange={(e) => setNewPanelName(e.target.value)} />
          <Button
            onClick={createPanel}
            loading={creating}
            disabled={!newPanelKey || !newPanelName}
            disabledReason="A key and a name are both needed."
            className="self-start"
          >
            Create panel
          </Button>
        </Card>
      </div>

      {archived.length > 0 && (
        <div className="mt-14">
          <p className="eyebrow mb-4">Deactivated</p>
          <p className="mb-4 max-w-2xl text-sm leading-relaxed text-espresso/80">
            Not offered any more. Kept rather than deleted: reports already filed against them still carry their
            name.
          </p>
          <div className="flex flex-col gap-3">
            {archived.map((panel) => (
              <Card key={panel.id} className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-espresso">{panel.name}</p>
                  <p className="text-sm text-espresso/80">
                    {panel.key} · {panel.markers.length} marker{panel.markers.length === 1 ? '' : 's'}
                  </p>
                </div>
                <Button variant="secondary" onClick={() => togglePanelActive(panel)}>
                  Reactivate
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function PanelCard({
  panel,
  markers,
  renamingValue,
  onRenamingChange,
  onRename,
  onConfirmComposition,
  onToggleActive,
  onToggleAddOn,
  onReorder,
  onRemove,
  addValue,
  onAddValueChange,
  onAdd,
}: {
  panel: PanelRow;
  markers: MarkerRow[];
  renamingValue: string;
  onRenamingChange: (value: string) => void;
  onRename: () => void;
  onConfirmComposition: () => void;
  onToggleActive: () => void;
  onToggleAddOn: (panelMarker: PanelMarkerRow) => void;
  onReorder: (panelMarkerId: string, sortOrder: number) => void;
  onRemove: (panelMarkerId: string) => void;
  addValue: string;
  onAddValueChange: (value: string) => void;
  onAdd: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const base = panel.markers.filter((pm) => !pm.isAddOn);
  const addOns = panel.markers.filter((pm) => pm.isAddOn);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-64">
                <Input
                  label="Panel name"
                  name={`rename-${panel.id}`}
                  value={renamingValue}
                  onChange={(e) => onRenamingChange(e.target.value)}
                />
              </div>
              <Button
                onClick={() => {
                  onRename();
                  setEditingName(false);
                }}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  onRenamingChange('');
                  setEditingName(false);
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-3">
                <p className="font-display text-2xl leading-tight text-espresso">{panel.name}</p>
                <button
                  type="button"
                  onClick={() => {
                    onRenamingChange(panel.name);
                    setEditingName(true);
                  }}
                  className="rounded-sm text-sm font-medium text-bronze-600 underline underline-offset-2 hover:no-underline"
                >
                  Rename
                </button>
              </div>
              <p className="mt-1 text-sm text-espresso/80">{panel.key}</p>
            </>
          )}
          {panel.description && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-espresso/85">{panel.description}</p>}
          {!panel.compositionConfirmed && (
            <p className="mt-3 inline-flex flex-wrap items-center gap-1.5 text-xs font-medium text-espresso">
              {/* Shape and words carry this, not colour — house rule. */}
              <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 1.5 L15 14 H1 Z M8 6.5 V9.5 M8 11.5 h.01"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Composition not yet checked against the Randox spec sheet
              <button type="button" onClick={onConfirmComposition} className="ml-1 underline underline-offset-2 hover:no-underline">
                Mark confirmed
              </button>
            </p>
          )}
        </div>
        <Checkbox name={`active-${panel.id}`} checked={panel.isActive} onChange={onToggleActive} label="Offered" />
      </div>

      <div className="mt-6">
        <p className="eyebrow mb-3">
          {base.length} marker{base.length === 1 ? '' : 's'}
          {addOns.length > 0 ? ` · ${addOns.length} available as an add-on` : ''}
        </p>
        {panel.markers.length === 0 ? (
          <p className="text-sm text-espresso/80">No markers on this panel yet. Add one below.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {panel.markers.map((pm) => (
              <div key={pm.id} className="flex flex-wrap items-center gap-3 border-b border-taupe pb-2 last:border-b-0">
                <span className="flex-1 text-sm text-espresso">
                  {pm.marker.name}
                  {!pm.marker.isActive && <span className="ml-2 text-xs text-espresso/80">(marker deactivated)</span>}
                </span>
                <Checkbox
                  name={`addon-${pm.id}`}
                  checked={pm.isAddOn}
                  onChange={() => onToggleAddOn(pm)}
                  label="Add-on"
                />
                <input
                  type="number"
                  aria-label={`Sort order for ${pm.marker.name}`}
                  className="input-base tabular w-20 py-1.5"
                  defaultValue={pm.sortOrder}
                  onBlur={(e) => onReorder(pm.id, Number(e.target.value))}
                />
                <Button variant="ghost" onClick={() => onRemove(pm.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <Select
            label="Add marker"
            name={`add-${panel.id}`}
            searchable
            emptyMessage="Every active marker is already on this panel."
            value={addValue}
            onChange={(e) => onAddValueChange(e.target.value)}
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
        <Button variant="secondary" onClick={onAdd} disabled={!addValue} disabledReason="Choose a marker first.">
          Add to panel
        </Button>
      </div>
    </Card>
  );
}
