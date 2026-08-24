# ADR-0027 — The campaign demands engagement: the finale is tuned so ignoring the prep screen loses

- **Status:** Accepted — **the number is MVP-PROVISIONAL** (the standing note from ADR-0025/0026). What is not provisional: the campaign must not be winnable without using the systems it is built around.
- **Date:** 2026-08-24
- **Amends:** `docs/11` **AC-M1**, which asserted a finishable playthrough without saying which player it assumed.
- **Owner docs:** `docs/11` AC-M1, `docs/06` (encounters), `docs/07` §3 (pacing)

## Context

The synthetic playtest (`docs/plans/slice-m1-synthetic-playtest.md`) put three deterministic personas through the shipped campaign over eight seeds. The result:

| persona | cleared | AP left unspent | chassis slots filled |
|---|---|---|---|
| `naive` — never opens the prep screen | **8/8** | 966 | 0.00 |
| `default` — cheapest live option per slot | 8/8 | 410 | 1.25 |
| `optimizer` — deploys and buys by measured contribution | 8/8 | 388 | 1.75 |

Every persona cleared every battle at every seed, first try. A player who ignored the job system, the ability chassis, the AP economy and the weapon drip entirely finished the game with 966 AP banked and every chassis slot empty.

That is the whole product failing quietly. `docs/00`'s pillars make customization the spine; a campaign that never asks for it makes the spine decoration. Nothing went red, because nothing asserted it — the difficulty half of `docs/11`'s definition of done ("a stranger plays 30–45 minutes and reaches a real ending") had never been measured, only assumed.

## Decision

**1. `foe-warchief`'s Physical Attack goes 8 → 11.** One field, one record, one battle.

The measurement is the argument. Every foe was swept independently: bumping the brigand and the hexer in battle 5 changed nothing (16/16 for all three personas), and bumping battles 3 and 4 changed how much HP the party lost without ever changing an outcome. **The warchief alone is the difficulty knob**, so it is the only thing that moved. Battles 1–4 are untouched, which also means the early game — where the party has earned nothing yet and a bump would be unfair rather than demanding — is exactly as it shipped.

At 16 seeds:

| persona | cleared | where it stops |
|---|---|---|
| `naive` | 2/16 | battle 5, 14 times |
| `default` | 8/16 | battle 5 |
| `optimizer` | 16/16 | — |

**11 sits on a plateau, not a knife-edge.** PA 11 and PA 12 give byte-identical results (2 / 8 / 16); PA 14 starts costing the engaged player (default 6/16) and PA 9 changes nothing at all (16/16 across the board). Adjacent values agreeing is the evidence that a mechanism moved rather than a number — the same reason a non-monotonic sweep is never read for its best step. A single extra Physical Attack point is a ~12.5% damage step, so the useful range here is narrow by construction; that is a property of the stat, not of this choice.

**2. `docs/11` AC-M1 must name the player it assumes.** "The campaign is finishable" is not one claim, it is a family of them, and the useful one is not the weakest member. The criterion now asserts an ending is reachable **by a player who uses the prep screen**, and records that the zero-engagement path deliberately does not finish.

The headless `runCampaign` in `src/sim` has no prep concept — it fights with the party exactly as authored — so it *is* the zero-engagement path. Its "reaches completed" assertion moves to the playtest harness, which can drive a real player policy. What stays in `campaign-run.test.ts` is what it is actually evidence for: every battle resolves by its own objective rather than a halting cap, the sequence ramps, and the run is deterministic.

**3. What the campaign now asks for is ONE specific thing, and it is learnable: spend on the job you are in.**

`default` clearing only 8/16 looked at first like "engaging casually is not enough", which would have been a bad design outcome. Measuring the policies apart says otherwise:

| between-battle policy | cleared (8 seeds) |
|---|---|
| buy from the member's **own job tree** until it runs dry | **8/8** |
| buy from the own tree first, then everywhere else | 8/8 |
| buy the **cheapest live node anywhere** in the pack | 1/8 |
| buy cheapest anywhere, plus the heaviest weapon | 5/8 |

Nothing else about those policies differs — same deployment, same slot filling. **Spending at home wins; spreading AP across whatever is cheapest loses.** That is a real trap and now it has teeth: AP is one global pool and the panel lets you browse any tree, so buying a scattering of other jobs' cheap nodes is an easy and plausible mistake. It is the kind of thing a tactics game is allowed to make a player work out, and it is why this is a design statement rather than a difficulty complaint.

It also explains the `default` persona's 8/16 without excusing it: `default` buys cheapest-anywhere by construction. The number is a measurement of the trap, not of the boss.

**4. The panel now warns before the click, not after (added 2026-08-24).**

The gap above was that nothing in the game said any of this. `learnRows()` gains `reach` — where an ability would land *for this unit as currently built*: `command` (usable the moment it is bought), `secondary` (another job's action, dead until that job fills the one Secondary slot), or the passive's own slot. A row whose reach is `secondary` renders a **needs Secondary** tag.

The panel already told the player where a purchase went; `learnReceipt` is that receipt. A receipt arrives after AP that is never refunded is gone. This is the same fact, before the money moves — and both go through one helper, so the warning and the receipt cannot disagree.

Three supporting text changes:

- The learn list's hint used to read "AP is one pool — you can buy from any job's tree without changing job", which is true and reads as an invitation to do the losing thing. It now leads with spending at home.
- A new help topic, **Where to spend AP**, states the one-Secondary constraint plainly: "buying cheap actions from three different jobs leaves you able to use one of them."
- **Losing a battle** said losing costs nothing and you go back with the same party. True, and it implied a retry is a fresh chance — it is not: the retry is the same fight, a loss banks no AP, so going straight back in changes nothing on its own. That now says so.

**Still not fixed, and it is a real limit:** whether a newcomer *reads* any of this is exactly the question no agent can answer (`docs/11` AC-M6, `docs/NEXT.md` trap 4). What is asserted is that the warning is produced by the shipped content, that it names the right rows, and that it agrees with the real command projection — not that it lands.

## Consequences

- **The campaign is now losable, and that is a feature with a cost.** `docs/11` AC-M3 (losing is a state, not a crash) stops being a hypothetical for the first time: a real player will now hit the game-over screen. It is asserted, but it has never been *seen*.
- **A loss at battle 5 is currently terminal in practice.** A lost battle banks no AP and `retryBattle` restores the party exactly, so with a fixed seed the retry is bit-identical to the attempt that failed. A player who loses the finale can only win by having played the earlier battles differently — which no UI tells them. **This is the most likely thing to make a real playtest go badly**, and it is unaddressed.
- **This is agent evidence, not human evidence.** The balance probe plays the player's units too, so a persona reaches the outcome only through its *build*, never through better positioning. A human who plays carefully has a lever no persona here has. Read "naive loses 14 of 16" as relative difficulty, never as "87% of people would lose this".
- The four tests that asserted the no-prep playthrough reaches an ending were retargeted, not deleted. Any future change that makes the zero-engagement path win again should go red somewhere — that assertion now lives in `playtest.test.ts`.

## Alternatives considered

- **More enemies.** Unit count is a discontinuity: 4-vs-3 → 4-vs-4 took all three personas from 8/8 to 0/8 in one step, losing at battle 3. No usable range.
- **Arming the foes.** Every weapon in the catalog, on every battle 3–5 foe, moved nothing measurable — the fights are decided by ability damage (`pa × power`), not by basic attacks.
- **Fewer deployment slots in the late battles.** This works (and would make the deployment choice matter, which today it barely does — four party members for four slots). It is a bigger content change than the finding requires and is left as a candidate.
- **Raising every battle 3–5 foe.** Measured: it costs the engaged player HP in battles 3 and 4 without changing a single outcome. Rejected as change that does not pay for itself.
