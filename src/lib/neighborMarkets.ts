import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  hasEnglishMerge,
  loadIndexYaml,
  nativeTranslationLocale,
  raceListSlug,
  type Locale,
} from './content';
import { getDeployMarketProductionBaseUrl, listEnabledDeployMarkets } from './deployMarkets';
import { resolveMarketDataRoot } from './market';
import { nextUpcomingRaceDateWithinWindow } from './upcomingRaceWindow';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG_PATH = path.join(repoRoot, 'config', 'neighbor-markets.json');
const countriesRoot = resolveMarketDataRoot(path.join(repoRoot, 'data', 'countries'));

type NeighborMarketsFile = {
  markets?: Record<string, string[]>;
};

let cachedNeighborMap: Record<string, string[]> | null = null;
const upcomingCountCache = new Map<string, number>();

function normalizeCode(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function loadNeighborMap(): Record<string, string[]> {
  if (cachedNeighborMap) return cachedNeighborMap;
  const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as NeighborMarketsFile;
  const markets = parsed.markets ?? {};
  cachedNeighborMap = Object.fromEntries(
    Object.entries(markets).map(([host, neighbors]) => [
      normalizeCode(host),
      (neighbors ?? []).map((code) => normalizeCode(code)).filter(Boolean),
    ]),
  );
  return cachedNeighborMap;
}

export function listConfiguredNeighborCodes(hostCountryCode: string): string[] {
  const host = normalizeCode(hostCountryCode);
  return (loadNeighborMap()[host] ?? []).filter((code) => code && code !== host);
}

export function listEnabledNeighborMarketCodes(hostCountryCode: string): string[] {
  const enabled = new Set(listEnabledDeployMarkets().map((market) => market.marketCode));
  return listConfiguredNeighborCodes(hostCountryCode).filter((code) => enabled.has(code));
}

export function neighborCountryLabel(args: {
  neighborCountryCode: string;
  hostCountryCode: string;
  locale: Locale;
}): string {
  const { neighborCountryCode, hostCountryCode, locale } = args;
  const code = normalizeCode(neighborCountryCode).toUpperCase();
  const displayLocale =
    locale === 'en' ? 'en' : nativeTranslationLocale(hostCountryCode) || hostCountryCode;

  try {
    const label = new Intl.DisplayNames([displayLocale], { type: 'region' }).of(code);
    if (label) return label;
  } catch {
    // Fall through to YAML / code.
  }

  try {
    const content = loadIndexYaml(
      normalizeCode(neighborCountryCode),
      locale === 'en' && hasEnglishMerge(neighborCountryCode) ? 'en' : 'native',
    );
    const fromYaml = String(content.country_native ?? content.country ?? '').trim();
    if (fromYaml) return fromYaml;
  } catch {
    // Fall through to the ISO code.
  }

  return code;
}

export function getNeighborMarketRaceListHref(args: {
  neighborCountryCode: string;
  locale: Locale;
}): string | null {
  const code = normalizeCode(args.neighborCountryCode);
  const baseUrl = getDeployMarketProductionBaseUrl(code);
  if (!baseUrl) return null;

  const useEnglish = args.locale === 'en' && hasEnglishMerge(code);
  const content = loadIndexYaml(code, useEnglish ? 'en' : 'native');
  const listSlug = raceListSlug(content, code);
  const prefix = useEnglish ? '/en/' : '/';
  return `${baseUrl}${prefix}${listSlug}/`;
}

export function countUpcomingDomesticRacesFromLocalJson(countryCode: string): number {
  const code = normalizeCode(countryCode);
  const cached = upcomingCountCache.get(code);
  if (cached != null) return cached;

  const filePath = path.join(countriesRoot, code, 'final_races.json');
  if (!fs.existsSync(filePath)) {
    upcomingCountCache.set(code, 0);
    return 0;
  }

  try {
    const races = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<{ race_dates?: unknown }>;
    const count = races.filter((race) => nextUpcomingRaceDateWithinWindow(race.race_dates)).length;
    upcomingCountCache.set(code, count);
    return count;
  } catch {
    upcomingCountCache.set(code, 0);
    return 0;
  }
}
