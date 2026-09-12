<!-- written-against: cc38d12 -->

# INTENT — where this game is going, and what comes next

**Read this after `CLAUDE.md`.** The SessionStart hook prints branch, merge state and unpushed
work; everything it derives is left out here. If the hook says the stamp is stale, treat every
claim below as a hypothesis and re-derive it before acting.
Green at the stamp: 1007 tests, 238 browser specs (`npm run check`).

---

## WHERE THE GAME IS GOING

A turn-based tactics RPG in the shape of Final Fantasy Tactics, whose point is the build:
a 5-slot ability chassis, AP-driven job trees with permanent mastery, and hybrid jobs.

**Built (M0).** A headless sim plus a thin viewer, and one campaign playable start to finish
at `/`: title, one save, five battles, a six-member party that keeps what it earns, scene
text and a prep screen. The **concept look** covers the title screen, the scene player and
the briefing (ADR-0040, ADR-0041, ADR-0042). Nine of ten approved portraits are wired.

**The combat shell SHIPPED this slice** (ADR-0043, commit `cc38d12`). The battle screen is
battlefield-first: a right-side turn-order rail, a bottom band holding the acting unit,
the six-command ribbon and the staged target, and no persistent UI over the board. Hand-play
works again — `isClickTargetable` accepts `aoe` and `speed`, so wizards and priests are
tap-castable. Seven of the nine parked sites were re-armed.

**Not established: that a stranger can play it.** Every automated run drives the balance probe
or a deliberate forfeit, so "completable" means reachable — never fun, pacing or difficulty.
**And the shell has never been played by hand on a real phone** — every claim about it is
Chromium device emulation.

Next: **the company marches together.** The party is six (ADR-0041) but encounters still
author 2 / 3 / 4 / 4 / 4 placements. Everything else waits.

---

## STANDING OWNER DIRECTIVES

The calls that shape every slice, not just the next one. Only what is still in force.

| Directive | Source |
|---|---|
| `docs/` outranks the code. A mismatch means the code is wrong, or the doc needs a recorded change | root `CLAUDE.md` |
| Battlefield-first: measured against the 832×328 reference viewport, no persistent UI covers playable tiles at rest (≥75% unobscured) | ADR-0043 |
| Assert the owner's phone only: 832×328 and 832×384. Other viewports are fluid, not covered | ADR-0041, owner 2026-09-08 |
| For a taste change, approve rendered frames first — and collect **every** note before the engineer starts | owner, 2026-09-08 |
| A brief's listed items are not optional. An agent that hands one back has failed the pass | owner, 2026-09-12 |
| Never commit or push without the owner's words | owner, 2026-09-01 |
| The party is six, all six will deploy, and there is no deploy toggle | ADR-0041 |
| Mastery is permanent; loadout swaps are free; learned abilities are never lost | `docs/02`, ADR-0002 |
| Determinism is P0 — one seeded PRNG, no wall-clock, no `Math.random` in sim | `docs/05` §3, ADR-0004 |
| The build-diversity gate stays at ≥8 with N=7; it is carried into M1, not weakened | `docs/06` AC-E2, `docs/11` §3 |

---

## NOT GREEN-LIT

Nobody should start these. One line each; the detail lives where the pointer says.

| Item | State | Where the detail lives |
|---|---|---|
| Battle sprite art | Deferred by the owner (2026-09-12). The diamond tokens are deliberate placeholders. No silhouettes, no animation, no portrait-to-sprite matching | owner's note, this slice |
| The win / lose overlay | Named as an overlay state that takes over interaction. Reserved, not built; `OBJECTIVE_BANNER` is still the only terminal prose | ADR-0043, owner 2026-09-12 |
| Status pips on the unit token | Support reserved next to the token. No panel, nothing drawn yet | owner, 2026-09-12 |
| Filling out the thief and knight skillsets | Thief is entirely `effect-deferred` (zero live actions); knight's tree is 2 of 9 live. `thief-f` stays unwired | ADR-0041 |
| Anything tagged `[DEFERRED]` | Post-1.0 by convention | the docs' tag key |
| The job cut (8 jobs to 5) | A signal, not a decision (owner, 2026-09-05). Needs an ADR | `docs/visual/portraits/reference/README.md`, "Scope" |
| The unit token; team colour on portraits | Still the flat kite; nobody has picked clothing vs chrome | ADR-0030, portraits README |
| The other three screens onto the stage | Only the battle screen was rebuilt onto it | ADR-0043, ADR-0040 |
| Camera pan, pinch, double-tap-to-refit | Still uncovered. Tile faces are ~76×38 CSS px; the 44×44 hit overlay fixed taps, not the camera | `docs/10` §8e |
| Skin B (dark-table stage) | In `stage.css`, not wired into `viewer.html` | `src/render/stage.css` |
| Safe-area insets | Asserted as declared, not working; no notch emulation | `docs/10` AC-V41 |
| Defects 1 and 2 (the game picks the ability; the healer cannot heal) | Live, nothing red. The next slice is what fixes them | `docs/defects.md` §1, §2 |
| The `telemetry.test.ts` flake; test gaps A-H | Not scheduled; none is a shipping bug | `docs/defects.md` §4, §5 |
| The action menu proposal | Owner-deferred; AC-V23…V29 unclaimed | `docs/proposals/action-menu.md` |
| A SessionStart warning for missing remote branches | Declined 2026-09-01; do not re-propose | this line |

---

## OPEN — WAITING ON THE OWNER

Read this before telling the owner "nothing is pending". Three asks are open.

| # | Ask | State | What it unblocks |
|---|---|---|---|
| C | Confirm the v4 settings (ChatGPT app, "high thinking", `style-ref-1..4.png` as Image 1-4), and say why v4 `priest-m` came back 2:3 | open, minor | The run records in `gpt-portrait-prompts.md` stop reading "assumed" |
| F | Play the shipped combat shell on a real iPhone and a real Android phone: are the board's tiles tappable, does the rotate gate appear in portrait, does the lock button do anything, and what does ☰ → settings print for tile size | open, carried, and now the biggest unverified claim in the repo. Every statement about the shell is Chromium emulation | `docs/10` AC-V32, AC-V40, and whether the shell is actually playable |
| G | **Confirm the Android landscape viewport height.** Tests assert 832×328 and 832×384 only; 328 assumes a ~56px browser bar and nobody has measured it | open, downgraded: the shell now ships and is asserted at 328, so this is confirmation rather than a blocker. If the real height differs, the band and rail re-fit; the board does not | Whether the asserted fold is the real one |

---

## THE NEXT SLICE — six on every map, an enemy retune, and enemy turns that run themselves

Owner: "work off the assumption that all battles will have 6 deployed; don't worry about
selection yet." Owner: use `content-author` — it has Bash and runs its own tests.

- Six `teamId: 0` placements per encounter, each a `{kind: "ref", recordId}` to a party
  member, on a legal starting tile. Five encounters, today 2 / 3 / 4 / 4 / 4.
- **Retune the enemies in the SAME slice.** Tripling battle 1's party without touching the
  foes is a difficulty change nobody decided. Measure, do not guess.
- **Do not re-tune from ADR-0027's numbers.** That profile is suspended, not disproved
  (ADR-0041). Re-measure from scratch after the placements land.
- `campaign-run.test.ts` and `playtest.test.ts` each hold one parked ADR-0027 test — the
  last two `DEFERRED (ADR-0041)` sites in the tree. If the retune makes the naive party lose
  the finale again, un-park them; if not, say so out loud.
- The turn-order rail shows six chips today against fewer real units. Six live placements is
  the first time it carries a full friendly side — check it at both viewports.

### And: the enemy acts on its own (owner, 2026-09-12)

Owner: "make it such that enemy auto acts without player having to click a button." Today an
AI turn waits for an explicit Step tap. That is a real interruption six times a round once
both sides field six, so it lands with the placements, not after.

- **This contradicts a written determinism claim and therefore needs an ADR FIRST.** Root
  `CLAUDE.md` cites "AI turns advance on an explicit Step" as the reason `session.ts`'s
  command log can never be a function of elapsed time. That sentence is load-bearing and
  must be rewritten in the same slice, not left to rot.
- **The invariant that must survive:** the command LOG is identical whether a human tapped
  Step or a timer did, at any frame rate, on any machine, including a machine that stalls
  mid-turn. A timer may only *trigger* one step. It may never batch by elapsed time, never
  decide how many steps to take, and never reach the seeded PRNG.
- **The test that can come out the other way:** run the same battle twice — once driven
  synchronously through the existing Step seam, once through the timer path — and assert the
  two command logs are byte-identical. A test that only checks "the AI eventually moved"
  passes whether or not the timer corrupted the order.
- `npm run check:rng` does NOT scan `session.ts`; it covers `src/sim` and
  `src/render/playtest.ts` only. A wall-clock read added here is invisible to the guard and
  must be caught by the A/B above. Consider extending the guard's file list in this slice.
- Presentation questions the owner has not answered: whether the pause is skippable by
  tapping, and what happens when several AI units act back to back. Render the options
  before asking — a delay is a feel decision, not a prose one.

**The pause is governed by a ×1 / ×2 / ×3 speed toggle (owner, 2026-09-12).** This promotes
the speed toggle from P3 (`docs/08` §1), where it has sat unshipped, into this slice.

- ×1 carries "an appropriate pause" — the owner's words; the actual number is unset and is
  a feel decision, so put two or three speeds in front of them running in the real game.
- **Be honest about what it scales today: only the AI pause.** Every action resolves
  instantly, so there is nothing else for a multiplier to act on yet. It is still worth
  building now because it becomes the single dial future animation reads.
- The owner's stated intent for that future: walking, weapon swings, spell casts
  (2026-09-12). Nothing about animation is green-lit or designed — do not start it.
- **The multiplier must never reach the sim.** It changes how long a step is WATCHED, never
  what the step does, how many steps run, or any seeded roll. The byte-identical command-log
  A/B above must pass at every speed, not only at ×1 — assert all three, because a bug that
  only appears at ×3 passes a ×1-only test.
- ADR-0032's board motion already honours reduced motion through a `matchMedia` branch. A
  speed toggle and a reduced-motion preference can disagree; decide which wins in the ADR,
  do not leave it to whichever code path runs last.

### Landmines this slice will hit

- **The rail and band bodies are PINNED to exact colours** in `e2e/contrast.spec.ts` and
  `e2e/contrast-helpers.ts` (`GROUNDS.ironFrame`, `GROUNDS.plate`, asserted disjoint). A
  repaint means updating the pinned value in the same edit — never loosening the check.
- **`Item` and `Defend` are visible but have NO engine command.** `CommandSchema` stays
  `move | act | wait`. Do not wire them as a side effect of a content slice.
- **The plates pack 3 rows into 50px.** A fourth row clips silently — that is how the unit
  name shipped invisible. See `src/render/CLAUDE.md`, "in the DOM is not on the screen".
- **`851x324-target-staged.png` taps the forecast sheet OPEN on purpose.** Read
  `e2e/stage-capture.spec.ts` before reading a frame as a bug.
- **`npm run check:counts` goes red on ANY spec change.** Re-run `test`, then fix the three
  live claims (`CLAUDE.md`, `README.md`, here).
- **`mockups/src/build-css.sh` hard-codes `overhaul.css` lines 1254-2551**; the file is
  longer, so the appended split block is outside its range.
- **`.pennant` and `.finial` are `pointer-events: none`**, so a handler on the row is not
  observable through a tap.
- **`docs/visual/parchment/`'s two briefing jpgs are stale** — pre-split, four-member.
