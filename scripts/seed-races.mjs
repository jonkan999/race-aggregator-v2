#!/usr/bin/env node
/**
 * Upsert races + race_translations from data/countries/{country}/final_races*.json.
 * Prefers the neighbor-aware files when available. Requires SUPABASE_SECRET_KEY (sb_secret_...),
 * or temporarily SUPABASE_SERVICE_ROLE_KEY (legacy JWT) until you rotate to a secret key.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const country = (process.argv[2] || 'se').toLowerCase();

const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const elevatedKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !elevatedKey) {
  console.error(
    'Set SUPABASE_URL (or PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY (legacy)',
  );
  process.exit(1);
}

const sb = createClient(url, elevatedKey);

function loadJson(name) {
  const fp = path.join(root, 'data', 'countries', country, name);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function racePayload(race) {
  return {
    country_code: country,
    domain_name: race.domain_name,
    latitude: race.latitude ?? null,
    longitude: race.longitude ?? null,
    race_dates: race.race_dates ?? [],
    county: race.county ?? null,
    race_type: race.type ?? null,
    distance_m: race.distance_m ?? null,
    website: race.website ?? null,
    organizer: race.organizer ?? null,
    contact: race.contact ?? null,
    origin_country: race.origin_country ?? null,
    payload: race,
    published: true,
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const localRaces = loadJson('final_races_w_neighbors.json');
  const intRaces = loadJson('final_races_w_neighbors_int.json');
  const fallbackLocalRaces = localRaces.length > 0 ? localRaces : loadJson('final_races.json');
  const fallbackIntRaces = intRaces.length > 0 ? intRaces : loadJson('final_races_int.json');
  const sourceLocal = localRaces.length > 0 ? 'final_races_w_neighbors.json' : 'final_races.json';
  const sourceInt = intRaces.length > 0 ? 'final_races_w_neighbors_int.json' : 'final_races_int.json';
  const intByDomain = new Map(fallbackIntRaces.map((r) => [r.domain_name, r]));

  if (fallbackLocalRaces.length === 0) {
    console.error(`No races in ${sourceLocal} for ${country}`);
    process.exit(1);
  }

  let n = 0;
  console.warn(`Seeding ${country} from ${sourceLocal} + ${sourceInt}`);
  for (const race of fallbackLocalRaces) {
    const row = racePayload(race);
    const { data: upserted, error: upErr } = await sb
      .from('races')
      .upsert(row, { onConflict: 'country_code,domain_name' })
      .select('id')
      .single();
    if (upErr) throw upErr;
    const raceId = upserted.id;

    const sv = {
      race_id: raceId,
      locale: 'sv',
      name: race.name ?? null,
      description: race.description ?? null,
      type_local: race.type_local ?? null,
      distance_verbose: race.distance_verbose ?? null,
    };

    const { error: svErr } = await sb.from('race_translations').upsert(sv, {
      onConflict: 'race_id,locale',
    });
    if (svErr) throw svErr;

    const ir = intByDomain.get(race.domain_name);
    if (ir) {
      const en = {
        race_id: raceId,
        locale: 'en',
        name: ir.name ?? null,
        description: ir.description ?? null,
        type_local: ir.type_local ?? null,
        distance_verbose: ir.distance_verbose ?? null,
      };
      const { error: enErr } = await sb.from('race_translations').upsert(en, {
        onConflict: 'race_id,locale',
      });
      if (enErr) throw enErr;
    }

    n += 1;
    if (n % 200 === 0) console.warn(`Upserted ${n} races…`);
  }

  console.warn(`Done. Upserted ${n} races for ${country}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
