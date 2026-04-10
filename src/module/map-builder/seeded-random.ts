/**
 * Seeded PRNG (xoshiro128**) for reproducible maze generation.
 */
export class SeededRandom {
  private s: Uint32Array;

  constructor(seed: number) {
    this.s = new Uint32Array(4);
    this.s[0] = seed >>> 0;
    this.s[1] = (seed * 1812433253 + 1) >>> 0;
    this.s[2] = (this.s[1] * 1812433253 + 1) >>> 0;
    this.s[3] = (this.s[2] * 1812433253 + 1) >>> 0;
    for (let i = 0; i < 20; i++) this.next();
  }

  next(): number {
    const s = this.s;
    const result = (((s[1] * 5) << 7 | (s[1] * 5) >>> 25) * 9) >>> 0;
    const t = s[1] << 9;
    s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
    s[2] ^= t;
    s[3] = (s[3] << 11 | s[3] >>> 21) >>> 0;
    return result / 4294967296;
  }

  /** Random integer in [0, max) */
  int(max: number): number {
    return Math.floor(this.next() * max);
  }

  /** Shuffle array in place */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}
