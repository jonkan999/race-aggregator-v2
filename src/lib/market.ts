import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MARKET_CODE = 'se';

function normalizeCountryCode(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function getActiveMarketCode(): string {
  return normalizeCountryCode(process.env.MARKET_CODE) || DEFAULT_MARKET_CODE;
}

export function resolveMarketDataRoot(defaultCountriesDir: string): string {
  const configured = process.env.MARKET_DATA_ROOT?.trim();
  if (!configured) return defaultCountriesDir;

  const expanded = path.resolve(configured);
  if (fs.existsSync(path.join(expanded, getActiveMarketCode(), 'index.yaml'))) {
    return expanded;
  }

  const nested = path.join(expanded, 'data', 'countries');
  if (fs.existsSync(path.join(nested, getActiveMarketCode(), 'index.yaml'))) {
    return nested;
  }

  return defaultCountriesDir;
}

export function getMarketLocalePrefix(countryCode: string, locale: 'native' | 'en'): string {
  return locale === 'en' ? '/en/' : '/';
}
