#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { getActiveMarketCode, resolveCountriesRoot } from './lib/market-config.mjs';

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
  return doc.base_url.replace(/\/+$/, '');
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

function shouldIncludeRoute(routePath, configuredCountries) {
  if (routePath === '/404' || routePath === '/404/') return false;
  if (routePath.startsWith('/_astro/')) return false;
  if (routePath.startsWith('/auth/') || routePath.startsWith('/en/auth/')) return false;

  const firstSegment = routePath.split('/').filter(Boolean)[0] ?? '';
  if (configuredCountries.has(firstSegment)) return false;

  return true;
}

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildSitemapXml(urls) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  for (const url of urls) {
    lines.push('  <url>');
    lines.push(`    <loc>${xmlEscape(url)}</loc>`);
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
  const urls = walkHtmlFiles(distDir)
    .map((filePath) => path.relative(distDir, filePath))
    .map((relativePath) => toRoutePath(relativePath))
    .filter((routePath) => shouldIncludeRoute(routePath, configuredCountries))
    .map((routePath) => (routePath === '/' ? `${baseUrl}/` : `${baseUrl}${routePath}`))
    .filter((url, index, values) => values.indexOf(url) === index)
    .sort((a, b) => a.localeCompare(b));

  fs.writeFileSync(sitemapPath, buildSitemapXml(urls), 'utf8');
  console.log(`Wrote ${urls.length} sitemap URLs to ${path.relative(root, sitemapPath)}`);
}

main();
