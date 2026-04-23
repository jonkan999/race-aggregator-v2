#!/usr/bin/env node
/**
 * Writes public/markers-{country}.json for the map island.
 * Prefers the temporary build snapshot when available so deploy builds can reuse the
 * same single export that feeds the race-list SSG flow. Otherwise uses Supabase when
 * SUPABASE_URL + SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are set;
 * otherwise reads the neighbor-aware data file when available (no DB required).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNativeLocaleForCountry, resolveCountriesRoot, resolveCountryArg } from './lib/market-config.mjs';
import { loadLocalEnvFiles } from './lib/load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const countriesRoot = resolveCountriesRoot(root);
const country = resolveCountryArg(process.argv[2]);
const nativeLocale = getNativeLocaleForCountry(root, country);
loadLocalEnvFiles(root);

function writeMarkers(markers) {
  const outDir = path.join(root, 'public');
  fs.mkdirSync(outDir, { recursive: true });
  const body = {
    generatedAt: new Date().toISOString(),
    country,
    markers,
  };
  const dest = path.join(outDir, `markers-${country}.json`);
  fs.writeFileSync(dest, JSON.stringify(body));
  console.warn(`Wrote ${dest} (${markers.length} markers)`);
}

function firstYyyymmdd(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return null;
  const first = dates[0];
  if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  return null;
}

function decorateMarker(base, supplement) {
  return {
    ...base,
    name: supplement?.name ?? base.domain_name,
    location: supplement?.location ?? null,
    distance_verbose: supplement?.distance_verbose ?? null,
    race_date: firstYyyymmdd(supplement?.race_dates) ?? null,
    type_local: supplement?.type_local ?? null,
    website: supplement?.website ?? null,
  };
}

function translationForLocale(row, locale) {
  if (!Array.isArray(row?.race_translations)) return null;
  const match = row.race_translations.find(
    (entry) => entry && typeof entry === 'object' && entry.locale === locale,
  );
  return match && typeof match === 'object' ? match : null;
}

function fromJsonRace(r) {
  return decorateMarker({
    id: String(r.consolidated_ids?.[0] ?? r.domain_name),
    domain_name: r.domain_name,
    latitude: r.latitude,
    longitude: r.longitude,
    county: r.county ?? null,
    race_type: r.type ?? null,
    origin_country: r.origin_country ?? country,
  }, r);
}

function fromSnapshotRow(row, countryCode) {
  const nativeTranslation = translationForLocale(row, nativeLocale);
  const payload =
    row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
  return decorateMarker(
    {
      id: String(row.id ?? row.domain_name),
      domain_name: row.domain_name,
      latitude: row.latitude,
      longitude: row.longitude,
      county: row.county ?? null,
      race_type: row.race_type ?? null,
      origin_country: row.origin_country ?? countryCode,
    },
    {
      name: nativeTranslation?.name ?? payload.name ?? row.domain_name,
      location: payload.location ?? null,
      distance_verbose: nativeTranslation?.distance_verbose ?? payload.distance_verbose ?? null,
      race_dates: row.race_dates ?? payload.race_dates ?? [],
      type_local: nativeTranslation?.type_local ?? payload.type_local ?? null,
      website: row.website ?? payload.website ?? null,
    },
  );
}

function readSupplementalJson() {
  const fp = fs.existsSync(path.join(countriesRoot, country, 'final_races_w_neighbors.json'))
    ? path.join(countriesRoot, country, 'final_races_w_neighbors.json')
    : path.join(countriesRoot, country, 'final_races.json');
  if (!fs.existsSync(fp)) return new Map();
  const rows = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return new Map(rows.map((row) => [row.domain_name, row]));
}

function readSnapshotMarkers() {
  const snapshotDir = process.env.RACE_LIST_BUILD_SNAPSHOT_DIR?.trim();
  if (!snapshotDir) return null;

  const snapshotPath = path.join(snapshotDir, `${country}.json`);
  if (!fs.existsSync(snapshotPath)) return null;

  const parsed = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  return rows
    .filter((row) => row?.latitude != null && row?.longitude != null)
    .map((row) => fromSnapshotRow(row, country));
}

async function fromDatabase(supplementByDomain) {
  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key);
  const { data, error } = await sb
    .from('races')
    .select('id, domain_name, latitude, longitude, county, race_type, origin_country')
    .eq('country_code', country)
    .eq('published', true);
  if (error) throw error;
  return (data ?? []).map((row) =>
    decorateMarker(
      {
        id: String(row.id),
        domain_name: row.domain_name,
        latitude: row.latitude,
        longitude: row.longitude,
        county: row.county,
        race_type: row.race_type,
        origin_country: row.origin_country ?? country,
      },
      supplementByDomain.get(row.domain_name),
    ),
  );
}

async function main() {
  const snapshotMarkers = readSnapshotMarkers();
  if (snapshotMarkers) {
    writeMarkers(snapshotMarkers);
    return;
  }

  const supplementByDomain = readSupplementalJson();
  let markers = await fromDatabase(supplementByDomain);
  if (!markers) {
    if (supplementByDomain.size === 0) {
      const resolvedPath = path.join(countriesRoot, country, 'final_races.json');
      console.error(`No database credentials and no file: ${resolvedPath}`);
      process.exit(1);
    }
    markers = Array.from(supplementByDomain.values())
      .filter((r) => r.latitude != null && r.longitude != null)
      .map(fromJsonRace);
  }
  writeMarkers(markers);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
