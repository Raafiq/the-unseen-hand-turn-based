import { describe, it, expect } from "vitest";
import {
  requestLandscape,
  landscapeHelpNeeded,
  wireLandscapeButton,
  type DocumentLike,
  type ScreenLike,
} from "./orientation.js";

/**
 * AC-V32. Every case here is a device this repo cannot run: iOS Safari (no fullscreen
 * API, no orientation lock), an Android Chrome that refuses the lock outside a gesture,
 * and a browser that grants both. The fakes are the only way those three branches are
 * ever exercised — the sandbox's Chromium takes exactly one of them.
 */

function fakeDoc(opts: { fullscreen?: "ok" | "throw" | "absent" } = {}): {
  doc: DocumentLike & { querySelector?: (s: string) => unknown };
  calls: string[];
} {
  const calls: string[] = [];
  const mode = opts.fullscreen ?? "ok";
  const documentElement =
    mode === "absent"
      ? {}
      : {
          requestFullscreen: async (): Promise<void> => {
            calls.push("fullscreen");
            if (mode === "throw") throw new Error("not allowed");
          },
        };
  return { doc: { documentElement }, calls };
}

function fakeScreen(
  calls: string[],
  opts: { lock?: "ok" | "throw" | "absent-fn" | "absent-api" } = {},
): ScreenLike {
  const mode = opts.lock ?? "ok";
  if (mode === "absent-api") return {};
  if (mode === "absent-fn") return { orientation: {} };
  return {
    orientation: {
      lock: async (o: string): Promise<void> => {
        calls.push(`lock:${o}`);
        if (mode === "throw") throw new Error("NotSupportedError");
      },
    },
  };
}

describe("requestLandscape (AC-V32)", () => {
  it("asks for fullscreen and then locks to landscape", async () => {
    const { doc, calls } = fakeDoc();
    const screen = fakeScreen(calls);

    const out = await requestLandscape(doc, screen);

    // The ARGUMENT is the assertion, not merely that lock ran: a call to
    // lock("portrait-primary") would satisfy "lock was called" and do the opposite.
    expect(calls).toEqual(["fullscreen", "lock:landscape"]);
    expect(out).toEqual({ fullscreen: "ok", lock: "ok" });
  });

  it("resolves without throwing when the lock rejects", async () => {
    const { doc, calls } = fakeDoc();
    const screen = fakeScreen(calls, { lock: "throw" });

    // `.resolves` is the point: an un-caught rejection here is an unhandled promise
    // rejection on Android Chrome outside a gesture, which is the common case.
    await expect(requestLandscape(doc, screen)).resolves.toEqual({
      fullscreen: "ok",
      lock: "refused",
    });
    expect(calls).toEqual(["fullscreen", "lock:landscape"]);
  });

  it("resolves without throwing when there is no orientation API at all (iOS Safari)", async () => {
    const { doc, calls } = fakeDoc({ fullscreen: "absent" });
    const screen = fakeScreen(calls, { lock: "absent-api" });

    await expect(requestLandscape(doc, screen)).resolves.toEqual({
      fullscreen: "unsupported",
      lock: "unsupported",
    });
    // Nothing was called — "unsupported" must mean untouched, not silently failed.
    expect(calls).toEqual([]);
  });

  it("treats a present-but-lockless orientation object as unsupported", async () => {
    const { doc, calls } = fakeDoc();
    const screen = fakeScreen(calls, { lock: "absent-fn" });

    const out = await requestLandscape(doc, screen);
    expect(out.lock).toBe("unsupported");
    expect(calls).toEqual(["fullscreen"]);
  });

  it("still attempts the lock after a fullscreen refusal", async () => {
    // Discriminating on purpose: a body that early-returns on a fullscreen rejection
    // passes every other test in this file and fails only here.
    const { doc, calls } = fakeDoc({ fullscreen: "throw" });
    const screen = fakeScreen(calls);

    const out = await requestLandscape(doc, screen);
    expect(out).toEqual({ fullscreen: "refused", lock: "ok" });
    expect(calls).toEqual(["fullscreen", "lock:landscape"]);
  });
});

describe("landscapeHelpNeeded (AC-V32)", () => {
  it("is false only when BOTH halves were granted", () => {
    expect(landscapeHelpNeeded({ fullscreen: "ok", lock: "ok" })).toBe(false);
    // `refused` counts as a dead end, not just `unsupported`. A predicate that only
    // caught `unsupported` would cover iOS and stay silent on the commoner Android
    // case, which is the one a player actually meets.
    expect(landscapeHelpNeeded({ fullscreen: "ok", lock: "refused" })).toBe(true);
    expect(landscapeHelpNeeded({ fullscreen: "ok", lock: "unsupported" })).toBe(true);
    expect(landscapeHelpNeeded({ fullscreen: "refused", lock: "ok" })).toBe(true);
    expect(landscapeHelpNeeded({ fullscreen: "unsupported", lock: "unsupported" })).toBe(true);
  });
});

/** A DOM stub answering the two selectors `wireLandscapeButton` asks for. */
function fakePage(): {
  query: (s: string) => unknown;
  press: () => void;
  hintShown: () => boolean;
} {
  let handler: (() => void) | undefined;
  const hint = { hidden: true };
  const button = {
    addEventListener: (t: string, f: () => void) => {
      if (t === "click") handler = f;
    },
  };
  return {
    query: (sel: string) => (sel.includes("rotate-hint") ? hint : button),
    press: () => handler?.(),
    hintShown: () => hint.hidden === false,
  };
}

/** Let the two awaits inside the click handler settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

describe("wireLandscapeButton (AC-V32)", () => {
  it("returns false and attaches nothing when the page has no rotate button", () => {
    const { doc } = fakeDoc();
    expect(wireLandscapeButton({ ...doc, querySelector: () => null }, {})).toBe(false);
  });

  it("locks on click, and not before", async () => {
    const { doc, calls } = fakeDoc();
    const screen = fakeScreen(calls);
    const page = fakePage();

    expect(wireLandscapeButton({ ...doc, querySelector: page.query }, screen)).toBe(true);
    // Wiring alone must not fire the request — a lock attempted at page load is
    // outside a user gesture and is refused everywhere.
    expect(calls).toEqual([]);

    page.press();
    await flush();
    expect(calls).toEqual(["fullscreen", "lock:landscape"]);
  });

  it("leaves the hint hidden when the lock actually worked", async () => {
    const { doc, calls } = fakeDoc();
    const page = fakePage();
    wireLandscapeButton({ ...doc, querySelector: page.query }, fakeScreen(calls));

    page.press();
    await flush();
    // The A/B partner of the test below. Without it, a body that unhid the hint
    // unconditionally would pass — and would tell a player the browser had failed on
    // the very device where it succeeded.
    expect(page.hintShown()).toBe(false);
  });

  it("reveals the hint when there is no orientation API to call (iOS Safari)", async () => {
    const { doc, calls } = fakeDoc({ fullscreen: "absent" });
    const page = fakePage();
    wireLandscapeButton(
      { ...doc, querySelector: page.query },
      fakeScreen(calls, { lock: "absent-api" }),
    );

    page.press();
    await flush();
    expect(page.hintShown()).toBe(true);
  });

  it("reveals the hint when the lock is refused (Android outside a gesture)", async () => {
    const { doc, calls } = fakeDoc();
    const page = fakePage();
    wireLandscapeButton({ ...doc, querySelector: page.query }, fakeScreen(calls, { lock: "throw" }));

    page.press();
    await flush();
    expect(page.hintShown()).toBe(true);
  });
});
