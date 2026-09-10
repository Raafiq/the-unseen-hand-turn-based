<!-- written-against: 4bb8791 -->
<!-- ADR-0043 (battlefield-first) and `intent/combat-revamp.md` (draft) are IN THE TREE at this
     stamp. Neither is built; the battle screen still ships ADR-0037's stage. -->

# INTENT — where this game is going, and what comes next

**Read this after `CLAUDE.md`.** The SessionStart hook prints branch, merge state and unpushed
work; everything it derives is left out here. If the hook says the stamp is stale, treat every
claim below as a hypothesis and re-derive it before acting.
Green at the stamp: 998 tests, 211 browser specs (`npm run check`).

---

## WHERE THE GAME IS GOING

A turn-based tactics RPG in the shape of Final Fantasy Tactics, whose point is the build:
a 5-slot ability chassis, AP-driven job trees with permanent mastery, and hybrid jobs.

**Built (M0).** A headless sim plus a thin viewer, and one campaign playable start to finish
at `/`: title, one save, five battles, a six-member party that keeps what it earns, scene
text and a prep screen. The **concept look** now covers the title screen, the scene player
and the briefing (ADR-0040, ADR-0041). Nine of ten approved portraits are wired (ADR-0039).

**Not established: that a stranger can play it.** Every automated run drives the balance probe
or a deliberate forfeit, so "completable" means reachable — never fun, pacing or difficulty.

Two directions, in order. **(a) The combat revamp** — the battle screen is the one screen still
pre-overhaul, and hand-play is suspended (`isClickTargetable` rejects `aoe` and `speed`). Scope
is `intent/combat-revamp.md`, still `draft`. **(b) The company marches together** — the party is
six (ADR-0041) but encounters author 2 / 3 / 4 / 4 / 4 placements. Everything else waits.
Detail lives in ADR-0043, ADR-0038, ADR-0040 and ADR-0041 — read them, not a summary.

---

## STANDING OWNER DIRECTIVES

The calls that shape every slice, not just the next one. Only what is still in force.

| Directive | Source |
|---|---|
| `docs/` outranks the code. A mismatch means the code is wrong, or the doc needs a recorded change | root `CLAUDE.md` |
| Battlefield-first: measured against the 832×328 reference viewport, no persistent UI covers playable tiles at rest (≥75% unobscured) | ADR-0043, ADR-0038 |
| Assert the owner's phone only: 832×328 and 832×384. Other viewports are fluid, not covered | ADR-0041, owner 2026-09-08 |
| For a taste change, approve rendered frames first — and collect **every** note before the engineer starts | owner, 2026-09-08 |
| Never commit or push without the owner's words | owner, 2026-09-01 |
| The party is six, all six will deploy, and there is no deploy toggle | ADR-0041 |
| Combat hand-play stays suspended until the revamp lands | ADR-0041 |
| Mastery is permanent; loadout swaps are free; learned abilities are never lost | `docs/02`, ADR-0002 |
| Determinism is P0 — one seeded PRNG, no wall-clock, no `Math.random` in sim | `docs/05` §3, ADR-0004 |
| The build-diversity gate stays at ≥8 with N=7; it is carried into M1, not weakened | `docs/06` AC-E2, `docs/11` §3 |

---

## NOT GREEN-LIT

Nobody should start these. One line each; the detail lives where the pointer says.

| Item | State | Where the detail lives |
|---|---|---|
| Building the combat revamp | The intent is `draft` and no master frame is approved. Frame first, then go | `intent/combat-revamp.md`, ADR-0043 |
| The enemy retune before six placements exist | Retuning a map you are about to re-author measures nothing | ADR-0027 (suspended by ADR-0041) |
| Filling out the thief and knight skillsets | Thief is entirely `effect-deferred` (zero live actions); knight's tree is 2 of 9 live. `thief-f` stays unwired | ADR-0041 |
| Anything tagged `[DEFERRED]` | Post-1.0 by convention | the docs' tag key |
| The job cut (8 jobs to 5) | A signal, not a decision (owner, 2026-09-05). Needs an ADR | `docs/visual/portraits/reference/README.md`, "Scope" |
| The turn plate under the damage numeral | Open appearance call; render alternatives before asking | ADR-0032 amendment |
| The unit token; team colour on portraits | Still the flat kite; nobody has picked clothing vs chrome | ADR-0030, portraits README |
| The other three screens onto the stage | Only the battle screen was rebuilt onto it | ADR-0043, ADR-0040 |
| Camera pan, pinch, double-tap-to-refit | Tiles are ~30×15 CSS px at 640×300; mis-taps uncovered | `docs/10` §8e |
| Skin B (dark-table stage) | In `stage.css`, not wired into `viewer.html` | `src/render/stage.css` |
| Safe-area insets | Asserted as declared, not working; no notch emulation | `docs/10` AC-V41 |
| Variety score 7 → 8 | Off the priority list (owner, 2026-08-30); AC-E2 stays at 8 | root `CLAUDE.md`, `docs/11` §3 |
| Defects 1 and 2 (the game picks the ability; the healer cannot heal) | Live, nothing red. Slice (b) is what fixes them | `docs/defects.md` §1, §2 |
| The `telemetry.test.ts` flake; test gaps A-H | Not scheduled; none is a shipping bug | `docs/defects.md` §4, §5 |
| The action menu proposal | Owner-deferred; AC-V23…V29 unclaimed | `docs/proposals/action-menu.md` |
| A SessionStart warning for missing remote branches | Declined 2026-09-01; do not re-propose | this line |

---

## OPEN — WAITING ON THE OWNER

Read this before telling the owner "nothing is pending". Three asks are open.

| # | Ask | State | What it unblocks |
|---|---|---|---|
| C | Confirm the v4 settings (ChatGPT app, "high thinking", `style-ref-1..4.png` as Image 1-4), and say why v4 `priest-m` came back 2:3 | open, minor | The run records in `gpt-portrait-prompts.md` stop reading "assumed" |
| F | Play the mobile-landscape gate (ADR-0034) **and** the landscape-phone stage (ADR-0043) on a real iPhone and a real Android phone: does the rotate gate appear in portrait, does the lock button do anything, are the board's tiles tappable in landscape, and what does the ☰ → settings readout print for tile size | open, carried. Every claim about either is Chromium device emulation only | The last unverified claim in `docs/10` AC-V32 and AC-V40 |
| G | **Confirm the Android landscape viewport height.** Tests assert 832×328 and 832×384 only; 328 assumes a ~56px browser bar and nobody has measured it | open, and now **load-bearing**: 832×328 is the combat revamp's reference viewport and every ratio in `intent/combat-revamp.md` assumes it | Whether the revamp's asserted fold, and the briefing's, is the real one |

---

## THE NEXT SLICE — the combat revamp

The character dossier SHIPPED (ADR-0042). The owner then set the revamp ahead of the queue.

### (a) The combat revamp — layout adaptation

**Read `intent/combat-revamp.md` (359 lines).** Below is only what you must know first.

- **It is `draft`.** The owner corrected it but has NOT said go. Nothing is built from it yet.
- **First step: `art-director` draws ONE master 832×328 Attack frame**, the owner approves it,
  then the build. Not four frames; not the build first.
- **Layout adaptation, not new systems.** `Item` and `Defend` ship visibly disabled — no engine
  command exists for either (`CommandSchema` = `move | act | wait`). No consumables, no
  weather, no Level / MP / Discipline fields.
- **Accepted added scope:** a temporary battle-entry plaque, plus five authored `battleTagline`
  strings in the story pack (optional field, no schema bump).
- **Acceptance criterion, the owner's words:** "All selectable battlefield units must have
  functioning mobile hit targets at the reference viewport without persistent HUD intercepting
  their input." A Wizard or Priest that stays untappable is a **blocking defect** for the frame.
- **ADR-0043 owes `docs/10` real work.** AC-V66 is reserved and unwritten; AC-V33 (the 360
  stage) and AC-V42 (letterboxed desktop) are stale. Author all three in this slice.
- **Nine sites are parked** with `DEFERRED (ADR-0041)` — two `it.skip`, seven in `e2e/`. Re-arm
  by deleting the parked line, never by loosening an assertion. Un-parking
  `e2e/stage-capture.spec.ts` rewrites seven deleted `docs/visual/stage/851x324-*.png` frames —
  let the spec write them, do not restore them from git.

### (b) After it — six placements on every map, plus an enemy retune

Owner: "work off the assumption that all battles will have 6 deployed; don't worry about
selection yet." Owner: `content-author` — it has Bash and runs its own tests.

- Six `teamId: 0` placements per encounter, each a `{kind: "ref", recordId}` to a party
  member, on a legal starting tile.
- **Retune the enemies in the same slice.** Doubling battle 1's party without touching the
  foes is a difficulty change nobody decided. Measure, do not guess.
- **Do not re-tune from ADR-0027's numbers.** That profile is suspended, not disproved
  (ADR-0041). Re-measure from scratch after the placements land.
- `campaign-run.test.ts` and `playtest.test.ts` each hold one parked ADR-0027 test. If the
  retune makes the naive party lose the finale again, un-park them; if not, say so.

### Landmines the revamp will hit

- **The board still ships ADR-0037's 360-unit stage** — `stage.ts`, `stage.css`,
  `stage.test.ts`, `e2e/stage.spec.ts`, `e2e/stage-capture.spec.ts`. ADR-0043 lists every site.
- **The "In battle" command list and equipped-passive descriptions are GONE from the campaign
  screen**, deferred here by the owner (2026-09-09). The revamp shows commands for real.
- **Root `CLAUDE.md` and older prose say "13 tests parked".** The tree has nine sites.
- **`AC-V54`'s mockup draws four cards; the party is six.** Those are the row's invariants, not
  four positions. **Nobody has approved a six-card frame.**

### Landmines still live elsewhere

- **`prep-weapon-desc` has no home** — the Main Hand row is 28px at 832×328; a third line fails.
- **The member view is `layout: "dossier"`; `prep.ts` still holds the engine viewer's tabbed
  path.** A change to one is not a change to the other.
- **At desktop widths both dossier columns pack to the top, leaving a large empty band** — unasserted, undesigned; only 832×328 and 832×384 are covered.
- **The `briefView` reset lives in `renderScreens`, not `applyBriefView`** — resetting in the latter yanks the caret out of a `<select>` mid-edit.
- **`mockups/src/build-css.sh` hard-codes `overhaul.css` lines 1254-2551**; the file is 2832 lines, so the appended split block is outside its range.
- **`npm run check:counts` goes red on ANY spec change.** Re-run `test`, then fix the three live claims (`CLAUDE.md`, `README.md`, here).
- **The "In camp" caption is `--ink`, deliberately** — `--ink-soft` is 3.75:1 on the card's ground (`rgb(191, 153, 118)`) and fails AA.
- **`.pennant` and `.finial` are `pointer-events: none`**, so a handler on the row is not observable through a tap.
- **`docs/visual/parchment/`'s two briefing jpgs are stale** — pre-split, four-member.
