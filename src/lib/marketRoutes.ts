export type RouteLocale = 'native' | 'en';

export type MarketRouteTarget = {
  baseUrl: string;
  englishRacePageFolder: string;
};

export type MarketRouteTargets = Record<string, MarketRouteTarget>;

type RaceLinkRow = {
  domain_name: string;
  origin_country?: string | null;
  website?: string | null;
};

declare global {
  interface Window {
    __MARKET_ROUTE_TARGETS__?: MarketRouteTargets;
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function normalizeCountryCode(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function getMarketLocalePrefix(countryCode: string, locale: RouteLocale): string {
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  if (locale === 'en') {
    return normalizedCountryCode === 'se' ? '/en/' : `/${normalizedCountryCode}/en/`;
  }
  return normalizedCountryCode === 'se' ? '/' : `/${normalizedCountryCode}/`;
}

export function getLocalRaceDetailPath(args: {
  countryCode: string;
  locale: RouteLocale;
  racePageFolder: string;
  domainName: string;
}): string {
  const { countryCode, locale, racePageFolder, domainName } = args;
  return `${getMarketLocalePrefix(countryCode, locale)}${racePageFolder}/${domainName}/`;
}

export function getNeighboringIndexPath(countryCode: string, locale: RouteLocale): string {
  return `${getMarketLocalePrefix(countryCode, locale)}neighbors/`;
}

export function getNeighboringCountryPath(args: {
  countryCode: string;
  locale: RouteLocale;
  neighborCountryCode: string;
}): string {
  const { countryCode, locale, neighborCountryCode } = args;
  return `${getNeighboringIndexPath(countryCode, locale)}${normalizeCountryCode(neighborCountryCode)}/`;
}

export function getCrossMarketEnglishRaceDetailHref(args: {
  countryCode: string;
  domainName: string;
  marketRouteTargets: MarketRouteTargets;
}): string | null {
  const { countryCode, domainName, marketRouteTargets } = args;
  const normalizedCountryCode = normalizeCountryCode(countryCode);
  const target = marketRouteTargets[normalizedCountryCode];
  if (!target?.baseUrl) return null;

  const baseUrl = trimTrailingSlash(target.baseUrl.trim());
  const racePageFolder = target.englishRacePageFolder?.trim() || 'race-pages';
  if (!baseUrl) return null;

  return `${baseUrl}/en/${racePageFolder}/${domainName}/`;
}

export function resolveRaceDetailHref(args: {
  hostCountryCode: string;
  routeLocale: RouteLocale;
  localRacePageFolder: string;
  row: RaceLinkRow;
  marketRouteTargets: MarketRouteTargets;
}): string {
  const { hostCountryCode, routeLocale, localRacePageFolder, row, marketRouteTargets } = args;
  const localHref = getLocalRaceDetailPath({
    countryCode: hostCountryCode,
    locale: routeLocale,
    racePageFolder: localRacePageFolder,
    domainName: row.domain_name,
  });

  const host = normalizeCountryCode(hostCountryCode);
  const origin = normalizeCountryCode(row.origin_country);
  if (!origin || origin === host) return localHref;

  const crossMarketHref = getCrossMarketEnglishRaceDetailHref({
    countryCode: origin,
    domainName: row.domain_name,
    marketRouteTargets,
  });
  if (crossMarketHref) return crossMarketHref;

  const website = row.website?.trim();
  if (website) return website;

  return localHref;
}

export function getBrowserMarketRouteTargets(): MarketRouteTargets {
  if (typeof window === 'undefined') return {};
  return window.__MARKET_ROUTE_TARGETS__ ?? {};
}
