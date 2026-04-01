alter table crm.newsletter_popup_events
  add column if not exists session_id text;

drop view if exists crm.newsletter_popup_metrics;

alter table crm.newsletter_popup_events
  drop constraint if exists newsletter_popup_events_type_check;

alter table crm.newsletter_popup_events
  add constraint newsletter_popup_events_type_check
    check (event_type in ('eligible_session', 'impression', 'dismiss', 'subscribe'));

create or replace view crm.newsletter_popup_metrics as
select
  site_key,
  site_name,
  country_code,
  locale,
  popup_variant,
  popup_surface,
  popup_context,
  count(distinct session_id) filter (where event_type = 'eligible_session') as eligible_sessions,
  count(*) filter (where event_type = 'impression') as impressions,
  count(*) filter (where event_type = 'dismiss') as dismissals,
  count(*) filter (where event_type = 'subscribe') as subscriptions,
  max(created_at) as last_event_at
from crm.newsletter_popup_events
group by
  site_key,
  site_name,
  country_code,
  locale,
  popup_variant,
  popup_surface,
  popup_context;

create or replace function public.record_newsletter_popup_event(
  p_session_id text default null,
  p_impression_id uuid default null,
  p_event_type text default 'impression',
  p_popup_variant text default null,
  p_popup_surface text default null,
  p_popup_context text default null,
  p_trigger_type text default 'unknown',
  p_site_key text default null,
  p_site_name text default null,
  p_country_code text default null,
  p_locale text default null,
  p_page_path text default null,
  p_page_url text default null,
  p_referrer text default null,
  p_context_data jsonb default '{}'::jsonb,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, crm
as $$
begin
  if btrim(coalesce(p_site_key, '')) = '' then
    return;
  end if;

  if btrim(coalesce(p_popup_variant, '')) = '' or btrim(coalesce(p_popup_context, '')) = '' then
    return;
  end if;

  if p_event_type not in ('eligible_session', 'impression', 'dismiss', 'subscribe') then
    return;
  end if;

  insert into crm.newsletter_popup_events (
    session_id,
    impression_id,
    event_type,
    popup_variant,
    popup_surface,
    popup_context,
    trigger_type,
    site_key,
    site_name,
    country_code,
    locale,
    page_path,
    page_url,
    referrer,
    context_data,
    meta
  ) values (
    nullif(btrim(coalesce(p_session_id, '')), ''),
    p_impression_id,
    p_event_type,
    p_popup_variant,
    coalesce(nullif(btrim(coalesce(p_popup_surface, '')), ''), 'unknown'),
    p_popup_context,
    coalesce(nullif(btrim(coalesce(p_trigger_type, '')), ''), 'unknown'),
    p_site_key,
    nullif(btrim(coalesce(p_site_name, '')), ''),
    nullif(btrim(coalesce(p_country_code, '')), ''),
    nullif(btrim(coalesce(p_locale, '')), ''),
    nullif(btrim(coalesce(p_page_path, '')), ''),
    nullif(btrim(coalesce(p_page_url, '')), ''),
    nullif(btrim(coalesce(p_referrer, '')), ''),
    coalesce(p_context_data, '{}'::jsonb),
    coalesce(p_meta, '{}'::jsonb)
  );
end;
$$;

create or replace function public.subscribe_newsletter_popup(
  p_email text,
  p_session_id text default null,
  p_impression_id uuid default null,
  p_popup_variant text default null,
  p_popup_surface text default null,
  p_popup_context text default null,
  p_site_key text default null,
  p_site_name text default null,
  p_country_code text default null,
  p_locale text default null,
  p_page_path text default null,
  p_page_url text default null,
  p_referrer text default null,
  p_context_data jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, crm
as $$
declare
  v_email text;
begin
  v_email := lower(btrim(coalesce(p_email, '')));

  if v_email = '' or btrim(coalesce(p_site_key, '')) = '' then
    return;
  end if;

  insert into crm.newsletter_popup_subscriptions (
    email,
    site_key,
    site_name,
    country_code,
    locale,
    popup_variant,
    popup_surface,
    popup_context,
    impression_id,
    page_path,
    page_url,
    referrer,
    context_data,
    last_subscribed_at,
    updated_at
  ) values (
    v_email,
    p_site_key,
    nullif(btrim(coalesce(p_site_name, '')), ''),
    nullif(btrim(coalesce(p_country_code, '')), ''),
    nullif(btrim(coalesce(p_locale, '')), ''),
    nullif(btrim(coalesce(p_popup_variant, '')), ''),
    nullif(btrim(coalesce(p_popup_surface, '')), ''),
    nullif(btrim(coalesce(p_popup_context, '')), ''),
    p_impression_id,
    nullif(btrim(coalesce(p_page_path, '')), ''),
    nullif(btrim(coalesce(p_page_url, '')), ''),
    nullif(btrim(coalesce(p_referrer, '')), ''),
    coalesce(p_context_data, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (normalized_email, site_key) do update
    set email = excluded.email,
        site_name = excluded.site_name,
        country_code = excluded.country_code,
        locale = excluded.locale,
        popup_variant = excluded.popup_variant,
        popup_surface = excluded.popup_surface,
        popup_context = excluded.popup_context,
        impression_id = excluded.impression_id,
        page_path = excluded.page_path,
        page_url = excluded.page_url,
        referrer = excluded.referrer,
        context_data = excluded.context_data,
        subscription_count = crm.newsletter_popup_subscriptions.subscription_count + 1,
        last_subscribed_at = now(),
        updated_at = now();

  insert into crm.contact_consents (
    normalized_email,
    site_key,
    consent_type,
    consent_status,
    source,
    updated_at
  ) values (
    v_email,
    p_site_key,
    'news_updates',
    'explicit_opt_in',
    'newsletter_popup',
    now()
  )
  on conflict (normalized_email, site_key, consent_type) do update
    set consent_status = 'explicit_opt_in',
        source = 'newsletter_popup',
        updated_at = now();

  perform public.record_newsletter_popup_event(
    p_session_id := p_session_id,
    p_impression_id := p_impression_id,
    p_event_type := 'subscribe',
    p_popup_variant := p_popup_variant,
    p_popup_surface := p_popup_surface,
    p_popup_context := p_popup_context,
    p_trigger_type := 'submit',
    p_site_key := p_site_key,
    p_site_name := p_site_name,
    p_country_code := p_country_code,
    p_locale := p_locale,
    p_page_path := p_page_path,
    p_page_url := p_page_url,
    p_referrer := p_referrer,
    p_context_data := p_context_data,
    p_meta := '{}'::jsonb
  );
end;
$$;

grant execute on function public.record_newsletter_popup_event(
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb
) to anon, authenticated, service_role;

grant execute on function public.subscribe_newsletter_popup(
  text,
  text,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) to anon, authenticated, service_role;
