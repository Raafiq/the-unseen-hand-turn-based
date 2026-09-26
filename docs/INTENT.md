<!-- written-against: 88a1c46 -->

# INTENT — where this game is going, and what comes next

**Read this after `CLAUDE.md`.** The SessionStart hook prints branch, merge state and unpushed
work; everything it derives is left out here. If the hook says the stamp is stale, treat every
claim below as a hypothesis and re-derive it before acting.
Green at the stamp: 1058 tests, 273 browser specs (`npm run check`).

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

Enemy turns run themselves (ADR-0046). All six deploy on every map (ADR-0044); the
enemy retune shipped (ADR-0045). The win/lose overlay shipped (ADR-0047). **The skill
picker shipped (ADR-0048, uncommitted):** pressing Skill with 2+ learned abilities opens
a chip sheet above the ribbon; picking one paints that skill's own reach, from the sim's
`inAbilityRange`; an unavailable skill (or Attack with no foe in reach) is selectable
with a reason shown, but not executable. `docs/defects.md` §1 and §2 are retired. Next:
Attack shoots at range for a bow (`intent/bow-attack.md`).

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
| The party is six, all six deploy on every map, and there is no deploy toggle | ADR-0041, ADR-0044 |
| Mastery is permanent; loadout swaps are free; learned abilities are never lost | `docs/02`, ADR-0002 |
| Determinism is P0 — one seeded PRNG, no wall-clock, no `Math.random` in sim | `docs/05` §3, ADR-0004 |
| The build-diversity gate stays at ≥8 with N=7; it is carried into M1, not weakened | `docs/06` AC-E2, `docs/11` §3 |

---

## NOT GREEN-LIT

Nobody should start these. One line each; the detail lives where the pointer says.

| Item | State | Where the detail lives |
|---|---|---|
| Battle sprite art | Deferred by the owner (2026-09-12). The diamond tokens are deliberate placeholders. No silhouettes, no animation, no portrait-to-sprite matching | owner's note, this slice |
| Status pips on the unit token | Support reserved next to the token. No panel, nothing drawn yet | owner, 2026-09-12 |
| Filling out the thief and knight skillsets | Thief is entirely `effect-deferred` (zero live actions); knight's tree is 2 of 9 live. `thief-f` stays unwired | ADR-0041 |
| Anything tagged `[DEFERRED]` | Post-1.0 by convention | the docs' tag key |
| The job cut (8 jobs to 5) | A signal, not a decision (owner, 2026-09-05). Needs an ADR | `docs/visual/portraits/reference/README.md`, "Scope" |
| The unit token; team colour on portraits | Still the flat kite; nobody has picked clothing vs chrome | ADR-0030, portraits README |
| The other three screens onto the stage | Only the battle screen was rebuilt onto it | ADR-0043, ADR-0040 |
| Camera pan, pinch, double-tap-to-refit | Still uncovered. Tile faces are ~76×38 CSS px; the 44×44 hit overlay fixed taps, not the camera | `docs/10` §8e |
| Skin B (dark-table stage) | In `stage.css`, not wired into `viewer.html` | `src/render/stage.css` |
| Safe-area insets | Asserted as declared, not working; no notch emulation | `docs/10` AC-V41 |
| The `telemetry.test.ts` flake; test gaps A-H | Not scheduled; none is a shipping bug | `docs/defects.md` §4, §5 |
| The action menu proposal as written | Superseded by the skill picker (ADR-0048) for the chip/reach/reason half; its menu shape, green colour, legend and keyboard/colour-distance halves stay deferred | `docs/proposals/action-menu.md` |
| A SessionStart warning for missing remote branches | Declined 2026-09-01; do not re-propose | this line |

---

## OPEN — WAITING ON THE OWNER

Read this before telling the owner "nothing is pending". Six asks are open; one is parked.

| # | Ask | State | What it unblocks |
|---|---|---|---|
| I | Is `default` (cheapest-anywhere spending) at 1/16 — statistically the same as naive's 0/16 — the intended difficulty, or should the retune re-open headroom for a distinguishable middle band | **PARKED by the owner (2026-09-19): no balance or depth work at this stage — do not ask again until the owner raises it.** Was: open, new this slice | Whether ADR-0027's three-tier "learnable trap" story needs restoring or the two-tier read stands |
| C | Confirm the v4 settings (ChatGPT app, "high thinking", `style-ref-1..4.png` as Image 1-4), and say why v4 `priest-m` came back 2:3 | open, minor | The run records in `gpt-portrait-prompts.md` stop reading "assumed" |
| F | Play the shipped combat shell on a real iPhone and a real Android phone: are the board's tiles tappable, does the rotate gate appear in portrait, does the lock button do anything, and what does ☰ → settings print for tile size | open, carried, and now the biggest unverified claim in the repo. Every statement about the shell is Chromium emulation | `docs/10` AC-V32, AC-V40, and whether the shell is actually playable |
| G | **Confirm the Android landscape viewport height.** Tests assert 832×328 and 832×384 only; 328 assumes a ~56px browser bar and nobody has measured it | open, downgraded: the shell now ships and is asserted at 328, so this is confirmation rather than a blocker. If the real height differs, the band and rail re-fit; the board does not | Whether the asserted fold is the real one |
| J | Which weapon types shoot at range, and how far, for the bow-attack slice | open, new — needs `fft-fidelity` sources | `intent/bow-attack.md`'s scope |
| K | Does Aimed Shot still earn its slot once a bow's basic Attack already shoots | open, new | Whether Aimed Shot needs a redesign once bow-attack ships |
| L | Does weapon-range Attack wait for the full equipment system, or land as a range field on today's inline weapon | open, new | `intent/bow-attack.md`'s implementation shape and whether it needs a schema migration now |

---

## THE NEXT SLICE — chosen by the owner 2026-09-24

| Slice | Intent file | What the owner decided |
|---|---|---|
| Weapon-range Attack | `intent/bow-attack.md` | Basic Attack takes its reach from the weapon held — a bow shoots, a sword hits the next tile. Engine change (schema + golden tests); no balance retune green-lit. Closes `docs/defects.md` §1's remaining row. |

Each intent file ends with the questions the owner has not answered; ask them before the frames, not after.
Frames are approved before an engineer starts (taste rule).

### Shipped: the skill picker (ADR-0048, `intent/skill-picker.md`, uncommitted)

Skill opens a chip sheet above the ribbon for 2+ learned abilities; one skill auto-picks
and skips it; zero shows no chips. Reach paints from `inAbilityRange`, at the actor's tile
or the staged move tile. An unavailable skill (or Attack, no foe in reach) is selectable,
shows its reason in the target plate, but cannot be confirmed. Cancel undoes the most
recent step, not always the picker's own pick. No new engine command. AC-V23…V29 in
`docs/10`. `docs/defects.md` §1 and §2 retired.

### Shipped before this: the win/lose overlay, the enemy retune, self-running enemy turns

Result overlay on every decided battle (ADR-0047, AC-V70…AC-V78). Enemy retune for six
deployed (ADR-0045). Enemy turns run themselves — entering `AI_TURN` arms one `step()`
after a pause the ×1/×2/×3 toggle sets, 800 ms at ×1 (ADR-0046, AC-V68/AC-V69). Nothing
about animation (walking, swings, casts) is green-lit; the toggle scales only the pause.

### Landmines this slice will hit

- **The page-wide `.reason`/`.hint` rules in `index.html` win over scoped plate classes**
  on any property both set — check computed style, not just which class was added.
- **A whole-canvas screenshot diff is not stable on battle 1.** A damage popup stays
  partly drawn across otherwise-identical frames; count reach-hue pixels off the canvas
  buffer instead (`e2e/skill-picker.spec.ts`'s `pinkPixelCount`).
- **The entry plaque banner must be waited out** (`[data-testid="entry-plaque"]` hidden)
  before any stage capture, or the frame shows a fading banner, not a real state.
- **`pickAt` in `hud.ts` opens the inspect drawer for any tap on a non-targetable
  occupant.** "Chips open, tap a foe" is unreachable by a real click — proven at the
  session level (`tapRefusalReason`) instead.
- **The three-chip strip is `max-width: 280px`**, so a third real chip already scrolls;
  do not assume it fits.
- **`AI_TURN` no longer holds still (ADR-0046).** A Playwright spec that pauses inside an
  enemy turn races the real pause. Stub the pacer's scheduler or drive `autoplay`.
- **The rail and band bodies are PINNED to exact colours** in `e2e/contrast.spec.ts` and
  `e2e/contrast-helpers.ts`. A repaint means updating the pinned value in the same edit.
- **`Item` and `Defend` are visible but have NO engine command.** `CommandSchema` stays
  `move | act | wait`. Do not wire them as a side effect of a content slice.
- **The plates pack 3 rows into 50px.** A fourth row clips silently. See
  `src/render/CLAUDE.md`, "in the DOM is not on the screen".
- **`npm run check:counts` goes red on ANY spec change.** Re-run `test`, then fix the
  three live claims (`CLAUDE.md`, `README.md`, here).
- **The result overlay is on the stage root at z-index 9, above every drawer at 8**
  (ADR-0047). A new drawer must sit at ≤8.
- **`AFTER_BATTLE` is reload-only now.** `CampaignShell.retry()` reads `this.screen`
  before it moves to tell a reload apart from an inline-shown outcome beat.
