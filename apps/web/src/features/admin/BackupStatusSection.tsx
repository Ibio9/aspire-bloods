import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiFetch } from '../../lib/api';
import { UNIT, type BackupStatus, type WorkQueue } from './workQueueData';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  IS THERE A COPY OF THE DATABASE ANYWHERE ELSE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * On 12 August 2026 the R2 bucket was inspected for the first time: 0 bytes,
 * empty, zero operations. The script was correct, the verification logic was
 * good, and no Railway service had ever been created to run it — so the practice
 * had been operating with no off-platform backup for months and nothing anywhere
 * could have said so. The failure mode of a backup job is not crashing, it is
 * being ABSENT, and absence is silent by construction. This is what makes it
 * loud.
 *
 * ── IT MOVED OFF THE WORK QUEUE (Aug 2026) ────────────────────────────────
 *
 * It led that screen, above the exceptions, and the argument for the position
 * was that absence is silent. It is still silent and this is still the thing
 * that says so — but a backup is not WORK. Nothing on that screen was a row a
 * clinician could clear; the only response to an overdue backup is to open
 * Railway, which is not what somebody is doing at nine in the morning. It is
 * the last section of Settings, with the other things you look up rather than
 * work through, and it is OPEN BY DEFAULT there — the one section that is,
 * because the state it exists to report is the one nobody would think to go
 * looking for.
 *
 * THREE STATES, NOT TWO. "Never run" and "last succeeded four days ago" are
 * different problems: the first means the cron service does not exist or has
 * never fired, the second means it exists and has stopped. And a run that
 * FAILED last night is a third — the job is alive and the backup is not — which
 * a panel showing only the last success would render as ordinary staleness.
 *
 * NOT A TRAFFIC LIGHT. Red, amber and green mean a clinical finding everywhere
 * else in this product and reusing them here would make the vocabulary mean two
 * things. An overdue backup is carried by the word and by full text weight
 * against the muted default.
 */
export function BackupStatusSection() {
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    apiFetch<WorkQueue>('/admin/work-queue')
      .then((q) => setBackup(q.backup))
      .catch(() => setFailed(true));
  }, []);

  useEffect(load, [load]);

  if (failed) {
    return <p className="text-sm text-espresso/85">The backup state could not be read.</p>;
  }

  if (backup === null) {
    return (
      <Card className="max-w-3xl">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-3 h-4 w-56" />
      </Card>
    );
  }

  const failedLast = backup.lastRun?.outcome === 'FAILED';

  /**
   * ── THE UNIT SITS AGAINST THE NUMBER (Aug 2026) ─────────────────────────
   *
   * It was `${hours} h ago` with an ordinary space, which at the 2xl step put
   * about 9px of nothing between a figure and the letter that gives it meaning
   * — so "36 h ago" read as three things rather than as one measurement. The
   * NARROW NO-BREAK SPACE (U+202F) is the typographic space for exactly this:
   * about a third the width, and being no-break it cannot leave "36" at the end
   * of a line with "h" at the start of the next. Every unit in the console goes
   * through a formatter that uses it — see `formatDuration` in workQueueData.ts
   * and the one in AnalyticsPage.tsx.
   */
  const headline = backup.neverRun
    ? 'never'
    : backup.hoursSinceSuccess === null
      ? 'never'
      : backup.hoursSinceSuccess < 1
        ? 'under an hour ago'
        : backup.hoursSinceSuccess < 48
          ? `${backup.hoursSinceSuccess}${UNIT}h ago`
          : `${Math.floor(backup.hoursSinceSuccess / 24)}${UNIT}d ago`;

  return (
    <Card className="max-w-3xl">
      <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3">
        <div>
          <p
            className={`numeric tabular text-2xl font-medium leading-none ${
              backup.overdue ? 'text-espresso' : 'text-espresso/85'
            }`}
          >
            {headline}
          </p>
          <p className="mt-1.5 text-sm text-espresso/85">last successful backup</p>
        </div>
        {backup.lastRun && (
          <div>
            <p className="text-sm font-medium text-espresso">
              {backup.lastRun.outcome === 'SUCCEEDED' ? 'Last run succeeded' : 'Last run FAILED'}
            </p>
            <p className="numeric mt-1 text-xs text-espresso/80">{formatDate(backup.lastRun.startedAt)}</p>
          </div>
        )}
      </div>

      {backup.neverRun && (
        // The state that was live for months, said in as many words. Not
        // "unknown" and not "no data": there has never been a backup. This is
        // the one paragraph on this section that survived the prose cut, and it
        // survived because it names the fix — a sentence that tells somebody
        // what to do is not an explanation of the screen.
        <p className="mt-5 max-w-measure border-t border-taupe pt-4 text-sm font-medium leading-relaxed text-espresso">
          No backup has ever run. There is no off-platform copy of this database. See DEPLOYMENT.md, “Standing up the
          backup cron service”.
        </p>
      )}

      {!backup.neverRun && backup.overdue && (
        <p className="mt-5 max-w-measure border-t border-taupe pt-4 text-sm font-medium leading-relaxed text-espresso">
          The last successful backup is more than {backup.overdueAfterHours} hours old. The job runs nightly, so two
          missed nights means it has stopped rather than stumbled.
        </p>
      )}

      {failedLast && backup.lastRun && (
        <p className="mt-4 max-w-measure text-sm leading-relaxed text-espresso/85">
          The last run failed
          {backup.lastRun.failureStage ? ` at the ${backup.lastRun.failureStage.toLowerCase()} stage` : ''}.
          {backup.lastRun.errorMessage ? ` ${backup.lastRun.errorMessage}` : ''}
        </p>
      )}

      {!backup.overdue && !failedLast && backup.lastRun?.objectKey && (
        <p className="numeric mt-5 border-t border-taupe pt-4 text-xs text-espresso/80">{backup.lastRun.objectKey}</p>
      )}
    </Card>
  );
}
