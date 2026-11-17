// Decides which races seed-races.mjs must write. Unchanged races (same content
// fingerprint as the last successful seed, still published in Supabase) are
// skipped so a daily publish no longer rewrites every row and its TOASTed
// payload (table bloat, WAL, thousands of API requests per market).
import fs from 'node:fs';
import path from 'node:path';
import { dedupeByDomain, raceFingerprint } from './race-rows.mjs';

export const SEED_STATE_VERSION = 1;
export const FULL_RESEED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function seedStatePath(root, country) {
  return path.join(root, '.cache', 'seed-fingerprints', `${country}.json`);
}

export function loadSeedState(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed?.version !== SEED_STATE_VERSION || typeof parsed.entries !== 'object' || !parsed.entries) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSeedState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, filePath);
}

/**
 * @param {object} opts
 * @param {object[]} opts.races        local races (may contain duplicate domains)
 * @param {Map<string, object>} opts.intByDomain
 * @param {string} opts.nativeLocale
 * @param {object|null} opts.state     previous seed state for this country
 * @param {Map<string, boolean>} opts.dbPublishedByDomain  domain -> published, for existing rows
 * @param {boolean} opts.force
 * @param {number} opts.now            ms timestamp
 */
export function planSeed({ races, intByDomain, nativeLocale, state, dbPublishedByDomain, force = false, now = Date.now() }) {
  const unique = dedupeByDomain(races);
  const fullSeedAt = Date.parse(state?.fullSeedAt ?? '');
  const stale = !Number.isFinite(fullSeedAt) || now - fullSeedAt > FULL_RESEED_MAX_AGE_MS;
  const full = force || !state || stale;
  const previous = state?.entries ?? {};
  const toWrite = [];
  const fingerprints = new Map();
  let skipped = 0;
  for (const race of unique) {
    const fp = raceFingerprint(race, intByDomain.get(race.domain_name), nativeLocale);
    fingerprints.set(race.domain_name, fp);
    const unchanged = previous[race.domain_name] === fp;
    const livePublished = dbPublishedByDomain.get(race.domain_name) === true;
    if (!full && unchanged && livePublished) {
      skipped += 1;
      continue;
    }
    toWrite.push(race);
  }
  return { full, unique, toWrite, skipped, fingerprints };
}
