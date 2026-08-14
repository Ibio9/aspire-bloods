import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';

/**
 * ===========================================================================
 *  THE EXPLANATION CARD'S FOUR LEVELS, MEASURED.
 * ===========================================================================
 *
 * "What this marker means" has been set FIVE times and come back wrong in a new
 * direction four of them. Every previous fix was made by eye, and every one of
 * them fixed the pair somebody happened to be looking at while inverting a
 * different pair:
 *
 *   1st  heading 12px = sub-labels 12px          four peers, nothing said which
 *                                                 one was the heading
 *   2nd  heading 14px                            two pixels is 17%, invisible
 *   3rd  heading 16px                            fixed against the sub-labels…
 *   4th  heading 28px, lead DOWN to 21px         …and put the label above the
 *                                                 sentence it labels
 *   5th  lead 28px, heading 16px, and this file  the definition is the content
 *
 * So this is not a screenshot review. It reads the COMPUTED font-size, weight,
 * letter-spacing and colour of all four levels off the rendered card, plus the
 * PAINTED gaps between them, and asserts the order rather than the values —
 * because the values will change again and the order must not.
 *
 * THE ORDER, top to bottom in prominence:
 *
 *   1. THE DEFINITION   the point of the card, the largest thing in it
 *   2. THE HEADING      clearly a label, clearly above the sub-labels
 *   3. THE SUB-LABELS   If it's high / If it's low / Lifestyle context
 *   4. THE ANSWERS      the copy under each sub-label
 *
 * ── WHY THE PAINTED GAP AND NOT THE MARGIN ────────────────────────────────
 *
 * The margins were 24px between blocks and 6px inside a pair, which reads as
 * 4:1 in the source. What a reader sees includes HALF-LEADING: an 18px answer
 * at line-height 1.65 carries ~5.9px of space above its own first line, and a
 * 12px label ~3px below its last. The real ratio was ~33:15, barely 2:1, which
 * is why three label/answer pairs read as six loose paragraphs. Measuring the
 * margin would have said the spacing was fine.
 *
 * Both themes, because `text-espresso` is espresso in light and a warm cream in
 * dark — so "the sub-label is darker than its answer" is a claim about relative
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
  definition: Level;
  heading: Level;
  sublabels: Level[];
  answers: Level[];
  /** Painted gap from the heading's last line to the definition's first. */
  headingToDefinition: number;
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
      const heading = document.querySelector('.card-eyebrow') as HTMLElement | null;
      if (!heading) return null;
      const column = heading.parentElement?.querySelector('.max-w-measure') as HTMLElement | null;
      if (!column) return null;
      const definition = column.firstElementChild as HTMLElement | null;
      const subs = [...column.querySelectorAll('.sublabel')] as HTMLElement[];
      if (!definition || subs.length < 2) return null;
      const answers = subs.map((s) => s.nextElementSibling as HTMLElement);
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
        definition: read(definition),
        heading: read(heading),
        sublabels: subs.map(read),
        answers: answers.map(read),
        headingToDefinition: paintedGap(heading, definition),
        withinPair: paintedGap(subs[0], answers[0]),
        betweenBlocks: paintedGap(answers[0], subs[1]),
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
  test(`the explanation card's four levels read in order in ${theme} mode`, async ({ browser }) => {
    test.setTimeout(180_000);
    const c = await measure(browser, theme);
    const sub = c.sublabels[0];
    const answer = c.answers[0];

    const line = (name: string, l: Level) =>
      `    ${name.padEnd(12)} ${String(l.fontSize).padStart(5)}px  ${l.fontWeight}  ` +
      `${l.letterSpacing.padStart(8)}  ${l.textTransform.padEnd(9)} ${l.color}  ${l.fontFamily}`;
    // eslint-disable-next-line no-console
    console.log(
      `\n  ${theme} — the four levels, computed:\n` +
        [
          line('1 definition', c.definition),
          line('2 heading', c.heading),
          line('3 sub-label', sub),
          line('4 answer', answer),
        ].join('\n') +
        `\n    gaps: heading→definition ${c.headingToDefinition.toFixed(1)}px · ` +
        `within a pair ${c.withinPair.toFixed(1)}px · between blocks ${c.betweenBlocks.toFixed(1)}px\n`,
    );

    // ── 1 BEATS 2. The definition is the content of the card. ───────────────
    // This is the assertion the fourth attempt failed: it had the heading at
    // 28px over a 21px definition.
    expect(
      c.definition.fontSize,
      `the definition (${c.definition.fontSize}px) is not larger than the heading (${c.heading.fontSize}px)`,
    ).toBeGreaterThan(c.heading.fontSize);
    // And by a step somebody sees, not by two pixels.
    expect(c.definition.fontSize / c.heading.fontSize).toBeGreaterThanOrEqual(1.25);
    // The only display face in the card, which is the second axis carrying it.
    expect(c.definition.fontFamily).toMatch(/Fraunces/i);
    expect(c.heading.fontFamily).not.toMatch(/Fraunces/i);

    // ── 2 BEATS 3. Clearly a label, clearly above the sub-labels. ───────────
    // The three failures here were all "not enough of a step": 12 vs 12, then
    // 14 vs 12. A third larger, plus the case and the tracking.
    expect(c.heading.fontSize).toBeGreaterThan(sub.fontSize);
    expect(
      c.heading.fontSize / sub.fontSize,
      `heading ${c.heading.fontSize}px against sub-label ${sub.fontSize}px is inside the noise of two letter-cases`,
    ).toBeGreaterThanOrEqual(1.25);
    // It is the ONLY uppercase tracked line in the card. That is what makes it
    // read as the heading rather than as a fourth peer.
    expect(c.heading.textTransform).toBe('uppercase');
    expect(sub.textTransform).toBe('none');
    expect(parseFloat(c.heading.letterSpacing)).toBeGreaterThan(parseFloat(sub.letterSpacing) + 1);

    // ── 3 BEATS 4. The label out-reads its own answer. ──────────────────────
    // This is the pair that was running BACKWARDS: 500 at /80 above 400 at /90,
    // so the label was the fainter of the two. Size cannot carry it — the
    // answer is a paragraph and has to stay at the reading step — so weight and
    // tone do, and both must run the right way.
    expect(
      sub.fontWeight,
      `the sub-label (${sub.fontWeight}) is not heavier than its answer (${answer.fontWeight})`,
    ).toBeGreaterThan(answer.fontWeight);
    expect(sub.fontWeight - answer.fontWeight, 'one weight step is not a visible difference').toBeGreaterThanOrEqual(
      200,
    );
    expect(
      sub.inkDistance,
      `the sub-label stands ${sub.inkDistance.toFixed(3)} off the page and its answer ${answer.inkDistance.toFixed(3)} — the label is the fainter`,
    ).toBeGreaterThan(answer.inkDistance);

    // …and the answers were NOT dimmed to achieve it. Body copy in a medical
    // portal does not lose contrast to win a typographic argument: /90 is where
    // it was, so the ratio holds at the same distance the whole product uses.
    expect(answer.color.replace(/\s/g, '')).toMatch(/0\.9\)$/);

    // ── THE SPACING. More between blocks than within them, and measured at the
    //    painted gap rather than at the margin. 24/6 read as 4:1 in the source
    //    and rendered at barely 2:1.
    expect(c.withinPair).toBeGreaterThan(0);
    expect(
      c.betweenBlocks / c.withinPair,
      `blocks are ${c.betweenBlocks.toFixed(1)}px apart and a pair is ${c.withinPair.toFixed(1)}px — ` +
        `a label sits almost as far from its own answer as from the block above`,
    ).toBeGreaterThanOrEqual(3);

    // The heading belongs to the definition, not to the first pair. A heading
    // floating in as much air as a block boundary reads as a fourth block.
    expect(
      c.headingToDefinition,
      'the heading is as far from its own definition as one block is from the next',
    ).toBeLessThan(c.betweenBlocks);

    // ── AND ALL THREE SUB-LABELS ARE THE SAME. One class, not three call
    //    sites drifting apart.
    for (const s of c.sublabels) {
      expect(s.fontSize).toBe(sub.fontSize);
      expect(s.fontWeight).toBe(sub.fontWeight);
      expect(s.color).toBe(sub.color);
    }
  });
}
