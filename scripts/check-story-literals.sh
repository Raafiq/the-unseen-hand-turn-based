#!/usr/bin/env bash
# No test may assert a LITERAL phrase from a story pack.
#
# WHY THIS IS A CHECK AND NOT A NOTE. `docs/11` AC-M4's whole claim is that the story
# pack is swappable with no code change — that is the seam a separate story repo plugs
# into. A test that pins its prose turns exercising that seam into a build failure, and
# it happened TWICE in one slice: `campaign-shell.test.ts` and `e2e/campaign.spec.ts`
# both asserted "Four of us, one road", so a one-line content fix broke the suite.
#
# The check is cheap because the pack IS the list of forbidden strings: every authored
# line, matched against every test file. A test wanting to assert story behaviour must
# read the value out of the pack (`story.entries.find(...)`) instead.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
while IFS= read -r -d '' pack; do
  # Every authored line of four words or more — shorter ones ("Vance") are structure a
  # test may legitimately name, not prose.
  python3 - "$pack" <<'PY' > /tmp/story-lines.txt
import json, sys

# Phrases are taken VERBATIM from the line — no comma-stripping, no sentence splitting.
# The first draft did both, so it searched for "One road and men on it" while the test
# contained "One road, and men on it" and the guard went green on a real violation. A
# guard that mangles the needle cannot find it in the haystack.
#
# Overlapping six-word windows, so a test quoting the MIDDLE of a line is caught too.
seen = set()
for entry in json.load(open(sys.argv[1]))["entries"]:
    for moment in ("pre", "victory", "defeat"):
        beat = entry.get(moment)
        if not beat:
            continue
        for line in beat["lines"]:
            words = line.split()
            for i in range(max(1, len(words) - 5)):
                window = words[i : i + 6]
                if len(window) >= 4:
                    seen.add(" ".join(window))
print("\n".join(sorted(seen)))
PY
  while IFS= read -r phrase; do
    [ -z "$phrase" ] && continue
    # `-e` (not `--`) so a phrase beginning with a dash is still a pattern; putting
    # `--` before it made grep read the --include flags as FILENAMES, which returned
    # exit 2 on every phrase and made the whole guard silently green.
    if hits=$(grep -rlF --include='*.test.ts' --include='*.spec.ts' -e "$phrase" src e2e 2>/dev/null); then
      echo "::error::a test pins story prose from $(basename "$pack"): \"$phrase\""
      echo "  in: $hits"
      echo "  Read it out of the pack instead — the story seam (docs/11 AC-M4) exists so"
      echo "  the prose can change with no code change, and this makes that a failure."
      fail=1
    fi
  done < /tmp/story-lines.txt
done < <(find data -name '*.story.json' -print0)

if [ "$fail" -eq 0 ]; then
  echo "✅ check:story — no test pins story-pack prose."
else
  echo "❌ check:story — a test pins story-pack prose (see above)."
fi
exit "$fail"
