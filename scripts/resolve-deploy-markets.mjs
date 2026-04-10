#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const configPath = path.join(repoRoot, 'config', 'deploy-markets.json');
const PLACEHOLDER_PATTERN = /(replace_with|replace-me|todo|example)/i;

function readConfig() {
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);
  const markets = Array.isArray(parsed?.markets) ? parsed.markets : null;

  if (!markets) {
    throw new Error(`Expected "markets" array in ${path.relative(repoRoot, configPath)}`);
  }

  return markets;
}

function parseRequestedMarket(argv) {
  const arg = argv.find((entry) => entry.startsWith('--market='));
  const value = arg ? arg.slice('--market='.length) : process.env.DEPLOY_MARKET_CODE ?? '';
  const normalized = value.trim().toLowerCase();
  return normalized === 'all' ? '' : normalized;
}

function normalizeMarket(entry) {
  const marketCode = String(entry?.marketCode ?? '').trim().toLowerCase();
  if (!marketCode) {
    throw new Error(`Each deploy target needs a non-empty marketCode in ${path.relative(repoRoot, configPath)}`);
  }

  return {
    marketCode,
    displayName: String(entry?.displayName ?? marketCode.toUpperCase()).trim() || marketCode.toUpperCase(),
    enabled: entry?.enabled !== false,
    vercelProjectId: String(entry?.vercelProjectId ?? '').trim(),
    productionDomain: String(entry?.productionDomain ?? '').trim(),
  };
}

function ensureUniqueMarketCodes(markets) {
  const seen = new Set();
  for (const market of markets) {
    if (seen.has(market.marketCode)) {
      throw new Error(`Duplicate marketCode "${market.marketCode}" in ${path.relative(repoRoot, configPath)}`);
    }
    seen.add(market.marketCode);
  }
}

function serializeMatrix(markets) {
  return JSON.stringify({
    include: markets.map((market) => ({
      ...market,
      configured:
        market.vercelProjectId.length > 0 && !PLACEHOLDER_PATTERN.test(market.vercelProjectId),
    })),
  });
}

function writeGithubOutput(matrix, selectedMarketCodes) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;

  fs.appendFileSync(outputPath, `matrix=${matrix}\n`, 'utf8');
  fs.appendFileSync(outputPath, `selected_market_codes=${selectedMarketCodes.join(',')}\n`, 'utf8');
}

function main() {
  const requestedMarket = parseRequestedMarket(process.argv.slice(2));
  const configuredMarkets = readConfig().map(normalizeMarket);
  ensureUniqueMarketCodes(configuredMarkets);

  const enabledMarkets = configuredMarkets.filter((market) => market.enabled);
  if (enabledMarkets.length === 0) {
    throw new Error(`No enabled markets found in ${path.relative(repoRoot, configPath)}`);
  }

  let selectedMarkets = enabledMarkets;
  if (requestedMarket) {
    selectedMarkets = enabledMarkets.filter((market) => market.marketCode === requestedMarket);
    if (selectedMarkets.length === 0) {
      throw new Error(
        `Requested market "${requestedMarket}" is not enabled in ${path.relative(repoRoot, configPath)}`,
      );
    }
  }

  const matrix = serializeMatrix(selectedMarkets);
  writeGithubOutput(
    matrix,
    selectedMarkets.map((market) => market.marketCode),
  );
  process.stdout.write(`${matrix}\n`);
}

main();
