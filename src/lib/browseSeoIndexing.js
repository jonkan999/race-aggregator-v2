function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asStringArray(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function asLowercaseSet(value) {
  return new Set(asStringArray(value).map((entry) => entry.toLowerCase()));
}

function asNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeFamily(raw, defaults = {}) {
  const source = asObject(raw);
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : defaults.enabled ?? true,
    minRaceCount: asNumber(source.min_race_count, defaults.minRaceCount ?? 1),
    allowedLabels: asLowercaseSet(source.allowed_labels),
    allowedRaceTypeKeys: asLowercaseSet(source.allowed_race_type_keys),
    requireQualifiedCity:
      typeof source.require_qualified_city === 'boolean'
        ? source.require_qualified_city
        : defaults.requireQualifiedCity ?? false,
  };
}

export function getBrowseSeoIndexingPolicy(content) {
  const raw = asObject(content?.browse_seo_indexing);
  return {
    countyPages: normalizeFamily(raw.county_pages),
    cityPages: normalizeFamily(raw.city_pages),
    monthPages: normalizeFamily(raw.month_pages),
    raceTypePages: normalizeFamily(raw.race_type_pages),
    categoryPages: normalizeFamily(raw.category_pages),
    raceTypeCategoryPages: normalizeFamily(raw.race_type_category_pages),
    raceTypeCountyPages: normalizeFamily(raw.race_type_county_pages, { enabled: false }),
    raceTypeMonthPages: normalizeFamily(raw.race_type_month_pages, { enabled: false }),
    raceTypeCityPages: normalizeFamily(raw.race_type_city_pages, { enabled: false }),
  };
}

function setAllows(set, value) {
  if (!(set instanceof Set) || set.size === 0) return true;
  return set.has(String(value ?? '').trim().toLowerCase());
}

function meetsThreshold(count, minRaceCount) {
  return Number(count ?? 0) >= Number(minRaceCount ?? 1);
}

export function isBrowseStandaloneAllowed(policy, kind, args = {}) {
  const family =
    kind === 'county'
      ? policy.countyPages
      : kind === 'city'
        ? policy.cityPages
        : kind === 'month'
          ? policy.monthPages
          : kind === 'race_type'
            ? policy.raceTypePages
            : kind === 'category'
              ? policy.categoryPages
              : null;
  if (!family?.enabled) return false;
  if (!meetsThreshold(args.count, family.minRaceCount)) return false;
  if (kind === 'city' && family.requireQualifiedCity && !args.isQualifiedCity) return false;
  if (kind === 'race_type' && !setAllows(family.allowedRaceTypeKeys, args.raceTypeKey)) return false;
  if (kind === 'category' && !setAllows(family.allowedLabels, args.label)) return false;
  return true;
}

export function isBrowseCombinationAllowed(policy, kind, args = {}) {
  const family =
    kind === 'race_type_category'
      ? policy.raceTypeCategoryPages
      : kind === 'race_type_county'
        ? policy.raceTypeCountyPages
        : kind === 'race_type_month'
          ? policy.raceTypeMonthPages
          : kind === 'race_type_city'
            ? policy.raceTypeCityPages
            : null;
  if (!family?.enabled) return false;
  if (!meetsThreshold(args.count, family.minRaceCount)) return false;
  if (!setAllows(family.allowedRaceTypeKeys, args.raceTypeKey)) return false;
  if (kind === 'race_type_category' && !setAllows(family.allowedLabels, args.label)) return false;
  if (kind === 'race_type_city' && family.requireQualifiedCity && !args.isQualifiedCity) return false;
  return true;
}

