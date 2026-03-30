import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { formatDistanceSegment, splitDistanceVerbose } from '../lib/raceCardDisplay';
import type { CategoryFilterOption } from '../lib/categoryFilterOptions';
import { isDomesticOrigin, parseNeighboringSelection } from '../lib/neighboringSelection';

type RaceFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: { id: string };
  }>;
};

type MarkerRecord = {
  id: string;
  domain_name: string;
  latitude: number;
  longitude: number;
  county: string | null;
  race_type: string | null;
  origin_country: string | null;
  name?: string | null;
  location?: string | null;
  distance_verbose?: string | null;
  race_date?: string | null;
  type_local?: string | null;
  website?: string | null;
};

export type MapRaceItem = {
  id: string;
  latitude: number;
  longitude: number;
  href: string;
  imageSrc: string;
  name: string;
  dateLabel: string;
  countyLabel: string;
  venueLabel: string;
  raceTypeLabel: string;
  distanceLabels: string[];
};

function placeholderImage(domain: string, raceType: string | null): string {
  const h = domain.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const n = (h % 4) + 1;
  const kind =
    raceType && ['trail', 'terrain'].includes(raceType.toLowerCase()) ? 'trail' : 'road';
  return `/common_images/${kind}-${n}-optimized.webp`;
}

function formatYyyymmdd(raw: string, monthShort: Record<string, string>): string {
  if (!raw || raw.length < 8) return raw;
  const m = raw.slice(4, 6);
  const d = String(parseInt(raw.slice(6, 8), 10));
  const monthName = monthShort[m] ?? m;
  return `${d} ${monthName}`;
}

function toFeatureCollection(races: MapRaceItem[]): RaceFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: races.map((race) => ({
      type: 'Feature' as const,
      id: race.id,
      geometry: {
        type: 'Point' as const,
        coordinates: [race.longitude, race.latitude],
      },
      properties: {
        id: race.id,
      },
    })),
  };
}

function popupBottomPadding(isMobile: boolean): number {
  return isMobile ? 230 : 180;
}

function normalizeDateInput(raw: string): string {
  return raw.replaceAll('-', '');
}

function parseDistanceSegmentKm(segment: string): number | null {
  const normalized = segment.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes('ultra')) return 50;
  if (normalized.includes('half marathon') || normalized.includes('halvmaraton')) return 21.0975;
  if (normalized === 'marathon' || normalized.includes('maraton')) return 42.195;

  const numeric = normalized.match(/(\d+(?:[.,]\d+)?)/);
  if (!numeric) return null;
  const value = Number.parseFloat(numeric[1].replace(',', '.'));
  if (!Number.isFinite(value)) return null;

  if (normalized.includes('mile') || normalized.includes('mi')) {
    return value * 1.60934;
  }
  if (normalized.includes('meter') || /\d+\s*m\b/.test(normalized)) {
    return value / 1000;
  }
  return value;
}

function matchesDistanceRange(distanceVerbose: string | null | undefined, minKm: number, maxKm: number): boolean {
  const segments = splitDistanceVerbose(distanceVerbose ?? '');
  return segments.some((segment) => {
    const km = parseDistanceSegmentKm(segment);
    return km != null && km >= minKm && km <= maxKm;
  });
}

function readFeatureId(
  feature: mapboxgl.MapboxGeoJSONFeature | null | undefined,
): string | null {
  const raw = feature?.properties?.id;
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

function nearestMobileSlideIndex(track: HTMLDivElement): number {
  const slides = Array.from(track.querySelectorAll<HTMLElement>('.race-map-popup__mobile-slide'));
  if (slides.length === 0) return 0;

  const viewportAnchor = track.scrollLeft + track.clientWidth * 0.42;
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  slides.forEach((slide, index) => {
    const slideAnchor = slide.offsetLeft + slide.clientWidth * 0.42;
    const distance = Math.abs(slideAnchor - viewportAnchor);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

function buildMapRaceItem(
  marker: MarkerRecord,
  routeLocale: 'native' | 'en',
  countryCode: string,
  racePageFolder: string,
  countyMapping: Record<string, string>,
  countryNative: string,
  monthMappingShort: Record<string, string>,
  typeOptions: Record<string, string>,
  verboseLocalDistanceMapping: Record<string, string>,
): MapRaceItem {
  const prefix =
    routeLocale === 'en'
      ? countryCode === 'se'
        ? '/en/'
        : `/${countryCode}/en/`
      : countryCode === 'se'
        ? '/'
        : `/${countryCode}/`;
  const raceTypeKey = marker.race_type?.toLowerCase() ?? '';
  const raceTypeLabel =
    (raceTypeKey ? typeOptions[raceTypeKey] : undefined) ??
    marker.type_local ??
    marker.race_type ??
    '';

  return {
    id: marker.id,
    latitude: marker.latitude,
    longitude: marker.longitude,
    href: `${prefix}${racePageFolder}/${marker.domain_name}/`,
    imageSrc: placeholderImage(marker.domain_name, marker.race_type),
    name: marker.name?.trim() || marker.domain_name,
    dateLabel: marker.race_date ? formatYyyymmdd(marker.race_date, monthMappingShort) : '',
    countyLabel: marker.county ? countyMapping[marker.county] ?? marker.county : countryNative,
    venueLabel: marker.location?.trim() ?? '',
    raceTypeLabel,
    distanceLabels: splitDistanceVerbose(marker.distance_verbose ?? '')
      .slice(0, 4)
      .map((segment) => formatDistanceSegment(segment, verboseLocalDistanceMapping)),
  };
}

export default function RaceMapIsland(props: {
  countryCode: string;
  routeLocale: 'native' | 'en';
  racePageFolder: string;
  countyMapping: Record<string, string>;
  countryNative: string;
  monthMappingShort: Record<string, string>;
  typeOptions: Record<string, string>;
  verboseLocalDistanceMapping?: Record<string, string>;
  filterCounty: string;
  filterRaceType: string;
  filterDateFrom: string;
  filterDateTo: string;
  filterMonth: string;
  filterCategoryKey: string;
  categoryFilterOptions: CategoryFilterOption[];
  mapboxToken: string;
  centerLat: number;
  centerLng: number;
  zoom: number;
  toggleDesktop: string;
  toggleDesktopActive: string;
  toggleMobileMap: string;
  toggleMobileList: string;
  markersLoadError: string;
  mapNotConfiguredMessage: string;
  onMapInstance?: (map: mapboxgl.Map | null) => void;
  hideToolbar?: boolean;
}) {
  const {
    countryCode,
    routeLocale,
    racePageFolder,
    countyMapping,
    countryNative,
    monthMappingShort,
    typeOptions,
    verboseLocalDistanceMapping = {},
    filterCounty,
    filterRaceType,
    filterDateFrom,
    filterDateTo,
    filterMonth,
    filterCategoryKey,
    categoryFilterOptions,
    mapboxToken,
    centerLat,
    centerLng,
    zoom,
    toggleDesktop,
    toggleDesktopActive,
    toggleMobileMap,
    toggleMobileList,
    markersLoadError,
    mapNotConfiguredMessage,
    onMapInstance,
    hideToolbar = false,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const popupTrackRef = useRef<HTMLDivElement>(null);
  const clickedFeatureRef = useRef(false);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [mapVisible, setMapVisible] = useState(true);
  const [allMarkers, setAllMarkers] = useState<MarkerRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedRaceIds, setSelectedRaceIds] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const filteredRaces = useMemo(() => {
    let minKm: number | null = null;
    let maxKm: number | null = null;
    let extraType: string | null = null;

    if (filterCategoryKey !== 'all') {
      const option = categoryFilterOptions.find((entry) => entry.label === filterCategoryKey);
      if (option?.kind === 'distance') {
        minKm = option.minKm;
        maxKm = option.maxKm;
      } else if (option?.kind === 'type') {
        extraType = option.raceType;
      }
    }

    const effectiveRaceType = (filterRaceType || extraType || '').trim().toLowerCase();
    const fromYmd = filterDateFrom ? normalizeDateInput(filterDateFrom) : '';
    const toYmd = filterDateTo ? normalizeDateInput(filterDateTo) : '';

    const effectiveCounty = filterCounty.trim();
    const neighboringSelection = parseNeighboringSelection(effectiveCounty);
    return allMarkers
      .filter((marker) => {
        if (neighboringSelection?.kind === 'all') {
          if (isDomesticOrigin(marker.origin_country, countryCode)) return false;
        } else if (neighboringSelection?.kind === 'country') {
          if ((marker.origin_country ?? '').trim().toLowerCase() !== neighboringSelection.code) {
            return false;
          }
        } else {
          if (!isDomesticOrigin(marker.origin_country, countryCode)) return false;
          if (effectiveCounty && marker.county !== effectiveCounty) return false;
        }
        if (effectiveRaceType && (marker.race_type ?? '').toLowerCase() !== effectiveRaceType) {
          return false;
        }
        if ((fromYmd || toYmd || filterMonth !== 'all') && !marker.race_date) return false;
        if (fromYmd && marker.race_date && marker.race_date < fromYmd) return false;
        if (toYmd && marker.race_date && marker.race_date > toYmd) return false;
        if (filterMonth !== 'all' && marker.race_date?.slice(4, 6) !== filterMonth.padStart(2, '0')) {
          return false;
        }
        if (minKm != null && maxKm != null && !matchesDistanceRange(marker.distance_verbose, minKm, maxKm)) {
          return false;
        }
        return true;
      })
      .map((marker) =>
        buildMapRaceItem(
          marker,
          routeLocale,
          countryCode,
          racePageFolder,
          countyMapping,
          countryNative,
          monthMappingShort,
          typeOptions,
          verboseLocalDistanceMapping,
        ),
      );
  }, [
    allMarkers,
    filterCategoryKey,
    categoryFilterOptions,
    filterCounty,
    filterRaceType,
    filterDateFrom,
    filterDateTo,
    filterMonth,
    routeLocale,
    countryCode,
    racePageFolder,
    countyMapping,
    countryNative,
    monthMappingShort,
    typeOptions,
    verboseLocalDistanceMapping,
  ]);

  const raceById = useMemo(
    () => new Map(filteredRaces.map((race) => [race.id, race])),
    [filteredRaces],
  );

  const fc = useMemo(() => toFeatureCollection(filteredRaces), [filteredRaces]);

  const selectedRaces = useMemo(
    () => selectedRaceIds.map((id) => raceById.get(id)).filter(Boolean) as MapRaceItem[],
    [selectedRaceIds, raceById],
  );

  const activeRace = selectedRaces[selectedIndex] ?? null;
  const selectedRaceIdsLiteral = useMemo(() => selectedRaceIds, [selectedRaceIds]);

  useEffect(() => {
    if (selectedRaceIds.length === 0) return;
    if (selectedRaces.length > 0) return;
    setSelectedRaceIds([]);
    setSelectedClusterId(null);
    setSelectedIndex(0);
  }, [selectedRaceIds.length, selectedRaces.length]);

  useEffect(() => {
    const url = `/markers-${countryCode.toLowerCase()}.json`;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<{ markers?: MarkerRecord[] }>;
      })
      .then((data) => {
        setAllMarkers(data.markers ?? []);
        setLoadError(null);
      })
      .catch(() => {
        setAllMarkers([]);
        setLoadError(markersLoadError);
      });
  }, [
    countryCode,
    markersLoadError,
  ]);

  useEffect(() => {
    if (selectedIndex < selectedRaces.length) return;
    setSelectedIndex(0);
  }, [selectedIndex, selectedRaces.length]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 44em)');
    const sync = () => setIsMobileViewport(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!mapboxToken?.trim() || !containerRef.current) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v10',
      center: [centerLng, centerLat],
      zoom,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.once('load', () => {
      setMapInstance(map);
      onMapInstance?.(map);
    });

    return () => {
      setMapInstance(null);
      onMapInstance?.(null);
      map.remove();
    };
  }, [mapboxToken, centerLat, centerLng, zoom, onMapInstance]);

  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    const applyData = () => {
      const source = map.getSource('races') as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(fc);
        return;
      }

      map.addSource('races', {
        type: 'geojson',
        data: fc,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 38,
      });

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'races',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#ffffff',
          'circle-radius': ['step', ['get', 'point_count'], 12.5, 10, 15.5, 50, 19],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#e2701b',
          'circle-opacity': 0.97,
        },
      });

      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'races',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 10,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: {
          'text-color': '#e2701b',
        },
      });

      map.addLayer({
        id: 'unclustered',
        type: 'circle',
        source: 'races',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#e2701b',
          'circle-radius': 5.25,
          'circle-stroke-width': 1.75,
          'circle-stroke-color': '#ffffff',
        },
      });
    };

    if (map.isStyleLoaded()) {
      applyData();
      return;
    }

    map.once('load', applyData);
  }, [mapInstance, fc]);

  useEffect(() => {
    const map = mapInstance;
    if (!map || !map.getLayer('clusters') || !map.getLayer('cluster-count') || !map.getLayer('unclustered')) {
      return;
    }

    map.setPaintProperty('clusters', 'circle-stroke-color', [
      'case',
      ['==', ['get', 'cluster_id'], selectedClusterId ?? -1],
      '#00925e',
      '#e2701b',
    ]);
    map.setPaintProperty('cluster-count', 'text-color', [
      'case',
      ['==', ['get', 'cluster_id'], selectedClusterId ?? -1],
      '#00925e',
      '#e2701b',
    ]);
    map.setPaintProperty('unclustered', 'circle-color', [
      'case',
      ['in', ['get', 'id'], ['literal', selectedRaceIdsLiteral]],
      '#00925e',
      '#e2701b',
    ]);
  }, [mapInstance, selectedClusterId, selectedRaceIdsLiteral]);

  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    const easeToSelection = (lng: number, lat: number) => {
      map.easeTo({
        center: [lng, lat],
        duration: 850,
        padding: {
          top: 24,
          right: 24,
          bottom: popupBottomPadding(isMobileViewport),
          left: 24,
        },
        retainPadding: false,
      });
    };

    const handleClusterClick = (event: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
      clickedFeatureRef.current = true;
      window.setTimeout(() => {
        clickedFeatureRef.current = false;
      }, 0);

      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const numericClusterId =
        typeof clusterId === 'number'
          ? clusterId
          : typeof clusterId === 'string'
            ? Number(clusterId)
            : NaN;
      if (!Number.isFinite(numericClusterId)) return;

      const source = map.getSource('races') as mapboxgl.GeoJSONSource | undefined;
      if (!source) return;

      const coordinates =
        feature?.geometry?.type === 'Point'
          ? (feature.geometry.coordinates as [number, number])
          : null;

      source.getClusterLeaves(numericClusterId, 100, 0, (error, leaves) => {
        if (error) return;
        const ids = (leaves ?? [])
          .map((leaf) => readFeatureId(leaf))
          .filter(Boolean) as string[];
        if (!ids.length) return;
        setSelectedRaceIds(ids);
        setSelectedClusterId(numericClusterId);
        setSelectedIndex(0);
        if (coordinates) easeToSelection(coordinates[0], coordinates[1]);
      });
    };

    const handleSingleClick = (event: mapboxgl.MapMouseEvent & mapboxgl.EventData) => {
      clickedFeatureRef.current = true;
      window.setTimeout(() => {
        clickedFeatureRef.current = false;
      }, 0);

      const feature = event.features?.[0];
      const id = readFeatureId(feature);
      if (!id) return;
      const race = raceById.get(id);
      if (!race) return;
      setSelectedRaceIds([id]);
      setSelectedClusterId(null);
      setSelectedIndex(0);
      easeToSelection(race.longitude, race.latitude);
    };

    const handleMapClick = () => {
      if (clickedFeatureRef.current) return;
      setSelectedRaceIds([]);
      setSelectedClusterId(null);
      setSelectedIndex(0);
    };

    const handlePointerEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const handlePointerLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', 'clusters', handleClusterClick);
    map.on('click', 'unclustered', handleSingleClick);
    map.on('click', handleMapClick);
    map.on('mouseenter', 'clusters', handlePointerEnter);
    map.on('mouseenter', 'unclustered', handlePointerEnter);
    map.on('mouseleave', 'clusters', handlePointerLeave);
    map.on('mouseleave', 'unclustered', handlePointerLeave);

    return () => {
      map.off('click', 'clusters', handleClusterClick);
      map.off('click', 'unclustered', handleSingleClick);
      map.off('click', handleMapClick);
      map.off('mouseenter', 'clusters', handlePointerEnter);
      map.off('mouseenter', 'unclustered', handlePointerEnter);
      map.off('mouseleave', 'clusters', handlePointerLeave);
      map.off('mouseleave', 'unclustered', handlePointerLeave);
    };
  }, [mapInstance, raceById, isMobileViewport]);

  useEffect(() => {
    if (mapInstance && mapVisible) {
      mapInstance.resize();
    }
  }, [mapInstance, mapVisible]);

  useEffect(() => {
    if (!isMobileViewport) return;
    const track = popupTrackRef.current;
    if (!track) return;

    const slides = track.querySelectorAll<HTMLElement>('.race-map-popup__mobile-slide');
    const activeSlide = slides[selectedIndex];
    if (!activeSlide) return;

    track.scrollTo({
      left: activeSlide.offsetLeft,
      behavior: selectedRaceIds.length > 1 ? 'smooth' : 'auto',
    });
  }, [isMobileViewport, selectedRaceIds]);

  if (!mapboxToken?.trim()) {
    return (
      <div className="race-map-shell" data-testid="race-map-shell">
        <p className="race-map-error" role="status">
          {mapNotConfiguredMessage}
        </p>
      </div>
    );
  }

  const desktopToggleLabel = mapVisible ? toggleDesktopActive : toggleDesktop;
  const canStepBack = selectedIndex > 0;
  const canStepForward = selectedIndex < selectedRaces.length - 1;

  return (
    <div className="race-map-shell" data-testid="race-map-shell">
      {hideToolbar ? null : (
        <div className="race-map-toolbar">
          <button
            type="button"
            className="race-map-toggle-desktop"
            onClick={() => setMapVisible((v) => !v)}
            aria-pressed={mapVisible}
          >
            {desktopToggleLabel}
          </button>
          <span className="race-map-toggle-mobile-labels">
            <span>{toggleMobileMap}</span>
            <span> / </span>
            <span>{toggleMobileList}</span>
          </span>
        </div>
      )}

      {loadError ? (
        <p className="race-map-error" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="race-map-stage">
        <div
          ref={containerRef}
          className="race-map-canvas"
          data-testid="race-map-canvas"
          style={{ display: mapVisible ? 'block' : 'none' }}
        />

        {selectedRaces.length > 0 ? (
          <div className="race-map-popup" onClick={(e) => e.stopPropagation()}>
            <div className="race-map-popup__header">
              {selectedRaces.length > 1 ? (
                <div className="race-map-popup__counter">
                  Race {selectedIndex + 1} / {selectedRaces.length}
                </div>
              ) : (
                <div />
              )}
              <button
                type="button"
                className="race-map-popup__close"
                aria-label="Close map popup"
                onClick={() => {
                  setSelectedRaceIds([]);
                  setSelectedClusterId(null);
                  setSelectedIndex(0);
                }}
              >
                ×
              </button>
            </div>

            <div className="race-map-popup__desktop">
              {activeRace ? <PopupCard race={activeRace} /> : null}
              {selectedRaces.length > 1 ? (
                <div className="race-map-popup__nav">
                  <button
                    type="button"
                    className="race-map-popup__nav-button"
                    disabled={!canStepBack}
                    onClick={() => setSelectedIndex((index) => Math.max(0, index - 1))}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="race-map-popup__nav-button"
                    disabled={!canStepForward}
                    onClick={() =>
                      setSelectedIndex((index) =>
                        Math.min(selectedRaces.length - 1, index + 1),
                      )
                    }
                  >
                    ›
                  </button>
                </div>
              ) : null}
            </div>

            <div
              ref={popupTrackRef}
              className="race-map-popup__mobile-track"
              onScroll={(event) => {
                const track = event.currentTarget;
                const nextIndex = nearestMobileSlideIndex(track);
                if (nextIndex !== selectedIndex) {
                  setSelectedIndex(nextIndex);
                }
              }}
            >
              {selectedRaces.map((race) => (
                <div key={race.id} className="race-map-popup__mobile-slide">
                  <PopupCard race={race} />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PopupCard({ race }: { race: MapRaceItem }) {
  return (
    <a href={race.href} className="race-map-popup__card">
      <div className="race-map-popup__image-wrap">
        <img src={race.imageSrc} alt={race.name} className="race-map-popup__image" />
        <div className="race-map-popup__scrim" />
        <div className="race-map-popup__glow" />
        <div className="race-map-popup__overlay">
          <div className="race-map-popup__eyebrow">
            {race.dateLabel ? (
              <div className="race-map-popup__glass-tag race-map-popup__glass-tag--strong">
                {race.dateLabel}
              </div>
            ) : null}
            {race.countyLabel ? (
              <div className="race-map-popup__glass-tag">{race.countyLabel}</div>
            ) : null}
          </div>
          <div className="race-map-popup__glass-panel">
            {race.venueLabel ? (
              <div className="race-map-popup__kicker">
                <svg className="icon" aria-hidden="true">
                  <use
                    href="/icons/svg-sprite.svg#location-icon"
                    xlinkHref="/icons/svg-sprite.svg#location-icon"
                  />
                </svg>
                {race.venueLabel}
              </div>
            ) : null}
            <h3 className="race-map-popup__title">{race.name}</h3>
            {race.raceTypeLabel ? (
              <div className="race-map-popup__detail-row">
                <div className="race-map-popup__detail-chip">
                  <svg className="icon" aria-hidden="true">
                    <use
                      href="/icons/svg-sprite.svg#footsteps-icon"
                      xlinkHref="/icons/svg-sprite.svg#footsteps-icon"
                    />
                  </svg>
                  {race.raceTypeLabel}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </a>
  );
}
