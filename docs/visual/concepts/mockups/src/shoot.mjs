/**
 * Capture the split-screen mockups at the three folds `docs/10` §8f and ADR-0037
 * name (640x300 and 851x324 are the phone-landscape folds; 1000x780 is desktop).
 *
 *   node docs/visual/concepts/mockups/src/shoot.mjs
 *
 * Serves the REPO ROOT over http (not file://) so the self-hosted woff2 faces and
 * the bundled portraits load the same way they do in the running game. Chromium
 * is pre-installed at /opt/pw-browsers in this sandbox — never `playwright install`.
 *
 * Also prints the measured portrait-card box at each fold; those numbers are the
 * answer to "is the face big enough to read", and they are in the handback.
 *
 * deviceScaleFactor is 1, matching the approved `prep-*.png` frames this set is
 * meant to be compared against — and because `check:assets` caps a tracked media
 * file at 3 MiB, which a 2x 1000x780 frame (3.6 MB) breaks. 1x is also the honest
 * floor for "can you see the face": a real phone renders at 2-3x.
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const OUT = join(ROOT, "docs/visual/concepts/mockups");
const SRC = "/docs/visual/concepts/mockups/src";

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".woff2": "font/woff2", ".json": "application/json",
};

const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("no");
  }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const FOLDS = [
  { w: 640, h: 300 },
  { w: 851, h: 324 },
  { w: 1000, h: 780 },
];

const SHOTS = [
  ...FOLDS.map((f) => ({ ...f, url: `${SRC}/party.html`, out: `party-${f.w}x${f.h}.png`, measure: true })),
  ...FOLDS.map((f) => ({ ...f, url: `${SRC}/member.html`, out: `member-${f.w}x${f.h}.png` })),
  { w: 851, h: 324, url: `${SRC}/member.html?tab=skills`, out: "member-851x324-skills.png" },
  // THE OWNER'S FOLD (832x328), tracked rather than shot into `coverage/`. The numbers in
  // `e2e/briefing.spec.ts`'s `MOCKUP_832x328` were originally read off a re-shoot that
  // went to a gitignored directory, which made them un-re-derivable: anybody checking
  // them had to guess how the frame was taken. `constants: true` prints exactly the six
  // the spec pins, so the frame and its numbers can both be regenerated from this file.
  { w: 832, h: 328, url: `${SRC}/party.html`, out: "party-832x328.png", measure: true, constants: true },
];

// The sandbox ships build 1194; the pinned @playwright/test asks for 1187 and
// dies with "Executable doesn.t exist", which reads exactly like a code failure.
// Point it at what is actually here (root CLAUDE.md: never `playwright install`).
const EXE = process.env.CHROMIUM_EXE ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser = await chromium.launch({ executablePath: EXE });
for (const s of SHOTS) {
  const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
  await page.goto(base + s.url, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.iconsReady === "1");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, s.out) });
  if (s.measure) {
    const m = await page.evaluate(() => {
      const card = document.querySelector(".ptab");
      const face = document.querySelector(".ptab .face");
      const pip = document.querySelector(".pip");
      const seal = document.querySelector(".seal");
      const r = (e) => { const b = e.getBoundingClientRect(); return `${Math.round(b.width)}x${Math.round(b.height)}`; };
      const roster = document.querySelector(".roster");
      const rb = roster.getBoundingClientRect();
      return { cards: document.querySelectorAll(".ptab").length, card: r(card), face: r(face), pip: r(pip), seal: r(seal),
               roster: `${Math.round(rb.width)}x${Math.round(rb.height)} slack ${Math.round(rb.height - roster.scrollHeight)}`,
               cols: getComputedStyle(document.querySelector(".cards")).gridTemplateColumns };
    });
    console.log(`${s.out.padEnd(22)} card ${m.card}  face ${m.face}  pip ${m.pip}  seal ${m.seal}  roster ${m.roster}`);
  }
  if (s.constants) {
    // The exact six `e2e/briefing.spec.ts`'s MOCKUP_832x328 holds, in its own names, off
    // the same element boxes the spec reads on the running build.
    const c = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".ptab")].map((e) => e.getBoundingClientRect());
      const roster = document.querySelector(".roster").getBoundingClientRect();
      const seal = document.querySelector(".seal").getBoundingClientRect();
      const last = cards[cards.length - 1];
      return {
        cards: cards.length,
        cardFirstX: Math.round(cards[0].x),
        cardLastRight: Math.round(last.x + last.width),
        cardTop: Math.round(cards[0].y),
        rosterRight: Math.round(roster.x + roster.width),
        sealRight: Math.round(seal.x + seal.width),
        sealBottom: Math.round(seal.y + seal.height),
      };
    });
    console.log(`  MOCKUP_${s.w}x${s.h} (${c.cards} mockup cards) = ${JSON.stringify(c)}`);
  }
  // Every control's short side, and whether anything overflows the viewport —
  // the two things AC-V56 asserts and the two a screenshot cannot show.
  const bad = await page.evaluate((vh) => {
    const out = [];
    for (const el of document.querySelectorAll("button, select, input, .ptab, .tab")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (Math.min(b.width, b.height) < 44) out.push(`<44px ${el.dataset.testid ?? el.className}: ${Math.round(b.width)}x${Math.round(b.height)}`);
      if (b.bottom > vh + 1 || b.right > window.innerWidth + 1 || b.top < -1 || b.left < -1)
        out.push(`offscreen ${el.dataset.testid ?? el.className}`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth) out.push("HORIZONTAL SCROLL");
    return out;
  }, s.h);
  if (bad.length) console.log(`  ${s.out}: ${[...new Set(bad)].join(" | ")}`);
  await page.close();
}
await browser.close();
server.close();
