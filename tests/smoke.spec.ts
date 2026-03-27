import { test, expect } from '@playwright/test';

test('home redirects to default country', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/se\/?$/);
});

test('Swedish race list shell renders', async ({ page }) => {
  await page.goto('/se/loppkalender/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('race-split')).toBeVisible();
  await expect(page.locator('.race-card').first()).toBeVisible();
  await expect(page.locator('.race-card .more-info-button').first()).toBeVisible();
});

test('English race list shell renders', async ({ page }) => {
  await page.goto('/se/en/race-calendar/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
