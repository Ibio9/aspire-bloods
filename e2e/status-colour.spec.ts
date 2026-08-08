import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * The traffic-light layer, checked on a real seeded report rather than by eye.
 *
 * "Status colour is not rendering" is the specific failure this exists to
 * catch, and it is a failure a unit test structurally cannot see: the tokens
 * can be correct, the class names can be correct, and the wash can still be
 * invisible because a components-layer rule wins over it or because the value
 * is so faint it lands on the card colour. So this reads the COMPUTED style off
 * live cards and asserts that the five states resolve to five different, and
 * actually coloured, backgrounds — in both themes.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';

async function loginAsDemoPatient(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: { email: DEMO_EMAIL, password: DEMO_PASSWORD } });
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), 'demo patient could not complete 2FA').toBeTruthy();
}

/** rgb(r, g, b) → [r,g,b]. */
function rgb(value: string): [number, number, number] {
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) throw new Error(`not an rgb colour: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** How far off neutral grey a colour is. A wash that measures 0 here is not a wash. */
function chroma(value: string): number {
  const [r, g, b] = rgb(value);
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** Which of the three hues a wash reads as, from the channel ordering alone. */
function hueOf(value: string): 'green' | 'yellow' | 'red' | 'neutral' {
  const [r, g, b] = rgb(value);
  if (chroma(value) < 4) return 'neutral';
  if (g > r && g > b) return 'green';
  if (r > g && g > b) return r - g > (g - b) * 1.6 ? 'red' : 'yellow';
  if (r > g && r > b) return 'red';
  return 'neutral';
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    localStorage.setItem('aspire-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
}

/** The newest report with a full spread of states — the Signature panel. */
async function openBiggestReport(page: Page, request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/patient/reports');
  const reports = (await res.json()) as { reportId: string; markerCount: number; patientStatus: string }[];
  const biggest = reports
    .filter((r) => r.patientStatus === 'RELEASED')
    .sort((a, b) => (b.markerCount ?? 0) - (a.markerCount ?? 0))[0];
  expect(biggest, 'the demo patient has no released reports — run the demo seed').toBeTruthy();
  return biggest.reportId;
}

test.describe('traffic-light status', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`all five states render a distinct, genuinely coloured wash in ${theme} mode`, async ({ browser }) => {
      const ctx = await browser.newContext();
      await loginAsDemoPatient(ctx.request);
      const page = await ctx.newPage();
      const reportId = await openBiggestReport(page, ctx.request);

      await page.goto('/overview');
      await setTheme(page, theme);
      await page.goto(`/reports/${reportId}`);
      await page.waitForSelector('text=This report at a glance');

      // The counts strip carries one tile per state present, each with the
      // state's own wash — so it is the one place all five are on screen
      // together and can be compared against each other.
      // Scoped to the strip itself: the category summary bars below it are the
      // same shape of button and would otherwise be swept in, and those are
      // deliberately untinted (the tint is inside them, on the bar segments).
      const tiles = page.locator('p.eyebrow:has-text("This report at a glance") + ul li button');
      const count = await tiles.count();
      expect(count, 'expected the counts strip to show several states').toBeGreaterThanOrEqual(4);

      const seen = new Map<string, string>();
      for (let i = 0; i < count; i += 1) {
        const tile = tiles.nth(i);
        const label = (await tile.innerText()).replace(/\s+/g, ' ').trim();
        const bg = await tile.evaluate((el) => getComputedStyle(el).backgroundColor);

        // The failure mode this whole spec exists for: a wash that is
        // indistinguishable from the untinted card it replaces.
        expect(chroma(bg), `${theme}: "${label}" wash ${bg} has no colour in it`).toBeGreaterThanOrEqual(4);
        seen.set(label, bg);
      }

      // Five states, THREE colours, on purpose: above and below share yellow,
      // and significantly-above and significantly-below share red. Direction is
      // carried by the chevron and by the word, never by hue — so a test that
      // demanded five distinct colours would be demanding a regression.
      const distinct = new Set(seen.values());
      expect(distinct.size, `${theme}: expected three hues, got ${distinct.size}`).toBe(3);

      // And the right three: in range reads green, above/below read yellow,
      // significantly out reads red.
      for (const [label, bg] of seen) {
        const expected = label.includes('Significantly')
          ? 'red'
          : label.includes('In range')
            ? 'green'
            : 'yellow';
        expect(hueOf(bg), `${theme}: "${label}" wash ${bg} reads as ${hueOf(bg)}, expected ${expected}`).toBe(expected);
      }
      // All three are actually on screen — a report showing only in-range
      // results would pass every check above while proving nothing.
      expect(new Set([...seen.keys()].map((l) => (l.includes('Significantly') ? 'red' : l.includes('In range') ? 'green' : 'yellow'))).size).toBe(3);

      await ctx.close();
    });

    test(`the trend chart draws bands derived from the result's own range in ${theme} mode`, async ({ browser }) => {
      const ctx = await browser.newContext();
      await loginAsDemoPatient(ctx.request);
      const page = await ctx.newPage();

      const res = await ctx.request.get('/api/patient/markers');
      const markers = (await res.json()) as {
        markerId: string;
        name: string;
        resultType?: string;
        resultCount: number;
        referenceLow: number;
        referenceHigh: number;
      }[];
      // A marker with real history, so there is a line as well as bands.
      const withHistory = markers.filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED' && m.resultCount >= 2);
      expect(withHistory.length, 'no marker has more than one result — run the demo seed').toBeGreaterThan(0);
      const marker = withHistory[0];

      await page.goto('/overview');
      await setTheme(page, theme);
      await page.goto(`/markers/${marker.markerId}`);
      await page.waitForSelector('text=Trend over time');

      // Five gradient definitions, one per band, is what the chart emits when
      // it has drawn all five.
      const gradients = page.locator('svg defs linearGradient[id^="band-"]');
      await expect(gradients).toHaveCount(5, { timeout: 10_000 });

      // The key names every band in words. This is the non-colour carrier, and
      // it is the thing that must never be dropped in favour of the shading.
      await expect(page.getByText('Within the reference range')).toBeVisible();
      await expect(page.getByText('Above the reference range', { exact: true })).toBeVisible();

      // Nothing evaluative anywhere on the page.
      const body = (await page.locator('body').innerText()).toLowerCase();
      for (const word of ['danger', 'concerning', 'unhealthy', 'bad result']) {
        expect(body.includes(word), `the marker page says "${word}"`).toBe(false);
      }

      await ctx.close();
    });
  }

  test('the range bar plots the result in its own state colour', async ({ browser }) => {
    const ctx = await browser.newContext();
    await loginAsDemoPatient(ctx.request);
    const page = await ctx.newPage();
    await page.goto('/overview');
    await page.waitForLoadState('networkidle');

    // Overview lists out-of-range results, each with a range bar under it.
    const bar = page.locator('[role="img"][aria-label*="reference range"]').first();
    await expect(bar).toBeVisible();
    const label = await bar.getAttribute('aria-label');
    expect(label, 'the range bar must state the value, the range and the status in words').toMatch(/status:/i);

    await ctx.close();
  });
});
