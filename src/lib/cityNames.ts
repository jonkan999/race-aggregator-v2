export function normalizeCityName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('oe', 'o')
    .replaceAll('ae', 'a')
    .replaceAll('aa', 'a')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function cityNamesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeCityName(left);
  const normalizedRight = normalizeCityName(right);
  return Boolean(normalizedLeft) && normalizedLeft === normalizedRight;
}
