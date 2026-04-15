# Race Aggregator v2

Astro + Supabase rebuild of the legacy `race-aggregator` static site: YAML-driven copy, dynamic race list from Postgres (single RPC per interaction), map pins from static per-country JSON for low database read cost. The **race list** route uses ported legacy CSS and layout ([`src/layouts/RaceListLayout.astro`](src/layouts/RaceListLayout.astro), [`src/styles/legacy/`](src/styles/legacy/)).

Public routing is market-scoped per domain: the native site lives at `/`, and the fully translated English site for that same market lives at `/en/`.

Neighboring-country browse pages follow the legacy-style canonical structure at `/neighbors/` and `/en/neighbors/`. Those pages may list foreign races, but static race detail pages are generated only for the current market's domestic races. When a foreign race belongs to another configured market in `data/countries/{code}/index.yaml`, links resolve to that market's English race-detail route on its own domain automatically.

## North Star

- Modernize and replace the legacy site with an **SEO-first** architecture.
- Optimize continuously for **cost efficiency**, **client-side speed**, and **flexibility**.
- Keep the system extensible for **new features**, **new countries**, and **new languages** with minimal duplication.

### SEO references used in this project

- Google Search Central SEO Starter Guide (baseline technical/content practice).
- Schema.org (structured-data vocabulary; use route-appropriate types such as `ItemList` and `Event` rather than generic fallback where possible).

## Prerequisites

- Node 20+
- A Supabase project (optional for **page 2+ / filters** in the browser; page 1 is pre-rendered at build time—see below)
- A Mapbox public access token (for the map island)

## Setup

```bash
npm install
cp .env.example .env
# Fill PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...), PUBLIC_MAPBOX_TOKEN
# For seeding / DB export-markers only: SUPABASE_SECRET_KEY (sb_secret_...)
```

### Database

The **Supabase CLI** is a dev dependency (`supabase` in `package.json`). There is no `supabase` on your shell `PATH` unless you install the CLI globally—the helpers below run **`npx supabase`** from the repo root.

Apply new SQL (including **`get_races_list_page`**) whenever you add migrations: `db push` or paste from [`supabase/migrations/`](supabase/migrations/).

#### Shell helpers ([`scripts/shell/`](scripts/shell/))

From the repo root (make them executable once: `chmod +x scripts/shell/*.sh`):

| Script | Purpose |
|--------|---------|
| [`scripts/shell/supabase-login.sh`](scripts/shell/supabase-login.sh) | `npx supabase login` — opens the browser and stores a personal access token |
| [`scripts/shell/supabase-link.sh`](scripts/shell/supabase-link.sh) | `npx supabase link --project-ref <ref>` |
| [`scripts/shell/supabase-db-push.sh`](scripts/shell/supabase-db-push.sh) | `npx supabase db push` — applies [`supabase/migrations/`](supabase/migrations/) to the linked project |

Example:

```bash
./scripts/shell/supabase-login.sh
./scripts/shell/supabase-link.sh <your-project-ref>
./scripts/shell/supabase-db-push.sh
```

Or paste the contents of [`supabase/migrations/`](supabase/migrations/) into the Supabase Dashboard **SQL Editor** and run it manually (no CLI).

**Order matters:** run **`supabase-login.sh`** first. If you skip login, `link` fails with *Access token not provided*. For CI, use a token from [Account → Access Tokens](https://supabase.com/dashboard/account/tokens) and set **`SUPABASE_ACCESS_TOKEN`** in the job environment (do not commit it).

**`db push` says “Cannot find project ref”:** run **`supabase-link.sh`** successfully once; that writes `.supabase/` (gitignored) linking this folder to the remote project.

More detail: [Supabase CLI](https://supabase.com/docs/guides/cli/getting-started).

### Seed races (optional)

Loads `data/countries/{code}/final_races.json` and `final_races_int.json` for the selected market. Put **`SUPABASE_SECRET_KEY`** in `.env` (or export it); the script sources `.env` when present.

```bash
./scripts/shell/seed-races.sh se
```

Equivalent: `npm run seed-races -- se` (with env vars set yourself).

To replace all existing races for one market before importing the new export:

```bash
./scripts/shell/seed-races.sh se --replace
```

Equivalent: `npm run seed-races -- se --replace`.

### Map markers file

Regenerate `public/markers-se.json` (committed for convenience; refresh after data changes):

```bash
./scripts/shell/export-markers.sh se
```

Equivalent: `npm run export-markers -- se`. Without DB credentials, the script reads `data/countries/{code}/final_races.json` only.

### Race list: static first page + Supabase RPC for interaction

At **`astro dev`**, the first page of the main calendar is filled from:

1. **Supabase** if `SUPABASE_URL` (or `PUBLIC_SUPABASE_URL`) and `SUPABASE_SECRET_KEY` are set in the environment (recommended for production CI so HTML matches the DB), or  
2. Otherwise **`data/countries/{code}/final_races.json`** (and int file)—inlined into the page, no extra public JSON.

At **`npm run build`**, the repo now uses a snapshot-first flow:

1. Export all race rows once per country into a temporary local directory under `.cache/race-list-build-snapshots/`
2. Merge the latest 30-day race-detail page-view rankings into that same local snapshot
3. Regenerate missing browse SEO cache entries from that same local snapshot before Astro renders pages
4. Reuse the snapshot for every static list/browse page during the build
5. Remove the temporary snapshot directory after the build finishes

This keeps build-time Supabase egress roughly proportional to the number of countries being built, rather than the number of generated routes.

In the browser, **pagination** and **filters** (dates, month, distance/category, county, race type) call **`get_races_list_page`** once per change (returns total + rows with translations). If `PUBLIC_SUPABASE_*` keys are missing, page 1 still works; further pages and filtering show copy from `race_list_remote_required` in YAML.

### Newsletter capture popups

- Popup copy is YAML-driven under `data/countries/{code}/` via `newsletter_popup`.
- The current popup surfaces are the race list, browse/listing pages, and race detail pages.
- Browser tracking uses the publishable Supabase client and two RPCs:
  - `record_newsletter_popup_event` for impressions and dismissals
  - `subscribe_newsletter_popup` for subscriptions
- CRM data lives in the `crm` schema:
  - `crm.newsletter_popup_events`
  - `crm.newsletter_popup_subscriptions`
  - `crm.newsletter_popup_metrics` view for grouped counts
- Trending race tracking also lives in `crm`:
  - `crm.race_detail_page_views`
  - `record_race_detail_page_view` for browser-side detail page hits
  - `get_race_detail_page_view_rankings` for build-time ranking export
- The homepage ranks trending races from raw 30-day page views and displays a boosted count using `ceil(raw * 1.5)`.
- Popup serving logic now supports A/B testing:
  - `standard` serves with the current time/scroll heuristics
  - `delayed_second_page` waits until page view two and uses deeper engagement thresholds
- Metrics are intended to be compared as a funnel by serving variant:
  - eligible sessions
  - popup impressions
  - subscriptions
- Popup suppression is intentionally stateful:
  - never again after a successful subscription in the browser
  - never twice in the same session
  - cooldown after a show or dismissal before another popup may appear
- iOS Safari uses a fixed body-appended overlay plus a delayed first-tap fallback trigger to reduce missed popup opens on touch devices.

### Legacy UI assets

Static files under [`public/common_images/`](public/common_images/) and [`public/icons/svg-sprite.svg`](public/icons/svg-sprite.svg) are copied from the legacy `race-aggregator` repo for card images and icons. Refresh them if the legacy site updates shared artwork.

### Agent workflow

- Codex repo guide: [`AGENTS.md`](./AGENTS.md) — migration workflow, repo guardrails, and legacy-reference notes.
- Architecture reference: [`architecture.md`](./architecture.md) — non-negotiables for keys, YAML, map JSON, SSG, and SEO.
- Cursor migration docs remain available under [`.cursor/`](.cursor/) as historical project tooling references.

**Supabase API keys:** This project uses the current **Publishable** key in the browser (`PUBLIC_SUPABASE_PUBLISHABLE_KEY`), not the legacy JWT **anon** key. Scripts use a **Secret** key (`SUPABASE_SECRET_KEY`). See [Supabase API keys](https://supabase.com/docs/guides/api/api-keys).

## Develop

```bash
npm run dev
```

- Native list: [http://127.0.0.1:4321/loppkalender/](http://127.0.0.1:4321/loppkalender/)
- English list: [http://127.0.0.1:4321/en/race-calendar/](http://127.0.0.1:4321/en/race-calendar/)
- Native browse overview: [http://127.0.0.1:4321/loppkalender/bladdra-efter-kategori/](http://127.0.0.1:4321/loppkalender/bladdra-efter-kategori/)
- Example category landing page: [http://127.0.0.1:4321/loppkalender/bladdra-efter-kategori/categories/10-km/](http://127.0.0.1:4321/loppkalender/bladdra-efter-kategori/categories/10-km/)
- Add race: [http://127.0.0.1:4321/lagg-till-lopp/](http://127.0.0.1:4321/lagg-till-lopp/)

## Build

```bash
npm run build
npm run preview
```

`npm run build` now regenerates `dist/sitemap.xml` from the canonical built HTML routes, so `/neighbors/*` entries and market-specific race-detail URLs stay aligned with the actual Astro output.

If you want the raw Astro build without the snapshot wrapper:

```bash
npm run build:astro
```

You can also export snapshots directly:

```bash
npm run export-race-list-snapshots -- se
```

Rebuild the browse SEO cache manually:

```bash
npm run build-browse-seo-cache -- se
```

If you put `OPENAI_API_KEY` in a local ignored env file such as `.env.local`, `npm run build` will automatically prefer generated browse SEO for the active market and then reuse the cached entries on later builds. New browse combinations are generated only when they first appear or when the cache is intentionally refreshed.

Force-regenerate the current market cache with deterministic timeless copy:

```bash
npm run build-browse-seo-cache -- --force --provider=template se
```

If you want AI generation for cache misses or forced refreshes, set `OPENAI_API_KEY` and run with `--provider=openai`.

The browse SEO model is configured per market under `seo_generation.browse_model` in the country YAML files. This repo currently uses `gpt-5-mini` for browse SEO generation in those market configs. If no market config sets a model, the script falls back to `gpt-5-nano`.

For one-off overrides, `OPENAI_SEO_MODEL` or `--model=...` still take precedence over the YAML setting.

Browse fallback copy is YAML-driven. Keep the browse-page template strings in `data/countries/{code}/index.yaml` and `data/countries/{code}/merged_index_int.yaml` under `seo_templates.browse_page_templates`, and let both the generator and the route fallback read from there instead of hardcoding copy in code.

Browse SEO expansion should follow the canonical matrix in [`docs/browse-seo-matrix.md`](./docs/browse-seo-matrix.md). In particular, keep the full browse/filter taxonomy available in UX, but only index the canonical subsets and combinations that clear the documented intent and inventory thresholds.

The indexing logic is now market-configurable under `browse_seo_indexing` in each market YAML. That block controls which browse families are indexable, the minimum race-count thresholds, and which race types or category keys are allowed for standalone and combo pages.

## Deploy To Vercel

This repo now builds one active market per deploy. Set `MARKET_CODE={cc}` so the selected market owns `/` and `/en/`.

[`vercel.json`](./vercel.json) pins the expected Vercel behavior for this repo:

- install command: `npm install`
- build command: `npm run build`
- output directory: `dist`

### Production deploy model

- One Vercel project per live market
- One GitHub Actions workflow at [`.github/workflows/deploy-markets.yml`](./.github/workflows/deploy-markets.yml)
- One repo-owned launch registry at [`config/deploy-markets.json`](./config/deploy-markets.json)
- Independent deploy jobs per market with `strategy.fail-fast: false`, so one market can fail without canceling the rest

The workflow reads `config/deploy-markets.json`, resolves the enabled markets, and runs a fresh Vercel build/deploy job for each market. Keep non-launch-ready folders such as `data/countries/int` out of the deploy registry.

### Initial registry setup

[`config/deploy-markets.json`](./config/deploy-markets.json) ships with `se` and `cz` entries plus placeholder Vercel project IDs. Replace:

- `REPLACE_WITH_VERCEL_PROJECT_ID_SE`
- `REPLACE_WITH_VERCEL_PROJECT_ID_CZ`

before relying on the workflow for production deploys. Until you do, the workflow will skip those markets and emit a warning instead of trying to deploy to a fake project.

### Vercel project setup

For each live market project in Vercel:

1. In Supabase, apply all SQL from [`supabase/migrations/`](./supabase/migrations/) so the list RPC, newsletter RPCs, and add-race submission tables/policies exist.
2. Sync the market from `race-collector-v2` and confirm the production canonical domain in `data/countries/{cc}/index.yaml` under `base_url`.
3. Create or reuse one Vercel project for that market. The project can use the Astro preset, or no preset at all because `vercel.json` already defines the build/output contract.
4. Add production environment variables in that Vercel project:
   `MARKET_CODE`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_MAPBOX_TOKEN`, and `SUPABASE_SECRET_KEY`.
5. Set `MARKET_CODE` to the market code that project owns, for example `se` or `cz`.
6. Attach the market's custom domain to that same Vercel project.
7. Treat `SUPABASE_SECRET_KEY` as required for release builds even though the build can technically fall back to local JSON without it. With the secret present, the build exports one fresh race snapshot per market from Supabase so static page 1 stays aligned with the live DB.
8. Whenever map data changes, regenerate and commit `public/markers-{country}.json` for the active market before deploying.

For the current Swedish project, reuse the existing project and switch production ownership to GitHub Actions. Disable duplicate production deploys from Vercel's Git integration once the workflow is ready, otherwise `main` can ship twice.

### GitHub Actions setup

The workflow expects:

- GitHub secret: `VERCEL_TOKEN`
- GitHub variable or secret: `VERCEL_ORG_ID`

`VERCEL_PROJECT_ID` is read per market from [`config/deploy-markets.json`](./config/deploy-markets.json), not from one shared repository secret.

The deploy flow per market is:

1. `actions/checkout`
2. `npm ci`
3. `npm install --global vercel@latest`
4. `vercel pull --yes --environment=production`
5. `vercel build --prod`
6. `vercel deploy --prebuilt --archive=tgz --prod`

Each market runs in its own isolated GitHub Actions job so generated route wrappers and `.vercel/` state never leak across builds.

The deploy step uses `--archive=tgz` intentionally so Vercel receives the prebuilt output as a single compressed upload. That avoids free-plan file-upload rate limits such as `api-upload-free` when large Astro/Vercel outputs would otherwise be sent as thousands of individual files.

### Manual deploys and retries

- Push to `main`: deploy all enabled markets in [`config/deploy-markets.json`](./config/deploy-markets.json)
- Manual dispatch: run the `Deploy Markets` workflow and optionally pass `marketCode=se` or `marketCode=cz`
- Re-run one failed market: use the same manual dispatch input so the retry only touches that market's Vercel project

### Local verification before shipping

Verify the market locally before letting CI ship it:

```bash
npm run validate:content -- cz
MARKET_CODE=cz npm run build
MARKET_CODE=cz npm run test:e2e
```

Use the same pattern for any other market code.

For local development against collector-owned market data before syncing it into this repo, set `MARKET_DATA_ROOT=/abs/path/to/race-collector-v2/data/countries` and run a separate dev server per market with the desired `MARKET_CODE`.

Native auxiliary route slugs are derived from the active market's synced YAML at startup/build time. That means markets can own native URLs such as `/o-nas/`, `/kontakt/`, or `/pridat-zavod/` without hand-editing route code in this repo. The generated alias routes keep the old template paths reachable for compatibility, but those alias pages should canonicalize back to the market-owned slug and stay `noindex`.

## Add race submissions

- The add-race page is a static Astro route with a hydrated React form island and a legacy-style Leaflet map.
- Submissions are intentionally anonymous: users do not need to log in before sending a race.
- Uploaded images go to the Supabase Storage bucket `race-submissions`.
- Form rows go to the `public.race_submissions` table with `pending_review` status by default.
- Apply the corresponding migration before testing real submissions:

```bash
./scripts/shell/supabase-db-push.sh
```

## Tests

```bash
npx playwright install
npm run test:e2e
```

**Legacy production reference (migration only):** hits the live legacy calendar (default `https://loppkartan.se/`) with no local server — useful while aligning v2 cards and filters. Override with `LEGACY_SITE_URL` if needed.

```bash
npm run test:e2e:legacy-ref
```

Details: [`AGENTS.md`](./AGENTS.md) and [`.cursor/skills/race-aggregator-legacy-reference/SKILL.md`](.cursor/skills/race-aggregator-legacy-reference/SKILL.md).

Playwright starts a server automatically: by default it runs **`npm run build`** then **`astro preview`** on `127.0.0.1:4321` (waits until `/loppkalender/` responds). That avoids `astro dev` subprocess issues where the readiness check never passes.

Optional:

- **`PW_FAST=1 npm run test:e2e`** — use `astro dev` instead (faster if build is already warm; may need a longer first compile).
- **`PW_SKIP_WEB_SERVER=1 npm run test:e2e`** — you already have `npm run dev` (or preview) running on the same host/port.
- **`PLAYWRIGHT_BASE_URL`** / **`PW_HOST`** / **`PW_PORT`** — override the base URL and bind address.

Mapbox is optional for smoke tests (the map shows a YAML message if `PUBLIC_MAPBOX_TOKEN` is empty).

## Content layout

- `data/countries/{code}/index.yaml` — native language strings and config (include **`alternate_locale_link_text`** for the nav link to the English list when `merged_index_int.yaml` exists).
- `data/countries/{code}/merged_index_int.yaml` — English strings for that market (same key for the link back to the native list).
- `data/countries/{code}/final_races*.json` — seed/export inputs (managed long-term by **race-collector-v2**).
- `data/countries/{code}/json/training_plans_processed_{locale}.json` — collector-owned training-plan payloads. When a market exposes training plans in YAML, ship both the native-language file and `training_plans_processed_en.json` through the collector sync.
- `data/countries/{code}/seo_content_cache*.json` — cached SEO title/meta/H1/intro overrides for browse landings (county, city, month, race type, distance/category, and valid race type + category combinations). Missing entries fall back to deterministic template copy. Rebuilds prune obsolete keys, refresh stale generator versions, and rewrite current aliases so old market-seed copy cannot silently survive.

In the intended workflow, those market files are collector-owned sync artifacts. Keep launched markets here, but avoid treating this repo as the editing surface for onboarding or in-progress market content.

Adding a new `data/countries/{code}/index.yaml` market makes it eligible for market-aware routing helpers automatically. If that market also has `merged_index_int.yaml`, neighboring-country links can route straight to its English detail pages without hardcoded country cases.

Refresh missing browse-cache entries without regenerating existing overrides:

```bash
npm run build-browse-seo-cache -- se
```

## Agent browser tooling

Playwright MCP or similar browser-driving tooling is optional agent infrastructure. Repository verification still runs through `npm run test:e2e`, and legacy-site reference work still runs through `npm run test:e2e:legacy-ref`.

## See also

- [PRD.md](./PRD.md) — architecture decisions and phases.
- [AGENTS.md](./AGENTS.md) — Codex-oriented repo workflow and migration checklist.
- [architecture.md](./architecture.md) — compact architecture and SEO guardrails.
- [docs/browse-seo-matrix.md](./docs/browse-seo-matrix.md) — canonical browse SEO families, thresholds, and long-tail rollout guidance.
- [docs/README.md](./docs/README.md) — repo map, rebuild plan, and migration baseline.
