/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { RandoxHttpClient } from '../src/modules/randox/http/RandoxHttpClient.js';
import { NEXUS_ENDPOINTS } from '../src/modules/randox/endpoints.js';
import {
  NEXUS_NEEDS,
  OUT_DIR,
  asInt,
  assertSandboxOnlyOrExit,
  call,
  nexusConnection,
  pick,
  read,
  readInt,
  requireCredentialsOrExit,
  setCapturePrefix,
} from './sandboxShared.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ASK AFTER AN ORDER THAT ALREADY EXISTS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run sandbox:poll --workspace=apps/server -- GC1123-00010300
 *
 * ── WHY THIS EXISTS, WHICH IS THE SAME REASON SANDBOX_LEAVE_BOOKING DOES ───
 *
 * The sandbox order has only ever reached STATUS 1. The pass books an
 * appointment and then cancels it at the end of the run, so the order has
 * nothing attached to it — and an order nobody attends is an order the
 * laboratory never runs. Questions 3 and 8 (what does status 4 look like, and
 * what does GetOrderResultDetail actually return) have therefore never been
 * askable, and they are the two that matter most: the analyte map has never
 * been confirmed against a real payload, and with results now releasing
 * automatically that map is the thing standing between a delivery and a
 * patient's screen.
 *
 * So: `SANDBOX_LEAVE_BOOKING=true npm run sandbox:pass` leaves one clean
 * booking standing, and this command checks on it in the morning. THE POINT IS
 * THAT IT CREATES NOTHING. Re-running the pass to see whether an order had
 * progressed placed a NEW order every time, which reset the clock — the
 * behaviour that guaranteed nothing would ever be observed past status 1.
 *
 * ── WHAT IT DOES ───────────────────────────────────────────────────────────
 *
 *   1. GetOrderStatus, once per attempt.
 *   2. If the status is 4, GetOrderResultReports and GetOrderResultDetail, and
 *      both are captured.
 *
 * It polls on the same one-minute cadence as the pass for as long as
 * SANDBOX_POLL_MINUTES allows — 0 by default, which is a SINGLE call and then
 * exit. That default is deliberate: this is the command somebody runs over
 * coffee to find out where an order got to, and a script that then sits there
 * for twenty minutes is a script they will stop running.
 *
 * ── SAME GUARDS, SAME CAPTURES, AND NEITHER IS RETYPED ─────────────────────
 *
 * The credential check, the stes--only host check, the NODE_ENV refusal, the
 * real `RandoxHttpClient` and the capture format all come from
 * sandboxShared.ts. A second script with its own copy of any of those is a
 * second script that can be wrong about production while the first is right.
 *
 * IT DOES NOT CLEAR THE DIRECTORY, unlike the pass, and it prefixes its
 * filenames with the order number. It runs hours after the pass, against the
 * order the pass created, and wiping that run's captures to write three of its
 * own would destroy the evidence it is adding to. A second poll of the SAME
 * order replaces its own files and nobody else's.
 *
 * ⚠ A LATER `sandbox:pass` WILL DELETE THESE. That command clears the directory
 * on purpose — one run, one directory — so copy anything you need out first.
 */

const CLINIC_ID_ENV = 'RANDOX_CLINIC_ID';

function usage(problem: string): never {
  console.error(
    `${problem}\n\n` +
      '  npm run sandbox:poll --workspace=apps/server -- <order number>\n\n' +
      'The order number is the `externalNumber` the creation response carried — the same string\n' +
      '`sandbox:pass` prints at the end of a run started with SANDBOX_LEAVE_BOOKING=true.\n\n' +
      'Optional:\n' +
      `  ${CLINIC_ID_ENV}          override the clinic id, if the boot sync has never run on this machine\n` +
      '  SANDBOX_POLL_MINUTES     keep asking for this many minutes (default 0 — one call, then exit)\n',
  );
  process.exit(1);
}

/**
 * THE CLINIC ID IS FETCHED, NOT CONFIGURED — and this script has the same
 * problem the server does, minus the boot sync.
 *
 * All three endpoints below require it, and the flow diagram is explicit that
 * it must be "your current Clinic Id (/Clinic/GetMyClinicDetails)". The server
 * learns it on boot and reads it back out of the catalogue; a standalone script
 * has no catalogue, so it asks Randox directly. `RANDOX_CLINIC_ID` stays as an
 * override for a support session, exactly as it is on the server.
 *
 * A wrong clinic id on GetOrderResultDetail is a request for somebody else's
 * order, so a value that cannot be resolved is a refusal rather than a guess.
 */
async function resolveClinicId(nexus: RandoxHttpClient): Promise<number> {
  const override = read(CLINIC_ID_ENV);
  if (override !== '') return readInt(CLINIC_ID_ENV, 0);

  const details = await call(nexus, 'Nexus', 'GetMyClinicDetails', NEXUS_ENDPOINTS.getMyClinicDetails);
  const body = details.body;
  const first = Array.isArray(body) ? body[0] : body;
  const id = asInt(pick(first, 'clinicId', 'id'));
  if (id === null) {
    console.error(
      '\nGetMyClinicDetails returned nothing that looks like a clinic id, and all three endpoints below need one.\n' +
        `Set ${CLINIC_ID_ENV} to run anyway. The capture is in ${OUT_DIR}.`,
    );
    process.exit(1);
  }
  return id;
}

async function main(): Promise<void> {
  // `--` puts the argument after the script name; npm may also pass it through
  // directly, so take the first thing that is not a flag either way.
  const orderNumber = process.argv.slice(2).find((a) => !a.startsWith('-'));
  if (!orderNumber) usage('Refusing to poll: no order number was given.');

  requireCredentialsOrExit('the sandbox poll', NEXUS_NEEDS);
  const connection = nexusConnection();
  assertSandboxOnlyOrExit('the sandbox poll', [['Nexus', connection.baseUrl]]);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Its own filename space. See the note at the top of this file.
  setCapturePrefix(`poll-${orderNumber.replace(/[^A-Za-z0-9]+/g, '-')}-`);

  const nexus = new RandoxHttpClient(connection);
  console.log(`\nNexus            ${connection.baseUrl}`);
  console.log(`Order            ${orderNumber}`);
  console.log(`Bearer           ${connection.transport.bearerTokenEnabled ? 'on' : 'OFF (diagnostic)'}`);

  const clinicId = await resolveClinicId(nexus);
  console.log(`Clinic           ${clinicId}${read(CLINIC_ID_ENV) === '' ? ' (from GetMyClinicDetails)' : ` (${CLINIC_ID_ENV})`}`);
  // The SERVER reads this back out of its catalogue (`loadDiscoveredClinicId`
  // in modules/randox/referenceDataService.ts). That path needs a database, and
  // this script deliberately has none — importing it would pull prisma in and
  // put DATABASE_URL back on the list of things a Randox capture requires. So
  // it asks Randox directly, which is the same authority the sync itself uses.

  console.log('\n── Nexus: order status ────────────────────────────────────────');
  const windowMs = readInt('SANDBOX_POLL_MINUTES', 0) * 60_000;
  const startedAt = Date.now();
  let attempt = 0;
  let latest: number | null = null;

  for (;;) {
    attempt += 1;
    const status = await call(nexus, 'Nexus', `GetOrderStatus-attempt-${attempt}`, NEXUS_ENDPOINTS.getOrderStatus, {
      // PascalCase here and camelCase on the two result endpoints, because that
      // is how each endpoint's OWN example is written. This API is not
      // consistent with itself and imposing consistency on it invents a 400.
      OrderNumber: orderNumber,
      ClinicId: clinicId,
    });
    latest = asInt(pick(status.body, 'statusId'));
    const returned = String(pick(status.body, 'orderNumber') ?? '');
    if (returned !== '' && returned !== orderNumber) {
      // The half of question 1 that would silently break a lookup: what Randox
      // RETURN as `orderNumber` against what we SENT. One order agreeing is
      // evidence and not a contract, which is why reconcileOrderNumber() stays.
      console.log(`  ⚠ the response's orderNumber is "${returned}", which is NOT the string sent.`);
    }
    console.log(`  status ${latest ?? '(none)'}${latest === 4 ? ' — results are ready' : ''}`);
    if (latest === 4 || latest === 5) break;
    if (Date.now() - startedAt + 60_000 >= windowMs) break;
    await new Promise((r) => setTimeout(r, 60_000));
  }

  if (latest === 4) {
    console.log('\n── Nexus: results ─────────────────────────────────────────────');
    // camelCase, because that is what these two endpoints' own examples use.
    await call(nexus, 'Nexus', 'GetOrderResultReports', NEXUS_ENDPOINTS.getOrderResultReports, {
      clinicId,
      orderNumber,
    });
    await call(nexus, 'Nexus', 'GetOrderResultDetail', NEXUS_ENDPOINTS.getOrderResultDetail, {
      clinicId,
      orderNumber,
    });
    console.log(
      '\n══ RESULTS CAPTURED ═══════════════════════════════════════════\n' +
        `  ${path.relative(process.cwd(), OUT_DIR)}\n\n` +
        '  GetOrderResultDetail is the FIRST REAL PAYLOAD this integration has ever seen.\n' +
        '  The analyte strings in it are what modules/randox/analyteMap.ts has to answer to, and\n' +
        '  `confirmedAgainstRealPayload` in analyteMappingCoverage() has been a hardcoded zero\n' +
        '  precisely because no such payload existed. Read it before changing that number.',
    );
  } else if (latest === 5) {
    console.log(
      '\n  Status 5. TWO CAUSES AND THEY ARE NOT THE SAME EVENT: we cancelled it, or every result was\n' +
        '  voided and the order moved itself. If nothing here cancelled it, the void codes explaining\n' +
        '  why are on GetOrderResultDetail and are worth fetching by hand.',
    );
  } else {
    console.log(
      `\n  The order is at status ${latest ?? '(none returned)'}. Nothing further to fetch — results are only\n` +
        '  available at status 4. Leave it and run this again later; nothing was created by this call.',
    );
  }
}

main().catch((error: unknown) => {
  console.error('\nThe poll failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
