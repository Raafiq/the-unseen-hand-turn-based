# ADR-0023 — The shell is a second page, and a battle is judged by its encounter

- **Status:** Accepted
- **Date:** 2026-08-21
- **Supersedes / amends:** none. Builds on **ADR-0022** (the campaign container) and **ADR-0007** (render imports sim, never the reverse).
- **Owner docs:** `docs/11` §3 M0 items 1/2/6 + AC-M1/M2/M3, `docs/10` §1/§3

## Context

ADR-0022 landed the campaign container, the party save and the codec — and none of it was reachable by a person. There was no title screen, nothing wrote the save anywhere, and the viewer could only play `makeDemoBattle()`. `docs/11` M0 item 1 is that shell.

Three things blocked it, and only the first was obvious.

1. **Nothing wrote the save.** `serializeCampaign` existed; no caller.
2. **The viewer could not be handed a campaign battle.** `Session` takes a `makeState` factory, so the board was easy — but the campaign needs a battle's *outcome* and its *per-unit contributions* back, and `campaign-run.ts` produced both only by fighting the battle itself with the AI.
3. **The viewer judged battles by counting corpses.** `Session` ended a battle when a team had no living units. The campaign's encounters are authored with real `victory`/`defeat` conditions, and an encounter won by killing one named foe, or by surviving N ticks, would have left a player standing on a won battlefield with nothing happening.

## Decision

**1. `campaign-run.ts` splits into load → play → resolve, and the headless runner is composed from the same pieces.**

- `campaignBattleRecords(def, save)` — the record map. **The entire party-carry mechanism is now one function**, used by both paths, so "does progress carry?" has one answer and one place to get wrong.
- `loadCampaignBattle(def, save, encounters, resolver)` — the compiled `BattleState` plus the parsed `Encounter`.
- `deriveRewards(def, save, encounter, contributionByUnit)` — battle-unit ids back to party record ids, through the placements.
- `resolveCampaignBattle(def, save, encounter, report)` — folds an **already-finished** battle in.

`runCampaignBattle` is now `load → runFromState → resolve`. The viewer is `load → a human → resolve`. The only difference between a played campaign and a probed one is who chooses the commands, which is exactly what `docs/10` §1 says input is.

**2. `Session` optionally takes the encounter's rules, and then judges with `evalTerminal`.**

`SessionOptions.rules` carries `victory`/`defeat`/`maxTurns`/`maxTicks`. With them present the session runs the harness's fold verbatim — advance, account, *then* judge — and the team-wipe read is retired for that battle. Without them (the conditionless demo battle) the wipe read stands, because it is all a battle with no `Condition` can honestly support.

The discriminating fixture is a `defeatUnit` victory with a second, untouched foe alive: the wipe read and `evalTerminal` give **opposite** answers on the same board. A fixture whose victory was "wipe team 1" would have passed under either and certified nothing.

**3. The accounting fold is exported from `harness.ts`, not re-implemented.**

`emptyContribution` / `seedContributions` / `accountEvents` / `teamReports` / `assembleReport` now live in `harness.ts` and `runFromState` is built from them. `Session` uses the same five to emit a real `RunReport`.

This matters because the campaign's AP grant reads `contributionByUnit[…].landedActions` (ADR-0022 decision 5). A viewer with its own fold would pay a human differently from the probe for an identical battle, and **both would look correct in isolation**. So the check is an A/B: drive a session with the probe on both seats and byte-compare its report to `runFromState`'s. Mutating either half turns it red.

**4. The save slot is a three-method interface at the `src/render` edge; reads never throw, writes do.**

`src/render/storage.ts` owns all persistent IO — `src/sim/campaign.ts` stays pure by contract. A read returns a discriminated `LoadedSave` (`empty` / `save` / `error`) so a corrupt slot, a save from another campaign, or a version this build cannot migrate reaches the player as a message on the title screen with New Game still working. A game that throws on boot because of a bad save file cannot be fixed from inside the game.

Writes throw, and `CampaignShell` catches and *displays* the failure. A save that silently fails to write is worse than one that fails loudly, because the next screen looks exactly like a successful one.

**5. The shell is DOM-free, for the same reason `Session` is.**

`CampaignShell` holds the screen, the save and the live battle, and touches no `document`. That is what makes AC-M1's "driveable from title screen to ending" a unit test rather than only a browser one — and the browser spec is then free to assert the half only a browser can: that the save survives a real page reload.

**6. The shell ships as `game.html`, a SECOND page; `index.html` stays the engine viewer and links to it.**

`/` remains the debug/engine page — the Pages showcase, the target of twelve existing browser specs, and the thing the README points at. `/game.html` is the game.

## Consequences

- **`main.ts` and `game.ts` share `panels.ts`.** The timeline, status line, resolution preview and turn log moved into one pure `state → HTML` module, injected with per-page presentation metadata. The preview panel is where pillar 4 is actually enforced — its "not modeled yet, so not shown" list is an assertion — and two copies would mean two lists to keep honest, with the stale one hiding a status from a player about to commit a shot.
- **The tab order on `/` changed.** The campaign link is the first focus stop; `play.spec.ts` names it explicitly rather than skipping a `Tab`.
- **AC-M1, AC-M2 and AC-M3 are now met on both halves**, headless and played. AC-M4 (the story seam) is untouched.
- **One save slot, and New Game overwrites it** — an explicit `docs/11` M0 cut. Nothing in the shell guards that beyond the button labels.
- **The prep loop is still not built.** `updatePartyMember` remains the seam; the shell's briefing screen is where it will mount. `campaign-shell.test.ts` already writes through that seam to prove a deployed battle reads the save's party.
- **The player seat is still the probe in every measurement here.** The shell's tests drive battles with `step()` (watch mode) or by waiting out every turn. That the campaign is completable remains evidence of *reachability*, not of difficulty (ADR-0022's last consequence, unchanged).

## Alternatives rejected

- **Make `index.html` the game and move the viewer to `viewer.html`.** The right end state, and where this should go once the shell has the prep loop and story stubs. Rejected now: it would rewrite twelve browser specs' navigation for a shell that is still missing three M0 items, and `/` would stop being the engine showcase before the game is ready to replace it. Recorded in `docs/NEXT.md` as the follow-up.
- **Re-run the player's command log through `runFromState` to get the report.** Determinism says it would reproduce the battle exactly, and it would need no change to `Session`. Rejected: it fights every battle twice, and it makes the report a function of a *replay* rather than of what the player actually saw — a divergence would surface as a wrong reward, not as a failure.
- **Let `Session` keep judging by team-wipe and have the shell re-judge afterwards.** Smaller diff. Rejected: the player would keep being asked for commands in a battle that was already decided, which is precisely the bug AC-V13 exists to prevent, and the banner would be a full turn late.
- **Auto-conclude the battle the moment it is decided.** Rejected: the player never sees the final board. The battle screen holds, shows the banner, and offers `Continue ▸`.
- **A glob over `data/campaign/encounters` for the browser bundle.** Self-maintaining, and `import.meta.glob` is Vite-only. Rejected in favour of explicit imports plus a test that partitions the bundled set against the campaign's own battle list **in both directions** — a missing import fails loudly instead of shortening the campaign.
