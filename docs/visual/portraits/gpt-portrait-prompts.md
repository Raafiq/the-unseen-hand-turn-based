# GPT Image 2 portrait prompts - v4, the 10 job portraits

v4 of the lineage recorded in `reference/gpt-probe-prompts.md` (v1, v2) and in this file's history (v3).
Authored 2026-09-05 by `art-director` under two owner decisions of the same evening:
"I have new image for references instead, style-ref-1.png ... style-ref-4.png. I'm also thinking that we may have too many jobs now. Will reduce in future. So for now we keep to the basic jobs - knight, archer, thief, wizard, priest" and, earlier, "i'm not keen that they are all posed the same way with roughly the same expressions and features. We should vary it a bit."
Every character below is in their twenties (ADR-0034).

## What v4 changes against v3

| Change | What it means in every block |
| --- | --- |
| New style lock: the four owner refs `reference/style-ref-1.png` to `style-ref-4.png` | The opener names all four as style references. The Midjourney archer is no longer attached to anything. |
| Scope: 5 jobs x 2 genders = 10 portraits (knight, archer, thief, wizard, priest) | monk, geomancer and summoner are parked unchanged under "Deferred jobs" at the bottom. |
| Waist-up framing, like the refs | Head about two fifths of frame height, hands and props in frame at chest height or higher. The game crops to head-and-chest (see "Framing"). |
| Varied pose, gaze, expression, hands, face and skin | No two portraits share the (turn, gaze, expression) triple; male and female of a job are not mirrors; 3 of 10 face right. The plan is the table under "Variation plan". |
| Dense hatching everywhere except skin | Replaces v3's "hatching only in shadows and hair", which the refs do not do (measured: foreground line energy 36-47 in the refs against 27 in the old lock and in the v3 output). |
| Mottled parchment at the page hex | The refs' paper is faintly mottled but sits 29-36 units darker and more orange than the campaign surface; v4 keeps the mottle and forces the mean tone to `#e9d7a8`. Reversed 2026-09-06: GPT ignored the hex in every run and the owner keeps the paper as delivered; the blocks now ask for paper matching the reference images (see "How to run"). |
| Headgear height capped | A hat like the one in `style-ref-1` halves the face at every game size, so nothing may rise more than half a head above the crown. |

## How to run

- ChatGPT app, model GPT Image 2, "high thinking". Do not use the API.
- Attach the four style refs on every run, in this order and with this role each: Image 1 = `reference/style-ref-1.png`, Image 2 = `style-ref-2.png`, Image 3 = `style-ref-3.png`, Image 4 = `style-ref-4.png`, each as a **style reference**. That is the multi-reference template from `.claude/skills/gpt-image-2-prompting/SKILL.md`; the four-image count is the safe working limit its `references/model-guide.md` records.
- If the app caps attachments below four, drop Image 1 first (the hat makes it the framing outlier), then Image 2. Delete the matching "Use Image N" line from the opener and change "midway between Images 1 and 2" in a skin line to "midway between Image 3 and Image 4". Never run with fewer than Images 3 and 4. Say which were attached when you hand the files back.
- One prompt per run, pasted verbatim from the fenced block. Do not merge two prompts into one run.
- Save each output at the size the app delivers straight over `docs/visual/portraits/reference/<job>-<gender>.png`, using the heading of the block you ran (for example `knight-f.png`). That overwrites the v3 file of the same name; the v3 prompts are in this file's git history.
- If any setting differs from the above (model, thinking level, attachments, a size choice), say so when you hand the files back; the record depends on it.
- Paper: GPT reproduces the refs' paper in every run and ignores a hex. Owner decision 2026-09-06: keep the paper as delivered; no post-process shift. The ten blocks below therefore ask for "paper matching the reference images" instead of a hex; the delivered v4 and v4.1 files were run with the older text that named the page hex `#e9d7a8` (see the run records).

## The v4 style block

Measured from the four refs on 2026-09-05 (`unseen-hand-probe/metrics-v4.txt`, scratch) and written into every block below.
The sentences are the same in all ten; only the skin line and the palette line vary.

- **Medium.** Dark umber ink over sepia watercolour on parchment, "the same hand, pen and paints as Images 1 to 4".
- **Line and hatching.** Fine, dense, scratchy. Cloth, leather and armour are covered edge to edge in fine cross-hatching following the weave or the plate; hair is drawn strand by strand in long parallel strokes; skin is the one quiet surface, a smooth wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper (40-74 percent of the refs' figure pixels are ink-dark, against 26-30 in the old lock and the v3 output).
- **Colour.** A near-monochrome sepia grade: umber, ochre, warm tan, dull steel grey, with bare paper left for highlights on polished metal. One hue only, a greyed indigo blue, on cloth. Blue is the one state channel the battlefield leaves free, so it stays greyed and on cloth, never on skin, sky or light.
- **Skin.** Varies by character, inside the refs' range: pale like the woman in Image 3 (`#d2aa7a`, saturation 107), mid tan like Images 1 and 2 (`#d3a163` to `#d6a76d`), or deep tan like the man in Image 4 (`#966935`). Always a smooth wash with a faint flush on the cheek, never hatched like cloth.
- **Light.** Flat and frontal, no cast shadow, no rim light, no gradient.
- **Paper.** Faintly mottled warm parchment matching the refs' paper (delivered at `#e2c18a` to `#e9c88b`), the mottle a few units either side of its mean, no vignette, no visible fibres. Until 2026-09-06 this line asked for the page hex `#e9d7a8`; GPT ignored it in 12 of 12 runs and the owner kept the paper as delivered.
- **Framing.** Waist-up. Head about two fifths of frame height, clear paper above the crown, hands and any prop at chest height or higher, headgear rising no more than half a head above the crown.

## Framing

The shipped frames are **96x128** in the scene player and **72x96** on the unit card, both `--portrait-ratio: 3 / 4` in `index.html`.
The 28-pixel turn-order crop the v2 and v3 prompts named does not exist: `chip()` in `src/render/panels.ts` emits a 9x9 colour dot and a label (`index.html`), and no image sits there.
The Use case lines below name the two real frames.

Three crops of `style-ref-3` and `style-ref-4` were rendered at both frames on 2026-09-05 (`unseen-hand-probe/crop-sheet-v4.png`, scratch):

| Crop | Head as share of frame | What it keeps | What it loses |
| --- | --- | --- | --- |
| A head-and-collar | 67% | the face, large | every shoulder cue: no pauldron, no hood, no strap, so the job is gone at 72 px |
| **B head-to-chest (chosen)** | 46% | the face legible at 96 and at 72, plus the shoulder gear that carries the job | hands below chest height |
| C whole waist-up | 38-42% | everything drawn | the face is a few pixels smaller than B for no gain; with a tall hat it drops to 18% |

Decision: generate waist-up as the refs are, ship crop B.
So the prompts put hands and props at chest height or higher (they survive B) and cap headgear at half a head above the crown (a hat like Image 1's forces the head to 34% of even the tight crop).

## Background

The refs' paper measures `#e6c691` to `#e4c38b`, faintly mottled (local std about 3.5, no vignette), and 29-36 units darker and more orange than the campaign surface `#e9d7a8`.
Composited into a mock of the scene-player frame (`unseen-hand-probe/background-sheet-v4.png`, scratch), the paper as delivered reads as a darker card mounted on the page; the flat v3 hex dissolves into the page; the refs' mottle shifted to the page hex reads as drawn on the page.

Decision: keep the mottled parchment, force its mean tone to `#e9d7a8`.
Superseded 2026-09-06: GPT ignored the hex in all twelve v4 and v4.1 runs (paper landed at `#e2c18a` to `#e9c88b` every time) and the owner decided to keep the paper as delivered, with no post-process shift. The Scene and Constraints lines below now ask for paper matching the reference images.
GPT obeyed a hex to within 5-11 units in v2 and v3, so the Scene line asks for exactly that.
Risk to check on the first run: the model may pale the whole figure along with the paper; compare the figure's ink share against the refs' 40-74 percent.

## The five silhouette hooks

One hook per job; male and female express the same hook, since the two are never on screen for the same unit.
With crop B the shoulders are in frame, so the hooks use them.

| Job | Hook at 72 px | Female | Male |
| --- | --- | --- | --- |
| knight | hard-edged steel: gorget plus rounded pauldrons | bare bob on a riveted gorget, plate shoulders | cropped skull on a squared gorget and mail collar, plate shoulders, one leather baldric |
| archer | one diagonal strap plus one thin trailing line | brow band, one rope braid over the shoulder, quiver strap | high ponytail, feather behind the ear, quiver strap over a leather shoulder guard |
| thief | knotted umber cloth | bulky neckerchief roll under the jaw, harness strap | bandana over the crown with two knotted tails, harness strap |
| wizard | a soft felt peak above the head over a cloth mass | raised hood, its peak above the crown, loose hair in front, short cape | pointed cap slumped back, its point a spur behind one shoulder, deep robe collar |
| priest | clean geometric cloth headpiece | smooth veil dome, crown to nape, a stole | flat-topped square cap, the only straight edge above a head, a stole |

## Variation plan

Turn: L = three-quarter to the viewer's left, R = to the viewer's right, F = near-frontal.
Three of ten face right (archer-f, thief-m, priest-f). No two rows share the (turn, gaze, expression) triple. Male and female of a job differ in turn or in gaze and expression both.

| Portrait | Turn | Gaze | Expression | Hands | Face shape | Skin | One distinguishing feature |
| --- | --- | --- | --- | --- | --- | --- | --- |
| knight-f | L | to the viewer | calm, level, mouth closed | none, arms at her sides | oval, strong jaw | pale (Image 3) | thin pale scar across one cheek |
| knight-m | F | to the viewer | hard scowl, brows down | one gauntleted hand gripping his baldric at the chest | broad, square, heavy brow | mid (Images 1-2) | a nose broken and set crooked |
| archer-f | R | off to the far left, past the viewer | narrow, watchful | one hand holding an arrowhead up at eye level, point up, a slight shine on it | long, narrow | mid, freckled | freckles across nose and cheeks |
| archer-m | L | to the viewer | easy half-smile | both hands holding a crossbow of proper length across the chest, a quiver of arrows on his back | lean, angular | deep tan (Image 4) | sandy fair hair, the only fair-haired man |
| thief-f | F, head tilted | sidelong to the viewer | sly grin, teeth showing | one hand holding a coin between two fingers beside her chin | heart-shaped, pointed chin | pale (Image 3) | a small dark mole under one eye |
| thief-m | R | down at his own hands | absorbed, lips pressed | both hands working a lockpick in a small padlock held at chest height | round, soft | mid-deep | a notch torn out of one earlobe |
| wizard-f | L, head lowered | up at the viewer from under the hood | brooding, faint frown | gloved fingertips resting against her lips | narrow, high cheekbones | pale (Image 3) | long silver-grey hair on a woman in her twenties |
| wizard-m | F | eyes closed | serene, concentrating | one hand holding a small closed book flat against his chest | long, lean, heavy-lidded | mid (Images 1-2) | a hooked nose |
| priest-f | R | downcast | gentle closed-mouth smile | both hands folded at the chest around a small wooden pendant on a cord | round, soft, full cheeks | mid (Images 1-2) | a small mole beside her mouth |
| priest-m | F, chin slightly raised | to the viewer | weary, dark under the eyes, lips parted mid-sentence | one hand raised beside his shoulder, two fingers up in a blessing | gaunt, hollow-cheeked | pale (Image 3) | dark rings under the eyes |

Costume briefs are carried from v3 (and from the Midjourney briefs behind them) with three changes, each named in its block: both knights gain plate pauldrons because the chest is now in frame and the refs show plate; knight-m gains a leather baldric for his hand to hold; archer-m's hair goes from dark to sandy fair so the three dark-cropped men (knight, thief, archer) stop reading as one man at 72 px.

---

## knight

### knight-f

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them; the woman in Image 3 is not this character.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A woman in her late twenties, a mercenary knight, waist-up. Head turned three-quarters to the viewer's left, eyes on the viewer, expression calm and level, mouth closed. Arms at her sides, no hands in frame. Bare-headed, no helmet, no coif: short dark hair cut blunt to the jaw, the whole face uncovered. An oval face with a strong jaw and a thin pale scar across one cheek. A grown adult face.

Important details: A plain riveted steel gorget with a fine gold edge line, rounded steel pauldrons and a plain breastplate over a padded gambeson quilted in wide vertical channels: straight stitched ridges side by side, not a padded roll and not a ring of round puffs. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The gambeson, the leather and every plate are covered edge to edge in fine cross-hatching that follows the weave or the metal; hair is drawn strand by strand in long parallel strokes; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: pale like the woman in Image 3, a smooth wash with a faint flush on the cheek. Colour: a near-monochrome sepia grade of umber, ochre, warm tan and dull steel grey, bare paper left for the highlights on the plate, and one hue only, a greyed indigo blue, on the gambeson. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, clear paper above the crown, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a bare compact head, widest at the jaw, on a hard-edged steel collar and rounded steel shoulders.

Constraints: Hatching on cloth, leather, armour and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No clean uniform outline, no airbrushed skin, no orange or bronze skin, no gradient, no rim light, no makeup, no jewellery beyond the gold edge line, no helmet, no man, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

### knight-m

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them; the man in Image 4 is not this character.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A man in his mid twenties, a mercenary knight, waist-up. Head near-frontal, square to the viewer, eyes on the viewer, a hard scowl with the brows drawn down, mouth closed. One gauntleted hand gripping the leather baldric that crosses his chest, at chest height. Bare-headed, no helmet, no coif: dark hair cropped close to the skull, clean-shaven, the whole face uncovered. A broad square face with a heavy brow and a nose once broken and set crooked. A grown adult face.

Important details: A squared riveted steel gorget with hard corners over a high mail standing collar of fine riveted rings, squared steel pauldrons, and a padded gambeson quilted in wide vertical channels: straight stitched ridges side by side, not a padded roll and not a ring of round puffs. A worn leather baldric with a dull steel buckle crossing the chest from one shoulder. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The gambeson, the mail, the leather and every plate are covered edge to edge in fine cross-hatching that follows the weave, the rings or the metal; hair is drawn strand by strand in short parallel strokes; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: a warm mid tan midway between Images 1 and 2, a smooth wash with a faint flush on the cheek. Colour: a near-monochrome sepia grade of umber, ochre, warm tan and dull steel grey, bare paper left for the highlights on the plate, and one hue only, a greyed indigo blue, on the gambeson. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, clear paper above the crown, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a small cropped head on a wide hard-cornered steel and mail collar, square steel shoulders, one diagonal strap.

Constraints: The subject is male. Hatching on cloth, leather, armour and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No clean uniform outline, no airbrushed skin, no orange or bronze skin, no gradient, no rim light, no makeup, no jewellery, no helmet, no facial scar, no beard, no stubble, no moustache, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

---

## archer

### archer-f

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A woman in her early twenties, an archer, waist-up. Head turned three-quarters to the viewer's right, so her nose points toward the right edge of the frame and her left cheek is the one nearest the viewer, her eyes looking off to the far left, past the viewer, at something distant; a narrow, watchful expression, mouth closed. One hand raised to eye level on the viewer's right side of the frame, beside the side of her face nearest the right edge, holding a single steel arrowhead by its short shaft stub, the sharp point facing straight up, a slight shine on the polished head; nothing is held on the viewer's left. A worn leather headband across the brow, dark hair braided back into one long rope braid falling forward over one shoulder, freckles across the nose and cheeks. A long narrow face. A grown woman's face, not a girl's.

Important details: A russet-brown scarf bunched at the throat over a dusty blue linen jacket, a quiver strap crossing one shoulder, a leather bracer on the raised forearm. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The jacket, the scarf, the strap and the bracer are covered edge to edge in fine cross-hatching that follows the weave or the leather, the jacket cross-hatched as densely as the armour in Image 3 and never left as a flat wash; hair is drawn strand by strand in long parallel strokes following the braid; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: a warm mid tan midway between Images 1 and 2, a smooth wash with a faint flush on the cheek and the freckles dotted in the same umber ink. Colour: a near-monochrome sepia grade of umber, ochre, warm tan, russet and worn leather brown, and one hue only, a greyed indigo blue, on the jacket. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, clear paper above the crown, the arrowhead and its point within the frame, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a brow band, one rope braid dropping past the shoulder on one side, one diagonal strap, and one small bright point, the arrowhead held point-up, beside the head.

Constraints: Hatching on cloth, leather and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No bow in frame, no full arrow shaft, no clean uniform outline, no airbrushed skin, no orange or bronze skin, no gradient, no rim light, no makeup, no jewellery, no man, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

### archer-m

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A man in his late twenties, an archer, waist-up. Head turned three-quarters to the viewer's left, eyes on the viewer, an easy half-smile, relaxed. Both hands holding a crossbow across his chest at a slight angle, the hands at chest height, the crossbow drawn at its proper length: the wooden tiller as long as his forearm and hand together, the steel prod across its head about as wide as his shoulders, strung. A quiver of fletched arrows hangs on his back, its mouth and the fletchings showing above one shoulder. Sandy fair hair gathered into a short high ponytail at the back of his head with a single grey fletched feather tucked behind one ear, brow bare, clean-shaven. A lean angular face. A grown adult face.

Important details: A hardened leather shoulder guard and a quiver strap crossing his chest over a dusty blue linen jacket. The crossbow is a plain wooden tiller with a steel prod and a string, drawn to its proper length, not a toy and not a longbow; the quiver on his back is worn leather with the arrows' fletchings visible above the shoulder. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The jacket, the strap and the leather guard are covered edge to edge in fine cross-hatching that follows the weave or the leather; hair is drawn strand by strand in long parallel strokes following the ponytail; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: a deep warm tan like the man in Image 4, a smooth wash. Colour: a near-monochrome sepia grade of umber, ochre, warm tan, worn leather brown and feather grey, and one hue only, a greyed indigo blue, on the jacket. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, the ponytail and the feather clear of the top edge and visible against the paper, the crossbow whole within the frame across the chest, the quiver's mouth and fletchings visible above the shoulder, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a thin feather quill at ear height, a short tail swept back and up, one diagonal strap, the fletchings of a quiver behind one shoulder, and the crossbow's steel prod as one straight bar across the chest.

Constraints: The subject is male. Hatching on cloth, leather and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No longbow, no clean uniform outline, no airbrushed skin, no orange skin, no gradient, no rim light, no makeup, no jewellery, no beard, no stubble, no moustache, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

---

## thief

### thief-f

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A woman in her early twenties, a thief, waist-up. Head near-frontal but tilted to one side, eyes sidelong on the viewer, a sly grin with the teeth showing. One hand raised beside her chin holding a single coin between two fingers. Bare-headed, dark hair cut in a ragged short crop with one long forelock swept clear of her eyes, the whole face visible. A heart-shaped face with a pointed chin and a small dark mole under one eye. A grown woman's face, not a girl's.

Important details: A bulky umber neckerchief bunched down around her throat in a thick soft roll, a worn leather harness strap crossing one shoulder with dull steel buckles over a plain dun shirt, a leather bracer on the raised wrist. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The neckerchief, the shirt, the strap and the bracer are covered edge to edge in fine cross-hatching that follows the weave or the leather; hair is drawn strand by strand in short parallel strokes; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: pale like the woman in Image 3, a smooth wash with a faint flush on the cheek. Colour: a near-monochrome sepia grade of umber, ochre, warm tan, dun and worn leather brown, a little greyed indigo blue in the shadows only. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, clear paper above the crown, the coin and hand within the frame beside the chin, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a narrow ragged-cropped head, tilted, on a thick soft cloth roll at the throat, with one diagonal strap.

Constraints: Hatching on cloth, leather and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No dagger, no hood, no clean uniform outline, no airbrushed skin, no orange or bronze skin, no gradient, no rim light, no makeup, no jewellery beyond the steel buckles, no man, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

### thief-m

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A man in his mid twenties, a thief, waist-up. Head turned three-quarters to the viewer's right and bowed a little, eyes down on his own hands, absorbed, lips pressed together. Both hands held up at chest height working a thin lockpick into a small iron padlock. A faded umber bandana tied smooth over the crown of his head with two short knotted tails trailing at the back, tied high above his bare brow so the whole face is visible. Clean-shaven. A round soft face with a notch torn out of one earlobe. A grown adult face.

Important details: A worn leather harness strap crossing one shoulder with dull steel buckles over a plain dun shirt with the sleeves pushed up. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The bandana, the shirt and the strap are covered edge to edge in fine cross-hatching that follows the weave or the leather; the padlock is hatched like the armour in Image 4; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: a warm tan between Image 2 and the man in Image 4, a smooth wash. Colour: a near-monochrome sepia grade of umber, ochre, warm tan, dun, worn leather brown and dull iron grey, a little greyed indigo blue in the shadows only. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, clear paper above the crown, the knotted tails visible behind the head against the paper, the padlock and both hands within the frame at chest height, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a smooth cloth-capped dome, bowed, with two short knotted flicks behind the skull and one diagonal strap.

Constraints: The subject is male. Hatching on cloth, leather, iron and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No dagger, no hood, no clean uniform outline, no airbrushed skin, no orange skin, no gradient, no rim light, no makeup, no jewellery beyond the steel buckles, no beard, no stubble, no moustache, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

---

## wizard

### wizard-f

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them; the hooded woman in Image 2 is not this character, and there is no wide-brimmed hat.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A woman in her late twenties, a battle wizard, waist-up. Head turned three-quarters to the viewer's left and lowered, eyes lifted to the viewer from under the hood, a brooding look with a faint frown. The gloved fingertips of one hand resting against her lips, thinking. Her deep indigo hood raised over her head, its soft peak rising above the crown by no more than half the height of her head, the hood pushed back far enough that the whole face is lit with no shadow across the eyes. Long silver-grey hair falling loose past her jaw in front of her shoulders. A narrow face with high cheekbones and a single thin scar on one cheek. A grown adult face.

Important details: A short indigo cape over the shoulders under the hood, a high plain linen collar, a thin leather glove on the raised hand. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The hood, the cape, the collar and the glove are covered edge to edge in fine cross-hatching that follows the weave; hair is drawn strand by strand in long parallel strokes following its fall; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: pale like the woman in Image 3, a smooth wash with a faint flush on the cheek. Colour: a near-monochrome sepia grade of umber, ochre, warm tan, silver-grey and off-white linen, and one hue only, a greyed indigo blue, on the hood and cape, never bright, never navy. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, the hood's peak clear of the top edge, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a soft felt peak rising a little above a lowered head, over a wide wispy mass of pale loose hair and a caped shoulder line.

Constraints: Hatching on cloth, leather and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No hat, no brim, no staff, no glowing effect, no clean uniform outline, no airbrushed skin, no orange or bronze skin, no gradient, no rim light, no makeup, no jewellery, no man, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

### wizard-m

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them; the tall wide-brimmed hat in Image 1 is not this character's hat.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A man in his mid twenties, a battle wizard, waist-up. Head near-frontal, eyes closed, a serene concentrating expression, mouth closed. One hand holding a small closed leather-bound book flat against his chest. A soft pointed cap of dusty blue felt with no brim, slumped backwards well off his brow so its point falls down behind one shoulder and nothing rises more than a hand's width above the crown; the whole face lit. Short dark hair, clean-shaven. A long lean face with heavy lids and a hooked nose. A grown adult face.

Important details: A heavy ochre robe with a deep folded collar and a small dull brass clasp. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The robe, the cap and the book's leather are covered edge to edge in fine cross-hatching that follows the weave or the grain; hair is drawn strand by strand in short parallel strokes; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: a warm mid tan midway between Images 1 and 2, a smooth wash. Colour: a near-monochrome sepia grade of umber, ochre, warm tan and dull brass, and one hue only, a greyed indigo blue, on the cap, never navy. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, the cap's crown clear of the top edge and its point trailing down behind the shoulder, the book within the frame at chest height, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a soft felt cone slumped back off the head, its point a long diagonal spur behind one shoulder, over a deep folded collar.

Constraints: The subject is male. Hatching on cloth, leather and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No brim, no staff, no glowing effect, no open eyes, no clean uniform outline, no airbrushed skin, no orange or bronze skin, no gradient, no rim light, no makeup, no jewellery beyond the brass clasp, no beard, no stubble, no moustache, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

---

## priest

### priest-f

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A woman in her late twenties, a battle priest, waist-up. Head turned three-quarters to the viewer's right, eyes downcast, a gentle closed-mouth smile. Both hands folded together at the chest around a small plain wooden pendant on a cord. A cream-white linen veil pinned back off her face so the whole face is visible, its underside lined in dusty woad blue, falling in a smooth dome from the crown to the nape. Warm auburn hair coiled and pinned at the nape. A thin brass circlet, a narrow wire-fine band across the brow, no wider than a pencil line, not a headband. A round soft face with full cheeks and a small mole beside her mouth. A grown woman's face.

Important details: A high cream-white robe collar with a dull red-brown stole over both shoulders falling straight down the front. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The veil, the robe and the stole are covered edge to edge in fine cross-hatching that follows the weave, the cream cloth hatched lightly so it stays pale; hair is drawn strand by strand in short strokes following its coil; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only under the jaw, in the eye sockets and beside the nose. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: a warm mid tan midway between Images 1 and 2, a smooth wash with a faint flush on the cheek. Colour: a near-monochrome sepia grade of cream, ochre, warm tan, brick red-brown and auburn, and one hue only, a greyed indigo blue, on the veil's lining, never navy. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, the veil's top clear of the top edge, both hands and the pendant within the frame at chest height, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a smooth unbroken veil dome from crown to nape, with two straight stole lines falling from the shoulders.

Constraints: Hatching on cloth and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No glowing effect, no clean uniform outline, no airbrushed skin, no orange or bronze skin, no gradient, no rim light, no makeup, no jewellery beyond the thin circlet and the wooden pendant, no wide headband, no man, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

### priest-m

```text
Use Image 1 (a hatted mage on parchment) as style reference.
Use Image 2 (a hooded woman holding a pen) as style reference.
Use Image 3 (a white-haired woman in plate) as style reference.
Use Image 4 (a spiky-haired man in plate) as style reference.
Draw a new character with the same hand, pen and paints as all four. Do not copy the face, hair, hat, hood or costume of any of them.

Scene: A faintly mottled sheet of warm parchment matching the paper of the reference images, the mottle only a few units lighter and darker than its average tone, filling the frame edge to edge. No horizon, floor, furniture or cast shadow, no vignette, no visible paper fibres.

Subject: A man in his mid twenties, a priest, waist-up. Head near-frontal with the chin lifted, tilted back so he looks a little down his nose at the viewer and the underside of the jaw shows, eyes on the viewer, a weary expression with dark rings under the eyes, lips parted as if mid-sentence. One hand raised beside his shoulder with two fingers up in a blessing, the other arm at his side. A low flat-topped square cloth cap of pale grey set squarely on the back of his head, his brow bare and the whole face lit. Dark hair combed back, clean-shaven. A gaunt, hollow-cheeked face. A grown adult face.

Important details: A high pale grey robe collar and a narrow ochre stole over both shoulders falling straight down the front. The same hand, pen and paints as Images 1 to 4: dark umber ink over sepia watercolour on parchment. Line: fine, dense and scratchy. The robe, the cap and the stole are covered edge to edge in fine cross-hatching that follows the weave, the grey robe hatched as densely as the armour in Image 4, its paleness carried by the wash under the hatching and not by thinner hatching; hair is drawn strand by strand in short strokes following its comb; skin is the one quiet surface, a smooth watercolour wash with sparse hatching only in the eye sockets, beside the nose and in the hollows of the cheeks; the jaw, chin and neck a smooth wash with no hatching at all. The figure is ink-heavy and reads dark against the paper, as in the references. Skin: pale like the woman in Image 3, a smooth wash, the rings under the eyes a cool grey wash. Colour: a near-monochrome sepia grade of pale grey, ochre, warm tan and umber, a little greyed indigo blue in the shadows only. Light: flat and frontal, no cast shadow, no rim light. Framing: waist-up, head about two fifths of frame height, the cap's flat top clear of the top edge, the raised hand within the frame beside the shoulder, cropped at the waist.

Use case: Tactics-RPG portrait, cropped in the game to head-and-chest at 96x128 pixels in a scene player and 72x96 on a unit card, so everything that matters sits between the crown and mid-chest, and the silhouette must read at 72 pixels: a flat square cap, the only horizontal straight edge above a head in the set, with two straight stole lines falling from the shoulders and one raised hand.

Constraints: The subject is male. Hatching on cloth and hair; skin a smooth wash with hatching only in its shadows; paper faintly mottled and matching the paper of the reference images, no vignette. No glowing effect, no clean uniform outline, no airbrushed skin, no orange or bronze skin, no gradient, no rim light, no makeup, no jewellery, no beard, no stubble, no beard shadow, no hatching on the jaw or neck, no moustache, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark, and do not copy the face, hair or costume of any reference.
```

---

## Deferred jobs

The owner said on 2026-09-05 that the job list will be cut; monk, geomancer and summoner are out of scope until the owner cuts or keeps them.
The v3 blocks are kept below unchanged (v3 style tail, v3 flat background, the old Midjourney archer as Image 1) as the character briefs a future v4 rewrite would translate from; do not run them as they stand.

### monk-f (v3, deferred)

```text
Image 1 is an approved portrait from this game and the target for line, texture and colour: draw this one with the same hand, pen and paints. Do not copy its subject, face, hair, costume or freckles.

Scene: One flat field of pale sand-tan, hex #e9d7a8, edge to edge. No horizon, floor, props or cast shadow.

Subject: A woman in her mid twenties, a bare-fisted monk, head and collar only. Dark hair shaved close at the sides and drawn into one short topknot standing upright on the crown, the whole face visible and lit. A grown woman's face with a slender neck, calm steady gaze. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A sleeveless coarse undyed linen jacket with a wide open collar and an ochre cord knotted at the throat. Dry pen line: broken, scratchy, varying in weight, short overlapping strokes rather than one clean contour, with fine hatching only in the shadows (under the jaw, eye sockets, inside the open collar) and short strokes inside the topknot and across the shaved sides following the hair's direction. Skin: a pale, warm, low-saturation tan, the same paper-pale tone as the skin in Image 1, laid as a blotchy watercolour wash with visible pooling and a rosy flush on cheek and nose tip; not darker and not more orange than Image 1's skin. The linen is undyed, greyed off-white, mottled. Palette: undyed linen, ochre, warm pale tan, a little dusty woad in the shadows. Flat frontal light. Head about two thirds of frame height, the topknot complete and well clear of the top edge, cropped below the collarbone.

Use case: Tactics-RPG portrait shown at 96x116 pixels and re-cropped to 28 pixels wide in a turn-order list, so the silhouette must read when tiny: the narrowest bare skull in the set with one upright stub on the crown.

Constraints: Hatching only in shadows and hair; skin and cloth carry wash texture, not pen texture; background flat and untextured; skin no darker and no more saturated than Image 1's. No clean uniform outline, no airbrushed skin, no tanned, orange or bronze skin, no gradient, no rim light, no makeup, no jewellery, no man, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark.
```

### monk-m (v3, deferred)

```text
Image 1 is an approved portrait from this game and the target for line, texture and colour: draw this one with the same hand, pen and paints. Do not copy its subject, face, gender, hair, costume or freckles.

Scene: One flat field of pale sand-tan, hex #e9d7a8, edge to edge. No horizon, floor, props or cast shadow.

Subject: A man in his late twenties, a bare-fisted monk, head and collar only. His head shaved smooth and completely bare with no headwear of any kind, the whole face visible and lit, clean-shaven. A lean adult face, level gaze. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A sleeveless coarse undyed linen jacket with a wide open collar, an ochre cord knotted at the throat with a single plain wooden bead. Dry pen line: broken, scratchy, varying in weight, short overlapping strokes rather than one clean contour, with fine hatching only in the shadows (under the jaw, eye sockets, where the skull curves away, inside the open collar). Skin: a pale, warm, low-saturation tan, the same paper-pale tone as the skin in Image 1, laid as a blotchy watercolour wash with visible pooling and a rosy flush on cheek and nose tip; not darker and not more orange than Image 1's skin. The linen is undyed, greyed off-white, mottled. Palette: undyed linen, ochre, warm pale tan, a little dusty woad in the shadows. Flat frontal light. Head about two thirds of frame height, clear space above the crown, cropped below the collarbone.

Use case: Tactics-RPG portrait shown at 96x116 pixels and re-cropped to 28 pixels wide in a turn-order list, so the silhouette must read when tiny: a smooth bare egg outline, the narrowest and least decorated head in the set.

Constraints: The subject is male. Hatching only in shadows; skin and cloth carry wash texture, not pen texture; background flat and untextured; skin no darker and no more saturated than Image 1's. No clean uniform outline, no airbrushed skin, no tanned, orange or bronze skin, no gradient, no rim light, no makeup, no jewellery beyond the wooden bead, no beard, no stubble, no moustache, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark.
```

### geomancer-f (v3, deferred)

```text
Image 1 is an approved portrait from this game and the target for line, texture and colour: draw this one with the same hand, pen and paints. Do not copy its subject, face, hair, costume or freckles.

Scene: One flat field of pale sand-tan, hex #e9d7a8, edge to edge. No horizon, floor, props or cast shadow.

Subject: A woman in her mid twenties, a geomancer, head and collar only. A wide flat woven straw hat tipped right back off her head and hanging behind her by its cord, its brim showing as a broad flat disc behind her head, so her whole face is visible and lit. Dark hair tied at the nape. A grown woman's face with a slender neck, calm steady gaze. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A moss-green hide mantle with rough woven grass trim at the collar. Dry pen line: broken, scratchy, varying in weight, short overlapping strokes rather than one clean contour, with fine hatching only in the shadows (under the jaw, eye sockets, under the hat's brim, under the collar) and short strokes inside the hair and across the straw weave following their direction. Skin: a pale, warm, low-saturation tan, the same paper-pale tone as the skin in Image 1, laid as a blotchy watercolour wash with visible pooling and a rosy flush on cheek and nose tip; not darker and not more orange than Image 1's skin. The moss green is greyed and dusty, never bright. Palette: straw yellow-ochre, greyed moss green, hide brown, warm pale tan, a little dusty woad in the shadows. Flat frontal light. Head about two thirds of frame height, the hat's rim well clear of the top edge, cropped below the collarbone.

Use case: Tactics-RPG portrait shown at 96x116 pixels and re-cropped to 28 pixels wide in a turn-order list, so the silhouette must read when tiny: a broad flat straw disc behind the head, far wider than the head.

Constraints: Hatching only in shadows and hair; skin and cloth carry wash texture, not pen texture; background flat and untextured; skin no darker and no more saturated than Image 1's. No clean uniform outline, no airbrushed skin, no tanned, orange or bronze skin, no gradient, no rim light, no makeup, no jewellery, no man, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark.
```

### geomancer-m (v3, deferred)

```text
Image 1 is an approved portrait from this game and the target for line, texture and colour: draw this one with the same hand, pen and paints. Do not copy its subject, face, gender, hair, costume or freckles.

Scene: One flat field of pale sand-tan, hex #e9d7a8, edge to edge. No horizon, floor, props or cast shadow.

Subject: A man in his late twenties, a geomancer, head and collar only. Shoulder-length dark hair held back off his face by a twisted cord of braided grass, no hat at all, his whole face visible and lit. Clean-shaven. A lean weathered adult face, level gaze. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A heavy shaggy fur mantle with a high ragged collar of hide, dried grass and small clay beads, the fur's edge drawn as short broken strokes. Dry pen line: broken, scratchy, varying in weight, short overlapping strokes rather than one clean contour, with fine hatching only in the shadows (under the jaw, eye sockets, under the collar, in the fur's depth) and short strokes inside the hair following its fall. Skin: a pale, warm, low-saturation tan, the same paper-pale tone as the skin in Image 1, laid as a blotchy watercolour wash with visible pooling and a rosy flush on cheek and nose tip; not darker and not more orange than Image 1's skin. Palette: hide brown, dried grass ochre, fur grey-brown, clay, warm pale tan, a little dusty woad in the shadows. Flat frontal light. Head about two thirds of frame height, clear space above the crown, cropped below the collarbone.

Use case: Tactics-RPG portrait shown at 96x116 pixels and re-cropped to 28 pixels wide in a turn-order list, so the silhouette must read when tiny: the only ragged, furred, irregular outline in the set, loose hair over a shaggy mantle.

Constraints: The subject is male. Hatching only in shadows and hair; skin and cloth carry wash texture, not pen texture; background flat and untextured; skin no darker and no more saturated than Image 1's. No clean uniform outline, no airbrushed skin, no tanned, orange or bronze skin, no gradient, no rim light, no makeup, no jewellery beyond the clay beads, no beard, no stubble, no moustache, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark.
```

### summoner-f (v3, deferred)

```text
Image 1 is an approved portrait from this game and the target for line, texture and colour: draw this one with the same hand, pen and paints. Do not copy its subject, face, hair, costume or freckles.

Scene: One flat field of pale sand-tan, hex #e9d7a8, edge to edge. No horizon, floor, props or cast shadow.

Subject: A woman in her early twenties, a summoner, head and collar only. Her pale ash-blond hair drawn up into two round coiled buns high on the crown under a thin flat bone circlet, her whole face visible and lit. A grown woman's face, not a girl's, with a slender neck, calm steady gaze. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A layered ivory and dusty blue robe with a high folded collar and a beaded cord. Dry pen line: broken, scratchy, varying in weight, short overlapping strokes rather than one clean contour, with fine hatching only in the shadows (under the jaw, eye sockets, inside the collar's fold) and short strokes inside the hair following each coil. Skin: a pale, warm, low-saturation tan, the same paper-pale tone as the skin in Image 1, laid as a blotchy watercolour wash with visible pooling and a rosy flush on cheek and nose tip; not darker and not more orange than Image 1's skin. The robe's blue is dusty, greyed woad, mottled, never navy. Palette: ivory, dusty woad, pale ash-blond, bone white, ochre, warm pale tan. Flat frontal light. Head about two thirds of frame height, both buns complete and well clear of the top edge, cropped below the collarbone.

Use case: Tactics-RPG portrait shown at 96x116 pixels and re-cropped to 28 pixels wide in a turn-order list, so the silhouette must read when tiny: two thick round lobes sitting on the crown.

Constraints: Hatching only in shadows and hair; skin and cloth carry wash texture, not pen texture; background flat and untextured; skin no darker and no more saturated than Image 1's. No clean uniform outline, no airbrushed skin, no tanned, orange or bronze skin, no gradient, no rim light, no makeup, no jewellery beyond the bone circlet and the beaded cord, no man, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark.
```

### summoner-m (v3, deferred)

```text
Image 1 is an approved portrait from this game and the target for line, texture and colour: draw this one with the same hand, pen and paints. Do not copy its subject, face, gender, hair, costume or freckles.

Scene: One flat field of pale sand-tan, hex #e9d7a8, edge to edge. No horizon, floor, props or cast shadow.

Subject: A man in his mid twenties, a summoner, head and collar only. A slender pale bone circlet with two thin curved horns rising high above his brow, worn back off the forehead so his whole face is visible and lit. Short dark hair, clean-shaven. A lean calm adult face, level gaze. Head turned three-quarters to the left, eyes toward the viewer.

Important details: A layered ivory and dusty blue robe with a high folded collar and a beaded cord. Dry pen line: broken, scratchy, varying in weight, short overlapping strokes rather than one clean contour, with fine hatching only in the shadows (under the jaw, eye sockets, under the circlet, inside the collar's fold) and short strokes inside the hair following its direction. Skin: a pale, warm, low-saturation tan, the same paper-pale tone as the skin in Image 1, laid as a blotchy watercolour wash with visible pooling and a rosy flush on cheek and nose tip; not darker and not more orange than Image 1's skin. The robe's blue is dusty, greyed woad, mottled, never navy. Palette: ivory, dusty woad, bone white, ochre, warm pale tan. Flat frontal light. Head about two thirds of frame height, both horns complete, well clear of the top edge and clearly separated from the head against the background, cropped below the collarbone.

Use case: Tactics-RPG portrait shown at 96x116 pixels and re-cropped to 28 pixels wide in a turn-order list, so the silhouette must read when tiny: two thin curved spikes rising tall off the crown, clearly separated from the head.

Constraints: The subject is male. Hatching only in shadows and hair; skin and cloth carry wash texture, not pen texture; background flat and untextured; skin no darker and no more saturated than Image 1's. No clean uniform outline, no airbrushed skin, no tanned, orange or bronze skin, no gradient, no rim light, no makeup, no jewellery beyond the bone circlet and the beaded cord, no beard, no stubble, no moustache, no chibi, no child or teenage face, no photorealism, no 3D or cel render, no border, text or watermark.
```

## Run record - v4, 2026-09-05

The owner ran all ten v4 blocks on 2026-09-05 evening and said "I finished updating the images".
Outputs were saved over the plain names in `reference/`, per "How to run"; sizes and bytes measured with Pillow on 2026-09-06 00:10 (docs-steward).
**Verdict: 8 approve / 2 rerun (archer-f, priest-m); paper landed on the refs' hex in 10 of 10, see `reference/README.md`.**

Set-wide, measured by the art-director on 2026-09-06 in `metrics-v4-outputs.txt` (scratch, not in the repo) unless marked eyeballed: all ten (turn, gaze, expression) triples are distinct, and male and female of each job read as different people at 72x96 (eyeballed).
Head height is 25-35% of the frame across the set where the prompt asked two fifths; crop B (head-to-chest) absorbs the gap.
The "mid" skin tier came out deeper and more saturated (saturation 153-164 on `knight-m`, `archer-f`, `wizard-m`, `priest-f` against the refs' 132-137), so the three-tier skin split collapsed to two.
The minor per-portrait misses are eyeballed at 1:1 and invisible at 72x96 and 96x128.
**Rerun - v4.1:** run only `archer-f` and `priest-m` from their edited blocks above, same settings, same four refs in the same order, and the same 3:4 size as the other nine (`priest-m` came out 1024x1536, the only 2:3 file; if the app offers a size, pick the one that gives 1086x1448); save over the same file names.

### Settings - ASSUMED, not confirmed

| Setting | Value | Confidence |
| --- | --- | --- |
| Tool | ChatGPT app, not the API | assumed - the "How to run" block asks for it; the owner reported no change |
| Model | GPT Image 2 | assumed, same basis |
| Thinking level | "high thinking" | assumed, same basis |
| Attachments | `style-ref-1..4.png` as Image 1-4, each as a style reference | assumed; the block asks the owner to say which were attached if fewer, and nothing was said |
| Output size | as delivered by the app; no size chosen | assumed; nine files are near 3:4, `priest-m.png` is 1024x1536 (2:3), and the record does not say why |
| Prompt text | the fenced block under each heading, verbatim | assumed; the owner's earlier words on v1 were "i used the same prompt u provided" |

The "How to run" block asks the owner to report any deviation; none was reported.
That is the only basis for every row above, so each is tagged assumed until the owner confirms.

### Outputs

| File | Block | Dimensions | Bytes on disk | Note |
| --- | --- | --- | --- | --- |
| `reference/knight-f.png` | `knight-f` | 1086x1448 | 3,117,149 | saved 21:59 |
| `reference/knight-m.png` | `knight-m` | 1086x1448 | 3,140,938 | saved 22:04 |
| `reference/thief-f.png` | `thief-f` | 1086x1448 | 3,081,186 | saved 22:21 at 3,164,784; re-encoded losslessly 2026-09-06, pixels verified identical |
| `reference/thief-m.png` | `thief-m` | 1086x1448 | 3,094,667 | saved 22:25 at 3,179,589; re-encoded losslessly 2026-09-06, pixels verified identical |
| `reference/archer-f.png` | `archer-f` | 1086x1448 | 2,808,578 | saved 22:37; replaced by the v4.1 rerun below |
| `reference/archer-m.png` | `archer-m` | 1087x1447 | 3,040,762 | saved 23:11 |
| `reference/wizard-f.png` | `wizard-f` | 1122x1402 | 3,092,059 | saved 23:24 |
| `reference/wizard-m.png` | `wizard-m` | 1086x1448 | 2,919,091 | saved 23:28 |
| `reference/priest-f.png` | `priest-f` | 1086x1448 | 3,063,727 | saved 23:35 |
| `reference/priest-m.png` | `priest-m` | **1024x1536** | 3,249,408 | saved 23:37 at 3,685,163; re-encoded losslessly 2026-09-06, pixels verified identical; **still 103,680 bytes over the 3 MiB cap**; replaced by the v4.1 rerun below |

The block-to-file mapping is inferred from the filenames, which follow the save rule in "How to run"; the owner did not confirm it per file.
Both archer files were finished with a follow-up edit prompt typed into the app after the block; the owner reported this on 2026-09-06 and the prompts are recorded under the v4.1 record below.
The six v3 files for monk, geomancer and summoner were deleted by the owner the same evening; those jobs are out of portrait scope and their v3 blocks stay under "Deferred jobs".

## Run record - v4.1, 2026-09-06

The owner reran `archer-f` and `priest-m` and said: "done, note that for archer-f, we had to run [the edit below]. Leave paper color as is. as for the four style-ref pictures, it's just some random generation and I chose the ones i like".
Settings as the v4 record assumes (ChatGPT app, GPT Image 2, high thinking, the four style refs as Images 1-4); no deviation was reported.
Both files were run with the pre-2026-09-06 Scene text that named the page hex `#e9d7a8`; the blocks above were changed afterwards and have not been run.
Sizes and bytes measured with Pillow on 2026-09-06 00:45.

| File | Block | Dimensions | Bytes on disk | Note |
| --- | --- | --- | --- | --- |
| `reference/archer-f.png` | `archer-f` (v4.1 text) + the edit below | 1086x1448 | 2,850,222 | saved 00:31; under the 3 MiB cap |
| `reference/priest-m.png` | `priest-m` (v4.1 text) | 1086x1448 | 2,960,923 | saved 00:35; now 3:4 like the other nine, under the 3 MiB cap |

### Edit prompts the owner typed after the block

Applied to `archer-f.png` during the v4.1 rerun (owner report 2026-09-06):

```text
Change: hold an arrow head instead with the sharp point facing up. There should be a slight shine to the arrow head
```

Applied to `archer-m.png` during the v4 run (owner report 2026-09-06; the owner did not say when it was run, and the file on disk is unchanged since 23:11 on 2026-09-05):

```text
Change: hold a crossbow instead. Hang a quiver of arrows on his back. Ensure crossbow is proper length
```

The `archer-f` and `archer-m` blocks above now carry both edits in their Subject lines, so a fresh run gets them in one pass.

### Verdict - v4.1 (art-director, 2026-09-06)

**archer-f: APPROVE.** The turn landed (head to the viewer's right, hand and arrowhead on the right at eye level, point up, a highlight on the head); fgEdge 31.8 (v4 29.1), jacket 26.9 (v4 23.1), both still under the refs' 36-48 / 30-49 after two runs asking for it, ink 66.5 in band; the arrowhead sits outside crop B.
**priest-m: APPROVE.** 3:4, jaw a smooth wash at 1:1 (jaw edge / cheek edge 0.79 against 1.29 in v4), robe hatched at 40.9 (v4 60.0), fgEdge 41.5 in band; ink 23.6 is out of the 40-74 band and cannot come in while the brief asks for a pale grey robe and cap (priest-f was approved at 29.0 on the same grounds); the chin is level, not raised; the skin came out mid tan (`#c28f57`), not pale like Image 3.
**Set: the ten-set is done at the prompt level; 10 of 10 approved.** Sheet: `unseen-hand-probe/set-v41-contact.png` (scratch), metrics `metrics-v41-outputs.txt`.
