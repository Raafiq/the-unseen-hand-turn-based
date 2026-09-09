<!-- written-against: 4fe3abb -->
<!-- 4fe3abb merges the INTENT.md migration (PR #64's two commits, which had landed on the
     already-merged prep-screen branch, not main) onto main. No code or data changed. -->

# INTENT — where this game is going, and what comes next

**Read this after `CLAUDE.md`.** The SessionStart hook prints branch, merge state and unpushed
work; everything it derives is left out here. If the hook says the stamp is stale, treat every
claim below as a hypothesis and re-derive it before acting.
Green at the stamp: 994 tests, 196 browser specs (`npm run check`).

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

The owner has set two directions. Everything else waits behind them.

**(a) The combat revamp.** The battle screen is the one screen still pre-overhaul, and combat
hand-play is suspended: `isClickTargetable` rejects `aoe` and `speed`, so a wizard and a
priest have no tap-castable action at all. The revamp puts the battle screen in the concept
look and makes those abilities castable by tap. It un-parks the 13 tests marked
`DEFERRED (ADR-0041)`. Scope is not written yet — ask the owner before designing it.

**(b) The company marches together.** The party is six (ADR-0041) but the encounters still
author 2 / 3 / 4 / 4 / 4 player placements. Six placements on every map, plus the enemy
retune that doubling battle 1 demands.

Detail lives in ADR-0037, ADR-0038, ADR-0040 and ADR-0041 — read them rather than a summary.

---

## STANDING OWNER DIRECTIVES

The calls that shape every slice, not just the next one. Only what is still in force.

| Directive | Source |
|---|---|
| `docs/` outranks the code. A mismatch means the code is wrong, or the doc needs a recorded change | root `CLAUDE.md` |
| Build phone-landscape first, on a fixed-height stage; the board is never covered at rest | ADR-0037, ADR-0038 |
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
| The battle screen in the new look | Owner has not picked it. Do not port it early | ADR-0040; `docs/visual/concepts/Combat scene (*).png` |
| The enemy retune before six placements exist | Retuning a map you are about to re-author measures nothing | ADR-0027 (suspended by ADR-0041) |
| Filling out the thief and knight skillsets | Thief is entirely `effect-deferred` (zero live actions); knight's tree is 2 of 9 live. `thief-f` stays unwired | ADR-0041 |
| Anything tagged `[DEFERRED]` | Post-1.0 by convention | the docs' tag key |
| The job cut (8 jobs to 5) | A signal, not a decision (owner, 2026-09-05). Needs an ADR | `docs/visual/portraits/reference/README.md`, "Scope" |
| The turn plate under the damage numeral | Open appearance call; render alternatives before asking | ADR-0032 amendment |
| The unit token; team colour on portraits | Still the flat kite; nobody has picked clothing vs chrome | ADR-0030, portraits README |
| The other three screens onto the stage | Only the battle screen was rebuilt onto it | ADR-0037, ADR-0040 |
| Camera pan, pinch, double-tap-to-refit | Tiles are ~30×15 CSS px at 640×300; mis-taps uncovered | ADR-0037 |
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
| F | Play the mobile-landscape gate (ADR-0034) **and** the landscape-phone stage (ADR-0037) on a real iPhone and a real Android phone: does the rotate gate appear in portrait, does the lock button do anything, are the board's tiles tappable in landscape, and what does the ☰ → settings readout print for tile size | open, carried. Every claim about either is Chromium device emulation only | The last unverified claim in `docs/10` AC-V32 and AC-V40 |
| G | **Confirm the Android landscape viewport height.** Tests now assert 832×328 and 832×384 only; 328 assumes a ~56px browser bar and nobody has measured it | open, blocks nothing today | Whether the briefing's only asserted fold is the real one |

---

## THE NEXT SLICE — the character dossier (owner, 2026-09-08)

Owner: "Our next slice will be about the character details." The six-deploy half and the
combat revamp below are **deferred behind it**, in that order, not cancelled.

The whole ask, every owner note and the owner's decisions are in
`intent/character-dossier.md` (status: accepted). The approved mockup is
`docs/visual/concepts/mockups/dossier-832x{328,384}.png`, source `mockups/src/dossier.html`.
Read the intent file's five sections, not the verbatim briefs below them.

- One dossier, no tabs: a 1×6 portrait rail, left column Identity / Stats / Profile, right
  column Gear / Skills (Active | Passive side by side) / Job Customization. No Deploy here.
- Breaks ADR-0041's tabbed member detail: a new ADR, plus `docs/10` AC-V51…AC-V61 rewritten.
- Six lore lines go in the story pack (`content-author`); no test may pin the prose.
- "Reaction" stays; "Counter" in the briefs is not a rename. No level, no armor slots.
- Build order: content-author (lore) → viewer-engineer (one pass, to the frames) →
  reviewer → fixes → docs-steward → retrospective → PR.

## THE SLICES AFTER — two halves, in this order

### (a) Six player placements on every map, plus an enemy retune

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

### (b) The combat revamp

Un-parks the other eleven tests. Kest (wizard) acts first on battle 1, so the campaign page
cannot reach a staged target: `/`'s AC-V34 / AC-V36 / AC-V37 cases and the five-state frame
walk are all parked. Grep `DEFERRED (ADR-0041)`; ADR-0041 holds the list as a table.

- **Re-arm by deleting the `test.fixme` line, never by loosening an assertion.**
- Un-parking `e2e/stage-capture.spec.ts` restores seven `docs/visual/stage/851x324-*.png`
  frames the parking deleted. Let the spec write them; do not restore them from git.

### Landmines in the files both halves touch

- **The `briefView` reset lives in `renderScreens`, not `applyBriefView`.** Resetting in the
  latter yanks the caret out of a `<select>` mid-edit.
- **`docs/visual/concepts/mockups/src/build-css.sh` hard-codes `overhaul.css` lines
  1254-2551.** The file is 2832 lines, so the appended split block is outside its range.
- **`npm run check:counts` goes red on ANY spec change.** It reads the summary the last
  `test` run wrote. Re-run it, then fix the three live claims (`CLAUDE.md`, `README.md`, here).
- **The "In camp" caption is `--ink`, deliberately.** `--ink-soft` measures 3.75:1 on the
  card's ground (`rgb(191, 153, 118)`) and fails AA. Do not soften it.
- **`.pennant` and `.finial` are `pointer-events: none`.** "Handler on the row or the button"
  is not observable through a tap.
- **`AC-V54`'s mockup draws four cards; the party is six.** The pinned values are the row's
  invariants, not four positions. **Nobody has approved a six-card frame.**
- **`docs/visual/parchment/`'s two briefing jpgs are stale** — pre-split, four-member.
