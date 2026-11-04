// Geocoded locations end in the country's English name ("Hamar, Innlandet, Norway").
// On a market's own races that suffix is redundant and English on native pages, so drop it.
// Neighbouring-market races keep their country.
const COUNTRY_NAMES = {
  bg: ['Bulgaria', 'България'],
  cz: ['Czech Republic', 'Czechia', 'Česko', 'Česká republika'],
  de: ['Germany', 'Deutschland'],
  dk: ['Denmark', 'Danmark'],
  ee: ['Estonia', 'Eesti'],
  fi: ['Finland', 'Suomi'],
  gr: ['Greece', 'Ελλάδα'],
  hu: ['Hungary', 'Magyarország'],
  lt: ['Lithuania', 'Lietuva'],
  nl: ['Netherlands', 'The Netherlands', 'Nederland'],
  no: ['Norway', 'Norge', 'Noreg'],
  pl: ['Poland', 'Polska'],
  ro: ['Romania', 'România'],
  rs: ['Serbia', 'Srbija', 'Србија'],
  se: ['Sweden', 'Sverige'],
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
