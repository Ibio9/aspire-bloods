import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import type { ResultSourceAdapter, ParsedReport, ParsedMarkerRow } from './ResultSourceAdapter.js';
import { NotImplementedError } from './ResultSourceAdapter.js';

/**
 * Randox's own shape for one result/order — field names are a best-effort
 * guess at a conventional lab-results REST contract (Randox's actual API
 * spec was not available while building this). ADMIN/ENGINEERING SHOULD
 * VERIFY THIS SHAPE AGAINST THE REAL RANDOX API DOCS BEFORE GO-LIVE and
 * adjust the mapping in normaliseReport() accordingly — everything below
 * this line is isolated exactly so that correction is a small, contained
 * change.
 */
interface RandoxMarkerPayload {
  code: string;
  name: string;
  value: number | null;
  textValue: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
}

interface RandoxResultPayload {
  id: string;
  patientRef: string | null;
  // Randox's own record of who the sample belongs to. Carried through so an
  // admin has something to match against when patientRef doesn't resolve to
  // one of our accounts — never used to match automatically.
  patientFirstName?: string | null;
  patientLastName?: string | null;
  patientDob?: string | null;
  patientContactNumber?: string | null;
  profileKey: string | null;
  sampleDate: string | null;
  status: 'partial' | 'final';
  markers: RandoxMarkerPayload[];
}

interface RandoxTokenResponse {
  access_token: string;
  expires_in: number;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const res = await fetch(`${env.RANDOX_API_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', api_key: env.RANDOX_API_KEY }),
  });
  if (!res.ok) {
    throw new Error(`Randox auth failed: ${res.status} ${res.statusText}`);
  }
  const token = (await res.json()) as RandoxTokenResponse;
  cachedToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 };
  return cachedToken.value;
}

async function randoxFetch(path: string): Promise<Response> {
  const accessToken = await getAccessToken();
  const res = await fetch(`${env.RANDOX_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Randox API request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res;
}

function mapRow(m: RandoxMarkerPayload): ParsedMarkerRow {
  return {
    rawName: m.name,
    value: m.value,
    unit: m.unit,
    referenceLow: m.referenceLow,
    referenceHigh: m.referenceHigh,
    rawLine: m.textValue ?? `${m.name}: ${m.value ?? m.textValue ?? '—'} ${m.unit ?? ''}`.trim(),
    sourceText: JSON.stringify(m),
    // Structured API data carries no extraction uncertainty of its own —
    // confidence here is meaningless (it's not a guess), so leave it null
    // rather than implying false certainty with a 1.0. Marker/unit/range
    // plausibility is still checked by randoxIngestionService the same way
    // as any other source.
    confidence: null,
    // Structured or not, a row with no numeric value still can't be checked
    // against a reference range — it goes to the admin like any other.
    resultText: m.textValue ?? null,
    needsReview: m.value == null,
    reviewReason:
      m.value == null ? 'Non-numeric result — no value or reference range to verify against.' : null,
    flags: m.value == null && m.textValue != null ? ['non_numeric_result'] : [],
  };
}

/**
 * Live adapter for Randox's direct results API, active once
 * LAB_ADAPTER=RANDOX_API is set (the £5,000 activation payment is going
 * ahead — see index.ts LAB_ADAPTER wiring). Both fetchResults() and
 * normaliseReport() satisfy the shared ResultSourceAdapter interface so
 * this adapter's output lands in the exact same shape PdfUploadAdapter
 * produces — but the caller here is never the interactive PDF-upload
 * parse endpoint. It's randoxIngestionService.ts, which polls
 * listPendingResultIds() (an adapter-specific extra, not part of the
 * shared interface — polling many results has no PDF-flow equivalent) and
 * drives fetchResults()/normaliseReport() per result on a schedule. See
 * that file for patient/marker mapping, dedupe, and the release gate.
 */
export class RandoxApiAdapter implements ResultSourceAdapter {
  async fetchResults(externalId: string): Promise<Buffer> {
    const res = await randoxFetch(`/results/${encodeURIComponent(externalId)}`);
    return Buffer.from(await res.text(), 'utf-8');
  }

  async normaliseReport(payloadBuffer: Buffer): Promise<ParsedReport> {
    const payload = JSON.parse(payloadBuffer.toString('utf-8')) as RandoxResultPayload;
    return {
      sampleDate: payload.sampleDate,
      panelName: null,
      panelKey: payload.profileKey,
      externalPatientRef: payload.patientRef,
      claimedPatient: {
        firstName: payload.patientFirstName ?? null,
        lastName: payload.patientLastName ?? null,
        dob: payload.patientDob ?? null,
        contactNumber: payload.patientContactNumber ?? null,
      },
      isPartial: payload.status === 'partial',
      extractionMethod: 'api',
      rows: payload.markers.map(mapRow),
    };
  }

  /**
   * Not part of ResultSourceAdapter — that interface fetches one result by
   * id (mirroring "admin uploads one PDF"), which doesn't fit an
   * automated feed where new results just arrive. This is the polling
   * entry point randoxIngestionService.ts actually drives.
   */
  async listPendingResultIds(): Promise<string[]> {
    const res = await randoxFetch('/results?status=pending');
    const body = (await res.json()) as { results: { id: string }[] };
    return body.results.map((r) => r.id);
  }

  async listPanels(): Promise<{ key: string; name: string }[]> {
    if (!env.RANDOX_API_KEY) {
      throw new NotImplementedError('RandoxApiAdapter.listPanels — RANDOX_API_KEY not configured');
    }
    const panels = await prisma.panel.findMany({ where: { isActive: true }, select: { key: true, name: true } });
    return panels;
  }
}
