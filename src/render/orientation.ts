/**
 * AC-V32 — the one thing the rotate gate's button does.
 *
 * Ask the browser for fullscreen, then to hold the screen in landscape. Both are
 * best-effort: **iOS Safari supports neither**, and Android Chrome grants the
 * orientation lock only from inside a user gesture and only while fullscreen. So the
 * honest contract is "try, and be silent when it does not work" — a thrown promise
 * rejection here would surface as an unhandled rejection on exactly the devices the
 * feature exists for.
 *
 * WHY IT TAKES THE DOCUMENT AND SCREEN AS PARAMETERS. Nothing in this module reaches
 * for a global, so Vitest can drive every branch with plain object fakes — including
 * the two that cannot be produced in this repo's Chromium at all (an absent
 * `screen.orientation`, and a lock that rejects). A module that closed over the real
 * globals would leave those two branches asserted by nothing.
 *
 * WHY IT RETURNS A RESULT RATHER THAN VOID. A void "best effort" call is
 * indistinguishable from a body that does nothing: the same green test passes over an
 * empty function. The returned record is the observable the tests A/B on.
 */

/** The slice of `screen.orientation` this uses. `lock` is absent on Safari. */
export interface OrientationApiLike {
  lock?: (orientation: string) => Promise<unknown>;
}

/**
 * The slice of `screen` this uses.
 *
 * `orientation` is `unknown` rather than `OrientationApiLike` ON PURPOSE. The DOM lib
 * shipped with this TypeScript declares `ScreenOrientation` WITHOUT `lock` — it is
 * still not in the standard lib — so a narrower type here makes the real
 * `window.screen` un-assignable and pushes every caller into a cast. The narrowing
 * happens at runtime, which is where it has to happen anyway: this whole module exists
 * because the API may not be there.
 */
export interface ScreenLike {
  orientation?: unknown;
}

/** The slice of `document` this uses. */
export interface DocumentLike {
  documentElement?: { requestFullscreen?: () => Promise<unknown> } | undefined;
}

/** What each of the two attempts did. `unsupported` means the API was not there at all. */
export type AttemptOutcome = "unsupported" | "ok" | "refused";

export interface LandscapeAttempt {
  fullscreen: AttemptOutcome;
  lock: AttemptOutcome;
}

/**
 * Request fullscreen, then a landscape orientation lock. Never rejects.
 *
 * The order matters and is not cosmetic: Android Chrome rejects
 * `screen.orientation.lock()` outside fullscreen, so the fullscreen request has to be
 * awaited first. It is still attempted after a fullscreen refusal, because a browser
 * that allows the lock without fullscreen (or is already fullscreen) should get it.
 */
export async function requestLandscape(
  doc: DocumentLike,
  screen: ScreenLike,
): Promise<LandscapeAttempt> {
  const result: LandscapeAttempt = { fullscreen: "unsupported", lock: "unsupported" };

  const enter = doc.documentElement?.requestFullscreen;
  if (typeof enter === "function") {
    try {
      await enter.call(doc.documentElement);
      result.fullscreen = "ok";
    } catch {
      result.fullscreen = "refused";
    }
  }

  const orientation = screen.orientation as OrientationApiLike | undefined;
  const lock = orientation?.lock;
  if (typeof lock === "function") {
    try {
      await lock.call(orientation, "landscape");
      result.lock = "ok";
    } catch {
      result.lock = "refused";
    }
  }

  return result;
}

/**
 * Did the attempt leave the player stuck?
 *
 * True whenever either half did not actually happen — `unsupported` (iOS Safari has
 * neither API) or `refused` (Android Chrome outside a gesture, or a device whose OS
 * rotation lock is on). Both look identical from the player's side: they pressed the
 * button and the screen did not turn, with no explanation. That is the dead end this
 * predicate exists to detect.
 *
 * `refused` counts as a failure DELIBERATELY. Treating only `unsupported` as a dead end
 * would leave the iOS case covered and the far commoner Android one silent.
 */
export function landscapeHelpNeeded(result: LandscapeAttempt): boolean {
  return result.fullscreen !== "ok" || result.lock !== "ok";
}

/**
 * Wire the rotate gate's button, if this page has one.
 *
 * Kept here rather than in `game.ts`/`main.ts` because both pages need the identical
 * lines, and a second copy is how one page quietly stops locking. Returns whether a
 * button was found, so a caller could assert the wiring — a listener attached to
 * nothing reads exactly like one that works.
 *
 * THE HINT IS THE HONEST HALF. On iOS Safari the button can do nothing at all, and a
 * button that silently does nothing is worse than no button: the player presses it,
 * the screen stays put, and the game reads as broken. When the attempt comes back with
 * either half not granted, the standing hint line is revealed — one sentence telling
 * them to turn the device themselves and to check the OS rotation lock. It is revealed
 * rather than created so the copy lives in the page with the rest of the player-facing
 * text, and so it is `hidden` (not absent) for every measurement taken before a press.
 */
export function wireLandscapeButton(
  doc: DocumentLike & { querySelector?: (s: string) => unknown },
  screen: ScreenLike,
  selector = "[data-testid='rotate-go']",
  hintSelector = "[data-testid='rotate-hint']",
): boolean {
  const el = doc.querySelector?.(selector) as {
    addEventListener?: (t: string, f: () => void) => void;
  } | null;
  if (!el?.addEventListener) return false;
  el.addEventListener("click", () => {
    void requestLandscape(doc, screen).then((result) => {
      if (!landscapeHelpNeeded(result)) return;
      const hint = doc.querySelector?.(hintSelector) as { hidden?: boolean } | null;
      if (hint) hint.hidden = false;
    });
  });
  return true;
}
