/**
 * SUPPORT-slot layer tests (docs/02 §2, ADR-0017) — the third chassis slot to gain
 * real effects. Two halves are covered: the pure folds in `support.ts`, and the
 * layer's placement inside `build.ts`'s derivation pipeline.
 *
 * DISCRIMINATING (CLAUDE.md, the evidence principle): the load-bearing case is
 * `an inert support and a live one build DIFFERENT units`. Before this slice EVERY
 * support built the same unit, so a test that only asserted "a build with Magic
 * Attack Up has ma ≥ 1" would have passed against the dead-slot bug it exists to
 * catch. The A/B against the same record with the slot emptied is the version that
 * can come out the other way.
 *
 * The shipped-pack partition test is the second guard: a newly authored support
 * must either carry an effect or be listed in DEFERRED_SUPPORT_EFFECTS with a
 * blocker, so "authored and silently inert" — the exact defect ADR-0017 fixed —
 * cannot recur without the suite failing.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { loadContentPack, ContentIntegrityError, type ContentRegistry } from "./content.js";
import { defaultUnitRecord } from "./roster.js";
import { emptyLoadout, setLoadoutSlot } from "./loadout.js";
import { buildBattleUnit, buildBattleState } from "./build.js";
import { serialize, deserialize } from "./state.js";
import {
  applySupportEffect,
  applySupportToAbility,
  SupportEffectSchema,
  DEFERRED_SUPPORT_EFFECTS,
} from "./support.js";

function loadShippedPack(): ContentRegistry {
  const path = fileURLToPath(new URL("../../data/base-pack.json", import.meta.url));
  return loadContentPack(JSON.parse(readFileSync(path, "utf8")) as unknown);
}
const registry = loadShippedPack();
const rawPack = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../data/base-pack.json", import.meta.url)), "utf8"),
) as { abilities: Array<Record<string, unknown>> };

// ── the pure folds ──────────────────────────────────────────────────────────

describe("applySupportEffect — the stat fold", () => {
  const base = { pa: 10, ma: 10, maxHp: 100 };

  it("returns the base UNCHANGED when no support is equipped", () => {
    // The no-op that keeps every support-less build byte-identical to the pre-layer
    // build. Identity, not a zero-effect object.
    expect(applySupportEffect(base, undefined)).toEqual(base);
  });

  it("applies floor((base + flat) x mult) per stat, leaving untouched stats alone", () => {
    const out = applySupportEffect(base, { ma: { mult: 1.33 }, pa: { flat: 3 } });
    expect(out.ma).toBe(13); // floor(10 * 1.33) = floor(13.3)
    expect(out.pa).toBe(13); // floor((10 + 3) * 1)
    expect(out.maxHp).toBe(100); // no maxHp mod → untouched
  });

  it("treats an omitted flat/mult as the identity (0 / 1), not as zero", () => {
    // The absent-not-zero rule: `{ma: {}}` must not collapse ma to 0.
    expect(applySupportEffect(base, { ma: {} }).ma).toBe(10);
  });
});

describe("applySupportToAbility — the ability fold", () => {
  it("returns speed and range UNCHANGED when no support is equipped", () => {
    expect(applySupportToAbility(25, 4, undefined)).toEqual({ speed: 25, rangeH: 4 });
  });

  it("scales an existing charge speed and floors it", () => {
    expect(applySupportToAbility(33, 5, { chargeSpeed: { mult: 2 } }).speed).toBe(66);
    expect(applySupportToAbility(25, 5, { chargeSpeed: { mult: 1.5 } }).speed).toBe(37);
  });

  it("NEVER creates a charge on an instant ability", () => {
    // "instant" and "a very fast charge" must not collapse together — an instant
    // action stays instant no matter what the support says (absent-not-zero, applied
    // to a nullable field).
    expect(applySupportToAbility(null, 3, { chargeSpeed: { mult: 2 } }).speed).toBeNull();
  });

  it("clamps a shrunk charge speed to >= 1 and a shrunk range to >= 0", () => {
    // The build-time clamp rule (src/sim/CLAUDE.md): an out-of-bounds projection must
    // fail at BUILD, not silently at serialize/rewind.
    expect(applySupportToAbility(2, 1, { chargeSpeed: { mult: 0.1 } }).speed).toBe(1);
    expect(applySupportToAbility(20, 1, { abilityRange: { flat: -5 } }).rangeH).toBe(0);
  });

  it("adds the flat range bonus to the horizontal reach", () => {
    expect(applySupportToAbility(null, 4, { abilityRange: { flat: 1 } }).rangeH).toBe(5);
  });
});

describe("SupportEffectSchema — the structural speed ban (AC-P5, ADR-0012)", () => {
  it("REJECTS an authored unit `speed` key", () => {
    // Enforced by the schema shape, not by convention: a support may scale a CHARGED
    // ACTION's own accrual (`chargeSpeed`) but may never touch a UNIT's CT accrual.
    expect(() => SupportEffectSchema.parse({ speed: { mult: 2 } })).toThrow();
    expect(() => SupportEffectSchema.parse({ chargeSpeed: { mult: 2 } })).not.toThrow();
  });
});

// ── the layer inside build.ts ───────────────────────────────────────────────

describe("buildBattleUnit — the equipped support changes the built unit", () => {
  /** A wizard record, optionally equipping `support` (which it must have learned). */
  const wizard = (support: string | null) => {
    const rec = defaultUnitRecord("w", "wizard", {
      raw: { pa: 8, ma: 8, speed: 8, hp: 192, mp: 24 },
      learned: support === null ? [] : [support],
      loadout: emptyLoadout(),
    });
    return support === null ? rec : setLoadoutSlot(rec, "support", support, registry);
  };

  it("DISCRIMINATING: Magic Attack Up builds a DIFFERENT unit than an empty slot", () => {
    // The whole point of ADR-0017. This case FAILS against the pre-slice engine, where
    // every support built an identical unit — which is why it is the one that matters.
    const without = buildBattleUnit(wizard(null), registry);
    const with_ = buildBattleUnit(wizard("black-magic.magic-attack-up"), registry);
    expect(with_.ma).toBeGreaterThan(without.ma);
    expect(with_.ma).toBe(Math.floor(without.ma * 1.33));
    // ...and touches NOTHING else: a support's blast radius is exactly what it authors.
    expect(with_.pa).toBe(without.pa);
    expect(with_.maxHp).toBe(without.maxHp);
    expect(with_.speed).toBe(without.speed);
    expect(with_.move).toBe(without.move);
  });

  it("DISCRIMINATING: a DEFERRED support builds the same unit as an empty slot", () => {
    // The other side of the same discriminator. `aim.concentrate` is authored, equippable
    // and deliberately effect-less, so it must be a no-op — if this ever diverges, an
    // effect was authored without being removed from the deferred manifest.
    const inert = buildBattleUnit(wizard("aim.concentrate"), registry);
    expect(inert).toEqual(buildBattleUnit(wizard(null), registry));
  });

  it("Short Charge scales the charge speed of learned CHARGED actions only", () => {
    const rec = defaultUnitRecord("w", "wizard", {
      raw: { pa: 8, ma: 8, speed: 8, hp: 192, mp: 24 },
      learned: ["black-magic.fire", "summon.short-charge"],
      loadout: emptyLoadout(),
    });
    const unit = buildBattleUnit(
      setLoadoutSlot(rec, "support", "summon.short-charge", registry),
      registry,
    );
    const fire = unit.abilities.find((a) => a.id === "black-magic.fire")!;
    expect(fire.speed).toBe(50); // authored 25, x2
    // The basic attack is instant AND weapon-derived: untouched on both counts.
    expect(unit.abilities.find((a) => a.id === "basic.attack")!.speed).toBeNull();
  });

  it("a range-up support widens learned skills but NOT the weapon-derived basic attack", () => {
    // The scoping decision recorded in projectAbilities: equipment is deferred, so a
    // range-up support has no weapon range to widen, and silently granting every
    // support-carrying build a tile of MELEE reach would be a combat change nobody
    // authored.
    const rec = defaultUnitRecord("a", "archer", {
      learned: ["aim.aimed-shot", "aim.eagle-eye"],
      loadout: emptyLoadout(),
    });
    const unit = buildBattleUnit(
      setLoadoutSlot(rec, "support", "aim.eagle-eye", registry),
      registry,
    );
    expect(unit.abilities.find((a) => a.id === "aim.aimed-shot")!.range.h).toBe(6); // 5 + 1
    expect(unit.abilities.find((a) => a.id === "basic.attack")!.range.h).toBe(1);
  });

  it("the support layer's output survives a serialize round-trip (the final clamp holds)", () => {
    // The build-time clamp rule (src/sim/CLAUDE.md): a modifier layer that can push a stat
    // out of the schema bounds must clamp BEFORE construction, or the failure surfaces
    // only at save/rewind. Both halves of the layer travel in the serialized state — the
    // stat mods on the unit, the ability mods on its projected abilities. `raw.ma` here is
    // deliberately extreme (250 × wizard growth 1.5 × 1.33 overshoots the schema bound),
    // so this case would THROW without the clamp rather than pass vacuously.
    const rec = setLoadoutSlot(
      defaultUnitRecord("w", "wizard", {
        raw: { pa: 8, ma: 250, speed: 8, hp: 192, mp: 24 },
        learned: ["black-magic.fire", "black-magic.magic-attack-up"],
        loadout: emptyLoadout(),
      }),
      "support",
      "black-magic.magic-attack-up",
      registry,
    );
    const state = buildBattleState([{ record: rec }], 1, registry);
    expect(deserialize(serialize(state))).toEqual(state);
  });
});

// ── the shipped pack: nothing is silently inert ─────────────────────────────

describe("the shipped pack partitions every support into EFFECT-BEARING or DEFERRED", () => {
  const supports = rawPack.abilities.filter((a) => a["type"] === "support");

  it("has support abilities to check (guards the guard)", () => {
    // Without this, a filter that silently matched nothing would make the partition
    // below vacuously true.
    expect(supports.length).toBeGreaterThan(0);
  });

  it("every authored support either carries an effect or names its blocker", () => {
    const inertWithoutReason = supports
      .filter((a) => a["supportEffect"] === undefined)
      .map((a) => a["id"] as string)
      .filter((id) => DEFERRED_SUPPORT_EFFECTS[id] === undefined);
    expect(inertWithoutReason, "authored support with no effect and no recorded blocker").toEqual([]);
  });

  it("every DEFERRED entry names a real, still-effect-less ability and a non-empty blocker", () => {
    // Keeps the manifest from rotting the other way — a stale entry for an ability that
    // has since gained an effect, or one that no longer exists.
    for (const [id, blocker] of Object.entries(DEFERRED_SUPPORT_EFFECTS)) {
      const authored = supports.find((a) => a["id"] === id);
      expect(authored, `DEFERRED names unknown support "${id}"`).toBeDefined();
      expect(authored!["supportEffect"], `"${id}" has an effect but is still DEFERRED`).toBeUndefined();
      expect(blocker.length, id).toBeGreaterThan(20);
    }
  });
});

describe("content integrity — a supportEffect on a non-support ability fails loud", () => {
  it("rejects the pack rather than silently ignoring the effect", () => {
    // The dead-slot defect class, inverted: authoring an effect somewhere it is never
    // read must be an error, not a no-op.
    const broken = JSON.parse(JSON.stringify(rawPack)) as typeof rawPack;
    const action = broken.abilities.find((a) => a["id"] === "black-magic.fire")!;
    action["supportEffect"] = { ma: { mult: 2 } };
    expect(() => loadContentPack(broken)).toThrow(ContentIntegrityError);
  });
});
