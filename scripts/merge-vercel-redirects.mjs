#!/usr/bin/env node
/**
 * Merge hand-maintained files from config/redirects/*.json into vercel.json.
 *
 * This is intentionally separate from generate-market-routes.mjs so market
 * onboarding cannot wipe one-off SEO redirects. The deploy workflow runs this
 * before `vercel build` so the CLI sees the merged file.
 *
 * vercel.json already uses `routes` for WAF deny. When `routes` is present,
 * a top-level `redirects` key may be ignored, so this script also prepends
 * equivalent 308 `routes` entries.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vercelPath = path.join(repoRoot, 'vercel.json');
const redirectsDir = path.join(repoRoot, 'config', 'redirects');

const MANAGED_REDIRECT_STATUSES = new Set([301, 308]);

export function listRedirectConfigFiles(dir = redirectsDir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => path.join(dir, name));
}

export function loadRedirectConfigs(dir = redirectsDir) {
  return listRedirectConfigFiles(dir).map((filePath) => {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      filePath,
      id: String(parsed.id ?? path.basename(filePath, '.json')),
      market: parsed.market ? String(parsed.market).toLowerCase() : '',
      redirects: Array.isArray(parsed.redirects) ? parsed.redirects : [],
    };
  });
}

export function vercelRedirectsFromConfigs(configs) {
  return configs.flatMap((config) =>
    config.redirects.map((redirect) => ({
      source: redirect.source,
      destination: redirect.destination,
      permanent: redirect.permanent !== false,
    })),
  );
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redirectToRoute(redirect) {
  const source = String(redirect.source ?? '');
  const destination = String(redirect.destination ?? '');
  const status = redirect.permanent === false ? 307 : 308;
  const pathStar = '/:path*';

  if (source.endsWith(pathStar) && destination.endsWith(pathStar)) {
    const sourceBase = source.slice(0, -pathStar.length);
    const destBase = destination.slice(0, -pathStar.length);
    return {
      src: `^${escapeRegex(sourceBase)}(?:/(.*))?$`,
      headers: { Location: `${destBase}/$1` },
      status,
    };
  }

  return {
    src: `^${escapeRegex(source)}$`,
    headers: { Location: destination },
    status,
  };
}

function isManagedRedirectRoute(route) {
  return Boolean(route && MANAGED_REDIRECT_STATUSES.has(route.status) && route.headers?.Location);
}

export function mergeVercelConfig(vercelJson, configs) {
  const redirects = vercelRedirectsFromConfigs(configs);
  const redirectRoutes = redirects.map(redirectToRoute);
  const existingRoutes = Array.isArray(vercelJson.routes) ? vercelJson.routes : [];
  const preservedRoutes = existingRoutes.filter((route) => !isManagedRedirectRoute(route));

  return {
    ...vercelJson,
    redirects,
    routes: [...redirectRoutes, ...preservedRoutes],
  };
}

function writeJsonIfChanged(filePath, value) {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (existing === next) return false;
  fs.writeFileSync(filePath, next, 'utf8');
  return true;
}

export function mergeVercelRedirects(args = {}) {
  const root = args.repoRoot ?? repoRoot;
  const target = args.vercelPath ?? path.join(root, 'vercel.json');
  const dir = args.redirectsDir ?? path.join(root, 'config', 'redirects');
  const vercelJson = JSON.parse(fs.readFileSync(target, 'utf8'));
  const configs = loadRedirectConfigs(dir);
  const merged = mergeVercelConfig(vercelJson, configs);
  const changed = writeJsonIfChanged(target, merged);
  return { changed, redirectCount: merged.redirects.length, configs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = mergeVercelRedirects();
  const names = result.configs.map((config) => config.id).join(', ') || '(none)';
  console.log(
    result.changed
      ? `Merged ${result.redirectCount} durable redirect(s) from ${names} into vercel.json`
      : `vercel.json already contains ${result.redirectCount} durable redirect(s) from ${names}`,
  );
}
