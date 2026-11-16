// Geocoded locations end in the country's English name ("Hamar, Innlandet, Norway").
// On a market's own races that suffix is redundant and English on native pages, so drop it.
// Neighbouring-market races keep their country.
// Each list: English name first, then native / host-language spellings seen in data
// (native pages may localize the suffix, e.g. "Valmiera, Latvija").
const COUNTRY_NAMES = {
  bg: ['Bulgaria', 'България'],
  cz: ['Czech Republic', 'Czechia', 'Česko', 'Česká republika'],
  de: ['Germany', 'Deutschland'],
  dk: ['Denmark', 'Danmark', 'Dānija'],
  ee: ['Estonia', 'Eesti', 'Igaunija'],
  fi: ['Finland', 'Suomi', 'Somija'],
  gr: ['Greece', 'Ελλάδα'],
  hu: ['Hungary', 'Magyarország'],
  lt: ['Lithuania', 'Lietuva'],
  lv: ['Latvia', 'Latvija'],
  nl: ['Netherlands', 'The Netherlands', 'Nederland'],
  no: ['Norway', 'Norge', 'Noreg'],
  pl: ['Poland', 'Polska', 'Polija'],
  ro: ['Romania', 'România'],
  rs: ['Serbia', 'Srbija', 'Србија'],
  se: ['Sweden', 'Sverige', 'Zviedrija'],
  sk: ['Slovakia', 'Slovensko'],
};

/**
 * @param {string} location
 * @param {string} marketCode market the page belongs to
 * @param {string} [originCode] race's own country; defaults to the market
 */
export function stripDomesticCountry(location, marketCode, originCode) {
  const text = typeof location === 'string' ? location.trim() : '';
  const market = String(marketCode || '').trim().toLowerCase();
  const origin = String(originCode || market).trim().toLowerCase();
  if (!text || !market || origin !== market) return text;
  const names = (COUNTRY_NAMES[market] || []).map((n) => n.toLowerCase());
  const parts = text.split(',').map((p) => p.trim());
  if (parts.length < 2) return text;
  const last = parts[parts.length - 1].replace(/^\d{3,6}\s+/, '').toLowerCase();
  if (!names.includes(last)) return text;
  return parts.slice(0, -1).join(', ');
}

const ENGLISH_BY_NAME = new Map(
  Object.values(COUNTRY_NAMES).flatMap((names) => names.map((n) => [n.toLowerCase(), names[0]])),
);

/**
 * English pages render payload locations, which may end in a native country name
 * ("Riga, Latvija"). Swap a known trailing country name for its English form.
 * @param {string} location
 */
export function englishCountrySuffix(location) {
  const text = typeof location === 'string' ? location.trim() : '';
  if (!text) return text;
  const parts = text.split(',');
  const last = parts[parts.length - 1].trim();
  const english = ENGLISH_BY_NAME.get(last.toLowerCase());
  if (!english || english === last) return text;
  parts[parts.length - 1] = parts.length > 1 ? ` ${english}` : english;
  return parts.join(',');
}

/**
 * Location text for a route locale: English pages get English country names.
 * @param {string} location
 * @param {'native' | 'en' | string} locale
 */
export function locationForLocale(location, locale) {
  const text = typeof location === 'string' ? location.trim() : '';
  return locale === 'en' ? englishCountrySuffix(text) : text;
}
