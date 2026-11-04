import { ENGLISH_RACE_LABELS } from './englishRaceLabels.generated';

export type RaceTranslationRow = {
  locale: string;
  name: string | null;
  type_local: string | null;
  distance_verbose: string | null;
  description?: string | null;
  additional?: string | null;
  course_highlights?: string[] | null;
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

/** Map a native race label (type or one distance segment) to English. */
export function englishRaceLabel(value: string | null | undefined): string | null {
  if (value == null) return null;
  return ENGLISH_RACE_LABELS[value.trim().toLowerCase()] ?? value;
}

/** English rows can still carry native type / distance labels; translate them. */
export function englishizeTranslation(row: RaceTranslationRow): RaceTranslationRow {
  const distance = row.distance_verbose
    ? row.distance_verbose
        .split(',')
        .map((part) => englishRaceLabel(part.trim()) ?? part.trim())
        .filter(Boolean)
        .join(', ')
    : row.distance_verbose;
  return { ...row, type_local: englishRaceLabel(row.type_local), distance_verbose: distance };
}

export function pickTranslation(
  rows: RaceTranslationRow[] | null | undefined,
  locale: string,
): RaceTranslationRow | undefined {
  const tr = rows ?? [];
  const picked = tr.find((t) => t.locale === locale) ?? tr.find((t) => t.locale === 'en') ?? tr[0];
  return picked && locale === 'en' ? englishizeTranslation(picked) : picked;
}
