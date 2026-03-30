import {
  hasEnglishMerge,
  listCountryCodes,
  localeBasePrefix,
  loadIndexYaml,
  slugify,
  type IndexYaml,
  type Locale,
} from './content';

export type AuxiliaryPageKey =
  | 'add-race'
  | 'measure-route'
  | 'training-plans'
  | 'pace-calculator'
  | 'racetime-estimator'
  | 'about-us'
  | 'contact'
  | 'privacy';

function localePrefix(country: string, locale: Locale): string {
  return localeBasePrefix(country, locale).replace(/\/$/, '');
}

export function auxiliaryPageSegment(
  content: IndexYaml,
  country: string,
  pageKey: AuxiliaryPageKey,
): string {
  if (pageKey === 'privacy') return 'privacy';

  const label = content.navigation?.[pageKey] ?? content.auxiliary_pages?.[pageKey] ?? pageKey;
  return slugify(String(label), content.country_code ?? country);
}

export function auxiliaryPageHref(args: {
  country: string;
  locale: Locale;
  content: IndexYaml;
  pageKey: AuxiliaryPageKey;
}): string {
  const { country, locale, content, pageKey } = args;
  return `${localePrefix(country, locale)}/${auxiliaryPageSegment(content, country, pageKey)}/`;
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

export function auxiliaryStaticPaths(locale: Locale) {
  return listCountryCodes()
    .filter((country) => country !== 'se' && (locale === 'native' || hasEnglishMerge(country)))
    .map((country) => ({ params: { country } }));
}
