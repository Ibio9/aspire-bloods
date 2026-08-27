/**
 * Test script for Randox dummy order results endpoints
 * Dummy order from Chris Caulfield (Aug 19, 2026): orderId 61294, orderNumber 900002
 * Run: npx tsx --env-file=apps/server/.env.sandbox apps/server/scripts/testDummyOrder.ts
 */

import { RandoxHttpClient } from '../src/modules/randox/http/RandoxHttpClient.js';
import {
  NEXUS_NEEDS,
  nexusConnection,
  requireCredentialsOrExit,
  assertSandboxOnlyOrExit,
} from './sandboxShared.js';

async function post(client: RandoxHttpClient, path: string, body: unknown) {
  const { res, text } = await client.requestRaw(path, { method: 'POST', body, retryable: true });
  let parsed: any = null;
  try { parsed = text.trim() === '' ? null : JSON.parse(text); } catch { parsed = null; }
  return { status: res.status, body: parsed, raw: text };
}

async function testDummyOrder() {
  const nexus = nexusConnection();
  assertSandboxOnlyOrExit('testDummyOrder', [['Nexus', nexus.baseUrl]]);
  requireCredentialsOrExit('testDummyOrder', NEXUS_NEEDS);

  const client = new RandoxHttpClient(nexus);
  const orderId = '61294';
  const clinicId = process.env.RANDOX_CLINIC_ID || '1298';

  console.log(`\n========================================`);
  console.log(`Testing Randox dummy order (orderId ${orderId}, clinicId ${clinicId})`);
  console.log(`Base URL: ${nexus.baseUrl}`);
  console.log(`========================================`);

  const variants = [
    { orderId, ClinicId: clinicId },
    { orderId, clinicId },
    { OrderId: orderId, ClinicId: clinicId },
    { orderId: Number(orderId), ClinicId: Number(clinicId) },
  ];

  try {
    for (const body of variants) {
      console.log(`\n--- GetOrderResultDetail  body=${JSON.stringify(body)} ---`);
      const detail = await post(client, '/Order/GetOrderResultDetail', body);
      console.log('Status:', detail.status);
      console.log('Body:', JSON.stringify(detail.body, null, 2));
      if (detail.status === 200) {
        console.log('\n>>> SUCCESS with this body shape <<<');
        break;
      }
    }
  } catch (error) {
    console.error('\nTest failed:');
    console.error(error instanceof Error ? `${error.message}\n${error.stack}` : error);
    process.exit(1);
  }
}

testDummyOrder();
