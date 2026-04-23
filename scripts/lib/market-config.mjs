import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export function getActiveMarketCode() {
  return (process.env.MARKET_CODE || 'se').trim().toLowerCase();
}

export function resolveCountriesRoot(repoRoot) {
  const configured = process.env.MARKET_DATA_ROOT?.trim();
  if (!configured) return path.join(repoRoot, 'data', 'countries');

  const expanded = path.resolve(configured);
  const activeMarket = getActiveMarketCode();
  if (fs.existsSync(path.join(expanded, activeMarket, 'index.yaml'))) {
    return expanded;
  }

  const nested = path.join(expanded, 'data', 'countries');
  if (fs.existsSync(path.join(nested, activeMarket, 'index.yaml'))) {
    return nested;
  }

  return path.join(repoRoot, 'data', 'countries');
}

export function resolveCountryArg(value) {
  return (value || getActiveMarketCode()).trim().toLowerCase();
}

export function getNativeLocaleForCountry(repoRoot, countryCode) {
  const countriesRoot = resolveCountriesRoot(repoRoot);
  const indexPath = path.join(countriesRoot, countryCode, 'index.yaml');
  if (!fs.existsSync(indexPath)) return countryCode;

  try {
    const raw = yaml.load(fs.readFileSync(indexPath, 'utf8'));
    const locale = String(raw?.country_language_code ?? countryCode).trim().toLowerCase();
    return locale || countryCode;
  } catch {
    return countryCode;
  }
}
