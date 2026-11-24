/**
 * Same-origin, cacheable GET wrapper around get_races_list_page.
 * Vercel CDN caches GET responses by query string. The static Astro build
 * has no adapter, so this lives as a root /api Serverless Function.
 */

const CACHE_CONTROL = 'public, s-maxage=1800, stale-while-revalidate=86400';

function first(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function optionalString(value) {
  const raw = first(value);
  if (raw == null) return null;
  const text = String(raw).trim();
  return text ? text : null;
}

function optionalInt(value) {
  const raw = optionalString(value);
  if (raw == null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalFloat(value) {
  const raw = optionalString(value);
  if (raw == null) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalBool(value) {
  const raw = optionalString(value);
  if (raw == null) return null;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

function optionalStringList(value) {
  const raw = optionalString(value);
  if (raw == null) return null;
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

function rpcBody(query) {
  return {
    p_country_code: optionalString(query.p_country_code),
    p_page: optionalInt(query.p_page) ?? 1,
    p_page_size: optionalInt(query.p_page_size) ?? 20,
    p_county: optionalString(query.p_county),
    p_origin_country: optionalString(query.p_origin_country),
    p_include_neighboring: optionalBool(query.p_include_neighboring) ?? false,
    p_neighbor_countries: optionalStringList(query.p_neighbor_countries),
    p_race_type: optionalString(query.p_race_type),
    p_date_from: optionalString(query.p_date_from),
    p_date_to: optionalString(query.p_date_to),
    p_month: optionalInt(query.p_month),
    p_distance_min_km: optionalFloat(query.p_distance_min_km),
    p_distance_max_km: optionalFloat(query.p_distance_max_km),
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', CACHE_CONTROL);
  res.setHeader('CDN-Cache-Control', CACHE_CONTROL);
  res.setHeader('Vercel-CDN-Cache-Control', CACHE_CONTROL);

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!String(url ?? '').trim() || !String(key ?? '').trim()) {
    return res.status(500).json({ error: 'supabase_unconfigured' });
  }

  const body = rpcBody(req.query || {});
  if (!body.p_country_code) {
    return res.status(400).json({ error: 'missing_country' });
  }

  const response = await fetch(`${String(url).replace(/\/$/, '')}/rest/v1/rpc/get_races_list_page`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      apikey: key,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    return res.status(502).json({ error: 'list_rpc_failed' });
  }

  res.setHeader('content-type', 'application/json; charset=utf-8');
  return res.status(200).send(text);
}
