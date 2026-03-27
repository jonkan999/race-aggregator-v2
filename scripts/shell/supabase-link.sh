#!/usr/bin/env bash
# Usage: ./scripts/shell/supabase-link.sh <project-ref>
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <project-ref>" >&2
  exit 1
fi
exec npx supabase link --project-ref "$1"
