#!/usr/bin/env node
/**
 * Writes public/markers-{country}.json for the map island.
 * Uses Supabase when SUPABASE_URL + SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are set;
 * otherwise reads the neighbor-aware data file when available (no DB required).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCountriesRoot, resolveCountryArg } from './lib/market-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const countriesRoot = resolveCountriesRoot(root);
const country = resolveCountryArg(process.argv[2]);

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

function readSupplementalJson() {
  const fp = fs.existsSync(path.join(countriesRoot, country, 'final_races_w_neighbors.json'))
    ? path.join(countriesRoot, country, 'final_races_w_neighbors.json')
    : path.join(countriesRoot, country, 'final_races.json');
  if (!fs.existsSync(fp)) return new Map();
  const rows = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return new Map(rows.map((row) => [row.domain_name, row]));
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
