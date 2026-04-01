import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const countriesDir = path.join(repoRoot, 'data', 'countries');
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

const failures = [];

for (const countryCode of fs.readdirSync(countriesDir)) {
  const countryDir = path.join(countriesDir, countryCode);
  if (!fs.statSync(countryDir).isDirectory() || countryCode === 'int') continue;

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
}

if (failures.length > 0) {
  console.error('Content contract validation failed:\n');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Content contract validation passed.');
