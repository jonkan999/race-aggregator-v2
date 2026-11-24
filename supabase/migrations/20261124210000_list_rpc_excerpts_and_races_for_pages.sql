-- Cut list-RPC description bodies to the excerpt the cards render, and expose
-- a races_for_pages view whose payload omits bulky keys the sites never read
-- (nearby_foreign_cities, sources, website_emails_found, etc.).
-- Function name and parameters are unchanged. List cards already render at most
-- 170 characters of description, so shorter RPC descriptions stay compatible.
-- To restore the previous list RPC, apply supabase/backups/get_races_list_page_2026-11-24.sql.

create or replace function public.excerpt_json_text(value jsonb, max_len integer)
returns jsonb
language sql
immutable
parallel safe
as $$
  select case
    when value is null then null
    when max_len is null or max_len < 0 then value
    when jsonb_typeof(value) = 'string' then to_jsonb(left(value #>> '{}', max_len))
    when jsonb_typeof(value) = 'object' then (
      select coalesce(
        jsonb_object_agg(
          e.key,
          case
            when jsonb_typeof(e.value) = 'string' then to_jsonb(left(e.value #>> '{}', max_len))
            else e.value
          end
        ),
        '{}'::jsonb
      )
      from jsonb_each(value) as e
    )
    else value
  end
$$;

create or replace function public.race_payload_for_pages(payload jsonb)
returns jsonb
language sql
immutable
parallel safe
as $$
  select case
    when payload is null then null
    else jsonb_strip_nulls(
      jsonb_build_object(
        'images', payload -> 'images',
        'supplied_images', payload -> 'supplied_images',
        'supplied_at', payload -> 'supplied_at',
        'supplied_ids', payload -> 'supplied_ids',
        'nearest_city', payload -> 'nearest_city',
        'nearby_cities', payload -> 'nearby_cities',
        'location', payload -> 'location',
        'description', payload -> 'description',
        'additional', payload -> 'additional',
        'additional_info', payload -> 'additional_info',
        'course_highlights', payload -> 'course_highlights',
        'type_local', payload -> 'type_local',
        'distance_verbose', payload -> 'distance_verbose',
        'name', payload -> 'name',
        'organizer', payload -> 'organizer',
        'contact', payload -> 'contact',
        'website', payload -> 'website',
        'registration_url', payload -> 'registration_url',
        'race_info_url', payload -> 'race_info_url',
        'start_time', payload -> 'start_time',
        'price_range', payload -> 'price_range',
        'price_tiers', payload -> 'price_tiers',
        'registration_close_date', payload -> 'registration_close_date',
        'is_series', payload -> 'is_series',
        'fb_link', payload -> 'fb_link',
        'ig_link', payload -> 'ig_link',
        'estimated_dates', payload -> 'estimated_dates',
        'date_status', payload -> 'date_status',
        'created_date', payload -> 'created_date',
        'distances', payload -> 'distances',
        'distance_keywords', payload -> 'distance_keywords',
        'distance_m', payload -> 'distance_m',
        'analytics', payload -> 'analytics'
      )
    )
  end
$$;

drop view if exists public.races_for_pages;

create view public.races_for_pages
  with (security_invoker = true) as
select
  id,
  country_code,
  latitude,
  longitude,
  race_dates,
  county,
  race_type,
  distance_m,
  website,
  organizer,
  contact,
  origin_country,
  public.race_payload_for_pages(payload) as payload,
  published,
  created_at,
  updated_at,
  domain_name
from public.races;

grant execute on function public.excerpt_json_text(jsonb, integer) to anon, authenticated, service_role;
grant execute on function public.race_payload_for_pages(jsonb) to anon, authenticated, service_role;
grant select on public.races_for_pages to anon, authenticated, service_role;

create or replace function public.get_races_list_page (
  p_country_code text,
  p_page integer default 1,
  p_page_size integer default 20,
  p_county text default null,
  p_race_type text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_month integer default null,
  p_distance_min_km double precision default null,
  p_distance_max_km double precision default null,
  p_origin_country text default null,
  p_include_neighboring boolean default false,
  p_neighbor_countries text[] default null
) returns json
language sql
stable
security invoker
set search_path = public
as $$
with
  filtered as (
    select
      r.*
    from
      public.races r
    where
      r.country_code = p_country_code
      and r.published = true
      and (
        (
          coalesce(p_include_neighboring, false) = false
          and (
            p_origin_country is null
            or btrim(p_origin_country) = ''
          )
          and coalesce(cardinality(p_neighbor_countries), 0) = 0
          and coalesce(nullif(btrim(r.origin_country), ''), p_country_code) = p_country_code
          and (
            p_county is null
            or btrim(p_county) = ''
            or r.county ilike '%' || p_county || '%'
          )
        )
        or (
          (
            coalesce(p_include_neighboring, false) = true
            or (
              p_origin_country is not null
              and btrim(p_origin_country) <> ''
            )
          )
          and nullif(btrim(r.origin_country), '') is not null
          and btrim(r.origin_country) <> p_country_code
          and (
            p_origin_country is null
            or btrim(p_origin_country) = ''
            or r.origin_country = p_origin_country
          )
        )
        or (
          coalesce(p_include_neighboring, false) = false
          and (
            p_origin_country is null
            or btrim(p_origin_country) = ''
          )
          and coalesce(cardinality(p_neighbor_countries), 0) > 0
          and (
            (
              coalesce(nullif(btrim(r.origin_country), ''), p_country_code) = p_country_code
              and (
                p_county is null
                or btrim(p_county) = ''
                or r.county ilike '%' || p_county || '%'
              )
            )
            or (
              nullif(btrim(r.origin_country), '') is not null
              and lower(btrim(r.origin_country)) in (
                select
                  lower(btrim(code))
                from
                  unnest(p_neighbor_countries) as code
                where
                  nullif(btrim(code), '') is not null
              )
            )
          )
        )
      )
      and (
        p_race_type is null
        or btrim(p_race_type) = ''
        or r.race_type = p_race_type
      )
      and (
        p_month is null
        or exists (
          select
            1
          from
            jsonb_array_elements(r.race_dates) as e (elem)
          where
            elem->>0 is not null
            and length(trim(elem->>0)) >= 8
            and extract(
              month
              from
                to_date(substring(elem->>0 from 1 for 8), 'YYYYMMDD')
            )::int = p_month
        )
      )
      and (
        (
          p_date_from is null
          and p_date_to is null
        )
        or exists (
          select
            1
          from
            jsonb_array_elements(r.race_dates) as e (elem)
          where
            elem->>0 is not null
            and length(trim(elem->>0)) >= 8
            and to_date(substring(elem->>0 from 1 for 8), 'YYYYMMDD')
              between coalesce(p_date_from, '-infinity'::date)
              and coalesce(p_date_to, 'infinity'::date)
        )
      )
      and (
        (
          p_distance_min_km is null
          and p_distance_max_km is null
        )
        or (
          r.distance_m is not null
          and jsonb_typeof(r.distance_m) = 'array'
          and jsonb_array_length(r.distance_m) > 0
          and exists (
            select
              1
            from
              jsonb_array_elements(r.distance_m) as e (elem)
            where
              (elem::text)::double precision / 1000.0 >= coalesce(p_distance_min_km, 0)
              and (elem::text)::double precision / 1000.0 <= coalesce(p_distance_max_km, 1e9)
          )
        )
      )
  ),
  filtered_with_sort_key as (
    select
      f.*,
      k.first_race_date
    from
      filtered f
      left join lateral (
        select
          min(candidate.race_date) as first_race_date
        from
          (
            select
              to_date(substring(e.elem->>0 from 1 for 8), 'YYYYMMDD') as race_date
            from
              jsonb_array_elements(f.race_dates) as e (elem)
            where
              e.elem->>0 is not null
              and length(trim(e.elem->>0)) >= 8
          ) candidate
        where
          (
            p_date_from is null
            and p_date_to is null
          )
          or candidate.race_date between coalesce(p_date_from, '-infinity'::date)
          and coalesce(p_date_to, 'infinity'::date)
      ) k on true
  ),
  tot as (
    select
      count(*)::bigint as c
    from
      filtered_with_sort_key
  ),
  lim as (
    select
      least(greatest(coalesce(p_page_size, 20), 1), 100) as ps
  ),
  off as (
    select
      greatest(
        0,
        (greatest(coalesce(p_page, 1), 1) - 1) * (
          select
            ps
          from
            lim
        )
      ) as o
  ),
  page as (
    select
      f.*
    from
      filtered_with_sort_key f
    order by
      f.first_race_date asc nulls last,
      f.domain_name asc
    limit (
      select
        ps
      from
        lim
    )
    offset (
      select
        o
      from
        off
    )
  )
select
  json_build_object(
    'total',
    (
      select
        c
      from
        tot
    ),
    'rows',
    coalesce(
      (
        select
          json_agg(row_data order by first_race_date asc nulls last, domain_name asc)
        from
          (
            select
              p.first_race_date,
              p.domain_name,
              json_build_object(
                'id',
                p.id,
                'domain_name',
                p.domain_name,
                'county',
                p.county,
                'race_type',
                p.race_type,
                'origin_country',
                p.origin_country,
                'race_dates',
                p.race_dates,
                'latitude',
                p.latitude,
                'longitude',
                p.longitude,
                'distance_m',
                p.distance_m,
                'website',
                p.website,
                'payload',
                case
                  when p.payload is null then null
                  else json_build_object(
                    'images', p.payload -> 'images',
                    'supplied_images', p.payload -> 'supplied_images',
                    'supplied_at', p.payload -> 'supplied_at',
                    'supplied_ids', p.payload -> 'supplied_ids',
                    'nearest_city', p.payload -> 'nearest_city',
                    'nearby_cities', p.payload -> 'nearby_cities',
                    'location', p.payload -> 'location',
                    'description', public.excerpt_json_text(p.payload -> 'description', 200)
                  )
                end,
                'race_translations',
                coalesce(t.trs, '[]'::json)
              ) as row_data
            from
              page p
              left join lateral (
                select
                  json_agg(
                    json_build_object(
                      'locale',
                      rt.locale,
                      'name',
                      rt.name,
                      'type_local',
                      rt.type_local,
                      'distance_verbose',
                      rt.distance_verbose,
                      'description',
                      left(rt.description, 200)
                    )
                    order by
                      rt.locale
                  ) as trs
                from
                  race_translations rt
                where
                  rt.race_id = p.id
              ) t on true
          ) sub
      ),
      '[]'::json
    )
  );
$$;

revoke all on function public.get_races_list_page (
  text, integer, integer, text, text, date, date, integer, double precision, double precision, text, boolean, text[]
) from public;

grant execute on function public.get_races_list_page (
  text, integer, integer, text, text, date, date, integer, double precision, double precision, text, boolean, text[]
) to anon, authenticated, service_role;
