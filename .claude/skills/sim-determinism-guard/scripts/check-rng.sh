#!/usr/bin/env bash
# Flag sources of non-determinism in the simulation layer.
# Usage: bash check-rng.sh [path]   (defaults to sim/ if present, else .)
# Exit 0 = clean; exit 1 = potential violations found. Necessary, not sufficient —
# it catches banned calls, not logic bugs (unordered iteration, float creep, AI
# reading outside BattleState). Read the code too.
set -uo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  if [ -d sim ]; then TARGET="sim"; else TARGET="."; fi
fi

if [ ! -e "$TARGET" ]; then
  if [ -n "${1:-}" ]; then
    # A target NAMED BY THE CALLER that does not exist is a broken guard, not an
    # empty repo. `check:rng` pins one path per scanned file, so renaming or
    # splitting a scanned file would otherwise un-guard it in total silence —
    # the scan would keep printing a green tick for a file it never opened.
    echo "❌ check-rng: target '$TARGET' does not exist."
    echo "   It was named explicitly, so this is a guard pointing at nothing:"
    echo "   fix the path in package.json's check:rng, or drop the argument."
    exit 1
  fi
  echo "check-rng: target '$TARGET' does not exist"
  exit 0   # nothing to check yet (docs-only repo) — not a failure
fi

# Banned patterns: unseeded randomness and wall-clock in sim code.
PATTERN='Math\.random|crypto\.getRandomValues|performance\.now|Date\.now|new Date\(\)'

# Search code files only; skip tests, node_modules, build output.
MATCHES=$(grep -rnE "$PATTERN" "$TARGET" \
  --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
  --exclude='*.test.*' --exclude='*.spec.*' 2>/dev/null)

if [ -n "$MATCHES" ]; then
  echo "❌ Potential determinism violations (route through the seeded PRNG, or move out of sim):"
  echo "$MATCHES"
  exit 1
fi

echo "✅ check-rng: no banned unseeded-RNG / wall-clock calls found in '$TARGET'."
echo "   (Still verify: no unordered map/set iteration affecting outcomes, no float creep, AI reads only BattleState.)"
exit 0
