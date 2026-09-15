export type MapMarkerRecord = {
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
  race_dates?: string[] | null;
  type_local?: string | null;
  website?: string | null;
};

export type RawMapMarker = Omit<MapMarkerRecord, 'latitude' | 'longitude'> & {
  latitude: unknown;
  longitude: unknown;
};

const YMD = /^\d{8}$/;

export function toFiniteCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function normalizeMarkerDateInput(raw: string): string {
  return raw.replaceAll('-', '').trim();
}

export function markerStartDates(
  marker: Pick<MapMarkerRecord, 'race_date' | 'race_dates'>,
): string[] {
  const fromList = Array.isArray(marker.race_dates)
    ? marker.race_dates
        .map((entry) => (typeof entry === 'string' ? entry.replaceAll('-', '').trim() : ''))
        .filter((entry) => YMD.test(entry))
    : [];
  if (fromList.length > 0) return fromList;

  const single = typeof marker.race_date === 'string' ? marker.race_date.replaceAll('-', '').trim() : '';
  return YMD.test(single) ? [single] : [];
}

export function markerMatchesDateRange(
  marker: Pick<MapMarkerRecord, 'race_date' | 'race_dates'>,
  dateFrom: string,
  dateTo: string,
): boolean {
  const fromYmd = dateFrom ? normalizeMarkerDateInput(dateFrom) : '';
  const toYmd = dateTo ? normalizeMarkerDateInput(dateTo) : '';
  if (!fromYmd && !toYmd) return true;

  const dates = markerStartDates(marker);
  if (dates.length === 0) return false;

  return dates.some((value) => {
    if (fromYmd && value < fromYmd) return false;
    if (toYmd && value > toYmd) return false;
    return true;
  });
}

export function markerMatchesMonth(
  marker: Pick<MapMarkerRecord, 'race_date' | 'race_dates'>,
  month: string,
): boolean {
  if (month === 'all') return true;
  const needle = month.padStart(2, '0');
  return markerStartDates(marker).some((value) => value.slice(4, 6) === needle);
}

export function relevantMarkerDate(
  marker: Pick<MapMarkerRecord, 'race_date' | 'race_dates'>,
  dateFrom: string,
  dateTo: string,
): string | null {
  const fromYmd = dateFrom ? normalizeMarkerDateInput(dateFrom) : '';
  const toYmd = dateTo ? normalizeMarkerDateInput(dateTo) : '';
  const dates = markerStartDates(marker);
  const inWindow = dates.find((value) => {
    if (fromYmd && value < fromYmd) return false;
    if (toYmd && value > toYmd) return false;
    return true;
  });
  return inWindow ?? dates[0] ?? null;
}

export function normalizeMapMarker(raw: RawMapMarker): MapMarkerRecord | null {
  const latitude = toFiniteCoord(raw.latitude);
  const longitude = toFiniteCoord(raw.longitude);
  if (latitude == null || longitude == null) return null;
  return {
    ...raw,
    latitude,
    longitude,
    race_dates: markerStartDates(raw),
  };
}
