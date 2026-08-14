import { PIPELINE_STAGES, stageIndex, whatsNext, type ReportStatus } from '../../lib/reportStatus';

/**
 * The release pipeline, made visible on every report (brief §1: "the problem is
 * it's invisible"). Shape carries the state, not colour alone — done steps get a
 * filled dot, the current one a ring, upcoming ones an empty outline — so it
 * reads correctly without relying on the bronze/taupe contrast alone.
 *
 * Three stages now, from five and then four. `held` is a separate prop rather
 * than a stage: it is a property of the report and not a position in the
 * pipeline, and it is the difference between "read, not released" and "held on a
 * question" — which was being lost here, because the sentence underneath was
 * being asked for the status alone.
 */
export function ReportProgress({
  status,
  voided,
  held = false,
}: {
  status: ReportStatus;
  voided?: boolean;
  held?: boolean;
}) {
  const current = stageIndex(status);
  const isChangesRequested = status === 'CHANGES_REQUESTED';

  return (
    <div>
      <ol className="flex items-center" aria-label="Release pipeline progress">
        {PIPELINE_STAGES.map((stage, i) => {
          const isDone = i < current;
          const isCurrent = i === current;
          return (
            <li key={stage.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs font-medium transition duration-150 ${
                    voided
                      ? 'border-espresso/30 bg-transparent text-espresso/30'
                      : isDone
                        ? 'border-bronze bg-bronze text-onaccent'
                        : isCurrent
                          ? isChangesRequested
                            ? 'border-status-high bg-white text-status-high'
                            : 'border-bronze bg-white text-bronze'
                          : 'border-taupe bg-transparent text-espresso/40'
                  }`}
                  aria-hidden="true"
                >
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8.5 L6.5 12 L13 4.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span className={`text-xs ${isCurrent ? 'font-medium text-espresso' : 'text-espresso/80'}`}>{stage.label}</span>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <div
                  className={`mx-1.5 mb-4 h-0.5 flex-1 ${voided ? 'bg-espresso/20' : i < current ? 'bg-bronze' : 'bg-taupe'}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-espresso/80">
        {voided ? 'This report has been voided. It no longer moves through the pipeline.' : whatsNext(status, held)}
      </p>
    </div>
  );
}
