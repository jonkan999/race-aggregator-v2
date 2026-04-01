import { auxiliaryPageHref } from './auxiliaryPages';
import { localeBasePrefix, raceListSlug, slugify, type IndexYaml, type Locale } from './content';
import { getMarketRouteTargets } from './marketRouteTargets';
import { resolveRaceDetailHref } from './marketRoutes';
import { fallbackRaceImage } from './raceDetail';
import {
  getBrowseOverviewData,
  getBrowseTypePageHref,
  getCategoryTypePageHref,
  type BrowseOverviewData,
} from './raceBrowse';
import { getAllRaceListRows } from './raceListSsg';
import { isDomesticOrigin } from './neighboringSelection';
import { pickTranslation, type RaceListRow } from './raceListRow';
import {
  nextUpcomingRaceDateWithinWindow,
  upcomingWindowEnd,
  upcomingWindowStart,
} from './upcomingRaceWindow';
import {
  excerptDescription,
  formatDistanceSegment,
  primaryRaceImageUrl,
  splitDistanceVerbose,
} from './raceCardDisplay';

export type HomeRaceEntry = {
  id: string;
  href: string;
  name: string;
  dateLabel: string;
  dateIso: string | null;
  locationLabel: string;
  typeLabel: string;
  distanceLabels: string[];
  imageSrc: string;
  imageAlt: string;
  summary: string;
  metaLabel?: string;
  popularityValue?: number;
};

export type HomeCategoryPanel = {
  title: string;
  href: string;
  imageSrc: string;
  imageAlt: string;
  sublinks: Array<{ label: string; href: string }>;
  ctaLabel: string;
};

export type HomeToolLink = {
  label: string;
  href: string;
  iconId: string;
  description: string;
};

export type HomePageData = {
  title: string;
  description: string;
  raceListHref: string;
  addRaceHref: string;
  browseHref: string;
  featuredRaces: HomeRaceEntry[];
  trendingRaces: HomeRaceEntry[];
  recentRaces: HomeRaceEntry[];
  popularRegions: BrowseOverviewData['counties'];
  popularCities: BrowseOverviewData['cities'];
  quickExplore: BrowseOverviewData['categories'];
  heroStats: Array<{ value: string; label: string }>;
  categoryPanels: HomeCategoryPanel[];
  toolLinks: HomeToolLink[];
};

function translationLocale(content: IndexYaml, locale: Locale): string {
  return locale === 'en' ? 'en' : String(content.country_language_code ?? 'sv');
}

function firstRaceDate(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const start = entry[0];
    if (typeof start === 'string' && /^\d{8}$/.test(start)) return start;
  }
  return null;
}

function promotionRaceDate(
  raw: unknown,
  startComparable: string,
  endComparable: string,
): string | null {
  return nextUpcomingRaceDateWithinWindow(raw, startComparable, endComparable) ?? firstRaceDate(raw);
}

function compareUpcomingRows(
  left: RaceListRow,
  right: RaceListRow,
  startComparable: string,
  endComparable: string,
): number {
  const leftDate = promotionRaceDate(left.race_dates, startComparable, endComparable) ?? '99999999';
  const rightDate = promotionRaceDate(right.race_dates, startComparable, endComparable) ?? '99999999';
  if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  return left.domain_name.localeCompare(right.domain_name, 'sv');
}

function compareCreatedAt(
  left: RaceListRow,
  right: RaceListRow,
  startComparable: string,
  endComparable: string,
): number {
  const leftCreated =
    typeof left.payload?.created_date === 'string' ? left.payload.created_date : '';
  const rightCreated =
    typeof right.payload?.created_date === 'string' ? right.payload.created_date : '';
  if (leftCreated !== rightCreated) return rightCreated.localeCompare(leftCreated);
  return compareUpcomingRows(left, right, startComparable, endComparable);
}

function formatShortDate(raw: string | null, content: IndexYaml, locale: Locale): string {
  if (!raw) return '';
  const monthKey = raw.slice(4, 6);
  const monthMapping = (content.month_mapping_short as Record<string, string> | undefined) ?? {};
  const day = String(Number.parseInt(raw.slice(6, 8), 10));
  const monthLabel = monthMapping[monthKey];

  if (monthLabel) {
    return locale === 'en' ? `${monthLabel} ${day}` : `${day} ${monthLabel}`;
  }

  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en' : 'sv-SE', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  return formatter.format(new Date(`${iso}T12:00:00Z`));
}

function formatRecentMeta(createdAt: string | null, content: IndexYaml, locale: Locale): string {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';

  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const utcCreated = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diffDays = Math.round((utcToday - utcCreated) / 86_400_000);

  if (diffDays <= 0) return String(content.today ?? (locale === 'en' ? 'today' : 'idag'));
  if (diffDays === 1) return String(content.yesterday ?? (locale === 'en' ? 'yesterday' : 'igår'));
  if (diffDays < 30) {
    return `${diffDays} ${String(content.days_ago ?? (locale === 'en' ? 'days ago' : 'dagar sedan'))}`;
  }

  return new Intl.DateTimeFormat(locale === 'en' ? 'en' : 'sv-SE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function detailHref(
  row: RaceListRow,
  countryCode: string,
  locale: Locale,
  content: IndexYaml,
): string {
  const racePageFolder = String(
    content.race_page_folder_name ?? (locale === 'en' ? 'race-pages' : 'loppsidor'),
  );
  return resolveRaceDetailHref({
    hostCountryCode: countryCode,
    routeLocale: locale,
    localRacePageFolder: racePageFolder,
    row,
    marketRouteTargets: getMarketRouteTargets(),
  });
}

function rowLocationLabel(row: RaceListRow, content: IndexYaml): string {
  const countyMapping = (content.county_mapping as Record<string, string> | undefined) ?? {};
  const nearestCity =
    typeof row.payload?.nearest_city === 'string' ? row.payload.nearest_city.trim() : '';
  if (nearestCity) return nearestCity;
  if (row.county?.trim()) return countyMapping[row.county] ?? row.county;
  return String(content.country_native ?? content.country ?? '');
}

function rowImage(row: RaceListRow, raceName: string, content: IndexYaml): { src: string; alt: string } {
  const src = primaryRaceImageUrl(row.payload) ?? fallbackRaceImage(row.domain_name, row.race_type);
  const altPrefix = String(content.alt_prefix ?? '');
  return {
    src,
    alt:
      (Array.isArray(row.payload?.images) &&
      row.payload.images[0] &&
      typeof row.payload.images[0] === 'object' &&
      typeof (row.payload.images[0] as { alt_text?: unknown }).alt_text === 'string'
        ? String((row.payload.images[0] as { alt_text: string }).alt_text)
        : `${altPrefix}${raceName}`) || raceName,
  };
}

function hasPromoImage(row: RaceListRow): boolean {
  return Boolean(primaryRaceImageUrl(row.payload));
}

function parseOptionalNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function rowPopularityScore(row: RaceListRow): number | null {
  const topLevel = row as RaceListRow & { view_count?: unknown; last_30_days_views?: unknown };
  const payload = row.payload as Record<string, unknown> | null | undefined;
  const analytics =
    payload && typeof payload.analytics === 'object'
      ? (payload.analytics as Record<string, unknown>)
      : null;

  const candidates = [
    topLevel.last_30_days_views,
    topLevel.view_count,
    payload?.last_30_days_views,
    payload?.views_last_30_days,
    payload?.page_views_last_30_days,
    payload?.view_count,
    analytics?.last_30_days_views,
    analytics?.views_last_30_days,
    analytics?.page_views_last_30_days,
  ];

  for (const candidate of candidates) {
    const parsed = parseOptionalNumber(candidate);
    if (parsed != null) return parsed;
  }

  return null;
}

function distanceUnitLabel(km: number, content: IndexYaml): string | null {
  const configured = Array.isArray(content.distance_units)
    ? (content.distance_units as Array<{ range?: [number, number]; label?: string }>)
    : [];

  for (const entry of configured) {
    if (!Array.isArray(entry.range) || entry.range.length !== 2 || !entry.label) continue;
    const [min, max] = entry.range;
    if (km >= min && km <= max) return entry.label;
  }

  return null;
}

function formatKmLabel(km: number): string {
  const rounded = Math.round(km * 10) / 10;
  return Number.isInteger(rounded)
    ? `${rounded.toFixed(0)}km`
    : `${rounded.toFixed(1).replace('.', '.')}km`;
}

function distanceLabelsFromMeters(raw: unknown, content: IndexYaml): string[] {
  if (!Array.isArray(raw)) return [];

  const labels = raw
    .map((value) => {
      const meters =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Number.parseFloat(value.replace(',', '.'))
            : Number.NaN;
      if (!Number.isFinite(meters)) return '';
      const km = meters / 1000;
      return distanceUnitLabel(km, content) ?? formatKmLabel(km);
    })
    .filter(Boolean);

  return [...new Set(labels)];
}

function toHomeRaceEntry(args: {
  row: RaceListRow;
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  recent?: boolean;
  upcomingStartComparable: string;
  upcomingEndComparable: string;
  popularityValue?: number;
}): HomeRaceEntry {
  const {
    row,
    countryCode,
    locale,
    content,
    recent = false,
    upcomingStartComparable,
    upcomingEndComparable,
    popularityValue,
  } = args;
  const localeCode = translationLocale(content, locale);
  const translation = pickTranslation(row.race_translations, localeCode);
  const hasExactTranslation = (row.race_translations ?? []).some((entry) => entry.locale === localeCode);
  const name = translation?.name?.trim() || row.domain_name;
  const typeOptions = (content.type_options as Record<string, string> | undefined) ?? {};
  const fallbackTypeLabel = row.race_type ? typeOptions[row.race_type] ?? row.race_type : '';
  const typeLabel = fallbackTypeLabel;
  const verboseLocalDistanceMapping =
    (content.verbose_local_distance_mapping as Record<string, string> | undefined) ?? {};
  const distanceLabelsFromData = distanceLabelsFromMeters(row.distance_m, content);
  const distanceSource =
    hasExactTranslation && translation?.distance_verbose
      ? translation.distance_verbose
      : typeof row.payload?.distance_verbose === 'string'
        ? row.payload.distance_verbose
        : '';
  const distanceLabels =
    distanceLabelsFromData.length > 0
      ? distanceLabelsFromData.slice(0, 4)
      : splitDistanceVerbose(distanceSource)
          .map((segment) => formatDistanceSegment(segment, verboseLocalDistanceMapping))
          .slice(0, 4);
  const dateValue = promotionRaceDate(row.race_dates, upcomingStartComparable, upcomingEndComparable);
  const image = rowImage(row, name, content);
  const summarySource =
    translation?.description ??
    (typeof row.payload?.description === 'string' ? row.payload.description : '');

  return {
    id: row.id,
    href: detailHref(row, countryCode, locale, content),
    name,
    dateLabel: formatShortDate(dateValue, content, locale),
    dateIso: dateValue
      ? `${dateValue.slice(0, 4)}-${dateValue.slice(4, 6)}-${dateValue.slice(6, 8)}`
      : null,
    locationLabel: rowLocationLabel(row, content),
    typeLabel,
    distanceLabels,
    imageSrc: image.src,
    imageAlt: image.alt,
    summary: excerptDescription(summarySource, recent ? 120 : 170),
    popularityValue,
    metaLabel: recent
      ? formatRecentMeta(
          typeof row.payload?.created_date === 'string' ? row.payload.created_date : null,
          content,
          locale,
        )
      : undefined,
  };
}

function uniqueByDomain(rows: RaceListRow[]): RaceListRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.domain_name)) return false;
    seen.add(row.domain_name);
    return true;
  });
}

function buildCategoryPanel(args: {
  content: IndexYaml;
  countryCode: string;
  locale: Locale;
  index: 1 | 2;
}): HomeCategoryPanel | null {
  const { content, countryCode, locale, index } = args;
  const title = String(content[`category_header_${index}`] ?? '').trim();
  const raceTypeKey = String(content[`category_type_${index}`] ?? '').trim().toLowerCase();
  if (!title || !raceTypeKey) return null;

  const sublinks = [1, 2, 3]
    .map((itemIndex) => {
      const label = String(content[`category_${index}_races_sub_title_${itemIndex}`] ?? '').trim();
      const slug = String(content[`category_${index}_races_sub_ref_${itemIndex}`] ?? '').trim();
      if (!label || !slug) return null;
      return {
        label,
        href: getCategoryTypePageHref({
          countryCode,
          locale,
          content,
          categorySlug: slug,
          raceTypeKey,
        }),
      };
    })
    .filter((entry): entry is { label: string; href: string } => entry !== null);

  const typeOptions = (content.type_options as Record<string, string> | undefined) ?? {};
  const typeLabel = typeOptions[raceTypeKey] ?? raceTypeKey;
  const ctaBase = String(content.view_all_races ?? '').trim();
  const imageSrc =
    raceTypeKey === 'trail'
      ? '/common_images/trail-running.webp'
      : '/common_images/road-running.webp';

  return {
    title,
    href: getBrowseTypePageHref({
      countryCode,
      locale,
      content,
      raceTypeKey,
    }),
    imageSrc,
    imageAlt: `${title} background`,
    sublinks,
    ctaLabel: ctaBase ? `${ctaBase} ${typeLabel}` : typeLabel,
  };
}

export async function getHomePageData(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
}): Promise<HomePageData> {
  const { countryCode, locale, content } = args;
  const allRows = await getAllRaceListRows(countryCode);
  const domesticRows = uniqueByDomain(
    allRows.rows.filter((row) => isDomesticOrigin(row.origin_country, countryCode)),
  );
  const overviewData = await getBrowseOverviewData({ countryCode, locale, content });
  const raceListHref = `${localeBasePrefix(countryCode, locale)}${raceListSlug(content, countryCode)}/`;
  const addRaceHref = auxiliaryPageHref({
    country: countryCode,
    locale,
    content,
    pageKey: 'add-race',
  });
  const browseButton = String(content.browse_by_category?.button ?? '').trim();
  const browseHref = browseButton ? `${raceListHref}${slugify(browseButton, countryCode)}/` : raceListHref;
  const upcomingStartComparable = upcomingWindowStart();
  const upcomingEndComparable = upcomingWindowEnd();

  const promotableRows = domesticRows.filter((row) =>
    Boolean(nextUpcomingRaceDateWithinWindow(row.race_dates, upcomingStartComparable, upcomingEndComparable)),
  );

  const upcomingRows = [...promotableRows].sort((left, right) =>
    compareUpcomingRows(left, right, upcomingStartComparable, upcomingEndComparable),
  );

  const imageFirstRows = [...upcomingRows].sort((left, right) => {
    const leftScore = hasPromoImage(left) ? 0 : 1;
    const rightScore = hasPromoImage(right) ? 0 : 1;
    if (leftScore !== rightScore) return leftScore - rightScore;
    return compareUpcomingRows(left, right, upcomingStartComparable, upcomingEndComparable);
  });

  const featuredRaces = imageFirstRows
    .slice(0, 8)
    .map((row) =>
      toHomeRaceEntry({
        row,
        countryCode,
        locale,
        content,
        upcomingStartComparable,
        upcomingEndComparable,
      }),
    );

  const analyticsTrendingRaces = [...promotableRows]
    .map((row) => ({ row, score: rowPopularityScore(row) }))
    .filter((entry): entry is { row: RaceListRow; score: number } => entry.score != null)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return compareUpcomingRows(left.row, right.row, upcomingStartComparable, upcomingEndComparable);
    })
    .slice(0, 5)
    .map(({ row, score }) =>
      toHomeRaceEntry({
        row,
        countryCode,
        locale,
        content,
        upcomingStartComparable,
        upcomingEndComparable,
        popularityValue: score,
      }),
    );

  const trendingFallbackRaces = featuredRaces.slice(1, 6);
  const trendingRaces =
    analyticsTrendingRaces.length > 0
      ? analyticsTrendingRaces
      : trendingFallbackRaces.length > 0
        ? trendingFallbackRaces
        : featuredRaces.slice(0, 5);

  const recentRaces = promotableRows
    .filter((row) => typeof row.payload?.created_date === 'string')
    .sort((left, right) => compareCreatedAt(left, right, upcomingStartComparable, upcomingEndComparable))
    .slice(0, 5)
    .map((row) =>
      toHomeRaceEntry({
        row,
        countryCode,
        locale,
        content,
        recent: true,
        upcomingStartComparable,
        upcomingEndComparable,
      }),
    );

  const popularRegions = overviewData.counties.slice(0, 5);
  const popularCities = overviewData.cities.slice(0, 5);
  const quickExplore = overviewData.categories.slice(0, 6);
  const categoryPanels = [1, 2]
    .map((index) =>
      buildCategoryPanel({
        content,
        countryCode,
        locale,
        index: index as 1 | 2,
      }),
    )
    .filter((panel): panel is HomeCategoryPanel => panel !== null);

  const toolLinks: HomeToolLink[] = [
    {
      label: String(content.navigation?.['measure-route'] ?? ''),
      href: auxiliaryPageHref({ country: countryCode, locale, content, pageKey: 'measure-route' }),
      iconId: 'map-outline',
      description: String(content.home_tools?.measure_route?.description ?? ''),
    },
    {
      label: String(content.navigation?.['training-plans'] ?? ''),
      href: auxiliaryPageHref({ country: countryCode, locale, content, pageKey: 'training-plans' }),
      iconId: 'fitness-outline',
      description: String(content.home_tools?.training_plans?.description ?? ''),
    },
    {
      label: String(content.navigation?.['racetime-estimator'] ?? ''),
      href: auxiliaryPageHref({
        country: countryCode,
        locale,
        content,
        pageKey: 'racetime-estimator',
      }),
      iconId: 'stopwatch-outline',
      description: String(content.home_tools?.racetime_estimator?.description ?? ''),
    },
    {
      label: String(content.navigation?.['pace-calculator'] ?? ''),
      href: auxiliaryPageHref({
        country: countryCode,
        locale,
        content,
        pageKey: 'pace-calculator',
      }),
      iconId: 'calculator-outline',
      description: String(content.home_tools?.pace_calculator?.description ?? ''),
    },
  ].filter((tool) => tool.label && tool.href);

  const heroStats = [
    {
      value: String(domesticRows.length),
      label: String(content.races_count ?? content.race_local ?? ''),
    },
    {
      value: String(overviewData.counties.length),
      label: String(content.browse_by_category?.counties ?? ''),
    },
    {
      value: String(overviewData.cities.length),
      label: String(content.browse_by_category?.cities ?? ''),
    },
  ].filter((stat) => stat.value && stat.label);

  return {
    title: `${String(content.title ?? '').trim()} ${String(content.country_native ?? content.country ?? '').trim()}`.trim(),
    description: String(content.meta_description ?? ''),
    raceListHref,
    addRaceHref,
    browseHref,
    featuredRaces,
    trendingRaces,
    recentRaces,
    popularRegions,
    popularCities,
    quickExplore,
    heroStats,
    categoryPanels,
    toolLinks,
  };
}
