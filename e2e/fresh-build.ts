import { existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

/**
 * The browser suite serves `dist`. This asserts `dist` was built from the sources on
 * disk right now, and it runs as Playwright's `globalSetup` so **no invocation can skip
 * it**.
 *
 * WHY THIS EXISTS. `npx playwright test` does not rebuild — that trap is already in
 * `docs/NEXT.md`. The variant that actually cost time in this repo is nastier, because
 * it does not look like a build problem at all: **a FAILED `npm run build` leaves the
 * previous `dist` standing.** A typecheck error (one unused constant) meant a run of
 * `contrast.spec.ts` measured the OLD stylesheet and reported ratios that were
 * plausible, wrong, and disagreed with the CSS in the editor — which sent the session
 * off re-deriving colour maths that had never been wrong.
 *
 * WHY IT IS `globalSetup` AND NO LONGER A SPEC. It used to be `fresh-build.spec.ts`,
 * and a spec is only a guard for the runs that load it. Rendering three map variants
 * with `npx playwright test e2e/playtest-capture.spec.ts` loaded exactly one file, so
 * the freshness check never ran, and the session produced three entirely plausible
 * screenshots **of the previous build** (2026-08-30). A guard that a targeted run can
 * step around is not a guard. `globalSetup` runs once per invocation, whatever the file
 * filter, and a throw here aborts before a single browser opens.
 *
 * A stale `dist` is exactly the kind of failure the evidence rules warn about: the
 * suite is green or red for reasons that have nothing to do with the diff, and both
 * verdicts look ordinary. So it is checked mechanically rather than remembered.
 *
 * The check is a timestamp comparison, not a content hash: cheap, and it catches every
 * route in (a failed build, a forgotten build, a hand-edit to a source file mid-run).
 */

/** Sources whose edits must be reflected in `dist` before any browser spec is believed. */
const WATCHED_FILES = ["index.html", "viewer.html", "game.html", "vite.config.ts"];
const WATCHED_DIRS = ["src/render", "src/sim", "data", "public"];
// Images count as source. Without them an edit to a portrait does not invalidate
// `dist`, and the browser suite measures the OLD asset while reporting on the new one.
const CODE = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".html", ".css", ".json", ".woff2",
  ".svg", ".png", ".webp", ".jpg",
]);

/** Newest mtime under a directory tree, recursively. Returns 0 for a missing path. */
export function newestUnder(path: string): { mtime: number; file: string } {
  if (!existsSync(path)) return { mtime: 0, file: "" };
  const st = statSync(path);
  if (!st.isDirectory()) return { mtime: st.mtimeMs, file: path };
  let best = { mtime: 0, file: "" };
  for (const entry of readdirSync(path)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(path, entry);
    const sub = statSync(full).isDirectory()
      ? newestUnder(full)
      : CODE.has(extname(entry))
        ? { mtime: statSync(full).mtimeMs, file: full }
        : { mtime: 0, file: "" };
    if (sub.mtime > best.mtime) best = sub;
  }
  return best;
}

export default function assertFreshBuild(): void {
  const dist = newestUnder("dist");
  if (dist.mtime === 0) {
    throw new Error("dist/ is missing or empty — run `npm run build` (or `npm run test:visual`)");
  }

  let newest = { mtime: 0, file: "" };
  for (const p of [...WATCHED_FILES, ...WATCHED_DIRS]) {
    const found = newestUnder(p);
    if (found.mtime > newest.mtime) newest = found;
  }
  // Guard the guard: a watch list that resolves to nothing would pass on any dist.
  if (newest.mtime === 0) {
    throw new Error("no watched sources found — the watch list in e2e/fresh-build.ts has gone stale");
  }

  if (dist.mtime < newest.mtime) {
    const staleBySeconds = Math.round((newest.mtime - dist.mtime) / 1000);
    throw new Error(
      `dist is ${staleBySeconds}s older than ${newest.file}. The browser suite is about to ` +
        "measure the PREVIOUS build — which is what a failed `npm run build` leaves behind. " +
        "Run `npm run test:visual` (build + test) instead of `npx playwright test`.",
    );
  }
}
