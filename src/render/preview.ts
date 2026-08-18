/**
 * Resolution transparency (docs/10 §4, docs/00 pillar 4, docs/04 §3).
 *
 * ============================ AC-V6: PREVIEW PURITY ==========================
 * NOTHING in this module may resolve anything. Every number below is computed
 * with the sim's PURE, RNG-FREE exported helpers:
 *
 *   `hitChance` · `attackDamage` · `abilityDamage` · `relativeFacing` ·
 *   `inAbilityRange` · `moveRange` · `zodiacCompatibility` · `settleTurn`
 *   (on a THROWAWAY clone, for the CT price) · `forecast` (itself pure).
 *
 * None of those touch the seeded stream and none advance the clock, so ANY
 * sequence of hovers/stagings/cancels leaves `rngCounter` and `tick` byte-equal.
 * The two forbidden shortcuts — calling `resolveAttack`/`resolveAbility` to read
 * an outcome, or speculatively `applyCommand`-ing and discarding — are what
 * AC-V6 exists to catch: the first bumps `rngCounter` once per hover, the second
 * advances `tick` and can mature a charge. Neither is imported here.
 * =============================================================================
 *
 * DEFERRED ROWS ARE ABSENT, NOT ZERO (docs/10 §4): there is no field for crit,
 * reactions, status-on-hit, elemental weak/half/absorb, AoE spread, LoS or
 * charge maturity. Printing "Crit 0%" would assert a MODELED zero for something
 * that is unmodeled (ADR-0010) — dishonest under pillar 4. If you add one of
 * those to the sim, add its row here; until then the row must not exist.
 */

import {
  CT_COST_MOVE_AND_ACT,
  CT_COST_ONE,
  CT_COST_WAIT,
  abilityDamage,
  attackDamage,
  hitChance,
  inAbilityRange,
  isBasicAttack,
  relativeFacing,
  settleTurn,
  zodiacCompatibility,
  type BattleAbility,
  type BattleState,
  type Position,
  type ReactionKind,
  type UnitState,
  type ZodiacTier,
} from "../sim/index.js";
import { forecast } from "./demo.js";

/** A status as the panel shows it (id + buff/debuff colouring). */
export interface PreviewStatus {
  id: string;
  kind: "buff" | "debuff";
}

/** docs/10 §4 item 7 — the CT price of the turn AS STAGED and what it buys. */
export interface TurnCost {
  /** −100 (move+act), −80 (one sub-phase) or −60 (neither). docs/01 AC-02. */
  cost: number;
  didMove: boolean;
  didAct: boolean;
  /** The actor's CT right now (it is ≥ 100: its turn is up). */
  ctBefore: number;
  /** CT after this turn settles — the remainder carries. */
  ctAfter: number;
  /**
   * The actor's slot in the next-8 timeline (0 = acts next), or `null` when it
   * falls beyond the forecast horizon. Computed by settling a THROWAWAY clone
   * and re-running the pure `forecast`; no RNG, no real clock movement.
   *
   * The `cost`/`ctAfter` fields above are ALWAYS exact — they price only THIS
   * turn, which the player has just staged. The slot is the part that may not
   * be: see {@link timelineSlotExact}.
   */
  timelineSlot: number | null;
  /**
   * Is {@link timelineSlot} independent of the forecast's one guess
   * (`ASSUMED_FUTURE_TURN_COST` = −80 per future turn)?
   *
   * True when the slot lands inside `Forecast.assumedFrom` — i.e. no actor ahead
   * of it takes a SECOND turn first, so no guessed cost is in the path and the
   * slot is a fact, modulo a cast nobody has declared yet (see `Forecast`).
   * False when it lands beyond the boundary: then a Wait (−60) or a move+act
   * fold (−100) anywhere ahead moves it, and the renderer must say so rather
   * than present it as a fact (docs/10 §4 item 7).
   *
   * `false` when `timelineSlot` is `null`: "beyond the horizon" is itself a
   * consequence of the guessed pacing, so it is not something to present as
   * settled either.
   */
  timelineSlotExact: boolean;
}

/** docs/10 §4 — the minimum honest set, computed for the STAGED position. */
export interface ActPreview {
  actorId: string;
  abilityId: string;
  targetId: string;
  /** The tile the act resolves FROM: the staged tile when a move is staged. */
  from: Position;
  /** Is a move staged? (the act then resolves post-move, ADR-0015 `order:"before"`) */
  moved: boolean;
  /** Named facing tier that produced the hit % — the reason to reposition. */
  facing: "front" | "side" | "rear";
  /** Post-evasion hit chance, 0–100 integer. */
  hitChance: number;
  /** True when the ability restores HP rather than removing it. */
  heal: boolean;
  /** The EXACT integer magnitude on a hit (this engine's damage is deterministic). */
  magnitude: number;
  targetHpBefore: number;
  targetHpAfter: number;
  targetMaxHp: number;
  /** Would a hit drop the target to 0 HP? */
  lethal: boolean;
  /** [ENHANCEMENT] docs/10 §4 — the hidden Zodiac multiplier, surfaced. */
  zodiac: ZodiacTier;
  targetStatuses: PreviewStatus[];
  /**
   * Statuses this act WILL apply on a hit (docs/05 §2 step d).
   *
   * ABSENT UNTIL NOW, CORRECTLY — status-on-hit was unmodeled, so showing it would
   * have asserted a modeled effect the engine could not back up (`docs/10` §4, the
   * absent-not-zero rule), and `session.test.ts` asserted the key was missing. The
   * moment the resolvers started applying `inflicts`, that same omission flipped
   * from honest to dishonest: the player would commit `aim.head-shot` seeing only
   * its damage, with no hint it freezes the target's clock for 20 CT.
   *
   * Empty for an ability that inflicts nothing — an empty list is a real answer
   * here ("this act applies no status"), unlike a fabricated zero.
   */
  inflicts: PreviewStatus[];
  /**
   * What the TARGET's equipped reaction will do to the actor if this act wakes it
   * (docs/10 §4, ADR-0019). ABSENT — genuinely missing from the object, not zeroed —
   * whenever no reaction can trigger: the target has none, the act is not physical,
   * or the actor stands outside the target's reach.
   *
   * ADDED THE MOMENT REACTIONS SHIPPED, and that timing is the rule, not a detail.
   * `preview.ts` correctly said nothing about reactions while they were unmodeled;
   * the instant the resolver started firing them, silence became a LIE — the player
   * would commit a melee swing at a Counter Wall seeing only what it costs the
   * target, with no hint that half the damage is coming straight back
   * (`src/render/CLAUDE.md`, "when a deferred capability SHIPS, go un-hide it").
   */
  counterRisk?: CounterRisk;
  turn: TurnCost;
}

/**
 * The reaction the target would answer this act with (docs/10 §4 item 8).
 *
 * `chance` is the target's Brave — the real trigger odds the resolver rolls, read off
 * the unit, not a constant. `magnitude` is the EXACT damage the counter-swing deals
 * on a hit, from the same `attackDamage` the resolver uses, so the panel cannot
 * promise a number the engine would not produce. `hitChance` is that swing's own
 * post-evasion odds AGAINST THE ACTOR, which is why repositioning changes it.
 */
export interface CounterRisk {
  /** The reaction ability that would fire (e.g. `punch-art.counter`). */
  abilityId: string;
  kind: ReactionKind;
  /** Trigger odds, 0–100: the target's Brave (docs/01 §4). */
  chance: number;
  /** The counter-swing's post-evasion hit chance against the ACTOR, 0–100. */
  hitChance: number;
  /** Exact damage the counter-swing deals to the actor on a hit. */
  magnitude: number;
  /** Would the counter drop the ACTOR to 0 HP? */
  lethal: boolean;
  /**
   * True for `preemptive` (Hamedo): this act would be CANCELLED, so the damage and
   * statuses shown above it will not happen at all. The renderer must lead with this
   * — a preview that shows a lethal blow the target simply blocks is worse than no
   * preview.
   */
  cancelsAct: boolean;
}

/** An action the actor can legally take on a unit FROM a given tile. */
export interface TargetOption {
  unit: UnitState;
  ability: BattleAbility;
}

/**
 * Which of `actor.abilities` the viewer may offer for CLICK-TO-TARGET this slice.
 *
 * Deliberately narrow, and narrow for REASONS that are spec'd, not for
 * convenience:
 *   - `actionKind !== "action"` — reaction/support/movement are passive.
 *   - `formula === "none"`      — resolves to nothing in the current pipeline.
 *   - `speed !== null` (charged) — the driver takes a TILE target for a charge,
 *     and exposing the cast needs the mid-turn outcome UI docs/10 §5 defers.
 *   - `aoe !== null`            — AoE preview is DEFERRED (docs/10 §4); offering
 *     the act without its preview would commit blind.
 * On the shipped roster team 0 projects exactly one action (`basic.attack`), so
 * nothing playable is hidden by this filter (docs/10 §5 states that limitation).
 */
function isClickTargetable(ability: BattleAbility): boolean {
  return (
    ability.actionKind === "action" &&
    ability.formula !== "none" &&
    ability.speed === null &&
    ability.aoe === null
  );
}

/**
 * Every unit the actor could act on FROM `from`, with the ability that would do
 * it — THE SIM DECIDES: membership comes from `inAbilityRange` and the unit's own
 * `abilities` projection, never from a viewer-side radius or Manhattan test
 * (docs/10 §1, AC-V7). Damage abilities target foes; heals target allies.
 *
 * Deterministic: iterates `units` in array order and, per unit, takes the FIRST
 * matching ability in `abilities` order.
 */
export function targetOptions(state: BattleState, actorId: string, from: Position): TargetOption[] {
  const actor = state.units.find((u) => u.id === actorId);
  if (!actor) return [];
  const out: TargetOption[] = [];
  for (const other of state.units) {
    if (other.hp <= 0 || other.id === actor.id) continue;
    const ally = other.teamId === actor.teamId;
    const ability = actor.abilities.find((a) => {
      if (!isClickTargetable(a)) return false;
      if ((a.formula === "heal") !== ally) return false; // heal allies, damage foes
      return inAbilityRange(state.grid, from, other.pos, a.range);
    });
    if (ability) out.push({ unit: other, ability });
  }
  return out;
}

/**
 * ACCURACY + MAGNITUDE routing, mirroring the driver's dispatch EXACTLY so the
 * previewed number is the number that will be dealt:
 *   - the weapon-derived basic swing → `resolveAttack` → weapon accuracy +
 *     {@link attackDamage}
 *   - everything else (any authored skill, physical included) → `resolveAbility` →
 *     ability accuracy + {@link abilityDamage}, which reads the ability's `power`
 *
 * The discriminant is the sim's own {@link isBasicAttack}, imported rather than
 * re-derived, so this file cannot drift from `driver.ts` / `ai.ts` the way the old
 * hand-copied `formula === "physical"` test could. If the driver's routing changes,
 * this must change with it — that coupling is the price of never re-deriving damage.
 */
function routeAccuracy(attacker: UnitState, ability: BattleAbility): number {
  return isBasicAttack(ability) ? attacker.weapon.accuracy : ability.accuracy;
}

function routeMagnitude(attacker: UnitState, target: UnitState, ability: BattleAbility): number {
  return isBasicAttack(ability)
    ? attackDamage(attacker, target)
    : abilityDamage(attacker, target, ability);
}

/**
 * The CT price of the turn as staged, plus where it lands the actor on the
 * timeline AND whether that slot is a fact or a projection. PURE: `settleTurn`
 * clones its input and consumes no RNG, and {@link forecast} is itself a
 * clone-only preview — the caller's state is never touched (AC-V6).
 *
 * The price is exact; the slot is exact only inside `Forecast.assumedFrom`. Both
 * facts travel together so the renderer can never show one without the other.
 */
export function turnCost(
  state: BattleState,
  actorId: string,
  opts: { didMove: boolean; didAct: boolean },
): TurnCost {
  const actor = state.units.find((u) => u.id === actorId);
  const ctBefore = actor ? actor.ct : 0;
  const cost =
    opts.didMove && opts.didAct
      ? CT_COST_MOVE_AND_ACT
      : opts.didMove || opts.didAct
        ? CT_COST_ONE
        : CT_COST_WAIT;

  let timelineSlot: number | null = null;
  let timelineSlotExact = false;
  if (actor && ctBefore >= cost) {
    const settled = settleTurn(state, actorId, opts);
    const { entries, assumedFrom } = forecast(settled, 8);
    const idx = entries.findIndex((a) => a.kind === "unit" && a.id === actorId);
    timelineSlot = idx === -1 ? null : idx;
    // Exact iff the slot sits inside the stretch no guessed cost can move.
    timelineSlotExact = idx !== -1 && idx < assumedFrom;
  }

  return {
    cost,
    didMove: opts.didMove,
    didAct: opts.didAct,
    ctBefore,
    ctAfter: ctBefore - cost,
    timelineSlot,
    timelineSlotExact,
  };
}

/**
 * The full transparency payload for "actor (optionally after moving to `from`)
 * acts on `target` with `ability`" — docs/10 §4 items 3–8.
 *
 * Every value is read from a pure helper; nothing here resolves, rolls or
 * settles the real state (AC-V6).
 */
export function computeActPreview(
  state: BattleState,
  actorId: string,
  from: Position,
  moved: boolean,
  option: TargetOption,
): ActPreview | null {
  const actor = state.units.find((u) => u.id === actorId);
  if (!actor) return null;
  const target = state.units.find((u) => u.id === option.unit.id);
  if (!target) return null;
  const { ability } = option;

  // The act resolves from `from` — so facing/arc and hit% are read there, which
  // is precisely what makes move-then-act a real tactical choice (docs/10 §4.4).
  const facing = relativeFacing(target, from);
  const chance = hitChance(routeAccuracy(actor, ability), target.evasion, facing);
  const heal = ability.formula === "heal";
  const magnitude = routeMagnitude(actor, target, ability);
  const targetHpAfter = heal
    ? Math.min(target.maxHp, target.hp + magnitude)
    : Math.max(0, target.hp - magnitude);

  const counterRisk = counterRiskOf(state, actor, from, target, ability);

  return {
    actorId,
    abilityId: ability.id,
    targetId: target.id,
    from: { x: from.x, y: from.y },
    moved,
    facing,
    hitChance: chance,
    heal,
    magnitude,
    targetHpBefore: target.hp,
    targetHpAfter,
    targetMaxHp: target.maxHp,
    lethal: !heal && target.hp > 0 && targetHpAfter === 0,
    zodiac: zodiacCompatibility(actor.zodiac, target.zodiac),
    targetStatuses: target.statuses.map((s) => ({ id: s.id, kind: s.kind })),
    // Read off the ability's own resolved templates — the SAME records the resolver
    // will copy onto the target — so the preview cannot promise a status the sim
    // would not apply.
    inflicts: ability.inflicts.map((s) => ({ id: s.id, kind: s.kind })),
    // `exactOptionalPropertyTypes` is on, so this spread is how the key stays
    // genuinely ABSENT rather than present-and-undefined (docs/10 §4, absent-not-zero).
    ...(counterRisk ? { counterRisk } : {}),
    turn: turnCost(state, actorId, { didMove: moved, didAct: true }),
  };
}

/**
 * The target's answer to this act, or `null` when it has none.
 *
 * MIRRORS `resolve.ts`'s `tryReaction` conditions — physical only, the actor inside
 * the target's OWN basic-attack range, both alive — and reuses `inAbilityRange` and
 * `attackDamage` rather than restating either. The sim owns legality and magnitude;
 * the preview only asks (`src/render/CLAUDE.md`, the "never re-derive" rule).
 *
 * PURE: no resolver, no RNG, no clock. The one thing it CANNOT know is whether the
 * Brave roll will pass — which is why `chance` is surfaced instead of a verdict.
 *
 * THE ACT-KILLS-THE-TARGET CASE. A `counter` cannot fire from a corpse, so an act the
 * preview already calls `lethal` carries no counter risk and this returns `null` for
 * it. That is a real answer, not an omission: "kill it before it swings back" is
 * exactly the tactical read the panel exists to support. `preemptive` is unaffected —
 * it fires BEFORE the blow, so a lethal act does not escape it.
 */
function counterRiskOf(
  state: BattleState,
  actor: UnitState,
  from: Position,
  target: UnitState,
  ability: BattleAbility,
): CounterRisk | null {
  const reaction = target.reaction;
  if (reaction === null) return null;
  if (target.hp <= 0 || actor.hp <= 0) return null;
  const physical = isBasicAttack(ability) || ability.formula === "physical";
  if (!physical) return null;
  const swing = target.abilities.find((a) => isBasicAttack(a));
  if (!swing) return null;
  if (!inAbilityRange(state.grid, target.pos, from, swing.range)) return null;
  if (reaction.kind === "counter") {
    const magnitude = routeMagnitude(actor, target, ability);
    const wouldKill = !(ability.formula === "heal") && target.hp > 0 && target.hp - magnitude <= 0;
    if (wouldKill) return null;
  }
  // The counter-swing is aimed at the ACTOR standing on the staged tile `from`, so
  // facing/evasion are read from there — repositioning changes the risk, and the panel
  // must move with it.
  const swingFacing = relativeFacing({ ...actor, pos: from }, target.pos);
  const counterDamage = attackDamage(target, { ...actor, pos: from });
  return {
    abilityId: reaction.abilityId,
    kind: reaction.kind,
    chance: target.brave,
    hitChance: hitChance(target.weapon.accuracy, actor.evasion, swingFacing),
    magnitude: counterDamage,
    lethal: actor.hp > 0 && actor.hp - counterDamage <= 0,
    cancelsAct: reaction.kind === "preemptive",
  };
}
