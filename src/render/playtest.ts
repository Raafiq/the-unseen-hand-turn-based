/**
 * Personas — the between-battle half of the synthetic playtest
 * (`docs/plans/slice-m1-synthetic-playtest.md`, step A1).
 *
 * A persona is a deterministic policy over the decisions a PLAYER makes between
 * fights: who deploys, what to buy with banked AP, what fills the chassis slots,
 * which owned weapon each member carries. It is NOT a tactical AI. `src/sim/ai.ts`
 * decides what happens inside a battle and keeps deciding it; a second tactical
 * brain here would be the "never grow a second accounting fold" mistake wearing a
 * new hat.
 *
 * WHY THIS FILE IS IN `src/render` AND NOT `src/sim`. It drives `CampaignShell` and
 * `PrepModel`, which both live here. Both are DOM-free, so the harness runs headless
 * — but a `src/sim` module importing them would be the repo's first sim→render
 * import and breaks the locked "sim core is pure and headless" rule.
 *
 * DETERMINISM. `npm run check:rng` scans `src/sim`; this file is scanned by a SECOND,
 * path-pinned invocation of the same script, because it is sim-grade even though it
 * does not live there. No persona draws randomness at all: every tiebreak is a stable
 * order (roster order, content-pack order, the model's own option lists). That is a
 * property to preserve, not an accident — an unseeded shuffle here would make every
 * number the harness reports unreproducible.
 *
 * WHY THE POLICIES DRIVE `PrepModel` RATHER THAN THE SIM DIRECTLY. `PrepModel` is the
 * class the human prep panel drives. Calling `canLearn`/`learnAbility`/`setLoadoutSlot`
 * from here would be a second copy of the prep screen's rules, and the two would drift
 * — and worse, the harness would then measure a path no player takes. Going through the
 * model is what makes "a persona's choices reach the built unit" structurally true.
 * It does not make it PROVEN: step A3's A/B on the built object still owes that.
 */

import type {
  ApReward,
  CampaignDef,
  ContentRegistry,
  EncounterMap,
  LoadoutSlot,
  UnitRecord,
} from "../sim/index.js";
import { CampaignShell } from "./campaign-shell.js";
import { PrepModel, type LearnRow } from "./prep.js";
import { memorySlot } from "./storage.js";

/** The three policies the slice compares. */
export type PersonaId = "naive" | "default" | "optimizer";

/**
 * The ability-typed chassis slots — every slot except `secondary`, in fill order.
 *
 * `secondary` is filled LAST, by its own helper. It is the only slot whose value is a
 * job id rather than an ability id, and it is only legal once the unit has learned an
 * action in that job's command — so filling it before the buying pass would just fail
 * on a fresh party, while filling it after gives it something to point at.
 */
const ABILITY_SLOTS: readonly Exclude<LoadoutSlot, "secondary">[] = [
  "support",
  "movement",
  "reaction",
];

/**
 * The weapon-derived basic attack. It is in every unit's command list and in NO content
 * pack, so it is the one id in a real projection that `registry.ability` cannot resolve.
 */
const BASIC_ATTACK_ID = "basic.attack";

/**
 * What a persona knows when it makes its between-battle decisions.
 *
 * Everything here is derived from the save or the finished battle before it — nothing
 * is derived from wall-clock, iteration order of a Map keyed by anything unstable, or
 * a source outside the run. The runner (step A2) assembles it.
 */
export interface PrepContext {
  /** 0-based index of the battle about to be played. */
  readonly battleIndex: number;
  /** How many party members this battle fields — from the encounter, never the party. */
  readonly slots: number;
  /** The whole party, in save order. Larger than `slots` from battle 3 on. */
  readonly party: readonly UnitRecord[];
  /** Equipment ids the party owns (the campaign's authored drip). */
  readonly inventory: readonly string[];
  readonly registry: ContentRegistry;
  /**
   * Per-record AP rewards from the battle just finished, or `null` before the first.
   *
   * This is `deriveRewards`' own output, not a scalar invented here: `meaningfulActions`
   * is the contribution signal the AP economy itself pays out on, so an optimizer that
   * ranks by it is reading the same number the game does. A member absent from the map
   * did not deploy.
   */
  readonly lastRewards: Readonly<Record<string, ApReward>> | null;
}

/**
 * A between-battle policy.
 *
 * Two methods because the two decisions go through different seams: deployment is the
 * shell's (`setDeployment`), and everything else is the prep panel's. Neither returns a
 * record — `prepare` mutates through the model, exactly as a player clicking does.
 */
export interface Persona {
  readonly id: PersonaId;
  /** One line, for the report header. */
  readonly describe: string;
  /**
   * Record ids to field, EXACTLY `ctx.slots` of them, all drawn from `ctx.party`.
   * The runner checks both — a policy that returned the wrong count would otherwise
   * surface as the shell throwing several frames later.
   */
  chooseDeployment(ctx: PrepContext): string[];
  /**
   * Spend, equip and re-job ONE member. The model is already pointed at them
   * (`prep.select(id)` has been called), and its `onChange` is wired to the save.
   */
  prepare(prep: PrepModel, ctx: PrepContext): void;
}

// ── shared helpers ───────────────────────────────────────────────────────────

/** Deploy the first `slots` party members, in save order — nobody's idea of a plan. */
function firstN(ctx: PrepContext): string[] {
  return ctx.party.slice(0, ctx.slots).map((r) => r.id);
}

/**
 * Every learn row across EVERY job tree, not just the one the panel happens to be
 * showing.
 *
 * `learnRows()` lists one tree at a time, because that is what the panel shows. A
 * player browses; a persona has to browse too, or it can only ever buy from the job it
 * is standing in — which would quietly make the whole cross-job economy invisible to
 * the harness. Restores the browse position, so reading never changes what a later
 * read sees.
 */
function allRows(prep: PrepModel): { job: string; row: LearnRow }[] {
  const restore = prep.browseJob();
  const out: { job: string; row: LearnRow }[] = [];
  for (const job of prep.jobIds()) {
    prep.setBrowseJob(job);
    for (const row of prep.learnRows()) out.push({ job, row });
  }
  prep.setBrowseJob(restore);
  return out;
}

/**
 * Rows worth spending on: buyable now, not already known, and LIVE.
 *
 * `deferred` is the load-bearing filter. A deferred node is one the game itself labels
 * as doing nothing yet, and AP is never refunded — a persona that bought them would
 * burn the campaign's whole budget on abilities that cannot affect a single battle, and
 * the harness would report the economy as "engaged with" while nothing changed.
 */
function liveBuyable(prep: PrepModel): { job: string; row: LearnRow }[] {
  return allRows(prep).filter(
    ({ row }) => row.buyable && !row.known && row.deferred === null,
  );
}

/** Cheapest first; ties broken by pack order, which `allRows` walks deterministically. */
function cheapest(rows: { job: string; row: LearnRow }[]): { job: string; row: LearnRow } | null {
  let best: { job: string; row: LearnRow } | null = null;
  for (const cand of rows) {
    if (best === null || cand.row.apCost < best.row.apCost) best = cand;
  }
  return best;
}

/**
 * Equip anything already learned into an empty ability slot.
 *
 * Separate from buying, and run both before and after it: a unit can arrive owning an
 * ability it has never equipped (the campaign authors `learned` directly), and the
 * dead-support-slot bug is exactly what "learned but never equipped" looks like from
 * the outside.
 *
 * Candidates come from the model's own `learnedByType`, so `setSlot` cannot reject one
 * on type or on not being learned. Any throw from here is a real defect and is left to
 * propagate.
 */
function equipLearned(prep: PrepModel): void {
  for (const slot of ABILITY_SLOTS) {
    if (prep.record().loadout[slot] !== null) continue;
    const owned = prep.learnedByType(slot);
    const pick = owned[0];
    if (pick !== undefined) prep.setSlot(slot, pick);
  }
}

/** Equip a secondary command if one is legal and the slot is empty. */
function equipSecondary(prep: PrepModel): void {
  if (prep.record().loadout.secondary !== null) return;
  const pick = prep.equippableSecondaryJobs()[0];
  if (pick !== undefined) prep.setSlot("secondary", pick);
}

/** The owned weapon with the biggest basic swing for THIS body, or null if none rank. */
function bestSwing(prep: PrepModel): string | null {
  let best: { id: string; damage: number } | null = null;
  for (const opt of prep.weaponOptions()) {
    // `null` damage means the swing could not be derived — never treat it as 0, which
    // would read as "this weapon does nothing" and rank it below a genuinely bad one.
    if (opt.damage === null) continue;
    if (best === null || opt.damage > best.damage) best = { id: opt.id, damage: opt.damage };
  }
  return best?.id ?? null;
}

/**
 * True when this unit's live commands are mostly MAGIC — the signal the optimizer
 * equips against.
 *
 * Faith is a real multiplier on magic damage (`resolve.ts` passes both sides' Faith
 * into `magicDamage`), and two shipped weapons move it: the Ritual Staff (+15) and the
 * Heretic's Edge (−20). So for a caster the biggest swing is the WRONG pick, and that
 * divergence is the only thing separating `optimizer` from `default` on the gear axis.
 * If it turns out not to separate them, that is a finding about the weapon roster, not
 * a broken persona.
 */
function isCaster(prep: PrepModel, registry: ContentRegistry): boolean {
  // The BASIC ATTACK IS EXCLUDED FROM BOTH SIDES of this ratio. Every unit in the game
  // has it, so it carries no signal about what this one does — and counting it in the
  // denominator alone made the shipped priest (whose command list is exactly
  // `basic.attack` + `white-magic.cure`) score 1-of-2 and fail a strict-majority test.
  // The question is "of the commands this unit chose, how many scale on Faith".
  const commands = prep.commands().filter((id) => id !== BASIC_ATTACK_ID);
  if (commands.length === 0) return false;
  let magic = 0;
  for (const id of commands) {
    const formula = registry.ability(id).formula;
    // `heal` counts: the resolver routes it through the same `magicDamage` as `magic`,
    // Faith and all, so a dedicated healer is as Faith-hungry as a nuker. Read off the
    // resolver rather than assumed — a persona that equipped a healer for swing damage
    // would read as a tuning problem rather than as a wrong heuristic.
    if (formula === "magic" || formula === "heal") magic += 1;
  }
  return magic * 2 > commands.length;
}

// ── the three personas ───────────────────────────────────────────────────────

/**
 * Someone who does not realise the prep screen matters: clicks past it.
 *
 * The control, and the reason the other two mean anything. It buys nothing, equips
 * nothing and re-jobs nobody, so whatever it clears is what the AUTHORED party can do
 * with no player input at all. If it clears the campaign as comfortably as the
 * optimizer, the meta systems do not matter — and that is the headline finding.
 */
export const NAIVE: Persona = {
  id: "naive",
  describe: "clicks past the prep screen: no purchases, no equipment changes",
  chooseDeployment: firstN,
  prepare(): void {
    // Deliberately empty. This is the measurement baseline, not a stub.
  },
};

/**
 * Someone who engages with the prep screen without a plan: fills every empty slot with
 * the cheapest live thing available, and swings the heaviest weapon they own.
 *
 * "Cheapest live option per empty slot" is the same walk `docs/NEXT.md`'s reachability
 * table records, so this persona is the one whose AP spend is directly comparable to
 * the budget numbers already in the docs.
 */
export const DEFAULT: Persona = {
  id: "default",
  describe: "fills every empty chassis slot with the cheapest live option; heaviest weapon",
  chooseDeployment: firstN,
  prepare(prep: PrepModel): void {
    equipLearned(prep);
    // Buy until nothing live is affordable. Bounded by AP, which only decreases here.
    for (;;) {
      const pick = cheapest(liveBuyable(prep));
      if (pick === null) break;
      prep.learn(pick.job, pick.row.node);
      equipLearned(prep);
    }
    equipSecondary(prep);
    const weapon = bestSwing(prep);
    if (weapon !== null && weapon !== prep.record().weapon) prep.setWeapon(weapon);
  },
};

/**
 * Someone reading the numbers: deploys whoever contributed last time, spends toward the
 * commands their current job actually gives them, and equips for what the unit DOES
 * rather than for the biggest number on the weapon.
 *
 * The three differences from `default` are each a lever the harness can see move:
 * deployment by measured contribution, spending biased to the primary command, and a
 * Faith-aware weapon pick.
 */
export const OPTIMIZER: Persona = {
  id: "optimizer",
  describe: "deploys by measured contribution, buys into the primary command, equips for role",

  chooseDeployment(ctx: PrepContext): string[] {
    if (ctx.lastRewards === null) return firstN(ctx);
    // Stable sort by contribution, descending, ties keeping save order — so a party
    // where nobody contributed deploys exactly as `naive` would, rather than in an
    // order that looks meaningful and is not.
    const scored = ctx.party.map((r, i) => {
      const reward = ctx.lastRewards?.[r.id];
      return { id: r.id, index: i, score: reward?.participated === true ? reward.meaningfulActions : -1 };
    });
    scored.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    return scored.slice(0, ctx.slots).map((s) => s.id);
  },

  prepare(prep: PrepModel, ctx: PrepContext): void {
    equipLearned(prep);
    const home = prep.record().currentJob;
    for (;;) {
      const rows = liveBuyable(prep);
      if (rows.length === 0) break;
      // Prefer the current job's own tree — the commands this unit can use WITHOUT
      // spending a chassis slot on a secondary. Falls back to the cheapest anywhere.
      const own = rows.filter((r) => r.job === home);
      const pick = cheapest(own.length > 0 ? own : rows);
      if (pick === null) break;
      prep.learn(pick.job, pick.row.node);
      equipLearned(prep);
    }
    equipSecondary(prep);

    const options = prep.weaponOptions();
    let weapon: string | null;
    if (isCaster(prep, ctx.registry)) {
      // Highest Faith shift wins for a caster; the swing is the tiebreak, not the goal.
      let best: { id: string; faith: number; damage: number } | null = null;
      for (const opt of options) {
        const faith = ctx.registry.equipment(opt.id).faith ?? 0;
        const damage = opt.damage ?? 0;
        if (best === null || faith > best.faith || (faith === best.faith && damage > best.damage)) {
          best = { id: opt.id, faith, damage };
        }
      }
      weapon = best?.id ?? null;
    } else {
      weapon = bestSwing(prep);
    }
    if (weapon !== null && weapon !== prep.record().weapon) prep.setWeapon(weapon);
  },
};

/** The three, in report order: control, engaged, informed. */
export const PERSONAS: readonly Persona[] = [NAIVE, DEFAULT, OPTIMIZER];

/** Look one up by id; throws rather than silently running the wrong policy. */
export function persona(id: PersonaId): Persona {
  const found = PERSONAS.find((p) => p.id === id);
  if (!found) throw new Error(`playtest: no persona "${id}"`);
  return found;
}

// ── the runner (A2) ──────────────────────────────────────────────────────────

/**
 * One battle as the playtest saw it.
 *
 * `attempts` and `playerHpFraction` are the two difficulty signals: a battle cleared on
 * the first go with 90% of the party's HP intact is not the same battle as one cleared
 * at 15%, and an outcome column alone cannot tell them apart.
 */
export interface PlaytestBattle {
  battleId: string;
  encounterId: string;
  /** 1-based position in the campaign — "battle 3 of 5". */
  step: number;
  outcome: string;
  /** Attempts spent here. 1 = cleared (or lost) first go. */
  attempts: number;
  turns: number;
  ticks: number;
  /** Σhp / Σmaxhp for the player team at the end. How close it was. */
  playerHpFraction: number;
  /** The same for the opposition — a low number on a loss means it was nearly won. */
  enemyHpFraction: number;
  /** Edits the persona made at the prep screen before this battle (see `decisions`). */
  prepDecisions: number;
}

/** What one member looked like when the run ended. */
export interface PlaytestMember {
  id: string;
  job: string;
  /** AP still banked — a high number means the economy went unused. */
  ap: number;
  learned: number;
  /** Of the four chassis slots, how many carry something. */
  slotsFilled: number;
  weapon: string | null;
}

/** One persona's whole playthrough at one seed. */
export interface PlaytestReport {
  persona: PersonaId;
  /** The offset applied to every encounter's authored seed. 0 = the shipped campaign. */
  seedOffset: number;
  /**
   * How the run ended.
   *   `completed` — reached the ending.
   *   `stalled`   — lost, and ran out of attempts. WHERE a run stops is the finding.
   *   `capped`    — hit the battle cap without resolving, which is a harness bug, not a
   *                 result: a campaign that neither ends nor stalls means the loop below
   *                 stopped believing the shell, and the number is not reportable.
   */
  ending: "completed" | "stalled" | "capped";
  battles: PlaytestBattle[];
  /**
   * Between-battle edits that REACHED THE SAVE, summed over the run — the session-length
   * proxy, and the same number that proves the persona is not computing a plan it never
   * applies.
   *
   * Counted by diffing the stored record before and after each prep screen, never by
   * asking the persona what it did. A policy that decided on twelve purchases and applied
   * none scores 0 here, which is the dead-support-slot failure showing up as a number
   * instead of as silence.
   *
   * NOT MINUTES. Converting this to wall-clock needs a seconds-per-decision constant that
   * nothing here measures; Part B's telemetry is what eventually supplies it.
   */
  decisions: number;
  /** Every party member at the end, in save order. */
  party: PlaytestMember[];
  /** Σ AP left unspent across the party. High = the progression economy went untouched. */
  apUnspent: number;
  /** Issued-command histogram summed over every battle. */
  abilityUsage: Record<string, number>;
}

export interface PlaytestOptions {
  persona: Persona;
  def: CampaignDef;
  encounters: EncounterMap;
  registry: ContentRegistry;
  /** Added to every encounter's authored seed. 0 reproduces the shipped campaign. */
  seedOffset?: number;
  /**
   * Attempts allowed per battle before the run is called `stalled`. Default 1.
   *
   * ONE, NOT THREE, AND THAT IS A FINDING RATHER THAN A SHORTCUT. A loss banks nothing —
   * `applyBattleResult` returns `gameOver` before it awards AP — and `retryBattle`
   * restores the party exactly. With a fixed seed and an unchanged party, attempt two is
   * bit-identical to attempt one, so retrying can only ever burn wall-clock. The default
   * is 1 because a higher one buys nothing; the option exists so `playtest.test.ts` can
   * DEMONSTRATE the repeat rather than leave that claim as prose.
   */
  maxAttempts?: number;
  /**
   * Skip the persona's prep entirely — deployment, purchases, equipment, all of it.
   *
   * The A3 lever: the same run with the persona's choices applied and withheld must
   * produce different reports, or the policy never reached the built unit. An option
   * that was quietly ignored would give two identical runs and read as a null result,
   * so the runner records `prepDecisions: 0` on every battle when it is set and the
   * test asserts that too — a lever has to be shown to be honored.
   */
  withholdPrep?: boolean;
  /** Halting guard. Defaults to the campaign's length plus a small margin. */
  maxBattles?: number;
}

/**
 * A copy of the encounter map with every authored seed shifted by `offset`.
 *
 * A battle's seed lives in its ENCOUNTER FILE, not in the save and not in the shell, so
 * there is no seed parameter to sweep — and adding one to `CampaignShell` would put a
 * test affordance in the production path. `ShellOptions.encounters` takes raw defs and
 * parses them itself, so overriding the field before handing them over is the whole
 * mechanism.
 *
 * OFFSET rather than an absolute seed, so `0` is exactly the shipped campaign and every
 * other value is a stated distance from it.
 */
export function withSeedOffset(encounters: EncounterMap, offset: number): EncounterMap {
  if (offset === 0) return encounters;
  const out: Record<string, unknown> = {};
  for (const [id, def] of Object.entries(encounters)) {
    const raw = def as { seed?: number };
    if (typeof raw.seed !== "number") {
      // Never silently pass an un-reseeded encounter through: the sweep would then
      // report several "different seeds" that were all the same battle.
      throw new Error(`playtest: encounter "${id}" has no numeric seed to offset`);
    }
    out[id] = { ...(def as object), seed: raw.seed + offset };
  }
  return Object.freeze(out);
}

/** Play the live battle out with the balance probe on both seats. */
function autoplay(shell: CampaignShell): void {
  const session = shell.session;
  if (!session) throw new Error("playtest: no battle in progress");
  let guard = 0;
  while (session.phase !== "ENDED") {
    session.step();
    if (++guard > 2000) throw new Error("playtest: the battle never ended");
  }
}

/** How many of the four chassis slots carry something. */
function slotsFilled(record: UnitRecord): number {
  const l = record.loadout;
  return [l.secondary, l.reaction, l.support, l.movement].filter((v) => v !== null).length;
}

/**
 * Edits that reached the SAVE, counted by diffing the stored record.
 *
 * Deliberately counts state, not intent: an ability learned, a slot changed, a job
 * changed, a weapon swapped. Each is one thing a player would have clicked.
 */
function editCount(before: UnitRecord, after: UnitRecord): number {
  let n = after.learned.length - before.learned.length;
  for (const slot of ["secondary", "reaction", "support", "movement"] as const) {
    if (before.loadout[slot] !== after.loadout[slot]) n += 1;
  }
  if (before.currentJob !== after.currentJob) n += 1;
  if (before.weapon !== after.weapon) n += 1;
  return n;
}

/**
 * Play one campaign end to end with one persona at one seed.
 *
 * Drives `CampaignShell` over an in-memory save — the same seam `campaign-shell.test.ts`
 * uses — so the harness plays the game the page plays. Tactics inside each battle are
 * `ai.ts`'s, unchanged: the ONLY thing a persona varies is what walks onto the field.
 */
export function runPlaytest(opts: PlaytestOptions): PlaytestReport {
  const seedOffset = opts.seedOffset ?? 0;
  const maxAttempts = opts.maxAttempts ?? 1;
  const maxBattles = opts.maxBattles ?? opts.def.battles.length + 2;

  const shell = new CampaignShell({
    def: opts.def,
    encounters: withSeedOffset(opts.encounters, seedOffset),
    registry: opts.registry,
    slot: memorySlot(),
  });
  shell.newGame();

  const battles: PlaytestBattle[] = [];
  const abilityUsage: Record<string, number> = {};
  let decisions = 0;
  let lastRewards: Readonly<Record<string, ApReward>> | null = null;
  let attempts = 1;
  let ending: PlaytestReport["ending"] = "capped";

  while (battles.length < maxBattles) {
    const save = shell.save;
    if (!save) throw new Error("playtest: the shell lost its save mid-run");
    if (shell.screen !== "BRIEFING") throw new Error(`playtest: stuck on ${shell.screen}`);

    const deployment = shell.deployment();
    if (!deployment) throw new Error("playtest: no battle to deploy into");
    const ctx: PrepContext = {
      battleIndex: save.battleIndex,
      slots: deployment.slots,
      party: save.party,
      inventory: save.inventory,
      registry: opts.registry,
      lastRewards,
    };

    let prepDecisions = 0;
    if (opts.withholdPrep !== true) {
      const chosen = opts.persona.chooseDeployment(ctx);
      // Checked HERE rather than left to the shell: a policy that returned the wrong
      // count would otherwise surface as an exception several frames later, reading
      // like a shell bug.
      if (chosen.length !== deployment.slots) {
        throw new Error(
          `playtest: ${opts.persona.id} chose ${chosen.length} to deploy, not ${deployment.slots}`,
        );
      }
      for (const id of chosen) {
        if (!save.party.some((r) => r.id === id)) {
          throw new Error(`playtest: ${opts.persona.id} deployed "${id}", who is not in the party`);
        }
      }
      shell.setDeployment(chosen);
      prepDecisions += 1;

      const before = new Map((shell.save?.party ?? []).map((r) => [r.id, r] as const));
      const prep = new PrepModel({
        registry: opts.registry,
        records: shell.save?.party ?? [],
        inventory: save.inventory,
        onChange: (record) => shell.updateParty(record),
      });
      for (const member of before.keys()) {
        prep.select(member);
        opts.persona.prepare(prep, ctx);
      }
      for (const after of shell.save?.party ?? []) {
        const was = before.get(after.id);
        if (was) prepDecisions += editCount(was, after);
      }
    }
    decisions += prepDecisions;

    shell.deploy();
    autoplay(shell);
    shell.concludeBattle();

    const resolved = shell.lastBattle;
    if (!resolved) throw new Error("playtest: the battle banked no report");
    lastRewards = resolved.rewards;
    for (const [id, n] of Object.entries(resolved.report.abilityUsage)) {
      abilityUsage[id] = (abilityUsage[id] ?? 0) + n;
    }
    const team = (id: number): number =>
      resolved.report.teams.find((t) => t.teamId === id)?.hpFraction ?? 0;
    battles.push({
      battleId: resolved.battleId,
      encounterId: resolved.encounterId,
      step: save.battleIndex + 1,
      outcome: resolved.report.outcome,
      attempts,
      turns: resolved.report.turns,
      ticks: resolved.report.ticks,
      playerHpFraction: team(opts.def.playerTeam),
      enemyHpFraction:
        resolved.report.teams.find((t) => t.teamId !== opts.def.playerTeam)?.hpFraction ?? 0,
      prepDecisions,
    });

    // Read the SAVE's status, not the screen: `concludeBattle` derives the screen from
    // exactly this field, and narrowing the screen union above would make TypeScript
    // believe it cannot have changed.
    const status = shell.save?.status;
    if (status === "completed") {
      ending = "completed";
      break;
    }
    if (status === "gameOver") {
      if (attempts >= maxAttempts) {
        ending = "stalled";
        break;
      }
      attempts += 1;
      shell.retry();
      continue;
    }
    attempts = 1;
    shell.nextBattle();
  }

  const party = (shell.save?.party ?? []).map((r) => ({
    id: r.id,
    job: r.currentJob,
    ap: r.ap,
    learned: r.learned.length,
    slotsFilled: slotsFilled(r),
    weapon: r.weapon,
  }));

  return {
    persona: opts.persona.id,
    seedOffset,
    ending,
    battles,
    decisions,
    party,
    apUnspent: party.reduce((sum, m) => sum + m.ap, 0),
    abilityUsage,
  };
}
