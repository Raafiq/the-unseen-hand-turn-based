import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Determinism guard (docs/05 §3, ADR-0004, sim-determinism-guard skill):
// no unseeded randomness or wall-clock anywhere in the sim layer. This is the
// static half of the invariant; the replay-equality harness is the dynamic half.
const DETERMINISM_RULES = {
  "no-restricted-properties": [
    "error",
    { object: "Math", property: "random", message: "Sim is deterministic: draw from the seeded PRNG (src/sim/rng.ts), never Math.random." },
    { object: "Date", property: "now", message: "No wall-clock in sim code (docs/05 §3). Time is the CT clock in BattleState." },
    { object: "performance", property: "now", message: "No wall-clock in sim code (docs/05 §3)." },
    { object: "crypto", property: "getRandomValues", message: "Sim randomness must flow through the seeded PRNG (src/sim/rng.ts)." },
  ],
  "no-restricted-globals": [
    "error",
    { name: "Date", message: "No wall-clock in sim code (docs/05 §3). Use the CT clock in BattleState." },
  ],
  "no-restricted-syntax": [
    "error",
    { selector: "NewExpression[callee.name='Date']", message: "No wall-clock in sim code (docs/05 §3)." },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "node_modules/**",
      "visual-artifacts/**",
      "test-results/**",
      "playwright-report/**",
      // Owner-local, git-ignored tooling (Markdown Preview Enhanced setup); not project code.
      ".crossnote/**",
      "mpe-setup/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Enforce the determinism invariant only in the pure sim layer, and not in
    // its tests (tests may legitimately use timers/fixtures).
    files: ["src/sim/**/*.ts"],
    ignores: ["src/sim/**/*.{test,spec}.ts"],
    rules: DETERMINISM_RULES,
  },
  {
    // Node tooling scripts (ESM): provide Node globals for no-undef.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: { process: "readonly", console: "readonly" },
    },
  },
);
