import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import { categoryFilterOptionsFromYaml } from '../src/lib/categoryFilterOptions.ts';
import { rowMatchesDistanceRange } from '../src/lib/raceDistances.js';
import { getBrowseSeoIndexingPolicy, isBrowseStandaloneAllowed } from '../src/lib/browseSeoIndexing.js';

const upcomingStart = (() => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
})();
const upcomingEnd = (() => {
  const end = new Date();
  end.setDate(end.getDate() + 365);
  return `${end.getFullYear()}${String(end.getMonth() + 1).padStart(2, '0')}${String(end.getDate()).padStart(2, '0')}`;
})();

function inUpcomingWindow(row) {
  if (!Array.isArray(row.race_dates)) return false;
  return row.race_dates.some((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') return false;
    return entry[0] >= upcomingStart && entry[0] <= upcomingEnd;
  });
}

test('Netherlands browse categories include half marathon and marathon from name fallbacks', () => {
  const countryDir = path.join(process.cwd(), 'data', 'countries', 'nl');
  const content = yaml.load(fs.readFileSync(path.join(countryDir, 'index.yaml'), 'utf8'));
  const races = JSON.parse(fs.readFileSync(path.join(countryDir, 'final_races.json'), 'utf8'));
  const options = categoryFilterOptionsFromYaml(
    content.category_mapping,
    content.verbose_local_distance_mapping,
  );
  const policy = getBrowseSeoIndexingPolicy(content);
  const upcoming = races.filter(inUpcomingWindow);

  const populated = options
    .filter((option) => option.kind === 'distance')
    .map((option) => {
      const count = upcoming.filter((row) => rowMatchesDistanceRange(row, option.minKm, option.maxKm)).length;
      return {
        key: option.key,
        label: option.label,
        count,
        allowed: isBrowseStandaloneAllowed(policy, 'category', {
          categoryKey: option.key,
          label: option.label,
          count,
        }),
      };
    })
    .filter((entry) => entry.allowed);

  const keys = populated.map((entry) => entry.key);
  assert.ok(keys.includes('half_marathon'), `expected half_marathon, got ${JSON.stringify(populated)}`);
  assert.ok(keys.includes('marathon'), `expected marathon, got ${JSON.stringify(populated)}`);
});
