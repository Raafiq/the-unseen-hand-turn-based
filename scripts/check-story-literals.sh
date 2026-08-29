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
#
# ── THIS GUARD HAS BEEN WRONG THREE TIMES. Each fix is a rule, not a tidy-up. ────────
#  1. It stripped commas from the needle while grepping the raw file, so it searched for
#     "One road and men on it" against a file containing "One road, and men on it". A
#     guard that mangles the needle cannot find it in the haystack.
#  2. It passed `--` before the pattern, so grep read the `--include` flags as FILENAMES
#     and returned exit 2 on every phrase — silently green on a real violation.
#  3. MEASURED 2026-08-29, against a v2-shaped pack: `beat["lines"]` assumed a list of
#     strings, the heredoc died with an AttributeError, the redirect had already
#     truncated the phrase file, and the `while` loop read nothing. The guard printed a
#     traceback, then "✅ no test pins story-pack prose", and exited 0. A pack was
#     skipped entirely and the exit code said everything was fine.
#
# So: the extraction's exit status is CHECKED, the phrase count is PRINTED and asserted
# non-zero, and every string in the pack is classified by its key — an unclassified key
# is a hard error, so a future prose field cannot ship unguarded by being invisible.
set -uo pipefail
cd "$(dirname "$0")/.."

# A fixed /tmp path is shared state between runs and between concurrent CI jobs.
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

fail=0
total=0
packs=0

while IFS= read -r -d '' pack; do
  packs=$((packs + 1))
  # The extraction walks the WHOLE document and classifies every string it meets by the
  # key that led to it, so it is shape-agnostic: it reads a v1 pack (`lines` is a list of
  # strings) and a v2 pack (`lines` is a list of objects with `text`) with the same code.
  python3 - "$pack" > "$tmp" <<'PY'
import json, sys

path = sys.argv[1]

# Strings under these keys are PROSE and are matched as overlapping six-word windows, so
# a test quoting the middle of a line is caught too.
#   `lines` — a v1 beat, whose `lines` is a list of bare strings.
#   `text`  — a v2 line object.
PROSE_WINDOW = {"lines", "text"}

# Strings under these keys are PROSE matched WHOLE. A title is short enough that a
# six-word window never forms, so windowing would leave it entirely unguarded — which is
# how "The Toll Road" came to be pinned in two test files.
PROSE_EXACT = {"title"}

# Strings under these keys are STRUCTURE a test may legitimately name: ids, schema keys,
# and the character/speaker labels the ARIA plate is built from.
STRUCTURE = {
    "campaignId", "storySchemaVersion", "battleId", "id", "name",
    "speaker", "expression", "asset", "kind",
}

windowed, exact, unknown, multiline = [], [], set(), []


def walk(node, key):
    """Recurse, carrying the key that led here. A list keeps its parent's key, so the
    elements of `lines` are classified as `lines`."""
    if isinstance(node, dict):
        for k, v in node.items():
            walk(v, k)
    elif isinstance(node, list):
        for v in node:
            walk(v, key)
    elif isinstance(node, str):
        if "\n" in node or "\r" in node:
            # A needle spanning lines cannot be grepped as a fixed string, and silently
            # normalising it would be failure #1 all over again.
            multiline.append(key)
            return
        if key in PROSE_WINDOW:
            windowed.append(node)
        elif key in PROSE_EXACT:
            exact.append(node)
        elif key not in STRUCTURE:
            unknown.add(key)
    # numbers, booleans and null carry no prose.


walk(json.load(open(path)), "<root>")

if unknown:
    for key in sorted(unknown):
        sys.stderr.write(
            'unclassified key "%s" in %s — is it prose? Add it to PROSE_WINDOW, '
            "PROSE_EXACT or STRUCTURE in scripts/check-story-literals.sh.\n" % (key, path)
        )
    raise SystemExit(3)

if multiline:
    for key in sorted(set(multiline)):
        sys.stderr.write(
            'the string under key "%s" in %s spans lines, so it cannot be matched as a '
            "fixed string. Keep authored prose on one line.\n" % (key, path)
        )
    raise SystemExit(4)

seen = set()

# Phrases are taken VERBATIM from the line — no comma-stripping, no sentence splitting.
# Six words, not four: MEASURED against the real corpus, a four-word window pulls
# ordinary English out of the prose ("and it is the" matches four unrelated test files,
# "it is the one" matches six) and the guard becomes a source of false failures.
for line in windowed:
    words = line.split()
    for i in range(max(1, len(words) - 5)):
        window = words[i : i + 6]
        if len(window) >= 4:
            seen.add(" ".join(window))

# A title is matched whole. Two words minimum — a one-word title is a label a test may
# name, and the skip is PRINTED rather than silently applied.
for title in exact:
    if len(title.split()) >= 2:
        seen.add(title)
    else:
        sys.stderr.write(
            'note: title "%s" in %s is one word — not guarded, it reads as a label.\n'
            % (title, path)
        )

print("\n".join(sorted(seen)))
PY
  # THE line this guard has been wrong about. `$?` is the extraction's status, and it is
  # checked BEFORE the phrase file is read — an unreadable pack is a failure, never an
  # empty phrase list that reads as "no violations found".
  status=$?
  if [ "$status" -ne 0 ]; then
    echo "::error::check:story could not read $pack (extraction exited $status) — see above."
    echo "  A pack the guard cannot parse is a pack it cannot police, so this is a"
    echo "  FAILURE, not a clean run."
    exit 1
  fi

  count=$(grep -c . "$tmp" || true)
  total=$((total + count))
  echo "check:story — $(basename "$pack"): $count phrases"

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
  done < "$tmp"
done < <(find data -name '*.story.json' -print0)

# A guard that extracted NOTHING passes identically to one that found no violation.
# Saying how many things it actually looked at is what separates the two.
if [ "$total" -eq 0 ]; then
  echo "::error::check:story extracted 0 phrases from $packs pack(s) — it policed nothing."
  echo "  Either no story pack was found under data/, or every prose key stopped being"
  echo "  recognised. Both are guard failures, not clean runs."
  exit 1
fi

if [ "$fail" -eq 0 ]; then
  echo "✅ check:story — $total phrases from $packs pack(s); no test pins story-pack prose."
else
  echo "❌ check:story — a test pins story-pack prose (see above)."
fi
exit "$fail"
