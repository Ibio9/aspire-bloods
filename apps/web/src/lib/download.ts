import { API_BASE_URL } from './apiBase';
import { apiFetch, ApiError } from './api';

/**
 * Getting a file out of the API and onto someone's device.
 *
 * The obvious implementation is the one this replaces:
 *
 *   const { url } = await apiFetch(...);
 *   window.open(url, '_blank');
 *
 * and it is broken in two separate ways, both of which land on the patient.
 *
 *  1. THE POPUP BLOCKER. A `window.open` only counts as user-initiated while
 *     the browser is still inside the click handler's synchronous run. The
 *     `await` above ends that window, so by the time the URL comes back the
 *     call is an unsolicited popup — silently blocked by Safari's default
 *     settings, by iOS Safari always, and by Firefox with popups restricted.
 *     The button showed its spinner, finished, and produced nothing. Someone
 *     who has paid four figures for a panel presses "Download my results" and
 *     the page does nothing at all, with no error to report to the clinic.
 *
 *  2. THE ERROR PAGE. Even where the popup survives, a signed link that has
 *     expired between issue and click answers with `{"error": "..."}` and a
 *     403 — so the new tab renders raw JSON. That is a dead end wearing the
 *     clinic's domain name.
 *
 * Fetching the bytes ourselves fixes both. The blob is handed to a synthetic
 * anchor, which is not a popup and cannot be blocked, and a failure at any
 * step is an ordinary rejection this app can show a toast for. The filename
 * comes from the server's own Content-Disposition, so the file lands in
 * Downloads called "aspire-summary-2026-08-05.pdf" rather than "download".
 */

/** RFC 6266, both the plain and the RFC 5987 extended form. Labs send either. */
function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const extended = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // A malformed percent-escape is not worth failing a download over.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  a.rel = 'noopener';
  // Firefox requires the anchor to be in the document for a synthetic click.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately races the download in Chrome; a minute is far longer
  // than any browser needs and the blob is released either way on unload.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

/**
 * Fetches an absolute-on-this-API path and saves the response.
 *
 * `fallbackFilename` is only used where the server sent no Content-Disposition
 * — every route that reaches here does send one, but a file with no name is a
 * worse outcome than a slightly generic one.
 */
export async function downloadFromApi(path: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' });
  if (!res.ok) {
    // The error body is JSON on every route here, and its message is written
    // for a person — see extractErrorMessage.
    let message = 'That download could not be prepared.';
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === 'string') message = body.error;
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    throw new ApiError(message, res.status);
  }
  const blob = await res.blob();
  saveBlob(blob, filenameFromDisposition(res.headers.get('content-disposition')) ?? fallbackFilename);
}

/**
 * The two-step form: ask the API for a signed link, then fetch it.
 *
 * `linkPath` is an /api path returning `{ url }` (see the *-pdf-link routes).
 */
export async function downloadSignedFile(linkPath: string, fallbackFilename: string): Promise<void> {
  const { url } = await apiFetch<{ url: string }>(linkPath);
  await downloadFromApi(url, fallbackFilename);
}
