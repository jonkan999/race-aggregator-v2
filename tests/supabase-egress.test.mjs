import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dedupeByDomain,
  diffSnapshotRows,
  raceColumns,
  raceFingerprint,
  raceTranslations,
  snapshotRowFromJson,
  spreadSample,
} from '../scripts/lib/race-rows.mjs';
import { FULL_RESEED_MAX_AGE_MS, planSeed } from '../scripts/lib/seed-plan.mjs';

const race = {
  domain_name: 'fjordlopet',
  name: 'Fjordløpet',
  type: 'road',
  county: 'Vestland',
  latitude: 60.47115030000001,
  longitude: 5.3273573,
  race_dates: [['20270501', '20270501']],
  distance_m: [10000],
  website: 'https://example.no',
  description: 'Flat og rask.',
  type_local: 'Gateløp',
  distance_verbose: '10 km',
  additional_info: 'Start 12:00',
  course_highlights: ['Fjord', 7, 'Bro'],
};
const intRace = { ...race, name: 'Fjord Run', description: 'Flat and fast.', additional: 'Start noon' };

test('raceColumns mirrors the Supabase columns seed-races writes', () => {
  assert.deepEqual(raceColumns(race), {
    domain_name: 'fjordlopet',
    latitude: 60.47115030000001,
    longitude: 5.3273573,
    race_dates: [['20270501', '20270501']],
    county: 'Vestland',
    race_type: 'road',
    distance_m: [10000],
    website: 'https://example.no',
    organizer: null,
    contact: null,
    origin_country: null,
  });
});

test('translations use additional_info fallback and drop non-string highlights', () => {
  const [native, en] = raceTranslations(race, intRace, 'no');
  assert.equal(native.locale, 'no');
  assert.equal(native.additional, 'Start 12:00');
  assert.deepEqual(native.course_highlights, ['Fjord', 'Bro']);
  assert.equal(en.locale, 'en');
  assert.equal(en.additional, 'Start noon');
  assert.equal(raceTranslations(race, undefined, 'no').length, 1);
});

test('snapshot row rebuilt from JSON matches the equivalent Supabase row', () => {
  const dbRow = {
    id: 'uuid-1',
    domain_name: 'fjordlopet',
    county: 'Vestland',
    race_type: 'road',
    origin_country: null,
    race_dates: [['20270501', '20270501']],
    latitude: 60.4711503,
    longitude: 5.3273573,
    distance_m: [10000],
    website: 'https://example.no',
    payload: { ...race },
    race_translations: [
      { locale: 'en', ...raceTranslations(race, intRace, 'no')[1] },
      { locale: 'no', ...raceTranslations(race, intRace, 'no')[0] },
    ],
  };
  const rebuilt = snapshotRowFromJson(race, intRace, 'no', dbRow);
  assert.equal(rebuilt.id, 'uuid-1');
  assert.equal(rebuilt.latitude, 60.4711503, 'keeps stored coordinates from Supabase');
  assert.deepEqual(diffSnapshotRows(dbRow, rebuilt), []);

  const changed = { ...dbRow, payload: { ...race, description: 'Ny tekst' } };
  assert.deepEqual(diffSnapshotRows(changed, rebuilt), ['payload']);
  const noEn = { ...dbRow, race_translations: dbRow.race_translations.slice(1) };
  assert.deepEqual(diffSnapshotRows(noEn, rebuilt), ['translation:en:only-json']);
});

test('dedupeByDomain keeps the last occurrence like sequential upserts', () => {
  const out = dedupeByDomain([{ domain_name: 'a', v: 1 }, { domain_name: 'b' }, { domain_name: 'a', v: 2 }]);
  assert.deepEqual(out.map((r) => r.domain_name).sort(), ['a', 'b']);
  assert.equal(out.find((r) => r.domain_name === 'a').v, 2);
});

test('fingerprint ignores key order but not content', () => {
  const reordered = Object.fromEntries(Object.entries(race).reverse());
  assert.equal(raceFingerprint(race, intRace, 'no'), raceFingerprint(reordered, intRace, 'no'));
  assert.notEqual(raceFingerprint(race, intRace, 'no'), raceFingerprint({ ...race, website: 'x' }, intRace, 'no'));
  assert.notEqual(raceFingerprint(race, intRace, 'no'), raceFingerprint(race, { ...intRace, name: 'X' }, 'no'));
});

test('spreadSample is deterministic and bounded', () => {
  const items = Array.from({ length: 100 }, (_, i) => i);
  assert.deepEqual(spreadSample(items, 4), [0, 25, 50, 75]);
  assert.deepEqual(spreadSample([1, 2], 5), [1, 2]);
});

function planFor({ state, published, force = false, now = Date.parse('2026-11-17T12:00:00Z'), races = [race] }) {
  return planSeed({
    races,
    intByDomain: new Map([[race.domain_name, intRace]]),
    nativeLocale: 'no',
    state,
    dbPublishedByDomain: new Map(published),
    force,
    now,
  });
}

test('seed plan skips unchanged published races and writes everything else', () => {
  const fp = raceFingerprint(race, intRace, 'no');
  const fresh = { version: 1, fullSeedAt: '2026-11-16T12:00:00Z', entries: { fjordlopet: fp } };

  assert.equal(planFor({ state: fresh, published: [['fjordlopet', true]] }).toWrite.length, 0);
  assert.equal(planFor({ state: fresh, published: [['fjordlopet', true]] }).skipped, 1);
  // Unpublished in Supabase: still re-upserted, exactly like before.
  assert.equal(planFor({ state: fresh, published: [['fjordlopet', false]] }).toWrite.length, 1);
  // Missing in Supabase.
  assert.equal(planFor({ state: fresh, published: [] }).toWrite.length, 1);
  // Content changed.
  const changed = planFor({ state: fresh, published: [['fjordlopet', true]], races: [{ ...race, name: 'Nytt' }] });
  assert.equal(changed.toWrite.length, 1);
  // --force, no state, or a full seed older than 7 days rewrites everything.
  assert.equal(planFor({ state: fresh, published: [['fjordlopet', true]], force: true }).full, true);
  assert.equal(planFor({ state: null, published: [['fjordlopet', true]] }).toWrite.length, 1);
  const old = { ...fresh, fullSeedAt: new Date(Date.parse('2026-11-17T12:00:00Z') - FULL_RESEED_MAX_AGE_MS - 1).toISOString() };
  assert.equal(planFor({ state: old, published: [['fjordlopet', true]] }).full, true);
});
