/** Deterministic seeded RNG (mulberry32) with state introspection for saves. */

export interface RngState {
  state: number;
}

export function makeRng(seed: number): RngState {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  return { state: s };
}

export function rngNext(r: RngState): number {
  r.state = (r.state + 0x6d2b79f5) >>> 0;
  let t = r.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform float in [lo, hi). */
export function rngRange(r: RngState, lo: number, hi: number): number {
  return lo + rngNext(r) * (hi - lo);
}

/** Uniform integer in [lo, hi]. */
export function rngInt(r: RngState, lo: number, hi: number): number {
  return lo + Math.floor(rngNext(r) * (hi - lo + 1));
}

/** Choose a random element. */
export function rngPick<T>(r: RngState, items: readonly T[]): T {
  return items[Math.floor(rngNext(r) * items.length)] as T;
}

/** True with probability p. */
export function rngChance(r: RngState, p: number): boolean {
  return rngNext(r) < p;
}

/** Hash a string to a uint32 (for stable seeds from names). */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
