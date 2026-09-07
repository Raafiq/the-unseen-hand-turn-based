/**
 * Pure, Node-side pieces of `contrast.spec.ts`'s WCAG measurement — split into their own
 * module (not `.spec.ts`, so Playwright never discovers it as a test file) purely so a
 * SECOND spec can reuse the exact declared grounds and the exact ratio formula instead of
 * hand-rolling a copy that could quietly drift from what `contrast.spec.ts` actually
 * measures. `contrast.spec.ts` imports `GROUNDS` from here rather than declaring its own.
 *
 * `failures()` in `contrast.spec.ts` cannot import this: it runs INSIDE
 * `page.evaluate`, a closure Playwright serialises and ships to the browser as a string,
 * so its own copy of the ratio math is a necessary, separate duplicate — not this one.
 */

/**
 * The extreme stops of each sheet's ground gradient, taken from index.html. A text
 * colour must clear the bar against every entry.
 *
 * These are duplicated from the stylesheet on purpose: if someone re-tones the
 * parchment and forgets this list, the test measures against the OLD ground and can
 * pass on a sheet that actually got worse. `groundsAreReal()` in `contrast.spec.ts` is
 * the guard — it asserts each listed colour is one the page genuinely paints.
 */
export const GROUNDS = {
  parchment: ["rgb(242, 230, 196)", "rgb(220, 195, 143)"],
  table: ["rgb(36, 27, 16)", "rgb(11, 8, 5)"],
  /**
   * THE STAGE'S HUD SURFACES — a FLAT opaque fill, unlike every other ground here, and
   * the same colour the stat plate used to be (ADR-0037 moved the card, not its tone).
   *
   * They have to be opaque, and the reason is this file's own algorithm. The walk below
   * composites a translucent layer onto the SHEET its element sits in — and the stage
   * sits in NO sheet: its bars, tab, drawers, sheets and toast float over the CANVAS,
   * which no DOM walk can sample (a canvas has no background colour, only pixels). A
   * see-through bar would be scored against the table gradient while the player reads it
   * over grass, sky or water: a green run and an unreadable HUD, which is exactly the
   * shape of evidence this repo forbids.
   *
   * Because the fill IS opaque the walk finds it by itself, so this entry is never used
   * as a fallback. It is the DECLARED value the tests below compare the live one
   * against — the same duplicate-and-guard the two grounds above use.
   *
   * `GROUNDS.board` is GONE, not forgotten: `.card.board` no longer exists. The battle
   * screen is the stage, and its dark ground is these surfaces plus the canvas.
   */
  plate: ["rgb(29, 23, 16)"],
  /**
   * The rotate gate's card — like the plate, a FLAT opaque fill rather than a gradient.
   *
   * It has to be flat for the same reason: the card is a sibling of nothing this walk
   * can sample, sitting on the table gradient, and `sheetOf()` does not recognise it as
   * a sheet (it is neither `.card` nor `.panel` nor a `dialog`). Because the fill is
   * opaque the walk finds it by itself, so this entry is the DECLARED value the test at
   * the bottom of `contrast.spec.ts` compares the live one against.
   */
  gate: ["rgb(233, 215, 168)"],
  /**
   * THE OVERHAUL TITLE SCREEN's parchment leaf (src/render/overhaul.css,
   * docs/visual/concepts/README.md §a) — a DIFFERENT, darker parchment than
   * `GROUNDS.parchment` above, with its own four-stop gradient (`--parch-hi` through
   * `--parch-burn`). It is not a `.card`/`.panel`, so `sheetOf()` below never falls back
   * to it; every leaf text element finds it as its OWN opaque ground directly (the walk
   * climbs from the text node to `.leaf`, whose `background-image` gradient stops are
   * all alpha-1 rgb() literals — see `failures()`'s `ownGrounds()`). Listed here purely
   * so `groundsAreReal()` can guard it the same way the other two are guarded.
   */
  leaf: ["rgb(221, 185, 146)", "rgb(212, 175, 134)", "rgb(201, 159, 117)", "rgb(182, 136, 93)"],
  /**
   * The title screen's iron plaque field (`--plaque-hi`/`--plaque`/`--plaque-lo`), same
   * reasoning as `leaf` — every plaque button finds this as its own opaque ground. The
   * rivets are deliberately NOT here: they live on `button::before`, a separate element
   * this walk never reaches when scoring the button's OWN text (see overhaul.css's file
   * banner comment, deviation 1) — putting brass colours in this list would assert a
   * ground no text is actually painted on.
   */
  plaque: ["rgb(43, 39, 37)", "rgb(29, 30, 30)", "rgb(27, 26, 23)"],
  /**
   * THE SCENE PLAYER's dialogue-box field (`docs/visual/concepts/README.md` §f,
   * `src/render/overhaul.css`'s `#screen-scene .card::before`) — the three stops of its
   * own radial-gradient. Bare text with no ground of its own (`.line`, `.scene-progress`)
   * falls back to this set via `sheetOf()`'s `#screen-scene` branch below, because the
   * field is painted by a PSEUDO-element the DOM walk can never reach as an ancestor.
   */
  sceneBox: ["rgb(201, 166, 132)", "rgb(204, 171, 139)", "rgb(191, 153, 118)"],
  /**
   * The name plate's own gradient (`.who`) — every plate finds this directly via
   * `ownGrounds()`, the same way `leaf`/`plaque` are found, so it never needs the
   * `sheetOf()` fallback. Listed here purely so `groundsAreReal()` can guard it.
   */
  scenePlate: ["rgb(201, 166, 132)", "rgb(190, 149, 111)", "rgb(191, 153, 118)"],
  /**
   * The iron band's own base gradient (`.card`) — no text sits directly on it (every
   * caption finds an opaque ground of its own, or the box-parch field, first), so this is
   * a `groundsAreReal()`-only guard: it asserts the darkest stop a future addition to this
   * band would have to clear, without claiming anything currently needs to.
   */
  sceneIron: ["rgb(34, 28, 25)"],
  /**
   * The house ribbon's two computed states (`.portrait::after` / `.portrait[data-state=
   * "none"]::after`, `src/render/overhaul.css`) — a single declared colour each, not a
   * gradient family, because `e2e/scene.spec.ts` asserts these by EXACT equality: the
   * claim is "speaking is this colour, narration is that one", not "clears a bar".
   */
  houseBlue: "rgb(38, 43, 59)",
  houseGrey: "rgb(47, 47, 47)",
  /**
   * THE BRIEFING SCREEN's own leaf (`#screen-briefing .leaf`, owner decision
   * 2026-09-07). MEASURED live (`coverage/scratch/measure.mjs`), not assumed from the
   * title's `--parch-*` values, because it is NOT the same set: this leaf's own radial
   * gradient adds one extra, lighter stop (`#f0dfc6`, the mockup's own highlight) the
   * title leaf never painted, so reusing `GROUNDS.leaf` here would silently drop that
   * stop from every check.
   */
  briefLeaf: [
    "rgb(182, 136, 93)",
    "rgb(201, 159, 117)",
    "rgb(212, 175, 134)",
    "rgb(221, 185, 146)",
    "rgb(240, 223, 198)",
  ],
  /**
   * The right leaf's iron plaque family — `.tab.on`, `.jplaque`, `.backplaque`, the
   * top rail's company plaque and the roundel icon field ALL measure to this exact
   * three-stop set (confirmed live, not assumed identical because they share a class
   * name — they do not). It is numerically the SAME as `GROUNDS.plaque` (the title
   * screen's plaque), because both are built from the identical `--plaque-hi/
   * --plaque/--plaque-lo` triple — a real coincidence of a shared recipe, not a
   * shortcut taken here. Kept as its own name so a future divergence between the two
   * screens' plaques is visible in a diff instead of silently sharing an assertion.
   */
  briefPlaque: ["rgb(27, 26, 23)", "rgb(29, 30, 30)", "rgb(43, 39, 37)"],
  /**
   * The "dark parchment plate" family — `.tab` AT REST (unselected), the tan field
   * every tab starts on before the gold-plaque `.on` state takes over. Three stops,
   * its own recipe (`#cba484` / `--plate-parch` / `#b08a66`), distinct from every
   * other tan field on this screen (see `briefBoxCard`/`briefBoxSelected` below —
   * three different three-stop tans that all LOOK alike and are NOT the same set).
   */
  briefPlate: ["rgb(176, 138, 102)", "rgb(190, 149, 111)", "rgb(203, 164, 132)"],
  /**
   * A roster card AT REST (`.member:not(.on) .ptab`) and the top rail's tagline
   * ribbon (`.tagline`) — two different elements that happen to measure to the exact
   * same three stops (both are a plain `radial-gradient`/mix over `--box-parch-hi/
   * --box-parch/--box-parch-lo` with no extra literal stop mixed in, unlike `.tab`
   * or `.gearrow` below). Numerically identical to the scene screen's `sceneBox`
   * (`GROUNDS.sceneBox`) for the same reason `briefPlaque` matches the title's
   * plaque — the same sampled palette, reused, not assumed to still match.
   */
  briefBoxCard: ["rgb(191, 153, 118)", "rgb(201, 166, 132)", "rgb(204, 171, 139)"],
  /**
   * A gold-selected roster card (`.member.on .ptab`) — the THIRD tan family, warmer
   * and lighter than `briefBoxCard`, from its own `#e8ccaa/#ddbe99/#cba57e` recipe.
   */
  briefBoxSelected: ["rgb(203, 165, 126)", "rgb(221, 190, 153)", "rgb(232, 204, 170)"],
  /**
   * An iron roundel row (`.gearrow` — the weapon slot, the Learn tree picker), its own
   * fourth tan recipe (`#d5b492` mixed with `--box-parch/--box-parch-lo`).
   */
  briefGearrow: ["rgb(191, 153, 118)", "rgb(204, 171, 139)", "rgb(213, 180, 146)"],
  /**
   * The wax Deploy plate (`.seal`) — its three OPAQUE stops only; the gradient also
   * layers three translucent sheen/shadow washes (`rgba(255,190,190,.28)` etc) that
   * `ownGrounds()` (`contrast.spec.ts`) never treats as a ground on their own, since
   * only alpha-1 stops end the walk.
   */
  briefSeal: ["rgb(109, 8, 18)", "rgb(154, 14, 26)", "rgb(179, 18, 32)"],
  /**
   * The wood table this whole screen sits on (`#screen-briefing`'s own root gradient)
   * — guard-only, like `sceneIron`: nothing measured here ever needs it as a ground,
   * because every text element finds a leaf, a plaque or a card first. Declared so a
   * future addition painted straight onto the wood is caught by `groundsAreReal`
   * rather than silently measured against nothing.
   */
  briefWood: ["rgb(11, 5, 4)", "rgb(21, 11, 9)", "rgb(37, 24, 17)"],
} as const;

/**
 * WCAG contrast ratio between two `rgb()`/`rgba()` strings — the same formula
 * `contrast.spec.ts`'s in-page `failures()` runs. Values checked against the file
 * banner's own worked example: `contrastRatio("rgb(143,133,120)", "rgb(43,39,37)")` is
 * 4.081…, matching the documented "--label-off … does NOT clear --plaque-hi (4.08:1)".
 */
/**
 * The opaque `rgb(...)` gradient stops actually painted in a `background-image` string,
 * deduplicated and order-independent — used to compare against a declared list as SETS,
 * not merely check the declared ones are present among possibly more.
 */
export function paintedStops(backgroundImage: string): string[] {
  return [...new Set(backgroundImage.match(/rgb\([^)]*\)/g) ?? [])].sort();
}

export function contrastRatio(fg: string, bg: string): number {
  const parse = (s: string): [number, number, number, number] | null => {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/.exec(s);
    return m ? [+m[1]!, +m[2]!, +m[3]!, m[4] === undefined ? 1 : +m[4]!] : null;
  };
  const lum = (c: [number, number, number, number]): number => {
    const f = (v: number): number => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const a = parse(fg);
  const b = parse(bg);
  if (!a || !b) throw new Error(`contrastRatio: could not parse "${fg}" / "${bg}"`);
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
