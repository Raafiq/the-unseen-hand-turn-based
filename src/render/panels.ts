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

/**
 * How one unit is presented: a display name, a team colour, and — for pages that
 * have them — a job label and a portrait.
 *
 * `job` and `portrait` are OPTIONAL because the two shipped pages differ in what
 * they can honestly supply. The campaign derives both from the roster record that
 * was deployed into the slot; the engine viewer's hand-authored `UNIT_META` has
 * neither, and renders with those rows genuinely ABSENT rather than blank or "—".
 * `exactOptionalPropertyTypes` is on, so build these with a conditional spread —
 * `job: undefined` is a type error, which is the point.
 *
 * `portrait.key` is the ASSET KEY, not the URL: the "portrait pending" caption is
 * a claim about which art this is, and only the key can back it. Every unit gets
 * `placeholder` today because no portrait art exists yet.
 */
export interface UnitLook {
  label: string;
  color: string;
  /** Display label for the unit's current job, already resolved (e.g. "Geomancer"). */
  job?: string;
  /** Bundled portrait URL plus the asset key it was resolved from. */
  portrait?: { url: string; key: string };
}

/** unit id → its presentation, or `undefined` for a unit the page has no metadata for. */
export type LookUp = (unitId: string) => UnitLook | undefined;

const FALLBACK_COLOR = "#9aa4bb";

/**
 * HTML-escape a string that reaches the page as MARKUP.
 *
 * Unit names and job labels are content, not code — they come out of the campaign def
 * and out of `prep.ts`'s label tables — but they are interpolated into template
 * literals, and a `<` in either would rewrite the card. NOTE `chip()` below is still
 * unescaped; that is pre-existing and deliberately not changed in this slice.
 */
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
    ? `A guess — this slot assumes every turn ahead of it costs −${ASSUMED_FUTURE_TURN_COST} clock`
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
      : `<span class="tl-split" title="A guess from here on: it assumes everyone ahead takes an ordinary turn. Anyone who only waits, or who moves and attacks together, will shift the order.">
          guessed from here ▸</span>`;
  return (
    `<span class="tl-label">Next up</span>` +
    entries
      .map((a, i) => (i === assumedFrom ? divider : "") + chip(state, look, a, i === 0, i >= assumedFrom))
      .join("")
  );
}

/**
 * The mini stat card, ready to drop into its own host.
 *
 * SEPARATE FROM {@link timelineHtml} because the two land in different places: the
 * chips are board chrome under the canvas, the card is an OVERLAY on top of it. It
 * asks for one forecast entry rather than eight — only the lead is needed — so the
 * split costs a fraction of a rail rebuild rather than doubling it.
 *
 * `focusUnitId` IS THE SEAM FOR INSPECTING SOMEBODY ELSE, and it is optional so that
 * leaving it off is byte-identical to the shipped card: pass nothing and the card
 * describes the unit acting next — which is what the page does today, by the owner's
 * call of 2026-09-01 — and pass a unit id and it describes that unit instead.
 * Resolution ("who is the player looking at") belongs to whatever owns the pointer or
 * the selection; this function only takes the answer. No caller passes an id yet; the
 * parameter is exercised by `panels.test.ts` and is the hook a future inspect control
 * hangs on, so deleting it costs that feature its landing site.
 */
export function unitCardHtml(state: BattleState, look: LookUp, focusUnitId?: string): string {
  // The card is for the rail's LEAD SLOT, `entries[0]` — who the forecast says acts
  // next — and never `state.units[0]`, which is authoring order and agrees with the
  // lead only by accident.
  return statCardHtml(statCard(state, look, forecast(state, 1).entries[0], focusUnitId));
}

// ---- The mini stat card ----------------------------------------------------

/**
 * Everything the mini stat card shows about the unit acting next — a PURE model,
 * DOM-free, exactly as `PrepModel` and `SceneModel` are, so it is assertable in a
 * plain Node test rather than only through a browser.
 *
 * WHAT IS NOT HERE IS THE POINT. There is no `mp` and no `level`, because the sim
 * models neither: `UnitState` has no MP field at all, and `UnitRecord.level` is
 * written and read by nothing (ADR-0021, guarded by AC-J10). Printing either as a
 * number would assert a modeled value the engine cannot back up, which pillar 4
 * forbids — the same rule that keeps crit off the preview panel. If MP ever lands,
 * `src/render/CLAUDE.md`'s "when a deferred capability ships, go un-hide the row"
 * applies here and `panels.test.ts` has the tripwire that will say so.
 *
 * `job` and `portrait` are optional for the same reason they are optional on
 * {@link UnitLook}: the engine viewer supplies neither and must render without them.
 *
 * `ct` is a FIELD NAME, not a caption. "CT" is the engine's word for the turn clock and
 * is BANNED from this surface — `e2e/campaign.spec.ts`'s learnability spec asserts the
 * timeline, preview, status and End Turn button never say it, after a cognitive
 * walkthrough found it meaningless to a new player. The card prints "Clock", the word
 * `previewHtml` above already uses. That spec caught this card saying "CT" and is the
 * authority; the unit-level assertion in `panels.test.ts` is only a faster echo of it.
 */
export interface StatCard {
  /** The BATTLE unit id (a slot id such as "blue-vance"), not a roster record id. */
  id: string;
  label: string;
  color: string;
  /** Current and max HP. BOTH are printed: a bar alone is a percentage, not a fact. */
  hp: { cur: number; max: number };
  ct: number;
  brave: number;
  faith: number;
  job?: string;
  /** `pending` is true iff the resolved asset key is the placeholder — no real art yet. */
  portrait?: { url: string; pending: boolean };
  /** Present only when this slot is a maturing CHARGE, resolved back to its caster. */
  casting?: true;
}

/**
 * Build the card for the timeline's lead actor, or `null` when there is none.
 *
 * A CHARGE lead is resolved back through `chargeQueue` to the unit that cast it, so
 * the card describes a real unit with real HP rather than a queue entry with none —
 * and sets `casting`, because the honest caption for that slot is "the spell lands",
 * not "this unit acts".
 *
 * `focusUnitId` OVERRIDES the lead when it names a unit that is actually in the state,
 * and falls back to the lead when it names nothing — so a stale selection can never
 * blank the card.
 * The override clears `casting`: a focused unit is being inspected, not resolving a
 * spell, and captioning it "casting" would assert something the state never said.
 *
 * PURE: reads state, resolves nothing, advances no clock (AC-V6).
 */
export function statCard(
  state: BattleState,
  look: LookUp,
  lead: ActiveActor | undefined,
  focusUnitId?: string,
): StatCard | null {
  if (focusUnitId !== undefined && state.units.some((u) => u.id === focusUnitId)) {
    return describe(state, look, focusUnitId, false);
  }
  if (!lead) return null;
  let unitId = lead.id;
  let casting = false;
  if (lead.kind === "charge") {
    const charge = state.chargeQueue.find((c) => c.id === lead.id);
    if (!charge) return null;
    unitId = charge.sourceUnitId;
    casting = true;
  }
  return describe(state, look, unitId, casting);
}

/** One unit → its card. The single place a `StatCard`'s fields are read off the sim. */
function describe(
  state: BattleState,
  look: LookUp,
  unitId: string,
  casting: boolean,
): StatCard | null {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return null;
  const meta = look(unitId);
  return {
    id: unit.id,
    label: meta?.label ?? unit.id,
    color: meta?.color ?? FALLBACK_COLOR,
    hp: { cur: unit.hp, max: unit.maxHp },
    ct: unit.ct,
    brave: unit.brave,
    faith: unit.faith,
    ...(meta?.job !== undefined ? { job: meta.job } : {}),
    ...(meta?.portrait !== undefined
      ? { portrait: { url: meta.portrait.url, pending: meta.portrait.key === "placeholder" } }
      : {}),
    ...(casting ? { casting: true as const } : {}),
  };
}

/**
 * Render a {@link StatCard}. Classes only; the two shipped pages style them separately,
 * because the campaign's plate is parchment-era board chrome and the viewer's is its own
 * dark UI. Both plates must stay OPAQUE — the card is an overlay on the canvas, and
 * `e2e/contrast.spec.ts` explains at length why a translucent one measures green and
 * reads unreadable.
 *
 * THE EMPTY CARD STILL RENDERS. `data-state="none"` carries non-empty markup rather
 * than `""`, because an element that collapses to nothing moves everything under it —
 * the scene player's jumping text column, shipped once already. It reserves its space
 * and says why it is empty.
 *
 * HP prints as NUMBERS as well as a bar: colour and length are never the only channel
 * carrying a value. No `role="progressbar"` — axe requires `aria-valuenow/min/max`
 * alongside it, and the numbers next to the bar already carry the meaning. The image is
 * `alt="" aria-hidden="true"` (mirroring `scene.ts`) since the name beside it is the
 * accessible label; the caption below it is real text and stays readable.
 */
export function statCardHtml(card: StatCard | null): string {
  if (!card) {
    return `<div class="unit-card" data-testid="unit-card" data-state="none">
      <p class="uc-empty">Nobody is queued to act.</p></div>`;
  }
  const pct = card.hp.max > 0 ? Math.max(0, Math.min(100, Math.round((card.hp.cur / card.hp.max) * 100))) : 0;
  const portrait =
    card.portrait === undefined
      ? ""
      : `<figure class="uc-portrait"><img src="${esc(card.portrait.url)}" alt="" aria-hidden="true">` +
        (card.portrait.pending ? `<figcaption class="pending">Portrait pending</figcaption>` : "") +
        `</figure>`;
  const job = card.job === undefined ? "" : `<span class="uc-job">${esc(card.job)}</span>`;
  const casting = card.casting ? `<span class="uc-casting">⚡ casting</span>` : "";
  return `<div class="unit-card" data-testid="unit-card" data-state="live" style="--c:${card.color}">
    ${portrait}<div class="uc-body">
      <p class="uc-name"><b>${esc(card.label)}</b>${job}${casting}</p>
      <p class="uc-hp"><span class="uc-bar"><i style="width:${pct}%"></i></span> ${card.hp.cur} / ${card.hp.max}</p>
      <p class="uc-stats"><span>Clock <b>${card.ct}</b></span><span>Brave <b>${card.brave}</b></span><span>Faith <b>${card.faith}</b></span></p>
    </div></div>`;
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
      ? row("Turn as staged", `${cost.didMove ? "Move only" : "Wait"} · −${cost.cost} clock`) +
          row("Turn clock after", `${cost.ctBefore} → ${cost.ctAfter}`) +
          `<p class="phint">Hover an enemy to see the exact hit %, damage and clock cost before you commit.</p>`
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
      `${p.moved ? "Move + Act" : "Act"} · −${p.turn.cost} clock` +
        ` · clock ${p.turn.ctBefore} → ${p.turn.ctAfter}`,
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
