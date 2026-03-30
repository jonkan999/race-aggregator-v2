#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const listSelect =
  'id, domain_name, county, race_type, origin_country, race_dates, latitude, longitude, distance_m, website, payload, race_translations ( locale, name, type_local, distance_verbose, description )';

function loadRowsFromJson(countryCode) {
  const countryDir = path.join(root, 'data', 'countries', countryCode);
  const localPath = fs.existsSync(path.join(countryDir, 'final_races_w_neighbors.json'))
    ? path.join(countryDir, 'final_races_w_neighbors.json')
    : path.join(countryDir, 'final_races.json');
  if (!fs.existsSync(localPath)) return [];

  const localRows = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  const intPath = fs.existsSync(path.join(countryDir, 'final_races_w_neighbors_int.json'))
    ? path.join(countryDir, 'final_races_w_neighbors_int.json')
    : path.join(countryDir, 'final_races_int.json');
  const intRows = fs.existsSync(intPath) ? JSON.parse(fs.readFileSync(intPath, 'utf8')) : [];
  const intByDomain = new Map(intRows.map((row) => [row.domain_name, row]));

  return localRows.map((row) => {
    const intRow = intByDomain.get(row.domain_name);
    return {
      id: String(row.consolidated_ids?.[0] ?? row.domain_name),
      domain_name: row.domain_name,
      county: row.county ?? null,
      race_type: row.type ?? null,
      origin_country: row.origin_country ?? countryCode,
      race_dates: row.race_dates ?? [],
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      distance_m: row.distance_m ?? null,
      website: row.website ?? null,
      payload: row,
      race_translations: [
        {
          locale: 'sv',
          name: row.name ?? null,
          type_local: row.type_local ?? null,
          distance_verbose: row.distance_verbose ?? null,
          description: row.description ?? null,
        },
        ...(intRow
          ? [
              {
                locale: 'en',
                name: intRow.name ?? null,
                type_local: intRow.type_local ?? null,
                distance_verbose: intRow.distance_verbose ?? null,
                description: intRow.description ?? null,
              },
            ]
          : []),
      ],
    };
  });
}

function loadEnvFile() {
  const candidates = ['.env', '.env.local', '.env.development'];
  for (const name of candidates) {
    const fullPath = path.join(root, name);
    if (!fs.existsSync(fullPath)) continue;
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex <= 0) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const rawValue = trimmed.slice(eqIndex + 1).trim();
      if (!key || process.env[key] != null) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}

function listCountryCodes() {
  const countriesDir = path.join(root, 'data', 'countries');
  if (!fs.existsSync(countriesDir)) return [];
  return fs
    .readdirSync(countriesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(countriesDir, entry.name, 'index.yaml')))
    .map((entry) => entry.name)
    .sort();
}

function resolveCountries(args) {
  const explicit = args.filter(Boolean).map((value) => value.toLowerCase());
  if (explicit.length > 0) return explicit;
  const fromEnv = String(process.env.BUILD_SNAPSHOT_COUNTRIES ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  return listCountryCodes();
}

function resolveOutputDir() {
  const dir =
    process.env.RACE_LIST_BUILD_SNAPSHOT_DIR ||
    path.join(root, '.cache', 'race-list-build-snapshots');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function exportCountrySnapshot(sb, countryCode, outputDir) {
  const { data, error } = await sb
    .from('races')
    .select(listSelect)
    .eq('country_code', countryCode)
    .eq('published', true)
    .limit(5000);

  if (error) throw error;

  const jsonRows = loadRowsFromJson(countryCode);
  const rows = jsonRows.length > (data ?? []).length ? jsonRows : (data ?? []);
  const source = jsonRows.length > (data ?? []).length ? 'json' : 'supabase';

  const outPath = path.join(outputDir, `${countryCode}.json`);
  const body = {
    generatedAt: new Date().toISOString(),
    countryCode,
    source,
    rows,
  };
  fs.writeFileSync(outPath, JSON.stringify(body));
  console.warn(`Wrote build snapshot ${outPath} (${body.rows.length} rows)`);
}

async function main() {
  loadEnvFile();

  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn(
      'Skipping race-list snapshot export: missing SUPABASE_URL/PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY.',
    );
    process.exit(0);
  }

  const countries = resolveCountries(process.argv.slice(2));
  if (countries.length === 0) {
    console.warn('No countries found for build snapshot export.');
    process.exit(0);
  }

  const outputDir = resolveOutputDir();
  const sb = createClient(url, key);

  for (const countryCode of countries) {
    await exportCountrySnapshot(sb, countryCode, outputDir);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
