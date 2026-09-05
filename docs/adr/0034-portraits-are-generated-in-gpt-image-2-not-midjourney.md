# ADR-0034 - Portraits are generated in GPT Image 2, not Midjourney

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** the owner, on one call taken 2026-09-05. Owner's words, verbatim: "A, swtch to gpt, note to align their age groups to twenties".
- **Extends:** ADR-0033 (the stat plate holds a portrait keyed by asset name). Constrained by `docs/10` §4 and the 3:4 frame (`--portrait-ratio`, commit `3927c38`).
- **Acceptance Criterion:** none. No portrait ships in this decision, and `docs/10` carries no AC for portrait art. The first shipped crop owes one.

## Context

Sixteen job portraits are needed: eight jobs, two genders.
Until 2026-09-05 they were to come from Midjourney, styled against one locked reference, `docs/visual/portraits/reference/archer-f.png`.
That plan was recorded in the `midjourney` skill and in `docs/NEXT.md`.

Four Midjourney singles exist.
Two are in the set (archer-female, priest-female, run with the style reference locked).
The knights and the wizard are not, and each Midjourney run of the knight came back wrong in the same two ways.
The knight-female read 16-22 where the brief asked for mid-thirties (eyeballed, owner and session, 2026-09-02).
The framing put the headband on the top edge across three paid runs of wording, and headroom had to be bought afterwards in the Editor.

On 2026-09-05 the same brief was run on GPT Image 2 (ChatGPT app, "high thinking", `archer-f.png` attached as Image 1) as a probe, twice.
The prompts and settings are in `docs/visual/portraits/reference/gpt-probe-prompts.md`; the measured comparison is the table below (its only copy since `docs/NEXT.md` was cut down on 2026-09-06).

| Image | Line edge (foreground) | Skin distance | Blue-cloth distance | Background distance |
|---|---|---|---|---|
| `archer-f.png` (locked reference) | 27.2 | 0 | 0 | 0 |
| `priest-f.png` (Midjourney, in set) | 33.8 | 27 | 18 | 8.5 |
| `knight-f-gpt.png` (GPT v1) | 25.4 | 6 | 31 | 42 |
| `knight-f-gpt2.png` (GPT v2) | 27.6 | 34 | 18 | 24 |
| `priest-f-gpt2.png` (GPT v2) | 27.5 | 32 | 18 | 29 |

Distances are Euclidean RGB from the archer's sample; lower is closer.
What the table says: v2 matched the archer's line energy and closed the blue-cloth gap to the same value the in-set Midjourney priest has.
Skin moved the other way, 32-34 from the archer against an in-set Midjourney spread of 27; a prompt pass owes "paler, less saturated".

GPT also won on prompt adherence (eyeballed).
The v1 knight kept every asked detail: bare head, gorget with gold edge, scar, three-quarter left, eyes to viewer, cropped below the collarbone, and clear space above the crown without an outpaint step.
It rendered the asked background `#e9d7a8` within 5-11 units.
The locked Midjourney archer ignored that hex and rendered `#efe1c6`, 32 units off.

## Options considered

1. **Stay on Midjourney.**
   Keeps the two in-set images and the whole recorded method.
   The age and framing faults have a known fix: the proven age variant plus the waist-up or Editor-outpaint route.
   But it cannot match GPT's adherence: three runs of wording never bought headroom, `--no` is a weak nudge (`red::-0.5`), and prompt weights do not exist in V8.2.
   Every fix is a paid re-run judged by eye.
2. **Switch to GPT Image 2 and regenerate all sixteen.**
   Wins adherence and the background hex; v2 matches the archer's line and blue.
   Costs the two in-set Midjourney images, which are replaced rather than kept.
   GPT has no seed, so no run is byte-reproducible; the record must carry settings per run.
3. **Mixed set: keep the Midjourney archer and priest, generate the other fourteen in GPT.**
   Cheapest in paid runs.
   Rejected: it splits the style.
   The Midjourney skin is paler and the eye is a scratchy contour; GPT's is darker and a tidy anime eye.
   Sixteen portraits sit side by side in the turn rail and the plate, so one seam is sixteen seams.

## Decision

**Option 2. The owner's call, 2026-09-05.**

- ~~All sixteen portraits~~ Portraits are generated in GPT Image 2 in the ChatGPT app, "high thinking", ~~with `archer-f.png` attached as Image 1 on every run~~ with the style lock attached (amended the same day: ten portraits, `style-ref-1..4.png` as Image 1-4; see Consequences).
- ~~`archer-f.png` is the style reference only. It is not shipped and is not one of the sixteen.~~ Superseded the same day; the Midjourney archer is historical.
- **Every portrait character is in their twenties.** This replaces the "young 20s-30s cast" in the Midjourney briefs and every per-block age above thirty.
- The background hex `#e9d7a8` stays in every prompt. It is the campaign page surface (`--surface` in `index.html`), so a portrait rendered to it sits flush on the page. It is not re-specced to the archer's `#efe1c6`. GPT reproduces the attached refs' paper over this number (10 of 10 v4 runs, 31-38 units off), ~~so the hex is enforced post-process if at all; that decision is pending (amendment 2026-09-06)~~ and the owner kept the paper as delivered: **the hex is not enforced for portraits** (second amendment, 2026-09-06).
- The sixteen GPT prompts live in `docs/visual/portraits/gpt-portrait-prompts.md`, authored 2026-09-05 by `art-director`. The owner runs them; ~~outputs land as `docs/visual/portraits/reference/<job>-<gender>-gpt3.png`~~ outputs land as `docs/visual/portraits/reference/<job>-<gender>.png` (see the amendment under Consequences: the lock, the scope and the count all changed the same day).

## Consequences

**Easier.**
Headroom comes from the prompt, not from an Editor step, so each portrait is one run rather than a run plus an outpaint.
~~The background lands on-spec, so a shipped crop needs no recolour to sit on the page.~~ True with the archer attached; false with the four refs attached (amendment of 2026-09-06 below).
Age and gender follow the prompt, which the Midjourney runs did not reliably do.

**What we give up.**

- The Midjourney singles `knight-f.png`, `knight-m.png` and `wizard-f.png` are retired as candidates. They stay in the tree as evidence only.
- The in-set Midjourney `priest-f.png` is also replaced by a GPT priest, so the set does not split. The archer stays, as the reference.
- The `midjourney` skill's sixteen portrait prompts (`references/portrait-prompts.md`) and the reframe blocks become historical. They are kept as the character briefs, which the GPT prompts translate.
- The three open Midjourney re-runs in `docs/NEXT.md` (wizard hood, knight age, priest age) are moot.

**Known GPT limits, accepted.**

- At 1:1 GPT draws a tidy anime eye with a solid iris and a highlight dot; the archer's is a scratchy broken contour. v1 and v2 drew it the same way despite rewritten style language, so it is the likely model ceiling. Invisible at 96 px and at 28 px (eyeballed).
- There is no seed. A re-run with the same prompt and settings is the closest reproduction available and is not byte-identical. Settings must be recorded per run: tool, thinking level, the attached reference, the delivered size, the date. `gpt-probe-prompts.md` is the worked example.
- The ChatGPT app does not expose the image quality tier, so that setting cannot be recorded and cannot be held constant.

**Amendment, 2026-09-05 (same day).**
The decision stands: portraits come from GPT Image 2, not Midjourney.
Two things under it changed the same evening.

- ~~`archer-f.png` is the style reference, attached as Image 1 on every run.~~ **The style lock is now four owner-supplied images, `docs/visual/portraits/reference/style-ref-1..4.png`**, attached as Image 1-4. The Midjourney archer is historical; its bytes are `HEAD:docs/visual/portraits/reference/archer-f.png`, and the working-tree `archer-f.png` is a GPT v3 output. How the four were made (tool, prompt, settings) is unrecorded until the owner answers.
- ~~Sixteen portraits, eight jobs.~~ **Portrait scope is five jobs for now: knight, archer, thief, wizard, priest. Ten portraits.** Owner's words: "we may have too many jobs now. Will reduce in future. So for now we keep to the basic jobs". The game still has eight jobs; cutting any needs its own ADR. Monk, geomancer and summoner keep the placeholder.
- The sixteen v2/v3 GPT outputs were run against the Midjourney archer and rejected for sameness of pose, expression and features. ~~Outputs land as `<job>-<gender>-gpt3.png`.~~ The owner saves over the plain `<job>-<gender>.png` name. v4 prompts (waist-up, varied pose, the four refs attached) are in `docs/visual/portraits/gpt-portrait-prompts.md`.

**Amendment, 2026-09-06 (morning).**
The decision stands.
One consequence above is now false: with `style-ref-1..4.png` attached, GPT renders the refs' paper (`#e2c18a` to `#e9c88b`) and not the prompt's `#e9d7a8`, in all ten v4 outputs (measured, art-director, 31-38 units off).
A prompt edit cannot fix it; ~~the hex is enforced post-process at asset-build time, or the darker card is accepted.
The owner has not chosen (`docs/NEXT.md`, Ask B).~~ Decided the same day, below.
Eight of the ten v4 portraits are approved by the art-director and the main session, eyeballed; `archer-f` and `priest-m` are sent back for v4.1.
No portrait ships in this amendment either.

**Amendment, 2026-09-06 (second). The paper decision is closed, and the style refs have no prompt.**
The decision stands.

- **Paper: kept as the refs' paper.** Owner's words, verbatim: "Leave paper color as is". Portraits ship with the paper GPT delivers, `#e2c18a` to `#e9c88b`, with no post-process shift. The `#e9d7a8` hex stays in the prompt as the page surface but is **not enforced for portraits**. In the scene player the portrait reads as a darker card laid on the page; that is accepted. The "Easier" consequence above ("a shipped crop needs no recolour") is true again, by decision rather than by the model.
- **The style refs are owner-chosen outputs with no recorded prompt.** Owner's words, verbatim: "as for the four style-ref pictures, it's just some random generation and I chose the ones i like". Tool, prompt and settings were not kept. **The four files `style-ref-1..4.png` are the lock**; they cannot be regenerated from text and must stay in git. The invariant below, "a GPT portrait's prompt and settings are recorded", applies to the portraits, which attach the refs; it does not apply to the refs.
- ~~The two v4.1 reruns (`archer-f`, `priest-m`) landed 2026-09-06 and are not yet judged.~~ Both approved the same day; see the third amendment. Both archers were finished with a follow-up edit prompt in the app; the prompts are verbatim in `docs/visual/portraits/reference/README.md`.
- No portrait ships in this amendment either.

**Amendment, 2026-09-06 (third). The ten-set is approved at the prompt level.**
The art-director approved both v4.1 reruns on 2026-09-06, agreed by the main session, eyeballed against the four refs; the per-file record is `docs/visual/portraits/reference/README.md`.
The owner has not judged any portrait in words.
Still open on the owner's side: the shipped crop format (Ask E, `docs/NEXT.md`) and confirmation of the v4 settings (Ask C).
No portrait ships in this amendment either.

**Invariants this creates.**

- A GPT portrait's prompt and settings are recorded in the tree before the next one is run. A result nobody can re-run is not an asset (`CLAUDE.md`).
- The v3 prompts must carry the skin correction ("paler, less saturated tan, like the reference"), the knight's vertical quilting, and the priest's circlet wording, or the v2 regressions ship.
- `CLAUDE.md`'s "No portrait art exists" stays true until a crop is wired into `PORTRAITS`. This ADR ships no art.

## Numbers and claims in this ADR that no test asserts

- Every number in the table was measured once by `art-director` on 2026-09-05 with scratch scripts that are not in the repo. Nothing re-derives it.
- Age, framing and "reads as one set" verdicts are eyeballed. No test reads a portrait image.
- "Invisible at game size" is eyeballed on two images at 96x116 and 28 px.
- The v2 settings are assumed to mirror v1 because the owner chose the option that named them and reported no change. The v4 settings are assumed the same way.
- The v4 paper and ink numbers in the amendment were measured once by `art-director` on 2026-09-06 with scratch scripts not in the repo.
- Nothing asserts the shipped paper colour. The second amendment accepts whatever the refs carry, so there is no target number to test; a crop with a different paper would not go red.

## References

- `docs/NEXT.md` at `6067276` held Ask 5 and the probe write-up; it was cut down on 2026-09-06 and the probe table now lives only in this ADR.
- `docs/visual/portraits/reference/gpt-probe-prompts.md` (v1 and v2 prompts and settings).
- `docs/visual/portraits/gpt-portrait-prompts.md` (the sixteen GPT prompts).
- `docs/visual/portraits/reference/README.md` (the manifest).
- `.claude/skills/midjourney/references/portrait-prompts.md` (the character briefs, now historical for portraits).
- ADR-0033 (the stat plate's portrait key), commit `3927c38` (the 3:4 frame).
