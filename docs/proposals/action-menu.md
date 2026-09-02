# DESIGN SPEC — the action menu on the campaign battle screen

**Tag:** `[BASELINE]` — this is FFT's own menu. The current one-click flow is the deviation.
**Owning doc if accepted:** `docs/10-viewer-and-interaction.md` (§3 state table + §6, AC-V23 onward).
**Status: PROPOSAL. Not approved, not implemented. Owner reviewed 2026-09-02.**

## 0. Bottom line

The board today **chooses the player's ability for them**. `targetOptions` (`src/render/preview.ts:216`) walks `unit.abilities` and takes the first match in array order, and `build.ts:294` seeds `basic.attack` first. So at melee range the geomancer swings a sword instead of casting Pitfall (power **43** vs a weapon swing), and the archer swings instead of shooting. **No gesture in the shipped game says "use this ability."** The menu is the missing half of the action economy, not chrome over a working one.

That is also why the legend reads as redundant: it labels two colours the board paints unconditionally, because there is no choice for them to be a consequence of.

**One blocker on the colour half:** the party's only healer cannot heal. `white-magic.cure` carries `aoe {h:1,v:1}` (`data/base-pack.json:453`) and `isClickTargetable` refuses any AoE ability (`preview.ts:198-205`). The sim resolves instant AoE fine (`driver.ts:515`); the **viewer** refuses. Green has other reachable content (§5.3) but not the obvious one.

## 1. The six points

| # | | |
|---|---|---|
| 1 | **Pillar** | **4 (readable, honest UX)** directly; **1 (customization)** materially — the Secondary command, which `docs/02` calls the core of build identity, is invisible and unusable in play today. Flattens nothing; costs clicks, not choices. |
| 2 | **Opportunity cost** | Real, two of them. **(a)** The player gives up the simultaneous read — move range and threat range can no longer be seen at once; they must ask one question at a time. That is the FFT-faithful trade and what makes the menu a decision. **(b)** Two extra inputs per turn. |
| 3 | **Counterplay** | The honesty analogue: the menu never offers an action the build did not earn and never hides one it did. An ability with no legal target stays **listed and enabled**, paints an empty range, and says why — the answer changes when the unit moves. |
| 4 | **Archetypes** (`docs/03`) | Longshot (aimed-shot vs swing — today the swing wins at range 1, erasing the archer's identity exactly when it matters), terrain-geo (Pitfall vs swing), battle-cleric / hedge-caster (heal vs damage), spellblade / warlord (the Secondary command). It unblocks archetypes that are currently unplayable by hand. |
| 5 | **Tag** | `[BASELINE]`. One sub-decision `[ENHANCEMENT]` (§4.4, re-picking a staged move), one `[OPTIONAL]` (§4.7, inspect-on-click), AoE explicitly `[DEFERRED]`. |
| 6 | **Numbers** | **No combat constant moves.** CT stays −100/−80/−60. The only new constant is a colour, and §5 says why it is not chosen here. |

## 2. What is true today (re-derived 2026-09-02)

| Claim | Evidence |
|---|---|
| Both ranges painted every draw | `src/render/game.ts:442-443` |
| No menu of any kind | `index.html:568-574` — four buttons only |
| No green in the theme | `FIELD_THEME`, `src/render/iso.ts:86-158` (`buff` `#5cc98d` is a status badge, not a tile fill) |
| **The ability is chosen by array order** | `preview.ts:223` first-match; `build.ts:294` basic attack first |
| A unit projects <= 2 actions | `projectAbilities` = basic attack + current job's learned actions + equipped Secondary's. Every campaign PC has one learned action, no Secondary |
| **The priest cannot heal** | Cure is AoE; the viewer's filter excludes AoE |
| Campaign page has **no tile-click seam** | `GameApi` (`src/render/game-api.ts`) has none; only `window.tuh` does |
| Legend colours fixed and guarded 2026-09-02 | `paintLegend()` `game.ts:855`; `e2e/campaign.spec.ts:481` "legend: every swatch is the colour the board actually paints"; text at `:436-437` |
| Move panel held to two CIEDE2000 floors | `iso.test.ts:799`, `MIN_DE = 15`, own + cross, six `DAYLIGHT` bases |
| **The red target panel has never been measured** | that loop composites `FIELD_THEME.highlight` only (`iso.test.ts:822-823`) |

## 3. The menu

**Root, three entries, FFT's own:** `Move` · `Act` · `Wait` (the existing End Turn control, relabelled, keeping its price-naming label).

**`Act` opens ONE level: a command list grouped by command, not a nested submenu.**

```
Attack
Punch Art          <- group heading = the job's PRIMARY command
  Wave Fist
  Chakra
Aim                <- group heading = the equipped SECONDARY, when equipped
  Aimed Shot
```

FFT nests because a skillset holds a dozen spells; ours holds **one** per shipped unit, so a true submenu makes "hit the man in front of you" three clicks deep for no information. The **heading** stays because it is the thing `docs/02` calls the core of build identity — the player must see *"this row exists because I equipped Aim as my Secondary."*

**How real abilities reach it:** straight off `unit.abilities`, the same projection the sim fights with. No second table. `actionKind === "action"` -> a row. `formula === "none"` -> listed, **disabled**, reason shown (the `*-break` family, `steal.*`). Charged and AoE -> listed, **disabled**, reason shown. `isClickTargetable` stops being a filter that silently deletes options and becomes the predicate for *enabled vs disabled with a stated reason*. That is the behavioural difference and it is testable.

**Medium: DOM over the board, in `.board-stage`.** Canvas text cannot be contrast-measured, cannot take focus, cannot be read aloud — `index.html:222-226` already records that reasoning for the stat plate. Unlike the plate, the menu eats its own clicks. **Placement is an appearance decision — see §9.**

## 4. One range at a time

**Rule:** the board paints the range of the chosen action and nothing else. The staged ghost tile and the keyboard cursor are not ranges and stay.

**Nothing chosen => no range panel at all.** Named risk: this is a large visual *subtraction* and it is the first thing a new player sees. Mitigation, free under the purity rule: **hovering or keyboard-focusing a menu entry previews its range without choosing it** (range computation is pure; AC-V6 already forbids anything else). The player sweeps the menu and the board answers.

**State machine — `docs/10` §3's table is normative and must be rewritten in the same slice:**

| State | Board paints | Selectable | Transition |
|---|---|---|---|
| `PLAYER_IDLE` | nothing (menu at root) | menu rows | `Move` => `MOVE_PICK` · a command => `ACT_PICK` · `Wait` => COMMIT (`move` −80 if staged, else `wait` −60) |
| `MOVE_PICK` | **blue** move range | tiles in `moveRange` | legal tile => stage, return to `PLAYER_IDLE` · Cancel => `PLAYER_IDLE` |
| `ACT_PICK` | that ability's targets, **red** or **green**, from the **staged** tile | those units | target => COMMIT (target selection is still the confirm gesture) · Cancel => command list |
| `AI_TURN`, `ENDED` | unchanged | unchanged | unchanged |

`MOVE_STAGED` as a *phase* dissolves into "`PLAYER_IDLE` with `draft.move !== null`". **`TurnDraft` is unchanged**, the commit is unchanged — one `Command` per turn, `order: "before"`, −100 for the fold — which is what keeps AC-V1/V2/V9 intact.

**What it costs the two-step staged move: the menu wraps it, does not replace it.** Breakages:

| Breakage | Severity |
|---|---|
| `onPick`'s "empty tile in `moveRange` stages a move" becomes conditional on `MOVE_PICK`. Still inside the **one** tile-driven mutator, so `docs/10` §7 holds | mechanical |
| "Click the staged tile to unstage" / "click the actor to cancel" lose meaning at root; Cancel becomes the menu's back gesture | documented gestures — rewrite §3, do not drop silently |
| `e2e/play.spec.ts`'s `findArcPair` stages tiles via `clickTile` and reads targets from the staged tile — it will not run without an action-selection step in the seam | **real; budget for it** |
| Every `session.test.ts` "click tile, click enemy" case needs the menu step | volume, not risk |
| `step()`, `autoplay()`, `playtest.ts`, the balance probe bypass the draft entirely | none |

**`[ENHANCEMENT]`:** re-picking a staged move is allowed (the draft touches nothing until commit, and `docs/10` §3 already states cancel is total and free). Tagged deviation; **route to `fft-fidelity`** to confirm the baseline claim before the ADR.

**Cancel unwinds exactly one level:** target-pick -> command list -> root -> unstage the move -> "Nothing to cancel". This **changes Esc's current meaning** from "clear the whole draft" to "back one level" — deliberate, and what a three-level menu needs.

**No legal target:** listed, enabled; choosing it paints an empty range plus "No target in range from here". Not greyed — greying teaches that the ability is broken rather than that the player is standing in the wrong place.

**`[OPTIONAL]` — a click at root inspects a unit.** It would use the already-tested, currently dead seam `unitCardHtml(state, look, focusUnitId)` (AC-V22(i)). But cursor-follow was **parked by the owner 2026-09-01** (ADR-0033), so this is not proposed as a given. Raised as Q3 because "what does a click do at root" is a question the menu forces, and "nothing" is a legitimate answer.

## 5. The colour language

Colour is decided by **the relation between the actor and the unit on the tile**, per tile — never by the ability id, never by a per-battle table.

| Panel | Meaning | Constant |
|---|---|---|
| blue | tiles this unit may walk to | `FIELD_THEME.highlight` — shipped, measured, do not touch |
| red | a unit this action would harm | `FIELD_THEME.target` — shipped, **never measured** |
| green | a unit this action would help | **new**, hex **not chosen here** |

**Why no hex is proposed.** The floors are two-sided: >= 15 dE00 from the panel's own bare ground *and* from every other bare ground = **36 comparisons** over `grass #6d9a43`, `dirt #b08d5c`, `rock #9a958a`, `water #3f7ba8`, `sand #d3bb85`, `wood #9a7448`. Three previous blues each cleared one ground and collided with the next; the shipped blue works by being *lighter* than every surface, not by hue. **Green is the hardest case yet, because grass is green** — a saturated green fails own-ground over grass; the family that can work is a very light, low-chroma mint at high alpha, i.e. the same trick. **That is a hypothesis, not a measurement.** Sequence: `art-director` proposes 2-3 -> run through the existing helper -> owner judges them in real frames. Do not let a candidate ship on the own-ground floor alone; that is exactly how `#2d6fd8` shipped and collided with the river.

**Green must not be a colour with nothing to paint.** Reachable heals in the shipped campaign:

| Route | Reachable? |
|---|---|
| `punch-art.chakra` — heal, range `{1,1}`, **no AoE**; monk tree, `requires: ["wave-fist"]`, **120 AP** | **Yes.** Kest is a monk and already knows Wave Fist. Max grant is 120 AP/battle (`BASE_AP_GRANT 40` + `ACTION_AP_CAP 80`) |
| `white-magic.raise` — heal, range `{3,1}`, no AoE; priest tree via `protect`, 240 AP | yes, later |
| `white-magic.cure` | **no** — AoE |

So green has real content, but only if the player spends AP, and never in battle 1. Honest, and shippable. What must not happen is green appearing as a legend row or swatch on a unit that can never paint it — the "validates its input then discards it" shape.

**Red/green is the worst possible pair, and `docs/04` §7 already forbids colour alone** ("never color alone — pair with icon + label"). A second non-colour channel is **mandatory**: per-tile glyph (cross vs reticle), differing edge treatment (`targetEdge` is already its own constant), or hatch direction. The menu label is a third channel for free.

**Mixed targets:** colour is per tile, from the occupant — a mixed ability paints red over foes and green over allies in the same frame. There is no third "either" colour. An area ability paints its reach neutrally and its footprint per tile by the same rule. **Realizability, plainly: no shipped ability targets both sides** (`targetOptions` routes heal->allies, everything else->foes), so this is testable only against a purpose-built fixture, and the AC says so instead of naming a campaign battle that cannot produce the case.

## 6. What happens to the legend — reduced, and partly relocated

| Row | Verdict | Why |
|---|---|---|
| "Where the active unit can walk" | **remove** | The blue panel now only exists because the player chose `Move` a moment ago. The menu row is the label |
| "Whose turn it is" | **remove** | The stat plate names the acting unit (ADR-0033) and the turn plate names them over their head (ADR-0032). Three surfaces say it |
| "Your party" / "Enemies" | **keep for now** | The only key to the unit tokens, which are still flat kites — and the token treatment is **parked** (`docs/NEXT.md` visual slice 3). Removing it is a real loss until that lands |

**And relocate the swatch:** each menu row carries the swatch of the range it paints (Move blue, Attack red, Chakra green), painted from the theme constants by the same mechanism `paintLegend()` uses. The key then appears where and when it is needed, next to a word — `docs/04` §7 satisfied structurally.

**Do not delete the guard with the row.** `e2e/campaign.spec.ts:481` landed 2026-09-02 against exactly this drift class; when the move swatch moves into the menu it must be **re-pointed at the menu's swatches in the same commit**. `campaign.spec.ts:436-437` asserts the legend's text and moves with the rows it names.

## 7. Keyboard

- **Focus decides what arrows drive**: menu rows when the menu holds focus, the tile cursor when the canvas does. Neither may swallow the other's keys — the canvas handler (`game.ts:785-802`) must not `preventDefault` an arrow while the menu is focused.
- **Enter** activates the focused row (and on choosing an action, focus moves to the board so the next arrow walks tiles). **Esc** backs out one level. **Tab** reaches the menu; every row shows `:focus-visible`.
- **Known gap this slice must close:** the campaign page exposes **no tile-click seam**, so a browser spec cannot drive target selection without raw canvas pixel clicks, which `docs/10` §8 forbids. Either `GameApi` gains `clickTile` (mirroring `viewer-api.ts`, through the same `onPick`) or the browser half of AC-V27 is unwritable. Decide up front (Q5).

## 8. Explicitly NOT in this slice

AoE targeting and footprint preview (consequence: Cure stays unusable, shown disabled with the reason) · charged casts for the player · `order: "after"` · Item/Equip/Status commands · facing choice · any re-tuning · the unit token treatment · cursor-follow/inspect · the engine viewer `/viewer.html` (it keeps both ranges lit, which also preserves the A/B proving the campaign board changed).

## 9. What the owner must SEE rendered before approving (route to `art-director`)

1. **The empty board** — `PLAYER_IDLE` with no range panel, on battles 1 and 4. The biggest change in the slice, and it is subtractive.
2. **Green candidates**, 2-3, composited over all six grounds *in real frames* (a healer with Chakra lit on grass, sand, water) — never as swatches on a card.
3. **The non-colour channel** — glyph vs edge vs hatch, three frames, at the shipped 900x440.
4. **Menu placement and medium** — an FFT window over the board (which corner, against the plate at bottom-left) vs a list in the controls row under it.
5. **The reduced legend** — two rows plus swatches inside the menu, against today's four.
6. **Hover-preview of a range from the menu** — it either reads as the board answering, or as flicker. Only motion shows which.

## 10. Open questions

| # | Question | Recommendation |
|---|---|---|
| Q1 | Green now, or green with Cure? | **Ship green now** (Chakra route); open AoE targeting as the next slice |
| Q2 | Was "the priest cannot heal" known? | Add it to `docs/10` §5's limitations this slice regardless |
| Q3 | Does a click at root inspect a unit? (un-parks cursor-follow) | Owner's call; otherwise a root click is a no-op |
| Q4 | Grouped-flat command list, or true nested submenu? | Grouped-flat; revisit at five learned abilities per skillset |
| Q5 | Does `GameApi` gain `clickTile`? | Yes, mirroring `viewer-api.ts` through the same `onPick` |
| Q6 | Esc changes meaning to "back one level" | Accept |

## 11. Acceptance Criteria — AC-V23 … AC-V29

**AC-V23 (the menu is the unit's real command list).** Rows derived from the `abilities` projection + registry skillset labels, never a static table.
- **(a) Two units, two menus.** Fixture: Briar (`aim.aimed-shot`) and Kest (`punch-art.wave-fist`) — both shipped, both deployed in battle 1. *Discriminator:* a hard-coded menu renders identically for both.
- **(b) The Secondary reaches the menu — A/B on the built object.** Same `UnitRecord` compiled with and without `loadout.secondary`; menus differ by exactly those rows and are **otherwise byte-identical**. *Discriminator:* the dead-slot shape — a menu reading only the primary type-checks, validates and ignores the slot while every other assertion stays green. **No shipped unit equips a Secondary**, so this is fixture-only and the test must say so.
- **(c) A non-castable ability is listed, DISABLED, with a reason — not hidden.** Fixtures: Ottoline's `white-magic.cure` (AoE) and `foe-cutthroat`'s `steal.gil` (`formula: "none"`), both shipped. *Discriminator:* today's filter deletes both rows silently.

**AC-V24 (one range at a time, and none before a choice).** On a state where **both** sets are non-empty — assert that first, it is the non-degeneracy half — assert root paints **neither**, Move paints (non-empty, empty), an act paints (empty, non-empty). *Discriminator:* "the move tiles are painted after choosing Move" alone passes against today's renderer, which paints them always; without the both-non-empty precondition the empty assertions are vacuous.

**AC-V25 (the chosen ability is the ability that fires) — the load-bearing one.** An actor with `basic.attack` **and** `aim.aimed-shot`, a foe at Chebyshev distance **1** (both reach) and one at distance **3** (only Aimed Shot reaches). Select Attack -> target the near foe -> the single command carries `basic.attack`. Reset, select Aimed Shot -> **the same near foe** -> the command carries `aim.aimed-shot`, and the previewed magnitude differs. *Discriminator, and it is a live defect:* today `targetOptions` returns `basic.attack` under both selections. **The distance-1 foe is the discriminating case precisely because both abilities reach it** — a fixture using only the distance-3 foe is a tie, since only one ability is legal there and both implementations agree. Realizable: Briar carries exactly this pair in battle 1; a purpose-built `Session` fixture is preferred.

**AC-V26 (cancel unwinds exactly one level, sim untouched).** Root -> command list -> target-pick -> Cancel x3, with a **staged move** in the sequence or the unstage level is never exercised. After each Cancel: moved exactly one level, `serialize()` byte-identical to the pre-menu string, `rngCounter`/`tick` unchanged, log length **0**. *Discriminators, all three required:* a Cancel that jumps to root passes "cancel returns to idle" and fails this; `serialize()` equality catches speculative apply-and-rollback; log length catches a committed no-op.

**AC-V27 (keyboard reaches every action, and a whole turn is playable by keys alone).** Browser: using only Tab/arrows/Enter/Esc, stage a move, choose an act, select a target; assert **one** command committed and the actor settled at **−100**. *Discriminators:* focus-visibility alone passes against a menu no key can activate; "a command exists" alone passes against a mouse fallback; the −100 ties the keyboard path to the *folded* command. A second case asserts arrows walk the menu under menu focus and the tile cursor under canvas focus, on a fixture where the two would move different things. **Blocked on Q5** for the target-selection half; if the seam is declined, write it unit-level plus a reduced browser half and say so.

**AC-V28 (the colour language, and it is not colour alone).**
- **(a)** Panel colour follows the act's effect on the occupant, per tile. Same actor, one heal and one damaging ability, an ally and a foe on the board. **Include an enemy healer case** — *discriminator:* an implementation keyed on the ability id, or on the target's team relative to the **player** rather than the **actor**, passes the ally case and fails there.
- **(b)** A second non-colour channel: record the canvas calls for friendly and hostile ranges and assert they differ in **something other than fill colour**. *Discriminator:* `friendly !== target` alone is satisfied by two colours a deuteranope cannot separate, which `docs/04` §7 forbids.
- **(c)** Mixed-target abilities colour per tile: a purpose-built both-sides ability with an ally and a foe in range paints **both** fills in one frame. **No shipped ability exercises this** — fixture-only, and the AC says so rather than naming a battle that cannot produce it.

**AC-V29 (the separation floor applies to the SET, not to one constant).** The own- and cross-ground CIEDE2000 floors now guarding `FIELD_THEME.highlight` apply to `highlight`, `target`, `friendly` and `staged`: 6 own + 30 cross each at `MIN_DE = 15`, **and assert the set's size** so a later panel cannot be added without being covered. Keep both historical mutation cases (`#8fd0ff` at 34% fails own-ground; `#2d6fd8` at 65% passes own-ground and fails cross). Add a panel-vs-panel floor **only** for pairs that can appear in one frame (today `staged` beside an act range; under (c), friendly beside hostile). **Expect `FIELD_THEME.target` to be measured for the first time here and budget for it moving** — if red fails on a ground, that is the guard working; do not weaken the floor to keep the hex.

## 12. Doc changes owed (route to `docs-steward`)

`docs/10` §3 (state table rewritten — landing code against the old table is a half-landed rename), §4 item 2 (the unconditional range promise becomes conditional), §5 (add the priest/Cure limitation), §6 (AC-V23…V29). Plus an **ADR** via `decision-record`: this reverses a shipped interaction model and changes Esc's meaning, and §4.4's `[ENHANCEMENT]` must be named as a tagged deviation after `fft-fidelity` confirms the baseline.

## 13. Recommendation

Build it in this order, and split the colour half if Q1 comes back "hold green":

1. **Menu + one-range-at-a-time + blue/red + cancel stack + keyboard + the legend reduction.** All real today, and AC-V25 fixes a live defect.
2. **Green, its non-colour channel, AC-V28/V29** — after `art-director` puts candidates in real frames and they clear the floors.
3. **Separately, next: AoE targeting**, which makes the party's healer work. The sim already resolves it; only the viewer refuses, and under this repo's own rule ("when a deferred capability ships, go un-hide it") that silence has already crossed from honest to dishonest.

The thing most likely to go wrong is not the menu. It is shipping a green panel nothing in the player's first two battles can paint, and a red/green pair ~8% of players cannot separate. Both are addressed above; neither is addressed by a hex.
