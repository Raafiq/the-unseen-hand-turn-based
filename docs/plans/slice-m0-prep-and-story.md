# Slice — the between-battle loop and the story seam (`docs/11` M0 items 3 + 4)

**Written against** `156d6cb`. Source of truth for this slice; the HTML artifact is only
the review medium.

## Why

A player can finish the whole campaign without making one decision between battles. The
prep screen exists but is hard-wired to a demo Knight on `/`, and no battle has a line of
text. Those are M0 items 3 and 4, and neither needs new engine capability — both are seams
that already have their write-side proven.

## What lands

### 1. The story seam — `docs/08` §4 contract, AC-M4

- **`src/sim/story.ts`** — Zod schema + parse + lookup. Its OWN version line
  (`STORY_SCHEMA_VERSION`), per the separate-codec precedent in `campaign.ts`. Pure, no IO,
  and **zero prose** — a schema is not narrative content.
- **`data/campaign/story/camp-the-first-march.story.json`** — placeholder text for each
  battle at three moments: `pre`, `victory`, `defeat`. Post-battle text differs by outcome;
  that is the interesting half of the seam.
- Mid-battle hooks (`docs/08` §4's "mid") are **deferred** — there is no event system to
  hang them on, and inventing one here would be a spec with no test.
- **Coverage is a two-direction partition**, like `campaign-data.ts`'s encounter check:
  every battle the campaign names has a beat, and every beat names a real battle.
- **AC-M4's discriminator is the A/B**: parse a *different* story pack over the same
  campaign and assert the shell reports different text, with no code change.

### 2. The prep screen on the briefing — `docs/11` M0 item 3

- **`prep.ts` becomes a factory.** Today it owns module-level `record` / `bodyEl` globals
  and builds its own demo Knight. It becomes `mountPrep(container, {registry, records,
  onChange})` returning a handle; `index.html` passes the demo record and a no-op
  `onChange`, `game.html` passes the save's party.
- **Party picker** — four members, so the panel needs to switch between records.
- **AP spend** — the panel lists learnable tree nodes with costs and blocks with
  `canLearn`'s own reason. Without this the screen is inert: the starting party has 0 AP
  and 0–1 learned abilities, so loadout alone gives it nothing to change.
- **Job change** — `changeJob` is unrestricted in content (`requires` is reserved, unset).
- **`CampaignShell.updateParty(record)`** → `updatePartyMember` + persist.

## Traps this slice walks into

1. **`changeJob` can leave the record ILLEGAL.** It does not clear a secondary that now
   equals the new current job, and `setLoadoutSlot` forbids exactly that state. The UI owns
   it (the docstring says so) — clear the secondary on a colliding job change, and assert it.
2. **An A/B between two callers of the same helper cannot see a bug in the helper.** The
   prep write-path must reach THROUGH `updatePartyMember` to an observable end: spend AP in
   prep, deploy, and read the learned ability off the battle unit's command list.
3. **The story A/B must swap DATA, not a code path.** A test that calls a different
   function proves nothing about the contract.
4. **`campaign-data.ts` imports by name.** A story file nothing imports is invisible; the
   partition test is the guard.
5. **The briefing gains focusable controls.** `play.spec.ts` asserts tab order exactly on
   `index.html`; `campaign.spec.ts` does not, but check before assuming.

## Not in this slice

Onboarding (item 7), equipment (item 5), making `game.html` the landing page, anything
touching the variety score.

## Done means

`npm run check` green, `npm run test:visual` green, `docs/11` §3 and `docs/08` §1a moved,
an ADR for the story contract, `npm run state` regenerated last, `docs/NEXT.md` rewritten.
