#!/usr/bin/env node
/**
 * Copy one collector-owned market into data/countries/{code}/.
 *
 * Usage: node scripts/sync-collector-market.mjs lt
 *
 * Source resolution (first match wins):
 *   COLLECTOR_ROOT
 *   MARKET_DATA_ROOT (countries root or collector repo root)
 *   ../race-collector-v2
 *   /tmp/race-collector-v2
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destCountries = path.join(repoRoot, 'data', 'countries');
const SKIP_NAMES = new Set(['.DS_Store', '.git']);
const SKIP_PREFIXES = ['temporary_'];

function countryCodeFromArgv() {
  const value = (process.argv[2] || process.env.MARKET_CODE || '').trim().toLowerCase();
  if (!value || value.startsWith('-')) {
    throw new Error('Usage: node scripts/sync-collector-market.mjs <market-code>');
  }
  return value;
}

function looksLikeCountryDir(dir, countryCode) {
  return fs.existsSync(path.join(dir, countryCode, 'index.yaml'));
}

function looksLikeCollectorRoot(dir, countryCode) {
  return looksLikeCountryDir(path.join(dir, 'data', 'countries'), countryCode);
}

function resolveCollectorCountryDir(countryCode) {
  const candidates = [
    process.env.COLLECTOR_ROOT,
    process.env.MARKET_DATA_ROOT,
    path.resolve(repoRoot, '..', 'race-collector-v2'),
    '/tmp/race-collector-v2',
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved)) continue;
    if (looksLikeCountryDir(resolved, countryCode)) {
      return path.join(resolved, countryCode);
    }
    if (looksLikeCollectorRoot(resolved, countryCode)) {
      return path.join(resolved, 'data', 'countries', countryCode);
    }
  }

  return null;
}

function shouldCopy(name) {
  if (SKIP_NAMES.has(name)) return false;
  return !SKIP_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!shouldCopy(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
      continue;
    }
    fs.copyFileSync(from, to);
  }
}

function main() {
  const countryCode = countryCodeFromArgv();
  const sourceDir = resolveCollectorCountryDir(countryCode);
  if (!sourceDir) {
    console.error(
      `Collector market "${countryCode}" was not found. Clone jonkan999/race-collector-v2 (branch with this market) so data/countries/${countryCode}/index.yaml exists, then set COLLECTOR_ROOT or place the clone at ../race-collector-v2.`,
    );
    process.exit(2);
  }

  const destDir = path.join(destCountries, countryCode);
  copyDir(sourceDir, destDir);
  console.log(`Synced ${path.relative(repoRoot, destDir)} from ${sourceDir}`);
}

main();
