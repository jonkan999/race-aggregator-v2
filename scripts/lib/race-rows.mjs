// Shared mapping from a collector race object (final_races*.json) to the
// Supabase `races` columns and `race_translations` rows. seed-races.mjs writes
// exactly these shapes, so build snapshots can rebuild a row from the committed
// JSON instead of downloading the same payload back from Supabase.
import crypto from 'node:crypto';
import util from 'node:util';

function textOrNull(value) {
  return typeof value === 'string' ? value : null;
}

export function raceColumns(race) {
  return {
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
  };
}

export function translationFields(race) {
  return {
    name: race.name ?? null,
    description: race.description ?? null,
    type_local: race.type_local ?? null,
    distance_verbose: race.distance_verbose ?? null,
    additional: textOrNull(race.additional) ?? textOrNull(race.additional_info),
    course_highlights: Array.isArray(race.course_highlights)
      ? race.course_highlights.filter((entry) => typeof entry === 'string')
      : null,
  };
}

/** Translation rows (without race_id) that seed-races.mjs upserts for one race. */
export function raceTranslations(race, intRace, nativeLocale) {
  const rows = [{ locale: nativeLocale, ...translationFields(race) }];
  if (intRace) rows.push({ locale: 'en', ...translationFields(intRace) });
  return rows;
}

/** Last occurrence wins, matching the old sequential upsert order. */
export function dedupeByDomain(races) {
  const byDomain = new Map();
  for (const race of races) {
    if (!race || typeof race.domain_name !== 'string' || !race.domain_name) continue;
    byDomain.delete(race.domain_name);
    byDomain.set(race.domain_name, race);
  }
  return [...byDomain.values()];
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Content fingerprint of everything seed-races.mjs writes for one race. */
export function raceFingerprint(race, intRace, nativeLocale) {
  return crypto
    .createHash('sha256')
    .update(stableStringify({ race, translations: raceTranslations(race, intRace, nativeLocale) }))
    .digest('hex');
}

/**
 * Snapshot row (same shape as the PostgREST select with embedded
 * race_translations) rebuilt from committed JSON. `dbRow` supplies the
 * Supabase id and the stored lat/lng (double precision rounding).
 */
export function snapshotRowFromJson(race, intRace, nativeLocale, dbRow) {
  const cols = raceColumns(race);
  return {
    id: dbRow.id,
    domain_name: cols.domain_name,
    county: cols.county,
    race_type: cols.race_type,
    origin_country: cols.origin_country,
    race_dates: cols.race_dates,
    latitude: dbRow.latitude ?? null,
    longitude: dbRow.longitude ?? null,
    distance_m: cols.distance_m,
    website: cols.website,
    payload: race,
    race_translations: raceTranslations(race, intRace, nativeLocale),
  };
}

const TRANSLATION_COMPARE_FIELDS = ['name', 'description', 'type_local', 'distance_verbose', 'additional'];

/** Returns a list of differences between a full Supabase row and a JSON-rebuilt row. */
export function diffSnapshotRows(dbRow, jsonRow) {
  const diffs = [];
  for (const key of ['domain_name', 'county', 'race_type', 'origin_country', 'race_dates', 'distance_m', 'website', 'payload']) {
    if (!util.isDeepStrictEqual(dbRow?.[key] ?? null, jsonRow?.[key] ?? null)) diffs.push(key);
  }
  const dbTranslations = new Map((dbRow?.race_translations ?? []).map((entry) => [entry.locale, entry]));
  const jsonTranslations = new Map((jsonRow?.race_translations ?? []).map((entry) => [entry.locale, entry]));
  for (const locale of new Set([...dbTranslations.keys(), ...jsonTranslations.keys()])) {
    const a = dbTranslations.get(locale);
    const b = jsonTranslations.get(locale);
    if (!a || !b) {
      diffs.push(`translation:${locale}:${a ? 'only-db' : 'only-json'}`);
      continue;
    }
    for (const field of TRANSLATION_COMPARE_FIELDS) {
      if ((a[field] ?? null) !== (b[field] ?? null)) diffs.push(`translation:${locale}:${field}`);
    }
    const ah = Array.isArray(a.course_highlights) ? a.course_highlights : [];
    const bh = Array.isArray(b.course_highlights) ? b.course_highlights : [];
    if (!util.isDeepStrictEqual(ah, bh)) diffs.push(`translation:${locale}:course_highlights`);
  }
  return diffs;
}

/** Evenly spread sample of up to `size` items (deterministic). */
export function spreadSample(items, size) {
  if (items.length <= size) return [...items];
  const out = [];
  const step = items.length / size;
  for (let i = 0; i < size; i += 1) out.push(items[Math.floor(i * step)]);
  return out;
}
