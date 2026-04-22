import { test, expect } from '@playwright/test';
import { loadIndexYaml } from '../src/lib/content';
import {
  buildTrendingRaces,
  getBoostedPopularityDisplayValue,
  type HomeRaceEntry,
} from '../src/lib/homePage';
import { getRaceDetailFields } from '../src/lib/raceDetail';
import type { RaceListRow } from '../src/lib/raceListRow';
import {
  displayRaceDate,
  upcomingWindowEnd,
  upcomingWindowStart,
} from '../src/lib/upcomingRaceWindow';

test.beforeEach(async ({ page }) => {
  await page.route('https://race-aggregator-tests.supabase.co/rest/v1/rpc/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'null',
    });
  });
});

function buildPromotedRow(args: {
  id: string;
  domainName: string;
  name: string;
  date: string;
  pageViews?: number;
}): RaceListRow {
  const { id, domainName, name, date, pageViews } = args;
  return {
    id,
    domain_name: domainName,
    county: 'stockholm',
    race_type: 'road',
    origin_country: 'se',
    race_dates: [[date]],
    latitude: null,
    longitude: null,
    distance_m: [10000],
    website: null,
    payload: {
      nearest_city: 'Stockholm',
      analytics:
        pageViews != null
          ? {
              page_views_last_30_days: pageViews,
            }
          : undefined,
    },
    race_translations: [
      {
        locale: 'sv',
        name,
        type_local: 'Landsväg',
        distance_verbose: '10 km',
        description: `${name} description`,
      },
    ],
  };
}

test('Swedish home page renders', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: /allt om löpning i sverige/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /hitta lopp/i })).toBeVisible();
  await expect(page.locator('.home-feature-card--hero')).toBeVisible();
  await expect(page.locator('.home-tool-card').first()).toBeVisible();
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

test('race list uses the next in-window date for card display and ordering', async ({ page }) => {
  await page.route(
    'https://race-aggregator-tests.supabase.co/rest/v1/rpc/get_races_list_page',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: 2,
          rows: [
            {
              id: 'history-row',
              domain_name: 'window-race',
              county: 'Uppsala',
              race_type: 'road',
              origin_country: 'se',
              race_dates: [
                ['20250520', '20250520'],
                ['20260615', '20260615'],
              ],
              latitude: null,
              longitude: null,
              distance_m: [10000],
              website: null,
              payload: {
                nearest_city: 'Uppsala',
                location: 'Uppsala',
                description: 'Window race description',
              },
              race_translations: [
                {
                  locale: 'sv',
                  name: 'Window Race',
                  type_local: 'Landsväg',
                  distance_verbose: '10 km',
                  description: 'Window race description',
                },
              ],
            },
            {
              id: 'later-row',
              domain_name: 'later-race',
              county: 'Uppsala',
              race_type: 'road',
              origin_country: 'se',
              race_dates: [
                ['20250510', '20250510'],
                ['20260620', '20260620'],
              ],
              latitude: null,
              longitude: null,
              distance_m: [10000],
              website: null,
              payload: {
                nearest_city: 'Uppsala',
                location: 'Uppsala',
                description: 'Later race description',
              },
              race_translations: [
                {
                  locale: 'sv',
                  name: 'Later Race',
                  type_local: 'Landsväg',
                  distance_verbose: '10 km',
                  description: 'Later race description',
                },
              ],
            },
          ],
        }),
      });
    },
  );

  await page.goto('/loppkalender/?county=uppsala');

  const cards = page.locator('#race-cards-container .race-card[data-name]');
  await expect(cards.first()).toHaveAttribute('data-name', 'Window Race');
  await expect(cards.first()).toHaveAttribute('data-date', '20260615');
  await expect(cards.nth(1)).toHaveAttribute('data-name', 'Later Race');
  await expect(cards.nth(1)).toHaveAttribute('data-date', '20260620');
});

test('displayRaceDate falls back to the first known date when a race is only in the past', () => {
  expect(displayRaceDate([['20250312', '20250312']], '20260401', '20270401')).toBe('20250312');
});

test('English home page renders', async ({ page }) => {
  await page.goto('/en/');
  await expect(page.getByRole('heading', { level: 1, name: /everything about running in sweden/i })).toBeVisible();
  await expect(page.locator('.home-feature-card--hero')).toBeVisible();
});

test('home trending falls back without visible metrics when analytics are absent', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-trending-rank__views')).toHaveCount(0);
});

test('buildTrendingRaces ranks raw page views and boosts displayed counts', () => {
  const content = loadIndexYaml('se', 'native');
  const trending = buildTrendingRaces({
    promotableRows: [
      buildPromotedRow({
        id: '1',
        domainName: 'alpha-race',
        name: 'Alpha Race',
        date: '20260510',
        pageViews: 12,
      }),
      buildPromotedRow({
        id: '2',
        domainName: 'beta-race',
        name: 'Beta Race',
        date: '20260511',
        pageViews: 20,
      }),
      buildPromotedRow({
        id: '3',
        domainName: 'gamma-race',
        name: 'Gamma Race',
        date: '20260509',
        pageViews: 20,
      }),
    ],
    featuredRaces: [],
    countryCode: 'se',
    locale: 'native',
    content,
    upcomingStartComparable: upcomingWindowStart(),
    upcomingEndComparable: upcomingWindowEnd(),
  });

  expect(trending.map((race) => race.name)).toEqual(['Gamma Race', 'Beta Race', 'Alpha Race']);
  expect(trending.map((race) => race.popularityValue)).toEqual([20, 20, 12]);
  expect(trending.map((race) => race.popularityDisplayValue)).toEqual([
    getBoostedPopularityDisplayValue(20),
    getBoostedPopularityDisplayValue(20),
    getBoostedPopularityDisplayValue(12),
  ]);
});

test('buildTrendingRaces falls back to featured entries when analytics are missing', () => {
  const featuredRaces: HomeRaceEntry[] = [
    {
      id: 'featured-1',
      href: '/loppsidor/featured-1/',
      name: 'Featured 1',
      dateLabel: '10 maj',
      dateIso: '2026-05-10',
      locationLabel: 'Stockholm',
      typeLabel: 'Landsväg',
      distanceLabels: ['10 km'],
      imageSrc: '/common_images/road-running.webp',
      imageAlt: 'Featured 1',
      summary: 'Featured one',
    },
    {
      id: 'featured-2',
      href: '/loppsidor/featured-2/',
      name: 'Featured 2',
      dateLabel: '11 maj',
      dateIso: '2026-05-11',
      locationLabel: 'Göteborg',
      typeLabel: 'Landsväg',
      distanceLabels: ['5 km'],
      imageSrc: '/common_images/road-running.webp',
      imageAlt: 'Featured 2',
      summary: 'Featured two',
    },
    {
      id: 'featured-3',
      href: '/loppsidor/featured-3/',
      name: 'Featured 3',
      dateLabel: '12 maj',
      dateIso: '2026-05-12',
      locationLabel: 'Malmö',
      typeLabel: 'Trail',
      distanceLabels: ['21 km'],
      imageSrc: '/common_images/trail-running.webp',
      imageAlt: 'Featured 3',
      summary: 'Featured three',
    },
  ];

  expect(
    buildTrendingRaces({
      promotableRows: [
        buildPromotedRow({
          id: 'no-analytics',
          domainName: 'no-analytics',
          name: 'No Analytics',
          date: '20260513',
        }),
      ],
      featuredRaces,
      countryCode: 'se',
      locale: 'native',
      content: loadIndexYaml('se', 'native'),
      upcomingStartComparable: upcomingWindowStart(),
      upcomingEndComparable: upcomingWindowEnd(),
    }).map((race) => race.name),
  ).toEqual(['Featured 2', 'Featured 3']);
});

test('race detail prefers translated additional info and course highlights on English pages', () => {
  const detail = getRaceDetailFields(
    {
      id: 'detail-race',
      domain_name: 'detail-race',
      county: 'stockholm',
      race_type: 'road',
      origin_country: 'se',
      race_dates: [['20260510', '20260510']],
      latitude: null,
      longitude: null,
      distance_m: [10000],
      website: null,
      payload: {
        description: 'Native description',
        additional: 'Native additional info',
        course_highlights: ['Native climb', 'Native finish'],
      },
      race_translations: [
        {
          locale: 'sv',
          name: 'Detaljloppet',
          type_local: 'Landsväg',
          distance_verbose: '10 km',
          description: 'Native description',
          additional: 'Native additional info',
          course_highlights: ['Native climb', 'Native finish'],
        },
        {
          locale: 'en',
          name: 'Detail Race',
          type_local: 'Road',
          distance_verbose: '10 km',
          description: 'English description',
          additional: 'English additional info',
          course_highlights: ['English climb', 'English finish'],
        },
      ],
    },
    loadIndexYaml('se', 'en'),
    'en',
  );

  expect(detail.additionalInfo).toBe('English additional info');
  expect(detail.courseHighlights).toEqual(['English climb', 'English finish']);
});

test('browse overview renders', async ({ page }) => {
  await page.goto('/loppkalender/bladdra-efter-kategori/');
  await expect(page.getByRole('heading', { level: 1, name: /bläddra bland alla lopp/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /10 km/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /närliggande länder/i })).toBeVisible();
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
  await page.goto('/neighbors/');
  await expect(page.getByRole('heading', { level: 1, name: /utforska lopp i närliggande länder/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /översikt/i }).first()).toBeVisible();
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

test('race detail page view tracker records one hit per detail-page load', async ({ page }) => {
  const calls: Array<Record<string, unknown>> = [];

  await page.route(
    'https://race-aggregator-tests.supabase.co/rest/v1/rpc/record_race_detail_page_view',
    async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      calls.push(payload);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'null',
      });
    },
  );

  await page.goto('/loppkalender/');
  const raceHref = await page.locator('.race-card').first().getAttribute('href');
  expect(raceHref).toBeTruthy();

  await page.goto(raceHref!);
  await expect.poll(() => calls.length).toBe(1);
  const nativeDomainName = String(calls[0]?.p_domain_name ?? '');
  expect(nativeDomainName).not.toBe('');
  expect(calls[0]?.p_country_code).toBe('se');
  expect(calls[0]?.p_locale).toBe('sv');
  expect(String(calls[0]?.p_page_path ?? '')).toContain(`/loppsidor/${nativeDomainName}/`);

  await page.goto(`/en/race-pages/${nativeDomainName}/`);
  await expect.poll(() => calls.length).toBe(2);
  expect(calls[1]?.p_domain_name).toBe(nativeDomainName);
  expect(calls[1]?.p_locale).toBe('en');
  expect(String(calls[1]?.p_page_path ?? '')).toContain(`/en/race-pages/${nativeDomainName}/`);
});
