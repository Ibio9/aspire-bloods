import { useCallback, useEffect, useState } from 'react';
import { formatDateTime } from '@aspire-bloods/shared';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { apiFetch } from '../../lib/api';

/**
 * ---------------------------------------------------------------------------
 * HOW MUCH OF THE ANALYTE MAP HAS ACTUALLY MET A RANDOX PAYLOAD.
 * ---------------------------------------------------------------------------
 *
 * A Randox result row identifies its test by a STRING — there is no marker id
 * and no code on it — so `analyteMap.ts` matches that string against our own
 * catalogue's names and aliases. 186 markers resolve from their own names and
 * NONE of them had ever been checked against a real delivery. That is
 * self-consistency, not confirmation, and 86 answer to exactly one spelling:
 * one difference in how Randox print any of those and the result goes to the
 * queue below instead of onto a report.
 *
 * Inventing plausible Randox spellings to close that gap would be worse than
 * the gap — the queue catches an ABSENT mapping and nothing catches a wrong
 * one. So the uncertainty is not closed here, it is SHOWN here, which is the
 * thing that was missing: it used to live in a generated audit report and a
 * comment in a source file, neither of which anybody opens.
 *
 * TWO NUMBERS, SIDE BY SIDE, NEVER ADDED TOGETHER. What the code claims about
 * itself, and what a real delivery has proved. The second starts at zero and
 * the panel says so in words, because an empty state reads like a page that
 * failed to load.
 */

interface Confidence {
  catalogueMeasured: number;
  resolvesFromOwnName: number;
  singleSpellingOnly: { key: string; name: string }[];
  confirmedByCodeAlone: number;
  confirmedByRealPayload: number;
  stringsSeen: number;
  stringsResolved: number;
  stringsUnmapped: number;
  acceptedByAdmin: number;
  lastSeenAt: string | null;
}

interface Suggestion {
  markerKey: string;
  markerName: string;
  tier: 'exact' | 'rotation' | 'tokens' | 'stem' | 'substring';
  why: string;
}

interface QueueEntry {
  id: string;
  analyte: string;
  displayName: string | null;
  group: string | null;
  sampleType: string | null;
  sampleOrderNumber: string | null;
  sightings: number;
  firstSeenAt: string;
  lastSeenAt: string;
  suggestions: Suggestion[];
}

/** One unmapped analyte, its suggestions, and the control that accepts one. */
function QueueRow({
  entry,
  markers,
  onAccepted,
}: {
  entry: QueueEntry;
  markers: { key: string; name: string }[];
  onAccepted: (queue: QueueEntry[]) => void;
}) {
  const { show } = useToast();
  // NOTHING IS PRE-SELECTED, and that is the whole rule. A pre-filled picker on
  // a fuzzy suggestion is an auto-apply with an extra click in front of it:
  // whoever is working through a queue of forty will accept the default on
  // thirty-nine of them without reading it. Empty until a person chooses.
  const [chosen, setChosen] = useState('');
  const [saving, setSaving] = useState(false);

  async function accept() {
    if (!chosen) return;
    setSaving(true);
    try {
      const { queue } = await apiFetch<{ queue: QueueEntry[] }>(`/randox/analytes/${entry.id}/accept`, {
        method: 'POST',
        body: JSON.stringify({ markerKey: chosen }),
      });
      onAccepted(queue);
      show(`“${entry.analyte}” will now be filed against ${markers.find((m) => m.key === chosen)?.name ?? chosen}.`);
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not save that mapping.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="border-b border-taupe py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="numeric text-base font-medium text-espresso">{entry.analyte}</p>
        <p className="text-xs text-espresso/80">
          {[
            entry.displayName && entry.displayName !== entry.analyte ? `shown as “${entry.displayName}”` : null,
            entry.group ? `group ${entry.group}` : null,
            entry.sampleType ? `sample ${entry.sampleType}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'no group or sample type given'}
        </p>
      </div>
      <p className="mt-1 text-xs text-espresso/80">
        Seen <span className="numeric">{entry.sightings}</span>{' '}
        {entry.sightings === 1 ? 'time' : 'times'}, last {formatDateTime(entry.lastSeenAt)}
        {entry.sampleOrderNumber ? ` · order ${entry.sampleOrderNumber}` : ''}
      </p>

      {entry.suggestions.length > 0 && (
        <div className="mt-3">
          {/* SUGGESTIONS, SAID OUT LOUD. The word is in the heading, each one
              carries why it was suggested, and the weakest kind says so —
              "one name contains the other" is what confuses Magnesium with
              RBC Magnesium, and it must not sit in the list looking like the
              rest. */}
          <p className="eyebrow">Suggestions, not answers</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {entry.suggestions.map((s) => (
              <li key={s.markerKey} className="text-sm text-espresso/85">
                <span className="font-medium text-espresso">{s.markerName}</span>
                {s.tier === 'substring' && <span className="text-status-high"> · weakest kind of match</span>}
                <span className="block text-xs text-espresso/80">{s.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-64">
          <Select
            label="File this analyte against"
            name={`marker-${entry.id}`}
            value={chosen}
            disabled={saving}
            onChange={(e) => setChosen(e.target.value)}
          >
            <option value="">Choose a marker…</option>
            {markers.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
        <Button variant="secondary" disabled={!chosen} loading={saving} onClick={() => void accept()}>
          Accept mapping
        </Button>
      </div>
    </li>
  );
}

export function AnalyteMappingPanel() {
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [queue, setQueue] = useState<QueueEntry[] | null>(null);
  const [markers, setMarkers] = useState<{ key: string; name: string }[]>([]);
  // Randox switched off in this environment is not an error to report.
  const [unavailable, setUnavailable] = useState(false);
  const [showSingles, setShowSingles] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, q] = await Promise.all([
        apiFetch<Confidence>('/randox/analytes/confidence'),
        apiFetch<{ queue: QueueEntry[]; markers: { key: string; name: string }[] }>('/randox/analytes/unmapped'),
      ]);
      setConfidence(c);
      setQueue(q.queue);
      setMarkers(q.markers);
    } catch {
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (unavailable) return null;

  if (confidence === null || queue === null) {
    return (
      <div className="mt-14" aria-busy="true" aria-label="Loading the analyte mapping status">
        <p className="eyebrow mb-4">Analyte mapping</p>
        <Skeleton className="h-32 w-full max-w-3xl" />
      </div>
    );
  }

  const c = confidence;

  return (
    <section className="mt-14" aria-labelledby="analyte-mapping-heading">
      <h2 id="analyte-mapping-heading" className="font-display text-xl text-espresso">
        Analyte mapping: what we assume, and what we have seen
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-espresso/85">
        A Randox result identifies its test by a name rather than a code, so every result has to be matched by that
        name against our catalogue. The two figures below come from different places and are deliberately not added
        together: the first is what our own catalogue says about itself, the second is what a real delivery has
        proved.
      </p>

      <Card className="mt-5 max-w-3xl">
        <dl className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Assumed</dt>
            <dd className="stat-value mt-1 numeric">
              {c.resolvesFromOwnName} / {c.catalogueMeasured}
            </dd>
            <dd className="mt-1 text-xs leading-relaxed text-espresso/80">
              measured markers that resolve from their own catalogue name. This is self-consistency, our catalogue
              agreeing with itself, and it is not evidence that Randox spell any of them the same way.
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Confirmed by a real payload</dt>
            <dd className="stat-value mt-1 numeric">
              {c.confirmedByRealPayload} / {c.catalogueMeasured}
            </dd>
            <dd className="mt-1 text-xs leading-relaxed text-espresso/80">
              {c.confirmedByRealPayload === 0
                ? 'Nothing yet. No Randox delivery has been ingested in this environment, so not one mapping has met the spelling Randox actually send.'
                : `distinct markers a delivery has resolved to, across ${c.stringsResolved} analyte ${
                    c.stringsResolved === 1 ? 'spelling' : 'spellings'
                  }. Counted from deliveries, never from the catalogue.`}
            </dd>
          </div>
        </dl>

        <p className="mt-5 border-t border-taupe pt-4 text-xs leading-relaxed text-espresso/80">
          <span className="numeric">{c.stringsSeen}</span> distinct analyte spelling
          {c.stringsSeen === 1 ? '' : 's'} seen in total · <span className="numeric">{c.stringsUnmapped}</span> still
          unmapped · <span className="numeric">{c.acceptedByAdmin}</span> mapped by hand
          {c.lastSeenAt ? ` · last delivery ${formatDateTime(c.lastSeenAt)}` : ''}
        </p>
      </Card>

      {/* THE 86. Listed rather than counted, because they are the ones to check
          first against the first real payload: a marker that answers to exactly
          one spelling has no second chance if Randox print it differently. */}
      <div className="mt-4 max-w-3xl">
        <button
          type="button"
          onClick={() => setShowSingles((v) => !v)}
          aria-expanded={showSingles}
          className="rounded-input text-sm font-medium text-bronze-700 underline underline-offset-2"
        >
          {showSingles ? 'Hide' : 'Show'} the {c.singleSpellingOnly.length} markers that answer to only one spelling
        </button>
        {showSingles && (
          <Card className="mt-3">
            <p className="text-sm leading-relaxed text-espresso/85">
              Each of these has no alias and no override, so it resolves on its catalogue name and nothing else. If
              Randox print any of them differently, whether a word order, an abbreviation or a bracket, that result lands in
              the queue below rather than on a report. These are the ones to check first against the first real
              delivery.
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {c.singleSpellingOnly.map((m) => (
                <li key={m.key} className="text-xs text-espresso/85">
                  {m.name}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <h3 className="mt-10 font-display text-lg text-espresso">Analytes we could not place</h3>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-espresso/85">
        Randox sent these and nothing in our catalogue matched, so each one held its report back rather than being
        dropped. Accepting a mapping files that exact spelling against that marker from the next delivery onwards.
        Nothing here is applied automatically and nothing is pre-selected.
      </p>
      <Card className="mt-4 max-w-3xl">
        {queue.length === 0 ? (
          <p className="text-sm leading-relaxed text-espresso">
            Nothing is waiting. That is the expected state before the first real delivery. It means no analyte has
            failed to map, not that every mapping has been checked.
          </p>
        ) : (
          <ul>
            {queue.map((entry) => (
              <QueueRow key={entry.id} entry={entry} markers={markers} onAccepted={setQueue} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
