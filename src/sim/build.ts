/**
 * The battle-start bridge (docs/05 §4, ADR-0011) — the ONE-WAY compile from a
 * persistent {@link UnitRecord} (roster.ts) into a battle-ready {@link UnitState}.
 * The {@link ContentRegistry} is read HERE, at build time, and NEVER again: the
 * resulting UnitState is self-contained, so a serialized/replayed battle stays
 * registry-free and therefore deterministic (the same reason `ChargeEffect` and
 * `BattleAbility` are self-contained, ADR-0010/ADR-0011).
 *
 * Derivation order (docs/05 §4: raw → job growth → mastery-trait modifiers →
 * EQUIPPED-SUPPORT modifiers → clamp; equipment / status still DEFERRED).
 * Integer/floored math only, floored per step; no RNG, no wall-clock, no IO. The
 * registry is an injected parameter, never a global.
 *
 * THE REACTION LAYER (ADR-0019) is projected too, but it is NOT a stat layer: the
 * equipped reaction lands on `UnitState.reaction` and is read by `resolve.ts` when a
 * blow wakes it, so it never enters the derivation order above.
 *
 * THE SUPPORT LAYER (ADR-0017) sits AFTER the trait fold and BEFORE the final
 * clamp, and it has two halves that land in different places: its stat mods
 * (pa/ma/maxHp) join the scalar pipeline above, while its ability mods (charge
 * speed, range) fold onto each projected {@link BattleAbility} in
 * {@link projectAbilities}. Both are baked into the returned UnitState, so a
 * replay stays registry-free. A build with no support equipped, or one whose
 * support has no authored effect, is byte-identical to the pre-layer build.
 *
 * SLICE-4 SCOPE: this projects a unit's CASTABLE ACTIONS into `abilities`, but
 * NOTHING in the resolver reads `abilities` yet (Slice 5 wires it). So building a
 * unit changes no rolls and no combat results — the field is inert projection.
 * Equipment and MP are not modeled on UnitState yet: `raw.mp` is intentionally
 * ignored, and the basic attack derives from a placeholder default weapon until
 * an equipment layer lands.
 */

import type { Ability, BattleAbility } from "./ability.js";
import { makeActiveStatus } from "./active-status.js";
import type { StatusEffect } from "./status.js";
import type { ContentRegistry } from "./content.js";
import { equippedSecondaryAbilities } from "./loadout.js";
import type { UnitRecord } from "./roster.js";
import {
  basicAttackFrom,
  BASIC_ATTACK_ID,
  createBattleState,
  defaultUnit,
  makeFlatTiles,
  type BattleState,
  type Evasion,
  type Tile,
  type UnitState,
  type Weapon,
} from "./state.js";
import { applyTraitEffects, type TraitStatBase } from "./trait.js";
import { applySupportEffect, applySupportToAbility, type SupportEffect } from "./support.js";
import { type ReactionState } from "./reaction.js";

/**
 * Placeholder weapon until an equipment layer lands — a UnitRecord carries no
 * weapon yet. Matches {@link defaultUnit}'s default so a built unit and a
 * default-constructed one agree on the basic attack.
 */
const DEFAULT_BUILD_WEAPON: Weapon = { wp: 8, formula: "paWp", element: "none", accuracy: 100 };

/**
 * The move / evasion a built unit gets when neither the caller (`over`) nor a
 * trait supplies one — MUST equal {@link defaultUnit}'s own defaults (state.ts),
 * so the no-trait build path stays byte-for-byte identical to a default unit.
 */
const DEFAULT_BUILD_MOVE = 3;
const DEFAULT_BUILD_EVASION: Evasion = {
  classEv: 10,
  weaponEv: 0,
  shieldEv: 0,
  accessoryEv: 0,
  magicEv: 0,
};

/** The five evasion sources, clamped individually to the PercentSchema bounds. */
const EVASION_KEYS = ["classEv", "weaponEv", "shieldEv", "accessoryEv", "magicEv"] as const;

/**
 * FINAL clamp of the trait-folded stats back into the {@link UnitStateSchema}
 * bounds (state.ts): `pa`/`ma` ≥ 0 (IntSchema.min(0)), `maxHp` ≥ 1 (min(1)),
 * `move` ≥ 0 (min(0)), and each evasion source in `[0, 100]` (PercentSchema =
 * IntSchema.min(0).max(100)). A trait's negative `flat` or a shrinking `mult` can
 * push a folded stat out of range, and `buildBattleUnit` never `.parse`s its
 * output — so without this the invalid unit runs live and only throws at
 * `serialize()`/rewind. This is a BUILD-TIME concern (it knows the target schema),
 * so it lives here, not in the pure trait fold (trait.ts). Integer in, integer out.
 * `speed` is absent because a trait can never touch it (TraitEffect has no `speed`
 * key, AC-P5), so its pre-fold clamp in {@link buildBattleUnit} is already final.
 *
 * NO-OP INVARIANT: on an already-legal derived stat (no traits), every clamp is a
 * no-op, so the no-trait build stays byte-identical.
 */
function clampToUnitStateBounds(s: TraitStatBase): TraitStatBase {
  const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
  const evasion = {} as Evasion;
  for (const key of EVASION_KEYS) evasion[key] = clamp(s.evasion[key], 0, 100);
  return {
    pa: Math.max(0, s.pa),
    ma: Math.max(0, s.ma),
    maxHp: Math.max(1, s.maxHp),
    move: Math.max(0, s.move),
    evasion,
  };
}

/**
 * Project a full authored {@link Ability} into its trimmed combat
 * {@link BattleAbility}. Progression-only fields (apCost/skillset/mp/…) are
 * dropped; combat fields default when the authored ability omits them: no
 * magnitude formula ⇒ "none", no power ⇒ 0, no element ⇒ "none", no range ⇒
 * melee {h:1,v:1}, no inflicts ⇒ []. Accuracy has no authored numeric field yet
 * (only a `hitBase` tag the pipeline reads later), so it defaults to 100 here.
 * `speed` omitted ⇒ `null` (instant); a positive int ⇒ the charged-action speed.
 *
 * EXPORTED so a caller that needs ONE ability's projection without compiling a whole
 * `UnitRecord` (the viewer's demo battle, which builds its units inline) goes through
 * this same function. The alternative — hand-authoring a `BattleAbility` literal — puts
 * a second copy of the pack's numbers in the render layer, where nothing would notice it
 * drifting from `data/base-pack.json`.
 */
export function toBattleAbility(
  ability: Ability,
  support: SupportEffect | undefined,
  /**
   * Resolves an authored status id to its catalog record. REQUIRED, with no default,
   * on purpose: a caller that could omit it would silently project an ability with no
   * inflicts, which is precisely the shape this slice exists to stop shipping. The
   * pack's referential-integrity pass already guarantees every id here resolves
   * (`content.ts` rejects an ability that inflicts an unknown status), so a throw from
   * this lookup means the registry and the ability came from different packs.
   */
  statusOf: (id: string) => StatusEffect,
): BattleAbility {
  const range = ability.range ?? { h: 1, v: 1 };
  // The equipped support's ability-side mods are baked in HERE, not read at
  // resolve time, so the projection stays self-contained (ADR-0010/ADR-0011).
  const { speed, rangeH } = applySupportToAbility(ability.speed ?? null, range.h, support);
  return {
    id: ability.id,
    actionKind: ability.type,
    formula: ability.formula ?? "none",
    power: ability.power ?? 0,
    element: ability.element ?? "none",
    accuracy: 100,
    range: { h: rangeH, v: range.v },
    // Ids → resolved templates, ONCE, here. See BattleAbilitySchema.inflicts.
    inflicts: (ability.inflicts ?? []).map((id) => makeActiveStatus(statusOf(id))),
    speed,
    aoe: ability.aoe ?? null,
  };
}

/**
 * The effect of the record's EQUIPPED support ability, or `undefined` when the
 * slot is empty or the equipped support is one of the deliberately-inert
 * {@link DEFERRED_SUPPORT_EFFECTS}. Absent, never a zero-effect object — so the
 * no-support path short-circuits to the identity in both fold helpers.
 */
function equippedSupportEffect(
  record: UnitRecord,
  registry: ContentRegistry,
): SupportEffect | undefined {
  const supportId = record.loadout.support;
  if (supportId === null) return undefined;
  return registry.ability(supportId).supportEffect;
}

/**
 * The record's EQUIPPED reaction as projected onto the unit (ADR-0019), or `null`
 * when the slot is empty or the equipped reaction is one of the deliberately-inert
 * {@link DEFERRED_REACTION_EFFECTS}. `null`, never a no-op object — a `null`
 * reaction takes no reaction draw, so a reaction-less build's roll sequence is
 * byte-identical to the pre-slice engine.
 *
 * The projected record carries the ABILITY ID as well as the kind, because the
 * driver credits a fired reaction to the reactor under that id. Without it the
 * counter would work and still score nothing on every measurement we have.
 */
function equippedReaction(record: UnitRecord, registry: ContentRegistry): ReactionState | null {
  const reactionId = record.loadout.reaction;
  if (reactionId === null) return null;
  const effect = registry.ability(reactionId).reactionEffect;
  if (effect === undefined) return null;
  return { abilityId: reactionId, kind: effect.kind };
}

/**
 * THE MOVEMENT SLOT IS STILL INERT — and this is where that is recorded, rather than
 * being a silence someone has to notice (ADR-0019).
 *
 * The reaction slice woke the reaction slot and deliberately left movement alone: it
 * is a different mechanism (the `move`/`jump` stats and the traversal rules, not the
 * resolve pipeline), and EIGHT of fifteen shipped builds equip `steal.move-plus-2`,
 * so waking it hands +2 Move to more than half the roster in one step — a roster-wide
 * tempo change on a roster whose seventh identity (`bld-cutpurse`) sits EXACTLY at the
 * viability floor. That is a measurement, not a refactor, and it deserves its own slice.
 *
 * Every authored `type: "movement"` ability appears here with the reason it does
 * nothing yet, split into the two honest kinds: SCOPE (nothing blocks it, we chose not
 * to) and BLOCKED (the mechanic it needs does not exist). `build.test.ts` asserts this
 * partitions the shipped pack EXACTLY, in both directions — so the remaining dead slot
 * cannot rot back into an unrecorded silence, which is precisely how the support slot
 * survived two slices.
 */
export const DEFERRED_MOVEMENT_EFFECTS: Readonly<Record<string, string>> = {
  "steal.move-plus-2":
    "SCOPE, not blocked: +2 Move is a one-line fold onto the derived `move` stat, but 8 of 15 shipped builds equip it, so it is a roster-wide tempo change that must be measured against the diversity gate on its own slice",
  "aim.scout":
    "BLOCKED: vision/line-of-sight is not modeled at all (ADR-0010 item 5 — range is reach + height tolerance with no LoS), so there is no sight radius for a vision movement to widen",
  "geomancy.lava-walk":
    "BLOCKED: terrain hazards do not exist — a `Tile` carries only `height` and `passable`, so there is no damaging terrain to ignore",
  "geomancy.terrain-stride":
    "SCOPE for its ignore-height half (it would fold onto `jump` exactly as move-plus-2 folds onto `move`), BLOCKED for its ignore-terrain half — impassable is binary in `Tile.passable` with no per-unit override, so honouring only half would ship a capability that reads as complete",
};

/**
 * The unit's castable-action projection: a basic attack, then the learned ACTION
 * abilities of the PRIMARY command (currentJob's primarySkillset ∩ learned), then
 * the learned ACTION abilities of the equipped SECONDARY command. Passive
 * reaction/support/movement abilities are deliberately NOT projected as castable
 * this slice (they gain effects when their mechanics land); effect-deferred ACTION
 * abilities still project (they simply do little until their effect ships).
 *
 * Deterministic: dedup uses a Map keyed by id, populated in a FIXED order (basic →
 * primary → secondary) by walking `record.learned` (a stable array), never
 * hash-set iteration. First writer wins on an id collision.
 *
 * THE SUPPORT'S ABILITY MODS APPLY TO SKILLS ONLY, never to `basic.attack`. The
 * basic attack is derived from the equipped WEAPON, and equipment is still
 * deferred (docs/05 §4) — so a range-up support has nothing meaningful to widen
 * there, and silently adding a tile of MELEE reach to every support-carrying build
 * would be a real combat change nobody authored. Revisit when the equipment layer
 * lands and a weapon carries its own range.
 */
function projectAbilities(
  record: UnitRecord,
  registry: ContentRegistry,
  weapon: Weapon,
  support: SupportEffect | undefined,
): BattleAbility[] {
  const primarySkillset = registry.job(record.currentJob).primarySkillset;
  const byId = new Map<string, BattleAbility>();
  byId.set(BASIC_ATTACK_ID, basicAttackFrom(weapon));

  // Primary command: learned actions belonging to the current job's skillset.
  for (const abilityId of record.learned) {
    const ability = registry.ability(abilityId);
    if (ability.type === "action" && ability.skillset === primarySkillset && !byId.has(ability.id)) {
      byId.set(ability.id, toBattleAbility(ability, support, (id) => registry.status(id)));
    }
  }

  // Secondary command: learned actions of the equipped secondary job (already
  // filtered to action-type by loadout.ts; `[]` when no secondary is equipped).
  for (const ability of equippedSecondaryAbilities(record, registry)) {
    if (!byId.has(ability.id)) {
      byId.set(ability.id, toBattleAbility(ability, support, (id) => registry.status(id)));
    }
  }

  return [...byId.values()];
}

/**
 * Build a battle-ready {@link UnitState} from a persistent {@link UnitRecord}.
 * Combat stats are DERIVED per docs/05 §4 (raw × current-job growth multiplier,
 * floored per step); `hp` starts at full `maxHp`. Positions/facing/teamId and any
 * other placement fields come from `over` (callers/tests supply them) or sensible
 * {@link defaultUnit} defaults. The registry is read only here.
 *
 * NOTE: `raw.mp` is ignored — UnitState has no MP field yet. Equipment/status
 * modifiers are still DEFERRED (docs/05 §4); the mastery-trait layer IS applied
 * (below): growth → trait fold → FINAL clamp → construct.
 */
export function buildBattleUnit(
  record: UnitRecord,
  registry: ContentRegistry,
  over: Partial<UnitState> = {},
): UnitState {
  const job = registry.job(record.currentJob);
  const pa = Math.floor(record.raw.pa * job.growth.pa);
  const ma = Math.floor(record.raw.ma * job.growth.ma);
  // Clamp to the schema mins (speed ≥ 1, maxHp ≥ 1) so a tiny raw × small growth
  // can never floor below a legal stat. (Trait speed effects are impossible by
  // construction — TraitEffect has no `speed` key, AC-P5 — so speed is final here.)
  const speed = Math.max(1, Math.floor(record.raw.speed * job.growth.speed));
  const maxHp = Math.max(1, Math.floor(record.raw.hp * job.growth.hp));

  // Mastery-trait layer: fold every equipped trait's effect over the derived
  // stats, then a FINAL clamp back into the UnitStateSchema bounds. The fold is
  // order-independent (trait.ts) so a loadout's trait order never changes the
  // result. The fold base is the EFFECTIVE base — `over.<stat>` when the caller
  // supplies one, else the derived value / defaultUnit default — and `...over` is
  // STILL spread last, so an explicit test override wins outright. A trait's
  // negative flat / shrinking mult can drive a stat out of range, so the clamp
  // (growth → trait fold → clamp, docs/05 §4) keeps the built unit schema-valid
  // WITHOUT a `.parse` (it would otherwise only fail at serialize/rewind). With no
  // equipped traits both steps are a no-op: Σflat = 0, Πmult = 1, and every clamp
  // leaves an already-legal derived stat untouched, so the built UnitState is
  // byte-identical to before.
  const effects = record.loadout.traits.map((id) => registry.trait(id).effect);
  const withTraits = applyTraitEffects(
    {
      pa,
      ma,
      maxHp,
      move: over.move ?? DEFAULT_BUILD_MOVE,
      evasion: over.evasion ?? DEFAULT_BUILD_EVASION,
    },
    effects,
  );

  // Equipped-support layer (ADR-0017), applied AFTER traits and BEFORE the clamp.
  // Sequential rather than folded together with the traits on purpose: mastery and
  // an equipped support are distinct sources in docs/05 §4's ordered pipeline, and
  // keeping them separate means a support's multiplier scales the post-mastery stat
  // (what the player sees on the unit) rather than the pre-mastery one. Each layer
  // floors once. A loadout holds at most ONE support, so there is no intra-layer
  // ordering to be independent of. Absent support ⇒ the identity, so a support-less
  // build stays byte-identical to the pre-layer build.
  const support = equippedSupportEffect(record, registry);
  const adjusted = clampToUnitStateBounds({
    ...withTraits,
    ...applySupportEffect(
      { pa: withTraits.pa, ma: withTraits.ma, maxHp: withTraits.maxHp },
      support,
    ),
  });

  const weapon: Weapon = over.weapon ?? DEFAULT_BUILD_WEAPON;
  const abilities = projectAbilities(record, registry, weapon, support);

  // Equipped-reaction layer (ADR-0019). Unlike the support's stat mods this touches
  // NO stat and NO projected ability — a reaction is read at RESOLVE time, by the
  // blow that wakes it — so it sits outside the docs/05 §4 derivation pipeline
  // entirely and cannot perturb the clamp.
  const reaction = equippedReaction(record, registry);

  return defaultUnit(record.id, over.teamId ?? 0, {
    pa: adjusted.pa,
    ma: adjusted.ma,
    speed,
    maxHp: adjusted.maxHp,
    hp: adjusted.maxHp,
    move: adjusted.move,
    evasion: adjusted.evasion,
    brave: record.brave,
    faith: record.faith,
    weapon,
    abilities,
    reaction,
    // `over` wins on anything above (pos/facing/teamId/…, and any deliberate stat
    // override a caller passes) — this is a placement/setup helper.
    ...over,
  });
}

/** One unit to place in a built battle: its record plus optional placement overrides. */
export interface BuildUnitInput {
  record: UnitRecord;
  over?: Partial<UnitState>;
}

/** Grid options for {@link buildBattleState}; tiles auto-fill flat if omitted. */
export interface BuildBattleGridOptions {
  width: number;
  height: number;
  tiles?: Tile[];
}

/**
 * Build a fresh {@link BattleState} from a list of persistent records. Each is
 * compiled via {@link buildBattleUnit}; teamId/position come from each input's
 * `over`, else a simple deterministic row-major layout (`x = i % width`,
 * `y = floor(i / width)`) that keeps positions unique. Minimal on purpose — a
 * full map-definition loader (team deploy zones, spawn tiles) is a later concern;
 * `createBattleState`'s schema still loud-fails on any position/id collision.
 */
export function buildBattleState(
  inputs: BuildUnitInput[],
  seed: number,
  registry: ContentRegistry,
  gridOpts?: BuildBattleGridOptions,
): BattleState {
  const width = gridOpts?.width ?? Math.max(1, inputs.length);
  const height = gridOpts?.height ?? 1;
  const tiles = gridOpts?.tiles ?? makeFlatTiles(width, height);

  const units = inputs.map((input, i) => {
    const over = input.over ?? {};
    const pos = over.pos ?? { x: i % width, y: Math.floor(i / width) };
    return buildBattleUnit(input.record, registry, { ...over, pos });
  });

  return createBattleState({ seed, grid: { width, height, tiles }, units });
}
