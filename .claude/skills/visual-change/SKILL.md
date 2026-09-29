---
name: visual-change
description: The owner-earned rules for any change to how the game LOOKS - a stylesheet, a screen redesign, a spacing pass, portraits, frames sent for approval. Use BEFORE spawning the art director or a viewer engineer on a taste or layout change, before asking the owner to pick between looks, and before approving a redesign frame. Each rule below cost at least one rejected pass.
---

# Visual change

- **For a TASTE change, get a reference before you build.** The parchment slice was
  rebuilt twice from scratch — "too bright", then "too dark" — before the user sent one
  image, which settled it in a single pass. Aesthetic direction is not derivable from a
  description, and each blind iteration costs a full rebuild. Ask for a reference, or
  put 2–3 real options in front of them, before writing the stylesheet.
- **COLLECT EVERY NOTE ON THE APPROVED FRAMES BEFORE THE ENGINEER STARTS.** The owner
  said "go", then sent four notes, then "all six deploy", then a style brief — each while
  the build ran. Three in-flight redirects cost about a third of a 368k run (2026-09-08),
  rewriting tests the engineer had just written. After the frames are approved, ask once:
  "anything to change before it is built?" — and only then spawn.
- **OPTIONS THAT ARE ALL VARIATIONS OF THE CURRENT IMPLEMENTATION CANNOT ESCAPE A FAULT
  IN IT.** Three re-colourings of the battle board were rejected outright; every one of
  them kept the per-tile grid line, which *was* the fault ("actual grounds instead of
  this blocky generic"). When the user names a reference work, go and establish what
  that work actually **does** — FFT draws no grid on the ground — before generating
  options, or the whole set inherits the thing being complained about.
- **WHEN THE DECISION IS ABOUT APPEARANCE, RENDER IT BEFORE ASKING.** A multiple-choice
  question about how something looks is unanswerable in prose: the user said so three
  times in one session ("give me the image ... before I can even say go or no go", "I
  can't quite visualise the options, can u show me"). Frames from the **running game**
  beat mockups, and both beat a description — patch the data, capture, revert. Budget
  for it; it is cheaper than a rejected slice.
- **NUMBER EVERY FRAME YOU DELIVER.** Send frames as `<name>-pass<N>-<viewport>.png`,
  never the same filename twice. Nine passes of one screen shipped under one name; the
  owner opened an old card and ordered a revert of a layout that was already fixed
  (2026-09-08).
- **BEFORE APPROVING A REDESIGN FRAME, INVENTORY WHAT THE SCREEN REPLACES.** List every
  control and every piece of information the old screen carried, and check each has a home
  in the new frames. The dossier's frames were approved without that list, so the LEARN
  list (spending AP — the whole progression loop) had nowhere to go; it cost an extra art
  pass, an extra engineer pass and a review blocker (2026-09-09). The engineer will not
  catch it: it will invent a hiding place rather than stop. **Inventory the screens the
  new flow SKIPS too, not only the one it redraws:** the result overlay bypassed
  `AFTER_BATTLE`, and every battle's authored story beat went with it — the engineer
  flagged it, the fix was a routing pass nobody had budgeted (2026-09-23).
- **CHECK THE PIXEL BUDGET BEFORE A SPACING PASS.** At 832×328 the sheet is usually full.
  Read the last report's slack per column; when the ask needs pixels the fold does not
  have, ask the owner where they come from (two options), do not spend the pass. Doing so
  saved one pass and skipping it cost one (2026-09-08).
- **AN ASK YOU CANNOT RENDER MUST SHIP THE MATERIAL THAT PRODUCES THE ANSWER.** A deliverable
  the owner must act on (a prompt to run) is relayed verbatim, never summarised. **Once the owner
  acts, record the exact prompt AND the settings into the repo in the same turn** — a result you
  cannot reproduce is not an asset. The history behind both rules (three replies that never pasted
  the prompts; four approved images whose settings nobody wrote down) is in the `midjourney` skill.
