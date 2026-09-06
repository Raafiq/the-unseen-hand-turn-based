# ADR-0038 — Confirm is a separate tap

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** the owner, 2026-09-05.
- **Supersedes:** `docs/10` §3's **"selecting the target IS the confirm gesture"**.
- **Extends:** ADR-0037 (the landscape-phone stage), ADR-0015 (the folded move+act
  command). Constrained by ADR-0004 (determinism) and `docs/10` §1.
- **Acceptance Criterion:** `docs/10` **AC-V36**. `docs/10` outranks this file.

## Context

`docs/10` §3 makes target selection the commit. Tap an enemy and the turn is spent. The
reasoning was sound on a mouse: the preview (§4) has already shown hit chance, damage and
the Clock price, so there is no blind commit and no redundant "are you sure".

**On a thumb it is a mis-tap that spends a turn.** A finger covers several tiles, the board
is roughly 216 stage units tall after ADR-0037's budget, and there is no hover state to
warn you where the tap will land. The cost of the error is the whole turn, and the sim is
deterministic — there is no undo in the shipped viewer.

XCOM: Enemy Within is the precedent. Every order, move or ability, takes a **second
confirmation tap**, explicitly to stop mis-taps. That is the port the genre agrees worked.

## Decision

**Tapping a target stages it. Confirm commits it. They are two taps.**

| Gesture | Result | Commands emitted |
|---|---|---|
| Tap a legal target | stage it; the preview sheet opens with `docs/10` §4's set | **0** |
| Tap a different legal target | re-stage; the sheet re-renders | **0** |
| Tap **Confirm** in the sheet | commit the turn as staged | **exactly 1** |
| Tap **Cancel** | unstage the target; return to the previous state | **0** |
| Tap the actor | clear the whole draft to turn start | **0** |
| Tap **End Turn** with a target staged | **impossible — the primary button is disabled**, and `Session.endTurn` refuses anyway | **0** |
| Tap a tile with a target staged | inert; no tiles are selectable while a shot is aimed | **0** |
| Tap a unit that is not a legal target | the unit drawer opens read-only for that unit (ADR-0037) | **0** |
| Tap an illegal tile | untimed toast naming the reason | **0** |

Five properties are part of the decision, not implementation detail.

1. **Staging is pure UI intent**, like the staged move already is. Nothing reaches the sim
   until Confirm. `docs/10` §3's "nothing touches the sim until COMMIT" is unchanged — the
   commit point moved, the rule did not.
2. **Still exactly one command per player turn.** The fold (ADR-0015) is untouched: move
   plus act is one `Command` priced −100, and re-staging a target three times still emits
   one.
3. **The keyboard follows the same model.** Staging a target moves focus to the sheet's
   Confirm button, so **Enter** confirms through ordinary focus, not a special key. **Esc**
   cancels. Returning focus to the board re-arms picking. No new key binding is invented,
   and no key path commits without passing through Confirm.
4. **End Turn is unreachable while a target is staged.** The guard is in the session —
   `endTurn` refuses in `TARGET_STAGED` — and the button is disabled so the player never
   reaches for a control whose only answer is a refusal. **Confirm is the one way to spend a
   turn once a shot is aimed**; to end the turn instead, Cancel first. The two commit paths
   are then never both live, which is what keeps "exactly one command per turn" easy to see
   rather than merely true.
5. **Desktop follows the same model.** There is **no mouse-only shortcut that commits on a
   target click.** One model, one code path, one thing to test. Hover previews stay as an
   addition, never as a replacement.

## Consequences

**Easier.** A mis-tap costs a tap, not a turn. The preview sheet gets a reason to exist as
a surface rather than as a hover tooltip. The two-tap model is what every touch reference
in the research brief does.

**What we give up.**

- **One extra tap per turn on desktop**, where mis-clicks were rare. Accepted: two paths
  would be two behaviours to keep honest, and §4's honesty list already shows one copy is
  hard enough.
- **`docs/10` §3's confirm-model bullet is retired**, and every test written against it
  moved in the same slice. A half-landed change here would have left the browser specs
  clicking a target and asserting a command that no longer exists.

**Three pieces of prose in the CODE went false the moment this landed. All three were
rewritten in the build slice — verified 2026-09-05, after the code landed.** Each was a
comment whose own correctness expired silently, which is why they are listed rather than
trusted to be noticed.

| Where | What it used to say | Now |
|---|---|---|
| `src/render/session.ts` | `docs/10 §3's states, verbatim.` over a `Phase` union of **five** states | **Fixed.** Six states, and the docstring now says what keeps "verbatim" true — the union must be §3's table row for row |
| `src/render/session.ts`, `TurnDraft` | "`act` … is only ever populated for the instant of a commit … there is **no state in which a draft sits around holding a chosen-but-uncommitted act**" | **Fixed.** It now says `act` holds a chosen-but-uncommitted target in `TARGET_STAGED`, and that nothing has reached the sim there |
| `src/render/CLAUDE.md`, the single tile-driven mutator rule | "`pointerdown`, keyboard Enter, `clickTile` and `clickCanvas` all bottom out in `Session.onPick`" | **Fixed.** Enter reaches Confirm through focus; the seam routes through `hud.pick`, which either opens the read-only inspect drawer or bottoms out in `onPick` |

Routing Enter through Confirm is what keeps the single-mutator invariant true rather than
approximately true. `onPick` stays the only tile-driven mutator; Confirm is a second
command-emitting path alongside `endTurn()`, which `docs/10` §7 already names.

**The test is a command-log A/B**, and it is the whole criterion (AC-V36):

> Tap a legal target: the log length is **unchanged**, and the staged draft is non-null.
> Then tap Confirm: the log grows by **exactly one**.

*Discriminator:* the wrong behaviour — the one this repo used to ship — emits the command
on the target tap. A test that only asserts "after Confirm a command exists" passes against it, because
the command does exist by then. The load-bearing half is the **zero** after the target tap.
A second half is required too: the staged draft must be non-null between the two taps, or a
viewer that ignores the target tap entirely passes both counts.

## Alternatives considered

- **Long-press to commit.** Rejected: invisible and undiscoverable. **No long-press gesture
  exists in this design at all** — the research brief's zone map sketches one for inspect,
  and ADR-0037 ships inspect as a **plain tap on a non-target unit** instead. Said here
  because an earlier draft of this ADR rejected long-press-to-commit by pointing at a
  long-press-to-inspect that is not being built, which is a reason that would have rotted
  on contact with the code.
- **Confirm on desktop only when touch is detected.** Rejected: two interaction models,
  and the one nobody develops on is the one that rots.
- **A modal "are you sure?" dialog.** Rejected: this is the FFT WotL mobile failure the
  research brief names — confirmation windows stacked on a menu, criticised for fifteen
  years. The sheet is not a dialog; it is where the numbers already live.

## References

- `docs/10` §3 (rewritten), §4 (the preview set the sheet carries), **AC-V36**.
- ADR-0037 (the stage and its zones), ADR-0015 (the folded command and its −100 price).
- The research brief, `art-director` 2026-09-05, §4(c) — XCOM's second confirm.
