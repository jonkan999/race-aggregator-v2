import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabase';

type NewsletterPopupVariantCopy = {
  eyebrow?: string;
  title?: string;
  body?: string;
};

type NewsletterPopupBenefitsCopy = {
  new_races?: string;
  date_changes?: string;
  selected_offers?: string;
  similar_races?: string;
  local_picks?: string;
  opening_reminders?: string;
  race_updates?: string;
  nearby_races?: string;
};

export type NewsletterPopupConfig = {
  siteKey: string;
  siteName: string;
  countryCode: string;
  localeCode: string;
  countryName?: string;
  baseUrl?: string;
  email_placeholder?: string;
  submit_button?: string;
  dismiss_button?: string;
  invalid_email?: string;
  submit_error?: string;
  submitting_text?: string;
  success_message?: string;
  privacy_note?: string;
  close_aria_label?: string;
  benefits?: NewsletterPopupBenefitsCopy;
  generic?: NewsletterPopupVariantCopy;
  race_detail?: NewsletterPopupVariantCopy;
  browse_category?: NewsletterPopupVariantCopy;
  browse_category_type?: NewsletterPopupVariantCopy;
  browse_county?: NewsletterPopupVariantCopy;
  browse_city?: NewsletterPopupVariantCopy;
  browse_type?: NewsletterPopupVariantCopy;
  browse_month?: NewsletterPopupVariantCopy;
  browse_neighboring?: NewsletterPopupVariantCopy;
  browse_neighboring_country?: NewsletterPopupVariantCopy;
};

type BasePopupContext = {
  surface: 'race-list' | 'race-detail';
  backgroundImageSrc?: string | null;
};

export type NewsletterPopupContext =
  | (BasePopupContext & { kind: 'race-list'; heading?: string | null })
  | (BasePopupContext & { kind: 'browse-category'; categoryLabel: string })
  | (BasePopupContext & {
      kind: 'browse-category-type';
      categoryLabel: string;
      raceTypeLabel: string;
    })
  | (BasePopupContext & { kind: 'browse-county'; countyLabel: string })
  | (BasePopupContext & { kind: 'browse-city'; cityLabel: string })
  | (BasePopupContext & { kind: 'browse-type'; raceTypeLabel: string })
  | (BasePopupContext & { kind: 'browse-month'; monthLabel: string })
  | (BasePopupContext & { kind: 'browse-neighboring'; label: string })
  | (BasePopupContext & { kind: 'browse-neighboring-country'; label: string })
  | (BasePopupContext & {
      kind: 'race-detail';
      raceName: string;
      countyLabel?: string | null;
      raceTypeLabel?: string | null;
    });

export type NewsletterPopupTrigger =
  | 'time_delay'
  | 'scroll_depth'
  | 'exit_intent'
  | 'first_tap_ios'
  | 'manual';

export type NewsletterPopupDismissReason =
  | 'close_button'
  | 'backdrop'
  | 'escape'
  | 'secondary_button';

export type NewsletterPopupResolvedContent = {
  variantId: string;
  popupContext: NewsletterPopupContext['kind'];
  popupSurface: NewsletterPopupContext['surface'];
  eyebrow: string;
  title: string;
  body: string;
  highlights: string[];
  backgroundImageSrc: string | null;
  triggerDelayMs: number;
  scrollThreshold: number;
  emailPlaceholder: string;
  submitButton: string;
  dismissButton: string;
  invalidEmail: string;
  submitError: string;
  submittingText: string;
  successMessage: string;
  privacyNote: string;
  closeAriaLabel: string;
  contextData: Record<string, string>;
};

type NewsletterPopupEventArgs = {
  impressionId: string | null;
  eventType: 'impression' | 'dismiss';
  popupVariant: string;
  popupSurface: string;
  popupContext: string;
  triggerType: NewsletterPopupTrigger;
  siteKey: string;
  siteName: string;
  countryCode: string;
  localeCode: string;
  pagePath?: string | null;
  pageUrl?: string | null;
  referrer?: string | null;
  contextData?: Record<string, string>;
  meta?: Record<string, unknown>;
};

type NewsletterSubscribeArgs = {
  email: string;
  impressionId: string | null;
  popupVariant: string;
  popupSurface: string;
  popupContext: string;
  siteKey: string;
  siteName: string;
  countryCode: string;
  localeCode: string;
  pagePath?: string | null;
  pageUrl?: string | null;
  referrer?: string | null;
  contextData?: Record<string, string>;
};

function interpolateTemplate(
  template: string | undefined,
  replacements: Record<string, string>,
): string {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_match, key: string) => replacements[key] ?? '');
}

function variantCopyForContext(
  config: NewsletterPopupConfig,
  kind: NewsletterPopupContext['kind'],
): NewsletterPopupVariantCopy | undefined {
  switch (kind) {
    case 'race-detail':
      return config.race_detail ?? config.generic;
    case 'browse-category':
      return config.browse_category ?? config.generic;
    case 'browse-category-type':
      return config.browse_category_type ?? config.browse_category ?? config.generic;
    case 'browse-county':
      return config.browse_county ?? config.generic;
    case 'browse-city':
      return config.browse_city ?? config.browse_county ?? config.generic;
    case 'browse-type':
      return config.browse_type ?? config.generic;
    case 'browse-month':
      return config.browse_month ?? config.generic;
    case 'browse-neighboring':
      return config.browse_neighboring ?? config.generic;
    case 'browse-neighboring-country':
      return config.browse_neighboring_country ?? config.browse_neighboring ?? config.generic;
    case 'race-list':
    default:
      return config.generic;
  }
}

function highlightLabels(
  config: NewsletterPopupConfig,
  kind: NewsletterPopupContext['kind'],
): string[] {
  const benefits = config.benefits ?? {};

  const labels =
    kind === 'race-detail'
      ? [benefits.race_updates, benefits.similar_races, benefits.selected_offers]
      : kind === 'browse-month'
        ? [benefits.opening_reminders, benefits.date_changes, benefits.selected_offers]
        : kind === 'browse-county' || kind === 'browse-city'
          ? [benefits.local_picks, benefits.date_changes, benefits.selected_offers]
          : kind === 'browse-neighboring' || kind === 'browse-neighboring-country'
            ? [benefits.nearby_races, benefits.new_races, benefits.selected_offers]
            : [benefits.new_races, benefits.similar_races, benefits.selected_offers];

  return [...new Set(labels.map((label) => String(label ?? '').trim()).filter(Boolean))].slice(0, 3);
}

function triggerSettings(kind: NewsletterPopupContext['kind']): {
  delayMs: number;
  scrollThreshold: number;
} {
  if (kind === 'race-detail') {
    return {
      delayMs: 4500,
      scrollThreshold: 0.28,
    };
  }

  if (kind === 'race-list') {
    return {
      delayMs: 6500,
      scrollThreshold: 0.5,
    };
  }

  return {
    delayMs: 5500,
    scrollThreshold: 0.36,
  };
}

function looksTrailAdjacent(value: string | null | undefined): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  return ['trail', 'terrain', 'backyard', 'frontyard'].some((token) =>
    normalized.includes(token),
  );
}

function popupFallbackBackground(context: NewsletterPopupContext): string {
  const detailType =
    context.kind === 'race-detail' ? context.raceTypeLabel : 'raceTypeLabel' in context ? context.raceTypeLabel : '';
  return looksTrailAdjacent(detailType)
    ? '/common_images/trail-running.webp'
    : '/common_images/road-running.webp';
}

function replacementValues(
  config: NewsletterPopupConfig,
  context: NewsletterPopupContext,
): Record<string, string> {
  const country = String(config.countryName ?? config.countryCode ?? '').trim();

  switch (context.kind) {
    case 'browse-category':
      return {
        category: context.categoryLabel,
        country,
      };
    case 'browse-category-type':
      return {
        category: context.categoryLabel,
        race_type: context.raceTypeLabel,
        country,
      };
    case 'browse-county':
      return {
        county: context.countyLabel,
        country,
      };
    case 'browse-city':
      return {
        city: context.cityLabel,
        country,
      };
    case 'browse-type':
      return {
        race_type: context.raceTypeLabel,
        country,
      };
    case 'browse-month':
      return {
        month: context.monthLabel,
        country,
      };
    case 'browse-neighboring':
    case 'browse-neighboring-country':
      return {
        region: context.label,
        country,
      };
    case 'race-detail':
      return {
        race_name: context.raceName,
        county: String(context.countyLabel ?? country).trim() || country,
        race_type: String(context.raceTypeLabel ?? '').trim(),
        country,
      };
    case 'race-list':
    default:
      return {
        country,
        heading: String(context.heading ?? '').trim(),
      };
  }
}

export function popupContextData(
  context: NewsletterPopupContext,
): Record<string, string> {
  switch (context.kind) {
    case 'browse-category':
      return { category: context.categoryLabel };
    case 'browse-category-type':
      return {
        category: context.categoryLabel,
        race_type: context.raceTypeLabel,
      };
    case 'browse-county':
      return { county: context.countyLabel };
    case 'browse-city':
      return { city: context.cityLabel };
    case 'browse-type':
      return { race_type: context.raceTypeLabel };
    case 'browse-month':
      return { month: context.monthLabel };
    case 'browse-neighboring':
    case 'browse-neighboring-country':
      return { region: context.label };
    case 'race-detail':
      return {
        race_name: context.raceName,
        county: String(context.countyLabel ?? '').trim(),
        race_type: String(context.raceTypeLabel ?? '').trim(),
      };
    case 'race-list':
    default:
      return {
        heading: String(context.heading ?? '').trim(),
      };
  }
}

export function resolveNewsletterPopupContent(
  config: NewsletterPopupConfig,
  context: NewsletterPopupContext,
): NewsletterPopupResolvedContent {
  const variantCopy = variantCopyForContext(config, context.kind) ?? {};
  const replacements = replacementValues(config, context);
  const triggers = triggerSettings(context.kind);

  return {
    variantId: context.kind,
    popupContext: context.kind,
    popupSurface: context.surface,
    eyebrow: interpolateTemplate(variantCopy.eyebrow, replacements),
    title: interpolateTemplate(variantCopy.title, replacements),
    body: interpolateTemplate(variantCopy.body, replacements),
    highlights: highlightLabels(config, context.kind),
    backgroundImageSrc:
      String(context.backgroundImageSrc ?? '').trim() || popupFallbackBackground(context),
    triggerDelayMs: triggers.delayMs,
    scrollThreshold: triggers.scrollThreshold,
    emailPlaceholder: String(config.email_placeholder ?? ''),
    submitButton: String(config.submit_button ?? ''),
    dismissButton: String(config.dismiss_button ?? ''),
    invalidEmail: String(config.invalid_email ?? ''),
    submitError: String(config.submit_error ?? ''),
    submittingText: String(config.submitting_text ?? ''),
    successMessage: String(config.success_message ?? ''),
    privacyNote: String(config.privacy_note ?? ''),
    closeAriaLabel: String(config.close_aria_label ?? 'Close'),
    contextData: popupContextData(context),
  };
}

export function readNewsletterPopupConfigFromDocument(): NewsletterPopupConfig | null {
  if (typeof document === 'undefined') return null;

  const script = document.getElementById('newsletter-popup-config');
  if (!(script instanceof HTMLScriptElement)) return null;

  try {
    const parsed = JSON.parse(script.textContent ?? '') as NewsletterPopupConfig;
    if (!String(parsed.siteKey ?? '').trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function recordNewsletterPopupEvent({
  impressionId,
  eventType,
  popupVariant,
  popupSurface,
  popupContext,
  triggerType,
  siteKey,
  siteName,
  countryCode,
  localeCode,
  pagePath,
  pageUrl,
  referrer,
  contextData,
  meta,
}: NewsletterPopupEventArgs): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('record_newsletter_popup_event', {
    p_impression_id: impressionId,
    p_event_type: eventType,
    p_popup_variant: popupVariant,
    p_popup_surface: popupSurface,
    p_popup_context: popupContext,
    p_trigger_type: triggerType,
    p_site_key: siteKey,
    p_site_name: siteName,
    p_country_code: countryCode,
    p_locale: localeCode,
    p_page_path: pagePath ?? null,
    p_page_url: pageUrl ?? null,
    p_referrer: referrer ?? null,
    p_context_data: contextData ?? {},
    p_meta: meta ?? {},
  });

  if (error) throw error;
}

export async function subscribeNewsletterPopup({
  email,
  impressionId,
  popupVariant,
  popupSurface,
  popupContext,
  siteKey,
  siteName,
  countryCode,
  localeCode,
  pagePath,
  pageUrl,
  referrer,
  contextData,
}: NewsletterSubscribeArgs): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured');
  }

  const supabase = getSupabaseBrowserClient();
  const { error } = await supabase.rpc('subscribe_newsletter_popup', {
    p_email: email,
    p_impression_id: impressionId,
    p_popup_variant: popupVariant,
    p_popup_surface: popupSurface,
    p_popup_context: popupContext,
    p_site_key: siteKey,
    p_site_name: siteName,
    p_country_code: countryCode,
    p_locale: localeCode,
    p_page_path: pagePath ?? null,
    p_page_url: pageUrl ?? null,
    p_referrer: referrer ?? null,
    p_context_data: contextData ?? {},
  });

  if (error) throw error;
}
