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
import { getNativeLocaleForCountry, resolveCountriesRoot, resolveCountryArg } from './lib/market-config.mjs';
import { raceColumns, raceTranslations } from './lib/race-rows.mjs';
import { loadSeedState, planSeed, saveSeedState, SEED_STATE_VERSION, seedStatePath } from './lib/seed-plan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const countriesRoot = resolveCountriesRoot(root);

const args = process.argv.slice(2);
const flags = new Set(args.filter((value) => value.startsWith('--')));
const positional = args.filter((value) => !value.startsWith('--'));
const country = resolveCountryArg(positional[0]);
const nativeLocale = getNativeLocaleForCountry(root, country);
const replaceExisting = flags.has('--replace');
const forceAll = flags.has('--force') || replaceExisting;
const BATCH_SIZE = 100;
const showHelp = flags.has('--help') || flags.has('-h');

if (showHelp) {
  console.log(`Usage: node scripts/seed-races.mjs [country] [--replace]

Options:
  --replace   Delete existing races for the selected country before seeding
  --force     Rewrite every race even if unchanged since the last seed
              (unchanged races are otherwise skipped; a full rewrite still
              happens automatically at least every 7 days)
  --help      Show this help message`);
  process.exit(0);
}

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
  const fp = path.join(countriesRoot, country, name);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function racePayload(race) {
  return {
    country_code: country,
    ...raceColumns(race),
    payload: race,
    published: true,
    updated_at: new Date().toISOString(),
  };
}

async function loadDbPublishedByDomain() {
  const byDomain = new Map();
  let lastId = null;
  for (;;) {
    let query = sb
      .from('races')
      .select('id, domain_name, published')
      .eq('country_code', country)
      .order('id', { ascending: true })
      .limit(1000);
    if (lastId) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const row of data) byDomain.set(row.domain_name, row.published === true);
    lastId = data[data.length - 1].id;
  }
  return byDomain;
}

async function writeBatch(batch, intByDomain) {
  const { data: upserted, error: upErr } = await sb
    .from('races')
    .upsert(batch.map(racePayload), { onConflict: 'country_code,domain_name' })
    .select('id, domain_name');
  if (upErr) throw upErr;
  const idByDomain = new Map((upserted ?? []).map((row) => [row.domain_name, row.id]));
  const missing = batch.filter((race) => !idByDomain.has(race.domain_name));
  if (missing.length > 0) throw new Error(`Upsert returned no id for ${missing.map((r) => r.domain_name).join(', ')}`);

  const nativeRows = [];
  const enRows = [];
  for (const race of batch) {
    const raceId = idByDomain.get(race.domain_name);
    const [native, en] = raceTranslations(race, intByDomain.get(race.domain_name), nativeLocale);
    nativeRows.push({ race_id: raceId, ...native });
    if (en) enRows.push({ race_id: raceId, ...en });
  }

  const { error: svErr } = await sb.from('race_translations').upsert(nativeRows, { onConflict: 'race_id,locale' });
  if (svErr) throw svErr;

  if (nativeLocale !== 'sv') {
    const { error: cleanupErr } = await sb
      .from('race_translations')
      .delete()
      .in('race_id', [...idByDomain.values()])
      .eq('locale', 'sv');
    if (cleanupErr) throw cleanupErr;
  }

  if (enRows.length > 0) {
    const { error: enErr } = await sb.from('race_translations').upsert(enRows, { onConflict: 'race_id,locale' });
    if (enErr) throw enErr;
  }
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

  console.warn(
    `Seeding ${country} from ${sourceLocal} + ${sourceInt}${replaceExisting ? ' (replace mode)' : ''}`,
  );

  if (replaceExisting) {
    const { error: deleteErr } = await sb.from('races').delete().eq('country_code', country);
    if (deleteErr) throw deleteErr;
    console.warn(`Deleted existing races for ${country}.`);
  }

  const statePath = seedStatePath(root, country);
  const previousState = loadSeedState(statePath);
  const dbPublishedByDomain = await loadDbPublishedByDomain();
  const plan = planSeed({
    races: fallbackLocalRaces,
    intByDomain,
    nativeLocale,
    state: previousState,
    dbPublishedByDomain,
    force: forceAll,
  });
  console.warn(
    `${plan.full ? 'Full' : 'Incremental'} seed: ${plan.toWrite.length} to write, ${plan.skipped} unchanged skipped (${plan.unique.length} unique races).`,
  );

  // Keep fingerprints only for races written now or skipped as unchanged.
  const entries = {};
  if (!plan.full) {
    for (const race of plan.unique) {
      const fp = plan.fingerprints.get(race.domain_name);
      if (previousState?.entries?.[race.domain_name] === fp) entries[race.domain_name] = fp;
    }
  }
  const persist = (completedFull) =>
    saveSeedState(statePath, {
      version: SEED_STATE_VERSION,
      country,
      fullSeedAt: completedFull ? new Date().toISOString() : (plan.full ? null : previousState?.fullSeedAt ?? null),
      updatedAt: new Date().toISOString(),
      entries,
    });

  let n = 0;
  try {
    for (let i = 0; i < plan.toWrite.length; i += BATCH_SIZE) {
      const batch = plan.toWrite.slice(i, i + BATCH_SIZE);
      await writeBatch(batch, intByDomain);
      for (const race of batch) entries[race.domain_name] = plan.fingerprints.get(race.domain_name);
      n += batch.length;
      if (n % 1000 < BATCH_SIZE) console.warn(`Upserted ${n} races…`);
    }
  } catch (err) {
    persist(false);
    throw err;
  }
  persist(plan.full);

  // Unpublish rows for slugs merged away as duplicates (they 308 to the survivor via
  // config/redirects/merged-duplicate-races.json). Plain upserts never touch them.
  // Rows are kept (published=false), never deleted.
  const redirectsPath = path.join(__dirname, '..', 'config', 'redirects', 'merged-duplicate-races.json');
  if (fs.existsSync(redirectsPath)) {
    const seeded = new Set(fallbackLocalRaces.map((r) => r.domain_name));
    const merged = new Set();
    for (const r of JSON.parse(fs.readFileSync(redirectsPath, 'utf8')).redirects ?? []) {
      const slug = String(r.source ?? '').split('/').filter(Boolean).at(-2);
      if (slug && !seeded.has(slug)) merged.add(slug);
    }
    const stale = [...merged];
    for (let i = 0; i < stale.length; i += 200) {
      const { data: gone, error: pruneErr } = await sb
        .from('races')
        .update({ published: false })
        .eq('country_code', country)
        .eq('published', true)
        .in('domain_name', stale.slice(i, i + 200))
        .select('domain_name');
      if (pruneErr) throw pruneErr;
      if (gone?.length) console.warn(`Unpublished ${gone.length} merged duplicate rows for ${country}.`);
    }
  }

  console.warn(`Done. Upserted ${n} races for ${country} (${plan.skipped} unchanged skipped).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
