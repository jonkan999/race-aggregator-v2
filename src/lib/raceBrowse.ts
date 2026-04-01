import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import type { CategoryFilterOption } from './categoryFilterOptions';
import { categoryFilterOptionsFromYaml } from './categoryFilterOptions';
import {
  getBrowseSeoIndexingPolicy,
  isBrowseCombinationAllowed,
  isBrowseStandaloneAllowed,
} from './browseSeoIndexing.js';
import { cityNamesMatch } from './cityNames';
import type { IndexYaml, Locale } from './content';
import { getNeighboringCountryOptions } from './neighboringCountryOptions';
import { primaryRaceImageUrl } from './raceCardDisplay';
import {
  defaultUpcomingRaceListFilters,
  getAllRaceListRows,
  getRaceListSnapshot,
  type RaceListSnapshotFilters,
} from './raceListSsg';
import { getMarketRouteTargets } from './marketRouteTargets';
import {
  getNeighboringCountryPath,
  getNeighboringIndexPath,
  resolveRaceDetailHref,
} from './marketRoutes';
import { isDomesticOrigin } from './neighboringSelection';
import { pickTranslation, type RaceListRow } from './raceListRow';
import { filterRowsToUpcomingWindow } from './upcomingRaceWindow';
import { localeBasePrefix, raceListSlug, slugify } from './content';

export const BROWSE_CATEGORIES_SEGMENT = 'categories';
export const BROWSE_TYPES_SEGMENT = 'types';
export const BROWSE_COUNTIES_SEGMENT = 'counties';
export const BROWSE_MONTHS_SEGMENT = 'months';
export const BROWSE_CITIES_SEGMENT = 'cities';
export const BROWSE_NEIGHBORING_SEGMENT = 'neighboring';

const BROWSE_CITY_LIMIT = 36;

export type BrowseCategoryEntry = {
  label: string;
  slug: string;
  count: number;
  href: string;
  option: CategoryFilterOption;
  allTypes: Array<{ label: string; count: number; href: string }>;
  topTypes: Array<{ label: string; count: number; href: string }>;
};

function categoryIdentity(option: CategoryFilterOption): string {
  return option.kind === 'type'
    ? `type:${option.raceType}`
    : `distance:${option.minKm}:${option.maxKm}`;
}

export type BrowseOverviewSectionEntry = {
  key: string;
  label: string;
  slug: string;
  href: string;
  count: number;
};

export type BrowseOverviewData = {
  categories: BrowseOverviewSectionEntry[];
  types: BrowseOverviewSectionEntry[];
  counties: BrowseOverviewSectionEntry[];
  months: BrowseOverviewSectionEntry[];
  cities: BrowseOverviewSectionEntry[];
  neighboring: BrowseOverviewSectionEntry[];
};

export type BrowseNavigationEntry = {
  label: string;
  href: string;
  count: number;
};

export type BrowseScopedRaceTypeEntry = {
  key: string;
  label: string;
  slug: string;
  href: string;
  count: number;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type QualifiedCitiesYaml = {
  cities?: Array<{
    name?: string;
    original_name?: string;
    nearby_race_count?: number;
  }>;
};

type QualifiedCity = {
  label: string;
  aliases: string[];
  nearbyRaceCount: number;
};

function distanceFilterPath(countryCode: string): string {
  return path.join(repoRoot, 'data', 'countries', countryCode, 'distance_filter.yaml');
}

function qualifiedCitiesPath(countryCode: string): string {
  return path.join(repoRoot, 'data', 'countries', countryCode, 'qualified_cities.yaml');
}

function browseBasePath(countryCode: string, locale: Locale, content: IndexYaml): string {
  const listSlug = raceListSlug(content, countryCode);
  const browseSlug = slugify(String(content.browse_by_category?.button ?? ''), countryCode);
  return `${localeBasePrefix(countryCode, locale)}${listSlug}/${browseSlug}`;
}

function raceListBasePath(countryCode: string, locale: Locale, content: IndexYaml): string {
  const listSlug = raceListSlug(content, countryCode);
  if (locale === 'native') {
    return countryCode === 'se' ? `/${listSlug}/` : `/${countryCode}/${listSlug}/`;
  }
  return `${localeBasePrefix(countryCode, locale)}${listSlug}/`;
}

function raceTypeSlug(countryCode: string, locale: Locale, content: IndexYaml, raceTypeKey: string): string {
  if (locale === 'en') {
    return slugify(raceTypeKey, countryCode);
  }
  const typeOptions = (content.type_options as Record<string, string> | undefined) ?? {};
  return slugify(typeOptions[raceTypeKey] ?? raceTypeKey, countryCode);
}

function allCountiesSlug(countryCode: string, content: IndexYaml): string {
  return slugify(String(content.county_label_text ?? ''), countryCode);
}

function citiesFolderSlug(countryCode: string, content: IndexYaml): string {
  return slugify(
    String(content.seo_cities_folder_name ?? content.browse_by_category?.cities ?? ''),
    countryCode,
  );
}

export function getRaceListBaseHref(countryCode: string, locale: Locale, content: IndexYaml): string {
  return raceListBasePath(countryCode, locale, content);
}

export function getBrowseOverviewHref(countryCode: string, locale: Locale, content: IndexYaml): string {
  return `${browseBasePath(countryCode, locale, content)}/`;
}

export function getBrowseCategoriesIndexHref(
  countryCode: string,
  locale: Locale,
  content: IndexYaml,
): string {
  return `${browseBasePath(countryCode, locale, content)}/${BROWSE_CATEGORIES_SEGMENT}/`;
}

export function getBrowseNeighboringIndexHref(
  countryCode: string,
  locale: Locale,
  _content: IndexYaml,
): string {
  return getNeighboringIndexPath(countryCode, locale);
}

export function getBrowseScopePageHref(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  segment: string;
  slug: string;
}): string {
  const { countryCode, locale, content, segment, slug } = args;
  return `${browseBasePath(countryCode, locale, content)}/${segment}/${slug}/`;
}

export function getBrowseTypePageHref(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  raceTypeKey: string;
}): string {
  return `${raceListBasePath(args.countryCode, args.locale, args.content)}${allCountiesSlug(
    args.countryCode,
    args.content,
  )}/${raceTypeSlug(args.countryCode, args.locale, args.content, args.raceTypeKey)}/`;
}

export function getBrowseCountyPageHref(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  countyLabel: string;
}): string {
  return `${raceListBasePath(args.countryCode, args.locale, args.content)}${slugify(
    args.countyLabel,
    args.countryCode,
  )}/`;
}

export function getBrowseMonthPageHref(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  monthLabel: string;
}): string {
  return `${raceListBasePath(args.countryCode, args.locale, args.content)}${slugify(
    args.monthLabel,
    args.countryCode,
  )}/`;
}

export function getBrowseCityPageHref(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  cityLabel: string;
}): string {
  return `${raceListBasePath(args.countryCode, args.locale, args.content)}${citiesFolderSlug(
    args.countryCode,
    args.content,
  )}/${slugify(args.cityLabel, args.countryCode)}/`;
}

export function getBrowseNeighboringCountryPageHref(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  neighborCountryCode: string;
}): string {
  return getNeighboringCountryPath({
    countryCode: args.countryCode,
    locale: args.locale,
    neighborCountryCode: args.neighborCountryCode,
  });
}

export function getCategoryPageHref(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  categorySlug: string;
}): string {
  const { countryCode, locale, content, categorySlug } = args;
  return `${raceListBasePath(countryCode, locale, content)}${allCountiesSlug(
    countryCode,
    content,
  )}/${categorySlug}/`;
}

export function getCategoryTypePageHref(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  categorySlug: string;
  raceTypeKey: string;
}): string {
  const { countryCode, locale, content, categorySlug, raceTypeKey } = args;
  return `${raceListBasePath(countryCode, locale, content)}${allCountiesSlug(
    countryCode,
    content,
  )}/${raceTypeSlug(countryCode, locale, content, raceTypeKey)}/${categorySlug}/`;
}

export function loadBrowseDistanceMapping(countryCode: string): {
  distance_mapping?: Record<string, string[]>;
  available_categories?: string[];
} {
  const file = distanceFilterPath(countryCode);
  if (!fs.existsSync(file)) return {};
  try {
    return (yaml.load(fs.readFileSync(file, 'utf8')) as {
      distance_mapping?: Record<string, string[]>;
      available_categories?: string[];
    }) ?? {};
  } catch {
    return {};
  }
}

function translationLocaleForContent(content: IndexYaml, locale: Locale): string {
  return locale === 'en' ? 'en' : String(content.country_language_code ?? 'sv');
}

function matchesCategory(row: RaceListRow, option: CategoryFilterOption): boolean {
  if (option.kind === 'type') {
    return (row.race_type?.trim().toLowerCase() ?? '') === option.raceType.trim().toLowerCase();
  }
  if (!Array.isArray(row.distance_m) || row.distance_m.length === 0) return false;
  return row.distance_m.some((value) => {
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

function categoryFiltersForOption(option: CategoryFilterOption): RaceListSnapshotFilters {
  if (option.kind === 'type') {
    return { raceType: option.raceType };
  }
  return {
    distanceMinKm: option.minKm,
    distanceMaxKm: option.maxKm,
  };
}

export async function getBrowseCategoryEntries(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
}): Promise<BrowseCategoryEntry[]> {
  const { countryCode, locale, content } = args;
  const policy = getBrowseSeoIndexingPolicy(content);
  const allRows = await getAllRaceListRows(countryCode);
  const domesticRows = filterRowsToUpcomingWindow(
    allRows.rows.filter((row) => isDomesticOrigin(row.origin_country, countryCode)),
  );
  const options = categoryFilterOptionsFromYaml(content.category_mapping);
  const typeOptions = (content.type_options as Record<string, string> | undefined) ?? {};

  const entries = options
    .map((option) => {
      const filtered = domesticRows.filter((row) => matchesCategory(row, option));
      if (filtered.length === 0) return null;
      if (
        !isBrowseStandaloneAllowed(policy, 'category', {
          label: option.label,
          count: filtered.length,
        })
      ) {
        return null;
      }

      const typeCounts = new Map<string, number>();
      for (const row of filtered) {
        const key = row.race_type?.trim().toLowerCase();
        if (!key) continue;
        typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
      }

      const slug = slugify(option.label, countryCode);
      const href = getCategoryPageHref({
        countryCode,
        locale,
        content,
        categorySlug: slug,
      });

      const allTypes = [...typeCounts.entries()]
        .filter(([typeKey, count]) =>
          isBrowseCombinationAllowed(policy, 'race_type_category', {
            raceTypeKey: typeKey,
            label: option.label,
            count,
          }),
        )
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sv'))
        .map(([typeKey, count]) => ({
          label: typeOptions[typeKey] ?? typeKey,
          count,
          href: getCategoryTypePageHref({
            countryCode,
            locale,
            content,
            categorySlug: slug,
            raceTypeKey: typeKey,
          }),
        }));

      return {
        label: option.label,
        slug,
        count: filtered.length,
        href,
        option,
        allTypes,
        topTypes: allTypes.slice(0, 5),
      } satisfies BrowseCategoryEntry;
    })
    .filter((entry): entry is BrowseCategoryEntry => entry !== null);

  return entries.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv'));
}

function firstRaceDate(row: RaceListRow): string | null {
  if (!Array.isArray(row.race_dates)) return null;
  for (const entry of row.race_dates) {
    if (Array.isArray(entry) && typeof entry[0] === 'string' && /^\d{8}$/.test(entry[0])) {
      return entry[0];
    }
  }
  return null;
}

function formatSchemaDate(raw: string | null): string | null {
  if (!raw || raw.length !== 8) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function absoluteUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return baseUrl ? `${baseUrl}${path}` : path;
}

function withQueryParams(
  href: string,
  params: Record<string, string | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (!value) continue;
    search.set(key, value);
  }
  const query = search.toString();
  return query ? `${href}?${query}` : href;
}

function rowPrimaryImage(row: RaceListRow): string | null {
  return primaryRaceImageUrl(row.payload);
}

function addEntryCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function loadQualifiedCities(countryCode: string): QualifiedCity[] {
  const file = qualifiedCitiesPath(countryCode);
  if (!fs.existsSync(file)) return [];

  try {
    const parsed = (yaml.load(fs.readFileSync(file, 'utf8')) as QualifiedCitiesYaml) ?? {};
    if (!Array.isArray(parsed.cities)) return [];

    return parsed.cities
      .map((entry) => {
        const label = typeof entry.name === 'string' ? entry.name.trim() : '';
        if (!label) return null;

        const aliases = Array.from(
          new Set(
            [label, entry.original_name]
              .filter((value): value is string => typeof value === 'string')
              .map((value) => value.trim())
              .filter(Boolean),
          ),
        );

        return {
          label,
          aliases,
          nearbyRaceCount:
            typeof entry.nearby_race_count === 'number' && Number.isFinite(entry.nearby_race_count)
              ? entry.nearby_race_count
              : 0,
        } satisfies QualifiedCity;
      })
      .filter((entry): entry is QualifiedCity => entry !== null);
  } catch {
    return [];
  }
}

function uniqueRowCities(row: RaceListRow): string[] {
  const values = new Set<string>();
  const nearestCity =
    typeof row.payload?.nearest_city === 'string' ? row.payload.nearest_city.trim() : '';
  if (nearestCity) values.add(nearestCity);
  if (Array.isArray(row.payload?.nearby_cities)) {
    for (const value of row.payload.nearby_cities) {
      if (typeof value === 'string' && value.trim()) values.add(value.trim());
    }
  }
  const location = typeof row.payload?.location === 'string' ? row.payload.location.trim() : '';
  if (location) values.add(location);
  return [...values];
}

export function rowMatchesCity(row: RaceListRow, city: string): boolean {
  const normalized = city.trim();
  if (!normalized) return false;
  return uniqueRowCities(row).some((value) => cityNamesMatch(value, normalized));
}

function rowMatchesAnyCity(row: RaceListRow, cityAliases: string[]): boolean {
  return cityAliases.some((city) => rowMatchesCity(row, city));
}

function firstNearestCity(row: RaceListRow): string | null {
  const value = typeof row.payload?.nearest_city === 'string' ? row.payload.nearest_city.trim() : '';
  return value || null;
}

export async function getBrowseNeighboringEntries(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
}): Promise<BrowseOverviewSectionEntry[]> {
  const { countryCode, locale, content } = args;
  const allRows = filterRowsToUpcomingWindow((await getAllRaceListRows(countryCode)).rows);
  const neighboringOptions = await getNeighboringCountryOptions({
    hostCountryCode: countryCode,
    locale,
    content,
  });

  const counts = new Map<string, number>();
  for (const row of allRows) {
    const origin = row.origin_country?.trim().toLowerCase();
    if (!origin || isDomesticOrigin(origin, countryCode)) continue;
    addEntryCount(counts, origin);
  }

  return neighboringOptions.countries
    .map((entry) => {
      const count = counts.get(entry.code) ?? 0;
      if (count <= 0) return null;
      return {
        key: entry.code,
        label: entry.label,
        slug: slugify(entry.code, countryCode),
        href: getBrowseNeighboringCountryPageHref({
          countryCode,
          locale,
          content,
          neighborCountryCode: entry.code,
        }),
        count,
      } satisfies BrowseOverviewSectionEntry;
    })
    .filter((entry): entry is BrowseOverviewSectionEntry => entry !== null)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, locale === 'en' ? 'en' : 'sv'));
}

export async function getBrowseOverviewData(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
}): Promise<BrowseOverviewData> {
  const { countryCode, locale, content } = args;
  const policy = getBrowseSeoIndexingPolicy(content);
  const allRows = await getAllRaceListRows(countryCode);
  const domesticRows = filterRowsToUpcomingWindow(
    allRows.rows.filter((row) => isDomesticOrigin(row.origin_country, countryCode)),
  );
  const translationLocale = translationLocaleForContent(content, locale);
  const countyMapping = (content.county_mapping as Record<string, string> | undefined) ?? {};
  const typeOptions = (content.type_options as Record<string, string> | undefined) ?? {};
  const monthMapping = (content.month_mapping as Record<string, string> | undefined) ?? {};

  const categoryEntries = await getBrowseCategoryEntries(args);

  const typeCounts = new Map<string, number>();
  const countyCounts = new Map<string, { label: string; count: number }>();
  const monthCounts = new Map<string, number>();
  const cityCandidateCounts = new Map<string, number>();

  for (const row of domesticRows) {
    if (row.race_type) {
      const key = row.race_type.trim().toLowerCase();
      addEntryCount(typeCounts, key);
    }

    if (row.county) {
      const existing = countyCounts.get(row.county);
      if (existing) {
        existing.count += 1;
      } else {
        countyCounts.set(row.county, {
          label: countyMapping[row.county] ?? row.county,
          count: 1,
        });
      }
    }

    const date = firstRaceDate(row);
    if (date) {
      const monthKey = date.slice(4, 6);
      const monthLabel = monthMapping[monthKey];
      if (monthLabel) addEntryCount(monthCounts, monthLabel);
    }

    const cityCandidate = firstNearestCity(row);
    if (cityCandidate) addEntryCount(cityCandidateCounts, cityCandidate);
  }

  const neighboring = await getBrowseNeighboringEntries(args);

  const qualifiedCities = loadQualifiedCities(countryCode);
  const cityEntries =
    qualifiedCities.length > 0
      ? qualifiedCities
          .map((city) => {
            const count = domesticRows.filter((row) => rowMatchesAnyCity(row, city.aliases)).length;
            if (count === 0) return null;
            if (
              !isBrowseStandaloneAllowed(policy, 'city', {
                count,
                isQualifiedCity: true,
              })
            ) {
              return null;
            }
            return {
              key: city.label,
              label: city.label,
              slug: slugify(city.label, countryCode),
              href: getBrowseCityPageHref({
                countryCode,
                locale,
                content,
                cityLabel: city.label,
              }),
              count,
            } satisfies BrowseOverviewSectionEntry;
          })
          .filter((entry): entry is BrowseOverviewSectionEntry => entry !== null)
      : [...cityCandidateCounts.keys()]
          .map((label) => {
            const count = domesticRows.filter((row) => rowMatchesCity(row, label)).length;
            if (count === 0) return null;
            if (
              !isBrowseStandaloneAllowed(policy, 'city', {
                count,
                isQualifiedCity: false,
              })
            ) {
              return null;
            }
            return {
              key: label,
              label,
              slug: slugify(label, countryCode),
              href: getBrowseCityPageHref({
                countryCode,
                locale,
                content,
                cityLabel: label,
              }),
              count,
            } satisfies BrowseOverviewSectionEntry;
          })
          .filter((entry): entry is BrowseOverviewSectionEntry => entry !== null)
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv'))
          .slice(0, BROWSE_CITY_LIMIT);

  return {
    categories: categoryEntries.map((entry) => ({
      key: entry.slug,
      label: entry.label,
      slug: entry.slug,
      href: entry.href,
      count: entry.count,
    })),
    types: [...typeCounts.entries()]
      .filter(([key, count]) =>
        isBrowseStandaloneAllowed(policy, 'race_type', {
          raceTypeKey: key,
          count,
        }),
      )
      .map(([key, count]) => ({
        key,
        label: typeOptions[key] ?? key,
        slug: raceTypeSlug(countryCode, locale, content, key),
        href: getBrowseTypePageHref({
          countryCode,
          locale,
          content,
          raceTypeKey: key,
        }),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv')),
    counties: [...countyCounts.entries()]
      .filter(([, data]) => isBrowseStandaloneAllowed(policy, 'county', { count: data.count }))
      .map(([key, data]) => ({
        key,
        label: data.label,
        slug: slugify(data.label, countryCode),
        href: getBrowseCountyPageHref({
          countryCode,
          locale,
          content,
          countyLabel: data.label,
        }),
        count: data.count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv')),
    months: [...monthCounts.entries()]
      .filter(([, count]) => isBrowseStandaloneAllowed(policy, 'month', { count }))
      .map(([label, count]) => ({
        key: Object.entries(monthMapping).find(([, monthLabel]) => monthLabel === label)?.[0] ?? label,
        label,
        slug: slugify(label, countryCode),
        href: getBrowseMonthPageHref({
          countryCode,
          locale,
          content,
          monthLabel: label,
        }),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv')),
    cities: cityEntries,
    neighboring,
  };
}

export async function getBrowseCityRows(countryCode: string, cityLabel: string): Promise<RaceListRow[]> {
  const allRows = await getAllRaceListRows(countryCode);
  return filterRowsToUpcomingWindow(allRows.rows).filter(
    (row) => isDomesticOrigin(row.origin_country, countryCode) && rowMatchesCity(row, cityLabel),
  );
}

function scopedRaceTypeEntriesFromRows(args: {
  rows: RaceListRow[];
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  scopeKind: 'county' | 'month' | 'city';
  scopeLabel: string;
  scopeHref: string;
  isQualifiedCity?: boolean;
}): BrowseScopedRaceTypeEntry[] {
  const policy = getBrowseSeoIndexingPolicy(args.content);
  const typeOptions = (args.content.type_options as Record<string, string> | undefined) ?? {};
  const comboKind =
    args.scopeKind === 'county'
      ? 'race_type_county'
      : args.scopeKind === 'month'
        ? 'race_type_month'
        : 'race_type_city';
  const typeCounts = new Map<string, number>();
  for (const row of args.rows) {
    const key = row.race_type?.trim().toLowerCase();
    if (!key) continue;
    addEntryCount(typeCounts, key);
  }

  return [...typeCounts.entries()]
    .filter(([key, count]) =>
      isBrowseCombinationAllowed(policy, comboKind, {
        raceTypeKey: key,
        count,
        isQualifiedCity: args.isQualifiedCity,
      }),
    )
    .map(([key, count]) => {
      const slug = raceTypeSlug(args.countryCode, args.locale, args.content, key);
      return {
        key,
        label: typeOptions[key] ?? key,
        slug,
        href: `${args.scopeHref}${slug}/`,
        count,
      } satisfies BrowseScopedRaceTypeEntry;
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, args.locale === 'en' ? 'en' : 'sv'));
}

export function getScopedRaceTypeEntries(args: {
  rows: RaceListRow[];
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  scopeKind: 'county' | 'month' | 'city';
  scopeLabel: string;
  scopeHref: string;
  isQualifiedCity?: boolean;
}): BrowseScopedRaceTypeEntry[] {
  return scopedRaceTypeEntriesFromRows(args);
}

export async function getBrowseNeighboringRows(
  countryCode: string,
  neighborCountryCode: string | null | undefined,
): Promise<RaceListRow[]> {
  const allRows = await getAllRaceListRows(countryCode);
  const normalized = neighborCountryCode?.trim().toLowerCase() ?? '';
  return filterRowsToUpcomingWindow(allRows.rows).filter((row) => {
    const origin = row.origin_country?.trim().toLowerCase() ?? '';
    if (!origin || isDomesticOrigin(origin, countryCode)) return false;
    if (!normalized) return true;
    return origin === normalized;
  });
}

export async function getCategorySnapshot(args: {
  countryCode: string;
  category: BrowseCategoryEntry;
}) {
  const { countryCode, category } = args;
  return getRaceListSnapshot(countryCode, {
    ...defaultUpcomingRaceListFilters(),
    ...categoryFiltersForOption(category.option),
  });
}

export function getCategoryFilters(category: BrowseCategoryEntry): RaceListSnapshotFilters {
  return categoryFiltersForOption(category.option);
}

export function findMatchingBrowseCategory(
  categories: BrowseCategoryEntry[],
  target: BrowseCategoryEntry,
): BrowseCategoryEntry | undefined {
  const id = categoryIdentity(target.option);
  return categories.find((entry) => categoryIdentity(entry.option) === id);
}

export function getCategoryItemListJson(args: {
  rows: RaceListRow[];
  total: number;
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  racePageFolder: string;
}) {
  const { rows, total, countryCode, locale, content, racePageFolder } = args;
  const translationLocale = translationLocaleForContent(content, locale);
  const baseUrl = (content.base_url ?? '').replace(/\/$/, '');
  const marketRouteTargets = getMarketRouteTargets();

  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: total,
    itemListElement: rows.map((row, index) => {
      const translation = pickTranslation(row.race_translations, translationLocale);
      const href = resolveRaceDetailHref({
        hostCountryCode: countryCode,
        routeLocale: locale,
        localRacePageFolder: racePageFolder,
        row,
        marketRouteTargets,
      });
      const rawDate = firstRaceDate(row);
      const locationName =
        typeof row.payload?.location === 'string' && row.payload.location.trim()
          ? row.payload.location.trim()
          : typeof row.payload?.nearest_city === 'string' && row.payload.nearest_city.trim()
            ? row.payload.nearest_city.trim()
            : row.county ?? '';
      const typeLocal = translation?.type_local ?? row.race_type ?? '';
      return {
        '@type': 'ListItem',
        position: index + 1,
        item: {
          '@type': 'SportsEvent',
          identifier: row.domain_name,
          name: translation?.name ?? row.domain_name,
          description:
            translation?.description ??
            (typeof row.payload?.description === 'string' ? row.payload.description : ''),
          url: absoluteUrl(baseUrl, href),
          image: rowPrimaryImage(row) ?? undefined,
          sport: `Löpning${typeLocal ? `, ${typeLocal}` : ''}`,
          eventStatus: 'https://schema.org/EventScheduled',
          startDate: formatSchemaDate(rawDate) ?? undefined,
          location: {
            '@type': 'Place',
            name: locationName,
            address: {
              '@type': 'PostalAddress',
              addressCountry: countryCode,
              addressLocality:
                typeof row.payload?.nearest_city === 'string' ? row.payload.nearest_city : undefined,
              addressRegion: row.county ?? undefined,
            },
          },
          distance:
            translation?.distance_verbose ??
            (typeof row.payload?.distance_verbose === 'string' ? row.payload.distance_verbose : ''),
        },
      };
    }),
  });
}

export function getBrowseNavigationJson(args: {
  entries: BrowseNavigationEntry[];
  content: IndexYaml;
  locale: Locale;
}): string | null {
  const baseUrl = String(args.content.base_url ?? '').replace(/\/$/, '');
  const entries = args.entries.filter((entry) => entry.href && entry.label && entry.count > 0).slice(0, 8);
  if (entries.length === 0) return null;

  const raceLabel = args.locale === 'en' ? 'races' : 'lopp';
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: entries.length,
    itemListElement: entries.map((entry) => ({
      '@type': 'SiteNavigationElement',
      name: entry.label,
      numberOfItems: entry.count,
      description:
        args.locale === 'en'
          ? `View ${entry.count} ${entry.label} ${raceLabel}`
          : `Visa ${entry.count} ${entry.label} ${raceLabel}`,
      url: absoluteUrl(baseUrl, entry.href),
    })),
  });
}

function sortNavigationEntries(entries: BrowseNavigationEntry[]): BrowseNavigationEntry[] {
  const deduped = new Map<string, BrowseNavigationEntry>();
  for (const entry of entries) {
    if (!entry.href || !entry.label || entry.count <= 0) continue;
    const key = entry.href;
    const existing = deduped.get(key);
    if (!existing || entry.count > existing.count) {
      deduped.set(key, entry);
    }
  }

  return [...deduped.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv'));
}

export function getOverviewPopularNavigationEntries(args: {
  overviewData: BrowseOverviewData;
}): BrowseNavigationEntry[] {
  return sortNavigationEntries([
    ...args.overviewData.categories.map((entry) => ({
      label: entry.label,
      href: entry.href,
      count: entry.count,
    })),
    ...args.overviewData.types.map((entry) => ({
      label: entry.label,
      href: entry.href,
      count: entry.count,
    })),
  ]).slice(0, 5);
}

export function getCategorySiblingNavigationEntries(args: {
  category: BrowseCategoryEntry;
  currentRaceTypeKey?: string;
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
}): BrowseNavigationEntry[] {
  return args.category.allTypes
    .filter((entry) => !args.currentRaceTypeKey || slugify(args.currentRaceTypeKey, args.countryCode) !== slugify(entry.href.split('/').filter(Boolean).pop() ?? '', args.countryCode))
    .map((entry) => ({
      label: entry.label,
      href: entry.href,
      count: entry.count,
    }));
}

export function getTypeCategoryNavigationEntries(args: {
  rows: RaceListRow[];
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  raceTypeKey: string;
}): BrowseNavigationEntry[] {
  const policy = getBrowseSeoIndexingPolicy(args.content);
  const options = categoryFilterOptionsFromYaml(args.content.category_mapping);
  return options
    .map((option) => {
      const count = args.rows.filter((row) => matchesCategory(row, option)).length;
      if (count === 0) return null;
      if (
        !isBrowseCombinationAllowed(policy, 'race_type_category', {
          raceTypeKey: args.raceTypeKey,
          label: option.label,
          count,
        })
      ) {
        return null;
      }
      const categorySlug = slugify(option.label, args.countryCode);
      return {
        label: option.label,
        count,
        href: getCategoryTypePageHref({
          countryCode: args.countryCode,
          locale: args.locale,
          content: args.content,
          categorySlug,
          raceTypeKey: args.raceTypeKey,
        }),
      } satisfies BrowseNavigationEntry;
    })
    .filter((entry): entry is BrowseNavigationEntry => entry !== null)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'sv'))
    .slice(0, 5);
}

export function getScopedPopularNavigationEntries(args: {
  rows: RaceListRow[];
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  currentHref: string;
  lockedRaceTypeKey?: string;
  lockedCategoryLabel?: string;
}): BrowseNavigationEntry[] {
  const policy = getBrowseSeoIndexingPolicy(args.content);
  const options = categoryFilterOptionsFromYaml(args.content.category_mapping);
  const typeOptions = (args.content.type_options as Record<string, string> | undefined) ?? {};
  const lockedRaceType = args.lockedRaceTypeKey?.trim().toLowerCase() ?? '';
  const lockedCategory = args.lockedCategoryLabel?.trim().toLowerCase() ?? '';

  const categoryEntries = options
    .map((option) => {
      if (lockedCategory && option.label.trim().toLowerCase() === lockedCategory) return null;
      const count = args.rows.filter((row) => matchesCategory(row, option)).length;
      if (count === 0) return null;
      if (
        !isBrowseStandaloneAllowed(policy, 'category', {
          label: option.label,
          count,
        })
      ) {
        return null;
      }
      return {
        label: option.label,
        href: withQueryParams(args.currentHref, { category: option.label }),
        count,
      } satisfies BrowseNavigationEntry;
    })
    .filter((entry): entry is BrowseNavigationEntry => entry !== null);

  const typeCounts = new Map<string, number>();
  for (const row of args.rows) {
    const key = row.race_type?.trim().toLowerCase();
    if (!key) continue;
    addEntryCount(typeCounts, key);
  }

  const typeEntries = [...typeCounts.entries()]
    .filter(([key, count]) =>
      isBrowseStandaloneAllowed(policy, 'race_type', {
        raceTypeKey: key,
        count,
      }),
    )
    .map(([key, count]) => ({
      label: typeOptions[key] ?? key,
      href:
        key === lockedRaceType
          ? ''
          : withQueryParams(args.currentHref, { raceType: key }),
      count,
    }));

  return sortNavigationEntries([...categoryEntries, ...typeEntries]).slice(0, 5);
}

export function getCategoryTranslationLocale(content: IndexYaml, locale: Locale): string {
  return translationLocaleForContent(content, locale);
}
