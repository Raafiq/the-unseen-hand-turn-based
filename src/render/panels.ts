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
import { abilityLabel } from "./prep.js";
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
 * a claim about which art this is, and only the key can back it. Six portraits are
 * bundled (ADR-0039); a unit `PORTRAIT_BY_UNIT` (`campaign-data.ts`) names gets its
 * key, everyone else — including every engine-viewer unit, which has no roster record
 * at all — gets `"placeholder"`, which is what the caption below keys off.
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
  /** `pending` is true iff the resolved asset key is `"placeholder"` — no art bundled for this unit (ADR-0039). */
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

/**
 * An ability's display name, through `prep.ts`'s one table — the sheet used to print
 * the raw id ("punch-art.wave-fist"), which wrapped to three lines AND named the
 * ability differently from every other surface in the game.
 */
const abilityName = (id: string): string => esc(abilityLabel(id));

const row = (k: string, v: string, cls = ""): string =>
  `<div class="prow ${cls}"><span class="pk">${k}</span><span class="pv">${v}</span></div>`;

/**
 * The resolution-transparency panel (docs/10 §4) — now the DEEP-DIVE, reached by an
 * explicit tap on the TARGET UNIT plate (`targetPlateHtml`), never open by default
 * during ordinary targeting (combat-revamp refinement, 2026-09-10: ADR-0043 decision
 * 4/5 forbids a temporary overlay covering the board except after that kind of
 * explicit ask). DEFERRED ROWS ARE ABSENT — no crit, reaction, status-on-hit,
 * elemental, AoE, LoS or charge line is printed, because printing one as zero would
 * assert a modeled zero for something the sim does not model (ADR-0010), which
 * pillar 4 forbids. There is no closing note naming the omission any more — the
 * omission itself, not a sentence about it, is what pillar 4 requires; a developer
 * accounting of "not modeled yet" is not combat UI (owner decision).
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
  const statuses =
    p.targetStatuses.length === 0 ? "none" : p.targetStatuses.map((s) => s.id).join(", ");
  // ORDER IS DECISION ORDER, AND EVERY ROW IS ONE LINE. Both changed with the stage
  // (ADR-0037). This set used to sit in a full-width desktop panel where all of it was
  // on screen at once; it now lives in a 176-unit sheet, so two things had to give:
  //
  //   1. ORDER. The rows a player commits on go first — will it land, from what arc,
  //      for how much, does it kill, what comes back at me, what does the turn cost.
  //      Context (where it resolves from, the act's own name, Zodiac, statuses) sits
  //      below them.
  //   2. LENGTH. Every value is written to fit ONE line at 176 units. The measured
  //      before/after is 489 units of content down to ~190: "Turn price" alone wrapped
  //      to three lines and "Action" to two, which is what pushed the act's own name
  //      off the bottom of the sheet in the first frame captured.
  //
  // NOTHING IS DROPPED. §4 items 2–8 and the Zodiac enhancement are all still printed;
  // hit % and its facing arc share a row because the arc is *why* the number is what it
  // is, and the price shares one with the slot it buys for the same reason.
  const arc = p.facing.toUpperCase();
  const price = `−${p.turn.cost} · ${p.turn.ctBefore}→${p.turn.ctAfter}`;
  const slot =
    p.turn.timelineSlot === null
      ? "beyond 8"
      : `${p.turn.timelineSlotExact ? "" : "≈ "}#${p.turn.timelineSlot + 1}`;
  // THE MAGNITUDE AND WHAT IT LEAVES THE TARGET ON ARE ONE ROW, and the lethal verdict
  // rides on it rather than taking a row of its own. Six rows is what the sheet holds
  // (138 usable units at 21 each); a seventh is below the fold, so every row that can
  // be folded into another without losing a value is.
  const commitCritical =
    row("Hit", `${p.hitChance}% · ${arc}`) +
    row(
      p.heal ? "Heal" : "Damage",
      `${p.magnitude} · HP ${p.targetHpBefore}→${p.targetHpAfter}${p.lethal ? " · LETHAL" : ""}`,
      p.lethal ? "lethal" : "",
    ) +
    // The target's reaction, shown ONLY when one can actually trigger from here
    // (ADR-0019). Absent, never "Counter: 0%" — and it leads with the cancellation
    // when the reaction is Hamedo, because every number above this row is then moot.
    (p.counterRisk
      ? (p.counterRisk.cancelsAct
          ? row("⚠ Blocked", `${abilityName(p.counterRisk.abilityId)} cancels this`, "lethal")
          : "") +
        row(
          p.counterRisk.cancelsAct ? "…hits back" : "⚠ Counter",
          `${p.counterRisk.chance}% · ${p.counterRisk.hitChance}% for ${p.counterRisk.magnitude}` +
            (p.counterRisk.lethal ? " · KILLS YOU" : ""),
          p.counterRisk.lethal ? "lethal" : "",
        ) +
        ""
      : "") +
    row("Turn", `${price} · ${slot}`);
  return (
    commitCritical +
    row("Act", `${abilityName(p.abilityId)} → ${labelOf(look, p.targetId)}`) +
    row("From", `${p.moved ? "staged" : "here"} (${p.from.x},${p.from.y})`) +
    // ONE ROW, because two would not fit and both are facts about the same target.
    // Neither is dropped: the Zodiac multiplier is `docs/04` §3's "surface the hidden
    // multiplier" and the status list is §4 item 8.
    row("Zodiac", `${p.zodiac} · ${statuses}`) +
    // Only when the act actually applies one. An "Inflicts: none" row on every
    // ordinary swing would be noise, and the absent-not-zero rule is about not
    // asserting an unmodeled effect — it does not require printing an empty one.
    (p.inflicts.length > 0
      ? row("Inflicts", p.inflicts.map((i) => i.id).join(", "), "lethal")
      : "")
    // NO CLOSING DISCLAIMER PARAGRAPH (combat-revamp refinement, 2026-09-10, owner
    // decision). The previous `.phint` here — "Not modeled yet, so not shown: crit,
    // elemental weak/half/absorb, AoE spread, line of sight" plus a two-sentence essay
    // on whether "Next slot" is exact or projected — was developer accounting, not
    // combat UI. Pillar 4's actual rule ("unmodeled things are ABSENT, never shown as
    // zero") is enforced by ROW OMISSION above, not by prose: there is no Crit row, no
    // Elemental row, no LoS row, ever, on this panel — deleting the sentence removes no
    // guarantee. The "Next slot" honesty requirement (docs/10 §4 item 7 / AC-V11) still
    // holds: the `slot` value above is prefixed "≈" whenever `timelineSlotExact` is
    // false, so the row itself carries the fact/projection distinction the AC asks for.
  );
}

/** A stat bar, shared by the two combat-shell plates below (docs/10 §8, ADR-0043). */
function plateBar(hp: number, maxHp: number, color: string): string {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100))) : 0;
  return `<span class="plate-bar" style="--c:${esc(color)}"><i style="width:${pct}%"></i></span>`;
}

/**
 * The ACTIVE UNIT plate (combat revamp, ADR-0043) — the band's compact, always-on
 * replacement for ADR-0038's floating actor tab. Same underlying fact as the old
 * tab (name + HP, AC-V37: deeper stats stay behind the tap-to-open drawer) PLUS the
 * Clock value the mockup's frame shows (`ADR-0033`'s stat set already carries CT on
 * `UnitState`; nothing new is read off the sim to print it).
 */
export function activePlateHtml(session: Session, look: LookUp): string {
  const actor = session.actor();
  if (!actor) return `<span class="plate-empty">No unit is acting</span>`;
  const meta = look(actor.id);
  const color = meta?.color ?? FALLBACK_COLOR;
  // THREE ROWS, NOT FIVE (combat-revamp pass 3, PIXEL BUDGET) — the plate is a fixed
  // 50px-tall box and five stacked rows (name/job/clock/bar/hp) measured to ~67px of
  // content at this font size, so `overflow: hidden` + the flex column's vertical
  // centring clipped the TOPMOST row — the name — off both the active and target
  // plate every time. Job and Clock now share one row; the bar and the HP figure
  // share another. Name keeps its own row, which is the fix: it can no longer be the
  // one that gets pushed out.
  return (
    `<span class="plate-name">${esc(meta?.label ?? actor.id)}</span>` +
    `<span class="plate-row">` +
    (meta?.job ? `<span class="plate-job">${esc(meta.job)}</span>` : "") +
    `<span class="plate-clock">Clock ${actor.ct}</span>` +
    `</span>` +
    `<span class="plate-row">` +
    plateBar(actor.hp, actor.maxHp, color) +
    `<span class="plate-hp">HP ${actor.hp} / ${actor.maxHp}</span>` +
    `</span>`
  );
}

/**
 * The TARGET UNIT plate (combat revamp, ADR-0043, owner decision 2). Driven by
 * {@link Session.preview} — the SAME staged/hover computation the deep-dive sheet
 * reads — so the compact plate can never disagree with the sheet it summarises.
 *
 * THE COUNTER/BLOCKED LINE IS THE WHOLE REASON THIS PLATE EXISTS SEPARATELY FROM
 * THE SHEET (owner decision 2): it must be visible with ZERO extra taps once a
 * target is relevant, so it cannot live behind the sheet's open gesture. `⛔
 * BLOCKED` (a `preemptive` reaction cancels the act — `p.counterRisk.cancelsAct`)
 * and `⚠ COUNTER` (an ordinary counter-swing will answer it) are mutually
 * exclusive readings of the SAME {@link CounterRisk}, mirroring `previewHtml`'s
 * "⚠ Blocked" / "⚠ Counter" rows one level down — this is the glyph vocabulary the
 * owner's note specifies, on the plate rather than in the sheet.
 *
 * ABSENT-NOT-ZERO: `p.counterRisk` is `undefined` whenever no reaction could fire
 * (`preview.ts`'s own contract) — the warning `<span>` is then not merely hidden,
 * it is never built, so a test cannot find it in the DOM at all. A build with the
 * risk stripped and one with it present differ by a whole element, not a class.
 */
export function targetPlateHtml(session: Session, look: LookUp): string {
  const p = session.preview();
  if (!p) return `<span class="plate-empty">No target</span>`;
  const meta = look(p.targetId);
  const color = meta?.color ?? FALLBACK_COLOR;
  const warn = p.counterRisk
    ? p.counterRisk.cancelsAct
      ? `<span class="plate-warn blocked" data-testid="target-blocked">⛔ BLOCKED</span>`
      : `<span class="plate-warn counter" data-testid="target-counter">⚠ COUNTER</span>`
    : "";
  // THREE (OR FOUR, warn permitting) ROWS, NOT SIX — same pixel-budget fix as
  // `activePlateHtml` above, and the sharper case: this plate carries a NAME the
  // owner's acceptance line names explicitly ("acting unit and target identity
  // remain clear"), and the old five/six-row stack clipped exactly that row off the
  // top every time, silently — the HTML always had it; the box never showed it.
  // HIT and DMG share a row; the bar and the HP figure share another; WARN (rare —
  // absent-not-zero, only built when a reaction is live) gets its own row rather
  // than being folded into HP, because it is the one line the owner's decision 2
  // requires to stay readable with zero extra taps.
  return (
    `<span class="plate-name">${esc(meta?.label ?? p.targetId)}</span>` +
    `<span class="plate-row">` +
    `<span class="plate-hit">HIT ${p.hitChance}%</span>` +
    `<span class="plate-dmg">${p.heal ? "HEAL" : "DMG"} ${p.magnitude}</span>` +
    `</span>` +
    `<span class="plate-row">` +
    plateBar(p.targetHpAfter, p.targetMaxHp, color) +
    `<span class="plate-hp">HP ${p.targetHpBefore} / ${p.targetMaxHp}</span>` +
    `</span>` +
    warn
  );
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
