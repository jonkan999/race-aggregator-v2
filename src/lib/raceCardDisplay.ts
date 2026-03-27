/** Helpers for legacy-style race card rendering (no user-facing copy). */

export function excerptDescription(text: string | null | undefined, maxLen = 140): string {
  if (!text?.trim()) return '';
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen).trimEnd()}…`;
}

/** Map a single distance phrase (legacy Jinja `map_verbose_distance`). */
export function formatDistanceSegment(
  segment: string,
  mapping: Record<string, string> | undefined,
): string {
  const normalized = segment.trim();
  if (!mapping || !normalized) return segment;
  const key = normalized.toLowerCase();
  for (const [from, to] of Object.entries(mapping)) {
    if (from === 'fallback') continue;
    if (key === from.toLowerCase()) return to;
  }
  return normalized;
}

export function splitDistanceVerbose(verbose: string | null | undefined): string[] {
  if (!verbose?.trim()) return [];
  return verbose
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
