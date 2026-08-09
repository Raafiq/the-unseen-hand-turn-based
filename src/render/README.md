# `src/render/` — thin viewer layer

A deliberately thin render layer over the pure, headless sim (ADR-0007). It
**imports from `src/sim` and never the reverse** — the sim has zero render deps,
so it stays deterministic and unit-testable. Swap this layer to change the look
without touching the engine.

The authoritative spec for this layer is **`docs/10-viewer-and-interaction.md`**
(the turn state machine in §3, the transparency set in §4, AC-V1…AC-V10 in §6,
the determinism rules in §7). Its ACs outrank any ADR or sub-detail here.

## Contents

- `session.ts` — **the docs/10 §3 turn state machine, and it is DOM-free on
  purpose** (`AWAIT_ACTOR` / `PLAYER_IDLE` / `MOVE_STAGED` / `AI_TURN` /
  `ENDED`). It holds a `TurnDraft` — pure UI intent — and **nothing touches the
  sim until COMMIT**, so exactly one `Command` is emitted per player turn and
  cancel is free. Because it has no canvas/`document` dependency it is
  unit-tested headlessly (`session.test.ts`) rather than only through Playwright,
  and it can be built over **any** `BattleState`, which is how the legality tests
  use purpose-built fixture grids instead of editing the demo map.
- `preview.ts` — the docs/10 §4 **resolution transparency** payload: hit %, the
  named facing tier, the exact integer damage, target HP before→after and
  lethality, the CT price of the turn as staged (−100 / −80 / −60) with the
  actor's resulting CT and timeline slot (plus `timelineSlotExact`, so the row
  can be labelled projected only when it actually is), the target's statuses, and
  the Zodiac tier. Computed **only** from pure, RNG-free sim helpers (`hitChance`,
  `attackDamage`/`abilityDamage`, `relativeFacing`, `inAbilityRange`,
  `moveRange`, `settleTurn` on a throwaway clone) — **never by resolving**.
  Deferred rows (crit, reactions, status-on-hit, elemental, AoE, LoS, charge
  forecast) are **absent from the type**, not printed as zero.
- `iso.ts` — the isometric renderer: a pure projection `screen = f(x, y, height)`
  drawing the grid (with per-tile height), units (team colour, facing pip, HP
  bar, KO crystal + revive countdown, and a row of **status badges** — buff/debuff
  chips read straight off `UnitState.statuses`), the move-range highlight, the
  **staged-move marker + a translucent ghost of the actor**, **valid-target**
  tinting, a **distinct active ring for player (solid gold) vs AI (dashed)**, the
  keyboard tile cursor, in-flight charged-spell reticles, and damage / heal /
  miss popups. It also exposes the **inverse**, `pickTile(state, canvasX,
  canvasY, canvasW, canvasH)` → `Position | null`: not an algebraic inverse,
  because height lifts a tile up the screen and lets a tall tile occlude the ones
  behind it, so it hit-tests top faces in **reverse painter's order** (the shared
  `paintOrder()` that `draw()` walks forward) and returns the tile drawn on top.
  Only top faces are pickable. Covered by `iso.test.ts`.
- `demo.ts` — the demo battle, its presentation metadata, and a pure turn-order
  `forecast`. **No step policy lives here any more** (see below). `forecast()` is
  the one thing the viewer cannot compute exactly — it must price turns nobody
  has chosen yet — so it returns `{ entries, assumedFrom }`: the slots below
  `assumedFrom` are independent of its single guess (`ASSUMED_FUTURE_TURN_COST`,
  −80), the rest are projections and the UI shows them as such (docs/10 §4 item
  7, AC-V11). `forecast.test.ts` is the **forecast-vs-replay oracle** that keeps
  that claim honest.
- `main.ts` — DOM wiring only: pointer/keyboard adapters onto `Session`, the
  painting call, and `window.tuh`.
- `viewer-api.ts` — the `window.tuh` seam's **type**, shared by `main.ts` and the
  Playwright specs (`tsconfig.json` includes `e2e`, so the seam is typechecked on
  both sides).
- `prep.ts` — the prep/loadout viewer (customization pillar): the 5-slot chassis
  and the live battle-command projection, independent of the battle above.

## What changed with ADR-0015 (and why)

- **`stepDemo` is retired.** It was a SECOND turn-settling implementation — it
  called `settleTurn` directly, outside the driver — so the only mode a human
  generated state in produced no command log. The viewer now advances with
  `advanceToDecision` and commits with `applyCommand`, exactly like the headless
  harness, which is what makes rewind / save / share work for played battles
  (docs/10 §1). This changes the Playwright screenshot baseline's pixel values.
- **The demo's scripted Slow hex is gone, and that is correct.** It was
  render-layer *fiction*: the UI asserting a status the sim never inflicts
  (inflict-on-hit is deferred, ADR-0010). `docs/00` pillar 4 forbids that. The
  Knight's opening **Protect survives** because it is applied at battle
  construction through the sim's own exported helper, so it is a real status the
  resolvers actually read.

## Playing it

You command **Team A**. On your turn:

- click a highlighted tile to **stage a move** (nothing touches the sim — the
  ghost shows where you'd stand);
- click an in-range enemy to **strike from the staged tile** — one folded
  command, one settled turn, **−100 CT** (ADR-0015);
- or **End Turn**, whose label states the price it will pay
  (`End Turn · Move only · −80 CT`, `End Turn · Wait · −60 CT`);
- **Cancel** with Esc, right-click, the Cancel button, or by re-clicking the
  actor. Free — the sim was never called.
- An illegal click is a **no-op plus a reason chip**, never a throw. Legality
  comes from the sim (`moveRange`, `inAbilityRange`, the unit's `abilities`
  projection); the viewer never re-derives it with its own radius test.
- Keyboard: the canvas is focusable — arrows move a tile cursor, Enter selects,
  Escape cancels; every other action is a real button.

**Step** ships as **watch mode**: it resolves the currently active unit through
`decideBalanceProbe` regardless of team, so a fully scripted deterministic path
survives for the Playwright baseline — and so an AI turn advances on an explicit
beat rather than a wall-clock timer (nothing derived from wall-clock may reach
`BattleState`). AI turns therefore wait for Step rather than auto-resolving.

Run it: `npm run dev` (Vite dev server) or `npm run preview` (built app). The
entry HTML is `index.html` at the repo root. Visual tests live in `e2e/` and the
Pages deploy publishes this viewer plus a screenshot/video gallery.

## Known limitations, stated rather than hidden

- Team 0 projects exactly one action (`basic.attack`, instant, range `{h:1,v:1}`),
  so there are **no charged casts for the player** this slice, and because weapon
  range is unmodeled the **Archer is melee in the viewer** (docs/10 §5).
- Click-to-target offers only **instant, single-target** abilities: a charge
  needs a tile target plus the mid-turn outcome UI docs/10 §5 defers, and an AoE
  needs the AoE preview docs/10 §4 defers. Offering either without its preview
  would be a blind commit.
- `order:"after"` (hit-and-retreat) exists in the command schema and the driver
  but is **not exposed in the UI** — it would force choosing a retreat tile
  before seeing whether the attack hit (ADR-0015 Consequences).
