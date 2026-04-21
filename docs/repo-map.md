# Repo Map

## App shell

- `src/pages/index.astro` — market home.
- `src/pages/neighbors/` and `src/pages/en/neighbors/` — canonical neighboring-country browse pages for the default market.
- `src/layouts/BaseLayout.astro` — base page shell.
- `src/layouts/RaceListLayout.astro` — legacy-styled race list shell.
- `src/components/SiteHeader.astro` / `src/components/SiteFooter.astro` — shared chrome.

## Interactive islands

- `src/components/RaceListPageIsland.tsx` — main list UI, filters, pagination, map toggles, and card rendering.
- `src/components/RaceMapIsland.tsx` — Mapbox-backed map island fed by static markers JSON.

## Data and rendering

- `src/lib/content.ts` — YAML/content loading.
- `src/lib/raceListSsg.ts` — build-time page-1 list snapshot from Supabase or local JSON.
- `src/lib/raceListRow.ts` — list row typing and translation selection helpers.
- `src/lib/raceCardDisplay.ts` — race card formatting helpers.
- `src/lib/marketRoutes.ts` / `src/lib/marketRouteTargets.ts` — market-aware detail-link resolution and configured-market discovery.
- `src/lib/raceListConfig.ts` — list page size and related config.
- `src/lib/categoryFilterOptions.ts` — category filter derivation.
- `src/lib/supabase.ts` — browser Supabase setup.
- `src/lib/slugify.ts` — route slug generation.

## Styling

- `src/styles/legacy/` — ported legacy CSS for race-list surfaces.
- `src/styles/v2-race-list-bridge.css` — bridge styles between Astro/React output and legacy CSS.
- `src/styles/islands.css` — island-specific styling.

## Country content and seed inputs

- `data/countries/se/index.yaml` — Swedish copy and settings.
- `data/countries/se/merged_index_int.yaml` — English copy and settings for Sweden.
- `data/countries/se/final_races.json` / `final_races_int.json` — local seed inputs and SSG fallback data.
- `data/countries/se/distance_filter.yaml` — category/filter source data.
- [`browse-seo-matrix.md`](./browse-seo-matrix.md) — the canonical browse SEO subset and long-tail combination policy.

## Scripts and database

- `scripts/seed-races.mjs` — JSON to Supabase import.
- `scripts/export-markers.mjs` — marker export from the temporary build snapshot, DB, or JSON.
- `scripts/shell/` — wrapper scripts for Supabase login, link, db push, seed, and marker export.
- `supabase/migrations/` — schema and RPC migrations.
- `supabase/config.toml` — local Supabase config.

## Tests

- `tests/smoke.spec.ts` — local v2 smoke coverage.
- `tests/legacy/reference.spec.ts` — live legacy-site reference coverage.

## Legacy source

- `../race-aggregator` — sibling legacy repo used as the source for parity checks and migration reference.
