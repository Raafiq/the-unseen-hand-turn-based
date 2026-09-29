---
name: pr-delivery
description: Author or repair a pull-request body for the-unseen-hand, including visual proof (frames, filmstrip, video). Use when a PR was opened by the human with an auto-filled body, when a slice ships screenshots or motion, or before handing a branch over as "delivered".
---

# A PR body is authored

- **A PR body is AUTHORED, and "I pushed the branch" is not a delivery.** The harness forbids opening a PR unasked, so the human often opens it — and GitHub fills the body from the head commit message: hard-wrapped, no headings, trailers leaked. If you did not open the PR, find it and **replace an auto-filled body** (auto-filled iff it equals the head commit message) with: lede, review-artifact link, a `Claim / the bug it hides / caught by` evidence table, what is deliberately **not** asserted, the checks (cf. PR #35, #36). Re-fetch the stored body to confirm nothing mangled. No hook can catch this.
- **Visual proof in a PR.** Commit frames/video under `docs/visual/<slice>/` and embed images in the **PR body** as `https://github.com/<owner>/<repo>/raw/<branch>/<path>`; re-fetch afterwards to check for mangling. Do **not** embed images in API-posted comments (that path corrupts URLs and comments cannot be edited by the tooling). For motion: a filmstrip contact-sheet PNG (ffmpeg `fps=N,scale,tile`) plus an H.264 `run.mp4` and GIF (Playwright's bundled ffmpeg is VP8-only; use `ffmpeg-static`). Playable video lives on the Pages gallery after merge.
  - The repo is public, so `raw.githubusercontent.com` returns 200. Whether the GitHub mobile app inlines images and plays committed video is unverified: check on a device before relying on it.
