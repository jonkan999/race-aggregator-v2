import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pagesDir = path.join(repoRoot, 'src', 'pages');
const countriesDir = path.join(repoRoot, 'data', 'countries');
const manifestPath = path.join(repoRoot, 'scripts', '.generated-market-routes.json');
const country = (process.env.MARKET_CODE ?? 'se').trim().toLowerCase();

const nativeTemplates = {
  'add-race': 'lagg-till-lopp',
  'measure-route': 'mat-din-runda',
  'training-plans': 'traningsprogram',
  'pace-calculator': 'fartomvandlare',
  'racetime-estimator': 'uppskatta-din-sluttid',
  'about-us': 'om-oss',
  contact: 'kontakta-oss',
  privacy: 'privacy',
};

const englishTemplates = {
  'add-race': 'add-race',
  'measure-route': 'measure-your-route',
  'training-plans': 'training-plans',
  'pace-calculator': 'pace-converter',
  'racetime-estimator': 'estimate-your-finish-time',
  'about-us': 'about-us',
  contact: 'contact-us',
  privacy: 'privacy',
};

function loadYaml(filePath) {
  return yaml.load(fs.readFileSync(filePath, 'utf8')) ?? {};
}

function slugify(input, countryCode) {
  let s = String(input ?? '').toLowerCase();
  const cc = String(countryCode ?? '').toLowerCase();
  if (cc === 'se') {
    s = s.replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o');
  } else if (cc === 'no' || cc === 'dk') {
    s = s.replace(/å/g, 'a').replace(/æ/g, 'a').replace(/ø/g, 'o');
  } else if (cc === 'fi') {
    s = s.replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o');
  } else if (cc === 'de') {
    s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  }
  s = s.normalize('NFKD').replace(/\p{M}/gu, '');
  s = s.replace(/[^a-z0-9\s-]/g, '');
  s = s.replace(/[\s-]+/g, '-').replace(/^-|-$/g, '');
  return s;
}

function auxiliaryLabel(content, pageKey) {
  switch (pageKey) {
    case 'add-race':
      return content.navigation?.['add-race'] ?? content.add_race_title ?? '';
    case 'measure-route':
      return content.navigation?.['measure-route'] ?? content.measure_route_title ?? '';
    case 'training-plans':
      return content.navigation?.['training-plans'] ?? content.training_plans?.title ?? '';
    case 'pace-calculator':
      return content.navigation?.['pace-calculator'] ?? content.pace_calculator_title ?? '';
    case 'racetime-estimator':
      return content.navigation?.['racetime-estimator'] ?? content.racetime_estimator_title ?? '';
    case 'about-us':
      return content.navigation?.['about-us'] ?? content.about_us?.title ?? '';
    case 'contact':
      return content.navigation?.contact ?? content.contact?.title ?? '';
    case 'privacy':
      return content.auxiliary_pages?.['privacy-policy'] ?? content.footer?.privacy ?? content.privacy_page?.title ?? '';
    default:
      return '';
  }
}

function routeSegment(content, pageKey, locale) {
  const label = String(auxiliaryLabel(content, pageKey) ?? '').trim();
  const fallback = locale === 'en' ? englishTemplates[pageKey] : nativeTemplates[pageKey];
  return label ? slugify(label, country) : fallback;
}

function racePageFolder(content, locale) {
  const fallback = locale === 'en' ? 'race-pages' : 'loppsidor';
  return String(content.race_page_folder_name ?? '').trim() || fallback;
}

function writeFileIfChanged(filePath, content) {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (existing === content) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function deleteFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.rmSync(filePath, { recursive: true, force: true });
  }
}

function loadPreviousManifest() {
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return Array.isArray(parsed.files) ? parsed.files : [];
  } catch {
    return [];
  }
}

function saveManifest(files) {
  fs.writeFileSync(manifestPath, `${JSON.stringify({ files }, null, 2)}\n`, 'utf8');
}

function wrapperImport(fromFile, toFile) {
  let rel = path.relative(path.dirname(fromFile), toFile).replaceAll(path.sep, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function auxiliaryWrapperContent(fromFile, templateFile) {
  return `---\nimport Page from '${wrapperImport(fromFile, templateFile)}';\n---\n\n<Page />\n`;
}

function raceDetailWrapperContent(locale) {
  const componentImport = locale === 'en' ? '../../../../components/RaceDetailPage.astro' : '../../../components/RaceDetailPage.astro';
  const helperImport = locale === 'en' ? '../../../../lib/raceDetailRoutePage' : '../../../lib/raceDetailRoutePage';
  const localeCode = locale === 'en' ? 'en' : 'native';
  return `---
import RaceDetailPage from '${componentImport}';
import { getRaceDetailStaticPaths, loadRaceDetailRoute } from '${helperImport}';

export async function getStaticPaths() {
  const country = (process.env.MARKET_CODE ?? 'se').trim().toLowerCase();
  return getRaceDetailStaticPaths(country);
}

const country = (process.env.MARKET_CODE ?? 'se').trim().toLowerCase();
const { domain } = Astro.params;
const result = await loadRaceDetailRoute({ countryCode: country, locale: '${localeCode}', domain: String(domain ?? '') });

if ('redirectTo' in result) {
  return Astro.redirect(result.redirectTo, 302);
}
---

<RaceDetailPage
  country={country}
  locale="${localeCode}"
  content={result.content}
  row={result.row}
  allRows={result.allRows}
  canonicalPath={result.canonicalPath}
  alternateHref={result.alternateHref}
  noindex={Astro.url.pathname !== result.canonicalPath}
/>
`;
}

const nativeContent = loadYaml(path.join(countriesDir, country, 'index.yaml'));
const englishContent = loadYaml(path.join(countriesDir, country, 'merged_index_int.yaml'));
const generatedFiles = [];

for (const filePath of loadPreviousManifest()) {
  deleteFileIfExists(path.join(repoRoot, filePath));
}

for (const [pageKey, templateSegment] of Object.entries(nativeTemplates)) {
  const segment = routeSegment(nativeContent, pageKey, 'native');
  if (segment === templateSegment) continue;
  const target = path.join(pagesDir, `${segment}.astro`);
  const template = path.join(pagesDir, `${templateSegment}.astro`);
  writeFileIfChanged(target, auxiliaryWrapperContent(target, template));
  generatedFiles.push(path.relative(repoRoot, target));
}

for (const [pageKey, templateSegment] of Object.entries(englishTemplates)) {
  const segment = routeSegment(englishContent, pageKey, 'en');
  if (segment === templateSegment) continue;
  const target = path.join(pagesDir, 'en', `${segment}.astro`);
  const template = path.join(pagesDir, 'en', `${templateSegment}.astro`);
  writeFileIfChanged(target, auxiliaryWrapperContent(target, template));
  generatedFiles.push(path.relative(repoRoot, target));
}

const nativeRaceFolder = racePageFolder(nativeContent, 'native');
if (nativeRaceFolder !== 'loppsidor') {
  const target = path.join(pagesDir, nativeRaceFolder, '[domain]', 'index.astro');
  writeFileIfChanged(target, raceDetailWrapperContent('native'));
  generatedFiles.push(path.relative(repoRoot, target));
}

const englishRaceFolder = racePageFolder(englishContent, 'en');
if (englishRaceFolder !== 'race-pages') {
  const target = path.join(pagesDir, 'en', englishRaceFolder, '[domain]', 'index.astro');
  writeFileIfChanged(target, raceDetailWrapperContent('en'));
  generatedFiles.push(path.relative(repoRoot, target));
}

saveManifest(generatedFiles);
