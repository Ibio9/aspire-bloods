import { randomUUID } from 'node:crypto';
import type { Response } from 'express';

/**
 * How a failed download is answered.
 *
 * The global error boundary in index.ts would already turn a rejected
 * generation into a 500, and that is the backstop rather than the plan: its
 * message is "Something went wrong", which is true of everything and useful
 * for nothing. A download that could not be prepared has one honest sentence
 * and the client already shows it verbatim (see lib/download.ts, which reads
 * `error` off the body and toasts it), so the two say the same thing.
 *
 * The cause goes to the log with a correlation id and never into the body:
 * a stack trace from a PDF renderer can carry file paths, and a failure while
 * rendering a patient's results can carry their data.
 */
const FAILED_MESSAGE = 'That download could not be prepared. Please try again.';

export function pdfFailure(res: Response, what: string, cause: unknown): void {
  const correlationId = randomUUID();
  console.error(`[${correlationId}] ${what} failed:`, cause);
  // Something already started writing — a partial PDF on the wire cannot be
  // retracted, and adding a JSON body to it would corrupt the file rather
  // than explain it. The log is the only place left to say so.
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(500).json({ error: FAILED_MESSAGE, correlationId });
}

/**
 * Generate a PDF and send it as an attachment, or fail the request.
 *
 * The generator is called INSIDE the try, deliberately: the point is that no
 * exception from it, and no rejection, reaches the process as anything other
 * than a 500. See lib/pdfRender.ts for the three failure modes it closes and
 * the one it cannot.
 */
export async function streamPdf(
  res: Response,
  { filename, what, generate }: { filename: string; what: string; generate: () => Promise<Buffer> },
): Promise<void> {
  let pdf: Buffer;
  try {
    pdf = await generate();
  } catch (e) {
    pdfFailure(res, what, e);
    return;
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(pdf);
}
