import type { IndexYaml, Locale } from './content';
import type { AuxiliaryPageKey } from './auxiliaryPages';
import { slugify } from './slugify';

export const NATIVE_AUXILIARY_TEMPLATE_SEGMENTS: Record<AuxiliaryPageKey, string> = {
  'add-race': 'lagg-till-lopp',
  'measure-route': 'mat-din-runda',
  'training-plans': 'traningsprogram',
  'pace-calculator': 'fartomvandlare',
  'racetime-estimator': 'uppskatta-din-sluttid',
  'about-us': 'om-oss',
  contact: 'kontakta-oss',
  privacy: 'privacy',
};

export const ENGLISH_AUXILIARY_TEMPLATE_SEGMENTS: Record<AuxiliaryPageKey, string> = {
  'add-race': 'add-race',
  'measure-route': 'measure-your-route',
  'training-plans': 'training-plans',
  'pace-calculator': 'pace-converter',
  'racetime-estimator': 'estimate-your-finish-time',
  'about-us': 'about-us',
  contact: 'contact-us',
  privacy: 'privacy',
};

function fallbackAuxiliarySegment(pageKey: AuxiliaryPageKey, locale: Locale): string {
  return locale === 'en'
    ? ENGLISH_AUXILIARY_TEMPLATE_SEGMENTS[pageKey]
    : NATIVE_AUXILIARY_TEMPLATE_SEGMENTS[pageKey];
}

function auxiliaryLabel(content: IndexYaml, pageKey: AuxiliaryPageKey): string {
  switch (pageKey) {
    case 'add-race':
      return String(content.navigation?.['add-race'] ?? content.add_race_title ?? '').trim();
    case 'measure-route':
      return String(content.navigation?.['measure-route'] ?? content.measure_route_title ?? '').trim();
    case 'training-plans':
      return String(content.navigation?.['training-plans'] ?? content.training_plans?.title ?? '').trim();
    case 'pace-calculator':
      return String(content.navigation?.['pace-calculator'] ?? content.pace_calculator_title ?? '').trim();
    case 'racetime-estimator':
      return String(content.navigation?.['racetime-estimator'] ?? content.racetime_estimator_title ?? '').trim();
    case 'about-us':
      return String(content.navigation?.['about-us'] ?? content.about_us?.title ?? '').trim();
    case 'contact':
      return String(content.navigation?.contact ?? content.contact?.title ?? '').trim();
    case 'privacy':
      return String(
        content.auxiliary_pages?.['privacy-policy'] ?? content.footer?.privacy ?? content.privacy_page?.title ?? '',
      ).trim();
    default:
      return '';
  }
}

export function auxiliaryRouteSegment(
  content: IndexYaml,
  countryCode: string,
  pageKey: AuxiliaryPageKey,
  locale: Locale,
): string {
  const label = auxiliaryLabel(content, pageKey);
  return (label ? slugify(label, countryCode) : '') || fallbackAuxiliarySegment(pageKey, locale);
}

export function localRacePageFolder(content: IndexYaml, locale: Locale): string {
  const fallback = locale === 'en' ? 'race-pages' : 'loppsidor';
  const configured = String(content.race_page_folder_name ?? '').trim();
  return configured || fallback;
}
