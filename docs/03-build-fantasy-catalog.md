# 03 — Build-Fantasy Catalog

**Why this doc exists:** the systems in `docs/02` are a *machine*. This is the *output* the machine must produce. Each entry is a target build a player should be able to discover and make viable.

> **This is the acceptance test for the whole job system.** Every `docs/02` system (spine or optional) must feed **≥ 1** archetype here, and the benchmark suite (`docs/06`) must be clearable by **≥ 8** of these within the efficiency band with **no single build dominating** (`docs/00` success criteria). **A Part-B mechanic that produces zero archetypes gets cut.**

Format per entry: **Fantasy** (the player's one-line pitch) · **Systems** (which `docs/02` axes create it) · **Loadout** (the 5-slot + traits sketch) · **Counterplay** (how a smart enemy answers it — the balance handle from `docs/04`).

Legend for the "Systems" column: `chassis` = 5-slot recombination · `tree` = AP job/skill tree + mastery · `hybrid` = fusion job · `socket` = gear-as-ability/sockets `[OPTIONAL]`.

---

## Frontline / bruiser fantasies

**1. Counter-Riposte Wall** — *"Hit me and lose."*
- Systems: chassis + tree. Loadout: Knight primary / Monk secondary / **Reaction: Counter** / **Support: Two Hands** / **Move: Move-HP-Up** / Traits: high-Brave mastery, Defense mastery.
- Counterplay: magic and status ignore Counter; Don't-Act / ranged kiting; pull it out of position.

**2. Dual-Wield Deleter** — *"One turn, one corpse."*
- Systems: chassis + tree + hybrid (Ninja-line). Loadout: Ninja primary / Thief secondary / **Support: Two Swords** / **Concentrate** trait / **Move+2**.
- Counterplay: high evasion / Blade-Grasp analogues, Protect, bait the alpha then punish the exposed low-HP attacker (the B6 "power with counterplay" case).

**3. Self-Buffing Solo Duelist** — *"I am my own party."*
- Systems: chassis + tree. Loadout: Templar-hybrid primary / self-Haste+Protect secondary / **Reaction: Regenerator** / **Support: Martial Arts** / **Move: Move-HP-Up**.
- Counterplay: burst it before buffs stack; Dispel; focus-fire (AI directive, `docs/06`).

## Control / disable fantasies

**4. Status-Lord Debuffer** — *"You don't get to play."*
- Systems: chassis + tree. Loadout: Mystic/Oracle primary / Time Mage secondary (Stop/Immobilize) / **Reaction: MP-related** / **Short Charge** / **Move+1**.
- Counterplay: status immunity gear, low-Faith targets, Reraise; the anti-stun-lock caps (`docs/04`) bound the misery.

**5. CT-Manipulation Controller** — *"I control the clock."*
- Systems: chassis + tree. Loadout: Time Mage primary / Haste/Slow/Stop secondary / **Short Charge** / **Move: Teleport (bounded, see docs/04)**.
- Counterplay: Speed gear, spread positioning vs. AoE Haste-denial, kill the enabler.

**6. Charm/Confusion Puppeteer** — *"Fight for me."*
- Systems: chassis + tree. Loadout: Mystic primary / Mediator/Orator secondary / high-MA traits.
- Counterplay: Faith/Zodiac swing against infliction; immunity; kill charmed unit fast (a real player cost).

## Caster fantasies

**7. Glass-Cannon Summoner** — *"Screen-clearing, if it lands."*
- Systems: chassis + tree. Loadout: Summoner primary / Black Magic secondary / **Support: Magic Attack Up** / **Reaction: Reraise-on-death** / **Move: Move-MP-Up**.
- Counterplay: slow charge dodgeable (tile targeting), Silence, gap-close and kill; low MP economy (`docs/02` A4) forces pacing.

**8. Spellblade Hybrid** — *"Melee that ignores your armor."*
- Systems: hybrid (Knight+Black Mage). Loadout: Spellblade primary / Battle Skill secondary / balanced Brave/Faith traits.
- Counterplay: Shell + low-Faith frontline; out-range it; its split stats mean it's master of neither extreme.

**9. Faith-Zero Anti-Mage Bruiser** — *"Your magic bounces off me."*
- Systems: chassis + tree (deliberate low-Faith build). Loadout: Knight primary / physical secondary / gear that drops Faith.
- Counterplay: pure physical pressure, status that ignores Faith, Break skills; it's helpless if *it* wanted any magic utility (opportunity cost, B5).

## Mobility / skirmish fantasies

**10. Sky-Drop Dragoon** — *"Death from off-screen."*
- Systems: chassis + tree. Loadout: Dragoon primary / Jump-boost traits / **Ignore Height** / **Move+2**.
- Counterplay: untargetable-while-airborne cuts both ways (it can't act meanwhile); reposition under the landing tile; AoE the predicted tile.

**11. Teleport Assassin** — *"Anywhere, anyone, once."*
- Systems: chassis + tree + socket. Loadout: Thief primary / Steal secondary / **Move: Teleport (failure % retained, docs/04)** / crit-from-rear traits.
- Counterplay: the retained teleport-failure risk; back-guard formations; bodyguard the backline.

**12. Terrain Geomancer** — *"The battlefield is my weapon."*
- Systems: chassis + tree. Loadout: Geomancer primary / elemental secondary / **Move: Ignore-terrain** / element-boost socket.
- Counterplay: Float/immunity, fight on neutral terrain, elemental absorb gear (`docs/01` §5).

## Support / economy fantasies

**13. Reraise Cleric** — *"My team doesn't stay down."*
- Systems: chassis + tree. Loadout: Priest primary / Chemist secondary / **Reaction: Auto-Potion** / **Move: Move-MP-Up**.
- Counterplay: Innocent (Faith-0) denies magic heals; burst past the revive window; Silence.

**14. Socket-Toolbox Utility** — *"I bring exactly the answer needed."* `[OPTIONAL]` proof
- Systems: chassis + **socket** (this is the archetype that justifies keeping sockets — the *transferable* answer to today's encounter).
- Counterplay: it trades peak power for flexibility; a focused threat overwhelms a generalist.

**15. Tanky Provoker / Aggro-Bruiser** — *"Look at me, not them."*
- Systems: chassis + tree. Loadout: Knight primary / taunt-analogue secondary / max-HP traits / **Reaction: damage-reduction**.
- Counterplay: ignore-and-bypass AI, status the tank, AoE around it.

**16. Bard/Dancer Field-Warper** — *"Slow, but I bend the whole map."*
- Systems: chassis + tree (gender-locked baseline). Loadout: Perform primary / support secondary / survivability traits.
- Counterplay: rush the low-HP performer; interrupt the charged Perform (`docs/01` §3).

**17. Longshot Skirmisher** — *"Reach without a footstep."*
- Systems: chassis + tree. Loadout: Archer primary / physical secondary / **Support: Concentrate** / **Move: Scout** / Traits: marksman (PA mastery). Its identity is instant-shot **reach + status** (Head/Leg-Shot), not raw per-hit power — it opens the fight before a melee build has closed the gap.
- Counterplay: gap-close and pin it — it folds in melee; take its high ground to deny the range/line advantage; high-evasion foes shrug off its shots until it commits **Concentrate** (which then costs it the Support slot). This closes the catalog gap for the Archer baseline (`docs/02`).

---

## Coverage matrix (systems → archetypes)

| System (`docs/02`) | Feeds archetypes | Verdict |
|---|---|---|
| 5-slot chassis | all | **Keep — core.** |
| AP job/skill trees + mastery | all | **Keep — core.** |
| Hybrid/fusion jobs | 2, 8 (+ recipe web) | **Keep — core.** |
| Gear-as-ability + sockets `[OPTIONAL]` | 11, 12, 14 | **Keep** — only axis giving *transfer/toolbox* fantasies. |
| Weapon skill-trees `[OPTIONAL]` | (folds into tree) | **Cut unless** a signature-weapon archetype emerges in playtest. |
| Set bonuses `[OPTIONAL]` | (light: 12) | **Defer** — nice-to-have, not identity-defining. |
| Behavior scripting `[DEFERRED]` | none (manual play) | **Deferred** — produces no core archetype. |

> This matrix is the living contract: when a system stops feeding an archetype, it leaves the game. Update it whenever `docs/02` changes.
