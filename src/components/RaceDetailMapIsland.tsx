import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function RaceDetailMapIsland(props: {
  mapboxToken: string;
  latitude: number | null;
  longitude: number | null;
  zoom: number;
  markerLabel: string;
  mapNotConfiguredMessage: string;
}) {
  const { mapboxToken, latitude, longitude, zoom, markerLabel, mapNotConfiguredMessage } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapboxToken.trim()) {
      setError(mapNotConfiguredMessage);
      return;
    }
    if (latitude == null || longitude == null || !containerRef.current) {
      return;
    }

    mapboxgl.accessToken = mapboxToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v10',
      center: [longitude, latitude],
      zoom,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    const popup = new mapboxgl.Popup({
      offset: 20,
      focusAfterOpen: false,
      closeOnClick: false,
    }).setText(markerLabel);
    new mapboxgl.Marker({ color: '#e2701b' })
      .setLngLat([longitude, latitude])
      .setPopup(popup)
      .addTo(map);

    map.on('load', () => popup.addTo(map));
    map.on('error', () => setError(mapNotConfiguredMessage));

    return () => {
      popup.remove();
      map.remove();
    };
  }, [latitude, longitude, mapNotConfiguredMessage, mapboxToken, markerLabel, zoom]);

  if (!mapboxToken.trim() || error) {
    return <div className="race-detail-map__fallback">{error ?? mapNotConfiguredMessage}</div>;
  }

  if (latitude == null || longitude == null) {
    return <div className="race-detail-map__fallback" />;
  }

  return <div ref={containerRef} className="race-detail-map__canvas" />;
}
