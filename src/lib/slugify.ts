/**
 * Mirrors legacy Python slugify (jinja_functions.slugify) for URL segments.
 */
export function slugify(input: string, countryCode: string): string {
  let s = input.toLowerCase();

  const cc = countryCode.toLowerCase();
  if (cc === 'se') {
    s = s.replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o');
  } else if (cc === 'no' || cc === 'dk') {
    s = s.replace(/å/g, 'a').replace(/æ/g, 'a').replace(/ø/g, 'o');
  } else if (cc === 'fi') {
    s = s.replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o');
  } else if (cc === 'de') {
    s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  }

  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.replace(/[^a-z0-9\s-]/g, '');
  s = s.replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');

  return s;
}
