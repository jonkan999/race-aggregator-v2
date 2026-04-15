/**
 * Build distance / type filter chips from YAML `category_mapping` (legacy shape).
 */
export type CategoryFilterOption =
  | { key: string; label: string; kind: 'distance'; minKm: number; maxKm: number }
  | { key: string; label: string; kind: 'type'; raceType: string };

function normalizeCategoryKeyToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function categoryKeyFromLabel(
  label: string,
  verboseLocalDistanceMapping?: Record<string, unknown>,
): string {
  const normalized = normalizeCategoryKeyToken(label);
  if (verboseLocalDistanceMapping && typeof verboseLocalDistanceMapping === 'object') {
    for (const [canonicalLabel, localLabel] of Object.entries(verboseLocalDistanceMapping)) {
      if (canonicalLabel === 'fallback' || typeof localLabel !== 'string') continue;
      if (normalizeCategoryKeyToken(localLabel) === normalized) {
        return normalizeCategoryKeyToken(canonicalLabel);
      }
    }
  }
  return normalized;
}

export function categoryFilterOptionsFromYaml(
  raw: unknown,
  verboseLocalDistanceMapping?: Record<string, unknown>,
): CategoryFilterOption[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: CategoryFilterOption[] = [];
  for (const [label, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') {
      out.push({
        key: normalizeCategoryKeyToken(v),
        label,
        kind: 'type',
        raceType: v,
      });
      continue;
    }
    if (v && typeof v === 'object' && 'range' in v) {
      const r = (v as { range?: unknown }).range;
      if (Array.isArray(r) && r.length >= 2 && typeof r[0] === 'number' && typeof r[1] === 'number') {
        out.push({
          key: categoryKeyFromLabel(label, verboseLocalDistanceMapping),
          label,
          kind: 'distance',
          minKm: r[0],
          maxKm: r[1],
        });
      }
    }
  }
  return out;
}
