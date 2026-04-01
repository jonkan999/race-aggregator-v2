import { hasEnglishMerge, listCountryCodes, loadIndexYaml } from './content';
import type { MarketRouteTargets } from './marketRoutes';

let cachedTargets: MarketRouteTargets | null = null;

export function getMarketRouteTargets(): MarketRouteTargets {
  if (cachedTargets) return cachedTargets;

  cachedTargets = Object.fromEntries(
    listCountryCodes().flatMap((countryCode) => {
      if (!hasEnglishMerge(countryCode)) return [];

      const nativeContent = loadIndexYaml(countryCode, 'native');
      const englishContent = loadIndexYaml(countryCode, 'en');
      const baseUrl = String(nativeContent.base_url ?? '').trim();
      if (!baseUrl) return [];

      return [
        [
          countryCode,
          {
            baseUrl,
            englishRacePageFolder:
              String(englishContent.race_page_folder_name ?? 'race-pages').trim() || 'race-pages',
          },
        ],
      ];
    }),
  );

  return cachedTargets;
}
