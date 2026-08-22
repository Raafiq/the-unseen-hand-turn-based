# ADR-0024 — Story text is a versioned data pack; the prep panel is a model with a mount

- **Status:** Accepted
- **Date:** 2026-08-22
- **Supersedes / amends:** none. Builds on **ADR-0022** (the campaign container), **ADR-0023** (the shell) and **ADR-0007** (render imports sim, never the reverse).
- **Owner docs:** `docs/11` §3 M0 items 3 + 4 and AC-M4, `docs/08` §4 (the narrative-repo seam), `docs/02` (the chassis)

## Context

After ADR-0023 the campaign was playable end to end and a player made **no decision between battles and read no text at all**. Those are `docs/11` M0 items 3 and 4, and neither needed new engine capability:

- The prep panel existed but was a module **singleton** hard-wired to a demo Knight and mounted on `/`. Its state (`record`, `bodyEl`) lived at module scope, so a second mount would have taken the first one's DOM node with it.
- `docs/08` §4 promises a separate story repo can add content with **no engine change**. Nothing implemented that, and `campaign-data.ts` derived a battle's display name by de-kebabing its encounter id — a naming convention standing in for a title.

## Decision

**1. The story contract is a schema in the engine and prose in a data file — never both in one place.**

`src/sim/story.ts` holds a Zod schema, a parse, and two lookups. It contains **no authored word**. The prose ships as `data/campaign/story/*.story.json` and is bundled by `campaign-data.ts`, the same caller that bundles the encounters. That is what makes AC-M4's discriminator an honest A/B: the shell's three accessors (`sceneTitle` / `preBeat` / `outcomeBeat`) ask the pack a question, so parsing a *different* pack over the same campaign changes what the player reads with no code change at all. A shell with prose compiled in would return the same text for both packs, and `campaign-shell.test.ts` asserts it does not.

**2. Its own version line, like every other codec here.** `STORY_SCHEMA_VERSION` is independent of the campaign, battle, roster, encounter and content lines (the `campaign.ts` precedent), with an empty `STORY_MIGRATIONS` registry ready for the first bump. A story-shape change never forces a save migration.

**3. The post-battle beat splits by OUTCOME, not one "after" string.** `victory` and `defeat` are separate fields. One field would make a shell that ignored the result look identical to one that read it — and the campaign already distinguishes the two (AC-M3). The test plays the same battle both ways and asserts the two beats differ.

**4. `mid` is NOT in the contract, and that is deliberate.** `docs/08` §4 names "pre/mid/post-battle events hooks". A mid-battle hook needs an event system to fire it: a trigger, a point in the resolution pipeline, a way to hold a turn. None exists. A `mid` field nothing can deliver would be a **spec with no test** — the most expensive failure recorded in `CLAUDE.md`. It arrives with the event system, as a version bump.

**5. Coverage is checked in BOTH directions, at module load.** `storyCoverage(battleIds, pack)` returns `missing` *and* `extra`, and `campaign-data.ts` throws on either. `missing` catches a battle that would ship a blank screen; `extra` catches an entry orphaned by a renamed battle, which resolves for nothing while reading as coverage. A one-direction check passes half of those. Loud at boot rather than at the briefing, so the mistake cannot reach a player.

**6. Story text is rendered with `textContent`, never `innerHTML`.** The whole point of the seam is that a *different repo* supplies the strings. Interpolating them as markup would hand every future story author script execution on the page.

**7. The prep panel splits into a DOM-free `PrepModel` and a `mountPrep` that draws one.**

Same shape, and the same reason, as `session.ts`: the rule-bearing behaviour — which record is selected, what an edit does to it, what a learn row says when it is blocked — is asserted in a plain Node test (`prep.test.ts`) instead of only through Playwright. `mountPrep` owns no rules. `mountPrepDemo` keeps `/`'s fixed showcase record and `window.tuhPrep` unchanged.

**8. The panel asks the sim for every rule, including the REASON a purchase is blocked.** `learnRows()` returns `canLearn`'s own reason string verbatim. A view that re-derived "can I afford this?" would be a second copy of a rule the sim owns, and the two would drift. It also keeps the two blocked states distinct — unaffordable versus prerequisite-locked — which is the difference between "save up" and "buy something else first".

**9. Changing job CLEARS a secondary that the new job would collide with — and `UnitRecordSchema` now forbids that state outright.** `changeJob` validates nothing by design ("the caller/UI picks from unlocked jobs"), so it was the one way to reach `secondary === currentJob` — precisely the state `setLoadoutSlot` refuses to create. Nothing downstream threw on it; the secondary silently duplicated the primary command, so it read as a content bug rather than an illegal record.

Two changes, at two levels. The UI clears the slot, mutation-verified in **both** directions (never clearing and always clearing each fail a different assertion). And `UnitRecordSchema` — the one schema that can see `currentJob` and `loadout.secondary` together — gained a refinement rejecting it, so every codec boundary (serialize, deserialize, encounter, campaign save) fails loudly instead of storing it. A docstring that delegates a rule to "the caller" is an obligation nobody is told about; a schema refinement tells everybody, forever.

**10. `CampaignShell.updateParty` is the write-back, and it is refused during a battle.** The units on the field were compiled at deploy time, so an edit mid-fight would apply to the *next* battle while the player watched this one — a change that appears to do nothing and then does something an hour later.

**11. You learn the job you are IN.** The learn list is the current job's tree; switching job is free and is how you reach another one. This keeps the list short enough to read, matches the source game, and makes "where does progress come from" visible rather than a flat catalogue of 63 nodes.

**12. A learn row whose ability does nothing SAYS so, before anyone pays for it.** The command list has marked deferred abilities since ADR-0019; a learn list is the more expensive place to get it wrong, because AP is spent permanently and never refunded (AC-J3) — an unmarked inert node is the panel charging real currency for nothing. The lookup unions all four deferral registries rather than checking per slot, because a learn list sells nodes of every type from one tree and a per-slot check would silently pass the three types it did not happen to cover.

This disclosed rather than fixed a content problem: `battle-skill` is excluded by user decision (2026-08-16), so Vance — a starting party member — has a native tree of eight buyable nodes that all do nothing. The tag is honest; it is not the fix.

## Consequences

- A story repo can now supply `*.story.json` and change every line a player reads without touching this repo — the `docs/08` §4 promise, tested rather than asserted.
- `docs/11` M0 items 3 and 4 are done. Items 5 (equipment) and 7 (onboarding) remain.
- The engine viewer's prep panel is unchanged in behaviour: `progression` defaults **off**, so `/`'s fixed demo record and its screenshot baseline stand.
- The prep panel makes the AP economy visible for the first time, and it reads slowly: under the balance probe the party banks 48 / 48 / 0 / 0 after battle one, so the first affordable purchase (a 60-AP tier-one node) lands at **battle three** — which is where `docs/08` §3 wanted the loadout introduced anyway. A member who never lands an action banks nothing; that is ADR-0012's grant shape working as specified, and whether it is the right shape is an M1 question.
- Two authored status tables now have to move together whenever an M0 item lands (`docs/11` §3 and `docs/08` §1a). Nothing derives either.

## Alternatives rejected

- **Prose fields on `CampaignDef`.** Rejected: ADR-0022 decision 6 and `CLAUDE.md` both forbid narrative in the engine, and it would put the story repo's content inside this repo's schema.
- **Deriving the battle title from the encounter id forever.** Kept only as the *fallback*. A derivation cannot say "The Ford, Again" on a second visit, and it forces the file name to carry prose.
- **Keying story entries on the ENCOUNTER id.** Rejected: a campaign may field the same encounter twice, and the scene around the second time is a different scene. Keyed on the campaign battle id, which is unique by schema.
- **Throwing from `storyBeat` on an unauthored moment.** Rejected: an absent beat is a legitimate authored choice. It returns `null` so the page can hide the block, rather than an empty beat that would render an authoring gap as a scene.
- **Letting the prep panel spend AP across every job at once.** Rejected: 63 rows, and it hides where progress comes from.
- **Gating job changes behind unlock requirements.** Not rejected on the merits — the content's `requires` field is reserved and unset, so there is nothing to gate on. When job unlocks are authored, the selector reads them.
