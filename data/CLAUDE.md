# `data/` — authored content

The root `CLAUDE.md` still governs. This file holds what bites only once you edit content here.

- **Never round-trip `data/base-pack.json` through a JSON parser.** It reformats the whole file and the diff swallows the edit. The small authored files under `data/campaign/` are fine.
- **A "contained" ability edit often isn't.** A global ability-property edit (e.g. a shared `summon.*` range) is byte-identical only for *gauntlet substitution* slots — it also changes any **as-authored** encounter fielding a build that learns it, and `benchmark-suite.test.ts` will not flag the shift. Grep the ability across `data/encounters` + `data/builds` and state what moves.
