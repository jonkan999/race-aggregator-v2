#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getActiveMarketCode, getNativeLocaleForCountry, resolveCountriesRoot } from './lib/market-config.mjs';
import { loadLocalEnvFiles } from './lib/load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const countriesRoot = resolveCountriesRoot(root);

const legacyListSelect =
  'id, domain_name, county, race_type, origin_country, race_dates, latitude, longitude, distance_m, website, payload, race_translations ( locale, name, type_local, distance_verbose, description )';

const listSelect =
  'id, domain_name, county, race_type, origin_country, race_dates, latitude, longitude, distance_m, website, payload, race_translations ( locale, name, type_local, distance_verbose, description, additional, course_highlights )';

function missingTranslationDetailColumns(error) {
  if (!error || typeof error !== 'object') return false;
  return error.code === '42703' || String(error.message ?? '').includes('race_translations_1.additional does not exist');
}

function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function mergeRaceDetailPageViewRankings(rows, rankings) {
  const rankingByDomain = new Map(
    (Array.isArray(rankings) ? rankings : [])
      .filter((entry) => entry && typeof entry.domain_name === 'string')
      .map((entry) => [
        entry.domain_name,
        {
          count: toFiniteNumber(entry.page_views_last_30_days),
          lastViewAt: typeof entry.last_view_at === 'string' ? entry.last_view_at : null,
        },
      ]),
  );

  return rows.map((row) => {
    const payload =
      row && row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? row.payload
        : {};
    const existingAnalytics =
      payload.analytics &&
      typeof payload.analytics === 'object' &&
      !Array.isArray(payload.analytics)
        ? payload.analytics
        : {};
    const {
      page_views_last_30_days: _ignoredPageViewsLast30Days,
      views_last_30_days: _ignoredViewsLast30Days,
      last_30_days_views: _ignoredLast30DaysViews,
      last_view_at: _ignoredLastViewAt,
      ...restAnalytics
    } = existingAnalytics;
    const ranking = rankingByDomain.get(row.domain_name);
    const nextPayload = { ...payload };

    if (ranking?.count != null && ranking.count > 0) {
      nextPayload.analytics = {
        ...restAnalytics,
        page_views_last_30_days: ranking.count,
        last_view_at: ranking.lastViewAt,
      };
    } else if (Object.keys(restAnalytics).length > 0) {
      nextPayload.analytics = restAnalytics;
    } else {
      delete nextPayload.analytics;
    }

    return {
      ...row,
      payload: nextPayload,
    };
  });
}

async function loadRaceDetailPageViewRankings(sb, countryCode) {
  const { data, error } = await sb.rpc('get_race_detail_page_view_rankings', {
    p_country_code: countryCode,
    p_days: 30,
    p_limit: 5000,
  });

  if (error) {
    if (error.code === 'PGRST202') {
      console.warn(
        `Skipping race-detail rankings for ${countryCode}: get_race_detail_page_view_rankings is not available in the connected Supabase schema yet.`,
      );
      return [];
    }
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

function loadRowsFromJson(countryCode) {
  const nativeLocale = getNativeLocaleForCountry(root, countryCode);
  const countryDir = path.join(countriesRoot, countryCode);
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
          locale: nativeLocale,
          name: row.name ?? null,
          type_local: row.type_local ?? null,
          distance_verbose: row.distance_verbose ?? null,
          description: row.description ?? null,
          additional:
            typeof row.additional === 'string'
              ? row.additional
              : typeof row.additional_info === 'string'
                ? row.additional_info
                : null,
          course_highlights: Array.isArray(row.course_highlights)
            ? row.course_highlights.filter((entry) => typeof entry === 'string')
            : null,
        },
        ...(intRow
          ? [
              {
                locale: 'en',
                name: intRow.name ?? null,
                type_local: intRow.type_local ?? null,
                distance_verbose: intRow.distance_verbose ?? null,
                description: intRow.description ?? null,
                additional:
                  typeof intRow.additional === 'string'
                    ? intRow.additional
                    : typeof intRow.additional_info === 'string'
                      ? intRow.additional_info
                      : null,
                course_highlights: Array.isArray(intRow.course_highlights)
                  ? intRow.course_highlights.filter((entry) => typeof entry === 'string')
                  : null,
              },
            ]
          : []),
      ],
    };
  });
}

function mergeTranslationDetailFields(primaryRows, fallbackRows) {
  const fallbackByDomain = new Map(fallbackRows.map((row) => [row.domain_name, row]));

  return primaryRows.map((row) => {
    const fallbackRow = fallbackByDomain.get(row.domain_name);
    if (!fallbackRow) return row;

    const translations = Array.isArray(row.race_translations) ? row.race_translations : [];
    const fallbackTranslations = Array.isArray(fallbackRow.race_translations)
      ? fallbackRow.race_translations
      : [];
    const fallbackByLocale = new Map(fallbackTranslations.map((entry) => [entry.locale, entry]));
    const mergedTranslations = translations.map((entry) => {
      const fallback = fallbackByLocale.get(entry.locale);
      if (!fallback) return entry;

      const currentHighlights = Array.isArray(entry.course_highlights) ? entry.course_highlights : [];
      const fallbackHighlights = Array.isArray(fallback.course_highlights)
        ? fallback.course_highlights
        : null;

      return {
        ...entry,
        additional:
          typeof entry.additional === 'string' && entry.additional.trim().length > 0
            ? entry.additional
            : fallback.additional ?? null,
        course_highlights:
          currentHighlights.length > 0 ? currentHighlights : fallbackHighlights,
      };
    });

    for (const fallback of fallbackTranslations) {
      if (mergedTranslations.some((entry) => entry.locale === fallback.locale)) continue;
      mergedTranslations.push(fallback);
    }

    return {
      ...row,
      race_translations: mergedTranslations,
    };
  });
}

function listCountryCodes() {
  const countriesDir = countriesRoot;
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
  return [getActiveMarketCode()];
}

function resolveOutputDir() {
  const dir =
    process.env.RACE_LIST_BUILD_SNAPSHOT_DIR ||
    path.join(root, '.cache', 'race-list-build-snapshots');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function exportCountrySnapshot(sb, countryCode, outputDir) {
  let { data, error } = await sb
    .from('races')
    .select(listSelect)
    .eq('country_code', countryCode)
    .eq('published', true)
    .limit(5000);

  if (error && missingTranslationDetailColumns(error)) {
    const legacyResponse = await sb
      .from('races')
      .select(legacyListSelect)
      .eq('country_code', countryCode)
      .eq('published', true)
      .limit(5000);
    data = legacyResponse.data;
    error = legacyResponse.error;
  }

  if (error) throw error;

  const rankingData = await loadRaceDetailPageViewRankings(sb, countryCode);

  const jsonRows = loadRowsFromJson(countryCode);
  const mergedDbRows = mergeTranslationDetailFields(data ?? [], jsonRows);
  const baseRows = jsonRows.length > mergedDbRows.length ? jsonRows : mergedDbRows;
  const rows = mergeRaceDetailPageViewRankings(baseRows, rankingData ?? []);
  const source = jsonRows.length > mergedDbRows.length ? 'json' : 'supabase';

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
  loadLocalEnvFiles(root);

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
    console.warn(
      'No countries found for build snapshot export. Expected tracked market folders under data/countries/{code}/index.yaml.',
    );
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
