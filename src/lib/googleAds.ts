import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getActiveMarketCode } from './market';

const CONFIG_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../config/deploy-markets.json',
);

export type GoogleAdsConfig = {
  enabled: boolean;
  client: string | null;
  publisherId: string | null;
};

type DeployMarketEntry = {
  marketCode?: string;
  googleAdsEnabled?: boolean;
  googleAdsClient?: string;
};

type DeployMarketsFile = {
  googleAdsClient?: string;
  markets?: DeployMarketEntry[];
};

let cachedFile: DeployMarketsFile | null = null;

function normalizeClient(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  return trimmed.startsWith('ca-pub-') || trimmed.startsWith('pub-') ? trimmed : '';
}

function toPublisherId(client: string): string {
  return client.replace(/^ca-/, '');
}

function loadDeployMarketsFile(): DeployMarketsFile {
  if (cachedFile) return cachedFile;
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  cachedFile = JSON.parse(raw) as DeployMarketsFile;
  return cachedFile;
}

export function getGoogleAdsConfig(marketCode = getActiveMarketCode()): GoogleAdsConfig {
  const config = loadDeployMarketsFile();
  const normalizedCode = marketCode.trim().toLowerCase();
  const market = (config.markets ?? []).find(
    (entry) => String(entry.marketCode ?? '').trim().toLowerCase() === normalizedCode,
  );

  const enabled = market?.googleAdsEnabled === true;
  const client = normalizeClient(
    process.env.PUBLIC_ADSENSE_CLIENT || market?.googleAdsClient || config.googleAdsClient || '',
  );

  if (!enabled || !client) {
    return { enabled: false, client: null, publisherId: null };
  }

  return {
    enabled: true,
    client: client.startsWith('ca-') ? client : `ca-${client}`,
    publisherId: toPublisherId(client.startsWith('ca-') ? client : `ca-${client}`),
  };
}
