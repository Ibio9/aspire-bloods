import type { ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { Button } from './Button';
import { LinkButton } from './LinkButton';

interface ErrorStateProps {
  /** Whatever the failing load threw. Anything non-ApiError is treated as an unknown failure. */
  error: unknown;
  /** What the page was trying to load, lowercase — "this report", "this patient". */
  subject?: string;
  /** Where "back" goes. Always named, never a bare arrow. */
  backTo?: { to: string; label: string };
  /** Re-runs the load. Offered for failures that can plausibly succeed on a retry. */
  onRetry?: () => void;
  children?: ReactNode;
}

interface Explanation {
  title: string;
  description: string;
  /** A retry on a 403/404 just fails again — only offer it where it can help. */
  retryable: boolean;
}

/**
 * Every data-backed screen in the app used to hold its loading skeleton
 * forever if the fetch failed — a deleted patient, a report belonging to
 * someone else, an id typed wrong in the URL bar all rendered an
 * indefinite aria-busy shimmer with no explanation and no way onward.
 *
 * This is that missing state: what happened, in the reader's terms, plus a
 * real route out. The status drives the wording because "you don't have
 * access to this" and "this doesn't exist" need different next steps, and
 * conflating them under one generic message is how people end up stuck.
 */
function explain(error: unknown, subject: string): Explanation {
  const status = error instanceof ApiError ? error.status : 0;

  if (status === 404) {
    return {
      title: 'Not found',
      description: `We couldn't find ${subject}. It may have been removed, or the link may be out of date.`,
      retryable: false,
    };
  }
  if (status === 403) {
    return {
      title: 'You don’t have access to this',
      description: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} belongs to an account you're not permitted to view. If you think that's wrong, ask an administrator to check your access.`,
      retryable: false,
    };
  }
  if (status === 401) {
    return {
      title: 'Your session has ended',
      description: 'You’ll need to sign in again to see this. Nothing has been lost — you’ll come straight back here.',
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      title: 'Too many requests',
      description: 'Things are moving faster than we can keep up with. Wait a moment and try again.',
      retryable: true,
    };
  }
  if (status >= 500) {
    return {
      title: 'Something went wrong at our end',
      description: `We couldn't load ${subject}. This is a fault on our side, not anything you did — trying again often works.`,
      retryable: true,
    };
  }
  return {
    title: 'We couldn’t load this',
    description: `Something stopped ${subject} from loading. Check your connection and try again.`,
    retryable: true,
  };
}

export function ErrorState({ error, subject = 'this page', backTo, onRetry, children }: ErrorStateProps) {
  const { title, description, retryable } = explain(error, subject);
  const detail = error instanceof ApiError ? error.message : null;

  return (
    <div role="alert" className="motion-safe:animate-riseIn mx-auto max-w-xl rounded-card border border-taupe bg-cream-50 p-10 text-center shadow-card sm:p-14">
      {/* Shape, not colour alone — the state has to survive greyscale. */}
      <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" className="mx-auto text-bronze">
        <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7.25v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="16.25" r="1" fill="currentColor" />
      </svg>
      <p className="mt-5 font-display text-3xl leading-tight text-espresso">{title}</p>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-espresso/80">{description}</p>
      {detail && detail !== 'Something went wrong' && (
        <p className="mx-auto mt-3 max-w-sm text-xs text-espresso/60">{detail}</p>
      )}
      {children}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {/* Named destination, never a bare arrow — "Back" on its own tells you nothing about where you land. */}
        {backTo && <LinkButton to={backTo.to}>{backTo.label}</LinkButton>}
        {onRetry && retryable && <Button onClick={onRetry}>Try again</Button>}
      </div>
    </div>
  );
}
