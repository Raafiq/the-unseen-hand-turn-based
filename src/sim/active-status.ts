/**
 * The RESOLVED, self-contained status record and its constructors.
 *
 * WHY THIS IS ITS OWN MODULE. It lived in `state.ts` until the on-hit inflict path
 * landed. Wiring that path made `BattleAbility.inflicts` carry resolved
 * {@link ActiveStatus} TEMPLATES rather than bare status ids (a resolver is
 * registry-free per ADR-0011, so it cannot look an id up), which made `ability.ts`
 * depend on this schema — while `state.ts` already depends on `ability.ts`. Zod
 * builds schemas at module-eval, so that cycle throws a `ReferenceError` (TDZ)
 * rather than failing gracefully. Extracting the shared leaf is the fix the
 * `element.ts` split established; see the Zod gotcha in `src/sim/CLAUDE.md`.
 *
 * The live chain is now: state → ability → active-status → status → ∅.
 * `state.ts` re-exports everything here, so existing importers are unaffected.
 *
 * PURE DATA + pure constructors: no scheduler, no resolver, no RNG.
 */

import { z } from "zod";
import { StatusKindSchema, type StatusEffect } from "./status.js";

const IntSchema = z.number().int();

/**
 * The P0 status names (docs/01 §1/§8). RETAINED as a legacy vocabulary: the
 * v6→v7 migration and test fixtures build {@link ActiveStatus} records from these
 * names via {@link legacyActiveStatus}, and the damage resolvers still identify
 * Protect/Shell by this short id. New authored statuses use the catalog ids
 * (`status.*`, data/base-pack.json) and are applied via {@link makeActiveStatus}.
 */
export const StatusFlagSchema = z.enum(["haste", "slow", "stop", "protect", "shell"]);
export type StatusFlag = z.infer<typeof StatusFlagSchema>;

/**
 * A `remainingCT` at or above this sentinel means the status is PERMANENT (never
 * decays) — the P0 model, where statuses had no lifetime. Status decay
 * (scheduler.ts) skips these; only finite (`remainingCT < PERMANENT_STATUS_CT`)
 * statuses tick down and expire. Well beyond any battle length, so a migrated P0
 * status can never expire mid-battle.
 */
export const PERMANENT_STATUS_CT = 1_000_000_000;

/**
 * A RESOLVED, self-contained status on a unit (docs/05 §6, ADR-0011). At inflict
 * time the tunable catalog record ({@link StatusEffect}) is copied onto the unit
 * as one of these, so a running/replayed battle NEVER reads the catalog:
 *   - `ctFactor` is read by the scheduler (`ctRateOfUnit`) as a CT-accrual
 *     multiplier (1 = neutral, 1.5 = Haste, 0.5 = Slow, 0 = Stop);
 *   - `remainingCT` ticks down deterministically each scheduler tick (no RNG),
 *     expiring at 0 — unless PERMANENT (see {@link PERMANENT_STATUS_CT});
 *   - `preventsAction` / `interruptsCharge` / `interruptsMagicOnly` are the
 *     interrupt discriminants the charge-maturity check reads (kind-aware for
 *     Silence). Behavior stays in code; only these tuning/behavior FLAGS are data.
 */
export const ActiveStatusSchema = z
  .object({
    id: z.string().min(1),
    kind: StatusKindSchema,
    /** CT-accrual multiplier (docs/05 §1b): 1 = neutral, 0 = Stop. */
    ctFactor: z.number(),
    /** CT remaining before the status expires; >= PERMANENT_STATUS_CT = never. */
    remainingCT: IntSchema.min(0),
    /** Unit cannot declare actions (Stop/Sleep/Don't-Act/Petrify). */
    preventsAction: z.boolean(),
    /** Afflicting mid-charge cancels the charge (docs/05 §2 interrupt check). */
    interruptsCharge: z.boolean(),
    /** Interrupt applies to magic charges only (Silence). */
    interruptsMagicOnly: z.boolean(),
    /** The unit fights for the INFLICTER while this lasts (Charm, docs/01 §8). */
    controlsTarget: z.boolean(),
    /**
     * WHICH team it fights for — stamped when the status is APPLIED (`applyInflicts`),
     * because only the resolver knows who landed it. `null` on a template (build.ts
     * projects one per authored `inflicts` id, long before any inflicter exists) and on
     * any status that does not control, so `controlsTarget && controlledByTeamId !== null`
     * is the ONLY condition that swaps allegiance ({@link effectiveTeamOf}).
     */
    controlledByTeamId: IntSchema.min(0).nullable(),
  })
  .strict();
export type ActiveStatus = z.infer<typeof ActiveStatusSchema>;

/**
 * Does `st` interrupt a charge whose effect is `effectKind`? Behavior-flag driven
 * (docs/05 §2, ADR-0010 item 1), so it auto-covers every disabling status the
 * catalog defines — Stop/Sleep/Don't-Act/Petrify (`preventsAction`/
 * `interruptsCharge`) interrupt any charge; Silence (`interruptsMagicOnly`)
 * interrupts ONLY a magic charge (kind-aware). No id hard-coding.
 *
 * LIVES HERE, not in `charge.ts`, because BOTH charge maturity and the on-hit
 * inflict path (`resolve.ts`) must latch the interrupt identically, and `charge.ts`
 * already imports `resolve.ts` — putting it there would make the two modules a
 * cycle. `effectKind` is a bare string rather than `ChargeEffect["kind"]` for the
 * same reason: that type lives in `state.ts`, which would drag the cycle back in.
 * `charge.ts` re-exports this under its original name and signature.
 */
export function statusInterruptsCharge(st: ActiveStatus, effectKind: string): boolean {
  if (!st.preventsAction && !st.interruptsCharge) return false;
  if (st.interruptsMagicOnly && effectKind !== "magic") return false;
  return true;
}

/** Resolved behavior for the P0 five, keyed by legacy {@link StatusFlag} name. */
const LEGACY_STATUS_BEHAVIOR: Readonly<
  Record<StatusFlag, Omit<ActiveStatus, "id" | "remainingCT">>
> = {
  haste: { kind: "buff", ctFactor: 1.5, preventsAction: false, interruptsCharge: false, interruptsMagicOnly: false, controlsTarget: false, controlledByTeamId: null },
  slow: { kind: "debuff", ctFactor: 0.5, preventsAction: false, interruptsCharge: false, interruptsMagicOnly: false, controlsTarget: false, controlledByTeamId: null },
  stop: { kind: "debuff", ctFactor: 0, preventsAction: true, interruptsCharge: true, interruptsMagicOnly: false, controlsTarget: false, controlledByTeamId: null },
  protect: { kind: "buff", ctFactor: 1, preventsAction: false, interruptsCharge: false, interruptsMagicOnly: false, controlsTarget: false, controlledByTeamId: null },
  shell: { kind: "buff", ctFactor: 1, preventsAction: false, interruptsCharge: false, interruptsMagicOnly: false, controlsTarget: false, controlledByTeamId: null },
};

/**
 * Build an {@link ActiveStatus} for one of the P0 five legacy statuses. Defaults
 * to PERMANENT (matching P0, where these never expired); pass `remainingCT` for a
 * finite one. Used by the v6→v7 migration and by test/setup fixtures.
 */
export function legacyActiveStatus(flag: StatusFlag, remainingCT: number = PERMANENT_STATUS_CT): ActiveStatus {
  return { id: flag, remainingCT, ...LEGACY_STATUS_BEHAVIOR[flag] };
}

/**
 * Build an {@link ActiveStatus} from a tunable catalog {@link StatusEffect} — the
 * inflict-time copy that makes a status self-contained. `remainingCT` defaults to
 * the catalog `durationCT`; the behavior FLAGS are copied verbatim (omitted ⇒
 * false). Callers that want a permanent status (e.g. a `durationCT: 0`
 * "until-cured" status) pass {@link PERMANENT_STATUS_CT} explicitly.
 *
 * `controlledByTeamId` is ALWAYS null here: this builds a TEMPLATE, and who controls a
 * charmed unit is only known when the status actually lands (`applyInflicts` stamps it).
 */
export function makeActiveStatus(entry: StatusEffect, remainingCT?: number): ActiveStatus {
  return {
    id: entry.id,
    kind: entry.kind,
    ctFactor: entry.ctFactor,
    remainingCT: remainingCT ?? entry.durationCT,
    preventsAction: entry.preventsAction ?? false,
    interruptsCharge: entry.interruptsCharge ?? false,
    interruptsMagicOnly: entry.interruptsMagicOnly ?? false,
    controlsTarget: entry.controlsTarget ?? false,
    controlledByTeamId: null,
  };
}
