/**
 * Build-time snapshot for race list page 1 (no filters).
 * Prefer Supabase when server env has URL + secret; otherwise read repo JSON (CI/dev without DB).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { resolveMarketDataRoot } from './market';
import { RACE_LIST_PAGE_SIZE } from './raceListConfig';
import { isDomesticOrigin } from './neighboringSelection';
import type { RaceListRow, RaceTranslationRow } from './raceListRow';
import { compareRaceRowsByRelevantDate } from './upcomingRaceWindow';

export type SsgRaceRow = RaceListRow;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const countriesRoot = resolveMarketDataRoot(path.join(repoRoot, 'data', 'countries'));
const allRowsCache = new Map<string, Promise<{ rows: SsgRaceRow[]; source: RaceListSsgSource }>>();
const snapshotCache = new Map<
  string,
  Promise<{
    rows: SsgRaceRow[];
    total: number;
    source: RaceListSsgSource;
  }>
>();

export type RaceListSnapshotFilters = {
  county?: string | null;
  raceType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  month?: number | null;
  distanceMinKm?: number | null;
  distanceMaxKm?: number | null;
  originCountry?: string | null;
  includeNeighboring?: boolean | null;
};

export function todayYyyyMmDdForSsg(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function oneYearFromTodayYyyyMmDdForSsg(now = new Date()): string {
  const next = new Date(now);
  next.setFullYear(next.getFullYear() + 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function defaultUpcomingRaceListFilters(now = new Date()): RaceListSnapshotFilters {
  return {
    dateFrom: todayYyyyMmDdForSsg(now),
    dateTo: oneYearFromTodayYyyyMmDdForSsg(now),
  };
}

function compareRaceRowsByDateThenDomain(
  a: SsgRaceRow,
  b: SsgRaceRow,
  startComparable?: string | null,
  endComparable?: string | null,
): number {
  return compareRaceRowsByRelevantDate(a, b, startComparable, endComparable);
}

function dataCountryDir(code: string): string {
  return path.join(countriesRoot, code);
}

function buildSnapshotPath(countryCode: string): string | null {
  const dir = process.env.RACE_LIST_BUILD_SNAPSHOT_DIR?.trim();
  if (!dir) return null;
  return path.join(dir, `${countryCode}.json`);
}

function normalizeComparableDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replaceAll('-', '').trim();
  return /^\d{8}$/.test(digits) ? digits : null;
}

function parseMonthFromYyyymmdd(raw: string | null): number | null {
  if (!raw || raw.length < 6) return null;
  const month = Number.parseInt(raw.slice(4, 6), 10);
  return Number.isFinite(month) ? month : null;
}

function raceHasMonth(row: SsgRaceRow, month: number | null | undefined): boolean {
  if (!month) return true;
  if (!Array.isArray(row.race_dates)) return false;
  return row.race_dates.some((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') return false;
    return parseMonthFromYyyymmdd(entry[0]) === month;
  });
}

function raceHasDateInRange(
  row: SsgRaceRow,
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
): boolean {
  const from = normalizeComparableDate(dateFrom);
  const to = normalizeComparableDate(dateTo);
  if (!from && !to) return true;
  if (!Array.isArray(row.race_dates)) return false;
  return row.race_dates.some((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') return false;
    const candidate = normalizeComparableDate(entry[0]);
    if (!candidate) return false;
    if (from && candidate < from) return false;
    if (to && candidate > to) return false;
    return true;
  });
}

function raceHasDistanceInRange(
  row: SsgRaceRow,
  minKm: number | null | undefined,
  maxKm: number | null | undefined,
): boolean {
  if (minKm == null && maxKm == null) return true;
  if (!Array.isArray(row.distance_m) || row.distance_m.length === 0) return false;
  return row.distance_m.some((value) => {
    const meters =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseFloat(value)
          : Number.NaN;
    if (!Number.isFinite(meters)) return false;
    const km = meters / 1000;
    if (minKm != null && km < minKm) return false;
    if (maxKm != null && km > maxKm) return false;
    return true;
  });
}

function applySnapshotFilters(
  rows: SsgRaceRow[],
  countryCode: string,
  filters: RaceListSnapshotFilters,
): SsgRaceRow[] {
  const county = filters.county?.trim().toLowerCase() ?? '';
  const raceType = filters.raceType?.trim().toLowerCase() ?? '';
  const originCountry = filters.originCountry?.trim().toLowerCase() ?? '';
  const includeNeighboring = Boolean(filters.includeNeighboring);
  return rows.filter((row) => {
    const rowOriginCountry = row.origin_country?.trim().toLowerCase() ?? '';
    const isDomestic = isDomesticOrigin(rowOriginCountry, countryCode);

    if (includeNeighboring) {
      if (isDomestic) return false;
    } else if (originCountry) {
      if (rowOriginCountry !== originCountry) return false;
    } else if (!isDomestic) {
      return false;
    }

    if (county) {
      const rowCounty = row.county?.trim().toLowerCase() ?? '';
      if (!rowCounty.includes(county)) return false;
    }
    if (raceType) {
      const rowRaceType = row.race_type?.trim().toLowerCase() ?? '';
      if (rowRaceType !== raceType) return false;
    }
    if (!raceHasMonth(row, filters.month)) return false;
    if (!raceHasDateInRange(row, filters.dateFrom, filters.dateTo)) return false;
    if (!raceHasDistanceInRange(row, filters.distanceMinKm, filters.distanceMaxKm)) return false;
    return true;
  });
}

function loadAllRowsFromJson(countryCode: string): SsgRaceRow[] {
  const base = dataCountryDir(countryCode);
  const localPath = fs.existsSync(path.join(base, 'final_races_w_neighbors.json'))
    ? path.join(base, 'final_races_w_neighbors.json')
    : path.join(base, 'final_races.json');
  if (!fs.existsSync(localPath)) {
    return [];
  }
  const localRaces = JSON.parse(fs.readFileSync(localPath, 'utf8')) as Record<string, unknown>[];
  const intPath = fs.existsSync(path.join(base, 'final_races_w_neighbors_int.json'))
    ? path.join(base, 'final_races_w_neighbors_int.json')
    : path.join(base, 'final_races_int.json');
  const intRaces: Record<string, unknown>[] = fs.existsSync(intPath)
    ? JSON.parse(fs.readFileSync(intPath, 'utf8'))
    : [];
  const intByDomain = new Map(intRaces.map((r) => [r.domain_name as string, r]));

  const rows: SsgRaceRow[] = localRaces.map((r) => {
    const domain = r.domain_name as string;
    const ir = intByDomain.get(domain) as Record<string, string | null | undefined> | undefined;
    const translations: RaceTranslationRow[] = [
      {
        locale: 'sv',
        name: (r.name as string) ?? null,
        type_local: (r.type_local as string) ?? null,
        distance_verbose: (r.distance_verbose as string) ?? null,
        description: (r.description as string) ?? null,
      },
    ];
    if (ir) {
      translations.push({
        locale: 'en',
        name: ir.name ?? null,
        type_local: ir.type_local ?? null,
        distance_verbose: ir.distance_verbose ?? null,
        description: ir.description ?? null,
      });
    }
    const id = String((r.consolidated_ids as string[])?.[0] ?? domain);
    return {
      id,
      domain_name: domain,
      county: (r.county as string) ?? null,
      race_type: (r.type as string) ?? null,
      origin_country: (r.origin_country as string) ?? countryCode,
      race_dates: r.race_dates ?? [],
      latitude: (r.latitude as number) ?? null,
      longitude: (r.longitude as number) ?? null,
      distance_m: r.distance_m ?? null,
      website: (r.website as string) ?? null,
      payload: r as Record<string, unknown>,
      race_translations: translations,
    };
  });

  rows.sort(compareRaceRowsByDateThenDomain);
  return rows;
}

function loadAllRowsFromBuildSnapshot(countryCode: string): SsgRaceRow[] | null {
  const snapshotPath = buildSnapshotPath(countryCode);
  if (!snapshotPath || !fs.existsSync(snapshotPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as {
      rows?: SsgRaceRow[];
    };
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    return [...rows].sort(compareRaceRowsByDateThenDomain);
  } catch {
    return null;
  }
}

const listSelect =
  'id, domain_name, county, race_type, origin_country, race_dates, latitude, longitude, distance_m, website, payload, race_translations ( locale, name, type_local, distance_verbose, description )';

async function loadAllRowsFromSupabase(countryCode: string): Promise<SsgRaceRow[] | null> {
  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !secret?.trim()) return null;

  try {
    const sb = createClient(url, secret);
    const { data, error: dataErr } = await sb
      .from('races')
      .select(listSelect)
      .eq('country_code', countryCode)
      .eq('published', true)
      .limit(5000);
    if (dataErr || !data) return null;
    return [...(data as unknown as SsgRaceRow[])].sort(compareRaceRowsByDateThenDomain);
  } catch {
    return null;
  }
}

export type RaceListSsgSource = 'supabase' | 'json' | 'empty';

export async function getAllRaceListRows(countryCode: string): Promise<{
  rows: SsgRaceRow[];
  source: RaceListSsgSource;
}> {
  const cacheKey = countryCode;
  const cached = allRowsCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    const fromSnapshot = loadAllRowsFromBuildSnapshot(countryCode);
    if (fromSnapshot && fromSnapshot.length > 0) {
      return { rows: fromSnapshot, source: 'json' as const };
    }

    const fromDb = await loadAllRowsFromSupabase(countryCode);
    const fromJson = loadAllRowsFromJson(countryCode);
    if (fromDb && fromDb.length > 0) {
      if (fromJson.length > fromDb.length) {
        return { rows: fromJson, source: 'json' as const };
      }
      return { rows: fromDb, source: 'supabase' as const };
    }
    if (fromJson.length > 0) {
      return { rows: fromJson, source: 'json' as const };
    }
    return { rows: [], source: 'empty' as const };
  })();

  allRowsCache.set(cacheKey, pending);
  return pending;
}

export async function getRaceListSnapshot(
  countryCode: string,
  filters: RaceListSnapshotFilters = {},
  page = 1,
  pageSize = RACE_LIST_PAGE_SIZE,
): Promise<{
  rows: SsgRaceRow[];
  total: number;
  source: RaceListSsgSource;
}> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const cacheKey = JSON.stringify({
    countryCode,
    filters,
    page: safePage,
    pageSize: safePageSize,
  });
  const cached = snapshotCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    const all = await getAllRaceListRows(countryCode);
    const filtered = applySnapshotFilters(all.rows, countryCode, filters);
    const startComparable = normalizeComparableDate(filters.dateFrom);
    const endComparable = normalizeComparableDate(filters.dateTo);
    filtered.sort((left, right) =>
      compareRaceRowsByDateThenDomain(left, right, startComparable, endComparable),
    );
    const start = (safePage - 1) * safePageSize;
    return {
      rows: filtered.slice(start, start + safePageSize),
      total: filtered.length,
      source: all.source,
    };
  })();

  snapshotCache.set(cacheKey, pending);
  return pending;
}

export async function getRaceListFirstPageSnapshot(countryCode: string): Promise<{
  rows: SsgRaceRow[];
  total: number;
  source: RaceListSsgSource;
}> {
  const snapshot = await getRaceListSnapshot(countryCode, defaultUpcomingRaceListFilters());
  if (snapshot.total > 0 || snapshot.rows.length > 0) {
    return snapshot;
  }
  return { rows: [], total: 0, source: 'empty' };
}
