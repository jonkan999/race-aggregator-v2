import { test, expect } from '@playwright/test';

/**
 * Live legacy site — migration reference only.
 *
 * Run: `npm run test:e2e:legacy-ref` (no local web server; hits production or LEGACY_SITE_URL).
 *
 * Use this to compare behaviour and DOM against v2 during migration — not for asserting
 * pixel-perfect parity; prefer inspiration + improvements (performance, cost, a11y).
 *
 * Note: the legacy list puts `.filtered-out` on some cards (e.g. neighboring races);
 * always assert on a visible card.
 */

test.describe('Legacy production — race list reference', () => {
  test.describe.configure({ timeout: 120_000 });

  test('Swedish calendar: visible cards + full unpacked card chrome', async ({ page }) => {
    await page.goto('/loppkalender/', { waitUntil: 'load', timeout: 60_000 });
    const anyCard = page.locator('a.race-card:not(.filtered-out)').first();
    await expect(anyCard).toBeVisible();
    await expect(anyCard.locator('.race-name').first()).toBeVisible();

    const fullCard = page.locator('a.race-card:not(.filtered-out):not(.packed)').first();
    await expect(fullCard).toBeVisible();
    await expect(fullCard.locator('.more-info-button')).toBeVisible();
    await expect(fullCard.locator('.race-info-bottom')).toBeVisible();
  });

  test('English calendar: list loads', async ({ page }) => {
    await page.goto('/en/race-calendar/', { waitUntil: 'load', timeout: 60_000 });
    const card = page.locator('a.race-card:not(.filtered-out)').first();
    await expect(card).toBeVisible();
  });
});
