/**
 * Mirrors legacy Python slugify (jinja_functions.slugify) for URL segments.
 */
import { transliterateForSlug } from './slugifyShared.js';

export function slugify(input: string, countryCode: string): string {
  let s = transliterateForSlug(input, countryCode);
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.replace(/[^a-z0-9\s-]/g, '');
  s = s.replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');

  return s;
}
