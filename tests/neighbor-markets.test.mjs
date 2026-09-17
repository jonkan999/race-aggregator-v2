import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { transliterateForSlug } from '../src/lib/slugifyShared.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function loadYaml(relativePath) {
  return yaml.load(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function slugify(input, countryCode) {
  let s = transliterateForSlug(input, countryCode);
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.replace(/[^a-z0-9\s-]/g, '');
  s = s.replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');
  return s;
}

function raceListSlug(content, countryCode) {
  const primaryLabel = String(content.navigation?.['race-list'] ?? '').trim();
  const fallbackLabel = String(content.race_list_name ?? content.page_name ?? '').trim();
  return slugify(primaryLabel, countryCode) || slugify(fallbackLabel, countryCode) || 'race-calendar';
}

function enabledMarkets() {
  return (loadJson('config/deploy-markets.json').markets ?? []).filter(
    (entry) => entry.enabled !== false && String(entry.productionDomain ?? '').trim(),
  );
}

function enabledCodes() {
  return new Set(enabledMarkets().map((entry) => String(entry.marketCode).toLowerCase()));
}

function liveNeighbors(hostCode) {
  const listed = loadJson('config/neighbor-markets.json').markets[hostCode] ?? [];
  const enabled = enabledCodes();
  return listed
    .map((code) => String(code).toLowerCase())
    .filter((code) => enabled.has(code) && code !== hostCode);
}

function productionHref(marketCode, locale) {
  const market = enabledMarkets().find(
    (entry) => String(entry.marketCode).toLowerCase() === marketCode,
  );
  assert.ok(market?.productionDomain, `enabled production domain for ${marketCode}`);
  const useEnglish = locale === 'en';
  const content = loadYaml(
    useEnglish
      ? `data/countries/${marketCode}/merged_index_int.yaml`
      : `data/countries/${marketCode}/index.yaml`,
  );
  const prefix = useEnglish ? '/en/' : '/';
  return `https://${String(market.productionDomain).replace(/\/+$/, '')}${prefix}${raceListSlug(content, marketCode)}/`;
}

test('every enabled deploy market has at least one enabled neighbor', () => {
  for (const code of enabledCodes()) {
    const live = liveNeighbors(code);
    assert.ok(live.length > 0, `${code} should list at least one enabled Aggregatory neighbor`);
  }
});

test('Denmark lists Sweden and Germany as live neighbors', () => {
  assert.deepEqual(liveNeighbors('dk'), ['se', 'de']);
});

test('Nordic/Baltic live markets cross-link each other', () => {
  const neighbors = loadJson('config/neighbor-markets.json').markets;
  assert.ok(neighbors.se.includes('dk') && neighbors.se.includes('fi') && neighbors.se.includes('ee'));
  assert.ok(neighbors.fi.includes('se') && neighbors.fi.includes('ee'));
  assert.ok(neighbors.ee.includes('lt') && neighbors.ee.includes('fi'));
  assert.ok(neighbors.lt.includes('ee') && neighbors.lt.includes('se'));
});

test('neighbor race-list hrefs use production domains and market-owned slugs', () => {
  assert.equal(productionHref('se', 'native'), 'https://loppkartan.se/loppkalender/');
  assert.equal(productionHref('se', 'en'), 'https://loppkartan.se/en/race-calendar/');
  assert.equal(productionHref('dk', 'native'), 'https://lobskalender.dk/lobekalender/');
  assert.equal(productionHref('fi', 'native'), 'https://suomi-juoksu.fi/juoksukalenteri/');
  assert.equal(productionHref('de', 'native'), 'https://laufrennen.de/laufkalender/');
  assert.ok(productionHref('lt', 'native').startsWith('https://bkmaratonas.lt/'));
  assert.ok(productionHref('ee', 'native').startsWith('https://jooksma.ee/'));
});

test('Norway stays configured but is omitted until it is an enabled deploy market', () => {
  assert.ok(loadJson('config/neighbor-markets.json').markets.dk.includes('no'));
  assert.ok(!liveNeighbors('dk').includes('no'));
});

test('Netherlands lists Germany as a live neighbor and keeps Belgium until it is enabled', () => {
  const neighbors = loadJson('config/neighbor-markets.json').markets;
  assert.deepEqual(neighbors.nl, ['de', 'be']);
  assert.ok(neighbors.de.includes('nl'));
  assert.deepEqual(neighbors.be, ['nl', 'de']);
  assert.deepEqual(liveNeighbors('nl'), ['de']);
  assert.ok(!liveNeighbors('nl').includes('be'));
  assert.ok(!liveNeighbors('de').includes('nl'));
});
