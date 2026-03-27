#!/usr/bin/env node
/**
 * Writes public/markers-{country}.json for the map island.
 * Uses Supabase when SUPABASE_URL + SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) are set;
 * otherwise reads data/countries/{country}/final_races.json (no DB required).
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const country = (process.argv[2] || 'se').toLowerCase();

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

function fromJsonRace(r) {
  return {
    id: String(r.consolidated_ids?.[0] ?? r.domain_name),
    domain_name: r.domain_name,
    latitude: r.latitude,
    longitude: r.longitude,
    county: r.county ?? null,
    race_type: r.type ?? null,
    origin_country: r.origin_country ?? country,
  };
}

async function fromDatabase() {
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
  return (data ?? []).map((row) => ({
    id: String(row.id),
    domain_name: row.domain_name,
    latitude: row.latitude,
    longitude: row.longitude,
    county: row.county,
    race_type: row.race_type,
    origin_country: row.origin_country ?? country,
  }));
}

async function main() {
  let markers = await fromDatabase();
  if (!markers) {
    const fp = path.join(root, 'data', 'countries', country, 'final_races.json');
    if (!fs.existsSync(fp)) {
      console.error(`No database credentials and no file: ${fp}`);
      process.exit(1);
    }
    const races = JSON.parse(fs.readFileSync(fp, 'utf8'));
    markers = races
      .filter((r) => r.latitude != null && r.longitude != null)
      .map(fromJsonRace);
  }
  writeMarkers(markers);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
