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
- Race-detail page views for homepage trending: `crm.race_detail_page_views` via RPC writes
- Build-time race-list snapshot: temporary JSON under `.cache/race-list-build-snapshots/` generated once per country for each build
- Build fallback data: `data/countries/{code}/final_races*.json`
- Map pins: `public/markers-{country}.json`

## Race List Contract

- The default race list page is pre-rendered at build time through `getRaceListFirstPageSnapshot`.
- `npm run build` must fetch race-list rows from Supabase at most once per country, write a temporary local snapshot, and force the rest of the build to reuse that snapshot.
- The snapshot export may merge derived 30-day race-detail page-view rankings into the same local snapshot, but it must still do that aggregation once per country during the export step rather than from route files.
- `npm run build` should also rebuild missing browse SEO cache entries from that same temporary snapshot before Astro renders the static browse routes.
- Build-time snapshot should prefer the temporary build snapshot when present, otherwise fall back to Supabase, otherwise local JSON.
- Page 2 and any filtered state should use one browser-side Supabase RPC call to `get_races_list_page`.
- The list route should preserve legacy CSS compatibility via `src/layouts/RaceListLayout.astro` and `src/styles/legacy/`.

## Data and Key Boundaries

- Browser code may use `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Secret or service-role keys are only for seed scripts, marker export, and one-time build snapshot export.
- Newsletter popups must stay inside the same browser-key boundary: anonymous capture goes through the publishable client and RPC/table boundaries only, including serving-logic A/B metrics such as eligible sessions and impressions.
- Race-detail page-view tracking must stay inside that same browser-key boundary: detail pages record views through a publishable-key RPC, while deployment-time ranking export reads aggregated counts with a server-side key.
- Public add-race submissions must work with the browser publishable key only; do not require login as part of the submission flow.
- Map pins must remain static JSON, not live list-query output.
- Static generation must not fan out repeated live Supabase reads per route. Any large build-time read should be exported once and reused locally for the rest of the build.

## SEO Guardrails

- No indexable route ships without a defined canonical pattern, YAML-driven metadata strategy, and schema contract.
- Use route-specific schema types such as `ItemList`, `Event`, and `BreadcrumbList` where appropriate.
- Critical content for SEO landing pages should be present server-side before hydration.
- Browse landing pages may use cached SEO copy from `data/countries/{code}/seo_content_cache*.json`, but must always have a deterministic fallback so builds do not depend on live AI generation.
- SEO cache generation should cover county, city, month, race type, category, and valid race type + category pages in both native and English where English content exists.
- Cached copy should stay timeless and reusable; avoid year-specific language and avoid making claims that only hold for a single snapshot moment.
- Deterministic browse fallback copy should be YAML-driven per market under `seo_templates.browse_page_templates`, so the generator and page-level fallback share the same content source.
- Browse indexability rules should also be YAML-driven per market under `browse_seo_indexing`, so canonical subsets and thresholds can be tuned without route-code edits.
- Browse SEO should distinguish between the full filter taxonomy and the smaller canonical indexable SEO surface. Use the matrix in [`docs/browse-seo-matrix.md`](./docs/browse-seo-matrix.md) for which category labels, race types, and combinations should actually be indexed.
- Avoid canonical duplication across equivalent intents such as `10 km` vs `Millopp` or distance-style labels that duplicate race-type intent such as `Backyard Ultra`.

## Market Expansion

- Public deployment is one market per domain: native pages belong at `/`, and that market's English pages belong at `/en/`.
- Canonical neighboring-country browse pages belong at `/neighbors/` and `/neighbors/{country}/`, with English equivalents under `/en/neighbors/`.
- New markets should add `data/countries/{code}/` content, seed data, and marker exports.
- New markets should automatically participate in the one-snapshot-per-country build flow. Do not add market-specific direct Supabase reads inside route files.
- Neighbor-market linking should resolve to the neighboring market's English site, using that market's own YAML-driven site configuration rather than a country-prefixed path on the current host.
- Static race-detail routes should be generated only for domestic races in the current market snapshot. Foreign races shown in neighboring-country views should link to the origin market's English detail route when that market is configured locally.
- Market-aware routing should discover eligible markets from `data/countries/{code}/index.yaml` so adding a new country folder expands the route graph without hardcoded country logic.
- Any change to list behavior, routing, or schema should be reflected in [`PRD.md`](./PRD.md).
