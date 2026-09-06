<!-- written-against: ef85c40 -->

# NEXT - the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints the derived facts (branch, merge state, unpushed work).
This file holds only what the next slice needs: what it is, what it waits on, and what will bite.
If the hook says the stamp is stale, treat every claim here as a hypothesis and re-derive it.
Green at the stamp: 986 tests, 136 browser specs (`npm run check`).

---

## OPEN - WAITING ON THE OWNER

Read this before telling the owner "nothing is pending". Two asks are open, and one merge instruction.

| # | Ask | State | What it unblocks |
|---|---|---|---|
| C | Confirm the v4 settings (ChatGPT app, "high thinking", `style-ref-1..4.png` as Image 1-4), and say why v4 `priest-m` came back 2:3 | open, minor | The run records in `gpt-portrait-prompts.md` stop reading "assumed" |
| F | Play the mobile-landscape gate (ADR-0034) **and** the landscape-phone stage (ADR-0037) on a real iPhone and a real Android phone: does the rotate gate appear in portrait, does the lock button do anything, are the board's tiles tappable in landscape, and what does the ☰ → settings readout print for tile size at each phone's real viewport | open, carried from `main`'s PR #56 handoff and widened by the stage slice. Every claim about either is Chromium device emulation only | Closes the last unverified claim in `docs/10` AC-V32 and AC-V40 |

**Squash merge is still the repo's preference**, but no large blob rides on this branch: `git rev-list --objects origin/main..HEAD` tops out at ~102 KB (measured 2026-09-06).

---

## LANDED 2026-09-06 — six portraits wired (ADR-0039)

`PORTRAIT_BY_UNIT` in `src/render/campaign-data.ts` maps seven roster ids to six
portrait keys; `resolvePortrait()` is the one place `look()` (`game.ts`) resolves art.
Four boot checks (two-direction art coverage, roster-id validity, story/table link
match) plus a unit test on the job segment. `e2e/portraits.spec.ts` asserts real art
on Briar's scene-player and unit-card, an enemy Brigand's card, and Vance's
placeholder. Full account, alternatives and consequences: ADR-0039.

**Landmines:**

- **No playtest frame shows a real-art unit card.** `playtest-capture.spec.ts` never
  opens the drawer that holds it; only `e2e/portraits.spec.ts` proves that path.
- **Four approved keys sit unwired**: `archer-m`, `priest-m`, `thief-f`, `wizard-m`.
  Crop boxes for all ten are recorded in
  `docs/visual/portraits/reference/README.md` so a future roster can cut them
  mechanically; `archer-m`'s framing is the weakest of the set and needs a re-check.
- **Team colour is now answerable.** A real portrait can sit beside a real swatch;
  see `docs/visual/portraits/reference/README.md`, "Open: team colour".
- **The portrait follows the character, not the job.** A Briar re-jobbed to monk in
  prep keeps `archer-f`; it does not fall back to the placeholder.

---

## THE NEXT SLICE - the action menu (pending the owner's go)

**Not green-lit to start.** Owner-deferred 2026-09-02 as "the slice after" portrait
wiring. That slice just landed, so by the record's own words this is next — but no
one has said go. `docs/proposals/action-menu.md` is the spec; read its Bottom Line
(§0) and Open Questions (§10, especially Q5) before scoping.

**What it claims (AC-V23…V29):** the menu becomes the unit's real command list, not
array order (`preview.ts` picks the first matching ability today); one range painted
at a time, never both before a choice; the selected ability is the one that fires
(a live defect: `targetOptions` returns `basic.attack` regardless of what the player
picked); cancel unwinds one level with the sim untouched; keyboard reaches every
action; a colour language for the act's effect, with a non-colour channel too.

**Must be settled first:**

- **An ADR.** This reverses a shipped interaction model (one-click) and changes
  Esc's meaning — `decision-record` territory, not a code-first slice.
- **Q5**: does `GameApi` gain a `clickTile` seam, mirroring `viewer-api.ts`? The
  proposal recommends yes; AC-V27's keyboard case is blocked on it.
- **The priest-cannot-heal blocker** (§0): `white-magic.cure` is AoE and the
  viewer's `isClickTargetable` refuses all AoE. The proposal recommends shipping
  green now and deferring AoE targeting as a separate next slice.

**Landmines in the proposal:**

- AC-V25's fixture must put both abilities in reach of the SAME target (distance 1),
  not just a distance-3 foe only one ability reaches — the latter is a tie today's
  bug also passes.
- AC-V28(a) needs an enemy-healer case, or a team-relative-to-player bug reads as
  correct.
- AC-V29 must assert the covered-panel SET's size, not just add one more colour to
  an existing loop.
- Two fixtures are explicitly unrealizable on shipped content and must say so:
  AC-V23(b) (no shipped unit equips a Secondary) and AC-V28(c) (no shipped ability
  hits both teams at once).

Owner: `viewer-engineer` once green-lit. Doc changes owed on landing: `docs/10` §3,
§4, §5, §6 (route to `docs-steward`).

---

## NOT GREEN-LIT

One line each. The detail lives where the pointer says; do not re-derive it here.

| Item | State | Where the detail lives |
|---|---|---|
| The job cut (8 jobs to 5) | A signal, not a decision (owner, 2026-09-05). Needs an ADR; do not start it under cover of another slice | `docs/visual/portraits/reference/README.md`, "Scope" |
| The turn plate under the damage numeral | Open appearance call; render the alternatives before asking again | ADR-0032 amendment; `visual-artifacts/playtest/05c-turn-plate.png` after `npm run test:visual` |
| The unit token | Still the flat kite; the owner bundled the choice with the portraits | ADR-0030 |
| The other four screens onto the stage (title, prep, briefing, scene player) | Only the battle screen was rebuilt onto the stage; needs its own ACs from AC-V43 | ADR-0037 |
| Camera pan, pinch, double-tap-to-refit | Tiles are ~30x15 CSS px at 640x300, exempt from the 44px tap-target floor (AC-V35); mis-taps are a real, uncovered gap until this lands | ADR-0037 |
| The owner's art-direction concept pass over the stage | Scoped as its own new session, not a continuation | `docs/visual/concepts/owner-phone-screenshot-2026-09-05.jpg` |
| Skin B (dark-table stage option) | Appended to `stage.css`, not wired into `viewer.html` (no `@font-face` for Cinzel/EB Garamond there; falls back to Georgia) | `src/render/stage.css` |
| No real device has run the mobile-landscape gate or the stage | Both rest on Chromium emulation only | OPEN item F above |
| Safe-area insets are asserted as declared, not working | Playwright cannot emulate a notch; AC-V41 says so in its own text | `docs/10` AC-V41 |
| The web manifest ships with no icon set | Deliberate, per AC-V32; no install prompt until icons exist | `docs/10` AC-V32 |
| Defect 1: the game picks the player's ability | Live, nothing red — this is what the action-menu slice above fixes | `docs/defects.md` §1 |
| Defect 2: the party's only healer cannot heal | Live, nothing red — same slice, AoE targeting deferred within it | `docs/defects.md` §2 |
| Defect 3: at 360px the battle plate is taller than the board | **Fixed 2026-09-05 by ADR-0037** — kept struck in `docs/defects.md`, not deleted | `docs/defects.md` §3 |
| The `telemetry.test.ts` flake | Test code; route to `qe-tester` | `docs/defects.md` §4 |
| Test gaps A-H | Not scheduled; none is a shipping bug | `docs/defects.md` §5 |
| Variety score 7 to 8 | Off the priority list (owner, 2026-08-30); `docs/06` AC-E2 stays at 8 and CI still fails on a drop | root `CLAUDE.md`, `docs/11` §3 |
| Any balance, ability, encounter or scheduler slice | Owner order 2026-08-30: look and feel first. The human playtest is delayed, not dropped | root `CLAUDE.md`, "Not established" |
| A SessionStart warning for missing remote branches; more retrospective edits | Declined by the owner 2026-09-01; do not re-propose | this line |

---

## WHERE THE HISTORY LIVES

| Topic | Home |
|---|---|
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
