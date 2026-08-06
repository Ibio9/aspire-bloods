import { prisma } from '../../db/client.js';
import { decryptField } from '../../lib/crypto.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { AdminError } from './service.js';
import { materialiseParsedReport, MaterialiseError } from '../reports/materialiseReport.js';
import type { ParsedReport } from '../result-sources/ResultSourceAdapter.js';

/**
 * ---------------------------------------------------------------------------
 * Attaching results to people.
 * ---------------------------------------------------------------------------
 *
 * Registration is open and deliberately unguarded — an account with nothing
 * attached to it holds no clinical data and protects nothing. This file is
 * where the care went instead. Everything that matters about correctness in
 * this system converges on one decision: whose results are these?
 *
 * Wrong-patient results is the worst failure this system has. Not "a
 * confusing failure" — the worst one. Someone reads a stranger's abnormal
 * ferritin as their own, or misses their own because it was filed under
 * somebody else. So the rules here are stricter than they would be almost
 * anywhere else in the codebase, and they're enforced server-side rather
 * than by the shape of the admin UI:
 *
 *   1. Nothing is ever matched automatically. There is no code path in this
 *      file that links anything without an admin having said so.
 *   2. A name is never sufficient. Names collide, families share them, and
 *      transcription mangles them. Date of birth must agree as well, and if
 *      the lab supplied no date of birth the link is refused outright rather
 *      than falling back to the weaker signal.
 *   3. The admin restates the date of birth they matched on, and the server
 *      checks that against its own copy. Ticking "confirm" next to a
 *      pre-filled value is not the same act as reading two records and
 *      finding they agree.
 *   4. Linking and unlinking are both audited, with what agreed recorded on
 *      the entry — so a later review can see not just that a link was made
 *      but on what basis.
 *
 * Unlink exists because "we got it wrong" has to be recoverable. It voids the
 * report (which removes it from every patient-facing query without deleting
 * anything) and returns the result to the queue, where it can be linked to
 * the right person.
 */

/**
 * Comparable form of a name: case, accents, punctuation and spacing removed.
 * NFD splits accented letters into base + combining mark, and the final
 * [^a-z] filter then drops the marks along with hyphens, apostrophes and
 * spaces — so "O'Brien", "o brien" and "Ó Brién" all compare equal, while
 * two genuinely different names still don't.
 */
function normaliseName(value: string | null | undefined): string {
  if (!value) return '';
  return value.normalize('NFD').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Comparable form of a phone number. The same UK mobile is written
 * "07700 900123" by a patient and "+44 7700 900123" by a lab, so comparing
 * digit strings would call those two different numbers. Reducing to the last
 * nine digits makes trunk-zero and country-code differences disappear.
 *
 * Nine is enough to distinguish real numbers and short enough to survive any
 * prefix; anything shorter is compared whole. This is only ever a supporting
 * signal — a matching phone number never makes a link permissible on its own
 * (see assessMatch), so a false positive here can't reach a patient's record.
 */
const PHONE_SIGNIFICANT_DIGITS = 9;

function normalisePhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  return digits.length > PHONE_SIGNIFICANT_DIGITS ? digits.slice(-PHONE_SIGNIFICANT_DIGITS) : digits;
}

/** ISO date, day precision. Anything unparseable compares equal to nothing. */
function normaliseDob(value: string | null | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export interface MatchAgreement {
  dob: boolean;
  firstName: boolean;
  lastName: boolean;
  contactNumber: boolean;
  /** True only when the rules above are satisfied. Never true on names alone. */
  linkable: boolean;
  /** Why not, in words an admin can act on. Null when linkable. */
  blockedReason: string | null;
}

interface ClaimedIdentity {
  firstName: string | null;
  lastName: string | null;
  dob: string | null;
  contactNumber: string | null;
}

interface AccountIdentity {
  firstName: string | null;
  lastName: string | null;
  dob: string | null;
  contactNumber: string | null;
}

/**
 * The whole safety rule, in one place, used both to rank candidates for the
 * admin and to accept or refuse the link itself. Ranking and enforcing must
 * never drift apart — a suggestion the UI shows first that the server would
 * then refuse is worse than no suggestion at all.
 */
export function assessMatch(claimed: ClaimedIdentity, account: AccountIdentity): MatchAgreement {
  const claimedDob = normaliseDob(claimed.dob);
  const accountDob = normaliseDob(account.dob);

  const dob = claimedDob !== '' && claimedDob === accountDob;
  const firstName = normaliseName(claimed.firstName) !== '' && normaliseName(claimed.firstName) === normaliseName(account.firstName);
  const lastName = normaliseName(claimed.lastName) !== '' && normaliseName(claimed.lastName) === normaliseName(account.lastName);
  const contactNumber =
    normalisePhone(claimed.contactNumber) !== '' && normalisePhone(claimed.contactNumber) === normalisePhone(account.contactNumber);

  let blockedReason: string | null = null;
  if (claimedDob === '') {
    blockedReason =
      'The laboratory did not supply a date of birth with this result, so there is nothing to check the account against. Ask the laboratory to confirm the patient’s date of birth before linking.';
  } else if (!dob) {
    blockedReason = 'The date of birth on this result does not match the date of birth on this account.';
  } else if (!firstName && !lastName) {
    blockedReason = 'The name on this result does not match the name on this account.';
  }

  return { dob, firstName, lastName, contactNumber, linkable: blockedReason === null, blockedReason };
}

function claimedFrom(row: {
  claimedFirstName: string | null;
  claimedLastName: string | null;
  claimedDobEncrypted: string | null;
  claimedContactNumberEncrypted: string | null;
}): ClaimedIdentity {
  return {
    firstName: row.claimedFirstName,
    lastName: row.claimedLastName,
    dob: row.claimedDobEncrypted ? decryptField(row.claimedDobEncrypted) : null,
    contactNumber: row.claimedContactNumberEncrypted ? decryptField(row.claimedContactNumberEncrypted) : null,
  };
}

export interface UnlinkedAccount {
  id: string;
  email: string;
  status: string;
  createdAt: Date;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  dob: string | null;
  contactNumber: string | null;
}

/**
 * Accounts with nothing attached. Deliberately includes accounts that haven't
 * confirmed their email yet: a result can perfectly well arrive for someone
 * who registered this morning and hasn't opened their inbox, and hiding them
 * would make that result look unmatchable.
 *
 * Deactivated and erased accounts are excluded — attaching new clinical data
 * to an account someone has closed is not something to offer as a suggestion.
 */
export async function listUnlinkedAccounts(): Promise<UnlinkedAccount[]> {
  const users = await prisma.user.findMany({
    where: {
      role: 'PATIENT',
      deactivatedAt: null,
      status: { in: ['ACTIVE', 'PENDING_VERIFICATION', 'INVITED'] },
      // Voided reports don't count as "has results" — a patient whose only
      // report was voided is unlinked again, which is exactly the state an
      // unlink leaves them in.
      reportsAsPatient: { none: { voidedAt: null } },
    },
    include: { patientProfile: true },
    orderBy: { createdAt: 'desc' },
  });

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    status: u.status,
    createdAt: u.createdAt,
    firstName: u.patientProfile?.firstName ?? null,
    lastName: u.patientProfile?.lastName ?? null,
    displayName: u.patientProfile ? `${u.patientProfile.firstName} ${u.patientProfile.lastName}` : u.email,
    dob: u.patientProfile ? decryptField(u.patientProfile.dobEncrypted) : null,
    contactNumber: u.patientProfile ? decryptField(u.patientProfile.contactNumberEncrypted) : null,
  }));
}

export interface UnmatchedResultView {
  id: string;
  sourceKey: string;
  externalId: string | null;
  sampleDate: Date | null;
  markerCount: number;
  createdAt: Date;
  claimed: ClaimedIdentity;
  /**
   * Accounts worth looking at, best first — and every one of them carries the
   * verdict the server will apply, including the ones it would refuse. Showing
   * a near-miss with "date of birth doesn't match" against it is far more
   * useful to an admin than silently omitting it and leaving them wondering
   * whether the account exists at all.
   */
  candidates: {
    patientId: string;
    displayName: string;
    email: string;
    dob: string | null;
    contactNumber: string | null;
    agreement: MatchAgreement;
  }[];
}

function candidateRank(a: MatchAgreement): number {
  return (a.dob ? 8 : 0) + (a.lastName ? 4 : 0) + (a.firstName ? 2 : 0) + (a.contactNumber ? 1 : 0);
}

export async function listUnmatchedResults(): Promise<UnmatchedResultView[]> {
  const [rows, accounts] = await Promise.all([
    prisma.unmatchedResult.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
    listUnlinkedAccounts(),
  ]);

  return rows.map((row) => {
    const claimed = claimedFrom(row);
    const candidates = accounts
      .map((account) => ({
        patientId: account.id,
        displayName: account.displayName,
        email: account.email,
        dob: account.dob,
        contactNumber: account.contactNumber,
        agreement: assessMatch(claimed, account),
      }))
      // Anything with no agreement at all is noise, not a candidate.
      .filter((c) => candidateRank(c.agreement) > 0)
      .sort((a, b) => candidateRank(b.agreement) - candidateRank(a.agreement))
      .slice(0, 8);

    return {
      id: row.id,
      sourceKey: row.sourceKey,
      externalId: row.externalId,
      sampleDate: row.sampleDate,
      markerCount: row.markerCount,
      createdAt: row.createdAt,
      claimed,
      candidates,
    };
  });
}

/**
 * Links made recently, so undoing one doesn't require going and finding the
 * report. A link that turns out to be wrong is usually noticed within
 * minutes of making it, and the way back has to be at least as easy as the
 * way in — otherwise the pressure is to leave a wrong link in place.
 */
export async function listRecentLinks(limit = 20) {
  const rows = await prisma.unmatchedResult.findMany({
    where: { status: 'LINKED' },
    orderBy: { linkedAt: 'desc' },
    take: limit,
  });

  const patientIds = rows.map((r) => r.linkedPatientId).filter((id): id is string => !!id);
  const patients = await prisma.user.findMany({
    where: { id: { in: patientIds } },
    include: { patientProfile: true },
  });
  const byId = new Map(patients.map((p) => [p.id, p]));

  return rows.map((r) => {
    const patient = r.linkedPatientId ? byId.get(r.linkedPatientId) : undefined;
    return {
      id: r.id,
      sourceKey: r.sourceKey,
      externalId: r.externalId,
      sampleDate: r.sampleDate,
      markerCount: r.markerCount,
      linkedAt: r.linkedAt,
      reportId: r.linkedReportId,
      patientId: r.linkedPatientId,
      patientName: patient?.patientProfile
        ? `${patient.patientProfile.firstName} ${patient.patientProfile.lastName}`
        : (patient?.email ?? null),
    };
  });
}

export async function getLinkingQueue() {
  const [unlinkedAccounts, unmatchedResults, recentLinks] = await Promise.all([
    listUnlinkedAccounts(),
    listUnmatchedResults(),
    listRecentLinks(),
  ]);
  return { unlinkedAccounts, unmatchedResults, recentLinks };
}

/**
 * The one irreversible-feeling action in the admin console, so it refuses
 * more than it accepts. Every check below is a separate reason to stop, and
 * none of them is inferable from the request body alone.
 */
export async function linkResultToPatient(
  unmatchedResultId: string,
  input: { patientId: string; confirmedDob: string },
  actorId: string,
  ip: string | null,
) {
  const row = await prisma.unmatchedResult.findUnique({ where: { id: unmatchedResultId } });
  if (!row) throw new AdminError('This result is no longer in the queue', 404);
  if (row.status !== 'PENDING') {
    throw new AdminError(
      row.status === 'LINKED'
        ? 'This result has already been linked to a patient.'
        : 'This result was dismissed and is no longer waiting to be linked.',
      409,
    );
  }

  const patient = await prisma.user.findUnique({
    where: { id: input.patientId },
    include: { patientProfile: true },
  });
  if (!patient || patient.role !== 'PATIENT') throw new AdminError('Patient not found', 404);
  if (patient.deactivatedAt) throw new AdminError('This account has been deactivated', 409);
  if (!patient.patientProfile) {
    throw new AdminError(
      'This account has no registration details yet, so there is nothing to check the result against.',
      409,
    );
  }

  const accountDob = decryptField(patient.patientProfile.dobEncrypted);
  const account: AccountIdentity = {
    firstName: patient.patientProfile.firstName,
    lastName: patient.patientProfile.lastName,
    dob: accountDob,
    contactNumber: decryptField(patient.patientProfile.contactNumberEncrypted),
  };

  const claimed = claimedFrom(row);
  const agreement = assessMatch(claimed, account);
  if (!agreement.linkable) {
    // 409, not 403: the request is well-formed and the admin is permitted —
    // the two records simply don't agree well enough for anyone to make this
    // call safely, which is a state conflict, not an authorisation failure.
    throw new AdminError(`${agreement.blockedReason} Results can only be linked when the name and date of birth both agree.`, 409);
  }

  // The admin typed (or at least read and submitted) the date of birth they
  // matched on. If it doesn't match the account they picked, they were
  // looking at a different record than the one they selected — which is
  // precisely the mistake this whole flow exists to catch.
  if (normaliseDob(input.confirmedDob) !== normaliseDob(accountDob)) {
    throw new AdminError(
      'The date of birth you confirmed does not match the account you selected. Check you are looking at the right patient.',
      409,
    );
  }

  const parsed = row.payload as unknown as ParsedReport;

  let outcome;
  try {
    outcome = await materialiseParsedReport({
      patientId: patient.id,
      sourceKey: row.sourceKey,
      externalId: row.externalId,
      parsed,
    });
  } catch (e) {
    if (e instanceof MaterialiseError) throw new AdminError(e.message, 422);
    throw e;
  }

  await prisma.unmatchedResult.update({
    where: { id: row.id },
    data: {
      status: 'LINKED',
      linkedReportId: outcome.reportId,
      linkedPatientId: patient.id,
      linkedById: actorId,
      linkedAt: new Date(),
    },
  });

  // What agreed is recorded alongside the fact of the link. A later review
  // needs to be able to ask "on what basis?" and get an answer, not just a
  // timestamp. No identifiers in the metadata beyond ids — the agreement
  // flags say everything without restating the patient's date of birth into
  // a table many people can read.
  await recordAuditLog({
    actorUserId: actorId,
    action: 'RESULT_LINKED_TO_PATIENT',
    targetType: 'User',
    targetId: patient.id,
    ipAddress: ip,
    metadata: {
      unmatchedResultId: row.id,
      reportId: outcome.reportId,
      sourceKey: row.sourceKey,
      externalId: row.externalId,
      markerCount: outcome.markerCount,
      agreedOn: {
        dob: agreement.dob,
        firstName: agreement.firstName,
        lastName: agreement.lastName,
        contactNumber: agreement.contactNumber,
      },
    },
  });

  return { reportId: outcome.reportId, markerCount: outcome.markerCount, mappingFailures: outcome.mappingFailures };
}

/**
 * "That wasn't theirs." Voids the report rather than deleting it — no hard
 * deletes anywhere, and the void carries the reason and the person — and puts
 * the result back in the queue so it can go to the right account.
 *
 * A released report can be unlinked. It has to be: discovering after release
 * that results went to the wrong person is exactly when this matters most,
 * and voiding is already how this system withdraws a released report.
 */
export async function unlinkResult(unmatchedResultId: string, reason: string, actorId: string, ip: string | null) {
  const row = await prisma.unmatchedResult.findUnique({ where: { id: unmatchedResultId } });
  if (!row) throw new AdminError('This result is no longer in the queue', 404);
  if (row.status !== 'LINKED' || !row.linkedReportId) {
    throw new AdminError('This result is not currently linked to anyone', 409);
  }

  const reportId = row.linkedReportId;
  const patientId = row.linkedPatientId;

  await prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({ where: { id: reportId } });
    if (report && !report.voidedAt) {
      await tx.report.update({
        where: { id: reportId },
        data: {
          voidedAt: new Date(),
          voidedById: actorId,
          voidReason: `Unlinked from this patient: ${reason}`,
        },
      });
    }

    await tx.unmatchedResult.update({
      where: { id: row.id },
      data: {
        status: 'PENDING',
        linkedReportId: null,
        linkedPatientId: null,
        linkedById: null,
        linkedAt: null,
      },
    });
  });

  await recordAuditLog({
    actorUserId: actorId,
    action: 'RESULT_UNLINKED_FROM_PATIENT',
    targetType: 'User',
    targetId: patientId,
    ipAddress: ip,
    metadata: { unmatchedResultId: row.id, reportId, reason },
  });

  return { reportId };
}

/** Not a delete — the row keeps its payload, its reason and its dismisser. */
export async function dismissUnmatchedResult(unmatchedResultId: string, reason: string, actorId: string, ip: string | null) {
  const row = await prisma.unmatchedResult.findUnique({ where: { id: unmatchedResultId } });
  if (!row) throw new AdminError('This result is no longer in the queue', 404);
  if (row.status !== 'PENDING') throw new AdminError('Only a result still waiting to be linked can be dismissed', 409);

  await prisma.unmatchedResult.update({
    where: { id: row.id },
    data: { status: 'DISMISSED', dismissedAt: new Date(), dismissedById: actorId, dismissReason: reason },
  });

  await recordAuditLog({
    actorUserId: actorId,
    action: 'UNMATCHED_RESULT_DISMISSED',
    targetType: 'UnmatchedResult',
    targetId: row.id,
    ipAddress: ip,
    metadata: { reason, sourceKey: row.sourceKey, externalId: row.externalId },
  });
}
