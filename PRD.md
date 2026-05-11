# Product requirements — Race Aggregator v2

## Goals

- Rebuild the legacy static Jinja site (`race-aggregator` repo) as an **Astro** app that stays **cheap at scale** and **reusable across markets**.
- **No hardcoded user-facing copy**: all UI strings come from per-country YAML under `data/countries/{code}/` (native `index.yaml`, English `merged_index_int.yaml` when present).
- **Hybrid data**: canonical races live in **Supabase** for anything that is not worth freezing at deploy time; the **map** uses **static** `public/markers-{country}.json` so the browser does not issue large repeated reads against Postgres for pins.

## Product north star

- **Primary objective:** modernize and replace the legacy site while preserving the user value that already works.
- **Commercial objective:** convert high-intent visitors into newsletter subscribers from the list, browse, and race detail surfaces.
- **Optimization priorities (in order):**
  1. **SEO leverage** (indexable route structure, strong metadata/schema, crawlable content model).
  2. **Cost efficiency** (SSG-first hot paths, bounded live reads, static marker payloads).
  3. **Client speed** (fast first paint, low interaction latency, progressive loading).
  4. **Flexibility** (modular architecture that can absorb new features and markets without rewrites).
- **Scalability target:** multi-country, multi-language rollout with minimal code duplication and YAML-driven configuration.

## SEO framework and references

- Primary guidance: Google Search Central SEO Starter Guide.
- Structured data vocabulary baseline: Schema.org (implement feature-specific types, not generic `Thing`, unless no better type exists).
- SEO implementation principle: every major route should have a defined intent, indexability policy, and structured-data contract.

### Rich snippet map (current + planned)

| Surface | Primary schema | Status | Notes |
|--------|-----------------|--------|-------|
| Race list (`/...race-list...` on the market domain, `/en/...` for English) | `ItemList` + `ListItem` | Implemented | Keep URLs stable and ensure list item names align with visible UI copy. |
| Race detail (`/.../{race_page_folder}/{domain_name}/`) | `Event` | Planned next | Highest-value schema for this project; include name, dates, location, organizer, url, image where available. |
| Site-level identity | `Organization` + `WebSite` | Planned | Add once core race routes stabilize; support sitename consistency and trust signals. |
| Breadcrumb trails | `BreadcrumbList` | Planned | Add on list/detail routes with canonical path hierarchy. |

## Non-goals (initial phases)

- Parity for forum, Firebase auth, and ads (tracked as later phases).
- Replacing Firebase-hosted images in seed JSON (URLs may remain as-is in `payload`).

## Architecture

| Layer | Responsibility |
|--------|-----------------|
| Astro SSG | Per-market routes, YAML-driven titles/copy, **pre-rendered first page** of each list surface (see below), **ItemList JSON-LD** + visually hidden crawlable links for page-1 races. |
| React islands | `RaceListPageIsland` (legacy-styled filters + cards + pagination + map/list toggles; page 1 unfiltered from SSG props; page 2+ and any filter via Supabase **RPC**), `RaceMapIsland` (Mapbox + clustered GeoJSON from static JSON; toolbar optional when parent supplies desktop toggle). |
| Supabase | `races` + `race_translations` (including translated detail-page fields such as `description`, `additional`, and `course_highlights`), RLS public read for published races only; **Publishable** key in the browser, **Secret** key only in seed/export/build-snapshot scripts (no legacy JWT anon key in app code). |
| CRM / Newsletter / Trending | Context-aware newsletter popups on list/browse/detail surfaces. Copy stays in country YAML, while eligible sessions, impressions, dismissals, subscriptions, and race-detail page views are written through RPCs into the `crm` schema for later reporting, future serving-methodology analysis, and homepage trending rankings. |
| Scripts | `scripts/seed-races.mjs` (JSON → DB), `scripts/export-markers.mjs` (temporary build snapshot, DB, or JSON → `public/markers-*.json`), `scripts/export-race-list-snapshots.mjs` (DB → temporary per-country build snapshot plus merged trending metrics), `scripts/build-with-race-list-snapshots.mjs` (snapshot-first build wrapper that also regenerates the active market's static markers asset from that same snapshot). Anonymous add-race submissions write directly from the browser to Supabase Storage + `public.race_submissions` via RLS-limited insert policies. |

### Market and locale routing model

- Production is market-scoped per domain, not country-prefixed.
- The market's native site lives at `/`.
- That same market's English site lives at `/en/`.
- Neighboring-country browse pages are canonical at `/neighbors/` and `/neighbors/{country}/`, with English equivalents at `/en/neighbors/` and `/en/neighbors/{country}/`.
- Neighbor-market surfaces should point at the neighboring market's English site, not a native country-prefixed path on the current host.
- Static race-detail generation is domestic-only for each market. Foreign rows shown on neighbor-market surfaces should link to the origin market's English detail page when that market is configured locally.
- Market-aware routing should discover configured markets from `data/countries/{code}/index.yaml` so new country folders join the routing model without code changes.

## Cost accounting (Supabase reads)

- **Before:** Two PostgREST requests per interaction (`count` head + `select` range).
- **Now:** One **`get_races_list_page`** RPC per interaction returns `{ total, rows }` with embedded `race_translations` (same shape as the list UI), sorted by earliest `race_dates` (nulls last) then `domain_name`. Grant `EXECUTE` to `anon` so the publishable client can call it under RLS.
- **Indexes:** Composite `races_country_published_type_idx` supports country + published + `race_type` filters; add expression indexes on first race date later if month/date filters become hot at scale.

## Race list UI parity (legacy)

- **Layout:** [RaceListLayout.astro](src/layouts/RaceListLayout.astro) — header, footer, and **ported CSS** from the legacy site (`src/styles/legacy/`, loaded only on race list routes) plus [v2-race-list-bridge.css](src/styles/v2-race-list-bridge.css) for islands and mobile map mode.
- **Assets:** `public/common_images/`, `public/icons/svg-sprite.svg` (copied from legacy) for cards and chrome.
- **Filters:** Date range, month chips, distance/category chips (from YAML `category_mapping`), county + race-type selects, browse link (stub path until browse routes exist).
- **Cards:** Legacy-style `race-card` markup, lazy-loaded placeholder images, links to `/[en/]{race_page_folder}/{domain_name}/` on the current market domain.
- **Map:** Single `RaceMapIsland` inside `.map-placeholder`; desktop show/hide via filter-bar toggle; mobile full-screen toggle via `body.race-list-mobile-map-open` (mirrors legacy behaviour).

## Race list: cost, speed, and SEO

**Intent:** The **default list view (page 1, no filters)** should be **fully pre-rendered at build time** and served from the CDN **without a client database round-trip**. That minimizes Supabase read cost for the majority of visitors who never paginate. **SEO:** each list page emits **schema.org `ItemList`** JSON-LD and a **visually hidden** `<nav>` of page-1 race links so crawlers see stable URLs and names without duplicating the interactive card grid in static HTML (full static cards remain a possible follow-up for LCP).

**Pagination and filters** require **live queries**: the client uses the **publishable** key and **`rpc('get_races_list_page', …)`**. Only users who change page or apply filters incur read cost.

**Build-time snapshot source** (`getRaceListFirstPageSnapshot` in `src/lib/raceListSsg.ts`):

1. `npm run build` first exports a temporary local snapshot for each country into `.cache/race-list-build-snapshots/`.
2. If **`SUPABASE_URL` (or `PUBLIC_SUPABASE_URL`) + `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`)** are set at build time, that export reads Supabase **once per country** and writes the snapshot locally.
3. That same export may also merge per-race 30-day race-detail page-view rankings into the local snapshot so homepage trending stays deployment-driven without route-level analytics reads.
4. Static race-list and browse routes must reuse the local snapshot for the rest of the build rather than issuing repeated live reads from route code.
5. If DB credentials are unavailable, build falls back to **`data/countries/{code}/final_races.json`** (+ int file for translations). No extra public JSON asset; data is **inlined into the page** at build only.

**Cost guardrail:** build-time Supabase usage should scale with the number of countries being built, not with the number of static routes. The correct model is **export once, reuse everywhere**.

**Caveat:** If production builds use JSON fallback while the live site uses Supabase, page 1 may **diverge** from page 2+ until the next deploy. **Mitigation:** supply server secrets in the build environment for release pipelines so the temporary build snapshot matches the DB.

**Without browser Supabase keys:** Page 1 still works from the build snapshot; **Next** and **filter** are disabled or show copy from `race_list_remote_required` in YAML (no runtime fallback fetch).

**Newsletter popup boundary:** newsletter capture also stays on the publishable browser client. Anonymous popup events and subscriptions must go through RLS-safe tables or security-definer RPCs only; never ship elevated keys for CRM capture. Production serving currently uses the standard popup methodology on every surface, while the CRM event model remains variant-capable for future experiments.

**Trending boundary:** race-detail page-view capture must follow that same browser-key rule. Detail pages record views through a publishable-key RPC, while deployment-time builds read only aggregated rankings through a server-side key and merge them into the temporary snapshot.

## Granular list routes (county / city / race type / month / category)

Legacy SEO uses dedicated URLs per county, city, type, etc. Category browse pages are now the first shipped slice in v2, using the same static-first pattern and a cache-aware SEO copy model. Broader county/city/type expansion should follow the same contract:

- **`getStaticPaths`** emits one static route per valid segment or valid combination (for example county pages, city pages, month pages, race-type pages, distance/category pages, and valid race-type + category pages).
- Each page pre-renders **the first page** of results for that segment from the temporary build snapshot (or seed JSON fallback), not by issuing repeated direct Supabase reads per route.
- **Further pages** for that segment use the same client Supabase pattern with query filters (`county`, `race_type`, …).
- Browse landing pages read `seo_content_cache*.json` first and fall back to deterministic template copy so the site can keep shipping even when AI copy is missing or intentionally reduced.
- That deterministic fallback copy must live in the market YAML files, not in route code, so native and English browse SEO can be edited by content changes rather than code edits.
- The cache-generation step must enumerate targets from the same local build snapshot used for SSG so SEO copy coverage matches the pages actually being built.
- Cache keys must be stable per browse intent so the same county, city, month, race type, category, or race-type + category page is not regenerated unnecessarily.
- Cache rebuilds must also remove obsolete keys and rewrite active aliases so old source-market seed copy cannot outlive the current market templates.
- Generated copy should be timeless in both native and English, avoid year-specific phrasing, and avoid claims that depend on transient race counts.
- Browse family thresholds and canonical subsets should live in market YAML under `browse_seo_indexing`, so future markets can tune indexability without code forks.
- Browse SEO should follow the canonical matrix in [`docs/browse-seo-matrix.md`](./docs/browse-seo-matrix.md): keep broad filter coverage for users, but index only the page families and combinations that clear intent, uniqueness, and inventory thresholds.
- Do not create multiple canonical browse families for the same practical intent. Examples to avoid are `10 km` vs `Millopp` vs `10000 meter`, or a separate distance-style page that duplicates a race-type page such as `Backyard Ultra`.

This keeps **hot paths cheap** (CDN + optional zero DB reads) while **long tail and interaction** stay on Supabase.

## Routing

- Public production routing is per-domain:
  - `/` — native market home.
  - `/{race-list-slug}/` — native race list (`slugify(navigation['race-list'], country)`).
  - `/en/` — English market home.
  - `/en/{race-list-slug}/` — English race list when `merged_index_int.yaml` exists.

## Internationalisation

- Native locale: strings from `index.yaml`; `country_language_code` drives `<html lang>` and which `race_translations` row is preferred in the list.
- English: strings from `merged_index_int.yaml`; list prefers `locale === 'en'` translations with fallbacks.
- English must be templated exactly like native copy. Do not hardcode English strings in components or pages.

## Map markers

- **Source of truth for pin positions**: regenerated JSON, not the paginated list DOM.
- **Regeneration**: run `npm run export-markers` (uses Supabase if `SUPABASE_SECRET_KEY` is set, otherwise `data/countries/{country}/final_races.json`).
- **Tradeoff**: pins can lag until the next export; acceptable for a race calendar. A later phase may add bounded live queries if needed.
- **CDN:** Prefer long cache lifetimes (or versioned filenames) for `markers-*.json` when hosting behind a CDN so repeat visitors do not re-fetch large files unnecessarily.

## Phased delivery

1. **Current**: Astro scaffold, YAML loading, schema, seed/export scripts, **legacy-styled race list** (SSG page 1 + RPC for filters/pagination), static markers, Sweden (sv/en). Repo guidance: [`AGENTS.md`](./AGENTS.md), [`architecture.md`](./architecture.md), plus the existing [`.cursor/`](.cursor/) migration notes.
2. **Current next slice**: Static category browse routes and category landing pages with cached SEO copy, plus the remaining browse/SEO list routes (county/city/type/month) and sitemap.
3. **Later**: Forum/auth expansion, marketplace, additional markets under `data/countries/`.

All future markets should use the same per-country build snapshot flow automatically. Do not introduce route-specific direct Supabase build reads when expanding to new countries.

## Operational notes

- **race-collector-v2** should upsert Supabase and trigger marker export + site rebuild (or upload `markers-*.json` to CDN) as part of its pipeline.
- Production deploy automation should live in GitHub Actions and target one Vercel project per live market. The launch registry belongs in `config/deploy-markets.json`, and market deploy jobs should fail independently rather than cancel sibling markets.
- **Production builds** should pass **Supabase URL + secret** so the temporary build snapshot matches the database; use JSON-only builds only for local/offline previews.
- Secrets: client bundle only `PUBLIC_SUPABASE_URL` + `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (and Mapbox). Elevated keys are for build scripts, CI, and seed—never shipped to the browser.
- Add-race submissions are intentionally anonymous in v2. Keep submission review/manual moderation on the backend table rather than re-introducing required login on the public form unless product requirements change.

## Agent browser tooling

- Install Playwright MCP or equivalent browser-driving tooling in your agent environment if you want interactive browser exploration during migration.
- Repository tests use `@playwright/test` directly (`npm run test:e2e`); MCP is optional tooling on top.
- **`npm run test:e2e:legacy-ref`** — opt-in project that opens the **live** legacy site (`LEGACY_SITE_URL`, default loppkartan.se) for migration reference; documented in [`AGENTS.md`](./AGENTS.md) and [`.cursor/skills/race-aggregator-legacy-reference/SKILL.md`](.cursor/skills/race-aggregator-legacy-reference/SKILL.md). Use for inspiration and regression of expected flows, not pixel-perfect coupling.

## SEO workflow guardrails

1. For every new indexable route template, define:
   - canonical URL pattern,
   - title/meta strategy from YAML,
   - schema type and required fields,
   - internal-link entry points.
2. Validate structured data and indexing assumptions during release QA (Search Console / Rich Results Test where applicable).
3. Prefer server-rendered, crawlable critical content for SEO landing surfaces; hydrate for interaction after content is present.
