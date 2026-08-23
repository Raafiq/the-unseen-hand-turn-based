/**
 * The demo battle + its presentation metadata + a pure turn-order forecast.
 *
 * Render-layer glue, not sim code. There is deliberately NO step policy here any
 * more: `stepDemo` was a SECOND turn-settling implementation (it called
 * `settleTurn` directly, outside the driver) and therefore a fork of the
 * `(seed, ordered commands)` substrate. Per ADR-0015 the viewer now advances with
 * `advanceToDecision` and commits with `applyCommand` — see `session.ts`.
 *
 * Also gone with it: the scripted Slow hex. It was render-layer FICTION — the UI
 * asserting a status the sim never inflicts (inflict-on-hit is deferred,
 * ADR-0010) — which docs/00 pillar 4 forbids. The Knight's opening **Protect**
 * survives because it is applied at battle construction through the sim's own
 * exported helper, so it is a real status the resolvers actually read.
 *
 * {@link forecast} lives here too, and it is the one thing in the viewer that
 * cannot be exact: it must price turns nobody has chosen yet. It therefore
 * returns its own honesty boundary ({@link Forecast.assumedFrom}) alongside the
 * entries, keeps its single guess in {@link ASSUMED_FUTURE_TURN}, and is held to
 * a forecast-vs-replay oracle in `forecast.test.ts`.
 */

// The `with { type: "json" }` attribute is REQUIRED, not decorative: `e2e/play.spec.ts`
// imports this module and Playwright loads it through Node's ESM loader, which rejects a
// bare JSON import. Vite (dev, build, vitest) is happy either way, so dropping the
// attribute fails ONLY in the browser-test job — `npm run check` would stay green.
import pack from "../../data/base-pack.json" with { type: "json" };
import {
  CT_COST_ONE,
  CT_COST_WAIT,
  advanceToNextTurn,
  applyStatusToUnit,
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  loadContentPack,
  makeFlatTiles,
  settleTurn,
  toBattleAbility,
  type ActiveActor,
  type BattleAbility,
  type BattleState,
  type ContentRegistry,
  type UnitState,
} from "../sim/index.js";

/**
 * The SHIPPED content pack, so a demo unit's skill is the real authored one —
 * same registry `prep.ts` reads. A hand-written `BattleAbility` literal in here
 * would be a second copy of the pack's numbers that nothing checks, which is the
 * defect class this viewer keeps re-learning: authored, plausible, and quietly
 * out of step with what the sim actually resolves.
 */
const registry: ContentRegistry = loadContentPack(pack);

/** One authored ability, projected exactly as `buildBattleUnit` would project it. */
const skill = (id: string): BattleAbility =>
  toBattleAbility(registry.ability(id), undefined, (sid) => registry.status(sid));

export interface DemoUnitMeta {
  label: string;
  color: string;
  role: string;
}

/** Presentation metadata by unit id (render-only; not part of BattleState). */
export const UNIT_META: Record<string, DemoUnitMeta> = {
  knight: { label: "Knight", color: "#4f8cff", role: "Team A · Spd 9" },
  archer: { label: "Archer", color: "#2fb6c8", role: "Team A · Spd 11" },
  brawler: { label: "Brawler", color: "#e2603c", role: "Team B · Spd 8" },
  mage: { label: "Mage", color: "#c86ee0", role: "Team B · Spd 13" },
};

/**
 * The PLAYER-controlled team of the demo battle.
 *
 * TODO(controller): read this from the encounter instead. `EncounterSchema`
 * already carries it per team as `Encounter.teams[].controller`
 * (`"ai" | "player"`, see `src/sim/encounter.ts`), but the demo builds a
 * `BattleState` DIRECTLY via `createBattleState` rather than through
 * `loadEncounter`, and `BattleState` itself carries no controller field — so the
 * value is genuinely not reachable here. When the viewer loads a real encounter,
 * derive this from `teams.find(t => t.controller === "player").teamId` and delete
 * the constant (docs/10 §2).
 */
export const PLAYER_TEAM = 0;

const unit = (id: string, teamId: number, over: Partial<UnitState>): UnitState =>
  defaultUnit(id, teamId, { jump: 2, ...over });

/** A small map with a central plateau, a ramp, and one impassable rock. */
export function makeDemoBattle(): BattleState {
  const width = 9;
  const height = 7;
  const tiles = makeFlatTiles(width, height, 0);
  const set = (x: number, y: number, h: number, passable = true): void => {
    tiles[y * width + x] = { height: h, passable };
  };
  // Central plateau (height 2) with a skirt of height-1 tiles (a climbable ramp).
  set(4, 3, 2);
  set(3, 3, 1);
  set(5, 3, 1);
  set(4, 2, 1);
  set(4, 4, 1);
  // An impassable rock the pathing must route around.
  set(6, 2, 0, false);

  const units: UnitState[] = [
    unit("knight", 0, {
      pos: { x: 1, y: 1 }, facing: "S", speed: 9, move: 4, hp: 260, maxHp: 260,
      pa: 11, brave: 72, zodiac: { sign: "aries", gender: "male" },
      weapon: { wp: 15, formula: "braveWp", element: "none", accuracy: 100 },
      evasion: { classEv: 10, weaponEv: 0, shieldEv: 15, accessoryEv: 0, magicEv: 0 },
    }),
    unit("archer", 0, {
      pos: { x: 1, y: 5 }, facing: "E", speed: 11, move: 4, hp: 210, maxHp: 210,
      pa: 9, brave: 68, zodiac: { sign: "taurus", gender: "female" },
      weapon: { wp: 10, formula: "speedWp", element: "none", accuracy: 100 },
      evasion: { classEv: 15, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    }),
    unit("brawler", 1, {
      pos: { x: 7, y: 1 }, facing: "W", speed: 8, move: 3, jump: 3, hp: 260, maxHp: 260,
      pa: 13, brave: 75, zodiac: { sign: "gemini", gender: "male" },
      weapon: { wp: 0, formula: "bareHands", element: "none", accuracy: 100 },
      evasion: { classEv: 25, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
      // THE ONE REACTION ON THE FIELD (ADR-0019). Without it the demo never shows the
      // capability that just shipped: the preview's counter-risk row would be dead code
      // in the only build a player actually touches. The Monk-alike is where it belongs
      // (`punch-art.counter` is a Punch Art capstone), it costs the brawler no stat, and
      // at Brave 75 it makes "walk up and swing at the brawler" a decision rather than a
      // default — which is the whole point of surfacing it.
      reaction: { abilityId: "punch-art.counter", kind: "counter" },
    }),
    unit("mage", 1, {
      pos: { x: 7, y: 5 }, facing: "N", speed: 13, move: 3, jump: 1, hp: 160, maxHp: 160,
      pa: 7, ma: 12, brave: 60, faith: 65, zodiac: { sign: "cancer", gender: "female" },
      weapon: { wp: 6, formula: "paWp", element: "none", accuracy: 100 },
      evasion: { classEv: 8, weaponEv: 0, shieldEv: 0, accessoryEv: 0, magicEv: 0 },
    }),
  ];

  // The Mage's charged spell is a LOADOUT-DERIVED ability (Slice 5): it lives in
  // the mage's `abilities` projection alongside its auto basic attack, so the
  // driver sources the cast's speed/effect from the loadout, not an inline
  // constant — and the balance-probe AI can select it like any other action.
  const mage = units.find((u) => u.id === "mage")!;
  mage.abilities = [...mage.abilities, MAGE_SPELL_ABILITY];

  // JOB SKILLS FOR THE MELEE THREE. Until now the Archer and the Brawler projected
  // `basic.attack` and nothing else, so the playable demo showed none of the
  // customization pillar and — pointedly — the Archer could not shoot. `docs/10` §5
  // recorded that as a known limitation but named the wrong blocker: it read
  // "weapon range is unmodeled", which is true of the WEAPON and irrelevant here.
  // An Archer reaches range 5 through its own `aim.` skill, which needs no equipment
  // layer at all. (The other stated reason — "don't hand team 0 an ability, that is
  // the job-identity-masked failure" — is about a BORROWED ability, e.g. a Knight
  // casting Fire. Its own job's skill is the opposite of masking.)
  //
  // ONE skill each, deliberately. `targetOptions` takes the FIRST in-range ability in
  // array order, and the viewer has no ability picker, so a second same-range skill
  // could never be selected — it would ship exactly as dead as the fields this slice
  // just finished bringing to life.
  //
  // ORDER IS LOAD-BEARING: `basic.attack` stays at index 0, so an ADJACENT foe is
  // still struck with the weapon (the Archer's speedWp swing genuinely out-damages
  // its own shot up close) and the skill is reached only where the swing cannot
  // reach. That is the range/tempo asymmetry `docs/10` §5 said the viewer could not
  // demonstrate.
  const archer = units.find((u) => u.id === "archer")!;
  archer.abilities = [...archer.abilities, skill("aim.aimed-shot")]; // h5 v3
  const brawler = units.find((u) => u.id === "brawler")!;
  brawler.abilities = [...brawler.abilities, skill("punch-art.wave-fist")]; // h3 v1

  // THE BRAWLER'S REACH ONLY BECAME SAFE AFTER THE HP RE-TUNE ABOVE, and that ordering
  // is the whole lesson. At the old roster HP this exact line let the Brawler KO the
  // player's Archer on the AI's FIRST turn from three tiles — 143 into 90 — so the
  // player never fired the bow. The skill was never the fault: its bare-handed swing
  // also one-shot the Archer (117 into 90). Reach on a one-shot roster just delivers
  // the one-shot sooner. In band the same 143 is a 2-action kill, which is a threat to
  // answer rather than a coin flip.
  //
  // The KNIGHT keeps only its swing for a different and honest reason:
  // `battle-skill` is the one shipped skillset with no live action at all (every
  // `*-break` is `formula: "none"`). Handing it a borrowed skill to paper over that
  // would be the masking failure above. It stays a plain bruiser until the
  // break/debuff rework lands.

  const state = createBattleState({ seed: 20260730, grid: { width, height, tiles }, units });

  // Showcase a BUFF from the opening frame: the Knight is a defender who steps in
  // already under Protect (docs/01 §6 — reduces incoming physical damage). Applied
  // through the sim's exported helper (never a hand-built status object) and kept
  // PERMANENT so the badge is visible in the initial screenshot and never decays.
  // It is a REAL status: `attackDamage` reads it, so the previewed and the dealt
  // number both include the reduction.
  return applyStatusToUnit(state, "knight", legacyActiveStatus("protect"));
}

/** The Mage's charged spell: a slow nuke (low speed → dodgeable, docs/01 §3). */
const MAGE_CAST_RANGE = 6;
const MAGE_SPELL_ID = "spell.fire";
const MAGE_SPELL_ABILITY: BattleAbility = {
  id: MAGE_SPELL_ID,
  actionKind: "action",
  formula: "magic",
  power: 22,
  element: "fire",
  accuracy: 100,
  range: { h: MAGE_CAST_RANGE, v: 3 },
  inflicts: [],
  speed: 12,
  aoe: null,
};

/** Which sub-phases a turn is priced as having used (the `settleTurn` opts). */
export interface FutureTurn {
  didMove: boolean;
  didAct: boolean;
}

/**
 * ============== THE ONE ASSUMPTION IN THE WHOLE FORECAST =====================
 *
 * A forecast CANNOT know what a future actor will choose — move? act? both?
 * wait? — so it cannot know what that turn will cost. This constant is the
 * single place where {@link forecast} guesses, and it guesses **one sub-phase**:
 * `{didMove:false, didAct:true}` ⇒ {@link ASSUMED_FUTURE_TURN_COST} = −80 CT.
 *
 * IT IS THE MODEL ADR-0015 EXISTS TO DISPROVE. A real turn costs −100 when both
 * sub-phases are used (the fold), −80 for one, −60 for a Wait; and a KO'd unit's
 * turn is a crystal tick, which `tickCrystal` prices at −60. So this guess is
 * wrong for any of those.
 *
 * THE FOLD HAS SINCE LANDED (`ai.ts` emits `act` with a `move` clause), so every
 * AI turn on the field now costs −100 and the guess is wrong for all of them —
 * the case this comment used to describe in the future tense. Nothing broke,
 * because the answer was never "guess better": guessing harder only moves the
 * lie around. The answer is the boundary this module computes and the UI labels,
 * {@link Forecast.assumedFrom}, which is derived at the CHEAPEST turn (−60) and
 * is therefore independent of this constant.
 *
 * `forecast.test.ts` is the oracle that says so rather than this comment: it
 * asserts the realized actor order matches the forecast over `[0, assumedFrom)`
 * under BOTH cost models, on a purpose-built speed ladder where −80 and −100
 * genuinely disagree (the shipped demo state does not — measured, and asserted
 * there, so nobody re-derives this fixture back to the demo map).
 *
 * WHAT IS STILL OPEN, and is a tuning question rather than a correctness one:
 * whether −80 is the best guess now that AI turns fold. A player who only moves
 * OR acts still realizes −80, so the honest answer depends on whose turn is
 * being projected, and both are asserted today. Changing it would move only the
 * PROJECTED slots' accuracy — never `assumedFrom`, never the exact prefix.
 * =============================================================================
 */
export const ASSUMED_FUTURE_TURN: FutureTurn = { didMove: false, didAct: true };

/** The CT {@link ASSUMED_FUTURE_TURN} prices a future turn at (−80). */
export const ASSUMED_FUTURE_TURN_COST = CT_COST_ONE;

/**
 * The CHEAPEST turn any actor can legally take (a Wait, −60). Not a second
 * assumption — a bound. A unit that just acted returns to the top of the order
 * SOONEST when its turn was the cheapest one, so walking the timeline at this
 * cost finds the EARLIEST index at which any already-forecast unit can possibly
 * come round again. That index is {@link Forecast.assumedFrom}.
 */
const CHEAPEST_FUTURE_TURN: FutureTurn = { didMove: false, didAct: false };

/**
 * The CT a {@link CHEAPEST_FUTURE_TURN} costs (−60). Exported so the oracle test
 * can assert the bound it rests on — `CHEAPEST ≤ ASSUMED ≤ CT_COST_MOVE_AND_ACT`
 * — rather than taking this comment's word for it.
 */
export const CHEAPEST_FUTURE_TURN_COST = CT_COST_WAIT;

/** The turn-order timeline: the next actors, plus where the guessing starts. */
export interface Forecast {
  /** The next `n` actors, in order. `entries[0]` is whoever acts next. */
  entries: ActiveActor[];
  /**
   * THE HONESTY BOUNDARY. `entries[0 … assumedFrom)` do NOT depend on
   * {@link ASSUMED_FUTURE_TURN_COST}. A unit's CT cost only ever moves **its own
   * next** turn, and no unit is listed twice inside that stretch — so no slot in
   * it sits downstream of a guessed price, and they come out identical whatever
   * each turn actually ends up costing. From `assumedFrom` on, at least one slot
   * is downstream of the guess and can move.
   *
   * `assumedFrom` is computed at {@link CHEAPEST_FUTURE_TURN} — the earliest any
   * actor can return — so it is a *lower* bound on where the guess can first
   * bite; it never claims exactness it cannot back.
   *
   * WHAT IT DOES **NOT** COVER (stated rather than hidden): a future actor's
   * *choice* can change the timeline's COMPOSITION, not just its clock. Beginning
   * a charged cast inserts a brand-new actor (`chargeQueue`) that no forecast can
   * anticipate, and a crystallizing KO removes one. So the leading stretch is
   * exact **with respect to the CT-cost model**; it is still contingent on nobody
   * ahead of it starting a cast. The UI hint says exactly this.
   */
  assumedFrom: number;
}

/**
 * Walk the shared timeline `n` actors forward, pricing every future unit turn at
 * `turn`. Charges are spliced out (preview only — the real resolution happens in
 * the driver). Pure: `advanceToNextTurn` and `settleTurn` both clone, so the
 * caller's state is never touched and no RNG is consumed.
 */
function walk(input: BattleState, n: number, turn: FutureTurn): ActiveActor[] {
  let state = input;
  const out: ActiveActor[] = [];
  for (let i = 0; i < n; i++) {
    const { state: adv, active } = advanceToNextTurn(state);
    if (!active) break;
    out.push(active);
    if (active.kind === "unit") {
      state = settleTurn(adv, active.id, turn);
    } else {
      // Preview only: drop the matured charge so the forecast advances past it
      // (the real resolution happens in the driver, not here).
      const idx = adv.chargeQueue.findIndex((c) => c.id === active.id);
      if (idx !== -1) adv.chargeQueue.splice(idx, 1);
      state = adv;
    }
  }
  return out;
}

/** Index of the first actor that has already appeared, or `actors.length`. */
function firstRepeat(actors: readonly ActiveActor[]): number {
  const seen = new Set<string>();
  for (let i = 0; i < actors.length; i++) {
    const key = `${actors[i]!.kind}:${actors[i]!.id}`;
    if (seen.has(key)) return i;
    seen.add(key);
  }
  return actors.length;
}

/**
 * Forecast the next `n` actors without mutating state (turn-order timeline),
 * WITH the index at which it stops being a fact and starts being a projection.
 *
 * PURE PREVIEW: nothing here resolves, rolls or advances the real clock, so the
 * forecast can be recomputed on every hover without moving `rngCounter` or the
 * real `tick` (docs/10 AC-V6).
 *
 * See {@link Forecast.assumedFrom} for what the boundary does and does not
 * claim, and {@link ASSUMED_FUTURE_TURN} for the single guess it bounds.
 *
 * @param assumed EXPOSED FOR THE ORACLE TEST ONLY (`forecast.test.ts` re-walks
 *   the same timeline at −60 / −80 / −100 to prove `assumedFrom` really is the
 *   invariance boundary). Production callers must not pass it — a second call
 *   site with a different guess would be a second lie to keep in sync.
 */
export function forecast(input: BattleState, n = 8, assumed = ASSUMED_FUTURE_TURN): Forecast {
  const entries = walk(input, n, assumed);
  const earliest = firstRepeat(walk(input, n, CHEAPEST_FUTURE_TURN));
  return { entries, assumedFrom: Math.min(earliest, entries.length) };
}
