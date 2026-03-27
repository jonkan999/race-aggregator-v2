import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { slugify } from './slugify';

export type Locale = 'native' | 'en';

export type IndexYaml = {
  navigation?: Record<string, string>;
  auxiliary_pages?: Record<string, string>;
  race_list_name?: string;
  page_name?: string;
  base_url?: string;
  title?: string;
  country_native?: string;
  country?: string;
  country_code?: string;
  country_language?: string;
  country_language_code?: string;
  race_list_title?: string;
  race_list_meta_description_1?: string;
  race_list_meta_description_2?: string;
  race_card_cta_text?: string;
  pagination?: {
    results_text?: string;
    events_text?: string;
    previous_text?: string;
    next_text?: string;
    page_text?: string;
    of_text?: string;
  };
  map_toggle_desktop?: string;
  map_toggle_desktop_active?: string;
  map_toggle_mobile?: string;
  map_toggle_mobile_list?: string;
  mapbox_center?: { latitude?: number; longitude?: number };
  mapbox_zoom?: string;
  county_mapping?: Record<string, string>;
  filter_county?: string;
  filter_race_type?: string;
  filter_categories?: string;
  filter_months?: string;
  filter_distance?: string;
  filter_date_from?: string;
  filter_date_to?: string;
  /** Link label to switch to the other locale’s race list (set in each locale file). */
  alternate_locale_link_text?: string;
  footer?: {
    races_heading?: string;
    tools_heading?: string;
    about_heading?: string;
    privacy?: string;
    copyright_year?: string;
    site_name?: string;
    rights_text?: string;
    social_links?: Record<string, string>;
  };
  month_mapping?: Record<string, string>;
  type_options?: Record<string, string>;
  browse_by_category?: { button?: string; helper_text?: string };
  section_race_card_category_prefix?: string;
  section_race_card_category_suffix?: string;
  section_race_card_header_separator?: string;
  section_race_card_header_region_default?: string;
  race_page_folder_name?: string;
  race_page_alt_prefix?: string;
  alt_prefix?: string;
  [key: string]: unknown;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function dataCountriesDir(): string {
  return path.join(repoRoot, 'data', 'countries');
}

export function listCountryCodes(): string[] {
  const dir = dataCountriesDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'int')
    .map((d) => d.name)
    .filter((code) => fs.existsSync(path.join(dir, code, 'index.yaml')));
}

/** English routes use `merged_index_int.yaml` per market. */
export function hasEnglishMerge(countryCode: string): boolean {
  return fs.existsSync(
    path.join(dataCountriesDir(), countryCode, 'merged_index_int.yaml'),
  );
}

export function loadIndexYaml(countryCode: string, locale: Locale): IndexYaml {
  const base = path.join(dataCountriesDir(), countryCode);
  const file =
    locale === 'en'
      ? path.join(base, 'merged_index_int.yaml')
      : path.join(base, 'index.yaml');

  if (!fs.existsSync(file)) {
    throw new Error(`Missing content file: ${file}`);
  }

  const raw = fs.readFileSync(file, 'utf8');
  const doc = yaml.load(raw) as IndexYaml;
  if (!doc || typeof doc !== 'object') {
    throw new Error(`Invalid YAML: ${file}`);
  }
  return doc;
}

export function raceListSlug(content: IndexYaml, countryCode: string): string {
  const label = content.navigation?.['race-list'] ?? 'races';
  return slugify(label, countryCode);
}

export { slugify };
