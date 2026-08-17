import { splitMarkerName } from '@aspire-bloods/shared';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * ===========================================================================
 *  A MARKER'S NAME NEVER BREAKS MID-WORD, AND A CARD IS AS TALL AS ITS OWN
 *  CONTENT.
 * ===========================================================================
 *
 * Two faults with one cause — a card too narrow for what was put in it — and
 * both are geometry, which is why they are measured here rather than reviewed
 * in a screenshot.
 *
 * ── THE BREAK ─────────────────────────────────────────────────────────────
 *
 * The name on a result card carried `break-words` (`overflow-wrap:
 * break-word`), which is a standing licence to hyphenate inside a word when one
 * will not fit on a line of its own. It was taken:
 *
 *     ALT (ALANINE AMINOTRANSFE
 *     RASE)
 *
 * A patient scanning a grid for "Aminotransferase" does not find it there, and
 * a clinical name split at an arbitrary letter reads as a rendering fault at
 * any width. `break-words` is gone; the name wraps at ordinary break
 * opportunities only and the card gets taller when it needs to.
 *
 * WHAT COUNTS AS ORDINARY, and it is not "spaces" alone: a name may carry a
 * hyphen (`Gamma-Glutamyltransferase`) or a slash
 * (`Microalbumin/Creatinine Ratio`), and both are break opportunities the
 * browser takes by default. Those are part of the name as written rather than
 * a break invented by the layout, so they pass. A break with a LETTER on each
 * side of it fails.
 *
 * HOW IT IS DETECTED, AND IT TAKES BOTH HALVES.
 *
 *  1. WHAT WAS PAINTED. Every character's client rect, one `Range` at a time: a
 *     line begins wherever a character's top jumps, and the character before
 *     that jump has to be a space, a hyphen or a slash. This is the check that
 *     cannot be fooled — it says nothing about the CSS and everything about the
 *     glyphs.
 *  2. WHETHER IT WAS ALLOWED TO. `overflow-wrap`, `word-break` and `hyphens`
 *     off the computed style of the name itself.
 *
 * THE SECOND IS NOT BELT AND BRACES, and leaving it out was the first version
 * of this spec's real weakness: at 12px in a 267px column NOTHING breaks
 * mid-word, `break-words` or not — the fault only appeared once the label had
 * been enlarged to 21px. So a painted-only check would have passed the exact
 * markup that produced `ALT (ALANINE AMINOTRANSFE / RASE)` and gone on passing
 * it, right up until the next thing that made a card narrower or a label
 * larger. What is wrong is the LICENCE, which is a fact about the element and
 * is true at every width.
 *
 * OVER THE REAL GRID at the width where the cards are narrowest. The by-marker
 * view packs `minmax(15rem, 1fr)` columns, so a desktop window is where a card
 * is closest to its 240px floor — a phone gives it the whole screen. The demo
 * patient carries the Signature panel, which is most of the 445-name catalogue,
 * so the longest names in the product are on the page rather than staged.
 *
 * ── THE EMPTY HALF-CARD ───────────────────────────────────────────────────
 *
 * A grid stretches its items, so one card whose name wrapped set the height of
 * every card beside it and the space it bought was drawn as empty card. The
 * assertion is direct: the distance from the bottom of a card's last element to
 * the bottom of the card is its own padding, and nothing more.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'the demo patient could not complete 2FA').toBeTruthy();
}

/**
 * Every place a line begins, for every element matching `selector`, with the
 * characters either side of the break. Runs entirely in the page.
 */
async function badBreaks(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const out: { name: string; before: string; after: string; width: number; overflow: number }[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const node = el.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const text = node.textContent ?? '';
      if (!text.trim()) continue;
      const range = document.createRange();
      const tops: number[] = [];
      for (let i = 0; i < text.length; i += 1) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        tops.push(Math.round(range.getBoundingClientRect().top));
      }
      for (let i = 1; i < text.length; i += 1) {
        // A line begins here. The 2px slack absorbs sub-pixel rect rounding
        // within one line; a real line is a whole line-height further down.
        if (tops[i] <= tops[i - 1] + 2) continue;
        const before = text[i - 1];
        const after = text[i];
        // Legal: the browser broke where the NAME already had a seam.
        if (/[\s\-/]/.test(before) || /\s/.test(after)) continue;
        out.push({
          name: text,
          before,
          after,
          width: Math.round(el.getBoundingClientRect().width),
          overflow: Math.round(el.scrollWidth - el.clientWidth),
        });
      }
    }
    return out;
  }, selector);
}

/**
 * Elements whose computed style PERMITS a break inside a word, whether or not
 * one happened at this width. `break-word` and `anywhere` on `overflow-wrap`,
 * `break-all` on `word-break`, and `auto` on `hyphens` are the three ways in.
 */
async function breakLicences(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const out: { name: string; property: string; value: string }[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const s = getComputedStyle(el);
      const name = (el.textContent ?? '').slice(0, 48);
      if (/break-word|anywhere/.test(s.overflowWrap)) out.push({ name, property: 'overflow-wrap', value: s.overflowWrap });
      if (/break-all/.test(s.wordBreak)) out.push({ name, property: 'word-break', value: s.wordBreak });
      if (/auto|all/.test(s.hyphens)) out.push({ name, property: 'hyphens', value: s.hyphens });
    }
    return out;
  }, selector);
}

test.describe('marker names', () => {
  test.describe.configure({ timeout: 180_000 });

  test('never break mid-word on a result card, at the narrowest the grid draws', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(ctx.request);
    const page = await ctx.newPage();
    await page.goto('/results?view=by-marker');
    await expect(page.getByRole('heading', { name: 'Results' })).toBeVisible({ timeout: 30_000 });
    // The list is long; give it room to lay out before anything is measured.
    await page.waitForTimeout(3000);
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(800);

    const measured = await page.evaluate(() => {
      const names = [...document.querySelectorAll('.eyebrow.leading-snug')];
      const widths = names.map((n) => Math.round(n.getBoundingClientRect().width));
      const longest = [...names]
        .map((n) => n.textContent ?? '')
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);
      return { count: names.length, narrowest: Math.min(...widths), longest };
    });
    expect(measured.count, 'no marker cards on the by-marker view').toBeGreaterThan(20);
    console.log(
      `\n  ${measured.count} marker names, narrowest column ${measured.narrowest}px` +
        `\n  longest on the page: ${measured.longest.map((n) => `"${n}"`).join(', ')}`,
    );

    const bad = await badBreaks(page, '.eyebrow.leading-snug');
    expect(
      bad,
      `a marker name was broken mid-word:\n${bad.map((b) => `  "${b.name}" between "${b.before}" and "${b.after}" in ${b.width}px`).join('\n')}`,
    ).toEqual([]);

    // AND NOTHING IS ALLOWED TO. See the note at the top: at 12px in a 267px
    // column nothing breaks whatever the CSS permits, so the painted check
    // above would happily pass the markup that caused this.
    const licences = await breakLicences(page, '.eyebrow.leading-snug');
    expect(
      licences,
      `a marker name may break mid-word:\n${licences.map((l) => `  "${l.name}" has ${l.property}: ${l.value}`).join('\n')}`,
    ).toEqual([]);

    // And nothing paints outside its own card, which is the other way a name
    // that cannot break could go wrong.
    const overflowing = await page.evaluate(() =>
      [...document.querySelectorAll('.eyebrow.leading-snug')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => `${el.textContent} (${el.scrollWidth} in ${el.clientWidth})`),
    );
    expect(overflowing, 'a marker name overflowed its card').toEqual([]);

    await ctx.close();
  });

  test('never break mid-word on the marker page’s own title', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await login(ctx.request);
    const page = await ctx.newPage();
    // The longest name in the catalogue that this patient actually has, at the
    // narrowest viewport the product is read at — 38px in a 342px column is
    // where a page title is most likely to be broken.
    const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as { markerId: string; name: string }[];
    const longest = [...markers].sort((a, b) => b.name.length - a.name.length)[0];
    await page.goto(`/markers/${longest.markerId}`);
    /**
     * ── THE H1 IS THE ABBREVIATION NOW, WHERE THERE IS ONE (Aug 2026) ──────
     *
     * `Neutrophil Gelatinase Associated Lipocalin (NGAL)` is set as **NGAL**
     * with the expansion beneath it (see `splitMarkerName` in shared), so
     * matching the heading against the whole catalogue name finds nothing.
     *
     * Both halves are asserted rather than just the new one: the abbreviation
     * IS the heading, and the expansion is still on the page. A test that only
     * checked the short line would pass on a page that had silently dropped
     * what the letters stand for.
     */
    const heading = splitMarkerName(longest.name);
    await expect(page.getByRole('heading', { name: heading.primary, exact: true })).toBeVisible({ timeout: 30_000 });
    if (heading.expansion) {
      await expect(page.getByText(heading.expansion, { exact: true }).first()).toBeVisible();
    }
    await page.waitForTimeout(800);
    console.log(`\n  marker page title: "${longest.name}" (${longest.name.length} characters) at 390px`);

    const bad = await badBreaks(page, 'h1.section-heading');
    expect(
      bad,
      `the marker page title was broken mid-word:\n${bad.map((b) => `  "${b.name}" between "${b.before}" and "${b.after}"`).join('\n')}`,
    ).toEqual([]);
    const licences = await breakLicences(page, 'h1.section-heading');
    expect(licences, `the marker page title may break mid-word: ${JSON.stringify(licences)}`).toEqual([]);
    await ctx.close();
  });

  test('never break mid-word on the What’s changed cards, and those cards fit their content', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await login(ctx.request);
    const page = await ctx.newPage();
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })).toBeVisible({
      timeout: 30_000,
    });
    await page.evaluate(async () => {
      const step = Math.round(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
    });
    await page.waitForTimeout(900);

    const section = page.locator('#whats-changed');
    if (!(await section.count())) {
      test.skip(true, 'this patient has nothing that changed');
      return;
    }

    const bad = await badBreaks(page, '#whats-changed .card > p:first-child');
    expect(
      bad,
      `a marker name was broken mid-word:\n${bad.map((b) => `  "${b.name}" between "${b.before}" and "${b.after}"`).join('\n')}`,
    ).toEqual([]);
    const licences = await breakLicences(page, '#whats-changed .card > p:first-child');
    expect(licences, `a change card's name may break mid-word: ${JSON.stringify(licences)}`).toEqual([]);

    /**
     * ── EQUAL HEIGHTS PER ROW, WHICH IS THE OPPOSITE OF WHAT THIS ASSERTED
     *    (Aug 2026) ────────────────────────────────────────────────────────
     *
     * It used to measure the SLACK below each card's last element and hold it
     * at the card's own bottom padding — i.e. it asserted the row was ragged.
     * The complaint that produced `.card-row` is that a row of cards at
     * visibly different heights reads as a layout that did not finish.
     *
     * What is measured instead is the claim the class actually makes: every
     * card sharing a row is the height of the tallest card in that row. Cards
     * are grouped by their painted TOP rather than by index, because how many
     * fit on a row is a function of the viewport and this test should not have
     * to know the column count to check the invariant.
     */
    const rows = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#whats-changed .card')];
      const byTop = new Map<number, { name: string; height: number }[]>();
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        // 2px absorbs sub-pixel rounding between two items on one row.
        const key = [...byTop.keys()].find((t) => Math.abs(t - box.top) <= 2) ?? Math.round(box.top);
        if (!byTop.has(key)) byTop.set(key, []);
        byTop.get(key)!.push({
          name: card.firstElementChild?.textContent?.slice(0, 40) ?? '?',
          height: Math.round(box.height),
        });
      }
      return [...byTop.values()];
    });
    console.log(`\n  What’s changed — ${rows.length} rows`);
    for (const row of rows) {
      for (const c of row) console.log(`    ${String(c.height).padStart(4)}px  ${c.name}`);
      const heights = row.map((c) => c.height);
      const spread = Math.max(...heights) - Math.min(...heights);
      expect(
        spread,
        `cards on one row differ by ${spread}px: ${row.map((c) => `${c.name}=${c.height}`).join(', ')}`,
      ).toBeLessThanOrEqual(2);
    }
    // Two across at this width, not three — so a card has room for its name.
    const columns = await page.evaluate(
      () => getComputedStyle(document.querySelector('#whats-changed .grid')!).gridTemplateColumns.split(' ').length,
    );
    expect(columns, 'What’s changed should be at most two cards across').toBeLessThanOrEqual(2);

    await ctx.close();
  });
});
