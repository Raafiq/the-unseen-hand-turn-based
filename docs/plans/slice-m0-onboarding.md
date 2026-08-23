# Slice — M0 item 7, onboarding (the first hour)

> **SUPERSEDED 2026-08-22 by ADR-0025 — kept as the scoping record, not as a plan.**
> The user chose **no tutorial**: a `?` help panel instead of the ramp in §3, and "fix the
> unreachable slots first". So §3's steps 1–4 (the tutorial channel, progressive
> disclosure, the per-battle ramp, the battle-1 content change) were **not built**, and
> §4's AC-M5/6/7 drafts were replaced by the AC-M5/AC-M6 actually in `docs/11`.
> §6's open decision was answered: **option B**, fix the slots.
>
> What survives and is still worth reading: **§2, the measurements** — they are what found
> the real problem. Note the slot costs there are the BEFORE figures (support 300,
> reaction 540); after ADR-0025 they read 120 and 180.

**Status: superseded. See `docs/adr/0025-onboarding-is-a-question-mark-and-every-slot-is-reachable.md`.**

The last M0 item. `docs/08` §3 designs the ramp; nothing implements it.

---

## 1. Bottom line

**The handoff's plan for this slice cannot be built as written, and measuring it turned up
a bigger problem than onboarding.** Three things came out of probing the shipped campaign:

1. **Battle 1 does not restrict what it teaches.** Kest starts with `punch-art.wave-fist`
   learned, so turn one offers a special ability alongside move and attack.
2. **Battle 3's only affordable purchase is an ability that does nothing** —
   `battle-skill.weapon-break`, 60 AP, tagged deferred. The first purchase that *does*
   something is at **battle 4** (Kest's `punch-art.earth-slash`, 120 AP). A guided
   first-purchase beat at battle 3 would spend a new player's first 60 AP, permanently and
   unrefundably (AC-J3), on nothing.
3. **The secondary, reaction, support and movement slots are empty for the entire
   campaign, for every member.** Nobody ever gains a second mastered job, so the secondary
   slot has no options; nobody ever learns a passive, so the other three have none either.
   A player finishes all five battles with the same four command lists they started with.

So `docs/08` §3's "guided first build — a scripted moment where the game walks the player
through equipping a secondary + a reaction" **has nothing to equip**. That is not an
onboarding gap. It is the customization spine — the project's stated core (`docs/00`) —
being unreachable in the only thing a player can actually play.

**One thing is live and free: traits.** Each member has a mastered trait they start with
*unequipped*, and equipping it measurably changes the built unit. That is the honest
"guided first build" beat this campaign can support today.

## 2. What was measured

Probes run against the shipped campaign, played to completion by the balance probe
(`runCampaignBattle` on `data/campaign/*`). Deleted after; reproduce by putting a script in
`coverage/` and running `npx vite-node`.

**Battle-1 command lists, as built:**

| Unit | Abilities |
|---|---|
| Vance | `basic.attack` |
| Kest | `basic.attack`, **`punch-art.wave-fist`** |

**Affordable purchases at each briefing** (live = the ability has a real effect):

| Briefing | Live purchases available | Inert purchases available |
|---|---|---|
| b1 | — | — |
| b2 | — | — |
| b3 | — | Vance `battle-skill.weapon-break` (60) |
| b4 | **Kest `earth-slash` (120), `chakra` (120)** | Vance `weapon-break`, Briar `scout` |
| b5 | Kest as above, Briar `piercing-shot` (120), `leg-shot` (120) | + Ottoline `esuna` |

Vance has **no live purchase at any point in the campaign** — his whole Knight tree is
`battle-skill`, which is excluded by user decision (2026-08-16).

**Loadout options at every briefing, all five battles, all four members:**

| Slot | Options |
|---|---|
| secondary | none, ever (mastered = own job only; `secondary === currentJob` is rejected) |
| reaction / support / movement | none, ever (`learnedByType()` returns `[]` throughout) |
| traits | exactly one per member, from mastery, **starting unequipped** |
| job | 8 — the one lever that always works |

**Traits are live.** A/B on the built unit, Vance with and without `bulwark`:
HP 306 → 321, `classEv` 10 → 20. Same input, different output — the check that can come
out the other way.

**The encounter ramp is already right** and needs no work: 2v1 → 3v2 → 4v3 → 4v3 → 4v3,
grids 7×5 → 9×5 → 9×7 → 11×7.

## 3. What this slice builds

Ordered. Steps 1–3 are the onboarding item; step 4 is the content fix that makes step 3
worth teaching; step 5 is the honest recording of what is still missing.

### 1. A teaching channel that is not the story pack

New `src/sim/tutorial.ts`, mirroring `story.ts` exactly: a Zod schema, its **own version
line**, a migration registry, two lookups, and **not one authored word**. Data ships as
`data/campaign/tutorial/camp-the-first-march.tutorial.json`.

Per battle it carries a `hint` (lines, same `StoryBeat` shape) and a `reveal` set naming
which prep controls are disclosed.

**Why its own channel, not a `pre` beat.** A hint is not narrative. The whole point of the
story seam (AC-M4) is that a different repo supplies the prose — so if the tutorial rides
on the story pack, swapping the pack silently deletes the tutorial. Separate file, separate
version line, checked separately at boot.

### 2. Progressive disclosure in the prep panel

`prep.ts`'s `progression?: boolean` becomes a disclosure set. Today it is binary and
covers only the job selector plus the learn list; the five loadout rows always render.
Battle 1 should show none of them.

The disclosure comes from the tutorial data, not from a battle-index constant in the shell
— which makes it A/B-able the same way AC-M4 is: swap the data, the panel changes, no code
change.

`mountPrepDemo` keeps `/`'s fixed showcase exactly as it is.

### 3. The hint on the briefing, and the ramp it encodes

A hint block on `screen-briefing`, rendered with `textContent` like `renderStory` — the
seam exists so data supplies the strings.

The proposed ramp, built only from what is actually live:

| Battle | Teaches | Disclosed |
|---|---|---|
| b1 | move, attack, turn order | nothing in prep |
| b2 | **equip your mastered trait** — free, reversible, visibly changes the stat line | traits |
| b3 | change job; read the learn list | + job selector, learn list |
| b4 | spend AP on something that works (Kest's `earth-slash`) | all |
| b5 | — | all |

In-battle basics are already partly taught: `PHASE_TEXT` in `game.ts` says "Your turn —
click a tile to move, or an enemy to strike". Keep that; do not duplicate it in a hint.

### 4. Content fixes that the ramp depends on

- **Remove `punch-art.wave-fist` from Kest's starting kit** so battle 1 is move and attack
  only. Then **re-measure that the campaign is still completable** (AC-M1) and re-measure
  the AP table — both change.
- **`data/campaign/story/`, b1 `pre` says "Four of us"** while battle 1 deploys two. Fix
  the line while authoring.

### 5. Record what is still missing

An ADR (0025) recording that **the secondary and reaction slots are unreachable in M0**,
what that costs, and that the fix is deferred. Right now nothing says so, and `docs/11` §1
reads "five equip slots" as if a player meets them. A capability the player cannot reach,
undocumented, is the repo's own most expensive failure mode: a spec that reads as governing
while governing nothing.

## 4. Acceptance criteria

**Extend AC-M in `docs/11` rather than minting a letter.** Onboarding is M0 item 7, `docs/11`
owns AC-M, and every other letter is taken (`AC-0 J S E P R V M`). `AC-O` is not free in
practice — it reads as `AC-01` next to `docs/01`'s set.

- **AC-M5 (hour one teaches one thing at a time):** The first battle SHALL present move,
  attack and turn order and no other mechanic. *Discriminator:* assert battle 1's built
  player units carry exactly `basic.attack` — **this fails on today's content**, which is
  the proof it discriminates.
- **AC-M6 (disclosure is data):** Which prep controls a briefing shows SHALL come from the
  tutorial pack. *Discriminator:* the same shell at two different battles renders a
  **different** control set, and swapping the pack changes it with no code change. Assert on
  the mounted panel's controls, not on the model accepting the config — a slot that
  validates its input and discards it reads as working.
- **AC-M7 (the tutorial survives a story swap):** Replacing the story pack SHALL leave every
  hint unchanged. *Discriminator:* the A/B in both directions — swap story, hints identical;
  swap tutorial, hints differ.

## 5. Traps

- **Enumerate the transitions, not the states.** A loss returns to `BRIEFING` for the same
  battle, so the hint shows again — decide that deliberately and assert it. Winning the last
  battle skips `AFTER_BATTLE` entirely.
- **Both-direction boot coverage** for the tutorial pack, like `campaign-data.ts` does for
  story: a stale entry for a renamed battle resolves for nothing and reads as covered.
- **`data/campaign/tutorial/` is a content directory no `npm run state` counter can see.**
  Same as `data/campaign/story/`. Nothing claims a count today; if you add one, wire it in.
- **The prep panel is mounted once and re-pointed.** `setRecords` no-ops when nothing
  changed, deliberately, so a repaint cannot steal focus. Disclosure state must live in the
  model, not the DOM.
- **Tab order:** `play.spec.ts` asserts `index.html`'s tab order exactly. `campaign.spec.ts`
  does not, so the briefing can gain controls freely. Keep the hint block in `game.html`.
- **Removing wave-fist changes the AP table and the difficulty of b1–b2.** Re-measure both;
  do not carry NEXT.md's numbers forward.
- **Browser tests are not in `npm run check`** — run `npm run test:visual` separately.
- Regenerate `npm run state` as the **last** step; it goes stale on any commit that adds a
  counted artifact, including the new ADR.

## 6. The open decision

**How far to go on the unreachable slots (§1 item 3).**

- **(A) Onboard what is live — recommended.** Build the §3 ramp against traits, job change
  and the battle-4 purchase. Ships M0 item 7. Records the secondary/reaction gap in ADR-0025
  and leaves it to M1. Cheapest, honest, and does not touch the economy.
- **(B) Also make a secondary reachable in M0.** Give one member a second mastered job, or
  make a second mastery affordable inside five battles. This is what `docs/08` §3 actually
  asks for, and it is the pillar the game is built on — but it is content plus an economy
  question the handoff already parked as M1 (ADR-0012's grant shape).
- **(C) Give the Knight a live skillset.** Fixes Vance having no live purchase in the whole
  campaign. Larger, and `battle-skill` is excluded by an explicit user decision.

**Recommendation: A now, B as the first M1 slice.** M0's stated purpose is a thin playable
whole that reveals what is wrong with the game — and it just did.
