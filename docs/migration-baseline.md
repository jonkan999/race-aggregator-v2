# Migration Baseline

## What exists today

- Astro app scaffold with a default country redirect.
- Swedish market content with Swedish and English list surfaces.
- Legacy-styled race list shell with React island behavior.
- Build-time page-1 list snapshot via Supabase or local JSON fallback.
- Browser-side pagination and filtering through `get_races_list_page`.
- Static map marker export and Mapbox map island.
- Playwright smoke tests plus live legacy-site reference tests.

## What is already stable enough to build on

- Repo layout is small and understandable.
- Data flow boundaries are documented and consistent.
- The migration already preserves a strong cost model: static pins plus one RPC for list interactions.
- The sibling legacy repo is available locally for comparison work.

## What is still missing or early

- Race detail pages are still planned, not fully implemented.
- Browse/SEO list routes beyond the main calendar are still planned.
- Only Sweden is wired today.
- Test coverage is still smoke-level for v2.

## Immediate next implementation focus

1. Tighten parity on the main list routes.
2. Expand regression coverage around list behavior and legacy parity expectations.
3. Build the detail-route foundation once list behavior is trustworthy.
