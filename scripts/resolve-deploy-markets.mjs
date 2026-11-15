#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { filterConfigsForMarket } from './merge-vercel-redirects.mjs';

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

function parseArg(argv, name) {
  const prefix = `--${name}=`;
  const arg = argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : '';
}

// Market data that only the market's own build reads. config/redirects/*.json changes are
// scoped to the markets whose filtered redirects changed. Everything else (code, config,
// workflow, shared data, and each market's index.yaml / merged_index_int.yaml, which other
// markets read for neighbor labels, list slugs and language links) redeploys every market.
const MARKET_DATA_PATTERN = /^data\/countries\/([a-z]{2})\/(.+)$/;
const CROSS_MARKET_FILES = new Set(['index.yaml', 'merged_index_int.yaml']);
const REDIRECT_CONFIG_PATTERN = /^config\/redirects\/[^/]+\.json$/;
const NULL_SHA = /^0+$/;

function normalizeRedirectConfig(parsed, fallbackId) {
  if (parsed == null) return null;
  return {
    id: String(parsed.id ?? fallbackId),
    market: parsed.market ? String(parsed.market).toLowerCase() : '',
    redirects: Array.isArray(parsed.redirects) ? parsed.redirects : [],
    fallbackRoutes: Array.isArray(parsed.fallbackRoutes) ? parsed.fallbackRoutes : [],
  };
}

/**
 * Which markets' effective redirects differ between two versions of one
 * config/redirects/*.json file (null = file absent). merge-vercel-redirects.mjs gives
 * each market only its own entries, so a market whose filtered list is unchanged does
 * not need a redeploy. An untagged entry applies to every market, so it shows up as a
 * difference for all of them.
 */
export function redirectConfigAffectedMarkets(oldParsed, newParsed, enabledMarketCodes, id = 'redirects') {
  const before = normalizeRedirectConfig(oldParsed, id);
  const after = normalizeRedirectConfig(newParsed, id);
  const view = (config, code) => {
    if (!config) return '[]';
    const [filtered] = filterConfigsForMarket([config], code);
    return JSON.stringify(filtered ? [filtered.redirects, filtered.fallbackRoutes] : []);
  };
  return enabledMarketCodes.filter((code) => view(before, code) !== view(after, code));
}

/**
 * Decide which markets a push has to redeploy from the files it changed.
 * Returns { mode: 'changed', marketCodes, reason } when every changed file is
 * market-scoped data for an enabled market, otherwise { mode: 'all', reason }.
 * Any ambiguity (no files, unknown market, shared file) falls back to 'all'.
 */
export function classifyChangedFiles(changedFiles, enabledMarketCodes, resolveRedirectMarkets = null) {
  const files = (changedFiles ?? []).map((file) => String(file).trim()).filter(Boolean);
  if (files.length === 0) {
    return { mode: 'all', reason: 'no changed files detected' };
  }

  const enabled = new Set(enabledMarketCodes);
  const marketCodes = new Set();
  for (const file of files) {
    if (resolveRedirectMarkets && REDIRECT_CONFIG_PATTERN.test(file)) {
      let affected = null;
      try {
        affected = resolveRedirectMarkets(file);
      } catch {
        affected = null;
      }
      if (!Array.isArray(affected)) {
        return { mode: 'all', reason: `could not scope redirect change: ${file}` };
      }
      for (const code of affected) marketCodes.add(code);
      continue;
    }
    const match = MARKET_DATA_PATTERN.exec(file);
    if (!match) {
      return { mode: 'all', reason: `shared or code change: ${file}` };
    }
    const [, code, rest] = match;
    if (!enabled.has(code)) {
      return { mode: 'all', reason: `data for a non-deployed market: ${file}` };
    }
    if (CROSS_MARKET_FILES.has(rest)) {
      return { mode: 'all', reason: `cross-market content file: ${file}` };
    }
    marketCodes.add(code);
  }

  const ordered = enabledMarketCodes.filter((code) => marketCodes.has(code));
  if (ordered.length === 0) {
    return { mode: 'all', reason: 'changed files map to no market' };
  }
  return { mode: 'changed', marketCodes: ordered, reason: `market data only: ${ordered.join(',')}` };
}

function listChangedFiles(baseSha, headSha) {
  if (!baseSha || !headSha || NULL_SHA.test(baseSha)) {
    throw new Error('missing push base or head SHA');
  }
  const output = execFileSync(
    'git',
    ['diff', '--name-only', '--no-renames', `${baseSha}`, `${headSha}`],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return output.split('\n').map((line) => line.trim()).filter(Boolean);
}

function readJsonAtRevision(revision, file) {
  let raw;
  try {
    raw = execFileSync('git', ['show', `${revision}:${file}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    // Missing at this revision (added or deleted file) is fine; anything else is not.
    if (/does not exist|exists on disk, but not in/.test(String(error.stderr ?? ''))) return null;
    throw error;
  }
  return JSON.parse(raw);
}

function gitRedirectResolver(baseSha, headSha, enabledMarketCodes) {
  return (file) =>
    redirectConfigAffectedMarkets(
      readJsonAtRevision(baseSha, file),
      readJsonAtRevision(headSha, file),
      enabledMarketCodes,
      path.basename(file, '.json'),
    );
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

function writeGithubOutput(matrix, selectedMarketCodes, reason) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    fs.appendFileSync(outputPath, `matrix=${matrix}\n`, 'utf8');
    fs.appendFileSync(outputPath, `selected_market_codes=${selectedMarketCodes.join(',')}\n`, 'utf8');
  }
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    fs.appendFileSync(
      summaryPath,
      `### Deploy selection\n\nMarkets: ${selectedMarketCodes.join(', ')}\n\nReason: ${reason}\n`,
      'utf8',
    );
  }
}

function main() {
  const argv = process.argv.slice(2);
  const requestedMarket = parseRequestedMarket(argv);
  const configuredMarkets = readConfig().map(normalizeMarket);
  ensureUniqueMarketCodes(configuredMarkets);

  const enabledMarkets = configuredMarkets.filter((market) => market.enabled);
  if (enabledMarkets.length === 0) {
    throw new Error(`No enabled markets found in ${path.relative(repoRoot, configPath)}`);
  }

  let selectedMarkets = enabledMarkets;
  let reason = 'all enabled markets';
  const eventName = parseArg(argv, 'event') || process.env.GITHUB_EVENT_NAME || '';
  if (requestedMarket) {
    reason = `requested market ${requestedMarket}`;
    selectedMarkets = enabledMarkets.filter((market) => market.marketCode === requestedMarket);
    if (selectedMarkets.length === 0) {
      throw new Error(
        `Requested market "${requestedMarket}" is not enabled in ${path.relative(repoRoot, configPath)}`,
      );
    }
  } else if (eventName === 'push') {
    const enabledCodes = enabledMarkets.map((market) => market.marketCode);
    let decision;
    try {
      const baseSha = parseArg(argv, 'base');
      const headSha = parseArg(argv, 'head');
      const changedFiles = listChangedFiles(baseSha, headSha);
      decision = classifyChangedFiles(
        changedFiles,
        enabledCodes,
        gitRedirectResolver(baseSha, headSha, enabledCodes),
      );
    } catch (error) {
      decision = { mode: 'all', reason: `change detection failed (${error.message.split('\n')[0]})` };
    }
    reason = `push: ${decision.reason}`;
    if (decision.mode === 'changed' && decision.marketCodes.length > 0) {
      const wanted = new Set(decision.marketCodes);
      selectedMarkets = enabledMarkets.filter((market) => wanted.has(market.marketCode));
    }
  } else if (eventName) {
    reason = `${eventName}: all enabled markets`;
  }

  const matrix = serializeMatrix(selectedMarkets);
  const selectedCodes = selectedMarkets.map((market) => market.marketCode);
  writeGithubOutput(matrix, selectedCodes, reason);
  process.stderr.write(`Deploy selection: ${selectedCodes.join(',')} (${reason})\n`);
  process.stdout.write(`${matrix}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
