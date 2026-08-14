import { describe, it, expect } from 'vitest';
import { parseRandoxErrorBody } from '../src/modules/randox/endpoints.js';

/**
 * ---------------------------------------------------------------------------
 * THE FOUR ERROR BODY SHAPES. TWO WERE DOCUMENTED, TWO COST A SANDBOX RUN.
 * ---------------------------------------------------------------------------
 *
 * The spec documents two and the parser handled both. The other two arrived on
 * real sandbox runs, and each dropped the one sentence that explained the
 * refusal:
 *
 *   ASP.NET ProblemDetails   from the first real CreatePendingOrder. No
 *                            `message` field at all, so the parser returned
 *                            `{code: "400", message: null}` — the request had
 *                            `PanelIds: []`, Randox said so in as many words,
 *                            and what reached the log was "failed with HTTP
 *                            400".
 *   A BARE JSON STRING       from the first real CreateRandoxBooking. The whole
 *                            body is `"Randox Booking failure, invalid
 *                            appointment id."`, quotes and all. Not an object,
 *                            so the parser refused it — losing a sentence that
 *                            names the exact field that was wrong. The SAME
 *                            failure as the one above, in a new shape, from the
 *                            other API.
 *
 * Both captured bodies are used here BYTE FOR BYTE rather than paraphrased,
 * because a fixture written from memory of a real payload is a guess about the
 * thing the test exists to pin.
 */

/** Verbatim, including the traceId, from the real capture. */
const REAL_VALIDATION_400 =
  '{"errors":{"Request":["No panels or test items provided"]},"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"One or more validation errors occurred.","status":400,"traceId":"00-0e521a422114fd707e6f6cc2891ff17b-ce9a25c0e51231d6-00"}';

/** Verbatim, from the real Clinic Booking capture. A string, not an object. */
const REAL_BOOKING_400 = '"Randox Booking failure, invalid appointment id."';

describe('parseRandoxErrorBody', () => {
  it('reads Clinic Booking’s bare-string body, which is not an object at all', () => {
    const parsed = parseRandoxErrorBody(REAL_BOOKING_400);

    // The sentence names the field that was wrong — which is the entire value
    // of the response, and was being dropped.
    expect(parsed.message).toBe('Randox Booking failure, invalid appointment id.');
    // No code in it, and none is invented from the HTTP status.
    expect(parsed.code).toBeNull();
  });

  it('caps a bare string rather than logging whatever arrives', () => {
    const parsed = parseRandoxErrorBody(JSON.stringify('x'.repeat(1000)));
    expect(parsed.message!.length).toBeLessThan(320);
    expect(parsed.message!.endsWith('…')).toBe(true);
  });

  it('a bare string with nothing in it is still nothing', () => {
    expect(parseRandoxErrorBody('"   "')).toEqual({ code: null, message: null });
  });

  it('reads the sentence naming the field out of a real validation 400', () => {
    const parsed = parseRandoxErrorBody(REAL_VALIDATION_400);

    expect(parsed.code).toBe('400');
    // The whole point: the field name AND the reason survive.
    expect(parsed.message).toContain('No panels or test items provided');
    expect(parsed.message).toContain('Request');
    // And it is not the generic title, which says nothing actionable.
    expect(parsed.message).not.toBe('One or more validation errors occurred.');
  });

  it('keeps the documented shape working — statusCode plus message', () => {
    const parsed = parseRandoxErrorBody('{"statusCode":"500","message":"Internal error."}');
    expect(parsed).toEqual({ code: '500', message: 'Internal error.' });
  });

  it('keeps the 401 shape working, which uses `status` rather than `statusCode`', () => {
    const parsed = parseRandoxErrorBody('{"status":"401","message":"Access denied due to invalid subscription key."}');
    expect(parsed).toEqual({ code: '401', message: 'Access denied due to invalid subscription key.' });
  });

  it('keeps BOTH clauses when a body carries a message and validation errors', () => {
    const parsed = parseRandoxErrorBody(
      '{"statusCode":"400","message":"Validation failed.","errors":{"PanelIds":["Required"],"TestReasons":["Must not be empty"]}}',
    );
    expect(parsed.message).toBe('Validation failed. (PanelIds: Required | TestReasons: Must not be empty)');
  });

  it('falls back to the title when a ProblemDetails body has no errors map', () => {
    const parsed = parseRandoxErrorBody('{"title":"One or more validation errors occurred.","status":400}');
    expect(parsed).toEqual({ code: '400', message: 'One or more validation errors occurred.' });
  });

  it('handles the empty-key form ASP.NET uses for errors belonging to no field', () => {
    const parsed = parseRandoxErrorBody('{"errors":{"":["The request is invalid."]},"status":400}');
    expect(parsed.message).toBe('The request is invalid.');
  });

  it('reports nothing rather than inventing something, on bodies with nothing in them', () => {
    expect(parseRandoxErrorBody(null)).toEqual({ code: null, message: null });
    expect(parseRandoxErrorBody('')).toEqual({ code: null, message: null });
    expect(parseRandoxErrorBody('not json at all')).toEqual({ code: null, message: null });
    expect(parseRandoxErrorBody('{"errors":{}}')).toEqual({ code: null, message: null });
    // An array is an object to typeof, and has no fields worth reading.
    expect(parseRandoxErrorBody('[]')).toEqual({ code: null, message: null });
  });
});
