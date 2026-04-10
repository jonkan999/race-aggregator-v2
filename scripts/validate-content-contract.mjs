import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { getActiveMarketCode, resolveCountriesRoot } from './lib/market-config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const countriesDir = resolveCountriesRoot(repoRoot);
const ignoredPaths = [
  'category_mapping',
  'county_mapping',
  'month_mapping',
  'month_mapping_short',
  'type_options',
  'verbose_local_distance_mapping',
  'distance_mapping',
  'language_settings',
  'languages',
];
const disallowedTopLevelKeys = new Set(['language_settings', 'languages']);
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
const EXPECTED_SEO_GENERATOR_VERSION = 'browse-seo-cache-v2';

function loadYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8')) ?? {};
}

function shouldIgnore(pathKey) {
  return ignoredPaths.some((prefix) => pathKey === prefix || pathKey.startsWith(`${prefix}.`));
}

function collectLeafPaths(value, prefix = '', result = new Set()) {
  if (Array.isArray(value)) {
    if (value.length === 0 && prefix) result.add(`${prefix}[]`);
    for (const entry of value) {
      collectLeafPaths(entry, prefix ? `${prefix}[]` : '[]', result);
    }
    return result;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      collectLeafPaths(nested, nextPrefix, result);
    }
    return result;
  }

  if (prefix) result.add(prefix);
  return result;
}

function loadJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function entryText(entry) {
  return [
    String(entry?.title ?? ''),
    String(entry?.meta_description ?? ''),
    String(entry?.h1 ?? ''),
    String(entry?.paragraph ?? ''),
  ]
    .join(' ')
    .toLowerCase();
}

function collectInvalidSeoCacheEntries(cache, predicate) {
  return Object.entries(cache)
    .filter(([key, entry]) => predicate(key, entry))
    .slice(0, 20)
    .map(([key]) => key);
}

const explicitCountries = process.argv.slice(2).map((value) => value.trim().toLowerCase()).filter(Boolean);
const countryCodes =
  explicitCountries.length > 0
    ? explicitCountries
    : [getActiveMarketCode()];
const failures = [];

for (const countryCode of countryCodes) {
  const countryDir = path.join(countriesDir, countryCode);
  if (!fs.existsSync(countryDir) || !fs.statSync(countryDir).isDirectory() || countryCode === 'int') continue;

  const nativeFile = path.join(countryDir, 'index.yaml');
  const englishFile = path.join(countryDir, 'merged_index_int.yaml');
  if (!fs.existsSync(nativeFile) || !fs.existsSync(englishFile)) continue;

  const nativeContent = loadYaml(nativeFile);
  const englishContent = loadYaml(englishFile);

  for (const content of [nativeContent, englishContent]) {
    for (const key of Object.keys(content)) {
      if (disallowedTopLevelKeys.has(key)) {
        failures.push(`${countryCode}: remove deprecated top-level key "${key}"`);
      }
    }
  }

  const nativePaths = [...collectLeafPaths(nativeContent)].filter((key) => !shouldIgnore(key));
  const englishPaths = [...collectLeafPaths(englishContent)].filter((key) => !shouldIgnore(key));
  const nativeOnly = nativePaths.filter((key) => !englishPaths.includes(key)).sort();
  const englishOnly = englishPaths.filter((key) => !nativePaths.includes(key)).sort();

  if (nativeOnly.length > 0) {
    failures.push(
      `${countryCode}: missing in merged_index_int.yaml -> ${nativeOnly.slice(0, 20).join(', ')}`,
    );
  }
  if (englishOnly.length > 0) {
    failures.push(
      `${countryCode}: missing in index.yaml -> ${englishOnly.slice(0, 20).join(', ')}`,
    );
  }

  if (countryCode !== 'se') {
    const nativeSeoCache = loadJson(path.join(countryDir, 'seo_content_cache.json'), {});
    const englishSeoCache = loadJson(path.join(countryDir, 'seo_content_cache_en.json'), {});

    const staleNativeVersions = collectInvalidSeoCacheEntries(
      nativeSeoCache,
      (_, entry) => String(entry?._generator_version ?? '') !== EXPECTED_SEO_GENERATOR_VERSION,
    );
    if (staleNativeVersions.length > 0) {
      failures.push(
        `${countryCode}: native browse SEO cache contains stale generator versions -> ${staleNativeVersions.join(', ')}`,
      );
    }

    const staleEnglishVersions = collectInvalidSeoCacheEntries(
      englishSeoCache,
      (_, entry) => String(entry?._generator_version ?? '') !== EXPECTED_SEO_GENERATOR_VERSION,
    );
    if (staleEnglishVersions.length > 0) {
      failures.push(
        `${countryCode}: English browse SEO cache contains stale generator versions -> ${staleEnglishVersions.join(', ')}`,
      );
    }

    const mismatchedNativeKeys = collectInvalidSeoCacheEntries(
      nativeSeoCache,
      (key, entry) => String(entry?._cache_key ?? '') !== key,
    );
    if (mismatchedNativeKeys.length > 0) {
      failures.push(
        `${countryCode}: native browse SEO cache has mismatched _cache_key metadata -> ${mismatchedNativeKeys.join(', ')}`,
      );
    }

    const mismatchedEnglishKeys = collectInvalidSeoCacheEntries(
      englishSeoCache,
      (key, entry) => String(entry?._cache_key ?? '') !== key,
    );
    if (mismatchedEnglishKeys.length > 0) {
      failures.push(
        `${countryCode}: English browse SEO cache has mismatched _cache_key metadata -> ${mismatchedEnglishKeys.join(', ')}`,
      );
    }

    const nativeLeaked = collectInvalidSeoCacheEntries(
      nativeSeoCache,
      (_, entry) => SWEDISH_NATIVE_SEED_TERMS.some((term) => entryText(entry).includes(term)),
    );
    if (nativeLeaked.length > 0) {
      failures.push(`${countryCode}: native browse SEO cache still contains Sweden-seed copy -> ${nativeLeaked.join(', ')}`);
    }

    const englishLeaked = collectInvalidSeoCacheEntries(
      englishSeoCache,
      (_, entry) => SWEDISH_ENGLISH_SEED_TERMS.some((term) => entryText(entry).includes(term)),
    );
    if (englishLeaked.length > 0) {
      failures.push(`${countryCode}: English browse SEO cache still contains Sweden-seed copy -> ${englishLeaked.join(', ')}`);
    }
  }
}

if (failures.length > 0) {
  console.error('Content contract validation failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Content contract validation passed.');
