import type { IndexYaml } from './content';
import { slugify } from './content';

export function deriveSiteIdentity(
  content: IndexYaml,
  countryCode: string,
): { siteKey: string; siteName: string } {
  const siteName = String(content.page_name ?? countryCode).trim() || countryCode.toUpperCase();
  const baseUrl = String(content.base_url ?? '');
  let siteKey = slugify(siteName, countryCode);

  try {
    siteKey = new URL(baseUrl).hostname.replace(/^www\./, '') || siteKey;
  } catch {
    // Fall back to the YAML-driven site name when base_url is missing or invalid.
  }

  return {
    siteKey,
    siteName,
  };
}
