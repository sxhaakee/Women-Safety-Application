#!/usr/bin/env bash
# scripts/no-fakes.sh — Lint gate: fails on any of these patterns in src/
# Run: bash scripts/no-fakes.sh
# Exit code 0 = clean, 1 = violations found

set -e

ERRORS=0
PATHS="apps/mobile/src packages/shared/src apps/web/src"

check() {
  local pattern="$1"
  local label="$2"
  for p in $PATHS; do
    [ -d "$p" ] || continue
    matches=$(grep -rn --include="*.ts" --include="*.tsx" -E "$pattern" "$p" 2>/dev/null || true)
    if [ -n "$matches" ]; then
      echo "❌ FORBIDDEN [$label]:"
      echo "$matches"
      ERRORS=$((ERRORS + 1))
    fi
  done
}

# Forbidden patterns
check 'Math\.random\(' 'Math.random in source'
check 'DEMO_STATIONS' 'DEMO_ constant in source'
check '\/\/ TODO' 'TODO comment'
check '\/\/ FIXME' 'FIXME comment'
check '\.skip\(' 'skipped test'
check '\.only\(' 'focused test'
check '"shesafe_pin"' 'plaintext PIN key (must use secure store)'
check 'railway\.app' 'hardcoded Railway URL'

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "🚫 no-fakes.sh: $ERRORS violation(s) found. Fix before commit."
  exit 1
else
  echo "✅ no-fakes.sh: No violations found."
  exit 0
fi
