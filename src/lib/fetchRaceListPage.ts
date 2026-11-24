import { getSupabaseBrowserClient } from './supabase';

export type RaceListRpcParams = {
  p_country_code: string;
  p_page: number;
  p_page_size: number;
  p_county: string | null;
  p_origin_country: string | null;
  p_include_neighboring: boolean;
  p_neighbor_countries: string[] | null;
  p_race_type: string | null;
  p_date_from: string | null;
  p_date_to: string | null;
  p_month: number | null;
  p_distance_min_km: number | null;
  p_distance_max_km: number | null;
};

export type RaceListRpcResult = {
  total?: number;
  rows?: unknown[];
};

function toSearchParams(params: RaceListRpcParams): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(','));
      continue;
    }
    if (typeof value === 'boolean') {
      search.set(key, value ? 'true' : 'false');
      continue;
    }
    search.set(key, String(value));
  }
  return search;
}

/**
 * Prefer the same-origin cached API so repeat visits and bots hit the CDN.
 * Fall back to the public list RPC if the function is missing (local preview).
 */
export async function fetchRaceListPage(params: RaceListRpcParams): Promise<RaceListRpcResult> {
  try {
    const response = await fetch(`/api/race-list?${toSearchParams(params).toString()}`, {
      headers: { accept: 'application/json' },
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && contentType.includes('application/json')) {
      return (await response.json()) as RaceListRpcResult;
    }
  } catch {
    // Local `astro preview` has no Vercel function; use the RPC instead.
  }

  const sb = getSupabaseBrowserClient();
  const { data, error } = await sb.rpc('get_races_list_page', params);
  if (error) throw error;
  return data as RaceListRpcResult;
}
