# Slice — M0-A: the campaign container and persistence

**Written against:** `6e1d4e6` (main). **Scope:** `docs/11` M0 items **1 (campaign
container)** and **2 (persistence)**, plus the headless half of item 6 (losing → retry).
Items 3 (shell), 4 (prep loop), 5 (story stubs) and 7 (onboarding) are NOT in this slice.

## Why this first

`docs/11` §3 puts these two first in dependency order: nothing else in M0 can be built
until a campaign can hold state across battles. Everything after leans on it.

## What ships

### 1. `src/sim/campaign.ts` — schema + pure state transitions

A **separate codec** (ADR-0011 precedent): its own `CAMPAIGN_SCHEMA_VERSION`, its own
migration registry, loud failure on an unsupported version. No IO, no RNG, no wall-clock.

- `CampaignDef` — authored data: `id`, `title`, `party: UnitRecord[]`,
  `cast: UnitRecord[]` (every non-party record its battles reference), and
  `battles: [{ id, encounterId }]` in order.
- `CampaignSave` — the durable progress record: `campaignId`, `battleIndex`,
  `party: UnitRecord[]`, `status`, `history`.
- `startCampaign`, `currentBattle`, `applyBattleResult`, `retryBattle`,
  `serializeCampaign` / `deserializeCampaign`.

**Rules encoded:** a win banks AP and advances the index; the last win sets
`completed`. A loss sets `gameOver` and leaves the party **untouched**, so
`retryBattle` restores the pre-battle party by construction. HP is not a record
field, so it is restored between battles automatically — asserted, not assumed.

### 2. `src/sim/campaign-run.ts` — the headless playthrough

`runCampaign(def, encounters, resolver)` drives each battle through the existing
harness, threading the save's party records into the encounter resolver as `ref`
sources. Returns the final save plus a per-battle report. This is the AC-M1 instrument.

### 3. `data/campaign/camp-the-first-march.json` + 5 encounter defs

Purpose-built, not borrowed from the benchmark set (whose five encounters all lose from
team 0 as authored — `docs/NEXT.md` trap 9). A 5-battle ramp: 2v1 → 3v2 → 3v3 → 4v4 →
4v4 with a `defeatUnit` boss objective.

### 4. Tests

| AC | Test | Discriminator |
|---|---|---|
| AC-M1 | the campaign runs title-to-ending headlessly and reaches `completed` | asserts the specific outcome, not a set — a campaign that starts but cannot finish fails |
| AC-M2 | save → serialize → deserialize → resume is byte-identical, **and** learned/AP survive a battle boundary | round-trips the state, not "a file was written" |
| AC-M3 | a lost battle reaches `gameOver`; `retryBattle` restores the pre-battle party exactly | party compared field-by-field, not by reference |
| AC-P6 | `ttk.test.ts` extended to enumerate campaign party + cast | a roster nothing covers is the documented repeat failure |

## Landmines

- **The demo-roster failure, again.** `ttk.test.ts` band-checks `data/builds/*` and
  nothing else; the viewer's hand-authored roster sat 3–4× outside the band for the life
  of the repo because nothing enumerated it. Campaign units get enumerated in the same
  test, in this slice.
- **AP reward derivation must not be damage-only.** A healer that healed all battle would
  earn 0 AP under a damage-only proxy and the campaign would look like it worked.
  Asserted with a healer/striker pair.
- **The AC must name a REALIZABLE fixture.** Every campaign battle is measured with the
  probe on both sides before its AC is written down.

## Out of scope (logged per AC-R5)

Shell/title screen, prep between battles, story text, equipment, gil, permadeath
consequences, more than one save slot, browser-side save IO.
