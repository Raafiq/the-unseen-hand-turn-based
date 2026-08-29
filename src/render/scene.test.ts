import { describe, it, expect } from "vitest";
import { SceneModel, group } from "./scene.js";
import type { Character, ResolvedLine } from "../sim/index.js";

const who = (id: string, name: string): Character => ({ id, name });
const VANCE = who("vance", "Vance");
const KEST = who("kest", "Kest");

const line = (text: string, character: Character | null = null, portrait = null as string | null):
  ResolvedLine => ({ text, who: character, portrait });

describe("AC-V16: the model owns how much has been read", () => {
  const beat = [line("one", VANCE), line("two", VANCE), line("three", KEST)];

  it("opens on ONE line, never zero", () => {
    // A scene that opens blank is indistinguishable on screen from one that failed to
    // load — and the existing "the story block is not empty" browser assertions would go
    // green on the broken one.
    const m = new SceneModel(beat);
    expect(m.revealed).toBe(1);
    expect(m.total).toBe(3);
    expect(m.done).toBe(false);
  });

  it("DISCRIMINATING: advancing exposes ONE more line, and returns only the new one", () => {
    // The return value is what lets the renderer APPEND. A model that returned every
    // revealed line would force a rebuild, which re-announces the whole region to a
    // screen reader and destroys the DOM nodes a reader is sitting on.
    const m = new SceneModel(beat);
    expect(m.advance().map((l) => l.text)).toEqual(["two"]);
    expect(m.revealed).toBe(2);
    expect(m.advance().map((l) => l.text)).toEqual(["three"]);
    expect(m.done).toBe(true);
  });

  it("advancing past the end is a NO-OP that exposes nothing", () => {
    // An empty return is what stops a dead click re-announcing the live region.
    const m = new SceneModel(beat);
    m.skipToEnd();
    expect(m.advance()).toEqual([]);
    expect(m.revealed).toBe(3);
  });

  it("skipToEnd returns exactly the UNREAD remainder, in order", () => {
    // Not "everything": appending the already-visible lines again would duplicate them
    // on screen, which a `revealed === total` assertion alone would not catch.
    const m = new SceneModel(beat);
    m.advance();
    expect(m.skipToEnd().map((l) => l.text)).toEqual(["three"]);
    expect(m.done).toBe(true);
    expect(m.skipToEnd()).toEqual([]);
  });

  it("a one-line beat is done on arrival", () => {
    const m = new SceneModel([line("only", VANCE)]);
    expect(m.done).toBe(true);
    expect(m.revealed).toBe(1);
  });
});

describe("AC-V16: grouping is what makes a migrated v1 beat look unchanged", () => {
  it("DISCRIMINATING: consecutive lines by one speaker share ONE plate", () => {
    // v1 drew one name over a whole beat. Two lines by Vance must still produce one
    // group, or every migrated pack visibly changes.
    expect(group([line("a", VANCE), line("b", VANCE)])).toEqual([
      { who: "Vance", portrait: null, lines: ["a", "b"] },
    ]);
  });

  it("DISCRIMINATING: a CHANGE of speaker starts a new plate", () => {
    // The fixture that separates grouping from "one plate per beat". Same-speaker-only
    // input scores identically under both.
    const groups = group([line("a", VANCE), line("b", KEST), line("c", VANCE)]);
    expect(groups.map((g) => g.who)).toEqual(["Vance", "Kest", "Vance"]);
  });

  it("DISCRIMINATING: narration BREAKS a run rather than joining the one above it", () => {
    // Vance, narration, Vance. A grouper that only compared against the previous
    // NON-NULL speaker would merge the two Vance lines around the narration and print
    // the narrator's line under Vance's name.
    const groups = group([line("a", VANCE), line("b"), line("c", VANCE)]);
    expect(groups.map((g) => g.who)).toEqual(["Vance", null, "Vance"]);
    expect(groups.map((g) => g.lines)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("groups only what is REVEALED, not the whole beat", () => {
    // The model's own grouping must follow the cursor; grouping the full array would
    // make the unread lines reachable to anything reading `groups()`.
    const m = new SceneModel([line("a", VANCE), line("b", KEST)]);
    expect(m.groups().map((g) => g.who)).toEqual(["Vance"]);
    m.advance();
    expect(m.groups().map((g) => g.who)).toEqual(["Vance", "Kest"]);
  });

  it("carries the portrait key of the line that opened the run", () => {
    expect(group([line("a", VANCE, "vance-grim")])[0]!.portrait).toBe("vance-grim");
    expect(group([line("a", VANCE)])[0]!.portrait).toBeNull();
  });
});
