#!/usr/bin/env node
/**
 * A BINARY ASSET COMMITTED WHOLE GROWS THE REPO FOREVER, AND NOTHING GOES RED.
 *
 * Git stores each version of a binary blob in full — PNGs and video do not delta —
 * so a 9 MB Midjourney grid added once is 9 MB in the pack for the life of the repo,
 * even after a single 15 KB crop is all the game ever loads. Five portrait jobs of
 * sixteen took the branch from 35 MB toward an estimated 250 MB, ~140 MB of it grids
 * nobody opens again (ADR/handoff: "keep the print, not the negative").
 *
 * THE POLICY THIS ENFORCES. Three kinds of file, three homes:
 *   - shipped  — the game imports it: a small WebP/SVG under data/campaign/story/…
 *   - source   — the 9 MB grid: the owner's drive or a GitHub Release, NOT git
 *   - evidence — a proof frame/clip a PR links: docs/visual/, kept small
 * The prompt, settings and locked style reference live in a manifest beside the
 * shipped crop, so a source that is not in git is still reproducible.
 *
 * WHY A SIZE CAP AND NOT A NAME PATTERN. A pattern (`*-4*.png`) only catches the shape
 * of grid this repo happened to make; the next big asset has a different name. The cap
 * is on the thing that actually hurts — bytes in a tracked blob — so it holds for a
 * texture atlas, an audio file or a video the same way.
 *
 * WHY IT CAN COME OUT THE OTHER WAY. It reads the real tracked tree (`git ls-files`),
 * not a curated list, and fails on ANY image/media blob over the cap. Drop a grid back
 * in and it goes red; the mutation is "re-add knight-m-4.png" and it is caught. The
 * committed motion proof (docs/visual/p3-playable/run.gif, 2.8 MiB) and the full-res
 * single upscales (~2.4 MiB, interim crop source) sit below the cap deliberately; a
 * grid (7+ MiB) does not.
 */
import { execSync } from "node:child_process";
import { statSync } from "node:fs";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MiB
const MEDIA = /\.(png|jpe?g|gif|webp|avif|bmp|tiff?|mp4|mov|webm|mkv|wav|mp3|ogg|flac)$/i;

const tracked = execSync("git ls-files -z", { encoding: "buffer" })
  .toString("utf8")
  .split("\0")
  .filter((p) => p && MEDIA.test(p));

const over = [];
for (const p of tracked) {
  let sz = 0;
  try {
    sz = statSync(p).size;
  } catch {
    continue; // deleted-but-staged etc.; nothing to weigh
  }
  if (sz > MAX_BYTES) over.push([p, sz]);
}

if (over.length > 0) {
  over.sort((a, b) => b[1] - a[1]);
  const mib = (n) => (n / 1048576).toFixed(1) + " MiB";
  console.error(
    `\n❌ check:assets: ${over.length} tracked media file(s) over the ${mib(MAX_BYTES)} cap.\n\n` +
      over.map(([p, s]) => `   ${mib(s).padStart(9)}  ${p}`).join("\n") +
      `\n\nSource art (Midjourney grids, masters) does not belong in git. Commit the small\n` +
      `shipped crop the game loads, and keep the original on your drive or a GitHub Release\n` +
      `with its prompt recorded in docs/visual/portraits/reference/README.md. See that file.\n`,
  );
  process.exit(1);
}

console.log(`✅ check:assets: ${tracked.length} tracked media file(s), none over ${(MAX_BYTES / 1048576).toFixed(0)} MiB.`);
