import type { RaceListRow } from './raceListRow';

function comparableYyyymmdd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function upcomingWindowStart(now = new Date()): string {
  return comparableYyyymmdd(now);
}

export function upcomingWindowEnd(now = new Date(), days = 365): string {
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  return comparableYyyymmdd(end);
}

export function comparableRaceDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!Array.isArray(entry)) return [];
    const start = entry[0];
    return typeof start === 'string' && /^\d{8}$/.test(start) ? [start] : [];
  });
}

export function nextUpcomingRaceDateWithinWindow(
  raw: unknown,
  startComparable = upcomingWindowStart(),
  endComparable = upcomingWindowEnd(),
): string | null {
  return (
    comparableRaceDates(raw).find(
      (candidate) => candidate >= startComparable && candidate <= endComparable,
    ) ?? null
  );
}

export function rowHasUpcomingRaceWithinWindow(
  row: RaceListRow,
  startComparable = upcomingWindowStart(),
  endComparable = upcomingWindowEnd(),
): boolean {
  return Boolean(nextUpcomingRaceDateWithinWindow(row.race_dates, startComparable, endComparable));
}

export function filterRowsToUpcomingWindow(
  rows: RaceListRow[],
  startComparable = upcomingWindowStart(),
  endComparable = upcomingWindowEnd(),
): RaceListRow[] {
  return rows.filter((row) => rowHasUpcomingRaceWithinWindow(row, startComparable, endComparable));
}
