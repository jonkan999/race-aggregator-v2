import {
  hasEnglishMerge,
  listCountryCodes,
  loadIndexYaml,
  type IndexYaml,
  type Locale,
} from './content';
import { getNeighboringCountryPath, getNeighboringIndexPath } from './marketRoutes';
import {
  getNeighborMarketRaceListHref,
  listEnabledNeighborMarketCodes,
  neighborCountryLabel,
} from './neighborMarkets';
import { isDomesticOrigin, resolveNeighboringCountryCodes, type NeighboringCountryOption } from './neighboringSelection';
import { getAllRaceListRows } from './raceListSsg';

const knownCountryCodes = new Set(listCountryCodes());

const neighboringCountryOptionsCache = new Map<
  string,
  Promise<{
    label: string;
    allLabel: string;
    allHref: string;
    headingDefault: string;
    mapTitle: string;
    mapShowAllLabel: string;
    countries: NeighboringCountryOption[];
  }>
>();

function intlCountryLabel(countryCode: string, locale: Locale): string | null {
  try {
    const displayNames = new Intl.DisplayNames([locale === 'en' ? 'en' : 'sv'], {
      type: 'region',
    });
    return displayNames.of(countryCode.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

function fallbackCountryLabel(countryCode: string, locale: Locale): string {
  if (!knownCountryCodes.has(countryCode)) {
    return intlCountryLabel(countryCode, locale) ?? countryCode.toUpperCase();
  }

  try {
    const content = loadIndexYaml(
      countryCode,
      locale === 'en' && hasEnglishMerge(countryCode) ? 'en' : 'native',
    );
    return String(
      content.country_native ??
        content.country ??
        intlCountryLabel(countryCode, locale) ??
        countryCode.toUpperCase(),
    );
  } catch {
    return intlCountryLabel(countryCode, locale) ?? countryCode.toUpperCase();
  }
}

export async function getNeighboringCountryOptions(args: {
  hostCountryCode: string;
  locale: Locale;
  content: IndexYaml;
}): Promise<{
  label: string;
  allLabel: string;
  allHref: string;
  headingDefault: string;
  mapTitle: string;
  mapShowAllLabel: string;
  countries: NeighboringCountryOption[];
}> {
  const { hostCountryCode, locale, content } = args;
  const cacheKey = `${hostCountryCode}:${locale}`;
  const cached = neighboringCountryOptionsCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    const allRows = await getAllRaceListRows(hostCountryCode);
    const originCodes: string[] = [];
    const originCounts = new Map<string, number>();
    for (const row of allRows.rows) {
      const origin = row.origin_country?.trim().toLowerCase() ?? '';
      if (!origin || isDomesticOrigin(origin, hostCountryCode)) continue;
      originCounts.set(origin, (originCounts.get(origin) ?? 0) + 1);
      if (!originCodes.includes(origin)) originCodes.push(origin);
    }

    const codes = resolveNeighboringCountryCodes({
      hostCountryCode,
      configuredCodes: listEnabledNeighborMarketCodes(hostCountryCode),
      originCodes,
    });

    const countries = codes.map((code) => {
      const localHref = getNeighboringCountryPath({
        countryCode: hostCountryCode,
        locale,
        neighborCountryCode: code,
      });
      const productionHref = getNeighborMarketRaceListHref({
        neighborCountryCode: code,
        locale,
      });
      const hasLocalRaces = (originCounts.get(code) ?? 0) > 0;
      return {
        code,
        label:
          neighborCountryLabel({
            neighborCountryCode: code,
            hostCountryCode,
            locale,
          }) || fallbackCountryLabel(code, locale),
        href: hasLocalRaces ? localHref : productionHref ?? localHref,
      };
    });

    return {
      label: String(content.neighboring_countries_neighbors_native ?? ''),
      allLabel: String(content.neighboring_countries_all_neighbors_native ?? ''),
      allHref: getNeighboringIndexPath(hostCountryCode, locale),
      headingDefault: String(
        content.section_race_card_header_nieghbors_default ??
          content.neighboring_countries_title ??
          '',
      ),
      mapTitle: String(content.neighboring_races_title ?? ''),
      mapShowAllLabel: String(content.neighboring_countries_show_all ?? ''),
      countries,
    };
  })();

  neighboringCountryOptionsCache.set(cacheKey, pending);
  return pending;
}
