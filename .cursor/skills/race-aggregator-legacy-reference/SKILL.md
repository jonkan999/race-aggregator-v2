---
name: race-aggregator-legacy-reference
description: >-
  Use the live legacy site (loppkartan.se) as a migration reference via Playwright
  and parity heuristics. Apply when improving race list cards, filters, or layout
  against the old Jinja site — aim for inspired parity, not blind copies; prefer
  faster, cheaper, clearer UX where v2 can improve.
---

# Legacy site as migration reference

## Goals

- **Inspiration, not photocopy:** Match user expectations and visual hierarchy from [loppkartan.se](https://loppkartan.se/) where it helps; simplify or modernize when it improves **speed**, **cost** (fewer requests, smaller bundles), **accessibility**, or **maintainability**.
- **Content stays in YAML** — never hardcode strings when comparing with legacy; add keys under `data/countries/{code}/`.
- **SEO-first modernization lens:** when deciding parity vs improvement, prefer outcomes that increase indexable quality and sustainable growth while reducing runtime cost.

## Structured data priority for parity decisions

- Race list parity: preserve/improve `ItemList` quality and stable, descriptive links.
- Race detail evolution: prioritize `Event` schema completeness over visual mimicry that does not affect discovery.
- When legacy behavior conflicts with modern SEO guidance, follow the modern guidance unless there is a clear business reason not to.

## Playwright against the live legacy site

- **Script:** `npm run test:e2e:legacy-ref`
- **Env:** `PW_LEGACY_REFERENCE=1` enables the `legacy-reference` project; `PW_SKIP_WEB_SERVER=1` skips starting Astro (tests only hit the legacy host).
- **Override URL:** `LEGACY_SITE_URL=https://staging.example.com` (trailing slash optional; normalized in config).
- **Tests live in:** [`tests/legacy/reference.spec.ts`](tests/legacy/reference.spec.ts) — extend with flows you care about (filters, map toggle, pagination). Keep them **tolerant** (timeouts, selectors) because production markup can change. On the live site, some `.race-card` nodes use `.filtered-out` (hidden) or `.packed` (minimal DOM); target `a.race-card:not(.filtered-out)` and `:not(.packed)` when you need full card chrome (`.more-info-button`, `.race-info-bottom`).

## Local v2 checks

- **Default e2e:** `npm run test:e2e` — builds/previews v2 and runs [`tests/smoke.spec.ts`](tests/smoke.spec.ts).

## Parity checklist (race cards)

Legacy full card (see old `race-card.html`): hero image, date + region in header strip, title, **venue** (location icon), **distances** (flag icon, split list), **surface/type** (footsteps), **description excerpt**, **CTA** (`.more-info-button`). v2 should align DOM/classes with [`src/styles/legacy/race-card.css`](src/styles/legacy/race-card.css) so ported CSS applies.

## SEO QA additions during migration

- Check that titles/meta descriptions stay route-specific and YAML-driven.
- Check structured data output against the route contract (especially `ItemList` now, `Event` when detail pages ship).
- Keep critical list/detail content crawlable without requiring user interaction.

## When changing list data

- **RPC / SSG** must expose fields needed for cards (`payload` for `location` / `description`, `race_translations` for `distance_verbose` and `description`). After schema or function changes, run `db push` and update [PRD.md](PRD.md) if behaviour shifts.

## Related

- Codex repo guide: [`AGENTS.md`](../../../AGENTS.md)
- Architecture reference: [`architecture.md`](../../../architecture.md)
- Data + deploy workflow: [race-aggregator-migration](../race-aggregator-migration/SKILL.md)
- Architecture rules: [`.cursor/rules/race-aggregator-architecture.mdc`](../../rules/race-aggregator-architecture.mdc)
