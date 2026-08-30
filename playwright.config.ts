import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Visual tests for the engine viewer: drive the real app in Chromium, capture
// screenshots at each milestone, and record video of the run.
//
// Browser resolution: prefer the pre-installed browser (PW_CHROMIUM, or this
// environment's /opt/pw-browsers). On a CI runner where neither exists, fall
// back to Playwright's own managed browser (installed via `playwright install`).
const PRESET = process.env["PW_CHROMIUM"] ?? "/opt/pw-browsers/chromium";
const CHROMIUM = existsSync(PRESET) ? PRESET : undefined;
const PORT = 4173;

export default defineConfig({
  // Runs once per invocation, BEFORE any browser opens and whatever file filter was
  // passed. It used to be a spec, and a spec only guards the runs that load it —
  // `npx playwright test one.spec.ts` stepped straight around it and captured three
  // screenshots of the previous build. See the module for the full account.
  globalSetup: "./e2e/fresh-build.ts",
  testDir: "e2e",
  outputDir: "visual-artifacts/pw",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true,
    viewport: { width: 1000, height: 780 },
    video: "on",
    ...(CHROMIUM ? { launchOptions: { executablePath: CHROMIUM } } : {}),
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run preview",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
