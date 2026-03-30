import { useEffect, useMemo, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

type Props = {
  mapboxToken: string;
  centerLat: number;
  centerLng: number;
  zoom: number;
  removeLastLabel: string;
  clearRouteLabel: string;
  totalDistanceLabel: string;
  mapNotConfiguredMessage: string;
};

function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRad(b[0] - a[0]);
  const deltaLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const root =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(root), Math.sqrt(1 - root));
}

export default function MeasureRouteIsland(props: Props) {
  const {
    mapboxToken,
    centerLat,
    centerLng,
    zoom,
    removeLastLabel,
    clearRouteLabel,
    totalDistanceLabel,
    mapNotConfiguredMessage,
  } = props;

  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const mapInstanceRef = useRef<import('leaflet').Map | null>(null);
  const markersRef = useRef<import('leaflet').Marker[]>([]);
  const routeLineRef = useRef<import('leaflet').Polyline | null>(null);
  const [coordinates, setCoordinates] = useState<Array<[number, number]>>([]);

  const totalDistance = useMemo(() => {
    let total = 0;
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      total += haversineKm(coordinates[index], coordinates[index + 1]);
    }
    return total;
  }, [coordinates]);

  useEffect(() => {
    if (!mapboxToken.trim() || !mapRef.current) return undefined;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void import('leaflet').then((L) => {
      if (cancelled || !mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(mapRef.current, { attributionControl: false }).setView(
        [centerLat, centerLng],
        zoom,
      );

      L.tileLayer(
        `https://api.mapbox.com/styles/v1/mapbox/outdoors-v11/tiles/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
        {
          minZoom: 5,
          maxZoom: 19,
          tileSize: 512,
          zoomOffset: -1,
        },
      ).addTo(map);

      map.on('click', (event) => {
        const nextPoint: [number, number] = [event.latlng.lat, event.latlng.lng];
        setCoordinates((current) => [...current, nextPoint]);
      });

      mapInstanceRef.current = map;

      cleanup = () => {
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];
        routeLineRef.current?.remove();
        routeLineRef.current = null;
        map.remove();
        mapInstanceRef.current = null;
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [centerLat, centerLng, mapboxToken, zoom]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = coordinates.map((coordinate) =>
      L.marker(coordinate, {
        icon: L.divIcon({
          className: 'marker-measure',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
          html: '<div class="marker-inner"></div>',
        }),
      }).addTo(map),
    );

    routeLineRef.current?.remove();
    routeLineRef.current = null;

    if (coordinates.length > 1) {
      routeLineRef.current = L.polyline(coordinates, {
        color: 'var(--color-primary)',
        weight: 3,
      }).addTo(map);
    }
  }, [coordinates]);

  const removeLast = () => {
    setCoordinates((current) => current.slice(0, -1));
  };

  const clearRoute = () => {
    setCoordinates([]);
  };

  if (!mapboxToken.trim()) {
    return <div className="measure-route-empty">{mapNotConfiguredMessage}</div>;
  }

  return (
    <>
      <div className="route-controls">


        <button id="remove-last" className="control-button" type="button" onClick={removeLast}>
          <svg className="icon" aria-hidden="true">
            <use
              href="/icons/svg-sprite.svg#arrow-undo-outline"
              xlinkHref="/icons/svg-sprite.svg#arrow-undo-outline"
            />
          </svg>
          {removeLastLabel}
        </button>
        <button id="clear-route" className="control-button" type="button" onClick={clearRoute}>
          <svg className="icon" aria-hidden="true">
            <use
              href="/icons/svg-sprite.svg#trash-outline"
              xlinkHref="/icons/svg-sprite.svg#trash-outline"
            />
          </svg>
          {clearRouteLabel}
        </button>
      </div>
      <div className="measure-map-shell">
        <div className="distance-display">
          <span>{totalDistanceLabel}: </span>
          <span id="total-distance">{totalDistance.toFixed(2)} km</span>
        </div>
        <div ref={mapRef} id="map-placeholder" className="measure-map" />
      </div>
    </>
  );
}
