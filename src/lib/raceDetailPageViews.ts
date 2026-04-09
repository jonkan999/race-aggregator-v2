import { getSupabaseBrowserClient, isSupabaseConfigured } from './supabase';

type RecordRaceDetailPageViewArgs = {
  siteKey: string;
  siteName: string;
  countryCode: string;
  localeCode: string;
  domainName: string;
  pagePath?: string | null;
  pageUrl?: string | null;
  referrer?: string | null;
};

export async function recordRaceDetailPageView({
  siteKey,
  siteName,
  countryCode,
  localeCode,
  domainName,
  pagePath,
  pageUrl,
  referrer,
}: RecordRaceDetailPageViewArgs): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (!siteKey.trim() || !countryCode.trim() || !domainName.trim()) return;

  try {
    await getSupabaseBrowserClient().rpc('record_race_detail_page_view', {
      p_site_key: siteKey,
      p_site_name: siteName,
      p_country_code: countryCode,
      p_locale: localeCode,
      p_domain_name: domainName,
      p_page_path: pagePath ?? (typeof window !== 'undefined' ? window.location.pathname : null),
      p_page_url: pageUrl ?? (typeof window !== 'undefined' ? window.location.href : null),
      p_referrer: referrer ?? (typeof document !== 'undefined' ? document.referrer : null),
    });
  } catch {
    // Tracking should never block the race-detail experience.
  }
}
