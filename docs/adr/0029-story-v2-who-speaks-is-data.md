# ADR-0029 — Story v2: who speaks is data, and a scene can belong to no battle

- **Status:** Accepted. The schema shape and the resolution rule are settled; the *look* of the scene player is a taste call the owner has already revisited once (option B over A and C) and may revisit again.
- **Date:** 2026-08-29
- **Owner docs:** `docs/11` **AC-M8**, **AC-M9** and `docs/10` **AC-V16**, **AC-V17** (authoritative), `docs/08` §4 (the narrative-repo contract)
- **Supersedes nothing.** Extends ADR-0024, which established the story seam as versioned data.

## Context

ADR-0024 shipped the story seam: pre/victory/defeat beats keyed by battle id, loaded from
`data/campaign/story/*.story.json`. It worked, and it was as thin as it could be — one
speaker per beat, no notion of a character, no art, and no scene that is not attached to
a battle. A beat rendered as a static paragraph block with a name label above it.

The owner asked for narrative presentation next, in a session where the top open question
— whether a stranger understands the game — was blocked on a human playtest that had not
happened. Narrative presentation is the highest-value work that does **not** depend on
playtest data, so it was the right slice; but the ordering inside it was not obvious.

**The load-bearing sequencing call was format before prose.** Writing story content
against v1 would mean rewriting it the moment a textbox existed, because v1 cannot express
two people talking inside one beat. So this slice ships the shape and the player, and the
writing — and the separate story repo `docs/08` §4 promises — comes after.

## Decision

### 1. One attribution mechanism, not two

`StoryBeat.speaker` is **removed**. `lines` becomes `StoryLine[]`, and each line carries
its own optional `speaker`.

The rejected alternative was keeping `beat.speaker` as a default a line could override.
That creates a `line → beat → nothing` fallback chain whose **middle rung no test can
observe**: a fixture exercising it scores identically against an implementation that
ignores it. `.strict()` also means the field could never be removed later.

The v1 *appearance* is preserved by presentation rather than schema — the renderer
collapses consecutive same-speaker lines into one plate — and that is what the migration
test asserts, rather than that the fields look similar.

### 2. Every reference resolves at PARSE time, with no fallback

A pack naming a speaker or an expression that does not exist **does not parse**.
`resolveBeat()` is the only lookup in the whole path and lives in the sim, so the render
layer holds no character table at all.

This is a direct response to a defect this repo has already shipped. `src/render/CLAUDE.md`
records `drawUnit` reading `UNIT_META[u.id]` — a table of *demo* ids — and falling back to
one grey, so every unit in the shipped campaign was painted the same colour while 720
tests stayed green. **The fallback is what hid it**: a miss looked like a deliberate
neutral. The fix here is not a better fallback; it is having nothing to fall back from.
`ResolvedLine` uses nullable fields rather than optional ones for the same reason —
"narration" and "not found" must not share a shape.

### 3. `Character` is presentation identity, deliberately unjoined

`Character.id` lives in the **pack's** namespace. It is not joined to `pc-vance` (a
campaign record id) or `blue-vance` (an encounter slot id), and there are three id layers
in this repo that a reader will otherwise assume are one.

`docs/08` §4 separately mentions "unique-character references (which resolve to `docs/02`
B6 premium chassis units)". **That is a different, unbuilt thing.** v1's docstring
promised the engine would never resolve a speaker against a unit record, and that promise
is kept.

The registry carries `name` and asset keys and **no `bio` or `description`**: prose with
no screen to show it on is a spec with no test.

### 4. `parseStoryPack` migrates; `parseCampaign` does not

A deliberate divergence between two codecs that otherwise share a shape. A campaign
definition lives in *this* repo, so an old one is a mistake and exact-match is right. A
story pack is contracted to arrive from a **separate repo on its own release cadence**
(`docs/08` §4, `docs/11` AC-M4), so refusing an older-but-migratable pack would break the
"no engine change needed" promise in the other direction — the story repo would have to
ship in lockstep with this one.

`migrate1to2` carries each v1 label **verbatim** as both id and name. The identity
function cannot invent a naming convention the engine then owns forever, and introduces no
`"Vance"` vs `"vance"` collision a migration would have to resolve silently. It back-fills
no scenes and no portraits: absent, never a helpful default.

`MIN_SUPPORTED_STORY_SCHEMA_VERSION` is a tautology on arrival (it equals the oldest
version that has ever existed) and its docstring says so. It exists so the walk has the
same four branches as the roster and campaign codecs; a copy of that loop missing a branch
has silently diverged from the pattern the other three teach.

### 5. Two scene anchors, and `after-battle` is cut

`before-battle` covers the prologue and every interlude; `campaign-end` covers the
epilogue. **At most one scene per anchor**, enforced at parse, so the shell never needs a
scene queue — "which of the two plays first" is a rule nobody has written down.

There is no `after-battle` anchor, for the same reason `mid` is still absent: that
transition already carries an outcome-split beat, a scene there would have to branch on
outcome *and* on retry, and for a player who continues, "after b3" and "before b4" are the
same moment. The one case where they differ is quitting to the title in between. That is
the stated cost.

`storyCoverage` gains `orphanScenes` in **one direction only**, and the asymmetry is the
point: an entry per battle is the pack's contract, so both directions are errors; an
interlude per battle is not, so a battle with no scene is deliberately not reported.

### 6. The seen-set lives in the save, not a second key

`campaignSchemaVersion` 3 → 4 adds `scenesSeen: string[]`. Not a separate `localStorage`
key: scene progress *is* campaign progress, and `eraseSave()` must forget it, or a New
Game after an erase would silently skip the prologue the player just asked to see again.

Ids rather than indices or a count — a scene keeps its identity when the pack inserts
another before it. Marked on **exit**, so a reload mid-scene replays from the top and the
write sits on the same boundary as every other `persist()`.

`migrateCampaign3to4` writes `[]`, not "everything up to `battleIndex`". A v3 save was
played by a build with no scenes at all, so a scene it never showed is genuinely unseen.

### 7. The reveal is untimed, and that claim is asserted

No timer, no keyframe, no `requestAnimationFrame`, no transition on a line. This would
have been the codebase's **first** timed animation — the whole motion inventory is three
lines in `index.html` and one reduced-motion query scoped to `button`.

Three reasons it stays input-driven:

1. A timer makes every browser assertion racy, and `playtest-capture.spec.ts`'s `shot()`
   asserts only that a testid is *visible* — a mid-typewriter frame passes it and ships as
   a silent screenshot regression.
2. `prefers-reduced-motion` would force a second code path whose honest implementation is
   "show the line at once" — the path we would ship anyway.
3. `contrast.spec.ts` measures partial-opacity elements without compositing element
   opacity, so a fade produces intermittently wrong ratios in the one instrument guarding
   legibility.

So the claim the module makes is **"there is nothing to reduce"**, and it is asserted in
both motion modes rather than written in a comment.

### 8. Reveal state lives outside the DOM

`renderStory` is reached from `refresh()`, which the prep panel's `onChange` and every
deploy toggle also trigger — on the briefing, which is exactly where a scene is read — and
the old renderer wiped and rebuilt its box on every call. So the model lives in a closure,
`game.ts` holds handles in a module-scope map, and `setBeat(key, lines)` does **no DOM work
at all** on an unchanged key. Keys are strings built from save state, never object
identity: a beat object is re-derived on every call, and a `.map()` appearing in an
accessor's path would break an identity check silently.

### 9. The portrait seam, and an honest placeholder

Data authors an asset **key**; `campaign-data.ts` maps keys to URLs through a real Vite
import, so the Pages sub-path is the bundler's problem as it already is for every JS chunk.
The mapping is passed *into* `mountScene` rather than imported by it, so the player holds
no content table it could miss against. `portraitCoverage` checks pack against bundle in
both directions at boot.

**No portrait art exists.** The placeholder is a ruled empty frame — not a silhouette, a
monogram or a keyed colour, each of which reads as a deliberate art choice rather than as
missing art. The words live in a real `<figcaption>`, where a screen reader announces them
and `contrast.spec.ts` can measure them; text inside an SVG is neither. The caption is
keyed on the asset being `placeholder`, so it disappears by itself when real art lands, and
a tripwire test fails that day to force this ADR and the docs to move with it.

### 10. Presentation: option B, with C deferred rather than rejected

Three players were mocked and put in front of the owner before any stylesheet was written
(the repo's own rule for a taste change, earned by rebuilding the parchment slice twice
from a description). The owner chose **B — a textbox over the parchment sheet — now, with
C (a full cinematic screen) revisited once portrait art exists.**

The schema is identical across all three, so the later switch is a rewrite of
`mountScene`'s DOM and nothing else. Keep that seam clean: nothing outside `mountScene`
may assume the textbox's shape.

## Consequences

- **A story pack is now a richer contract**, and `docs/08` §4's bullet moves with it. The
  narrative repo can ship per-line speakers, a cast with art, and standalone scenes with
  no engine change — which is the promise that seam exists for.
- **`Screen` gained a value**, so the exact screen-order assertion in `e2e/campaign.spec.ts`
  moved rather than being relaxed. It still fails if the scene screen stops being reached.
- **A save migration shipped**, so v3 saves keep working. `SAVE_KEY` did not change.
- **The def and the save share one version constant**, so the authored campaign file bumped
  to 4 even though its own shape did not change — the same thing v2 → v3 did.
- **Two things are NOT settled by this slice and must not be cited as if they were.** No
  portrait art exists, and nothing here is evidence about onboarding. Whether the game
  reads to a first-time player is the same open question `docs/NEXT.md` has held since
  M0, and a scene player does not answer it.
- **`check:story` was rewritten first**, deliberately, because the guard had to be
  trustworthy before the data changed shape under it. It had a live silent-green route —
  measured, not theorised — and now classifies every string in a pack by its key, so a
  future prose field cannot ship unguarded by being invisible.
