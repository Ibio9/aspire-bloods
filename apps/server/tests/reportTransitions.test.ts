import { describe, it, expect } from 'vitest';
import type { ReportStatus } from '@aspire-bloods/shared';
import { canPerform, resultingStatus, isPatientVisible, queueState } from '../src/lib/reportTransitions.js';

/**
 * ONE HUMAN GATE, AND IT IS A CLINICIAN (changed Aug 2026).
 *
 *   UPLOADED → PARSED → CLINICIAN_REVIEWED → RELEASED
 *
 * ADMIN_VERIFIED is gone. What this file has to keep proving is that removing a
 * stage did not remove the guarantee: nothing reaches a patient without a
 * clinician having said so, and the fact that a parse was not clean survives the
 * loss of the stage that used to carry it.
 */
const ALL_STATUSES: ReportStatus[] = [
  'UPLOADED',
  'PARSED',
  'CHANGES_REQUESTED',
  'CLINICIAN_REVIEWED',
  'RELEASED',
];

describe('release pipeline transitions', () => {
  it('exposes exactly one patient-visible status', () => {
    const visible = ALL_STATUSES.filter(isPatientVisible);
    expect(visible).toEqual(['RELEASED']);
  });

  describe('the gate cannot be skipped', () => {
    it('only allows release from CLINICIAN_REVIEWED', () => {
      const releasable = ALL_STATUSES.filter((s) => canPerform('release', s));
      expect(releasable).toEqual(['CLINICIAN_REVIEWED']);
    });

    it('only allows clinician review from PARSED', () => {
      const reviewable = ALL_STATUSES.filter((s) => canPerform('review', s));
      expect(reviewable).toEqual(['PARSED']);
    });

    // Together these two are the whole guarantee, and it is now shorter than it
    // was rather than weaker: CLINICIAN_REVIEWED is reachable only via review,
    // review only from PARSED, and release only from CLINICIAN_REVIEWED. So an
    // UPLOADED report cannot reach a patient without a clinician acting on it.
    it('cannot release an unparsed or unreviewed report', () => {
      expect(canPerform('release', 'UPLOADED')).toBe(false);
      expect(canPerform('release', 'PARSED')).toBe(false);
      expect(canPerform('release', 'CHANGES_REQUESTED')).toBe(false);
    });

    it('has no action that lands on RELEASED except release', () => {
      const actions = (['parse', 'verify', 'review'] as const).map((a) => resultingStatus(a));
      expect(actions).not.toContain('RELEASED');
    });
  });

  describe('no stage can be improperly reversed', () => {
    it('refuses every action on an already-released report', () => {
      expect(canPerform('parse', 'RELEASED')).toBe(false);
      expect(canPerform('verify', 'RELEASED')).toBe(false);
      expect(canPerform('review', 'RELEASED')).toBe(false);
      // Re-releasing is what would fire escalation a second time.
      expect(canPerform('release', 'RELEASED')).toBe(false);
    });

    it('refuses to re-parse or correct underneath a completed clinical review', () => {
      expect(canPerform('parse', 'CLINICIAN_REVIEWED')).toBe(false);
      expect(canPerform('verify', 'CLINICIAN_REVIEWED')).toBe(false);
    });
  });

  describe('CHANGES_REQUESTED is a loop back, not a fifth forward stage', () => {
    it('allows re-parsing and correcting', () => {
      expect(canPerform('parse', 'CHANGES_REQUESTED')).toBe(true);
      expect(canPerform('verify', 'CHANGES_REQUESTED')).toBe(true);
    });

    it('does not itself allow review or release', () => {
      expect(canPerform('review', 'CHANGES_REQUESTED')).toBe(false);
      expect(canPerform('release', 'CHANGES_REQUESTED')).toBe(false);
    });

    it('is where a rejected review lands', () => {
      expect(resultingStatus('review', false)).toBe('CHANGES_REQUESTED');
      expect(resultingStatus('review', true)).toBe('CLINICIAN_REVIEWED');
    });
  });

  describe('verify is a correction, not a gate', () => {
    // The single change that removes the second human step. If this ever lands
    // on a status of its own again, that status is a gate whether or not anybody
    // meant it to be, because `review` would have to be permitted from it.
    it('lands back on PARSED', () => {
      expect(resultingStatus('verify')).toBe('PARSED');
    });

    it('can be performed from every state before the review', () => {
      expect(canPerform('verify', 'UPLOADED')).toBe(true);
      expect(canPerform('verify', 'PARSED')).toBe(true);
      expect(canPerform('verify', 'CHANGES_REQUESTED')).toBe(true);
    });

    it('does not advance a report toward the patient', () => {
      // Reviewable before the correction and reviewable after it — no more, no
      // less. A correction that made a report reviewable when it was not would be
      // the removed gate coming back through another door.
      expect(canPerform('review', resultingStatus('verify'))).toBe(canPerform('review', 'PARSED'));
    });
  });

  it('lands each action on the expected status', () => {
    expect(resultingStatus('parse')).toBe('PARSED');
    expect(resultingStatus('verify')).toBe('PARSED');
    expect(resultingStatus('release')).toBe('RELEASED');
  });
});

/**
 * THE DISTINCTION THE REMOVED STAGE USED TO CARRY.
 *
 * ADMIN_VERIFIED meant "clean and awaiting a clinician" and PARSED meant "held".
 * With one of those gone, PARSED means both, and the difference has to come from
 * the report's own holdReasons. A held report reading as awaiting-review is the
 * exact failure mode of removing the stage, so it is measured rather than
 * assumed.
 */
describe('a held report never reads as ready for a clinician', () => {
  it('splits PARSED on whether anything is held', () => {
    expect(queueState({ status: 'PARSED', holdReasons: [] })).toBe('AWAITING_REVIEW');
    expect(queueState({ status: 'PARSED', holdReasons: ['1 result could not be matched.'] })).toBe('HELD');
  });

  it('places every other status exactly once', () => {
    expect(queueState({ status: 'UPLOADED', holdReasons: [] })).toBe('AWAITING_PARSE');
    expect(queueState({ status: 'CHANGES_REQUESTED', holdReasons: [] })).toBe('HELD');
    expect(queueState({ status: 'CLINICIAN_REVIEWED', holdReasons: [] })).toBe('AWAITING_RELEASE');
    expect(queueState({ status: 'RELEASED', holdReasons: [] })).toBe('RELEASED');
  });

  it('never reports a released report as held, whatever is on it', () => {
    // Holds are cleared by a correction, but a released report's holds are
    // history — an acknowledged one stays on the record. It is out of the queue
    // either way.
    expect(queueState({ status: 'RELEASED', holdReasons: ['something was acknowledged'] })).toBe('RELEASED');
  });
});
