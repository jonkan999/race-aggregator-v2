# Race Aggregator v2 — Codex Guide

This repository is the Astro + Supabase migration of the live legacy project at [`../race-aggregator`](../race-aggregator). Use that repo and the live site as references when migrating behavior, copy structure, or visual hierarchy, but keep v2 decisions aligned with the architecture and cost model in this repo.

## Start Here

- Read [`README.md`](./README.md) for setup, commands, and local development flow.
- Read [`PRD.md`](./PRD.md) for product goals, SEO priorities, and phased delivery.
- Read [`architecture.md`](./architecture.md) before changing list rendering, Supabase access, YAML content, or map data flow.
- Read [`docs/README.md`](./docs/README.md) for the repo map, rebuild plan, and migration baseline.

## Core Rules

- Do not hardcode user-facing copy in components. Add or update YAML under `data/countries/{code}/`.
- Keep the race list SEO-first and SSG-first: page 1 is pre-rendered, while pagination and filters use the `get_races_list_page` RPC.
- Use static `public/markers-{country}.json` for map pins. Do not fetch pins from paginated list queries.
- Only publishable Supabase keys belong in the browser. Secret or service-role keys are only for scripts, CI, and build-time snapshots.
- Preserve legacy class names and layout expectations on race list routes unless there is a clear reason to modernize them deliberately.

## Migration Workflow

1. Update country YAML in `data/countries/{code}/`.
2. Add or apply Supabase migrations in `supabase/migrations/` when schema or RPC behavior changes.
3. Seed data with `./scripts/shell/seed-races.sh {code}` when needed.
4. Refresh markers with `./scripts/shell/export-markers.sh {code}` when map data changes.
5. Verify with `npm run build` and `npm run test:e2e`.
6. Update [`README.md`](./README.md), [`PRD.md`](./PRD.md), and [`architecture.md`](./architecture.md) when architecture, setup, or SEO-visible behavior changes.

## Legacy Reference

- Legacy repo: [`../race-aggregator`](../race-aggregator)
- Live reference flow: `npm run test:e2e:legacy-ref`
- Use legacy parity as guidance, not a hard constraint. Prefer improvements that strengthen SEO, reduce runtime cost, improve accessibility, or simplify maintenance.
