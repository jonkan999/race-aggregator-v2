#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE_DEFAULT="${HOME}/.config/race-aggregator-v2/github-actions.env"
ENV_FILE="${GITHUB_ACTIONS_ENV_FILE:-$ENV_FILE_DEFAULT}"
WORKFLOW_FILE="${GITHUB_WORKFLOW_FILE:-deploy-markets.yml}"
REF_NAME="${GITHUB_WORKFLOW_REF:-main}"
MARKET_CODE="${1:-}"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S %Z'
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
fi

GITHUB_TOKEN_VALUE="${GITHUB_ACTIONS_TOKEN:-${GITHUB_TOKEN:-}}"

if [[ -z "$GITHUB_TOKEN_VALUE" || "$GITHUB_TOKEN_VALUE" == "replace_me" ]]; then
  log "Missing GitHub token. Set GITHUB_ACTIONS_TOKEN in $ENV_FILE or in the environment."
  exit 1
fi

origin_url="$(git -C "$REPO_ROOT" remote get-url origin)"

if [[ "$origin_url" =~ ^git@github\.com:([^/]+)/([^/]+)\.git$ ]]; then
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]}"
elif [[ "$origin_url" =~ ^https://github\.com/([^/]+)/([^/]+?)(\.git)?$ ]]; then
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]}"
else
  log "Could not parse GitHub owner/repo from origin URL: $origin_url"
  exit 1
fi

api_url="https://api.github.com/repos/${owner}/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches"

if [[ -n "$MARKET_CODE" ]]; then
  payload="$(printf '{"ref":"%s","inputs":{"marketCode":"%s"}}' "$REF_NAME" "$MARKET_CODE")"
  log "Triggering workflow ${WORKFLOW_FILE} for market ${MARKET_CODE} on ${owner}/${repo}@${REF_NAME}"
else
  payload="$(printf '{"ref":"%s","inputs":{}}' "$REF_NAME")"
  log "Triggering workflow ${WORKFLOW_FILE} for all enabled markets on ${owner}/${repo}@${REF_NAME}"
fi

http_code="$(
  curl \
    --silent \
    --show-error \
    --output /dev/null \
    --write-out '%{http_code}' \
    --request POST \
    --url "$api_url" \
    --header 'Accept: application/vnd.github+json' \
    --header "Authorization: Bearer ${GITHUB_TOKEN_VALUE}" \
    --header 'X-GitHub-Api-Version: 2022-11-28' \
    --data "$payload"
)"

if [[ "$http_code" != "204" ]]; then
  log "GitHub API returned HTTP ${http_code} while triggering ${WORKFLOW_FILE}"
  exit 1
fi

log "Workflow dispatch accepted by GitHub."
