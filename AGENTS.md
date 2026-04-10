# Race Aggregator v2 — Codex Guide

This repository is the Astro + Supabase migration of the live legacy project at [`../race-aggregator`](../race-aggregator). Use that repo and the live site as references when migrating behavior, copy structure, or visual hierarchy, but keep v2 decisions aligned with the architecture and cost model in this repo.

## Start Here

- Read [`README.md`](./README.md) for setup, commands, and local development flow.
- Read [`PRD.md`](./PRD.md) for product goals, SEO priorities, and phased delivery.
- Read [`architecture.md`](./architecture.md) before changing list rendering, Supabase access, YAML content, or map data flow.
- Read [`docs/README.md`](./docs/README.md) for the repo map, rebuild plan, and migration baseline.

## Core Rules

- Do not hardcode user-facing copy in components. Add or update YAML under `data/countries/{code}/`.
- Treat `race-collector-v2` as the source of truth for market YAML and final race JSON. The files under `data/countries/{code}/` in this repo should be synced mirrors, not manually edited market content.
- Design routing for one market per domain: native lives at `/`, English lives at `/en/`. Do not introduce country-prefixed native public URLs.
- Keep native auxiliary slugs market-owned. If a market localizes routes such as add-race, about, contact, privacy, or utility pages, derive those slugs from synced market YAML instead of hardcoding Sweden-template filenames.
- Keep the race list SEO-first and SSG-first: page 1 is pre-rendered, while pagination and filters use the `get_races_list_page` RPC.
- Use static `public/markers-{country}.json` for map pins. Do not fetch pins from paginated list queries.
- Only publishable Supabase keys belong in the browser. Secret or service-role keys are only for scripts, CI, and build-time snapshots.
- Treat build-time Supabase access as export-only: fetch race rows once per country into the temporary build snapshot, then reuse that local snapshot for the rest of static generation. Do not add route-level patterns that repeatedly hit Supabase during `astro build`.
- Preserve legacy class names and layout expectations on race list routes unless there is a clear reason to modernize them deliberately.
- Default production assumption: one Vercel project per market with `MARKET_CODE={code}`.
- Treat `config/deploy-markets.json` as the deploy allowlist for live markets. Do not assume every folder under `data/countries/` should deploy automatically.

## Migration Workflow

1. Update country YAML in `data/countries/{code}/`.
2. Add or apply Supabase migrations in `supabase/migrations/` when schema or RPC behavior changes.
3. Seed data with `./scripts/shell/seed-races.sh {code}` when needed.
4. Refresh markers with `./scripts/shell/export-markers.sh {code}` when map data changes.
5. Verify with `npm run build` and `npm run test:e2e`.
6. If you change build-time race data loading, preserve the “one snapshot export per country, then local reuse” contract and document it.
7. Update [`README.md`](./README.md), [`PRD.md`](./PRD.md), and [`architecture.md`](./architecture.md) when architecture, setup, or SEO-visible behavior changes.

## Legacy Reference

- Legacy repo: [`../race-aggregator`](../race-aggregator)
- Live reference flow: `npm run test:e2e:legacy-ref`
- Use legacy parity as guidance, not a hard constraint. Prefer improvements that strengthen SEO, reduce runtime cost, improve accessibility, or simplify maintenance.
