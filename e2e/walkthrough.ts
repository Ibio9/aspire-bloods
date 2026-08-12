import { expect, type Page } from '@playwright/test';

/**
 * PRESS THROUGH THE FIRST-SIGN-IN INTRODUCTION, if it is showing.
 *
 * A patient who has never seen it is sent to /welcome from "/", so any spec
 * that registers a NEW account and then waits for the Overview greeting is
 * waiting for a screen that is several presses away. Pressing through is what
 * a real first-time patient does, and it also marks it seen — so everything
 * after this behaves exactly as it did before the walkthrough existed.
 *
 * IT IS A SEQUENCE NOW (Aug 2026), which is why this is one helper rather than
 * the line `page.getByRole('button', { name: 'Go to my results' }).click()`
 * repeated in five specs. That line was true while the page was one long
 * document with one button at the foot of it; it is now true only on the last
 * step, and five copies of it failed at once.
 *
 * Walking the steps rather than pressing Skip, deliberately: Skip is one click
 * and exercises nothing, and this is the only coverage the sequence gets from
 * the specs that merely need to be past it.
 */
export async function pressThroughWalkthrough(page: Page, greeting: RegExp): Promise<void> {
  const heading = page.getByRole('heading', { name: greeting });
  const finish = page.getByRole('button', { name: 'Go to my results' });
  const next = page.getByRole('button', { name: 'Continue' });

  // Wait for EITHER screen before deciding. Checking visibility the instant the
  // code is typed is a race against the redirect, and it loses.
  await expect(next.or(finish).or(heading)).toBeVisible({ timeout: 15000 });

  // Bounded rather than `while (visible)`: a step that stopped advancing would
  // otherwise spin until the whole spec timed out with nothing to say.
  for (let i = 0; i < 10 && (await next.isVisible().catch(() => false)); i += 1) {
    await next.click();
  }
  if (await finish.isVisible().catch(() => false)) await finish.click();
  await expect(heading).toBeVisible({ timeout: 15000 });
}
