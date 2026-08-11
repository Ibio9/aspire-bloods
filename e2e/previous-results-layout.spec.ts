import { test, expect, type Locator } from '@playwright/test';

/**
 * The previous-results rows, measured rather than eyeballed.
 *
 * The bug this exists for was not subtle and shipped anyway: on the marker
 * page's left card the date and the value were drawn ON TOP OF EACH OTHER —
 * "19 August 2026" and "102 mmol/L" overlapping into one unreadable smear — and
 * a row carrying a long unit ran past the bottom edge of the card entirely. The
 * cause was a flex row with `justify-between`, a `shrink-0` date and a
 * `min-w-0` group holding the value and the status badge: `min-w-0` gives that
 * group permission to shrink past its own contents, at which point its children
 * paint outside it and over whatever is next to them.
 *
 * Reading a screenshot would not have caught it and did not. Two boxes
 * overlapping is a geometric fact, so it is asserted geometrically: no two cells
 * in a row may intersect, and nothing may paint outside the card.
 *
 * The fixture is in the dev component showcase rather than on a real marker
 * page, because the worst case has to be GUARANTEED rather than hoped for — it
 * needs the longest month name, a four-character value, the widest unit in the
 * catalogue and the longest status label in one row, at the narrowest width the
 * component is ever rendered at, and no demo patient reliably has that.
 */

const NARROW = '[data-testid="previous-results-narrow"]';
const WIDE = '[data-testid="previous-results-wide"]';

/** Do two boxes share any area at all? */
function intersects(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function boxesOf(cells: Locator) {
  const n = await cells.count();
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const box = await cells.nth(i).boundingBox();
    if (box) out.push({ ...box, text: (await cells.nth(i).innerText()).replace(/\s+/g, ' ').trim() });
  }
  return out;
}

test.describe('Previous results rows', () => {
  // DEV-only route, which is what the e2e stack runs against.
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/components');
    await expect(page.locator(NARROW)).toBeVisible({ timeout: 15_000 });
  });

  for (const [label, selector] of [
    ['narrowest card', NARROW],
    ['wide card', WIDE],
  ] as const) {
    test(`no cell overlaps another at the ${label}`, async ({ page }) => {
      const rows = page.locator(`${selector} .value-row`);
      const rowCount = await rows.count();
      expect(rowCount, 'the fixture must render rows at all').toBeGreaterThan(1);

      for (let i = 0; i < rowCount; i += 1) {
        const cells = await boxesOf(rows.nth(i).locator(':scope > *'));
        expect(cells.length, `row ${i} should have a date, a value and a status`).toBe(3);
        for (let a = 0; a < cells.length; a += 1) {
          for (let b = a + 1; b < cells.length; b += 1) {
            expect(
              intersects(cells[a], cells[b]),
              `${label} row ${i}: "${cells[a].text}" overlaps "${cells[b].text}"`,
            ).toBe(false);
          }
        }
      }
    });

    test(`nothing paints outside the card at the ${label}`, async ({ page }) => {
      const card = page.locator(`${selector} .card`);
      const cardBox = (await card.boundingBox())!;
      const cells = await boxesOf(page.locator(`${selector} .value-row > *`));
      expect(cells.length).toBeGreaterThan(0);
      for (const cell of cells) {
        // A 1px tolerance for subpixel rounding, and no more.
        expect(cell.x, `"${cell.text}" starts left of the card`).toBeGreaterThanOrEqual(cardBox.x - 1);
        expect(cell.x + cell.width, `"${cell.text}" runs past the right edge`).toBeLessThanOrEqual(
          cardBox.x + cardBox.width + 1,
        );
        expect(cell.y + cell.height, `"${cell.text}" runs past the bottom edge`).toBeLessThanOrEqual(
          cardBox.y + cardBox.height + 1,
        );
      }
    });

    test(`every row is the same height at the ${label}`, async ({ page }) => {
      // The status word is the longest string in the row and its length varies
      // by four times between "In range" and "Significantly above range". If a
      // row's height moved with it, the column of numbers would stop being a
      // column.
      const rows = page.locator(`${selector} .value-row`);
      const heights: number[] = [];
      for (let i = 0; i < (await rows.count()); i += 1) {
        const box = await rows.nth(i).boundingBox();
        if (box) heights.push(Math.round(box.height));
      }
      expect(new Set(heights).size, `row heights: ${heights.join(', ')}`).toBe(1);
    });
  }

  test('the value column is a column: every value ends on the same x', async ({ page }) => {
    // The whole reason the list is a list rather than a chart. Read down, the
    // numbers line up; a right edge that wanders by more than a pixel means
    // they do not.
    const values = await boxesOf(page.locator(`${NARROW} .value-row-value`));
    expect(values.length).toBeGreaterThan(1);
    const rightEdges = values.map((v) => Math.round(v.x + v.width));
    expect(new Set(rightEdges).size, `right edges: ${rightEdges.join(', ')}`).toBe(1);
  });

  test('the narrow card wraps to two lines and the wide one does not', async ({ page }) => {
    // The arrangement is chosen by a container query on the LIST, so all rows
    // switch together — which is what keeps the heights uniform above.
    const narrowRow = (await page.locator(`${NARROW} .value-row`).first().boundingBox())!;
    const wideRow = (await page.locator(`${WIDE} .value-row`).first().boundingBox())!;
    expect(narrowRow.height, 'the narrow row should be two lines tall').toBeGreaterThan(wideRow.height);

    // And in the wide arrangement the status sits beside the value, not under it.
    const wideValue = (await page.locator(`${WIDE} .value-row-value`).first().boundingBox())!;
    const wideStatus = (await page.locator(`${WIDE} .value-row-status`).first().boundingBox())!;
    expect(wideStatus.x).toBeGreaterThan(wideValue.x + wideValue.width - 1);
  });
});
