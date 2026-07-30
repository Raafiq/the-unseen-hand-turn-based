import { defineConfig } from "vitest/config";

// The sim core is pure and headless (docs/05 §3): tests run in a plain Node
// environment with no DOM. The render/ layer will add its own config later.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["src/sim/**/*.ts"],
      exclude: ["src/**/*.{test,spec}.ts"],
    },
  },
});
