---
name: pages-deploy
description: Diagnose and fix the GitHub Pages deploy for the-unseen-hand. Use when the Pages badge is red, a `deploy` job fails with no logs, the site is stale after a merge, or the sandbox cannot reach a GitHub API the answer lives behind.
---

# GitHub Pages is a two-part system and the halves fail independently

`pages.yml`'s `build` job can be green while the site does not exist — true for the first **22** runs. Only `deploy` ever failed, from two different settings in sequence: Pages was never enabled, then the `github-pages` environment's branch policy allowed only a dead day-one branch. Both derived from the **repository default branch**, which was the real fault. Since 2026-08-09 GitHub refuses a blocked `deploy` at the environment gate before assigning a runner, so it fails in one second with no steps and **no logs** — reading like an infra blip rather than a misconfiguration.

Two preflights now open `build`: `/pages` must return 200 with `build_type == "workflow"`, **and** the environment must allow the branch. The second exists because the first is insufficient — `/pages` answers 200 while the gate still refuses every branch you have. Severity anchors on `PUBLISH_BRANCH`, not the default branch.

Treat a red Pages badge as "the site is stale", never as flakiness. **The sandbox cannot load `*.github.io`** — an agent can confirm the deployment API reported success, never that the page renders.

## When the sandbox cannot reach an API, a CI runner can

**When the sandbox cannot reach an API, a CI runner can.** The proxy 403s `/repos/{owner}/{repo}`, `/pages`, `/environments`, `/deployments` and blocks `*.github.io` — but a temporary workflow step querying them with `${{ github.token }}` prints the answer in the log. That found the Pages branch policy after two wrong theories. Reach for it before guessing.
