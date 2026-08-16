# Slice plan — make authored effects real (`power` + `inflicts`)

**Status: COMPLETE (2026-08-16).** Steps 1, 2 and 5 shipped in `32d6cdc`; Steps 3–4 shipped in
the follow-up control slice (ADR-0018) — the probe values control, Charm has behaviour,
`bld-cutpurse` is the seventh identity and `DIVERSITY_TARGET_N` is 7. Two things the plan
below did NOT predict: Step 3 changed **zero** shipped runs on its own (magnitude is only
the comparator's SECOND key), and Charm behaviour required a **victory-condition** change
to avoid a livelock. Written against `6b4b887` (main).
Source of the slice: `docs/NEXT.md` § "The next slice", **redirected by the decisions in §0**.

---

## 0. Decisions taken (2026-08-16)

1. The `power` defect fix is **in this slice**, not split out.
2. **`battle-skill` is excluded.** The break/debuff vocabulary reads as thin, and a
   multi-job skill rework is wanted later. This slice leaves it deferred, with a named
   blocker, and builds the foundation that rework will need.
3. **`steal` is fixed instead** — but see 5.
4. **Fork A**: the balance probe learns to value control, rather than the steal line being
   given damage (§2).
5. **The slice is CUT after Step 2.** This slice ships **Steps 1, 2 and 5** — a pure
   defect-fix that claims nothing new. **Steps 3 and 4** (the AI comparator, Charm, the
   Thief build, the variety-target bump) become the *next* slice.

`docs/NEXT.md`'s "make `battle-skill` live" slice is therefore **superseded**, not merely
re-ordered. That file must be re-stamped as part of this slice's retrospective, and must
carry Steps 3–4 forward as the next slice.

### What this slice does and does not deliver

- **Does:** five inert abilities across four skillsets start working; six dead `power`
  values become real tuning levers; the test gap that let two whole skillsets ship inert
  closes; a false claim in `data/README.md` is corrected.
- **Does not:** move the variety score. It stays at 6. The count moves in the *next* slice,
  when the Thief lands. Nothing here should be reported as progress toward ≥ 8.

---

## 1. What was measured this session

### 1a. `power` is DEAD on every instant single-target physical ability

`driver.ts:450` routes a single-target instant with `formula: "physical"` to `resolveAttack`,
which takes **no ability argument** — it deals a plain weapon swing.
The authored `power` is never read.
`ai.ts` `estMagnitude` mirrors the same routing, so the AI and the driver agree; there is
no drift, just a dead field on both sides.

A/B through the full diversity gauntlet (6 maps × 2 oppositions = 12 runs per build),
mutating only the content pack:

| mutation | build | runs that changed |
|---|---|---|
| **control** — all `geomancy.*` power → 1 | `bld-terrain-geo` | **12 / 12** |
| all single-target `aim.*` power → 1 | `bld-longshot` | 0 / 12 |
| all single-target `aim.*` power → 99 | `bld-longshot` | 0 / 12 |
| `punch-art.wave-fist` power → 99 | `bld-faithzero-monk` | 0 / 12 |
| all `punch-art.*` physical power → 1 | `bld-faithzero-monk` | 0 / 12 |

The magic control changes every run, so the probe can come out the other way.
The physical cases change nothing at power 1 *or* 99.

Six shipped abilities carry a `power` that does nothing: `punch-art.wave-fist` (14),
`punch-art.earth-slash` (14), `aim.aimed-shot` (12), `aim.piercing-shot` (16),
`aim.head-shot` (13), `aim.leg-shot` (9).
All deal exactly the wearer's basic-attack damage.
For `bld-aggro-tank` that is **90**, not the 157 `docs/NEXT.md` quotes — 157 is
`abilityDamage()`'s number, which the driver never calls on this path.

Consequence: the archer's `aim.` identity is **range only**, and the monk's `punch-art.`
identity is **range and Martial Arts only**.

*(Unmeasured: the AoE physical path (`aim.volley`) reads `power` on a code-read of
`resolveAbilityAoe`, but no shipped build learns `volley`, so no run exercises it.)*

### 1b. Nothing applies `inflicts` — and this is wider than `steal`

`docs/05` §2 step d already specifies it ("apply status w/ CT-based duration"), and
`build.ts` projects the field, and `content.ts` checks referential integrity.
**No resolver reads it.** `charge.ts:74` states the deferral outright. `applyStatusToUnit`
works, but its only callers are tests.

Five shipped abilities across four skillsets are inert because of this one gap:

| ability | inflicts | currently |
|---|---|---|
| `aim.head-shot` | `status.stop` | nothing |
| `aim.leg-shot` | `status.slow` | nothing |
| `geomancy.quicksand` | `status.slow` | nothing |
| `white-magic.protect` | `status.protect` | nothing |
| `steal.heart` | `status.charm` | nothing |

**`data/README.md:63` is wrong.** It states `steal.heart`'s charm "*is* wired via
`inflicts: [status.charm]`". It is authored, not wired. Correcting that line is part of
this slice — an unasserted prose claim that reads as a working capability is the exact
failure mode `CLAUDE.md`'s evidence principle names.

### 1c. There is no Thief build

No shipped record has `currentJob: "thief"`.
Three builds learn `steal.gil` as a secondary (`bld-longshot`, `bld-terrain-geo`,
`bld-arcane-artillery`) and all three have strong own-prefix identities that should mask it.

**So making `steal` live raises the variety score only if a Thief build is authored too.**
That is content work this slice must include, not a follow-up.

### 1d. Most of `steal` depends on subsystems that do not exist

| ability | needs | in reach? |
|---|---|---|
| `steal.gil` | post-battle economy (`docs/07`) | no |
| `steal.armor` / `.helmet` / `.weapon` | the equipment modifier layer (`docs/05` §4, deferred) | no |
| `steal.heart` | on-hit inflict + Charm behaviour | **yes** |

Only `steal.heart` is reachable without opening a new subsystem.
`status.charm` already exists in the pack (`ctFactor: 1`, `durationCT: 32`, dispellable),
but nothing implements "the enemy controls it" (`docs/01` §8).

### 1e. The "every job donates a live action" test only covers P2 jobs

`content-pack.test.ts:65` asserts priest / archer / geomancer / summoner each donate a
live-formula action. Knight, monk, wizard and thief are not covered — which is why
`battle-skill` and `steal` could both ship fully inert with a green suite.

---

## 2. The honest problem with "fix steal"

A control action has **magnitude 0**, and `ai.ts:127` skips every `none`-formula ability.
So Charm — and Stop, and Slow — are invisible to the balance probe **no matter what they
inflict**.

That means a Thief cannot signature on `steal.` by control alone. There are two ways out,
and this is the one real fork in the slice:

- **(A) Teach the probe to value control.** The AI scores an inflicted status alongside
  damage. This is the faithful answer — `docs/01` §8 says statuses "swing battles more than
  raw damage" — and it is the same capability the future `battle-skill` rework needs. It is
  also an `ai.ts` change, which moves every benchmark number and the frozen golden.
- **(B) Give the steal line damage as well as control.** Cheaper, keeps the probe untouched,
  but it makes the Thief a worse Knight and does not serve the later rework.

**CHOSEN: (A)** (§0.4). It buys a mechanic rather than a number; (B) is the pattern
`CLAUDE.md` calls calibrating to the metric. It lands in the **next** slice, per §0.5.

---

## 3. The work

**Steps 1, 2 and 5 are THIS slice. Steps 3 and 4 are the next one** (§0.5).

### Step 1 — make `power` live on single-target instant physical actions

Route a single-target instant physical **ability** through `resolveAbility`; keep the
weapon-derived `basic.attack` on `resolveAttack` (`state.ts` `basicAttackFrom` makes that
split structural, not a name check). Move `estMagnitude` in lockstep or the AI and driver
diverge.

Behaviour change: the frozen golden and every benchmark number move, and the six abilities
above get roughly 1.3×–2× stronger. Re-tune their `power` against the `docs/07` TTK band
(`ttk.test.ts`, AC-P6) in the same step.

**Proof that it is fixed:** the A/B in §1a, inverted — the same power mutations must now
change runs, with the magic control still changing runs.

### Step 2 — implement the on-hit inflict path

`docs/05` §2 step d, already specified. Apply `BattleAbility.inflicts` on a landed hit in
`resolve.ts` (single-target and AoE) and `charge.ts` (matured charge), via the existing
`applyStatusToUnit`. Statuses are already self-contained (ADR-0011), so no registry read.

Roll order is a determinism concern: the inflict check is a new roll and must take a
declared position in `docs/05` §3's order. If infliction is unconditional on hit, say so
explicitly rather than leaving it implied.

This lights up all five abilities in §1b, so `aim.head-shot` starts landing Stop — a large
swing. Expect the archer's numbers to move independently of Step 1.

### Step 5 — make the gap unrepeatable *(this slice)* — DONE

Delivered as `DEFERRED_SKILLSETS` in `content.ts`, asserted as an EXACT partition by
`content-pack.test.ts` (verified to fail on a stale entry, not just a missing one), and
surfaced in the prep panel: a command from a deferred skillset renders dimmed and tagged
"no effect yet" instead of sitting beside Attack as an equal option.

Original plan text follows.



Widen `content-pack.test.ts:65` from the four P2 jobs to all eight.
**Both `battle-skill` and `steal` will fail it**, which is correct — both are inert today,
and neither is fixed in this slice. Add both to an explicit deferred manifest with named
blockers, mirroring `DEFERRED_SUPPORT_EFFECTS`:

- `battle-skill` — "break/debuff vocabulary pending the multi-job skill rework" (§0.2).
- `steal` — "no live action reachable: gil needs the economy layer, armor/helmet/weapon need
  the equipment layer, heart needs Charm behaviour + a probe that values control" (§1d).

The manifest is what keeps those two exclusions honest instead of silent, and the widened
test is what stops a third skillset shipping inert.

Also in this slice: correct `data/README.md:63`'s false claim that `steal.heart`'s charm
"*is* wired" (§1b).

---

## 4. The NEXT slice (not this one)

### Step 3 — teach the balance probe to value control (fork A)

Fold an inflicted-status term into `ai.ts`'s **single uniform, transitive** comparator
(`src/sim/CLAUDE.md`: never a bucket-first key). A `none`-formula action with a real
`inflicts` must become selectable; a `none`-formula action with nothing must stay skipped.

### Step 4 — make `steal` a live skillset and author a Thief

- Wire Charm behaviour (`docs/01` §8: the inflicter controls the target for the duration).
- Author `bld-<thief>` as a real archetype whose signature action is `steal.heart`, with its
  own-prefix identity un-masked (`src/sim/CLAUDE.md`'s masking rule) and asserted by id, not
  just by prefix.
- Add the build to the `MEASURABLE` manifest and bump `DIVERSITY_TARGET_N` 6 → 7. Per
  `CLAUDE.md`, that bump moves the `gauntlet.ts` manifest, an ADR-0014 amendment,
  **`docs/06` AC-E2 (authoritative)**, and a regenerated `npm run state` — all together.
- `steal.gil` / `.armor` / `.helmet` / `.weapon` stay deferred with their named blockers
  (economy, equipment layer), and their Step-5 manifest entry narrows accordingly.

**Cost of the cut:** one extra golden regeneration, because Steps 1–2 and Step 3 each move
the frozen golden and every benchmark number. That is the price of two reviewable diffs
instead of one unreviewable one, against a gate with zero slack at 6.

## 5. Landmines

1. **Zero slack at N=6.** Measure the gate before and after every step, not just at the end.
2. **Perturb the baseline too.** Before attributing any count change to this slice, confirm
   the pre-change count is stable under a small perturbation — it was not, twice before.
3. **Don't read a number off a non-monotonic sweep.** Jittery counts during the re-tune mean
   a discontinuity, not a best step. Find the plateau.
4. **Stop is enormous.** `aim.head-shot` landing `status.stop` (CT frozen, 20 CT) may make
   `bld-longshot` dominant, which fails the gate on the *other* side. Watch B5.
5. **Charm needs a team-control model.** A charmed unit acting for the enemy touches the
   scheduler's team logic and every victory condition. Check `docs/05` before assuming it is
   an AI-only change.
6. **`aim.*` and `punch-art.*` power edits are global.** Grep `data/builds` and
   `data/encounters` before changing any of the six.
7. **Browser tests are not in `npm run check`.** Run `npm run test:visual`.
