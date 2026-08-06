import { describe, it, expect } from 'vitest';
import type { ReportStatus } from '@aspire-bloods/shared';
import { canPerform, resultingStatus, isPatientVisible } from '../src/lib/reportTransitions.js';

const ALL_STATUSES: ReportStatus[] = [
  'UPLOADED',
  'PARSED',
  'ADMIN_VERIFIED',
  'CHANGES_REQUESTED',
  'CLINICIAN_REVIEWED',
  'RELEASED',
];

describe('release pipeline transitions', () => {
  it('exposes exactly one patient-visible status', () => {
    const visible = ALL_STATUSES.filter(isPatientVisible);
    expect(visible).toEqual(['RELEASED']);
  });

  describe('no stage can be skipped', () => {
    it('only allows release from CLINICIAN_REVIEWED', () => {
      const releasable = ALL_STATUSES.filter((s) => canPerform('release', s));
      expect(releasable).toEqual(['CLINICIAN_REVIEWED']);
    });

    it('only allows clinician review from ADMIN_VERIFIED', () => {
      const reviewable = ALL_STATUSES.filter((s) => canPerform('review', s));
      expect(reviewable).toEqual(['ADMIN_VERIFIED']);
    });

    // Together these two are the whole guarantee: CLINICIAN_REVIEWED is
    // reachable only via review, review is reachable only from
    // ADMIN_VERIFIED, and ADMIN_VERIFIED only via verify. So an UPLOADED
    // report cannot reach a patient without passing through every stage.
    it('cannot verify a freshly uploaded report before it is parsed', () => {
      expect(canPerform('verify', 'UPLOADED')).toBe(false);
    });

    it('cannot release an unparsed, unverified or unreviewed report', () => {
      expect(canPerform('release', 'UPLOADED')).toBe(false);
      expect(canPerform('release', 'PARSED')).toBe(false);
      expect(canPerform('release', 'ADMIN_VERIFIED')).toBe(false);
      expect(canPerform('release', 'CHANGES_REQUESTED')).toBe(false);
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

    it('refuses to re-parse or re-verify underneath a completed clinical review', () => {
      expect(canPerform('parse', 'CLINICIAN_REVIEWED')).toBe(false);
      expect(canPerform('verify', 'CLINICIAN_REVIEWED')).toBe(false);
    });
  });

  describe('CHANGES_REQUESTED is a loop back, not a sixth forward stage', () => {
    it('allows re-parsing and re-verifying', () => {
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

  it('allows re-verification before review (admin correcting their own entry)', () => {
    expect(canPerform('verify', 'ADMIN_VERIFIED')).toBe(true);
  });

  it('lands each action on the expected status', () => {
    expect(resultingStatus('parse')).toBe('PARSED');
    expect(resultingStatus('verify')).toBe('ADMIN_VERIFIED');
    expect(resultingStatus('release')).toBe('RELEASED');
  });
});
