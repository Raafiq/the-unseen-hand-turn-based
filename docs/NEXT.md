<!-- written-against: 5556e1f -->

# NEXT - the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the derived facts (branch, merge state, unpushed work).
This file holds only what the next slice needs: what it is, what it waits on, and what will bite.
If the hook says the stamp is stale, treat every claim here as a hypothesis and re-derive it.
Green at the stamp: 986 tests, 152 browser specs (`npm run check`).

---

## OPEN - WAITING ON THE OWNER

Read this before telling the owner "nothing is pending". Two asks are open, and one merge instruction.

| # | Ask | State | What it unblocks |
|---|---|---|---|
| C | Confirm the v4 settings (ChatGPT app, "high thinking", `style-ref-1..4.png` as Image 1-4), and say why v4 `priest-m` came back 2:3 | open, minor | The run records in `gpt-portrait-prompts.md` stop reading "assumed" |
| F | Play the mobile-landscape gate (ADR-0034) **and** the landscape-phone stage (ADR-0037) on a real iPhone and a real Android phone: does the rotate gate appear in portrait, does the lock button do anything, are the board's tiles tappable in landscape, and what does the ☰ → settings readout print for tile size at each phone's real viewport | open, carried from `main`'s PR #56 handoff and widened by the stage slice. Every claim about either is Chromium device emulation only | Closes the last unverified claim in `docs/10` AC-V32 and AC-V40 |

**Squash merge is still the repo's preference**, but no large blob rides on this branch: `git rev-list --objects origin/main..HEAD` tops out at ~102 KB (measured 2026-09-06).

---

## LANDED 2026-09-06 — the title screen, in the owner's concept look (ADR-0040)

`#screen-title` is rebuilt to the owner's concept render — three controls only (New
Game, Continue, Copy playtest log), Erase Save and the footer link removed from the DOM.
New Game with a save present shows an in-page overwrite step, not `window.confirm`;
focus moves to Yes on entry, Escape backs out (title screen only), the confirm text
carries `role="alert"`. The save readout moved onto the Continue plaque itself (a
smaller italic second line); `title-slot` now shows only for an unreadable save or
storage a real probe finds unavailable. `#save-error` paints above the title's fixed
layer (`z-index: 6` over `5`). `src/render/overhaul.css`, scoped to `#screen-title`,
linked from `index.html` only. `docs/10` AC-V44…AC-V46; `e2e/title.spec.ts` and
`e2e/contrast.spec.ts` (plus the new shared `e2e/contrast-helpers.ts`) cover it.

**Landmines:**

- **The ink ladder does not carry over.** This parchment is darker than ADR-0028's;
  three of its four secondary inks fail here (`--ink-soft` 4.07, `--ink-faint` 3.79,
  `--accent-ink` 3.83, all on `--parch-lo`). Only `--ink` (worst 4.996:1) holds. The
  next screen in this look must re-measure its own ink ladder, not assume this one's.
- **Scoped CSS still leaks.** Page-wide `index.html` rules (`.eyebrow{text-transform}`,
  `button::before{opacity:0}`, `button[disabled]{opacity:.4}`) apply inside
  `#screen-title` on any property the scoped rule doesn't itself set. Two of the
  title's three declared mockup deviations exist because of this. The next screen hits
  it too.
- **`#screen-title` is a `position:fixed` escape, not the ADR-0037 stage.** It gains
  none of the stage's zones or letterboxing; `docs/10` §8f says so explicitly now.
  AC-V43 stays reserved and unconsumed for the actual stage-migration follow-up.

---

## THE NEXT SLICE - the second screen in the new look (pending the owner's go)

**Not green-lit.** Proposing the **scene player** as the smallest next cut: one portrait,
one name plate, one line at a time — already close to `docs/visual/concepts/Narration
scene.png`, and its state machine (`src/render/panels.ts`) is simpler than prep's job
tree or briefing's multi-pane layout. The owner has not picked; do not start any of the
four remaining screens (prep, briefing, scene player, battle combat poses) without a
named go-ahead.

**Landmines for whichever screen is picked:**

- Re-measure the ink ladder against that screen's own gradient stops (see above).
- Expect a scoped-CSS leak from `index.html`'s page-wide rules; find each one by hand.
- Check any new AC-V number against `docs/10`'s live list before minting — AC-V47 is
  next free; AC-V43 is reserved and off-limits until the stage-migration slice.

---

## NOT GREEN-LIT

One line each. The detail lives where the pointer says; do not re-derive it here.

| Item | State | Where the detail lives |
|---|---|---|
| The job cut (8 jobs to 5) | A signal, not a decision (owner, 2026-09-05). Needs an ADR; do not start it under cover of another slice | `docs/visual/portraits/reference/README.md`, "Scope" |
| The turn plate under the damage numeral | Open appearance call; render the alternatives before asking again | ADR-0032 amendment; `visual-artifacts/playtest/05c-turn-plate.png` after `npm run test:visual` |
| The unit token | Still the flat kite; the owner bundled the choice with the portraits | ADR-0030 |
| The other four screens in the new look (prep, briefing, scene player, battle poses) | Only title has moved; not scheduled until the owner picks | ADR-0040 |
| The other four screens onto the stage (title, prep, briefing, scene player) | Only the battle screen was rebuilt onto the stage; title's look changed but its position did not; needs its own ACs from AC-V43 | ADR-0037, ADR-0040 |
| Camera pan, pinch, double-tap-to-refit | Tiles are ~30x15 CSS px at 640x300, exempt from the 44px tap-target floor (AC-V35); mis-taps are a real, uncovered gap until this lands | ADR-0037 |
| Skin B (dark-table stage option) | Appended to `stage.css`, not wired into `viewer.html` (no `@font-face` for Cinzel/EB Garamond there; falls back to Georgia) | `src/render/stage.css` |
| No real device has run the mobile-landscape gate or the stage | Both rest on Chromium emulation only | OPEN item F above |
| Safe-area insets are asserted as declared, not working | Playwright cannot emulate a notch; AC-V41 says so in its own text | `docs/10` AC-V41 |
| The web manifest ships with no icon set | Deliberate, per AC-V32; no install prompt until icons exist | `docs/10` AC-V32 |
| Defect 1: the game picks the player's ability | Live, nothing red — this is what the action-menu slice fixes | `docs/defects.md` §1 |
| Defect 2: the party's only healer cannot heal | Live, nothing red — same slice, AoE targeting deferred within it | `docs/defects.md` §2 |
| Defect 3: at 360px the battle plate is taller than the board | **Fixed 2026-09-05 by ADR-0037** — kept struck in `docs/defects.md`, not deleted | `docs/defects.md` §3 |
| The `telemetry.test.ts` flake | Test code; route to `qe-tester` | `docs/defects.md` §4 |
| Test gaps A-H | Not scheduled; none is a shipping bug | `docs/defects.md` §5 |
| Variety score 7 to 8 | Off the priority list (owner, 2026-08-30); `docs/06` AC-E2 stays at 8 and CI still fails on a drop | root `CLAUDE.md`, `docs/11` §3 |
| The action menu proposal | Owner-deferred pending a go on look-and-feel work; spec at `docs/proposals/action-menu.md`, AC-V23…V29 unclaimed | root `CLAUDE.md`, "Not established" |
| A SessionStart warning for missing remote branches; more retrospective edits | Declined by the owner 2026-09-01; do not re-propose | this line |

---

## WHERE THE HISTORY LIVES

| Topic | Home |
|---|---|
| The concept renders, the style guide, look-only ruling, title-first order | `docs/visual/concepts/README.md`, ADR-0040 |
| The title screen's controls, overwrite step, ink ladder | ADR-0040, `docs/10` AC-V44..V46, `e2e/title.spec.ts` |
| Portrait wiring, the boot checks, the viewer table decision | ADR-0039 |
| Portrait verdicts, per-file status, staged bytes, crop boxes, the style lock's origin | `docs/visual/portraits/reference/README.md` |
| GPT probe prompts, settings and the v1/v2 measurements | `docs/visual/portraits/reference/gpt-probe-prompts.md`, ADR-0034 |
| The ten v4 prompts, the v4 and v4.1 run records, the edit prompts the owner typed | `docs/visual/portraits/gpt-portrait-prompts.md` |
| Why GPT Image 2 and not Midjourney; the paper decision; the age rule | ADR-0034 and its amendments |
| The Midjourney method (Editor, Zoom Out, `::`, `--no`) and the character briefs | the `midjourney` skill |
| The mobile-landscape gate, the orientation lock and their landmines | ADR-0034, `docs/10` §7b, AC-V30..V32 |
| The landscape-phone stage, Confirm as a separate tap and their landmines | ADR-0037, ADR-0038, `docs/10` §8, AC-V33..V42 |
| The action menu proposal, in full | `docs/proposals/action-menu.md` |
| Live defects and open test gaps | `docs/defects.md` |
| Landed slices | `git log`, `npm run state` |
| Engine, content, viewer and environment traps | `src/sim/CLAUDE.md`, `data/CLAUDE.md`, `src/render/CLAUDE.md`, root `CLAUDE.md` |
