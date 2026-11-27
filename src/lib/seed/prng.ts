// Deterministic PRNG helpers for the seed (seed-plan section 2). No Math.random, no faker.

export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private f: () => number;
  constructor(seed: number, name: string) {
    this.f = mulberry32(fnv1a32(`${seed}:${name}`));
  }
  next(): number {
    return this.f();
  }
  /** Inclusive integer range. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.f() * (hi - lo + 1));
  }
  range(lo: number, hi: number): number {
    return lo + this.f() * (hi - lo);
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.f() * list.length)] as T;
  }
  chance(p: number): boolean {
    return this.f() < p;
  }
  weighted<T>(pairs: ReadonlyArray<readonly [T, number]>): T {
    const total = pairs.reduce((s, p) => s + p[1], 0);
    let x = this.f() * total;
    for (const [v, w] of pairs) {
      x -= w;
      if (x < 0) return v;
    }
    return (pairs[pairs.length - 1] as readonly [T, number])[0];
  }
  normal(): number {
    const u = Math.max(this.f(), 1e-12);
    const v = this.f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  lognormal(median: number, sigma: number): number {
    return Math.exp(Math.log(median) + sigma * this.normal());
  }
  /** Triangular distribution. */
  tri(lo: number, hi: number, mode: number): number {
    const u = this.f();
    const c = (mode - lo) / (hi - lo);
    return u < c ? lo + Math.sqrt(u * (hi - lo) * (mode - lo)) : hi - Math.sqrt((1 - u) * (hi - lo) * (hi - mode));
  }
  /** Fisher-Yates on a copy. */
  shuffle<T>(list: readonly T[]): T[] {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.f() * (i + 1));
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }
  uuid(): string {
    const h = (n: number) => Array.from({ length: n }, () => Math.floor(this.f() * 16).toString(16)).join('');
    return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(this.f() * 4)]}${h(3)}-${h(12)}`;
  }
  digits(n: number): string {
    return Array.from({ length: n }, () => Math.floor(this.f() * 10)).join('');
  }
}

/** Largest-remainder allocation; ties by index. Sum of the result equals total. */
export function quota(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (w / sum) * total);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[(order[k] as { i: number }).i]++;
  return out;
}
