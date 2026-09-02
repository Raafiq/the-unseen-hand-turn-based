# The five re-run prompts — reframe, REVISION 2

**Draft by `art-director`, 2026-09-02. Supersedes revision 1 entirely.**
Nothing here is committed and no repo file was edited. The owner runs these.

**Revision 1's archer control run FAILED.** That failure is the most useful thing this
slice has produced and the whole framing recipe is rewritten below because of it.

---

## HAND BACK ORDER: `archer-female` ONLY

Run **block 1 and nothing else.** Four images. The other four blocks are written and
ready below, but do not buy them until the archer clears its pass line. Revision 1
proved that a framing clause can look correct in prose and constrain nothing.

---

## WHAT REVISION 1 GOT WRONG

The archer came back: **headroom fail** (headband at or touching the top edge in 3 of 4,
hair off the top), **style pass** (all four match `archer-f.png`), **props** (bow staves
and arrow shafts crossing 3 of 4), **age young** (~14–18).

All of that is **eyeballed by the main session, not measured.** The frames are not
committed, so `headroom.mjs` has not been run on them. Where that matters is flagged
inline below; it matters most for "3 of 4", which is a count nobody counted with a tool.

### The coordinator's diagnosis is right. It is also incomplete.

**Their diagnosis:** a named-feature clause only buys headroom when the feature sits
**above the crown**. The monk's topknot does. The archer's headband sits on the **brow**
and her braid hangs **downward**, so `complete and clear of the top and side edges` was
already true of a tight crop and constrained nothing. Correct.

**What they did not have:** the proven monk text is now in `portrait-prompts.md`, and
comparing it against my failed archer shows **three** differences, not one.

| | monk — PASSED | my archer — FAILED |
|---|---|---|
| Shot type | `waist-up portrait of a woman` | same |
| **Margin clause position** | **words 6–22. Immediately after the shot type, BEFORE the subject.** | **last clause of the head, after seven costume phrases.** |
| Named feature | topknot — **above the crown** — phrased `well clear of the top edge of the picture`, placed next to the hair it describes | headband (**on the brow**) and braid (**hangs down**), phrased `complete and clear of the top and side edges`, placed dead last |
| `her whole face visible and lit` | present | absent |

I demoted the margin clause from the highest-weight position in the prompt to the
lowest. This project's own record says Midjourney weights the **start** of a prompt and
that gender belongs in the first clause for exactly that reason. I knew that and moved
the one clause that was doing the work to the back.

**I am not claiming position was the cause and the feature clause was not.** Both
changed, in one run, so the run cannot separate them — the same fault I warned about in
block 2 of revision 1 and then committed myself in block 1. The rewrite below fixes
both, deliberately, because separating them would cost two more paid runs to learn
something neither answer would change.

---

## THE NEW FRAMING RECIPE

One instruction, said three ways, in the positions the proven monk text used.

| Part | The words | Where it goes |
|---|---|---|
| 1. Shot type | `waist-up portrait of a woman` | first words |
| 2. **Margin clause** | `framed loosely with an unbroken band of empty flat background above the top of her head about one fifth of the height of the picture, and empty flat background on both sides of her shoulders` | **immediately after part 1, before the subject** |
| 3. Named feature | `the crown of her head and <TALLEST THING> well clear of the top edge of the picture` | next to the hair/headgear it describes, mid-prompt |

### Why part 2 cannot be satisfied by a tight crop of any subject

**The old clause's satisfier was a feature being uncut.** A brow-level headband is uncut
in a crop that slices the hair above it — the *headband* is not clipped, so the clause is
true. That is exactly what came back. The clause was satisfiable by the thing it was
written to forbid.

**The new clause's satisfier is background, positioned relative to the crown, sized as a
fraction of the picture.** It never names a feature at all. It names the **gap**.

- A crop tight enough to clip the crown contains **zero** background above the crown, so
  the band does not exist and the clause is false.
- `unbroken` kills the partial case — the shipped `archer-f.png` has background in its
  upper-left corner but a bow stave running through it, and a corner is not a band.
- `about one fifth of the height of the picture` kills "a few pixels of sky". It gives a
  quantity, and it is the same quantity for every job.
- It is **subject-independent by construction.** A bald monk, a hatted geomancer, a
  headbanded archer and a hooded wizard all have a crown, and none of them can satisfy
  "a band of background above the crown" by being cropped tighter. Part 3 still names the
  tallest feature per block, but part 3 is now the redundancy, not the mechanism.

### Is `waist-up` inert? Probably close to it. Do not spend a run finding out.

**What is proven:** `waist-up` is **not sufficient**. The monk and the archer both used
it; one got room and one did not.

**What has never been tested:** whether it is necessary. No run has used the margin
clause without it.

**Prior evidence, from this repo's own record:** eight probe runs ignored
`cropped at the collarbone` and `fills the frame edge to edge`, and `project-prompts.md`
concluded "STOP FIGHTING THE CROP — framing instructions are not worth a paid run".
Shot-type words have a track record here, and it is bad.

**So my read: the effect almost certainly lives in the margin clause and its position,
and `waist-up` is close to inert.** Keep it anyway. It is three words, it is in the only
text that has ever worked, and dropping it would be an unforced departure from the proven
recipe to test a word whose answer changes nothing. **If a run must be spent on framing,
spend it on the margin clause, not the shot type.**

---

## BLOCK 1 — `archer-female`. RUN THIS ONE. NOTHING ELSE.

**The style reference does not change.** `docs/visual/portraits/reference/archer-f.png`
stays locked in the Style Reference slot. This block produces a **portrait**. Do not drag
the result into the slot. Same image in the slot for this run and every run after it.

Settings: Raw on, 5:6, style reference locked, 4 images. Flags are written into the block
so it works standalone.

```
waist-up portrait of a woman framed loosely with an unbroken band of empty flat
background above the top of her head about one fifth of the height of the picture, and
empty flat background on both sides of her shoulders, a female archer in her twenties, a
worn leather headband, dark hair braided back, the crown of her head and every strand of
her hair well clear of the top edge of the picture, her whole face visible and lit, a
quiver strap crossing one shoulder, a russet-brown leather jerkin collar, freckles
across the nose, narrow watchful eyes,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight, thin
watercolour wash inside the line, lightly simplified features with restrained shading,
muted desaturated ochre and dusty blue palette, three-quarter turn to the left with eyes
toward the viewer, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark```

### What changed from the block that failed, and why

| Edit | Was | Now | Why |
|---|---|---|---|
| **Margin clause position** | last clause of the head, after seven costume phrases | **second clause, immediately after `waist-up portrait of a woman`** | The proven monk text puts it there. This project's record says the model weights the start of the prompt; I moved the working clause to the back and it stopped working. Highest-confidence edit in this file. |
| **Margin clause wording** | `a wide margin of empty flat background above her head and on both sides` | `an unbroken band of empty flat background above the top of her head about one fifth of the height of the picture, and empty flat background on both sides of her shoulders` | `wide margin` has no size and no anchor. The new wording measures from **the top of her head** and gives a **quantity**. `unbroken` rules out the shipped archer's own case: a background corner with a bow stave through it. |
| **Named feature** | `the whole of her headband and the full length of her braid complete and clear of the top and side edges` | `the crown of her head and every strand of her hair well clear of the top edge of the picture` | The coordinator's diagnosis. Headband = brow. Braid = downward. Neither constrained anything. `the crown of her head` is above the crown by definition, and it is the same phrase every other block can use. `well clear of the top edge of the picture` is the monk's exact proven phrasing. |
| **Named feature position** | dead last | next to `dark hair braided back`, the thing it describes | Mirrors the monk, where the topknot clause sits directly after the topknot. |
| `her whole face visible and lit` | absent | added | Present in the proven monk text and missing from my failed archer. This is the one edit that is not about headroom; it is here to make the run as close a replica of the proven recipe as a different subject allows. |
| Age words | `in her twenties`, `freckles`, `narrow watchful eyes` | **unchanged** | See below. |
| The `--no` list | unchanged | **unchanged** | See the props section. Not touched without the owner's word. |
| The style tail | unchanged | **unchanged, byte-for-byte** | |

### Age: deliberately NOT touched, and this is a real finding

The archer came back reading ~14–18 — younger than `archer-f.png`, from a run in which
**I changed no age word at all.** Only framing changed.

**If that reading holds, framing and apparent age are not independent in this model.**
That is bad news for block 2, which changes both at once, and I have written it into
block 2's pass line rather than leaving it as a footnote.

Adding age words to the archer now would put a second variable into the one run whose
entire job is to isolate framing. **Not doing it.** If the archer's age is still wrong
after framing lands, that is its own single-variable run — and by then Run A's age
cluster will have been tested on two more subjects.

**Uncertainty that matters here:** "reads 14–18" is one person's read of four
uncommitted images, with no side-by-side against `archer-f.png` recorded. It might be
run-to-run variance across four frames rather than an effect. Treat it as a hypothesis,
and check it explicitly on this run by putting the new frames next to `archer-f.png`.

### PASS / FAIL — written before the images exist

**PASS** requires all three:

1. **Headroom.** At least **3 of 4** frames have an unbroken band of background above the
   crown. Measured: top row **>=95% background** and topmost ink at **>=5% of image
   height**. Not eyeballed — run `headroom.mjs`.
2. **Style.** All four still read as the same illustrator as `archer-f.png`: same dry ink
   line weight, same ochre and dusty-blue palette, no softening, no added saturation.
3. **28 px.** The best frame, cropped to 96x116 and viewed at 28 px wide, is still a
   readable face and a distinguishable silhouette next to `archer-f.png` cropped the same
   way.

**FAIL** on any of:

- Fewer than 3 of 4 clear the headroom measurement. **If 0 of 4 clear it, stop the whole
  slice** — the margin clause does not transfer off the monk, and the other four blocks
  are wrong in the same way.
- The style drifts. Then `waist-up` is fighting the reference and that affects all sixteen.
- The face is unreadable at 28 px. Then loose framing is the wrong trade and the answer is
  a tighter shot word (`chest-up`), not four more `waist-up` runs.

**Recorded, scored, but NOT pass/fail this run:** props, and age. Both are reported
separately so the framing result stays readable. If props get worse, that is information
for the decision below, not a reason to reject the frames.

**3 of 4 is the bar** because 3 of 4 is what the monk returned. It is the only hit rate
this project has ever measured for this clause, and I would rather inherit a real number
than invent a rounder one.

---

## THE PROPS QUESTION — SURFACED, NOT SETTLED

### First, a correction to the report

**`archer-f.png` already has a bow stave.** I re-opened it. A straight pale-brown
diagonal runs from the upper-left background, across her shoulder, to the bottom edge,
and there is arrow fletching at the left edge. It is not hair — the hair in that image is
wavy and clustered, this line is straight and constant-width.

So **"the previous archer had none" is wrong**, and that changes the diagnosis. Props are
not a new defect that `waist-up` introduced. They are **in the locked style reference**,
which means the reference is pushing them into every archer run — and possibly into other
jobs. What `waist-up` plausibly did is give them more room to be seen.

That also explains why `--no scenery` never stopped them: `--no` is judged word by word,
`scenery` does not cover a bow, and the reference is voting for them on every run.

### The options, and what each costs

| | Cost |
|---|---|
| **A. Add `bow, arrows` to the `--no` list** | A **second** exception to the byte-locked list — the male blocks' `man,` deletion is the only recorded one, and it is documented as deliberate precisely because it is the only one. A second starts a precedent and every future block will want its own. Word-by-word judging bites: `bow` also means *to bow*, and a bow-shaped tie — it may suppress the headband's knot or alter her posture. And `--no bow` on an archer has the same self-contradicting shape as `--no man` on a male knight, which is the exact bug that forced the male tail to exist. |
| **B. Let the 96x116 crop remove them** | Zero cost, zero runs — **but it does not fully work.** The crop centres on the face, and a stave crossing diagonally passes straight through it; the shipped archer's stave would survive its own crop. And the whole point of this slice is to keep **more** margin, which keeps more prop. |
| **C. Do nothing this run** *(my recommendation)* | Free. The new margin clause asks for an **unbroken** band above the crown, which forbids a stave crossing the one region props most often occupy. That may fix it as a side effect. If props persist, choose A or B **with a measurement in hand** rather than in advance. |

**My recommendation: C for this run, then A with exactly one word — `bow,` — if props
persist.** One word is a smaller precedent than three, and `arrows` is likely redundant
once the bow is gone.

**Not settling this. Not editing the `--no` list without the owner's word.** If the owner
picks A now, say so and I will hand back the archer block with `bow,` inserted and the
tail's new hash recorded, so the exception is documented the way `man,` is.

---

## THE OTHER FOUR BLOCKS — WRITTEN, NOT YET TO BE RUN

Same recipe applied. **Do not buy these until block 1 passes.**

### Block 2 — `knight-female`

**New framing recipe + Run A's age text, now VERBATIM.**

**The age text is no longer a reconstruction.** The owner confirmed the exact Run A
wording and it is recorded in `portrait-prompts.md`. Revision 1's version of this block
was wrong: it carried `narrow tired gaze`, a phrase on the record as masculinising, which
Run A did **not** use — Run A used `calm steady gaze`. That was caught by hand, not by me,
and it would have put a known gender risk into a run whose headline finding was that the
age words do **not** masculinise. It is fixed here.

Every age word below is lifted from the recorded Run A text: `a grown adult woman in her
mid thirties`, `a veteran female mercenary knight`, `a long adult face`, `cheekbones
defined under thin sun-worn skin`, `fine lines at the corners of her eyes and faint
shadows beneath them`, `calm steady gaze`. Nothing added, nothing escalated.

Run A put the age in the **opening clause** — the highest-weight position — and that is
very likely why it moved the read at all. The new framing recipe also wants the opening.
Both fit: age stays in the first clause, the margin clause follows it, exactly as the monk
put the margin clause after `of a woman`.

```
waist-up portrait of a grown adult woman in her mid thirties framed loosely with an
unbroken band of empty flat background above the top of her head about one fifth of the
height of the picture, and empty flat background on both sides of her shoulders, a
veteran female mercenary knight, bare-headed with no helmet, short dark hair, the crown
of her head and every strand of her hair well clear of the top edge of the picture, her
whole face visible and lit, a long adult face, cheekbones defined under thin sun-worn
skin, fine lines at the corners of her eyes and faint shadows beneath them, her face
weathered and lined with a scar across one cheek, a plain riveted gorget with fine gold
trim, deep woad-blue padded gambeson collar, calm steady gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight, thin
watercolour wash inside the line, lightly simplified features with restrained shading,
muted desaturated ochre and dusty blue palette, three-quarter turn to the left with eyes
toward the viewer, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark```

#### What changed, and why

| Edit | Was (Run A, verbatim) | Now | Why |
|---|---|---|---|
| Shot type | `extreme close-up head portrait` | `waist-up portrait` | The framing recipe. |
| Margin clause | absent — Run A tested age only | added, immediately after the age clause | The framing recipe, in the proven position. |
| Named feature | absent | `the crown of her head and every strand of her hair well clear of the top edge of the picture`, placed next to `short dark hair` | Her silhouette is a bare compact head with nothing above the crown; that cue does not exist if the crown is cut. |
| `her whole face visible and lit` | absent | added | Proven-recipe part. |
| `a grown adult woman in her mid thirties` | present, opening clause | **kept, opening clause** | Highest-weight position preserved. |
| `a veteran female mercenary knight` | present | **kept** | |
| `a long adult face` | present | **kept** | |
| `cheekbones defined under thin sun-worn skin` | present | **kept** | |
| `fine lines at the corners of her eyes and faint shadows beneath them` | present | **kept** | |
| `calm steady gaze` | present | **kept** | **Not** `narrow tired gaze`. Revision 1's error. |
| Clause order | — | costume regrouped so the hair and its named-feature clause are adjacent | Mirrors the monk's placement. This is a reordering, not a rewording — no age or costume word is added or removed. |
| Age escalation | — | **none** | Run A reached 16–22, not mid-thirties. Pushing further is a separate single-variable run and would re-open the gender risk Run A just closed. |

#### Pass / fail, written before the images exist

**PASS** — headroom measurement met (3 of 4), AND all four read female, AND at least
3 of 4 read no younger than the Run A frames.

**FAIL** — any frame reads male; or the median frame reads younger than Run A's; or
fewer than 3 of 4 clear the headroom measurement.

**Age is judged by A/B against the Run A frames**, which the owner holds, and against
`knight-f.png`, which anyone can open. It is not measurable and I am not pretending
otherwise. One question: older than both, older than one, or older than neither.

> **The archer changed the risk on this block.** A framing-only edit appeared to move
> the archer's apparent age *downward*. If that holds, framing and age are not
> independent, and a young result here will not say whether the age words failed or the
> reframe undid them.
>
> **Fallback, decided now:** if it comes back young, the next run reverts the **framing**
> and keeps the age text — the reverse of revision 1's fallback. Run A already proved the
> age text works under the old framing, so that isolates the interaction rather than
> re-testing something known.

---

### Block 3 — `priest-female`

**New framing recipe + the same Run A age text.**

She is the youngest in the set — `priest-f.png` reads 11–13 — and she is one of only
two images ever run with the style reference locked, so she is currently load-bearing.

The age cluster is the Run A text with the job noun swapped. Same two-variable exposure
as block 2, same fallback.

```
waist-up portrait of a grown adult woman in her mid thirties framed loosely with an
unbroken band of empty flat background above the top of her head about one fifth of the
height of the picture, and empty flat background on both sides of her shoulders, a
veteran female battle priest, bare-headed with a cream-white linen veil pinned back off
her face, warm auburn hair coiled and pinned at the nape, the crown of her head and the
whole of her veil well clear of the top edge of the picture, her whole face visible and
lit, a long adult face, cheekbones defined under thin sun-worn skin, fine lines at the
corners of her eyes and faint shadows beneath them, a slender neck, a simple brass
circlet, a high cream-white robe collar with a dull red-brown stole, calm steady gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight, thin
watercolour wash inside the line, lightly simplified features with restrained shading,
muted desaturated ochre and dusty blue palette, three-quarter turn to the left with eyes
toward the viewer, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark```

#### What changed, and why

| Edit | Was | Now | Why |
|---|---|---|---|
| Shot type | `extreme close-up head portrait of a woman` | `waist-up portrait of a grown adult woman in her mid thirties` | Framing recipe, with Run A's age phrase in the opening clause where Run A had it. |
| Margin clause | absent | added, second | Framing recipe, proven position. |
| Named feature | absent | `the crown of her head and the whole of her veil well clear of the top edge of the picture` | Her cue is a smooth unbroken dome. A veil cut at the top is a rectangle, not a dome. Note this names **two** things — the crown carries the constraint, the veil is the redundancy. |
| Subject clause | `a female battle priest in her thirties` | `a veteran female battle priest` | `veteran` from Run A; the age moved to the opening clause. |
| `soft rounded cheekbones` | present | **removed** | The single strongest young-reading phrase in the shipped set, and this portrait is the proof of it. |
| Age cluster added | — | `a long adult face, cheekbones defined under thin sun-worn skin, fine lines at the corners of her eyes and faint shadows beneath them` | Run A verbatim. Proven not to masculinise. |
| `a slender neck`, `calm steady gaze` | present | **kept** | Both hold the female read. Removing `soft rounded cheekbones` takes one anchor out; these two carry it — the same arrangement Run A survived. |
| `so her whole face is visible and lit` | present, attached to the veil | moved to its own clause after the named feature | Matches the monk's structure. Same words, different position. |
| Veil, circlet, auburn hair, stole | — | unchanged | Costume is not in question. |

#### Pass / fail, written before the images exist

**PASS** — headroom measurement met (3 of 4), AND all four read female, AND at least
3 of 4 read visibly older than `priest-f.png`.

**FAIL** — any frame reads male; or 2 or more frames still read as a child; or fewer than
3 of 4 clear the headroom measurement.

Unlike block 2, **this age A/B has a control anyone can open.** `priest-f.png` is in the
repo, so a later session can repeat the judgement.

> **Do not overwrite `priest-f.png` on arrival.** It is one of only two images run with
> the reference locked. If the replacement is worse in *style* the set loses an anchor,
> and the old file is the only way to notice.

---

### Block 4 — `wizard-female`

**New framing recipe + the hood UP.**

**Owner decision: the hood stays up.** The shipped block asks for it `lowered around
her shoulders`, the model ignored that, and the raised hood is what came back, what was
approved, and what makes her the most identifiable portrait in the set. The block now asks
for what shipped, and drops the shipped block's internal contradiction — it said
`bare-headed` and then described a hood.

The rule is not "no headgear", it is **never let headgear shadow the face**. The approved
frame satisfies it by luck; this asks for it.

Her hood peak is the tallest object in the set, so this block is the framing clause's
hardest case.

```
waist-up portrait of a woman framed loosely with an unbroken band of empty flat
background above the top of her head about one fifth of the height of the picture, and
empty flat background on both sides of her shoulders, a female battle wizard in her
thirties, her deep indigo hood raised up over her head, the peak of her raised hood well
clear of the top edge of the picture, her whole face visible and lit with no shadow
falling across her eyes, long silver-grey hair falling loose past her jaw in front of
her shoulders, soft rounded cheekbones, a slender neck, full lips, a high plain linen
collar, a single thin scar on one cheek, calm steady gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight, thin
watercolour wash inside the line, lightly simplified features with restrained shading,
muted desaturated ochre and dusty blue palette, three-quarter turn to the left with eyes
toward the viewer, flat pale sand-tan background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, man, beard, stubble, photorealism, photograph, border, frame, text, watermark```

#### What changed, and why

| Edit | Was | Now | Why |
|---|---|---|---|
| Shot type | `extreme close-up head portrait of a woman` | `waist-up portrait of a woman` | Framing recipe. `wizard-f.png` measured **0%** background on its top row, tied for the tightest crop in the set; the hood is cut on three edges. |
| Margin clause | absent | added, second | Framing recipe, proven position. |
| Named feature | absent | `the peak of her raised hood well clear of the top edge of the picture` | The peak is now the silhouette cue and it is what gets clipped. It sits above the crown, so unlike the archer's headband it genuinely constrains. |
| Hood | `bare-headed with her deep indigo hood lowered around her shoulders` | `her deep indigo hood raised up over her head` | Owner decision, and removes the `bare-headed` contradiction. |
| Face clause | implicit | `her whole face visible and lit with no shadow falling across her eyes` | The rule the probe earned. `no shadow falling across her eyes` is deliberate: the eyes carry the female read and the age read at once. |
| Hair | `long silver-grey hair falling loose past her jaw` | `... in front of her shoulders` | With the hood up, the hair is the only thing separating her from a generic hooded figure, and it must be in front of the hood to be visible. |
| `in her thirties`, `soft rounded cheekbones` | present | **kept** | Deliberately, even though blocks 2 and 3 remove `soft rounded cheekbones`. Adding age here makes it a three-variable run. **Consequence: she stays the youngest-reading portrait in the set and will need her own age run.** Named so it is not a surprise later. |
| `deep indigo` | present | **kept** | See the blue decision below. |

#### Pass / fail, written before the images exist

**PASS** — headroom measurement met (3 of 4), AND the hood is up in at least 3 of 4,
AND the whole face is lit with no shadow across the eyes in at least 3 of 4, AND the hood
peak is inside the picture in at least 3 of 4.

**FAIL** — the hood shadows the eyes in 2 or more frames; or the peak is cut in 2 or
more; or the hood swallows the hair so the silhouette is a plain cone.

**Report separately, do not score:** whether the raised hood collides with `wizard-male`'s
planned silhouette. His is a *tall pointed felt cap* — "a long diagonal spur behind one
shoulder". A raised hood is also a peak. They are meant to differ by symmetry, that has
never been seen side by side, and `wizard-male` has never been run. **This is a silhouette
risk the hood decision creates and this run does not settle it.**

#### OPEN — the hood's blue against the party colour `#4f8cff`. Unchanged from revision 1.

Measured on `wizard-f.png` (200 px downscale, hue 185–265 deg at >=18% saturation):

| Portrait | Share reading blue | Mean sat | Peak sat |
|---|---|---|---|
| `wizard-f.png` | **8.0%** | 22% | **31%** |
| every other committed portrait | 0% | — | — |
| `#4f8cff` (party colour) | — | — | **69% at full value** |

The hood **is** by far the largest blue area in the set. But at 31% peak saturation it is
a **slate**, not the party blue — the team swatch is more than twice as saturated and much
brighter. **The collision is smaller than I claimed when I raised it.**

**Recommend deferring.** It would be a third variable; the blue is what makes her read as
a wizard against an ochre set, so recolouring risks collapsing her into the priest and the
geomancer; and the real question is whether the hood competes with the swatch **when they
are adjacent** in the stat panel, which needs the portraits wired into the viewer.

| | Cost |
|---|---|
| Change now | Third variable. A sixteen-portrait palette decision taken for one portrait. Probably needs an ADR — that palette is not written down anywhere. |
| Defer | At most one wizard re-run. More likely **zero** paid runs: moving or restyling the swatch is code (`TEAM_COLOR[0]`, `src/render/game.ts:119`), which is `viewer-engineer`'s territory and free. |

Route to the PO once a stat panel with a real portrait beside a real `#4f8cff` swatch can
be captured.

---

### Block 5 — `knight-male`

**New framing recipe. Framing only.**

Already the loosest crop in the shipped set — 45% of its top row is background — and
**still** cut across the crown, which is the clearest single proof that "some background
at the top" is not the same property as "a band above the crown".

He is the only male portrait that exists in this style, so he is the reference for seven
unrun male portraits.

**Different tail.** This block carries the authored male tail: it **has**
`aloof distant expression` and its `--no` **omits** `man`. Both correct, both deliberate.
Do not paste a female tail onto it.

```
waist-up portrait of a man framed loosely with an unbroken band of empty flat background
above the top of his head about one fifth of the height of the picture, and empty flat
background on both sides of his shoulders, a male mercenary knight in his twenties,
bare-headed with no helmet, dark hair cropped close to the skull, the crown of his head
and every strand of his hair well clear of the top edge of the picture, his whole face
visible and lit, a squared riveted steel gorget over a high mail standing collar and a
dull woad-blue padded gambeson with both gorget shoulders inside the picture, a
weathered face with a thin scar along one cheekbone and a level gaze,
Final Fantasy Tactics portrait art in the style of Akihiko Yoshida, anime character
illustration for a Japanese tactics RPG, delicate dry ink line of varying weight,
thin watercolour wash inside the line, lightly simplified features with restrained
shading, muted desaturated ochre and dusty blue palette, aloof distant expression,
three-quarter turn to the left with eyes toward the viewer, flat pale sand-tan
background colour #e9d7a8
--ar 5:6 --raw --no scenery, lens flare, glow, glamour, lipstick, chibi, beard, stubble, photorealism, photograph, border, frame, text, watermark```

#### What changed, and why

| Edit | Was | Now | Why |
|---|---|---|---|
| Shot type | `head and collar portrait of a man` | `waist-up portrait of a man` | Framing recipe. |
| Margin clause | absent | added, second, with male pronouns | Framing recipe, proven position. **The pronoun swap is the one untested part of this block** — the monk probe was female-subject only. |
| Named feature | absent | `the crown of his head and every strand of his hair well clear of the top edge of the picture` | Same crown-relative phrasing as every other block. |
| Shoulders | — | `with both gorget shoulders inside the picture`, attached to the gorget clause | His silhouette cue is "a small head on a wide, hard-cornered shoulder block". Both shoulders must be in the picture or the cue does not exist. This is the only **horizontal** constraint in the set, so it stays with the costume rather than in the margin clause. |
| `his whole face visible and lit` | absent | added | Proven-recipe part. |
| `in his twenties` | present | **kept** | Framing only. The age problem is on the female side. |
| Male tail | — | **kept byte-for-byte**, including `aloof distant expression`, which is masculinising and therefore harmless here | |

#### Pass / fail, written before the images exist

**PASS** — headroom measurement met (3 of 4), AND both gorget shoulders inside the
picture in at least 3 of 4, AND all four read male.

**FAIL** — any frame reads female. Gender here is carried by the subject clause alone,
since this tail has no `--no man` to lean on — exactly as in the run that produced
`knight-m.png`, so a female result would be new and would need a `--no woman` run of its
own. Or: `waist-up` pulls in a full suit of plate and loses the gorget and mail-collar
read.

> **Weakest point, named:** `waist-up` on an armoured subject invites more armour. The
> block describes collar-level costume and says nothing about what is below, so the model
> will invent that region. If it invents a breastplate the portrait is still usable — we
> crop to 96x116 — but the **silhouette cue changes shape**, and seven unrun male
> portraits inherit whatever this frame does. Judge the crop, not the full image.


---

## WHAT I DELIBERATELY DID NOT CHANGE

1. **The style tails.** Both variants, byte-for-byte, extracted by script and never
   retyped. Including the `aloof distant expression` asymmetry and the `man,` asymmetry
   between the recovered female tail and the authored male tail. Reconciling them is a
   separate decision; doing it here would confound five runs.
2. **The `--no` lists.** Unchanged in both variants. The props decision above is surfaced
   for the owner, not taken.
3. **`--ar 5:6` and `--raw`.** Unchanged.
4. **No new flag.** No `--stylize`, `--chaos`, `--sw`, `--sv`, `--p` or `--sref` code.
   `--stylize` toward 50 is the documented next lever when the model ignores explicit
   instructions — and the skill is explicit that a stylize change must then be **locked
   for all sixteen runs**. Applying it to 5 of 16 would split the set on a second axis
   while we are repairing the first. If the archer fails again, stylize is the correct
   escalation *and it means re-running the other eleven too*. That is the honest price.
5. **The style reference.** The existing archer image stays in the slot, locked, for
   every run including the archer's own.
6. **The archer's age.** Framing-only run. See block 1.
7. **`wizard-female`'s age.** She stays young-reading. Scoped out; flagged in her block.
8. **`knight-male`'s age.**
9. **Costume, hair, headgear and every silhouette cue** in all five. Clause **order**
   changed in blocks 2 and 3 to put each named-feature clause next to the feature it
   describes, matching the proven monk text — no costume word added or removed.
10. **`three-quarter turn to the left with eyes toward the viewer`** — it is in the tail.
    Recorded, un-fixed: **3 of the 5 committed portraits do not comply.** `priest-f` and
    `knight-f` look away or down and `knight-m`'s gaze is off-axis. The model is ignoring
    the instruction. Not touched, because it would be a third variable — but it is a real
    defect and a candidate for a later single-variable probe.

---

## WHAT THIS FILE STILL DOES NOT ESTABLISH

- **That the margin clause transfers off the monk.** One passing run on one subject. That
  is what block 1 is for, and revision 1's failure is the reason to believe it might not.
- **Which of my two revision-1 errors caused the failure** — the clause's demoted position
  or its brow-level named feature. Both are fixed together and this run cannot separate
  them. If it passes, we will not know which mattered, and that is an acceptable price.
- **Any of the archer failure report's numbers.** "3 of 4", "14–18", "3 of 4 with props"
  are eyeballed on uncommitted images. `headroom.mjs` has never been run on them. The
  pass line above requires the tool precisely so the next result is not another
  impression.
- **That a loosely framed portrait is legible at 28 px.** Never measured, for any portrait
  in this project, including the five that shipped.
- **Anything about age.** Not measurable here. Every block that touches it names its
  control and says who judges it.
