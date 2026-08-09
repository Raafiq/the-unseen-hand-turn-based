import { defineConfig } from "vitest/config";

// The sim core is pure and headless (docs/05 §3): tests run in a plain Node
// environment with no DOM. The render/ layer will add its own config later.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    // The diversity-gate tests run FULL gauntlets — the determinism case alone
    // executes two complete runs and lands around 2.7s on an idle machine, i.e.
    // ~55% of vitest's 5s default. That margin is not enough: under CPU
    // contention the suite has been observed running ~2.4x slower, which pushes
    // that single test past 5s and reds the build for a reason that has nothing
    // to do with the code. Seen once here on a loaded box, then six consecutive
    // clean runs — the classic shape of a load-dependent timeout rather than a
    // logic flake. These tests are compute-bound and deterministic, so a
    // generous ceiling costs nothing and removes a spurious-failure class.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/sim/**/*.ts"],
      exclude: ["src/**/*.{test,spec}.ts"],
    },
  },
});
