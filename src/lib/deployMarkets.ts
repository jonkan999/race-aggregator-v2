import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../config/deploy-markets.json',
);

export type DeployMarket = {
  marketCode: string;
  displayName: string;
  enabled: boolean;
  productionDomain: string;
};

type DeployMarketEntry = {
  marketCode?: string;
  displayName?: string;
  enabled?: boolean;
  productionDomain?: string;
};

type DeployMarketsFile = {
  markets?: DeployMarketEntry[];
};

let cachedMarkets: DeployMarket[] | null = null;

function normalizeMarket(entry: DeployMarketEntry): DeployMarket | null {
  const marketCode = String(entry.marketCode ?? '').trim().toLowerCase();
  if (!marketCode) return null;
  return {
    marketCode,
    displayName: String(entry.displayName ?? marketCode.toUpperCase()).trim() || marketCode.toUpperCase(),
    enabled: entry.enabled !== false,
    productionDomain: String(entry.productionDomain ?? '')
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, ''),
  };
}

export function listDeployMarkets(): DeployMarket[] {
  if (cachedMarkets) return cachedMarkets;
  const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as DeployMarketsFile;
  cachedMarkets = (parsed.markets ?? [])
    .map((entry) => normalizeMarket(entry))
    .filter((entry): entry is DeployMarket => entry !== null);
  return cachedMarkets;
}

export function listEnabledDeployMarkets(): DeployMarket[] {
  return listDeployMarkets().filter((market) => market.enabled && market.productionDomain);
}

export function getEnabledDeployMarket(marketCode: string): DeployMarket | null {
  const code = marketCode.trim().toLowerCase();
  return listEnabledDeployMarkets().find((market) => market.marketCode === code) ?? null;
}

export function getDeployMarketProductionBaseUrl(marketCode: string): string | null {
  const market = getEnabledDeployMarket(marketCode);
  if (!market?.productionDomain) return null;
  return `https://${market.productionDomain}`;
}
