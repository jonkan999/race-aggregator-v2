#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TRIGGER_SCRIPT="${SCRIPT_DIR}/trigger-deploy-markets.sh"
ENV_FILE_DEFAULT="${HOME}/.config/race-aggregator-v2/github-actions.env"
ENV_FILE="${GITHUB_ACTIONS_ENV_FILE:-$ENV_FILE_DEFAULT}"
LOG_FILE="${HOME}/Library/Logs/race-aggregator-v2-redeploy.log"
SCHEDULE="${1:-0 2 * * *}"
MARKER="# race-aggregator-v2-redeploy"

mkdir -p "$(dirname "$LOG_FILE")"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Warning: token env file does not exist yet: %s\n' "$ENV_FILE" >&2
fi

cron_command="${SCHEDULE} cd ${REPO_ROOT} && GITHUB_ACTIONS_ENV_FILE=${ENV_FILE} bash ${TRIGGER_SCRIPT} >> ${LOG_FILE} 2>&1 ${MARKER}"

existing_crontab="$(crontab -l 2>/dev/null || true)"
filtered_crontab="$(printf '%s\n' "$existing_crontab" | grep -F -v "$MARKER" || true)"

if [[ -n "$filtered_crontab" ]]; then
  new_crontab="${filtered_crontab}"$'\n'"${cron_command}"
else
  new_crontab="${cron_command}"
fi

printf '%s\n' "$new_crontab" | crontab -

printf 'Installed cron entry:\n%s\n' "$cron_command"
printf 'Log file: %s\n' "$LOG_FILE"
printf 'Token env file: %s\n' "$ENV_FILE"
