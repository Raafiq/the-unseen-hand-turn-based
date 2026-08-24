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
    // LAYERING (ADR-0007, root CLAUDE.md): render imports sim, never the reverse.
    // Locked from the start and enforced by nothing — a scoped plan put the synthetic
    // playtest harness in `src/sim`, driving `CampaignShell` and `PrepModel`, which both
    // live in `src/render`. It was caught by reading the code, which is exactly the check
    // that does not run on every commit.
    //
    // Tests are INCLUDED here, unlike the determinism block above: a sim test reaching
    // into the viewer drags the dependency in through the type graph just as effectively.
    files: ["src/sim/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/render/*", "**/render/**"],
              message:
                "Sim is pure and headless (ADR-0007): src/sim must not import from src/render. " +
                "If the code needs a viewer class, the code belongs in src/render.",
            },
          ],
        },
      ],
    },
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
