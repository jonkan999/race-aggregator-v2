# Browse SEO Matrix

This document defines which browse combinations should become canonical indexable pages, which should stay filter-only, and how to avoid cannibalizing the same intent with multiple near-duplicate URLs.

## Why This Exists

The repo already supports broad browse taxonomy coverage, but SEO should not index every valid filter combination just because it can be generated. The right model is:

- keep the full taxonomy available in filters and browse UX
- selectively index the combinations that map to strong user intent
- keep low-signal, overlapping, or thin combinations as non-indexable filter states

This is especially important because `category_mapping` currently mixes:

- true distance intent such as `5 km`, `10 km`, `Halvmarathon`, and `Marathon`
- synonym labels such as `Millopp`, `5000 meter`, and `10000 meter`
- type-like labels such as `Backyard Ultra`

Those labels are useful in filters, but they should not all become independent canonical SEO landings.

## Taxonomy Review

Sweden audit performed on April 1, 2026 using `data/countries/se/final_races_w_neighbors.json` and the current upcoming domestic window used by browse generation.

Race types present in Sweden:

- `road`
- `terrain`
- `trail`
- `backyard`
- `relay`
- `time`
- `track`
- `frontyard`
- `other`

Current category labels in Sweden:

- `5 km`
- `10 km`
- `Halvmarathon`
- `Marathon`
- `Backyard Ultra`
- `50 miles`
- `100 miles`
- `200 miles`
- `50 km`
- `100 km`
- `Millopp`
- `1500 meter`
- `3000 meter`
- `5000 meter`
- `10000 meter`

Current inventory signal in Sweden shows:

- strongest standalone type demand candidates are `road`, `terrain`, and `trail`
- strongest distance demand candidates are `5 km`, `10 km`, `Halvmarathon`, and `Marathon`
- ultra distances exist, but should be selective rather than exploded into every location and month combination
- `Millopp`, `5000 meter`, and `10000 meter` overlap heavily with `10 km` and `5 km`
- `Backyard Ultra` behaves more like a race-type intent than a pure distance intent

## Canonical SEO Rules

Use these principles across markets:

- One search intent should map to one canonical page family.
- Synonym labels should support copy, internal links, and filters, not separate canonical URLs.
- Combination pages should exist only when they have enough inventory and enough unique intent.
- The same race set should not be indexable through multiple near-identical category pages.
- When a page drops below threshold, keep the UX state available but remove it from indexable SEO surfaces.

## Canonical Category Set

Index these as canonical distance/category browse pages:

- `5 km`
- `10 km`
- `Halvmarathon`
- `Marathon`
- `50 km`
- `100 km`
- `50 miles`
- `100 miles`

Treat these as filter labels or aliases, not independent canonical SEO pages:

- `Millopp`
- `1500 meter`
- `3000 meter`
- `5000 meter`
- `10000 meter`

Treat these as conditional or non-default:

- `200 miles`
  Index only in markets where inventory and query demand are both materially higher than today.
- `Backyard Ultra`
  Prefer the race-type page for canonical indexing. Do not index both a distance-style page and a type-style page for the same backyard intent.

## Canonical Race-Type Set

Index standalone race-type pages for:

- `road`
- `trail`
- `terrain`
- `backyard`

Keep these available in filters and browse UX, but do not expand them aggressively into combinatorial SEO families by default:

- `track`
- `relay`
- `time`
- `frontyard`
- `other`

`terrain` is allowed as a standalone SEO family because inventory is healthy in Sweden, but it should be added to combination rollouts only when Search Console or keyword research shows distinct demand from `trail`.

## Page Family Matrix

Index by default:

- `county`
- `city`
  Only for qualified cities with strong inventory.
- `month`
- `race type`
  Use the canonical race-type set above.
- `category`
  Use the canonical category set above.
- `race type + category`
  Only for focus race types and canonical categories.

Add next:

- `race type + county`
- `race type + month`
- `race type + city`

Do not index by default:

- `city + category`
- `county + category`
- `month + category`
- any triple combination such as `trail + Stockholm + September`
- synonym-led pages where the same result set already exists under a stronger canonical label

Future test candidates only after demand validation:

- `category + month` for `10 km`, `Halvmarathon`, and `Marathon`

## Thresholds

Use the same inventory thresholds in native and English. The copy can differ by locale, but the indexability decision should be shared.

Recommended minimums:

- `county`: index when the page has at least 5 upcoming domestic races
- `city`: index when the page has at least 5 upcoming domestic races and the city is in `qualified_cities.yaml`
- `month`: index when the page has at least 8 upcoming domestic races
- `race type`: index when the page has at least 8 upcoming domestic races
- `category`: index when the page has at least 8 upcoming domestic races and belongs to the canonical category set
- `race type + category`: index when the page has at least 5 upcoming domestic races
- `race type + county`: index when the page has at least 5 upcoming domestic races and the county page itself is above threshold
- `race type + month`: index when the page has at least 6 upcoming domestic races
- `race type + city`: index when the page has at least 5 upcoming domestic races and the parent city page is above threshold

If a page falls below threshold:

- keep the route or filter state available if useful for users
- remove it from indexable sitemaps and canonical internal-link modules
- serve `noindex,follow` if the page still exists publicly

## Recommended Rollout Order

Phase 1:

- keep the current base families
- narrow canonical category thinking to the canonical set above
- add `race type + county` for `road` and `trail`
- add `race type + month` for `road` and `trail`

Phase 2:

- add selective `race type + city` for `road` and `trail`
- allow `terrain` into combination families only where demand is proven

Phase 3:

- test `category + month` for `10 km`, `Halvmarathon`, and `Marathon`
- revisit `200 miles` only if a market has enough inventory to avoid thin pages

## Sweden Recommendation Right Now

Based on the April 1, 2026 Sweden audit:

- prioritize `road` and `trail` as the first combination types
- keep `terrain` as a standalone indexed family, but hold it out of the first combinatorial rollout
- use `5 km`, `10 km`, `Halvmarathon`, `Marathon`, `50 km`, `100 km`, `50 miles`, and `100 miles` as the canonical distance set
- do not create separate canonical SEO families for `Millopp`, `5000 meter`, or `10000 meter`
- treat `Backyard Ultra` as a race-type intent, not as both a type page and a distance page

This gives broad long-tail coverage without multiplying near-duplicate pages.

## Content Requirements For New Combo Pages

Each newly indexed combo page should have:

- timeless intro copy in native and English
- copy that reflects the actual intent of the combination, not just token substitution
- internal links to adjacent relevant browse pages
- a canonical URL that matches the preferred family for the intent
- page copy that avoids exact race counts, yearly claims, or other snapshot-dependent phrasing

Examples:

- `trail races in Stockholm` is a strong type-plus-location intent
- `road races in September` is a strong planning intent
- `10 km races in Stockholm in September` is usually too narrow and should remain a filter state

## Operational Guidance

When the codebase expands browse SEO coverage further:

- keep generation cache keys stable per browse intent
- derive page eligibility from the same build snapshot used for SSG
- make indexability decisions data-driven rather than hardcoded per route file
- preserve the full filter taxonomy in UI even when the SEO surface uses a smaller canonical subset

## YAML Contract

The active market-level policy lives in `browse_seo_indexing` inside:

- `data/countries/{code}/index.yaml`
- `data/countries/{code}/merged_index_int.yaml`

That block should define:

- minimum race-count thresholds per page family
- which race-type keys are allowed for standalone and combo pages
- which category labels are allowed as canonical category pages
- whether each combo family is enabled for that market

Current live rollout in Sweden:

- standalone `county`, `city`, `month`, `race_type`, and canonical `category` pages
- `race_type + category`
- `race_type + county`
- `race_type + month`

`race_type + city` is modeled in the YAML/prompt/template contract but remains disabled in the current market policy until the next rollout.
