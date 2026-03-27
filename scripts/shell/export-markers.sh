#!/usr/bin/env bash
# Loads .env if present (optional: uses DB when SUPABASE_SECRET_KEY set).
# Usage: ./scripts/shell/export-markers.sh [country]   default: se
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
COUNTRY="${1:-se}"
exec npm run export-markers -- "$COUNTRY"
