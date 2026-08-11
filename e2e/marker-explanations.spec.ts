import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Two promises about marker copy, checked against the rendered product rather
 * than against the source, because both of them are about what a patient sees.
 *
 * 1. NO PLACEHOLDER. Every marker has a real explanation. The product used to
 *    tell people that the wording for their marker was still being finalised,
 *    on a report costing up to £2,112, and that sentence must not come back.
 *
 * 2. NO VISIBLE DIFFERENCE BETWEEN REVIEWED AND UNREVIEWED COPY. Whether a
 *    clinician has read a particular wording is recorded, audited and shown in
 *    the admin review queue. It is an internal editorial fact and the patient
 *    portal must not leak it: no badge, no warning, no dimmed text, no extra
 *    element, and not so much as a field on the JSON.
 *
 * The second is the one worth having a test for. It cannot be asserted from
 * the patient side alone, since the patient payload deliberately has no review
 * status on it, so this signs in as an admin to learn which markers are DRAFT
 * and which are not, then signs in as the patient and compares how the two
 * render.
 *
 * Requires EXPOSE_DEV_OTP_CODE=true and the dev seed's admin and demo accounts.
 */

const DEMO_EMAIL = process.env.SEED_DEMO_EMAIL ?? 'demo.showcase@aspireshield.dev';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'DemoShowcase123!';
const ADMIN_EMAIL = 'admin@aspireshield.dev';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'DevAdminPass123!';

/** Assembled, so the string this file forbids never appears in this file. */
const PLACEHOLDER = ['An explanation for this marker is', 'being finalised'].join(' ');

async function signIn(request: APIRequestContext, email: string, password: string) {
  const login = await request.post('/api/auth/login', { data: { email, password } });
  expect(login.ok(), `${email} could not sign in`).toBeTruthy();
  const body = await login.json();
  if (body.status === 'authenticated') return;
  const otp = await request.post('/api/auth/otp/verify', {
    data: { challengeId: body.challengeId, code: body.devOtpCode, trustDevice: false },
  });
  expect(otp.ok(), `${email} could not complete 2FA`).toBeTruthy();
}

interface LibraryEntry {
  markerId: string;
  name: string;
  resultType?: string;
  explanation: { whatItIs: string; highMeans: string | null };
}

/** Expand a library card by its marker name and return the panel that opens. */
async function openCard(page: Page, name: string) {
  const button = page.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  // Attribute selector rather than "#id": React's useId emits ":r3:", which is
  // a valid id and not a valid CSS id selector.
  const panelId = await button.getAttribute('aria-controls');
  return page.locator(`[id="${panelId}"]`);
}

test('every marker in the library has real copy, and none of it is a placeholder', async ({ browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext();
  await signIn(ctx.request, DEMO_EMAIL, DEMO_PASSWORD);

  const entries = (await (await ctx.request.get('/api/patient/library')).json()) as LibraryEntry[];
  expect(entries.length, 'the library should carry the whole catalogue').toBeGreaterThan(400);

  // Every entry has copy, and it is a written sentence rather than a stub. The
  // floor is deliberately low: the older clinician-reviewed copy is terser than
  // anything written since ("Cells that make up your immune system and fight
  // infection.") and terse is not the same fault as absent.
  const stubs = entries.filter(
    (e) => !e.explanation?.whatItIs || e.explanation.whatItIs.trim().length < 30 || !e.explanation.whatItIs.trim().endsWith('.'),
  );
  expect(stubs.map((e) => e.name)).toEqual([]);
  const placeheld = entries.filter((e) => e.explanation.whatItIs.includes('being finalised'));
  expect(placeheld.map((e) => e.name)).toEqual([]);

  // All five result types are represented, so this is not passing because the
  // library quietly stopped listing the food, genetic or qualitative items.
  const types = new Set(entries.map((e) => e.resultType ?? 'MEASURED'));
  expect([...types].sort()).toEqual(['COMPOSITION', 'GENETIC', 'MEASURED', 'QUALITATIVE', 'SENSITIVITY']);

  // And nothing internal rides along on the payload.
  expect(JSON.stringify(entries)).not.toContain('reviewStatus');
  expect(JSON.stringify(entries)).not.toContain('DRAFT');

  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/library');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText(PLACEHOLDER)).toHaveCount(0);

  await ctx.close();
});

test('a patient cannot tell reviewed copy from unreviewed copy', async ({ browser }) => {
  test.setTimeout(180_000);

  // --- Admin: find one marker of each review state that the library lists ---
  const adminCtx = await browser.newContext();
  await signIn(adminCtx.request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const rows = (await (await adminCtx.request.get('/api/panels/markers/explanations')).json()) as {
    markerId: string;
    markerName: string;
    hasExplanation: boolean;
    reviewStatus: 'DRAFT' | 'REVIEWED' | 'PUBLISHED';
  }[];
  await adminCtx.close();

  const withCopy = rows.filter((r) => r.hasExplanation);
  const drafts = withCopy.filter((r) => r.reviewStatus === 'DRAFT');
  const signedOff = withCopy.filter((r) => r.reviewStatus !== 'DRAFT');
  expect(drafts.length, 'no draft copy exists, so this test would prove nothing').toBeGreaterThan(0);
  expect(signedOff.length, 'no reviewed copy exists, so there is nothing to compare against').toBeGreaterThan(0);

  // --- Patient: both must render the same way ---
  const ctx = await browser.newContext();
  await signIn(ctx.request, DEMO_EMAIL, DEMO_PASSWORD);
  const entries = (await (await ctx.request.get('/api/patient/library')).json()) as LibraryEntry[];
  const listed = new Map(entries.map((e) => [e.markerId, e]));

  const draft = drafts.find((r) => listed.has(r.markerId));
  const reviewed = signedOff.find((r) => listed.has(r.markerId));
  expect(draft, 'expected at least one draft marker in the library').toBeTruthy();
  expect(reviewed, 'expected at least one reviewed marker in the library').toBeTruthy();

  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto('/library');
  await page.waitForLoadState('networkidle');

  // Presentation, not structure. Two entries legitimately differ in shape when
  // one has "if it's high" copy and the other does not, and that is true of two
  // reviewed markers as much as of a reviewed and a draft one. What must not
  // differ is how the copy is dressed: the same wrapper, the same prose
  // container, the same type colour, and nothing extra hung off either.
  const shapes: Record<string, { wrapper: string; prose: string; lede: string; colour: string; extras: string[] }> = {};
  for (const [label, row] of [
    ['draft', draft!],
    ['reviewed', reviewed!],
  ] as const) {
    await page.getByLabel('Find a marker').fill(listed.get(row.markerId)!.name);
    await page.waitForTimeout(250);
    const panel = await openCard(page, listed.get(row.markerId)!.name);

    shapes[label] = await panel.evaluate((el) => {
      const prose = el.querySelector('div')!;
      const lede = prose.querySelector('p')!;
      // Anything that is not the prose block or the "see your own results"
      // link: a badge, a banner or a marginal note would land here.
      const extras = [...el.children]
        .filter((c) => c !== prose && c.tagName !== 'A')
        .map((c) => `${c.tagName}.${c.className}`);
      return {
        wrapper: el.className,
        prose: prose.className,
        lede: lede.className,
        colour: getComputedStyle(lede).color,
        extras,
      };
    });

    await page.getByLabel('Find a marker').fill('');
    await page.waitForTimeout(150);
  }

  expect(shapes.draft.wrapper, 'draft copy sits in a different container').toBe(shapes.reviewed.wrapper);
  expect(shapes.draft.prose, 'draft copy uses a different prose block').toBe(shapes.reviewed.prose);
  expect(shapes.draft.lede, 'draft copy is styled differently from reviewed copy').toBe(shapes.reviewed.lede);
  expect(shapes.draft.colour, 'draft copy is a different colour from reviewed copy').toBe(shapes.reviewed.colour);
  expect(shapes.draft.extras, 'draft copy carries an element reviewed copy does not').toEqual([]);
  expect(shapes.reviewed.extras, 'reviewed copy carries an element draft copy does not').toEqual([]);

  // Nothing anywhere on the page announces an editorial state.
  const body = (await page.locator('body').innerText()).toLowerCase();
  for (const leak of ['draft', 'not yet reviewed', 'awaiting review', 'pending review', 'being finalised']) {
    expect(body, `the library says "${leak}" to a patient`).not.toContain(leak);
  }

  await ctx.close();
});
