# Rebuild Plan

## Stage 1 — Foundations

- Keep documentation and repo guidance current in `README.md`, `PRD.md`, `AGENTS.md`, and `architecture.md`.
- Preserve the current race list architecture: SSG page 1, RPC pagination/filtering, static marker JSON.
- Keep YAML as the source of all user-facing copy.

## Stage 2 — Migration parity on core list pages

- Compare v2 race list routes against the legacy repo and live site.
- Close gaps in race-card content, filters, layout behavior, and route metadata.
- Expand Playwright coverage for parity-critical flows.

## Stage 3 — SEO route expansion

- Build race detail pages with `Event` schema.
- Add browse/listing routes for county, city, and race type using the same SSG-first pattern.
- Add sitemap and route-level metadata checks.

## Stage 4 — Market expansion

- Add new `data/countries/{code}/` markets.
- Seed DB content and export markers for each market.
- Reuse route, YAML, and schema patterns with minimal duplication.

## Working rules during implementation

- Any change to route behavior or data contracts should update docs as part of the same pass.
- Use the legacy repo for reference, but choose improvements when they clearly help SEO, performance, accessibility, or maintainability.
- Keep costs bounded by avoiding unnecessary browser-side database reads.
