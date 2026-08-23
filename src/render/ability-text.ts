/**
 * A one-line, plain-English summary of what an ability does — DERIVED from the
 * ability's own fields, never authored.
 *
 * WHY DERIVED. The learn list, the command list and the loadout dropdowns all showed a
 * NAME and a PRICE and nothing else, so a player deciding whether to spend 60 AP — which
 * is never refunded (AC-J3) — had no way to know what "Wave Fist" or "Hp Boost" even is.
 * The obvious fix is a `description` field and 67 authored strings, and that is the wrong
 * one: authored prose is a second copy of numbers the pack already holds, and it goes
 * stale the first time anyone re-tunes a power or a range. Every re-cost this repo has
 * done would have silently falsified it.
 *
 * This reads the SAME fields the sim resolves against, so it cannot drift. The cost is
 * that it is factual rather than evocative ("Physical damage, power 11 · range 3", not
 * "a shockwave of focused ki") — flavour text belongs to the story repo's job, not the
 * engine's, and `docs/08` §4 already draws that line.
 *
 * WHAT IT DELIBERATELY DOES NOT SAY. It never claims an ability WORKS. A deferred
 * ability still gets its summary, because the summary describes what the content
 * declares; whether the sim honours it is the separate "no effect yet" tag's job
 * (ADR-0019). Merging the two would let one message answer two different questions.
 *
 * PURE, DOM-free, no registry lookups beyond the ability handed in.
 */

import type { Ability } from "../sim/index.js";

/** "3" for a 3×1 box, "3 (±2 height)" when the vertical reach is worth naming. */
function reachText(box: { h: number; v: number }): string {
  return box.v > 1 ? `${box.h} (±${box.v} height)` : `${box.h}`;
}

/** A ×1.2 / +2 style modifier, in the direction a player reads it. */
function modText(mod: { flat?: number | undefined; mult?: number | undefined }): string {
  const parts: string[] = [];
  if (mod.flat !== undefined && mod.flat !== 0) {
    parts.push(mod.flat > 0 ? `+${mod.flat}` : `${mod.flat}`);
  }
  if (mod.mult !== undefined && mod.mult !== 1) parts.push(`×${mod.mult}`);
  return parts.join(" ");
}

/** What an equipped support changes, as a list of readable clauses. */
function supportClauses(a: Ability): string[] {
  const e = a.supportEffect;
  if (!e) return [];
  const out: string[] = [];
  if (e.maxHp) out.push(`max HP ${modText(e.maxHp)}`);
  if (e.pa) out.push(`attack ${modText(e.pa)}`);
  if (e.ma) out.push(`magic ${modText(e.ma)}`);
  if (e.chargeSpeed) out.push(`casting speed ${modText(e.chargeSpeed)}`);
  if (e.abilityRange) out.push(`ability range ${modText(e.abilityRange)}`);
  return out;
}

const REACTION_TEXT: Readonly<Record<string, string>> = {
  counter: "strikes back when this unit is attacked",
  preemptive: "attacks first when this unit is attacked",
};

/**
 * One line describing `ability`, or `null` when the content says nothing a player could
 * act on.
 *
 * `null`, not an empty string, for the viewer's absent-not-zero rule: a caller must be
 * able to tell "there is nothing to say" from "there is a description and it is blank",
 * and only the first is a legitimate state.
 */
export function abilitySummary(a: Ability): string | null {
  const bits: string[] = [];

  if (a.type === "action") {
    const el = a.element !== undefined && a.element !== "none" ? `${a.element} ` : "";
    if (a.formula === "physical") bits.push(`${el}physical damage`);
    else if (a.formula === "magic") bits.push(`${el}magic damage`);
    else if (a.formula === "heal") bits.push("restores HP");

    if (a.power !== undefined && a.formula !== "none") bits.push(`power ${a.power}`);
    if (a.inflicts !== undefined && a.inflicts.length > 0) {
      // "Applies", not "inflicts": `white-magic.protect` is on this path and reading
      // "inflicts protect" about a BUFF tells a player the opposite of the truth. The
      // ability alone cannot say which it is (the kind lives on the status), so the
      // wording has to be true for both. Strip the `status.` namespace while here — a
      // player reads "charm", not "status.charm".
      bits.push(`applies ${a.inflicts.map((s) => s.replace(/^status\./, "")).join(", ")}`);
    }
    // An action that resolves NOTHING gets no summary at all. Its range and MP are
    // true but useless — "Range 1" as the whole description of Weapon Break is worse
    // than silence, because it reads like a complete answer. The row's own "no effect
    // yet" tag is the honest thing to show there, and it already does.
    if (bits.length === 0) return null;

    if (a.range) bits.push(`range ${reachText(a.range)}`);
    if (a.aoe) bits.push(`area ${reachText(a.aoe)}`);
    if (a.mp !== undefined && a.mp > 0) bits.push(`${a.mp} MP`);
    // `speed` on an action is its CHARGE speed: the action lands on a later turn.
    if (a.speed !== undefined) bits.push("charges before it lands");
  } else if (a.type === "support") {
    const clauses = supportClauses(a);
    if (clauses.length > 0) bits.push(`always on: ${clauses.join(", ")}`);
  } else if (a.type === "reaction") {
    const kind = a.reactionEffect?.kind;
    if (kind !== undefined && REACTION_TEXT[kind] !== undefined) {
      bits.push(`automatic: ${REACTION_TEXT[kind]}`);
    }
  } else if (a.type === "movement") {
    const flat = a.movementEffect?.move?.flat;
    if (flat !== undefined && flat !== 0) {
      bits.push(`always on: move ${flat > 0 ? `+${flat}` : flat} tile${Math.abs(flat) === 1 ? "" : "s"} per turn`);
    }
  }

  if (bits.length === 0) return null;
  const text = bits.join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
