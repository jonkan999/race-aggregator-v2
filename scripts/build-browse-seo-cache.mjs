#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  getBrowseSeoIndexingPolicy,
  isBrowseCombinationAllowed,
  isBrowseStandaloneAllowed,
} from '../src/lib/browseSeoIndexing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const GENERATOR_VERSION = 'browse-seo-cache-v1';
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_SEO_MODEL?.trim() || 'gpt-5';
const DEFAULT_CHUNK_SIZE = Number.parseInt(process.env.BROWSE_SEO_CHUNK_SIZE ?? '8', 10) || 8;
const DEFAULT_OPENAI_TIMEOUT_MS =
  Number.parseInt(process.env.OPENAI_REQUEST_TIMEOUT_MS ?? '45000', 10) || 45000;
const DEFAULT_OPENAI_RETRIES =
  Number.parseInt(process.env.OPENAI_REQUEST_RETRIES ?? '2', 10) || 2;

function parseArgs(argv) {
  const options = {
    countries: [],
    force: false,
    dryRun: false,
    chunkSize: DEFAULT_CHUNK_SIZE,
    provider:
      process.env.BROWSE_SEO_PROVIDER?.trim().toLowerCase() ||
      (process.env.OPENAI_API_KEY ? 'openai' : 'template'),
    model: DEFAULT_OPENAI_MODEL,
  };

  for (const arg of argv) {
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith('--provider=')) {
      options.provider = arg.slice('--provider='.length).trim().toLowerCase();
      continue;
    }
    if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length).trim() || options.model;
      continue;
    }
    if (arg.startsWith('--chunk-size=')) {
      const value = Number.parseInt(arg.slice('--chunk-size='.length), 10);
      if (Number.isFinite(value) && value > 0) options.chunkSize = value;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    options.countries.push(arg.toLowerCase());
  }

  return options;
}

function countriesRoot() {
  return path.join(repoRoot, 'data', 'countries');
}

function countryDir(countryCode) {
  return path.join(countriesRoot(), countryCode);
}

function listCountryCodes() {
  const root = countriesRoot();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'int')
    .map((entry) => entry.name)
    .filter((code) => fs.existsSync(path.join(root, code, 'index.yaml')));
}

function readYaml(file) {
  if (!fs.existsSync(file)) return {};
  return yaml.load(fs.readFileSync(file, 'utf8')) ?? {};
}

function readJson(file, fallback = {}) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function buildSnapshotPath(countryCode) {
  const dir = process.env.RACE_LIST_BUILD_SNAPSHOT_DIR?.trim();
  if (!dir) return null;
  return path.join(dir, `${countryCode}.json`);
}

function firstExisting(paths) {
  for (const file of paths) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function loadRows(countryCode) {
  const snapshotPath = buildSnapshotPath(countryCode);
  if (snapshotPath && fs.existsSync(snapshotPath)) {
    const parsed = readJson(snapshotPath, {});
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
    return rows.map((row) => normalizeSnapshotRow(row, countryCode));
  }

  const base = countryDir(countryCode);
  const localPath = firstExisting([
    path.join(base, 'final_races_w_neighbors.json'),
    path.join(base, 'final_races.json'),
  ]);
  if (!localPath) return [];

  const rows = readJson(localPath, []);
  return Array.isArray(rows) ? rows.map((row) => normalizeLocalRow(row, countryCode)) : [];
}

function normalizeSnapshotRow(row, countryCode) {
  return {
    county: asTrimmedString(row.county),
    raceType: asTrimmedString(row.race_type),
    originCountry: asTrimmedString(row.origin_country) || countryCode,
    raceDates: Array.isArray(row.race_dates) ? row.race_dates : [],
    distanceM: Array.isArray(row.distance_m) ? row.distance_m : [],
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
  };
}

function normalizeLocalRow(row, countryCode) {
  return {
    county: asTrimmedString(row.county),
    raceType: asTrimmedString(row.type),
    originCountry: asTrimmedString(row.origin_country) || countryCode,
    raceDates: Array.isArray(row.race_dates) ? row.race_dates : [],
    distanceM: Array.isArray(row.distance_m) ? row.distance_m : [],
    payload: row && typeof row === 'object' ? row : {},
  };
}

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeComparableDate(raw) {
  if (typeof raw !== 'string') return null;
  const digits = raw.replaceAll('-', '').trim();
  return /^\d{8}$/.test(digits) ? digits : null;
}

function todayYyyyMmDd(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function oneYearFromTodayYyyyMmDd(now = new Date()) {
  const next = new Date(now);
  next.setFullYear(next.getFullYear() + 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function rowMatchesUpcomingWindow(row, today, nextYear) {
  if (!Array.isArray(row.raceDates)) return false;
  return row.raceDates.some((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') return false;
    const candidate = normalizeComparableDate(entry[0]);
    return Boolean(candidate && candidate >= today && candidate <= nextYear);
  });
}

function firstRaceDate(row) {
  if (!Array.isArray(row.raceDates)) return null;
  for (const entry of row.raceDates) {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') continue;
    const candidate = normalizeComparableDate(entry[0]);
    if (candidate) return candidate;
  }
  return null;
}

function parseMonthFromYyyymmdd(raw) {
  if (!raw || raw.length < 6) return null;
  const value = Number.parseInt(raw.slice(4, 6), 10);
  return Number.isFinite(value) ? value : null;
}

function normalizeCityName(value) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('oe', 'o')
    .replaceAll('ae', 'a')
    .replaceAll('aa', 'a')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function cityNamesMatch(left, right) {
  const normalizedLeft = normalizeCityName(left);
  const normalizedRight = normalizeCityName(right);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}

function uniqueRowCities(row) {
  const values = new Set();
  const nearestCity = asTrimmedString(row.payload?.nearest_city);
  const location = asTrimmedString(row.payload?.location);
  if (nearestCity) values.add(nearestCity);
  if (location) values.add(location);
  if (Array.isArray(row.payload?.nearby_cities)) {
    for (const value of row.payload.nearby_cities) {
      if (typeof value === 'string' && value.trim()) values.add(value.trim());
    }
  }
  return [...values];
}

function rowMatchesCity(row, city) {
  const normalized = city.trim();
  if (!normalized) return false;
  return uniqueRowCities(row).some((value) => cityNamesMatch(value, normalized));
}

function rowMatchesAnyCity(row, aliases) {
  return aliases.some((city) => rowMatchesCity(row, city));
}

function loadQualifiedCities(countryCode) {
  const file = path.join(countryDir(countryCode), 'qualified_cities.yaml');
  if (!fs.existsSync(file)) return [];

  const parsed = readYaml(file);
  const cities = Array.isArray(parsed.cities) ? parsed.cities : [];
  return cities
    .map((entry) => {
      const label = asTrimmedString(entry.name);
      if (!label) return null;
      const aliases = Array.from(
        new Set([label, asTrimmedString(entry.original_name)].filter(Boolean)),
      );
      return { label, aliases };
    })
    .filter(Boolean);
}

function categoryOptionsFromYaml(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const options = [];
  for (const [label, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      options.push({ label, kind: 'type', raceType: value });
      continue;
    }
    const range = value?.range;
    if (Array.isArray(range) && range.length >= 2 && typeof range[0] === 'number' && typeof range[1] === 'number') {
      options.push({ label, kind: 'distance', minKm: range[0], maxKm: range[1] });
    }
  }
  return options;
}

function rowMatchesCategory(row, option) {
  if (option.kind === 'type') {
    return row.raceType.toLowerCase() === option.raceType.trim().toLowerCase();
  }
  if (!Array.isArray(row.distanceM) || row.distanceM.length === 0) return false;
  return row.distanceM.some((value) => {
    const meters =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number.parseFloat(value)
          : Number.NaN;
    if (!Number.isFinite(meters)) return false;
    const km = meters / 1000;
    return km >= option.minKm && km <= option.maxKm;
  });
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function scopedCacheKeys(prefix, values) {
  return uniqueStrings(values).map((value) => `${prefix}:${value}`);
}

function typeCategoryKeys(raceTypeValues, categoryValues) {
  const keys = [];
  for (const raceTypeValue of uniqueStrings(raceTypeValues)) {
    for (const categoryValue of uniqueStrings(categoryValues)) {
      keys.push(`race_type:${raceTypeValue}-category:${categoryValue}`);
    }
  }
  return uniqueStrings(keys);
}

function typeCountyKeys(raceTypeValues, countyValues) {
  const keys = [];
  for (const raceTypeValue of uniqueStrings(raceTypeValues)) {
    for (const countyValue of uniqueStrings(countyValues)) {
      keys.push(`race_type:${raceTypeValue}-county:${countyValue}`);
    }
  }
  return uniqueStrings(keys);
}

function typeMonthKeys(raceTypeValues, monthValues) {
  const keys = [];
  for (const raceTypeValue of uniqueStrings(raceTypeValues)) {
    for (const monthValue of uniqueStrings(monthValues)) {
      keys.push(`race_type:${raceTypeValue}-month:${monthValue}`);
    }
  }
  return uniqueStrings(keys);
}

function typeCityKeys(raceTypeValues, cityValues) {
  const keys = [];
  for (const raceTypeValue of uniqueStrings(raceTypeValues)) {
    for (const cityValue of uniqueStrings(cityValues)) {
      keys.push(`race_type:${raceTypeValue}-city:${cityValue}`);
    }
  }
  return uniqueStrings(keys);
}

function buildTargetsForLocale({ countryCode, locale, content, rows }) {
  const policy = getBrowseSeoIndexingPolicy(content);
  const isEnglish = locale === 'en';
  const market = String(
    isEnglish
      ? content.country ?? content.country_native ?? 'Sweden'
      : content.country_native ?? content.country ?? 'Sverige',
  );
  const siteName = String(content.page_name ?? content.race_list_name ?? 'Race Aggregator');
  const countyMapping = (content.county_mapping && typeof content.county_mapping === 'object'
    ? content.county_mapping
    : {});
  const typeOptions = (content.type_options && typeof content.type_options === 'object'
    ? content.type_options
    : {});
  const monthMapping = (content.month_mapping && typeof content.month_mapping === 'object'
    ? content.month_mapping
    : {});

  const targets = [];
  const countyCounts = new Map();
  const typeCounts = new Map();
  const monthCounts = new Map();

  for (const row of rows) {
    if (row.county) {
      const label = countyMapping[row.county] ?? row.county;
      const current = countyCounts.get(row.county) ?? { label, count: 0 };
      current.count += 1;
      countyCounts.set(row.county, current);
    }

    if (row.raceType) {
      typeCounts.set(row.raceType, (typeCounts.get(row.raceType) ?? 0) + 1);
    }

    const date = firstRaceDate(row);
    const monthKey = date ? String(parseMonthFromYyyymmdd(date)).padStart(2, '0') : '';
    const monthLabel = monthMapping[monthKey];
    if (monthKey && monthLabel) {
      monthCounts.set(monthKey, {
        label: monthLabel,
        count: (monthCounts.get(monthKey)?.count ?? 0) + 1,
      });
    }
  }

  for (const [rawCounty, data] of countyCounts.entries()) {
    if (!isBrowseStandaloneAllowed(policy, 'county', { count: data.count })) continue;
    targets.push({
      kind: 'county',
      raceCount: data.count,
      market,
      siteName,
      label: data.label,
      rawLabel: rawCounty,
      cacheKeys: scopedCacheKeys('county', [data.label, rawCounty]),
    });
  }

  const qualifiedCities = loadQualifiedCities(countryCode);
  if (qualifiedCities.length > 0) {
    for (const city of qualifiedCities) {
      const count = rows.filter((row) => rowMatchesAnyCity(row, city.aliases)).length;
      if (count <= 0) continue;
      if (!isBrowseStandaloneAllowed(policy, 'city', { count, isQualifiedCity: true })) continue;
      targets.push({
        kind: 'city',
        raceCount: count,
        market,
        siteName,
        label: city.label,
        cacheKeys: uniqueStrings([
          ...scopedCacheKeys('city', [city.label]),
          ...scopedCacheKeys('county', [city.label]),
        ]),
      });
    }
  } else {
    const labels = new Set();
    for (const row of rows) {
      const nearestCity = asTrimmedString(row.payload?.nearest_city);
      if (nearestCity) labels.add(nearestCity);
    }
    for (const label of [...labels]) {
      const count = rows.filter((row) => rowMatchesCity(row, label)).length;
      if (count <= 0) continue;
      if (!isBrowseStandaloneAllowed(policy, 'city', { count, isQualifiedCity: false })) continue;
      targets.push({
        kind: 'city',
        raceCount: count,
        market,
        siteName,
        label,
        cacheKeys: uniqueStrings([
          ...scopedCacheKeys('city', [label]),
          ...scopedCacheKeys('county', [label]),
        ]),
      });
    }
  }

  for (const [monthKey, data] of monthCounts.entries()) {
    if (!isBrowseStandaloneAllowed(policy, 'month', { count: data.count })) continue;
    targets.push({
      kind: 'month',
      raceCount: data.count,
      market,
      siteName,
      label: data.label,
      rawLabel: monthKey,
      cacheKeys: scopedCacheKeys('month', [data.label, monthKey]),
    });
  }

  for (const [raceTypeKey, count] of typeCounts.entries()) {
    if (!isBrowseStandaloneAllowed(policy, 'race_type', { raceTypeKey, count })) continue;
    const label = typeOptions[raceTypeKey] ?? raceTypeKey;
    targets.push({
      kind: 'race_type',
      raceCount: count,
      market,
      siteName,
      label,
      rawLabel: raceTypeKey,
      cacheKeys: scopedCacheKeys('race_type', [label, raceTypeKey]),
    });
  }

  const categoryOptions = categoryOptionsFromYaml(content.category_mapping);
  for (const option of categoryOptions) {
    const matchingRows = rows.filter((row) => rowMatchesCategory(row, option));
    if (matchingRows.length <= 0) continue;
    if (
      !isBrowseStandaloneAllowed(policy, 'category', {
        label: option.label,
        count: matchingRows.length,
      })
    ) {
      continue;
    }

    targets.push({
      kind: 'category',
      raceCount: matchingRows.length,
      market,
      siteName,
      label: option.label,
      rawLabel: option.label,
      cacheKeys: scopedCacheKeys('category', [option.label]),
    });

    const comboCounts = new Map();
    for (const row of matchingRows) {
      if (!row.raceType) continue;
      comboCounts.set(row.raceType, (comboCounts.get(row.raceType) ?? 0) + 1);
    }

    for (const [raceTypeKey, count] of comboCounts.entries()) {
      if (
        !isBrowseCombinationAllowed(policy, 'race_type_category', {
          raceTypeKey,
          label: option.label,
          count,
        })
      ) {
        continue;
      }
      const raceTypeLabel = typeOptions[raceTypeKey] ?? raceTypeKey;
      targets.push({
        kind: 'race_type_category',
        raceCount: count,
        market,
        siteName,
        label: option.label,
        secondaryLabel: raceTypeLabel,
        rawLabel: raceTypeKey,
        cacheKeys: typeCategoryKeys([raceTypeLabel, raceTypeKey], [option.label]),
      });
    }
  }

  for (const [rawCounty, data] of countyCounts.entries()) {
    const countyLabel = data.label;
    const countyRows = rows.filter((row) => row.county === rawCounty);
    const comboCounts = new Map();
    for (const row of countyRows) {
      if (!row.raceType) continue;
      comboCounts.set(row.raceType, (comboCounts.get(row.raceType) ?? 0) + 1);
    }
    for (const [raceTypeKey, count] of comboCounts.entries()) {
      if (
        !isBrowseCombinationAllowed(policy, 'race_type_county', {
          raceTypeKey,
          count,
        })
      ) {
        continue;
      }
      const raceTypeLabel = typeOptions[raceTypeKey] ?? raceTypeKey;
      targets.push({
        kind: 'race_type_county',
        raceCount: count,
        market,
        siteName,
        label: countyLabel,
        secondaryLabel: raceTypeLabel,
        rawLabel: raceTypeKey,
        cacheKeys: typeCountyKeys([raceTypeLabel, raceTypeKey], [countyLabel, rawCounty]),
      });
    }
  }

  for (const [monthKey, data] of monthCounts.entries()) {
    const monthRows = rows.filter((row) => {
      const date = firstRaceDate(row);
      return date ? String(parseMonthFromYyyymmdd(date)).padStart(2, '0') === monthKey : false;
    });
    const comboCounts = new Map();
    for (const row of monthRows) {
      if (!row.raceType) continue;
      comboCounts.set(row.raceType, (comboCounts.get(row.raceType) ?? 0) + 1);
    }
    for (const [raceTypeKey, count] of comboCounts.entries()) {
      if (
        !isBrowseCombinationAllowed(policy, 'race_type_month', {
          raceTypeKey,
          count,
        })
      ) {
        continue;
      }
      const raceTypeLabel = typeOptions[raceTypeKey] ?? raceTypeKey;
      targets.push({
        kind: 'race_type_month',
        raceCount: count,
        market,
        siteName,
        label: data.label,
        secondaryLabel: raceTypeLabel,
        rawLabel: raceTypeKey,
        cacheKeys: typeMonthKeys([raceTypeLabel, raceTypeKey], [data.label, monthKey]),
      });
    }
  }

  const scopedCities =
    qualifiedCities.length > 0
      ? qualifiedCities.map((city) => ({
          label: city.label,
          aliases: city.aliases,
          rawLabel: city.label,
          isQualifiedCity: true,
        }))
      : uniqueStrings(
          rows
            .map((row) => asTrimmedString(row.payload?.nearest_city))
            .filter(Boolean),
        ).map((label) => ({
          label,
          aliases: [label],
          rawLabel: label,
          isQualifiedCity: false,
        }));

  for (const city of scopedCities) {
    const cityRows = rows.filter((row) => rowMatchesAnyCity(row, city.aliases));
    if (cityRows.length <= 0) continue;
    const comboCounts = new Map();
    for (const row of cityRows) {
      if (!row.raceType) continue;
      comboCounts.set(row.raceType, (comboCounts.get(row.raceType) ?? 0) + 1);
    }
    for (const [raceTypeKey, count] of comboCounts.entries()) {
      if (
        !isBrowseCombinationAllowed(policy, 'race_type_city', {
          raceTypeKey,
          count,
          isQualifiedCity: city.isQualifiedCity,
        })
      ) {
        continue;
      }
      const raceTypeLabel = typeOptions[raceTypeKey] ?? raceTypeKey;
      targets.push({
        kind: 'race_type_city',
        raceCount: count,
        market,
        siteName,
        label: city.label,
        secondaryLabel: raceTypeLabel,
        rawLabel: raceTypeKey,
        cacheKeys: typeCityKeys([raceTypeLabel, raceTypeKey], [city.label, city.rawLabel]),
      });
    }
  }

  return targets.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind, 'en');
    return left.label.localeCompare(right.label, isEnglish ? 'en' : 'sv');
  });
}

function replaceTemplateTokens(template, values) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function configuredBrowseTemplate(content, target, locale) {
  const configured = content?.seo_templates?.browse_page_templates?.[target.kind] ?? {};
  const title = cleanWhitespace(configured.title);
  const metaDescription = cleanWhitespace(configured.meta_description);
  const h1 = cleanWhitespace(configured.h1);
  const paragraph = cleanWhitespace(configured.paragraph);
  if (!title || !metaDescription || !h1 || !paragraph) {
    throw new Error(
      `Missing seo_templates.browse_page_templates.${target.kind} for locale ${locale}.`,
    );
  }
  return {
    title,
    meta_description: metaDescription,
    h1,
    paragraph,
  };
}

function buildTemplateValues(target) {
  const label = cleanWhitespace(target.label);
  const market = cleanWhitespace(target.market);
  const siteName = cleanWhitespace(target.siteName);
  const secondaryLabel = cleanWhitespace(target.secondaryLabel);
  const raceType =
    target.kind === 'race_type_category' ||
    target.kind === 'race_type_county' ||
    target.kind === 'race_type_month' ||
    target.kind === 'race_type_city'
      ? secondaryLabel
      : target.kind === 'race_type'
        ? label
        : '';
  const category =
    target.kind === 'race_type_category' || target.kind === 'category' ? label : '';

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
    county: target.kind === 'county' || target.kind === 'race_type_county' ? label : '',
    county_lower:
      target.kind === 'county' || target.kind === 'race_type_county' ? label.toLowerCase() : '',
    city: target.kind === 'city' || target.kind === 'race_type_city' ? label : '',
    city_lower:
      target.kind === 'city' || target.kind === 'race_type_city' ? label.toLowerCase() : '',
    month: target.kind === 'month' || target.kind === 'race_type_month' ? label : '',
    month_lower:
      target.kind === 'month' || target.kind === 'race_type_month' ? label.toLowerCase() : '',
    location:
      target.kind === 'county' ||
      target.kind === 'city' ||
      target.kind === 'month' ||
      target.kind === 'race_type_county' ||
      target.kind === 'race_type_city' ||
      target.kind === 'race_type_month'
        ? label
        : market,
    location_lower:
      target.kind === 'county' ||
      target.kind === 'city' ||
      target.kind === 'month' ||
      target.kind === 'race_type_county' ||
      target.kind === 'race_type_city' ||
      target.kind === 'race_type_month'
        ? label.toLowerCase()
        : market.toLowerCase(),
  };
}

function buildDeterministicEntry(target, content, locale) {
  const template = configuredBrowseTemplate(content, target, locale);
  const values = buildTemplateValues(target);
  return {
    title: cleanWhitespace(replaceTemplateTokens(template.title, values)),
    meta_description: cleanWhitespace(replaceTemplateTokens(template.meta_description, values)),
    h1: cleanWhitespace(replaceTemplateTokens(template.h1, values)),
    paragraph: cleanWhitespace(replaceTemplateTokens(template.paragraph, values)),
  };
}

function cleanWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sanitizeEntry(entry) {
  return {
    title: cleanWhitespace(entry.title),
    meta_description: cleanWhitespace(entry.meta_description),
    h1: cleanWhitespace(entry.h1),
    paragraph: cleanWhitespace(entry.paragraph),
  };
}

function entryIsComplete(entry) {
  return Boolean(
    entry &&
      cleanWhitespace(entry.title) &&
      cleanWhitespace(entry.meta_description) &&
      cleanWhitespace(entry.h1) &&
      cleanWhitespace(entry.paragraph),
  );
}

function entryNeedsRefresh(entry, force) {
  if (force) return true;
  if (!entryIsComplete(entry)) return true;
  return false;
}

function currentIsoTimestamp() {
  return new Date().toISOString();
}

function systemPromptForLocale(content) {
  const prompt = cleanWhitespace(content?.seo_generation?.browse_system_prompt);
  if (!prompt) {
    throw new Error('Missing seo_generation.browse_system_prompt in country YAML.');
  }
  return prompt;
}

function batchPayloadForLocale(targets, content, locale) {
  const guidanceConfig = content?.seo_generation?.browse_guidance ?? {};
  return {
    locale,
    targets: targets.map((target) => ({
      cache_key: target.cacheKeys[0],
      route_kind: target.kind,
      market: target.market,
      site_name: target.siteName,
      label: target.label,
      secondary_label: target.secondaryLabel ?? '',
      guidance: cleanWhitespace(guidanceConfig[target.kind] ?? ''),
    })),
  };
}

function responseSchema() {
  return {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            cache_key: { type: 'string', minLength: 1 },
            title: { type: 'string', minLength: 1 },
            meta_description: { type: 'string', minLength: 1 },
            h1: { type: 'string', minLength: 1 },
            paragraph: { type: 'string', minLength: 1 },
          },
          required: ['cache_key', 'title', 'meta_description', 'h1', 'paragraph'],
          additionalProperties: false,
        },
      },
    },
    required: ['entries'],
    additionalProperties: false,
  };
}

function extractTextFromOpenAiResponse(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (!Array.isArray(item?.content)) continue;
      for (const content of item.content) {
        if (typeof content?.text === 'string' && content.text.trim()) {
          return content.text.trim();
        }
      }
    }
  }

  return '';
}

async function generateEntriesWithOpenAi({ targets, content, locale, model }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required when provider=openai.');
  }

  let lastError = null;
  for (let attempt = 0; attempt <= DEFAULT_OPENAI_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_OPENAI_TIMEOUT_MS);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          store: false,
          input: [
            {
              role: 'system',
              content: [{ type: 'input_text', text: systemPromptForLocale(content) }],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: JSON.stringify(batchPayloadForLocale(targets, content, locale)),
                },
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'browse_seo_batch',
              strict: true,
              schema: responseSchema(),
            },
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const text = extractTextFromOpenAiResponse(data);
      if (!text) {
        throw new Error('OpenAI response did not include structured text output.');
      }

      const parsed = JSON.parse(text);
      const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
      const mapped = new Map();
      for (const entry of entries) {
        if (!entryIsComplete(entry)) continue;
        mapped.set(cleanWhitespace(entry.cache_key), sanitizeEntry(entry));
      }
      return mapped;
    } catch (error) {
      lastError = error;
      if (attempt >= DEFAULT_OPENAI_RETRIES) break;
      console.warn(
        `OpenAI browse SEO request failed on attempt ${attempt + 1}/${DEFAULT_OPENAI_RETRIES + 1}. Retrying...`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error('OpenAI request failed without an explicit error.');
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fillEntries({ targets, locale, content, provider, model, chunkSize }) {
  const entries = new Map();

  if (provider === 'template') {
    for (const target of targets) {
      entries.set(target.cacheKeys[0], sanitizeEntry(buildDeterministicEntry(target, content, locale)));
    }
    return entries;
  }

  const groupedTargets = chunk(targets, chunkSize);
  for (const [index, group] of groupedTargets.entries()) {
    console.log(
      `Generating browse SEO chunk ${index + 1}/${groupedTargets.length} for ${locale} (${group.length} targets)...`,
    );
    const generated = await generateEntriesWithOpenAi({ targets: group, content, locale, model });
    for (const target of group) {
      const generatedEntry = generated.get(target.cacheKeys[0]);
      entries.set(
        target.cacheKeys[0],
        generatedEntry ?? sanitizeEntry(buildDeterministicEntry(target, content, locale)),
      );
    }
  }

  return entries;
}

async function buildCountryCache({ countryCode, locale, content, provider, model, force, dryRun, chunkSize }) {
  const rows = loadRows(countryCode).filter((row) => {
    const today = todayYyyyMmDd();
    const nextYear = oneYearFromTodayYyyyMmDd();
    return row.originCountry.toLowerCase() === countryCode && rowMatchesUpcomingWindow(row, today, nextYear);
  });

  const cacheFile = path.join(
    countryDir(countryCode),
    locale === 'en' ? 'seo_content_cache_en.json' : 'seo_content_cache.json',
  );
  const cache = readJson(cacheFile, {});
  if (force) {
    for (const key of Object.keys(cache)) {
      if (!key.startsWith('neighbor:')) {
        delete cache[key];
      }
    }
  }
  const targets = buildTargetsForLocale({ countryCode, locale, content, rows });
  const targetsToGenerate = targets.filter((target) => {
    const existing = cache[target.cacheKeys[0]];
    return entryNeedsRefresh(existing, force);
  });

  const summary = {
    countryCode,
    locale,
    totalTargets: targets.length,
    updated: 0,
    reused: targets.length - targetsToGenerate.length,
    file: cacheFile,
  };

  if (targetsToGenerate.length === 0) {
    return summary;
  }

  const generatedEntries = await fillEntries({
    targets: targetsToGenerate,
    locale,
    content,
    provider,
    model,
    chunkSize,
  });

  for (const target of targetsToGenerate) {
    const generated = generatedEntries.get(target.cacheKeys[0]);
    const entry = sanitizeEntry(generated ?? buildDeterministicEntry(target, content, locale));
    cache[target.cacheKeys[0]] = {
      ...entry,
      _cache_key: target.cacheKeys[0],
      _route_kind: target.kind,
      _race_count: target.raceCount,
      _generator_version: GENERATOR_VERSION,
      _generated_by: provider,
      _generated_at: currentIsoTimestamp(),
      ...(provider === 'openai' ? { _model: model } : {}),
    };
    summary.updated += 1;
  }

  if (!dryRun) {
    writeJson(cacheFile, cache);
  }

  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const countryCodes = options.countries.length > 0 ? options.countries : listCountryCodes();
  if (countryCodes.length === 0) {
    throw new Error(
      'No country codes found to build browse SEO cache. Expected tracked market folders under data/countries/{code}/index.yaml.',
    );
  }

  if (options.provider !== 'template' && options.provider !== 'openai') {
    throw new Error(`Unsupported provider: ${options.provider}`);
  }

  const summaries = [];
  for (const countryCode of countryCodes) {
    const nativeFile = path.join(countryDir(countryCode), 'index.yaml');
    const enFile = path.join(countryDir(countryCode), 'merged_index_int.yaml');
    const nativeContent = readYaml(nativeFile);
    const enContent = fs.existsSync(enFile) ? readYaml(enFile) : null;

    summaries.push(
      await buildCountryCache({
        countryCode,
        locale: 'native',
        content: nativeContent,
        provider: options.provider,
        model: options.model,
        force: options.force,
        dryRun: options.dryRun,
        chunkSize: options.chunkSize,
      }),
    );

    if (enContent) {
      summaries.push(
        await buildCountryCache({
          countryCode,
          locale: 'en',
          content: enContent,
          provider: options.provider,
          model: options.model,
          force: options.force,
          dryRun: options.dryRun,
          chunkSize: options.chunkSize,
        }),
      );
    }
  }

  for (const summary of summaries) {
    console.log(
      [
        `Browse SEO cache updated for ${summary.countryCode} (${summary.locale}).`,
        `Targets: ${summary.totalTargets}.`,
        `Updated: ${summary.updated}.`,
        `Reused: ${summary.reused}.`,
        options.dryRun ? 'Dry run only.' : `File: ${summary.file}.`,
      ].join(' '),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
