import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PdfGenerationError, renderPdf } from '../src/lib/pdfRender.js';
import { pdfFailure, streamPdf } from '../src/lib/pdfResponse.js';

/**
 * A PDF that cannot be produced must fail the REQUEST, never the process.
 *
 * This exists because of a real incident with a real blast radius. Embedding
 * a set of otherwise perfectly good fonts made fontkit's subsetter throw
 * partway through a 180-marker document, and the throw did not come back as a
 * rejected promise — it left the server unresponsive. One patient pressing
 * Download would have taken the API down for everybody, which is a category
 * of failure a results portal cannot have from a read-only button.
 *
 * The fonts are fixed (see modules/export/pdfSummary.ts). These tests are
 * about the class rather than the instance: whatever the renderer does next —
 * throw on a missing field, emit an 'error', hang for ever — the answer is a
 * 500 and a process that is still serving everyone else.
 *
 * The fact that every test after the first one runs at all IS the assertion
 * that the process survived; a crash here takes the whole file with it.
 */

/** A minimal, valid document. Anything drawable will do — this is not a rendering test. */
const drawSomething = (doc: PDFKit.PDFDocument) => {
  doc.fontSize(12).text('Aspire Clinic');
};

describe('renderPdf', () => {
  it('resolves with the bytes of a document that draws cleanly', async () => {
    const pdf = await renderPdf(drawSomething);
    expect(pdf.byteLength).toBeGreaterThan(0);
    // A PDF, not merely a non-empty buffer.
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('rejects rather than escaping when the drawing code throws', async () => {
    await expect(
      renderPdf(() => {
        throw new Error('a marker with no unit');
      }),
    ).rejects.toBeInstanceOf(PdfGenerationError);
  });

  it('keeps the original failure as the cause, so the log says what actually broke', async () => {
    const boom = new Error('heightOfString of undefined');
    await expect(renderPdf(() => { throw boom; })).rejects.toMatchObject({ cause: boom });
  });

  /**
   * The one that used to kill the process. An 'error' event on a stream with
   * no listener is not a value a caller can inspect — Node treats it as an
   * uncaught exception and exits.
   */
  it('rejects when the document emits an error instead of taking the process down', async () => {
    await expect(
      renderPdf((doc) => {
        drawSomething(doc);
        doc.emit('error', new Error('the stream fell over'));
      }),
    ).rejects.toBeInstanceOf(PdfGenerationError);
  });

  /**
   * A document that never ends used to leave the request hanging on an open
   * socket until the client gave up — observed at two minutes and counting.
   */
  it('rejects on a document that never finishes, rather than hanging the request', async () => {
    const neverEnds = renderPdf(
      (doc) => {
        drawSomething(doc);
        // Swallow the end() this renderer is about to call, so 'end' never
        // fires and only the deadline can settle the promise.
        vi.spyOn(doc, 'end').mockImplementation(() => doc);
      },
      { timeoutMs: 50 },
    );
    await expect(neverEnds).rejects.toThrow(/did not finish/);
  });

  it('settles once — a late end after a timeout cannot resolve an already-rejected render', async () => {
    let captured: PDFKit.PDFDocument | undefined;
    const render = renderPdf(
      (doc) => {
        captured = doc;
        drawSomething(doc);
        vi.spyOn(doc, 'end').mockImplementation(() => doc);
      },
      { timeoutMs: 20 },
    );
    await expect(render).rejects.toThrow(/did not finish/);
    // The document finishing afterwards must be a no-op, not a second settle
    // (which would be an unhandled rejection or a resolved-then-rejected
    // promise, depending on the order).
    expect(() => captured!.emit('end')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The routes' half: a generation failure is a 500 with a sentence a patient
// can read, over real HTTP, through the same helpers the two download routes
// use. Auth and Prisma are deliberately absent — what is under test is what
// happens when generation fails, not who is allowed to ask.
// ---------------------------------------------------------------------------

describe('a failed download over HTTP', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();

    app.get('/ok', (_req, res) =>
      void streamPdf(res, { filename: 'fine.pdf', what: 'a document that works', generate: () => renderPdf(drawSomething) }),
    );
    // The two shapes a download can fail in: the generator throws before it
    // returns a promise, and the promise it returned rejects.
    app.get('/throws', (_req, res) =>
      void streamPdf(res, {
        filename: 'nope.pdf',
        what: 'a generator that throws',
        generate: () => {
          throw new Error('deliberate: the renderer fell over');
        },
      }),
    );
    app.get('/rejects', (_req, res) =>
      void streamPdf(res, {
        filename: 'nope.pdf',
        what: 'a generator that rejects',
        generate: () =>
          renderPdf(() => {
            throw new Error('deliberate: the drawing code threw');
          }),
      }),
    );
    // The summary route's shape: generate, store, then answer with a link.
    app.get('/link', (_req, res) => pdfFailure(res, 'a summary that could not be stored', new Error('deliberate')));

    // The same last-resort boundary index.ts mounts. If anything above ever
    // stops catching, this is what would answer instead — and the test below
    // asserts the specific message, so a silent fall-through to the generic
    // one is a failure rather than a pass.
    app.use((_err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    });

    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  it('sends the PDF as an attachment when generation succeeds', async () => {
    const res = await fetch(`${base}/ok`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('fine.pdf');
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe('%PDF');
  });

  it.each([
    ['a generator that throws synchronously', '/throws'],
    ['a generator whose promise rejects', '/rejects'],
    ['a summary that could not be prepared', '/link'],
  ])('answers 500 with a readable message for %s', async (_name, path) => {
    const res = await fetch(`${base}${path}`);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; correlationId: string };
    // The client shows this string verbatim (see web lib/download.ts), so it
    // is written for a patient and not for a log reader — and it is NOT the
    // global boundary's generic message, which would mean nothing here caught
    // the failure and it merely fell through.
    expect(body.error).toBe('That download could not be prepared. Please try again.');
    expect(body.error).not.toContain('deliberate');
    // Quotable back to the clinic, and the only way to find the cause — which
    // stays in the server log and never reaches the body.
    expect(body.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is still serving after all of that', async () => {
    const res = await fetch(`${base}/ok`);
    expect(res.status).toBe(200);
  });
});
