# ADR-0017 — The support slot gets real effects, and a dead slot is a defect class

- **Status:** Accepted
- **Date:** 2026-08-12
- **Supersedes / amends:** amends **ADR-0014** (diversity-gate phased target: `N` 5 → 6). Corrects the cause **ADR-0016** recorded for the missing `black-magic.` identity.
- **Owner docs:** `docs/02` §2, `docs/05` §4, `docs/06` AC-E2, `src/sim/CLAUDE.md`

## Context

`docs/NEXT.md` scoped this slice as *"give black magic a viable carrier"*, and ADR-0016 recorded the reason it needed one: `bld-arcane-artillery` is *"a 144-HP caster whose 81-damage spell needs four casts to drop a 315-HP tank that kills it in two."*

That reason was arithmetic. Nothing had traced a run. **The trace says something else.**

```
t13  cand    move 1,0 ; charge declared
t17  cand    charge … aoe whiff            the target tile was vacated
t25  cand    charge declared
t29  cand    charge … aoe 2 hit / 0 ko
t35  cand    charge declared
t38  opp-2   KO cand
t39  cand    charge … cancelled
```

Across the six reference maps the wizard declares **17 charges: 8 land, 4 whiff, and 5 are cancelled by its own death**. The comparison that discriminates is `bld-glass-summoner` — **squishier** (134 HP vs 144) and **three times slower to cast** (10 ticks vs 3) — which loses only **2** charges to cancellation and stays viable, because range 6 keeps it outside the enemy's move-and-strike envelope where range 5 does not.

So the wizard is not out-damaged. It is focus-fired and killed mid-charge. And the reason it cannot afford that is the one nobody had looked for:

**`build.ts` projected `action` abilities only.** The reaction, support and movement slots were validated at equip time by `loadout.ts` and then ignored. Nine of fourteen shipped builds equipped a support ability that did nothing — including `bld-arcane-artillery`, whose caster identity rides entirely on `black-magic.magic-attack-up`.

The **five-slot ability chassis is a locked decision** (`CLAUDE.md`, `docs/02` §2, ADR-0001) and it is the first axis of the customization spine. Three of its five slots were decorative. Any build leaning on one measured as under-tuned *content*, and would have kept doing so under any amount of magnitude tuning.

## Decision

**1. The equipped support slot applies real effects, authored as data on the ability.**

New `src/sim/support.ts` mirrors `trait.ts`: a `SupportEffectSchema`, two pure folds, and a deferred manifest. `AbilitySchema` gains an optional `supportEffect` — additive and optional exactly like `excludes`, so **`CONTENT_SCHEMA_VERSION` does not bump** and a pre-slice pack loads unchanged with its supports still inert.

**2. The layer sits at `growth → trait → support → final clamp`** (`docs/05` §4), in two halves that land in different places:

- **stat mods** (`pa`/`ma`/`maxHp`) fold onto the derived unit stats;
- **ability mods** (`chargeSpeed`, `abilityRange`) fold onto each projected `BattleAbility`, so they are baked into the serialized battle and a replay never re-reads the registry (the ADR-0010/ADR-0011 self-containment rule).

Traits and supports fold **sequentially, not together**: they are distinct sources in the `docs/05` §4 pipeline, and keeping them separate means a support's multiplier scales the *post*-mastery stat — what the player sees on the unit. A loadout holds at most one support, so there is no intra-layer ordering to be independent of.

**3. Implement only the effects expressible with currently-modeled stats; list the rest with a named blocker.**

| ability | effect | equipped by |
|---|---|---|
| `black-magic.magic-attack-up` | `ma ×1.33` | arcane-artillery, reraise-cleric, spellblade |
| `punch-art.martial-arts` | `pa ×1.25` | faithzero-monk, battle-cleric |
| `summon.short-charge` | ability `speed ×2` | nobody yet |
| `aim.eagle-eye` | ability `range.h +1` | nobody yet |

Deferred in `DEFERRED_SUPPORT_EFFECTS`, each with its blocker: `battle-skill.equip-heavy-armor` (equipment is not modeled), `steal.secret-hunt` (post-battle economy), `aim.concentrate` (ignore-evasion is a resolve-layer flag, not a build-time modifier), `summon.arcane-focus` (per-skillset scaling; `BattleAbility` carries no skillset). `support.test.ts` asserts this partitions the shipped pack **exactly**, so a newly authored support cannot ship silently inert — the defect this ADR exists to end.

**4. The speed ban survives intact (ADR-0012, AC-P5).** `SupportEffectSchema` has **no** `speed` key: no support may alter a *unit's* CT accrual. `chargeSpeed` is a different quantity — a **charged action's** own accrual rate, which `docs/01` §3 states is largely independent of caster Speed, and which is precisely why Short Charge exists as a support in FFT. The separation is structural (`.strict()` rejects an authored `speed`), not conventional.

**5. Ability mods apply to skills, never to `basic.attack`.** The basic attack derives from the equipped weapon, and equipment is still deferred — so a range-up support has nothing meaningful to widen there, and silently granting every support-carrying build a tile of *melee* reach would be a combat change nobody authored. Revisit when the equipment layer lands.

**6. `DIVERSITY_TARGET_N` = 6**, per ADR-0014's standing rule that the target is the honest observed count so the gate keeps detecting.

## Consequences

**The count.** 5 → 6. `black-magic.` counts for the first time since the fold, carried by `bld-arcane-artillery` at **5/6 phys maps with the signature landed on all five** (was 1/6). `bld-reraise-cleric` 4/6 → 6/6 (its `holy` gains the same MA). `dominantBuilds` stays empty and `noLosingMatchup` is unchanged, so no anti-convergence signal moved. `≥ 8` remains the release bar.

**Robustness — why 6 is trusted, and what the sweep revealed about the old number.** Under the ADR-0016 perturbation protocol the **pre-fix** baseline reads N = 6, 6, **5**, 5, 5, 6 at HP scales ×0.90 … ×1.15. The wizard was never stably sub-viable — it was straddling a discontinuity, which is exactly why the arithmetic diagnosis and the sim disagreed. With the layer it holds 5/6 flat across ×0.90 … ×1.10 and N stays 6. The `×1.33` multiplier is **on that plateau, not tuned to it**: at `×1.20` the fix collapses again at +10% HP; `×1.33` is FFT's own Magic Attack UP figure `[UNCERTAIN — verify vs BMG]`.

**Blast radius, measured.** The layer touches every build with an *effect-bearing* support — five of fourteen, not just the wizard. `bld-faithzero-monk` and `bld-battle-cleric` gain `pa ×1.25`; the monk stays 6/6 and does **not** become dominant. `bld-spellblade` gains the same MA and is **still masked** (borrowed black magic 43 vs its own 90 swing), so the positive assertion pinning that defect in `ttk.test.ts` passes unchanged and a spellblade chassis is still owed. The frozen golden in `driver.test.ts` **did not move** — the demo battle fields no support-carrying build — which is the evidence the change is contained to the builds that opt in.

**`enc-mixed-company` is now 3v3.** `bld-arcane-artillery` was not an occupant of **any** benchmark encounter, so `black-magic` could never have appeared in AC-E1's required-skillset list however the spellblade mask resolved — the recorded reason for that gap (the mask) was incomplete. The wizard is now fielded there and the skillset is required again. That encounter's play **shifts**; `benchmark-suite.test.ts` asserts self-consistency and replay-equality with no committed golden, so it stays green through the shift rather than catching it — the same disclosure ADR-0014 made for the summon range change.

**Zero slack.** All six expressible signature prefixes now count, so any regression fails the gate. The **MP contingency is unchanged and still live**: `white-magic.holy` (56 MP off 24) and `summon.*` (14–30 off 24) both ride unenforced MP. This slice adds a third carrier that is *less* exposed — `black-magic.fire-2` costs 12 off 24 — but does not remove the contingency.

## Rejected alternatives

Measured, with tables in `docs/plans/slice-black-magic-carrier.md`.

- **Raise the wizard's HP.** Works at the shipped scale, but above +10% HP the wizard enters `noLosingMatchup` — a build with nothing to lose to, the convergence failure `docs/02` B5 exists to prevent. It also un-glass-cannons a build whose whole fantasy is fragility.
- **Raise `black-magic` range.** Lifts the count to 6 through **`bld-spellblade`**, which is in band on 4 maps but lands its signature on exactly **one** of them and fights as a knight on the other three. That clears the gate's deliberate `≥ 1 signature` interim-floor insensitivity without fixing a build — evidence that cannot come out the other way.
- **Speed up `black-magic` charges globally.** Scores best (6/6) and holds across the perturbation, but needs a matching edit to `docs/01` §3's *"Fire ≈ Speed 25"*, a fidelity placeholder this environment cannot verify, and it erodes the dodgeable-charge counterplay the charge subsystem exists to provide. Kept as a live option if a future slice verifies the constant.

## Calibration warning, recorded

The charge-speed sweep **flips between ability speed 34 and 40**, both of which mature in **3 ticks**. That flip is the scheduler's `higher ct first` tie-break — a charge at `ct 102` loses to a unit at `ct 104`, while one at `ct 120` wins — **not a mechanism**. Do not calibrate any charge constant near it. The genuine boundary is at speed 50, where the charge drops to 2 ticks.

## The general lesson

**A slot that validates its input and then ignores it reads as working.** `loadout.ts` type-checked the support, rejected unlearned abilities, enforced the chassis rules — every signal a reviewer looks for said the slot was live. Nothing asserted that equipping a support *changed the built unit*, so nine builds shipped with a dead slot and the resulting weakness was attributed to content tuning for two slices running.

This is the evidence principle applied to a **capability** rather than a test: the equip-time validation would have looked identical whether or not the effect existed. The guard that can come out the other way is the A/B — build the same record with the slot filled and emptied, and assert they differ.
