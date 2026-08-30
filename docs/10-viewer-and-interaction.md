# 10 — Viewer & Interaction

> **Authoritative spec for the player-facing viewer.** The viewer became a system the
> moment it accepted input, and a system needs a home doc — burying its Acceptance
> Criteria in `docs/04` ("improvements") invites exactly the spec-drift already caught
> once, where `docs/06` AC-E2 sat at N=5 while the code said 6. Per CLAUDE.md, **this
> doc's ACs outrank any ADR or specialist sub-detail that contradicts them.**

The viewer is the thin `src/render/**` layer over the pure headless sim (ADR-0007). It
**imports the sim and never the reverse.** Nothing in this doc may add sim dependencies
on rendering, input, or wall-clock.

---

## 1. The controlling principle: input is a command SOURCE

Determinism is `(seed, ordered commands)` (`docs/05` §3b, ADR-0004). A human clicking a
tile and the balance-probe AI choosing one are **the same kind of event**: both produce a
`Command`, both go through `applyCommand`, both land in the same replayable log.

This is not an implementation convenience — it is the reason player battles get rewind,
mid-battle save, and shareable build/challenge codes for free. A viewer that drove the
sim through its own bespoke policy would produce no command log, and the P0 substrate
would silently become AI-only scaffolding.

Two consequences are binding:

- **`advanceToDecision` is the single "who acts next" primitive**, shared by the
  interactive viewer and the headless harness. They cannot diverge, by construction.
- **The sim owns legality.** The viewer asks (`moveRange`, `inAbilityRange`, the equipped
  `unit.abilities` projection); it never re-derives reachability or range with its own
  radius/Manhattan check. If a click passes the viewer's check and `applyCommand` then
  throws, that is the viewer/sim fork this design exists to prevent — surface it loudly,
  never swallow it.

## 2. Control assignment

The encounter schema already carries `controller: "ai" | "player"` per team
(`EncounterSchema.teams[].controller`), so a future encounter can set this per battle
without a code change.

> **Not yet wired, stated rather than implied.** `controller` lives on the `Encounter`,
> but the viewer's demo battle is built directly via `createBattleState`, and
> **`BattleState` carries no controller field** — so there is nothing for the viewer to
> read at battle time. The player team is currently a `PLAYER_TEAM = 0` constant in
> `demo.ts` with a TODO naming the field and the `loadEncounter` path. Wiring it means
> either threading the encounter through to the viewer or adding controller to
> `BattleState` (a schema bump). Deferred, not done.

`[BASELINE]` Player-controlled units accept input. AI-controlled units resolve via
`decide(state, unitId)` → `applyCommand`, with input inert.

### 2a. Who decides a battle is over (ADR-0023)

`[BASELINE]` **A battle is judged by its ENCOUNTER's objectives, not by counting
corpses.** `SessionOptions.rules` carries the encounter's `victory` / `defeat` /
`maxTurns` / `maxTicks`, and a session that has them runs `evalTerminal` inside the
harness's own fold — advance, account, *then* judge. It also emits a real `RunReport`,
assembled from the same `harness.ts` helpers `runFromState` uses, which is what the
campaign banks (`docs/11` AC-M1).

> **The demo battle on `/` is the exception, and it is stated rather than implied.** It
> is built by `createBattleState` and carries no `Condition` at all, so it keeps the
> team-wipe read. That read is not a rule the sim models — it is the most a
> conditionless battle can honestly support, and it is retired the moment rules arrive.
> The discriminating case is a `defeatUnit` victory with another foe still standing: the
> two readings give **opposite** answers there, which is why the fixture asserting this
> uses exactly that shape.

## 3. The turn state machine

The viewer holds a **`TurnDraft`** — `{ actorId, move: {to} | null, act: {abilityId,
target} | null }` — that is *pure UI intent*. **Nothing touches the sim until COMMIT**,
and exactly one `Command` is emitted per player turn. This is what makes cancel free,
previews honest, and speculation impossible.

| State | Selectable | Transition |
|---|---|---|
| `AWAIT_ACTOR` | — | `advanceToDecision` → player team ⇒ `PLAYER_IDLE`; AI team ⇒ `AI_TURN`; `terminal:"stalemate"` ⇒ `ENDED` |
| `PLAYER_IDLE` | tiles in `moveRange`; enemies in `inAbilityRange` from the **current** tile | tile ⇒ `MOVE_STAGED`; enemy ⇒ **COMMIT** act-only (−80); End Turn ⇒ **COMMIT** `wait` (−60) |
| `MOVE_STAGED` | enemies in `inAbilityRange` from the **staged** tile; the staged tile (click = unstage) | enemy ⇒ **COMMIT** `{kind:"act", …, move:{to, order:"before"}}` (−100); End Turn ⇒ **COMMIT** `{kind:"move", to}` (−80); Cancel ⇒ `PLAYER_IDLE` |
| `AI_TURN` | — (input inert) | **Step** → `decide` → `applyCommand` → `AWAIT_ACTOR` |
| `ENDED` | — | terminal banner |

> **An AI turn advances only on Step — there is no auto-resolve, deliberately.** A
> wall-clock timer racing with an explicit step would make "how many commands have been
> applied by now" a function of elapsed time, which is nondeterministic and would break
> both the visual baseline and any e2e. So `AI_TURN` is a real observable phase the player
> steps through, and the button relabels to `Enemy turn ▸ Resolve`. A paced auto-advance
> would need an epoch guard and is not in this slice.
>
> **The `ENDED` transition is wider than the sim's verdict.** The table's `terminal:
> "stalemate"` is the only terminal state the *sim* models. The viewer additionally ends
> on a wiped team and shows Victory/Defeat — a **viewer-level** reading, not a sim
> verdict, because no encounter victory/defeat condition is evaluated here. Listed under
> §5's limitations rather than left implicit.

- **Confirm model:** selecting the *target* IS the confirm gesture. By then the preview
  (§4) has already shown hit %, damage and the CT price, so there is no blind commit and
  no redundant "are you sure" dialog.
- **Turns with no act** are committed by an explicit **End Turn** button whose label
  states the price it will pay (`End Turn · Move only · −80 CT`).
- **Cancel** (Esc / right-click / re-clicking the actor) clears the draft to turn start.
  Total and free — the sim was never called.
- **Illegal click** is a no-op plus a transient reason chip ("Out of Move range").
  Never a throw, never a state change, never a consumed command.
- **Accessibility** `[BASELINE]` — every action reachable by keyboard with visible focus
  (`docs/04` §7). End Turn and target selection are not mouse-only.

## 4. Resolution transparency — the minimum honest set

`docs/00` pillar 4 and `docs/04` §3 adopt resolution transparency **fully**. Before any
commit-click, and computed for the **staged** position, the player SHALL see:

1. The turn-order timeline (`forecast`).
2. Move range from the current tile; act range recomputed live from the **staged** tile.
3. **Hit %** — from `hitChance(accuracy, evasion, relativeFacing(target, stagedPos))`.
4. **The facing tier** (front / side / rear) that produced it, named. This is load-bearing:
   it is *the* reason move-then-act is a real tactical choice.
5. **Damage** — the exact integer. This engine's magnitude is deterministic given a hit,
   so a range would be a lie.
6. Target HP before → after, and whether it is lethal.
7. **The CT price of the turn as staged** (−100 / −80 / −60), the actor's resulting CT,
   and its resulting slot in the timeline. Non-negotiable — this is `docs/00`'s "CT
   forecast", and the only thing that makes the fold's opportunity cost visible.
   > **The timeline is split at an explicit honesty boundary — facts, then projections.**
   > A forecast cannot know what a future actor will *choose* (move? act? both? wait?),
   > so it cannot know what that turn will cost; `forecast()` therefore guesses exactly
   > once, in one named constant (`ASSUMED_FUTURE_TURN_COST` = **−80**, the model
   > ADR-0015 disproves). Guessing *better* is not available — but the boundary is:
   > **a unit's CT cost only ever moves its own NEXT turn**, so every slot before the
   > first point at which an already-listed unit could come round again is independent
   > of the guess. `forecast()` returns that index as `Forecast.assumedFrom`, computed at
   > the *cheapest* legal turn (−60) so it is a lower bound and never overclaims.
   >
   > The viewer SHALL present the two halves differently: slots below `assumedFrom` as
   > fact, slots from it on visually distinguished behind a divider naming the assumed
   > price, and the "next slot" row labelled `(projected)` **only when the value actually
   > is** — with the disclaimer stating *why* in either case (AC-V11).
   >
   > **Residual approximation, stated rather than hidden:** the boundary covers the CT
   > *cost* model only. A future actor's choice can also change the timeline's
   > *composition* — beginning a charged cast inserts a new actor no forecast can
   > anticipate, and a crystallizing KO removes one — so the leading stretch is exact
   > with respect to cost, still contingent on nobody ahead starting a cast. The UI hint
   > says this. A KO'd unit's turn is likewise a crystal tick priced −60, not −80: a case
   > the assumption gets provably wrong, and one the boundary already covers (it is a
   > *second* turn for that unit) rather than one the forecast pretends about.
   >
   > **Forecast accuracy is now tested against a real replay** (`src/render/forecast.test.ts`):
   > the oracle advances the sim with real commands and compares the realized actor order
   > with the order forecast beforehand. Measured on the shipped demo state, the exact
   > prefix is **3 of 8 slots**. The follow-up `ai.ts`-fold slice inherits a green/red
   > signal instead of a landmine — it must keep the prefix exact under the −100 model,
   > and the only thing it may need to touch is the one constant.
8. The target's active statuses.
9. **The statuses this act will apply on a hit** — read off the ability's own resolved
   templates, so the panel cannot promise one the resolver would not.
10. **What the target's equipped reaction will do back** — the reaction's id, its trigger
    odds (the target's Brave), the counter-swing's own hit % against the actor, the exact
    damage, and whether it would be lethal. Shown **only when a reaction can actually
    trigger from the staged tile**: absent when the target has none, when the act is not
    physical, when the actor is outside the target's reach, and when the act would kill
    the target first (a corpse does not counter — "kill it before it swings back" is a
    real read the panel must support). A `preemptive` reaction leads with the fact that it
    **cancels the act**, because every number above that row is then moot.

`[ENHANCEMENT]` The Zodiac / Faith contribution line (`zodiacCompatibility` is already
exported, and the total already includes it). `docs/04` §3 requires surfacing hidden
multipliers, so shipping only the total is *partial* compliance.

**`[DEFERRED]` — and these MUST BE ABSENT, not shown as zero:** crit, elemental
weak/half/absorb (unmodeled per ADR-0010); AoE preview and LoS; charge-maturity forecast.
Printing "Crit 0%" asserts a modeled zero, which is a dishonest UI under pillar 4. Omit
the row entirely.

> **This list SHRINKS as capabilities land, and keeping it current is part of the slice.**
> The rule is "never assert an effect the engine cannot back up" — not "these rows stay
> hidden". `status-on-hit` and `reactions` both sat on this list *after* the engine had
> started doing them, so the omission had flipped from honest to dishonest: a player would
> commit a melee swing at a Counter Wall seeing only what it costs the target, with no hint
> that half the damage is coming straight back. When a deferred capability ships, go
> un-hide its row in the same slice.

## 5. Available player actions (current slice)

`[BASELINE]` The player's action set is **whatever the loadout projects** — the viewer
reads `unit.abilities` and never grants an action the build did not earn.

Known limitations of the shipped demo roster, stated rather than hidden:

- **The Archer shoots (2026-08-16).** It carries `aim.aimed-shot` — its OWN job's skill,
  range `{h:5,v:3}` — so the viewer now demonstrates the range/tempo asymmetry that
  motivates the fold: fire from a standstill at −80, or spend the move to flank at −100.
  > This bullet previously read *"because weapon range is unmodeled, the Archer is melee
  > in the viewer… fixing it is a fidelity change with golden vectors attached"*. **That
  > blocker was misidentified and the mistake outlived the whole viewer.** Weapon range
  > being unmodeled is true and still is (`basicAttackFrom` hard-codes `{h:1,v:1}`, and
  > equipment is deferred per `docs/05` §4) — but it never blocked THIS. An Archer reaches
  > across the board through a bow *skill*, which needs no equipment layer at all. Naming
  > an oversized blocker made the gap look better-understood than it was; cf. CLAUDE.md's
  > rule that a stated reason must be the one that actually binds.
- **No charged casts for the player**, and the Knight still projects only `basic.attack`.
  Both are deliberate. A team-0 unit is not handed a *borrowed* ability (a Knight casting
  Fire) — that is the "job identity masked by a borrowed ability" failure CLAUDE.md logs
  twice, and it is why the Archer got its own skill rather than someone else's. The Knight
  has no skill to get: `battle-skill` is the one shipped skillset with no live action at
  all (every `*-break` is `formula: "none"`), so it stays a plain bruiser until the
  break/debuff rework lands.
- **The demo roster sits outside the `docs/07` §3 time-to-kill band.** Measured: a "tank"
  dies in 2 committed actions where the band says 3–4, and a squishy dies in 1. ADR-0016
  re-tuned the *shipped builds* to the band; the hand-authored demo units were never
  brought with them. Consequence, also measured: the watch-mode battle now resolves in 6
  turns, and giving a melee unit reach on top of this just delivers the one-shot sooner —
  `punch-art.wave-fist` on the Brawler KO'd the player's Archer from three tiles on the
  AI's first turn, so it was left out. Re-tune the roster before adding more reach.
- **Victory/Defeat is a viewer-level reading, not a sim verdict.** The viewer ends the
  battle when a team is wiped, but the sim models only `terminal: "stalemate"`; no
  encounter victory/defeat condition is evaluated in the viewer path. A battle that an
  encounter would call won for another reason will not be recognised here.
- **`order: "after"` (act-then-move) is unreachable from the UI.** It exists in the
  command schema and the driver (ADR-0015) and is covered headlessly, but the viewer only
  ever constructs `order: "before"`. Exposing it would force the player to pick a retreat
  tile before seeing whether the attack hit — a pillar-4 regression.

## 6. Acceptance Criteria (SDD-ready)

Each fixture below is built so that the **plausible wrong behaviour gives a different
answer** (CLAUDE.md: an AC test must exercise the discriminating case — never a tie or
degenerate fixture where all orderings coincide).

> **Namespace:** these are **AC-V** (viewer). `docs/07` already owns `AC-P1…AC-P5` for
> pacing, so an `AC-P` name here would make `grep AC-P5` ambiguous across two specs. Each
> doc owns a letter: `01`→AC-0*, `02`→AC-J*, `05`→AC-S*, `06`→AC-E*, `07`→AC-P*,
> `10`→AC-V*.

- **AC-V1 (the fold is inert):** Replaying `GOLDEN_LOG` under the extended command schema SHALL serialize to the **existing committed golden literal, unregenerated**. *Discriminator:* any non-additive change to the shared act/move path shifts the roll cursor or the settle and breaks the literal. **The golden is a tripwire on this slice, not a maintenance item** — if it moves, the fold was not additive.
- **AC-V2 (the combined turn is priced at −100):** An actor at CT 108 issuing one combined move+act SHALL settle to **CT 8** having consumed **one** command; the same actor issuing move-only SHALL settle to **CT 28**. *Discriminator:* asserts (CT, command count) — "the attack happened" is degenerate, since both paths eventually attack.
- **AC-V3 (the act resolves from the POST-move tile):** With the target facing N, the actor starting in the target's **front** arc and out of reach, and a **rear-adjacent** tile inside `moveRange`, a combined command SHALL resolve in the rear arc with a **strictly greater** hit chance than acting from the origin. *Discriminator:* the plausible bug (resolving before applying the move) yields the front arc and a lower number. The fixture MUST give the target non-zero directional evasion so front ≠ rear — a zero-evasion target is the tie trap.
- **AC-V4 (order is honored):** With `order:"after"`, on a fixture where the target is in range **from the origin and out of range from the destination** (hit-and-retreat), the act SHALL resolve, the final position SHALL be the retreat tile, and the settle SHALL be −100. *Discriminator:* an implementation that always moves first throws "out of range".
- **AC-V5 (charged acts lock the other sub-phase):** An `act` with a charged ability plus `order:"after"` SHALL be rejected (`docs/01` §2). Move + charged act (`order:"before"`) SHALL settle the caster at **−100**. *Discriminator:* `charge.ts`'s previously hard-coded `didMove:false` produces CT 28 instead of 8.
- **AC-V6 (preview purity):** Any sequence of hovers, stagings and cancels SHALL leave `rngCounter` and `tick` unchanged; only a committed command advances them. *Discriminator:* a preview implemented via `resolveAttack` bumps `rngCounter` once per hover; a preview via speculative `applyCommand` advances `tick`.
- **AC-V7 (the sim owns legality):** A click on a tile the sim excludes SHALL be a no-op, on all three exclusion grounds — **impassable**, **beyond `jump`** (height delta), and **occupied**. *Discriminator:* each fixture tile MUST lie **inside** a naive Manhattan `move`-radius and **outside** `moveRange`, and the test MUST assert both halves — `expect(naiveRadius).toContainEqual(tile)` as a non-degeneracy guard, then `expect(moveTargets()).not.toContainEqual(tile)`. Without the first assertion the test passes against the buggy radius-viewer too, and proves nothing.
  > **These fixtures MUST be purpose-built grids, not the demo map.** An exhaustive scan of `makeDemoBattle()` found its maximum orthogonal height delta is **1** while the lowest `jump` on the field is **1** — so **no tile on the demo map is excluded by `jump` for any unit**, and the rock at (6,2) is outside every unit's move range on the opening turns. A jump-exclusion test written against the demo map is *unrealizable*: it would pass against a naive-radius viewer. This is why the turn state machine lives in a DOM-free `session.ts` constructible over an **arbitrary** `BattleState` — so a test can build a grid with an explicit, named height delta (e.g. an unskirted height-4 spire adjacent to a `jump:1` unit) instead of hoping the demo map happens to discriminate. The jump fixture must additionally assert `tile.passable === true`, or it is only re-testing the impassable case.
- **AC-V8 (no viewer/harness divergence):** For an AI turn, the viewer's resulting state SHALL serialize identically to the headless harness's from the same input state.
- **AC-V9 (a played session is replayable):** The viewer's recorded `(seed, commands)` — including at least one **combined** command and at least one **cancelled** draft — replayed through `replay()` SHALL reproduce the live final state byte-for-byte, and a rewind-to-K-then-replay SHALL match. *Discriminator:* the cancelled draft must leave no trace in the log.
- **AC-V10 (screen→tile picking respects height):** A canvas click SHALL resolve to the tile actually drawn on top at that point. *Discriminator:* on a map with a raised plateau, a height-ignoring inverse projection returns a different tile than the one the player sees — the test asserts the drawn-on-top tile and fails against the naive inverse.
- **AC-V12 (a reaction is surfaced before the player commits):** When the hovered target carries a reaction that can trigger from the staged tile, the preview SHALL surface it with its trigger odds and the **exact** damage the counter-swing deals the actor; when it cannot trigger, the field SHALL be **absent**, never zeroed. *Discriminator:* the previewed number must equal the HP the actor actually loses on commit (a warning without the number is not transparency), and the same fixture **without** the reaction must show no row and cost the actor nothing — plus one out-of-reach and one lethal-act fixture that differ from the firing case in exactly one respect.
- **AC-V13 (the battle ends, and the banner is team-relative):** When a team is wiped, the session SHALL enter `ENDED` on the **same commit** that lands the killing blow — not one turn later — with `activeUnitId` null, a Victory/Defeat banner, and every subsequent pick and End Turn refused. The banner SHALL name the outcome **relative to `playerTeam`**. *Discriminator:* one fixture, one killing blow, run twice with `playerTeam: 0` and `playerTeam: 1` — byte-identical sim events, opposite banners. A viewer that hard-codes team 0 as the player passes a one-sided test and fails this one. A second discriminator covers the KO that lands **during the advance** rather than inside a commit — a charge maturing on the last survivor, where nobody has committed anything, so only a post-advance check can catch it. **Measured, not assumed:** deleting the post-advance check leaves every other AC-V13 case green and fails exactly that one; asserting `phase === "ENDED"` right after a killing *click* does **not** discriminate here, because the pre-advance check already sees that wipe. The shipped demo battle SHALL additionally be driven to a decided end **both ways** — watch mode to whichever outcome it reaches, and a player who waits every turn to **Defeat** — so "the game can be finished" is asserted on the content a player actually loads, not only on a fixture.
- **AC-V14 (the site's three routes):** `/` SHALL serve the campaign, `/viewer.html` SHALL serve the engine viewer, and `/game.html` SHALL reach the campaign. *Discriminator:* asserted against the BUILT site (Playwright serves `dist`), because a page missing from `rollupOptions.input` works under `npm run dev` and is simply absent from the build — nothing in the unit suite can see that. "Both pages loaded" is degenerate: two rollup entries pointed at one file serve identical HTML at both paths and satisfy it, so the test asserts the two install **different seams** (`window.tuhGame` vs `window.tuh`). The redirect is asserted in two halves — the fetched document is not blank and carries a link (a typo'd `<meta http-equiv="refresh">` renders a perfectly ordinary empty page, and that is all a reader with scripting disabled gets), and following it lands on the title screen.
- **AC-V15 (text on the campaign's surfaces clears WCAG AA, measured):** Every element holding visible text on `/` SHALL clear **4.5:1** (3:1 for large text) against the worst ground it can be painted on, and the sheet's content padding SHALL clear the scorch band so no text sits on burnt ground. *Discriminator — and the reason this AC is worded around measurement:* **axe-core cannot make this claim here.** It declines to judge contrast it cannot flatten, and on the briefing screen it evaluated 2 nodes while returning 106 as "incomplete" **and reported zero violations** — a pass indistinguishable from the one an unreadable page would produce. `a11y.spec.ts` therefore disables the `color-contrast` rule explicitly rather than banking that green. The claim is carried by `contrast.spec.ts`, which computes ratios in the page against **both extreme stops** of each sheet's gradient (a single sampled pixel is degenerate: the failure mode is text near the dark end), composites translucent layers, and treats an element with its own opaque fill as its own ground. The declared stops are asserted to be ones the page actually paints, so a re-toned sheet cannot be silently measured against the old palette.
- **AC-V11 (the forecast declares where it stops being a fact):** `forecast()` SHALL return the index `assumedFrom` from which its entries depend on `ASSUMED_FUTURE_TURN_COST`, and a **forecast-vs-replay oracle** SHALL assert that driving the sim with real commands realizes the forecast order over `[0, assumedFrom)` under **both** the −80 and the −100 cost model. The viewer SHALL mark slots `≥ assumedFrom` as projected, and the preview's "next slot" row SHALL be labelled projected **iff** its slot falls outside the prefix. *Discriminator:* the fixture must be one where the two cost models give a **different actor order** — measured, the shipped demo state does **not** (its first eight slots are identical under −80 and −100), so the oracle uses a purpose-built speed ladder in which one folded −100 command flips slot 3 from `hasty` to `slow`. A test that passes under both cost models certifies nothing here; a boundary computed from the *assumed* walk instead of the cheapest one overclaims by a slot and must fail.

- **AC-V16 (the scene player advances one line at a time, and its position survives a
  repaint):** A story beat SHALL open on ONE line with a control to reveal the next, and
  the read position SHALL survive every repaint the screen inflicts on itself, while a
  genuinely different beat SHALL start again from line one. *Discriminators:* assert the
  **element count**, never visibility — a renderer that emits every line and hides the tail
  with `visibility: hidden` passes a visibility check exactly as a correct one does — plus
  `not.toContainText(lastLine)`, since `textContent` includes hidden text. Survival is
  asserted against **two** entry points separately (a prep edit and a deploy toggle: they
  are different code paths and fixing one does not imply the other), and the reset case is
  **required**, or an implementation that never resets passes every survival assertion.
  Advancing SHALL append rather than rebuild, proved by holding an `ElementHandle` for the
  first line across an advance and asserting `isConnected` — no ARIA attribute check can
  tell an appending renderer from a rebuilding one. **The reveal is untimed**, and that is
  asserted (`animationName === "none"`, `transitionDuration === "0s"`, identical reveal
  counts under `reducedMotion: "reduce"`) rather than stated in a comment: the claim is
  "there is nothing to reduce". **Met** (ADR-0029), mutation-verified — including the
  re-entrancy guard, whose first mutation reported SURVIVED only because it failed
  typecheck, leaving a stale `dist` for the suite to measure.

- **AC-V17 (a standalone scene is a screen, is seen once, and is reachable by keyboard):**
  A scene not attached to a battle SHALL be its own screen, SHALL be recorded as seen in
  the SAVE when dismissed, and SHALL NOT replay on reload. *Discriminators:* the
  erase-and-replay **pair** — without the second half, a scene screen that never renders at
  all passes "it was not replayed"; a battle with no authored scene going straight to its
  briefing, without which an implementation inventing a scene at every anchor passes; and
  the epilogue asserted in front of `COMPLETED`, the transition a final victory takes,
  which is where this repo has already shipped unreachable story content once. A loss SHALL
  still reach the retry screen with no scene in front of it (AC-M3). Test helpers that walk
  past scenes are deliberately **tolerant** about whether a scene exists — scenes are
  optional content — so the claim that the prologue exists is carried by its own assertion
  rather than by a helper that would shrug past its disappearance. **Met** (ADR-0029).

- **AC-V18 (painted ground is paint, and carries no grid):** A battle MAY declare a
  terrain map — one authored surface per tile, plus props — which the renderer SHALL paint
  in place of the flat fill, and on painted ground the renderer SHALL stroke **no per-tile
  grid line**: a side face SHALL be drawn only where the ground actually drops, or at the
  map's edge. Terrain SHALL NOT reach `BattleState`; a unit's legal moves SHALL be
  byte-identical with and without it. *Discriminators:* the A/B is on the **output**, not
  the input — the same battle drawn twice, with and without terrain, asserting the terrain
  colour reached the canvas in one and the flat fill in the other, and that the theme's
  grid colour is stroked once per tile without terrain and **never** with it. A test that
  merely passed a map and checked it was accepted would look identical whether the renderer
  painted it or discarded it (the "validates its input and then discards it" shape). Props
  are asserted by **draw order** — the leaf colour must arrive after the last ground fill —
  because drawing a prop inside the painter's walk lets the next tile paint over its
  canopy, which on a flat map is every prop on the board and which no colour-presence
  assertion can see. The map's dimensions SHALL be checked against the grid in **both**
  directions: a short map leaves tiles unpainted, and a long one paints tiles that do not
  exist, and the terrain/battle coverage SHALL be checked in both directions too — a battle
  with no map draws the flat look by omission, and a map keyed to a renamed battle is
  ground nobody can stand on. **Met** (ADR-0030) on **all five** campaign battles; the
  engine demo page still draws the flat look, which is what keeps the A/B above possible.

- **AC-V19 (one camera, shared by the painting and the click):** The renderer SHALL fit the
  whole board to its canvas, and `pickTile` SHALL invert **the same** fit. *Discriminator:*
  the unscaled point — the canvas coordinate a `pickTile` that ignored the zoom would be
  handed — MUST resolve to a **different** tile, and the fixture MUST assert the zoom is
  greater than 1, or the A/B is between two identical numbers and certifies nothing. This
  is the same hazard as AC-V10's height-ignoring inverse and harder to see: a mis-scaled
  inverse offsets every click by a constant factor rather than failing outright. **Met**
  (ADR-0030).

- **AC-V20 (a blocked tile never looks like ground):** For every battle, a tile the sim
  marks impassable SHALL be painted as a surface a player reads as impassable — never as
  grass, dirt, sand or planking. *Discriminator:* painting one blocked tile as grass MUST
  fail the check, **and** removing every blocked tile MUST fail it too — without the second
  half the loop is vacuous on a flat map and passes against a renderer that paints blocked
  tiles as lawn. The converse (painted water a unit can cross) is deliberately **not**
  asserted while `camp-b2-ambush-at-the-ford`'s river is paint only; the exception is named
  in the test rather than left to inference, and this becomes an equality the day water
  blocks everywhere. A companion check asserts no unit **starts** on a blocked tile or in
  painted water — reachable by editing terrain alone, since a battle's placements and its
  paint live in different files. **Met** (ADR-0031).

## 7. Required module shape

The turn state machine lives in a **DOM-free `src/render/session.ts`**; `main.ts` is
reduced to DOM wiring, and `window.tuh` is a thin adapter over the session object. Two
reasons, both load-bearing:

1. **The discriminating logic becomes unit-testable** under vitest instead of only through
   Playwright — `src/**/*.test.ts` is already globbed, so no config change is needed.
2. **A session must be constructible over an ARBITRARY `BattleState`**, not only
   `makeDemoBattle()`. AC-V7 depends on this: the demo map cannot express a
   jump-exclusion, so the fixture has to be purpose-built.

**The same split now governs three modules**, and it is the shape any new stateful piece
of the page takes: a pure model plus a `mount…` that draws it.

| Module | The model owns | The mount owns |
|---|---|---|
| `session.ts` | the turn state machine over an arbitrary `BattleState` | the canvas and the panels |
| `prep.ts` | `PrepModel` — the panel's selection and browsing state | the DOM, mounted once and re-pointed |
| `scene.ts` | `SceneModel` — how much of a beat has been read | the line box, the portrait frame, the controls |

`scene.ts` is the one where the split is a bug fix rather than a convenience:
`renderStory` is re-entered from `refresh()` on the very screen a scene is read, and it
rebuilds its box, so a cursor kept in the DOM is destroyed by an ordinary party edit
(AC-V16). `mountScene` takes the asset mapping as a **parameter** for the same reason
`drawUnit` should have taken its colour table as one — a render module that imports a
content table can miss against it silently.

**Exactly one TILE-DRIVEN mutator.** Every path that turns a *tile selection* into draft
state goes through a single entry point:

```ts
function onPick(tile: Position | null): void   // the ONE tile-driven mutator
```

The canvas listener is `ev => onPick(pickTile(state, cx, cy, w, h))`; the keyboard Enter
path is `onPick(cursor)`; the test seam `clickTile(x, y)` is `onPick({x, y})`. This is what
makes the test seam *provably* the same path a real pointer event takes rather than
parallel logic that can drift — AC-V10 covers the one edge (`pickTile` itself) that
`clickTile` skips.

> **Stated precisely, because an earlier draft overstated it.** `onPick` is not the only
> mutator of the session *at all* — `cancel()`, `commitAct()`, `commit()`, `step()` and
> `reset()` also mutate, and `endTurn()` is a **second command-emitting path** reachable
> from the seam without touching `onPick`. The invariant that matters, and the one the
> tests rely on, is narrower: **no tile selection reaches the draft except through
> `onPick`.**

**Proving a cancelled draft left no trace** (AC-V9) needs three assertions, all required:

1. **State identity** — `serialize()` before staging `===` after cancel. Catches
   speculative-apply-and-rollback, since `tick`, `rngCounter` and `turnLog` all live in
   that string.
2. **Log identity** — the command log is unchanged in length *and* no command anywhere in
   it names the cancelled destination. So the cancel fixture must use a tile **never
   committed elsewhere in the session**.
3. **Non-vacuity** — between stage and cancel, the draft was non-null with the staged
   destination, and the valid-target set differed from the idle set. Without this, a
   viewer that ignores staging entirely passes 1 and 2.

**Typing.** `e2e/` must be added to `tsconfig.json`'s `include`, and the viewer API type
declared where both `src/render` and `e2e` can see it — otherwise the whole seam is
untyped in the specs. `exactOptionalPropertyTypes` is on: use it, so the `[DEFERRED]`
preview fields are **genuinely absent** from the type rather than `| undefined`. That
makes the compiler enforce §4's honesty rule.

**`turn()` counts COMMANDS COMMITTED**, not Step clicks — a matured charge or a crystal
tick is absorbed inside `advanceToDecision` and consumes no command.

### 7a. Three routes, one set of panels (ADR-0023)

`[BASELINE]` **The site ROOT is the game.** `index.html` is the campaign shell (`docs/11`
M0 item 1) — a stranger handed the bare site URL must land on something playable, not on
an instrument. `viewer.html` is the engine viewer (one demo battle, every internal number
on show), a developer tool reached from a link in the campaign's footer. `game.html` is a
**redirect stub** to the root, kept because that path was public: `README.md` links it and
`docs/11` names it as where the game is played.

All three are declared in `vite.config.ts`'s `rollupOptions.input` — a page that only works
under `npm run dev` is not shipped, and nothing else says so.

They share **`src/render/panels.ts`**: the timeline, status line, resolution preview and
turn log as pure `state → HTML` functions, injected with per-page presentation metadata
(`LookUp`). This is not tidiness. §4's "not modeled yet, so not shown" list is an
**assertion**, and it has to shrink as capabilities land; two copies would mean two lists
to keep honest, and the stale one would go on hiding an effect from a player about to
commit a shot.

`[BASELINE]` The shell itself — `src/render/campaign-shell.ts` — is **DOM-free for the
same reason `session.ts` is**, so `docs/11` AC-M1's "title screen to ending" is a unit
test rather than only a browser one. All persistent IO lives in
`src/render/storage.ts`; `src/sim/campaign.ts` never learns where a save is kept.

## 8. Determinism risks specific to this layer

- **Never preview by resolving.** `resolveAttack` consumes the seeded stream. Previews use
  only pure exported helpers (`hitChance`, `attackDamage`, `abilityDamage`,
  `relativeFacing`, `moveRange`, `inAbilityRange`). AC-V6 is the guard.
- **Never speculatively `applyCommand` and discard** — it advances the clock and can
  mature a charge.
- **Input timing must not reach state.** `src/render/**` may use wall-clock for animation
  pacing; nothing derived from it may enter `BattleState`. State is a function of
  `(seed, commands)` alone.
- **Player-input e2e must not click raw canvas pixels.** The tests drive a
  grid-coordinate seam routed through the same handler as a real pointer event, and the
  pointer→tile mapping is covered by **one** separate assertion (AC-V10). Otherwise every
  camera/iso tweak breaks the whole interaction suite for no behavioural reason.
- **A scripted, deterministic path is retained** for the Playwright baseline: the Step
  affordance resolves the active unit via `decide` → `applyCommand` regardless of team,
  so the frame-by-frame visual baseline survives in shape.

## 9. References

- `docs/00` pillars 3 & 4 · `docs/01` §1–§2 + AC-02 (the CT table this layer prices) ·
  `docs/04` §3 (resolution transparency) and §7 (accessibility) ·
  `docs/05` §3b + AC-S1/AC-S7 (the command-replay substrate) · `docs/03` (the closer
  archetypes the fold unblocks)
- ADR-0004 (determinism P0) · ADR-0007 (sim/render split) · ADR-0010 (deferred
  resolution scope) · ADR-0013 (facing-on-move deferred) ·
  **ADR-0015 (the move+act fold — the decision this doc specifies)**
