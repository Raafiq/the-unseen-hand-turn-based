/**
 * The prep / loadout panel (render layer) — where the customization pillar becomes
 * something a player DOES rather than something the docs claim.
 *
 * It mounts over any {@link UnitRecord}s the caller hands it, and reports every edit
 * back through `onChange`. Two callers today:
 *
 *   - `/` (the engine viewer) mounts {@link mountPrepDemo}: one fixed demo Knight, no
 *     progression controls, `onChange` discarded. It is a SHOWCASE — a deterministic
 *     fixed learn/equip sequence whose screenshots are a regression baseline.
 *   - `/game.html` (the campaign) mounts {@link mountPrep} on the briefing screen with
 *     the save's party and `progression: true`, and writes each edit back into the save
 *     (docs/11 M0 item 3).
 *
 * WHY IT SPLITS INTO A MODEL AND A MOUNT. {@link PrepModel} holds the records and every
 * rule-bearing edit and is **DOM-free**, exactly as `session.ts` is and for the same
 * reason: the interesting behaviour (a job change that would strand an illegal secondary,
 * an AP purchase, what a row says when it is unaffordable) is then assertable in a plain
 * Node test rather than only through a browser. {@link mountPrep} draws a model and wires
 * the controls; it owns no rules of its own.
 *
 * It also used to be a module SINGLETON — `record` and `bodyEl` as module state, which is
 * fine for exactly one mount and silently wrong for two.
 *
 * Render-only glue (ADR-0007): imports the PURE sim, never the reverse. Presentation
 * labels for job/ability/trait ids live in the maps below (the `UNIT_META` precedent in
 * demo.ts), NOT in sim types. Every rule — what may be equipped, what may be learned,
 * what it costs — is asked of the sim; this file only draws the answer. The command list
 * is the real projection `buildBattleUnit(record, registry).abilities`, the same one-way
 * compile a battle uses, so what the panel shows is what the unit would fight with.
 *
 * Deterministic: no RNG, no wall-clock, no timers.
 */

import pack from "../../data/base-pack.json";
import {
  DEFERRED_ACTIONS,
  DEFERRED_MOVEMENT_EFFECTS,
  DEFERRED_REACTION_EFFECTS,
  DEFERRED_SUPPORT_EFFECTS,
  buildBattleUnit,
  canLearn,
  changeJob,
  checkMastery,
  defaultUnitRecord,
  learnAbility,
  loadContentPack,
  primaryCommand,
  setLoadoutSlot,
  setLoadoutTraits,
  type ContentRegistry,
  type Loadout,
  type LoadoutSlot,
  type UnitRecord,
} from "../sim/index.js";

// ---- Presentation metadata (render-only; keyed by sim ids) -----------------

const JOB_LABEL: Record<string, string> = {
  knight: "Knight",
  monk: "Monk",
  wizard: "Wizard",
  thief: "Thief",
  priest: "Priest",
  archer: "Archer",
  geomancer: "Geomancer",
  summoner: "Summoner",
};

const SKILLSET_LABEL: Record<string, string> = {
  "battle-skill": "Battle Skill",
  "punch-art": "Punch Art",
  "black-magic": "Black Magic",
  "white-magic": "White Magic",
  steal: "Steal",
  aim: "Aim",
  geomancy: "Geomancy",
  summon: "Summon",
};

const ABILITY_LABEL: Record<string, string> = {
  "basic.attack": "Attack",
  "battle-skill.weapon-break": "Weapon Break",
  "battle-skill.armor-break": "Armor Break",
  "battle-skill.equip-heavy-armor": "Equip Heavy Armor",
  "black-magic.fire": "Fire",
  "black-magic.fire-2": "Fire 2",
  "black-magic.ice": "Ice",
  "black-magic.ice-2": "Ice 2",
  "black-magic.bolt": "Bolt",
  "black-magic.bolt-2": "Bolt 2",
  "black-magic.magic-attack-up": "Magic Attack Up",
  "punch-art.wave-fist": "Wave Fist",
  "punch-art.chakra": "Chakra",
  "punch-art.revive": "Revive",
  "punch-art.counter": "Counter",
  "steal.gil": "Steal Gil",
  "steal.move-plus-2": "Move +2",
};

const TRAIT_LABEL: Record<string, string> = {
  "arcane-attunement": "Arcane Attunement",
  bulwark: "Bulwark",
  "inner-focus": "Inner Focus",
  lightfoot: "Lightfoot",
  "aegis-of-faith": "Aegis of Faith",
  marksman: "Marksman",
  stoneskin: "Stoneskin",
  "spirit-conduit": "Spirit Conduit",
};

/** Fallback label: strip the skillset prefix, de-kebab, Title Case. */
const prettify = (id: string): string =>
  id
    .replace(/^[^.]+\./, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const jobLabel = (id: string): string => JOB_LABEL[id] ?? prettify(id);
const skillsetLabel = (id: string): string => SKILLSET_LABEL[id] ?? prettify(id);
const abilityLabel = (id: string): string => ABILITY_LABEL[id] ?? prettify(id);
const traitLabel = (id: string): string => TRAIT_LABEL[id] ?? prettify(id);

/**
 * Why an ability currently does nothing, across ALL four kinds of slot, or `null` when it
 * is live. One lookup rather than four, because a learn list sells nodes of every type
 * from the same tree — a per-slot check would silently pass the three types it did not
 * happen to cover, which is the subset-reads-as-the-set failure at panel scale.
 */
const deferredBlocker = (abilityId: string): string | null =>
  DEFERRED_ACTIONS[abilityId] ??
  DEFERRED_REACTION_EFFECTS[abilityId] ??
  DEFERRED_SUPPORT_EFFECTS[abilityId] ??
  DEFERRED_MOVEMENT_EFFECTS[abilityId] ??
  null;

/** HTML-escape authored strings (unit names come from campaign data, not from here). */
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---- The derived stat strip -------------------------------------------------

/** The derived combat stats surfaced in the live stat strip. */
export interface StatLine {
  hp: number;
  pa: number;
  ma: number;
  move: number;
  evade: number;
}

/** Stat strip cells: display label + which {@link StatLine} field, in display order. */
const STAT_CELLS: ReadonlyArray<{ key: keyof StatLine; label: string; suffix: string }> = [
  { key: "hp", label: "HP", suffix: "" },
  { key: "pa", label: "PA", suffix: "" },
  { key: "ma", label: "MA", suffix: "" },
  { key: "move", label: "Move", suffix: "" },
  { key: "evade", label: "Evade", suffix: "%" },
];

// ---- The panel --------------------------------------------------------------


// ---- The model: every rule-bearing edit, with no DOM ------------------------

export interface PrepModelOptions {
  registry: ContentRegistry;
  /** The records this panel may edit, in display order. At least one. */
  records: readonly UnitRecord[];
  /** Which record starts selected; defaults to the first. */
  selectedId?: string;
  /**
   * Called with the EDITED record after every change. The caller owns persistence — the
   * model never writes anywhere, which is what lets the campaign route it through
   * `updatePartyMember` and the demo throw it away.
   */
  onChange?: (record: UnitRecord) => void;
  /**
   * Equipment ids the party OWNS (the campaign save's inventory). Absent or empty ⇒
   * the weapon row is not drawn at all.
   *
   * Owned, not "every item in the pack": gear arrives on an authored drip
   * (ADR-0021), so listing the catalog would show a player eight weapons and let
   * them equip the one the campaign has not handed out yet — which is precisely the
   * farm-free schedule the ADR exists to protect.
   */
  inventory?: readonly string[];
}

/** One row of the learn list: what it is, what it costs, and why it is blocked. */
export interface LearnRow {
  /** The job tree's node id (what {@link PrepModel.learn} takes). */
  node: string;
  /** The ability the node grants — the label the row shows. */
  ability: string;
  apCost: number;
  /** Already known: no cost, no button, and never re-charged (AC-J3). */
  known: boolean;
  /** Affordable and unlocked right now. */
  buyable: boolean;
  /**
   * The sim's OWN reason a row is blocked (a named prerequisite, or an AP shortfall),
   * verbatim from `canLearn`. Re-deriving "can I afford this?" in the view would be a
   * second copy of a rule the sim already owns, and the two would drift.
   */
  reason: string | null;
  /**
   * What the node grants: an `action` (a command in battle) or a passive that must
   * then be EQUIPPED in its chassis slot.
   *
   * The learn list showed neither, so "Hp Boost" sat in the same list as Weapon Break
   * with nothing saying one is a command and the other is a Support you still have to
   * equip. A player who buys a passive and then looks for it in their command list
   * finds nothing and reasonably concludes the 60 AP did nothing.
   */
  kind: "action" | "reaction" | "support" | "movement";
  /**
   * Why the ability this node grants currently does NOTHING, or `null` when it is live.
   *
   * The command list has marked deferred abilities since ADR-0019, but a learn list is
   * worse than a command list to get wrong: a command you cannot use is a disappointment,
   * an ability you PAID 60 AP for and cannot use is a refund request. AP is spent
   * permanently and never refunded (AC-J3), so an unmarked inert node is the panel
   * charging real currency for nothing — pillar 4's absent-not-zero rule at its most
   * expensive. Marked, not hidden: the node is real, and hiding it would misrepresent
   * the tree.
   */
  deferred: string | null;
}

/**
 * The prep panel's state and rules, DOM-free.
 *
 * THE SIM OWNS EVERY RULE. What may be equipped is `setLoadoutSlot`, what may be learned
 * is `canLearn`, what a unit would fight with is `buildBattleUnit`. This class sequences
 * those calls and holds which record is selected; it never re-implements one of them.
 */
export class PrepModel {
  private readonly registry: ContentRegistry;
  private readonly onChange: ((record: UnitRecord) => void) | undefined;
  private recs: UnitRecord[];
  private index: number;
  /**
   * Which job's tree the learn list is SHOWING. `null` = follow the selected unit's
   * current job, which is what it always used to do implicitly.
   *
   * WHY THIS EXISTS. `canLearn` never required the unit to BE in the job — `docs/02`
   * AC-J2 says an ability is bought "on the owning job's tree" and AP is one global
   * pool, so cross-job buying is the rule, not an exception. The panel was the only
   * thing hiding it, by hard-coding `currentJob`, and that made the Secondary command —
   * 60 AP, affordable from battle three — look impossible. Browsing state, not record
   * state: it is never persisted and never reaches `onChange`.
   */
  private browse: string | null = null;
  private inv: string[];

  constructor(opts: PrepModelOptions) {
    if (opts.records.length === 0) throw new Error("PrepModel: needs at least one record");
    this.registry = opts.registry;
    this.onChange = opts.onChange;
    this.recs = [...opts.records];
    this.inv = [...(opts.inventory ?? [])];
    this.index = Math.max(
      0,
      this.recs.findIndex((r) => r.id === opts.selectedId),
    );
  }

  /** The record currently being edited. */
  record(): UnitRecord {
    return this.recs[this.index]!;
  }

  /** Every record this panel holds, in display order (edits included). */
  records(): UnitRecord[] {
    return [...this.recs];
  }

  selectedIndex(): number {
    return this.index;
  }

  /** Select another record by id. Throws on an id the panel does not hold. */
  select(recordId: string): void {
    const next = this.recs.findIndex((r) => r.id === recordId);
    if (next === -1) throw new Error(`prep: no record with id "${recordId}"`);
    this.index = next;
    // A different unit means a different tree to land on; keeping the old one would
    // show a Knight the Thief tree they were reading for someone else.
    this.browse = null;
  }

  /**
   * Replace the records (e.g. the campaign advanced a battle), keeping the current
   * selection when that id is still present. Returns whether anything actually changed,
   * so a page that calls this on every repaint can skip a re-render — a blind one would
   * blow away the focus of the control the player is using.
   */
  setRecords(next: readonly UnitRecord[], selectedId?: string): boolean {
    if (next.length === 0) throw new Error("prep: needs at least one record");
    const keepId = selectedId ?? this.record().id;
    const nextIndex = Math.max(
      0,
      next.findIndex((r) => r.id === keepId),
    );
    if (nextIndex === this.index && JSON.stringify(next) === JSON.stringify(this.recs)) {
      return false;
    }
    this.recs = [...next];
    this.index = nextIndex;
    this.browse = null;
    return true;
  }

  // ── projections (the REAL ones: whatever a battle would compile) ───────────

  /** The castable command ids = the real battle projection (basic + primary + secondary). */
  commands(): string[] {
    return buildBattleUnit(this.record(), this.registry).abilities.map((a) => a.id);
  }

  /**
   * The BUILT unit's derived stats — the real battle projection (`buildBattleUnit`,
   * build.ts), with the equipped traits AND the equipped support already folded in
   * (ADR-0017). Reading them from the same one-way compile a battle uses means the strip
   * shows exactly what a unit would fight with (never a re-derivation) — which is also
   * why the Support dropdown moves the MA cell for free.
   */
  stats(record: UnitRecord = this.record()): StatLine {
    const u = buildBattleUnit(record, this.registry);
    return { hp: u.maxHp, pa: u.pa, ma: u.ma, move: u.move, evade: u.evasion.classEv };
  }

  /** Job ids equippable as the Secondary: another job the unit knows an action in. */
  equippableSecondaryJobs(): string[] {
    const r = this.record();
    const out: string[] = [];
    for (const jobId of this.registry.jobById.keys()) {
      if (jobId === r.currentJob) continue;
      const skillset = this.registry.job(jobId).primarySkillset;
      const has = r.learned.some((id) => {
        const a = this.registry.ability(id);
        return a.type === "action" && a.skillset === skillset;
      });
      if (has) out.push(jobId);
    }
    return out;
  }

  /** Learned ability ids whose authored type matches a single-ability slot. */
  learnedByType(type: "reaction" | "support" | "movement"): string[] {
    return this.record().learned.filter((id) => this.registry.ability(id).type === type);
  }

  /** The Primary command's learned action ids (current job's skillset ∩ learned). */
  primaryActionIds(): string[] {
    const r = this.record();
    const skillset = primaryCommand(r, this.registry);
    return r.learned.filter((id) => {
      const a = this.registry.ability(id);
      return a.type === "action" && a.skillset === skillset;
    });
  }

  /** Mastery traits the unit has earned (from mastered jobs). */
  earnedTraits(): string[] {
    return this.record().mastered.map(
      (jobId) => this.registry.job(jobId).masteryBonus.trait,
    );
  }

  /** Every job id the content pack defines, in pack order. */
  jobIds(): string[] {
    return [...this.registry.jobById.keys()];
  }

  /** The equipment ids the party owns, in grant order. */
  inventory(): string[] {
    return [...this.inv];
  }

  /**
   * Replace the owned-equipment list. Returns whether it changed, mirroring
   * {@link setRecords} — the page calls this on every repaint and a blind redraw
   * would steal focus from the control the player is using.
   */
  setInventory(next: readonly string[]): boolean {
    if (next.length === this.inv.length && next.every((id, i) => id === this.inv[i])) {
      return false;
    }
    this.inv = [...next];
    return true;
  }

  /** Owned items that fit the weapon slot, as `{id, name}` for the selector. */
  weaponOptions(): { id: string; name: string }[] {
    return this.inv
      .map((id) => this.registry.equipment(id))
      .filter((item) => item.slot === "weapon")
      .map((item) => ({ id: item.id, name: item.name }));
  }

  /**
   * Equip a weapon by id, or `null` to go unarmed. Free and reversible like the
   * loadout slots (AC-J4): it never touches `ap`, `learned` or `mastered`.
   *
   * Refuses an item the party does not own, rather than trusting the view to only
   * offer owned ones — the drip is a rule, and a rule enforced solely by which
   * options a dropdown happens to render is not enforced.
   */
  setWeapon(itemId: string | null): void {
    if (itemId !== null) {
      if (!this.inv.includes(itemId)) {
        throw new Error(`prep: the party does not own equipment "${itemId}"`);
      }
      const item = this.registry.equipment(itemId);
      if (item.slot !== "weapon") {
        throw new Error(`prep: equipment "${itemId}" is a ${item.slot}, not a weapon`);
      }
    }
    this.commit({ ...this.record(), weapon: itemId });
  }

  /** Which job's tree {@link learnRows} is listing. */
  browseJob(): string {
    return this.browse ?? this.record().currentJob;
  }

  /** Point the learn list at another job's tree. Throws on an unknown id. */
  setBrowseJob(jobId: string): void {
    this.registry.job(jobId); // throws rather than storing an id nothing can resolve
    this.browse = jobId;
  }

  /** The skillset id the current job commands. */
  primarySkillset(): string {
    return primaryCommand(this.record(), this.registry);
  }

  /** The skillset id any job commands — for labelling the Secondary options. */
  skillsetOf(jobId: string): string {
    return this.registry.job(jobId).primarySkillset;
  }

  /**
   * The learn list for the CURRENT job's tree.
   *
   * You learn the job you are IN, so the list is one tree at a time and switching job
   * (free) is how you reach another — which keeps the panel honest about where progress
   * comes from, and keeps the list short enough to read.
   */
  learnRows(): LearnRow[] {
    const r = this.record();
    const known = new Set(r.learned);
    const jobId = this.browseJob();
    return this.registry.job(jobId).tree.map((node) => {
      const deferred = deferredBlocker(node.ability);
      const kind = this.registry.ability(node.ability).type;
      if (known.has(node.ability)) {
        return {
          node: node.node,
          ability: node.ability,
          apCost: node.apCost,
          known: true,
          buyable: false,
          reason: null,
          deferred,
          kind,
        };
      }
      const check = canLearn(r, jobId, node.node, this.registry);
      return {
        node: node.node,
        ability: node.ability,
        apCost: node.apCost,
        known: false,
        buyable: check.ok,
        reason: check.ok ? null : check.reason,
        deferred,
        kind,
      };
    });
  }

  // ── mutation ──────────────────────────────────────────────────────────────

  setSlot(slot: LoadoutSlot, value: string | null): void {
    this.commit(setLoadoutSlot(this.record(), slot, value, this.registry));
  }

  setTraits(traits: string[]): void {
    this.commit(setLoadoutTraits(this.record(), traits, this.registry));
  }

  /**
   * Change the active job.
   *
   * AND CLEAR A SECONDARY THAT WOULD NOW COLLIDE. `changeJob` deliberately validates
   * nothing ("the caller/UI picks from unlocked jobs"), so a unit carrying Punch Art as
   * its Secondary that becomes a Monk ends up with `secondary === currentJob` — the exact
   * state `setLoadoutSlot` refuses to create, reached through the back door. Nothing
   * downstream throws on it; the secondary just silently duplicates the primary command,
   * so it reads as a content bug rather than an illegal record. Clearing it here is the
   * UI honouring the rule the sim states.
   */
  setJob(jobId: string): void {
    this.registry.job(jobId); // throws on an unknown id rather than storing it
    let next = changeJob(this.record(), jobId);
    if (next.loadout.secondary === jobId) {
      next = setLoadoutSlot(next, "secondary", null, this.registry);
    }
    this.browse = null;
    this.commit(next);
  }

  /** Buy a tree node with banked AP, then latch any mastery it completed. */
  learn(jobId: string, nodeId: string): void {
    const bought = learnAbility(this.record(), jobId, nodeId, this.registry);
    this.commit(checkMastery(bought, jobId, this.registry));
  }

  /**
   * The ONE write path. Every mutator bottoms out here, so "the panel changed the record"
   * and "the caller was told" cannot come apart — the bug where a UI edits its own copy
   * and the save never hears about it.
   */
  private commit(next: UnitRecord): void {
    this.recs = this.recs.map((r, i) => (i === this.index ? next : r));
    this.onChange?.(next);
  }
}

export interface PrepOptions extends PrepModelOptions {
  /**
   * Show the progression controls: the job selector and the AP-priced learn list.
   *
   * Off for the engine viewer's demo, whose whole point is a FIXED record with a fixed
   * story ("equip Black Magic, watch the command list grow"); a learn list there would
   * let a visitor spend the demo's 20,000 AP and walk the screenshots off their baseline.
   */
  progression?: boolean;
}

/** The panel's shipped seam — the same methods the controls drive, for tests and pages. */
export interface PrepHandle {
  /** The model behind the panel. Mutating it directly will NOT repaint; use the methods. */
  readonly model: PrepModel;
  record: () => UnitRecord;
  records: () => UnitRecord[];
  select: (recordId: string) => void;
  setRecords: (records: readonly UnitRecord[], selectedId?: string) => void;
  commands: () => string[];
  stats: () => StatLine;
  setSlot: (slot: LoadoutSlot, value: string | null) => void;
  setTraits: (traits: string[]) => void;
  setJob: (jobId: string) => void;
  /** Point the learn list at another job's tree (browsing only — no record change). */
  setBrowseJob: (jobId: string) => void;
  /** Equip an owned weapon by id, or `null` for unarmed. */
  setWeapon: (itemId: string | null) => void;
  /** Re-point the panel at the party's owned equipment. */
  setInventory: (ids: readonly string[]) => boolean;
  learn: (jobId: string, nodeId: string) => void;
}

interface Opt {
  value: string;
  label: string;
}

const optionList = (opts: Opt[], selected: string): string =>
  opts
    .map(
      (o) =>
        `<option value="${esc(o.value)}"${o.value === selected ? " selected" : ""}>${esc(o.label)}</option>`,
    )
    .join("");

const valueOrNull = (v: string): string | null => (v === "" ? null : v);

/**
 * Mount a prep panel into `container`. Returns the handle the page and the tests both
 * drive — there is no parallel path for tests (docs/10 §7). Every method repaints; the
 * rules all live in {@link PrepModel}.
 */
export function mountPrep(container: HTMLElement, opts: PrepOptions): PrepHandle {
  const model = new PrepModel(opts);
  const progression = opts.progression ?? false;

  function sel(testid: string): HTMLElement {
    const el = container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
    if (!el) throw new Error(`prep: missing element "${testid}"`);
    return el;
  }

  /** The party strip — omitted entirely for a single record, where it says nothing. */
  function rosterHtml(): string {
    const records = model.records();
    if (records.length < 2) return "";
    const selected = model.selectedIndex();
    const tabs = records
      .map(
        (r, i) =>
          `<button type="button" class="ptab${i === selected ? " on" : ""}" data-member="${esc(r.id)}"` +
          `${i === selected ? ' aria-current="true"' : ""}>` +
          `<span class="pname">${esc(r.name)}</span>` +
          `<span class="pmeta">${esc(jobLabel(r.currentJob))} · ${r.ap} AP</span></button>`,
      )
      .join("");
    return `<div class="roster" data-testid="prep-roster">${tabs}</div>`;
  }

  /**
   * The weapon row — drawn ONLY when the party owns a weapon.
   *
   * Hidden rather than empty-and-disabled, the absent-not-zero rule: before the
   * campaign's first grant there is no such thing as a weapon choice, and an empty
   * dropdown would present "you own nothing yet" as "your options are none", which
   * reads like a bug. The engine viewer's demo panel has no inventory at all and so
   * never draws it.
   */
  function weaponSlotHtml(): string {
    const owned = model.weaponOptions();
    if (owned.length === 0) return "";
    const opts = optionList(
      [{ value: "", label: "Unarmed" }, ...owned.map((w) => ({ value: w.id, label: w.name }))],
      model.record().weapon ?? "",
    );
    // A nudge only while something free is going unused, and only then — a hint that
    // is always on is wallpaper, and a player who has deliberately chosen Unarmed does
    // not need telling twice.
    const unused =
      model.record().weapon === null
        ? `<p class="hint" data-testid="prep-weapon-hint">You own ${owned.length} weapon${owned.length === 1 ? "" : "s"} and have none equipped.</p>`
        : "";
    return `
      <div class="slot">
        <h3>Weapon <span class="lock">swaps are free</span></h3>
        <select data-testid="prep-weapon" aria-label="Equipped weapon">${opts}</select>
        ${unused}
      </div>`;
  }

  /** The job selector + the AP-priced learn list, straight off {@link PrepModel.learnRows}. */
  function progressionHtml(): string {
    if (!progression) return "";
    const r = model.record();
    const jobOptions = optionList(
      model.jobIds().map((j) => ({ value: j, label: jobLabel(j) })),
      r.currentJob,
    );
    const browsing = model.browseJob();
    const treeOptions = optionList(
      model.jobIds().map((j) => ({
        value: j,
        label: j === r.currentJob ? `${jobLabel(j)} (current)` : jobLabel(j),
      })),
      browsing,
    );

    const rows = model
      .learnRows()
      .map((row) => {
        const tag =
          row.deferred === null
            ? ""
            : ` <span class="tag" title="No effect yet — ${esc(row.deferred)}">no effect yet</span>`;
        // Passives get their slot named on the row; actions do not, because "it is a
        // command" is what a learn list already implies. Naming only the exception
        // keeps the list quiet and still closes the gap.
        const kindTag =
          row.kind === "action" ? "" : ` <span class="kind">${esc(row.kind)}</span>`;
        const label = `${esc(abilityLabel(row.ability))}${kindTag}${tag}`;
        const cls = [row.known ? "known" : "", row.buyable ? "" : "locked", row.deferred === null ? "" : "deferred"]
          .filter(Boolean)
          .join(" ");
        if (row.known) {
          return `<li class="${cls}" data-node="${esc(row.node)}"><span class="n">${label}</span><span class="s">learned</span></li>`;
        }
        const why = row.buyable ? `Spend ${row.apCost} AP` : (row.reason ?? "");
        return (
          `<li class="${cls}" data-node="${esc(row.node)}">` +
          `<span class="n">${label}</span>` +
          `<button type="button" class="buy" data-learn="${esc(row.node)}"` +
          `${row.buyable ? "" : " disabled"} title="${esc(why)}">${row.apCost} AP</button></li>`
        );
      })
      .join("");

    return `
    <div class="prog" data-testid="prep-progression">
      <div class="slot">
        <h3>Job <span class="lock">changing is free</span></h3>
        <select data-testid="prep-job" aria-label="Current job">${jobOptions}</select>
        <p class="hint">Learned abilities and mastery stay with the unit, not the job.</p>
      </div>
      <div class="learn">
        <h3>Learn · ${esc(skillsetLabel(model.skillsetOf(browsing)))} <span class="count" data-testid="prep-ap" title="Banked AP">${r.ap} AP</span></h3>
        <select data-testid="prep-tree" aria-label="Skill tree to browse">${treeOptions}</select>
        <p class="hint">AP is one pool — you can buy from any job's tree without changing job. Learning one action from another job unlocks it as a Secondary command.</p>
        <ul class="learn-list" data-testid="prep-learn">${rows}</ul>
      </div>
    </div>`;
  }

  function render(): void {
    const record = model.record();
    const commands = model.commands();
    const traits = model.earnedTraits();

    // Live derived stats, and a traits-stripped baseline so any stat an equipped trait
    // lifts renders highlighted (the visible "the trait did something").
    const stats = model.stats();
    const baseStats = model.stats({ ...record, loadout: { ...record.loadout, traits: [] } });
    const statsBody = STAT_CELLS.map(({ key, label, suffix }) => {
      const up = stats[key] > baseStats[key];
      return `<li${up ? ' class="up"' : ""}><span class="k">${label}</span><span class="v" data-stat="${key}">${stats[key]}${suffix}</span></li>`;
    }).join("");

    const noneOpt: Opt = { value: "", label: "— none —" };

    const secondaryOptions = optionList(
      [
        noneOpt,
        ...model.equippableSecondaryJobs().map((j) => ({
          value: j,
          label: `${skillsetLabel(model.skillsetOf(j))} (${jobLabel(j)})`,
        })),
      ],
      record.loadout.secondary ?? "",
    );

    // A slot whose equipped ability does nothing must SAY so — the same rule the command
    // list already follows for DEFERRED_ACTIONS. The reaction slot went live (ADR-0019)
    // while two of its abilities stayed deferred and the whole movement slot stayed inert,
    // so "it is in the dropdown" stopped meaning "it will do something". Without this the
    // panel reads as if every equip is real, which is the dead-slot illusion at the UI layer.
    const deferredFor: Record<
      "reaction" | "support" | "movement",
      Readonly<Record<string, string>>
    > = {
      reaction: DEFERRED_REACTION_EFFECTS,
      support: DEFERRED_SUPPORT_EFFECTS,
      movement: DEFERRED_MOVEMENT_EFFECTS,
    };
    const abilitySelect = (slot: "reaction" | "support" | "movement"): string =>
      optionList(
        [
          noneOpt,
          ...model.learnedByType(slot).map((id) => ({
            value: id,
            label:
              deferredFor[slot][id] === undefined
                ? abilityLabel(id)
                : `${abilityLabel(id)} — no effect yet`,
          })),
        ],
        record.loadout[slot] ?? "",
      );

    const traitsBody =
      traits.length === 0
        ? `<p class="empty">No mastered jobs yet — master a full job tree to earn a trait.</p>`
        : traits
            .map((t) => {
              const on = record.loadout.traits.includes(t);
              return `<label class="chk"><input type="checkbox" data-trait="${esc(t)}"${on ? " checked" : ""}/> ${esc(traitLabel(t))}</label>`;
            })
            .join("");

    // A DEFERRED command resolves to nothing in the current pipeline, so listing it beside
    // Attack as an equal option asserts a capability the sim does not have — pillar 4's
    // absent-not-zero rule applied to a menu. Marked, not hidden: they ARE learned and
    // equipped, and hiding them would misrepresent the chassis in the other direction.
    //
    // Keyed per ABILITY, not per skillset: `steal` is a live skillset now (`heart` charms)
    // while `steal.gil` and the three equipment thefts still do nothing, so a skillset-level
    // lookup would have quietly promoted four dead commands.
    const commandItems = commands
      .map((id) => {
        const blocker = DEFERRED_ACTIONS[id];
        return blocker === undefined
          ? `<li data-cmd="${esc(id)}">${esc(abilityLabel(id))}</li>`
          : `<li data-cmd="${esc(id)}" class="deferred" title="No effect yet — ${esc(blocker)}">${esc(abilityLabel(id))} <span class="tag">no effect yet</span></li>`;
      })
      .join("");

    container.innerHTML = `
    ${rosterHtml()}
    <div class="stats" data-testid="prep-stats">
      <h3>${esc(record.name)} <span class="lock">traits apply at battle start</span></h3>
      <ul class="stat-row">${statsBody}</ul>
    </div>
    <div class="chassis">
      <div class="slot" data-testid="prep-primary">
        <h3>Primary <span class="lock">locked to job</span></h3>
        <div class="val">${esc(skillsetLabel(model.primarySkillset()))} (${esc(jobLabel(record.currentJob))})</div>
        <div class="sub">${model.primaryActionIds().map((id) => esc(abilityLabel(id))).join(", ") || "—"}</div>
      </div>
      ${weaponSlotHtml()}
      <div class="slot">
        <h3>Secondary</h3>
        <select data-testid="prep-secondary" aria-label="Secondary command">${secondaryOptions}</select>
      </div>
      <div class="slot">
        <h3>Reaction</h3>
        <select data-testid="prep-reaction" aria-label="Reaction ability">${abilitySelect("reaction")}</select>
      </div>
      <div class="slot">
        <h3>Support</h3>
        <select data-testid="prep-support" aria-label="Support ability">${abilitySelect("support")}</select>
      </div>
      <div class="slot">
        <h3>Movement</h3>
        <select data-testid="prep-movement" aria-label="Movement ability">${abilitySelect("movement")}</select>
      </div>
      <div class="slot" data-testid="prep-traits">
        <h3>Traits <span class="lock">max 2</span></h3>
        ${traitsBody}
        ${
          traits.length > 0 && record.loadout.traits.length === 0
            ? `<p class="hint" data-testid="prep-traits-hint">Earned and not equipped — traits cost no AP.</p>`
            : ""
        }
      </div>
    </div>
    ${progressionHtml()}
    <div class="cmds">
      <h3>Commands in battle <span class="count" data-testid="prep-command-count">${commands.length}</span></h3>
      <ul class="cmd-list" data-testid="prep-commands">${commandItems}</ul>
      <p class="hint">Equip a second job’s command to widen what this unit can do in battle. Swaps are free and reversible.</p>
    </div>`;

    bind();
  }

  function bind(): void {
    const onSlot = (slot: LoadoutSlot, testid: string): void => {
      sel(testid).addEventListener("change", (e) => {
        act(() => model.setSlot(slot, valueOrNull((e.target as HTMLSelectElement).value)));
      });
    };
    // Only bound when the row was drawn — an empty inventory renders no selector,
    // and `sel()` throws on a missing element rather than silently doing nothing.
    if (model.weaponOptions().length > 0) {
      sel("prep-weapon").addEventListener("change", (e) => {
        act(() => model.setWeapon(valueOrNull((e.target as HTMLSelectElement).value)));
      });
    }
    onSlot("secondary", "prep-secondary");
    onSlot("reaction", "prep-reaction");
    onSlot("support", "prep-support");
    onSlot("movement", "prep-movement");

    container.querySelectorAll<HTMLInputElement>("input[data-trait]").forEach((cb) => {
      cb.addEventListener("change", onTraitToggle);
    });

    container.querySelectorAll<HTMLButtonElement>("button[data-member]").forEach((btn) => {
      btn.addEventListener("click", () => {
        act(() => model.select(btn.dataset["member"] as string));
      });
    });

    if (progression) {
      sel("prep-job").addEventListener("change", (e) => {
        act(() => model.setJob((e.target as HTMLSelectElement).value));
      });
      sel("prep-tree").addEventListener("change", (e) => {
        act(() => model.setBrowseJob((e.target as HTMLSelectElement).value));
      });
      container.querySelectorAll<HTMLButtonElement>("button[data-learn]").forEach((btn) => {
        btn.addEventListener("click", () => {
          act(() => model.learn(model.browseJob(), btn.dataset["learn"] as string));
        });
      });
    }
  }

  function onTraitToggle(): void {
    const checked = [...container.querySelectorAll<HTMLInputElement>("input[data-trait]:checked")]
      .map((cb) => cb.dataset["trait"])
      .filter((t): t is string => typeof t === "string")
      .slice(0, 2);
    act(() => model.setTraits(checked));
  }

  /** Run a model mutation and repaint. Every control and every handle method uses it. */
  function act(fn: () => void): void {
    fn();
    render();
  }

  render();

  return {
    model,
    record: () => model.record(),
    records: () => model.records(),
    select: (id) => act(() => model.select(id)),
    setRecords: (next, selectedId) => {
      if (model.setRecords(next, selectedId)) render();
    },
    commands: () => model.commands(),
    stats: () => model.stats(),
    setSlot: (slot, value) => act(() => model.setSlot(slot, value)),
    setTraits: (traits) => act(() => model.setTraits(traits)),
    setJob: (jobId) => act(() => model.setJob(jobId)),
    setBrowseJob: (jobId) => act(() => model.setBrowseJob(jobId)),
    setWeapon: (itemId) => act(() => model.setWeapon(itemId)),
    setInventory: (ids) => {
      const changed = model.setInventory(ids);
      if (changed) render();
      return changed;
    },
    learn: (jobId, nodeId) => act(() => model.learn(jobId, nodeId)),
  };
}

// ---- The engine viewer's fixed demo record ---------------------------------

/** The demo registry — `/`'s panel is a showcase and owns its own content load. */
const demoRegistry: ContentRegistry = loadContentPack(pack);

/**
 * Build the demo Knight by a FIXED learn/equip sequence (deterministic — no RNG):
 *   - Knight (Battle Skill): Weapon Break, Armor Break (Primary command) + a support
 *     (Equip Heavy Armor).
 *   - Wizard (Black Magic): the FULL tree → mastery, which earns the Arcane Attunement
 *     trait AND makes Black Magic a rich secondary (Fire … Ice 2).
 *   - Monk (Punch Art): the Counter reaction (+ a couple of actions).
 *   - Thief (Steal): the FULL tree → mastery, which earns the Lightfoot trait (Move +1)
 *     — a FLAT stat effect, so toggling it visibly moves the derived Move stat in the
 *     live stat strip (Arcane Attunement's MA multiplier is inert on this melee frame —
 *     floor(6×0.8×1.12)=4=floor(6×0.8) — which is the anti-convergence rule working, so
 *     Lightfoot is the demonstrable one here).
 *
 * Initial chassis: reaction/support/movement/traits are equipped, but the SECONDARY is
 * left empty — so equipping it live visibly grows the command list.
 */
export function makeDemoRecord(): UnitRecord {
  let r = defaultUnitRecord("knight", "knight", {
    name: "Ramza",
    raw: { pa: 8, ma: 6, speed: 8, hp: 90, mp: 40 },
    ap: 20000,
  });

  const learnNode = (jobId: string, nodeId: string): void => {
    r = learnAbility(r, jobId, nodeId, demoRegistry);
  };

  // Primary (Knight → Battle Skill).
  learnNode("knight", "weapon-break");
  learnNode("knight", "armor-break");
  learnNode("knight", "equip-heavy-armor");

  // Wizard (Black Magic) — full tree → mastery.
  learnNode("wizard", "fire");
  learnNode("wizard", "fire-2");
  learnNode("wizard", "ice");
  learnNode("wizard", "bolt");
  learnNode("wizard", "bolt-2");
  learnNode("wizard", "magic-attack-up");
  learnNode("wizard", "ice-2");

  // Monk (Punch Art) — the Counter reaction chain.
  learnNode("monk", "wave-fist");
  learnNode("monk", "chakra");
  learnNode("monk", "revive");
  learnNode("monk", "counter");

  // Thief (Steal) — FULL tree → mastery (earns Lightfoot), keeping the Move +2 movement
  // ability. Nodes ordered to satisfy each `requires` prerequisite.
  learnNode("thief", "steal-gil");
  learnNode("thief", "steal-armor");
  learnNode("thief", "gilgame-heart");
  learnNode("thief", "steal-heart");
  learnNode("thief", "move-plus-2");
  learnNode("thief", "secret-hunt");
  learnNode("thief", "steal-helmet");
  learnNode("thief", "steal-weapon");

  // Latch mastery for any fully-learned tree (Wizard → Arcane Attunement).
  for (const jobId of demoRegistry.jobById.keys()) {
    r = checkMastery(r, jobId, demoRegistry);
  }

  // Initial loadout: everything but the Secondary (free + reversible, AC-J4).
  r = setLoadoutSlot(r, "reaction", "punch-art.counter", demoRegistry);
  r = setLoadoutSlot(r, "support", "battle-skill.equip-heavy-armor", demoRegistry);
  r = setLoadoutSlot(r, "movement", "steal.move-plus-2", demoRegistry);
  // Equip Lightfoot by default (Move +1) — the trait whose effect is visible on a Knight;
  // Arcane Attunement stays earned/equippable but inert on this frame.
  r = setLoadoutTraits(r, ["lightfoot"], demoRegistry);

  return r;
}

// ---- Deterministic hooks for Playwright (mirrors main.ts's window.tuh) ------

interface PrepApi {
  /** The current loadout + castable command ids (the real battle projection). */
  getState: () => { loadout: Loadout; commands: string[] };
  /** Castable command ids only. */
  getCommands: () => string[];
  /** The built unit's derived combat stats (the real battle projection, traits applied). */
  getStats: () => StatLine;
  /** Equip a job id as the Secondary command (or null to clear); re-renders. */
  setSecondary: (jobId: string | null) => void;
  /** Set any single-ability slot (or clear); re-renders. */
  setSlot: (slot: LoadoutSlot, value: string | null) => void;
  /** Rebuild the demo record from scratch (deterministic). */
  reset: () => void;
}

declare global {
  interface Window {
    tuhPrep: PrepApi;
  }
}

/**
 * Mount the engine viewer's DEMO panel and expose the `window.tuhPrep` hooks.
 * One fixed record, no progression controls, edits discarded.
 */
export function mountPrepDemo(container: HTMLElement): PrepHandle {
  const handle = mountPrep(container, { registry: demoRegistry, records: [makeDemoRecord()] });

  window.tuhPrep = {
    getState: () => ({ loadout: handle.record().loadout, commands: handle.commands() }),
    getCommands: handle.commands,
    getStats: handle.stats,
    setSecondary: (jobId) => handle.setSlot("secondary", jobId),
    setSlot: handle.setSlot,
    reset: () => handle.setRecords([makeDemoRecord()]),
  };
  return handle;
}
