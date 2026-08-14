import { describe, it, expect } from 'vitest';
import type { ReportStatus } from '@aspire-bloods/shared';
import {
  canPerform,
  resultingStatus,
  isPatientVisible,
  queueState,
  releaseBlockedByHolds,
} from '../src/lib/reportTransitions.js';

/**
 * RESULTS RELEASE AUTOMATICALLY (changed Aug 2026).
 *
 *   UPLOADED → PARSED → RELEASED
 *
 * CLINICIAN_REVIEWED is gone, after ADMIN_VERIFIED. This file used to prove that
 * removing a stage did not remove the guarantee "nothing reaches a patient
 * without a clinician having said so". That guarantee has been deliberately
 * given up, so what this file has to prove is the one that replaced it:
 *
 *   AUTOMATION RELEASES CLEAN WORK AND NEVER PUSHES A PROBLEM THROUGH.
 *
 * Which is two claims, and both are here: a report still has to have been READ
 * before it can be released, and a report with anything HELD on it cannot be
 * released by anybody until the reasons are acknowledged.
 */
const ALL_STATUSES: ReportStatus[] = ['UPLOADED', 'PARSED', 'CHANGES_REQUESTED', 'RELEASED'];

describe('release pipeline transitions', () => {
  it('exposes exactly one patient-visible status', () => {
    const visible = ALL_STATUSES.filter(isPatientVisible);
    expect(visible).toEqual(['RELEASED']);
  });

  describe('there is no stage between the results arriving and the patient', () => {
    it('releases from PARSED, and from nothing else', () => {
      const releasable = ALL_STATUSES.filter((s) => canPerform('release', s));
      expect(releasable).toEqual(['PARSED']);
    });

    // The half of the old guarantee that SURVIVES. Automatic release is not
    // "anything can go out"; a file nobody has read cannot reach anybody, and a
    // report somebody has actively sent back cannot either.
    it('cannot release a report nothing has been read from', () => {
      expect(canPerform('release', 'UPLOADED')).toBe(false);
    });

    it('cannot release a report somebody has asked for changes on', () => {
      expect(canPerform('release', 'CHANGES_REQUESTED')).toBe(false);
    });
  });

  describe('the hold is the only checkpoint left, and it is a refusal', () => {
    it('blocks a held report with no acknowledgement', () => {
      expect(releaseBlockedByHolds({ holdReasons: ['1 result could not be matched.'] }, false)).toBe(true);
    });

    it('lets it through when the reasons are acknowledged', () => {
      expect(releaseBlockedByHolds({ holdReasons: ['1 result could not be matched.'] }, true)).toBe(false);
    });

    // The common case, and the one automation takes: nothing held, nothing to
    // acknowledge, released with no human anywhere near it.
    it('does not block a clean report, and does not want an acknowledgement for one', () => {
      expect(releaseBlockedByHolds({ holdReasons: [] }, false)).toBe(false);
      expect(releaseBlockedByHolds({ holdReasons: [] }, true)).toBe(false);
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
  });

  describe('CHANGES_REQUESTED is a loop back, not a fourth forward stage', () => {
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
    });
  });

  describe('review is what a person does about a held report', () => {
    it('lands on RELEASED when approved, because there is nowhere else to land', () => {
      // If this ever lands on a status of its own again, that status is a gate
      // whether or not anybody meant it to be.
      expect(resultingStatus('review', true)).toBe('RELEASED');
    });

    it('is only reachable from PARSED', () => {
      const reviewable = ALL_STATUSES.filter((s) => canPerform('review', s));
      expect(reviewable).toEqual(['PARSED']);
    });
  });

  describe('verify is a correction, not a decision to publish', () => {
    it('lands back on PARSED', () => {
      expect(resultingStatus('verify')).toBe('PARSED');
    });

    it('can be performed from every state before the release', () => {
      expect(canPerform('verify', 'UPLOADED')).toBe(true);
      expect(canPerform('verify', 'PARSED')).toBe(true);
      expect(canPerform('verify', 'CHANGES_REQUESTED')).toBe(true);
    });

    it('does not by itself release anything', () => {
      // Correcting the data lands a report where release is PERMITTED, which is
      // the whole pipeline now — so what has to be true is that the correction
      // does not itself write RELEASED.
      expect(resultingStatus('verify')).not.toBe('RELEASED');
    });
  });

  it('lands each action on the expected status', () => {
    expect(resultingStatus('parse')).toBe('PARSED');
    expect(resultingStatus('verify')).toBe('PARSED');
    expect(resultingStatus('release')).toBe('RELEASED');
  });
});

/**
 * THE DISTINCTION THE REMOVED STAGES USED TO CARRY.
 *
 * ADMIN_VERIFIED meant "clean and awaiting a clinician" and PARSED meant "held".
 * With both gone, PARSED means both, and the difference comes from the report's
 * own holdReasons. A held report reading as an ordinary not-yet-released one is
 * the exact failure mode of removing the stages, so it is measured rather than
 * assumed.
 */
describe('a held report never reads as ordinary work', () => {
  it('splits PARSED on whether anything is held', () => {
    expect(queueState({ status: 'PARSED', holdReasons: [] })).toBe('NOT_RELEASED');
    expect(queueState({ status: 'PARSED', holdReasons: ['1 result could not be matched.'] })).toBe('HELD');
  });

  it('places every other status exactly once', () => {
    expect(queueState({ status: 'UPLOADED', holdReasons: [] })).toBe('AWAITING_PARSE');
    expect(queueState({ status: 'CHANGES_REQUESTED', holdReasons: [] })).toBe('HELD');
    expect(queueState({ status: 'RELEASED', holdReasons: [] })).toBe('RELEASED');
  });

  it('never reports a released report as held, whatever is on it', () => {
    // Holds are cleared by a correction, but a released report's holds are
    // history — an acknowledged one stays on the record. It is out of the queue
    // either way.
    expect(queueState({ status: 'RELEASED', holdReasons: ['something was acknowledged'] })).toBe('RELEASED');
  });
});
