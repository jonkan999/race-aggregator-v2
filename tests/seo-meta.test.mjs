import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHreflangLinks, fitMetaDescription, marketCurrency, parsePriceAmount, truncateAtWord } from '../src/lib/seoMeta.js';
import { toServingBaseUrl } from '../scripts/generate-sitemap.mjs';
import { filterUpcomingMarkers } from '../scripts/export-markers.mjs';

test('hreflang: native page lists self, en and x-default', () => {
  assert.deepEqual(
    buildHreflangLinks({ locale: 'native', nativeLang: 'de', currentUrl: 'https://www.a.de/', alternateUrl: 'https://www.a.de/en/' }),
    [
      { hreflang: 'de', href: 'https://www.a.de/' },
      { hreflang: 'en', href: 'https://www.a.de/en/' },
      { hreflang: 'x-default', href: 'https://www.a.de/' },
    ],
  );
});

test('hreflang: en page points native language at the native url (not sv)', () => {
  const links = buildHreflangLinks({ locale: 'en', nativeLang: 'cs', currentUrl: 'https://www.x.com/en/', alternateUrl: 'https://www.x.com/' });
  assert.deepEqual(links.map((l) => l.hreflang), ['cs', 'en', 'x-default']);
  assert.equal(links[0].href, 'https://www.x.com/');
  assert.equal(links[1].href, 'https://www.x.com/en/');
});

test('meta description lands in 120-160 chars', () => {
  const short = fitMetaDescription('Blodomloppet Jämtland', ['13 maj 2027, Östersund', '5 km, 10 km', 'Landsväg', 'Loppkartan — alla lopp i Sverige på en karta']);
  assert.ok(short.length <= 160, short);
  assert.ok(short.length >= 60, short);
  const long = fitMetaDescription('x '.repeat(200));
  assert.ok(long.length <= 160);
  assert.equal(truncateAtWord('hello world', 160), 'hello world');
});

test('price parsing and currency', () => {
  assert.equal(parsePriceAmount('350 kr'), 350);
  assert.equal(parsePriceAmount('€25,50'), 25.5);
  assert.equal(parsePriceAmount('1 200 Kč'), 1200);
  assert.equal(parsePriceAmount('Free'), null);
  assert.equal(marketCurrency('se'), 'SEK');
  assert.equal(marketCurrency('de'), 'EUR');
});

test('serving base url uses www', () => {
  assert.equal(toServingBaseUrl('https://loppkartan.se/'), 'https://www.loppkartan.se');
  assert.equal(toServingBaseUrl('https://www.loppkartan.se'), 'https://www.loppkartan.se');
  assert.equal(toServingBaseUrl('https://terminovkabehov.com'), 'https://www.terminovkabehov.com');
});

test('markers keep only upcoming dates', () => {
  const out = filterUpcomingMarkers(
    [
      { id: 1, race_dates: ['20250101'] },
      { id: 2, race_dates: ['20250101', '20261020'] },
    ],
    '20261013',
  );
  assert.deepEqual(out, [{ id: 2, race_dates: ['20261020'], race_date: '20261020' }]);
});
