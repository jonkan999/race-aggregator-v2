import { test, expect } from '@playwright/test';
import { getGoogleAdsConfig } from '../src/lib/googleAds';

test('google ads stay off for Sweden and other non-flagged markets', () => {
  expect(getGoogleAdsConfig('se').enabled).toBe(false);
  expect(getGoogleAdsConfig('cz').enabled).toBe(false);
  expect(getGoogleAdsConfig('gr').enabled).toBe(false);
  expect(getGoogleAdsConfig('nl').enabled).toBe(false);
  expect(getGoogleAdsConfig('se').client).toBeNull();
});

test('google ads are on for flagged markets with the shared public client', () => {
  const flagged = ['fi', 'lt', 'dk', 'ee', 'de', 'pl'] as const;

  for (const code of flagged) {
    const ads = getGoogleAdsConfig(code);
    expect(ads.enabled, code).toBe(true);
    expect(ads.client, code).toBe('ca-pub-7076760775175370');
    expect(ads.publisherId, code).toBe('pub-7076760775175370');
  }
});

test('Swedish built pages do not include the Google ads or consent pipeline', async ({ page }) => {
  const paths = ['/', '/loppkalender/', '/en/', '/om-oss/'];

  for (const path of paths) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    const html = await page.content();
    expect(html, path).not.toContain('pagead2.googlesyndication.com');
    expect(html, path).not.toContain('fundingchoicesmessages.google.com');
    expect(html, path).not.toContain('google-adsense-account');
    expect(html, path).not.toContain('adsbygoogle.js');
    expect(html, path).not.toContain('signalGooglefcPresent');
  }
});
