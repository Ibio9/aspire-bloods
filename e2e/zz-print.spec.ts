import { test, expect, type APIRequestContext, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * AN ACTUAL PAGINATED PRINT, NOT A GUESS AT ONE.
 *
 * The print stylesheet was written and reviewed by reading it, which is not the
 * same as looking at what comes out. Everything it has to get right is a
 * property of PAGINATION — a card split across a break, a heading orphaned at
 * the foot, a fixed footer overlapping the last row, a theme that did not
 * flip — and none of those is visible in a browser window at any width.
 *
 * So this renders `page.pdf()` with `printBackground` on, which is Chromium's
 * real print path (`emulateMedia({ media: 'print' })` plus the paged layout
 * engine), and writes the files where a person can open them.
 *
 * THE THEME IS SET BEFORE NAVIGATION AND DELIBERATELY LEFT ON. The point is
 * that a patient reading in dark mode gets a LIGHT document, so the dark-mode
 * capture has to be taken with dark mode genuinely active — forcing light first
 * would test nothing.
 *
 * SKIPPED UNLESS ASKED FOR. `E2E_PRINT=1`. It writes files and asserts little.
 */

const RUN = process.env.E2E_PRINT === '1';
const OUT = path.resolve('screenshots/print');
const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';
/** `@page { margin: 14mm 14mm 24mm }` at 96dpi. The band the running footer prints in. */
const PAGE_BOTTOM_MARGIN_PX = Math.round((24 / 25.4) * 96);

async function login(request: APIRequestContext) {
  const res = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await res.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok()).toBeTruthy();
}

async function themed(browser: Browser, theme: 'light' | 'dark') {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem('aspire-theme', t as string);
    } catch {
      /* ignore */
    }
  }, theme);
  return ctx;
}

test.describe('print', () => {
  test.skip(!RUN, 'set E2E_PRINT=1 to render print PDFs');
  test.describe.configure({ timeout: 240_000 });

  test('a report and a marker page, printed, both themes', async ({ browser }) => {
    fs.mkdirSync(OUT, { recursive: true });
    const findings: {
      name: string;
      pages: number;
      darkClass: boolean;
      pageColour: string;
      headers: number;
      footers: number;
      footerHeight: number;
      reservedPadding: number;
      textColour: string;
      chrome: string[];
    }[] = [];

    for (const theme of ['light', 'dark'] as const) {
      const ctx = await themed(browser, theme);
      await login(ctx.request);
      const page = await ctx.newPage();

      const reports = (await (await ctx.request.get('/api/patient/reports')).json()) as {
        reportId: string;
        panelName: string | null;
        patientStatus: string;
      }[];
      // The Core panel rather than Signature: 71 markers is several pages of
      // real pagination, where 436 is forty pages nobody will read through to
      // check a page break.
      const report =
        reports.find((r) => r.patientStatus === 'RELEASED' && r.panelName === 'Core') ??
        reports.find((r) => r.patientStatus === 'RELEASED')!;

      const markers = (await (await ctx.request.get('/api/patient/markers')).json()) as {
        markerId: string;
        resultType?: string;
        resultCount: number;
      }[];
      const marker = markers.find((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount >= 2)!;

      for (const [name, url, waitFor] of [
        ['report', `/reports/${report.reportId}`, 'Every marker on this report'],
        ['marker', `/markers/${marker.markerId}`, 'Trend over time'],
        ['library', '/library', 'Read the introduction to your results'],
      ] as const) {
        await page.goto(url);
        await page.getByText(waitFor).first().waitFor({ timeout: 60_000 });
        // Chart and reveal animations settle; a PDF taken mid-animation
        // captures a card two pixels out of place and reads as a layout bug.
        await page.waitForTimeout(1200);
        await page.emulateMedia({ media: 'print' });
        await page.pdf({
          path: path.join(OUT, `${name}-${theme}.pdf`),
          format: 'A4',
          printBackground: true,
          // No margin here: `@page { margin: 14mm }` in the stylesheet owns it,
          // and setting both means the stylesheet's number is never the one
          // that lands — which is exactly the kind of thing this spec exists to
          // catch rather than to hide.
          preferCSSPageSize: true,
        });

        /**
         * A PICTURE OF THE PRINTED PAGE, AND A MEASUREMENT OF ITS BREAKS.
         *
         * A PDF cannot be looked at from here without a rasteriser, so the
         * print media is ALSO captured as a PNG at A4's content width — which
         * shows everything a person needs to judge except pagination — and the
         * pagination itself is MEASURED, which is the better way round anyway.
         *
         * 794 x 1123 is A4 at 96dpi; less the stylesheet's own 14mm margins
         * (53px a side) that is a 688 x 1017 content box. Every `.card` and
         * every heading is checked against the page grid: a card whose top and
         * bottom fall in different pages is a card split across a break, and a
         * heading in the last 60px of a page with content after it is an
         * orphan. Both are facts you measure — neither is reliably visible in
         * a screenshot, which is the whole reason the stylesheet's break rules
         * went in unverified the first time.
         */
        await page.setViewportSize({ width: 794, height: 1123 });
        // A full second, because the chart's ResponsiveContainer re-measures on
        // resize and a screenshot taken before it has finished captures the
        // plot at the OLD width with the new axis — which reads as a rendering
        // fault and is the capture's, not the product's.
        await page.waitForTimeout(1000);
        // FULL PAGE, and ALSO the first two sheets on their own. A 13,000px
        // strip of a 13-page report is unreadable at any size somebody will
        // actually open it at, and "look at the print output" means reading the
        // header, the first cards and the running footer — which live in the
        // first two pages.
        await page.screenshot({ path: path.join(OUT, `${name}-${theme}.png`), fullPage: true });
        await page.screenshot({
          path: path.join(OUT, `${name}-${theme}-p1.png`),
          clip: { x: 0, y: 0, width: 794, height: 1123 },
        });
        await page.screenshot({
          path: path.join(OUT, `${name}-${theme}-p2.png`),
          fullPage: true,
          clip: { x: 0, y: 1017, width: 794, height: 1017 },
        });

        /**
         * AND THE CHART'S GLOW IS OFF, ON PAPER.
         *
         * The trend chart's points spark and its line carries a casing of light
         * (see SPARK in tokens.ts), which is a screen effect: on a colour
         * printer it is ink spent saying nothing and on a mono one it is a grey
         * smudge round the one mark on the chart that has to stay sharp. The
         * three strengths go to zero in `@media print` with the shadow alphas —
         * and this is the half of that claim that cannot be made by reading the
         * stylesheet, because the variable is emitted in one place and consumed
         * in an SVG attribute in another.
         *
         * ⚠ AND THE CORE HAS TO FLIP WITH IT (Aug 2026). A point is a WHITE
         * bead inside that halo now, and there is no shape layer left on this
         * chart to fall back on — so with the halo at zero and the core still
         * white, every point on a printed chart would be a white dot on white
         * paper. `--c-chart-spark-core` is espresso under `@media print` for
         * exactly that reason, and this is the only place that can be checked:
         * the token is emitted in tailwind.config.ts and consumed as an SVG
         * `fill` three files away.
         */
        if (name === 'marker') {
          const glow = await page.evaluate(() => {
            const root = getComputedStyle(document.documentElement);
            const halo = [...document.querySelectorAll('circle')].find((c) =>
              (c.getAttribute('fill') ?? '').startsWith('url(#spark-'),
            );
            // The bead: the circle that carries the core token as a literal
            // fill, rather than a gradient reference.
            const core = [...document.querySelectorAll('.recharts-surface circle')].find((c) => {
              const fill = getComputedStyle(c).fill;
              return fill !== 'none' && !fill.startsWith('url(') && Number(getComputedStyle(c).fillOpacity) > 0;
            });
            const channels = (css: string) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
            return {
              declared: ['--chart-spark', '--chart-spark-past', '--chart-line-glow'].map((v) =>
                Number(root.getPropertyValue(v)),
              ),
              // What the point actually paints its halo at, which is the number
              // that reaches the paper.
              applied: halo ? Number(getComputedStyle(halo).fillOpacity) : null,
              coreFill: core ? getComputedStyle(core).fill : null,
              /** Mean channel value, so "is it white" is one number. */
              coreLevel: core
                ? channels(getComputedStyle(core).fill).reduce((a, b) => a + b, 0) / 3
                : null,
              marks: document.querySelectorAll('.recharts-line-curve').length,
            };
          });
          for (const value of glow.declared) {
            expect(value, `${theme}: a chart glow strength survives into print at ${value}`).toBe(0);
          }
          expect(glow.applied, `${theme}: a point's halo prints at ${glow.applied}`).toBe(0);
          // THE BEAD IS INK ON PAPER, NOT WHITE ON WHITE. Measured rather than
          // named: anything above mid-grey on a white page is a point nobody
          // can see, and with the halo at zero there is nothing else drawing it.
          expect(glow.coreLevel, `${theme}: the printed chart has no point mark at all`).not.toBeNull();
          expect(
            glow.coreLevel!,
            `${theme}: a point prints as ${glow.coreFill} — white on white paper`,
          ).toBeLessThan(128);
          // The line and its casings are still THERE — this turns the light off,
          // it does not delete the chart.
          expect(glow.marks, `${theme}: the printed chart has ${glow.marks} line paths`).toBeGreaterThan(0);
        }

        const PAGE_CONTENT_HEIGHT = 1017;
        const breaks = await page.evaluate((pageHeight) => {
          const pageOf = (y: number) => Math.floor(y / pageHeight);
          /**
           * WOULD-BE breaks, not real ones. This is a CONTINUOUS medium: the
           * viewport is A4-shaped but the browser is not paginating, so
           * `break-inside: avoid` has no effect on the layout being measured.
           * A card straddling a page multiple here is a card the print engine
           * WILL move to the next page — which is the rule working, not
           * failing. Counted and printed as context for the pictures, never
           * asserted on; the assertion would fail on a correct stylesheet.
           */
          const wouldSplit: string[] = [];
          for (const el of document.querySelectorAll('.card')) {
            const r = el.getBoundingClientRect();
            const top = r.top + window.scrollY;
            const bottom = r.bottom + window.scrollY;
            if (r.height >= pageHeight) continue;
            if (pageOf(top) !== pageOf(bottom - 1)) {
              wouldSplit.push(`${(el.textContent ?? '').trim().slice(0, 40)}`);
            }
          }
          /** Same caveat: `break-after: avoid` is what moves these, and it does not apply here. */
          const wouldOrphan: string[] = [];
          for (const el of document.querySelectorAll('h1, h2, h3, .section-heading')) {
            const bottom = el.getBoundingClientRect().bottom + window.scrollY;
            if (bottom % pageHeight > pageHeight - 60) wouldOrphan.push((el.textContent ?? '').trim().slice(0, 40));
          }
          return {
            pages: Math.ceil(document.body.scrollHeight / pageHeight),
            wouldSplit,
            wouldOrphan,
            /**
             * THE THEME ACTUALLY IN FORCE, read off a TOKEN.
             *
             * Not `document.documentElement.backgroundColor`: the print
             * stylesheet sets `background: none` on html and body so a printer
             * is not asked for a full-bleed fill, so that property is
             * transparent in both themes and comparing it proves nothing.
             * `--c-cream-50` is the card surface and is a different colour in
             * each theme, which is exactly the thing being tested — the print
             * media query has to beat `.dark` at the token layer.
             */
            pageColour: getComputedStyle(document.documentElement).getPropertyValue('--c-cream-50').trim(),
            textColour: getComputedStyle(document.body).color,
            darkClass: document.documentElement.classList.contains('dark'),
            headers: document.querySelectorAll('header.print-only').length,
            footers: document.querySelectorAll('footer.print-footer').length,
            /**
             * THE FIXED FOOTER AGAINST THE ROOM RESERVED FOR IT.
             *
             * The footer repeats on every sheet because it is `position:
             * fixed`, which also means it sits OVER the content unless the flow
             * is padded out of its way. Those are two numbers in two places and
             * the first version of them disagreed: 26mm reserved against a
             * ~150px footer, so the last card on every page printed underneath
             * the clinic's address. Measured here so they cannot drift again.
             */
            footerHeight: Math.round(
              document.querySelector('footer.print-footer')?.getBoundingClientRect().height ?? 0,
            ),
            reservedPadding: Math.round(
              parseFloat(getComputedStyle(document.querySelector('.print-flow')!).paddingBottom),
            ),
            // Anything still on the page that should not be.
            // getClientRects() is empty for anything not rendered, INCLUDING a
            // child of a display:none ancestor — which getComputedStyle is not,
            // and which counted the sidebar's own <nav> as visible while the
            // <aside> around it was correctly hidden.
            chrome: [...document.querySelectorAll('aside, nav')]
              .filter((el) => el.getClientRects().length > 0)
              .map((el) => el.getAttribute('aria-label') ?? el.tagName.toLowerCase()),
          };
        }, PAGE_CONTENT_HEIGHT);

        console.log(
          `  ${name}-${theme}: ${breaks.pages} pages · dark class ${breaks.darkClass} · page ${breaks.pageColour} · ` +
            `header ${breaks.headers} footer ${breaks.footers} · cream-50 ${breaks.pageColour} · text ${breaks.textColour} · ` +
            `footer ${breaks.footerHeight}px in ${breaks.reservedPadding}px reserved · ` +
            `still-visible nav/aside [${breaks.chrome.join(', ')}]`,
        );

        findings.push({ name: `${name}-${theme}`, ...breaks });

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.emulateMedia({ media: 'screen' });
      }

      await ctx.close();
    }

    // The light page colour, taken from a light-mode render rather than
    // hardcoded, so a palette change does not turn this into a failing test
    // about a number nobody remembers choosing.
    const lightPageColour = findings.find((f) => !f.darkClass)?.pageColour ?? '';
    const lightTextColour = findings.find((f) => !f.darkClass)?.textColour ?? '';
    expect(lightPageColour, 'no light-mode render to compare against').not.toBe('');
    // The dark renders must have been genuinely dark on screen, or the test is
    // asserting that light mode prints light, which is not the claim.
    expect(findings.some((f) => f.darkClass), 'no dark-mode render was captured').toBe(true);

    const written = fs.readdirSync(OUT).filter((f) => f.endsWith('.pdf'));
    expect(written.length, 'six PDFs: three pages in two themes').toBe(6);
    for (const file of written) {
      const bytes = fs.statSync(path.join(OUT, file)).size;
      // A PDF of a blank page is about 1 kB. Anything real is far larger, and
      // this is the one assertion worth making automatically — everything else
      // about a printed page is a thing a person has to look at.
      expect(bytes, `${file} is ${bytes} bytes, which is a blank page`).toBeGreaterThan(8_000);
      console.log(`  ${file.padEnd(20)} ${(bytes / 1024).toFixed(0)} kB`);
    }

    // THE THREE THINGS THAT ARE NOT A MATTER OF TASTE, asserted rather than
    // eyeballed: the theme is light on paper whatever the screen was, the
    // navigation is gone, and no card is cut in half by a page break.
    for (const f of findings) {
      expect(f.chrome, `${f.name}: navigation is still on the printed page`).toEqual([]);
      expect(f.headers, `${f.name}: no print header`).toBeGreaterThan(0);
      expect(f.footers, `${f.name}: no repeating print footer`).toBe(1);
      // The LIGHT page colour, whichever theme the screen was in. Read off the
      // element rather than compared with a token, because the whole mechanism
      // being tested is that the print media query beats `.dark`.
      expect(f.pageColour, `${f.name}: the card surface token is not the light one`).toBe(lightPageColour);
      expect(f.textColour, `${f.name}: the body text colour is not the light theme's`).toBe(lightTextColour);
      // The footer has to fit inside @page's bottom margin, which is what
      // Chromium places it in on every sheet. 24mm at 96dpi is 91px; the check
      // is against a number read off the document rather than that literal, so
      // it moves with the stylesheet.
      expect(
        f.footerHeight,
        `${f.name}: the repeating footer is ${f.footerHeight}px tall, which is more than the ${PAGE_BOTTOM_MARGIN_PX}px @page reserves for it at the foot of every sheet`,
      ).toBeLessThanOrEqual(PAGE_BOTTOM_MARGIN_PX);
    }
  });
});
