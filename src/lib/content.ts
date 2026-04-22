import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { resolveMarketDataRoot } from './market';
import { slugify } from './slugify';

export type Locale = 'native' | 'en';

export type IndexYaml = {
  accessibility?: {
    main_navigation_label?: string;
    breadcrumb_label?: string;
    back_to_top_label?: string;
    social_facebook_label?: string;
    social_instagram_label?: string;
    social_youtube_label?: string;
    social_tiktok_label?: string;
  };
  navigation?: Record<string, string>;
  auxiliary_pages?: Record<string, string>;
  about_us?: {
    title?: string;
    meta_description?: string;
    content?: {
      intro?: string;
      mission?: string;
      story?: string;
      closing?: string;
      features?: Array<{ title?: string; description?: string }>;
    };
  };
  contact?: {
    title?: string;
    meta_description?: string;
    content?: {
      intro?: string;
      email?: { title?: string; address?: string; description?: string };
      social?: { title?: string; description?: string };
      feedback?: { title?: string; description?: string };
    };
  };
  privacy_page?: {
    title?: string;
    meta_description?: string;
    last_updated_label?: string;
    last_updated_date?: string;
    contact_intro?: string;
    contact_email?: string;
    sections?: Array<{
      title?: string;
      intro?: string;
      bullets?: string[];
    }>;
  };
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
  browse_by_category?: {
    button?: string;
    helper_text?: string;
    overview?: string;
    counties?: string;
    cities?: string;
    months?: string;
    types?: string;
    categories?: string;
    neighboring?: string;
  };
  browse_overview?: { title?: string; meta_description?: string };
  browse_categories?: { title?: string; meta_description?: string };
  home_tools?: {
    measure_route?: { description?: string };
    training_plans?: { description?: string };
    racetime_estimator?: { description?: string };
    pace_calculator?: { description?: string };
  };
  auth_modal?: Record<string, string>;
  newsletter_popup?: Record<string, unknown>;
  submission_flow?: Record<string, string>;
  /** Copy + accent for `scripts/build-supabase-auth-templates.mjs` (GoTrue HTML). */
  supabase_auth_email?: {
    site_name?: string;
    primary_color?: string;
    shared?: {
      greeting?: string;
      closing_salutation?: string;
      link_fallback_intro?: string;
    };
    confirm_signup?: { body?: string; button_label?: string; ignore_note?: string };
    reset_password?: { body?: string; button_label?: string; ignore_note?: string };
    change_email?: { body?: string; button_label?: string; ignore_note?: string };
  };
  seo_templates?: {
    title_parts?: Record<string, string>;
    paragraph_templates?: Record<string, string>;
    browse_page_templates?: Record<
      string,
      {
        title?: string;
        meta_description?: string;
        h1?: string;
        paragraph?: string;
      }
    >;
  };
  important_keywords_racelist?: string[];
  seo_generation?: {
    browse_model?: string;
    browse_system_prompt?: string;
    browse_guidance?: Record<string, string>;
  };
  browse_seo_indexing?: {
    county_pages?: {
      enabled?: boolean;
      min_race_count?: number;
    };
    city_pages?: {
      enabled?: boolean;
      min_race_count?: number;
      require_qualified_city?: boolean;
    };
    month_pages?: {
      enabled?: boolean;
      min_race_count?: number;
    };
    race_type_pages?: {
      enabled?: boolean;
      min_race_count?: number;
      allowed_race_type_keys?: string[];
    };
    category_pages?: {
      enabled?: boolean;
      min_race_count?: number;
      allowed_category_keys?: string[];
    };
    race_type_category_pages?: {
      enabled?: boolean;
      min_race_count?: number;
      allowed_race_type_keys?: string[];
      allowed_category_keys?: string[];
    };
    race_type_county_pages?: {
      enabled?: boolean;
      min_race_count?: number;
      allowed_race_type_keys?: string[];
    };
    race_type_month_pages?: {
      enabled?: boolean;
      min_race_count?: number;
      allowed_race_type_keys?: string[];
    };
    race_type_city_pages?: {
      enabled?: boolean;
      min_race_count?: number;
      allowed_race_type_keys?: string[];
      require_qualified_city?: boolean;
    };
  };
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

function resolveContentPlaceholders(value: unknown): unknown {
  const replacements: Record<string, string> = {
    CURRENT_YEAR: String(new Date().getFullYear()),
  };

  if (typeof value === 'string') {
    return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key: string) => {
      return replacements[key] ?? match;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveContentPlaceholders(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveContentPlaceholders(item),
      ]),
    );
  }

  return value;
}

function dataCountriesDir(): string {
  return resolveMarketDataRoot(path.join(repoRoot, 'data', 'countries'));
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
  return resolveContentPlaceholders(doc) as IndexYaml;
}

export function raceListSlug(content: IndexYaml, countryCode: string): string {
  const primaryLabel = String(content.navigation?.['race-list'] ?? '').trim();
  const fallbackLabel = String(content.race_list_name ?? content.page_name ?? '').trim();
  return slugify(primaryLabel, countryCode)
    || slugify(fallbackLabel, countryCode)
    || 'race-calendar';
}

export function findCountryByRaceListSlug(raceList: string, locale: Locale): string | null {
  for (const country of listCountryCodes()) {
    const content = loadIndexYaml(country, locale);
    if (raceListSlug(content, country) === raceList) {
      return country;
    }
  }
  return null;
}

/**
 * Public production routing is market-scoped per domain:
 * native pages live at `/...` and English pages live at `/en/...`.
 */
export function publicLocaleBasePrefix(locale: Locale): string {
  return locale === 'en' ? '/en/' : '/';
}

/**
 * Country-aware prefix helper retained for market-specific content code.
 * Public IA should still be modeled as native `/...` and English `/en/...`.
 */
export function localeBasePrefix(countryCode: string, locale: Locale): string {
  return publicLocaleBasePrefix(locale);
}

export { slugify };
