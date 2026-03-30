import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IndexYaml, Locale } from './content';

type RawSeoCacheEntry = {
  title?: string;
  meta_description?: string;
  h1?: string;
  paragraph?: string;
};

export type SeoPageCopy = {
  title: string;
  metaDescription: string;
  h1: string;
  paragraph: string;
  source: 'cache' | 'template';
};

type SeoCacheLookupArgs = {
  countryCode: string;
  locale: Locale;
  cacheKeys: string[];
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

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
      return {
        title: cached.title.trim(),
        metaDescription: cached.meta_description.trim(),
        h1: cached.h1.trim(),
        paragraph: cached.paragraph.trim(),
        source: 'cache',
      };
    }
  }
  return null;
}

function replaceTokens(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');
}

function marketLabel(content: IndexYaml, locale: Locale): string {
  return locale === 'en'
    ? String(content.country ?? content.country_native ?? 'the country')
    : String(content.country_native ?? content.country ?? 'landet');
}

function defaultRaceLabel(locale: Locale): string {
  return locale === 'en' ? 'races' : 'lopp';
}

function buildDeterministicCategoryCopy(
  content: IndexYaml,
  locale: Locale,
  categoryLabel: string,
  raceCount: number,
): SeoPageCopy {
  const raceLabel = defaultRaceLabel(locale);
  const market = marketLabel(content, locale);
  const titleBase =
    replaceTokens(content.seo_templates?.title_parts?.category ?? '{category} ' + raceLabel, {
      category: categoryLabel,
    }).trim() || `${categoryLabel} ${raceLabel}`;
  const paragraphLead =
    replaceTokens(
      content.seo_templates?.paragraph_templates?.category_only ??
        (locale === 'en'
          ? 'Find {category} races across {location}.'
          : 'Hitta {category} lopp i {location}.'),
      {
        category: categoryLabel,
        location: market,
        race_type: '',
      },
    ).trim() || `${categoryLabel} ${raceLabel}`;
  const paragraphSuffix = String(
    content.seo_templates?.paragraph_templates?.default_suffix ??
      (locale === 'en'
        ? 'Compare dates, distances and practical details before choosing your next race.'
        : 'Jämför datum, distanser och praktisk information inför ditt nästa lopp.'),
  ).trim();
  const countLead =
    locale === 'en'
      ? `${raceCount} upcoming options currently match this category.`
      : `${raceCount} kommande alternativ matchar kategorin just nu.`;

  const h1 =
    locale === 'en'
      ? `${categoryLabel} races in ${market}`
      : `${categoryLabel} lopp i ${market}`;
  const title = `${titleBase} | ${content.page_name ?? content.race_list_name ?? market}`.trim();
  const metaDescription = `${paragraphLead} ${countLead}`.trim();
  const paragraph = `${paragraphLead} ${paragraphSuffix}`.trim();

  return {
    title,
    metaDescription,
    h1,
    paragraph,
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
  const { countryCode, locale, content, categoryLabel, raceCount } = args;
  const cached = getCachedSeoEntry({
    countryCode,
    locale,
    cacheKeys: [`category:${categoryLabel}`],
  });
  if (cached) {
    return cached;
  }

  return buildDeterministicCategoryCopy(content, locale, categoryLabel, raceCount);
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
  const cached = getCachedSeoEntry({
    countryCode: args.countryCode,
    locale: args.locale,
    cacheKeys: args.cacheKeys,
  });
  if (cached) return cached;
  return deterministicSeoCopy(args);
}
