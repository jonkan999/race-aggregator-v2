#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
const countryCode = (process.argv[2] || 'se').toLowerCase();
const countryDir = path.join(root, 'data', 'countries', countryCode);

function readYaml(file) {
  if (!fs.existsSync(file)) return {};
  return yaml.load(fs.readFileSync(file, 'utf8')) ?? {};
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function replaceTokens(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function buildEntry(content, locale, categoryLabel) {
  const market =
    locale === 'en'
      ? String(content.country ?? content.country_native ?? 'the country')
      : String(content.country_native ?? content.country ?? 'landet');
  const raceLabel = locale === 'en' ? 'races' : 'lopp';
  const titleBase =
    replaceTokens(content.seo_templates?.title_parts?.category ?? `{category} ${raceLabel}`, {
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
    ).trim();
  const paragraphSuffix = String(
    content.seo_templates?.paragraph_templates?.default_suffix ??
      (locale === 'en'
        ? 'Compare dates, distances and practical details before choosing your next race.'
        : 'Jämför datum, distanser och praktisk information inför ditt nästa lopp.'),
  ).trim();

  return {
    title: `${titleBase} | ${content.page_name ?? content.race_list_name ?? market}`.trim(),
    meta_description: paragraphLead,
    h1:
      locale === 'en'
        ? `${categoryLabel} races in ${market}`
        : `${categoryLabel} lopp i ${market}`,
    paragraph: `${paragraphLead} ${paragraphSuffix}`.trim(),
  };
}

function writeMissingEntries(locale, yamlFile, cacheFile) {
  const content = readYaml(yamlFile);
  const cache = readJson(cacheFile);
  const categories = Object.keys(content.category_mapping ?? {});
  let created = 0;

  for (const categoryLabel of categories) {
    const key = `category:${categoryLabel}`;
    if (cache[key]?.title && cache[key]?.meta_description && cache[key]?.h1 && cache[key]?.paragraph) {
      continue;
    }
    cache[key] = buildEntry(content, locale, categoryLabel);
    created += 1;
  }

  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + '\n', 'utf8');
  return created;
}

const nativeYaml = path.join(countryDir, 'index.yaml');
const enYaml = path.join(countryDir, 'merged_index_int.yaml');
const nativeCache = path.join(countryDir, 'seo_content_cache.json');
const enCache = path.join(countryDir, 'seo_content_cache_en.json');

const nativeCreated = writeMissingEntries('native', nativeYaml, nativeCache);
const enCreated = fs.existsSync(enYaml) ? writeMissingEntries('en', enYaml, enCache) : 0;

console.log(
  `Category SEO cache updated for ${countryCode}. Native created: ${nativeCreated}. English created: ${enCreated}.`,
);
