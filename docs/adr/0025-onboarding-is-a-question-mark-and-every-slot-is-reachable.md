# ADR-0025 — Onboarding is a `?`, not a tutorial; and every chassis slot is reachable inside one campaign

- **Status:** Accepted
- **Date:** 2026-08-22
- **Supersedes / amends:** amends `docs/08` §3's "guided first build" (see decision 1). Builds on **ADR-0012** (AP grant shape), **ADR-0017** (the support slot), **ADR-0019** (the reaction slot), **ADR-0020** (the movement slot) and **ADR-0024** (the prep model).
- **Owner docs:** `docs/11` §3 M0 item 7 + AC-M5/AC-M6, `docs/08` §3 (onboarding ramp), `docs/02` B5 + AC-J2

## Context

M0 item 7 was the last item: `docs/08` §3's hour-one ramp, which asks for **staged unlocks** and a **guided first build** — "a scripted moment where the game walks the player through equipping a secondary + a reaction".

Scoping it started by measuring the shipped campaign instead of trusting the handoff. Three things came back, and the third changed the slice:

1. **Battle 1 did not restrict what it teaches.** Kest starts with `punch-art.wave-fist` learned, so turn one already offers a special ability.
2. **Battle 3's only affordable purchase was inert.** `battle-skill.weapon-break`, 60 AP, tagged deferred. The handoff had placed the guided purchase there because AP first affords *a* 60-AP node at battle 3 — without checking which one. AP is spent permanently and never refunded (AC-J3), so that beat would have walked a newcomer through buying nothing.
3. **The guided first build had nothing to equip.** Measured across all five battles, for every party member:

   | Slot | Cheapest LIVE option | Campaign AP budget |
   |---|---|---|
   | secondary | 60 AP | ~280 (best member) … 184 (worst) |
   | movement | 120 AP | reachable |
   | support | **300 AP** | out of reach |
   | reaction | **540 AP** | out of reach |

   And the panel only ever listed the **current job's** tree, so the 60-AP secondary — the cheapest, most important recombination in the game — looked impossible too.

`docs/00` names the customization sandbox as pillar 1. It was unreachable in the only thing a person can play, and nothing in the repo said so.

## Decision

**1. No tutorial. A `?` panel, and mechanics that read on their own.** (User decision, 2026-08-22.)

`docs/08` §3's staged unlocks and scripted first build are **not built and not scheduled**. Nothing is gated, nothing is disclosed on a schedule, no battle is designated a teaching battle. Instead `game.html` carries a persistent `?` control opening a help panel the player reaches when *they* want it.

This is a real trade against `docs/08` §3, taken deliberately: progressive disclosure is the standard counter to the 2-hour bounce, and we are betting on legibility instead. The bet is falsifiable — a playtest where a newcomer cannot form a build without opening `?` is evidence against it, and `docs/08` §3's ramp is still on the shelf.

**2. The help content is DATA with a testable hook, not markup.**

`src/render/help.ts` holds topics; `help.test.ts` holds them to the shipped pack. The load-bearing field is `HelpTopic.slot`: a topic claiming the player can equip a Reaction asserts that a **live** reaction exists *and* is affordable inside one campaign's AP. Prose in this repo is treated as an assertion, and a help panel is the easiest prose to let rot — it keeps reading as true long after the mechanic moved. Before this slice those same assertions read 300 / 540 / 120 and two of the three failed.

It is **not** on the story seam (ADR-0024). A help panel is UI chrome, not fiction; swapping the story pack must never be able to delete the manual.

**3. The learn list browses ANY job's tree. The panel was the only thing hiding cross-job buying.**

`canLearn` never required the unit to be in the job — `docs/02` AC-J2 says an ability is bought "on the owning job's tree", and AP is one global pool. `PrepModel.learnRows()` hard-coded `record().currentJob`, which is a UI restriction with no doc behind it, and it hid the 60-AP path to a Secondary command.

Browsing is **model state, never record state**: it is not persisted, never reaches `onChange`, and resets whenever the tree under it could change (selecting another member, re-pointing the panel, changing job) — stale browse state would show a Knight the Thief tree they were reading for somebody else.

The discriminator is an A/B on the row sets, not their existence: the browsed tree and the current job's tree must **disagree**. Mutation-verified — and the first draft of the second test passed under the mutant because it bought a node by literal id instead of through `learnRows()`, which is exactly the "a named discriminator is a claim about code you have not run" trap. It now buys the row the panel renders.

**4. Every chassis slot is reachable inside one campaign — by shortening chains, not by cheapening capstones.**

| Change | Before | After |
|---|---|---|
| `punch-art.martial-arts` requires `wave-fist` (was `earth-slash`) | 300 | 180 |
| `punch-art.counter` — 120 AP, requires `wave-fist` (was 240, `revive`) | 540 | 180 |
| `black-magic.magic-attack-up` requires `fire` (was `ice`) | 300 | 180 |
| `summon.short-charge` — 120 AP, requires `shiva` (was 240, `moogle`) | 540 | 180 |
| **new** `battle-skill.hp-boost` — support, maxHp ×1.2 | — | 120 |
| **new** `white-magic.short-chant` — support, chargeSpeed ×1.25 | — | 120 |
| **new** `aim.steady-aim` — support, ability range +1 | — | 120 |
| **new** `geomancy.attunement` — support, PA +1 / MA +1 | — | 120 |

Counter dropping to a 120-AP node is **more** FFT-faithful, not less: in the source game Counter is a mid-tree Monk reaction (500 JP) and Hamedo is the capstone (900 JP). `punch-art.hamedo` stays 240 behind `martial-arts`, and every 240-AP node in the pack stays beyond a single campaign's earnings — so "reachable" means the shallow tier, and `help.test.ts` asserts that upper bound too, or the bar would be one no pack could fail.

**No cheap Reaction was ADDED to any other job**, and that is the anti-convergence rule (`docs/02` B5) doing work: `ReactionEffectSchema` carries only `{kind}` with no magnitude, so a cheap `counter` anywhere would be *identical* to the capstone and strictly dominate it. The only honest way to make a reaction reachable was to reprice the one that exists. For the same reason geomancer got a support rather than a movement: `MovementEffectSchema` is only `{move}`, so a +1 move ability would sit next to the thief's +2 at the same price and simply lose.

Each new support pulls a **different** lever — HP, charge speed, ability range, hybrid PA/MA — against the one support slot, so more options means more tension, not less.

**5. The campaign's own party keeps its content unchanged.** Kest still starts with Wave Fist and the story pack is untouched. With no teaching battle, there is nothing for a stripped battle-1 kit to serve; changing shipped content to fit a tutorial that no longer exists would be a change with no reason behind it.

## Consequences

- Every party member now has a live purchase. **Vance previously had none in the entire campaign** — his whole Knight tree is `battle-skill`, excluded by user decision (2026-08-16) — and `battle-skill.hp-boost` is the first thing he can buy that does something. The exclusion is untouched: it covers that skillset's *actions*, and this is a passive.
- Four job trees grew by one node; `EXPECTED_TREE_SIZES` in `content-pack.test.ts` moved with them, in this slice.
- **The diversity gate did not move** (still 7, all 703 tests green). Expected, and worth stating: shipped builds author `learned` explicitly, so repricing *progression* changes no built unit. This is a change the gate is structurally unable to see, which is why the evidence for it is the reachability probe, not a green suite.
- `docs/08` §3's ramp is now explicitly deferred rather than silently unimplemented.
- What is still NOT reachable in five battles: every 240-AP capstone, and hybrid jobs (unbuilt). That is intended.
