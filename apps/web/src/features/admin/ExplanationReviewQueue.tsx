import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, type MarkerReviewStatus } from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { apiFetch, ApiError } from '../../lib/api';

interface ExplanationRow {
  markerId: string;
  markerName: string;
  markerKey: string;
  hasExplanation: boolean;
  whatItIs: string;
  highMeans: string | null;
  lowMeans: string | null;
  lifestyleContext: string | null;
  reviewStatus: MarkerReviewStatus;
  version: number;
  reviewedAt: string | null;
  reviewedByName: string | null;
}

type Filter = 'DRAFT' | 'ALL';

const STATUS_COPY: Record<MarkerReviewStatus, { label: string; hint: string }> = {
  DRAFT: { label: 'Draft', hint: 'Not visible to patients' },
  REVIEWED: { label: 'Reviewed', hint: 'Visible to patients' },
  PUBLISHED: { label: 'Published', hint: 'Visible to patients' },
};

/**
 * Bulk review queue for patient-facing marker copy.
 *
 * Every explanation seeds as DRAFT and the patient read path only returns
 * REVIEWED or PUBLISHED — correct, and unchanged. But approving 60 markers
 * one at a time through the single-marker editor is work nobody does, which
 * is why the most valuable content in the product was never rendering. This
 * shows the copy itself (not just a marker name — you cannot approve what
 * you can't read), select-all-on-page, one action.
 *
 * Bulk here is a UI affordance only: the API writes one audit entry per
 * explanation, so the record of who approved which wording is per-marker
 * exactly as it is for a single approval.
 */
export function ExplanationReviewQueue() {
  const { show } = useToast();
  const [rows, setRows] = useState<ExplanationRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('DRAFT');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch<ExplanationRow[]>('/panels/markers/explanations');
    setRows(data);
    setSelected(new Set());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (!rows) return [];
    // Only markers that actually have copy can be approved — an empty
    // explanation isn't a draft awaiting sign-off, it's nothing to sign off.
    const withCopy = rows.filter((r) => r.hasExplanation && r.whatItIs.trim());
    return filter === 'DRAFT' ? withCopy.filter((r) => r.reviewStatus === 'DRAFT') : withCopy;
  }, [rows, filter]);

  const draftCount = rows?.filter((r) => r.hasExplanation && r.reviewStatus === 'DRAFT').length ?? 0;
  const missingCount = rows?.filter((r) => !r.hasExplanation || !r.whatItIs.trim()).length ?? 0;

  const allOnPageSelected = visible.length > 0 && visible.every((r) => selected.has(r.markerId));

  function toggleAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) visible.forEach((r) => next.delete(r.markerId));
      else visible.forEach((r) => next.add(r.markerId));
      return next;
    });
  }

  function toggleOne(markerId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(markerId)) next.delete(markerId);
      else next.add(markerId);
      return next;
    });
  }

  async function applyStatus(reviewStatus: MarkerReviewStatus) {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const result = await apiFetch<{ updated: number; unchanged: number; missing: number }>(
        '/panels/markers/explanations/review',
        { method: 'POST', body: JSON.stringify({ markerIds: [...selected], reviewStatus }) },
      );
      const noun = result.updated === 1 ? 'explanation' : 'explanations';
      show(
        `${result.updated} ${noun} set to ${STATUS_COPY[reviewStatus].label.toLowerCase()}.` +
          (result.unchanged ? ` ${result.unchanged} already were.` : ''),
        'success',
      );
      await load();
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not update.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!rows) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading review queue">
        {[0, 1, 2].map((i) => (
          <Card key={i} padding="tight">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="mt-3 h-4 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <Card padding="tight">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="eyebrow">Review queue</p>
            <p className="mt-2 text-sm text-espresso">
              {draftCount === 0 ? (
                'Every marker explanation has been reviewed. Patients can see all of them.'
              ) : (
                <>
                  <span className="tabular font-medium">{draftCount}</span> explanation
                  {draftCount === 1 ? '' : 's'} still in draft. Patients cannot see draft copy.
                </>
              )}
            </p>
            {missingCount > 0 && (
              <p className="mt-1.5 text-sm text-espresso/80">
                <span className="tabular">{missingCount}</span> marker{missingCount === 1 ? ' has' : 's have'} no
                explanation written yet. Add copy in the Explanations tab before it can be reviewed.
              </p>
            )}
          </div>

          {/* Not a native select — see Listbox/Select; this is a two-state toggle so plain buttons are clearer. */}
          <div className="flex items-center gap-1 rounded-full border border-taupe p-1">
            {(['DRAFT', 'ALL'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`min-h-tap rounded-full px-4 text-sm font-medium transition duration-150 ease-out ${
                  filter === f ? 'bg-bronze text-onaccent shadow-btn' : 'text-espresso hover:bg-cream-200'
                }`}
              >
                {f === 'DRAFT' ? 'Awaiting review' : 'All markers'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {visible.length === 0 ? (
        <EmptyState
          title={filter === 'DRAFT' ? 'Nothing awaiting review' : 'No marker copy yet'}
          description={
            filter === 'DRAFT'
              ? 'Every marker explanation with copy written against it has been reviewed and is visible to patients.'
              : 'No marker has an explanation written against it yet. Add copy in the Explanations tab, then approve it here.'
          }
        />
      ) : (
        <>
          {/* Sticky action bar: with 60 markers on screen the controls have to
              stay reachable without scrolling back to the top. */}
          <div className="sticky top-topbar z-10 flex flex-wrap items-center gap-4 rounded-card border border-taupe bg-cream-50/95 px-5 py-4 shadow-card backdrop-blur">
            <Checkbox
              name="select-all"
              checked={allOnPageSelected}
              onChange={toggleAllOnPage}
              label={`Select all ${visible.length} shown`}
            />
            <span className="tabular text-sm text-espresso/80">{selected.size} selected</span>
            <div className="ml-auto flex flex-wrap gap-3">
              <Button
                onClick={() => applyStatus('REVIEWED')}
                loading={saving}
                disabled={selected.size === 0}
                disabledReason="Select at least one explanation to approve."
              >
                Approve as reviewed
              </Button>
              <Button
                variant="secondary"
                onClick={() => applyStatus('DRAFT')}
                disabled={selected.size === 0 || saving}
                disabledReason="Select at least one explanation to return to draft."
              >
                Return to draft
              </Button>
            </div>
          </div>

          <ul className="flex flex-col gap-5">
            {visible.map((row) => {
              const isSelected = selected.has(row.markerId);
              return (
                <li key={row.markerId}>
                  <Card className={isSelected ? 'border-bronze' : ''}>
                    <div className="flex items-start gap-4">
                      <div className="pt-1">
                        <Checkbox
                          name={`select-${row.markerId}`}
                          checked={isSelected}
                          onChange={() => toggleOne(row.markerId)}
                          label={`Select ${row.markerName}`}
                          labelHidden
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <p className="font-display text-2xl leading-tight text-espresso">{row.markerName}</p>
                          {/* Text label carries the state; no colour-only status. */}
                          <span className="eyebrow">
                            {STATUS_COPY[row.reviewStatus].label}: {STATUS_COPY[row.reviewStatus].hint}
                          </span>
                        </div>
                        {row.reviewedAt && (
                          <p className="mt-1.5 text-xs text-espresso/80">
                            Last reviewed {formatDate(row.reviewedAt)}
                            {row.reviewedByName ? ` by ${row.reviewedByName}` : ''}
                          </p>
                        )}

                        <p className="mt-5 leading-relaxed text-espresso">{row.whatItIs}</p>
                        {row.highMeans && (
                          <p className="mt-4 text-sm leading-relaxed text-espresso/90">
                            <span className="font-medium text-espresso">If it's high: </span>
                            {row.highMeans}
                          </p>
                        )}
                        {row.lowMeans && (
                          <p className="mt-2 text-sm leading-relaxed text-espresso/90">
                            <span className="font-medium text-espresso">If it's low: </span>
                            {row.lowMeans}
                          </p>
                        )}
                        {row.lifestyleContext && (
                          <p className="mt-2 text-sm leading-relaxed text-espresso/90">
                            <span className="font-medium text-espresso">Lifestyle: </span>
                            {row.lifestyleContext}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
