export type NeighboringCountryOption = {
  code: string;
  label: string;
  href: string;
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

export function normalizeNeighborCountryCodes(codes: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const code of codes ?? []) {
    const value = code.trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

export function resolveNeighboringCountryCodes(args: {
  hostCountryCode: string;
  configuredCodes: string[];
  originCodes: string[];
}): string[] {
  const host = args.hostCountryCode.trim().toLowerCase();
  const configured = normalizeNeighborCountryCodes(
    args.configuredCodes.filter((code) => code.trim().toLowerCase() !== host),
  );
  const extras = normalizeNeighborCountryCodes(args.originCodes).filter(
    (code) => code !== host && !configured.includes(code),
  );
  return [...configured, ...extras];
}

/**
 * Exclusive neighbor-hub filter (`/neighbors/` pages) or additive overlay
 * (map checkboxes on the main calendar). Domestic rows stay visible for the
 * overlay; foreign rows appear only when their origin is selected.
 */
export function originIsVisible(args: {
  originCountry: string | null | undefined;
  hostCountryCode: string;
  neighboringSelection?: NeighboringSelection;
  visibleNeighborCodes?: string[] | null;
}): boolean {
  const { originCountry, hostCountryCode, neighboringSelection = null } = args;
  const origin = originCountry?.trim().toLowerCase() ?? '';
  const isDomestic = isDomesticOrigin(origin, hostCountryCode);
  const visibleNeighborCodes = normalizeNeighborCountryCodes(args.visibleNeighborCodes);

  if (neighboringSelection?.kind === 'all') return !isDomestic;
  if (neighboringSelection?.kind === 'country') return origin === neighboringSelection.code;
  if (isDomestic) return true;
  return Boolean(origin) && visibleNeighborCodes.includes(origin);
}

export function rowMatchesNeighborAndCountyFilter(args: {
  originCountry: string | null | undefined;
  county: string | null | undefined;
  hostCountryCode: string;
  selectedCounty: string;
  neighboringSelection?: NeighboringSelection;
  visibleNeighborCodes?: string[] | null;
}): boolean {
  const {
    originCountry,
    county,
    hostCountryCode,
    selectedCounty,
    neighboringSelection = null,
    visibleNeighborCodes,
  } = args;

  if (
    !originIsVisible({
      originCountry,
      hostCountryCode,
      neighboringSelection,
      visibleNeighborCodes,
    })
  ) {
    return false;
  }

  const normalizedCounty = selectedCounty.trim().toLowerCase();
  if (!normalizedCounty || neighboringSelection) return true;
  if (!isDomesticOrigin(originCountry, hostCountryCode)) return true;

  const rowCounty = county?.trim().toLowerCase() ?? '';
  return rowCounty.includes(normalizedCounty);
}
