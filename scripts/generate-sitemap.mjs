#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { getActiveMarketCode, resolveCountriesRoot } from './lib/market-config.mjs';
import { compileRedirectMatchers, isRedirectSource } from './lib/redirect-match.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const countriesDir = resolveCountriesRoot(root);
const sitemapPath = path.join(distDir, 'sitemap.xml');

function listConfiguredCountries() {
  if (!fs.existsSync(countriesDir)) return [];
  return fs
    .readdirSync(countriesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((code) => fs.existsSync(path.join(countriesDir, code, 'index.yaml')));
}

function loadDefaultBaseUrl() {
  const indexPath = path.join(countriesDir, getActiveMarketCode(), 'index.yaml');
  const raw = fs.readFileSync(indexPath, 'utf8');
  const doc = yaml.load(raw);
  if (!doc || typeof doc !== 'object' || typeof doc.base_url !== 'string') {
    throw new Error(`Missing base_url in ${indexPath}`);
  }
  return toServingBaseUrl(doc.base_url);
}

// Every production apex 308-redirects to www, so canonical URLs use the www host.
export function toServingBaseUrl(value) {
  const url = new URL(String(value).trim());
  if (!url.hostname.startsWith('www.') && url.hostname.split('.').length === 2) {
    url.hostname = `www.${url.hostname}`;
  }
  return `${url.protocol}//${url.host}`;
}

function loadRedirectMatchers() {
  const vercelPath = path.join(root, 'vercel.json');
  if (!fs.existsSync(vercelPath)) return [];
  return compileRedirectMatchers(JSON.parse(fs.readFileSync(vercelPath, 'utf8')));
}

export function isNoindexHtmlSource(html) {
  return /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
}

/** `<meta property="og:updated_time">` on race pages -> `YYYY-MM-DD` for `<lastmod>`. */
export function extractLastmod(html) {
  const match = html.match(/<meta\s+property="og:updated_time"\s+content="([^"]+)"/i);
  if (!match) return null;
  const date = new Date(match[1]);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function walkHtmlFiles(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function toRoutePath(relativeHtmlPath) {
  const normalized = relativeHtmlPath.split(path.sep).join('/');
  if (normalized === 'index.html') return '/';
  if (normalized.endsWith('/index.html')) {
    return `/${normalized.slice(0, -'index.html'.length)}`;
  }
  return `/${normalized.slice(0, -'.html'.length)}`;
}

function foldPath(value) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '');
}

function shouldIncludeRoute(routePath, configuredCountries) {
  if (routePath === '/404' || routePath === '/404/') return false;
  if (routePath.startsWith('/_astro/')) return false;
  if (routePath.startsWith('/auth/') || routePath.startsWith('/en/auth/')) return false;

  const firstSegment = routePath.split('/').filter(Boolean)[0] ?? '';
  if (configuredCountries.has(firstSegment)) return false;

  return true;
}

function preferAsciiCanonical(urls) {
  const chosen = new Map();
  for (const url of urls) {
    const key = foldPath(url);
    const existing = chosen.get(key);
    if (!existing) {
      chosen.set(key, url);
      continue;
    }
    const urlIsAscii = url === foldPath(url);
    const existingIsAscii = existing === foldPath(existing);
    if (urlIsAscii && !existingIsAscii) chosen.set(key, url);
  }
  return [...chosen.values()];
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildSitemapXml(urls, lastmods = new Map()) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const url of urls) {
    lines.push('  <url>');
    lines.push(`    <loc>${xmlEscape(url)}</loc>`);
    const lastmod = lastmods.get(url);
    if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  return `${lines.join('\n')}\n`;
}

function main() {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Missing dist directory: ${distDir}`);
  }

  const configuredCountries = new Set(listConfiguredCountries());
  const baseUrl = loadDefaultBaseUrl();
  const redirectMatchers = loadRedirectMatchers();
  const lastmods = new Map();
  let skippedRedirectSources = 0;
  const urls = [];
  const seen = new Set();
  for (const filePath of walkHtmlFiles(distDir)) {
    const routePath = toRoutePath(path.relative(distDir, filePath));
    if (!shouldIncludeRoute(routePath, configuredCountries)) continue;
    const html = fs.readFileSync(filePath, 'utf8');
    if (isNoindexHtmlSource(html)) continue;
    if (isRedirectSource(routePath, redirectMatchers)) {
      skippedRedirectSources += 1;
      continue;
    }
    const url = routePath === '/' ? `${baseUrl}/` : `${baseUrl}${routePath}`;
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    const lastmod = extractLastmod(html);
    if (lastmod) lastmods.set(url, lastmod);
  }
  const canonicalUrls = preferAsciiCanonical(urls).sort((a, b) => a.localeCompare(b));

  fs.writeFileSync(sitemapPath, buildSitemapXml(canonicalUrls, lastmods), 'utf8');
  console.log(
    `Wrote ${canonicalUrls.length} sitemap URLs (${lastmods.size} with lastmod, ${skippedRedirectSources} redirect sources skipped) to ${path.relative(root, sitemapPath)}`,
  );

  const robots = ['User-agent: *', 'Allow: /', 'Disallow: /auth/', 'Disallow: /en/auth/', '', `Sitemap: ${baseUrl}/sitemap.xml`, ''];
  fs.writeFileSync(path.join(distDir, 'robots.txt'), robots.join('\n'), 'utf8');
  console.log('Wrote dist/robots.txt');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
