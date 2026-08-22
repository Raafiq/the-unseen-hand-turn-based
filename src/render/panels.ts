/**
 * The shipped panel renderers — timeline, status line, resolution preview, turn log —
 * as PURE `state → HTML` functions, shared by every page that shows a battle.
 *
 * WHY THESE ARE NOT IN `main.ts` ANY MORE. The preview panel is where docs/00 pillar 4
 * is actually enforced: the "not modeled yet, so not shown" list is an ASSERTION, and
 * `src/render/CLAUDE.md` requires a pass over it whenever a deferred capability ships.
 * A second page rendering its own copy would mean two lists to keep honest, and the
 * stale one would keep hiding a status from a player about to commit a shot — the exact
 * failure that rule was written for. One renderer, one list.
 *
 * Presentation metadata is INJECTED (`UnitLook`) rather than imported: the demo page
 * has hand-authored labels and colours, and a campaign battle derives them from the
 * roster. Everything else — what is shown and what is deliberately absent — is the same
 * on both, because it is the same code.
 *
 * PURE: no DOM, no wall-clock, no sim mutation. Each function returns a string; the
 * caller owns where it lands.
 */

import type { ActiveActor, BattleState } from "../sim/index.js";
import { ASSUMED_FUTURE_TURN_COST, forecast } from "./demo.js";
import type { TurnCost } from "./preview.js";
import type { Session } from "./session.js";

/** How one unit is presented: a display name and a team colour. */
export interface UnitLook {
  label: string;
  color: string;
}

/** unit id → its presentation, or `undefined` for a unit the page has no metadata for. */
export type LookUp = (unitId: string) => UnitLook | undefined;

const FALLBACK_COLOR = "#9aa4bb";

function labelOf(look: LookUp, id: string): string {
  return look(id)?.label ?? id;
}

function chip(
  state: BattleState,
  look: LookUp,
  actor: ActiveActor,
  leading: boolean,
  projected: boolean,
): string {
  const cls = `chip${leading ? " lead" : ""}${projected ? " proj" : ""}`;
  const title = projected
    ? `Projected — this slot assumes every turn ahead of it costs −${ASSUMED_FUTURE_TURN_COST} CT`
    : "Exact — no actor ahead of this slot takes a second turn first";
  if (actor.kind === "charge") {
    const charge = state.chargeQueue.find((c) => c.id === actor.id);
    const caster = charge ? look(charge.sourceUnitId) : undefined;
    const color = caster?.color ?? "#ff7a3c";
    const text = caster ? `⚡ ${caster.label}` : "⚡ Spell";
    return `<span class="${cls} spell" style="--c:${color}" title="${title}">
      <span class="swatch"></span>${text}</span>`;
  }
  const meta = look(actor.id);
  const color = meta?.color ?? FALLBACK_COLOR;
  return `<span class="${cls}" style="--c:${color}" title="${title}">
    <span class="swatch"></span>${meta?.label ?? actor.id}</span>`;
}

/**
 * The turn-order strip, split at the forecast's honesty boundary (docs/10 §4
 * item 7). Chips BEFORE `assumedFrom` are facts — no guessed CT cost is in their
 * path. From the divider on they are projections priced at
 * {@link ASSUMED_FUTURE_TURN_COST}, and they LOOK different, because pillar 4
 * forbids presenting a projection as a fact. The divider carries the reason, so
 * the claim on screen matches the claim in `Forecast.assumedFrom`.
 */
export function timelineHtml(state: BattleState, look: LookUp): string {
  const { entries, assumedFrom } = forecast(state, 8);
  const divider =
    assumedFrom >= entries.length
      ? ""
      : `<span class="tl-split" title="From here on, a Wait (−60) or a move+act fold (−100) by anyone ahead moves the order">
          projected · −${ASSUMED_FUTURE_TURN_COST}/turn ▸</span>`;
  return (
    `<span class="tl-label">Next up</span>` +
    entries
      .map((a, i) => (i === assumedFrom ? divider : "") + chip(state, look, a, i === 0, i >= assumedFrom))
      .join("")
  );
}

export function statusHtml(session: Session, look: LookUp): string {
  const active = session.actor();
  const who = active ? labelOf(look, active.id) : "—";
  const control = !active ? "" : active.teamId === session.playerTeam ? " (you)" : " (AI)";
  return (
    `<span><b>Tick</b> ${session.state.tick}</span>` +
    `<span><b>Turns</b> ${session.turnCount}</span>` +
    `<span><b>Active</b> ${who}${control}</span>` +
    `<span><b>Phase</b> ${session.phase}</span>` +
    `<span><b>Seed</b> ${session.state.seed}</span>`
  );
}

const row = (k: string, v: string, cls = ""): string =>
  `<div class="prow ${cls}"><span class="pk">${k}</span><span class="pv">${v}</span></div>`;

/**
 * The resolution-transparency panel (docs/10 §4). DEFERRED ROWS ARE ABSENT — no
 * crit, reaction, status-on-hit, elemental, AoE, LoS or charge line is printed,
 * because printing one as zero would assert a modeled zero for something the sim
 * does not model (ADR-0010), which pillar 4 forbids. The closing note NAMES what
 * is unmodeled instead of faking a value for it.
 */
export function previewHtml(session: Session, look: LookUp): string {
  const p = session.preview();
  if (!p) {
    const cost = session.endTurnCost();
    return cost
      ? row("Turn as staged", `${cost.didMove ? "Move only" : "Wait"} · −${cost.cost} CT`) +
          row("CT after", `${cost.ctBefore} → ${cost.ctAfter}`) +
          `<p class="phint">Hover an enemy to see the exact hit %, damage and CT price before you commit.</p>`
      : `<p class="phint">No unit is awaiting your input.</p>`;
  }
  const hpBar = `${p.targetHpBefore} → ${p.targetHpAfter} / ${p.targetMaxHp}`;
  const statuses =
    p.targetStatuses.length === 0
      ? "none"
      : p.targetStatuses.map((s) => `${s.id} (${s.kind})`).join(", ");
  return (
    row("Action", `${labelOf(look, p.actorId)} · ${p.abilityId} → ${labelOf(look, p.targetId)}`) +
    row("Resolves from", `${p.moved ? "staged tile" : "current tile"} (${p.from.x},${p.from.y})`) +
    row("Facing", `${p.facing.toUpperCase()} arc`) +
    row("Hit chance", `${p.hitChance}%`) +
    row(p.heal ? "Heal" : "Damage", `${p.magnitude}`) +
    row("Target HP", hpBar, p.lethal ? "lethal" : "") +
    (p.lethal ? row("Outcome", "LETHAL — the target is KO'd") : "") +
    row("Zodiac", p.zodiac) +
    row("Target statuses", statuses) +
    // Only when the act actually applies one. An "Inflicts: none" row on every
    // ordinary swing would be noise, and the absent-not-zero rule is about not
    // asserting an unmodeled effect — it does not require printing an empty one.
    (p.inflicts.length > 0
      ? row("Inflicts on hit", p.inflicts.map((i) => `${i.id} (${i.kind})`).join(", "), "lethal")
      : "") +
    // The target's reaction, shown ONLY when one can actually trigger from here
    // (ADR-0019). Absent, never "Counter: 0%" — and it leads with the cancellation
    // when the reaction is Hamedo, because every number above this row is then moot.
    (p.counterRisk
      ? (p.counterRisk.cancelsAct
          ? row("⚠ Blocked", `${p.counterRisk.abilityId} would CANCEL this act (${p.counterRisk.chance}%)`, "lethal")
          : "") +
        row(
          p.counterRisk.cancelsAct ? "…and strikes back" : "⚠ Counter risk",
          `${p.counterRisk.abilityId} · ${p.counterRisk.chance}% to trigger` +
            ` · ${p.counterRisk.hitChance}% to hit you for ${p.counterRisk.magnitude}`,
          p.counterRisk.lethal ? "lethal" : "",
        ) +
        (p.counterRisk.lethal ? row("Outcome", "the counter would KO YOU", "lethal") : "")
      : "") +
    row(
      "Turn price",
      `${p.moved ? "Move + Act" : "Act"} · −${p.turn.cost} CT` +
        ` · CT ${p.turn.ctBefore} → ${p.turn.ctAfter}`,
    ) +
    row(
      p.turn.timelineSlotExact ? "Next slot" : "Next slot (projected)",
      p.turn.timelineSlot === null
        ? "beyond the next 8 turns"
        : `${p.turn.timelineSlotExact ? "" : "≈ "}#${p.turn.timelineSlot + 1} in the timeline`,
    ) +
    // THIS LIST IS AN ASSERTION, and it has to shrink as capabilities land. It named
    // `status-on-hit` while the Inflicts row above was already live, and `reactions`
    // until ADR-0019 wired them — each one a claim the engine had stopped backing.
    // Only genuinely unmodeled things belong here.
    `<p class="phint">Not modeled yet, so not shown: crit, elemental weak/half/absorb,
     AoE spread, line of sight (ADR-0010). ${slotHonesty(p.turn)}</p>`
  );
}

/**
 * WHY the "Next slot" row is (or is not) exact — docs/10 §4 item 7 forbids
 * presenting a projection as a fact, so the disclaimer has to track the actual
 * value, not sit there as boilerplate. Exact means the slot lands inside
 * `Forecast.assumedFrom`: no guessed CT cost is in its path. The cast caveat is
 * stated in BOTH branches because no forecast can anticipate a charge nobody has
 * declared yet.
 */
function slotHonesty(turn: TurnCost): string {
  if (turn.timelineSlotExact) {
    return `“Next slot” is <b>exact</b>: nobody ahead of you takes a second turn first, so no
      guessed CT cost is in its path (it can still shift if an actor ahead begins a charged
      cast — that adds an actor to the timeline). The CT price above it is exact too.`;
  }
  return `“Next slot” is a <b>projection, not a fact</b>: it sits past the point where the
    forecast starts assuming every turn ahead costs a plain −${ASSUMED_FUTURE_TURN_COST} CT, so a
    Wait (−60) or a move+act fold (−100) anywhere in between moves it. The CT price above it
    <i>is</i> exact.`;
}

/**
 * Replace unit IDS inside a turn-log action string with their display names.
 *
 * The sim writes `"hit red-brigand-1 −137"` because a log line has to survive a
 * replay with no registry attached, so ids are the only stable handle it has. The
 * ACTOR was already resolved here; the TARGET, sitting inside the action text, was
 * not — so the campaign's log read "hit red-brigand-1" while the timeline chip two
 * inches above it said "Brigand". Found by reading a screenshot.
 *
 * Longest id first, so one id that is a prefix of another cannot half-replace it.
 */
function nameIdsIn(action: string, state: BattleState, look: LookUp): string {
  let out = action;
  const ids = state.units.map((u) => u.id).sort((a, b) => b.length - a.length);
  for (const id of ids) {
    const label = look(id)?.label;
    if (label !== undefined && label !== id) out = out.split(id).join(label);
  }
  return out;
}

export function logHtml(state: BattleState, look: LookUp, empty: string): string {
  const rows = state.turnLog
    .slice(-6)
    .reverse()
    .map((e) => {
      const meta = look(e.unitId);
      return `<li><span class="dot" style="background:${meta?.color ?? FALLBACK_COLOR}"></span>
        t${e.tick} · ${meta?.label ?? e.unitId} · ${nameIdsIn(e.action, state, look)}</li>`;
    })
    .join("");
  return rows || `<li class="muted">${empty}</li>`;
}
