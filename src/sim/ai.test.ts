import { describe, it, expect } from "vitest";
import { decideBalanceProbe } from "./ai.js";
import {
  createBattleState,
  defaultUnit,
  legacyActiveStatus,
  serialize,
  type BattleState,
  type ChargedActionState,
  type UnitState,
} from "./state.js";
import type { BattleAbility } from "./ability.js";

/** A minimal MAGIC charge owned by `sourceUnitId` — the mid-charge marker tryScreen reads. */
function midCharge(sourceUnitId: string, targetTile = { x: 0, y: 0 }): ChargedActionState {
  return {
    id: `c.${sourceUnitId}`,
    sourceUnitId,
    ct: 40,
    speed: 20,
    targetTile,
    effect: { kind: "magic", power: 20, element: "none", accuracy: 100, aoe: null },
    interrupted: false,
  };
}

/** field(), but with a charge queue seeded (for screening fixtures). */
function fieldWithCharge(
  units: UnitState[],
  charges: ChargedActionState[],
  seed = 1,
  w = 6,
  h = 6,
): BattleState {
  const s = createBattleState({ seed, grid: { width: w, height: h }, units });
  s.chargeQueue.push(...charges);
  return s;
}

const HEAL_ABILITY: BattleAbility = {
  id: "heal.cure",
  actionKind: "action",
  formula: "heal",
  power: 12,
  element: "none",
  accuracy: 100,
  range: { h: 3, v: 3 },
  inflicts: [],
  speed: null,
  aoe: null,
};

/** A unit that keeps its auto basic attack and also carries `extra` abilities. */
function unitWith(id: string, teamId: number, over: Partial<UnitState>, extra: BattleAbility[] = []): UnitState {
  const u = defaultUnit(id, teamId, over);
  return { ...u, abilities: [...u.abilities, ...extra] };
}

function field(units: UnitState[], seed = 1, w = 6, h = 6): BattleState {
  return createBattleState({ seed, grid: { width: w, height: h }, units });
}

describe("decideBalanceProbe — AC-E3(a): flanks (rear > side > front) on an equal target", () => {
  it("attacks the enemy it can hit from the REAR over an identical front-facing enemy", () => {
    // hero at (2,2). A above facing S → hero strikes A's FRONT. B below facing S →
    // hero strikes B's REAR. Same HP/stats → facing is the only differentiator.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 2, y: 1 }, facing: "S", hp: 200, maxHp: 200 });
    const b = defaultUnit("B", 1, { pos: { x: 2, y: 3 }, facing: "S", hp: 200, maxHp: 200 });
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "B" } });
  });
});

describe("decideBalanceProbe — AC-E3(b): focuses the lower-HP target", () => {
  it("picks the lower-HP foe when class, magnitude, and facing tie", () => {
    // Both foes flank (side) at equal distance; only effHp differs → focus the 30-HP one.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10, weapon: { wp: 1, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 1, y: 2 }, facing: "S", hp: 60, maxHp: 60 });
    const b = defaultUnit("B", 1, { pos: { x: 3, y: 2 }, facing: "S", hp: 30, maxHp: 60 });
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "B" } });
  });
});

describe("decideBalanceProbe — AC-E3(b): FOCUS beats big-hit (effHp before magnitude)", () => {
  it("picks the lower-HP foe even when the higher-HP foe is the bigger hit", () => {
    // hero (aries) same-sign with A → Zodiac 'good' ×1.25, so A is the BIGGER hit;
    // but A also has the higher HP. B (taurus) is a neutral, smaller hit but lower
    // HP. AC-E3(b) is a FOCUS rule → the AI must take B (finish it sooner), not A.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 1, y: 2 }, facing: "S", hp: 200, maxHp: 200 }); // good ×1.25 → mag 100
    const b = defaultUnit("B", 1, { pos: { x: 3, y: 2 }, facing: "S", hp: 150, maxHp: 150, zodiac: { sign: "taurus", gender: "neutral" } }); // neutral → mag 80
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "B" } });
  });
});

describe("decideBalanceProbe — class order", () => {
  it("prefers a LETHAL blow over a mere CHIP", () => {
    // A is one-shot killable (LETHAL); B is a fat CHIP target. LETHAL outranks CHIP.
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } });
    const a = defaultUnit("A", 1, { pos: { x: 1, y: 2 }, facing: "N", hp: 40, maxHp: 40 });
    const b = defaultUnit("B", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500 });
    const cmd = decideBalanceProbe(field([hero, a, b]), "hero");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "A" } });
  });

  it("prefers HEAL a wounded ally over CHIPping an unkillable foe", () => {
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, ma: 10, faith: 50 }, [HEAL_ABILITY]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 20, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, hp: 500, maxHp: 500 });
    const cmd = decideBalanceProbe(field([healer, ally, foe]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "heal.cure", target: { unitId: "ally" } });
  });

  it("does NOT heal a full-HP ally (no benefit) — falls through to attacking", () => {
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, pa: 10, ma: 10 }, [HEAL_ABILITY]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 100, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500 });
    const cmd = decideBalanceProbe(field([healer, ally, foe]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } });
  });
});

describe("decideBalanceProbe — HEAL is a TRIAGE (focus) rule, not biggest-heal", () => {
  it("T1: heals the LOWEST-effHp ally over the BIGGER heal (triage ≠ big-heal)", () => {
    // The discriminating case where effHp and magnitude POINT DIFFERENT WAYS (an equal-
    // magnitude fixture is degenerate — the OLD comparator's SECOND key was already effHp
    // ASC, so both rules would agree). Raw heal = magicDamage(ma, q, casterFaith,
    // TARGET-faith), so it scales by the ALLY's Faith — we use that to make the DYING
    // ally's heal SMALLER than the less-hurt ally's:
    //   healer ma10 faith100, HEAL_ABILITY power12  → raw = floor(120·targetFaith/100)
    //   ally-b: hp 10 (dying), faith 10 → raw 12, missing 62 → magnitude 12,  effHp 10
    //   ally-a: hp 40 (hurt),  faith 50 → raw 60, missing 32 → magnitude 32,  effHp 40
    // Both in cure range; no foe interferes. magnitude and effHp DISAGREE, so the order
    // of the two keys IS the test:
    //   NEW (triage, effHp first):     effHp 10 < 40 → heal ally-b.  ✔ (save the dying one)
    //   OLD (big-heal, magnitude first): mag 32 > 12 → heal ally-a.  ✗ (overheals; discriminating)
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, ma: 10, faith: 100 }, [HEAL_ABILITY]);
    const allyA = defaultUnit("ally-a", 0, { pos: { x: 2, y: 3 }, hp: 40, maxHp: 72, faith: 50 });
    const allyB = defaultUnit("ally-b", 0, { pos: { x: 2, y: 1 }, hp: 10, maxHp: 72, faith: 10 });
    const cmd = decideBalanceProbe(field([healer, allyA, allyB]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "heal.cure", target: { unitId: "ally-b" } });
  });

  it("T2: takes a LETHAL over healing a wounded ally (class order LETHAL 0 < HEAL 2 preserved)", () => {
    // A wounded ally in cure range (HEAL candidate exists) AND a foe the actor one-shots
    // (LETHAL exists). Heal-triage must NOT be read as promoting HEAL above LETHAL — the
    // class order is unchanged, so the securable kill wins. Discriminating: if triage had
    // leaked into a cross-class key, the AI would panic-heal instead of killing.
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, pa: 10, ma: 10, faith: 50, weapon: { wp: 8, formula: "paWp", element: "none", accuracy: 100 } }, [HEAL_ABILITY]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 20, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 30, maxHp: 30 });
    const cmd = decideBalanceProbe(field([healer, ally, foe]), "healer");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } });
  });
});

describe("decideBalanceProbe — movement + passivity", () => {
  it("steps toward the prime enemy when nothing is in range", () => {
    const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, move: 3 });
    const foe = defaultUnit("foe", 1, { pos: { x: 6, y: 0 }, hp: 100, maxHp: 100 });
    const cmd = decideBalanceProbe(field([hero, foe], 1, 7, 1), "hero");
    // move 3 orthogonal toward (6,0) → the reachable tile nearest the foe is (3,0).
    expect(cmd).toEqual({ kind: "move", to: { x: 3, y: 0 } });
  });

  it("waits when disabled (a preventsAction status) even with a target in range", () => {
    const hero = defaultUnit("hero", 0, {
      pos: { x: 2, y: 2 },
      statuses: [legacyActiveStatus("stop")],
    });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, hp: 100, maxHp: 100 });
    expect(decideBalanceProbe(field([hero, foe]), "hero")).toEqual({ kind: "wait" });
  });

  it("waits when boxed in and unable to close the gap", () => {
    // Lone hero, move 0, foe out of range → cannot act, cannot get closer → wait.
    const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, move: 0 });
    const foe = defaultUnit("foe", 1, { pos: { x: 5, y: 0 }, hp: 100, maxHp: 100 });
    expect(decideBalanceProbe(field([hero, foe], 1, 7, 1), "hero")).toEqual({ kind: "wait" });
  });

  it("does NOT select a charged non-magic ability (driver enqueues charges as magic)", () => {
    // Only offensive/heal option is a CHARGED HEAL — unsafe today (the driver would
    // resolve it as magic DAMAGE on the ally tile). It must be skipped; with no foe
    // present the unit falls through to Wait rather than mis-casting on its ally.
    const chargedHeal: BattleAbility = { ...HEAL_ABILITY, id: "heal.slow-cure", speed: 20 };
    const healer = unitWith("healer", 0, { pos: { x: 2, y: 2 }, ma: 10 }, [chargedHeal]);
    const ally = defaultUnit("ally", 0, { pos: { x: 2, y: 1 }, hp: 20, maxHp: 100 });
    expect(decideBalanceProbe(field([healer, ally]), "healer")).toEqual({ kind: "wait" });
  });

  it("DOES select a charged MAGIC ability (the skip is not over-broad)", () => {
    // A charged magic nuke IS safe to select; encoded as a TILE target (charged/AoE).
    const nuke: BattleAbility = { id: "spell.nuke", actionKind: "action", formula: "magic", power: 8, element: "none", accuracy: 100, range: { h: 8, v: 8 }, inflicts: [], speed: 20, aoe: null };
    const caster = unitWith("caster", 0, { pos: { x: 2, y: 2 }, ma: 10, faith: 50 }, [nuke]);
    // Foe at range 3 → out of basic-attack (h1) range, so the nuke is the only option.
    const foe = defaultUnit("foe", 1, { pos: { x: 2, y: 5 }, hp: 100, maxHp: 100, faith: 50 });
    const cmd = decideBalanceProbe(field([caster, foe], 1, 6, 7), "caster");
    expect(cmd).toEqual({ kind: "act", abilityId: "spell.nuke", target: { x: 2, y: 5 } });
  });

  it("is a pure function — same (state, unit) yields the identical command twice", () => {
    const hero = defaultUnit("hero", 0, { pos: { x: 2, y: 2 }, pa: 10 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, hp: 100, maxHp: 100 });
    const s = field([hero, foe]);
    expect(decideBalanceProbe(s, "hero")).toEqual(decideBalanceProbe(s, "hero"));
  });
});

describe("decideBalanceProbe — support-aware SCREENING (protect-the-enabler, movement fallback)", () => {
  it("T1: interposes on the on-path adjacent-to-P tile, NOT the moveTowardPrime tile", () => {
    // S has NO in-range action → movement fallback. A mid-charge ally P at (5,3) is
    // threatened by E at (1,3) (its far/west side). A SEPARATE lower-HP prime enemy sits
    // at the NW corner (0,0) in a DIFFERENT direction, so moveTowardPrime would pull S
    // toward (0,0) — but screening must instead body-block the E→P path at (4,3) (on-path,
    // adjacent to P). The two rules DISAGREE by construction: the assertion (4,3) can only
    // come from the interpose keys, never from chasing the prime.
    const s = defaultUnit("S", 0, { pos: { x: 4, y: 1 }, move: 3, hp: 100, maxHp: 100 });
    const p = defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 });
    const prime = defaultUnit("prime", 1, { pos: { x: 0, y: 0 }, hp: 10, maxHp: 100 });
    const cmd = decideBalanceProbe(fieldWithCharge([s, p, e, prime], [midCharge("P")], 1, 7, 6), "S");
    expect(cmd).toEqual({ kind: "move", to: { x: 4, y: 3 } });
  });

  it("T2: an in-range action ALWAYS beats screening (LETHAL kill, no move)", () => {
    // S can one-shot an adjacent foe (LETHAL) AND has a mid-charge fragile ally. The
    // action return is strictly above screening → S kills, never screens.
    const s = defaultUnit("S", 0, { pos: { x: 2, y: 2 }, pa: 10, hp: 100, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 5, maxHp: 5 });
    const p = defaultUnit("P", 0, { pos: { x: 0, y: 5 }, hp: 40, maxHp: 72 });
    const cmd = decideBalanceProbe(fieldWithCharge([s, foe, p], [midCharge("P")]), "S");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } });
  });

  it("T2 (chip variant): even a non-lethal CHIP beats screening", () => {
    // Same board, but the foe is unkillable this turn (CHIP, not LETHAL). A CHIP is still
    // an in-range action → it outranks screening; S attacks, does not move.
    const s = defaultUnit("S", 0, { pos: { x: 2, y: 2 }, pa: 10, hp: 100, maxHp: 100 });
    const foe = defaultUnit("foe", 1, { pos: { x: 3, y: 2 }, facing: "N", hp: 500, maxHp: 500 });
    const p = defaultUnit("P", 0, { pos: { x: 0, y: 5 }, hp: 40, maxHp: 72 });
    const cmd = decideBalanceProbe(fieldWithCharge([s, foe, p], [midCharge("P")]), "S");
    expect(cmd).toEqual({ kind: "act", abilityId: "basic.attack", target: { unitId: "foe" } });
  });

  it("T3: screens the MID-CHARGE ally, not a nearer/lower-effHp non-charging ally", () => {
    // Two fragile allies: `ally-near` (hp 20, NOT charging, nearer S at (2,0)) and
    // `ally-charge` (hp 40, MID-CHARGE, farther at (6,2)). A wrong "nearest/lowest-effHp
    // fragile" rule would screen ally-near and interpose near (2,0) (→ (3,0)); the correct
    // MID-CHARGE rule interposes on the E→ally-charge path at (5,2). The keys DISAGREE.
    const s = defaultUnit("S", 0, { pos: { x: 4, y: 0 }, move: 4, hp: 100, maxHp: 100 });
    const allyCharge = defaultUnit("ally-charge", 0, { pos: { x: 6, y: 2 }, hp: 40, maxHp: 72 });
    const allyNear = defaultUnit("ally-near", 0, { pos: { x: 2, y: 0 }, hp: 20, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 3, y: 2 }, hp: 100, maxHp: 100 });
    const cmd = decideBalanceProbe(
      fieldWithCharge([s, allyCharge, allyNear, e], [midCharge("ally-charge")], 1, 8, 5),
      "S",
    );
    expect(cmd).toEqual({ kind: "move", to: { x: 5, y: 2 } });
  });

  it("HOLD: already on the optimal on-path tile → WAITS (does not abandon the screen)", () => {
    // THE discriminator for the oscillation fix. S already stands on the on-path tile
    // adjacent to the mid-charge P (4,3) — the optimal screen. A SEPARATE lower-HP prime
    // sits at the NW corner. Correct → WAIT (hold the post). The pre-fix bug returned null
    // here → moveTowardPrime walks S off (4,3) toward the prime → a MOVE (then it re-screens
    // next turn and oscillates). Assert wait, NOT a move: right ≠ plausible-wrong.
    const s = defaultUnit("S", 0, { pos: { x: 4, y: 3 }, move: 3, hp: 100, maxHp: 100 });
    const p = defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 });
    const prime = defaultUnit("prime", 1, { pos: { x: 0, y: 0 }, hp: 10, maxHp: 100 });
    const cmd = decideBalanceProbe(fieldWithCharge([s, p, e, prime], [midCharge("P")], 1, 7, 6), "S");
    expect(cmd).toEqual({ kind: "wait" });
  });

  it("screener-hp guard: a body squishier than the charger does NOT screen (→ moveTowardPrime)", () => {
    // The geometry is a valid screen (S could interpose at (4,3)), but S (hp 30) is
    // SQUISHIER than the mid-charge P (hp 40) → the guard declines. Discriminating: a
    // no-guard bug would interpose at (4,3); the guard falls through to moveTowardPrime.
    // Proven by equality with the SAME board minus the charge (no protectee → same path).
    const s = defaultUnit("S", 0, { pos: { x: 4, y: 1 }, move: 3, hp: 30, maxHp: 100 });
    const p = defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 });
    const prime = defaultUnit("prime", 1, { pos: { x: 0, y: 0 }, hp: 10, maxHp: 100 });
    const board = [s, p, e, prime];
    const guarded = decideBalanceProbe(fieldWithCharge(board, [midCharge("P")], 1, 7, 6), "S");
    const noCharge = decideBalanceProbe(field(board, 1, 7, 6), "S"); // empty queue → no protectee
    expect(guarded).not.toEqual({ kind: "move", to: { x: 4, y: 3 } }); // NOT the interpose
    expect(guarded).toEqual(noCharge); // identical to the no-screen moveTowardPrime path
  });

  it("no reachable on-path tile → moveTowardPrime fall-through (identical to no-screen)", () => {
    // S (move 1, boxed in the corner) can reach no on-path tile of the E→P line → tryScreen
    // returns null → moveTowardPrime. Discriminating: byte-identical to the same board with
    // no charge (screening cannot have engaged), and a MOVE toward the prime, not a wait.
    const s = defaultUnit("S", 0, { pos: { x: 0, y: 0 }, move: 1, hp: 100, maxHp: 100 });
    const p = defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 });
    const prime = defaultUnit("prime", 1, { pos: { x: 2, y: 0 }, hp: 10, maxHp: 100 });
    const board = [s, p, e, prime];
    const withCharge = decideBalanceProbe(fieldWithCharge(board, [midCharge("P")], 1, 7, 6), "S");
    const noCharge = decideBalanceProbe(field(board, 1, 7, 6), "S");
    expect(withCharge).toEqual({ kind: "move", to: { x: 1, y: 0 } }); // steps toward the prime
    expect(withCharge).toEqual(noCharge); // screen did not engage
  });

  it("blast-radius (a): no mid-charge ally → byte-identical to the moveTowardPrime path", () => {
    // With NO ally mid-charge, tryScreen returns null and the command is exactly the
    // pre-screening moveTowardPrime output. An ENEMY-owned charge is not an ally
    // mid-charge, so it changes nothing.
    const hero = defaultUnit("hero", 0, { pos: { x: 0, y: 0 }, move: 3 });
    const foe = defaultUnit("foe", 1, { pos: { x: 6, y: 0 }, hp: 100, maxHp: 100 });
    const expected = { kind: "move", to: { x: 3, y: 0 } };
    expect(decideBalanceProbe(field([hero, foe], 1, 7, 1), "hero")).toEqual(expected);
    const withEnemyCharge = fieldWithCharge([hero, foe], [midCharge("foe")], 1, 7, 1);
    expect(decideBalanceProbe(withEnemyCharge, "hero")).toEqual(expected);
  });

  it("blast-radius (b): an instant-caster ally (no charge) never triggers screening", () => {
    // Identical board; the ONLY difference is whether the ally owns a charge. A Coven-
    // shaped INSTANT caster produces no chargeQueue entry, so screening never fires
    // (S falls through to moveTowardPrime). Add the charge → screening fires → (5,2).
    const s = defaultUnit("S", 0, { pos: { x: 4, y: 0 }, move: 4, hp: 100, maxHp: 100 });
    const ally = defaultUnit("P", 0, { pos: { x: 6, y: 2 }, hp: 40, maxHp: 72 });
    const e = defaultUnit("E", 1, { pos: { x: 3, y: 2 }, hp: 100, maxHp: 100 });
    const interpose = { kind: "move", to: { x: 5, y: 2 } };
    const charging = fieldWithCharge([s, ally, e], [midCharge("P")], 1, 8, 5);
    const instant = field([s, ally, e], 1, 8, 5);
    expect(decideBalanceProbe(charging, "S")).toEqual(interpose); // mid-charge → screens
    expect(decideBalanceProbe(instant, "S")).not.toEqual(interpose); // instant → no screen
  });

  it("determinism: the screening decision is pure and draws ZERO rng", () => {
    const mkBoard = (): UnitState[] => [
      defaultUnit("S", 0, { pos: { x: 4, y: 1 }, move: 3, hp: 100, maxHp: 100 }),
      defaultUnit("P", 0, { pos: { x: 5, y: 3 }, hp: 40, maxHp: 72 }),
      defaultUnit("E", 1, { pos: { x: 1, y: 3 }, hp: 100, maxHp: 100 }),
    ];
    const s1 = fieldWithCharge(mkBoard(), [midCharge("P")], 1, 7, 6);
    const s2 = fieldWithCharge(mkBoard(), [midCharge("P")], 1, 7, 6);
    expect(serialize(s1)).toBe(serialize(s2)); // identical serialized inputs
    expect(decideBalanceProbe(s1, "S")).toEqual(decideBalanceProbe(s2, "S"));
    expect(decideBalanceProbe(s1, "S")).toEqual({ kind: "move", to: { x: 4, y: 3 } }); // it screened
    // A pure decide never mutates state / consumes the seed.
    const snap = serialize(s1);
    decideBalanceProbe(s1, "S");
    expect(serialize(s1)).toBe(snap);
    expect(s1.rngCounter).toBe(0);
  });
});
