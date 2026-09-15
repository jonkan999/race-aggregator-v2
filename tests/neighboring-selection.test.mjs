import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDomesticOrigin,
  originIsVisible,
  parseNeighboringSelection,
  resolveNeighboringCountryCodes,
  rowMatchesNeighborAndCountyFilter,
} from '../src/lib/neighboringSelection.ts';

test('origin overlay keeps domestic races and adds selected neighbors', () => {
  assert.equal(
    originIsVisible({
      originCountry: 'se',
      hostCountryCode: 'se',
      visibleNeighborCodes: ['dk'],
    }),
    true,
  );
  assert.equal(
    originIsVisible({
      originCountry: 'dk',
      hostCountryCode: 'se',
      visibleNeighborCodes: ['dk'],
    }),
    true,
  );
  assert.equal(
    originIsVisible({
      originCountry: 'fi',
      hostCountryCode: 'se',
      visibleNeighborCodes: ['dk'],
    }),
    false,
  );
  assert.equal(
    originIsVisible({
      originCountry: 'dk',
      hostCountryCode: 'se',
      visibleNeighborCodes: [],
    }),
    false,
  );
});

test('neighbor hub selection is exclusive', () => {
  assert.equal(
    originIsVisible({
      originCountry: 'se',
      hostCountryCode: 'se',
      neighboringSelection: { kind: 'all' },
    }),
    false,
  );
  assert.equal(
    originIsVisible({
      originCountry: 'dk',
      hostCountryCode: 'se',
      neighboringSelection: { kind: 'all' },
    }),
    true,
  );
  assert.equal(
    originIsVisible({
      originCountry: 'fi',
      hostCountryCode: 'se',
      neighboringSelection: { kind: 'country', code: 'dk' },
    }),
    false,
  );
});

test('domestic county filter does not hide overlay neighbor races', () => {
  assert.equal(
    rowMatchesNeighborAndCountyFilter({
      originCountry: 'dk',
      county: 'Hovedstaden',
      hostCountryCode: 'se',
      selectedCounty: 'stockholm',
      visibleNeighborCodes: ['dk'],
    }),
    true,
  );
  assert.equal(
    rowMatchesNeighborAndCountyFilter({
      originCountry: 'se',
      county: 'Dalarna',
      hostCountryCode: 'se',
      selectedCounty: 'stockholm',
      visibleNeighborCodes: ['dk'],
    }),
    false,
  );
});

test('configured neighbor codes stay visible even without snapshot origins', () => {
  assert.deepEqual(
    resolveNeighboringCountryCodes({
      hostCountryCode: 'dk',
      configuredCodes: ['se', 'de', 'no'],
      originCodes: [],
    }),
    ['se', 'de', 'no'],
  );
  assert.deepEqual(
    resolveNeighboringCountryCodes({
      hostCountryCode: 'lt',
      configuredCodes: ['ee', 'pl', 'se'],
      originCodes: ['de', 'ee'],
    }),
    ['ee', 'pl', 'se', 'de'],
  );
});

test('parseNeighboringSelection still supports exclusive hub values', () => {
  assert.deepEqual(parseNeighboringSelection('__neighbors_all__'), { kind: 'all' });
  assert.deepEqual(parseNeighboringSelection('__neighbor__:fi'), { kind: 'country', code: 'fi' });
  assert.equal(isDomesticOrigin(null, 'fi'), true);
});
