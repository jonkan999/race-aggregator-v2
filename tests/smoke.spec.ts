import { test, expect } from '@playwright/test';

test('home redirects to default country', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/loppkalender\/$/);
});

test('Swedish race list shell renders', async ({ page }) => {
  await page.goto('/loppkalender/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('race-split')).toBeVisible();
  await expect(page.locator('.race-card').first()).toBeVisible();
  await expect(page.locator('.race-card .more-info-button').first()).toBeVisible();
});

test('English race list shell renders', async ({ page }) => {
  await page.goto('/en/race-calendar/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('browse overview renders', async ({ page }) => {
  await page.goto('/loppkalender/bladdra-efter-kategori/');
  await expect(page.getByRole('heading', { level: 1, name: /bläddra bland alla lopp/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /10 km/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /danmark|norge|finland/i }).first()).toBeVisible();
});

test('category landing page renders prefiltered list', async ({ page }) => {
  await page.goto('/loppkalender/alla-lan/10-km/');
  await expect(page.getByRole('heading', { level: 1, name: /10 km/i })).toBeVisible();
  await expect(page.locator('.race-card').first()).toBeVisible();
});

test('category plus race type page renders', async ({ page }) => {
  await page.goto('/loppkalender/alla-lan/trail/halvmarathon/');
  await expect(page.locator('.race-card').first()).toBeVisible();
});

test('county browse page renders', async ({ page }) => {
  await page.goto('/loppkalender/dalarna/');
  await expect(page.locator('.race-card').first()).toBeVisible();
});

test('month browse page renders', async ({ page }) => {
  await page.goto('/loppkalender/april/');
  await expect(page.locator('.race-card').first()).toBeVisible();
});

test('type browse page renders', async ({ page }) => {
  await page.goto('/loppkalender/alla-lan/landsvag/');
  await expect(page.locator('.race-card').first()).toBeVisible();
});

test('city browse page renders', async ({ page }) => {
  await page.goto('/loppkalender/stader/stockholm/');
  await expect(page.locator('.race-card').first()).toBeVisible();
});

test('neighboring browse page renders', async ({ page }) => {
  await page.goto('/loppkalender/narliggande-lander/');
  await expect(page.getByRole('heading', { level: 1, name: /närliggande länder/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /danmark|norge|finland/i }).first()).toBeVisible();
});

test('newsletter popup can be opened on the Swedish race list', async ({ page }) => {
  await page.goto('/loppkalender/');
  await page.waitForFunction(() => (window as typeof window & { __raceAggregatorNewsletterPopupReady?: boolean }).__raceAggregatorNewsletterPopupReady === true);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('race-aggregator:open-newsletter-popup'));
  });

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByPlaceholder(/din e-postadress/i)).toBeVisible();
  await expect(dialog.getByRole('button', { name: /ge mig uppdateringarna/i })).toBeVisible();
});

test('newsletter popup on race detail references the current race', async ({ page }) => {
  await page.goto('/loppkalender/');
  await page.waitForFunction(() => (window as typeof window & { __raceAggregatorNewsletterPopupReady?: boolean }).__raceAggregatorNewsletterPopupReady === true);
  const firstRaceCard = page.locator('.race-card').first();
  const raceHref = await firstRaceCard.getAttribute('href');
  await expect(firstRaceCard).toBeVisible();
  expect(raceHref).toBeTruthy();

  await page.goto(raceHref!);
  const raceName = (await page.getByRole('heading', { level: 1 }).textContent())?.trim() ?? '';
  expect(raceName).not.toBe('');
  await page.waitForFunction(() => (window as typeof window & { __raceAggregatorNewsletterPopupReady?: boolean }).__raceAggregatorNewsletterPopupReady === true);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('race-aggregator:open-newsletter-popup'));
  });

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(raceName);
});
