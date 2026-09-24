/**
 * THE END-OF-BATTLE RESULT OVERLAY (intent/win-lose-screen.md, ADR-0043 §4) — pure
 * data shape plus markup, imported by `hud.ts` alone. Every field is copied straight
 * off the sim's own report (`CampaignShell.result()`, `CampaignBattleRun`); nothing
 * here re-derives a verdict, an AP total or a grant (`src/render/CLAUDE.md`'s honesty
 * rules). PURE: no DOM, no wall-clock, so its shape is unit-testable with no browser.
 */

import type { Outcome } from "../sim/index.js";

/** VICTORY for a win; DEFEAT for anything else — draw, stalemate and timeout are a
 * loss for the player, the same reading `CampaignShell.outcomeBeat()` already uses
 * (owner decision, `intent/win-lose-screen.md`, 2026-09-22). */
export function verdictOf(outcome: Outcome): "VICTORY" | "DEFEAT" {
  return outcome === "victory" ? "VICTORY" : "DEFEAT";
}

export interface ResultMember {
  id: string;
  name: string;
  /** The AP this battle earned this member — `apGrantAmount(rewards[id])`. */
  ap: number;
  portrait: { url: string; key: string };
}

export interface ResultOverlayData {
  verdict: "VICTORY" | "DEFEAT";
  title: string;
  step: number;
  total: number;
  /** Present only for VICTORY — the owner's leaner Defeat card carries no roster. */
  members?: readonly ResultMember[];
  /** Absent (not empty, not "—") when this battle granted no gear. */
  weaponGrant?: { id: string; name: string };
}

/**
 * The Defeat card's authored copy, in ONE place so a test can read the shipped
 * strings instead of re-typing them, and so a literal in a test never collides with
 * `check:story` — this is HUD copy, not story-pack prose (`data/campaign/story/`
 * carries none of it).
 */
export const DEFEAT_COPY = {
  message: "The party fell.",
  rewardSummary: "No AP or new gear was awarded.",
  // VERIFIED against src/sim/campaign.ts `applyBattleResult`: any non-victory outcome
  // returns `{ ...save, status: "gameOver", history }` — `party`/`inventory` untouched,
  // byte-identical. This line is only true because of that.
  retention: "Previously earned AP and equipment are retained.",
} as const;

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function whereLine(title: string, step: number, total: number): string {
  return `<i>${esc(title)}</i> &nbsp;&middot;&nbsp; <b>Battle ${step} of ${total}</b>`;
}

function memberCardHtml(m: ResultMember): string {
  return `
    <div class="rmember" data-testid="result-member" data-member-id="${esc(m.id)}">
      <div class="rface"><img src="${esc(m.portrait.url)}" alt="" data-portrait-key="${esc(m.portrait.key)}"></div>
      <div class="rwho">${esc(m.name)}</div>
      <div class="rap" data-testid="result-ap">+${m.ap} AP</div>
    </div>`;
}

/**
 * The overlay's markup. `actionLabel` is copy the CALLER owns ("CONTINUE ▸" /
 * "RETRY ▸") — this module has no opinion on navigation, only on what the sim
 * decided. `data-testid="result-action"` is the ONE button regardless of verdict, so
 * a caller that does not yet know which way a battle went (the "whichever way that
 * battle went" shape some specs use) can click it without branching on outcome.
 *
 * THE GLYPH LIVES IN `actionLabel` ALONE. An earlier pass also appended its own
 * `▸` via a `.rchev` span, so the button read "CONTINUE ▸ ▸" — two arrows from two
 * sources. `game.ts`'s labels already carry the glyph (the same "Verb ▸" convention
 * every other action-button label in this codebase uses), so this module prints the
 * label verbatim and nothing else.
 */
export function resultOverlayHtml(data: ResultOverlayData, actionLabel: string): string {
  const where = whereLine(data.title, data.step, data.total);
  const victory = data.verdict === "VICTORY";

  const party =
    victory && data.members
      ? `<div class="rparty" data-testid="result-party">${data.members.map(memberCardHtml).join("")}</div>`
      : "";

  const foot = victory
    ? `<div class="rfoot">
         ${
           data.weaponGrant
             ? `<div class="rdrop" data-testid="result-weapon-grant">
                  <span class="rtag">NEW GEAR</span><span class="rrule"></span>
                  <span class="ritem">${esc(data.weaponGrant.name)} <i>&mdash; issued to the party</i></span>
                </div>`
             : ""
         }
         <button type="button" class="rgo" data-testid="result-action">${esc(actionLabel)}</button>
       </div>`
    : `<p class="rmsg" data-testid="result-message">${esc(DEFEAT_COPY.message)}</p>
       <p class="rreward" data-testid="result-reward-summary">${esc(DEFEAT_COPY.rewardSummary)}</p>
       <p class="rretain" data-testid="result-retention">${esc(DEFEAT_COPY.retention)}</p>
       <div class="rfoot rfoot-centered">
         <button type="button" class="rgo" data-testid="result-action">${esc(actionLabel)}</button>
       </div>`;

  return `
    <div class="tuh-result${victory ? "" : " defeat"}" data-testid="result-overlay" data-verdict="${data.verdict}">
      <div class="rsheet">
        <div class="rverdict" data-testid="result-verdict">${data.verdict}</div>
        <div class="rleaf">
          <p class="rwhere" data-testid="result-where">${where}</p>
          ${party}
          ${foot}
        </div>
      </div>
    </div>`;
}
