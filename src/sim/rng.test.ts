import { describe, it, expect } from "vitest";
import { SeededRng } from "./rng.js";

describe("SeededRng — determinism (AC-S1/S2 substrate)", () => {
  it("produces an identical sequence for the same seed", () => {
    const a = new SeededRng(12345);
    const b = new SeededRng(12345);
    const seqA = Array.from({ length: 32 }, () => a.nextFloat());
    const seqB = Array.from({ length: 32 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it("produces a different sequence for a different seed", () => {
    const a = Array.from({ length: 32 }, ((r) => () => r.nextFloat())(new SeededRng(1)));
    const b = Array.from({ length: 32 }, ((r) => () => r.nextFloat())(new SeededRng(2)));
    expect(a).not.toEqual(b);
  });

  it("advances count by exactly one per draw", () => {
    const r = new SeededRng(7);
    expect(r.count).toBe(0);
    r.nextFloat();
    expect(r.count).toBe(1);
    r.nextInt(10);
    expect(r.count).toBe(2);
    r.nextIntInclusive(1, 6);
    expect(r.count).toBe(3);
    r.chance(50);
    expect(r.count).toBe(4);
  });
});

describe("SeededRng — reconstruction / rewind substrate (AC-S7)", () => {
  it("fromState resumes the exact continuation of the stream", () => {
    const live = new SeededRng(0xdecafbad);
    for (let i = 0; i < 17; i++) live.nextFloat();

    const resumed = SeededRng.fromState(live.toState());
    expect(resumed.seed).toBe(live.seed);
    expect(resumed.count).toBe(live.count);

    const continuationLive = Array.from({ length: 20 }, () => live.nextFloat());
    const continuationResumed = Array.from({ length: 20 }, () => resumed.nextFloat());
    expect(continuationResumed).toEqual(continuationLive);
  });

  it("a stream reconstructed at draw N matches one that drew N times", () => {
    const N = 41;
    const fresh = new SeededRng(999);
    for (let i = 0; i < N; i++) fresh.nextFloat();

    const jumped = new SeededRng(999, N);
    expect(jumped.nextFloat()).toBe(fresh.nextFloat());
  });
});

describe("SeededRng — draw ranges", () => {
  it("nextFloat stays in [0, 1)", () => {
    const r = new SeededRng(42);
    for (let i = 0; i < 10_000; i++) {
      const v = r.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("nextInt stays in [0, bound) and rejects bad bounds", () => {
    const r = new SeededRng(42);
    for (let i = 0; i < 10_000; i++) {
      const v = r.nextInt(6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
    expect(() => r.nextInt(0)).toThrow(RangeError);
    expect(() => r.nextInt(-3)).toThrow(RangeError);
    expect(() => r.nextInt(2.5)).toThrow(RangeError);
  });

  it("nextIntInclusive covers both endpoints and rejects empty ranges", () => {
    const r = new SeededRng(3);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 10_000; i++) {
      const v = r.nextIntInclusive(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      if (v === 1) sawMin = true;
      if (v === 6) sawMax = true;
    }
    expect(sawMin && sawMax).toBe(true);
    expect(() => r.nextIntInclusive(6, 1)).toThrow(RangeError);
  });

  it("chance clamps to [0,100]: 0 never succeeds, 100 always does", () => {
    const r = new SeededRng(88);
    for (let i = 0; i < 1000; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(100)).toBe(true);
    }
  });

  it("chance(50) is roughly fair over many draws (sanity, not a stats test)", () => {
    const r = new SeededRng(2024);
    let hits = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) if (r.chance(50)) hits++;
    const rate = hits / n;
    expect(rate).toBeGreaterThan(0.48);
    expect(rate).toBeLessThan(0.52);
  });
});
