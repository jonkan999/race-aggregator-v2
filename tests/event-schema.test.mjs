import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEventSchema, eventStatusFor, startTimeToIso } from '../src/lib/eventSchema.js';
import { parsePriceRange, truncateAtWord } from '../src/lib/seoMeta.js';

const base = {
  name: 'Testloppet',
  description: 'Ett lopp.',
  startIso: '2027-05-16',
  locationName: 'Adelsö',
  locality: 'Adelsö',
  region: 'Uppsala',
  countryCode: 'SE',
  url: 'https://loppkartan.se/loppsidor/test/',
  todayIso: '2026-11-25',
};

test('event schema carries geo, address and absolute url', () => {
  const schema = buildEventSchema({ ...base, latitude: 59.37, longitude: 17.52 });
  assert.equal(schema['@type'], 'Event');
  assert.equal(schema.location['@type'], 'Place');
  assert.deepEqual(schema.location.geo, { '@type': 'GeoCoordinates', latitude: 59.37, longitude: 17.52 });
  assert.equal(schema.location.address.addressCountry, 'SE');
  assert.equal(schema.url, base.url);
});

test('geo is omitted when coordinates are missing or invalid', () => {
  const schema = buildEventSchema({ ...base, latitude: null, longitude: 'x' });
  assert.equal(schema.location.geo, undefined);
});

test('estimated dates do not claim a scheduled status', () => {
  const schema = buildEventSchema({ ...base, isEstimated: true });
  assert.equal(schema.eventStatus, undefined);
  assert.equal(eventStatusFor({ isEstimated: false }), 'https://schema.org/EventScheduled');
});

test('time of day is merged into startDate when valid', () => {
  assert.equal(startTimeToIso('09:30'), '09:30:00');
  assert.equal(startTimeToIso('soon'), null);
  assert.equal(buildEventSchema({ ...base, startTime: '9.30' }).startDate, '2027-05-16T09:30:00');
  assert.equal(buildEventSchema({ ...base, startTime: 'soon' }).startDate, '2027-05-16');
});

test('truncateAtWord prefers a sentence boundary and never cuts mid-word', () => {
  const text = 'Ett nytt ultratraillopp på Adelsö den 16 maj 2027. Adelsö är en av Mälaröarna i utkanten av Stockholm och banan går genom skog.';
  const cut = truncateAtWord(text, 100);
  assert.ok(cut.length <= 100);
  assert.ok(/[.!?…]$/.test(cut) || !text.slice(cut.length).startsWith(cut.slice(-1)));
  assert.ok(text.startsWith(cut.replace(/…$/, '').trim()));
});

test('parsePriceRange reads simple price strings only', () => {
  assert.deepEqual(parsePriceRange('100-2000'), { low: 100, high: 2000 });
  assert.deepEqual(parsePriceRange('300'), { low: 300, high: 300 });
  assert.equal(parsePriceRange('Se hemsidan för aktuell prisinformation och rabatter vid tidig anmälan'), null);
});
