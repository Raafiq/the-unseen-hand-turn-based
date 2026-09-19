# ADR-0045 — Retune the five campaign foes for six deployed

- **Status:** Accepted
- **Date:** 2026-09-19
- **Amends:** ADR-0027 decisions 1 and 3 (the warchief-alone PA knob, and the `default`
  persona's 8/16 "learnable trap"). ADR-0044 §4 ("Enemies are not retuned here") and its
  Consequences (the two parked `DEFERRED (six-deploy)` tests).
- **Owner docs:** `docs/07` AC-P6 (TTK band), `docs/06` AC-E5 (difficulty lever), `docs/11`
  §1, §3.

## Context

ADR-0044 put all six party members on every map and left foes untouched. Measured there:
the naive zero-prep party now clears the finale with zero deaths. The campaign stopped
being demanding — every persona cleared 16/16 and battle 1 ended at 100% HP (this slice's
own baseline sweep, below). This ADR is that retune.

## Decision

**1. Raw HP up on all five foes, inside the `docs/07` AC-P6 TTK band; nothing else moves.**
No PA, MA, speed or MP change on any foe.

| foe | raw HP before | raw HP after | TTK class |
| --- | --- | --- | --- |
| Brigand | 150 | 210 | `mid` (2–3) — reclassed, see decision 3 |
| Cutthroat | 216 | 270 | `mid` (2–3) |
| Hexer | 192 | 225 | `squishy` (1–2) |
| Marauder | 255 | 285 | `tank` (3–4) |
| Warchief | 469 | 585 | `boss` (6–9) |

**2. More foe placements on battles 1–4.** Foes per battle go 1/2/3/3/3 → 2/4/5/5/4 (battle
5 count shown after decision 3's swap). New placements sit on the east half of each map,
on painted-legal `passable` tiles, clear of every prop.

**3. The finale's Brigand and Hexer are replaced by two Marauders and a Cutthroat.** The
Hexer hard-counters the prepped personas: measured with a Hexer in `warchief + hexer +
marauder×2`, the optimizer persona scored 4/16; swapped for a Cutthroat, the same fight
scored 16/16. The Hexer stays in the roster — it reads as content, the Hollow Watch (b3) —
and is out of the finale specifically.

**4. `foe-brigand` reclasses `squishy` → `mid` in `src/sim/ttk.test.ts`'s `CAMPAIGN_CLASS`.**
The Brigand is a Knight, fielded two-to-five per map against six — the campaign's
rank-and-file line infantry, which is what `mid` names. At 252 built HP he needs 3
committed actions, outside the `squishy` band (1–2) but inside `mid` (2–3), with headroom
below the `mid` ceiling of 270. This is the only class reclass; every other row is
unchanged.

**5. All four parked tests are re-armed.** Two `DEFERRED (ADR-0041)` and two `DEFERRED
(six-deploy)` sites in `src/sim/campaign-run.test.ts` and `src/render/playtest.test.ts`
now run. Zero `it.skip` remain in `src/`. The "campaign KILLS party members" test was
rewritten, not merely un-skipped: its threshold moves from a four-member `< 4` to a
six-member `< 6`, and it now excludes the finale wipe as its evidence, naming battle 2 as
the discriminating won-but-costly fight instead.

## Evidence

Baseline (six deployed, foes untouched, 16 seeds): all three personas 16/16, naive ends
battle 5 at 70% HP. Chosen numbers (16 seeds):

| persona | cleared | player HP% b1–b5 |
| --- | --- | --- |
| naive | 0/16, all stop at b5 | 81 / 52 / 63 / 77 / 0 |
| default | 1/16, 15 stop at b5 | 82 / 61 / 55 / 52 / 1 |
| optimizer | 16/16 | 82 / 58 / 54 / 78 / 41 |

Headless zero-prep `runCampaign`: victory×4 + defeat, `gameOver` at b5, survivors
5/3/4/5/0, turns 20/31/34/38/46 (strictly increasing, +60% over the pre-retune 106 total).
Out of sample at 32 seeds the optimizer clears 30/32 (loses offsets 23 and 27).

Perturbed ±10% per foe and ±1 body per battle (16 seeds each, full table in
`docs/plans/slice-six-retune.md`): the naive-loses half is a wide plateau (0/16 in 15 of
16 neighbours). The optimizer-clears half is a narrower, asymmetric plateau, flat on
warchief ±10%, cutthroat ±10%, marauder 285→300 and b4 −1 foe. The finale's body count is
a one-step cliff, not a plateau: 3 bodies clears everyone, 4 (chosen) gives 16/16, 5
collapses the optimizer to 9/16. The marauder HP plateau has a cliff at its low edge
(270 → default 14/16; 278 → default 1/16); the usable range is ~278–300, chosen 285.

All four re-armed tests were proved red against the pre-retune data (`git stash` of
`data/campaign/` only, run, unstash) — see `docs/plans/slice-six-retune.md` "Tests
re-armed" for the four red-on-old-data messages.

## Consequences

- **Reverses ADR-0027's "the warchief alone is the difficulty knob" and "battles 1–4 are
  untouched."** With the party tripled, the early game had to move too — battles 1–4 now
  carry both more bodies and more foe HP.
- **Reverses ADR-0027 decision 3's "learnable trap" framing.** `default` (cheapest-live-
  node-anywhere) scored 8/16 there — distinct from naive's floor and optimizer's ceiling.
  At these numbers `default` is 1/16, statistically indistinguishable from naive's 0/16.
  The campaign now demands spending at home rather than merely rewarding it. **This is a
  design change the owner has not ruled on — open, not decided by this ADR.**
- **Tension with `docs/06` AC-E5, recorded not resolved.** Raw HP moves +12% to +40% per
  foe and is the *primary* separator between personas here, because more bodies and more
  PA punish the prepped personas first (they swing weapons instead of healing; naive's two
  Priests keep casting Cure). AC-E5 calls raw stat multipliers "a bounded, secondary
  lever." This slice's bound is `docs/07` AC-P6's TTK band, not AC-E5's framing — a future
  ADR should decide whether AC-E5 needs amending or whether this is the bounded case it
  already describes.
- **Campaign length, unmeasured in minutes.** Headless turns go 106 → 169 (+60%).
  `docs/11` names a 30–45 minute session as the MVP's definition of done; nothing here
  measures wall-clock, and AI turns still need an explicit Step tap. Flagged as an open
  risk: the retune could push a real playtest past 45 minutes and nothing here would catch
  it.
- **The finale is tuned against the balance probe's greedy AI**, not a human. No claim is
  made about a real player's difficulty, pacing or fun.
- ADR-0044 §4 ("enemies are not retuned here") and its Consequences (two parked tests) are
  superseded by this ADR: the retune is done, and zero `it.skip` remain in `src/`.

## Alternatives considered

- **More bodies alone, stats untouched (3/4/5/5/5).** Measured: naive 13/16, default 3/16,
  optimizer 3/16 — inverts the wanted order. `default`/`optimizer` swing weapons instead of
  healing, so added incoming damage hits them before it hits naive. Rejected.
- **Raw PA up instead of HP.** Same failure mode: it shortens fights, removing the slack
  that lets a prepped kit matter, so it punishes engagement before neglect. Per-unit HP
  measured as the lever that inverts to the wanted order (`"*" hp +100%` control: naive
  0/16, default 2/16, optimizer 14/16). Rejected in favor of raw HP.
