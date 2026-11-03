#!/usr/bin/env bash
# Loads .env from repo root (for SUPABASE_SECRET_KEY), then seeds DB.
# Usage: ./scripts/shell/seed-races.sh [country] [--replace]   default: se
set -euo pipefail
# cron runs with a minimal PATH (/usr/bin:/bin); make Homebrew/nvm node+npm resolvable.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
exec npm run seed-races -- "$@"
