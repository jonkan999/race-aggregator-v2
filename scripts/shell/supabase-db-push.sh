#!/usr/bin/env bash
# Applies supabase/migrations/ to the linked remote project.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
exec npx supabase db push
