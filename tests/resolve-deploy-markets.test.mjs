import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyChangedFiles,
  redirectConfigAffectedMarkets,
} from '../scripts/resolve-deploy-markets.mjs';

const ENABLED = ['se', 'cz', 'sk', 'hu', 'pl', 'de', 'nl', 'no'];

test('a data publish for one market deploys only that market', () => {
  const decision = classifyChangedFiles(
    [
      'data/countries/pl/final_races.json',
      'data/countries/pl/final_races_int.json',
      'data/countries/pl/final_races_w_neighbors.json',
      'data/countries/pl/final_races_w_neighbors_int.json',
      'data/countries/pl/qualified_cities.yaml',
    ],
    ENABLED,
  );
  assert.equal(decision.mode, 'changed');
  assert.deepEqual(decision.marketCodes, ['pl']);
});

test('data for several markets deploys those markets in config order', () => {
  const decision = classifyChangedFiles(
    ['data/countries/no/final_races.json', 'data/countries/pl/json/training_plans_processed_pl.json'],
    ENABLED,
  );
  assert.equal(decision.mode, 'changed');
  assert.deepEqual(decision.marketCodes, ['pl', 'no']);
});

test('code, config, redirects and workflow changes deploy every market', () => {
  for (const file of [
    'src/lib/content.ts',
    'config/redirects/merged-duplicate-races.json',
    'config/neighbor-markets.json',
    'vercel.json',
    '.github/workflows/deploy-markets.yml',
    'package-lock.json',
  ]) {
    const decision = classifyChangedFiles(['data/countries/pl/final_races.json', file], ENABLED);
    assert.equal(decision.mode, 'all', file);
  }
});

test('index.yaml and merged_index_int.yaml are read by other markets, so they deploy all', () => {
  assert.equal(classifyChangedFiles(['data/countries/pl/index.yaml'], ENABLED).mode, 'all');
  assert.equal(classifyChangedFiles(['data/countries/de/merged_index_int.yaml'], ENABLED).mode, 'all');
});

test('shared or unknown market data and empty diffs fall back to all', () => {
  assert.equal(classifyChangedFiles(['data/countries/int/README.md'], ENABLED).mode, 'all');
  assert.equal(classifyChangedFiles(['data/countries/be/final_races.json'], ENABLED).mode, 'all');
  assert.equal(classifyChangedFiles(['data/countries/old_sitemap.xml'], ENABLED).mode, 'all');
  assert.equal(classifyChangedFiles([], ENABLED).mode, 'all');
  assert.equal(classifyChangedFiles(undefined, ENABLED).mode, 'all');
});

const entry = (market, slug) => ({
  source: `/x/${slug}_old/:path*`,
  destination: `/x/${slug}/:path*`,
  permanent: true,
  ...(market ? { market } : {}),
});

test('redirect edits are scoped to the markets whose entries changed', () => {
  const before = { id: 'merged', redirects: [entry('bg', 'a'), entry('sk', 'b')] };
  const after = { id: 'merged', redirects: [entry('bg', 'a'), entry('sk', 'b'), entry('sk', 'c'), entry('pl', 'd')] };
  assert.deepEqual(redirectConfigAffectedMarkets(before, after, ENABLED), ['sk', 'pl']);
  assert.deepEqual(redirectConfigAffectedMarkets(before, before, ENABLED), []);
});

test('an untagged redirect, a market-level config or a new file is scoped correctly', () => {
  const before = { redirects: [entry('pl', 'a')] };
  assert.deepEqual(
    redirectConfigAffectedMarkets(before, { redirects: [entry('pl', 'a'), entry('', 'g')] }, ENABLED),
    ENABLED,
  );
  assert.deepEqual(
    redirectConfigAffectedMarkets(null, { market: 'de', redirects: [entry('', 'h')] }, ENABLED),
    ['de'],
  );
  assert.deepEqual(redirectConfigAffectedMarkets({ market: 'nl', redirects: [entry('', 'i')] }, null, ENABLED), ['nl']);
});

test('a publish that also adds that market\'s redirects deploys only that market', () => {
  const decision = classifyChangedFiles(
    ['config/redirects/merged-duplicate-races.json', 'data/countries/sk/final_races.json'],
    ENABLED,
    () => ['sk'],
  );
  assert.equal(decision.mode, 'changed');
  assert.deepEqual(decision.marketCodes, ['sk']);
});

test('redirect changes fall back to all when they cannot be scoped', () => {
  assert.equal(classifyChangedFiles(['config/redirects/x.json'], ENABLED).mode, 'all');
  assert.equal(classifyChangedFiles(['config/redirects/x.json'], ENABLED, () => null).mode, 'all');
  assert.equal(
    classifyChangedFiles(['config/redirects/x.json'], ENABLED, () => {
      throw new Error('bad json');
    }).mode,
    'all',
  );
  assert.equal(classifyChangedFiles(['config/redirects/x.json'], ENABLED, () => []).mode, 'all');
});
