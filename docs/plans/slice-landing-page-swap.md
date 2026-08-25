# Slice — the game is the landing page

**Status:** not started. **Written:** 2026-08-25.

**One line.** `/` serves the campaign; the engine viewer moves to `/viewer.html`; the
old `/game.html` keeps working as a redirect so no shared link dies.

---

## Why

`index.html` is the engine viewer — one demo battle with every internal number on show.
It is a developer instrument, and it is what a stranger currently lands on. The thing we
want played is the campaign, and it is one click *away* behind a link in the header.

`docs/NEXT.md`'s next step is a person playing `/game.html` cold. Handing them a URL that
opens a debug view first is the cheapest possible way to lose the first thirty seconds of
the only playtest we have.

## The shape

| Path | Before | After |
|---|---|---|
| `/` | engine viewer | **the campaign** |
| `/viewer.html` | — | engine viewer |
| `/game.html` | the campaign | **redirect to `/`** |

**The redirect is not optional.** The repo has been public since 2026-08-09, `README.md`
links `…/game.html`, and `docs/11` names that path as where the game is played. A 404 on
the one URL that has been shared is a worse outcome than the swap is worth. The stub is a
meta-refresh plus a plain link, so it works with scripting disabled.

## What must move together

A rename lands in docs, code AND tests in one slice, or not at all (`CLAUDE.md`).

- **Build:** `vite.config.ts` gains a `viewer` entry and keeps `game`. **A page missing
  from `rollupOptions.input` works under `npm run dev` and does not exist in `dist`** —
  i.e. it is not shipped. Three entries in, three out.
- **Docs:** `docs/10` §7a is authoritative and currently states the opposite ("the site
  ships two entry points: `index.html`, the engine viewer"). It is now **three**, and one
  of them is a redirect. `docs/11` (3 places), `docs/NEXT.md` (2), `README.md`,
  `src/render/README.md`, and the page docstrings in `game.ts` / `prep.ts`.
- **Specs:** `campaign.spec.ts` ×13 and `playtest-capture.spec.ts` ×1 go `/game.html` →
  `/`. `play.spec.ts` ×3, `prep.spec.ts` ×4, `viewer.spec.ts` ×1 go `/` →
  `/viewer.html`, plus two prose comments naming `index.html`.

## Landmines

1. **`play.spec.ts` ASSERTS THE VIEWER'S TAB ORDER EXACTLY** and its first stop is the
   "Play the campaign" link. That link survives — only its `href` changes — so the
   assertion should still pass. **Verify it rather than assume it**: a tab-order test that
   silently starts landing somewhere else is exactly how this regresses.
2. **A green suite does not prove a page SHIPPED.** Playwright runs against
   `npm run preview`, which serves `dist`, so a page missing from the rollup inputs fails
   there — but only if a spec actually visits it. Every one of the three paths needs a
   visit.
3. **Two entries can emit the same HTML.** Assert the pages are DIFFERENT — `/` shows the
   title screen, `/viewer.html` shows the board immediately — not merely that each loads.
4. **The redirect must be asserted at the redirect**, not by trusting the markup: a
   `<meta http-equiv="refresh">` typo renders a perfectly ordinary blank page.
5. `state/index.html` and the gallery's `index.html` are different files in different
   directories. Do not touch them.
6. **`npm run state` last**, and re-stamp `docs/NEXT.md`.

## Order of work

| Step | Deliverable |
|---|---|
| 1 | `git mv` both pages, add the `game.html` redirect stub, wire all three into Vite |
| 2 | Retarget every spec; fix the two `index.html` comments |
| 3 | New browser spec: all three paths, and the two real pages differ |
| 4 | Docs — `docs/10` §7a, `docs/11`, `README.md`, `src/render/README.md`, docstrings |
| 5 | `npm run check` + `npm run test:visual`; `npm run state`; re-stamp the handoff |
