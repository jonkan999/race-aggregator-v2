import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IndexYaml } from './content';

const CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../config/map-defaults.json',
);

export type ListMapView = {
  centerLat: number;
  centerLng: number;
  zoom: number;
};

type MapDefaultOverlay = {
  latitude?: number;
  longitude?: number;
  zoom?: number | string;
};

let cachedOverlays: Record<string, MapDefaultOverlay> | null = null;

function loadOverlays(): Record<string, MapDefaultOverlay> {
  if (cachedOverlays) return cachedOverlays;
  if (!fs.existsSync(CONFIG_PATH)) {
    cachedOverlays = {};
    return cachedOverlays;
  }
  cachedOverlays = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Record<string, MapDefaultOverlay>;
  return cachedOverlays;
}

function parseZoom(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Country-scale map center/zoom for list, browse, and tool maps.
 * `config/map-defaults.json` wins over YAML so collector syncs cannot silently
 * restore a too-tight default (Denmark needs the whole country visible).
 */
export function getListMapView(countryCode: string, content: IndexYaml): ListMapView {
  const overlay = loadOverlays()[countryCode.trim().toLowerCase()] ?? {};
  return {
    centerLat: overlay.latitude ?? content.mapbox_center?.latitude ?? 59.35,
    centerLng: overlay.longitude ?? content.mapbox_center?.longitude ?? 15.03,
    zoom: parseZoom(overlay.zoom, parseZoom(content.mapbox_zoom, 6)),
  };
}
