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

> **`act` now holds a chosen-but-uncommitted target, and that is new (ADR-0038).** It used
> to be populated only for the instant of a commit, because selecting the target *was* the
> commit. `TARGET_STAGED` is a real, observable state the draft sits in. `src/render/session.ts`'s
> comment says the opposite and must be rewritten in the build slice.

| State | Selectable | Transition |
|---|---|---|
| `AWAIT_ACTOR` | — | `advanceToDecision` → player team ⇒ `PLAYER_IDLE`; AI team ⇒ `AI_TURN`; `terminal:"stalemate"` ⇒ `ENDED` |
| `PLAYER_IDLE` | tiles in `moveRange`; enemies in `inAbilityRange` from the **current** tile | tile ⇒ `MOVE_STAGED`; enemy ⇒ `TARGET_STAGED` (**no command**); End Turn ⇒ **COMMIT** `wait` (−60) |
| `MOVE_STAGED` | enemies in `inAbilityRange` from the **staged** tile; the staged tile (tap = unstage) | enemy ⇒ `TARGET_STAGED` (**no command**); End Turn ⇒ **COMMIT** `{kind:"move", to}` (−80); Cancel ⇒ `PLAYER_IDLE` |
| `TARGET_STAGED` | any other legal target (re-stage, still no command); **Confirm**; **Cancel**. **No tiles** — a tile tap is inert while a shot is aimed. The **primary button is DISABLED** | Confirm ⇒ **COMMIT** — act-only (−80), or `{kind:"act", …, move:{to, order:"before"}}` (−100) when a move was staged — **exactly one command**; Cancel ⇒ back **one** level (`MOVE_STAGED` or `PLAYER_IDLE`); tap the actor ⇒ `PLAYER_IDLE` |

> **End Turn is UNREACHABLE while a target is staged, and that is the design, not a
> limitation.** `Session.endTurn` refuses in `TARGET_STAGED` — that is the guard — and the
> primary button is disabled so the player never reaches for a control whose only answer is
> a refusal. **Confirm is the one way to spend a turn once a shot is aimed.** To end the
> turn instead, Cancel first. The two controls are then never both live, so "which one did
> I press" has one answer.
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

- **Confirm model (ADR-0038): tapping a target STAGES it; Confirm commits it.** Two
  gestures, not one. Tapping a target emits **no command** — it opens the preview sheet
  (§4, §8) with hit %, facing, damage and the Clock price. **Confirm emits exactly one
  command.** Re-staging a different target any number of times still emits none.

  > ~~"Selecting the *target* IS the confirm gesture. By then the preview has already shown
  > hit %, damage and the CT price, so there is no blind commit and no redundant 'are you
  > sure' dialog."~~ **Superseded 2026-09-05 by ADR-0038.** The reasoning held for a mouse
  > and fails for a thumb: a finger covers several tiles, there is no hover to warn where
  > the tap lands, and the cost of the miss is the whole turn. XCOM's second confirmation
  > tap is the precedent. The sheet is not a dialog — it is where the numbers already are.

- **The keyboard uses the same two gestures.** Staging a target moves focus to the sheet's
  Confirm button, so **Enter** confirms through ordinary focus rather than a special key
  binding, and **Esc** cancels. Returning focus to the board re-arms picking.
- **Desktop follows the same model.** There is **no mouse-only shortcut that commits on a
  target click.** Hover previews are an addition, never a replacement.
- **The action bar's right-hand primary button is PHASE-AWARE, and it is the only control
  the enemy's turn needs.** In a player phase it is **End Turn**, labelled with the price it
  will pay (`End Turn · Move only · −80 Clock`). In `AI_TURN` it reads **"Enemy turn ▸"**
  and performs **Step**. This is the same explicit step the table already requires — a
  wall-clock timer must never advance it, or command count becomes a function of elapsed
  time. Without this the stage has **no control at all during the enemy's turn**, which
  strands the player.
- **Re-staging, and what the sheet hides.** With a target staged, tapping any **visible**
  legal target re-stages onto it — no Cancel first, still no command. The preview sheet
  covers at most **35% of the canvas width** (§8b), and a target **underneath** it needs
  **Cancel** first. Said plainly because the alternative — tapping through an opaque
  panel — is a mis-tap generator, and because 35% is the number AC-V34 measures.
- **Tapping a unit that is NOT a legal target opens the unit drawer, read-only.** Any phase
  where input is live, friend or foe. The drawer shows the same ADR-0033 stat set as the
  actor's own drawer, for the unit tapped. This is ADR-0033's parked cursor-follow inspect
  arriving as a tap, through `unitCardHtml`'s existing `focusUnitId` seam (AC-V22(i)).
- **Cancel** unwinds **one** level: from `TARGET_STAGED` back to `MOVE_STAGED` or
  `PLAYER_IDLE`, from `MOVE_STAGED` to `PLAYER_IDLE`. Tapping the actor clears the whole
  draft to turn start. Total and free — the sim was never called.
- **Illegal tap** is a no-op plus a toast naming the reason ("Out of Move range"). Never a
  throw, never a state change, never a consumed command. The toast is **render-only**: the
  command log is byte-identical with and without it. **The toast is UNTIMED** — it is
  replaced by the next reason, or cleared on the next state change. No timer, for the same
  reason `AI_TURN` has none, and because AC-V16 already had to prove "there is nothing to
  reduce" about an untimed reveal.
- **Accessibility** `[BASELINE]` — every action reachable by keyboard with visible focus
  (`docs/04` §7). End Turn, target selection and Confirm are not mouse-only. Every
  interactive control is at least **44 × 44 CSS px** at every supported viewport (§8).

## 4. Resolution transparency — the minimum honest set

`docs/00` pillar 4 and `docs/04` §3 adopt resolution transparency **fully**. Before any
**Confirm**, and computed for the **staged** position, the player SHALL see (~~"before any
commit-click"~~ — there is no commit click any more; ADR-0038 made Confirm its own gesture,
and the preview sheet is where this set now lives):

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
11. **The acting unit itself** (ADR-0033, AC-V22) — portrait, name, job, HP current **and**
    max, Clock, Brave, Faith.

    > ~~"on a plate over the board"~~ **— superseded 2026-09-05 by ADR-0037.** The plate
    > covered about half the board on a real phone. The stat SET below is unchanged; it now
    > lives in a collapsed **left tab** (name and HP) that opens a **drawer** (§8, AC-V37),
    > and the tab is laid out beside the canvas rather than over it.

    It describes whoever the
    forecast says acts next, resolving a maturing charge back to the unit that cast it.
    **MP and Level are ABSENT, not zero**: the sim has no MP field, and `UnitRecord.level`
    is defaulted, never raised and never read (ADR-0021, guarded by `docs/02` **AC-J10**).
    Reversing ADR-0021 puts this row back on the table. The plate prints **"Clock"**, never
    "CT" — engine jargon is banned from this surface by `e2e/campaign.spec.ts`'s
    learnability spec. **The drawer is an overlay and SHALL be opaque** — a see-through
    panel is measured against its DOM parent while the player reads it over the canvas.

    > **The pointer-events rule changed with the placement, and its direction reversed.**
    > ~~"It is an overlay, so it SHALL decline pointer events."~~ Under ADR-0037 the **tab**
    > is a laid-out control that must ACCEPT taps, and it never sits over the canvas, so
    > there is nothing for it to decline. `pointer-events: none` still binds anything that
    > does overlay live tiles.

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
  assertion can see.

  **A surface's own texture may not draw a lattice either.** "No grid" is about what the
  player sees, not about whether `stroke()` was called: a fixed-offset band inside the water
  branch repeated identically on every water tile and drew a plain grid across a river while
  satisfying the stroke check exactly. Every texture is now placed by the tile's own seeded
  noise for that reason. That half is carried by the frames, not by a test — said here
  rather than left implied.

  **NOT ASSERTED: the side-face half of this criterion.** No test checks that a face is
  drawn only where the ground drops or at the map's edge. `iso.test.ts` asserts the surface
  colours reached the canvas and that no grid line was stroked; the culling against the
  neighbour's height is carried by the frames alone, exactly like the lattice half above.
  Said here rather than left implied.

  The map's dimensions SHALL be checked against the grid in **both**
  directions: a short map leaves tiles unpainted, and a long one paints tiles that do not
  exist, and the terrain/battle coverage SHALL be checked in both directions too — a battle
  with no map draws the flat look by omission, and a map keyed to a renamed battle is
  ground nobody can stand on. **Met** (ADR-0030) on **all five** campaign battles; the
  engine demo page still draws the flat look, which is what keeps the A/B above possible.

- **AC-V19 (one camera, shared by the painting and the click):** The renderer SHALL fit the
  whole board to its canvas, and `pickTile` SHALL invert **the same** fit. *Discriminator:*
  the unscaled point — the canvas coordinate a `pickTile` that ignored the zoom would be
  handed — MUST NOT resolve to the tile the scaled point resolves to, and the fixture MUST
  assert the zoom is greater than 1, or the A/B is between two identical numbers and
  certifies nothing. This is the same hazard as AC-V10's height-ignoring inverse and harder
  to see: a mis-scaled inverse offsets every click by a constant factor rather than failing
  outright. **Met** (ADR-0030).

  **The wording was weakened on 2026-08-30 to match what is asserted.** ~~"MUST resolve to
  a **different** tile"~~ overstated it: the test uses `not.toEqual`, which `null` — off the
  grid entirely — satisfies. Measured on the fixture: at the test's 900×600 canvas the
  unscaled point returns **`null`**, not another tile. (At the shipped 900×440 canvas the
  same point returns `{x: 1, y: 2}`, so the stronger claim would hold there.) The A/B still
  discriminates — an inverse ignoring the zoom fails it — but "a different tile" is not what
  it proves. Tightening the test to a named non-null tile is open work for `qe-tester`.

- **AC-V20 (a blocked tile never looks like ground):** For every battle, a tile the sim
  marks impassable SHALL be painted **`water`** — the one surface that reads as impassable.
  This is an **allow-list of one, not a deny-list**, and the direction is the whole point.

  ~~"never as grass, dirt, sand or planking"~~ **— corrected 2026-08-30, the shipped test
  is right and this AC was wrong.** A deny-list names the surfaces that read as walkable and
  lets everything else through, which silently exempted **`rock`**. Rock is walkable ground
  in two shipped maps: all of battle 3's centre, and battle 4's own abutments, which the
  party stands on. Painting battle 4's gap as rock passed the deny-list and produced exactly
  the invisible wall this criterion exists to prevent — a continuous stone ledge, identical
  to the one under your feet, that refuses the click. That defect shipped and was fixed in
  `c1507dc`. Any future surface (mud, ice, chasm) is walkable-looking by default under an
  allow-list, and must be added deliberately; under a deny-list it is exempt by default.

  *Discriminator:* painting one blocked tile as grass MUST
  fail the check, **and** removing every blocked tile MUST fail it too — without the second
  half the loop is vacuous on a flat map and passes against a renderer that paints blocked
  tiles as lawn. The converse (painted water a unit can cross) is deliberately **not**
  asserted while `camp-b2-ambush-at-the-ford`'s river is paint only; the exception is named
  in the test rather than left to inference, and this becomes an equality the day water
  blocks everywhere. A companion check asserts no unit **starts** on a blocked tile or in
  painted water — reachable by editing terrain alone, since a battle's placements and its
  paint live in different files. **Met** (ADR-0031).

- **AC-V21 — RESERVED for the motion layer (ADR-0032). Not free, not yet written.** The
  board's motion — hit reaction, turn plate, damage numeral, the reduced-motion branch —
  shipped 2026-09-01 with strong tests and no acceptance criterion. This letter is held
  for it so nobody mints it for something else. **Owed by:** `qe-tester` with the
  `viewer-engineer`, tracked in `docs/defects.md` §5 as gap D. Two of its
  claims — the ~58 s per-battle motion ceiling, and whether any of the motion is
  **legible** — have no test today and must land as an AC with a test or be marked
  explicitly aspirational.

- **AC-V23 through AC-V29 — RESERVED for the action-menu proposal**
  (`docs/proposals/action-menu.md`, deferred 2026-09-02). Not free; mint nothing in this
  range until that spec lands or is dropped.

- **AC-V22 (the stat plate shows only what the sim models):** The battle screen SHALL carry
  a plate describing the unit the forecast says acts **next**, and it SHALL print only
  values the sim models. **Met** (ADR-0033).

  > **Where the plate lives moved on 2026-09-05 (ADR-0037); what it prints did not.**
  > ~~"The battle **board** SHALL carry a plate"~~ — it is now a left tab plus a drawer,
  > laid out beside the canvas (§8, **AC-V37**). Clauses (a)–(e) and (g)–(i) below are
  > unchanged and still bind. Clause (f) is narrowed: the tab must **accept** taps, and the
  > click-through rule now binds only surfaces that actually overlay live tiles.

  **(a) It follows the forecast lead.** The plate SHALL read the timeline's lead actor,
  never `state.units[0]`. *Discriminator:* the fixture MUST be a state where those two are
  **different units**, and MUST assert they are different — deploy order is the scheduler's
  tie-break key, so on a fixture where the two coincide a plate wired to either one
  produces identical markup and certifies nothing. When the lead is a maturing **charge**,
  the plate SHALL resolve it back through `chargeQueue.sourceUnitId` to the casting unit
  and say it is casting; that fixture MUST also store a different unit first.

  **(b) MP and Level are ABSENT, not zero** (pillar 4, ADR-0021). *Discriminator:* **two
  assertions, and neither substitutes for the other** — an exact key-set equality on the
  card model, which cannot see a hard-coded `Lv 1` in a template string, **and** a regex
  over the rendered markup, which cannot see a field renamed into existence. A **tripwire**
  SHALL fail the day the sim starts modelling MP, because the omission is honest only while
  the engine models nothing: this criterion is otherwise the kind that rots green. Level is
  deliberately **not** re-guarded here — `docs/02` **AC-J10** owns it, and a second copy
  would rot separately.

  **(c) It says "Clock", not "CT".** Engine jargon is banned from this surface;
  `e2e/campaign.spec.ts`'s learnability spec is the authority and a unit-level echo is
  permitted as a fast signal, not as the proof.

  **(d) HP prints both numbers.** Current **and** max, as integers, not a bar alone.
  *Discriminator:* a fixture whose current and max differ and whose ratio is not a round
  percentage, so replacing the numbers with a percentage goes red. Clock, Brave and Faith
  MUST carry three **distinct** values, so a renderer printing one in another's slot fails.

  **(e) Job and portrait are genuinely optional.** *Discriminator:* an **A/B on the built
  object** — the same state through two lookups, one carrying the field and one not —
  asserting the field is absent (not defaulted to a dash) and that **everything else is
  byte-identical**. A card that type-checked the field and then defaulted it looks correct
  from one side alone. The "portrait pending" caption SHALL track the **asset key**, not
  the URL, and the fixture MUST cover **three** states in one test — no portrait, the
  `placeholder` key, and any other key. Two states pass under a caption that is simply
  always on, or always off.

  **(f) A surface over live tiles never eats a tap it does not own — REWRITTEN 2026-09-05
  (ADR-0037).** The tab is laid out beside the canvas and **must accept taps**, so the old
  wording is now unrealizable: there is no plate over a live tile to park anywhere.

  > ~~"The plate never eats a click. It is DOM over live tiles, so it SHALL decline pointer
  > events. *Discriminator:* park the plate over a point that resolves to a real tile …"~~
  > **Superseded.** Kept because the hazard it names is real and moved rather than
  > disappeared: the shipped corner covered only empty sky, so the old test was vacuous
  > where it sat — and then the plate covered half a phone's board.

  The rule that binds now: the **preview sheet** and the **drawers** are the surfaces that
  overlay live tiles, and each SHALL decline pointer events **on its margins** — the
  shadow, the scrim edge, any padding outside its painted box. Its own box keeps its taps.
  *Discriminator, and it is a two-point A/B:* a tap **inside** the sheet's box SHALL hit the
  sheet, and a tap **1 px outside** it SHALL hit the canvas **and move the tile cursor**.
  Both points come from the sheet's live `getBoundingClientRect`, never a hard-coded
  coordinate, and the outside point MUST resolve to a real tile through the page's own
  `pickTile` — assert that first, or the "it reached the board" half is vacuous. The tile
  MUST differ from where the cursor already sits.

  **(g) The plate is OPAQUE, and this is a precondition of the contrast measurement, not a
  taste call.** `e2e/contrast.spec.ts` cannot sample a canvas — a canvas has no background
  colour, only pixels — so it composites a translucent layer onto the plate's DOM parent,
  the dark board card, while the player reads the text over grass, sky or water. A
  see-through plate therefore measures green and reads unreadable. The computed background
  SHALL be a colour with **no alpha channel** and **no background image**, and the elements
  holding the text SHALL paint no fill of their own, or the declared ground describes
  nothing they use.

  **(h) The plate is one surface, and it never collapses.** The turn rail SHALL emit no
  plate and the plate SHALL emit no rail chips — they land in two different hosts, so a
  duplicated copy would paint the same unit twice, once under the board and once on it,
  with every other assertion still green. With nobody queued to act the plate SHALL still
  render **non-empty text**: an element that collapses to nothing moves everything under
  it, which has shipped here once already. Markup alone is not enough — an element with no
  text has no height.

  **(i) The "which unit" seam stays wired.** `unitCardHtml` SHALL keep an optional focus
  parameter: absent, the plate describes the forecast lead; given a unit id in the state,
  it describes that unit. This is the landing site for the future inspect control
  (cursor-follow, parked by the owner 2026-09-01, ADR-0033). **No shipped page passes an
  id**, so a test is the only thing keeping it honest. *Discriminator:* an **A/B on the
  rendered output** — the same state with and without a focus id MUST name different units
  **and** show different HP. A parameter that is type-checked, validated and then ignored
  leaves both sides byte-identical, which is what a dead slot looks like. A focus id naming
  nobody SHALL fall back to the lead rather than blanking, and a focused unit SHALL never
  be captioned as casting.

  **NOT ASSERTED, said here rather than left implied:**

  - ~~**The placement.** "Bottom-left" is an owner call from three rendered options
    (ADR-0033) and nothing pins it. The tests assert only that the plate sits inside the
    canvas rectangle, and the campaign half checks the vertical bounds only. Moving the
    plate to another corner over the board goes green.~~ **Superseded 2026-09-05 by
    ADR-0037.** Placement is no longer unasserted and is no longer over the board:
    **AC-V34** measures zero intersection between every HUD box and the canvas box at four
    viewports, and **AC-V37** pins the tab and its drawer. The bullet is struck rather than
    deleted because "nothing pins the placement" was true for four days and was relayed as
    a known gap.
  - **The engine viewer's plate opacity.** The opacity assertion runs on the campaign page.
    `viewer.html` paints `var(--surface-2)`; nothing checks it resolves opaque.
  - **Legibility over the board.** Nothing reads a pixel off the finished canvas (`docs/defects.md`
    §5, gap C). The claim is "opaque, and its text clears WCAG AA against that opaque plate" —
    weaker than "readable over what was painted underneath", and deliberately stated as
    such.
  - **The colours.** The plate inherits `.card.board`; no criterion governs how it looks.

- **AC-V30 (rotate gate)** `[ENHANCEMENT]`: On a touch device in portrait, a full-viewport
  card SHALL cover the page, and the game beneath SHALL be hidden and unfocusable. In
  landscape, or on a non-touch device at any aspect ratio, the card SHALL be absent and the
  game unchanged. The card's primary line is **"Please rotate your device"**, above an
  `aria-hidden` figure — a phone icon that turns 0 to 90 degrees on a CSS loop inside a
  static quarter-turn arrow. Under `prefers-reduced-motion: reduce` the phone SHALL be
  static at 90 degrees (the loop's finished state) rather than animating. The gate is
  keyed on touch + portrait alone, with **no size bound** — a tablet held upright is gated
  the same as a phone, by owner intent, not as a gap to close later. *Discriminator:* a
  fixture emulating a touch device toggled between portrait and landscape must show
  opposite outcomes, and a non-touch fixture narrowed to a portrait aspect ratio must show
  the card absent both times — otherwise a plain max-width query masquerading as a touch
  check would pass the first half and wrongly gate desktop users on the second. For the
  motion half, a fixture with motion allowed and one with `prefers-reduced-motion: reduce`
  must disagree on the icon's **computed** `animation-name` and `transform` — reading the
  CSS source (an `animation` property is declared) cannot tell a running loop from a
  reduced-motion override that only wins by specificity.

- **AC-V31 — SUPERSEDED 2026-09-05 by ADR-0037.** Replaced by **AC-V33** (stage geometry at
  five viewports) and **AC-V34** (the board is uncovered at rest). Text kept, struck:

  > ~~**AC-V31 (landscape fit)** `[ENHANCEMENT]`: At 844×390 with touch emulation, the board
  > canvas, the stat panel (ADR-0033) and the action controls SHALL each be visible without
  > scrolling, and the board SHALL keep its 900:440 aspect ratio. The timeline, the legend
  > and any other panel MAY sit below the fold. *Discriminator:* measure each of the three
  > required elements' bounding boxes against the viewport rectangle rather than trusting the
  > absence of a scrollbar, since a scrollbar can be suppressed while content still overflows
  > off-screen.~~

  **Why it had to go, and it is the instructive part.** This criterion was **green on the
  screen that caused the rebuild**. It asks that the board and the plate both be *visible*,
  and a plate covering half the board satisfies that exactly as a correct layout does. It
  also measures **one** viewport, so a fluid width was never proved at either end. AC-V34
  asserts the thing AC-V31 meant: **zero intersection**, at five viewports.

- **AC-V32 (lock attempt)** `[ENHANCEMENT]`: The gate card's button, labelled **"Play in
  landscape"**, SHALL call `requestFullscreen` then `screen.orientation.lock('landscape')`,
  both feature-detected. A persistent line, **"If the screen does not follow, switch off
  rotation lock."**, SHALL show on the card at all times, whether or not the button has
  been pressed. Where either call is missing or throws, the button SHALL resolve without an
  unhandled error and the card SHALL then also reveal a hint line, **"Your browser cannot
  rotate the screen for you."** — hidden until that point, so the player is told only once
  the attempt is known to have failed. A web manifest declaring `orientation: "landscape"`
  SHALL be linked from both `index.html` and `viewer.html`, and SHALL be asserted by a
  browser test reading the fetched file, not by the presence of the `<link>` alone. The
  manifest ships with **no icon set**, so it is not installable on any platform yet — that
  omission is deliberate for this slice, not a defect. *Discriminator:* a fixture stubbing
  both APIs as absent, and a second stubbing both as present but rejecting, must both leave
  the page in a normal, error-free state showing the post-failure hint; a third stubbing
  both as granted must leave that hint hidden while the persistent rotation-lock line shows
  in all three. **Real-device behaviour is unverified.** iOS Safari implements neither
  call; on Android the lock only fires after the tap and the manifest's orientation only
  applies once installed. No test here can confirm the lock actually rotates a real phone —
  only that the calls are attempted, their failure is swallowed, and the player is told
  what to do next.

### 6a. The landscape-phone stage (ADR-0037, ADR-0038)

> **Namespace note.** AC-V21 is reserved for the motion layer and AC-V23…AC-V29 for the
> action-menu proposal. This set therefore starts at **AC-V33**.
>
> **WHAT EACH CRITERION ACTUALLY SWEEPS — stated, because "asserted at five viewports"
> would be a claim about ten specs that only two of them make.** **AC-V33 and AC-V34 sweep
> all five** supported viewports. **Every other criterion runs at ONE viewport.** And four
> of them — **AC-V38**, **AC-V39**, the read-only inspect half of **AC-V37**, and the
> settings readout half of **AC-V40** — run on the **engine viewer page only**, because it
> is the page with a mounted battle a spec can drive directly. Nothing here says those four
> behave the same on the campaign page.
>
> **SCOPE: the BATTLE screen only.** ADR-0037's stage rule applies screen by screen, and
> this slice moves one screen. **Title, prep, briefing and the scene player keep their
> current layout, outside the stage**, until their own slice with its own ACs — named in
> §8f as the follow-up. Every criterion below is a claim about the battle screen; none of
> them says anything about the other four.

- **AC-V33 (the stage is 360 tall, uniformly scaled, and nothing overflows)**
  `[ENHANCEMENT]`: On the **battle screen**, at all five supported viewports, the stage
  SHALL be **360 logical units tall**, its width SHALL be `clamp(640, round(360·vw/vh),
  900)`, and the applied scale SHALL be `min(vw/stageW, vh/stageH)` on **both axes
  equally**. The battle screen SHALL not scroll in either direction (`scrollWidth ===
  clientWidth`, same for height).

  **`vw` and `vh` are the stage HOST's box**, an element sized `100svw × 100svh` — small
  viewport units, deliberately, so a collapsing browser toolbar does not re-lay-out the
  stage mid-turn (§8c). Everything is measured from `getBoundingClientRect()` on that host
  and on the stage: **reading the CSS custom property does not count.** A variable that is
  computed correctly and then applied to nothing is the "validates its input and then
  discards it" shape, and it reads as working from the variable's side.

  **The derived table, in CSS px, and this is what the test asserts:**

  | Viewport | Aspect | `stageW` | `scale` | Letterbox, total |
  |---|---|---|---|---|
  | 640×300 | 2.13 | 768 | 0.8333 | 0 |
  | 800×360 | 2.22 | 800 | 1.0 | 0 |
  | **851×324** (the owner's phone) | 2.63 | **900** — clamped | **0.9** | **41 px horizontal** (20.5 per side) |
  | 900×390 | 2.31 | 831 | 1.0830 | 0.11 px vertical — under tolerance, reads as none |
  | 1000×780 | 1.28 | **640** — clamped | 1.5625 | 217.5 px vertical (108.75 per side = **69.6 stage units**) |

  **Tolerance is stated, not implied:** a letterbox matches if it is within **1 CSS px** of
  the formula, and "none" means **under 1 CSS px**. Without that, 900×390's 0.11 px of
  rounding slack makes an exact-zero assertion flake.

  *Discriminators, three wrong behaviours, covered separately.* **(a) A fixed 16:9 stage** —
  the obvious "design at a reference resolution" answer — gives a 640-wide stage at 800×360
  and **160 px of pillarbox**; asserting horizontal letterbox **under 1 px** at 800×360 is
  what fails it. **(b) A non-uniform stretch-to-fit** shows no letterbox anywhere, so the
  1000×780 row must assert the letterbox is **non-zero** *and* that measured `scaleX` equals
  `scaleY`. **(c) Dropping the 900 clamp** is invisible at four of the five viewports.
  **851×324 is the only one that reaches it**, and it is why that viewport is in the set:
  with the clamp, `stageW` is 900 and 41 px pillarboxes; without it, `stageW` is 946 and the
  stage fills the width. **Assert the pillarbox, not the scale** — the two scales are 0.9
  and 0.8996, four hundredths of a percent apart, and would tie under any sane tolerance.
  `stageW` at 900×390 is **831**, not 900 — assert the computed value, or a hard-coded 900
  passes there too.

- **AC-V34 (the board is uncovered at rest, and the sheet is bounded)** `[ENHANCEMENT]`: At
  all five viewports, in **four states**:

  | State | Assertion |
  |---|---|
  | nothing selected | intersection of the canvas box with **every** HUD element's box is **exactly zero** |
  | a player unit selected, no target staged | same — zero |
  | a target staged | the **preview sheet**'s intersection with the canvas is at most **35% of the canvas WIDTH**; every other HUD element is still zero |
  | the turn-order strip expanded | the strip's intersection with the canvas is at most **35% of the canvas HEIGHT**, and **collapsing it restores zero** |

  *Discriminators.* **The mutant was already built: the pre-rebuild layout.** The ADR-0033
  plate intersected the canvas over roughly half its width, so this check fails against the
  tree as it stood before this slice. **Whether anyone actually RAN it there is not recorded
  in the specs** — no mutation note appears in `e2e/stage.spec.ts` or `src/render/stage.test.ts`
  — so treat the red as reasoned, not observed, until someone says otherwise. **Three
  non-degeneracy assertions are required**, because "nothing intersects" is exactly what a
  page with no HUD reports:

  1. The canvas box has **non-zero area**.
  2. The enumerated HUD set is non-empty and contains the actor tab, the action bar and the
     turn-order strip **by name**.
  3. **Every enumerated element has a non-zero rendered box of its own.** Without this the
     whole criterion passes with the HUD set to `display: none` — the exact failure this
     doc's own AC-V16 note warns about, in its geometric form. A zero-area box intersects
     nothing.

  The second state is required because a HUD that appears only once a unit is selected (the
  armed action bar) passes the first alone. The third and fourth exist because "at rest" is
  the whole claim: a sheet or a strip that grew to cover the board while the player aims
  would satisfy the first two and defeat the point. **35% of the canvas WIDTH** is the
  sheet's budget and **35% of the canvas HEIGHT** the expanded strip's (§3, §8b); the width
  budget is what makes "tap a visible target to re-stage" a promise the layout can keep.
  **The strip's collapse assertion is the discriminating half of state four** — a strip that
  expands and never collapses passes the bound and permanently covers a third of the board,
  which is the failure this whole criterion exists to catch, one control further along.

- **AC-V35 (every control is thumb-sized where it is smallest)** `[ENHANCEMENT]`: At
  **640×300** — the narrowest supported viewport — every interactive control SHALL measure
  at least **44 × 44 CSS px**, measured **after** the stage transform.
  *Discriminator, and it is arithmetic rather than opinion.* At 640×300 the stage scale is
  **0.833**, so a control drawn 44 **stage units** wide renders **36.7 CSS px** and fails.
  Clearing 44 CSS px there needs **≥ 53 stage units**. A test that reads the authored size
  instead of `getBoundingClientRect` passes against exactly that defect, so the measurement
  must come from the rendered box. Assert at the **smallest** viewport, not the comfortable
  one. The enumerated set SHALL be non-empty and SHALL contain, by name, the menu, help and
  settings buttons, Cancel, Actions, the phase-aware primary button, the actor tab and at
  least one turn-order chip — a loop that finds two buttons passes vacuously.

  **NOT ASSERTED — board TILES are exempt, and this is a known limit, not an oversight.**
  A tile is roughly **30 × 15 CSS px at 640×300** (measured by the reviewer; it varies with
  the map's tile count, which is why the settings readout prints it). That is well under 44
  and cannot be fixed by CSS: tile size is the camera's business, and the camera cannot zoom
  until **pan and pinch land** (§8e). Until then, mis-taps on the board are a real defect
  this criterion does **not** cover. The settings drawer prints the **current tile size in
  CSS px** (AC-V40) precisely so somebody can read the number off a real phone instead of
  arguing about it.

- **AC-V36 (Confirm is a separate tap, proved by the command log)** `[ENHANCEMENT]`
  (ADR-0038): Tapping a legal target SHALL leave the command log **unchanged in length**
  and SHALL leave a **non-null** staged target; tapping **Confirm** SHALL then grow the log
  by **exactly one**. Re-staging a different target three times before Confirm SHALL still
  emit **one** command in total.
  *Discriminator:* the wrong behaviour is the one this repo **used to ship** — the command
  emitted on the target tap. "After Confirm a command exists" passes against it, because by
  then the command does exist. The load-bearing assertion is the **zero** after the target tap. The
  non-null staged target is the second required half: a viewer that ignores target taps
  entirely satisfies both counts. Assert on the log, not on the button — a Confirm button
  that is present and inert leaves a state change nobody made.

- **AC-V37 (the actor tab shows two facts; the drawer shows the rest)** `[ENHANCEMENT]`:
  The collapsed tab SHALL show the acting unit's **name and HP only**. Opening it SHALL
  reveal a drawer carrying ADR-0033's full set — portrait, name, job, HP current and max,
  Clock, Brave, Faith — under AC-V22's rules unchanged. The drawer SHALL close when a
  target is selected. Tapping a unit that is not a legal target SHALL open the same drawer
  **read-only** for that unit (§3). The tab and the drawer SHALL be **opaque**, on AC-V22(g)'s
  terms and measured the same way.
  *Discriminators.* **Two assertions on the tab, and neither substitutes for the other.**
  (i) Assert Clock, Brave, Faith and the job are **absent from the tab's text** and present
  in the drawer's — a tab that renders the whole card and clips it with `overflow: hidden`
  passes a visibility check exactly as a correct one does (the AC-V16 lesson). (ii) Assert
  the tab is **visible with a non-zero box** — a text assertion alone passes against a tab
  set to `display: none`, where "Clock is absent" is trivially true. For the auto-close, one
  assertion is not enough: a drawer that closes on *any* board tap passes "it closed after a
  target tap". Add an **illegal** tap with the drawer open and assert it stays open. For the
  read-only inspect, the discriminator is that the drawer's **name changes with the unit
  tapped** — tap two different units and assert two different names and two different HP
  readings; a drawer wired to the forecast lead is byte-identical between them, which is
  what the dead `focusUnitId` seam looks like (AC-V22(i)).

- **AC-V38 (the action bar is phase-aware; the Actions sheet is derived, not authored)**
  `[ENHANCEMENT]`: The bottom bar SHALL carry Cancel, Actions and a **phase-aware primary
  button**. The Actions sheet SHALL list **every** ability the `unit.abilities` projection
  yields, each with its **name and range**, and SHALL print the flat act **Clock price
  once, in its header**. Sheet and bar SHALL be **opaque**, on AC-V22(g)'s terms.

  > **There is no per-ability cost to print, and saying "cost and range" would have
  > specified a field that does not exist.** `BattleAbilitySchema` carries `id`,
  > `actionKind`, `formula`, `power`, `element`, `accuracy`, `range`, `inflicts`, `speed`
  > and `aoe`. `apCost` is progression-only and is dropped from the battle projection by
  > design (ADR-0010/0011). The price of *acting* is the turn's Clock price, which is flat
  > and belongs in the header, not on every row.

  *Discriminators.* **(a) The rows are derived.** Assert the row count equals the
  projection's size **and** that two rows print **different** ranges. **Discover the pair
  from the data** — scan the fixture's own `abilities` for two entries whose `range` differs
  and assert such a pair exists before using it. Hard-coding `aim.aimed-shot` `{h:5,v:3}`
  bakes today's content into the test, and a range `[ENHANCEMENT]` has already moved once
  (ADR-0014's `summon.*` h4→h6). A static table or a template printing one shared range
  passes a count-only check. **(b) The primary button is phase-aware.** During `AI_TURN` one
  tap SHALL emit **exactly one Step** and the label SHALL read **"Enemy turn ▸"**; during
  `PLAYER_IDLE` the label SHALL read **End Turn** with its price. Assert **both** halves in
  **both** phases: a button that always says End Turn but happens to Step passes a
  behaviour-only check, and a button that relabels but does nothing passes a label-only
  check — and the second is the one that strands the player. **(c) The price label moves.**
  Assert it in idle (−60) and move-staged (−80); a hard-coded label passes either alone.

- **AC-V39 (an illegal tap is a toast and nothing else)** `[ENHANCEMENT]`: An illegal tap
  SHALL show an **untimed** toast naming **why**, SHALL leave `serialize()` byte-identical,
  and SHALL leave the command log unchanged in length. The toast is **render-only**, and
  **opaque** on AC-V22(g)'s terms — it sits over the board. It is cleared by the next reason
  or the next state change, never by a timer (§3).
  *Discriminators.* Use **two different** illegal grounds — out of move range, and an
  occupied tile — and assert the two toasts say **different** things: a toast that always
  reads "illegal move" passes a presence check. `serialize()` equality is what catches a
  speculative apply-and-rollback, and the log length is what catches a committed no-op;
  neither substitutes for the other. Note the AC-V7 warning: an illegal fixture tile must
  lie **inside** a naive Manhattan radius and **outside** `moveRange`, asserted in both
  directions, or the tap was never illegal for the reason claimed.

- **AC-V40 (the corners, and the settings readout is real)** `[ENHANCEMENT]`: The top-left
  ☰ SHALL open a left drawer offering **save, quit, turn log and legend**. The top-right
  SHALL carry **help** and **settings**. Drawers SHALL be **opaque**, on AC-V22(g)'s terms.

  **The drawer's entries differ per page, and this is the shipped list, not an aspiration:**

  | Page | ☰ drawer holds |
  |---|---|
  | Campaign (`/`) | a **note** that the shell autosaves · **Quit to title** · auto-play/step · turn log · legend |
  | Engine viewer (`/viewer.html`) | **Reset** · **Prep & loadout** · auto-play/step · turn log · legend. **No save, no quit** — there is no campaign to save or quit to |

  > **There is no Save BUTTON, and the omission is the honest form of the requirement.**
  > `campaign-shell.ts` writes the save slot on every transition, so a Save control would
  > validate nothing and do nothing while looking exactly like a working one — the dead-slot
  > shape this repo's evidence rules forbid. The drawer says what is true instead. An
  > earlier draft of this criterion asked for a "save" entry flatly; that wording would have
  > specified the dead button.
  >
  > **The campaign page also carries the auto-play/step entry**, which a first reading of
  > the shipped drawer missed. It is listed here because a table that omits a live control
  > is the same failure as one that invents a dead one.
  Settings SHALL print **four** things: the live `visualViewport` width and height, the
  **stage host's measured box**, the derived `stageW` and applied **scale**, and the current
  **tile size in CSS px**.

  > **The host box and `visualViewport` are printed separately on purpose.** They can
  > disagree — that disagreement is the bug an on-device readout exists to catch, and
  > printing only one of them hides it.

  *Discriminators.* For the drawer, assert the entries **per page** — a shared list asserted
  once passes while one page silently offers the other's controls, and Quit on the engine
  viewer has nowhere to go. Assert the autosave entry is a **note, not a button**: a test
  that only checks the text is present passes against a dead button carrying the same words.
  For the readout, and it is the whole point of the criterion, run it at **two
  different viewports** and assert the printed numbers **differ** and **equal** the values
  measured in the page. A hard-coded "800 × 360" passes a presence check at one viewport,
  and a readout that is wrong is worse than none — the owner cannot check it against
  anything, which is why it was asked for. The printed scale SHALL equal the scale AC-V33
  measures, or the two instruments disagree and neither can be trusted. The tile size is the
  one figure with **no** test behind its accuracy — AC-V35 exempts tiles — so it is asserted
  only to be present, non-zero and to change with the viewport.

- **AC-V41 (safe-area and `svh` are DECLARED — a presence check, said plainly)**
  `[ENHANCEMENT]`: Both `index.html` and `viewer.html` SHALL declare
  `viewport-fit=cover` in their viewport meta, SHALL pad the stage with
  `env(safe-area-inset-*)`, and SHALL size the stage in **`svh`**.
  **This asserts declaration, not effect.** Playwright cannot emulate a display cutout, so
  no test here can say a control clears a notch on hardware. Saying so is the criterion's
  honest half.
  *Discriminator, weak but not vacuous:* assert the **stage rule's declared value**, not
  that the token appears somewhere in the file. Both pages size in **`dvh`** today, so a
  grep for "svh" would pass while the stage still used `dvh`. Assert both pages
  independently — a half-landed change that reaches only `index.html` is the failure this
  catches.

- **AC-V42 (desktop is the same stage, letterboxed)** `[ENHANCEMENT]`: At **1000×780** the
  desktop SHALL render the **same** stage, letterboxed, on ADR-0028's parchment table.
  **Enter** SHALL confirm a staged target and **Esc** SHALL cancel (§3). The existing hover
  previews SHALL still work.
  *Discriminator:* assert the stage's child element set is **identical** at 1000×780 and at
  800×360 — same ids, same classes, same count. "Hover works and Enter confirms" passes
  against a second, desktop-only layout, which is the outcome this criterion exists to
  prevent. Pair it with AC-V33's non-zero letterbox at 1000×780, or "same stage" is
  satisfied by a desktop page that simply ignores the stage.

### 6a. The title screen, in the overhaul look (ADR-0040)

`AC-V43` stays reserved for "the remaining screens on the stage" (§8f); the title's look
change did not move it onto the stage, so these three take the next free letters.

- **AC-V44 (the title's rest state matches the concept, and the removed controls are
  gone, not hidden):** At rest, `#screen-title` SHALL show exactly three visible buttons
  — New Game, Continue, Copy playtest log — and `log-note-title` SHALL be hidden. The
  save readout itself lives on the Continue plaque, not in `title-slot`: with a readable
  save, Continue reads "Continue" plus a smaller second line ("Battle N of 5" or "All 5
  won"); with no save, one line. `title-slot` SHALL be hidden whenever the slot is
  readable or empty-with-storage-available, and SHOWN for either of two warnings the
  player must act on — the save is unreadable (`kind === "error"`) or storage is
  genuinely unavailable, per a real write/read probe (`detectStorage()`) — never as a
  guess from `try/catch` around one call. Erase Save and the footer link to the engine
  viewer SHALL be **absent from the DOM**, not merely hidden. *Discriminator:* a build
  that re-adds `<footer><a href="./viewer.html">` passes any "hidden" check but fails a
  DOM-count assertion of `0`; `e2e/title.spec.ts` asserts the count directly and the
  mutation was run for real (red on `Expected: 0, Received: 1`). A second mutation
  dropping `hidden` from `title-slot` on every repaint (not just the initial markup) is
  caught the same way, because `renderTitle()` re-asserts it on each call. A third
  mutation — dropping the `&& storageAvailable` half of `note.hidden`, so a blocked-
  storage empty slot reads as merely "empty" — was run for real in `e2e/title.spec.ts`:
  red on `expect(title-slot).toBeVisible()`, `Expected: visible, Received: hidden`.
- **AC-V45 (New Game asks in page before overwriting a save, and Back changes nothing):**
  Clicking New Game with a readable save present SHALL show an in-page confirm step
  ("Overwrite your save?" Yes / Back) and SHALL NOT start a run or use
  `window.confirm`. Back SHALL leave the stored save **byte-identical**; Yes SHALL
  start a fresh run. An empty or unreadable slot SHALL start at once, with no step shown.
  The step is keyboard-complete: focus moves to Yes the moment it is shown, Escape acts
  as Back (title screen only, and only while the step is open), and the confirm text
  carries `role="alert"` so a screen reader announces it unprompted. *Discriminator:* the
  fixture banks one real victory first (`history.length === 1`, `battleIndex === 1`) so
  "the save survives" is not vacuously true of an already-empty slot; `e2e/title.spec.ts`'s
  "New Game asks before overwriting a save" case asserts both the pre-click and post-Back
  save payloads are equal. A keyboard-only run — New Game, then Escape with no click —
  is a separate case in the same file: it asserts the step closes, the save is untouched,
  and focus lands back on New Game, so a build that wires Escape only on the BATTLE
  screen (the pre-existing handler) cannot pass by accident.
- **AC-V46 (the title's ink ladder is measured on its own, darker parchment):** Every
  text-bearing element on `#screen-title` SHALL clear WCAG AA (4.5:1, 3:1 large) against
  the worst leaf or plaque ground it can be painted on, measured on ADR-0040's palette —
  not assumed to inherit ADR-0028's. *Discriminator:* ADR-0028's `--ink-soft` (4.07),
  `--ink-faint` (3.79) and `--accent-ink` (3.83) all fail against this screen's
  `--parch-lo`; only `--ink` (worst case 4.996:1, on `--parch-burn`) survives. A test
  that reused ADR-0028's palette instead of re-sampling this screen's own gradient stops
  would pass three inks that fail here. `e2e/contrast.spec.ts`'s title-screen cases cover
  both the rest state and the two conditionally-shown notes (the overwrite step, the
  unreadable-save warning), each of which uses `--ink` specifically because the shared
  `--warn-lit` measures 1.44:1 on `--parch-burn` and would fail outright.

**NOT ASSERTED by AC-V33…AC-V42, said here rather than left implied:**

- **Real-device behaviour.** Every measurement is Chromium emulation. Safe-area insets,
  browser chrome height and the true usable viewport on a phone are all unverified, exactly
  as ADR-0034 recorded. The **360** figure rests on one screenshot.
- **The camera.** Pan, pinch and double-tap-to-refit are deferred. When they land,
  `pickTile` must invert the same transform the painter applies (**AC-V19**) — a camera
  change touching only the painter offsets every tap by a constant and fails silently.
- **Tile hit size.** Board tiles are exempt from the 44 px floor and measure roughly
  30 × 15 CSS px at 640×300 (AC-V35). Mis-taps on the board are uncovered until pinch zoom
  lands.
- **The other four screens.** Title, prep, briefing and the scene player are outside this
  slice and outside every criterion here (§8f).
- **Legibility.** Nothing reads a pixel off the finished canvas (ADR-0030, ADR-0032). These
  criteria say where things are, never that they can be read.
- **Playability.** Nobody has played this on a phone. "Fits, does not overlap and is
  tappable" is not "usable".

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

### 7b. Mobile is landscape only (ADR-0034)

`[ENHANCEMENT]` The viewer was tested only at the desktop baseline (1000×780, board canvas
900×440) until this slice. The owner decided the game becomes playable on phones in
**landscape only** — portrait is out of scope, not deferred. A browser cannot force device
orientation, so the design is two independent, best-effort mechanisms rather than one:

1. **A rotate gate.** A touch device held in portrait sees a full-viewport card instead of
   the game; the game is hidden and unfocusable underneath. The gate is meant to fire for
   "touch device, portrait" and never for a desktop window that happens to be narrow and
   tall. It is keyed off a media query — `(orientation: portrait) and (pointer: coarse)` as
   shipped — named as the current implementation, not the rule, since a Chromium emulation
   gap may force a max-width fallback. The card leads with "Please rotate your device"
   above an `aria-hidden` figure — a phone icon turning 0 to 90 degrees on a CSS loop
   inside a static quarter-turn arrow — because text alone does not cross languages. Under
   `prefers-reduced-motion: reduce` the phone parks at 90 degrees instead of looping.
2. **A lock attempt.** The gate card's button, "Play in landscape", requests fullscreen,
   then calls `screen.orientation.lock('landscape')`; both are feature-detected and fail
   silently. A persistent line, "If the screen does not follow, switch off rotation lock.",
   is always shown; a hint, "Your browser cannot rotate the screen for you.", is revealed
   only once the attempt is known to have failed. A web manifest declares
   `orientation: "landscape"` and is linked from both pages.

Neither mechanism can be relied on alone: see AC-V30/32 and ADR-0034's Limits section
for what each browser actually honors.

> **ADR-0034 fixed the ORIENTATION; it did not fix the layout.** The owner opened the game
> on a real phone in landscape and the stat plate covered about half the board. **AC-V31 was
> green on that screen.** ADR-0037 rebuilds the viewer phone-landscape first — see **§8** —
> and retires AC-V31. Everything in this sub-section still stands: the rotate gate and the
> lock attempt are unchanged.

## 8. The stage and its zones (ADR-0037)

`[ENHANCEMENT]` **The viewer is laid out for a landscape phone first, and desktop gets the
same stage.** This replaces the desktop-first layout that sized panels in fixed pixels
beside a 900×440 board.

> **SCOPE: the BATTLE screen only.** The stage rule applies **screen by screen**, and this
> slice moves one screen. Title, prep, briefing and the scene player keep their current
> layout, outside the stage, until their own slice — see §8f.

### 8a. One stage

```
stageH = 360                                    // logical units, always
stageW = clamp(640, round(360 * vw / vh), 900)  // 1.78:1 … 2.5:1
scale  = min(vw / stageW, vh / stageH)          // uniform; centre; letterbox the remainder
```

`vw` and `vh` are the **stage host's measured box**, an element sized `100svw × 100svh`.
Small viewport units, deliberately: `dvh` re-lays-out every time a browser toolbar slides.
Everything is measured off `getBoundingClientRect()`, never off the CSS variable (AC-V33).

A landscape phone is **wider** than 16:9, not taller — the owner's device measures roughly
851 × 324 CSS px, about **2.6:1** — so a fixed 16:9 stage would pillarbox away a third of
the width. Height is the scarce axis, so height is what is fixed.

**Derived, in CSS px, and these are the numbers AC-V33 asserts:**

| Viewport | Aspect | `stageW` | `scale` | Letterbox, total |
|---|---|---|---|---|
| 640×300 | 2.13 | 768 | 0.8333 | 0 |
| 800×360 | 2.22 | 800 | 1.0 | 0 |
| **851×324** — the owner's phone | 2.63 | **900** — clamped | **0.9** | **41 px horizontal** (20.5 per side) |
| 900×390 | 2.31 | 831 | 1.0830 | 0.11 px vertical — under tolerance, reads as none |
| 1000×780 | 1.28 | **640** — clamped | 1.5625 | 217.5 px vertical (108.75 per side = **69.6 stage units**) |

**Tolerance:** within **1 CSS px** of the formula, and "none" means under 1 CSS px. 900×390
carries 0.11 px of rounding slack, so an exact-zero assertion would flake there.

**These five are the supported viewports and the test set.** A fluid width has to be proved
at both ends or it is proved nowhere. **851×324 is the only one that reaches the 900 clamp**,
which is why it is in the set — drop the clamp and only that row goes red. Desktop is the
**narrowest** stage, not the widest: width follows aspect, and 900 is reached only past
2.5:1.

**Board budget:** 60 top bar + 84 bottom bar leaves **216** units of height for the board.
At the board's 900:440 ratio (2.045:1) that is **442 units wide**, which fits inside the
narrowest stage — 640 units, less the actor tab — with room over.

> **Said precisely, because the loose version is wrong.** `viewFor` fits the *content* to
> the canvas's **900×440 backing store**; it does not fit the board to an arbitrary CSS
> width. The CSS box scales that fixed store. So the claim is **not** "the auto-fit camera
> makes the board fit any width" — it is that the board's CSS box keeps the store's 2.045:1
> ratio, and 216 × 2.045 = 442 fits the budget. AC-V19 still pins the camera and the click
> to one fit function, and that is untouched here.

### 8b. The zones

**The rule is: at rest, nothing covers the board.** "At rest" means nothing selected, or a
unit selected with no target staged — the two states AC-V34 measures.

| Zone | Contents | Laid out or overlay |
|---|---|---|
| Top-left | ☰ menu → left drawer: save, quit, turn log, legend | laid out |
| Top-centre | turn-order chip strip, one row; tap expands | laid out |
| Top-right | `?` help, ⚙ settings | laid out |
| Centre | the board canvas, auto-fit | laid out |
| Left, mid | **actor tab** — name and HP only; opens a drawer with ADR-0033's full stat set | **laid out**, beside the canvas, never over it |
| Right | **preview sheet** — §4's set plus **Confirm** | overlay, only while a target is staged, **at most 35% of the canvas width** |
| Bottom | action bar: Cancel · Actions ▲ · **phase-aware primary button** | laid out |
| Bottom-centre | toast: why an illegal tap was refused | overlay, render-only, untimed |

The **canvas box is what is left** after the laid-out zones. Overlays exist only in
response to something the player just did, which is what makes "uncovered at rest" a
measurable claim rather than a preference.

**The primary button carries the enemy's turn.** In a player phase it is **End Turn** with
its Clock price; in `AI_TURN` it reads **"Enemy turn ▸"** and performs **Step** (§3). Never
a timer. Without it the stage has no control at all while the AI acts.

**The preview sheet is bounded at 35% of the canvas width** so a visible target can be re-staged
by tapping it. A target *under* the sheet needs Cancel first (§3). Tapping a unit that is
not a legal target opens the unit drawer read-only for that unit.

**The campaign's fixed help disc is HIDDEN while the battle is on screen.** The stage's `?`
button is the help affordance there — two on one screen is one too many, and the disc is the
one that would land on the board. It is untouched on every other screen, which is why it
stays outside the stage rather than moving into it.

**Two things sit OUTSIDE the stage element, and this is structural rather than stylistic:**
the **rotate gate** (AC-V30) and the **help disc**. The stage is a transformed ancestor, and
`position: fixed` inside a transformed ancestor resolves against that ancestor instead of
the viewport. A gate meant to cover the whole screen would be scaled and clipped by the very
stage it is meant to sit above. They are siblings of the stage, not children.

### 8c. Touch rules

- **44 × 44 CSS px minimum** for every control, at every supported viewport. At 640×300 the
  scale is 0.833, so that is **≥ 53 stage units** (AC-V35). **Board tiles are exempt** — at
  640×300 a tile is roughly 30 × 15 CSS px, and only a camera zoom can change that (§8e).
- `viewport-fit=cover` plus `env(safe-area-inset-*)` padding. In landscape a notch takes
  roughly 44–59 px off one side. Neither page declares `viewport-fit` today.
- **`svh`** for the stage height. `dvh` re-lays-out on every toolbar change; both pages use
  `dvh` today.
- `touch-action: manipulation` on controls, `touch-action: none` on the canvas,
  `user-select: none` on chrome. **Never `user-scalable=no`.**

### 8d. The settings drawer prints the viewport

Settings shows four things (AC-V40): the live `visualViewport` size, the **stage host's
measured box**, the derived `stageW` and applied **scale**, and the **current tile size in
CSS px**. The owner cannot read their own viewport size, and the 360 figure rests on a
single screenshot — this readout turns that guess into a measurement somebody can check on a
real device. The host box and `visualViewport` are printed separately because they can
disagree, and that disagreement is exactly what an on-device readout is for.

### 8e. What is deferred

Camera **pan, pinch and double-tap-to-refit** are not in this slice. **A consequence, stated
rather than left implied:** tile taps stay small — roughly 30 × 15 CSS px at 640×300 — and
AC-V35 exempts them, so board mis-taps are uncovered until zoom lands.

When it does land, `pickTile` must invert the same pan and zoom the painter applies —
**AC-V19** pins the camera and the click to one fit function, and a camera change that
touches only the painter offsets every tap by a constant and fails silently.

### 8f. The other four screens, and who owns them

**Title, prep, briefing and the scene player are NOT in this slice.** They keep their
current layout, outside the stage, and no criterion here says anything about them. The
research brief sketches how each maps onto the stage — prep as two panes collapsing to a
bottom sheet under 720 units, the scene player as a pinned portrait with the stage as the
"next line" target — and that sketch is a **proposal, not a spec**.

> **Title's LOOK changed under ADR-0040; its position did not.** `#screen-title` is a
> `position:fixed` full-viewport sheet, styled to the owner's concept — but it is not the
> ADR-0037 stage element, gains none of the stage's zones or letterboxing rules, and is
> covered by AC-V44…AC-V46 below, not AC-V33…AC-V42. Prep, briefing and the scene player
> are untouched by ADR-0040 and still read exactly as this paragraph did before it.

**Follow-up slice: "the remaining screens on the stage."** It needs its own ACs, minted at
**AC-V43 onward**, and it lands screen by screen. Naming it here is what stops "the viewer
is built for a phone" from reading as a claim about screens nobody has measured.

## 9. Determinism risks specific to this layer

> **This section was §8 until 2026-09-05.** ADR-0032, `docs/NEXT.md`,
> `docs/proposals/action-menu.md` and `src/render/iso.test.ts` all cite it as "`docs/10`
> §8"; those citations mean **this** section. Said here so the old references resolve
> rather than silently pointing at the stage spec above.

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

## 10. References

- `docs/00` pillars 3 & 4 · `docs/01` §1–§2 + AC-02 (the CT table this layer prices) ·
  `docs/04` §3 (resolution transparency) and §7 (accessibility) ·
  `docs/05` §3b + AC-S1/AC-S7 (the command-replay substrate) · `docs/03` (the closer
  archetypes the fold unblocks)
- ADR-0004 (determinism P0) · ADR-0007 (sim/render split) · ADR-0010 (deferred
  resolution scope) · ADR-0013 (facing-on-move deferred) ·
  **ADR-0015 (the move+act fold — the decision this doc specifies)**
- ADR-0028 (parchment, and the contrast instrument) · ADR-0032 (the board moves) ·
  ADR-0033 (the stat set — kept; its placement — superseded) · ADR-0034 (landscape only) ·
  **ADR-0037 (the landscape-phone stage — §8)** · **ADR-0038 (Confirm is a separate tap —
  §3)**
