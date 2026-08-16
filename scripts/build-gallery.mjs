// Build a self-contained visual proof-sheet from the Playwright artifacts:
// screenshots + the run video → visual-artifacts/gallery/{index.html,shots,run.webm}.
// The Pages deploy copies this to /visual/. Pure tooling — not sim code.

import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_SHOTS = path.join(ROOT, "visual-artifacts", "screenshots");
const SRC_PW = path.join(ROOT, "visual-artifacts", "pw");
const OUT = path.join(ROOT, "visual-artifacts", "gallery");

const CAPTIONS = {
  "01-initial.png": "Initial deploy — the isometric grid, four units, and the turn order (Mage first: highest Speed).",
  "02-closing-in.png": "Closing in — the last board before anyone lands a blow: units maneuver across the plateau within their real Move/Jump range. (Captured by state, not by turn number — this is whichever turn precedes first blood.)",
  "03-combat.png": "First blood — the turn total HP first drops, so a damage popup is necessarily on screen. Real hit rolls and damage from the FFT formulas.",
  "04-aftermath.png": "Aftermath — HP has dropped and KO'd units become crystals; the turn log shows the CT-ordered blow-by-blow.",
  "05-prep-chassis.png": "Prep — the 5-slot ability chassis. A Knight with abilities learned across four jobs; the Secondary command starts empty, so the command list is just Attack + Battle Skill. The two Breaks are dimmed and tagged NO EFFECT YET: `battle-skill` ships with no live action, and the panel says so rather than presenting an inert command as an equal option.",
  "06-prep-black-magic.png": "Customization aha — equipping Black Magic as the Secondary command grows the castable command list: the Knight can now cast Fire (and its whole line). Swaps are free and reversible.",
  // The PLAYABLE path (docs/10). Captured by e2e/play.spec.ts, which asserts the
  // claim each caption makes in the same test that takes the shot — so a caption
  // cannot outlive the state it describes.
  "10-player-turn.png": "Your turn — the Archer is up (solid gold ring) and its real moveRange is painted in gold. BOTH foes are tinted as legal targets: Aimed Shot reaches 5 tiles, so the Archer can fire from where it stands for −80 CT without moving a step. Spending the move to flank instead costs −100 (frames 11–14), and that trade is what the move+act fold exists for. (The orange crosshair is the enemy Mage's OWN in-flight charged spell, aimed at one of YOUR units — it is incoming damage, not a target marker.)",
  "11-preview-a.png": "Staged, take one — the preview recomputes from the STAGED tile, not from where the unit is standing. Every row (facing arc, hit %, exact damage, HP before → after, the −100 CT price of the whole turn) is computed before you commit, and nothing has touched the sim yet.",
  "12-preview-b.png": "Same actor, same target, same ability, ONE tile different — and the strike lands in a different facing arc. That is why move-then-act is a real tactical choice and not a formality. (The two frames are generated from whichever pair of tiles the board actually offers, so they cannot drift from the state they depict.)",
  "13-illegal.png": "An illegal click is refused, not punished: a reason chip ('Out of Move range') and nothing else. Compare with 10 — the board, the clock and the command log are byte-identical.",
  "14-committed.png": "Committed — the Archer moved and struck from the destination tile in ONE command, at a turn price of −100 CT. The turn log shows both halves, the move and the blow, at the SAME tick: that is what makes it one turn and not two.",
  "15-ai-turn.png": "An AI turn: the active unit wears a DASHED ring, End Turn is disabled, and player input is inert ('Not your turn'). The board still carries the damage the fold dealt, so this is a turn mid-fight rather than the opening deploy.",
};

async function findVideo(dir) {
  if (!existsSync(dir)) return null;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findVideo(full);
      if (nested) return nested;
    } else if (entry.name.endsWith(".webm")) {
      return full;
    }
  }
  return null;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, "shots"), { recursive: true });

  const shots = existsSync(SRC_SHOTS)
    ? (await readdir(SRC_SHOTS)).filter((f) => f.endsWith(".png")).sort()
    : [];
  for (const f of shots) await cp(path.join(SRC_SHOTS, f), path.join(OUT, "shots", f));

  const video = await findVideo(SRC_PW);
  if (video) await cp(video, path.join(OUT, "run.webm"));

  const cards = shots
    .map((f) => {
      const caption = CAPTIONS[f] ?? f;
      return `<figure><img loading="lazy" src="shots/${f}" alt="${caption}" /><figcaption>${caption}</figcaption></figure>`;
    })
    .join("\n");

  const videoBlock = video
    ? `<section class="video"><h2>Run recording</h2><video controls preload="metadata" src="run.webm"></video></section>`
    : `<section class="video"><h2>Run recording</h2><p class="muted">No video captured for this run.</p></section>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>The Unseen Hand — Visual test gallery</title>
<style>
  :root { --bg:#0e1220; --surface:#151a2a; --border:#29314a; --ink:#e8ecf5; --soft:#aab3c7; --faint:#6d7791; --accent:#e2a948;
    --mono: ui-monospace,"SF Mono","Cascadia Code",Menlo,Consolas,monospace; --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  * { box-sizing:border-box; } body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--sans); line-height:1.55; }
  .wrap { max-width:1000px; margin:0 auto; padding:32px 20px 80px; }
  .eyebrow { font-family:var(--mono); font-size:.72rem; letter-spacing:.16em; text-transform:uppercase; color:var(--accent); margin:0 0 8px; }
  h1 { font-size:1.6rem; margin:0 0 8px; } p.lede { color:var(--soft); max-width:64ch; margin:0 0 10px; }
  a.back { font-family:var(--mono); font-size:.85rem; color:var(--accent); text-decoration:none; }
  h2 { font-size:.78rem; text-transform:uppercase; letter-spacing:.08em; color:var(--faint); font-family:var(--mono); margin:36px 0 14px; }
  .grid { display:grid; gap:20px; grid-template-columns:1fr; } @media(min-width:760px){ .grid{ grid-template-columns:1fr 1fr; } }
  figure { margin:0; background:var(--surface); border:1px solid var(--border); border-radius:12px; overflow:hidden; }
  figure img { display:block; width:100%; height:auto; border-bottom:1px solid var(--border); }
  figcaption { padding:12px 14px; color:var(--soft); font-size:.9rem; }
  .video video { width:100%; border:1px solid var(--border); border-radius:12px; background:#000; }
  .muted { color:var(--faint); } footer { margin-top:40px; color:var(--faint); font-size:.8rem; font-family:var(--mono); }
</style></head>
<body><div class="wrap">
  <p class="eyebrow">The Unseen Hand · Automated visual tests</p>
  <h1>Engine viewer — screenshot proof-sheet &amp; recording</h1>
  <p class="lede">Captured by Playwright driving the real app in a headless browser. Every frame is deterministic (seeded sim + deterministic step policy), so these double as a visual regression baseline.</p>
  <a class="back" href="../">▸ Open the live viewer</a>
  <h2>Screenshots (${shots.length})</h2>
  <div class="grid">
${cards}
  </div>
  ${videoBlock}
  <footer>Generated by scripts/build-gallery.mjs from visual-artifacts/. Deployed under /visual/ by the Pages workflow.</footer>
</div></body></html>`;

  await writeFile(path.join(OUT, "index.html"), html, "utf8");
  console.log(`Gallery written to ${OUT} (${shots.length} screenshots${video ? " + video" : ""}).`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
