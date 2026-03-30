create table if not exists public.race_submissions (
  id uuid primary key default gen_random_uuid(),
  site_key text not null,
  site_name text,
  country_code text not null,
  locale text not null,
  submitter_email text not null,
  name text not null,
  race_type text not null,
  start_date date not null,
  end_date date,
  is_multi_day boolean not null default false,
  start_time time,
  latitude double precision not null,
  longitude double precision not null,
  location_name text not null,
  distances jsonb not null default '[]'::jsonb,
  organizer_name text,
  organizer_website text,
  price_range text,
  summary text not null,
  additional_information text,
  image_paths jsonb not null default '[]'::jsonb,
  status text not null default 'pending_review',
  source text not null default 'public_form',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint race_submissions_end_date_check
    check (end_date is null or end_date >= start_date),
  constraint race_submissions_status_check
    check (status in ('pending_review', 'approved', 'rejected'))
);

create index if not exists race_submissions_country_created_idx
  on public.race_submissions (country_code, created_at desc);

create index if not exists race_submissions_status_created_idx
  on public.race_submissions (status, created_at desc);

alter table public.race_submissions enable row level security;

create policy "Anon can insert race submissions" on public.race_submissions
for insert
to anon
with check (
  btrim(coalesce(site_key, '')) <> ''
  and btrim(coalesce(country_code, '')) <> ''
  and btrim(coalesce(locale, '')) <> ''
  and btrim(coalesce(submitter_email, '')) <> ''
  and btrim(coalesce(name, '')) <> ''
  and btrim(coalesce(location_name, '')) <> ''
  and btrim(coalesce(summary, '')) <> ''
);

create policy "Authenticated can insert race submissions" on public.race_submissions
for insert
to authenticated
with check (
  btrim(coalesce(site_key, '')) <> ''
  and btrim(coalesce(country_code, '')) <> ''
  and btrim(coalesce(locale, '')) <> ''
  and btrim(coalesce(submitter_email, '')) <> ''
  and btrim(coalesce(name, '')) <> ''
  and btrim(coalesce(location_name, '')) <> ''
  and btrim(coalesce(summary, '')) <> ''
);

insert into storage.buckets (id, name, public)
values ('race-submissions', 'race-submissions', true)
on conflict (id) do update
  set public = excluded.public;

create policy "Anon can upload race submission images" on storage.objects
for insert
to anon
with check (bucket_id = 'race-submissions');

create policy "Authenticated can upload race submission images" on storage.objects
for insert
to authenticated
with check (bucket_id = 'race-submissions');
