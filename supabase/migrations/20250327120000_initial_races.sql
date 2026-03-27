-- Race calendar core tables (multi-market, i18n via race_translations)

create table public.races (
  id uuid primary key default gen_random_uuid (),
  country_code text not null,
  domain_name text not null,
  latitude double precision,
  longitude double precision,
  race_dates jsonb not null default '[]'::jsonb,
  county text,
  race_type text,
  distance_m jsonb,
  website text,
  organizer text,
  contact text,
  origin_country text,
  payload jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint races_country_domain_unique unique (country_code, domain_name)
);

create table public.race_translations (
  race_id uuid not null references public.races (id) on delete cascade,
  locale text not null,
  name text,
  description text,
  type_local text,
  distance_verbose text,
  primary key (race_id, locale)
);

create index races_country_published_idx on public.races (country_code, published);

create index races_county_idx on public.races (county);

alter table public.races enable row level security;

alter table public.race_translations enable row level security;

create policy "Public read published races" on public.races for
select
  using (published = true);

create policy "Public read translations for published races" on public.race_translations for
select
  using (
    exists (
      select
        1
      from
        public.races r
      where
        r.id = race_translations.race_id
        and r.published = true
    )
  );
