import { getAllRaceListRows } from './raceListSsg';
import { isDomesticOrigin } from './neighboringSelection';
import { loadIndexYaml, raceListSlug, type IndexYaml, type Locale } from './content';
import type { RaceListRow } from './raceListRow';
import { localRacePageFolder } from './routeSegments';

export async function getRaceDetailStaticPaths(countryCode: string) {
  const allRows = await getAllRaceListRows(countryCode);
  const seen = new Set<string>();

  return allRows.rows.flatMap((row) => {
    if (!isDomesticOrigin(row.origin_country, countryCode)) return [];
    if (seen.has(row.domain_name)) return [];
    seen.add(row.domain_name);
    return [{ params: { domain: row.domain_name } }];
  });
}

export async function loadRaceDetailRoute(args: {
  countryCode: string;
  locale: Locale;
  domain: string;
}): Promise<
  | {
      redirectTo: string;
    }
  | {
      content: IndexYaml;
      allRows: RaceListRow[];
      row: RaceListRow;
      canonicalPath: string;
      alternateHref: string;
      isAliasPath: boolean;
    }
> {
  const { countryCode, locale, domain } = args;
  const content = loadIndexYaml(countryCode, locale);
  const allRows = await getAllRaceListRows(countryCode);
  const row = allRows.rows.find(
    (entry) => entry.domain_name === domain && isDomesticOrigin(entry.origin_country, countryCode),
  );

  if (!row) {
    const prefix = locale === 'en' ? '/en/' : '/';
    return { redirectTo: `${prefix}${raceListSlug(content, countryCode)}/` };
  }

  const nativeContent = locale === 'native' ? content : loadIndexYaml(countryCode, 'native');
  const englishContent = locale === 'en' ? content : loadIndexYaml(countryCode, 'en');
  const nativeFolder = localRacePageFolder(nativeContent, 'native');
  const englishFolder = localRacePageFolder(englishContent, 'en');
  const canonicalPath =
    locale === 'en' ? `/en/${englishFolder}/${domain}/` : `/${nativeFolder}/${domain}/`;
  const alternateHref =
    locale === 'en' ? `/${nativeFolder}/${domain}/` : `/en/${englishFolder}/${domain}/`;

  return {
    content,
    allRows: allRows.rows,
    row,
    canonicalPath,
    alternateHref,
    isAliasPath: false,
  };
}
