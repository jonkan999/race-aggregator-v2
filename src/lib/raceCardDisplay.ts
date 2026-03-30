/** Helpers for legacy-style race card rendering (no user-facing copy). */

export function normalizeRaceImageUrl(url: string | null | undefined): string {
  const raw = url?.trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (
      parsed.hostname === 'firebasestorage.googleapis.com' &&
      parsed.pathname.startsWith('/v0/b/')
    ) {
      const parts = parsed.pathname.split('/');
      const bucket = parts[3] ?? '';
      const objectPath = parsed.searchParams.get('name')
        ? parsed.searchParams.get('name')!
        : decodeURIComponent(parts.slice(5).join('/'));
      if (bucket && objectPath) {
        return `https://storage.googleapis.com/${bucket}/${objectPath}?v=1`;
      }
    }

    if (parsed.hostname === 'storage.googleapis.com' && !parsed.searchParams.has('v')) {
      parsed.searchParams.set('v', '1');
      return parsed.toString();
    }
  } catch {
    return raw;
  }

  return raw;
}

export function primaryRaceImageUrl(payload: Record<string, unknown> | null | undefined): string | null {
  const suppliedImages = payload?.supplied_images;
  const hasSuppliedImages =
    suppliedImages === true ||
    (Array.isArray(suppliedImages) && suppliedImages.length > 0);
  if (!hasSuppliedImages) return null;

  const images = payload?.images;
  if (!Array.isArray(images)) return null;

  const first = images.find((item) => {
    if (!item || typeof item !== 'object') return false;
    const candidate = item as { firebase_url?: unknown; url?: unknown };
    return (
      (typeof candidate.firebase_url === 'string' && candidate.firebase_url.trim()) ||
      (typeof candidate.url === 'string' && candidate.url.trim())
    );
  }) as { firebase_url?: string; url?: string } | undefined;

  const raw = first?.firebase_url?.trim() || first?.url?.trim() || '';
  return raw ? normalizeRaceImageUrl(raw) : null;
}

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
