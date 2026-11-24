import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  LIST_DESCRIPTION_EXCERPT_CHARS,
  RACE_LIST_RPC_PAYLOAD_KEYS,
  RACE_LIST_RPC_ROW_KEYS,
  RACE_LIST_RPC_TRANSLATION_KEYS,
  RACE_PAGE_PAYLOAD_KEYS,
  pickUsedRaceListRow,
  slimListPayload,
  slimPagePayload,
} from '../src/lib/raceListRpcContract.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = path.join(
  root,
  'supabase/migrations/20261124210000_list_rpc_excerpts_and_races_for_pages.sql',
);
const backupPath = path.join(root, 'supabase/backups/get_races_list_page_2026-11-24.sql');
const listIslandPath = path.join(root, 'src/components/RaceListPageIsland.tsx');
const cardDisplayPath = path.join(root, 'src/lib/raceCardDisplay.ts');
const fetchPath = path.join(root, 'src/lib/fetchRaceListPage.ts');
const apiPath = path.join(root, 'api/race-list.js');

test('freezes the get_races_list_page used-field contract', () => {
  assert.equal(LIST_DESCRIPTION_EXCERPT_CHARS, 200);
  assert.deepEqual([...RACE_LIST_RPC_ROW_KEYS], [
    'id',
    'domain_name',
    'county',
    'race_type',
    'origin_country',
    'race_dates',
    'latitude',
    'longitude',
    'distance_m',
    'website',
    'payload',
    'race_translations',
  ]);
  assert.deepEqual([...RACE_LIST_RPC_PAYLOAD_KEYS], [
    'images',
    'supplied_images',
    'supplied_at',
    'supplied_ids',
    'nearest_city',
    'nearby_cities',
    'location',
    'description',
  ]);
  assert.deepEqual([...RACE_LIST_RPC_TRANSLATION_KEYS], [
    'locale',
    'name',
    'type_local',
    'distance_verbose',
    'description',
  ]);
});

test('excerpt migration keeps the contracted keys and shortens descriptions', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const backup = fs.readFileSync(backupPath, 'utf8');
  assert.match(sql, /create or replace function public\.get_races_list_page \(/);
  assert.match(sql, /p_neighbor_countries text\[\] default null/);
  assert.match(sql, /public\.excerpt_json_text\(p\.payload -> 'description', 200\)/);
  assert.match(sql, /left\(rt\.description, 200\)/);
  assert.match(backup, /CREATE OR REPLACE FUNCTION public\.get_races_list_page/);
  assert.match(backup, /'description', p\.payload -> 'description'/);

  const payloadBlock = sql.match(
    /json_build_object\(\s*'images',[\s\S]*?public\.excerpt_json_text\(p\.payload -> 'description', 200\)\s*\)/,
  );
  assert.ok(payloadBlock, 'slim json_build_object for payload is missing');
  const payloadKeys = [...payloadBlock[0].matchAll(/'([a-z_]+)', (?:p\.payload|public\.excerpt_json_text)/g)].map((match) => match[1]);
  assert.deepEqual(payloadKeys, [...RACE_LIST_RPC_PAYLOAD_KEYS]);

  const translationBlock = sql.match(
    /json_agg\(\s*json_build_object\(\s*'locale',[\s\S]*?left\(rt\.description, 200\)\s*\)/,
  );
  assert.ok(translationBlock, 'translation json_build_object is missing');
  const translationKeys = [...translationBlock[0].matchAll(/'([a-z_]+)',/g)].map((match) => match[1]);
  assert.deepEqual(translationKeys, [...RACE_LIST_RPC_TRANSLATION_KEYS]);
});

test('races_for_pages payload keys match the page-payload contract', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /create view public\.races_for_pages/);
  const fnBlock = sql.match(
    /create or replace function public\.race_payload_for_pages\(payload jsonb\)[\s\S]*?jsonb_build_object\(([\s\S]*?)\)\s*\)\s*\)/,
  );
  assert.ok(fnBlock, 'race_payload_for_pages jsonb_build_object is missing');
  const keys = [...fnBlock[1].matchAll(/'([a-z_]+)', payload ->/g)].map((match) => match[1]);
  assert.deepEqual(keys, [...RACE_PAGE_PAYLOAD_KEYS]);
});

test('list cards and filters only read contracted payload keys', () => {
  const sources = [listIslandPath, cardDisplayPath].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const used = new Set(
    [...sources.matchAll(/payload\??\.(images|supplied_images|supplied_at|supplied_ids|nearest_city|nearby_cities|location|description|[A-Za-z_][A-Za-z0-9_]*)/g)].map(
      (match) => match[1],
    ),
  );
  for (const key of used) {
    assert.ok(
      RACE_LIST_RPC_PAYLOAD_KEYS.includes(key),
      `list UI reads payload.${key}, which is not in the RPC contract`,
    );
  }
  for (const required of [
    'images',
    'supplied_images',
    'supplied_at',
    'supplied_ids',
    'nearest_city',
    'nearby_cities',
    'location',
    'description',
  ]) {
    assert.ok(used.has(required), `expected list UI to read payload.${required}`);
  }

  const island = fs.readFileSync(listIslandPath, 'utf8');
  assert.match(island, /excerptDescription\(description\)/);
  assert.match(island, /excerptDescription\(pickDescription\(row\), 170\)/);
  const card = fs.readFileSync(cardDisplayPath, 'utf8');
  assert.match(card, /maxLen = 140/);
});

test('the list island prefers the cached same-origin API', () => {
  const island = fs.readFileSync(listIslandPath, 'utf8');
  const fetchSource = fs.readFileSync(fetchPath, 'utf8');
  const api = fs.readFileSync(apiPath, 'utf8');
  assert.match(island, /fetchRaceListPage\(rpcParams\)/);
  assert.doesNotMatch(island, /getSupabaseBrowserClient/);
  assert.match(fetchSource, /\/api\/race-list\?/);
  assert.match(fetchSource, /get_races_list_page/);
  assert.match(api, /s-maxage=1800/);
  assert.match(api, /stale-while-revalidate=86400/);
});

test('pickUsedRaceListRow keeps contracted values and drops the rest of the payload', () => {
  const used = pickUsedRaceListRow({
    id: '1',
    domain_name: 'test-race',
    county: 'Oslo',
    race_type: 'road',
    origin_country: 'no',
    race_dates: [['20260601', '20260601']],
    latitude: 59.9,
    longitude: 10.7,
    distance_m: [10000],
    website: 'https://example.no',
    payload: {
      images: [{ url: 'https://img.example/a.jpg', alt_text: 'Start' }],
      supplied_images: true,
      supplied_at: '2026-01-01',
      supplied_ids: ['abc'],
      nearest_city: 'Oslo',
      nearby_cities: ['Bærum'],
      location: 'Oslo, Norway',
      description: 'A city race',
      pipeline_log: 'secret',
      website_emails_found: ['x@example.com'],
      nearby_foreign_cities: [{ name: 'dropped' }],
    },
    race_translations: [
      {
        locale: 'no',
        name: 'Testrøpet',
        type_local: 'Gateløp',
        distance_verbose: '10 km',
        description: 'Et byløp',
        additional: 'dropped',
      },
    ],
  });
  assert.equal(used.payload.pipeline_log, undefined);
  assert.deepEqual(Object.keys(used.payload), [...RACE_LIST_RPC_PAYLOAD_KEYS]);
  assert.equal(used.payload.nearest_city, 'Oslo');
  assert.equal(used.payload.description, 'A city race');
  assert.equal(used.race_translations[0].additional, undefined);
  assert.equal(used.race_translations[0].description, 'Et byløp');
  assert.equal(slimListPayload({ nearest_city: 'Oslo', pipeline_log: 'x' }).pipeline_log, undefined);
  assert.equal(slimListPayload({ nearest_city: 'Oslo' }).nearest_city, 'Oslo');
  assert.equal(slimPagePayload({ nearest_city: 'Oslo', nearby_foreign_cities: [] }).nearby_foreign_cities, undefined);
  assert.equal(slimPagePayload({ nearest_city: 'Oslo', organizer: 'Club' }).organizer, 'Club');
});
