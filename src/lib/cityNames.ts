import { transliterateForSlug } from './slugifyShared.js';

export function normalizeCityName(value: string): string {
  const normalized = transliterateForSlug(value, '')
    .trim()
    .toLowerCase()
    .replaceAll('oe', 'o')
    .replaceAll('ae', 'a')
    .replaceAll('aa', 'a')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return normalized;
}

export function cityNamesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeCityName(left);
  const normalizedRight = normalizeCityName(right);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}
