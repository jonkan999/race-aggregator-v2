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
- Canonical race data: Supabase
- Build fallback data: `data/countries/{code}/final_races*.json`
- Map pins: `public/markers-{country}.json`

## Race List Contract

- The default race list page is pre-rendered at build time through `getRaceListFirstPageSnapshot`.
- Build-time snapshot should prefer Supabase when URL + secret credentials are available, otherwise fall back to local JSON.
- Page 2 and any filtered state should use one browser-side Supabase RPC call to `get_races_list_page`.
- The list route should preserve legacy CSS compatibility via `src/layouts/RaceListLayout.astro` and `src/styles/legacy/`.

## Data and Key Boundaries

- Browser code may use `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Secret or service-role keys are only for seed scripts, marker export, and build-time DB snapshots.
- Map pins must remain static JSON, not live list-query output.

## SEO Guardrails

- No indexable route ships without a defined canonical pattern, YAML-driven metadata strategy, and schema contract.
- Use route-specific schema types such as `ItemList`, `Event`, and `BreadcrumbList` where appropriate.
- Critical content for SEO landing pages should be present server-side before hydration.

## Market Expansion

- New markets should add `data/countries/{code}/` content, seed data, and marker exports.
- Any change to list behavior, routing, or schema should be reflected in [`PRD.md`](./PRD.md).
