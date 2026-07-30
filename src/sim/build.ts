/**
 * The battle-start bridge (docs/05 §4, ADR-0011) — the ONE-WAY compile from a
 * persistent {@link UnitRecord} (roster.ts) into a battle-ready {@link UnitState}.
 * The {@link ContentRegistry} is read HERE, at build time, and NEVER again: the
 * resulting UnitState is self-contained, so a serialized/replayed battle stays
 * registry-free and therefore deterministic (the same reason `ChargeEffect` and
 * `BattleAbility` are self-contained, ADR-0010/ADR-0011).
 *
 * Derivation order (docs/05 §4: raw → job growth → [equipment / mastery / status
 * — DEFERRED] → clamp). Integer/floored math only, floored per step; no RNG, no
 * wall-clock, no IO. The registry is an injected parameter, never a global.
 *
 * SLICE-4 SCOPE: this projects a unit's CASTABLE ACTIONS into `abilities`, but
 * NOTHING in the resolver reads `abilities` yet (Slice 5 wires it). So building a
 * unit changes no rolls and no combat results — the field is inert projection.
 * Equipment and MP are not modeled on UnitState yet: `raw.mp` is intentionally
 * ignored, and the basic attack derives from a placeholder default weapon until
 * an equipment layer lands.
 */

import type { Ability, BattleAbility } from "./ability.js";
import type { ContentRegistry } from "./content.js";
import { equippedSecondaryAbilities } from "./loadout.js";
import type { UnitRecord } from "./roster.js";
import {
  basicAttackFrom,
  createBattleState,
  defaultUnit,
  makeFlatTiles,
  type BattleState,
  type Tile,
  type UnitState,
  type Weapon,
} from "./state.js";

/**
 * Placeholder weapon until an equipment layer lands — a UnitRecord carries no
 * weapon yet. Matches {@link defaultUnit}'s default so a built unit and a
 * default-constructed one agree on the basic attack.
 */
const DEFAULT_BUILD_WEAPON: Weapon = { wp: 8, formula: "paWp", element: "none", accuracy: 100 };

/**
 * Project a full authored {@link Ability} into its trimmed combat
 * {@link BattleAbility}. Progression-only fields (apCost/skillset/mp/…) are
 * dropped; combat fields default when the authored ability omits them: no
 * magnitude formula ⇒ "none", no power ⇒ 0, no element ⇒ "none", no range ⇒
 * melee {h:1,v:1}, no inflicts ⇒ []. Accuracy has no authored numeric field yet
 * (only a `hitBase` tag the pipeline reads later), so it defaults to 100 here.
 * `speed` omitted ⇒ `null` (instant); a positive int ⇒ the charged-action speed.
 */
function toBattleAbility(ability: Ability): BattleAbility {
  return {
    id: ability.id,
    actionKind: ability.type,
    formula: ability.formula ?? "none",
    power: ability.power ?? 0,
    element: ability.element ?? "none",
    accuracy: 100,
    range: ability.range ?? { h: 1, v: 1 },
    inflicts: ability.inflicts ?? [],
    speed: ability.speed ?? null,
  };
}

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
 */
function projectAbilities(
  record: UnitRecord,
  registry: ContentRegistry,
  weapon: Weapon,
): BattleAbility[] {
  const primarySkillset = registry.job(record.currentJob).primarySkillset;
  const byId = new Map<string, BattleAbility>();
  byId.set("basic.attack", basicAttackFrom(weapon));

  // Primary command: learned actions belonging to the current job's skillset.
  for (const abilityId of record.learned) {
    const ability = registry.ability(abilityId);
    if (ability.type === "action" && ability.skillset === primarySkillset && !byId.has(ability.id)) {
      byId.set(ability.id, toBattleAbility(ability));
    }
  }

  // Secondary command: learned actions of the equipped secondary job (already
  // filtered to action-type by loadout.ts; `[]` when no secondary is equipped).
  for (const ability of equippedSecondaryAbilities(record, registry)) {
    if (!byId.has(ability.id)) {
      byId.set(ability.id, toBattleAbility(ability));
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
 * NOTE: `raw.mp` is ignored — UnitState has no MP field yet. Equipment/mastery/
 * status modifiers are DEFERRED (docs/05 §4), so only raw × growth applies today.
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
  // can never floor below a legal stat.
  const speed = Math.max(1, Math.floor(record.raw.speed * job.growth.speed));
  const maxHp = Math.max(1, Math.floor(record.raw.hp * job.growth.hp));

  const weapon: Weapon = over.weapon ?? DEFAULT_BUILD_WEAPON;
  const abilities = projectAbilities(record, registry, weapon);

  return defaultUnit(record.id, over.teamId ?? 0, {
    pa,
    ma,
    speed,
    maxHp,
    hp: maxHp,
    brave: record.brave,
    faith: record.faith,
    weapon,
    abilities,
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
