import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IndexYaml, Locale } from './content';

type RawSeoCacheEntry = {
  title?: string;
  meta_description?: string;
  h1?: string;
  paragraph?: string;
  _generated_by?: string;
  _generator_version?: string;
};

export type SeoPageCopy = {
  title: string;
  metaDescription: string;
  h1: string;
  paragraph: string;
  source: 'cache' | 'template';
};

export type BrowsePageSeoKind =
  | 'county'
  | 'city'
  | 'month'
  | 'race_type'
  | 'category'
  | 'race_type_category'
  | 'race_type_county'
  | 'race_type_month'
  | 'race_type_city';

type SeoCacheLookupArgs = {
  countryCode: string;
  locale: Locale;
  cacheKeys: string[];
  fallbackCopy?: SeoPageCopy;
};

type BrowsePageTemplate = {
  title: string;
  meta_description: string;
  h1: string;
  paragraph: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SWEDISH_NATIVE_SEED_TERMS = [
  'bläddra bland',
  'jämför datum',
  'den här sidan',
  'löplopp',
  'i hela sverige',
  'över hela sverige',
  'loppkartan',
  'sverige',
];
const SWEDISH_ENGLISH_SEED_TERMS = [
  'across sweden',
  'in sweden',
  'running calendar in sweden',
  'loppkartan',
];

function cachePath(countryCode: string, locale: Locale): string {
  return path.join(
    repoRoot,
    'data',
    'countries',
    countryCode,
    locale === 'en' ? 'seo_content_cache_en.json' : 'seo_content_cache.json',
  );
}

function readCache(countryCode: string, locale: Locale): Record<string, RawSeoCacheEntry> {
  const file = cachePath(countryCode, locale);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, RawSeoCacheEntry>;
  } catch {
    return {};
  }
}

function uniqueCacheKeys(keys: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      keys
        .filter((key): key is string => typeof key === 'string')
        .map((key) => key.trim())
        .filter(Boolean),
    ),
  );
}

function scopedCacheKeys(prefix: string, values: Array<string | null | undefined>): string[] {
  return uniqueCacheKeys(values).map((value) => `${prefix}:${value}`);
}

export function getCountySeoCacheKeys(...values: Array<string | null | undefined>): string[] {
  return scopedCacheKeys('county', values);
}

export function getCitySeoCacheKeys(...values: Array<string | null | undefined>): string[] {
  return uniqueCacheKeys([
    ...scopedCacheKeys('city', values),
    ...scopedCacheKeys('county', values),
  ]);
}

export function getMonthSeoCacheKeys(...values: Array<string | null | undefined>): string[] {
  return scopedCacheKeys('month', values);
}

export function getRaceTypeSeoCacheKeys(...values: Array<string | null | undefined>): string[] {
  return scopedCacheKeys('race_type', values);
}

export function getCategorySeoCacheKeys(...values: Array<string | null | undefined>): string[] {
  return scopedCacheKeys('category', values);
}

export function getRaceTypeCategorySeoCacheKeys(args: {
  raceTypeValues: Array<string | null | undefined>;
  categoryValues: Array<string | null | undefined>;
}): string[] {
  const keys: string[] = [];
  for (const raceTypeValue of uniqueCacheKeys(args.raceTypeValues)) {
    for (const categoryValue of uniqueCacheKeys(args.categoryValues)) {
      keys.push(`race_type:${raceTypeValue}-category:${categoryValue}`);
    }
  }
  return uniqueCacheKeys(keys);
}

export function getRaceTypeCountySeoCacheKeys(args: {
  raceTypeValues: Array<string | null | undefined>;
  countyValues: Array<string | null | undefined>;
}): string[] {
  const keys: string[] = [];
  for (const raceTypeValue of uniqueCacheKeys(args.raceTypeValues)) {
    for (const countyValue of uniqueCacheKeys(args.countyValues)) {
      keys.push(`race_type:${raceTypeValue}-county:${countyValue}`);
    }
  }
  return uniqueCacheKeys(keys);
}

export function getRaceTypeMonthSeoCacheKeys(args: {
  raceTypeValues: Array<string | null | undefined>;
  monthValues: Array<string | null | undefined>;
}): string[] {
  const keys: string[] = [];
  for (const raceTypeValue of uniqueCacheKeys(args.raceTypeValues)) {
    for (const monthValue of uniqueCacheKeys(args.monthValues)) {
      keys.push(`race_type:${raceTypeValue}-month:${monthValue}`);
    }
  }
  return uniqueCacheKeys(keys);
}

export function getRaceTypeCitySeoCacheKeys(args: {
  raceTypeValues: Array<string | null | undefined>;
  cityValues: Array<string | null | undefined>;
}): string[] {
  const keys: string[] = [];
  for (const raceTypeValue of uniqueCacheKeys(args.raceTypeValues)) {
    for (const cityValue of uniqueCacheKeys(args.cityValues)) {
      keys.push(`race_type:${raceTypeValue}-city:${cityValue}`);
    }
  }
  return uniqueCacheKeys(keys);
}

function getCachedSeoEntry(args: SeoCacheLookupArgs): SeoPageCopy | null {
  const cache = readCache(args.countryCode, args.locale);
  for (const key of args.cacheKeys) {
    const cached = cache[key];
    if (
      cached?.title?.trim() &&
      cached?.meta_description?.trim() &&
      cached?.h1?.trim() &&
      cached?.paragraph?.trim()
    ) {
      const normalizedCached = {
        title: cached.title.trim(),
        metaDescription: cached.meta_description.trim(),
        h1: cached.h1.trim(),
        paragraph: cached.paragraph.trim(),
        source: 'cache' as const,
      };
      if (
        args.fallbackCopy &&
        cached._generated_by === 'template' &&
        (normalizedCached.title !== args.fallbackCopy.title ||
          normalizedCached.metaDescription !== args.fallbackCopy.metaDescription ||
          normalizedCached.h1 !== args.fallbackCopy.h1 ||
          normalizedCached.paragraph !== args.fallbackCopy.paragraph)
      ) {
        continue;
      }

      if (args.countryCode !== 'se') {
        const haystack = [
          normalizedCached.title,
          normalizedCached.metaDescription,
          normalizedCached.h1,
          normalizedCached.paragraph,
        ]
          .join(' ')
          .toLowerCase();
        const disallowedTerms =
          args.locale === 'en' ? SWEDISH_ENGLISH_SEED_TERMS : SWEDISH_NATIVE_SEED_TERMS;
        if (disallowedTerms.some((term) => haystack.includes(term))) {
          continue;
        }
      }

      return {
        ...normalizedCached,
      };
    }
  }
  return null;
}

function replaceTokens(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

function cleanWhitespace(value: string | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function marketLabel(content: IndexYaml, locale: Locale): string {
  return locale === 'en'
    ? String(content.country ?? content.country_native ?? 'the country')
    : String(content.country_native ?? content.country ?? 'landet');
}

function siteNameLabel(content: IndexYaml, locale: Locale): string {
  return String(content.page_name ?? content.race_list_name ?? marketLabel(content, locale));
}

function browseTemplateValues(args: {
  content: IndexYaml;
  locale: Locale;
  kind: BrowsePageSeoKind;
  label: string;
  secondaryLabel?: string;
}): Record<string, string> {
  const market = marketLabel(args.content, args.locale);
  const siteName = siteNameLabel(args.content, args.locale);
  const label = cleanWhitespace(args.label);
  const secondaryLabel = cleanWhitespace(args.secondaryLabel);
  const raceType =
    args.kind === 'race_type_category' ||
    args.kind === 'race_type_county' ||
    args.kind === 'race_type_month' ||
    args.kind === 'race_type_city'
      ? secondaryLabel
      : args.kind === 'race_type'
        ? label
        : '';
  const category =
    args.kind === 'race_type_category' || args.kind === 'category' ? label : '';

  return {
    site_name: siteName,
    market,
    market_lower: market.toLowerCase(),
    label,
    label_lower: label.toLowerCase(),
    secondary_label: secondaryLabel,
    secondary_label_lower: secondaryLabel.toLowerCase(),
    category,
    category_lower: category.toLowerCase(),
    race_type: raceType,
    race_type_lower: raceType.toLowerCase(),
    county: args.kind === 'county' || args.kind === 'race_type_county' ? label : '',
    county_lower:
      args.kind === 'county' || args.kind === 'race_type_county' ? label.toLowerCase() : '',
    city: args.kind === 'city' || args.kind === 'race_type_city' ? label : '',
    city_lower:
      args.kind === 'city' || args.kind === 'race_type_city' ? label.toLowerCase() : '',
    month: args.kind === 'month' || args.kind === 'race_type_month' ? label : '',
    month_lower:
      args.kind === 'month' || args.kind === 'race_type_month' ? label.toLowerCase() : '',
    location:
      args.kind === 'county' ||
      args.kind === 'city' ||
      args.kind === 'month' ||
      args.kind === 'race_type_county' ||
      args.kind === 'race_type_city' ||
      args.kind === 'race_type_month'
        ? label
        : market,
    location_lower:
      args.kind === 'county' ||
      args.kind === 'city' ||
      args.kind === 'month' ||
      args.kind === 'race_type_county' ||
      args.kind === 'race_type_city' ||
      args.kind === 'race_type_month'
        ? label.toLowerCase()
        : market.toLowerCase(),
  };
}

function configuredBrowseTemplate(
  content: IndexYaml,
  kind: BrowsePageSeoKind,
): BrowsePageTemplate {
  const configured = content.seo_templates?.browse_page_templates?.[kind];
  const title = cleanWhitespace(configured?.title);
  const metaDescription = cleanWhitespace(configured?.meta_description);
  const h1 = cleanWhitespace(configured?.h1);
  const paragraph = cleanWhitespace(configured?.paragraph);
  if (!title || !metaDescription || !h1 || !paragraph) {
    throw new Error(
      `Missing seo_templates.browse_page_templates.${kind} in country YAML content.`,
    );
  }
  return {
    title,
    meta_description: metaDescription,
    h1,
    paragraph,
  };
}

function buildBrowseTemplateCopy(args: {
  content: IndexYaml;
  locale: Locale;
  kind: BrowsePageSeoKind;
  label: string;
  secondaryLabel?: string;
}): SeoPageCopy {
  const template = configuredBrowseTemplate(args.content, args.kind);
  const values = browseTemplateValues(args);
  return {
    title: cleanWhitespace(replaceTokens(template.title, values)),
    metaDescription: cleanWhitespace(replaceTokens(template.meta_description, values)),
    h1: cleanWhitespace(replaceTokens(template.h1, values)),
    paragraph: cleanWhitespace(replaceTokens(template.paragraph, values)),
    source: 'template',
  };
}

export function getCategorySeoCopy(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  categoryLabel: string;
  raceCount: number;
}): SeoPageCopy {
  const { countryCode, locale, content, categoryLabel } = args;
  const fallbackCopy = buildBrowseTemplateCopy({
    content,
    locale,
    kind: 'category',
    label: categoryLabel,
  });
  const cached = getCachedSeoEntry({
    countryCode,
    locale,
    cacheKeys: getCategorySeoCacheKeys(categoryLabel),
    fallbackCopy,
  });
  if (cached) {
    return cached;
  }

  return fallbackCopy;
}

function deterministicSeoCopy(args: {
  content: IndexYaml;
  locale: Locale;
  title: string;
  description: string;
  h1: string;
  paragraph: string;
}): SeoPageCopy {
  return {
    title: args.title,
    metaDescription: args.description,
    h1: args.h1,
    paragraph: args.paragraph,
    source: 'template',
  };
}

export function getScopedSeoCopy(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  cacheKeys: string[];
  title: string;
  description: string;
  h1: string;
  paragraph: string;
}): SeoPageCopy {
  const fallbackCopy = deterministicSeoCopy(args);
  const cached = getCachedSeoEntry({
    countryCode: args.countryCode,
    locale: args.locale,
    cacheKeys: args.cacheKeys,
    fallbackCopy,
  });
  if (cached) return cached;
  return fallbackCopy;
}

export function getBrowsePageSeoCopy(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  cacheKeys: string[];
  kind: BrowsePageSeoKind;
  label: string;
  secondaryLabel?: string;
}): SeoPageCopy {
  const fallbackCopy = buildBrowseTemplateCopy(args);
  const cached = getCachedSeoEntry({
    countryCode: args.countryCode,
    locale: args.locale,
    cacheKeys: args.cacheKeys,
    fallbackCopy,
  });
  if (cached) return cached;
  return fallbackCopy;
}
