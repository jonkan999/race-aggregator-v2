/**
 * Sort browse month hubs in calendar order (January → December).
 * Month keys are `01`–`12` from YAML `month_mapping`.
 */
export function compareBrowseMonthKeys(leftKey, rightKey) {
  const left = Number.parseInt(String(leftKey), 10);
  const right = Number.parseInt(String(rightKey), 10);
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) {
    return left - right;
  }
  return String(leftKey).localeCompare(String(rightKey));
}
