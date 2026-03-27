/**
 * Build-time snapshot for race list page 1 (no filters).
 * Prefer Supabase when server env has URL + secret; otherwise read repo JSON (CI/dev without DB).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { RACE_LIST_PAGE_SIZE } from './raceListConfig';
import type { RaceListRow } from './raceListRow';

export type SsgRaceRow = RaceListRow;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function firstRaceDateValue(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const first = raw[0];
  if (!Array.isArray(first) || typeof first[0] !== 'string') return null;
  const candidate = first[0].trim();
  if (!/^\d{8}$/.test(candidate)) return null;
  return candidate;
}

function compareRaceRowsByDateThenDomain(a: SsgRaceRow, b: SsgRaceRow): number {
  const da = firstRaceDateValue(a.race_dates);
  const db = firstRaceDateValue(b.race_dates);
  if (da && db) {
    if (da !== db) return da.localeCompare(db);
  } else if (da) {
    return -1;
  } else if (db) {
    return 1;
  }
  return a.domain_name.localeCompare(b.domain_name, 'sv');
}

function dataCountryDir(code: string): string {
  return path.join(repoRoot, 'data', 'countries', code);
}

function loadFirstPageFromJson(countryCode: string): { rows: SsgRaceRow[]; total: number } {
  const base = dataCountryDir(countryCode);
  const localPath = path.join(base, 'final_races.json');
  if (!fs.existsSync(localPath)) {
    return { rows: [], total: 0 };
  }
  const localRaces = JSON.parse(fs.readFileSync(localPath, 'utf8')) as Record<string, unknown>[];
  const intPath = path.join(base, 'final_races_int.json');
  const intRaces: Record<string, unknown>[] = fs.existsSync(intPath)
    ? JSON.parse(fs.readFileSync(intPath, 'utf8'))
    : [];
  const intByDomain = new Map(intRaces.map((r) => [r.domain_name as string, r]));

  const rows: SsgRaceRow[] = localRaces.map((r) => {
    const domain = r.domain_name as string;
    const ir = intByDomain.get(domain) as Record<string, string | null | undefined> | undefined;
    const translations = [
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
  const total = rows.length;
  return {
    rows: rows.slice(0, RACE_LIST_PAGE_SIZE),
    total,
  };
}

const listSelect =
  'id, domain_name, county, race_type, race_dates, latitude, longitude, distance_m, website, payload, race_translations ( locale, name, type_local, distance_verbose, description )';

async function loadFirstPageFromSupabase(
  countryCode: string,
): Promise<{ rows: SsgRaceRow[]; total: number } | null> {
  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const secret =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !secret?.trim()) return null;

  try {
    const sb = createClient(url, secret);
    const pageSize = RACE_LIST_PAGE_SIZE;
    const rpcParams = {
      p_country_code: countryCode,
      p_page: 1,
      p_page_size: pageSize,
      p_county: null,
      p_race_type: null,
      p_date_from: null,
      p_date_to: null,
      p_month: null,
      p_distance_min_km: null,
      p_distance_max_km: null,
    };

    const { data: rpcData, error: rpcErr } = await sb.rpc('get_races_list_page', rpcParams);
    if (!rpcErr && rpcData && typeof rpcData === 'object') {
      const parsed = rpcData as { total?: number; rows?: SsgRaceRow[] };
      const rpcRows = Array.isArray(parsed.rows) ? parsed.rows : [];
      if (rpcRows.length > 0 || typeof parsed.total === 'number') {
        return {
          rows: rpcRows,
          total: typeof parsed.total === 'number' ? parsed.total : rpcRows.length,
        };
      }
    }

    const { count, error: countErr } = await sb
      .from('races')
      .select('*', { count: 'exact', head: true })
      .eq('country_code', countryCode)
      .eq('published', true);
    if (countErr) return null;

    const { data, error: dataErr } = await sb
      .from('races')
      .select(listSelect)
      .eq('country_code', countryCode)
      .eq('published', true)
      .range(0, Math.max(RACE_LIST_PAGE_SIZE * 3 - 1, RACE_LIST_PAGE_SIZE - 1));
    if (dataErr || !data) return null;

    const sorted = [...(data as unknown as SsgRaceRow[])].sort(compareRaceRowsByDateThenDomain);

    return {
      rows: sorted.slice(0, RACE_LIST_PAGE_SIZE),
      total: count ?? 0,
    };
  } catch {
    return null;
  }
}

export type RaceListSsgSource = 'supabase' | 'json' | 'empty';

export async function getRaceListFirstPageSnapshot(countryCode: string): Promise<{
  rows: SsgRaceRow[];
  total: number;
  source: RaceListSsgSource;
}> {
  const fromDb = await loadFirstPageFromSupabase(countryCode);
  if (fromDb) {
    return { ...fromDb, source: 'supabase' };
  }
  const fromJson = loadFirstPageFromJson(countryCode);
  if (fromJson.total > 0 || fromJson.rows.length > 0) {
    return { ...fromJson, source: 'json' };
  }
  return { rows: [], total: 0, source: 'empty' };
}
