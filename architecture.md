# Race Aggregator v2 Architecture

## Mission

Race Aggregator v2 replaces the legacy static Jinja site with an SEO-first Astro application optimized for:

1. Search visibility and crawlability
2. Infrastructure cost efficiency
3. Client-side speed
4. Extensibility across countries and languages

## Source of Truth

- UI copy: `data/countries/{code}/index.yaml`
- English copy: `data/countries/{code}/merged_index_int.yaml`
- Newsletter popup copy: `newsletter_popup` in the same per-country YAML files
- Canonical race data: Supabase
- Anonymous race submissions: `public.race_submissions` + Storage bucket `race-submissions`
- Newsletter popup events and subscriptions: `crm` schema in Supabase via RPC writes
- Build-time race-list snapshot: temporary JSON under `.cache/race-list-build-snapshots/` generated once per country for each build
- Build fallback data: `data/countries/{code}/final_races*.json`
- Map pins: `public/markers-{country}.json`

## Race List Contract

- The default race list page is pre-rendered at build time through `getRaceListFirstPageSnapshot`.
- `npm run build` must fetch race-list rows from Supabase at most once per country, write a temporary local snapshot, and force the rest of the build to reuse that snapshot.
- Build-time snapshot should prefer the temporary build snapshot when present, otherwise fall back to Supabase, otherwise local JSON.
- Page 2 and any filtered state should use one browser-side Supabase RPC call to `get_races_list_page`.
- The list route should preserve legacy CSS compatibility via `src/layouts/RaceListLayout.astro` and `src/styles/legacy/`.

## Data and Key Boundaries

- Browser code may use `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Secret or service-role keys are only for seed scripts, marker export, and one-time build snapshot export.
- Newsletter popups must stay inside the same browser-key boundary: anonymous capture goes through the publishable client and RPC/table boundaries only.
- Public add-race submissions must work with the browser publishable key only; do not require login as part of the submission flow.
- Map pins must remain static JSON, not live list-query output.
- Static generation must not fan out repeated live Supabase reads per route. Any large build-time read should be exported once and reused locally for the rest of the build.

## SEO Guardrails

- No indexable route ships without a defined canonical pattern, YAML-driven metadata strategy, and schema contract.
- Use route-specific schema types such as `ItemList`, `Event`, and `BreadcrumbList` where appropriate.
- Critical content for SEO landing pages should be present server-side before hydration.
- Category landing pages may use cached SEO copy from `data/countries/{code}/seo_content_cache*.json`, but must always have a deterministic YAML-template fallback so builds do not depend on live LLM generation.

## Market Expansion

- New markets should add `data/countries/{code}/` content, seed data, and marker exports.
- New markets should automatically participate in the one-snapshot-per-country build flow. Do not add market-specific direct Supabase reads inside route files.
- Any change to list behavior, routing, or schema should be reflected in [`PRD.md`](./PRD.md).
