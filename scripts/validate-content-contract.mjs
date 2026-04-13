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
const SEED_LEAK_IGNORED_PATHS = [
  'footer.social_links',
  'contact.content.email.address',
  'privacy_page.contact_email',
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

function collectTextLeaves(value, prefix = '', result = []) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectTextLeaves(entry, prefix ? `${prefix}[]` : '[]', result);
    }
    return result;
  }

  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      collectTextLeaves(nested, nextPrefix, result);
    }
    return result;
  }

  if (prefix && typeof value === 'string' && value.trim()) {
    result.push({ path: prefix, text: value.trim().toLowerCase() });
  }

  return result;
}

function textValue(value) {
  return String(value ?? '').trim();
}

function trainingPlansEnabled(content) {
  return Boolean(
    textValue(content?.navigation?.['training-plans']) ||
      textValue(content?.training_plans?.title),
  );
}

function trainingPlansLocaleCode(countryCode, nativeContent, locale) {
  if (locale === 'en') return 'en';
  return textValue(nativeContent?.country_language_code) || countryCode;
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

function shouldIgnoreSeedLeakPath(pathKey) {
  return SEED_LEAK_IGNORED_PATHS.some((prefix) => pathKey === prefix || pathKey.startsWith(`${prefix}.`));
}

function looksLikeUrlOrEmail(value) {
  return /^https?:\/\//i.test(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  const trainingPlansAreEnabled =
    trainingPlansEnabled(nativeContent) || trainingPlansEnabled(englishContent);

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
    const nativeSeedLeakPaths = collectTextLeaves(nativeContent)
      .filter(({ path, text }) => !shouldIgnoreSeedLeakPath(path) && !looksLikeUrlOrEmail(text))
      .filter(({ text }) => SWEDISH_NATIVE_SEED_TERMS.some((term) => text.includes(term)))
      .slice(0, 20)
      .map(({ path }) => path);
    if (nativeSeedLeakPaths.length > 0) {
      failures.push(
        `${countryCode}: native index.yaml still contains Sweden-seed copy -> ${nativeSeedLeakPaths.join(', ')}`,
      );
    }

    const englishSeedLeakPaths = collectTextLeaves(englishContent)
      .filter(({ path, text }) => !shouldIgnoreSeedLeakPath(path) && !looksLikeUrlOrEmail(text))
      .filter(({ text }) => SWEDISH_ENGLISH_SEED_TERMS.some((term) => text.includes(term)))
      .slice(0, 20)
      .map(({ path }) => path);
    if (englishSeedLeakPaths.length > 0) {
      failures.push(
        `${countryCode}: merged_index_int.yaml still contains Sweden-seed copy -> ${englishSeedLeakPaths.join(', ')}`,
      );
    }
  }

  const finalRacesPath = path.join(countryDir, 'final_races.json');
  const finalRaces = loadJson(finalRacesPath, []);
  if (Array.isArray(finalRaces) && finalRaces.length > 0) {
    const countyKeys = [...new Set(
      finalRaces
        .map((row) => textValue(row?.county))
        .filter(Boolean),
    )];

    if (countyKeys.length > 0) {
      const nativeCountyMapping = nativeContent?.county_mapping ?? {};
      const englishCountyMapping = englishContent?.county_mapping ?? {};

      const missingNativeCountyMappings = countyKeys
        .filter((countyLabel) => !textValue(nativeCountyMapping?.[countyLabel]))
        .slice(0, 20);
      if (missingNativeCountyMappings.length > 0) {
        failures.push(
          `${countryCode}: native county_mapping missing raw county labels -> ${missingNativeCountyMappings.join(', ')}`,
        );
      }

      const missingEnglishCountyMappings = countyKeys
        .filter((countyLabel) => !textValue(englishCountyMapping?.[countyLabel]))
        .slice(0, 20);
      if (missingEnglishCountyMappings.length > 0) {
        failures.push(
          `${countryCode}: English county_mapping missing raw county labels -> ${missingEnglishCountyMappings.join(', ')}`,
        );
      }
    }
  }

  if (trainingPlansAreEnabled) {
    const expectedTrainingPlanFiles = [
      path.join(
        countryDir,
        'json',
        `training_plans_processed_${trainingPlansLocaleCode(countryCode, nativeContent, 'native')}.json`,
      ),
      path.join(countryDir, 'json', 'training_plans_processed_en.json'),
    ];

    for (const filePath of expectedTrainingPlanFiles) {
      if (!fs.existsSync(filePath)) {
        failures.push(
          `${countryCode}: training plans UI is enabled but missing collector-synced artifact ${path.relative(countryDir, filePath)}`,
        );
        continue;
      }

      const payload = loadJson(filePath, null);
      if (!payload || typeof payload !== 'object' || typeof payload.plans !== 'object') {
        failures.push(
          `${countryCode}: invalid training plans payload ${path.relative(countryDir, filePath)} (expected object with plans)`,
        );
      }
    }
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
