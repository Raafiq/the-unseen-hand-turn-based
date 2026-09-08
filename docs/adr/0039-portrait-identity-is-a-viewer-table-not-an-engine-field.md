# ADR-0039 — Portrait identity is a viewer table, not an engine field

- **Status:** Accepted
- **Date:** 2026-09-06
- **Deciders:** the owner, 2026-09-06. Per-character gender was delegated by the
  owner to the session: "i leave the gender of the characters to u."
- **Extends:** ADR-0035 (portraits come from GPT Image 2), ADR-0037 (landscape-phone
  stage). Constrained by `docs/10` AC-V22 (portrait is optional, tracked by asset key).

## Context

`docs/NEXT.md`'s handoff assumed `look()` in `src/render/game.ts` would resolve
"job x gender" straight from battle state. That assumption was wrong on one fact:
**nothing in the game knows a character's gender.** The roster schema
(`rosterSchemaVersion` 3, `data/campaign/camp-the-first-march.json`) has no gender
field, and `src/sim/state.ts` defaults every unit's zodiac to `gender: "neutral"`.
Nobody noticed until this slice, because every prior screenshot showed the one
bundled placeholder, which needs no gender to render.

Ten portraits (five jobs, two genders) are approved art. Shipping them means
answering, per character, which of the ten a given unit shows — and the engine has
no field to hold that answer.

## Decision

**Gender lives in the viewer, not the engine.** A per-character table in
`src/render/campaign-data.ts` maps a unit id straight to a portrait key (for
example `"pc-briar" -> "archer-f"`). Enemy units are named rows in the same
roster file and get entries the same way. No roster schema bump, no save
migration. The engine still knows no gender; it never needs to.

Seven characters get a real key:

| Unit | Job | Key |
| --- | --- | --- |
| Briar | archer | `archer-f` |
| Ottoline | priest | `priest-f` |
| Brigand | knight | `knight-m` |
| Marauder | knight | `knight-f` |
| Warchief | knight | `knight-m` |
| Cutthroat | thief | `thief-m` |
| Hexer | wizard | `wizard-f` |

Vance (geomancer) and Kest (monk) keep the placeholder: those jobs are out of
portrait scope (the reference README's "Scope" section).

**Only the six keys the table actually names are cut and bundled this slice** —
`archer-f`, `priest-f`, `knight-m`, `knight-f`, `thief-m`, `wizard-f` — shipped as
PNG, lossless, at 192x256. That is a 2x asset: the frame is 96x128 CSS px and the
game is phone-landscape first at 2-3x device pixel ratio (ADR-0037), so a 1x raster
would blur on the primary target. CSS is unchanged (`--portrait-ratio: 3 / 4`,
width 100%).

The other four approved keys — `archer-m`, `priest-m`, `thief-f`, `wizard-m` — are
**not** cut or bundled this slice. Nothing in the current roster names them, and
`campaign-data.ts`'s boot check (`portraitArtCoverage`, which wraps the sim's
`portraitCoverage`) throws on bundled art nothing names ("unused art"). Their
full-size source PNGs stay in `docs/visual/portraits/reference/` for a future
roster to claim.

The story pack (`data/campaign/story/camp-the-first-march.story.json`) moves
Briar and Ottoline's `asset` field from `"placeholder"` to `archer-f` / `priest-f`;
Vance and Kest stay `"placeholder"`. This is a content edit, not a code change —
the pack is swappable by contract (`docs/11` AC-M4).

## Alternatives considered

**A `gender` field on the roster schema.** More correct — the engine would know
the fact it is displaying. Rejected: it needs a `rosterSchemaVersion` 4 bump and a
save migration, and touches `src/sim`, for a fact only the viewer's portrait
lookup consumes. Not worth the cost to ship art.

## Consequences

**The engine stays gender-blind for portraits, on purpose.** Nothing under
`src/sim` changes. If a future roster schema adds a real `gender` field for other
reasons (AI flavor text, a stat modifier, anything the sim itself needs), that
field can supersede this table — but nothing requires it, and the table is not
a stand-in waiting to be promoted.

~~**Six of ten approved portraits ship; four sit approved but unwired.** Any
roster that later adds a unit named `archer-m`, `priest-m`, `thief-f` or
`wizard-m` needs that key cut and bundled before the table can point to it, or
the boot check refuses to load.~~

**Updated 2026-09-08 (ADR-0041): NINE of ten approved portraits ship.** The
six-member party wired `archer-m` (Vance), `wizard-m` (Kest) and `priest-m`
(Corin), each cut with Pillow at 192×256 from this doc's crop boxes. Only
`thief-f` sits approved and unwired; a roster that adds a unit needing it must
cut and bundle it first, or the boot check refuses to load.

**Four boot checks now police the table**, all in `campaign-data.ts`: (1)
`portraitArtCoverage` — the table's and the story pack's keys, union-checked
against bundled art, in both directions; (2) every `PORTRAIT_BY_UNIT` id is a
real roster id (party ∪ cast); (3) `portraitLinkMismatches` — a story
character's `asset` field agrees with its roster row's table entry. A unit
test also asserts each key's job segment (`"knight"` in `"knight-m"`) equals
that unit's `currentJob`.

**The portrait follows the character, not the job.** A unit's key is keyed on
its id, not its current job, so a Briar re-jobbed to monk in prep keeps
`archer-f` rather than falling back to the placeholder.

## References

- `docs/visual/portraits/reference/README.md` — Scope, and the ten portraits'
  approval record.
- `data/campaign/camp-the-first-march.json` (`rosterSchemaVersion` 3), `src/sim/state.ts`
  (~line 497, `zodiac.gender` default).
- ADR-0035 (GPT Image 2), ADR-0037 (the landscape-phone stage, the 96x128 frame).
- `docs/11` AC-M4 (the story pack is swappable by contract).
