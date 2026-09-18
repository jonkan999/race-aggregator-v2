/**
 * Resolve race distances when `distance_m` is missing or incomplete.
 *
 * Collector JSON sometimes ships stub rows (NL today) with empty `distance_m`
 * while names, keywords, verbose labels, or the `distances` km list still
 * describe the course. Browse category hubs and distance filters should use
 * those fallbacks instead of going empty.
 */

const HALF_MARATHON_METERS = 21100;
const MARATHON_METERS = 42195;
const METERS_PER_MILE = 1609.34;

const FALLBACK_VERBOSE_LABELS = new Set([
  'gemengde afstand',
  'mixed distance',
  'blandad distans',
  'blandet distanse',
  'sekoitettu matka',
]);

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function payloadOf(row) {
  const payload = asObject(row?.payload);
  if (payload) return payload;
  return asObject(row) ?? {};
}

function uniqueFinite(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue;
    const key = Math.round(value * 1000) / 1000;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function parseFiniteNumber(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw !== 'string') return Number.NaN;
  const normalized = raw.trim().replace(',', '.');
  if (!normalized) return Number.NaN;
  return Number.parseFloat(normalized);
}

function metersFromMeterList(raw) {
  if (!Array.isArray(raw)) return [];
  return uniqueFinite(
    raw.map((value) => {
      if (value && typeof value === 'object' && !Array.isArray(value) && 'meters' in value) {
        return parseFiniteNumber(value.meters);
      }
      return parseFiniteNumber(value);
    }),
  );
}

function parseMaybeJson(raw) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '[]' || trimmed === 'null') return [];
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function metersFromKmList(raw) {
  const parsed = parseMaybeJson(raw);
  const values = Array.isArray(parsed) ? parsed : parsed == null ? [] : [parsed];
  return uniqueFinite(values.map((value) => parseFiniteNumber(value) * 1000));
}

function isFallbackVerboseLabel(value) {
  return FALLBACK_VERBOSE_LABELS.has(String(value ?? '').trim().toLowerCase());
}

function translationTexts(row) {
  const translations = Array.isArray(row?.race_translations) ? row.race_translations : [];
  return translations.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    return [entry.name, entry.distance_verbose, entry.description];
  });
}

function rowSearchTexts(row) {
  const payload = payloadOf(row);
  const keywords = Array.isArray(payload.distance_keywords)
    ? payload.distance_keywords
    : Array.isArray(row?.distance_keywords)
      ? row.distance_keywords
      : [];
  const priceDistances = Array.isArray(payload.price_tiers)
    ? payload.price_tiers.map((tier) => (tier && typeof tier === 'object' ? tier.distance : ''))
    : [];
  const verbose = [
    payload.distance_verbose,
    row?.distance_verbose,
    ...translationTexts(row),
  ].filter((value) => typeof value === 'string' && value.trim() && !isFallbackVerboseLabel(value));

  return [
    payload.name,
    row?.name,
    payload.description,
    payload.distances,
    ...keywords,
    ...priceDistances,
    ...verbose,
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .join(' ');
}

function hasHalfMarathonCue(text) {
  return /\b(half|halve?|halv)\b/i.test(text) && /\bmarathons?\b/i.test(text);
}

function hasStandaloneMarathonCue(text) {
  return /\bmarathons?\b/i.test(text) && !hasHalfMarathonCue(text) && !/\bmini\s+marathons?\b/i.test(text);
}

function inferredMetersFromText(text) {
  if (!text || !text.trim()) return [];
  const meters = [];

  for (const match of text.matchAll(/(?<!\d)(\d+(?:[.,]\d+)?)\s*k(?:m|ilometers?)?\b/gi)) {
    meters.push(parseFiniteNumber(match[1]) * 1000);
  }
  for (const match of text.matchAll(/(?<!\d)(\d+(?:[.,]\d+)?)\s*(?:meters?|metres?)\b/gi)) {
    meters.push(parseFiniteNumber(match[1]));
  }
  for (const match of text.matchAll(/(?<!\d)(\d+(?:[.,]\d+)?)\s*(?:miles?|mijl)\b/gi)) {
    meters.push(parseFiniteNumber(match[1]) * METERS_PER_MILE);
  }

  if (hasHalfMarathonCue(text)) meters.push(HALF_MARATHON_METERS);
  else if (hasStandaloneMarathonCue(text)) meters.push(MARATHON_METERS);

  return uniqueFinite(meters);
}

function recordedMeters(row) {
  const payload = payloadOf(row);
  const fromRow = metersFromMeterList(row?.distance_m ?? row?.distanceM);
  if (fromRow.length > 0) return fromRow;
  return metersFromMeterList(payload.distance_m);
}

/**
 * Meters for a race row, including collector fallbacks when `distance_m` is empty.
 */
export function rowDistanceMeters(row) {
  const recorded = recordedMeters(row);
  if (recorded.length > 0) return recorded;

  const payload = payloadOf(row);
  const fromKmList = metersFromKmList(payload.distances ?? row?.distances);
  return uniqueFinite([...fromKmList, ...inferredMetersFromText(rowSearchTexts(row))]);
}

export function rowMatchesDistanceRange(row, minKm, maxKm) {
  if (minKm == null && maxKm == null) return true;
  return rowDistanceMeters(row).some((meters) => {
    const km = meters / 1000;
    if (minKm != null && km < minKm) return false;
    if (maxKm != null && km > maxKm) return false;
    return true;
  });
}

export function resolveRaceDistanceMeters(rawRace) {
  return rowDistanceMeters(rawRace);
}
