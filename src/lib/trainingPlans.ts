import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMarketDataRoot } from './market';
import { loadIndexYaml, type Locale } from './content';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function countriesRoot(): string {
  return resolveMarketDataRoot(path.join(repoRoot, 'data', 'countries'));
}

export function trainingPlansLocaleCode(countryCode: string, locale: Locale): string {
  if (locale === 'en') return 'en';
  return String(loadIndexYaml(countryCode, 'native').country_language_code ?? countryCode).trim() || countryCode;
}

export function trainingPlansFilename(countryCode: string, locale: Locale): string {
  return `training_plans_processed_${trainingPlansLocaleCode(countryCode, locale)}.json`;
}

export function resolveTrainingPlansPath(countryCode: string, locale: Locale): string {
  return path.join(countriesRoot(), countryCode, 'json', trainingPlansFilename(countryCode, locale));
}

export function trainingPlansDataUrl(locale: Locale): string {
  return `/json/training-plans/${locale}.json`;
}

export function readTrainingPlansJson(countryCode: string, locale: Locale): string | null {
  const filePath = resolveTrainingPlansPath(countryCode, locale);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}
