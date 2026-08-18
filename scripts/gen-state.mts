/**
 * GENERATED "State of the Engine" dashboard → `state/index.html`.
 *
 * WHY THIS EXISTS: a hand-edited status page rots. This generator derives every number
 * on the page from the repo's ACTUAL state — content counts from `data/`, doc/module
 * counts from the filesystem, and the diversity-gate matrix from a LIVE run of the real
 * gauntlet (`src/sim/gauntlet.ts`, exactly as `gauntlet.test.ts` loads it). The output is
 * deterministic (no wall-clock, same bytes in → same bytes out), so CI can regenerate and
 * `git diff --exit-code` to fail the build if the committed page drifted from reality.
 *
 * HOW TO UPDATE:
 *   - Numbers / the gate matrix: change nothing here — edit the data/code, run `npm run state`.
 *   - Prose (phase, roadmap, section leads, "what's next"): edit `scripts/state-content.ts`,
 *     then run `npm run state`.
 *
 * RUN: `npm run state` (⇒ `npx vite-node scripts/gen-state.mts`). Node 22.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadContentPack } from "../src/sim/content.js";
import { deserializeRecord, type UnitRecord } from "../src/sim/roster.js";
import { parseEncounter } from "../src/sim/encounter.js";
import {
  runGauntlet,
  computeDiversityReport,
  inBand,
  DEFAULT_BAND,
  OPPOSITIONS,
  type GauntletMap,
} from "../src/sim/gauntlet.js";
import { content } from "./state-content.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

// ── small text helpers ──────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function interpolate(s: string, tokens: Readonly<Record<string, string>>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in tokens ? tokens[k]! : m));
}
function countInFiles(dir: string, files: readonly string[], re: RegExp): number {
  let n = 0;
  for (const f of files) {
    const matches = readFileSync(`${dir}${f}`, "utf8").match(re);
    n += matches ? matches.length : 0;
  }
  return n;
}

// ── 1. content-pack counts (data/base-pack.json) ────────────────────────────
interface RawPack {
  jobs: unknown[];
  statuses: unknown[];
  traits: unknown[];
  abilities: { id: string; skillset?: string }[];
}
const packRaw = readFileSync(`${ROOT}data/base-pack.json`, "utf8");
const pack = JSON.parse(packRaw) as RawPack;
loadContentPack(JSON.parse(packRaw)); // validate the pack the same way the sim does

// per-skillset ability breakdown, in first-seen (JSON) order — deterministic.
const skillsetCounts = new Map<string, number>();
for (const a of pack.abilities) {
  const set = a.skillset ?? (a.id.includes(".") ? a.id.split(".")[0]! : a.id);
  skillsetCounts.set(set, (skillsetCounts.get(set) ?? 0) + 1);
}
const skillsetBreakdown = [...skillsetCounts].map(([set, n]) => `${set} ${n}`).join(" · ");

// ── 1b. filesystem counts ───────────────────────────────────────────────────
const jsonIn = (dir: string): string[] => readdirSync(dir).filter((f) => f.endsWith(".json"));
const buildFiles = jsonIn(`${ROOT}data/builds`);
const encounterFiles = jsonIn(`${ROOT}data/encounters`);
const adrFiles = readdirSync(`${ROOT}docs/adr`).filter((f) => f.endsWith(".md") && !/readme/i.test(f));
const simFiles = readdirSync(`${ROOT}src/sim`).filter((f) => f.endsWith(".ts"));
const specFiles = simFiles.filter((f) => f.endsWith(".test.ts"));
const simModules = simFiles.filter((f) => !f.endsWith(".test.ts"));
const testCases = countInFiles(`${ROOT}src/sim/`, specFiles, /\b(?:it|test)\s*\(/g);

const counts = {
  jobs: pack.jobs.length,
  abilities: pack.abilities.length,
  statuses: pack.statuses.length,
  traits: pack.traits.length,
  builds: buildFiles.length,
  encounters: encounterFiles.length,
  adrs: adrFiles.length,
  simModules: simModules.length,
  specFiles: specFiles.length,
  tests: testCases,
};

// ── 2. LIVE diversity gate (loaded exactly like gauntlet.test.ts) ────────────
const registry = loadContentPack(JSON.parse(packRaw));
const records: Record<string, UnitRecord> = {};
for (const f of buildFiles) {
  const rec = deserializeRecord(readFileSync(`${ROOT}data/builds/${f}`, "utf8"));
  records[rec.id] = rec;
}
const MAP_IDS = [
  "skirmish-a",
  "enc-the-breach",
  "enc-behead-the-warlord",
  "enc-the-high-ground",
  "enc-mixed-company",
  "enc-the-long-march",
] as const;
const maps: GauntletMap[] = MAP_IDS.map((id) => ({
  id,
  encounter: parseEncounter(JSON.parse(readFileSync(`${ROOT}data/encounters/${id}.json`, "utf8"))),
}));

const runs = runGauntlet({ resolver: { registry, records }, maps });
const report = computeDiversityReport(runs);

// per-build × per-opposition in-band map counts, folded from the raw runs (the gate's
// own `inBand` + band) — the matrix cells self-update when builds/gate change.
const perOpp = new Map<string, Map<string, number>>();
for (const r of runs) {
  if (!inBand(r, DEFAULT_BAND)) continue;
  let m = perOpp.get(r.buildId);
  if (!m) {
    m = new Map();
    perOpp.set(r.buildId, m);
  }
  m.set(r.oppositionId, (m.get(r.oppositionId) ?? 0) + 1);
}
const oppCount = (buildId: string, oppId: string): number => perOpp.get(buildId)?.get(oppId) ?? 0;

const mapCount = report.mapCount;
const viableMin = report.band.viableMin;

// Matrix rows: measurable identities first, then by in-band strength per axis, then id —
// built by FOLDING the real report so the table rebuilds itself as builds/gate change.
const rows = [...report.perBuild].sort((a, b) => {
  if (a.measurableIdentity !== b.measurableIdentity) return a.measurableIdentity ? -1 : 1;
  for (const o of OPPOSITIONS) {
    const d = oppCount(b.buildId, o.id) - oppCount(a.buildId, o.id);
    if (d !== 0) return d;
  }
  return a.buildId.localeCompare(b.buildId);
});

// ── 3. token substitution table for the prose ───────────────────────────────
const tokens: Readonly<Record<string, string>> = {
  jobs: String(counts.jobs),
  abilities: String(counts.abilities),
  statuses: String(counts.statuses),
  traits: String(counts.traits),
  builds: String(counts.builds),
  encounters: String(counts.encounters),
  maps: String(counts.encounters),
  adrs: String(counts.adrs),
  modules: String(counts.simModules),
  specFiles: String(counts.specFiles),
  tests: String(counts.tests),
  skillsets: skillsetBreakdown,
};
const ip = (s: string): string => interpolate(s, tokens);

// ── static visual constants (ported verbatim from the design template) ───────
const STYLE = String.raw`
  :root {
    /* cool steel ground + warm amber (AP / job-crystal) signature */
    --ground: #e7ebf0;
    --surface: #ffffff;
    --surface-2: #f2f5f9;
    --ink: #16202f;
    --ink-soft: #51607a;
    --ink-faint: #7c8aa3;
    --line: #d0d8e2;
    --line-soft: #e0e6ee;
    --accent: #9a6410;      /* amber, text-safe on light */
    --accent-fill: #c98a2a;
    --accent-wash: #f6ecd8;
    --ok: #1f7a4d;
    --ok-wash: #dcefe4;
    --warn: #9a6a12;
    --warn-wash: #f5ead2;
    --crit: #b23b3b;
    --crit-wash: #f6dede;
    --plan: #3a6ea8;
    --plan-wash: #e2ebf5;
    --grid-line: rgba(90,110,140,.14);
    --shadow: 0 1px 2px rgba(20,30,50,.06), 0 8px 24px -12px rgba(20,30,50,.18);
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    --font-mono: ui-monospace, "JetBrains Mono", "SF Mono", "Cascadia Code", Menlo, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #0d131e;
      --surface: #161f2d;
      --surface-2: #1b2634;
      --ink: #e8eef6;
      --ink-soft: #9fb0c8;
      --ink-faint: #6b7c96;
      --line: #27303f;
      --line-soft: #202a38;
      --accent: #e6b24d;
      --accent-fill: #d99f38;
      --accent-wash: #2a2213;
      --ok: #4fbe86;
      --ok-wash: #14281f;
      --warn: #e0b24a;
      --warn-wash: #2a2313;
      --crit: #f08a8a;
      --crit-wash: #2c1717;
      --plan: #6ba6e6;
      --plan-wash: #16222f;
      --grid-line: rgba(150,175,210,.10);
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px -14px rgba(0,0,0,.6);
    }
  }
  :root[data-theme="light"] {
    --ground: #e7ebf0; --surface: #ffffff; --surface-2: #f2f5f9; --ink: #16202f;
    --ink-soft: #51607a; --ink-faint: #7c8aa3; --line: #d0d8e2; --line-soft: #e0e6ee;
    --accent: #9a6410; --accent-fill: #c98a2a; --accent-wash: #f6ecd8;
    --ok: #1f7a4d; --ok-wash: #dcefe4; --warn: #9a6a12; --warn-wash: #f5ead2;
    --crit: #b23b3b; --crit-wash: #f6dede; --plan: #3a6ea8; --plan-wash: #e2ebf5;
    --grid-line: rgba(90,110,140,.14);
    --shadow: 0 1px 2px rgba(20,30,50,.06), 0 8px 24px -12px rgba(20,30,50,.18);
  }
  :root[data-theme="dark"] {
    --ground: #0d131e; --surface: #161f2d; --surface-2: #1b2634; --ink: #e8eef6;
    --ink-soft: #9fb0c8; --ink-faint: #6b7c96; --line: #27303f; --line-soft: #202a38;
    --accent: #e6b24d; --accent-fill: #d99f38; --accent-wash: #2a2213;
    --ok: #4fbe86; --ok-wash: #14281f; --warn: #e0b24a; --warn-wash: #2a2313;
    --crit: #f08a8a; --crit-wash: #2c1717; --plan: #6ba6e6; --plan-wash: #16222f;
    --grid-line: rgba(150,175,210,.10);
    --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px -14px rgba(0,0,0,.6);
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--ground); color: var(--ink);
    font-family: var(--font-sans); line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    background-image:
      linear-gradient(var(--grid-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
    background-size: 34px 34px;
    background-position: center top;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px 96px; }

  .eyebrow {
    font-family: var(--font-mono); font-size: 11.5px; letter-spacing: .22em;
    text-transform: uppercase; color: var(--accent); font-weight: 600;
  }
  h1, h2, h3 { text-wrap: balance; line-height: 1.15; letter-spacing: -.01em; }
  a { color: var(--accent); }
  .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  /* ── hero ── */
  .hero {
    padding: 68px 0 40px; border-bottom: 1px solid var(--line);
    display: grid; grid-template-columns: 1.35fr 1fr; gap: 40px; align-items: center;
  }
  .hero h1 { font-size: clamp(34px, 5vw, 54px); margin: 14px 0 12px; font-weight: 800; }
  .hero .lede { font-size: 17px; color: var(--ink-soft); margin: 0 0 22px; max-width: 46ch; }
  .statusline { display: flex; flex-wrap: wrap; gap: 8px; }
  .hero-art {
    background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
    box-shadow: var(--shadow); padding: 18px; overflow: hidden;
  }
  .hero-art svg { display: block; width: 100%; height: auto; }
  .hero-art .cap {
    font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .1em;
    text-transform: uppercase; color: var(--ink-faint); margin-top: 10px; text-align: center;
  }

  /* ── pills / chips ── */
  .pill {
    display: inline-flex; align-items: center; gap: 6px; font-family: var(--font-mono);
    font-size: 11.5px; letter-spacing: .04em; padding: 4px 10px; border-radius: 999px;
    border: 1px solid var(--line); background: var(--surface-2); color: var(--ink-soft);
    white-space: nowrap;
  }
  .pill .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
  .pill.ok { color: var(--ok); background: var(--ok-wash); border-color: transparent; }
  .pill.warn { color: var(--warn); background: var(--warn-wash); border-color: transparent; }
  .pill.crit { color: var(--crit); background: var(--crit-wash); border-color: transparent; }
  .pill.plan { color: var(--plan); background: var(--plan-wash); border-color: transparent; }
  .pill.accent { color: var(--accent); background: var(--accent-wash); border-color: transparent; }

  /* ── KPI row ── */
  .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin: 30px 0 0; }
  .kpi {
    background: var(--surface); border: 1px solid var(--line); border-radius: 11px;
    padding: 14px 14px 12px; box-shadow: var(--shadow);
  }
  .kpi .n { font-family: var(--font-mono); font-size: 26px; font-weight: 700; letter-spacing: -.02em; }
  .kpi .k { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-faint); margin-top: 2px; }

  /* ── sections ── */
  section { margin-top: 64px; }
  .sec-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 22px; border-bottom: 1px solid var(--line-soft); padding-bottom: 12px; }
  .sec-head h2 { font-size: 23px; margin: 0; font-weight: 750; }
  .sec-head .idx { font-family: var(--font-mono); font-size: 12px; color: var(--ink-faint); letter-spacing: .1em; }
  .lead { color: var(--ink-soft); max-width: 66ch; }

  .card {
    background: var(--surface); border: 1px solid var(--line); border-radius: 13px;
    box-shadow: var(--shadow);
  }

  /* systems board */
  .board { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .sys { padding: 18px 18px 16px; }
  .sys .top { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 8px; }
  .sys h3 { font-size: 15.5px; margin: 0; }
  .sys p { margin: 0; color: var(--ink-soft); font-size: 14px; }
  .sys .detail { margin-top: 10px; font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-faint); letter-spacing: .02em; }

  /* architecture diagram */
  .arch { padding: 22px; }
  .arch svg { display: block; width: 100%; height: auto; }

  /* content inventory */
  .inv { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .inv .cell { padding: 16px 18px; }
  .inv .cell .n { font-family: var(--font-mono); font-size: 22px; font-weight: 700; }
  .inv .cell .k { font-size: 13.5px; color: var(--ink-soft); }
  .inv .cell .sub { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); margin-top: 6px; letter-spacing: .02em; }

  /* matchup matrix */
  .matrix-shell { overflow-x: auto; }
  table.matrix { border-collapse: collapse; width: 100%; min-width: 620px; font-size: 13.5px; }
  table.matrix th, table.matrix td { padding: 11px 12px; text-align: left; border-bottom: 1px solid var(--line-soft); }
  table.matrix thead th {
    font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .11em; text-transform: uppercase;
    color: var(--ink-faint); font-weight: 600; border-bottom: 1px solid var(--line);
  }
  table.matrix .build { font-weight: 600; }
  table.matrix .sig { font-family: var(--font-mono); font-size: 11px; color: var(--ink-faint); }
  .cellval {
    display: inline-flex; align-items: center; justify-content: center; gap: 0;
    font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 700;
    width: 46px; height: 30px; border-radius: 7px; font-size: 13px;
  }
  .cellval.viable { background: var(--ok-wash); color: var(--ok); }
  .cellval.fold { background: var(--crit-wash); color: var(--crit); }
  .muted-row td { opacity: .62; }
  .verdict {
    display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center;
    padding: 16px 20px; margin-top: 0; border-top: 1px solid var(--line);
    font-family: var(--font-mono); font-size: 12.5px;
  }
  .verdict b { color: var(--ink); }

  /* roadmap timeline */
  .road { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; position: relative; }
  .phase { padding: 16px 14px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); position: relative; }
  .phase.done { border-color: transparent; background: var(--ok-wash); }
  .phase.active { border-color: var(--accent-fill); box-shadow: 0 0 0 1px var(--accent-fill), var(--shadow); }
  .phase.next { background: var(--surface); }
  .phase .p { font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; color: var(--ink-faint); }
  .phase h4 { margin: 4px 0 6px; font-size: 14px; }
  .phase p { margin: 0; font-size: 12.5px; color: var(--ink-soft); }
  .phase .tag { margin-top: 10px; }

  /* next steps */
  .next { display: grid; gap: 12px; }
  .opt { padding: 16px 18px; display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: start; }
  .opt .rank { font-family: var(--font-mono); font-size: 12px; color: var(--ink-faint); padding-top: 2px; }
  .opt h3 { margin: 0 0 4px; font-size: 15.5px; }
  .opt p { margin: 0; font-size: 13.5px; color: var(--ink-soft); }
  .opt.rec { border-color: var(--accent-fill); box-shadow: 0 0 0 1px var(--accent-fill), var(--shadow); }

  .foot { margin-top: 60px; padding-top: 20px; border-top: 1px solid var(--line); font-family: var(--font-mono); font-size: 11.5px; color: var(--ink-faint); letter-spacing: .03em; display: flex; flex-wrap: wrap; gap: 6px 18px; }

  .fade { opacity: 0; transform: translateY(10px); animation: rise .6s cubic-bezier(.2,.7,.2,1) forwards; }
  .fade:nth-child(2){animation-delay:.05s}.fade:nth-child(3){animation-delay:.1s}
  @keyframes rise { to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .fade { animation: none; opacity: 1; transform: none; } }

  @media (max-width: 860px) {
    .hero { grid-template-columns: 1fr; gap: 28px; }
    .kpis { grid-template-columns: repeat(3, 1fr); }
    .board, .inv { grid-template-columns: 1fr; }
    .road { grid-template-columns: 1fr 1fr; }
    .opt { grid-template-columns: auto 1fr; }
  }
  @media (max-width: 480px) { .kpis { grid-template-columns: repeat(2,1fr); } .road { grid-template-columns: 1fr; } }
`;

const HERO_SVG = String.raw`
      <svg viewBox="0 0 340 210" role="img" aria-label="Isometric tactics grid with two opposing units and a highlighted move range">
        <defs>
          <linearGradient id="tileA" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--surface-2)"/><stop offset="1" stop-color="var(--ground)"/>
          </linearGradient>
        </defs>
        <g stroke="var(--line)" stroke-width="1.2" fill="url(#tileA)">
          <polygon points="170,40 197,53.5 170,67 143,53.5"/>
          <polygon points="197,53.5 224,67 197,80.5 170,67"/>
          <polygon points="224,67 251,80.5 224,94 197,80.5"/>
          <polygon points="251,80.5 278,94 251,107.5 224,94"/>
          <polygon points="143,53.5 170,67 143,80.5 116,67"/>
          <polygon points="170,67 197,80.5 170,94 143,80.5"/>
          <polygon points="197,80.5 224,94 197,107.5 170,94" fill="var(--accent-wash)"/>
          <polygon points="224,94 251,107.5 224,121 197,107.5" fill="var(--accent-wash)"/>
          <polygon points="116,67 143,80.5 116,94 89,80.5"/>
          <polygon points="143,80.5 170,94 143,107.5 116,94" fill="var(--accent-wash)"/>
          <polygon points="170,94 197,107.5 170,121 143,107.5" fill="var(--accent-wash)"/>
          <polygon points="197,107.5 224,121 197,134.5 170,121"/>
          <polygon points="89,80.5 116,94 89,107.5 62,94"/>
          <polygon points="116,94 143,107.5 116,121 89,107.5"/>
          <polygon points="143,107.5 170,121 143,134.5 116,121"/>
          <polygon points="170,121 197,134.5 170,148 143,134.5"/>
        </g>
        <g>
          <ellipse cx="143" cy="90" rx="13" ry="7" fill="rgba(0,0,0,.14)"/>
          <circle cx="143" cy="80" r="11" fill="var(--accent-fill)" stroke="var(--surface)" stroke-width="2"/>
          <circle cx="149" cy="76" r="2.4" fill="var(--surface)"/>
          <rect x="132" y="63" width="22" height="3.4" rx="1.7" fill="var(--ok)"/>
        </g>
        <g>
          <ellipse cx="224" cy="104" rx="13" ry="7" fill="rgba(0,0,0,.14)"/>
          <circle cx="224" cy="94" r="11" fill="var(--plan)" stroke="var(--surface)" stroke-width="2"/>
          <circle cx="218" cy="90" r="2.4" fill="var(--surface)"/>
          <rect x="213" y="77" width="22" height="3.4" rx="1.7" fill="var(--ok)"/>
        </g>
      </svg>`;

const ARCH_SVG = String.raw`
      <svg viewBox="0 0 900 250" role="img" aria-label="Layered architecture: data feeds the pure sim core, which the render layer consumes one-directionally">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-faint)"/>
          </marker>
        </defs>
        <g>
          <rect x="20" y="30" width="200" height="190" rx="12" fill="var(--surface-2)" stroke="var(--line)"/>
          <text x="120" y="58" text-anchor="middle" font-family="var(--font-mono)" font-size="12" letter-spacing="1.5" fill="var(--accent)">DATA</text>
          <text x="120" y="80" text-anchor="middle" font-family="var(--font-sans)" font-size="13" font-weight="700" fill="var(--ink)">Content pack</text>
          <text x="120" y="104" text-anchor="middle" font-family="var(--font-mono)" font-size="11" fill="var(--ink-soft)">jobs · abilities</text>
          <text x="120" y="122" text-anchor="middle" font-family="var(--font-mono)" font-size="11" fill="var(--ink-soft)">statuses · traits</text>
          <text x="120" y="140" text-anchor="middle" font-family="var(--font-mono)" font-size="11" fill="var(--ink-soft)">builds · encounters</text>
          <text x="120" y="176" text-anchor="middle" font-family="var(--font-sans)" font-size="11.5" fill="var(--ink-faint)">Zod-validated</text>
          <text x="120" y="193" text-anchor="middle" font-family="var(--font-sans)" font-size="11.5" fill="var(--ink-faint)">versioned codec</text>
        </g>
        <g>
          <rect x="300" y="20" width="300" height="210" rx="12" fill="var(--accent-wash)" stroke="var(--accent-fill)" stroke-width="1.5"/>
          <text x="450" y="48" text-anchor="middle" font-family="var(--font-mono)" font-size="12" letter-spacing="1.5" fill="var(--accent)">SIM CORE · PURE / HEADLESS</text>
          <text x="450" y="74" text-anchor="middle" font-family="var(--font-sans)" font-size="14" font-weight="800" fill="var(--ink)">Deterministic engine</text>
          <g font-family="var(--font-mono)" font-size="11.5" fill="var(--ink-soft)" text-anchor="middle">
            <text x="450" y="102">scheduler · resolve · formulas</text>
            <text x="450" y="122">charge · aoe · status · ai</text>
            <text x="450" y="142">seeded rng → declared roll order</text>
          </g>
          <rect x="330" y="160" width="240" height="46" rx="8" fill="var(--surface)" stroke="var(--line)"/>
          <text x="450" y="180" text-anchor="middle" font-family="var(--font-sans)" font-size="12" font-weight="700" fill="var(--ink)">serializable BattleState</text>
          <text x="450" y="197" text-anchor="middle" font-family="var(--font-mono)" font-size="10.5" fill="var(--ink-faint)">= saves = rewind snapshots</text>
        </g>
        <g>
          <rect x="680" y="30" width="200" height="190" rx="12" fill="var(--surface-2)" stroke="var(--line)"/>
          <text x="780" y="58" text-anchor="middle" font-family="var(--font-mono)" font-size="12" letter-spacing="1.5" fill="var(--plan)">RENDER</text>
          <text x="780" y="80" text-anchor="middle" font-family="var(--font-sans)" font-size="13" font-weight="700" fill="var(--ink)">Thin viewer</text>
          <text x="780" y="104" text-anchor="middle" font-family="var(--font-mono)" font-size="11" fill="var(--ink-soft)">iso renderer</text>
          <text x="780" y="122" text-anchor="middle" font-family="var(--font-mono)" font-size="11" fill="var(--ink-soft)">turn timeline</text>
          <text x="780" y="140" text-anchor="middle" font-family="var(--font-mono)" font-size="11" fill="var(--ink-soft)">step / reset</text>
          <text x="780" y="182" text-anchor="middle" font-family="var(--font-sans)" font-size="11.5" fill="var(--ink-faint)">swappable —</text>
          <text x="780" y="199" text-anchor="middle" font-family="var(--font-sans)" font-size="11.5" fill="var(--ink-faint)">no engine deps</text>
        </g>
        <line x1="222" y1="125" x2="296" y2="125" stroke="var(--ink-faint)" stroke-width="1.6" marker-end="url(#arrow)"/>
        <line x1="602" y1="125" x2="676" y2="125" stroke="var(--ink-faint)" stroke-width="1.6" marker-end="url(#arrow)"/>
        <text x="639" y="115" text-anchor="middle" font-family="var(--font-mono)" font-size="10" fill="var(--ink-faint)">one-way</text>
      </svg>`;

// ── section builders ────────────────────────────────────────────────────────
const kpiValue: Readonly<Record<string, number>> = {
  jobs: counts.jobs,
  abilities: counts.abilities,
  traitsStatus: counts.traits + counts.statuses,
  builds: counts.builds,
  encounters: counts.encounters,
  adrs: counts.adrs,
};
const kpisHtml = content.kpis
  .map((k) => `    <div class="kpi fade"><div class="n">${kpiValue[k.key] ?? 0}</div><div class="k">${k.label}</div></div>`)
  .join("\n");

// The pill states only what THIS generator actually verified — it loaded the real
// content + ran the live gauntlet through the engine, so a pass/fail of the gate is
// first-hand. It deliberately does NOT assert a passing-test count (the generator
// does not run vitest); the exact spec-file count is surfaced in the footer instead.
const enginePill = report.pass
  ? `<span class="pill ok"><span class="dot"></span>ENGINE GREEN · GATE PASSES</span>`
  : `<span class="pill crit"><span class="dot"></span>GATE REGRESSED</span>`;

const systemsHtml = content.systems
  .map((c) => {
    const sig = c.signature ? ` &nbsp;<span class="sig mono">${ip(c.signature)}</span>` : "";
    const detail = c.detail ? `\n        <div class="detail">${ip(c.detail)}</div>` : "";
    return `      <div class="card sys">
        <div class="top"><h3>${c.title}${sig}</h3><span class="pill ${c.pillClass}"><span class="dot"></span>${c.pillLabel}</span></div>
        <p>${ip(c.body)}</p>${detail}
      </div>`;
  })
  .join("\n");

const spineCellsHtml = content.spineCells
  .map((c) => `      <div class="card cell"><div class="n mono">${c.n}</div><div class="k">${c.k}</div><div class="sub">${c.sub}</div></div>`)
  .join("\n");

const matrixHead = [
  "<th>Reference build</th>",
  "<th>Signature</th>",
  ...OPPOSITIONS.map(
    (o) =>
      `<th title="in-band map clears out of ${mapCount}, vs the ${esc(o.id)} (${esc(o.kind)}) opposition">vs ${esc(o.id.toUpperCase())}</th>`,
  ),
  "<th>Loses to</th>",
  "<th>Measured</th>",
].join("\n              ");

const matrixRows = rows
  .map((b) => {
    const name = esc(records[b.buildId]?.name ?? b.buildId);
    const cells = OPPOSITIONS.map((o) => {
      const c = oppCount(b.buildId, o.id);
      return `<td><span class="cellval ${c >= viableMin ? "viable" : "fold"}">${c}/${mapCount}</span></td>`;
    }).join("\n              ");
    const losesTo = b.measurableIdentity && b.losingMatchups.length === 0
      ? `<span class="pill ok" style="font-size:10.5px">no losing matchup</span>`
      : `<span class="pill crit" style="font-size:10.5px">${b.losingMatchups.map(esc).join(" · ") || "—"}</span>`;
    // A CREDITED BUILD IS NOT NECESSARILY A DISTINCT IDENTITY. The count keys on the
    // signature PREFIX, so two builds sharing one contribute a single identity — and a
    // reader counting ✓ marks would otherwise get a number that disagrees with the
    // verdict line below (8 ticks, 7 identities, since the reaction slice).
    const sharesPrefix =
      rows.filter((o) => o.measurableIdentity && o.signaturePrefix === b.signaturePrefix).length > 1;
    const measured = !b.measurableIdentity
      ? `<span class="pill" style="font-size:10.5px">sub-viable</span>`
      : sharesPrefix
        ? `<span class="pill" style="font-size:10.5px" title="credited, but shares its signature family with another build — counts as the same identity">✓ shared identity</span>`
        : `<span class="pill accent" style="font-size:10.5px">✓ identity</span>`;
    const rowClass = b.measurableIdentity ? "" : ' class="muted-row"';
    return `            <tr${rowClass}>
              <td class="build">${name}</td><td class="sig">${esc(b.signaturePrefix)}</td>
              ${cells}
              <td>${losesTo}</td>
              <td>${measured}</td>
            </tr>`;
  })
  .join("\n");

const noLoss = report.noLosingMatchup.map((id) => id.replace(/^bld-/, "")).join(", ");
const dominant = report.dominantBuilds.length ? report.dominantBuilds.map((id) => id.replace(/^bld-/, "")).join(", ") : "none";
const verdictHtml = `        <span><b>distinct identities</b> = <b style="color:var(--ok)">${report.distinctMeasurableArchetypes}</b> / ${report.band.targetN} target</span>
        <span><b>dominant</b> = <b style="color:var(--${report.dominantBuilds.length ? "crit" : "ok"})">${dominant}</b></span>
        <span><b>no-losing-matchup</b> = ${noLoss ? `${esc(noLoss)} <span style="color:var(--ink-faint)">(surfaced, not failed)</span>` : "none"}</span>
        <span class="pill ${report.pass ? "ok" : "crit"}" style="margin-left:auto"><span class="dot"></span>${report.pass ? "GATE PASSES" : "GATE FAILS"}</span>`;

const roadmapHtml = content.roadmap
  .map(
    (p) => `      <div class="phase ${p.state}">
        <div class="p">${p.id}</div><h4>${p.title}</h4>
        <p>${p.blurb}</p>
        <div class="tag"><span class="pill ${p.tagClass}" style="font-size:10px"><span class="dot"></span>${p.tag}</span></div>
      </div>`,
  )
  .join("\n");

const nextHtml = content.nextSteps
  .map((s) => {
    const badge = s.badge ? ` &nbsp;<span class="pill accent" style="font-size:10px">${s.badge}</span>` : "";
    return `      <div class="card opt${s.recommended ? " rec" : ""}">
        <div class="rank">${s.rank}</div>
        <div>
          <h3>${s.title}${badge}</h3>
          <p>${s.body}</p>
        </div>
        <span class="pill" style="align-self:center">${s.chip}</span>
      </div>`;
  })
  .join("\n");

const footHtml = [...content.footer, `· ${counts.adrs} ADRs`, `· ${counts.specFiles} spec files`]
  .map((f) => `    <span>${f}</span>`)
  .join("\n");

// ── assemble the full, standalone HTML document ──────────────────────────────
const html = `<!doctype html>
<html lang="en" data-generated-by="scripts/gen-state.mts">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${content.title} — State of the Engine</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">

  <header class="hero">
    <div>
      <div class="eyebrow">${content.eyebrow}</div>
      <h1>${content.title}</h1>
      <p class="lede">${content.lede}</p>
      <div class="statusline">
        <span class="pill accent"><span class="dot"></span>${content.status.phase}</span>
        ${enginePill}
        <span class="pill warn"><span class="dot"></span>${content.status.prePill}</span>
      </div>
    </div>
    <figure class="hero-art">
${HERO_SVG}
      <figcaption class="cap">grid · height · facing · CT turn order — deterministic from a seed</figcaption>
    </figure>
  </header>

  <div class="kpis">
${kpisHtml}
  </div>

  <section>
    <div class="sec-head"><span class="idx">SYS</span><h2>Where it stands</h2></div>
    <p class="lead">${content.leads.whereItStands}</p>
    <div class="board" style="margin-top:20px">
${systemsHtml}
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="idx">ARCH</span><h2>How it's built</h2></div>
    <p class="lead">${content.leads.architecture}</p>
    <div class="card arch" style="margin-top:20px">
${ARCH_SVG}
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="idx">SPINE</span><h2>The customization spine</h2></div>
    <p class="lead">${content.leads.spine}</p>
    <div class="inv" style="margin-top:20px">
${spineCellsHtml}
    </div>
    <p class="lead" style="margin-top:16px">${content.leads.spineRespec}</p>
  </section>

  <section>
    <div class="sec-head"><span class="idx">GATE</span><h2>The build-diversity gate</h2></div>
    <p class="lead">${content.leads.gate}</p>

    <div class="card" style="margin-top:22px">
      <div class="matrix-shell">
        <table class="matrix">
          <thead>
            <tr>
              ${matrixHead}
            </tr>
          </thead>
          <tbody>
${matrixRows}
          </tbody>
        </table>
      </div>
      <div class="verdict">
${verdictHtml}
      </div>
    </div>
    <p class="lead" style="margin-top:16px; font-size:13.5px; color:var(--ink-faint)">${content.leads.gateHonesty}</p>
  </section>

  <section>
    <div class="sec-head"><span class="idx">ROAD</span><h2>Roadmap position</h2></div>
    <p class="lead">${content.leads.roadmap}</p>
    <div class="road" style="margin-top:22px">
${roadmapHtml}
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="idx">NEXT</span><h2>What's next</h2></div>
    <p class="lead">${content.leads.next}</p>
    <div class="next" style="margin-top:20px">
${nextHtml}
    </div>
  </section>

  <div class="foot">
${footHtml}
  </div>

</div>
</body>
</html>
`;

const outDir = `${ROOT}state`;
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/index.html`, html);
