# Visual proof — the prep loop and the story seam (M0 items 3 + 4, ADR-0024)

Two frames from `e2e/campaign.spec.ts`, captured by `npm run test:visual` against the
built app. **Every claim below is asserted by that spec** — the frames are the same run,
not a staged screenshot.

- **`25-briefing-prep.png`** — the third briefing. The authored scene title ("The Hollow
  Watch") and Ottoline's pre-battle lines come from
  `data/campaign/story/camp-the-first-march.story.json`; the panel below is the prep loop
  mid-edit. Vance has just switched to Wizard, bought Fire with banked AP (96 → 36) and
  switched back to Knight, so his command list reads **Attack, Fire** — the Secondary is
  Black Magic. The Knight tree's rows are all disabled: at 36 AP the cheapest node costs
  60, and every one of them is tagged **no effect yet**, because `battle-skill` is
  excluded by decision and an unmarked inert node would charge real AP for nothing.
- **`23-after-battle.png`** — the after-battle screen with the **victory** beat. The
  defeat beat is different text; the spec plays the same battle both ways and asserts the
  two are unequal.

**What these frames do NOT show.** Neither is evidence of difficulty: the battles behind
them are driven by the balance probe on both seats (`autoplay()`), so they prove the path
is reachable, not that it is hard. The prep edit's persistence is proved by the reload
assertion in the same spec, not by anything visible here.
