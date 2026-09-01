# Vendored copy

This skill is a copy of **unslop** by claytonkim, MIT licensed.

- Upstream: https://github.com/theclaymethod/unslop
- Copied at commit: d81f519
- Copied on: 2026-09-01

It is vendored (copied into this repo) so every session gets it, including
fresh cloud containers. A symlink to a local clone does not survive those.

## What was left out

`.git`, `.github/`, `plans/`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`,
`CLAUDE.md`, `ruff.toml`, and the `docs/` files the skill never reads.
Every path the skill or its references point to is present.

## Updating

Re-clone upstream and copy the same set:

    git clone https://github.com/theclaymethod/unslop.git /tmp/unslop
    cd <repo root>
    rm -rf .claude/skills/unslop/{references,scripts,presets,assets,evals,SKILL.md}
    cp /tmp/unslop/SKILL.md .claude/skills/unslop/
    cp -r /tmp/unslop/{references,scripts,presets,assets,evals} .claude/skills/unslop/
    cp /tmp/unslop/docs/DECISIONS.md /tmp/unslop/docs/PRODUCT.md .claude/skills/unslop/docs/

Then update the commit line above.

## What the Python does

The Python is the skill, not an extra. The markdown files route; the scripts
measure. `scripts/` holds 19 files, about 6,700 lines.

| Script | Job |
| --- | --- |
| `banned_phrase_scan.py` | Finds banned phrases. Exit 1 means it found some. |
| `structure_scan.py` | Scores shape: sentence variety, signposting, closers. |
| `silhouette_scan.py` | Compares the text against a human writing profile. |
| `readability_metrics.py` | Grade level, sentence length, word counts. |
| `validate_preservation.py` | Checks a rewrite kept the facts of the original. |
| `diff_check.py` | Measures how much a rewrite changed. |
| `suggest.py`, `check_suggestions.py` | Builds and checks edit suggestions. |
| `harvest_*.py`, `voice_*.py`, `calibrate_*.py` | The `teach` flow: learn a voice. |
| `extract_constraints.py`, `_lang.py`, `check_packs.py` | Helpers. |
| `contribute.py`, `refresh_status.py`, `wiki_sync.py` | Maintainer tools. |

## Safety review

Read on 2026-09-01. Every script was checked for network calls, shell calls,
file deletion, and reading of secrets. The parts that do any of those were
read in full.

- **Network:** one script only. `wiki_sync.py` GETs the public Wikipedia page
  "Signs of AI writing" from `en.wikipedia.org`. It sends none of your text.
  Every other script is offline.
- **Secrets:** no script reads environment variables or credential files.
- **Shell:** `contribute.py` and `refresh_status.py` call `subprocess`. Every
  command is a fixed list in the code (`python3` on the skill's own scripts,
  and `git log`). Data files supply only stdin, never the command.
- **Deletes:** `voice_card.py` deletes every `*.md` under `<out>/card/` before
  it writes. Point `--out` at a new folder, not one holding your own notes.
- **Privacy:** `harvest_samples.py` reads chat transcripts to learn your voice.
  It only reads folders you name on the command line. No path is hard-coded to
  your home folder. It keeps user turns and drops assistant turns.
- Only the Python standard library is imported. No install step.
