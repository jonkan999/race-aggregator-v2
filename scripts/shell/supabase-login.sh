#!/usr/bin/env bash
# Opens browser; stores CLI access token in your user config (not in this repo).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
exec npx supabase login
