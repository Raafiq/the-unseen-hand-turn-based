# Cognitive walkthrough — the first hour, 2026-08-23

**Yes, intuitiveness can be tested without a player — partially.** Two established
inspection methods measure it, and neither needs a recruit:

- **Cognitive walkthrough** (Wharton, Polson, Lewis & Rieman, early 1990s) — built
  specifically to evaluate **learnability**, and built specifically to work without test
  participants. An evaluator steps through every action of a task and asks four questions
  about a first-time, learning-by-doing user.
- **Heuristic evaluation** against a published list. For games, Pinelle, Wong & Stach
  (2008) derived game-specific usability heuristics from 108 reviews of poorly-rated
  games; they cover interface, controls and interaction, deliberately not gameplay.

**What they cannot do, stated up front.** Expert inspection finds *potential* problems.
Early in development heuristic evaluation runs roughly a **50% hit rate with ~50% false
positives**. Inspection and user testing find substantially *different* problem sets — in
one classic comparison, 23 problems were unique to inspection and 4 unique to user
testing, with 17 shared — and user testing tends to surface the *more severe* ones. The
two are complementary. **This pass does not replace a playtest; it is what can be done
before one.**

## The four questions

At each step, for a first-time user:

1. Will they try to achieve the right effect?
2. Will they notice the correct action is available?
3. Will they associate the correct action with the effect they want?
4. If they do it, will they see progress toward the goal?

A "no" at any step is a learnability defect.

## Task 1 — Move a unit

| Q | Verdict |
|---|---|
| 1 | **Pass.** The status line reads "Your turn — click a tile to move, or an enemy to strike". |
| 2 | **Pass.** Reachable tiles are tinted. |
| 3 | **FAIL — the game page has no colour legend.** `index.html` (the engine viewer) defines five legend entries; `game.html` defines none. A newcomer sees orange tiles and one red-tinted set and has to infer what each means. The page that needs the legend is the one without it. |
| 4 | **Pass.** The unit moves, the log gains a row, the clock advances. |

## Task 2 — Attack an enemy

| Q | Verdict |
|---|---|
| 1 | **Pass.** Same status line. |
| 2 | **Weak.** On turn one the enemy is outside everyone's reach, so nothing is highlighted as attackable. A player told "click an enemy to strike" who clicks the enemy gets a refusal instead. The refusal explains itself, but the first instruction a new player follows is one that cannot succeed yet. |
| 3 | Pass. |
| 4 | **Pass.** Damage popup, HP bar, log row. |

## Task 3 — Understand turn order

| Q | Verdict |
|---|---|
| 1 | Pass — the timeline is prominent. |
| 2 | Pass. |
| 3 | **FAIL.** The timeline is captioned `PROJECTED · −80/TURN` and the primary button reads `End Turn · Wait · −60 CT`. "CT" and "−80/TURN" are engine vocabulary on the two most-looked-at controls. The `?` panel explains the clock, but the labels themselves do not, and question 3 is about association at the point of action. |
| 4 | Pass — chips reorder as the clock runs. |

## Task 4 — Equip a weapon

| Q | Verdict |
|---|---|
| 1 | **Pass (fixed this session).** "You own 2 weapons and have none equipped." |
| 2 | Pass. |
| 3 | **Pass (fixed this session).** Options read "Arming Sword — 72 damage, +5% evade". |
| 4 | **FAIL.** The stat strip is HP / PA / MA / MOVE / EVADE. Equipping the **Cestus** (Brave +5) or **Heretic's Edge** (Faith −20) moves **nothing visible** — neither Brave nor Faith nor attack damage is on the strip. The player performs the right action and gets no confirmation it did anything. |

## Task 5 — Buy an ability, then use it

| Q | Verdict |
|---|---|
| 1 | **Weak.** Nothing prompts a purchase; banked AP is shown but not surfaced as spendable. |
| 2 | Pass — the learn list is on screen. |
| 3 | **Pass (fixed this session).** Rows carry a derived description and a `SUPPORT` tag on passives. |
| 4 | **FAIL for passives.** Buying "Hp Boost" adds nothing to "Commands in battle" — correctly, it is a Support. The player must then find the Support dropdown and equip it. The `SUPPORT` tag hints at this; nothing states it. A player who bought a 60-AP passive and sees no change has, from their seat, spent unrefundable currency on nothing. |

## Findings, ranked

> **All four actionable findings were fixed on 2026-08-23.** Finding 5 was accepted as
> intended behaviour, not a defect. Two things worth recording about the fixing:
> the receipt's first draft told a Knight who bought Wave Fist that it was "now in your
> commands" — **false**, because the command list is the current job's skillset plus the
> equipped Secondary — and a test caught it; and the first pass at the jargon reworded
> the End Turn button while leaving the preview panel two inches below reading
> "CT AFTER", which is worse than not fixing it, because the two controls then disagreed.
> Both are the same lesson as the findings themselves: a confident message that is wrong
> costs more than no message.


| # | Severity | Problem | Fix |
|---|---|---|---|
| 1 | **High** | Buying a passive produces no visible change (Task 5, Q4) | After a purchase, say where it went: "Learned — equip it in the Support slot". |
| 2 | **High** | Equipping gear whose value is Brave/Faith shows no feedback (Task 4, Q4) | Put Brave and Faith on the stat strip, and/or show attack damage there. |
| 3 | **Medium** | No tile-colour legend on the game page (Task 1, Q3) | Port the viewer's legend to `game.html`. |
| 4 | **Medium** | "CT" and "−80/TURN" unexplained at the point of use (Task 3, Q3) | Reword to plain language, or add a hover explanation. |
| 5 | **Low** | Turn one's instruction names an action that cannot succeed yet (Task 2, Q2) | Accept — it is a genuine tactical opening, not a UI defect. |

## What this does NOT establish

- **Whether the game is fun, well-paced, or the right difficulty.** Out of scope for both
  methods; only play answers those.
- **Whether these five are the problems a real newcomer would hit.** Roughly half of
  inspection findings are false positives at this stage, and user testing reliably finds
  severe problems that inspection misses entirely.
- **The `docs/08` §3 tutorial bet.** Deliberately not assessed here — deferred by user
  decision. A walkthrough can say whether a control is discoverable; it cannot say whether
  a player who never opens `?` forms a build.
