import assert from 'node:assert/strict';
import test from 'node:test';
import { rowDistanceMeters, rowMatchesDistanceRange } from '../src/lib/raceDistances.js';

function stubRow(overrides = {}) {
  return {
    distance_m: [],
    race_type: 'road',
    payload: {},
    ...overrides,
  };
}

test('keeps recorded distance_m in meters', () => {
  const row = stubRow({ distance_m: [10000, 5000] });
  assert.deepEqual(rowDistanceMeters(row), [10000, 5000]);
  assert.equal(rowMatchesDistanceRange(row, 9, 11), true);
  assert.equal(rowMatchesDistanceRange(row, 20, 22), false);
});

test('parses collector distances JSON strings as kilometres', () => {
  const row = stubRow({
    payload: { distances: '["10", "5", "1"]' },
  });
  assert.equal(rowMatchesDistanceRange(row, 9, 11), true);
  assert.equal(rowMatchesDistanceRange(row, 4, 6), true);
  assert.equal(rowMatchesDistanceRange(row, 20, 22), false);
});

test('infers half marathon from Dutch and English race names', () => {
  const dutch = stubRow({ payload: { name: 'Halve Marathon Oldenzaal' } });
  const parenthetical = stubRow({ payload: { name: '2e Schiphol (halve) Marathon' } });
  const english = stubRow({ payload: { name: 'Pre-Run Egmond Half Marathon 2026' } });

  assert.equal(rowMatchesDistanceRange(dutch, 20, 22), true);
  assert.equal(rowMatchesDistanceRange(parenthetical, 20, 22), true);
  assert.equal(rowMatchesDistanceRange(english, 20, 22), true);
  assert.equal(rowMatchesDistanceRange(dutch, 40, 44), false);
});

test('infers marathon without treating mini or half events as 42 km', () => {
  const marathon = stubRow({ payload: { name: 'TCS Amsterdam Marathon 2026' } });
  const mini = stubRow({ payload: { name: 'Mini Marathon Zeewolde' } });
  const half = stubRow({ payload: { name: 'Montferland Halve Marathon' } });

  assert.equal(rowMatchesDistanceRange(marathon, 40, 44), true);
  assert.equal(rowMatchesDistanceRange(mini, 40, 44), false);
  assert.equal(rowMatchesDistanceRange(half, 40, 44), false);
});

test('does not treat 15 km as a 5 km category match', () => {
  const row = stubRow({ payload: { name: 'Wintercross 15 km Texel' } });
  assert.equal(rowMatchesDistanceRange(row, 4, 6), false);
  assert.equal(rowMatchesDistanceRange(row, 9, 11), false);
});

test('reads kilometre mentions from names when distance_m is empty', () => {
  const row = stubRow({ payload: { name: 'AVH 1 km, 3 km, 5 km baanloop' } });
  assert.equal(rowMatchesDistanceRange(row, 4, 6), true);
});

test('ignores mixed-distance fallback verbose labels', () => {
  const row = stubRow({
    payload: {
      name: 'Werkhoven Loopt 2026',
      distance_verbose: 'Gemengde afstand',
    },
  });
  assert.deepEqual(rowDistanceMeters(row), []);
  assert.equal(rowMatchesDistanceRange(row, 4, 6), false);
});
