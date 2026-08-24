/**
 * The synthetic playtest, as a table (`docs/plans/slice-m1-synthetic-playtest.md`, A4).
 *
 *   npx vite-node scripts/playtest.mts [seedOffsets...]
 *
 * Runs every persona over the shipped campaign at each seed offset and prints what the
 * run looked like. Offset 0 IS the shipped campaign; the others are stated distances
 * from it. Defaults to eight offsets.
 *
 * WHAT THIS CAN AND CANNOT SAY. It settles RELATIVE difficulty and a length proxy —
 * battle 3 against battle 1, an engaged player against one who never opens the prep
 * screen. It does not settle absolute difficulty ("60% of humans would win this"),
 * legibility, or fun. The probe plays the PLAYER's units too, so a persona reaches the
 * outcome only through the BUILD, never through better positioning.
 */

import { ENCOUNTERS, campaign, registry } from "../src/render/campaign-data.js";
import { PERSONAS, runPlaytest, type PlaytestReport } from "../src/render/playtest.js";

const offsets = process.argv.slice(2).map(Number);
const OFFSETS = offsets.length > 0 && offsets.every((n) => Number.isFinite(n))
  ? offsets
  : [0, 1, 2, 3, 5, 8, 13, 21];

const pad = (s: string | number, n: number): string => String(s).padStart(n);
const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

const runs = new Map<string, PlaytestReport[]>();
for (const persona of PERSONAS) {
  runs.set(
    persona.id,
    OFFSETS.map((seedOffset) =>
      runPlaytest({ persona, def: campaign, encounters: ENCOUNTERS, registry, seedOffset }),
    ),
  );
}

console.log(`\ncampaign "${campaign.id}" — ${campaign.battles.length} battles, ${OFFSETS.length} seeds\n`);

console.log("PER PERSONA (mean over seeds)");
console.log("persona    cleared   decisions   turns   AP unspent   slots filled");
for (const persona of PERSONAS) {
  const rs = runs.get(persona.id) ?? [];
  const cleared = rs.filter((r) => r.ending === "completed").length;
  const turns = mean(rs.flatMap((r) => r.battles.map((b) => b.turns)));
  const slots = mean(rs.flatMap((r) => r.party.map((m) => m.slotsFilled)));
  console.log(
    `${persona.id.padEnd(11)}${pad(`${cleared}/${rs.length}`, 7)}` +
      `${pad(mean(rs.map((r) => r.decisions)).toFixed(1), 12)}` +
      `${pad(turns.toFixed(1), 8)}${pad(mean(rs.map((r) => r.apUnspent)).toFixed(0), 13)}` +
      `${pad(slots.toFixed(2), 15)}`,
  );
}

console.log("\nDIFFICULTY CURVE (mean over seeds; HP = the player team's share of max HP at the end)");
console.log("battle   " + PERSONAS.map((p) => `${p.id} turns / HP`.padStart(22)).join(""));
for (let i = 0; i < campaign.battles.length; i += 1) {
  const cells = PERSONAS.map((p) => {
    const rows = (runs.get(p.id) ?? []).map((r) => r.battles[i]).filter((b) => b !== undefined);
    const t = mean(rows.map((b) => b!.turns)).toFixed(1);
    const hp = mean(rows.map((b) => b!.playerHpFraction));
    return `${t} / ${(hp * 100).toFixed(0)}%`.padStart(22);
  });
  console.log(pad(i + 1, 6) + "   " + cells.join(""));
}

console.log("\nOUTCOMES BY SEED");
console.log("persona    " + OFFSETS.map((o) => pad(`+${o}`, 8)).join(""));
for (const persona of PERSONAS) {
  const cells = (runs.get(persona.id) ?? []).map((r) =>
    pad(r.ending === "completed" ? "win" : `${r.ending}@${r.battles.length}`, 8),
  );
  console.log(persona.id.padEnd(11) + cells.join(""));
}

const everyRun = [...runs.values()].flat();
const stalls = everyRun.filter((r) => r.ending !== "completed");
console.log(
  `\n${everyRun.length - stalls.length} of ${everyRun.length} runs cleared the campaign.` +
    (stalls.length === 0
      ? " No run stopped anywhere — including the persona that never opens the prep screen."
      : ` Stopped: ${stalls.map((r) => `${r.persona}@${r.battles.length}`).join(", ")}.`),
);
console.log(
  "Relative difficulty and a length proxy only. Not absolute difficulty, not legibility,\n" +
    "not fun. Decision counts are not minutes — no seconds-per-decision constant is measured.\n",
);
