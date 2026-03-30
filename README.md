# Race Aggregator v2

Astro + Supabase rebuild of the legacy `race-aggregator` static site: YAML-driven copy, dynamic race list from Postgres (single RPC per interaction), map pins from static per-country JSON for low database read cost. The **race list** route uses ported legacy CSS and layout ([`src/layouts/RaceListLayout.astro`](src/layouts/RaceListLayout.astro), [`src/styles/legacy/`](src/styles/legacy/)).

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

Loads `data/countries/se/final_races.json` and `final_races_int.json`. Put **`SUPABASE_SECRET_KEY`** in `.env` (or export it); the script sources `.env` when present.

```bash
./scripts/shell/seed-races.sh se
```

Equivalent: `npm run seed-races -- se` (with env vars set yourself).

### Map markers file

Regenerate `public/markers-se.json` (committed for convenience; refresh after data changes):

```bash
./scripts/shell/export-markers.sh se
```

Equivalent: `npm run export-markers -- se`. Without DB credentials, the script reads `data/countries/se/final_races.json` only.

### Race list: static first page + Supabase RPC for interaction

At **`astro dev`**, the first page of the main calendar is filled from:

1. **Supabase** if `SUPABASE_URL` (or `PUBLIC_SUPABASE_URL`) and `SUPABASE_SECRET_KEY` are set in the environment (recommended for production CI so HTML matches the DB), or  
2. Otherwise **`data/countries/{code}/final_races.json`** (and int file)—inlined into the page, no extra public JSON.

At **`npm run build`**, the repo now uses a snapshot-first flow:

1. Export all race rows once per country into a temporary local directory under `.cache/race-list-build-snapshots/`
2. Reuse that snapshot for every static list/browse page during the build
3. Remove the temporary snapshot directory after the build finishes

This keeps build-time Supabase egress roughly proportional to the number of countries being built, rather than the number of generated routes.

In the browser, **pagination** and **filters** (dates, month, distance/category, county, race type) call **`get_races_list_page`** once per change (returns total + rows with translations). If `PUBLIC_SUPABASE_*` keys are missing, page 1 still works; further pages and filtering show copy from `race_list_remote_required` in YAML.

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

- Swedish list: [http://127.0.0.1:4321/se/loppkalender/](http://127.0.0.1:4321/se/loppkalender/)
- English list: [http://127.0.0.1:4321/se/en/race-calendar/](http://127.0.0.1:4321/se/en/race-calendar/)
- Swedish browse overview: [http://127.0.0.1:4321/se/loppkalender/bladdra-efter-kategori/](http://127.0.0.1:4321/se/loppkalender/bladdra-efter-kategori/)
- Example category landing page: [http://127.0.0.1:4321/se/loppkalender/bladdra-efter-kategori/categories/10-km/](http://127.0.0.1:4321/se/loppkalender/bladdra-efter-kategori/categories/10-km/)
- Add race: [http://127.0.0.1:4321/se/lagg-till-lopp/](http://127.0.0.1:4321/se/lagg-till-lopp/)

## Build

```bash
npm run build
npm run preview
```

If you want the raw Astro build without the snapshot wrapper:

```bash
npm run build:astro
```

You can also export snapshots directly:

```bash
npm run export-race-list-snapshots -- se
```

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

Playwright starts a server automatically: by default it runs **`npm run build`** then **`astro preview`** on `127.0.0.1:4321` (waits until `/se/` responds). That avoids `astro dev` subprocess issues where the readiness check never passes.

Optional:

- **`PW_FAST=1 npm run test:e2e`** — use `astro dev` instead (faster if build is already warm; may need a longer first compile).
- **`PW_SKIP_WEB_SERVER=1 npm run test:e2e`** — you already have `npm run dev` (or preview) running on the same host/port.
- **`PLAYWRIGHT_BASE_URL`** / **`PW_HOST`** / **`PW_PORT`** — override the base URL and bind address.

Mapbox is optional for smoke tests (the map shows a YAML message if `PUBLIC_MAPBOX_TOKEN` is empty).

## Content layout

- `data/countries/{code}/index.yaml` — native language strings and config (include **`alternate_locale_link_text`** for the nav link to the English list when `merged_index_int.yaml` exists).
- `data/countries/{code}/merged_index_int.yaml` — English strings for that market (same key for the link back to the native list).
- `data/countries/{code}/final_races*.json` — seed/export inputs (managed long-term by **race-collector-v2**).
- `data/countries/{code}/seo_content_cache*.json` — cached SEO title/meta/H1/intro overrides used by category landing pages. Missing category entries fall back to deterministic template copy from YAML.

Refresh missing category-cache entries without regenerating existing overrides:

```bash
npm run build-category-seo-cache -- se
```

## Agent browser tooling

Playwright MCP or similar browser-driving tooling is optional agent infrastructure. Repository verification still runs through `npm run test:e2e`, and legacy-site reference work still runs through `npm run test:e2e:legacy-ref`.

## See also

- [PRD.md](./PRD.md) — architecture decisions and phases.
- [AGENTS.md](./AGENTS.md) — Codex-oriented repo workflow and migration checklist.
- [architecture.md](./architecture.md) — compact architecture and SEO guardrails.
- [docs/README.md](./docs/README.md) — repo map, rebuild plan, and migration baseline.
