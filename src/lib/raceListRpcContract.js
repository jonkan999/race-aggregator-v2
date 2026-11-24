/**
 * Field contract for get_races_list_page rows and for the races_for_pages
 * payload used at build time.
 *
 * The list RPC keeps the same function name and parameters. Cards render at
 * most 170 characters of description, so the RPC sends 200-character excerpts.
 * Build/detail pages still need the full description and the other keys below.
 */

export const LIST_DESCRIPTION_EXCERPT_CHARS = 200;

export const RACE_LIST_RPC_ROW_KEYS = Object.freeze([
  'id',
  'domain_name',
  'county',
  'race_type',
  'origin_country',
  'race_dates',
  'latitude',
  'longitude',
  'distance_m',
  'website',
  'payload',
  'race_translations',
]);

export const RACE_LIST_RPC_PAYLOAD_KEYS = Object.freeze([
  'images',
  'supplied_images',
  'supplied_at',
  'supplied_ids',
  'nearest_city',
  'nearby_cities',
  'location',
  'description',
]);

export const RACE_LIST_RPC_TRANSLATION_KEYS = Object.freeze([
  'locale',
  'name',
  'type_local',
  'distance_verbose',
  'description',
]);

/** Payload keys race detail, list, home, browse and distance helpers actually read. */
export const RACE_PAGE_PAYLOAD_KEYS = Object.freeze([
  'images',
  'supplied_images',
  'supplied_at',
  'supplied_ids',
  'nearest_city',
  'nearby_cities',
  'location',
  'description',
  'additional',
  'additional_info',
  'course_highlights',
  'type_local',
  'distance_verbose',
  'name',
  'organizer',
  'contact',
  'website',
  'registration_url',
  'race_info_url',
  'start_time',
  'price_range',
  'price_tiers',
  'registration_close_date',
  'is_series',
  'fb_link',
  'ig_link',
  'estimated_dates',
  'date_status',
  'created_date',
  'distances',
  'distance_keywords',
  'distance_m',
  'analytics',
]);

export const RACES_FOR_PAGES_VIEW = 'races_for_pages';

export function pickUsedRaceListRow(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : null;
  return {
    id: row?.id ?? null,
    domain_name: row?.domain_name ?? null,
    county: row?.county ?? null,
    race_type: row?.race_type ?? null,
    origin_country: row?.origin_country ?? null,
    race_dates: row?.race_dates ?? null,
    latitude: row?.latitude ?? null,
    longitude: row?.longitude ?? null,
    distance_m: row?.distance_m ?? null,
    website: row?.website ?? null,
    payload: payload
      ? Object.fromEntries(RACE_LIST_RPC_PAYLOAD_KEYS.map((key) => [key, payload[key] ?? null]))
      : null,
    race_translations: Array.isArray(row?.race_translations)
      ? row.race_translations.map((translation) =>
          Object.fromEntries(
            RACE_LIST_RPC_TRANSLATION_KEYS.map((key) => [key, translation?.[key] ?? null]),
          ),
        )
      : [],
  };
}

export function slimListPayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return Object.fromEntries(RACE_LIST_RPC_PAYLOAD_KEYS.map((key) => [key, source[key] ?? null]));
}

export function slimPagePayload(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return Object.fromEntries(RACE_PAGE_PAYLOAD_KEYS.map((key) => [key, source[key]]).filter(([, value]) => value != null));
}
