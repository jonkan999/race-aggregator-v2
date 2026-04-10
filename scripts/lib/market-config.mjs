import fs from 'node:fs';
import path from 'node:path';

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
