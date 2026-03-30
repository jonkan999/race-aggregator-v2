import type { SupabaseClient, User } from '@supabase/supabase-js';

type AuthTrackingParams = {
  supabase: SupabaseClient;
  email: string | null | undefined;
  siteKey: string;
  siteName: string;
  countryCode: string;
  locale: 'native' | 'en';
  siteUrl?: string | null;
};

export async function recordSupabaseSignup({
  supabase,
  email,
  siteKey,
  siteName,
  countryCode,
  locale,
  siteUrl,
}: AuthTrackingParams): Promise<void> {
  const normalizedEmail = String(email ?? '').trim().toLowerCase();
  if (!normalizedEmail) return;

  await supabase.rpc('record_auth_signup', {
    p_email: normalizedEmail,
    p_site_key: siteKey,
    p_site_name: siteName,
    p_country_code: countryCode,
    p_locale: locale === 'native' ? 'sv' : 'en',
    p_site_url: siteUrl ?? null,
  });
}

export function looksLikeNewOAuthUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const provider = String(user.app_metadata?.provider ?? '').toLowerCase();
  if (provider !== 'google') return false;

  const createdAt = Date.parse(String(user.created_at ?? ''));
  const lastSignInAt = Date.parse(String(user.last_sign_in_at ?? ''));
  if (!Number.isFinite(createdAt) || !Number.isFinite(lastSignInAt)) return false;

  return Math.abs(lastSignInAt - createdAt) < 5 * 60 * 1000;
}
