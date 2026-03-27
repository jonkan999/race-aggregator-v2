import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
} from 'react';
import type mapboxgl from 'mapbox-gl';
import RaceMapIsland from './RaceMapIsland';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '../lib/supabase';
import { RACE_LIST_PAGE_SIZE } from '../lib/raceListConfig';
import type { CategoryFilterOption } from '../lib/categoryFilterOptions';
import {
  excerptDescription,
  formatDistanceSegment,
  splitDistanceVerbose,
} from '../lib/raceCardDisplay';
import { pickTranslation, type RaceListRow } from '../lib/raceListRow';

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

function firstYyyymmdd(dates: unknown): string | null {
  if (!Array.isArray(dates) || dates.length === 0) return null;
  const first = dates[0];
  if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  return null;
}

function formatYyyymmdd(raw: string, monthShort: Record<string, string>): string {
  if (!raw || raw.length < 8) return raw;
  const m = raw.slice(4, 6);
  const d = String(parseInt(raw.slice(6, 8), 10));
  const monthName = monthShort[m] ?? m;
  return `${d} ${monthName}`;
}

function placeholderImage(domain: string, raceType: string | null): string {
  const h = domain.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const n = (h % 4) + 1;
  const kind =
    raceType && ['trail', 'terrain'].includes(raceType.toLowerCase()) ? 'trail' : 'road';
  return `/common_images/${kind}-${n}-optimized.webp`;
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

const PLACEHOLDER_GIF =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function LazyCardImg(
  props: ImgHTMLAttributes<HTMLImageElement> & { src: string; fallbackSrc?: string },
) {
  const { src, fallbackSrc, alt, className, ...rest } = props;
  const ref = useRef<HTMLImageElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShown(true);
            obs.disconnect();
          }
        });
      },
      { rootMargin: '120px', threshold: 0.01 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const displaySrc = shown ? src : PLACEHOLDER_GIF;

  return (
    <img
      ref={ref}
      src={displaySrc}
      {...(shown ? {} : { 'data-src': src })}
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
  mapToggleDesktop: string;
  mapToggleDesktopActive: string;
  mapToggleMobile: string;
  mapToggleMobileList: string;
  sectionRaceCardCategoryPrefix: string;
  sectionRaceCardCategorySuffix: string;
  sectionRaceCardHeaderSeparator: string;
  sectionRaceCardHeaderRegionDefault: string;
  raceCardCta: string;
  altPrefix: string;
  racePageFolder: string;
  countryNative: string;
  countyMapping: Record<string, string>;
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
    mapToggleDesktop,
    mapToggleDesktopActive,
    mapToggleMobile,
    mapToggleMobileList,
    sectionRaceCardCategoryPrefix,
    sectionRaceCardCategorySuffix,
    sectionRaceCardHeaderSeparator,
    sectionRaceCardHeaderRegionDefault,
    raceCardCta,
    altPrefix,
    racePageFolder,
    countryNative,
    countyMapping,
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

  const prefix = routeLocale === 'en' ? `/${countryCode}/en/` : `/${countryCode}/`;
  const raceBase = `${prefix}${racePageFolder}/`;
  const hasMapboxToken = Boolean(mapboxToken.trim());

  const snapshotRef = useRef<{ rows: RaceListRow[]; total: number }>({
    rows: initialRows,
    total: initialTotal,
  });
  snapshotRef.current = { rows: initialRows, total: initialTotal };

  const [page, setPage] = useState(1);
  const [county, setCounty] = useState('');
  const [raceType, setRaceType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [month, setMonth] = useState('all');
  const [categoryKey, setCategoryKey] = useState('all');

  const [rows, setRows] = useState<RaceListRow[]>(() =>
    isDefaultFilterState('', '', '', '', 'all', 'all') ? initialRows : [],
  );
  const [total, setTotal] = useState(() =>
    isDefaultFilterState('', '', '', '', 'all', 'all') ? initialTotal : 0,
  );
  const [loading, setLoading] = useState(!isDefaultFilterState('', '', '', '', 'all', 'all'));
  const [error, setError] = useState<string | null>(null);

  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [desktopMapOpen, setDesktopMapOpen] = useState(true);
  const mapInst = useRef<mapboxgl.Map | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
  const didMountRef = useRef(false);

  useEffect(() => {
    document.body.classList.toggle('race-list-mobile-map-open', mobileMapOpen);
    return () => document.body.classList.remove('race-list-mobile-map-open');
  }, [mobileMapOpen]);

  useEffect(() => {
    if (mobileMapOpen || desktopMapOpen) {
      const t = window.setTimeout(() => mapInst.current?.resize(), 120);
      return () => window.clearTimeout(t);
    }
  }, [mobileMapOpen, desktopMapOpen]);

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
    return {
      p_country_code: countryCode,
      p_page: page,
      p_page_size: RACE_LIST_PAGE_SIZE,
      p_county: county.trim() || null,
      p_race_type: effectiveRaceType.trim() || null,
      p_date_from: dateFrom.trim() || null,
      p_date_to: dateTo.trim() || null,
      p_month: month === 'all' ? null : parseInt(month, 10),
      p_distance_min_km: pMin,
      p_distance_max_km: pMax,
    };
  }, [countryCode, page, county, raceType, dateFrom, dateTo, month, categoryKey, categoryFilterOptions]);

  const needsRemote = useMemo(() => {
    return (
      !isDefaultFilterState(county, raceType, dateFrom, dateTo, month, categoryKey) || page !== 1
    );
  }, [county, raceType, dateFrom, dateTo, month, categoryKey, page]);

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
    if (!needsRemote) {
      const snap = snapshotRef.current;
      setRows(snap.rows);
      setTotal(snap.total);
      setError(null);
      setLoading(false);
      return;
    }
    void fetchPage();
  }, [needsRemote, fetchPage]);

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

  return (
    <>
      <section className="section-filters">
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
            onClick={() => {
              setMonth('all');
              setPage(1);
            }}
          >
            {filterMonths}
          </button>
          {Object.entries(monthMapping).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`month-button${month === k ? ' active' : ''}`}
              data-month={k}
              onClick={() => {
                setMonth(k);
                setPage(1);
              }}
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
        <div className="section-race-cards-header-container">
          <h1 id="race-cards-title" className="section-header section-header-race-cards static-header">
            {raceListTitle}
          </h1>
          <p className="section-description static-description">
            {raceListMeta1} {raceListMeta2}
          </p>
          <h2 className="section-header phone-min-height-51rem">
            {sectionRaceCardCategoryPrefix}{' '}
            <span id="race-cards-title-category">{filterDistance}</span>{' '}
            {sectionRaceCardCategorySuffix}{' '}
            <span id="race-cards-title-separator">{sectionRaceCardHeaderSeparator}</span>{' '}
            <span id="race-cards-title-region">{sectionRaceCardHeaderRegionDefault}</span>
          </h2>
        </div>

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
              rows.map((r) => {
                const name = pickName(r);
                const rawDate = firstYyyymmdd(r.race_dates);
                const dateDisp = rawDate ? formatYyyymmdd(rawDate, monthMappingShort) : '';
                const img = placeholderImage(r.domain_name, r.race_type);
                const regionLabel = countyLabel(r);
                const distVerbose = pickDistanceVerbose(r);
                const venue = pickVenueLocation(r);
                const description = pickDescription(r);
                const summary = excerptDescription(description);
                const href = `${raceBase}${r.domain_name}/`;
                const typeLocal = pickTypeLocal(r);
                const typeSlug = r.race_type?.toLowerCase() ?? '';
                const displayType =
                  (typeSlug ? typeOptions[typeSlug] : undefined) ??
                  typeLocal ??
                  r.race_type ??
                  '';
                const distParts = splitDistanceVerbose(distVerbose);

                return (
                  <a
                    key={r.id}
                    href={href}
                    className="race-card"
                    data-name={name}
                    data-date={rawDate ?? ''}
                    data-county={regionLabel}
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
                          <div className="race-location">{regionLabel}</div>
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
                          <div
                            className="race-distances"
                          >
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
                              ) : (
                                null
                              )}
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
              hideToolbar
              onMapInstance={(m) => {
                mapInst.current = m;
              }}
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
