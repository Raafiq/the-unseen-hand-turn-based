/**
 * Balance-probe AI (docs/06 §AI-as-test-harness, P2 Slice 2). A PURE, greedy,
 * 1-ply policy that turns a decision point into one {@link Command} — the driver
 * behind the headless benchmark. It is NOT meant to be a clever opponent; it is a
 * deterministic, legible baseline that stresses builds so encounters can be
 * measured (docs/06 AC-E1/E3).
 *
 * DETERMINISM (P0, sim-determinism-guard):
 *   - ZERO RNG draws. `decideBalanceProbe` never touches the seed, so the per-turn
 *     roll-consumption order is EXACTLY the resolver's draws — the AI adds nothing
 *     to `rngCounter` (AC-S1/S2 fall out for free; the harness test proves it by
 *     replaying the issued command log and getting a byte-identical state).
 *   - Reads ONLY {@link BattleState} — no wall-clock, no globals, no ambient input.
 *   - Every candidate list is sorted by a DECLARED TOTAL ORDER; no Map/Set
 *     iteration ever decides a choice.
 *
 * REUSE (no drift, OQ5): magnitude ranking calls the resolver's own extracted
 * magnitude functions ({@link attackDamage}/{@link abilityDamage}), so the AI's
 * estimate can never disagree with the damage the pipeline actually deals, and no
 * combat constant is duplicated here.
 *
 * SCOPE (D2): `effHp = hp` — no mitigation-aware (Protect/evasion/element) target
 * selection this slice, so AC-E3(c) ("counter the target's defenses") is only
 * partially met; (a) flank and (b) focus-lowest-HP are met fully. `none`-formula
 * and passive (reaction/support/movement) abilities are never picked — they do
 * nothing in the current resolver, so a DISABLE/BUFF class has no live candidate
 * yet (the class scaffold is kept for when status infliction lands).
 */

import { isBasicAttack, type BattleState, type UnitState, type Position } from "./state.js";
import type { BattleAbility } from "./ability.js";
import type { Command } from "./driver.js";
import { inAbilityRange, moveRange, relativeFacing, unitsInAoeBox } from "./grid.js";
import { attackDamage, abilityDamage } from "./resolve.js";

/**
 * Lexicographic PRIMARY key — the action class, best first (docs/06). LETHAL (this
 * blow drops the target) outranks a mere CHIP; a HEAL sits between them. DISABLE
 * (status infliction) and BUFF are reserved for when their effects resolve; no
 * candidate is generated for them yet.
 */
const ACTION_CLASS = { LETHAL: 0, DISABLE: 1, HEAL: 2, CHIP: 3, BUFF: 4 } as const;

/** Facing preference (better hit-through): rear > side > front. Lower rank = better. */
const FACING_RANK: Record<"front" | "side" | "rear", number> = { rear: 0, side: 1, front: 2 };

interface Candidate {
  cls: number;
  /**
   * Target effective HP (= `hp`, D2). Sorted ASC — the FOCUS key (AC-E3(b)),
   * applied UNIFORMLY to single-target and area acts. For an area act this is the
   * LOWEST effHp among the units it would affect, so an AoE "focuses" on the
   * weakest unit in its box exactly as a single-target act focuses its one target.
   */
  targetEffHp: number;
  /**
   * Effective magnitude: damage dealt / HP restored for a single-target act, or
   * the SUM over the aim box for an area act. Sorted DESC (the CHIP tie-break after
   * effHp, and the LETHAL/HEAL primary).
   */
  magnitude: number;
  /** Facing rank from the tile the act resolves FROM ({@link from}). Sorted ASC (rear best). */
  facingRank: number;
  /**
   * 0 = the act resolves from the actor's CURRENT tile (a −80 turn); 1 = it resolves
   * from a reachable tile, folding move+act into one −100 turn (ADR-0015). Sorted ASC
   * and placed BELOW `facingRank`, so a better arc reachable only by moving beats a
   * worse arc from standing (flank-then-strike), while two otherwise-identical acts
   * prefer the one that does not pay the extra 20 CT.
   */
  moved: number;
  /** The tile the act resolves from: the actor's own tile when `moved === 0`. */
  from: Position;
  /** The single target's id, or the AIM CENTRE unit's id for an area act (tie-break). */
  targetId: string;
  abilityIndex: number;
  ability: BattleAbility;
  /** The single target, or the AIM CENTRE unit whose tile the area is centred on. */
  target: UnitState;
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * RNG-free estimate of the on-hit magnitude of `ability` from `attacker` to
 * `target`, routed exactly as the driver routes resolution so the ranking equals
 * the real damage:
 *   - the weapon-derived basic swing → {@link attackDamage} (resolveAttack),
 *   - everything else (any authored skill — physical included — plus every charged
 *     action, which the driver resolves as magic via resolveCharge) →
 *     {@link abilityDamage}, which reads the ability's own `power`.
 * A `heal` returns its raw restorative magnitude; the caller caps it by missing HP.
 *
 * The discriminant is {@link isBasicAttack} and MUST stay identical to the driver's
 * (driver.ts) and the AoE resolver's. It was `formula === "physical"`, which routed
 * every authored physical skill to the weapon swing and made their `power` inert.
 */
function estMagnitude(attacker: UnitState, target: UnitState, ability: BattleAbility): number {
  if (isBasicAttack(ability)) {
    return attackDamage(attacker, target);
  }
  return abilityDamage(attacker, target, ability);
}

/**
 * Enumerate every LEGAL, EFFECTIVE action resolving FROM the tile `from`: for each
 * ACTION ability (in `abilities` array order) crossed with its valid targets
 * (foes for damage, allies incl. self for heal) that are IN RANGE and would gain
 * something. Passive and `none`-formula abilities are skipped (they do nothing).
 * Deterministic: iterates the stable `abilities`/`units` arrays only.
 *
 * `from` is the actor's own tile for a plain act, or a reachable tile for the folded
 * move+act turn (ADR-0015) — RANGE and FACING are both read from it, matching the
 * driver's `order: "before"` semantics exactly (it validates `inAbilityRange` from the
 * destination). `moved` is stamped onto every candidate this call produces.
 *
 * NOTE `estMagnitude` is position-independent (it reads stats only), so magnitude is
 * unaffected by `from`; only reach and arc are. If a future slice makes damage depend
 * on height or distance, this is the seam that must start passing `from` into it.
 */
function candidatesFrom(
  state: BattleState,
  actor: UnitState,
  from: Position,
  moved: number,
): Candidate[] {
  const cands: Candidate[] = [];
  actor.abilities.forEach((ability, abilityIndex) => {
    if (ability.actionKind !== "action") return; // reaction/support/movement are passive
    if (ability.formula === "none") return; // no magnitude/effect in the current resolver
    // LANDMINE: the driver enqueues EVERY charge as a MAGIC ChargeEffect
    // (driver.ts declareCharge dispatch; charge.ts resolves it via magicDamage),
    // so a charged NON-magic ability would misresolve — worst case a charged HEAL
    // damages the ally on its target tile at maturity. Until the driver routes
    // `effect.kind` by `formula`, only magic-formula charges are safe to select.
    if (ability.speed !== null && ability.formula !== "magic") return;
    const heal = ability.formula === "heal";
    // The AIM CENTRES: for a single-target act, each valid unit is its own aim; for
    // an area act, the AI centres the box on a valid unit's tile (foe for damage,
    // ally for heal) and sums over everyone the box catches. Iterating candidate
    // aim units (not raw tiles) keeps the search finite and each aim deterministic.
    for (const aim of state.units) {
      if (aim.hp <= 0) continue;
      const sameTeam = aim.teamId === actor.teamId;
      if (heal ? !sameTeam : sameTeam) continue; // heal allies (incl. self); damage foes
      if (!inAbilityRange(state.grid, from, aim.pos, ability.range)) continue;

      if (ability.aoe !== null) {
        // AREA — value the aim by the SUMMED magnitude over the units the box catches
        // (TARGETED: foes for damage, allies for heal) and by the LOWEST effHp among
        // them. The box is centred on each valid unit's tile; ranking (compareCandidate)
        // is the SAME focus rule as single-target, so an AoE competes on (lowest-effHp,
        // total-magnitude) rather than on raw cluster size.
        const affected = unitsInAoeBox(state.grid, state.units, aim.pos, ability.aoe).filter((u) =>
          heal ? u.teamId === actor.teamId : u.teamId !== actor.teamId,
        );
        let magnitude = 0;
        let affectedCount = 0;
        let kos = 0;
        let minEffHp = Infinity;
        for (const t of affected) {
          const raw = estMagnitude(actor, t, ability);
          if (heal) {
            const gain = Math.min(t.maxHp - t.hp, raw);
            if (gain <= 0) continue; // this ally has no HP to restore
            magnitude += gain;
          } else {
            if (raw <= 0) continue; // a 0-damage tick on this foe is worthless
            magnitude += raw;
            if (raw >= t.hp) kos += 1;
          }
          affectedCount += 1;
          if (t.hp < minEffHp) minEffHp = t.hp;
        }
        if (affectedCount === 0) continue; // the box catches nothing worth a turn
        const cls = heal ? ACTION_CLASS.HEAL : kos >= 1 ? ACTION_CLASS.LETHAL : ACTION_CLASS.CHIP;
        cands.push({
          cls,
          magnitude,
          targetEffHp: minEffHp,
          facingRank: FACING_RANK[relativeFacing(aim, from)],
          moved,
          from,
          targetId: aim.id,
          abilityIndex,
          ability,
          target: aim,
        });
        continue;
      }

      const raw = estMagnitude(actor, aim, ability);
      let magnitude: number;
      let cls: number;
      if (heal) {
        magnitude = Math.min(aim.maxHp - aim.hp, raw);
        if (magnitude <= 0) continue; // no HP to restore → not worth a turn
        cls = ACTION_CLASS.HEAL;
      } else {
        if (raw <= 0) continue; // a 0-damage swing is not worth a turn
        magnitude = raw;
        cls = raw >= aim.hp ? ACTION_CLASS.LETHAL : ACTION_CLASS.CHIP;
      }
      const facing = relativeFacing(aim, from);
      cands.push({
        cls,
        magnitude,
        targetEffHp: aim.hp,
        facingRank: FACING_RANK[facing],
        moved,
        from,
        targetId: aim.id,
        abilityIndex,
        ability,
        target: aim,
      });
    }
  });
  return cands;
}

/**
 * Every candidate the actor could produce THIS TURN: acts from where it stands
 * (`moved: 0`, a −80 turn) plus acts from every tile it can reach (`moved: 1`, the
 * folded −100 turn of ADR-0015 / docs/01 §2).
 *
 * `moveRange` EXCLUDES the start tile and every occupied tile, so the stay option is
 * added explicitly and can never be double-counted. Enumeration order is
 * stay-then-(y,x)-sorted-tiles, but nothing depends on it: {@link compareCandidate} is
 * a TOTAL order down to the `from` coordinates, so the winner is singular regardless.
 *
 * COST: |reachable| x |abilities| x |units|. Bounded by the move stat (a handful of
 * tiles), and still zero-RNG and pure — the AI adds nothing to `rngCounter`.
 */
function allCandidates(state: BattleState, actor: UnitState): Candidate[] {
  const cands = candidatesFrom(state, actor, actor.pos, 0);
  for (const tile of moveRange(state.grid, state.units, actor.id)) {
    cands.push(...candidatesFrom(state, actor, tile, 1));
  }
  return cands;
}

/**
 * The declared TOTAL ORDER over candidates (returns < 0 when `a` is preferred):
 * class asc → [class-dependent focus keys] → facing asc (rear best) → unitId asc →
 * ability index asc. The last two keys make every (target, ability) pair unique, so
 * there is always a SINGULAR winner (no Map/Set fallback).
 *
 * The focus keys are shape-shared by CHIP and HEAL (both apply AC-E3(b) as a FOCUS
 * rule — a foe to finish, an ally to save) and differ for LETHAL (already a kill), not
 * a big-hit rule:
 *   - CHIP (non-lethal damage): effHp ASC first, then magnitude DESC — focus the
 *     lowest-effective-HP foe even when a Zodiac/Protect asymmetry makes a higher-HP
 *     foe the bigger hit (docs/06 §4). Applied UNIFORMLY to single-target and area
 *     acts: an area act carries the LOWEST effHp it would hit and its SUMMED
 *     magnitude, so it competes on (focus, total-damage) like any other chip. An AoE
 *     therefore wins only when it reaches a lower-HP foe, OR ties the focus target
 *     and out-totals it (hits the same weakest foe PLUS others) — never merely by
 *     catching more units. [Decision: replaced an earlier spread-DESC-first key that
 *     preferred cluster size over focus and could rank a 2-for-1-damage tap above a
 *     near-lethal single-target chip; reviewer S2. Uniform effHp→magnitude keeps the
 *     comparator a single transitive total order and preserves AC-E3(b).]
 *   - HEAL: effHp ASC first, then magnitude DESC — TRIAGE the dying ally. AC-E3(b) is
 *     a FOCUS rule and it applies on the ally side too: heal the LOWEST-effective-HP
 *     ally (the one closest to death), and only AMONG ties on urgency prefer the bigger
 *     effective heal. Identical SHAPE to CHIP, mirrored onto allies — never a "biggest
 *     heal wins" rule that would overheal a lightly-wounded ally while a dying one falls.
 *     Applied UNIFORMLY to single-target and area heals (an area heal carries the LOWEST
 *     effHp among the allies it restores and its SUMMED effective heal). NOTE the class
 *     order is UNCHANGED: LETHAL (0) still outranks HEAL (2), so this is never a
 *     panic-heal-over-kill — a securable kill always beats healing a hurt ally.
 *   - LETHAL: magnitude DESC first (unchanged) — every lethal already kills, so
 *     rank by overkill margin (summed, for an area act) then effHp.
 * Comparisons only reach the focus keys when `a.cls === b.cls`, so branching on the
 * (shared) class is well-defined; the focus keys are reached for CHIP and HEAL and never
 * mix classes (no bucket-first/cross-class key), preserving a single transitive total order.
 */
function compareCandidate(a: Candidate, b: Candidate): number {
  if (a.cls !== b.cls) return a.cls - b.cls;
  if (a.cls === ACTION_CLASS.CHIP || a.cls === ACTION_CLASS.HEAL) {
    // FOCUS/TRIAGE: lowest effHp first (AC-E3(b)), then bigger total magnitude. CHIP
    // focuses the lowest-HP FOE; HEAL triages the lowest-HP ALLY — the same shape on the
    // ally side. UNIFORM for single-target and area acts (an area act carries its
    // lowest-affected effHp and summed magnitude), so a wide-but-weak tap can never
    // out-rank a focus on a lower-HP unit — see the docstring (reviewer S2). Reached only
    // when a.cls === b.cls, so CHIP and HEAL never compare against each other here.
    if (a.targetEffHp !== b.targetEffHp) return a.targetEffHp - b.targetEffHp;
    if (a.magnitude !== b.magnitude) return b.magnitude - a.magnitude;
  } else {
    // LETHAL (kills): magnitude-first (unchanged) — rank by overkill margin, then effHp.
    if (a.magnitude !== b.magnitude) return b.magnitude - a.magnitude;
    if (a.targetEffHp !== b.targetEffHp) return a.targetEffHp - b.targetEffHp;
  }
  if (a.facingRank !== b.facingRank) return a.facingRank - b.facingRank;
  // TEMPO (ADR-0015): among acts that are otherwise IDENTICAL, prefer the one that does
  // not move — a folded turn costs −100 CT versus −80, so moving must buy something.
  // Deliberately BELOW facingRank: a rear/side arc reachable only by walking outranks a
  // front-arc swing from standing, which is precisely the flank-then-strike turn every
  // closer archetype in docs/03 needs. Deliberately ABOVE targetId/abilityIndex: those
  // are arbitrary disambiguators, and letting an id letter outrank 20 CT would be noise
  // deciding tempo.
  if (a.moved !== b.moved) return a.moved - b.moved;
  if (a.targetId !== b.targetId) return a.targetId < b.targetId ? -1 : 1;
  if (a.abilityIndex !== b.abilityIndex) return a.abilityIndex - b.abilityIndex;
  // Two reachable tiles can yield an otherwise-identical act (same target, same ability,
  // same arc). Break on (y, x) so the order stays TOTAL and the winner never depends on
  // enumeration order or on `reduce`'s first-wins accident.
  if (a.from.y !== b.from.y) return a.from.y - b.from.y;
  return a.from.x - b.from.x;
}

/** Encode a chosen candidate as a driver {@link Command} (tile vs unit target). */
function toActCommand(c: Candidate): Command {
  // A charged action OR an area action resolves against a TILE (the aim centre —
  // the occupant may vacate a charge before maturity, the counterplay; an area act
  // is inherently tile-centred). An instant single-target action locks the UNIT.
  const target =
    c.ability.speed !== null || c.ability.aoe !== null
      ? { x: c.target.pos.x, y: c.target.pos.y }
      : { unitId: c.target.id };
  // The FOLD (ADR-0015): `order: "before"` — walk first, then resolve from the
  // destination, settling ONCE at −100. Only "before" is ever emitted: "after"
  // (hit-and-retreat) exists in the schema and driver but is not a shape this 1-ply
  // greedy policy can evaluate, since it would have to price a retreat tile against an
  // outcome it has not rolled yet. A charged act combines legally with "before"
  // (AC-V5) and is rejected with "after", so this stays inside the driver's contract.
  if (c.moved === 1) {
    return {
      kind: "act",
      abilityId: c.ability.id,
      target,
      move: { to: { x: c.from.x, y: c.from.y }, order: "before" },
    };
  }
  return { kind: "act", abilityId: c.ability.id, target };
}

/** The prime enemy to chase when no action is in range: lowest HP → nearest → id asc. */
function primeEnemy(state: BattleState, actor: UnitState): UnitState | null {
  let prime: UnitState | null = null;
  for (const e of state.units) {
    if (e.hp <= 0 || e.teamId === actor.teamId) continue;
    if (prime === null) {
      prime = e;
      continue;
    }
    if (e.hp !== prime.hp) {
      if (e.hp < prime.hp) prime = e;
      continue;
    }
    const de = manhattan(actor.pos, e.pos);
    const dp = manhattan(actor.pos, prime.pos);
    if (de !== dp) {
      if (de < dp) prime = e;
      continue;
    }
    if (e.id < prime.id) prime = e;
  }
  return prime;
}

/**
 * When nothing is in range, step toward the prime enemy: the reachable tile that
 * MINIMIZES Manhattan distance to it, tie-broken by `moveRange`'s (y, x) ordering
 * (first minimal wins). Only moves if it strictly closes the gap — otherwise Wait
 * (avoids pointless CT-churning shuffles when boxed in).
 */
function moveTowardPrime(state: BattleState, actor: UnitState): Command {
  const prime = primeEnemy(state, actor);
  if (!prime) return { kind: "wait" };
  const tiles = moveRange(state.grid, state.units, actor.id); // sorted (y, x)
  const stayD = manhattan(actor.pos, prime.pos);
  let bestTile: { x: number; y: number } | null = null;
  let bestD = stayD;
  for (const t of tiles) {
    const d = manhattan(t, prime.pos);
    if (d < bestD) {
      bestD = d;
      bestTile = t;
    }
  }
  if (!bestTile) return { kind: "wait" };
  return { kind: "move", to: { x: bestTile.x, y: bestTile.y } };
}

/** The (onPath, distToP, distToE) sort key of a tile w.r.t. a threat E and protectee P. */
interface ScreenKey {
  /** 0 iff the tile lies ON a shortest Manhattan path E→P (blocks that traversal), else 1. */
  onPath: number;
  /** Manhattan distance to the protectee (ASC — hug the charger). */
  distToP: number;
  /** Manhattan distance to the threat (ASC — meet the attacker earlier). */
  distToE: number;
}

/**
 * SUPPORT-AWARE SCREENING ("protect-the-enabler / body-screen", docs/06 AC-E3 family,
 * ADR-0014). A PURE, zero-RNG MOVEMENT-FALLBACK helper — reached only when the actor
 * has NO in-range action, so it is STRICTLY BELOW the action return: a screener that
 * can land a kill/chip/heal always acts instead (this never enters
 * {@link compareCandidate} and creates no candidate).
 *
 * MECHANISM is REACHABILITY, not zone-of-control: the actor steps onto a tile that lies
 * on the enemy's shortest traversal path to a mid-charge ally. Because {@link moveRange}
 * treats occupied tiles as impassable / forbids ending on them, the screener's body then
 * blocks that approach and makes the screener the only in-range foe when the greedy
 * attacker arrives — buying the slow charger time to mature. Effectiveness is
 * GEOMETRY-bound: it holds on a constrained map (the body is the only passable approach)
 * and LEAKS on an open map (the enemy routes around) — expected, not a defect. CAPABILITY
 * GAP: when the threat is ADJACENT to the charger (`distEP === 1`), the only on-path tiles
 * are E and P themselves — both occupied, so excluded by moveRange — and no screen can
 * form (returns null → moveTowardPrime); screening only helps while the attacker is still
 * approaching.
 *
 * Returns a {@link Command}: an interpose Move onto a strictly-better on-path tile, OR a
 * `wait` to HOLD an on-path tile the actor already stands on (never a null there — a null
 * would let moveTowardPrime walk the screener off its post and oscillate), OR `null` to
 * fall through to {@link moveTowardPrime} (no mid-charge ally / too-squishy screener / no
 * threat / no reachable on-path tile — behaviour then byte-identical to the pre-screening
 * AI).
 */
function tryScreen(state: BattleState, actor: UnitState): Command | null {
  // PROTECTEE — a living ALLY (never self) that is MID-CHARGE, i.e. owns a chargeQueue
  // entry (`sourceUnitId`). Only charging units qualify, so on the shipped roster only
  // the glass summoner / a charging black-mage is ever a protectee (fillers do not
  // charge). Rank effHp (= hp, the D2 convention) ASC then id ASC: screen the neediest
  // charger. (TIER B — widening this to "owns a charged ability" so fillers pre-position
  // from turn 1 — was measured and did NOT improve summoner survival: on the 2-filler /
  // 3-bruiser candidate teams the single-lane body-block still leaks the OTHER approach
  // to the corner-seated summoner, so pre-positioning changes nothing. Kept as Tier A
  // only, minimal blast radius; see the measurement report.)
  let protectee: UnitState | null = null;
  for (const ally of state.units) {
    if (ally.id === actor.id || ally.hp <= 0 || ally.teamId !== actor.teamId) continue;
    if (!state.chargeQueue.some((c) => c.sourceUnitId === ally.id)) continue;
    if (protectee === null) {
      protectee = ally;
      continue;
    }
    if (ally.hp !== protectee.hp) {
      if (ally.hp < protectee.hp) protectee = ally;
      continue;
    }
    if (ally.id < protectee.id) protectee = ally;
  }
  if (!protectee) return null; // no mid-charge ally → moveTowardPrime (behaviour unchanged)

  // SCREENER GUARD — don't send a body with less RAW CURRENT hp than the charger to tank
  // for it. Compares raw `hp` (not maxHp / effHp), so it fails SAFE: a chipped-but-sturdy
  // filler that dips below the charger's hp simply declines to screen (a conservative
  // false-negative), never the reverse. Since only charging units are protectees, in
  // practice only the summoner's healthier fillers screen.
  if (actor.hp < protectee.hp) return null;

  // THREAT E — the enemy nearest (Manhattan) to the protectee P; tie-break id ASC.
  let threat: UnitState | null = null;
  for (const e of state.units) {
    if (e.hp <= 0 || e.teamId === actor.teamId) continue;
    if (threat === null) {
      threat = e;
      continue;
    }
    const de = manhattan(e.pos, protectee.pos);
    const dt = manhattan(threat.pos, protectee.pos);
    if (de !== dt) {
      if (de < dt) threat = e;
      continue;
    }
    if (e.id < threat.id) threat = e;
  }
  if (!threat) return null;

  const P = protectee.pos;
  const E = threat.pos;
  const distEP = manhattan(E, P);
  const keyOf = (t: Position): ScreenKey => ({
    onPath: manhattan(E, t) + manhattan(t, P) === distEP ? 0 : 1,
    distToP: manhattan(t, P),
    distToE: manhattan(t, E),
  });
  const better = (a: ScreenKey, b: ScreenKey): boolean =>
    a.onPath !== b.onPath
      ? a.onPath < b.onPath
      : a.distToP !== b.distToP
        ? a.distToP < b.distToP
        : a.distToE < b.distToE;

  // INTERPOSE TILE — the ASC-best over the actor's reachable tiles (moveRange is already
  // (y,x)-sorted, so keeping the FIRST tile that ties the key reproduces moveTowardPrime's
  // final tie-break). Pure integer math; no Map/Set iteration decides anything.
  const tiles = moveRange(state.grid, state.units, actor.id);
  let best: Position | null = null;
  let bestKey: ScreenKey | null = null;
  for (const t of tiles) {
    const k = keyOf(t);
    if (bestKey === null || better(k, bestKey)) {
      best = t;
      bestKey = k;
    }
  }
  if (!best || !bestKey) return null; // no reachable tile → moveTowardPrime (likely Wait)

  // ACTIVATION GUARD — interpose ONLY if the best reachable tile actually blocks the
  // E→P path (`onPath === 0`) AND strictly improves (onPath, distToP) over the actor's
  // CURRENT tile. If the best reachable tile is off-path, there is no screen to form →
  // null → moveTowardPrime.
  if (bestKey.onPath !== 0) return null;
  const cur = keyOf(actor.pos);
  const strictlyImproves =
    bestKey.onPath < cur.onPath || (bestKey.onPath === cur.onPath && bestKey.distToP < cur.distToP);
  if (!strictlyImproves) {
    // HOLD THE SCREEN — not a null fall-through. This branch is ONLY reachable when the
    // actor is ALREADY on an optimal on-path tile: `bestKey.onPath === 0`, so
    // `!strictlyImproves` forces `cur.onPath === 0` (were it 1, `0 < 1` would strictly
    // improve) AND `cur.distToP <= bestKey.distToP`. Returning `null` here would fall
    // through to moveTowardPrime, which walks the screener OFF its post toward the prime
    // — then it re-screens next turn and OSCILLATES, abandoning the charger every other
    // turn. `wait` therefore always means "hold the on-path tile I'm standing on".
    return { kind: "wait" };
  }

  return { kind: "move", to: { x: best.x, y: best.y } };
}

/**
 * Decide ONE {@link Command} for the unit whose turn it is (docs/06). Pure, zero
 * RNG. Order: disabled → wait; else the best in-range action (lexicographic order
 * above); else try to SCREEN a mid-charge ally ({@link tryScreen}); else step toward
 * the prime enemy; else wait. Screening is STRICTLY below the action return — any
 * in-range action always wins — and never enters {@link compareCandidate}.
 */
export function decideBalanceProbe(state: BattleState, unitId: string): Command {
  const actor = state.units.find((u) => u.id === unitId);
  if (!actor) throw new Error(`decideBalanceProbe: unknown unit ${unitId}`);

  // Step 0: a disabling status (Stop/Sleep/Don't-Act/Petrify) forbids acting.
  if (actor.statuses.some((st) => st.preventsAction)) return { kind: "wait" };

  const cands = allCandidates(state, actor);
  if (cands.length > 0) {
    const best = cands.reduce((acc, c) => (compareCandidate(c, acc) < 0 ? c : acc));
    return toActCommand(best);
  }
  // MOVEMENT FALLBACK — now reached only when NO action is available from the actor's
  // tile OR from ANY tile it can reach. Under the fold this branch is strictly rarer
  // than before: a unit that can walk into range now attacks instead of merely closing.
  // That deliberately narrows SCREENING too (docs/06 AC-E3 family, ADR-0014) — a
  // screener able to reach a kill/chip/heal now takes it, which is the same
  // "any in-range action always wins" rule the screen docstring already declares,
  // applied to the wider reach the fold creates. It shifts the gate's numbers; measure,
  // do not assume.
  const screen = tryScreen(state, actor);
  return screen ?? moveTowardPrime(state, actor);
}
