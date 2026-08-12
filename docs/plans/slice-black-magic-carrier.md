# Slice plan — give black magic a viable carrier

**Status: proposed, awaiting green-light.** Written against `1c812b4` (main).
Source of the slice: `docs/NEXT.md` § "The next slice".

---

## 1. What was measured

Baseline: variety score **5** (`distinctMeasurableArchetypes`), release bar 8, `pass=true`.
The one missing identity is `black-magic.`. Its two carriers:

| build | phys maps in band | signature landed | HP | best spell |
|---|---|---|---|---|
| `bld-arcane-artillery` | 1/6 | 1 | 144 | `black-magic.fire-2` 130 dmg, r5, 3-tick charge |
| `bld-spellblade` | 1/6 | 0 (masked) | 234 | its own 90-dmg knight swing |

### The handoff's diagnosis was wrong

`docs/NEXT.md` said the wizard "needs **four casts** to drop a body that kills it in **two**"
— arithmetic, not a traced run. Tracing `skirmish-a` shows something else:

```
t13  cand move 1,0 ; charge declared
t17  charge ... aoe whiff          <- target tile vacated
t25  charge declared
t29  charge ... aoe 2 hit / 0 ko
t35  charge declared
t38  opp-2 KO cand
t39  charge ... cancelled          <- died mid-charge
```

Across the 6 reference maps the wizard declares **17 charges**: 8 land, 4 whiff, **5 are
cancelled by its own death**. The comparison that discriminates is the summoner, which is
*squishier* (134 HP) and charges *slower* (10 ticks vs 3) yet is viable on 5/6 maps — it
declares 17 charges and loses only **2** to cancellation, because range 6 keeps it out of
reach while range 5 does not.

**Mechanism: the wizard is the lowest-HP unit on its team, the enemy probe focuses lowest
effective HP, and it dies before its charge matures.**

### The deeper cause

`bld-arcane-artillery` equips `black-magic.magic-attack-up` in its support slot. **Support
abilities are inert** — `build.ts` projects action abilities only; reaction, support and
movement slots are validated and then ignored. Every shipped build carries at least one
dead slot:

| slot | builds using it | status |
|---|---|---|
| support | 9 of 14 | inert |
| reaction | 8 of 14 | inert |
| movement | 10 of 14 | inert |

The locked customization spine (`CLAUDE.md`, `docs/02` §2) is the **5-slot ability
chassis**. Three of the five slots do nothing. The wizard is not under-tuned; its authored
build has never been delivered.

---

## 2. Options measured

Each was run through the full gauntlet and then **perturbed by a global HP scale of
±10–15 %**, the robustness protocol from the TTK slice (`ADR-0016`). A fix that only works
at one HP scale is a knife-edge, not a mechanism.

`arcN` = maps in band for the wizard, `*` = wizard has no losing matchup (the
anti-convergence warning signal), `N` = variety score.

| HP scale | 0.90 | 0.95 | **1.00** | 1.05 | 1.10 | 1.15 |
|---|---|---|---|---|---|---|
| **baseline (no fix)** | N6/arc5 | N6/arc5 | **N5/arc1** | N5/arc1 | N5/arc1 | N6/arc6 |
| **A. black magic charge 25/33 → 50** | N6/arc6 | N6/arc6 | **N6/arc6** | N6/arc6 | N6/arc6 | N6/arc6 |
| **B. wire the support slot (MA-up ×1.33)** | N6/arc5 | N6/arc5 | **N6/arc5** | N6/arc5 | N6/arc5 | — |
| **C. wizard HP 192 → 264 raw** | N6/arc5 | N6/arc6 | **N6/arc6** | N6/arc6 | N6/arc6\* | N6/arc6\* |

Readings:

- **The baseline is a knife-edge.** N reads 6, 6, 5, 5, 5, 6 across adjacent HP scales.
  The wizard is not stably sub-viable — it is sitting on a discontinuity, which is why the
  handoff's arithmetic and the measured behaviour disagree.
- **A and B are plateaus.** Flat across the whole perturbation band.
- **C converges.** At +10 % and above the wizard enters `noLosingMatchup` — a build with
  nothing to lose to, which is what `docs/02` B5 exists to prevent. Rejected.
- A **rejected sub-option**: `black-magic` range h4/h5 → h5 lifts the count to 6 through
  `bld-spellblade` (4 maps in band, signature landed on exactly 1). That clears the gate's
  `≥ 1 signature` floor while the build still fights as a knight on 3 of its 4 clears. It
  is the gate's deliberate interim-floor insensitivity being exploited, not a fixed build.
  Rejected.
- **Calibration warning recorded:** the charge-speed sweep flips between speed 34 and 40,
  both of which resolve in 3 ticks. That flip is the scheduler's `higher ct first`
  tie-break (`ct 102` loses to a unit at `104`; `ct 120` wins), not a mechanism. Do not
  calibrate any charge constant near it. Option A's plateau starts at speed 50, where the
  charge genuinely drops to **2** ticks.

---

## 3. Recommendation — Option B, wire the support slot

Option A is one line of data and gets a slightly better number. Option B is the right
change:

1. It fixes the **cause** (a dead slot) rather than compensating for it with a global
   magnitude buff.
2. It advances the locked spine — P2 is "customization depth", and the support slot is
   one third of the chassis.
3. It is **local to the builds that equip the ability**, so `black-magic.*` is untouched
   globally and `bld-glass-summoner` (which carries `black-magic.fire` as a secondary)
   cannot be masked by it.
4. It needs no fidelity edit. Option A would require changing `docs/01` §3's
   "Fire ≈ Speed 25", a number the doc itself marks as an unverified placeholder — a
   change I cannot verify from this sandbox.

### Scope

**In:** a support-effect layer, mirroring the existing trait layer (`trait.ts`, applied in
`build.ts` as growth → trait → clamp). Effects are authored as **data on the ability**, not
as tag string-matching. Implement the effects expressible with currently-modeled stats:

| ability | tag | effect | equipped by |
|---|---|---|---|
| `black-magic.magic-attack-up` | `magic-attack-up` | `ma ×1.33` | arcane-artillery, reraise-cleric, spellblade |
| `punch-art.martial-arts` | `brawl-up` | `pa ×1.25` | faithzero-monk, battle-cleric |
| `summon.short-charge` | `charge-time-down` | ability `speed ×2` | nobody yet |
| `aim.eagle-eye` | `range-up` | ability `range.h +1` | nobody yet |

**Out (deferred with a named blocker, the `EXCLUDED` pattern):**

| ability | blocker |
|---|---|
| `battle-skill.equip-heavy-armor` | equipment is not modeled (`docs/05` §4) |
| `aim.concentrate` (`ignore-evasion`) | needs a resolve-layer flag on the unit |
| `summon.arcane-focus` (`summon-damage-up`) | needs per-skillset scaling; `BattleAbility` carries no skillset |

Reaction and movement slots stay inert this slice — they are separate mechanics
(`bld-counter-wall` is already `EXCLUDED` on "reaction-as-live modeling").

### Measured consequences

- Variety score **5 → 6**. Sixth identity `black-magic.`, carried by
  `bld-arcane-artillery` at 5/6 maps with its signature landed on all 5.
- `bld-reraise-cleric` 4/6 → 6/6 (its `holy` gains the same MA).
- `bld-faithzero-monk` and `bld-battle-cleric` gain `pa ×1.25`; the monk stays 6/6 and
  **does not** become dominant. `dominantBuilds` stays empty at every HP scale tested.
- `bld-spellblade` stays masked (37 → ~49 borrowed damage vs its own 90 swing), so the
  positive assertion pinning that defect in `ttk.test.ts` still holds unchanged.

### Numbers, and why they are not tuned to the gate

`ma ×1.33` is FFT's Magic Attack UP (+~33 % magic damage) `[UNCERTAIN — verify vs BMG]`.
At `×1.20` the fix collapses at +10 % HP (variety back to 5); at `×1.33` it holds flat
across the band. The plateau is the evidence, not the score.

---

## 4. Work items

1. `ability.ts` — a `SupportEffect` schema (stat multipliers + ability-speed / range
   modifiers), optional on `Ability`; content-pack schema version bump + migration.
2. `data/base-pack.json` — author the four effects above; leave the deferred three
   effect-less with a comment naming the blocker.
3. `build.ts` — apply the support layer in the declared order
   **growth → trait → support → final clamp**, then the ability projection applies the
   ability-side modifiers. The final clamp must stay last (`src/sim/CLAUDE.md`).
4. Tests: a support-layer unit test (fold, order-independence, clamp, serialize
   round-trip); a **discriminating** test that an inert support and a live one give
   different built units; an AC test that every authored support tag either has an effect
   or is on the deferred list with a blocker.
5. `benchmark-suite.test.ts` — restore `black-magic` to the required-skillsets list (the
   known gap noted there).
6. N-bump, all in this slice: `DIVERSITY_TARGET_N` 5 → 6, `docs/06` AC-E2 (authoritative),
   an ADR-0014 amendment, `npm run state` regenerated.
7. A new ADR recording the support-slot decision and the deferred-effect list.
8. `docs/02` — record that the support slot is live and which effects are deferred.
9. `npm run check` + `npm run test:visual` (the browser tests are not in `check`).
10. Retrospective + rewrite `docs/NEXT.md`, re-stamped.

### Risks

- **Blast radius is every build with a support ability**, not just the wizard. Mitigated by
  measuring the whole gate at ±10 % HP before and after, and by the dominance ban.
- **The frozen golden in `driver.test.ts`** may move: this is a behaviour change, so if it
  moves, that must be explained by a golden vector, not regenerated to make a test pass.
- **The MP contingency is unchanged and still live** — `white-magic.holy` (56 MP off a
  24 budget) and the summons (14–30) still ride unenforced MP. This slice adds a third:
  `black-magic.fire-2` costs 12 MP off 24, so the wizard's identity survives MP enforcement
  better than the cleric's, but is not free of it.
