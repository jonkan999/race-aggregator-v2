import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  markerMatchesDateRange,
  markerStartDates,
  normalizeMapMarker,
  relevantMarkerDate,
} from '../src/lib/mapMarkers.ts';
import { isDomesticOrigin } from '../src/lib/neighboringSelection.ts';
import { upcomingWindowEnd, upcomingWindowStart } from '../src/lib/upcomingRaceWindow.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('map date filter uses any start date, not only the first historical one', () => {
  const marker = {
    race_date: '20250901',
    race_dates: ['20250901', '20260919', '20270901'],
  };
  assert.equal(markerMatchesDateRange(marker, '2026-09-15', '2027-09-15'), true);
  assert.equal(relevantMarkerDate(marker, '2026-09-15', '2027-09-15'), '20260919');

  const firstDateOnly = { race_date: '20250901' };
  assert.equal(markerMatchesDateRange(firstDateOnly, '2026-09-15', '2027-09-15'), false);
});

test('normalizeMapMarker coerces string coordinates and keeps later dates', () => {
  const normalized = normalizeMapMarker({
    id: 'begbylopet',
    domain_name: 'begbylopet',
    latitude: '59.21467849949574',
    longitude: '11.013779640088616',
    county: 'Viken',
    race_type: 'terrain',
    origin_country: 'no',
    race_date: '20260426',
    race_dates: ['20260426', '20270425'],
  });
  assert.ok(normalized);
  assert.equal(typeof normalized.latitude, 'number');
  assert.equal(typeof normalized.longitude, 'number');
  assert.deepEqual(markerStartDates(normalized), ['20260426', '20270425']);
});

test('neighbor map overlay CSS takes the control out of document flow', () => {
  const css = fs.readFileSync(path.join(repoRoot, 'src/styles/islands.css'), 'utf8');
  assert.match(css, /neighboring-countries-control--overlay/);
  assert.match(css, /position:\s*absolute\s*!important/);
  assert.match(css, /display:\s*grid/);
});

test('SE marker JSON upcoming window is in the same ballpark as any-date list filtering', () => {
  const markersPath = path.join(repoRoot, 'public', 'markers-se.json');
  const parsed = JSON.parse(fs.readFileSync(markersPath, 'utf8'));
  const markers = Array.isArray(parsed.markers) ? parsed.markers : [];
  const fromYmd = upcomingWindowStart();
  const toYmd = upcomingWindowEnd();
  const fromIso = `${fromYmd.slice(0, 4)}-${fromYmd.slice(4, 6)}-${fromYmd.slice(6, 8)}`;
  const toIso = `${toYmd.slice(0, 4)}-${toYmd.slice(4, 6)}-${toYmd.slice(6, 8)}`;

  const domestic = markers.filter((marker) => isDomesticOrigin(marker.origin_country, 'se'));
  const anyDateInWindow = domestic.filter((marker) => markerMatchesDateRange(marker, fromIso, toIso));
  const firstDateOnly = domestic.filter((marker) => {
    const first = marker.race_dates?.[0] ?? marker.race_date;
    return markerMatchesDateRange({ race_date: first }, fromIso, toIso);
  });

  assert.ok(domestic.length > 100, `expected a full SE marker set, got ${domestic.length}`);
  assert.ok(
    anyDateInWindow.length >= 100,
    `expected ~list-sized upcoming SE markers, got ${anyDateInWindow.length}`,
  );
  assert.ok(
    anyDateInWindow.length > firstDateOnly.length * 2,
    `any-date filter (${anyDateInWindow.length}) should greatly exceed first-date-only (${firstDateOnly.length})`,
  );
});
