# Slice — retuning the five campaign foes for a six-member deployment

ADR-0044 put all six party members on every map. The campaign stopped being demanding:
every persona cleared 16/16 and the naive party finished battle 1 at 100% HP. This is the
measurement record for the retune. **Every number below was measured**, with
`coverage/sweep.mts` (scratch, not shipped): three personas × 16 seeds plus the headless
zero-prep `runCampaign`, run against overridden foe raw stats and overridden placements.

## Baseline — six deployed, foes untouched (16 seeds)

| persona | cleared | stops | player HP% per battle |
| --- | --- | --- | --- |
| naive | 16/16 | — | 99 / 98 / 85 / 85 / 70 |
| default | 16/16 | — | 99 / 98 / 93 / 82 / 52 |
| optimizer | 16/16 | — | 99 / 98 / 84 / 78 / 43 |

headless zero-prep `vvvvv`, survivors 6/6/6/5/5, turns 10/13/16/30/37. Foes per battle 1/2/3/3/3.

## What the sweep actually found (and it is not what the brief assumed)

1. **The naive party out-*survives* the engaged ones.** Naive ends every fight at higher
   HP than `optimizer` because the two Priests keep casting Cure; `default` and
   `optimizer` buy a Warhammer and Wave Fist for them, so the probe AI swings instead of
   healing. Turns go *down* and HP at the end goes *down* with prep.
   Consequence: **raising incoming damage — more bodies, more PA — punishes the engaged
   personas first.** Measured: at foes 3/4/5/5/5 with untouched stats, naive cleared 13/16
   while `default` and `optimizer` cleared 3/16.
2. **Per-unit HP is the discriminator; body count is not.** With `"*" hp +100%` the order
   inverts to the wanted one (naive 0/16, default 2/16, optimizer 14/16) because the fight
   becomes long and damage output decides it. Adding equal total HP as extra bodies does
   the opposite.
3. **The Hexer is a hard counter to the prepped party.** Keeping a Hexer in the finale
   collapses the optimizer: `warchief + hexer + marauder ×2` scored naive 1 / default 8 /
   **optimizer 4**. The same fight with the Hexer swapped for a Cutthroat scored naive 0 /
   default 1 / **optimizer 16**. The Hexer stays where it reads as content — the Hollow
   Watch — and is out of the finale.

## Sweep grid (16 seeds each; cleared counts + headless profile)

Foe HP is *raw*. "counts" is foes per battle b1–b5.

| candidate | counts | naive | default | optimizer | headless |
| --- | --- | --- | --- | --- | --- |
| baseline | 1/2/3/3/3 | 16 | 16 | 16 | vvvvv |
| stats untouched, more bodies | 3/4/5/5/5 | 13 | 3 | 3 | vvvvv |
| stats untouched, more bodies | 3/4/5/5/3 | 16 | 16 | 16 | vvvvv |
| `"*" hp +50%` | 1/2/3/3/3 | 13 | 14 | 16 | — |
| `"*" hp +100%` | 1/2/3/3/3 | 0 | 2 | 14 | vvvvd |
| band-ceiling HP (225/300/240/300/675) | 1/2/3/3/3 | 16 | 16 | 16 | vvvvv |
| band-ceiling HP | 3/4/5/5/3 | 16 | 16 | 15 | vvvvv |
| band-ceiling HP | 3/4/5/5/4 (+brigand) | 16 | 3 | 15 | vvvvv |
| band-ceiling HP | 3/4/5/5/5 (+brigand,+cutthroat) | 16 | 3 | 5 | vvvvv |
| band HP, b5 = wc+mar+cut, no hexer | 3/4/5/5/3 | 16 | 16 | 16 | vvvvv |
| band HP, b5 = wc+mar×2+cut | 3/4/5/5/4 | 0 | 1 | 11 | vvvvd |
| …same, cutthroat 270 | 3/4/5/5/4 | 0 | 1 | **16** | vvvvd |
| …same, cutthroat 240 | 3/4/5/5/4 | 0 | 1 | 16 | vvvvd |
| …same, b1 back to 2 foes | 2/4/5/5/4 | 0 | 1 | 16 | vvvvd |
| b5 = wc+hexer+mar×2 | 2/4/5/5/4 | 1 | 8 | 4 | vvvvd |
| b5 = wc+hexer+cut+mar×2 | 2/4/5/5/5 | 1 | 0 | 2 | vvvvd |
| b5 = wc+brigand+mar×2 | 3/4/5/5/4 | 6 | 16 | 15 | vvvvd |
| b5 = wc+brigand+mar+cut | 3/4/5/5/4 | 16 | 16 | 16 | vvvvv |

## Chosen numbers

Foe raw HP (nothing else moved — no PA, speed, MA or MP change):

| foe | raw HP before | raw HP after | built maxHp | committed actions | TTK class |
| --- | --- | --- | --- | --- | --- |
| Brigand | 150 | **210** | 252 | 3 | `mid` (2–3) — **reclassed**, see below |
| Cutthroat | 216 | **270** | 243 | 3 | `mid` (2–3) |
| Hexer | 192 | **225** | 168 | 2 | `squishy` (1–2) |
| Marauder | 255 | **285** | 342 | 4 | `tank` (3–4) |
| Warchief | 469 | **585** | 702 | 8 | `boss` (6–9) |

Placements (the east half of each map, on painted-legal, `passable` tiles, clear of every
prop):

| battle | before | after |
| --- | --- | --- |
| b1 The Toll Road | brigand ×1 | brigand ×2 — `red-brigand-2` @ (6,1) |
| b2 Ambush at the Ford | brigand ×2 | brigand ×4 — `red-brigand-3` @ (8,0), `red-brigand-4` @ (8,4) |
| b3 The Hollow Watch | brigand, cutthroat, hexer | + `red-brigand-2` @ (8,1), `red-cutthroat-2` @ (8,5) |
| b4 The Broken Span | marauder, brigand, cutthroat | + `red-brigand-2` @ (9,2), `red-cutthroat-2` @ (9,4) |
| b5 The Warchief's Camp | warchief, brigand, hexer | warchief, `red-marauder-1` @ (10,1), `red-cutthroat-1` @ (10,4), `red-marauder-2` @ (9,2) — brigand and hexer removed |

b4's added tiles (9,2) and (9,4) are deck (`passable: true`) in the encounter's own tile
array, not painted water or gap. No new tile is a pillar/tree/boulder prop square.

### The reclass

`foe-brigand` moves from `squishy` to `mid` in `src/sim/ttk.test.ts`'s `CAMPAIGN_CLASS`.
The Brigand is a Knight. At 150 raw he was a one-at-a-time speed bump; fielded two-to-five
per map against six he is the campaign's rank-and-file line infantry, which is what `mid`
names. 252 built sits **below** the mid ceiling of 270, so the row keeps headroom and can
still fail. This is the one reclass; every other class row is unchanged.

## Result at the chosen numbers (16 seeds)

| persona | cleared | stops | player HP% per battle | seeds (W/L, offsets 0–15) |
| --- | --- | --- | --- | --- |
| naive | 0/16 | all at b5 | 81 / 52 / 63 / 77 / 0 | `LLLLLLLLLLLLLLLL` |
| default | 1/16 | 15 at b5 | 82 / 61 / 55 / 52 / 1 | `LLLLLLLLLLLLLWLL` |
| optimizer | 16/16 | — | 82 / 58 / 54 / 78 / 41 | `WWWWWWWWWWWWWWWW` |

headless zero-prep: `vvvvd`, `gameOver` at b5, survivors 5/3/4/5/0, turns 20/31/34/38/46
(strictly increasing). Foes per battle 2/4/5/5/4.

Target profile, measured:

| line | target | measured |
| --- | --- | --- |
| optimizer clears (offsets 0–3) | 4/4 | 4/4 |
| naive clears (offsets 0–3) | ≤ 1/4 | 0/4 |
| naive's losses are at the FINALE only | yes | all 16 stop at b5, b1–b4 all victories |
| optimizer cleared > default cleared | yes | 4 > 0 (16 > 1 at 16 seeds) |
| headless outcome profile | v,v,v,v,d + gameOver@b5 | v,v,v,v,d + gameOver@b5 |
| turns strictly increasing | yes | 20 → 31 → 34 → 38 → 46 |
| a WON battle kills party members | yes | b2 survivors 3/6, b4 5/6 |
| b1–b4 cost the naive party real HP, still winnable | yes | 81 / 52 / 63 / 77, all won |

## Plateau, not knife-edge

Each foe's HP perturbed ±10% from the chosen value, everything else held (16 seeds):

| neighbour | naive | default | optimizer | optimizer at offsets 0–3 | headless |
| --- | --- | --- | --- | --- | --- |
| **chosen** | 0 | 1 | 16 | 4/4 | vvvvd |
| brigand 189 (−10%) | 0 | 1 | 16 | 4/4 | vvvvd |
| brigand 231 (+10%) | 0 | 1 | 11 | 3/4 | vvvvd |
| cutthroat 243 (−10%) | 0 | 1 | 16 | 4/4 | vvvvd |
| cutthroat 297 (+10%) | 0 | 1 | 14 | 4/4 | vvvvd |
| hexer 202 (−10%) | 0 | 1 | 16 | 4/4 | vvvvd |
| hexer 248 (+10%) | 0 | 1 | 12 | 3/4 | vvvvd |
| marauder 256 (−10%) | 0 | **15** | 14 | 4/4 | vvvvd |
| marauder 300 (+5%, tank ceiling) | 0 | 1 | 16 | 4/4 | vvvvd |
| marauder 314 (+10%) | 0 | 0 | 10 | 2/4 | vvvvd |
| warchief 526 (−10%) | 0 | 3 | 16 | 4/4 | vvvvd |
| warchief 644 (+10%) | 0 | 1 | 16 | 4/4 | vvvvd |

Body count ±1 (16 seeds):

| neighbour | naive | default | optimizer | headless |
| --- | --- | --- | --- | --- |
| b5 − 1 foe (drop `red-marauder-2`) | 16 | 16 | 16 | vvvvv |
| b5 + 1 foe (brigand @ 10,5) | 0 | 0 | 9 | vvvvd |
| b1 + 1 foe (brigand @ 6,3) | 0 | 1 | 10 | vvvvd |
| b4 − 1 foe (drop `red-cutthroat-2`) | 0 | 1 | 16 | vvvvd |

**Read honestly:**

- The *naive-loses* half is a wide plateau. Naive is 0/16 and the headless profile is
  `vvvvd` in **every one of the fifteen** neighbours except "b5 − 1 foe".
- The *optimizer-clears* half has a real but **asymmetric** margin. It is flat across
  warchief ±10%, cutthroat ±10%, marauder 285→300 and b4 −1 foe; it degrades on the
  upward side of brigand, hexer and marauder HP, and on b1/b5 +1 body. The chosen point is
  on the flat side of each of those, not on the edge.
- **The finale's body count is a one-step cliff and cannot be made a plateau.** Four
  bodies is the answer; three lets everyone win, five collapses the optimizer to 9/16.
  Count is discrete, so this is a property of the lever rather than a calibration
  artefact — but it means a future encounter edit that adds or drops a b5 unit will move
  the outcome profile, and should re-run this sweep.
- The low edge of the marauder's HP plateau is a **cliff, not "the −10% neighbour"** —
  bisected (16 seeds, absolute HP, everything else held): 270 → default **14/16**,
  optimizer 12/16; 278 → default **1/16**, optimizer 16/16; 282 → default 1/16, optimizer
  16/16. `default` breaks "optimizer > default" somewhere in **270–278**, not at a smooth
  −10%. The usable range for this lever is **~278–300**; the chosen 285 sits inside it,
  clear of the cliff at 270 and the tank-class ceiling at 300.

## Tests re-armed

All four previously-parked tests now run, and each was proved red against the pre-retune
data (`git stash` of `data/campaign/` only, then run, then unstash):

| test | file | red-on-old-data message |
| --- | --- | --- |
| the unprepped party wins every battle but the finale | `src/sim/campaign-run.test.ts` | expected `[v,v,v,v,v]` to equal `[v,v,v,v,d]` |
| the campaign actually KILLS party members | `src/sim/campaign-run.test.ts` | expected `['b4','b5']` to include `'b2'` |
| separates on WINNING | `src/render/playtest.test.ts` | expected 4 to be less than or equal to 1 |
| spending at HOME wins where spending cheapest-anywhere does not | `src/render/playtest.test.ts` | expected 4 to be greater than 4 |

The KILLS test was rewritten, not merely un-skipped. Its old `< 4` threshold was written
for a four-member party; with six it reads `< 6`. It also now **excludes the finale**: the
unprepped run wipes at b5, so a flat `some` over every battle would pass on a campaign
whose only casualties were the wipe that ended it. The discriminating fixture is a battle
the party **won** that still cost it bodies, and the battle is named (`b2`) so a retune
that moves the attrition elsewhere is a visible change rather than a silent green.

## Campaign length

Headless zero-prep turns went from 10/13/16/30/37 (106 total) before the retune to
20/31/34/38/46 (169 total) after — **+60%**. `docs/11-whole-game-and-mvp.md` names a
30–45 minute session as the MVP's definition of done, and **nothing in this slice
measures minutes** — only sim turns. A turn is not a fixed amount of wall-clock time, and
AI turns still need an explicit tap (Step) until the self-running enemy-turn slice lands,
so real session length is unmeasured and open. Flag this as an open risk, not a result:
the retune could plausibly push a real playtest past the 45-minute upper bound and nothing
here would have caught it.

## Tension with docs/06 AC-E5

`docs/06` AC-E5: "raising a difficulty tier SHALL first change AI behavior/threat budget;
raw stat multipliers SHALL be a bounded, secondary lever." This slice's HP changes are
**+12% to +40%** per foe (brigand +40%, cutthroat +25%, hexer +17%, marauder +12%,
warchief +25%, all computed raw-HP before→after) and are the **primary** separator
between personas here, not a secondary
one — because body count and PA raises punish the prepped personas first (finding #1
above: `default`/`optimizer` swing weapons instead of healing, so more bodies and more PA
hurt them before it hurts naive). The bound this slice actually respects is `docs/07`
AC-P6's per-foe-class TTK band, not AC-E5's "secondary lever" framing. This is a
**recorded tension, not a resolution** — an ADR should own whether AC-E5 needs an
amendment or whether this slice is itself the bounded-secondary-lever case it describes.

## Out-of-sample optimizer number and the ADR-0027 `default` shift

At 32 seeds (offsets 0–31, everything else the chosen numbers), the optimizer clears
**30/32**, losing offsets 23 (stops at b5) and 27 (stops at b3). The 4/4 asserted on
offsets 0–3 is a seed-window fact, not a 100%-clear claim.

ADR-0027 measured `default` (cheapest-live-node-anywhere) at **8/16** and called it a
"learnable trap" — engaging casually clears half the time, distinct from both naive (a
floor) and optimizer (a ceiling). At the chosen retune numbers, `default` is **1/16** —
statistically indistinguishable from naive's 0/16. The "spending at HOME wins" test
(`playtest.test.ts`) can still show `optimizer > default`, but it can no longer show
"cheapest-anywhere is a *learnable trap*" versus "anything short of optimal loses" — the
three-tier story ADR-0027 told has collapsed to two tiers at these numbers. Recording this
here for the ADR to own: either ADR-0027 gets an amendment noting the trap narrowed to
the point of near-disappearance, or a future retune should re-open headroom for `default`
to land back in a distinguishable middle band.
