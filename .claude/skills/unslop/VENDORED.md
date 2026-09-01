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

## Not audited

The `scripts/` and `evals/` Python files are third-party code. They were not
reviewed line by line. They import only the Python standard library.
