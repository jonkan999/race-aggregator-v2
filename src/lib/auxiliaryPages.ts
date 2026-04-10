import {
  hasEnglishMerge,
  localeBasePrefix,
  loadIndexYaml,
  type IndexYaml,
  type Locale,
} from './content';
import { auxiliaryRouteSegment } from './routeSegments';

export type AuxiliaryPageKey =
  | 'add-race'
  | 'measure-route'
  | 'training-plans'
  | 'pace-calculator'
  | 'racetime-estimator'
  | 'about-us'
  | 'contact'
  | 'privacy';

export const AUXILIARY_PAGE_KEYS: AuxiliaryPageKey[] = [
  'add-race',
  'measure-route',
  'training-plans',
  'pace-calculator',
  'racetime-estimator',
  'about-us',
  'contact',
  'privacy',
];

function localePrefix(country: string, locale: Locale): string {
  return localeBasePrefix(country, locale).replace(/\/$/, '');
}

export function auxiliaryPageSegment(
  content: IndexYaml,
  country: string,
  pageKey: AuxiliaryPageKey,
  locale: Locale,
): string {
  return auxiliaryRouteSegment(content, country, pageKey, locale);
}

export function findAuxiliaryPageKeyBySegment(
  content: IndexYaml,
  country: string,
  locale: Locale,
  segment: string,
): AuxiliaryPageKey | undefined {
  return AUXILIARY_PAGE_KEYS.find(
    (pageKey) => auxiliaryPageSegment(content, country, pageKey, locale) === segment,
  );
}

export function auxiliaryPageHref(args: {
  country: string;
  locale: Locale;
  content: IndexYaml;
  pageKey: AuxiliaryPageKey;
}): string {
  const { country, locale, content, pageKey } = args;
  return `${localePrefix(country, locale)}/${auxiliaryPageSegment(content, country, pageKey, locale)}/`;
}

export function alternateAuxiliaryPageHref(args: {
  country: string;
  locale: Locale;
  pageKey: AuxiliaryPageKey;
}): string | undefined {
  const { country, locale, pageKey } = args;

  if (locale === 'native') {
    if (!hasEnglishMerge(country)) return undefined;
    const content = loadIndexYaml(country, 'en');
    return auxiliaryPageHref({ country, locale: 'en', content, pageKey });
  }

  const content = loadIndexYaml(country, 'native');
  return auxiliaryPageHref({ country, locale: 'native', content, pageKey });
}
