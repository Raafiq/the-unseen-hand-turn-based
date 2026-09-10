# Intent: the combat revamp — the concept combat screen, fitted to a landscape phone
Author: the owner. Date: 2026-09-10. Status: draft.

> The owner's brief said "ADR-0037 requirements". ADR-0037 is superseded in full by
> **ADR-0043** (2026-09-09); the rules listed below are ADR-0043's, and it is cited
> throughout. That is the only correction made to the brief.

## Problem

**This is an adaptation task, not a redesign task.** The existing combat images in
`docs/visual/concepts/Combat scene (*).png` are the visual and interaction source of truth.
ADR-0043 constrains how that design fits a short landscape phone; it does **not** authorize
replacing the established combat UI with a generic mobile HUD.

The battle screen is the one screen still pre-overhaul. Its concept composition was drawn at
1672×941 and does not fit 832×328 as drawn.

## Proposed outcome

**ONE master phone combat frame.** Do not independently redesign the six commands. Establish
one fixed 832×328 shell first. Conceptually:

```
┌─────────────────────────────────────────────────────┬──────┐
│                                                     │ TURN │
│                 BATTLEFIELD                         │ORDER │
│                                                     │ RAIL │
├──────────────┬──────────────────────┬───────────────┤      │
│ ACTIVE UNIT  │   CONTEXT ACTION     │ TARGET UNIT   │      │
└──────────────┴──────────────────────┴───────────────┴──────┘
```

Conceptual, not a request for three generic rectangles — translate the zones into the
established parchment/steel/tapestry language. The battlefield rectangle **ENDS above** the
persistent bottom region; the bottom HUD does not sit on top of playable tiles. The
turn-order rail occupies reserved width.

**No persistent top strip.** Preserve the INFORMATION, not the dedicated top panel. At
832×328 do not reserve a full-width persistent top HUD strip. Move compact Turn / objective
state into the **top of the right-side turn-order rail** where practical. The battle name may
appear during battle entry, or through contextual battle information — not by occupying
permanent battlefield height. On larger viewports a top treatment may return **if** the
battlefield-ratio requirement still passes. Do not sacrifice battlefield area simply to
reproduce the desktop concept's top panel.

**The battle name gets a temporary entry plaque — NEW work.** Nothing like it ships today:
the only battle-screen banner is terminal outcome prose (`src/render/session.ts:149`
`OBJECTIVE_BANNER`), and the battle name appears only on the briefing (`game.ts:633`). This
is **added scope**, not a re-style.

| Aspect | Rule |
|---|---|
| Placement | compact plaque centred near the top of the battlefield; **may temporarily overlap** the board because it appears only during the intro |
| Layout cost | reserve **no** permanent height; add **no** persistent top HUD bar |
| Size at 832×328 | roughly **40–48 px tall**, width at most ~**45–50%** of the screen, with top clearance for safe-area insets |
| Look | weathered parchment face; blackened-steel / iron trim; small rivets; restrained medieval serif/calligraphic type; muted gold/ochre accents only where apt. No modern translucent HUD panel, no flat mobile-app card |
| Content | battle name dominant, the authored tagline secondary and smaller. **No turn number.** e.g. `THE RUINS OF GREYHOLM` / `Clear the field` |
| Timing | appears as the battle loads; holds ~**1–2 s or until the intro transition completes**; then fades or slides away cleanly, leaving no empty space |
| After | the battle name is no longer permanently visible; turn/objective status lives in the top of the turn-order rail; the top of the battlefield stays clear |

**Never** put the battle name permanently in the command ribbon, a full-width top bar, the
turn rail as a large title, or a persistent overlay over playable tiles. The intent:
*cinematic battle identification on entry → clean battlefield during play.*

The name is real data: `campaign-shell.ts:286` `sceneTitle()` reads the story pack's optional
`entries[].title`, with `campaign-data.ts:339` `battleTitle(encounterId)` as the honest
fallback.

**The second line is authored copy, never derived — `battleTagline`.** No readable objective
string exists in the repo, so one short authored line per battle is added. The owner offered
`entrySubtitle` as an alternative name; this file settles on **`battleTagline`** so the spec
pass has no ambiguity.

| Rule | Decision |
|---|---|
| Not objective text | It is **not** generated from the victory/defeat rules and is **not** mechanically authoritative. Do NOT name it `objectiveText` |
| No converter | **Do not build a system that turns objective rules into prose.** This is the load-bearing half of the decision |
| Voice | one short phrase, preferably one line at 832×328, **atmospheric/narrative rather than instructional**; need not encode the victory condition |
| Optional | a battle that genuinely needs none has none. **Absent → the plaque renders the name alone, on one line, and does not reserve the empty row** (`src/render/CLAUDE.md`'s absent-not-zero rule) |
| Where | the **story pack**, as `entries[].battleTagline`, beside the existing `title` (`src/sim/story.ts:170`). It is narrative copy, and narrative belongs in the swappable pack, not in encounter systems data |
| Schema | **No version bump, no migration.** An additive optional field cannot invalidate prior data — the exact precedent `story.ts:105` sets for `lore`. `StoryEntrySchema` is `.strict()`, so only the new build accepts the new key |
| Testing | `check:story` forbids asserting a literal phrase from `data/campaign/story/*.story.json`. Test it through a **fixture pack**, as AC-M4's A/B already does in `campaign-shell.test.ts` |

**Accepted added scope:** the entry plaque itself, plus five short authored strings — one per
battle. `content-author` writes the copy in the build slice; this file records no taglines.

**Critical behaviour.** The battlefield viewport stays geometrically stable across normal
interaction states. Selecting any of the six commands must NOT make the battlefield jump,
resize vertically, or change camera framing merely because a different command was chosen.
Same shell; transform the contents of the contextual HUD. (ADR-0043's reserved AC-V66 row 5
names "Attack, Magic, Item and Defend"; there is no top-level Magic — Skill covers it. The
doc pass re-words that row.)

**Deliverable order.** Produce the master 832×328 frame first, using **Attack targeting** as
the representative state, because it exercises all three zones. Before propagating to the other
five commands, verify: usable viewport calculation correct; battlefield ≥75%; no persistent
HUD covers playable tiles; right turn-order rail preserved; attacker/action/defender hierarchy
survives; parchment/steel/tapestry identity survives; battlefield still visually dominant;
text readable; touch controls viable; and the result clearly reads as a **compressed version
of the existing combat screens**, not a new combat UI. Then derive the rest as states of the
same frame.

### The command model — six states of one shell

The canonical top-level ribbon is **Move · Attack · Skill · Item · Defend · Wait**. **There is
no top-level "Magic" command.** The Magic concept image is a state reached through
`Skill → skillset/ability → White Magic / Holy → targeting`. All six use the SAME master
shell; changing command must not resize or jump the battlefield.

**Six buttons, three commands.** `src/sim/driver.ts:75` `CommandSchema` is `move | act | wait`
— nothing else. Item and Defend map to **nothing**, so they ship greyed out (option A, owner).
**Do not remove them from the ribbon**, and do not implement the missing mechanics.

| Button | Engine command | State |
|---|---|---|
| Move | `{kind:"move"}` | movement range on the battlefield; contextual Confirm/Cancel as required |
| Attack | `{kind:"act"}`, `basic.attack` | attacker → attack action → defender targeting |
| Skill | `{kind:"act"}`, chosen ability | select available skill/ability, then its battlefield targeting/AoE state. White Magic/Holy is one example |
| Item | **none** | **disabled** — greyed, dormant, no state |
| Defend | **none** | **disabled** — the concept's diagonal facing selection waits for a command that does not exist |
| Wait | `{kind:"wait"}` | end/wait action in the same compact contextual region; no separate large panel |

### Per-state adaptation

| State | Preserve | Adapt |
|---|---|---|
| Attack | attacker→action→defender composition; crimson weapon-range tiles; trajectory/target relationship on the board; selected Attack treatment; both combatant identities | large lower corner dossiers become compact confrontation plates; only immediate combat information; deeper stats/forecast open contextually. Do not remove the two-sided confrontation feel |
| Skill (incl. Magic) | White Magic / Holy context; spell targeting directly on the battlefield; geometric AoE visualisation; caster and target identities | the tall parchment spell selector cannot permanently consume battlefield height. Current skill/ability selection sits in the compact central region; a larger list opens after explicit interaction and may temporarily overlap the board. When closed, return to the same master geometry |
| Item | its ribbon position and the concept's horizontal layout language, as reference only | **disabled/unavailable.** No Potion, Ether, item type, quantity or inventory plumbing in this slice — see "Only systems that exist" below |
| Defend / facing | **Reference only — the command is disabled this slice.** When it is built: selection ring at the unit's feet; four SMALL sharp gold chevrons on the DIAGONAL/isometric tile axes; the chosen facing gets the gold ember highlight; the character turns to match; the board stays clean; the compact parchment instruction "Select Facing Direction to End Turn" | do NOT revert to four huge arrows, floating cross-shaped arrows, or giant directional UI. No need to preserve an empty lower-right parchment card just because the concept image had one — let the fixed HUD use that space while preserving the shell |

## Affected users and systems

Everyone who plays on a phone; every combat interaction. The screen must still visibly belong
to the same application as Party Management, Character Details, Inventory and the other Unseen
Hand interfaces.

| Area | What moves |
|---|---|
| `src/render/` | the battle stage, HUD, drawer, board camera — the whole battle screen |
| `docs/10` | AC-V66 is reserved by ADR-0043 and must be authored here; AC-V33 (360 stage) and AC-V42 (letterboxed desktop) are stale and re-authored |
| Concept art | `Combat scene (Attack / Spells / Item / Defend / Move).png` are the reference, not the target dimensions |
| Sim | **Only the minimum.** Items, weather and a facing command stay unbuilt — Item and Defend ship disabled. The untappable-unit fix is in scope, its cause only |

## Constraints

**Reference viewport: 832 × 328 landscape.** ADR-0043's rules: subtract all applicable
safe-area insets first; resting unobscured playable battlefield ≥75% of usable stage area;
persistent HUD must not cover playable battlefield tiles at rest; persistent HUD is counted
once, not double-counted; temporary contextual UI may overlap the board only after explicit
player interaction; secondary detail uses progressive disclosure; tablet and desktop preserve
the same architecture while gaining space; do not use the old fixed 360-height / black-bar
architecture.

```
usableStage       = viewport − applicable safe-area insets
battlefieldRatio  = unobscuredBattlefieldArea / usableStageArea
at rest: battlefieldRatio >= 0.75
```

### What MUST survive — do not reinterpret these away

1. **Battlefield remains the visual hero.** Preserve the established dimensional isometric
   ruined-stone courtyard: large dimensional stone paving/grid, characters clearly centred on
   tactical tiles, hand-drawn tactical-RPG sprites, faint/integrated grid treatment,
   watercolour/ink targeting overlays, atmospheric medieval lighting. Do NOT turn the
   battlefield into a small window surrounded by UI. Do NOT flatten it into a generic
   tactical-map rectangle merely to make layout easier.
2. **Preserve the combat-screen visual identity:** weathered parchment; blackened steel / iron
   framing; rivets and heraldic detailing; ink portraits; restrained gold selection accents;
   medieval typography; the established action-ribbon/tapestry language; the right-edge
   turn-order portraits. Do NOT solve the mobile constraint with modern flat HUD bars, generic
   translucent rectangles, mobile-game pill buttons, minimalist text-only status bars,
   floating sci-fi overlays, or plain black boxes.
3. **Preserve the information hierarchy `ACTIVE CHARACTER → ACTION → TARGET`.** For Attack:
   Alaric / attacker information → Attack command / confirmation → enemy / defender
   information. The large desktop parchment cards need NOT retain their original dimensions —
   re-cut them into compact combat plates for 832×328. The objective is **preserve the
   confrontation composition, reduce its footprint** — not delete it for a generic HUD. Small
   cropped ink portraits, HP, essential resource/status information and strong character
   identity beat reducing both sides to plain text. Detailed statistics open through tap.

### Progressive disclosure

At rest or during basic command selection, only immediate tactical information stays visible.
May hide behind tap/hold: Brave/Faith; complete stat lists; detailed damage formula;
resistance breakdown; spell descriptions; equipment detail; full status-effect explanations.
Do NOT use progressive disclosure as an excuse to remove character identity, HP/resources,
action context or the visual confrontation hierarchy.

### Touch and readability

This is a real phone interface, not concept art. At 832×328: essential text legible;
interactive controls practical touch targets; avoid microscopic icon clusters; avoid
squeezing complete desktop cards into miniatures; prefer fewer, stronger pieces of immediate
information. If information does not fit, hide SECONDARY information — do not destroy the
primary hierarchy.

**The 44 px rule applies to the HIT AREA, not the artwork.** A visible icon or seal may be
~30–36 px inside a ≥44×44 px tappable region. Non-interactive ornamentation needs no 44 px
box. Do not inflate every visual component to 44 px because it sits near an interaction. The
bottom region may therefore stay ~48–56 px tall, provided its interactive controls give valid
hit regions. Do not make the whole HUD taller solely to make a visible icon 44 px.

### The disabled treatment — carved and dormant, not faded

Item and Defend must feel like part of the established parchment/iron language, not a modern
greyed-out app button. **The goal: real carved, riveted commands on the same physical ribbon
that are currently dormant — not UI faded by CSS opacity.**

- Keep the same button size, spacing, silhouette, parchment face and iron framing.
- Shift the parchment from warm cream/ochre toward a **muted ash-beige / grey-tan**.
- **Dull charcoal-grey** text and iconography, not the normal dark ink or gold highlight.
- Reduce contrast slightly, but **keep the label clearly readable**.
- Keep the iron/steel edge visible; remove gold trim, ember glow, warm highlight, selection
  underline and active bevel emphasis. Slightly flatter and more dormant than enabled.
- **Do NOT simply apply low global opacity to the whole button.**

*Optional unavailable mark*, only if there is room without clutter: a faded barred-circle
stamp, or a subtle iron crosshatch. **Not** padlock icons, modern prohibition symbols,
tooltip-style warning triangles, or bright red error styling.

| State | Treatment |
|---|---|
| Enabled, unselected | normal warm parchment; normal readable dark ink; no selection glow |
| Disabled | desaturated ash parchment; dull grey text/icon; slightly flatter depth; no gold; no hover/pressed/selected treatment |
| Selected | established gold/ember emphasis; stronger contrast; active visual depth |

**Interaction for Item and Defend:** no hover or press animation; no selected state; no active
targeting state; do not open panels. If tapped, use the **existing disabled-control
behaviour** — `src/render/hud.ts:392-413` sets `.disabled` on Cancel / Actions / End Turn /
Confirm by phase, and `src/render/prep.ts:1196` marks a dead row `aria-disabled="true"`.
Neither is a ribbon command, so the visual language above is new; the behaviour is not.

### Only systems that exist — the scope principle

**This slice is: adapt the established combat presentation and interaction shell to the real
832×328 mobile target. It is NOT: implement every fictional gameplay system visible in the
concept artwork.** Preserve the concept's visual hierarchy and art direction while binding the
implementation only to gameplay systems that exist in the repository today.

- **No new gameplay systems to reproduce concept-art placeholder data.** Keep `Item` in its
  correct ribbon position and represent it with the existing disabled/unavailable behaviour.
  Do not create Potion, Ether, item types, quantities or inventory plumbing. The Potion/Ether
  content in the concept image is visual and interaction reference only. Likewise no weather,
  and no other absent system.
- **A concept field with no real backing data is OMITTED.** `Lv.`, the MP bar and
  `Discipline` are art placeholders. Compact attacker/target plates show only real data
  available today — portrait/identity, name, actual HP or other real combat resource, actual
  relevant status/affiliation where useful. No model, schema or gameplay work to make the HUD
  visually identical to generated concept text.

What the sim actually carries, grepped, so the plates' field list is derived not guessed:

| Concept field | Reality |
|---|---|
| HP / max HP | **Real.** `hp`, `maxHp` on `UnitState` (`src/sim/state.ts:219`) |
| Brave, Faith | **Real** (`src/sim/state.ts:225`), but progressive-disclosure, not resting |
| Facing | **Real** (`src/sim/state.ts:210`); no command sets it — see below |
| MP bar | **Does not exist.** `UnitState` has no MP; `build.ts:322` ignores `raw.mp` |
| `Lv. 12` | On the **roster record** (`src/sim/roster.ts:73`), not on `UnitState`; ADR-0033 drops Level from the battle stat set |
| `Discipline 70` | **Does not exist** anywhere in the sim |
| Potion / Ether / quantities | **Do not exist.** No item type; `equipment.ts` ships the `weapon` slot only |
| Weather ("Clear") | **Does not exist** in `src/`, `data/` or `docs/` |

### Every unit must be tappable — acceptance criterion

The new layout is NOT assumed to fix the untappable wizard and priest by changing visuals. But
working battlefield selection **is** part of the mobile combat acceptance criteria.

> **"All selectable battlefield units must have functioning mobile hit targets at the
> reference viewport without persistent HUD intercepting their input."** (owner)

At 832×328, explicitly verify every selectable unit can be tapped reliably, the Wizard and
Priest included. If they remain untappable because of hit-testing, event routing, z-order,
coordinate transforms or another input issue, that is a **blocking defect** for the mobile
combat frame, and the minimum necessary cause is fixed. Do not expand it into unrelated
interaction-system refactoring.

The cause today is `src/render/preview.ts:234` — `isClickTargetable` requires
`speed === null && aoe === null`. Nine `DEFERRED (ADR-0041)` sites are parked (two `it.skip`
in `src/sim` / `src/render`, seven in `e2e/`); root `CLAUDE.md` and `docs/INTENT.md` both say
"13 tests", which the tree no longer matches.

### The order of concession — most important instruction

When ADR-0043 and the concept art conflict, change the concept UI's *dimensions and
disclosure behaviour* before its *visual identity or information architecture*, in this order:

1. reduce secondary information
2. tighten internal spacing
3. convert large dossiers into compact versions of the SAME component
4. move detail into progressive disclosure
5. slightly adjust HUD proportions
6. only then consider structural changes

Do NOT jump straight to a different HUD architecture.

### The pixel budget, checked

Starting budget: right turn rail **~44–48 px**, bottom interaction region **~48–56 px**.
**Starting dimensions, not new ADR constants** — adjust as needed while preserving ≥75%,
legibility and touch usability. Do not blindly scale the old artwork down.

`HUD = rail×328 + bottom×(832−rail)`; `ratio = 1 − HUD / 272,896`.

| rail | bottom | HUD px² | battlefield px² | ratio |
|---|---|---|---|---|
| 44 | 48 | 52,256 | 220,640 | **0.808** |
| 44 | 56 | 58,560 | 214,336 | **0.785** |
| 46 | 52 (owner's midpoint) | 55,960 | 216,936 | **0.795** |
| 48 | 48 | 53,376 | 219,520 | **0.804** |
| 48 | 56 | 59,648 | 213,248 | **0.781** |

**Every corner of the box clears 0.75.** The owner's midpoint figure of 0.795 is correct. The
worst corner (48 rail, 56 bottom) leaves 8,577 px² of slack — about **11 more px of bottom
band** before 0.75 breaks. That is the number the art pass starts from.

**These figures assume zero safe-area insets**, and 832×328 is **unverified on hardware**
(`docs/INTENT.md` open ask **G**: 328 assumes a ~56 px Android browser bar and nobody has
measured it). Any real inset comes off first and shrinks both the stage and the slack.

**The entry plaque does not count against the resting ratio** — it is temporary, dismissed
before play, and reserves no layout height. The 64 px rail-header cap is untouched by it.

**The ratio is unchanged by answers 1 and 2.** No top strip is reserved, and the rail's
Turn/objective header lives inside rail height already counted once (ADR-0043: HUD counted
once, not double-counted). The five rows above still stand.

### The turn-order rail

**Six simultaneously visible turn entries** on the phone: the current actor plus the next
five. Further upcoming turns continue in the same rail by scrolling/advancement, **not** by
shrinking all portraits. Preserve the circular portrait/seal treatment from the concept art.
If entries are tappable, their interaction region must satisfy the touch-target rule even
where the visible portrait is smaller.

Per-chip height at 328 px of rail, six entries, header `h` for Turn/objective:
`chip = (328 − h) / 6`.

| header `h` | chip height | ≥44 px hit box? |
|---|---|---|
| 0 | 54.7 | yes |
| 40 | 48.0 | yes |
| 48 | 46.7 | yes |
| 56 | 45.3 | yes |
| **64** | **44.0** | **exactly at the floor** |
| 72 | 42.7 | **no** |

**The header's hard cap is 64 px** — including any scroll affordance — or the sixth chip
drops below the 44 px hit floor. Chip boxes may abut; the 44 px is the region, not the art.
Horizontally the rail *is* the hit region: at 44 px wide it sits exactly on the floor with
zero side padding, at 48 px it has 4 px. A 30–36 px circular seal fits comfortably inside a
48 × 46.7 box (6 px and 5.3 px of margin), so answer 3's ~30–36 px artwork works here.

## Open questions

**None.** Every question this file raised is answered and folded above. Leave the heading so
the next round has somewhere to land.
