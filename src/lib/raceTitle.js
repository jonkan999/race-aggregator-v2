// SEO title of a race page: "{name} {year}, {city}". Pure JS so node --test can import it.

const YEAR_MIN = 2015;
const YEAR_MAX = 2039;
const RANGE = /\b(20[1-3]\d)\s*[/\u2013-]\s*(20[1-3]\d|\d{2})\b/g;
const SINGLE = /\b(20[1-3]\d)\b/g;

function foldText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function isYear(value) {
  const year = Number(value);
  return year >= YEAR_MIN && year <= YEAR_MAX;
}

function yearsIn(text) {
  const years = new Set();
  for (const match of String(text).matchAll(RANGE)) {
    years.add(Number(match[1]));
    const end = match[2].length === 2 ? Math.floor(Number(match[1]) / 100) * 100 + Number(match[2]) : Number(match[2]);
    years.add(end);
  }
  for (const match of String(text).matchAll(SINGLE)) years.add(Number(match[1]));
  return [...years].filter(isYear);
}

/** Remove year tokens (and their wrapping brackets / dangling separators) from a race name. */
export function stripYears(name) {
  let text = String(name ?? '');
  text = text.replace(/\s*[([{]\s*(?:20[1-3]\d(?:\s*[/\u2013-]\s*(?:20[1-3]\d|\d{2}))?)\s*[)\]}]/g, '');
  text = text.replace(RANGE, ' ').replace(SINGLE, ' ');
  text = text.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1');
  text = text.replace(/^[\s\-\u2013\u2014|:,/]+|[\s\-\u2013\u2014|:,/]+$/g, '');
  return text.trim();
}

/** Year of the first start date (ISO `YYYY-MM-DD`), or null. */
export function startYearOf(startIso) {
  const match = String(startIso ?? '').match(/^(\d{4})-\d{2}-\d{2}/);
  return match ? Number(match[1]) : null;
}

const ADMIN_WORD =
  /\b(municipality|county|voivodeship|province|region|district|prefecture|oblast|canton|governorate|kommun|l\u00e4n|gmina|powiat|okres|kraj|landkreis|kreis|regierungsbezirk|rural district|state of|state)\b|(?:^|\s)jud\./i;
const ADMIN_NAMES = new Set(
  [
    'north rhine-westphalia', 'baden-wurttemberg', 'bavaria', 'hesse', 'lower saxony', 'saxony', 'saxony-anhalt',
    'thuringia', 'mecklenburg-western pomerania', 'rhineland-palatinate', 'schleswig-holstein',
    'north holland', 'south holland', 'gelderland', 'overijssel', 'drenthe', 'friesland', 'flevoland',
    'north brabant', 'central denmark region', 'capital region of denmark', 'zealand', 'southern denmark',
    'north denmark region', 'lesser poland', 'greater poland', 'masovia', 'silesia', 'lubusz', 'podlachia', 'subcarpathia',
    'warmia-masuria', 'west pomerania', 'kuyavia-pomerania',
    // Swedish regions that are not also city names
    'västra götaland', 'norrbotten', 'västerbotten', 'jämtland', 'dalarna', 'gävleborg', 'västernorrland',
    'värmland', 'södermanland', 'östergötland', 'skåne', 'halland', 'blekinge', 'gotland', 'kronoberg', 'västmanland',
  ].map(foldText),
);

function looksLikeStreet(part) {
  return /\s\d+[a-z]?(?:[-/]\d+[a-z]?)?$/i.test(part) || /^\d+[a-z]?\s+\S/.test(part) || /^\d+$/.test(part);
}

function stripPostalCode(part) {
  return part
    .replace(/^(?:[A-Z]{1,2}-)?\d{2,5}(?:[ -]\d{2,3})?(?:\s?[A-Z]{2})?\s+(?=\S)/, '')
    .replace(/\s+(?:[A-Z]{1,2}-)?\d{2,5}(?:[ -]\d{2,3})?$/, '')
    .trim();
}

/**
 * City from a Google-style formatted address ("venue, street, city, region, Country").
 * Drops the country, admin areas, street lines and postal codes; returns the last remaining part.
 */
export function extractCity(location, { countryNames = [], adminNames = [] } = {}) {
  const parts = String(location ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  const countries = new Set(countryNames.map(foldText).filter(Boolean));
  const admins = new Set([...ADMIN_NAMES, ...adminNames.map(foldText).filter(Boolean)]);
  if (parts.length > 1 && countries.has(foldText(parts[parts.length - 1]))) parts.pop();
  const cleaned = parts
    .map((part) => (/^(?:[A-Z]{1,2}-)?\d{2,5}(?:[ -]\d{2,3})?(?:\s?[A-Z]{2})?\s+\S/.test(part) && !/^\d{1,3}[a-z]?\s+\D+\s*\d*$/i.test(part) ? stripPostalCode(part) : part))
    .filter((part) => !looksLikeStreet(part))
    .map(stripPostalCode)
    .filter((part) => part && !/^\d+$/.test(part));
  const adminList = [...admins];
  const isAdmin = (part) => {
    const folded = foldText(part);
    // "Jihocesky" is the adjective form of the region "Jihocesky kraj".
    return ADMIN_WORD.test(part) || admins.has(folded) || adminList.some((name) => name.startsWith(`${folded} `));
  };
  const notAdmin = cleaned.filter((part) => !isAdmin(part));
  const unlabeled = cleaned.filter((part) => !ADMIN_WORD.test(part));
  const pool = notAdmin.length > 0 ? notAdmin : unlabeled;
  const city = pool.length > 0 ? pool[pool.length - 1] : '';
  if (countries.has(foldText(city))) return '';
  return city.length > 0 && city.length <= 40 ? city : '';
}

/** Accent-insensitive; tolerates inflected names ("Mikołajkach" mentions "Mikołajki"). */
function nameMentionsCity(name, city) {
  const foldedName = foldText(name);
  const foldedCity = foldText(city);
  if (!foldedCity) return true;
  if (foldedName.includes(foldedCity)) return true;
  const stem = foldedCity.length >= 6 ? foldedCity.slice(0, -2) : foldedCity;
  return foldedName.includes(stem);
}

/**
 * "{name} {year}, {city}". A stale year in the name (different from the start year) is removed;
 * the year is not repeated when the name already carries the start year. The city is skipped when
 * the name already contains it.
 */
export function buildRaceTitle({ name, startIso, city }) {
  const rawName = String(name ?? '').trim();
  if (!rawName) return rawName;
  const startYear = startYearOf(startIso);
  let base = rawName;
  let year = startYear;
  if (startYear) {
    const present = yearsIn(rawName);
    if (present.includes(startYear)) {
      year = null;
    } else if (present.length > 0) {
      base = stripYears(rawName) || rawName;
    }
  }
  let title = year ? `${base} ${year}` : base;
  const cityText = String(city ?? '').trim();
  if (cityText && !nameMentionsCity(base, cityText)) title = `${title}, ${cityText}`;
  return title;
}
