#!/usr/bin/env bash
# Loads .env from repo root (for SUPABASE_SECRET_KEY), then seeds DB.
# Usage: ./scripts/shell/seed-races.sh [country]   default: se
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
exec npm run seed-races -- "$COUNTRY"
