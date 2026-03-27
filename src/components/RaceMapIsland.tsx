import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

type RaceFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: Record<string, string | null | undefined>;
  }>;
};

export type MarkerRecord = {
  id: string;
  domain_name: string;
  latitude: number;
  longitude: number;
  county: string | null;
  race_type: string | null;
  origin_country: string | null;
};

export type MarkersFile = {
  generatedAt: string;
  country: string;
  markers: MarkerRecord[];
};

function toFeatureCollection(markers: MarkerRecord[]): RaceFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: markers.map((m) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [m.longitude, m.latitude],
      },
      properties: {
        id: m.id,
        domain_name: m.domain_name,
        county: m.county,
        race_type: m.race_type,
        origin_country: m.origin_country,
      },
    })),
  };
}

export default function RaceMapIsland(props: {
  countryCode: string;
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
  /** For parent resize (e.g. mobile map toggle). */
  onMapInstance?: (map: mapboxgl.Map | null) => void;
  /** When true, map fills shell only (parent provides desktop/mobile toggles). */
  hideToolbar?: boolean;
}) {
  const {
    countryCode,
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
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [fc, setFc] = useState<RaceFeatureCollection | null>(null);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(true);

  useEffect(() => {
    const url = `/markers-${countryCode.toLowerCase()}.json`;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<{ markers?: MarkerRecord[] }>;
      })
      .then((data) => setFc(toFeatureCollection(data.markers ?? [])))
      .catch(() => {
        setLoadError(markersLoadError);
        setFc(toFeatureCollection([]));
      });
  }, [countryCode, markersLoadError]);

  useEffect(() => {
    if (!mapboxToken?.trim() || !containerRef.current) return;

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/outdoors-v12',
      center: [centerLng, centerLat],
      zoom,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;
    map.once('load', () => {
      setMapInstance(map);
      onMapInstance?.(map);
    });

    return () => {
      setMapInstance(null);
      onMapInstance?.(null);
      map.remove();
      mapRef.current = null;
    };
  }, [mapboxToken, centerLat, centerLng, zoom, onMapInstance]);

  useEffect(() => {
    const map = mapInstance;
    if (!map || !fc) return;

    const src = map.getSource('races') as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData(fc);
      return;
    }

    map.addSource('races', {
      type: 'geojson',
      data: fc,
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });

    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'races',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#0d9488',
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 50, 28],
        'circle-opacity': 0.85,
      },
    });

    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'races',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-size': 12,
      },
      paint: {
        'text-color': '#ffffff',
      },
    });

    map.addLayer({
      id: 'unclustered',
      type: 'circle',
      source: 'races',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#f59e0b',
        'circle-radius': 7,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#fff',
      },
    });
  }, [mapInstance, fc]);

  const desktopToggleLabel = mapVisible ? toggleDesktopActive : toggleDesktop;

  useEffect(() => {
    if (mapInstance && mapVisible) {
      mapInstance.resize();
    }
  }, [mapInstance, mapVisible]);

  if (!mapboxToken?.trim()) {
    return (
      <div className="race-map-shell" data-testid="race-map-shell">
        <p className="race-map-error" role="status">
          {mapNotConfiguredMessage}
        </p>
      </div>
    );
  }

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
      <div
        ref={containerRef}
        className="race-map-canvas"
        data-testid="race-map-canvas"
        style={{ display: mapVisible ? 'block' : 'none' }}
      />
    </div>
  );
}
