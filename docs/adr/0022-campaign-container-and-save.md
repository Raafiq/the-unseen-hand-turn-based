# ADR-0022 — The campaign is a fourth codec: an authored battle sequence plus a party save

- **Status:** Accepted
- **Date:** 2026-08-20
- **Supersedes / amends:** none. Extends **ADR-0011** (three separate version lines) with a fourth, on the same rules.
- **Owner docs:** `docs/11` §3 M0 + AC-M1/M2/M3, `docs/05` §5/§6

## Context

`docs/11` M0 is the MVP: a stranger plays 30–45 minutes and reaches a real ending. Its first two items are a **campaign container** and **persistence**, and everything else in M0 leans on them.

Nothing in the repo sequenced battles. `(seed, commands)` replays one battle byte-for-byte, and `UnitRecord` is a durable per-unit record, but there was no object that said *which battles, in what order, carrying whom* — and no save file. Battles were standalone fixtures fed to the benchmark harness.

The shape was not obvious, because two plausible designs read the same from the outside:

1. A campaign is **battle state that persists** — carry HP, the dead, the clock forward.
2. A campaign is **a cursor plus a party of `UnitRecord`s** — each battle compiles fresh from records.

## Decision

**1. The campaign is a cursor plus a party of records (design 2), in its own codec.**

`src/sim/campaign.ts` owns `CAMPAIGN_SCHEMA_VERSION`, its own migration registry and its own loud-fail deserializer, exactly as `state.ts`, `roster.ts` and `encounter.ts` do. A campaign-shape change never forces a battle-save, roster, content or encounter migration.

- `CampaignDef` — authored: `party` (the starting records), `cast` (every non-party record its battles reference), and an ordered `battles: [{ id, encounterId }]`.
- `CampaignSave` — durable: `battleIndex`, `status`, `party`, `history`.

**2. The save carries NO battle HP — and that absence is the implementation of two M0 rules.**

"HP restored between battles" and "no permadeath consequences" are both `docs/11` M0 commitments. Neither needs code: `UnitRecord.raw.hp` is a maximum, current HP lives on `UnitState`, and `UnitState` dies with the battle. A party member who ended a fight at 3 HP or KO'd redeploys at full.

This is cheap and correct now, and it is exactly the kind of thing that looks identical whether it works or not — so it is asserted twice: the serialized save is checked for the *absence* of an HP field, and the post-campaign party is rebuilt and checked to start at `maxHp`. A later slice that persists HP will trip both.

**3. The party crosses the battle boundary as `ref` unit sources, injected by the runner.**

`encounter.ts` already resolves `{ kind: "ref", recordId }` placements against a caller-supplied record map. The campaign's player placements use it, and `campaign-run.ts` fills that map with the **save's** party — not the def's. That single line is the entire persistence mechanism, which is why it has an A/B test rather than a presence check: grant a party member an ability through the save, and assert it appears in what was cast (`punch-art.earth-slash`, absent without / used with). Wire the def's party in instead and every battle silently restarts from scratch while every per-battle assertion stays green.

**4. Any non-victory outcome is a loss; a loss spends nothing.**

`defeat`, `draw`, `stalemate` *and* `timeout` all set `gameOver` and leave the index and party untouched. `retryBattle` therefore restores the pre-battle party **by construction** — there is no snapshot to restore, because nothing was ever spent. AC-M3's "restore exactly" becomes a structural property rather than a copy that could drift.

The `timeout`/`stalemate` half is the load-bearing part: a campaign that quietly advanced past a battle the player did not win would look right from any per-battle test.

**5. The AP grant reads LANDED ACTIONS, not damage.**

`UnitContribution` gains `landedActions` — actions that actually landed, a whiff scoring zero. The campaign's grant is `{ participated, meaningfulActions: landedActions }`.

A damage-derived grant would hand the party's only healer nothing, every battle, while the campaign kept reading as if progression worked. The shipped campaign contains the discriminating fixture (the priest ends three battles with `damageDealt === 0` and `healingDone > 0`) and the test asserts against it; mutating the grant back to damage turns exactly that test red.

**6. The M0 campaign content is PURPOSE-BUILT, not borrowed from the benchmark set.**

`data/campaign/` ships `camp-the-first-march` — a 5-battle ramp with 4 party members and 5 cast records. The benchmark encounters were not reused: as authored, all five of them **lose** from team 0 (`docs/06` AC-E6), which is fine for a balance probe and useless as an MVP.

Winnability is measured, not assumed: the campaign completes under the balance probe on both seats, and it does so across **8 consecutive seeds** — a plateau, not a knife-edge. The ramp is asserted too (each battle takes more turns than the last: 4 → 9 → 16 → 22 → 28), because five copies of one fight would also complete.

**7. The campaign roster joins the TTK band check.**

`ttk.test.ts` enumerates `party + cast` from the def and requires a declared class for each. The last hand-authored roster that shipped outside that check — the viewer's demo units — sat 3–4× outside the `docs/07` band for the life of the repo with a green suite the whole time.

## Consequences

- **Four version lines now, not three.** `docs/05` §5's codec list gains the campaign line. The cost is one more migration registry to keep honest; the benefit is that a campaign-shape change cannot invalidate battle saves.
- **The shell, the prep loop and story stubs get a seam each.** `currentBattle` answers "what is next", `updatePartyMember` is where a prep screen writes, and `runCampaignBattle` is what the viewer calls when a battle ends. None of the three is built.
- **`runCampaign` deliberately does not auto-retry.** A runner that retried until it won would report `completed` for a campaign no player could finish — the exact claim AC-M1 makes.
- **`landedActions` is additive to `RunReport`.** No gate number moves; the diversity gate is unchanged at N=7 (625 tests green, gauntlet included).
- **The campaign is narrative-free.** `CampaignDef` references battles by encounter id and carries no prose. The `docs/08` §4 story seam lands as its own data in a later M0 slice, not as fields on this schema.
- **The player seat is still the probe.** Every measurement here drives team 0 with `decideBalanceProbe`. A human plays better than it in some places and worse in others, so "completable" is evidence of reachability, not of difficulty. Real difficulty tuning waits for the viewer loop.

## Alternatives rejected

- **Persist battle state across the campaign (design 1).** Carrying HP forward is the FFT-ish answer and it is what M1+ may want. Rejected for M0: it makes every battle's winnability depend on the previous battle's damage roll, which turns a 5-battle sequence into a 5-deep tuning problem before anyone has played it once. `docs/11` §4 is explicit that M0 is wide and shallow.
- **Fold the campaign into `roster.ts`.** A party is a list of records, so the fit is tempting. Rejected: it would tie a campaign-shape change to a `rosterSchemaVersion` bump, and ADR-0011's whole point is that those lines move independently.
- **Reuse the benchmark encounters as the campaign.** Zero new content, and it would have shipped a campaign that cannot be won.
- **Store enemies inline in each encounter file.** Self-contained, and it is what the benchmark set does. Rejected: "every unit this campaign fields" then has no single place to enumerate, and the TTK check above depends on there being one.
