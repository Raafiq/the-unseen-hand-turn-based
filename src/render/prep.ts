/**
 * Prep / loadout viewer (render layer, P1 Slice 8) — makes the customization
 * pillar VISIBLE. Shows a unit's 5-slot ability chassis and the flagship moment:
 * equipping a Secondary command (Black Magic) expands the unit's castable command
 * list, so the Knight can now cast Fire.
 *
 * Render-only glue (ADR-0007): imports the PURE sim, never the reverse. The sim
 * stays headless — all DOM lives here. Presentation labels for job/ability/trait
 * ids live in the maps below (the `UNIT_META` precedent in demo.ts), NOT in sim
 * types. The command list itself is the real sim projection:
 * `buildBattleUnit(record, registry).abilities` — the same one-way compile a
 * battle uses (build.ts), so what the viewer shows is exactly what a unit would
 * fight with.
 *
 * Deterministic: the demo record is built by a FIXED learn/equip sequence, no RNG
 * and no wall-clock — identical every load, so the Playwright screenshots are a
 * stable regression baseline.
 */

import pack from "../../data/base-pack.json";
import {
  buildBattleUnit,
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
};

const SKILLSET_LABEL: Record<string, string> = {
  "battle-skill": "Battle Skill",
  "punch-art": "Punch Art",
  "black-magic": "Black Magic",
  steal: "Steal",
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

// ---- Content + the demo unit record ----------------------------------------

const registry: ContentRegistry = loadContentPack(pack);

/**
 * Build the demo Knight by a FIXED learn/equip sequence (deterministic — no RNG):
 *   - Knight (Battle Skill): Weapon Break, Armor Break (Primary command) + a
 *     support (Equip Heavy Armor).
 *   - Wizard (Black Magic): the FULL tree → mastery, which earns the Arcane
 *     Attunement trait AND makes Black Magic a rich secondary (Fire … Ice 2).
 *   - Monk (Punch Art): the Counter reaction (+ a couple of actions).
 *   - Thief (Steal): the Move +2 movement ability.
 *
 * Initial chassis: reaction/support/movement/traits are equipped, but the
 * SECONDARY is left empty — so equipping it live visibly grows the command list.
 */
function makeDemoRecord(): UnitRecord {
  let r = defaultUnitRecord("knight", "knight", {
    name: "Ramza",
    raw: { pa: 8, ma: 6, speed: 8, hp: 90, mp: 40 },
    ap: 2500,
  });

  const learn = (jobId: string, nodeId: string): void => {
    r = learnAbility(r, jobId, nodeId, registry);
  };

  // Primary (Knight → Battle Skill).
  learn("knight", "weapon-break");
  learn("knight", "armor-break");
  learn("knight", "equip-heavy-armor");

  // Wizard (Black Magic) — full tree → mastery.
  learn("wizard", "fire");
  learn("wizard", "fire-2");
  learn("wizard", "ice");
  learn("wizard", "bolt");
  learn("wizard", "bolt-2");
  learn("wizard", "magic-attack-up");
  learn("wizard", "ice-2");

  // Monk (Punch Art) — the Counter reaction chain.
  learn("monk", "wave-fist");
  learn("monk", "chakra");
  learn("monk", "revive");
  learn("monk", "counter");

  // Thief (Steal) — the Move +2 movement ability.
  learn("thief", "steal-gil");
  learn("thief", "move-plus-2");

  // Latch mastery for any fully-learned tree (Wizard → Arcane Attunement).
  for (const jobId of registry.jobById.keys()) {
    r = checkMastery(r, jobId, registry);
  }

  // Initial loadout: everything but the Secondary (free + reversible, AC-J4).
  r = setLoadoutSlot(r, "reaction", "punch-art.counter", registry);
  r = setLoadoutSlot(r, "support", "battle-skill.equip-heavy-armor", registry);
  r = setLoadoutSlot(r, "movement", "steal.move-plus-2", registry);
  r = setLoadoutTraits(r, ["arcane-attunement"], registry);

  return r;
}

// ---- Pure view queries over a record ---------------------------------------

/** The castable command ids = the real battle projection (basic + primary + secondary). */
const commandsOf = (r: UnitRecord): string[] =>
  buildBattleUnit(r, registry).abilities.map((a) => a.id);

/** Job ids equippable as the Secondary: another job the unit knows an action in. */
function equippableSecondaryJobs(r: UnitRecord): string[] {
  const out: string[] = [];
  for (const jobId of registry.jobById.keys()) {
    if (jobId === r.currentJob) continue;
    const skillset = registry.job(jobId).primarySkillset;
    const has = r.learned.some((id) => {
      const a = registry.ability(id);
      return a.type === "action" && a.skillset === skillset;
    });
    if (has) out.push(jobId);
  }
  return out;
}

/** Learned ability ids whose authored type matches a single-ability slot. */
const learnedByType = (r: UnitRecord, type: "reaction" | "support" | "movement"): string[] =>
  r.learned.filter((id) => registry.ability(id).type === type);

/** The Primary command's learned action ids (current job's skillset ∩ learned). */
function primaryActionIds(r: UnitRecord): string[] {
  const skillset = primaryCommand(r, registry);
  return r.learned.filter((id) => {
    const a = registry.ability(id);
    return a.type === "action" && a.skillset === skillset;
  });
}

/** Mastery traits the unit has earned (from mastered jobs). */
const earnedTraits = (r: UnitRecord): string[] =>
  r.mastered.map((jobId) => registry.job(jobId).masteryBonus.trait);

// ---- DOM rendering ----------------------------------------------------------

interface Opt {
  value: string;
  label: string;
}

const optionList = (opts: Opt[], selected: string): string =>
  opts
    .map((o) => `<option value="${o.value}"${o.value === selected ? " selected" : ""}>${o.label}</option>`)
    .join("");

const valueOrNull = (v: string): string | null => (v === "" ? null : v);

let record = makeDemoRecord();
let bodyEl: HTMLElement | null = null;

function sel(testid: string): HTMLElement {
  const el = bodyEl?.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
  if (!el) throw new Error(`prep: missing element "${testid}"`);
  return el;
}

function render(): void {
  if (!bodyEl) return;

  const primarySkillset = primaryCommand(record, registry);
  const commands = commandsOf(record);
  const primaryActs = primaryActionIds(record);
  const traits = earnedTraits(record);

  const noneOpt: Opt = { value: "", label: "— none —" };

  const secondaryOptions = optionList(
    [
      noneOpt,
      ...equippableSecondaryJobs(record).map((j) => ({
        value: j,
        label: `${skillsetLabel(registry.job(j).primarySkillset)} (${jobLabel(j)})`,
      })),
    ],
    record.loadout.secondary ?? "",
  );

  const abilitySelect = (slot: "reaction" | "support" | "movement"): string =>
    optionList(
      [noneOpt, ...learnedByType(record, slot).map((id) => ({ value: id, label: abilityLabel(id) }))],
      record.loadout[slot] ?? "",
    );

  const traitsBody =
    traits.length === 0
      ? `<p class="empty">No mastered jobs yet — master a full job tree to earn a trait.</p>`
      : traits
          .map((t) => {
            const on = record.loadout.traits.includes(t);
            return `<label class="chk"><input type="checkbox" data-trait="${t}"${on ? " checked" : ""}/> ${traitLabel(t)}</label>`;
          })
          .join("");

  const commandItems = commands
    .map((id) => `<li data-cmd="${id}">${abilityLabel(id)}</li>`)
    .join("");

  bodyEl.innerHTML = `
    <div class="chassis">
      <div class="slot" data-testid="prep-primary">
        <h3>Primary <span class="lock">locked to job</span></h3>
        <div class="val">${skillsetLabel(primarySkillset)} (${jobLabel(record.currentJob)})</div>
        <div class="sub">${primaryActs.map(abilityLabel).join(", ") || "—"}</div>
      </div>
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
      </div>
    </div>
    <div class="cmds">
      <h3>Commands in battle <span class="count" data-testid="prep-command-count">${commands.length}</span></h3>
      <ul class="cmd-list" data-testid="prep-commands">${commandItems}</ul>
      <p class="hint">Equip <b>Black Magic</b> as the Secondary — the Knight’s command list gains <b>Fire</b>. Swaps are free and reversible.</p>
    </div>`;

  bind();
}

function bind(): void {
  const onSlot = (slot: LoadoutSlot, testid: string): void => {
    sel(testid).addEventListener("change", (e) => {
      setSlot(slot, valueOrNull((e.target as HTMLSelectElement).value));
    });
  };
  onSlot("secondary", "prep-secondary");
  onSlot("reaction", "prep-reaction");
  onSlot("support", "prep-support");
  onSlot("movement", "prep-movement");

  bodyEl?.querySelectorAll<HTMLInputElement>("input[data-trait]").forEach((cb) => {
    cb.addEventListener("change", onTraitToggle);
  });
}

function setSlot(slot: LoadoutSlot, value: string | null): void {
  record = setLoadoutSlot(record, slot, value, registry);
  render();
}

function onTraitToggle(): void {
  const checked = [...(bodyEl?.querySelectorAll<HTMLInputElement>("input[data-trait]:checked") ?? [])]
    .map((cb) => cb.dataset.trait)
    .filter((t): t is string => typeof t === "string")
    .slice(0, 2);
  record = setLoadoutTraits(record, checked, registry);
  render();
}

// ---- Deterministic hooks for Playwright (mirrors main.ts's window.tuh) ------

interface PrepApi {
  /** The current loadout + castable command ids (the real battle projection). */
  getState: () => { loadout: Loadout; commands: string[] };
  /** Castable command ids only. */
  getCommands: () => string[];
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

/** Mount the prep panel into `container` and expose the `window.tuhPrep` hooks. */
export function mountPrep(container: HTMLElement): void {
  bodyEl = container;
  render();

  window.tuhPrep = {
    getState: () => ({ loadout: record.loadout, commands: commandsOf(record) }),
    getCommands: () => commandsOf(record),
    setSecondary: (jobId) => setSlot("secondary", jobId),
    setSlot,
    reset: () => {
      record = makeDemoRecord();
      render();
    },
  };
}
