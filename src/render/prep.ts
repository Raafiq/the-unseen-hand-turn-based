/**
 * The prep / loadout panel (render layer) — where the customization pillar becomes
 * something a player DOES rather than something the docs claim.
 *
 * It mounts over any {@link UnitRecord}s the caller hands it, and reports every edit
 * back through `onChange`. Two callers today:
 *
 *   - `/viewer.html` (the engine viewer) mounts {@link mountPrepDemo}: one fixed demo
 *     Knight, no progression controls, `onChange` discarded. It is a SHOWCASE — a
 *     deterministic fixed learn/equip sequence whose screenshots are a regression
 *     baseline.
 *   - `/` (the campaign) mounts {@link mountPrep} on the briefing screen with
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

import { abilitySummary, equipmentSummary } from "./ability-text.js";
import { icon } from "./icons.js";
import pack from "../../data/base-pack.json";
import {
  DEFERRED_ACTIONS,
  DEFERRED_MOVEMENT_EFFECTS,
  DEFERRED_REACTION_EFFECTS,
  DEFERRED_SUPPORT_EFFECTS,
  buildBattleUnit,
  weaponBaseDamage,
  canLearn,
  changeJob,
  checkMastery,
  defaultUnitRecord,
  learnAbility,
  loadContentPack,
  primaryCommand,
  setLoadoutSlot,
  setLoadoutTraits,
  type Ability,
  type ContentRegistry,
  type Loadout,
  type LoadoutSlot,
  type UnitRecord,
} from "../sim/index.js";

// ---- Presentation metadata (render-only; keyed by sim ids) -----------------

/**
 * Job id → display label. EXPORTED because it is now an assertable claim: the
 * fallback below (`prettify`) turns "geomancer" into "Geomancer" all by itself, so a
 * missing entry is invisible in the OUTPUT. Only a key-set comparison against the
 * shipped registry can see one, and `panels.test.ts` makes it.
 */
export const JOB_LABEL: Record<string, string> = {
  knight: "Knight",
  monk: "Monk",
  wizard: "Wizard",
  thief: "Thief",
  priest: "Priest",
  archer: "Archer",
  geomancer: "Geomancer",
  summoner: "Summoner",
};

/**
 * The right leaf's three tabs (Owner decision 2026-09-07, option A), in display order.
 * RENDER-LAYER ONLY: never written to a {@link UnitRecord} or the save, so it lives here
 * rather than on {@link PrepModel} — `mountPrep` holds the live value in its own closure
 * and nothing downstream of `onChange` ever sees it.
 */
export const PREP_TABS = ["equipment", "skills", "profile"] as const;
export type PrepTab = (typeof PREP_TABS)[number];

/**
 * THE LEARN OVERLAY (owner-approved pass 14, 2026-09-09).
 *
 * The approved dossier is one sheet with no room for an AP-priced learn list — and
 * dropping the list would take AP spending out of the game entirely, which the campaign
 * is tuned against (ADR-0027: a party that never spends AP loses the finale). So the list
 * gets a DOOR and a ROOM: a `LEARN` plate on the Skills heading, exactly as CHANGE JOBS
 * rides the Job Customization heading, opening a parchment leaf laid over the right
 * column. Render-layer only — never written to a {@link UnitRecord} or the save.
 *
 * The AP readout in the identity block is PLAIN TEXT and no longer a door (owner: LEARN
 * is the only one).
 */
export type LearnOverlay = "closed" | "open";

/**
 * Job id → the `icons.ts` glyph id its crest uses. Six of the eight jobs have one (the
 * mockup's own set); `thief` and `summoner` fall back to the neutral `star` glyph
 * already on screen elsewhere (the Skills tab icon) rather than inventing new heraldry
 * no reference sanctioned — a taste call that belongs to `art-director`, not to a
 * fallback in this table.
 */
const JOB_CREST: Record<string, string> = {
  knight: "c-knight",
  monk: "c-monk",
  wizard: "c-wizard",
  priest: "c-priest",
  archer: "c-archer",
  geomancer: "c-geomancer",
};
/** A job's crest glyph id for `icons.ts`'s `icon()`. Shared with `game.ts`'s roster cards. */
export const jobCrest = (jobId: string): string => JOB_CREST[jobId] ?? "star";

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

/** A job's display label, falling back to a de-kebabbed id. Shared with `game.ts`. */
export const jobLabel = (id: string): string => JOB_LABEL[id] ?? prettify(id);
const skillsetLabel = (id: string): string => SKILLSET_LABEL[id] ?? prettify(id);
/**
 * An ability's display name, falling back to a de-kebabbed id. EXPORTED because the
 * battle HUD's Actions sheet lists the same abilities this panel does (docs/10
 * AC-V38); a second table would let the prep screen and the battle sheet call the
 * same ability two different things.
 */
export const abilityLabel = (id: string): string => ABILITY_LABEL[id] ?? prettify(id);
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

/**
 * The derived combat stats surfaced in the live stat strip.
 *
 * `damage`, `brave` and `faith` were added after a learnability walkthrough
 * (`docs/plans/learnability-walkthrough-2026-08-23.md`, finding 2): the strip carried
 * HP / PA / MA / Move / Evade, so equipping the **Cestus** (Brave +5) or **Heretic's
 * Edge** (Faith −20) moved nothing a player could see. They did the right thing and got
 * no evidence it worked — the cognitive walkthrough's question 4, failed.
 *
 * `damage` is the basic attack's own figure rather than a stat, because it is the one
 * number a weapon swap is ABOUT and PA alone does not predict it: a horizontal catalog
 * (ADR-0021) has weapons that scale off Brave, off Speed, or off nothing at all.
 */
export interface StatLine {
  hp: number;
  pa: number;
  ma: number;
  move: number;
  evade: number;
  damage: number;
  brave: number;
  faith: number;
}

/** Stat strip cells: display label + which {@link StatLine} field, in display order. */
const STAT_CELLS: ReadonlyArray<{ key: keyof StatLine; label: string; suffix: string }> = [
  { key: "hp", label: "HP", suffix: "" },
  { key: "damage", label: "Attack", suffix: "" },
  { key: "pa", label: "PA", suffix: "" },
  { key: "ma", label: "MA", suffix: "" },
  { key: "move", label: "Move", suffix: "" },
  { key: "evade", label: "Evade", suffix: "%" },
  { key: "brave", label: "Brave", suffix: "" },
  { key: "faith", label: "Faith", suffix: "" },
];

/**
 * The one sentence that explains AP's reach, in ONE place: the classic panel's learn
 * column and the dossier's learn overlay print the same words, so a player cannot meet
 * two accounts of the same rule (ADR-0027 is what it is about).
 */
const SPEND_HINT =
  `<p class="hint tight" data-testid="prep-spend-hint">Spend on the job this unit is in — those commands work the moment you buy them. ` +
  `AP is one pool and you can buy from any tree, but another job's actions stay unusable until you equip that job as this unit's one Secondary.</p>`;

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
  /**
   * The right leaf's hero portrait, resolved per record. Optional and CAMPAIGN-ONLY:
   * the engine viewer's demo (`mountPrepDemo`) has no portrait table, so its `.hero`
   * frame is simply not drawn rather than pointed at a broken or invented image —
   * absent-not-zero applied to a picture instead of a stat.
   */
  portrait?: (record: UnitRecord) => string;
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
   * What the ability does, derived from its own fields (`ability-text.ts`), or `null`
   * when the content declares nothing a player could act on.
   *
   * `null` is not a gap in the UI: every ability that summarises to `null` is one the
   * game already labels "no effect yet", so the row is never blank AND unexplained.
   * That is asserted, because it is the property the whole design leans on.
   */
  summary: string | null;
  /**
   * WHERE this ability would land if bought — read before spending, not after.
   *
   *   `command`   — usable the moment it is bought (this unit's own command list).
   *   `secondary` — an action from ANOTHER job: dead until that job is equipped in the
   *                 one Secondary slot, and equipping it evicts whatever is there.
   *   `reaction` / `support` / `movement` — a passive that must then be equipped.
   *
   * WHY THIS EXISTS. AP is one pool and the panel browses any tree, so buying a
   * scattering of other jobs' cheap actions is easy and plausible — and measured, it is
   * how a run loses: a policy that buys the member's own tree clears the campaign at 8
   * of 8 seeds, one that buys the cheapest node anywhere clears 1 of 8 (ADR-0027). The
   * panel already told the player where a purchase went; {@link learnReceipt} is that
   * receipt. A receipt arrives after the AP is gone and never refunded. This is the same
   * fact, before the click.
   */
  reach: "command" | "secondary" | "reaction" | "support" | "movement";
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
  /**
   * The ability bought by the most recent {@link learn}, so the panel can say where it
   * went. Cleared whenever the panel is re-pointed at different records or a different
   * member — a receipt for somebody else's purchase is worse than none.
   *
   * WHY THIS EXISTS. Buying a passive adds nothing to "Commands in battle" — correctly,
   * a Support is not a command — so a player who spent 60 unrefundable AP saw no change
   * at all and had no way to know the ability was waiting in a dropdown
   * (`docs/plans/learnability-walkthrough-2026-08-23.md`, finding 1).
   */
  private justLearned: string | null = null;

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
    this.justLearned = null;
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
    this.justLearned = null;
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
    return {
      hp: u.maxHp,
      pa: u.pa,
      ma: u.ma,
      move: u.move,
      evade: u.evasion.classEv,
      // Read off the SAME built unit, so the strip cannot quote a number the fight
      // disagrees with — and so a Brave- or Faith-shifting weapon shows up here.
      damage: weaponBaseDamage(u),
      brave: u.brave,
      faith: u.faith,
    };
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

  /**
   * How much of `jobId`'s tree this unit has bought, as a fraction (0–1) of its nodes.
   *
   * Drives the strip's mastery pips. The mockup filled its placeholder pips from raw
   * banked AP — the SAME figure for both Main Job and Secondary, which cannot
   * distinguish "deep in this tree" from "just started another" and was declared
   * placeholder in its own comment. Tree completion is the real quantity a pip row
   * claims to show, and it is on the record already: no new field, no invented number.
   */
  jobProgress(jobId: string): number {
    const tree = this.registry.job(jobId).tree;
    if (tree.length === 0) return 0;
    const known = new Set(this.record().learned);
    const bought = tree.filter((n) => known.has(n.ability)).length;
    return bought / tree.length;
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

  /**
   * Owned weapons, each with the basic-attack damage THIS unit would swing for.
   *
   * The damage is the point. Eight weapon NAMES are not a choice a player can make —
   * and a catalog line cannot carry the number, because the whole design is horizontal
   * (ADR-0021): a Warhammer ignores the wielder's stats and so is the best swing a
   * low-Attack caster has and among the worst for a Knight. Only a per-unit figure says
   * that, and it is computed from the same one-way build a battle uses, so it cannot
   * disagree with what the swing actually does.
   *
   * `null` damage for a weapon whose swing this unit cannot derive — never 0, which
   * would read as "this weapon does nothing".
   */
  weaponOptions(): { id: string; name: string; damage: number | null }[] {
    const rec = this.record();
    return this.inv
      .map((id) => this.registry.equipment(id))
      .filter((item) => item.slot === "weapon")
      .map((item) => {
        let damage: number | null = null;
        try {
          damage = weaponBaseDamage(buildBattleUnit({ ...rec, weapon: item.id }, this.registry));
        } catch {
          damage = null;
        }
        return { id: item.id, name: item.name, damage };
      });
  }

  /** The damage this unit swings for with what it currently holds. */
  currentWeaponDamage(): number {
    return weaponBaseDamage(buildBattleUnit(this.record(), this.registry));
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
      const ability = this.registry.ability(node.ability);
      const kind = ability.type;
      const reach = this.reachOf(ability);
      const summary = abilitySummary(ability);
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
          reach,
          summary,
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
        reach,
        summary,
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
    const node = this.registry.job(jobId).tree.find((n) => n.node === nodeId);
    const bought = learnAbility(this.record(), jobId, nodeId, this.registry);
    this.justLearned = node?.ability ?? null;
    this.commit(checkMastery(bought, jobId, this.registry));
  }

  /**
   * What the last purchase was and where the player must now put it, or `null` when
   * nothing was just bought.
   *
   * Three outcomes, not two, and the third is the one that bites: an ACTION bought from
   * ANOTHER job's tree does **not** appear in the command list either. The list is the
   * current job's skillset plus the equipped Secondary, so a Knight who buys Wave Fist
   * must first equip Monk as their Secondary. A receipt that said "it is in your
   * commands now" would be the exact failure this method exists to fix — a confident
   * message that is false — so membership is READ OFF the real projection rather than
   * inferred from the ability's type.
   */
  /**
   * Where an ability would land for THIS unit as it is currently built.
   *
   * The skillset comparison is the same one `build.ts` makes when it compiles a unit's
   * command list — primary command plus the equipped Secondary's — so this cannot say
   * "command" about something a battle would not offer. `learnRows` and
   * {@link learnReceipt} both go through here, so the warning before the purchase and
   * the receipt after it cannot disagree.
   */
  private reachOf(ability: Ability): LearnRow["reach"] {
    if (ability.type !== "action") return ability.type;
    const r = this.record();
    if (ability.skillset === primaryCommand(r, this.registry)) return "command";
    const sec = r.loadout.secondary;
    if (sec !== null && ability.skillset === this.registry.job(sec).primarySkillset) {
      return "command";
    }
    return "secondary";
  }

  learnReceipt(): {
    ability: string;
    slot: "command" | "secondary" | "reaction" | "support" | "movement";
  } | null {
    if (this.justLearned === null) return null;
    const type = this.registry.ability(this.justLearned).type;
    if (type !== "action") return { ability: this.justLearned, slot: type };
    const usable = this.commands().includes(this.justLearned);
    return { ability: this.justLearned, slot: usable ? "command" : "secondary" };
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
  /**
   * Which SHAPE the panel draws in.
   *
   * `"classic"` is the tabbed panel the engine viewer's showcase still mounts, byte for
   * byte — every option below is optional and unset there, so its absence leaves that
   * page's DOM unchanged. `"dossier"` is the campaign briefing's approved Character
   * Dossier (owner, 2026-09-09): one sheet, no tabs, a 1x6 portrait rail.
   */
  layout?: "classic" | "dossier";
  /**
   * The dossier's Profile prose for a record, or `null` when the pack authors none.
   *
   * A CALLER-SUPPLIED LOOKUP, not a read of the story pack from here: the pack is
   * swappable by contract (`docs/11` AC-M4) and the roster-id -> character-id mapping
   * (`pc-briar` -> `briar`) belongs to the page that owns the content, the same reason
   * `portrait` is a parameter (ADR-0039, `src/render/CLAUDE.md`).
   */
  lore?: (record: UnitRecord) => string | null;
  /**
   * Whether this record's portrait is the self-labelling PLACEHOLDER rather than real
   * art. The rail crops with `object-fit: cover`, which is wrong for a placeholder card;
   * the caller knows the key, this file does not.
   */
  portraitPending?: (record: UnitRecord) => boolean;
  /**
   * Told when the panel changed WHICH member is open on its own — the dossier's rail.
   *
   * The host page owns the chrome that names the open member (the briefing rail's
   * "managing Briar", the roster card's gold ring), and the rail is a second way to
   * change it beside the party card. Without this the two would disagree.
   */
  onSelect?: (record: UnitRecord) => void;
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
  /** Which right-leaf tab is showing. Render-layer only — see {@link PrepTab}. */
  activeTab: () => PrepTab;
  /** Switch the right-leaf tab without touching the record or the selected member. */
  setTab: (tab: PrepTab) => void;
  /**
   * Shut the dossier's learn overlay if it is up. A no-op otherwise, and on the classic
   * layout, which has none.
   *
   * THE PANEL IS MOUNTED ONCE PER SESSION and the overlay is closure state, so nothing
   * inside this file can see a player LEAVE the member view — `member-back` and the
   * briefing's own entry reset both live in `game.ts`. Without this they had no way to
   * shut it, and the next member opened under the last member's job tree.
   */
  closeLearn: () => void;
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
  const registry = opts.registry;
  const portraitOf = opts.portrait;
  const layout = opts.layout ?? "classic";
  const loreOf = opts.lore;
  const portraitPendingOf = opts.portraitPending;
  const onSelect = opts.onSelect;

  /**
   * Whether the learn overlay is up. Same shape and the same reason as `tab` below:
   * render-layer only, in this closure, read by `render()` and never written by it, so a
   * purchase's own repaint cannot slam the overlay shut under the player's hand.
   */
  let learn: LearnOverlay = "closed";

  /**
   * Which right-leaf tab is showing. RENDER-LAYER ONLY (owner decision 2026-09-07):
   * lives in this closure, never on the model or the record, so nothing here can reach
   * the save. Persists across a re-render by construction — `render()` reads it, never
   * writes it, so a roster switch or an edit's repaint cannot reset it. Only a tab click
   * (`bind()`) or `setTab` changes it.
   */
  let tab: PrepTab = "equipment";

  function sel(testid: string): HTMLElement {
    const el = container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
    if (!el) throw new Error(`prep: missing element "${testid}"`);
    return el;
  }

  /**
   * What the ability currently in `slot` does, or nothing when the slot is empty.
   *
   * A `<select>` can only show one line per option, so the description of the CHOSEN
   * one goes underneath it. Empty slot ⇒ no line at all, rather than "nothing equipped"
   * — the dropdown already reads "— none —" and repeating it is noise.
   */
  function equippedSummary(slot: "reaction" | "support" | "movement"): string {
    const id = model.record().loadout[slot];
    if (id === null) return "";
    const summary = abilitySummary(registry.ability(id));
    return summary === null ? "" : `<p class="hint">${esc(summary)}</p>`;
  }

  /**
   * A receipt for the purchase just made, naming where the ability went.
   *
   * Only after a purchase, and only until the panel is re-pointed — a permanent note
   * would be wallpaper, and the walkthrough finding was specifically about the moment
   * of buying.
   */
  function receiptHtml(): string {
    const r = model.learnReceipt();
    if (r === null) return "";
    const name = esc(abilityLabel(r.ability));
    const where =
      r.slot === "command"
        ? `<b>${name}</b> is now in this unit's commands.`
        : r.slot === "secondary"
          ? `<b>${name}</b> belongs to another job — equip that job as this unit's <b>Secondary</b> command above to use it.`
          : `<b>${name}</b> is a passive — equip it in the <b>${r.slot}</b> slot above to use it.`;
    return `<p class="receipt" data-testid="prep-receipt">Learned. ${where}</p>`;
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
    // The damage rides in the OPTION LABEL, so weapons are comparable in the dropdown
    // itself rather than one-at-a-time by equipping each and reading a stat line.
    const bare = model.currentWeaponDamage();
    const label = (name: string, dmg: number | null, perks?: string | null): string => {
      const head = dmg === null ? name : `${name} — ${dmg} damage`;
      return perks === null || perks === undefined ? head : `${head}, ${perks.toLowerCase()}`;
    };
    const opts = optionList(
      [
        { value: "", label: label("Unarmed", model.record().weapon === null ? bare : null) },
        ...owned.map((w) => ({
          value: w.id,
          label: label(w.name, w.damage, equipmentSummary(registry.equipment(w.id), { scaling: false })),
        })),
      ],
      model.record().weapon ?? "",
    );
    const equipped = model.record().weapon;
    const desc = equipped === null ? null : equipmentSummary(registry.equipment(equipped));
    // A nudge only while something free is going unused, and only then — a hint that
    // is always on is wallpaper, and a player who has deliberately chosen Unarmed does
    // not need telling twice.
    const unused =
      model.record().weapon === null
        ? `<p class="hint" data-testid="prep-weapon-hint">You own ${owned.length} weapon${owned.length === 1 ? "" : "s"} and have none equipped.</p>`
        : "";
    return `
      <div class="gearrow">
        <span class="roundel">${icon("sword")}</span>
        <span class="gcap">Main Hand</span>
        <select class="gval" data-testid="prep-weapon" aria-label="Equipped weapon">${opts}</select>
        ${icon("chev", "chev")}
      </div>
      ${desc === null ? "" : `<p class="hint" data-testid="prep-weapon-desc">${esc(desc)}</p>`}
      ${unused}`;
  }

  /**
   * The Job Customization strip — Main Job (progression only) + Secondary.
   *
   * TWO SHELLS, ONE BODY. The classic panel's strip is a bare `.jobstrip` at the leaf's
   * foot; the dossier's is the right column's last block, with CHANGE JOBS riding the
   * heading's own rule (`.modhead`). The two job cards are identical in both, which is
   * the point of doing it here rather than duplicating `.jobrow` in the dossier branch.
   */
  function jobStripHtml(): string {
    const r = model.record();
    const secOptions = secondaryOptions();
    const secJob = r.loadout.secondary;
    const mainJplaque = !progression
      ? ""
      : `
        <div class="jplaque">
          <span class="jcrest">${icon(jobCrest(r.currentJob))}</span>
          <div class="jhead"><span class="jcap">Main</span><span class="pips">${pipsHtml(model.jobProgress(r.currentJob))}</span></div>
          <select class="jval" data-testid="prep-job" aria-label="Current job">${optionList(model.jobIds().map((j) => ({ value: j, label: jobLabel(j) })), r.currentJob)}</select>
        </div>`;
    const head =
      layout === "dossier"
        ? `<div class="modhead"><h3 class="sect">Job Customization</h3>${
            progression
              ? `<button type="button" class="jchange" data-testid="prep-change-jobs">Change Jobs</button>`
              : ""
          }</div>`
        : `<h3 class="sect">Job Customization</h3>`;
    return `
    <${layout === "dossier" ? `section class="blk sep-large jobstrip"` : `div class="jobstrip"`}>
      ${head}
      <div class="jobrow">
        ${mainJplaque}
        <div class="jplaque">
          <span class="jcrest">${icon(secJob === null ? "star" : jobCrest(secJob))}</span>
          <div class="jhead"><span class="jcap">Secondary</span><span class="pips">${pipsHtml(secJob === null ? 0 : model.jobProgress(secJob))}</span></div>
          <select class="jval" data-testid="prep-secondary" aria-label="Secondary command">${secOptions}</select>
        </div>
      </div>
    </${layout === "dossier" ? "section" : "div"}>`;
  }

  /**
   * The secondary-skillset options, shared by the job card and the dossier's Active
   * Skills row. ONE list, because they are one slot: the dossier draws the same
   * `loadout.secondary` twice (the approved frames show both), and two option lists
   * would be two opinions about what is equippable.
   */
  function secondaryOptions(): string {
    const r = model.record();
    return optionList(
      [
        { value: "", label: "— none —" },
        ...model.equippableSecondaryJobs().map((j) => ({
          value: j,
          label: `${skillsetLabel(model.skillsetOf(j))} (${jobLabel(j)})`,
        })),
      ],
      r.loadout.secondary ?? "",
    );
  }

  /** Five diamonds filled from tree completion — never from raw AP (see `jobProgress`). */
  const pipsHtml = (fraction: number): string => {
    const filled = Math.max(0, Math.min(5, Math.round(fraction * 5)));
    return Array.from({ length: 5 }, (_, i) => `<i class="${i < filled ? "on" : ""}"></i>`).join("");
  };

  // ---- THE DOSSIER (owner-approved, 2026-09-09) ------------------------------
  //
  // One sheet, no tabs: `[ 1x6 portrait rail ][ left column ][ right column ]`. Ported
  // from `docs/visual/concepts/mockups/src/dossier.html` + `dossier.overrides.css`,
  // whose frames (`dossier-pass13-832x{328,384}.png`) are the target. The mockup's
  // static sample content is replaced by the real projection everywhere: the stats are
  // `buildBattleUnit`'s, the skill rows are the same selects the classic panel binds,
  // and the Profile prose comes from the story pack through `opts.lore`.

  /**
   * The 1x6 rail — one cell per party member, in ROSTER ORDER, the open one ringed.
   *
   * Order is `model.records()` exactly: the rail is a second way to reach the same
   * member the party card opens, so a rail that sorted or filtered would put two
   * different orders of the same six people on two views of one screen.
   */
  function railHtml(): string {
    const openId = model.record().id;
    const cells = model
      .records()
      .map((r) => {
        const on = r.id === openId;
        const url = portraitOf?.(r);
        const pending = portraitPendingOf?.(r) ?? false;
        const img =
          url === undefined
            ? ""
            : `<img class="${pending ? "pending" : ""}" src="${esc(url)}" alt="" />`;
        return (
          `<li class="rmember${on ? " on" : ""}">` +
          `<button type="button" class="rtab" data-member="${esc(r.id)}"` +
          ` aria-label="${esc(r.name)}, ${esc(jobLabel(r.currentJob))}"${on ? ' aria-current="true"' : ""}>` +
          `${img}</button></li>`
        );
      })
      .join("");
    return `<ul class="rail" data-testid="dossier-rail">${cells}</ul>`;
  }

  /**
   * The identity block. The AP readout is PLAIN TEXT (owner, pass 14): it briefly was
   * the door to the learn list, and LEARN on the Skills heading is now the only one — a
   * readout that silently doubled as a control was an affordance nobody could see.
   */
  function identityHtml(): string {
    const record = model.record();
    const hero =
      portraitOf === undefined
        ? ""
        : `<div class="hero"><img class="${portraitPendingOf?.(record) === true ? "pending" : ""}" src="${esc(portraitOf(record))}" alt=""></div>`;
    return `
    <header class="unit-head ident">
      ${hero}
      <div class="idcol">
        <div class="nameline"><h2>${esc(record.name)}</h2></div>
        <div class="idrule" aria-hidden="true"></div>
        <p class="jobline">${icon(jobCrest(record.currentJob))}<span>${esc(jobLabel(record.currentJob))}</span></p>
        <p class="apline" data-testid="prep-ap" title="Banked AP">${record.ap} AP</p>
      </div>
    </header>`;
  }

  /**
   * The Profile block: the pack's lore, then the traits control on one line.
   *
   * ABSENT-NOT-INVENTED. A member the pack writes no lore for says so rather than
   * showing an empty box; the engine has no biography of its own to fall back on.
   * The traits line keeps the real `input[data-trait]` checkbox and therefore the real
   * save behaviour (owner, 2026-09-09: the control stays), and it keeps
   * `prep-traits-hint` — the "this is free and you are not using it" mark a playtest
   * asked for — as a chip on the line rather than as a second row there is no room for.
   */
  function profileHtml(): string {
    const record = model.record();
    const lore = loreOf?.(record) ?? null;
    const prose =
      lore === null
        ? `<p class="lore empty" data-testid="prep-lore">No profile is written for this character yet.</p>`
        : `<p class="lore" data-testid="prep-lore">${esc(lore)}</p>`;
    const chips =
      record.mastered.length === 0
        ? `<span class="tnone" id="traits-empty">none earned yet — master a job tree</span>`
        : record.mastered
            .map((jobId) => {
              const t = registry.job(jobId).masteryBonus.trait;
              const on = record.loadout.traits.includes(t);
              // WHERE IT CAME FROM, ON SCREEN. This was a `title` — unreachable on a
              // touch screen, and a trait's origin is the whole reason a player mastered
              // that tree. The job in parentheses is the shortest true form that fits the
              // line at 832x328.
              return (
                `<label class="chk"><input type="checkbox" data-trait="${esc(t)}"${on ? " checked" : ""}/>` +
                `<span class="tname">${esc(traitLabel(t))} <span class="tfrom">(${esc(jobLabel(jobId))})</span></span></label>`
              );
            })
            .join("");
    const free =
      record.mastered.length > 0 && record.loadout.traits.length === 0
        ? ` <span class="freemark" data-testid="prep-traits-hint">free</span>`
        : "";
    // "max 2" IS A RULE THE PANEL ENFORCES (`onTraitToggle` slices to two), so it is
    // printed rather than left in a tooltip: a player who has earned a third trait and
    // finds a box refusing to tick has been told nothing.
    //
    // SHOWN FROM THE FIRST TRAIT, not from the third. The cap only BINDS at three, but
    // "you may equip two of these" is a fact about the chassis a player plans around, and
    // a rule that appears only at the moment it costs you something is a rule you were
    // never told. It also makes the state reachable in the shipped campaign, where every
    // member starts with exactly one mastered job — a caption nothing can drive is a
    // caption nothing can check.
    const cap = record.mastered.length > 0 ? ` <span class="tmax">max 2</span>` : "";
    return `
    <section class="blk">
      <h3 class="sect">Profile</h3>
      <div class="profile">
        ${prose}
        <p class="traitline" data-testid="prep-traits"><span class="tkey">Traits:</span> ${chips}${free}${cap}</p>
      </div>
    </section>`;
  }

  /**
   * Wielded Gear + Worn Armor.
   *
   * WORN ARMOR IS A HEADING AND ONE DISABLED ROW (owner's call, `intent/
   * character-dossier.md`): the engine models no armour slot, so there is nothing to
   * control — no `<select>`, no chevron — and the row says exactly that. It is the
   * absent-not-zero rule drawn rather than hidden, because the heading is the owner's.
   *
   * The Main Hand row keeps `prep-weapon-hint` as a chip on the heading's own line:
   * a free thing going unused has to say so (the finding behind that hint was nine
   * owned weapons and none equipped), and the dossier has no spare row for a sentence.
   */
  function gearHtml(): string {
    const owned = model.weaponOptions();
    const bare = model.currentWeaponDamage();
    let mainHand: string;
    if (owned.length === 0) {
      // No CHOICE exists yet, so no dropdown — an empty one would present "you own
      // nothing" as "your options are none". The row still states the fact the sim
      // does produce: what this unit is fighting with right now.
      mainHand = `
        <div class="gearrow armorrow" data-testid="prep-weapon-fixed" aria-disabled="true">
          <span class="roundel roundel-empty">${icon("sword")}</span>
          <span class="gval">Unarmed${bare === null ? "" : ` — ${bare} damage`}</span>
        </div>`;
    } else {
      const label = (name: string, dmg: number | null, perks?: string | null): string => {
        const head = dmg === null ? name : `${name} — ${dmg} damage`;
        return perks === null || perks === undefined ? head : `${head}, ${perks.toLowerCase()}`;
      };
      const opts2 = optionList(
        [
          { value: "", label: label("Unarmed", model.record().weapon === null ? bare : null) },
          ...owned.map((w) => ({
            value: w.id,
            label: label(w.name, w.damage, equipmentSummary(registry.equipment(w.id), { scaling: false })),
          })),
        ],
        model.record().weapon ?? "",
      );
      mainHand = `
        <div class="gearrow">
          <span class="roundel">${icon("sword")}</span>
          <span class="gcap">Main Hand</span>
          <select class="gval" data-testid="prep-weapon" aria-label="Equipped weapon">${opts2}</select>
          ${icon("chev", "chev")}
        </div>`;
    }
    const unused =
      owned.length > 0 && model.record().weapon === null
        ? ` <span class="freemark" data-testid="prep-weapon-hint">${owned.length} owned, none equipped</span>`
        : "";
    return `
    <section class="blk">
      <h3 class="sect">Wielded Gear${unused}</h3>
      ${mainHand}
    </section>
    <section class="blk blk-armor">
      <h3 class="sect">Worn Armor</h3>
      <div class="gearrow armorrow" data-testid="prep-armor" aria-disabled="true">
        <span class="roundel roundel-empty">${icon("cuirass")}</span>
        <span class="gval">No armor equipped</span>
      </div>
    </section>`;
  }

  /**
   * Skills: one section, two sub-columns — Active (Primary, Secondary) and Passive
   * (Reaction, Support, Movement).
   *
   * The Primary row's padlock replaces the classic panel's "locked to job" words: at
   * a 197px sub-column the chip ellipsised the ability name. Same claim, as a mark plus
   * a `title` — and the mark has an identity (`data-icon="lock"`) so a test can tell it
   * from the chevron every other row carries.
   */
  function skillsHtml(abilitySelect: (slot: "reaction" | "support" | "movement") => string): string {
    const record = model.record();
    const passive = (
      slot: "reaction" | "support" | "movement",
      glyph: string,
      cap: string,
      testid: string,
    ): string => `
      <div class="gearrow">
        <span class="roundel">${icon(glyph)}</span>
        <span class="gcap">${cap}</span>
        <select class="gval" data-testid="${testid}" aria-label="${cap} ability">${abilitySelect(slot)}</select>
        ${icon("chev", "chev")}
      </div>`;
    // PASS 14: the door to the learn list rides this heading's own rule, right-aligned,
    // the same `.jchange` plate CHANGE JOBS uses one heading down. Drawn only with
    // progression on — the engine viewer's showcase has no learn list to open.
    const learnPlate = progression
      ? `<button type="button" class="jchange learnplate" data-testid="prep-learn-open">Learn</button>`
      : "";
    return `
    <section class="blk sep-large blk-skills">
      <h3 class="sect">Skills${learnPlate}</h3>
      <div class="skillcols">
        <div class="skillcol">
          <p class="subhead">Active Skills</p>
          <div class="gearrow" data-testid="prep-primary">
            <span class="roundel">${icon("sword")}</span>
            <span class="gcap">Primary <span class="lockword">· locked to job</span></span>
            <span class="gval">${esc(skillsetLabel(model.primarySkillset()))} (${esc(jobLabel(record.currentJob))})</span>
            <span class="lockwrap" aria-hidden="true">${icon("lock", "chev lockmark")}</span>
          </div>
          <div class="gearrow">
            <span class="roundel">${icon("star")}</span>
            <span class="gcap">Secondary</span>
            <select class="gval" data-testid="prep-secondary-skill" aria-label="Secondary skillset">${secondaryOptions()}</select>
            ${icon("chev", "chev")}
          </div>
        </div>
        <div class="skillcol">
          <p class="subhead">Passive Skills</p>
          ${passive("reaction", "counter", "Reaction", "prep-reaction")}
          ${passive("support", "shield", "Support", "prep-support")}
          ${passive("movement", "wing", "Movement", "prep-movement")}
        </div>
      </div>
    </section>`;
  }

  /** The job selector + the AP-priced learn list, straight off {@link PrepModel.learnRows}. */
  function learnColumnHtml(): string {
    if (!progression) return "";
    const r = model.record();
    const browsing = model.browseJob();
    const treeOptions = optionList(
      model.jobIds().map((j) => ({
        value: j,
        label: j === r.currentJob ? `${jobLabel(j)} (current)` : jobLabel(j),
      })),
      browsing,
    );

    const rows = learnRowsHtml();
    return renderLearnColumn(rows, treeOptions, browsing);
  }

  /** The AP-priced rows themselves — shared by the classic column and the overlay. */
  function learnRowsHtml(): string {
    return model
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
        // AN ACTION THIS UNIT COULD NOT USE IS THE EXPENSIVE MISTAKE, so it is the one
        // thing marked before the click. A learn list makes every row look equivalent,
        // and the panel browses any job's tree, so "60 AP for a command" and "60 AP for
        // a command that does nothing until you also give up your Secondary slot" read
        // identically. Measured, that difference is how a run is lost (ADR-0027).
        const reachTag =
          row.kind === "action" && row.reach === "secondary"
            ? ` <span class="tag reach" data-testid="reach-secondary" title="This is another job's command. It stays unusable until you equip that job in the Secondary slot — and you only have one.">needs Secondary</span>`
            : "";
        const label = `${esc(abilityLabel(row.ability))}${kindTag}${reachTag}${tag}`;
        // KNOWN IS NOT LOCKED. `buyable` is false for an already-learned node as well as
        // for an unaffordable one, so a known row used to carry BOTH classes — and
        // `li.locked` is later in `overhaul.css` at the same specificity, so the learned
        // row painted as the unaffordable one (measured against
        // `dossier-pass14-learn-832x328.png`: rgba(90,66,34,.16) where the approved frame
        // paints rgba(255,240,210,.5)). Two different states cannot share a look; the row
        // that is DONE now says so.
        const cls = [
          row.known ? "known" : row.buyable ? "" : "locked",
          row.deferred === null ? "" : "deferred",
        ]
          .filter(Boolean)
          .join(" ");
        // The description sits UNDER the name rather than in a `title` tooltip: AP is
        // spent permanently, so what a purchase does must be readable without hovering
        // (and a tooltip is unreachable on touch).
        const desc =
          row.summary === null ? "" : `<span class="desc">${esc(row.summary)}</span>`;
        if (row.known) {
          return `<li class="${cls}" data-node="${esc(row.node)}"><span class="n">${label}</span><span class="s">learned</span>${desc}</li>`;
        }
        const why = row.buyable ? `Spend ${row.apCost} AP` : (row.reason ?? "");
        return (
          `<li class="${cls}" data-node="${esc(row.node)}">` +
          `<span class="n">${label}</span>` +
          `<button type="button" class="buy" data-learn="${esc(row.node)}"` +
          `${row.buyable ? "" : " disabled"} title="${esc(why)}">${row.apCost} AP</button>` +
          desc +
          `</li>`
        );
      })
      .join("");
  }

  /** The classic panel's learn column, unchanged — the engine viewer still draws it. */
  function renderLearnColumn(rows: string, treeOptions: string, browsing: string): string {
    return `
    <div class="learnhead" data-testid="prep-progression">
      <h3 class="sect">Learn · ${esc(skillsetLabel(model.skillsetOf(browsing)))}</h3>
      <div class="gearrow">
        <span class="roundel">${icon("scroll")}</span>
        <select class="gval" data-testid="prep-tree" aria-label="Skill tree to browse" style="grid-row:1/3;">${treeOptions}</select>
        ${icon("chev", "chev")}
      </div>
    </div>
    ${SPEND_HINT}
    <ul class="learn-list" data-testid="prep-learn" tabindex="0">${rows}</ul>
    ${receiptHtml()}`;
  }

  /**
   * THE LEARN OVERLAY — a parchment leaf laid over the right column (owner pass 14).
   *
   * Every part of it is a shipped recipe and a shipped MODEL: the rows are
   * `learnRows()`, the picker is the same `prep-tree` select, the buy plaques are the
   * same `data-learn` buttons the classic panel binds. Only the arrangement is new, so a
   * purchase made here and a purchase made on the engine viewer go through one code path.
   *
   * THE AP IS PRINTED TWICE, in the overlay's own header and in the identity block, and
   * both read `model.record().ap` at render time — a purchase repaints the whole panel,
   * so the two cannot come apart.
   */
  function learnOverlayHtml(): string {
    if (!progression) return "";
    const record = model.record();
    const browsing = model.browseJob();
    const treeOptions = optionList(
      model.jobIds().map((j) => ({
        value: j,
        label: j === record.currentJob ? `${jobLabel(j)} (current)` : jobLabel(j),
      })),
      browsing,
    );
    // THE JOB, NOT THE SKILLSET, in the accessible name: the label has to say WHOSE tree
    // is open, and "Aim" does not name a job to a screen reader the way "Archer" does.
    const title = `Learn · ${jobLabel(browsing)}`;
    const receipt = receiptHtml();
    // NO `aria-modal`. The leaf covers the RIGHT COLUMN only: the rail, the identity
    // block, Stats and the traits checkbox stay visible AND tabbable underneath it, so
    // claiming modality would tell a screen reader the rest of the page is inert when it
    // is not. `role="dialog"` plus the label is the honest pair. (This is a JS comment,
    // not an HTML one, on purpose: an HTML comment holding backticks inside a template
    // literal ends the string — it did, and the build went red.)
    return `
    <div class="learnoverlay" data-testid="dossier-learn" role="dialog" aria-label="${esc(title)}">
      <div class="learnsheet">
        <header class="lbar" data-testid="prep-progression">
          <h3 class="ltitle">${esc(title)}</h3>
          <span class="lap" data-testid="learn-ap">${record.ap} AP</span>
          <button type="button" class="jchange lclose" data-testid="prep-learn-close">Close</button>
        </header>
        <div class="gearrow ltree">
          <span class="roundel">${icon("scroll")}</span>
          <span class="gcap">Job tree</span>
          <select class="gval" data-testid="prep-tree" aria-label="Skill tree to browse">${treeOptions}</select>
          ${icon("chev", "chev")}
        </div>
        <ul class="learn-list" data-testid="prep-learn" tabindex="0">${learnRowsHtml()}</ul>
        ${receipt === "" ? SPEND_HINT : receipt}
      </div>
    </div>`;
  }

  function render(): void {
    const record = model.record();
    const commands = model.commands();

    // Live derived stats, and a traits-stripped baseline so any stat an equipped trait
    // lifts renders highlighted (the visible "the trait did something").
    const stats = model.stats();
    const baseStats = model.stats({ ...record, loadout: { ...record.loadout, traits: [] } });
    const statsBody = STAT_CELLS.map(({ key, label, suffix }) => {
      const up = stats[key] > baseStats[key];
      return `<li${up ? ' class="up"' : ""}><span class="k">${label}</span><span class="v" data-stat="${key}">${stats[key]}${suffix}</span></li>`;
    }).join("");

    const noneOpt: Opt = { value: "", label: "— none —" };

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

    // Job-associated, not just the trait id: the mockup's tile carries the mastered
    // job's crest and says "Mastered from X.", which `earnedTraits()` alone (a bare
    // list of trait ids) cannot answer — so this walks `record.mastered` directly.
    const traitsBody =
      record.mastered.length === 0
        ? `<p class="empty" id="traits-empty">No mastered jobs yet — master a full job tree to earn a trait.</p>`
        : record.mastered
            .map((jobId) => {
              const t = registry.job(jobId).masteryBonus.trait;
              const on = record.loadout.traits.includes(t);
              return (
                `<label class="chk"><span class="ttile">${icon(jobCrest(jobId))}` +
                `<input type="checkbox" data-trait="${esc(t)}"${on ? " checked" : ""}/></span>` +
                `<span><span class="tname">${esc(traitLabel(t))}</span>` +
                `<span class="tdesc">Mastered from ${esc(jobLabel(jobId))}.</span></span></label>`
              );
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
        // `basic.attack` is weapon-derived and has no catalog entry, so the lookup is
        // guarded rather than assumed — the equipped weapon's own numbers describe it.
        const summary = registry.abilityById.has(id)
          ? abilitySummary(registry.ability(id))
          : null;
        const desc = summary === null ? "" : `<span class="desc">${esc(summary)}</span>`;
        return blocker === undefined
          ? `<li data-cmd="${esc(id)}">${esc(abilityLabel(id))}${desc}</li>`
          : `<li data-cmd="${esc(id)}" class="deferred" title="No effect yet — ${esc(blocker)}">${esc(abilityLabel(id))} <span class="tag">no effect yet</span>${desc}</li>`;
      })
      .join("");

    const heroHtml =
      portraitOf === undefined
        ? ""
        : `<div class="hero"><img src="${esc(portraitOf(record))}" alt=""></div>`;

    if (layout === "dossier") {
      container.innerHTML =
        railHtml() +
        `
    <div class="sheet" data-testid="dossier-sheet">
      <div class="scol scol-main">
        ${identityHtml()}
        <section class="blk">
          <h3 class="sect">Stats</h3>
          <ul class="stat-row" data-testid="prep-stats">${statsBody}</ul>
        </section>
        ${profileHtml()}
      </div>
      <div class="scol scol-side">
        ${gearHtml()}
        ${skillsHtml(abilitySelect)}
        ${jobStripHtml()}
        ${learn === "open" ? learnOverlayHtml() : ""}
      </div>
    </div>`;
      bind();
      return;
    }

    container.innerHTML = `
    <header class="unit-head">
      ${heroHtml}
      <div class="idcol">
        <div class="nameline">
          <h2>${esc(record.name)}</h2>
          <span class="count" data-testid="prep-ap" title="Banked AP">${record.ap} AP</span>
        </div>
        <p class="jobline">${icon(jobCrest(record.currentJob))}<span>${esc(jobLabel(record.currentJob))}</span></p>
        <div class="rulehr"></div>
      </div>
    </header>

    <nav class="tabs" role="tablist">
      <button type="button" class="tab${tab === "equipment" ? " on" : ""}" data-tab="equipment" role="tab" aria-selected="${tab === "equipment"}">${icon("sword")}<span class="tlabel">Equipment</span></button>
      <button type="button" class="tab${tab === "skills" ? " on" : ""}" data-tab="skills" role="tab" aria-selected="${tab === "skills"}">${icon("star")}<span class="tlabel">Skills</span></button>
      <button type="button" class="tab${tab === "profile" ? " on" : ""}" data-tab="profile" role="tab" aria-selected="${tab === "profile"}">${icon("scroll")}<span class="tlabel">Profile</span></button>
    </nav>

    <div class="panels">
      <section class="panel" data-panel="equipment"${tab === "equipment" ? "" : " hidden"}>
        <div class="col narrow" tabindex="0">
          <h3 class="sect">Wielded Gear</h3>
          ${weaponSlotHtml()}
          <p class="hint">The game models one hand — there is nothing else to equip here yet.</p>
        </div>
        <div class="col wide" tabindex="0">
          <h3 class="sect">Standing <span class="lock">at battle start</span></h3>
          <div class="stats" data-testid="prep-stats">
            <ul class="stat-row">${statsBody}</ul>
            <p class="hint">▲ lifted by an equipped trait.</p>
          </div>
        </div>
      </section>

      <section class="panel" data-panel="skills"${tab === "skills" ? "" : " hidden"}>
        <div class="col" tabindex="0">
          <h3 class="sect">Active</h3>
          <div class="gearrow" data-testid="prep-primary">
            <span class="roundel">${icon("sword")}</span>
            <span class="gcap">Primary</span>
            <span class="gval">${esc(skillsetLabel(model.primarySkillset()))} (${esc(jobLabel(record.currentJob))}) <span class="kind">locked to job</span></span>
          </div>
          <p class="hint"><span class="gcap">Commands</span> ${model.primaryActionIds().map((id) => esc(abilityLabel(id))).join(", ") || "—"}</p>
          <h3 class="sect">Passive</h3>
          <div class="gearrow">
            <span class="roundel">${icon("counter")}</span>
            <span class="gcap">Reaction</span>
            <select class="gval" data-testid="prep-reaction" aria-label="Reaction ability">${abilitySelect("reaction")}</select>
            ${icon("chev", "chev")}
          </div>
          ${equippedSummary("reaction")}
          <div class="gearrow">
            <span class="roundel">${icon("shield")}</span>
            <span class="gcap">Support</span>
            <select class="gval" data-testid="prep-support" aria-label="Support ability">${abilitySelect("support")}</select>
            ${icon("chev", "chev")}
          </div>
          ${equippedSummary("support")}
          <div class="gearrow">
            <span class="roundel">${icon("wing")}</span>
            <span class="gcap">Movement</span>
            <select class="gval" data-testid="prep-movement" aria-label="Movement ability">${abilitySelect("movement")}</select>
            ${icon("chev", "chev")}
          </div>
          ${equippedSummary("movement")}
          <h3 class="sect">In battle <span class="count" data-testid="prep-command-count">${commands.length}</span></h3>
          <ul class="cmd-list" data-testid="prep-commands">${commandItems}</ul>
        </div>
        <div class="col wide" tabindex="0">
          ${learnColumnHtml()}
        </div>
      </section>

      <section class="panel" data-panel="profile"${tab === "profile" ? "" : " hidden"}>
        <div class="col narrow" tabindex="0">
          <h3 class="sect">What this unit has done</h3>
          <ul class="cmd-list">
            <li>Banked <b>${record.ap} AP</b><span class="desc">One pool, spendable in any tree.</span></li>
          </ul>
          <p class="hint">Traits are permanent. Equipping and unequipping is free and reversible.</p>
        </div>
        <div class="col wide" tabindex="0">
          <h3 class="sect">Acquired Traits <span class="lock">max 2</span></h3>
          <div data-testid="prep-traits">
            ${traitsBody}
            ${
              record.mastered.length > 0 && record.loadout.traits.length === 0
                ? `<p class="hint" data-testid="prep-traits-hint">Earned and not equipped — traits cost no AP.</p>`
                : ""
            }
          </div>
        </div>
      </section>
    </div>

    ${jobStripHtml()}`;

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
    if (container.querySelector('[data-testid="prep-weapon"]') !== null) {
      sel("prep-weapon").addEventListener("change", (e) => {
        act(() => model.setWeapon(valueOrNull((e.target as HTMLSelectElement).value)));
      });
    }
    // THE FIVE SLOT CONTROLS. On the dossier's progression face none of them are drawn,
    // and `sel()` throws rather than silently doing nothing — so the binding follows what
    // was actually rendered, the same way the weapon row above already does.
    const has = (testid: string): boolean =>
      container.querySelector(`[data-testid="${testid}"]`) !== null;
    if (has("prep-secondary")) onSlot("secondary", "prep-secondary");
    if (has("prep-reaction")) onSlot("reaction", "prep-reaction");
    if (has("prep-support")) onSlot("support", "prep-support");
    if (has("prep-movement")) onSlot("movement", "prep-movement");
    // The dossier draws `loadout.secondary` TWICE — the Active Skills row and the job
    // card — because the approved frames show both. One slot, one model call, so the two
    // can never disagree: every edit repaints and both are rebuilt from the record.
    if (has("prep-secondary-skill")) onSlot("secondary", "prep-secondary-skill");

    container.querySelectorAll<HTMLInputElement>("input[data-trait]").forEach((cb) => {
      cb.addEventListener("change", onTraitToggle);
    });

    // THE RAIL — a second way to change WHICH member is open, beside the party card
    // (owner: it ADDS to the card tap, it does not replace it). It drives `model.select`,
    // the same call the card makes, and then tells the host page so the chrome that names
    // the open member cannot disagree with the sheet.
    for (const cell of container.querySelectorAll<HTMLButtonElement>("button.rtab[data-member]")) {
      cell.addEventListener("click", () => {
        const id = cell.dataset["member"] as string;
        if (id === model.record().id) return;
        // CLOSE THE OVERLAY FIRST. It is Briar's tree; leaving it up over Kest's sheet
        // would show one member's dossier under another member's job tree, and the buy
        // buttons in it would spend the NEW member's AP on rows priced for the old one.
        learn = "closed";
        act(() => model.select(id));
        onSelect?.(model.record());
      });
    }

    // THE LEARN OVERLAY — open, close, and the focus that goes with each. Render-layer
    // only, so neither can fire `onChange` or reach the save.
    //
    // FOCUS IS MOVED AFTER THE REPAINT, not before: `render()` replaces the container's
    // whole `innerHTML`, so an element focused first is a detached node by the time the
    // paint lands (the same discipline `game.ts`'s `pendingFocus` follows).
    container
      .querySelector<HTMLButtonElement>('[data-testid="prep-learn-open"]')
      ?.addEventListener("click", () => setLearn("open"));
    container
      .querySelector<HTMLButtonElement>('[data-testid="prep-learn-close"]')
      ?.addEventListener("click", () => setLearn("closed"));
    // ESCAPE CLOSES IT FROM ANYWHERE IN THE MEMBER VIEW. It was bound on the overlay node,
    // which only works while focus is inside it — and the overlay is deliberately NOT
    // modal (it covers one column), so a player can be in the traits checkbox or a stat
    // cell with the dialog plainly open and Escape doing nothing. The listener goes on
    // the document, and comes OFF the moment the overlay shuts, so no mount ever leaves a
    // live key handler behind on a page it is not showing anything on.
    bindEscape(learn === "open");

    // CHANGE JOBS OWNS NO RULE. It focuses the Main job select and asks the browser to
    // open it where that is supported — the legality of any job it lists is still
    // `model.jobIds()` / `changeJob`, exactly as the select itself is.
    container
      .querySelector<HTMLButtonElement>('[data-testid="prep-change-jobs"]')
      ?.addEventListener("click", () => {
        const job = container.querySelector<HTMLSelectElement>('[data-testid="prep-job"]');
        if (!job) return;
        job.focus();
        const withPicker = job as HTMLSelectElement & { showPicker?: () => void };
        if (typeof withPicker.showPicker === "function") {
          try {
            withPicker.showPicker();
          } catch {
            // Not user-activated, or unsupported: focus alone is the whole contract.
          }
        }
      });

    // TAB SWITCHING — render-layer only (see `tab` above). Never touches the model, so
    // it cannot fire `onChange` and cannot reach the save.
    container.querySelectorAll<HTMLButtonElement>("button[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.dataset["tab"] as PrepTab;
        if (next === tab) return;
        tab = next;
        render();
      });
    });

    if (progression) {
      if (has("prep-job")) {
        sel("prep-job").addEventListener("change", (e) => {
          act(() => model.setJob((e.target as HTMLSelectElement).value));
        });
      }
      if (has("prep-tree")) {
        sel("prep-tree").addEventListener("change", (e) => {
          act(() => model.setBrowseJob((e.target as HTMLSelectElement).value));
        });
      }
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

  /**
   * The document-level Escape listener, live exactly while the overlay is up.
   *
   * Held in this closure and attached/detached rather than added on every paint: `bind()`
   * runs on every render, and a listener added there without this guard would stack one
   * copy per repaint — each one calling `setLearn("closed")`, which is idempotent, so the
   * leak would never show as a bug and never stop growing.
   */
  let escapeHandler: ((e: KeyboardEvent) => void) | null = null;
  function bindEscape(on: boolean): void {
    if (on === (escapeHandler !== null)) return;
    if (on) {
      escapeHandler = (e: KeyboardEvent): void => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        setLearn("closed");
      };
      document.addEventListener("keydown", escapeHandler);
      return;
    }
    if (escapeHandler !== null) document.removeEventListener("keydown", escapeHandler);
    escapeHandler = null;
  }

  /**
   * Open or close the learn overlay and put focus where the player just went: on Close
   * when it opens, back on Learn when it shuts. Does no DOM work on an unchanged state,
   * the same shape `setTab` and `game.ts`'s `setBriefView` hold.
   */
  function setLearn(next: LearnOverlay): void {
    if (next === learn) return;
    learn = next;
    render();
    const target = next === "open" ? "prep-learn-close" : "prep-learn-open";
    container.querySelector<HTMLElement>(`[data-testid="${target}"]`)?.focus();
  }

  /**
   * Run a model mutation and repaint — and put focus back on the control that was edited.
   *
   * `render()` replaces the container's whole `innerHTML`, so the `<select>` a player just
   * changed is a DETACHED node the moment its own handler returns and focus falls to
   * `<body>`. On a keyboard that means every equip throws you back to the top of the
   * document; on a screen reader it means the panel goes silent mid-edit. The same
   * discipline `game.ts`'s `pendingFocus` follows: note the target BEFORE the paint,
   * re-query it AFTER, because the node that comes back is a new one.
   *
   * Keyed by `data-testid` rather than by node identity for exactly that reason, and only
   * when focus was inside this panel to begin with — a handle method called from a test
   * or from the page must not steal focus from wherever the player actually is.
   */
  function act(fn: () => void): void {
    const active = document.activeElement;
    const refocus =
      active instanceof HTMLElement && container.contains(active)
        ? (active.dataset["testid"] ?? null)
        : null;
    fn();
    render();
    if (refocus === null) return;
    container.querySelector<HTMLElement>(`[data-testid="${refocus}"]`)?.focus();
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
    activeTab: () => tab,
    setTab: (next) => {
      if (next === tab) return;
      tab = next;
      render();
    },
    // NOT `setLearn("closed")`: that moves focus onto the LEARN plate, and every caller of
    // this is a player LEAVING the member view — focus belongs to whatever the leaving
    // transition puts it on (`setBriefView`'s own `pendingFocus`).
    closeLearn: () => {
      if (learn === "closed") return;
      learn = "closed";
      render(); // `bind()` runs inside, and detaches the Escape listener with it
    },
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

/**
 * A purpose-built EMPTY-state record: no owned weapon (no `inventory` opt, exactly
 * like {@link mountPrepDemo}'s own record) and no mastered job — `defaultUnitRecord`'s
 * own zero-value defaults (`mastered: []`, `learned: []`), never touched by a
 * `learnAbility`/`checkMastery` call the way {@link makeDemoRecord} is.
 *
 * Exists because the shipped campaign cannot discover either state honestly: every
 * battle-1 party member already owns a weapon (the drip grants two before the first
 * briefing) and already has a mastered job (`data/campaign/camp-the-first-march.json`)
 * — `e2e/briefing.spec.ts`'s "weapon-absent" and "empty-traits" tests skip for exactly
 * that reason. This record, mounted through {@link mountPrepEmpty}, is what lets both
 * become real assertions instead.
 */
export function makeEmptyDemoRecord(): UnitRecord {
  return defaultUnitRecord("knight", "knight", { name: "Recruit" });
}

/**
 * Mount the engine viewer's EMPTY-state panel. No seam on the shipped page reaches
 * this today, so it is gated behind a query param instead (`?prep=empty`, wired in
 * `main.ts`) rather than a second permanent panel on `/viewer.html` — the engine
 * viewer's whole point (this file's own banner) is `mountPrepDemo`'s fixed showcase,
 * and this state exists only for the browser tests that need to discover it.
 */
export function mountPrepEmpty(container: HTMLElement): PrepHandle {
  return mountPrep(container, { registry: demoRegistry, records: [makeEmptyDemoRecord()] });
}
