export type NeighboringCountryOption = {
  code: string;
  label: string;
};

export const ALL_NEIGHBORING_COUNTIES_VALUE = '__neighbors_all__';
export const NEIGHBORING_COUNTY_PREFIX = '__neighbor__:';

export type NeighboringSelection =
  | { kind: 'all' }
  | { kind: 'country'; code: string }
  | null;

export function neighboringCountryValue(code: string): string {
  return `${NEIGHBORING_COUNTY_PREFIX}${code.trim().toLowerCase()}`;
}

export function parseNeighboringSelection(raw: string | null | undefined): NeighboringSelection {
  const value = raw?.trim() ?? '';
  if (!value) return null;
  if (value === ALL_NEIGHBORING_COUNTIES_VALUE) return { kind: 'all' };
  if (!value.startsWith(NEIGHBORING_COUNTY_PREFIX)) return null;

  const code = value.slice(NEIGHBORING_COUNTY_PREFIX.length).trim().toLowerCase();
  return code ? { kind: 'country', code } : null;
}

export function isDomesticOrigin(
  originCountry: string | null | undefined,
  hostCountryCode: string,
): boolean {
  const origin = originCountry?.trim().toLowerCase();
  const host = hostCountryCode.trim().toLowerCase();
  return !origin || origin === host;
}

