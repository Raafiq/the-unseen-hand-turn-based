/**
 * Seeded PRNG — the single source of randomness for a battle.
 *
 * Determinism is a P0 architectural invariant (docs/05 §3, ADR-0004): every
 * random decision in the sim — hit rolls, status rolls, crits, AI choices,
 * loot — MUST draw from one seeded stream in a declared order, so a battle is
 * byte-for-byte reproducible from `(seed, commands)`. Never reach for the
 * platform RNG, the crypto API, or wall-clock time in sim code.
 *
 * Algorithm: Mulberry32. Chosen because
 *   1. it is pure 32-bit integer math (Math.imul), so it is exactly
 *      reproducible across platforms/engines — no float-rounding divergence;
 *   2. its entire state is a single uint32, so it serializes trivially into
 *      BattleState and can be *reconstructed* from `(seed, drawCount)`. That
 *      reconstruction property is what lets rewind/replay resume the stream at
 *      any point (docs/05 §3b).
 *
 * `count` is the number of primitive draws consumed. Each public draw method
 * consumes exactly one primitive step, so `count` is a precise cursor into the
 * declared roll order (docs/05 §3a).
 */

const MULBERRY_INCREMENT = 0x6d2b79f5;

/** Serialized cursor for the stream: enough to reconstruct it exactly. */
export interface RngState {
  readonly seed: number;
  readonly count: number;
}

export class SeededRng {
  private readonly _seed: number;
  private _count: number;
  private _state: number;

  /**
   * @param seed  any 32-bit-coercible integer; the battle's `battleSeed`.
   * @param count number of draws already consumed (default 0). Used to resume
   *              a stream from a serialized `RngState` — see {@link fromState}.
   */
  constructor(seed: number, count = 0) {
    this._seed = seed | 0;
    this._count = count >>> 0;
    // Mulberry32 advances its state by a fixed increment per draw, so after N
    // draws state == seed + N*INC (mod 2^32). Repeated addition mod 2^32 is
    // multiplication mod 2^32, which Math.imul computes exactly — so we can jump
    // straight to the post-`count` state instead of replaying N draws.
    this._state = (this._seed + Math.imul(this._count, MULBERRY_INCREMENT)) | 0;
  }

  /** Reconstruct a stream positioned exactly after `state.count` draws. */
  static fromState(state: RngState): SeededRng {
    return new SeededRng(state.seed, state.count);
  }

  /** The original battle seed, as an unsigned 32-bit int. */
  get seed(): number {
    return this._seed >>> 0;
  }

  /** Number of primitive draws consumed so far (the roll-order cursor). */
  get count(): number {
    return this._count;
  }

  /** Serialize the stream cursor for BattleState / saves. */
  toState(): RngState {
    return { seed: this.seed, count: this._count };
  }

  /**
   * Next uniform float in [0, 1). Advances the stream exactly one draw.
   * This is the single primitive; every other draw method is built on it.
   */
  nextFloat(): number {
    this._state = (this._state + MULBERRY_INCREMENT) | 0;
    this._count = (this._count + 1) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Next integer in [0, bound). One draw.
   * @throws RangeError if `bound` is not a positive integer.
   */
  nextInt(bound: number): number {
    if (!Number.isInteger(bound) || bound <= 0) {
      throw new RangeError(`nextInt bound must be a positive integer, got ${bound}`);
    }
    return Math.floor(this.nextFloat() * bound);
  }

  /**
   * Integer in [minInclusive, maxInclusive]. One draw.
   * @throws RangeError if the range is empty or non-integer.
   */
  nextIntInclusive(minInclusive: number, maxInclusive: number): number {
    if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
      throw new RangeError("nextIntInclusive bounds must be integers");
    }
    if (maxInclusive < minInclusive) {
      throw new RangeError(`empty range [${minInclusive}, ${maxInclusive}]`);
    }
    return minInclusive + this.nextInt(maxInclusive - minInclusive + 1);
  }

  /**
   * FFT-style percentage roll: succeeds when a d100 (0..99) is below `percent`.
   * `percent` is clamped to [0, 100], so `chance(0)` never succeeds and
   * `chance(100)` always does. One draw. This is the canonical hit/status roll
   * (docs/01 §6); the resolution pipeline (PR3) will document exact roll order.
   */
  chance(percent: number): boolean {
    const p = percent <= 0 ? 0 : percent >= 100 ? 100 : Math.floor(percent);
    return this.nextInt(100) < p;
  }
}
