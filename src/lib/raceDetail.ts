import type { IndexYaml, Locale } from './content';
import { categoryFilterOptionsFromYaml, type CategoryFilterOption } from './categoryFilterOptions';
import { slugify } from './content';
import { getMarketRouteTargets } from './marketRouteTargets';
import { resolveRaceDetailHref } from './marketRoutes';
import {
  formatDistanceSegment,
  normalizeRaceImageUrl,
  splitDistanceVerbose,
} from './raceCardDisplay';
import {
  getBrowseCountyPageHref,
  getBrowseOverviewData,
  getBrowseOverviewHref,
  getBrowseTypePageHref,
  getCategoryPageHref,
  getRaceListBaseHref,
} from './raceBrowse';
import { pickTranslation, type RaceListRow } from './raceListRow';

type RaceImage = {
  number?: number | null;
  firebase_url?: string | null;
  url?: string | null;
  alt_text?: string | null;
};

type DateEntry = {
  label: string;
  startIso: string | null;
  endIso: string | null;
  isRange: boolean;
  isEstimated: boolean;
  comparableStart: string | null;
  comparableEnd: string | null;
  epochDay: number;
};

type PriceTierEntry = {
  price: string;
  deadlineLabel: string;
  deadlineIso: string | null;
  description: string;
};

type PriceLateFee = {
  price: string;
  deadlineLabel: string;
  deadlineIso: string | null;
};

export type RacePriceTierGroup = {
  distance: string;
  tiers: PriceTierEntry[];
  lateFee: PriceLateFee | null;
};

export type RaceDetailBreadcrumb = {
  label: string;
  href?: string;
};

export type RaceDetailShortcut = {
  label: string;
  href: string;
};

export type RaceDetailRelatedRace = {
  id: string;
  href: string;
  name: string;
  dateLabel: string;
  locationLabel: string;
  typeLabel: string;
  distanceLabels: string[];
  imageSrc: string;
  imageAlt: string;
};

export type RaceDetailRelatedContent = {
  breadcrumbs: RaceDetailBreadcrumb[];
  shortcuts: RaceDetailShortcut[];
  similarRaces: RaceDetailRelatedRace[];
  countyHref: string | null;
};

function toComparableDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().replaceAll('-', '');
  return /^\d{8}$/.test(normalized) ? normalized : null;
}

function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function formatDateLabel(raw: string, locale: string): string {
  const iso = toIsoDate(raw);
  if (!iso) return raw;
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function collectEstimatedDateKeys(raw: unknown): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(raw)) return keys;

  for (const entry of raw) {
    if (typeof entry === 'string') {
      const normalized = toComparableDate(entry);
      if (normalized) keys.add(normalized);
      continue;
    }
    if (!Array.isArray(entry)) continue;
    for (const part of entry) {
      const normalized = toComparableDate(part);
      if (normalized) keys.add(normalized);
    }
  }
  return keys;
}

function toKmValues(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((value) => {
      if (typeof value === 'number') return value / 1000;
      if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed / 1000 : Number.NaN;
      }
      return Number.NaN;
    })
    .filter((value) => Number.isFinite(value));
}

function firstComparableRowDate(row: RaceListRow): string | null {
  if (!Array.isArray(row.race_dates)) return null;
  for (const entry of row.race_dates) {
    if (!Array.isArray(entry)) continue;
    const start = toComparableDate(entry[0]);
    if (start) return start;
  }
  return null;
}

function rowMatchesCategory(row: RaceListRow, option: CategoryFilterOption): boolean {
  if (option.kind === 'type') {
    return (row.race_type?.trim().toLowerCase() ?? '') === option.raceType.trim().toLowerCase();
  }

  const distancesKm = toKmValues(row.distance_m);
  return distancesKm.some((km) => km >= option.minKm && km <= option.maxKm);
}

function optionPriority(option: CategoryFilterOption): number {
  if (option.kind === 'type') return 10_000;
  return option.maxKm - option.minKm;
}

function pickPrimaryCategory(row: RaceListRow, content: IndexYaml): CategoryFilterOption | null {
  const options = categoryFilterOptionsFromYaml(content.category_mapping);
  const matches = options.filter((option) => rowMatchesCategory(row, option));
  if (matches.length === 0) return null;

  return matches.sort((left, right) => optionPriority(left) - optionPriority(right))[0] ?? null;
}

function normalizedText(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function haversineDistanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function firstNonEmptyString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function payloadValue(row: RaceListRow, key: string): unknown {
  return row.payload && typeof row.payload === 'object' ? row.payload[key] : undefined;
}

function cleanMultilineParagraphs(value: string): string[] {
  return value
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function interpolateTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? '');
}

function comparableDateToEpochDay(raw: string | null): number {
  const iso = toIsoDate(raw);
  if (!iso) return Number.NaN;
  return Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 86_400_000);
}

function todayEpochDayUtc(): number {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000,
  );
}

export function formatRaceDateEntries(raw: unknown, estimatedRaw: unknown, locale: string): DateEntry[] {
  if (!Array.isArray(raw)) return [];
  const estimatedKeys = collectEstimatedDateKeys(estimatedRaw);

  return raw
    .map((entry) => {
      if (!Array.isArray(entry)) return null;
      const start = toComparableDate(entry[0]);
      const end = toComparableDate(entry[1]) ?? start;
      if (!start) return null;

      const isRange = Boolean(end && end !== start);
      const startLabel = formatDateLabel(start, locale);
      const endLabel = end ? formatDateLabel(end, locale) : startLabel;

      return {
        label: isRange ? `${startLabel} - ${endLabel}` : startLabel,
        startIso: toIsoDate(start),
        endIso: toIsoDate(end),
        isRange,
        isEstimated: estimatedKeys.has(start) || (end ? estimatedKeys.has(end) : false),
        comparableStart: start,
        comparableEnd: end,
        epochDay: comparableDateToEpochDay(start),
      } satisfies DateEntry;
    })
    .filter((entry): entry is DateEntry => Boolean(entry));
}

function selectDisplayDateEntries(entries: DateEntry[], isSeries: boolean): DateEntry[] {
  if (entries.length <= 1) return entries;

  const todayEpochDay = todayEpochDayUtc();
  const sorted = [...entries].sort((left, right) => left.epochDay - right.epochDay);
  const upcoming = sorted.filter((entry) => Number.isFinite(entry.epochDay) && entry.epochDay >= todayEpochDay);

  if (upcoming.length > 0) {
    return upcoming.slice(0, isSeries ? 3 : 1);
  }

  return isSeries ? sorted.slice(-3) : [sorted[sorted.length - 1] ?? sorted[0]].filter(Boolean);
}

function toComparableDateFromUnknown(raw: unknown): string | null {
  return typeof raw === 'string' ? toComparableDate(raw) : null;
}

function formatOptionalDateLabel(raw: unknown, locale: string): { iso: string | null; label: string } | null {
  const comparable = toComparableDateFromUnknown(raw);
  if (!comparable) return null;
  return {
    iso: toIsoDate(comparable),
    label: formatDateLabel(comparable, locale),
  };
}

function normalizePriceTierGroups(raw: unknown, locale: string): RacePriceTierGroup[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((group) => {
      if (!group || typeof group !== 'object') return null;

      const distance = typeof group.distance === 'string' ? group.distance.trim() : '';
      const tiers = Array.isArray(group.tiers)
        ? group.tiers
            .map((tier) => {
              if (!tier || typeof tier !== 'object') return null;
              const price = typeof tier.price === 'string' ? tier.price.trim() : '';
              const description =
                typeof tier.description === 'string' ? tier.description.trim() : '';
              const deadline = formatOptionalDateLabel(tier.deadline, locale);

              if (!price && !description) return null;

              return {
                price,
                deadlineLabel: deadline?.label ?? '',
                deadlineIso: deadline?.iso ?? null,
                description,
              } satisfies PriceTierEntry;
            })
            .filter((tier): tier is PriceTierEntry => Boolean(tier))
        : [];

      const lateFee =
        group.late_fee && typeof group.late_fee === 'object'
          ? (() => {
              const price =
                typeof group.late_fee.price === 'string' ? group.late_fee.price.trim() : '';
              const deadline = formatOptionalDateLabel(group.late_fee.deadline, locale);
              if (!price && !deadline) return null;
              return {
                price,
                deadlineLabel: deadline?.label ?? '',
                deadlineIso: deadline?.iso ?? null,
              } satisfies PriceLateFee;
            })()
          : null;

      if (!distance && tiers.length === 0 && !lateFee) return null;

      return {
        distance,
        tiers,
        lateFee,
      } satisfies RacePriceTierGroup;
    })
    .filter((group): group is RacePriceTierGroup => Boolean(group));
}

export function fallbackRaceImage(domainName: string, raceType: string | null | undefined): string {
  const hash = domainName.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const variant = (hash % 4) + 1;
  const kind =
    raceType && ['trail', 'terrain'].includes(raceType.toLowerCase()) ? 'trail' : 'road';
  return `/common_images/${kind}-${variant}-optimized.webp`;
}

export function resolveRaceImages(
  row: RaceListRow,
  raceName: string,
  altPrefix: string,
): Array<{ src: string; alt: string }> {
  const suppliedImages = row.payload?.supplied_images;
  const hasSuppliedImages =
    suppliedImages === true ||
    (Array.isArray(suppliedImages) && suppliedImages.length > 0);
  if (!hasSuppliedImages) {
    return [
      {
        src: fallbackRaceImage(row.domain_name, row.race_type),
        alt: `${altPrefix}${raceName}`,
      },
    ];
  }

  const payloadImages = Array.isArray(row.payload?.images)
    ? (row.payload?.images as RaceImage[])
    : [];

  const usableImages = payloadImages
    .filter((image) =>
      (typeof image.firebase_url === 'string' && image.firebase_url.trim()) ||
      (typeof image.url === 'string' && image.url.trim()),
    )
    .sort((left, right) => (left.number ?? 0) - (right.number ?? 0))
    .slice(0, 5)
    .map((image, index) => ({
      src: normalizeRaceImageUrl(String(image.firebase_url ?? image.url ?? '')),
      alt: String(image.alt_text ?? `${altPrefix}${raceName} ${index + 1}`),
    }));

  const normalizedImages = usableImages.filter((image) => image.src);
  if (normalizedImages.length > 0) return normalizedImages;

  return [
    {
      src: fallbackRaceImage(row.domain_name, row.race_type),
      alt: `${altPrefix}${raceName}`,
    },
  ];
}

export function getRaceDetailFields(
  row: RaceListRow,
  content: IndexYaml,
  locale: Locale,
): {
  raceName: string;
  raceTypeLabel: string;
  distanceLabels: string[];
  description: string;
  additionalInfo: string;
  organizer: string;
  contact: string;
  website: string;
  registrationUrl: string;
  raceInfoUrl: string;
  startTime: string;
  priceRange: string;
  priceTiers: RacePriceTierGroup[];
  isSeries: boolean;
  displayDateEntries: DateEntry[];
  registrationCloseDateLabel: string;
  registrationCloseDateIso: string | null;
  location: string;
  county: string;
  socialLinks: Array<{ href: string; label: string; iconId: string }>;
  courseHighlights: string[];
  images: Array<{ src: string; alt: string }>;
  dateEntries: DateEntry[];
} {
  const translationLocale = locale === 'en' ? 'en' : String(content.country_language_code ?? 'sv');
  const translation = pickTranslation(row.race_translations, translationLocale);
  const verboseLocalDistanceMapping =
    (content.verbose_local_distance_mapping as Record<string, string> | undefined) ?? {};

  const raceName = translation?.name?.trim() || row.domain_name;
  const raceTypeLabel =
    translation?.type_local?.trim() ||
    (typeof row.payload?.type_local === 'string' ? row.payload.type_local : '') ||
    row.race_type ||
    '';
  const distanceVerbose =
    translation?.distance_verbose ??
    (typeof row.payload?.distance_verbose === 'string' ? row.payload.distance_verbose : '');
  const distanceLabels = splitDistanceVerbose(distanceVerbose).map((segment) =>
    formatDistanceSegment(segment, verboseLocalDistanceMapping),
  );

  const description =
    translation?.description?.trim() ||
    (typeof payloadValue(row, 'description') === 'string' ? String(payloadValue(row, 'description')).trim() : '');

  const additionalPayload = payloadValue(row, 'additional');
  const additionalInfoPayload = payloadValue(row, 'additional_info');
  const additionalValue =
    typeof additionalPayload === 'string'
      ? additionalPayload
      : typeof additionalInfoPayload === 'string'
        ? additionalInfoPayload
        : '';

  const organizer =
    typeof payloadValue(row, 'organizer') === 'string' ? String(payloadValue(row, 'organizer')).trim() : '';
  const contact =
    typeof payloadValue(row, 'contact') === 'string' ? String(payloadValue(row, 'contact')).trim() : '';
  const website = firstNonEmptyString(payloadValue(row, 'website'), row.website);
  const registrationUrl = firstNonEmptyString(payloadValue(row, 'registration_url'));
  const raceInfoUrl = firstNonEmptyString(payloadValue(row, 'race_info_url'));
  const startTime =
    typeof payloadValue(row, 'start_time') === 'string' ? String(payloadValue(row, 'start_time')).trim() : '';
  const priceRange =
    typeof payloadValue(row, 'price_range') === 'string' ? String(payloadValue(row, 'price_range')).trim() : '';
  const location =
    typeof payloadValue(row, 'location') === 'string' ? String(payloadValue(row, 'location')).trim() : '';
  const county = typeof row.county === 'string' ? row.county.trim() : '';
  const registrationCloseDate = formatOptionalDateLabel(payloadValue(row, 'registration_close_date'), translationLocale);
  const priceTiers = normalizePriceTierGroups(payloadValue(row, 'price_tiers'), translationLocale);
  const isSeries = payloadValue(row, 'is_series') === true;

  const courseHighlights = Array.isArray(payloadValue(row, 'course_highlights'))
    ? (payloadValue(row, 'course_highlights') as unknown[])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .slice(0, 5)
    : [];

  const socialLinks = [
    typeof payloadValue(row, 'fb_link') === 'string' && String(payloadValue(row, 'fb_link')).trim()
      ? {
          href: String(payloadValue(row, 'fb_link')),
          label: 'Facebook',
          iconId: 'logo-facebook',
        }
      : null,
    typeof payloadValue(row, 'ig_link') === 'string' && String(payloadValue(row, 'ig_link')).trim()
      ? {
          href: String(payloadValue(row, 'ig_link')),
          label: 'Instagram',
          iconId: 'logo-instagram',
        }
      : null,
  ].filter((entry): entry is { href: string; label: string; iconId: string } => Boolean(entry));

  const images = resolveRaceImages(
    row,
    raceName,
    String(content.race_page_alt_prefix ?? content.alt_prefix ?? ''),
  );

  const dateEntries = formatRaceDateEntries(
    row.race_dates,
    payloadValue(row, 'estimated_dates'),
    translationLocale,
  );
  const displayDateEntries = selectDisplayDateEntries(dateEntries, isSeries);

  return {
    raceName,
    raceTypeLabel,
    distanceLabels,
    description,
    additionalInfo: additionalValue.trim(),
    organizer,
    contact,
    website,
    registrationUrl,
    raceInfoUrl,
    startTime,
    priceRange,
    priceTiers,
    isSeries,
    displayDateEntries,
    registrationCloseDateLabel: registrationCloseDate?.label ?? '',
    registrationCloseDateIso: registrationCloseDate?.iso ?? null,
    location,
    county,
    socialLinks,
    courseHighlights,
    images,
    dateEntries,
  };
}

export function comparableDateForSchema(entries: DateEntry[], field: 'startIso' | 'endIso'): string | null {
  for (const entry of entries) {
    if (entry[field]) return entry[field];
  }
  return null;
}

export function raceDetailParagraphs(value: string): string[] {
  return cleanMultilineParagraphs(value);
}

export async function getRaceDetailRelatedContent(args: {
  countryCode: string;
  locale: Locale;
  content: IndexYaml;
  currentRow: RaceListRow;
  allRows: RaceListRow[];
}): Promise<RaceDetailRelatedContent> {
  const { countryCode, locale, content, currentRow, allRows } = args;
  const translationLocale = locale === 'en' ? 'en' : String(content.country_language_code ?? 'sv');
  const countyMapping = (content.county_mapping as Record<string, string> | undefined) ?? {};
  const typeOptions = (content.type_options as Record<string, string> | undefined) ?? {};
  const racePageFolder = String(content.race_page_folder_name ?? (locale === 'en' ? 'race-pages' : 'loppsidor'));
  const listHref = getRaceListBaseHref(countryCode, locale, content);
  const overviewHref = getBrowseOverviewHref(countryCode, locale, content);
  const marketRouteTargets = getMarketRouteTargets();
  const overviewData = await getBrowseOverviewData({ countryCode, locale, content });
  const countyKeys = new Set(overviewData.counties.map((entry) => normalizedText(entry.key)));
  const currentCountyKey = normalizedText(currentRow.county);
  const currentCountyLabel = currentRow.county
    ? (countyMapping[currentRow.county] ?? currentRow.county)
    : '';
  const countyHref = currentCountyLabel && currentCountyKey && countyKeys.has(currentCountyKey)
    ? getBrowseCountyPageHref({
        countryCode,
        locale,
        content,
        countyLabel: currentCountyLabel,
      })
    : null;

  const primaryCategory = pickPrimaryCategory(currentRow, content);
  const typeKey = currentRow.race_type?.trim().toLowerCase() ?? '';
  const currentTypeLabel = typeKey ? (typeOptions[typeKey] ?? typeKey) : '';

  const shortcutKeys = new Set<string>();
  const shortcuts: RaceDetailShortcut[] = [];

  const addShortcut = (label: string, href: string | null) => {
    if (!href || !label) return;
    const key = `${label}|${href}`;
    if (shortcutKeys.has(key)) return;
    shortcutKeys.add(key);
    shortcuts.push({ label, href });
  };

  const countyTemplate = String(
    content.race_page_discover_county_link ?? '',
  );
  const typeTemplate = String(
    content.race_page_discover_type_link ?? '',
  );
  const categoryTemplate = String(
    content.race_page_discover_category_link ?? '',
  );

  if (currentCountyLabel && countyHref) {
    addShortcut(
      interpolateTemplate(countyTemplate, { county: currentCountyLabel }),
      countyHref,
    );
  }

  if (typeKey) {
    const typeHref = getBrowseTypePageHref({
      countryCode,
      locale,
      content,
      raceTypeKey: typeKey,
    });
    addShortcut(interpolateTemplate(typeTemplate, { type: currentTypeLabel }), typeHref);
  }

  if (primaryCategory) {
    const categoryHref = getCategoryPageHref({
      countryCode,
      locale,
      content,
      categorySlug: slugify(primaryCategory.label, countryCode),
    });
    addShortcut(
      interpolateTemplate(categoryTemplate, { category: primaryCategory.label }),
      categoryHref,
    );
  }

  addShortcut(
    String(content.race_page_discover_overview_link ?? ''),
    overviewHref,
  );

  const currentDateKey = firstComparableRowDate(currentRow);
  const currentDateNumber = comparableDateToEpochDay(currentDateKey);
  const todayEpochDay = todayEpochDayUtc();
  const currentTypeKey = normalizedText(currentRow.race_type);
  const currentCategoryKey = primaryCategory?.label ?? '';
  const currentLatitude = currentRow.latitude;
  const currentLongitude = currentRow.longitude;

  const scored = allRows
    .filter((candidate) => candidate.domain_name !== currentRow.domain_name)
    .map((candidate) => {
      const candidateCountyKey = normalizedText(candidate.county);
      const candidateTypeKey = normalizedText(candidate.race_type);
      const candidateCategory = pickPrimaryCategory(candidate, content);
      const candidateCategoryKey = candidateCategory?.label ?? '';

      let score = 0;
      if (currentCountyKey && currentCountyKey === candidateCountyKey) score += 22;
      if (currentTypeKey && currentTypeKey === candidateTypeKey) score += 28;
      if (currentCategoryKey && currentCategoryKey === candidateCategoryKey) score += 26;

      const candidateDateKey = firstComparableRowDate(candidate);
      const candidateDateNumber = comparableDateToEpochDay(candidateDateKey);
      if (!Number.isFinite(candidateDateNumber) || candidateDateNumber < todayEpochDay) {
        return { candidate, score: -1 };
      }

      if (currentDateKey && candidateDateKey) {
        const distanceInDays = Math.abs(candidateDateNumber - currentDateNumber);
        if (Number.isFinite(distanceInDays)) {
          score += Math.max(0, 12 - Math.min(12, Math.floor(distanceInDays / 90)));
        }
      }

      if (
        typeof currentLatitude === 'number' &&
        typeof currentLongitude === 'number' &&
        typeof candidate.latitude === 'number' &&
        typeof candidate.longitude === 'number'
      ) {
        const distanceKm = haversineDistanceKm(
          currentLatitude,
          currentLongitude,
          candidate.latitude,
          candidate.longitude,
        );
        score += Math.max(0, 24 - Math.min(24, distanceKm / 18));
      }

      return { candidate, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  const similarRaces = scored.map(({ candidate }) => {
    const candidateDetail = getRaceDetailFields(candidate, content, locale);
    const candidateTranslation = pickTranslation(candidate.race_translations, translationLocale);
    const countyLabel = candidate.county
      ? (countyMapping[candidate.county] ?? candidate.county)
      : String(content.country_native ?? content.country ?? '');
    const locationLabel = candidateDetail.location || countyLabel;

    return {
      id: candidate.id,
      href: resolveRaceDetailHref({
        hostCountryCode: countryCode,
        routeLocale: locale,
        localRacePageFolder: racePageFolder,
        row: candidate,
        marketRouteTargets,
      }),
      name: candidateTranslation?.name?.trim() || candidate.domain_name,
      dateLabel: candidateDetail.displayDateEntries[0]?.label ?? candidateDetail.dateEntries[0]?.label ?? '',
      locationLabel,
      typeLabel: candidateDetail.raceTypeLabel,
      distanceLabels: candidateDetail.distanceLabels,
      imageSrc: candidateDetail.images[0]?.src ?? fallbackRaceImage(candidate.domain_name, candidate.race_type),
      imageAlt: candidateDetail.images[0]?.alt ?? candidateTranslation?.name ?? candidate.domain_name,
    } satisfies RaceDetailRelatedRace;
  });

  const breadcrumbs: RaceDetailBreadcrumb[] = [
    {
      label: String(content.navigation?.['race-list'] ?? content.race_list_name ?? content.page_name ?? ''),
      href: listHref,
    },
  ];

  if (currentCountyLabel && countyHref) {
    breadcrumbs.push({ label: currentCountyLabel, href: countyHref });
  }

  breadcrumbs.push({
    label: pickTranslation(currentRow.race_translations, translationLocale)?.name?.trim() || currentRow.domain_name,
  });

  return {
    breadcrumbs,
    shortcuts: shortcuts.slice(0, 5),
    similarRaces,
    countyHref,
  };
}
