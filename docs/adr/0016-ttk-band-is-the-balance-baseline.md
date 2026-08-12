# ADR-0016 — Time-to-kill is the balance baseline, and it is enforced by test

- **Status:** Accepted
- **Date:** 2026-08-12
- **Supersedes / amends:** amends **ADR-0014** (diversity-gate phased target: `N` 1 → 5). Does not reverse **ADR-0015** (the move+act fold) — it corrects the diagnosis that followed it.
- **Owner docs:** `docs/07` §3 + **AC-P6** (new), `docs/06` AC-E2, `src/sim/CLAUDE.md`

## Context

`docs/07` §3 has always specified the intended pacing: *"a squishy unit dies in ~1–2 committed actions; a tank in ~3–4."* Nothing tested it.

The shipped content missed it by 3–4×. A reference knight had **72 max HP** and its own basic attack dealt **90**. Every unit on the board — squishy and tank alike — died to **one hit**. A trace of a losing gauntlet run showed three units dying on the first tick anyone acted, and the whole battle resolving in 2–4 turns.

This was diagnosed only after ADR-0015's move+act fold dropped the build-diversity count from 6 to 1. The fold was blamed, and the handoff scoped the follow-up slice as *"give ranged and caster builds an answer to fast melee."* That framing was wrong, and unfixable as stated:

**At TTK = 1, no tactical lever is measurable.** Range, positioning, tempo, terrain and signature abilities all reduce to "who acts first". The fold did not create the problem; it removed the one turn of slack that had been hiding it.

## Decision

**1. Time-to-kill is the balance baseline. It is enforced by test (`AC-P6`), not left as prose.**

`raw.hp` re-authored across all 14 build records so each derived `maxHp` lands in its declared TTK class. Applied **symmetrically to both sides** — this is a pacing fix, not a difficulty dial, and it does not weaken the opposition. The reference committed action is **derived from the engine**, so the band cannot go stale when `docs/01` constants change.

**2. A showcase build's signature ability must out-damage that build's own basic attack.**

This was already a house rule in `src/sim/CLAUDE.md`, but it was *unenforceable* while every action one-shot every target — the probe's magnitude ranking could not distinguish two actions that both kill. Now it can, so the rule is testable and tested.

One build violated it: **the geomancer**. `magicDamage` applies Faith at **both** ends, so at the shared Faith 50/50 every magic ability is **quartered**, while physical ones are not — but geomancy's `power` had been authored on the physical scale. A geomancer's spell landed at **45** against its own punch at **80**, so the probe punched, and `terrain-geo` won its maps *as a knight*. Geomancy `power` re-scaled ×~2.7 (`water-ball` 18 → 48), putting a geomancer's signature at ~1.5× its own basic — the **low** end of the other five showcase builds' signature/basic ratios (1.5 … 2.0), chosen at the low end deliberately so the number is not tuned to the gate.

**3. `DIVERSITY_TARGET_N` = 5** — the honest observed count, per ADR-0014's standing rule that the target is set to what is measured so the gate keeps detecting.

## Consequences

**The count.** 1 → 5 distinct viable identities: `aim.`, `geomancy.`, `punch-art.`, `summon.`, `white-magic.`. `≥ 8` remains the release bar (AC-E2).

**Robustness — why 5 is trusted.** Perturbing every build's `raw.hp` by a common factor keeps N at 5–6 across ±15% (it drops to 3 only at −15%). The earlier HP sweep had been chaotic — N jumping 5, 2, 4, 3 between adjacent scales — because it straddled the TTK = 1 boundary; the chaos disappears once the band is met. That plateau is the evidence that the fix addressed the mechanism rather than moving a number.

**The magic threat axis needed the geomancy fix to survive the HP fix.** The Coven casts geomancy, so against 315-HP bodies it had gone toothless: nearly every candidate cleared the magic axis and `losingMatchups` emptied out — the second threat axis stopped discriminating. Re-scaling geomancy restored it (~107 a cast, three casts to drop a tank).

**The Priest's sustain identity went live.** With allies now surviving long enough to be wounded, `white-magic.cura` fires on the phys reference axis for the first time — ADR-0014 had recorded that identity as unmodeled *because* nobody was ever wounded-but-alive. The offensive identity still dominates (holy 9 casts / 747 damage vs cura 2 / 90 on `enc-the-breach`), and the test now asserts that ratio rather than the old "never heals".

**Known gap, deliberately not closed here.** `black-magic.` is the one identity still missing, and its two carriers fail for different reasons:

| build | phys maps | why |
|---|---|---|
| `bld-arcane-artillery` | 1 / 6 | a 144-HP caster whose 81-damage spell needs 4 casts to drop a 315-HP tank that kills it in 2 |
| `bld-spellblade` | 1 / 6, **masked** | a knight's MA 6 makes borrowed black magic (37) lose to its own PA × WP swing (90) |

Both stay MEASURABLE, not EXCLUDED: nothing structurally blocks them, so demoting them would hide a tuning debt behind a capability tag. The spellblade mask is asserted **positively** in `ttk.test.ts` so it can be neither forgotten nor silently fixed. Fixing spellblade alone buys the count nothing — its prefix collapses onto arcane-artillery's.

**Anti-convergence signal to watch (surfaced, not failed).** `bld-faithzero-monk` now clears every `{map × opposition}` cell, and three builds pay no opportunity cost across both threat axes. It is not *dominant* (others clear some cells faster), so the gate passes — but a build with nothing to lose to is what `docs/02` B5 exists to prevent.

## Alternatives considered

- **Cut damage instead of raising HP.** Same goal, opposite knob. Rejected: `PA × WP` is pinned to `docs/01` golden test-vectors, while `raw.hp` is unverified authored content. Moving the verified side to fix the unverified one is backwards.
- **Follow the handoff as written** (ranged/caster answers to melee: reaction attacks, terrain, opening tempo). Rejected: unmeasurable at TTK = 1, so it would have been tuning blind. It remains a legitimate *later* slice now that the levers are visible.
- **Weaken the enemy teams.** Rejected by the user, 2026-08-12, and independently wrong: the goal is variety, not win rate.
- **Screen the caster** (seat the candidate behind its two fillers rather than line-abreast). **Tested and rejected**: enemies do block traversal so the screen is mechanically real, but two bodies cannot hold a lane on these maps and the candidate contributes less from further back — N went 1 → **0**. Do not re-run it.
- **Pick the HP scale that maximised N.** A uniform ×0.95 perturbation scores N=6. Rejected as calibrating to the metric: the band targets come from `docs/07` §3, and the 6 is a knife-edge on `bld-arcane-artillery` rather than a better baseline.
