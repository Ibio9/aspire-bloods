import PDFDocument from 'pdfkit';

/**
 * The one way a PDF is turned into a Buffer in this codebase.
 *
 * It exists because of a specific incident and a general class of bug behind
 * it. The specific one: embedding Fraunces and IBM Plex into the results
 * letter made fontkit's TTF subsetter throw on any document with more than a
 * few dozen distinct glyphs, and the download stopped responding entirely
 * (see the long note at the top of modules/export/pdfSummary.ts). That is
 * fixed by not embedding those faces. The general one is not fixed by that at
 * all: PDF generation is the only place in this server that hands work to a
 * streaming library, and there are three ways that can go wrong, each of
 * which used to end with a request that never came back.
 *
 * All three are closed here, once, rather than twice at two call sites:
 *
 *  1. THE BUILDER THROWS. A missing field, a `heightOfString` on undefined, a
 *     marker with no unit — an ordinary synchronous bug in the drawing code.
 *     Caught and turned into a rejection, so it reaches the route as a failed
 *     request instead of a rejected promise nobody is holding.
 *  2. THE DOCUMENT EMITS 'error'. A PDFDocument is a Readable, and an 'error'
 *     event on a stream with no listener is not an error value — it is an
 *     uncaught exception that takes the process down, and with it every other
 *     patient's session. A listener is the whole fix, and its absence is the
 *     kind of thing that is invisible until the day it isn't.
 *  3. THE DOCUMENT NEVER ENDS. The promise that used to back this resolved
 *     only on 'end'; a document that never finished left the request hanging
 *     on an open socket until the client gave up. Observed: two minutes and
 *     counting on a 450-marker render. A deadline turns that into a 500.
 *
 * WHAT THIS STILL CANNOT CATCH, stated plainly so nobody reads the above as a
 * guarantee it does not make: an exception thrown inside a stream's OWN
 * callback, which is where the fontkit failure happened. It is not a rejected
 * promise, it is not an emitted 'error', and it is not on this stack — a
 * try/catch around `doc.end()` does not see it and neither does any listener
 * here. Node treats it as an uncaught exception and exits. That is precisely
 * why the font decision is what it is, and why anything that hands untrusted
 * shapes to a streaming encoder gets checked against a real document before
 * it ships rather than against a sample line.
 */

/** Wraps whatever went wrong, so a caller can tell "the PDF failed" from "the database failed". */
export class PdfGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PdfGenerationError';
  }
}

/**
 * Long enough that no honest render hits it — the biggest document this
 * product makes is a 450-marker reference sheet, which takes well under a
 * second — and short enough that a stuck one fails while the patient is still
 * looking at the button.
 */
export const PDF_RENDER_TIMEOUT_MS = 30_000;

/**
 * Runs `build` against a fresh A4 document and resolves with the bytes.
 *
 * `build` draws and returns; it must NOT call `doc.end()` — that is this
 * function's job, and calling it twice is how a document ends up truncated.
 */
export function renderPdf(
  build: (doc: PDFKit.PDFDocument) => void,
  { timeoutMs = PDF_RENDER_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];

    // Every path below goes through settle(), so the promise cannot be
    // resolved twice (an 'end' arriving after a timeout) and the timer is
    // always cleared (a pending timer holds the event loop open, which in a
    // test run means vitest sitting there for thirty seconds).
    let settled = false;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outcome();
    };
    const fail = (message: string, cause?: unknown) =>
      settle(() => reject(new PdfGenerationError(message, { cause })));

    const timer = setTimeout(() => fail(`PDF generation did not finish within ${timeoutMs}ms`), timeoutMs);
    // A pending timer must not be the reason a process stays alive.
    timer.unref?.();

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', (e) => fail('The PDF stream failed', e));
    doc.on('end', () => settle(() => resolve(Buffer.concat(chunks))));

    try {
      build(doc);
      doc.end();
    } catch (e) {
      fail('PDF generation threw', e);
    }
  });
}
