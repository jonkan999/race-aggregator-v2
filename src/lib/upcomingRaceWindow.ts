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

function normalizeComparableDate(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const normalized = raw.replaceAll('-', '').trim();
  return /^\d{8}$/.test(normalized) ? normalized : null;
}

export function comparableRaceDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((entry) => {
      if (!Array.isArray(entry)) return [];
      const start = entry[0];
      return typeof start === 'string' && /^\d{8}$/.test(start) ? [start] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

export function firstComparableRaceDate(raw: unknown): string | null {
  return comparableRaceDates(raw)[0] ?? null;
}

export function nextRaceDateWithinBounds(
  raw: unknown,
  startComparable?: string | null,
  endComparable?: string | null,
): string | null {
  const normalizedStart = normalizeComparableDate(startComparable);
  const normalizedEnd = normalizeComparableDate(endComparable);

  return (
    comparableRaceDates(raw).find((candidate) => {
      if (normalizedStart && candidate < normalizedStart) return false;
      if (normalizedEnd && candidate > normalizedEnd) return false;
      return true;
    }) ?? null
  );
}

export function relevantRaceDate(
  raw: unknown,
  startComparable?: string | null,
  endComparable?: string | null,
): string | null {
  const bounded = nextRaceDateWithinBounds(raw, startComparable, endComparable);
  if (bounded) return bounded;

  if (normalizeComparableDate(startComparable) || normalizeComparableDate(endComparable)) {
    return null;
  }

  return firstComparableRaceDate(raw);
}

export function nextUpcomingRaceDateWithinWindow(
  raw: unknown,
  startComparable = upcomingWindowStart(),
  endComparable = upcomingWindowEnd(),
): string | null {
  return nextRaceDateWithinBounds(raw, startComparable, endComparable);
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

export function compareRaceRowsByRelevantDate(
  left: Pick<RaceListRow, 'domain_name' | 'race_dates'>,
  right: Pick<RaceListRow, 'domain_name' | 'race_dates'>,
  startComparable?: string | null,
  endComparable?: string | null,
): number {
  const leftDate = relevantRaceDate(left.race_dates, startComparable, endComparable);
  const rightDate = relevantRaceDate(right.race_dates, startComparable, endComparable);

  if (leftDate && rightDate) {
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
  } else if (leftDate) {
    return -1;
  } else if (rightDate) {
    return 1;
  }

  return left.domain_name.localeCompare(right.domain_name, 'sv');
}
