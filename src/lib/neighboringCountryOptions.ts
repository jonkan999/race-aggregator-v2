import {
  hasEnglishMerge,
  listCountryCodes,
  loadIndexYaml,
  type IndexYaml,
  type Locale,
} from './content';
import { getAllRaceListRows } from './raceListSsg';
import { isDomesticOrigin, type NeighboringCountryOption } from './neighboringSelection';

const knownCountryCodes = new Set(listCountryCodes());

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

function countryLabel(countryCode: string, locale: Locale): string {
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
  headingDefault: string;
  countries: NeighboringCountryOption[];
}> {
  const { hostCountryCode, locale, content } = args;
  const allRows = await getAllRaceListRows(hostCountryCode);
  const codes = new Set<string>();

  for (const row of allRows.rows) {
    const origin = row.origin_country?.trim().toLowerCase();
    if (!origin || isDomesticOrigin(origin, hostCountryCode)) continue;
    codes.add(origin);
  }

  const countries = [...codes]
    .map((code) => ({ code, label: countryLabel(code, locale) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale === 'en' ? 'en' : 'sv'));

  return {
    label: String(content.neighboring_countries_neighbors_native ?? ''),
    allLabel: String(content.neighboring_countries_all_neighbors_native ?? ''),
    headingDefault: String(
      content.section_race_card_header_nieghbors_default ??
        content.neighboring_countries_title ??
        '',
    ),
    countries,
  };
}
