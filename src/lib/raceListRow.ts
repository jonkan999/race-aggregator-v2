export type RaceTranslationRow = {
  locale: string;
  name: string | null;
  type_local: string | null;
  distance_verbose: string | null;
  description?: string | null;
};

/** Row shape for list + SSG (matches RPC / Supabase select). */
export type RaceListRow = {
  id: string;
  domain_name: string;
  county: string | null;
  race_type: string | null;
  origin_country?: string | null;
  race_dates: unknown;
  latitude: number | null;
  longitude: number | null;
  distance_m: unknown;
  website: string | null;
  payload?: Record<string, unknown> | null;
  race_translations: RaceTranslationRow[] | null;
};

export function pickTranslation(
  rows: RaceTranslationRow[] | null | undefined,
  locale: string,
): RaceTranslationRow | undefined {
  const tr = rows ?? [];
  return (
    tr.find((t) => t.locale === locale) ?? tr.find((t) => t.locale === 'en') ?? tr[0]
  );
}
