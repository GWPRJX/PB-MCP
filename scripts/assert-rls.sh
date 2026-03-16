#!/usr/bin/env bash
# CI gate for INFRA-07: fails with exit code 1 if any tenant-bearing table
# is missing ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY, or a policy.
# Usage: DATABASE_URL=postgres://... bash scripts/assert-rls.sh

set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

VIOLATIONS=$(psql "$DATABASE_URL" -t -A -f "$(dirname "$0")/check-rls.sql" 2>&1)

if [ -n "$VIOLATIONS" ]; then
  echo "RLS VIOLATION: Tables missing RLS policies or FORCE RLS:" >&2
  echo "$VIOLATIONS" >&2
  exit 1
fi

echo "RLS check passed: all tenant-bearing tables have ENABLE+FORCE RLS and at least one policy" >&2
