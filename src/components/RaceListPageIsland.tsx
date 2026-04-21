import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
} from 'react';
import type mapboxgl from 'mapbox-gl';
import NewsletterPopup from './NewsletterPopup';
import RaceMapIsland from './RaceMapIsland';
import HighlightedRacesStrip, { type HighlightedRaceEntry } from './HighlightedRacesStrip';
import type { NewsletterPopupContext } from '../lib/newsletterPopup';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '../lib/supabase';
import { RACE_LIST_PAGE_SIZE } from '../lib/raceListConfig';
import type { CategoryFilterOption } from '../lib/categoryFilterOptions';
import {
  excerptDescription,
  formatDistanceSegment,
  primaryRaceImageUrl,
  splitDistanceVerbose,
  supportedFlagCode,
} from '../lib/raceCardDisplay';
import { cityNamesMatch } from '../lib/cityNames';
import {
  ALL_NEIGHBORING_COUNTIES_VALUE,
  isDomesticOrigin,
  neighboringCountryValue,
  parseNeighboringSelection,
  type NeighboringCountryOption,
} from '../lib/neighboringSelection';
import { getBrowserMarketRouteTargets, resolveRaceDetailHref } from '../lib/marketRoutes';
import { pickTranslation, type RaceListRow } from '../lib/raceListRow';
import {
  compareRaceRowsByRelevantDate,
  displayRaceDate,
  relevantRaceDate,
} from '../lib/upcomingRaceWindow';

export type PaginationCopy = {
  results_text?: string;
  events_text?: string;
  previous_text?: string;
  next_text?: string;
  page_text?: string;
  of_text?: string;
};

type PaginationToken = number | 'ellipsis';

type RpcResult = { total?: number; rows?: RaceListRow[] };
type CardTopLocation = { label: string; flagCode: string | null };

function countryLabelForNeighbor(
  code: string,
  neighboringCountries: NeighboringCountryOption[],
): string {
  return neighboringCountries.find((entry) => entry.code === code)?.label ?? code.toUpperCase();
}

function todayYyyyMmDd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function oneYearFromTodayYyyyMmDd(): string {
  const now = new Date();
  now.setFullYear(now.getFullYear() + 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthDateRangeYyyyMmDd(month: string, now = new Date()): {
  dateFrom: string;
  dateTo: string;
} {
  if (!/^\d{2}$/.test(month)) {
    return {
      dateFrom: todayYyyyMmDd(),
      dateTo: oneYearFromTodayYyyyMmDd(),
    };
  }

  const selectedMonthIndex = Number.parseInt(month, 10) - 1;
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();
  const year = selectedMonthIndex < currentMonthIndex ? currentYear + 1 : currentYear;

  const start = new Date(year, selectedMonthIndex, 1);
  const end = new Date(year, selectedMonthIndex + 1, 0);
  const isCurrentMonth = year === currentYear && selectedMonthIndex === currentMonthIndex;

  return {
    dateFrom: isCurrentMonth ? formatDateInputValue(now) : formatDateInputValue(start),
    dateTo: formatDateInputValue(end),
  };
}

function formatYyyymmdd(raw: string, monthShort: Record<string, string>): string {
  if (!raw || raw.length < 8) return raw;
  const m = raw.slice(4, 6);
  const d = String(parseInt(raw.slice(6, 8), 10));
  const monthName = monthShort[m] ?? m;
  return `${d} ${monthName}`;
}

function yyyymmddToIso(raw: string | null | undefined): string | undefined {
  if (!raw || !/^\d{8}$/.test(raw)) return undefined;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function comparableFilterDate(raw: string): string | null {
  const normalized = raw.replaceAll('-', '').trim();
  return /^\d{8}$/.test(normalized) ? normalized : null;
}

function placeholderImage(domain: string, raceType: string | null): string {
  const h = domain.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const n = (h % 4) + 1;
  const kind =
    raceType && ['trail', 'terrain'].includes(raceType.toLowerCase()) ? 'trail' : 'road';
  return `/common_images/${kind}-${n}-optimized.webp`;
}

function highlightedImage(row: RaceListRow): { src: string; alt?: string } {
  const normalized = primaryRaceImageUrl(row.payload);
  const images = Array.isArray(row.payload?.images) ? row.payload.images : [];
  if (normalized) {
    const first = images.find((image) => image && typeof image === 'object') as
      | { alt_text?: unknown }
      | undefined;
    const altText =
      typeof first?.alt_text === 'string'
        ? first.alt_text
        : undefined;
    return { src: normalized, alt: altText };
  }
  for (const image of images) {
    if (!image || typeof image !== 'object') continue;
    const altText =
      typeof (image as { alt_text?: unknown }).alt_text === 'string'
        ? (image as { alt_text: string }).alt_text
        : undefined;
    if (altText) return { src: placeholderImage(row.domain_name, row.race_type), alt: altText };
  }
  return { src: placeholderImage(row.domain_name, row.race_type) };
}

function isSuppliedRace(row: RaceListRow): boolean {
  const payload = row.payload ?? {};
  return (
    Boolean(payload.supplied_at) ||
    (Array.isArray(payload.supplied_ids) && payload.supplied_ids.length > 0)
  );
}

function isDefaultFilterState(
  county: string,
  raceType: string,
  dateFrom: string,
  dateTo: string,
  month: string,
  categoryKey: string,
): boolean {
  return (
    !county &&
    !raceType &&
    !dateFrom &&
    !dateTo &&
    month === 'all' &&
    categoryKey === 'all'
  );
}

function buildPaginationTokens(page: number, totalPages: number): PaginationToken[] {
  if (totalPages <= 1) return [1];
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= 2) return [1, 2, 3, 'ellipsis', totalPages];
  if (page >= totalPages - 1) return [1, 'ellipsis', totalPages - 2, totalPages - 1, totalPages];
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages];
}

function rowMatchesCity(row: RaceListRow, city: string): boolean {
  const normalized = city.trim();
  if (!normalized) return false;

  const values = new Set<string>();
  if (typeof row.payload?.nearest_city === 'string' && row.payload.nearest_city.trim()) {
    values.add(row.payload.nearest_city.trim());
  }
  if (Array.isArray(row.payload?.nearby_cities)) {
    for (const value of row.payload.nearby_cities) {
      if (typeof value === 'string' && value.trim()) values.add(value.trim());
    }
  }
  if (typeof row.payload?.location === 'string' && row.payload.location.trim()) {
    values.add(row.payload.location.trim());
  }

  return [...values].some((value) => cityNamesMatch(value, normalized));
}

function rowMatchesMonth(row: RaceListRow, month: string): boolean {
  if (month === 'all') return true;
  if (!Array.isArray(row.race_dates)) return false;
  return row.race_dates.some((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') return false;
    return entry[0].slice(4, 6) === month.padStart(2, '0');
  });
}

function rowMatchesDateRange(row: RaceListRow, dateFrom: string, dateTo: string): boolean {
  const from = dateFrom.replaceAll('-', '').trim();
  const to = dateTo.replaceAll('-', '').trim();
  if (!from && !to) return true;
  if (!Array.isArray(row.race_dates)) return false;
  return row.race_dates.some((entry) => {
    if (!Array.isArray(entry) || typeof entry[0] !== 'string') return false;
    const value = entry[0].trim();
    if (!/^\d{8}$/.test(value)) return false;
    if (from && value < from) return false;
    if (to && value > to) return false;
    return true;
  });
}

function rowMatchesDistanceRange(
  row: RaceListRow,
  minKm: number | null,
  maxKm: number | null,
): boolean {
  if (minKm == null && maxKm == null) return true;
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
    if (minKm != null && km < minKm) return false;
    if (maxKm != null && km > maxKm) return false;
    return true;
  });
}

const PLACEHOLDER_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function LazyCardImg(
  props: ImgHTMLAttributes<HTMLImageElement> & { src: string; fallbackSrc?: string },
) {
  const { src, fallbackSrc, alt, className, ...rest } = props;

  return (
    <img
      src={src || PLACEHOLDER_GIF}
      alt={alt}
      className={className}
      width={600}
      height={400}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        const el = e.currentTarget;
        el.onerror = null;
        if (fallbackSrc && el.src !== fallbackSrc) el.src = fallbackSrc;
      }}
      {...rest}
    />
  );
}

export default function RaceListPageIsland(props: {
  countryCode: string;
  routeLocale: 'native' | 'en';
  translationLocale: string;
  initialRows: RaceListRow[];
  initialTotal: number;
  localRows?: RaceListRow[];
  highlightedRows?: RaceListRow[];
  initialCity?: string;
  initialCounty?: string;
  initialRaceType?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  initialMonth?: string;
  initialCategoryKey?: string;
  autoPopulateDateRange?: boolean;
  showIntroHeader?: boolean;
  pagination: PaginationCopy;
  raceListTitle: string;
  raceListMeta1: string;
  raceListMeta2: string;
  filterDateFrom: string;
  filterDateTo: string;
  filterMonths: string;
  filterDistance: string;
  filterCounty: string;
  filterRaceType: string;
  browseByCategoryButton: string;
  browseByCategoryHref: string;
  selectedRacesTitle?: string;
  selectedRacesTopTitle?: string;
  enableHighlightedRaces?: boolean;
  mapToggleDesktop: string;
  mapToggleDesktopActive: string;
  mapToggleMobile: string;
  mapToggleMobileList: string;
  sectionRaceCardCategoryPrefix: string;
  sectionRaceCardCategorySuffix: string;
  sectionRaceCardHeaderSeparator: string;
  sectionRaceCardHeaderRegionDefault: string;
  sectionRaceCardHeaderNeighborsDefault?: string;
  sectionRaceCardHeaderDateRangeFrom?: string;
  sectionRaceCardHeaderDateRangeTo?: string;
  sectionRaceCardHeaderDateRangeSingle?: string;
  raceCardCta: string;
  altPrefix: string;
  racePageFolder: string;
  countryNative: string;
  countyMapping: Record<string, string>;
  neighboringCountries?: NeighboringCountryOption[];
  neighboringCountriesLabel?: string;
  neighboringCountriesAllLabel?: string;
  monthMapping: Record<string, string>;
  monthMappingShort: Record<string, string>;
  typeOptions: Record<string, string>;
  categoryFilterOptions: CategoryFilterOption[];
  dataError: string;
  emptyMessage: string;
  loadingMessage: string;
  remoteRequiredMessage: string;
  markersLoadError: string;
  mapNotConfiguredMessage: string;
  mapboxToken: string;
  centerLat: number;
  centerLng: number;
  zoom: number;
  /** Maps English distance phrases to localized labels (YAML `verbose_local_distance_mapping`). */
  verboseLocalDistanceMapping?: Record<string, string>;
}) {
  const {
    countryCode,
    routeLocale,
    translationLocale,
    initialRows,
    initialTotal,
    localRows,
    highlightedRows,
    initialCity = '',
    initialCounty = '',
    initialRaceType = '',
    initialDateFrom = '',
    initialDateTo = '',
    initialMonth = 'all',
    initialCategoryKey = 'all',
    autoPopulateDateRange = true,
    showIntroHeader = true,
    pagination,
    raceListTitle,
    raceListMeta1,
    raceListMeta2,
    filterDateFrom,
    filterDateTo,
    filterMonths,
    filterDistance,
    filterRaceType,
    filterCounty,
    browseByCategoryButton,
    browseByCategoryHref,
    selectedRacesTitle = '',
    selectedRacesTopTitle = '',
    enableHighlightedRaces = false,
    mapToggleDesktop,
    mapToggleDesktopActive,
    mapToggleMobile,
    mapToggleMobileList,
    sectionRaceCardCategoryPrefix,
    sectionRaceCardCategorySuffix,
    sectionRaceCardHeaderSeparator,
    sectionRaceCardHeaderRegionDefault,
    sectionRaceCardHeaderNeighborsDefault = '',
    sectionRaceCardHeaderDateRangeFrom = '',
    sectionRaceCardHeaderDateRangeTo = '',
    sectionRaceCardHeaderDateRangeSingle = '',
    raceCardCta,
    altPrefix,
    racePageFolder,
    countryNative,
    countyMapping,
    neighboringCountries = [],
    neighboringCountriesLabel = '',
    neighboringCountriesAllLabel = '',
    monthMapping,
    monthMappingShort,
    typeOptions,
    categoryFilterOptions,
    dataError,
    emptyMessage,
    loadingMessage,
    remoteRequiredMessage,
    markersLoadError,
    mapNotConfiguredMessage,
    mapboxToken,
    centerLat,
    centerLng,
    zoom,
    verboseLocalDistanceMapping = {},
  } = props;

  const marketRouteTargets = useMemo(() => getBrowserMarketRouteTargets(), []);
  const hasMapboxToken = Boolean(mapboxToken.trim());

  const snapshotRef = useRef<{ rows: RaceListRow[]; total: number }>({
    rows: initialRows,
    total: initialTotal,
  });
  snapshotRef.current = { rows: initialRows, total: initialTotal };
  const defaultDateRange = useMemo(() => {
    if (initialDateFrom || initialDateTo) {
      return {
        dateFrom: initialDateFrom,
        dateTo: initialDateTo,
      };
    }
    if (initialMonth !== 'all') {
      return monthDateRangeYyyyMmDd(initialMonth);
    }
    return {
      dateFrom: autoPopulateDateRange ? todayYyyyMmDd() : '',
      dateTo: autoPopulateDateRange ? oneYearFromTodayYyyyMmDd() : '',
    };
  }, [initialDateFrom, initialDateTo, initialMonth, autoPopulateDateRange]);
  const initialFilterState = useRef({
    county: initialCounty,
    raceType: initialRaceType,
    dateFrom: defaultDateRange.dateFrom,
    dateTo: defaultDateRange.dateTo,
    month: initialMonth,
    categoryKey: initialCategoryKey,
  });
  const [page, setPage] = useState(1);
  const [city] = useState(initialCity);
  const [county, setCounty] = useState(initialCounty);
  const [raceType, setRaceType] = useState(initialRaceType);
  const [dateFrom, setDateFrom] = useState(() => defaultDateRange.dateFrom);
  const [dateTo, setDateTo] = useState(() => defaultDateRange.dateTo);
  const [month, setMonth] = useState(initialMonth);
  const [categoryKey, setCategoryKey] = useState(initialCategoryKey);

  const [rows, setRows] = useState<RaceListRow[]>(() => initialRows);
  const [total, setTotal] = useState(() => initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateStartComparable = useMemo(() => comparableFilterDate(dateFrom), [dateFrom]);
  const dateEndComparable = useMemo(() => comparableFilterDate(dateTo), [dateTo]);

  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [desktopMapOpen, setDesktopMapOpen] = useState(true);
  const mapInst = useRef<mapboxgl.Map | null>(null);
  const filtersRef = useRef<HTMLElement | null>(null);
  const [filtersScrolled, setFiltersScrolled] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const didMountRef = useRef(false);
  const handleMapInstance = useCallback((m: mapboxgl.Map | null) => {
    mapInst.current = m;
  }, []);
  const applyMonthSelection = useCallback(
    (nextMonth: string) => {
      setMonth(nextMonth);
      if (nextMonth === 'all') {
        setDateFrom(defaultDateRange.dateFrom);
        setDateTo(defaultDateRange.dateTo);
      } else {
        const range = monthDateRangeYyyyMmDd(nextMonth);
        setDateFrom(range.dateFrom);
        setDateTo(range.dateTo);
      }
      setPage(1);
    },
    [defaultDateRange.dateFrom, defaultDateRange.dateTo],
  );

  useEffect(() => {
    document.body.classList.toggle('race-list-mobile-map-open', mobileMapOpen);
    return () => document.body.classList.remove('race-list-mobile-map-open');
  }, [mobileMapOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncMobileFilterHeight = () => {
      const filters = filtersRef.current;
      const height = filters ? `${Math.ceil(filters.getBoundingClientRect().height)}px` : '0px';
      document.body.style.setProperty('--race-list-mobile-filter-height', height);
    };

    syncMobileFilterHeight();
    const observer =
      typeof ResizeObserver === 'undefined' || !filtersRef.current
        ? null
        : new ResizeObserver(syncMobileFilterHeight);
    if (observer && filtersRef.current) observer.observe(filtersRef.current);
    window.addEventListener('resize', syncMobileFilterHeight);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncMobileFilterHeight);
      document.body.style.removeProperty('--race-list-mobile-filter-height');
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const queryCounty = params.get('county');
    const queryRaceType = params.get('raceType');
    const queryMonth = params.get('month');
    const queryCategory = params.get('category');
    const queryDateFrom = params.get('dateFrom');
    const queryDateTo = params.get('dateTo');

    if (queryCounty) setCounty(queryCounty);
    if (queryRaceType) setRaceType(queryRaceType);
    if (queryMonth && /^\d{1,2}$/.test(queryMonth)) {
      const normalizedMonth = queryMonth.padStart(2, '0');
      setMonth(normalizedMonth);
      if (!queryDateFrom && !queryDateTo) {
        const range = monthDateRangeYyyyMmDd(normalizedMonth);
        setDateFrom(range.dateFrom);
        setDateTo(range.dateTo);
      }
    }
    if (queryCategory) setCategoryKey(queryCategory);
    if (queryDateFrom) setDateFrom(queryDateFrom);
    if (queryDateTo) setDateTo(queryDateTo);
    if (
      queryCounty ||
      queryRaceType ||
      queryMonth ||
      queryCategory ||
      queryDateFrom ||
      queryDateTo
    ) {
      setPage(1);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = window.setTimeout(() => {
      const filters = filtersRef.current;
      const height = filters ? `${Math.ceil(filters.getBoundingClientRect().height)}px` : '0px';
      document.body.style.setProperty('--race-list-mobile-filter-height', height);
    }, 50);
    return () => window.clearTimeout(t);
  }, [mobileMapOpen]);

  useEffect(() => {
    if (mobileMapOpen || desktopMapOpen) {
      const t = window.setTimeout(() => mapInst.current?.resize(), 120);
      return () => window.clearTimeout(t);
    }
  }, [mobileMapOpen, desktopMapOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncFilters = () => {
      const filters = filtersRef.current;
      if (!filters) return;

      const isScrolled = filters.getBoundingClientRect().top <= 0;
      setFiltersScrolled((prev) => (prev === isScrolled ? prev : isScrolled));
    };

    syncFilters();
    window.addEventListener('scroll', syncFilters, { passive: true });
    window.addEventListener('resize', syncFilters);
    return () => {
      window.removeEventListener('scroll', syncFilters);
      window.removeEventListener('resize', syncFilters);
    };
  }, []);

  const rpcParams = useMemo(() => {
    let pMin: number | null = null;
    let pMax: number | null = null;
    let extraType: string | null = null;
    if (categoryKey !== 'all') {
      const opt = categoryFilterOptions.find((o) => o.label === categoryKey);
      if (opt?.kind === 'distance') {
        pMin = opt.minKm;
        pMax = opt.maxKm;
      } else if (opt?.kind === 'type') {
        extraType = opt.raceType;
      }
    }
    const effectiveRaceType = raceType || extraType || '';
    const neighboringSelection = parseNeighboringSelection(county);
    return {
      p_country_code: countryCode,
      p_page: page,
      p_page_size: RACE_LIST_PAGE_SIZE,
      p_county: neighboringSelection ? null : county.trim() || null,
      p_origin_country: neighboringSelection?.kind === 'country' ? neighboringSelection.code : null,
      p_include_neighboring: neighboringSelection?.kind === 'all',
      p_race_type: effectiveRaceType.trim() || null,
      p_date_from: dateFrom.trim() || null,
      p_date_to: dateTo.trim() || null,
      p_month: month === 'all' ? null : parseInt(month, 10),
      p_distance_min_km: pMin,
      p_distance_max_km: pMax,
    };
  }, [countryCode, page, county, raceType, dateFrom, dateTo, month, categoryKey, categoryFilterOptions]);

  const localResult = useMemo(() => {
    if (!localRows) return null;

    let pMin: number | null = null;
    let pMax: number | null = null;
    let extraType = '';
    if (categoryKey !== 'all') {
      const opt = categoryFilterOptions.find((o) => o.label === categoryKey);
      if (opt?.kind === 'distance') {
        pMin = opt.minKm;
        pMax = opt.maxKm;
      } else if (opt?.kind === 'type') {
        extraType = opt.raceType;
      }
    }
    const effectiveRaceType = (raceType || extraType).trim().toLowerCase();
    const normalizedCounty = county.trim().toLowerCase();
    const neighboringSelection = parseNeighboringSelection(county);

    const filtered = localRows.filter((row) => {
      if (city && !rowMatchesCity(row, city)) return false;
      const rowOriginCountry = row.origin_country?.trim().toLowerCase() ?? '';
      const isDomestic = !rowOriginCountry || rowOriginCountry === countryCode.toLowerCase();
      if (neighboringSelection?.kind === 'all') {
        if (isDomestic) return false;
      } else if (neighboringSelection?.kind === 'country') {
        if (rowOriginCountry !== neighboringSelection.code) return false;
      } else {
        if (!isDomestic) return false;
        if (normalizedCounty) {
          const rowCounty = row.county?.trim().toLowerCase() ?? '';
          if (!rowCounty.includes(normalizedCounty)) return false;
        }
      }
      if (effectiveRaceType) {
        const rowRaceType = row.race_type?.trim().toLowerCase() ?? '';
        if (rowRaceType !== effectiveRaceType) return false;
      }
      if (!rowMatchesMonth(row, month)) return false;
      if (!rowMatchesDateRange(row, dateFrom, dateTo)) return false;
      if (!rowMatchesDistanceRange(row, pMin, pMax)) return false;
      return true;
    });
    filtered.sort((left, right) =>
      compareRaceRowsByRelevantDate(left, right, dateStartComparable, dateEndComparable),
    );

    const start = (page - 1) * RACE_LIST_PAGE_SIZE;
    return {
      total: filtered.length,
      rows: filtered.slice(start, start + RACE_LIST_PAGE_SIZE),
    };
  }, [
    localRows,
    categoryKey,
    categoryFilterOptions,
    raceType,
    county,
    month,
    dateFrom,
    dateTo,
    page,
    city,
    countryCode,
    dateStartComparable,
    dateEndComparable,
  ]);

  const filteredHighlightedRows = useMemo(() => {
    const sourceRows = localRows ?? highlightedRows ?? null;
    if (!sourceRows) return null;

    let pMin: number | null = null;
    let pMax: number | null = null;
    let extraType = '';
    if (categoryKey !== 'all') {
      const opt = categoryFilterOptions.find((o) => o.label === categoryKey);
      if (opt?.kind === 'distance') {
        pMin = opt.minKm;
        pMax = opt.maxKm;
      } else if (opt?.kind === 'type') {
        extraType = opt.raceType;
      }
    }
    const effectiveRaceType = (raceType || extraType).trim().toLowerCase();
    const normalizedCounty = county.trim().toLowerCase();
    const neighboringSelection = parseNeighboringSelection(county);

    const filtered = sourceRows.filter((row) => {
      if (city && !rowMatchesCity(row, city)) return false;
      const rowOriginCountry = row.origin_country?.trim().toLowerCase() ?? '';
      const isDomestic = !rowOriginCountry || rowOriginCountry === countryCode.toLowerCase();
      if (neighboringSelection?.kind === 'all') {
        if (isDomestic) return false;
      } else if (neighboringSelection?.kind === 'country') {
        if (rowOriginCountry !== neighboringSelection.code) return false;
      } else {
        if (!isDomestic) return false;
        if (normalizedCounty) {
          const rowCounty = row.county?.trim().toLowerCase() ?? '';
          if (!rowCounty.includes(normalizedCounty)) return false;
        }
      }
      if (effectiveRaceType) {
        const rowRaceType = row.race_type?.trim().toLowerCase() ?? '';
        if (rowRaceType !== effectiveRaceType) return false;
      }
      if (!rowMatchesMonth(row, month)) return false;
      if (!rowMatchesDateRange(row, dateFrom, dateTo)) return false;
      if (!rowMatchesDistanceRange(row, pMin, pMax)) return false;
      return true;
    });
    filtered.sort((left, right) =>
      compareRaceRowsByRelevantDate(left, right, dateStartComparable, dateEndComparable),
    );

    return filtered;
  }, [
    localRows,
    highlightedRows,
    categoryKey,
    categoryFilterOptions,
    raceType,
    county,
    month,
    dateFrom,
    dateTo,
    city,
    countryCode,
    dateStartComparable,
    dateEndComparable,
  ]);

  const needsRemote = useMemo(() => {
    if (localRows) return false;
    const initial = initialFilterState.current;
    return (
      county !== initial.county ||
      raceType !== initial.raceType ||
      dateFrom !== initial.dateFrom ||
      dateTo !== initial.dateTo ||
      month !== initial.month ||
      categoryKey !== initial.categoryKey ||
      page !== 1
    );
  }, [localRows, county, raceType, dateFrom, dateTo, month, categoryKey, page]);

  const fetchPage = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setError(remoteRequiredMessage);
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseBrowserClient();
      const { data, error: rpcErr } = await sb.rpc('get_races_list_page', rpcParams);
      if (rpcErr) throw rpcErr;
      const parsed = data as RpcResult;
      setTotal(typeof parsed?.total === 'number' ? parsed.total : 0);
      setRows(Array.isArray(parsed?.rows) ? parsed.rows! : []);
    } catch {
      setError(dataError);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [rpcParams, dataError, remoteRequiredMessage]);

  useEffect(() => {
    if (localResult) {
      setRows(localResult.rows);
      setTotal(localResult.total);
      setError(null);
      setLoading(false);
      return;
    }
  }, [localResult]);

  useEffect(() => {
    if (localRows) return;
    if (!needsRemote) {
      const snap = snapshotRef.current;
      setRows(snap.rows);
      setTotal(snap.total);
      setError(null);
      setLoading(false);
      return;
    }
    void fetchPage();
  }, [localRows, needsRemote, fetchPage, localResult]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    const target = sectionRef.current;
    if (!target || typeof window === 'undefined') return;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - 24);
    window.scrollTo({ top, behavior: 'smooth' });
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / RACE_LIST_PAGE_SIZE));
  const paginationTokens = useMemo(
    () => buildPaginationTokens(page, totalPages),
    [page, totalPages],
  );

  const rangeLabel = useMemo(() => {
    if (total === 0) return '';
    const start = (page - 1) * RACE_LIST_PAGE_SIZE + 1;
    const end = Math.min(page * RACE_LIST_PAGE_SIZE, total);
    return `${start}–${end} ${pagination.results_text ?? ''} ${total} ${pagination.events_text ?? ''}`;
  }, [page, total, pagination]);

  const prevDisabled = loading || page <= 1;
  const nextDisabled =
    loading ||
    page >= totalPages ||
    (!isSupabaseConfigured() && totalPages > 1 && page === 1 && needsRemote);

  const pickName = useCallback(
    (r: RaceListRow) => pickTranslation(r.race_translations, translationLocale)?.name ?? r.domain_name,
    [translationLocale],
  );

  const pickTypeLocal = useCallback(
    (r: RaceListRow) =>
      pickTranslation(r.race_translations, translationLocale)?.type_local ??
      (r.race_type ? typeOptions[r.race_type] ?? r.race_type : ''),
    [translationLocale, typeOptions],
  );

  const pickDistanceVerbose = useCallback(
    (r: RaceListRow) =>
      pickTranslation(r.race_translations, translationLocale)?.distance_verbose ?? '',
    [translationLocale],
  );

  const pickDescription = useCallback(
    (r: RaceListRow) => {
      const tr = pickTranslation(r.race_translations, translationLocale);
      if (tr?.description?.trim()) return tr.description;
      const d = r.payload?.description;
      return typeof d === 'string' ? d : '';
    },
    [translationLocale],
  );

  const pickVenueLocation = useCallback((r: RaceListRow) => {
    const loc = r.payload?.location;
    return typeof loc === 'string' ? loc.trim() : '';
  }, []);

  const countyLabel = useCallback(
    (r: RaceListRow) => {
      if (!r.county) return countryNative;
      return countyMapping[r.county] ?? r.county;
    },
    [countyMapping, countryNative],
  );

  const topLocation = useCallback(
    (r: RaceListRow): CardTopLocation => {
      const originCode = r.origin_country?.trim().toLowerCase() ?? '';
      const isNeighboringRace = originCode && !isDomesticOrigin(originCode, countryCode);
      if (isNeighboringRace) {
        const nearestCity =
          typeof r.payload?.nearest_city === 'string' ? r.payload.nearest_city.trim() : '';
        const fallbackLocation =
          typeof r.payload?.location === 'string' ? r.payload.location.trim() : '';
        return {
          label: nearestCity || fallbackLocation || countryLabelForNeighbor(originCode, neighboringCountries),
          flagCode: supportedFlagCode(originCode),
        };
      }

      return {
        label: countyLabel(r),
        flagCode: null,
      };
    },
    [countryCode, countyLabel, neighboringCountries],
  );

  const highlightedEntries = useMemo<HighlightedRaceEntry[]>(() => {
    if (!enableHighlightedRaces || !selectedRacesTitle.trim()) return [];

    const highlightSource = filteredHighlightedRows ?? rows;
    return highlightSource
      .filter((row) => isSuppliedRace(row))
      .sort((left, right) =>
        compareRaceRowsByRelevantDate(left, right, dateStartComparable, dateEndComparable),
      )
      .slice(0, 9)
      .map((row) => {
        const image = highlightedImage(row);
        const name = pickName(row);
        const typeLocal = pickTypeLocal(row);
        const distVerbose = pickDistanceVerbose(row);
        const rawDate = displayRaceDate(row.race_dates, dateStartComparable, dateEndComparable);
        const distParts = splitDistanceVerbose(distVerbose).map((segment) =>
          formatDistanceSegment(segment, verboseLocalDistanceMapping),
        );
        const summary = excerptDescription(pickDescription(row), 170);

        return {
          id: row.id,
          href: resolveRaceDetailHref({
            hostCountryCode: countryCode,
            routeLocale,
            localRacePageFolder: racePageFolder,
            row,
            marketRouteTargets,
          }),
          name,
          dateLabel: formatYyyymmdd(rawDate ?? '', monthMappingShort),
          dateIso: yyyymmddToIso(rawDate),
          topLocation: topLocation(row),
          typeLabel: typeLocal,
          distanceLabels: distParts,
          summary,
          imageSrc: image.src,
          imageAlt: image.alt ?? `${altPrefix}${name}`,
        };
      });
  }, [
    altPrefix,
    countyLabel,
    dateEndComparable,
    dateStartComparable,
    enableHighlightedRaces,
    monthMappingShort,
    countryCode,
    routeLocale,
    pickDescription,
    pickDistanceVerbose,
    pickName,
    pickTypeLocal,
    racePageFolder,
    rows,
    filteredHighlightedRows,
    selectedRacesTitle,
    topLocation,
    verboseLocalDistanceMapping,
    marketRouteTargets,
  ]);

  const selectedCategoryTitle = useMemo(() => {
    return categoryKey !== 'all' ? categoryKey : '';
  }, [categoryKey]);

  const selectedRegionTitle = useMemo(() => {
    const neighboringSelection = parseNeighboringSelection(county);
    if (neighboringSelection?.kind === 'all') {
      return sectionRaceCardHeaderNeighborsDefault || neighboringCountriesAllLabel;
    }
    if (neighboringSelection?.kind === 'country') {
      return (
        neighboringCountries.find((entry) => entry.code === neighboringSelection.code)?.label ??
        neighboringSelection.code.toUpperCase()
      );
    }
    if (city.trim()) return city.trim();
    if (county.trim()) return countyMapping[county.trim()] ?? county.trim();
    return sectionRaceCardHeaderRegionDefault;
  }, [
    city,
    county,
    countyMapping,
    neighboringCountries,
    neighboringCountriesAllLabel,
    sectionRaceCardHeaderNeighborsDefault,
    sectionRaceCardHeaderRegionDefault,
  ]);
  const popupContext = useMemo<NewsletterPopupContext>(() => {
    const featuredRow = rows[0] ?? highlightedRows?.[0] ?? initialRows[0];
    const backgroundImageSrc = featuredRow ? highlightedImage(featuredRow).src : null;
    const neighboringSelection = parseNeighboringSelection(county);
    const currentTypeLabel = raceType ? (typeOptions[raceType] ?? raceType) : '';

    if (city) {
      return {
        surface: 'race-list',
        kind: 'browse-city',
        cityLabel: city,
        backgroundImageSrc,
      };
    }

    if (neighboringSelection?.kind === 'country') {
      const neighboringLabel =
        neighboringCountries.find((entry) => entry.code === neighboringSelection.code)?.label ??
        neighboringSelection.code.toUpperCase();

      return {
        surface: 'race-list',
        kind: 'browse-neighboring-country',
        label: neighboringLabel,
        backgroundImageSrc,
      };
    }

    if (neighboringSelection?.kind === 'all') {
      return {
        surface: 'race-list',
        kind: 'browse-neighboring',
        label: neighboringCountriesAllLabel || neighboringCountriesLabel || countryNative,
        backgroundImageSrc,
      };
    }

    if (county) {
      return {
        surface: 'race-list',
        kind: 'browse-county',
        countyLabel: countyMapping[county] ?? county,
        backgroundImageSrc,
      };
    }

    if (categoryKey !== 'all' && currentTypeLabel) {
      return {
        surface: 'race-list',
        kind: 'browse-category-type',
        categoryLabel: categoryKey,
        raceTypeLabel: currentTypeLabel,
        backgroundImageSrc,
      };
    }

    if (categoryKey !== 'all') {
      return {
        surface: 'race-list',
        kind: 'browse-category',
        categoryLabel: categoryKey,
        backgroundImageSrc,
      };
    }

    if (currentTypeLabel) {
      return {
        surface: 'race-list',
        kind: 'browse-type',
        raceTypeLabel: currentTypeLabel,
        backgroundImageSrc,
      };
    }

    if (month !== 'all') {
      return {
        surface: 'race-list',
        kind: 'browse-month',
        monthLabel: monthMapping[month] ?? month,
        backgroundImageSrc,
      };
    }

    return {
      surface: 'race-list',
      kind: 'race-list',
      heading: raceListTitle,
      backgroundImageSrc,
    };
  }, [
    rows,
    highlightedRows,
    initialRows,
    city,
    county,
    raceType,
    categoryKey,
    month,
    countryNative,
    countyMapping,
    monthMapping,
    neighboringCountries,
    neighboringCountriesAllLabel,
    neighboringCountriesLabel,
    raceListTitle,
    typeOptions,
  ]);

  const dateRangeTitle = useMemo(() => {
    if (!dateFrom || !dateTo) return '';

    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';

    const localeCode = routeLocale === 'en' ? 'en' : translationLocale || 'sv';
    const fromMonth = from.toLocaleString(localeCode, { month: 'long' });
    const toMonth = to.toLocaleString(localeCode, { month: 'long' });
    const fromYear = from.getFullYear();
    const toYear = to.getFullYear();

    if (fromMonth === toMonth && fromYear === toYear) {
      return ` ${sectionRaceCardHeaderDateRangeSingle}${fromMonth} ${fromYear}`;
    }

    return ` ${sectionRaceCardHeaderDateRangeFrom}${fromMonth} ${fromYear} ${sectionRaceCardHeaderDateRangeTo}${toMonth} ${toYear}`;
  }, [
    dateFrom,
    dateTo,
    routeLocale,
    translationLocale,
    sectionRaceCardHeaderDateRangeFrom,
    sectionRaceCardHeaderDateRangeTo,
    sectionRaceCardHeaderDateRangeSingle,
  ]);

  const highlightInsertionIndex = rows.length > 1 ? 1 : 0;

  return (
    <>
      <NewsletterPopup context={popupContext} />

      <section
        ref={filtersRef}
        className={`section-filters${filtersScrolled ? ' scrolled' : ''}`}
      >
        <div className="filter-date">
          <label htmlFor="date-from">{filterDateFrom}:</label>
          <input
            type="date"
            id="date-from"
            name="date-from"
            className="date-input"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
          <label htmlFor="date-to">{filterDateTo}:</label>
          <input
            type="date"
            id="date-to"
            name="date-to"
            className="date-input"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="filter-months right-scroller">
          <button
            type="button"
            className={`month-button${month === 'all' ? ' active' : ''}`}
            data-month="all"
            onClick={() => applyMonthSelection('all')}
          >
            {filterMonths}
          </button>
          {Object.entries(monthMapping).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`month-button${month === k ? ' active' : ''}`}
              data-month={k}
              onClick={() => applyMonthSelection(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="filter-categories right-scroller">
          <button
            type="button"
            className={`category-button${categoryKey === 'all' ? ' active' : ''}`}
            data-category="all"
            onClick={() => {
              setCategoryKey('all');
              setPage(1);
            }}
          >
            {filterDistance}
          </button>
          {categoryFilterOptions.map((opt) => (
            <button
              key={opt.label}
              type="button"
              className={`category-button${categoryKey === opt.label ? ' active' : ''}`}
              data-category={opt.label}
              onClick={() => {
                setCategoryKey(opt.label);
                setPage(1);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="filter-dropdowns right-scroller">
          <div className="filter-county">
            <select
              id="county"
              name="county"
              value={county}
              onChange={(e) => {
                setCounty(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{filterCounty}</option>
              {neighboringCountries.length > 0 ? (
                <optgroup label={neighboringCountriesLabel}>
                  <option value={ALL_NEIGHBORING_COUNTIES_VALUE}>
                    {neighboringCountriesAllLabel}
                  </option>
                  {neighboringCountries.map((entry) => (
                    <option key={entry.code} value={neighboringCountryValue(entry.code)}>
                      {entry.label}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {Object.entries(countyMapping).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-race-type">
            <select
              id="race-type"
              name="race-type"
              value={raceType}
              onChange={(e) => {
                setRaceType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{filterRaceType}</option>
              {Object.entries(typeOptions).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="browse-all-filters">
            <a href={browseByCategoryHref} className="browse-link">
              <div className="browse-link-icon">
                <svg className="icon" aria-hidden="true">
                  <use href="/icons/svg-sprite.svg#git-network-outline" xlinkHref="/icons/svg-sprite.svg#git-network-outline" />
                </svg>
              </div>
              <div className="browse-link-text">{browseByCategoryButton}</div>
            </a>
          </div>
          {hasMapboxToken ? (
            <div className="toggle-button desktop" id="toggleMapButton">
              <button type="button" onClick={() => setDesktopMapOpen((v) => !v)}>
                <svg className="icon" id="onIcon" role="img" aria-hidden="true">
                  <use href="/icons/svg-sprite.svg#radio-button-on-outline" xlinkHref="/icons/svg-sprite.svg#radio-button-on-outline" />
                </svg>
                <svg className="icon" id="offIcon" role="img" aria-hidden="true">
                  <use href="/icons/svg-sprite.svg#radio-button-off-outline" xlinkHref="/icons/svg-sprite.svg#radio-button-off-outline" />
                </svg>
                {desktopMapOpen ? mapToggleDesktopActive : mapToggleDesktop}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section section-race-cards" ref={sectionRef}>
        {showIntroHeader ? (
          <div className="section-race-cards-header-container">
            <h1 id="race-cards-title" className="section-header section-header-race-cards static-header">
              {raceListTitle}
            </h1>
            <p className="section-description static-description">
              {raceListMeta1} {raceListMeta2}
            </p>
            <h2 className="section-header phone-min-height-51rem">
              {sectionRaceCardCategoryPrefix}{' '}
              <span id="race-cards-title-category">{selectedCategoryTitle}</span>{' '}
              {sectionRaceCardCategorySuffix}{' '}
              <span id="race-cards-title-separator">{sectionRaceCardHeaderSeparator}</span>{' '}
              <span id="race-cards-title-region">{selectedRegionTitle}</span>
              <span id="date-range">{dateRangeTitle}</span>
            </h2>
          </div>
        ) : null}

        <div
          className={`race-cards-selector${!hasMapboxToken ? ' race-cards-selector--mapless' : ''}`}
          data-testid="race-split"
        >
          <div
            className="race-cards-grid"
            id="race-cards-container"
            style={{ display: mobileMapOpen ? 'none' : undefined }}
          >
            {error ? (
              <p role="alert" className="race-list-error">
                {error}
              </p>
            ) : null}
            {loading ? <p className="race-list-loading">{loadingMessage}</p> : null}
            {!loading && !error && rows.length === 0 ? <p>{emptyMessage}</p> : null}

            {!loading &&
              !error &&
              rows.map((r, index) => {
                const name = pickName(r);
                const rawDate = displayRaceDate(r.race_dates, dateStartComparable, dateEndComparable);
                const dateDisp = rawDate ? formatYyyymmdd(rawDate, monthMappingShort) : '';
                const img =
                  primaryRaceImageUrl(r.payload) ?? placeholderImage(r.domain_name, r.race_type);
                const cardTopLocation = topLocation(r);
                const distVerbose = pickDistanceVerbose(r);
                const venue = pickVenueLocation(r);
                const description = pickDescription(r);
                const summary = excerptDescription(description);
                const href = resolveRaceDetailHref({
                  hostCountryCode: countryCode,
                  routeLocale,
                  localRacePageFolder: racePageFolder,
                  row: r,
                  marketRouteTargets,
                });
                const typeLocal = pickTypeLocal(r);
                const typeSlug = r.race_type?.toLowerCase() ?? '';
                const displayType =
                  (typeSlug ? typeOptions[typeSlug] : undefined) ??
                  typeLocal ??
                  r.race_type ??
                  '';
                const distParts = splitDistanceVerbose(distVerbose);

                return (
                  <Fragment key={r.id}>
                    <a
                      href={href}
                      className="race-card"
                      data-name={name}
                      data-date={rawDate ?? ''}
                      data-county={cardTopLocation.label}
                      data-race-type={typeLocal}
                      data-distance={distVerbose}
                      data-location={venue}
                      data-description={summary}
                    >
                      <div className="race-card-upper-box background-container">
                        <picture>
                          <LazyCardImg
                            src={img}
                            fallbackSrc={img}
                            alt={`${altPrefix}${name}`}
                            className="background-img"
                          />
                        </picture>
                        <div className="race-card-content">
                          <div className="race-info-top">
                            <div className="race-date">{dateDisp}</div>
                            <div className="race-location">
                              {cardTopLocation.flagCode ? (
                                <svg className="language-flag" aria-label={cardTopLocation.flagCode}>
                                  <use
                                    href={`/icons/svg-sprite.svg#flag-${cardTopLocation.flagCode}`}
                                    xlinkHref={`/icons/svg-sprite.svg#flag-${cardTopLocation.flagCode}`}
                                  />
                                </svg>
                              ) : null}
                              {cardTopLocation.label}
                            </div>
                          </div>
                          <div className="race-card-upper-meta">
                            {displayType.trim() ? (
                              <div className="race-type race-type--image">
                                <svg className="icon" aria-hidden="true">
                                  <use
                                    href="/icons/svg-sprite.svg#footsteps-icon"
                                    xlinkHref="/icons/svg-sprite.svg#footsteps-icon"
                                  />
                                </svg>
                                {displayType}
                              </div>
                            ) : null}
                            <div className="race-distances">
                              <div className="distance-container">
                                {distParts.length > 0 ? (
                                  <>
                                    {distParts.slice(0, 4).map((seg, di) => (
                                      <div key={`${r.id}-d-${di}`} className="distance-item">
                                        <span className="race-distance">
                                          {formatDistanceSegment(seg, verboseLocalDistanceMapping)}
                                        </span>
                                      </div>
                                    ))}
                                    {distParts.length > 4 ? (
                                      <div className="distance-item">
                                        <span className="race-distance">…</span>
                                      </div>
                                    ) : null}
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                          <div className="overlay soft" />
                        </div>
                      </div>
                      <div className="race-info-bottom">
                        <div className="upper-container">
                          <div className="left-container">
                            <h3 className="race-name">{name}</h3>
                            {venue ? (
                              <div className="race-location">
                                <svg className="icon" aria-hidden="true">
                                  <use
                                    href="/icons/svg-sprite.svg#location-icon"
                                    xlinkHref="/icons/svg-sprite.svg#location-icon"
                                  />
                                </svg>
                                {venue}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {summary ? <div className="race-summary">{summary}</div> : null}
                        <div className="cta-button">
                          <div className="more-info-button">{raceCardCta}</div>
                        </div>
                      </div>
                    </a>
                    {index === highlightInsertionIndex && highlightedEntries.length > 0 ? (
                        <HighlightedRacesStrip
                          title={selectedRacesTitle}
                          topTitle={selectedRacesTopTitle}
                          cta={raceCardCta}
                          entries={highlightedEntries}
                        />
                    ) : null}
                  </Fragment>
                );
              })}

            {total > 0 ? (
              <>
                <div className="pagination-info">
                  <span id="event-range">{rangeLabel}</span>
                </div>
                <div className="pagination" style={{ display: mobileMapOpen ? 'none' : undefined }}>
                  <button
                    type="button"
                    id="prev-page"
                    disabled={prevDisabled}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    {pagination.previous_text ?? ''}
                  </button>
                  <div id="page-numbers">
                    {paginationTokens.map((token, index) =>
                      token === 'ellipsis' ? (
                        <span key={`ellipsis-${index}`} className="ellipsis">
                          ...
                        </span>
                      ) : (
                        <button
                          key={`page-${token}`}
                          type="button"
                          className={token === page ? 'active' : undefined}
                          aria-current={token === page ? 'page' : undefined}
                          onClick={() => setPage(token)}
                          disabled={loading || token === page}
                        >
                          {token}
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    type="button"
                    id="next-page"
                    disabled={nextDisabled}
                    onClick={() => setPage((p) => p + 1)}
                    title={
                      !isSupabaseConfigured() && totalPages > 1 && page === 1
                        ? remoteRequiredMessage
                        : undefined
                    }
                  >
                    {pagination.next_text ?? ''}
                  </button>
                </div>
              </>
            ) : null}
          </div>

          <div
            className={`map-placeholder${mobileMapOpen ? ' map-placeholder--react-visible' : ''}${!desktopMapOpen ? ' desktop-map-hidden' : ''}${!hasMapboxToken ? ' map-placeholder--disabled' : ''}`}
            id="map-placeholder"
          >
            <RaceMapIsland
              countryCode={countryCode}
              routeLocale={routeLocale}
              racePageFolder={racePageFolder}
              countyMapping={countyMapping}
              countryNative={countryNative}
              monthMappingShort={monthMappingShort}
              typeOptions={typeOptions}
              verboseLocalDistanceMapping={verboseLocalDistanceMapping}
              mapboxToken={mapboxToken}
              centerLat={centerLat}
              centerLng={centerLng}
              zoom={zoom}
              toggleDesktop={mapToggleDesktop}
              toggleDesktopActive={mapToggleDesktopActive}
              toggleMobileMap={mapToggleMobile}
              toggleMobileList={mapToggleMobileList}
              markersLoadError={markersLoadError}
              mapNotConfiguredMessage={mapNotConfiguredMessage}
              filterCounty={county}
              filterRaceType={raceType}
              filterDateFrom={dateFrom}
              filterDateTo={dateTo}
              filterMonth={month}
              filterCategoryKey={categoryKey}
              categoryFilterOptions={categoryFilterOptions}
              hideToolbar
              onMapInstance={handleMapInstance}
            />
          </div>
        </div>
      </section>

      {hasMapboxToken ? (
        <button
          type="button"
          className={`toggle-button mobile${mobileMapOpen ? ' active' : ''}`}
          id="toggleMapButtonMobile"
          onClick={() => setMobileMapOpen((v) => !v)}
        >
          {mobileMapOpen ? (
            <>
              <svg className="icon" role="img" aria-hidden="true">
                <use href="/icons/svg-sprite.svg#list-outline" xlinkHref="/icons/svg-sprite.svg#list-outline" />
              </svg>
              <p>{mapToggleMobileList}</p>
            </>
          ) : (
            <>
              <div className="icon-container">
                <svg className="icon" role="img" aria-hidden="true">
                  <use href="/icons/svg-sprite.svg#map-outline" xlinkHref="/icons/svg-sprite.svg#map-outline" />
                </svg>
              </div>
              <p>{mapToggleMobile}</p>
            </>
          )}
        </button>
      ) : null}
    </>
  );
}
