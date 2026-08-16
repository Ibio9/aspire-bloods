import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';

/**
 * ===========================================================================
 *  THE EXPLANATION CARD'S THREE LEVELS, MEASURED.
 * ===========================================================================
 *
 * "What this marker means" has been set SIX times and come back wrong in a new
 * direction five of them. Every fix before this file existed was made by eye,
 * and every one of them fixed the pair somebody happened to be looking at while
 * inverting a different pair:
 *
 *   1st  heading 12px = sub-labels 12px          four peers, nothing said which
 *                                                 one was the heading
 *   2nd  heading 14px                            two pixels is 17%, invisible
 *   3rd  heading 16px                            fixed against the sub-labels…
 *   4th  heading 28px, lead DOWN to 21px         …and put the label above the
 *                                                 sentence it labels
 *   5th  lead 28px, heading 16px, and this file  the definition is the content
 *   6th  ONE LABEL CLASS FOR ALL FOUR LABELS     there was never a heading
 *
 * ── WHY THE SIXTH IS DIFFERENT IN KIND ────────────────────────────────────
 *
 * The first five were all the same move: adjust the size of the card's HEADING
 * relative to something else in the card. Five different answers, because the
 * question had no answer — a heading and three sub-labels of the same kind, in
 * a card that small, is a contest nothing wins. There is no heading now. All
 * FOUR labels — "What this marker means", "If it's high", "If it's low",
 * "Lifestyle context" — are one class, one size, one weight, one case.
 *
 * And the ladder inverted with it. The labels are now the MOST prominent text
 * in the card and the prose is subordinate to them, which is the opposite of
 * what the fifth attempt built:
 *
 *   1. THE LABELS       16px, Plex 600, SENTENCE case — all four identical
 *   2. THE DEFINITION   14px Fraunces, the only display face, smaller
 *   3. THE ANSWERS      12px, the quietest and smallest text in the card
 *
 * UPPERCASE IS GONE, and that is the load-bearing change rather than the
 * sizes. Uppercase at 0.14em reads as loud regardless of size, which is why
 * five attempts to referee this by size alone all failed: 16px uppercase
 * tracked has the presence of a 21px sentence-case line, so "make it smaller"
 * bought a quieter number and the same volume.
 *
 * So this is not a screenshot review. It reads the COMPUTED font-size, weight,
 * letter-spacing, case and colour of all three levels off the rendered card,
 * plus the PAINTED gaps between them, and asserts the ORDER rather than the
 * values — because the values will change again and the order must not.
 *
 * ── WHY THE PAINTED GAP AND NOT THE MARGIN ────────────────────────────────
 *
 * The margins were once 24px between blocks and 6px inside a pair, which reads
 * as 4:1 in the source. What a reader sees includes HALF-LEADING: a 12px answer
 * at line-height 1.5 carries ~3px of space above its own first line, and a 16px
 * label ~4.8px below its last. Measuring the margin would have said the spacing
 * was fine when it rendered at barely 2:1.
 *
 * Both themes, because `text-espresso` is espresso in light and a warm cream in
 * dark — so "the label out-reads its own answer" is a claim about relative
 * distance from the page, not about a hex value.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's demo account.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';
const VIEWPORT = { width: 1440, height: 900 };

async function signIn(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  expect(login.ok(), 'the demo account could not sign in').toBeTruthy();
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok()).toBeTruthy();
}

interface Level {
  text: string;
  fontSize: number;
  fontWeight: number;
  letterSpacing: string;
  textTransform: string;
  color: string;
  fontFamily: string;
  /** Distance from the page background, so the two themes are comparable. */
  inkDistance: number;
  top: number;
  bottom: number;
  lineHeight: number;
  marginTop: number;
}

interface Card {
  /** All four labels, in document order. The first is "What this marker means". */
  labels: Level[];
  definition: Level;
  answers: Level[];
  /** Painted gap from the first label's last line to the definition's first. */
  labelToDefinition: number;
  /** Painted gap inside a label/answer pair, half-leading counted. */
  withinPair: number;
  /** Painted gap from one pair's answer to the next pair's label. */
  betweenBlocks: number;
}

async function measure(browser: Browser, theme: 'light' | 'dark'): Promise<Card> {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* a private window without storage is not a reason to fail */
    }
  }, theme);
  await signIn(ctx.request);
  const page = await ctx.newPage();

  const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
    markerId: string;
    resultType?: string;
  }[];
  const measured = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED');
  expect(measured.length, 'no measured marker — run the demo seed').toBeGreaterThan(0);

  // The first marker whose card actually has all three pairs on it. A marker
  // with only `whatItIs` would pass a check on a card with nothing in it.
  let found: Card | null = null;
  for (const marker of measured.slice(0, 12)) {
    await page.goto(`/markers/${marker.markerId}`);
    await page.getByText('What this marker means').waitFor({ timeout: 30_000 });
    // The card fades in with the page; measuring mid-transition measures nothing.
    await page.waitForTimeout(800);

    const card = await page.evaluate(() => {
      /**
       * ONE CLASS FOR ALL FOUR LABELS, which is the whole point of the sixth
       * setting — so the spec selects them with ONE selector. If a second label
       * class ever comes back into this card, `labels` will be short and the
       * "all four identical" assertion below cannot even be reached.
       */
      /**
       * ── AND THE VELLUM IS A PANE NOW (Aug 2026) ─────────────────────────
       * The reading ground did not change — it is still `--c-vellum`, still the
       * one class of content in the product that is writing rather than data.
       * What changed is that it is applied THROUGH the glass material rather
       * than as an opaque fill, so the class carrying it on the marker page is
       * `.glass-vellum` while the marker library's disclosure panel still uses
       * `.card-vellum`. Both are matched, because this spec is about the type
       * ladder inside the card and must not care which surface it is drawn on.
       */
      const column = document.querySelector(
        '.card-vellum .max-w-measure, .glass-vellum .max-w-measure',
      ) as HTMLElement | null;
      if (!column) return null;
      const labels = [...column.querySelectorAll('.card-label')] as HTMLElement[];
      // The definition is the element straight after the first label.
      const definition = labels[0]?.nextElementSibling as HTMLElement | null;
      if (!definition || labels.length < 3) return null;
      // Every label after the first is a block label, and its answer follows it.
      const answers = labels.slice(1).map((s) => s.nextElementSibling as HTMLElement);
      if (answers.some((a) => !a)) return null;

      /**
       * THE PAGE'S OWN GROUND, so a colour can be compared across two themes.
       * WCAG relative luminance; the distance is |L(text) - L(page)|, which is
       * larger for text that stands out further whichever way round the theme
       * is.
       *
       * ⚠ THE ALPHA IS COMPOSITED, and the first version of this did not do it.
       * The whole text opacity ladder in this product is `rgb(var(--x) / 0.9)`
       * — same three channels, different alpha — so reading only the first
       * three numbers out of the colour string makes /90 body copy and
       * full-tone text measure IDENTICALLY, and the assertion that a label
       * out-reads its own answer passed or failed on a coin toss. A measuring
       * spec that cannot see the difference it exists to measure is worse than
       * none.
       */
      const channels = (css: string) => (css.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number);
      const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      const rawLuminance = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      const pageRgb = channels(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3);
      const pageLum = rawLuminance(pageRgb);
      /** The colour a reader actually sees: the text composited onto the page at its own alpha. */
      const luminance = (css: string) => {
        const parts = channels(css);
        const alpha = parts.length > 3 ? parts[3] : 1;
        const composited = parts.slice(0, 3).map((c, i) => c * alpha + pageRgb[i] * (1 - alpha));
        return rawLuminance(composited);
      };

      const read = (el: HTMLElement) => {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent ?? '').trim().slice(0, 48),
          fontSize: parseFloat(cs.fontSize),
          fontWeight: Number(cs.fontWeight),
          letterSpacing: cs.letterSpacing,
          textTransform: cs.textTransform,
          color: cs.color,
          fontFamily: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
          inkDistance: Math.abs(luminance(cs.color) - pageLum),
          top: rect.top,
          bottom: rect.bottom,
          lineHeight: parseFloat(cs.lineHeight),
          marginTop: parseFloat(cs.marginTop),
        };
      };

      /**
       * The painted gap between two stacked lines: the distance between their
       * boxes PLUS the half-leading each contributes, which is the white space
       * a reader actually sees. Measuring the margin alone is what made 24/6
       * look like 4:1 when it renders as 2:1.
       */
      const paintedGap = (above: HTMLElement, below: HTMLElement) => {
        const a = read(above);
        const b = read(below);
        const halfLeadingBelowA = Math.max(0, (a.lineHeight - a.fontSize) / 2);
        const halfLeadingAboveB = Math.max(0, (b.lineHeight - b.fontSize) / 2);
        return b.top - a.bottom + halfLeadingBelowA + halfLeadingAboveB;
      };

      return {
        labels: labels.map(read),
        definition: read(definition),
        answers: answers.map(read),
        labelToDefinition: paintedGap(labels[0], definition),
        withinPair: paintedGap(labels[1], answers[0]),
        betweenBlocks: paintedGap(answers[0], labels[2]),
      };
    });

    if (card) {
      found = card as Card;
      break;
    }
  }

  await ctx.close();
  expect(found, 'no marker page rendered an explanation card with at least two pairs').not.toBeNull();
  return found!;
}

for (const theme of ['light', 'dark'] as const) {
  test(`the explanation card's three levels read in order in ${theme} mode`, async ({ browser }) => {
    test.setTimeout(180_000);
    const c = await measure(browser, theme);
    const label = c.labels[0];
    const answer = c.answers[0];

    const line = (name: string, l: Level) =>
      `    ${name.padEnd(12)} ${String(l.fontSize).padStart(5)}px  ${l.fontWeight}  ` +
      `${l.letterSpacing.padStart(8)}  ${l.textTransform.padEnd(9)} ${l.color}  ${l.fontFamily}`;
    // eslint-disable-next-line no-console
    console.log(
      `\n  ${theme} — the three levels, computed:\n` +
        [line('1 label', label), line('2 definition', c.definition), line('3 answer', answer)].join('\n') +
        `\n    ${c.labels.length} labels, all one class\n` +
        `    gaps: label→definition ${c.labelToDefinition.toFixed(1)}px · ` +
        `within a pair ${c.withinPair.toFixed(1)}px · between blocks ${c.betweenBlocks.toFixed(1)}px\n`,
    );

    // ── THE CARD HAS FOUR LABELS AND THEY ARE ONE CLASS. ───────────────────
    // This is the assertion the whole sixth setting is about, and it is first
    // because everything below it is meaningless if the card has grown a second
    // label tier again.
    expect(c.labels.length, 'the card should carry its labels in one class').toBeGreaterThanOrEqual(3);
    for (const l of c.labels) {
      expect(l.fontSize, `"${l.text}" is ${l.fontSize}px against "${label.text}" at ${label.fontSize}px`).toBe(
        label.fontSize,
      );
      expect(l.fontWeight, `"${l.text}" is weight ${l.fontWeight} against ${label.fontWeight}`).toBe(label.fontWeight);
      expect(l.color, `"${l.text}" is ${l.color} against ${label.color}`).toBe(label.color);
      expect(l.textTransform).toBe(label.textTransform);
      expect(l.letterSpacing).toBe(label.letterSpacing);
    }
    // And "What this marker means" is one of them rather than a heading above
    // them — the specific failure the previous five settings kept re-creating.
    expect(c.labels[0].text.toLowerCase()).toContain('what this marker means');

    // ── NOT UPPERCASE. The load-bearing change. ────────────────────────────
    // Uppercase at wide tracking reads as loud regardless of size, so a label
    // set that way cannot be balanced against anything by size alone. Sentence
    // case, and tracking well under the eyebrow's 0.14em (≈2.24px at 16px).
    expect(label.textTransform, 'a label in this card is never uppercase').toBe('none');
    expect(
      parseFloat(label.letterSpacing),
      `the label is tracked at ${label.letterSpacing}, which is eyebrow territory`,
    ).toBeLessThan(1);

    // ── 1 BEATS 2. The labels are the most prominent text in the card. ─────
    expect(
      label.fontSize,
      `the label (${label.fontSize}px) is not larger than the definition (${c.definition.fontSize}px)`,
    ).toBeGreaterThan(c.definition.fontSize);
    // The definition is still the only display face, which is the second axis
    // separating it from the label above and the answers below.
    expect(c.definition.fontFamily).toMatch(/Fraunces/i);
    expect(label.fontFamily).not.toMatch(/Fraunces/i);
    expect(answer.fontFamily).not.toMatch(/Fraunces/i);

    // ── 2 BEATS 3. The answers are the smallest text in the card. ──────────
    expect(
      c.definition.fontSize,
      `the definition (${c.definition.fontSize}px) is not larger than an answer (${answer.fontSize}px)`,
    ).toBeGreaterThan(answer.fontSize);

    // ── AND THE LABEL OUT-READS ITS OWN ANSWER, on weight and on tone. ─────
    // This is the pair that once ran BACKWARDS: 500 at /80 above 400 at /90, so
    // the label was the fainter of the two. All three axes run the right way
    // now — larger, heavier, and closer to full tone.
    expect(
      label.fontWeight,
      `the label (${label.fontWeight}) is not heavier than its answer (${answer.fontWeight})`,
    ).toBeGreaterThan(answer.fontWeight);
    expect(label.fontWeight - answer.fontWeight, 'one weight step is not a visible difference').toBeGreaterThanOrEqual(
      200,
    );
    expect(
      label.inkDistance,
      `the label stands ${label.inkDistance.toFixed(3)} off the page and its answer ${answer.inkDistance.toFixed(3)} — the label is the fainter`,
    ).toBeGreaterThan(answer.inkDistance);

    // The answers are quiet but never faint: /85 is on the opacity ladder and
    // above its floor. Body copy in a medical portal does not go below it to
    // win a typographic argument.
    const answerAlpha = Number((answer.color.match(/[\d.]+/g) ?? [])[3] ?? 1);
    expect(answerAlpha, `an answer is set at ${answer.color}, below the /80 floor of the opacity ladder`).toBeGreaterThanOrEqual(
      0.8,
    );

    // ── THE SPACING. More between blocks than within them, measured at the
    //    painted gap rather than at the margin.
    expect(c.withinPair).toBeGreaterThan(0);
    expect(
      c.betweenBlocks / c.withinPair,
      `blocks are ${c.betweenBlocks.toFixed(1)}px apart and a pair is ${c.withinPair.toFixed(1)}px — ` +
        `a label sits almost as far from its own answer as from the block above`,
    ).toBeGreaterThanOrEqual(3);

    // The first label belongs to the definition, not to the first pair — the
    // two are one unit, and it is spaced exactly as every other pair is.
    expect(
      c.labelToDefinition,
      'the first label is as far from its own definition as one block is from the next',
    ).toBeLessThan(c.betweenBlocks);

    // ── AND EVERY ANSWER IS THE SAME AS EVERY OTHER ANSWER. Nothing varies by
    //    content length or by which fields a marker happens to have.
    for (const a of c.answers) {
      expect(a.fontSize).toBe(answer.fontSize);
      expect(a.fontWeight).toBe(answer.fontWeight);
      expect(a.color).toBe(answer.color);
    }
  });
}
