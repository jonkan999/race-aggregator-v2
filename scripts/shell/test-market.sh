#!/usr/bin/env bash
# Prepares one market for local verification, then starts the dev server.
# Usage: ./scripts/shell/test-market.sh [market-code] [dev-args...]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

for env_file in .env .env.local .env.development; do
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
done

MARKET_CODE="${MARKET_CODE:-se}"
if [[ $# -gt 0 && "$1" != "--" && "$1" != --* ]]; then
  MARKET_CODE="$1"
  shift
fi
if [[ $# -gt 0 && "$1" == "--" ]]; then
  shift
fi

SNAPSHOT_DIR="$ROOT/.cache/test-market-$MARKET_CODE"
rm -rf "$SNAPSHOT_DIR"
mkdir -p "$SNAPSHOT_DIR"

cleanup() {
  rm -rf "$SNAPSHOT_DIR"
}

trap cleanup EXIT

echo "Preparing market '$MARKET_CODE'..."
RACE_LIST_BUILD_SNAPSHOT_DIR="$SNAPSHOT_DIR" npm run export-race-list-snapshots -- "$MARKET_CODE"
RACE_LIST_BUILD_SNAPSHOT_DIR="$SNAPSHOT_DIR" npm run build-browse-seo-cache -- "$MARKET_CODE"
RACE_LIST_BUILD_SNAPSHOT_DIR="$SNAPSHOT_DIR" npm run export-markers -- "$MARKET_CODE"
RACE_LIST_BUILD_SNAPSHOT_DIR="$SNAPSHOT_DIR" MARKET_CODE="$MARKET_CODE" npm run build:astro

echo "Starting dev server for '$MARKET_CODE'..."
trap - EXIT
cleanup
exec env MARKET_CODE="$MARKET_CODE" npm run dev -- "$@"
