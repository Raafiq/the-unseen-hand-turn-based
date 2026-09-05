#!/usr/bin/env node
/**
 * A COUNT IN PROSE THAT NOTHING DERIVES GOES STALE, AND NOTHING GOES RED.
 *
 * `CLAUDE.md`, `README.md` and `docs/NEXT.md` each state how many tests this repo has.
 * The number went wrong twice in two commits — 809 → 884 while the real figure was 884,
 * then 884 while it was 886 — and both times it was caught by a human happening to look,
 * not by a check. `docs/` outranks the code here, so a wrong count is a wrong instruction
 * with a green suite behind it.
 *
 * WHY IT IS SAFE TO GREP FOR. Six files legitimately carry DATED evidence claims —
 * "shipped past 720 green tests", "with 851 tests green", "880 unit tests green" — about
 * specific past defects. Correcting those would falsify the record, and a naive guard
 * that flagged them would be disabled within a week. The live claims all use one distinct
 * shape, a comma joining both counts:
 *
 *     886 tests, 43 browser specs
 *     886 unit tests, 43 browser specs
 *
 * and no dated claim does. That is the anchor. Whitespace is normalised first because the
 * handoff's copy wraps mid-phrase.
 *
 * THE NON-DEGENERACY HALF IS LOAD-BEARING. A guard that only checks the numbers it finds
 * passes vacuously the day someone rewords every site — which is exactly how it would
 * die. It therefore asserts it found at least `MIN_SITES` of them, and that both real
 * counts are non-zero.
 */

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

/** Where the vitest run leaves its machine-readable summary (see `npm run test`). */
const SUMMARY = "coverage/vitest-summary.json";

/**
 * Files scanned for a live count. Not a whitelist of who MAY carry one — the pattern is
 * matched wherever it appears — but the list whose absence is itself a failure.
 */
const WATCHED = ["CLAUDE.md", "README.md", "docs/NEXT.md"];

/** Fewer live claims than this means the phrasing drifted and the guard stopped guarding. */
const MIN_SITES = 3;

/** The live shape, and only the live shape. Dated evidence claims never join both counts. */
const LIVE = /(\d+) (?:unit )?tests, (\d+) browser specs/g;

function fail(message) {
  console.error(`\n❌ check:counts: ${message}\n`);
  process.exit(1);
}

// ── the real numbers ────────────────────────────────────────────────────────
if (!existsSync(SUMMARY)) {
  fail(
    `${SUMMARY} is missing. It is written by \`npm run test\`, which \`npm run check\` ` +
      `runs first — run the suite before this guard.`,
  );
}

let unitTests;
try {
  unitTests = JSON.parse(readFileSync(SUMMARY, "utf8")).numTotalTests;
} catch (error) {
  fail(`could not read ${SUMMARY}: ${String(error)}`);
}

let browserSpecs;
try {
  // `--list` enumerates without launching a browser and without running globalSetup, so
  // this costs a second and cannot fail on a stale `dist`.
  // On Windows `npx` is a .cmd shim, which execFileSync cannot spawn without a shell.
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const listed = execFileSync(npx, ["playwright", "test", "--list"], {
    shell: process.platform === "win32",
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  browserSpecs = Number(/Total: (\d+) tests?/.exec(listed)?.[1]);
} catch (error) {
  fail(`could not list the browser specs: ${String(error)}`);
}

// Guard the guard: a zero on either side would make every comparison below vacuous.
if (!Number.isInteger(unitTests) || unitTests <= 0) {
  fail(`the unit-test total came back as ${String(unitTests)} — the summary shape changed`);
}
if (!Number.isInteger(browserSpecs) || browserSpecs <= 0) {
  fail(`the browser-spec total came back as ${String(browserSpecs)} — parse the list output`);
}

// ── every live claim, wherever it is written ────────────────────────────────
const wrong = [];
let sites = 0;

for (const file of WATCHED) {
  if (!existsSync(file)) fail(`${file} is watched for a count and does not exist`);
  const text = readFileSync(file, "utf8").replace(/\s+/g, " ");
  for (const [claim, claimedUnit, claimedBrowser] of text.matchAll(LIVE)) {
    sites++;
    if (Number(claimedUnit) !== unitTests || Number(claimedBrowser) !== browserSpecs) {
      wrong.push(`${file}: says "${claim}"`);
    }
  }
}

if (sites < MIN_SITES) {
  fail(
    `found only ${sites} live count claim(s) across ${WATCHED.join(", ")}, expected at ` +
      `least ${MIN_SITES}. Either a status line lost its counts, or the phrasing drifted ` +
      `away from "N tests, M browser specs" and this guard has stopped guarding. Fix the ` +
      `prose or update LIVE in scripts/check-counts.mjs — do not lower MIN_SITES.`,
  );
}

if (wrong.length > 0) {
  fail(
    `the real counts are ${unitTests} tests, ${browserSpecs} browser specs. Stale:\n` +
      wrong.map((w) => `   · ${w}`).join("\n") +
      `\n\n   DATED claims ("shipped past 720 green tests") are deliberately not matched ` +
      `and must not be "corrected" — they are evidence about a past defect.`,
  );
}

console.log(
  `✅ check:counts: ${sites} live claim(s) agree — ${unitTests} tests, ${browserSpecs} browser specs.`,
);
