# 04 — Improvements & Differentiators

What we take from FFT, what we fix, and what makes this its own game. This doc is **GDD**, not SDD — it sets direction that specs inherit.

---

## 1. FFT criticisms → our answers

| Criticism (community + design) | Our answer | Where |
|---|---|---|
| **Calculator/Arithmetician** — free, no-charge, no-counterplay AoE nukes | If a Calc-like class exists, gate the win-button: charge/cooldown, scaling cost, **disruptable** setup | `docs/02` B6 |
| **Orlandeau / uniques invalidate generics** | Uniques = **premium chassis + signature trait**, routed through the same system; built generics can rival them; optional "unique tax" | `docs/02` B6; `docs/00` |
| **Speed/Haste turn-economy runaway** | Haste ×1.5 (correct value), Speed grows slowly, opportunity-cost on Speed builds | `docs/01`; `docs/02` B5 |
| **Teleport "punch a hole anywhere"** | Keep **distance-scaled teleport failure %**; back-guard formations reward positioning | this doc §5; `docs/03` #11 |
| **Blade Grasp + high Brave trivializes physical maps** | Reactions cost a slot (opportunity cost); magic/status ignore them; enemies mix damage types | `docs/02` B5; `docs/06` |
| **JP grind / degenerate self-farming** | AP earned by meaningful action, all units earn, no degenerate loop is optimal; **grind-budget curve** | `docs/02` B4; `docs/07` |
| **De-level to re-grow stats exploit** | Normalized growth (or per-unit leveling) | `docs/02` B4 |
| **MP swinginess** | Explicit MP economy design + pacing; casters gated by charge/tile-dodge, not starvation | `docs/07` |
| **Harsh permadeath + no undo** | Keep permadeath as a **toggle**; add **rewind** (substrate is a P0 invariant) and difficulty tiers | this doc §4; `docs/05`, `docs/08` |
| **Random-battle level-scaling tedium / Move-Find RNG treadmill** | No mandatory grind; encounters are authored and meaningful (`docs/06`); rewards aren't RNG treadmills | `docs/06`, `docs/07` |
| **Hidden Zodiac ±50% swing** | Keep the mechanic, **surface it** in hit/damage previews | §3 below |
| **Faith double-edge is invisible** | Keep the mechanic, **surface it** as a labeled trade-off in the unit screen | §3 below |
| **Stun-lock chains (Sleep/Charm/Stop)** | Diminishing-returns / cap on repeated hard-disables; telegraph incoming | `docs/06`; `docs/02` B5 |

## 2. Balance as a *process*, not a slogan

"Power fantasies with counterplay" is the value; here's the machinery that enforces it when the combo space is effectively unbounded (N² hybrids × sockets × secondaries):

1. **Encounter design is the primary balancer** (`docs/06`). Builds are proven or broken against authored encounters, not hand-tuned pairwise. The AI is the test harness.
2. **Opportunity cost is the structural balancer** (`docs/02` B5) — scarce slots, mutually-exclusive branches, deployment caps mean no build has everything.
3. **Soft caps, not hard bans** — Speed/Haste, evasion stacking, and hard-disable duration hit **diminishing returns** rather than being forbidden.
4. **The "allowed to be strong" rule** — a combo may be strong **iff** it has a telegraphed, actionable counter (range, dispel, status-type mismatch, positioning). Free + spammable + no-response is the only thing outright disallowed.
5. **Verification via the build-fantasy suite** (`docs/03` + `docs/00` metric): ≥8 archetypes clear the benchmark, none dominates. That's the acceptance test, re-run each balance pass.

## 3. Transparency — split into two kinds

The first draft wanted both "full transparency" and "discovery joy," which fight. We separate them:

- **Resolution transparency — adopt fully (pure anti-frustration):** always show hit %, damage range, CT forecast/turn-order timeline, AoE, and the **hidden multipliers** (Zodiac compatibility, Faith interaction, facing bonus, elemental modifier) on target-select. Nothing about *this action's outcome* is hidden.
- **Progression / content discovery — preserve (the fun of finding out):** hybrid recipes, what a fusion becomes, secret jobs, and unlock surprises are **hinted, not spoiled**. Job-unlock *requirements* are shown (FFT's opacity was a flaw); the *reward's contents* stay a discovery.

## 4. Lessons from genre peers

- **Tactics Ogre: Reborn** — CHARIOT rewind (branching timeline, praised for *more* experimentation), buff-tiles, **per-unit leveling**, scan, speed toggle, 100% craft. → we take **rewind (as a P0-architected substrate)**, per-unit-style growth, scan, speed toggle.
- **Fell Seal: Arbiter's Mark** — "FFT job system, done more": **AP purchase**, **badge/secret classes**, authored generics, difficulty toggles. → the backbone of our AP + mastery + hybrid model, and authored generics.
- **FFTA / A2** — huge job breadth, **learn-from-equipment**, opt-in **law bonuses** (carrots not sticks). → sockets/gear-as-ability as an *optional* departure; per-battle modifiers only ever as rewards.
- **Triangle Strategy** — fixed units, **weapon upgrade trees**. → the wrong end of the spectrum for us, but weapon-trees are a kept-optional idea.
- **Unicorn Overlord** — conditional **tactics scripting**. → our `[DEFERRED]` behavior layer (companions/auto-resolve only).
- **Symphony of War** — **reversible promotion / built-in respec**. → validates our permanent-progress respec stance (`docs/02` B7).

## 5. Known-bad-experiences to keep flagged

`[BASELINE, but see enhancements]` — mechanics we keep but must handle:
- **Teleport failure %** — kept as the counter to teleport abuse (don't silently remove it).
- **Blade-Grasp-style Brave reactions** — kept, but slot-costed and beaten by non-physical damage.
- **Hidden Zodiac / Faith** — kept, but surfaced (§3).
- **Stun-lock potential** — kept, but capped/telegraphed (`docs/06`).

## 6. Quality-of-life table-stakes (2026 expectations)

- **Rewind/undo** (branching, N-turn) + per-move movement undo before confirm. *(Substrate = P0 invariant, `docs/05`.)*
- **Speed toggle / fast-forward**; quick-resolve for trivial fights.
- **Difficulty tiers + modular toggles**: permadeath on/off, level-scaling on/off, XP/AP rate, iron-man.
- **Transparent job/unlock trees** (requirements shown; see §3 for the discovery split).
- **Saveable loadout presets** per unit; one-click equip; "remove all equipment."
- **Enemy scan** (jobs, HP, abilities, turn order) before committing.
- **Always-visible turn-order timeline** + hit/damage/AoE previews.
- **Autosave, mid-battle save, retreat/forfeit/quick-restart.**
- **New Game+** to carry builds forward.

## 7. Accessibility (first-class, not a footnote)

Pillar #4 is "readable" — that includes access:
- **Colorblind-safe** element/status/faction language: never color alone — pair with icon + label. (See `dataviz` conventions when we build the UI.)
- **Legible timeline & previews:** scalable text, high-contrast mode, tabular numerics for stats.
- **Input & pacing:** full keyboard/controller nav with visible focus; no reliance on fast reactions (it's turn-based — keep it that way); `prefers-reduced-motion` respected in UI animations.
- **Cognitive load:** progressive disclosure of systems (`docs/08` onboarding); optional tooltips-everywhere mode; the resolution-transparency previews (§3) *are* an accessibility feature.

## 8. Community & build-sharing (nearly free — capitalize on it)

Because combat is **deterministic** (seeded RNG, `docs/05`) and builds are **structured data** (`docs/05` schemas), these are cheap and high-leverage:
- **Build export/import codes** — share a unit/party build as a short string; "equip this build."
- **Deterministic challenge sharing** — a seed + encounter + ruleset reproduces exactly, enabling community puzzles/speed-clears.
- **Wiki/tooling-friendly data** — the job/ability data model is designed to be published for third-party build planners.
- In-game **"share this build"** from the loadout screen.

*(Sharing is a `[Should]` in `docs/08`, not a launch blocker — but the architecture must not preclude it, which is why determinism is a P0 invariant.)*

## Sources
[Hack the Minotaur — special characters](https://hacktheminotaur.com/final-fantasy-tactics-the-ivalice-chronicles/best-special-characters-ranked/) · [Vidya Thoughts — job system](https://vidyathoughts.com/2024/06/16/final-fantasy-tactics-job-system-perfected/) · [bravesword — FFT overrated (grind/scaling/teleport)](https://bravesword.wordpress.com/2011/08/02/final-fantasy-tactics-is-overrated/) · [Aftermath — JP grind culture](https://aftermath.site/final-fantasy-tactics-grind-jp-mandalia-plains/) · [RPG Site — Tactics Ogre Reborn systems](https://www.rpgsite.net/news/13383-tactics-ogre-reborn-details-skills-battiefield-elements-unit-recruitment-the-wheel-of-fortune-the-chariot-tarot-rewind-feature-and-the-world-tarot-route-change-mechanic) · [TheGamer — TO Reborn vs FFT (per-unit leveling)](https://www.thegamer.com/tactics-ogre-reborn-final-fantasy-tactics-fft-which-is-better/) · [Fell Seal Wiki — Badges](https://fellseal.fandom.com/wiki/Badges) · [FF Wiki — FFTA2 jobs](https://finalfantasy.fandom.com/wiki/Final_Fantasy_Tactics_A2:_Grimoire_of_the_Rift_jobs) · [FF Wiki — Law system (A2)](https://finalfantasy.fandom.com/wiki/Law_system_(Tactics_A2)) · [RPGFan — Unicorn Overlord](https://www.rpgfan.com/review/unicorn-overlord/) · [TechRaptor — Symphony of War](https://techraptor.net/gaming/reviews/symphony-of-war-nephilim-saga-review) · [GoNintendo — FFT Ivalice Chronicles QoL](https://www.gonintendo.com/contents/53170-final-fantasy-tactics-the-ivalice-chronicles-quality-of-life-features-detailed) · [MMORPG.com — Ivalice Chronicles QoL](https://www.mmorpg.com/previews/preview-final-fantasy-tactics-the-ivalice-chronicles-quality-of-life-improvements-are-a-welcome-addition-2000135988)
