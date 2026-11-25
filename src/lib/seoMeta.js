// Pure SEO helpers (plain JS so node --test can import them directly).

const MARKET_CURRENCY = {
  se: 'SEK', dk: 'DKK', pl: 'PLN', cz: 'CZK', hu: 'HUF', ro: 'RON', rs: 'RSD', no: 'NOK',
};

export function marketCurrency(countryCode) {
  return MARKET_CURRENCY[String(countryCode ?? '').toLowerCase()] ?? 'EUR';
}

/** First number in a free-text price ("350 kr", "€25,50", "Free" -> null). */
export function parsePriceAmount(text) {
  const match = String(text ?? '').replace(/\u00a0/g, ' ').match(/\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/);
  if (!match) return null;
  let raw = match[0];
  if (/^\d{1,3}([ .]\d{3})+$/.test(raw)) raw = raw.replace(/[ .]/g, '');
  const value = Number(raw.replace(/ /g, '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Truncate so the result is at most `max` chars (ellipsis included). Prefers to end on a full
 * sentence when one fits in the upper part of the budget, so the text is not cut mid-sentence;
 * otherwise cuts at a word boundary and adds an ellipsis.
 */
export function truncateAtWord(text, max = 160) {
  const value = clean(text);
  if (value.length <= max) return value;
  const window = value.slice(0, max);
  let sentenceEnd = -1;
  for (const match of window.matchAll(/[.!?…](?=\s|$)/g)) sentenceEnd = match.index;
  if (sentenceEnd >= max * 0.5) {
    const sentences = window.slice(0, sentenceEnd + 1);
    // Skip a "sentence end" that is really an abbreviation or a number ("5 km.", "Dr.", "1.").
    if (!/(?:^|\s)\S{1,3}\.$/.test(sentences) || /[!?…]$/.test(sentences)) return sentences;
  }
  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,.;:–-]+$/, '')}…`;
}

/**
 * Build a meta description of roughly 120–160 characters: start from the primary text,
 * append extra facts while it is too short, truncate at a word boundary when too long.
 */
export function fitMetaDescription(primary, extras = [], { min = 120, max = 160 } = {}) {
  let value = clean(primary);
  for (const extra of extras.map(clean).filter(Boolean)) {
    if (value.length >= min) break;
    if (value.toLowerCase().includes(extra.toLowerCase())) continue;
    value = value ? `${value.replace(/[.\s]+$/, '')}. ${extra}` : extra;
  }
  return truncateAtWord(value, max);
}

/** hreflang entries for a page with a native and an English variant. */
export function buildHreflangLinks({ locale, nativeLang, currentUrl, alternateUrl }) {
  if (!currentUrl) return [];
  if (!alternateUrl) return [{ hreflang: locale === 'en' ? 'en' : nativeLang, href: currentUrl }];
  const nativeUrl = locale === 'en' ? alternateUrl : currentUrl;
  const englishUrl = locale === 'en' ? currentUrl : alternateUrl;
  return [
    { hreflang: nativeLang, href: nativeUrl },
    { hreflang: 'en', href: englishUrl },
    { hreflang: 'x-default', href: nativeUrl },
  ];
}

/**
 * First number of a price range. Accepts short values only ("100–600 kr", "€ 12,50 tot € 15,-",
 * "300"); long free text ("400 kr for the marathon, 200 kr for the half ...") returns null.
 */
export function parsePriceRange(text) {
  const value = String(text ?? '').replace(/\u00a0/g, ' ').trim();
  if (!value || value.length > 40) return null;
  const numbers = [...value.matchAll(/\d{1,3}(?:[ .]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?/g)].map((match) => {
    let raw = match[0];
    if (/^\d{1,3}([ .]\d{3})+$/.test(raw)) raw = raw.replace(/[ .]/g, '');
    return Number(raw.replace(/ /g, '').replace(',', '.'));
  });
  const valid = numbers.filter((n) => Number.isFinite(n) && n > 0);
  if (valid.length === 0 || valid.length > 2) return null;
  const low = Math.min(...valid);
  const high = Math.max(...valid);
  return { low, high };
}
