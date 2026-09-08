<!-- written-against: 808e9a7 -->
<!-- 808e9a7 is the branch head. THE SLICE THIS FILE DESCRIBES IS UNCOMMITTED: the
     two-view briefing, the six-member party and the 13 parked tests are in the working
     tree only, so `git show 808e9a7` will not contain them. Read the tree, not the ref. -->

# NEXT - the handoff a machine can't derive

**Read this after `CLAUDE.md`.** The SessionStart hook prints branch, merge state and unpushed work.
This file holds only the next slice: what it is, what it waits on, and what will bite.
If the hook says the stamp is stale, treat every claim here as a hypothesis and re-derive it.
Green in the working tree: 994 tests, 196 browser specs (`npm run check`).

---

## OPEN - WAITING ON THE OWNER

Read this before telling the owner "nothing is pending". Three asks are open.

| # | Ask | State | What it unblocks |
|---|---|---|---|
| C | Confirm the v4 settings (ChatGPT app, "high thinking", `style-ref-1..4.png` as Image 1-4), and say why v4 `priest-m` came back 2:3 | open, minor | The run records in `gpt-portrait-prompts.md` stop reading "assumed" |
| F | Play the mobile-landscape gate (ADR-0034) **and** the landscape-phone stage (ADR-0037) on a real iPhone and a real Android phone: does the rotate gate appear in portrait, does the lock button do anything, are the board's tiles tappable in landscape, and what does the ☰ → settings readout print for tile size | open, carried. Every claim about either is Chromium device emulation only | The last unverified claim in `docs/10` AC-V32 and AC-V40 |
| G | **Confirm the Android landscape viewport height.** Tests now assert 832×328 and 832×384 only; 328 assumes a ~56px browser bar and nobody has measured it | open, blocks nothing today | Whether the briefing's only asserted fold is the real one |

---

## THE NEXT SLICE - two halves, in this order

### (a) Six player placements on every map, plus an enemy retune

Owner: "work off the assumption that all battles will have 6 deployed; don't worry about
selection yet." The party is six (ADR-0041) but the encounters still author **2 / 3 / 4 /
4 / 4** player placements across battles 1-5. The party view states that honestly today;
this slice makes it six everywhere.

Owner: `content-author` (it now has Bash and runs its own tests).

- Six `teamId: 0` placements per encounter, each a `{kind: "ref", recordId}` to a party
  member, on a legal starting tile.
- **Retune the enemies in the same slice.** Doubling battle 1's party without touching the
  foes is a difficulty change nobody decided. Measure, do not guess.
- **Do not re-tune from ADR-0027's numbers.** That profile is suspended, not disproved
  (ADR-0041). Re-measure from scratch after the placements land.
- `campaign-run.test.ts` and `playtest.test.ts` each hold one parked ADR-0027 test. If the
  retune makes the naive party lose the finale again, un-park them; if not, say so.

### (b) The combat revamp: tap-casting for `aoe` / `speed` abilities

This un-parks the other eleven. `isClickTargetable` (`src/render/preview.ts`) rejects any
ability carrying `aoe` or `speed`, so a wizard and a priest have **no tap-castable action
at all**. Kest (wizard) acts first on battle 1, so the campaign page cannot reach a staged
target: `/`'s AC-V34 / AC-V36 / AC-V37 cases and the five-state frame walk are all parked.

- Grep `DEFERRED (ADR-0041)` for the exact list; ADR-0041 holds it as a table.
- **Re-arm by deleting the `test.fixme` line, never by loosening an assertion.**
- Un-parking `e2e/stage-capture.spec.ts` restores seven `docs/visual/stage/851x324-*.png`
  frames the parking deleted. Let the spec write them; do not restore them from git.
- Owner has not scoped the revamp. Ask before designing it.

---

## LANDMINES IN THE TREE YOU ARE ABOUT TO TOUCH

- **The `briefView` reset lives in `renderScreens`, not `applyBriefView`.** Every ordinary
  repaint calls the latter; resetting there yanks the caret out of a `<select>` mid-edit.
- **`docs/visual/concepts/mockups/src/build-css.sh` hard-codes `overhaul.css` lines
  1254-2551.** The file is 2832 lines now, so the appended split block is outside its range
  and the script will silently miss it.
- **`npm run check:counts` goes red on ANY spec change.** It reads the summary the last
  `test` run wrote. Run `bash scripts/quiet.sh npm run check:counts` after editing, and fix
  the three live claims (`CLAUDE.md`, `README.md`, this file).
- **The "In camp" caption is `--ink`, deliberately.** `--ink-soft` measures 3.75:1 on the
  card's own ground (`rgb(191, 153, 118)`) and fails AA. Do not soften it.
- **`.pennant` and `.finial` are `pointer-events: none`.** They are decorative and
  `aria-hidden`, so "is the handler on the row or on the button" is **not observable**
  through a tap — a test that clicks the deepest node cannot tell the two apart.
- **`AC-V54`'s mockup draws four cards; the party is six.** The pinned values are the row's
  invariants (first left edge, last right edge, top, equal tracks), not four positions.
  Re-recording six measured positions off the running build would assert whatever the CSS
  did. **Nobody has approved a six-card frame** — the card is 123px where the frame drew 187.
- **Only 832×328 and 832×384 are asserted for the briefing.** 640×300, 851×324 and
  1000×780 are fluid but uncovered; a regression there goes green.
- **`docs/visual/parchment/`'s two briefing jpgs are stale** — pre-split, four-member. The
  README says so; re-shoot rather than describing them as current.

---

## NOT GREEN-LIT

One line each. The detail lives where the pointer says.

| Item | State | Where the detail lives |
|---|---|---|
| Battle-screen combat poses in the new look | The one screen still pre-overhaul. Owner has not picked it | ADR-0040; `docs/visual/concepts/Combat scene (*).png` |
| The job cut (8 jobs to 5) | A signal, not a decision (owner, 2026-09-05). Needs an ADR | `docs/visual/portraits/reference/README.md`, "Scope" |
| The turn plate under the damage numeral | Open appearance call; render alternatives before asking | ADR-0032 amendment |
| The unit token | Still the flat kite; bundled with the portraits | ADR-0030 |
| Team colour on portraits | Answerable now that nine crops are wired; nobody has picked clothing vs chrome | `docs/visual/portraits/reference/README.md` |
| `thief-f`, the one unwired portrait | Thief has zero live actions, so no party member can be one | ADR-0041 |
| The other three screens onto the stage | Only the battle screen was rebuilt onto it | ADR-0037, ADR-0040 |
| Camera pan, pinch, double-tap-to-refit | Tiles are ~30x15 CSS px at 640x300, exempt from the 44px floor; mis-taps uncovered | ADR-0037 |
| Skin B (dark-table stage option) | Appended to `stage.css`, not wired into `viewer.html` | `src/render/stage.css` |
| Safe-area insets | Asserted as declared, not working; Playwright cannot emulate a notch | `docs/10` AC-V41 |
| The web manifest ships with no icon set | Deliberate, per AC-V32 | `docs/10` AC-V32 |
| Defects 1 and 2 (the game picks the ability; the healer cannot heal) | Live, nothing red. Slice (b) above is what fixes them | `docs/defects.md` §1, §2 |
| The `telemetry.test.ts` flake; test gaps A-H | Not scheduled; none is a shipping bug | `docs/defects.md` §4, §5 |
| Variety score 7 to 8 | Off the priority list (owner, 2026-08-30); AC-E2 stays at 8 | root `CLAUDE.md`, `docs/11` §3 |
| The action menu proposal | Owner-deferred; AC-V23…V29 unclaimed | `docs/proposals/action-menu.md` |
| A SessionStart warning for missing remote branches; more retrospective edits | Declined 2026-09-01; do not re-propose | this line |

---

## WHERE THE HISTORY LIVES

| Topic | Home |
|---|---|
| The two-view briefing, the six-member party, the 13 parked tests | ADR-0041, `docs/10` §6c + AC-V51…AC-V61 |
| The concept renders, look-only ruling, screen order | `docs/visual/concepts/README.md`, ADR-0040 |
| Title screen, scene player | ADR-0040 + amendment, `docs/10` AC-V44…AC-V50 |
| Portrait wiring, boot checks, crop boxes, per-file verdicts | ADR-0039, `docs/visual/portraits/reference/README.md` |
| GPT prompts, run records, why not Midjourney | `docs/visual/portraits/gpt-portrait-prompts.md`, ADR-0034, ADR-0035 |
| The mobile-landscape gate and the orientation lock | ADR-0034, `docs/10` §7b, AC-V30…AC-V32 |
| The landscape-phone stage; Confirm as a separate tap | ADR-0037, ADR-0038, `docs/10` §8, AC-V33…AC-V42 |
| Live defects and open test gaps | `docs/defects.md` |
| Landed slices | `git log`, `npm run state` |
| Engine, content, viewer and environment traps | `src/sim/CLAUDE.md`, `data/CLAUDE.md`, `src/render/CLAUDE.md`, root `CLAUDE.md` |
