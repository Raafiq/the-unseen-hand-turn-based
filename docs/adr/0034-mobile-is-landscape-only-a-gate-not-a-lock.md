# ADR-0034 — Mobile is landscape-only: a gate, not a lock

- **Status:** Accepted
- **Date:** 2026-09-05
- **Deciders:** the owner, 2026-09-05.
- **Extends:** ADR-0032 (the board moves), ADR-0033 (the stat plate). Constrained by
  `docs/10` §3 (the turn state machine) and §4 (resolution transparency, which needs board
  and panel on screen together).
- **Acceptance Criteria:** `docs/10` **AC-V30, AC-V31, AC-V32**. `docs/10` outranks this
  file wherever the two disagree.

## Context

The viewer has only ever been tested at **1000×780** (`playwright.config.ts`), with the
board canvas fixed at **900×440** (`src/render/iso.ts`). Nothing in the shipped viewer or
its test suite has run at a phone's resolution, in either orientation.

Portrait was considered and rejected. The board is 900:440 — more than twice as wide as
tall — and the stat plate (ADR-0033) and turn/action controls sit beside and under it. On
a portrait phone screen that layout does not fit without shrinking the board past
legibility or stacking panels below the fold, which breaks §4's rule that the resolution
preview is visible **before** commit, not after a scroll. Landscape keeps the shipped
layout's proportions; portrait would need a second layout nobody has designed or tested.

A browser cannot force device orientation. `screen.orientation.lock()` only *requests* a
change, needs a full-screen or installed context to work at all, and several browsers —
notably iOS Safari — do not implement it. So orientation cannot be guaranteed; the design
has to assume a phone may stay in portrait and respond to that, not prevent it.

## Decision

**Landscape only. Portrait is explicitly out of scope**, not a future slice.

**(A) A rotate gate.** On a touch device held in portrait, a full-viewport card covers the
page. Its primary line is **"Please rotate your device"**, above an `aria-hidden` figure —
a phone icon turning 0 to 90 degrees on a CSS loop, inside a static quarter-turn arrow —
plus the lock-attempt button from (B). **The icon exists because text alone does not cross
languages** (owner direction, 2026-09-05): a rotating phone reads the same regardless of
what the sentence above it says. Under `prefers-reduced-motion: reduce` the phone is static
at 90 degrees, the loop's finished state, rather than animating. The game underneath is
hidden and unfocusable while the card is up. The gate is keyed off a media query meant to
mean "touch device in portrait" — currently `(orientation: portrait) and (pointer: coarse)`.
**The rule is the meaning, not the selector**: if Chromium's device emulation cannot be made
to report `pointer: coarse`, the engineer may fall back to a max-width query as a proxy for
"phone-sized". Whichever query ships is named in the code as the current implementation,
not re-litigated here. **The gate never fires on a non-touch device**, at any aspect ratio —
a narrow desktop window in portrait is not a phone and must not be gated. **A tablet held in
portrait IS gated**, deliberately: the condition is touch + portrait, with no size bound, by
owner intent. A tablet-specific layout is out of scope, the same as portrait phone.

**(B) A lock attempt, best-effort.** The gate card's button, **"Play in landscape"**, calls
`element.requestFullscreen()`, then `screen.orientation.lock('landscape')`. Both calls are
feature-detected before use and wrapped so a missing method or a thrown/rejected promise
is swallowed silently — the button never surfaces an error for a capability the browser
does not have. A persistent line, **"If the screen does not follow, switch off rotation
lock."**, sits on the card at all times, whether or not the button has been pressed. When
either call is unsupported or refused, the card additionally reveals a hint line, **"Your
browser cannot rotate the screen for you."** — hidden until that point, so a button that
silently does nothing does not read as a broken game before the player has even tried it. A
web app manifest declares `orientation: "landscape"` and `display: "standalone"`, and is
linked from both `index.html` and `viewer.html`. The manifest is asserted by a browser test
that fetches the linked file and checks its fields; it ships with no icon set, so it is not
installable on any platform yet.

## Consequences

**Easier.** A player who rotates their phone gets a playable board at the shipped 900:440
proportions with no separate mobile layout to design, build or test. Desktop is
untouched — the gate's condition never matches a mouse-driven, non-touch context.

**What we give up.**

- No portrait experience, ever, on this plan. A player who cannot or will not rotate their
  phone cannot play. That is the accepted cost of not building and maintaining a second
  layout.
- The lock is a courtesy, not a guarantee. See Limits — on the browser with the largest
  phone install base, it does nothing.
- The manifest ships without icons, so no platform will offer an install prompt yet. Adding
  icons is separate, later work.

## Limits — recorded honestly

- **iOS Safari supports neither mechanism.** No `screen.orientation.lock`, and Safari does
  not honor a manifest's `orientation` field. On an iPhone, only the gate (A) does
  anything; the lock attempt (B) is a silent no-op every time.
- **On Android, the lock only works after a user tap** (the button click itself) — it
  cannot be requested on page load — and the manifest's `orientation` only takes effect
  once the app is installed to the home screen, not when opened in a regular browser tab.
- **The manifest is not yet installable.** It ships with no icon set, so browsers that
  would otherwise offer "Add to Home Screen" have nothing to show.
- **No stranger has played this on a real phone.** The sandbox can only emulate a phone
  inside Chromium (device metrics, touch flags, a synthetic `orientation` media feature).
  "Works on a real device" is an **unverified claim** for both iOS and Android hardware
  until someone tests on one.
- **The icon's cross-language benefit is asserted by intent, not by a translated build.**
  It exists because a sentence-only card fails a player whose device language the copy was
  never written for; nothing in this repo ships a second language to test that against, so
  the icon's actual legibility to such a player is unverified the same way the lock is.

## Acceptance Criteria

- **AC-V30** — the rotate gate: present and blocking on a touch device in portrait
  (tablets included, no size bound), absent and inert everywhere else; its icon animates
  and parks static at 90 degrees under reduced motion, asserted by computed transform.
- **AC-V31** — landscape fit: at 844×390 with touch emulation, the board, stat plate and
  action controls are each visible with no scrolling, board keeping 900:440. The timeline,
  legend and other panels may sit below the fold.
- **AC-V32** — the lock attempt: both calls feature-detected, both fail silently, the
  persistent rotation-lock line always shows, and the post-failure hint then reveals. The
  manifest is asserted by a browser test and ships with no icons, so it is not installable
  yet. Real-device behaviour is explicitly unverified.

Full wording lives in `docs/10` §6, which is authoritative; this ADR is context and
rationale, not a second copy of the spec.

## References

- `docs/10` §3, §4, §6 (AC-V30/31/32).
- ADR-0032 (the board moves, non-blocking), ADR-0033 (the stat plate, bottom-left).
- `playwright.config.ts` (the 1000×780 baseline this ADR extends past), `src/render/iso.ts`
  (the 900×440 board canvas).
