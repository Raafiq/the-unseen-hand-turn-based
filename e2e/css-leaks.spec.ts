import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { dismissScene, startNewGame } from "./helpers.js";

/**
 * Every screen ported to the concept look (`src/render/overhaul.css`, scoped under
 * `#screen-title`, `#screen-scene`, `#screen-briefing`) has shipped the same bug at
 * least once: a page-wide rule in `index.html`'s inline `<style>` still MATCHES an
 * element inside a ported screen, on a property the scoped rule never named
 * (`src/render/CLAUDE.md`, "Two traps the overhaul sets"). Specificity only decides a
 * conflict on properties BOTH rules set, so a page-wide `.eyebrow{text-transform}` wins
 * silently on any screen whose scoped `.eyebrow` rule never named `text-transform`. The
 * last port hunted roughly fifteen of these by eye. This spec turns the hunt into a
 * printed, exhaustive list, over the real Chrome DevTools Protocol — the only place
 * "what actually matched this element" can be read, because CSS specificity is not
 * something `getComputedStyle` or a DOM query can recover once a scoped rule has masked
 * the leak on the properties it names.
 *
 * SCOPE, STATED ONCE: this walks `matchedCSSRules` only — rules that match the element
 * DIRECTLY. `getMatchedStylesForNode` also returns `inherited` (rules matching an
 * ancestor whose properties inherit down, e.g. `body{line-height}`) and
 * `pseudoElements`; both are real leak vectors (the file banner above names
 * `body{line-height}` as a shipped one) and neither is covered here. That is the next
 * iteration, not an oversight — inherited-property leaks need a different comparison
 * (the leaking rule's element is never IN the ported screen's subtree at all) and would
 * double the surface of this file for a first cut.
 *
 * IDENTIFYING "index.html's inline style": every ported screen also matches rules from
 * `overhaul.css` (scoped, expected, not a leak) and from `stage.css` (the battle stage,
 * bundled as a second external sheet). Both reach the page as a `<link rel="stylesheet">`
 * — `CSS.styleSheetAdded`'s header reports `isInline: false` for either. `index.html`'s
 * own `<style>` block is the only stylesheet CDP reports with `isInline: true` on this
 * page, so that one boolean is the whole discriminator; UA rules (`origin !== "regular"`)
 * are excluded before it is even checked.
 */

type ScreenRoot = "#screen-title" | "#screen-scene" | "#screen-briefing";

interface LeakTriple {
  screenRoot: ScreenRoot;
  selector: string;
  property: string;
}

const ALLOW_PATH = join(dirname(fileURLToPath(import.meta.url)), "css-leaks.allow.json");

function tripleKey(t: LeakTriple): string {
  return `${t.screenRoot}␟${t.selector}␟${t.property}`;
}

function sortTriples(triples: LeakTriple[]): LeakTriple[] {
  return [...triples].sort((a, b) => tripleKey(a).localeCompare(tripleKey(b)));
}

function readAllowlist(): LeakTriple[] {
  const raw = readFileSync(ALLOW_PATH, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${ALLOW_PATH} must hold a JSON array`);
  return parsed as LeakTriple[];
}

/** Group triples by `screenRoot selector` for a readable failure message. */
function formatGrouped(label: string, triples: LeakTriple[]): string {
  if (triples.length === 0) return `${label}: none`;
  const bySelector = new Map<string, string[]>();
  for (const t of triples) {
    const key = `${t.screenRoot} ${t.selector}`;
    const props = bySelector.get(key) ?? [];
    props.push(t.property);
    bySelector.set(key, props);
  }
  const lines = [...bySelector.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, props]) => `  ${key} { ${props.join(", ")} }`);
  return [`${label} (${triples.length}):`, ...lines, `raw: ${JSON.stringify(sortTriples(triples))}`].join("\n");
}

/**
 * Walk every element inside `screenRoot`'s subtree (the root itself included) over a
 * fresh CDP session, and return every rule leaking from `index.html`'s inline `<style>`
 * onto one of them — deduplicated, one triple per (matching selector text, property).
 *
 * Per-SELECTOR text, not per-rule: `matchingSelectors` names which branch of a
 * comma-separated rule actually matched THIS node, so a rule like
 * `#screen-title .x, .y { … }` that matches via `.y` is recorded as `.y`, never
 * misattributed to the scoped branch that did not fire. The screen-root-id filter
 * ("already scoped, not a leak") is applied to that same matched branch, for the same
 * reason: a compound selector's OTHER branch being scoped does not make this one safe.
 */
async function collectLeaks(page: Page, screenRoot: ScreenRoot): Promise<LeakTriple[]> {
  const session = await page.context().newCDPSession(page);
  const inlineByStyleSheetId = new Map<string, boolean>();
  session.on("CSS.styleSheetAdded", (e) => {
    inlineByStyleSheetId.set(e.header.styleSheetId, e.header.isInline);
  });
  await session.send("DOM.enable");
  await session.send("CSS.enable");

  const { root } = await session.send("DOM.getDocument");
  const { nodeIds } = await session.send("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: `${screenRoot}, ${screenRoot} *`,
  });

  const seen = new Map<string, LeakTriple>();
  for (const nodeId of nodeIds) {
    const styles = await session.send("CSS.getMatchedStylesForNode", { nodeId });
    for (const match of styles.matchedCSSRules ?? []) {
      const rule = match.rule;
      // UA and inspector/injected rules are not a page-authored leak.
      if (rule.origin !== "regular") continue;
      // Rules with no stylesheet id (constructed/anonymous) cannot be index.html's own.
      if (!rule.styleSheetId) continue;
      // The whole discriminator: `overhaul.css` and `stage.css` both arrive as a
      // `<link>` (isInline: false); only index.html's own <style> block is inline.
      if (inlineByStyleSheetId.get(rule.styleSheetId) !== true) continue;

      for (const idx of match.matchingSelectors) {
        const sel = rule.selectorList.selectors[idx];
        if (!sel) continue;
        // Already scoped to this screen — not a leak, whatever properties it sets.
        if (sel.text.includes(screenRoot)) continue;
        for (const prop of rule.style.cssProperties) {
          // CDP flattens every shorthand this rule writes (`background`, `border`,
          // `padding`, `transition`, …) into ADDITIONAL entries for each longhand it
          // expands to (`background-color`, `border-top-width`, `padding-left`, …),
          // with no `text`/`range` of their own — they were never named in the source,
          // CDP just fills them in for its style-editing UI. Recording those as
          // separate leaks would report `padding` on `button` as sixteen findings
          // instead of one and swamp the allowlist with entries no engineer wrote a
          // property name for. `text` is present only on an entry the rule's author
          // literally declared, which is what "a property the scoped rule never
          // named" means.
          if (prop.text === undefined) continue;
          const triple: LeakTriple = { screenRoot, selector: sel.text, property: prop.name };
          seen.set(tripleKey(triple), triple);
        }
      }
    }
  }
  await session.detach();
  return [...seen.values()];
}

const SCREENS: { id: ScreenRoot; reveal: (page: Page) => Promise<void> }[] = [
  {
    id: "#screen-title",
    reveal: async (page) => {
      await page.goto("/");
      await expect(page.getByTestId("screen-title")).toBeVisible();
    },
  },
  {
    id: "#screen-scene",
    reveal: async (page) => {
      await page.goto("/");
      await startNewGame(page);
      await expect(page.getByTestId("screen-scene")).toBeVisible();
    },
  },
  {
    id: "#screen-briefing",
    reveal: async (page) => {
      await page.goto("/");
      await startNewGame(page);
      await dismissScene(page);
      await expect(page.getByTestId("screen-briefing")).toBeVisible();
    },
  },
];

test.describe("css leaks: index.html's inline style onto the ported screens", () => {
  // Three CDP walks, each over every element of a real screen's subtree — generous but
  // bounded; the default 30s is comfortably enough on this box (see report), this just
  // buys headroom for a loaded CI runner.
  test.setTimeout(60_000);

  test("matched-rule leaks equal the recorded allowlist exactly, in both directions", async ({ page }) => {
    const found: LeakTriple[] = [];
    for (const screen of SCREENS) {
      await screen.reveal(page);
      found.push(...(await collectLeaks(page, screen.id)));
    }
    const sortedFound = sortTriples(found);
    const allow = sortTriples(readAllowlist());

    const foundKeys = new Set(sortedFound.map(tripleKey));
    const allowKeys = new Set(allow.map(tripleKey));

    const newLeaks = sortedFound.filter((t) => !allowKeys.has(tripleKey(t)));
    const staleEntries = allow.filter((t) => !foundKeys.has(tripleKey(t)));

    // A triple on the page but not in the allowlist: an unrecorded leak landed.
    expect(
      newLeaks,
      formatGrouped(
        "NEW LEAK — matched on a ported screen, absent from e2e/css-leaks.allow.json",
        newLeaks,
      ),
    ).toEqual([]);

    // A triple in the allowlist but no longer on the page: the allowlist is stale
    // (the leak was fixed, or the markup/rule that produced it is gone) and must be
    // pruned by hand — this spec will not silently drop it for you.
    expect(
      staleEntries,
      formatGrouped(
        "STALE ALLOWLIST ENTRY — in e2e/css-leaks.allow.json, no longer matched on the page",
        staleEntries,
      ),
    ).toEqual([]);
  });
});
