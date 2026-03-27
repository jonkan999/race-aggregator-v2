---
name: race-aggregator-migration
description: >-
  Migrate or sync race-aggregator legacy content into v2 — YAML, Supabase seed,
  markers export, migrations, PRD. Use when updating country data, schema, or
  parity with the old Jinja site.
---

# Race Aggregator v2 — migration workflow

## Mission context

- This migration is not just a port: it is a **legacy modernization** with an **SEO-first business goal**.
- Every migration decision should improve or protect:
  1. Search visibility and crawlability,
  2. Infra/query cost profile,
  3. Client-perceived speed,
  4. Future flexibility for features and new markets.

## SEO references in this workflow

- Google Search Central SEO Starter Guide (technical + content baseline).
- Schema.org (prefer concrete types for eligible enhancements, especially `Event` for race detail pages).
- Treat structured data as product behavior, not just metadata.

## When to use

- Adding or updating a **country** under `data/countries/{code}/`.
- Changing **Supabase schema** (new migrations in `supabase/migrations/`).
- Refreshing **production-like** list data or map markers after collector updates.

## Steps

1. **Content (YAML)**  
   - Native strings: `data/countries/{code}/index.yaml`.  
   - English: `data/countries/{code}/merged_index_int.yaml` if the market has `/en/` routes.  
   - For language switcher labels, set `alternate_locale_link_text` in each file (label for the *other* locale’s list).

2. **Database**  
   - Apply migrations: `./scripts/shell/supabase-db-push.sh` (after login + link), or run SQL from `supabase/migrations/` in the dashboard.  
   - New list behaviour that touches filters or RPC: ensure `get_races_list_page` (or follow-up migrations) stays in sync with client params in `RaceListPageIsland`.

3. **Seed races**  
   - `./scripts/shell/seed-races.sh {code}` with `SUPABASE_SECRET_KEY` (and URL) in `.env`.

4. **Markers**  
   - `./scripts/shell/export-markers.sh {code}` → refreshes `public/markers-{code}.json` (commit when you want the site to ship new pins).

5. **Verify**  
   - `npm run build`  
   - `npm run test:e2e`  
   - Spot-check `/{code}/{race-list-slug}/` and English list if present.

6. **Documentation**  
   - Any architectural or cost-model change: update [PRD.md](PRD.md).  
   - Setup or script changes: update [README.md](README.md).
   - SEO-visible route changes: update PRD snippet map/status and schema contract notes.

## Rules

- Do **not** ship user-facing literals from code; extend YAML.  
- Do **not** put secret keys in the client.  
- Prefer **one RPC call** per filtered/paginated list fetch (`get_races_list_page`), not separate count + select.
- For every new indexable route, define canonical behavior + schema type before shipping.

## Related

- **Codex repo guide:** [`AGENTS.md`](../../../AGENTS.md)
- **Architecture reference:** [`architecture.md`](../../../architecture.md)
- **Live legacy site (Playwright):** [race-aggregator-legacy-reference](../race-aggregator-legacy-reference/SKILL.md) — run `npm run test:e2e:legacy-ref` during UI parity work.
