/**
 * Build distance / type filter chips from YAML `category_mapping` (legacy shape).
 */
export type CategoryFilterOption =
  | { label: string; kind: 'distance'; minKm: number; maxKm: number }
  | { label: string; kind: 'type'; raceType: string };

export function categoryFilterOptionsFromYaml(raw: unknown): CategoryFilterOption[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: CategoryFilterOption[] = [];
  for (const [label, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') {
      out.push({ label, kind: 'type', raceType: v });
      continue;
    }
    if (v && typeof v === 'object' && 'range' in v) {
      const r = (v as { range?: unknown }).range;
      if (Array.isArray(r) && r.length >= 2 && typeof r[0] === 'number' && typeof r[1] === 'number') {
        out.push({ label, kind: 'distance', minKm: r[0], maxKm: r[1] });
      }
    }
  }
  return out;
}
