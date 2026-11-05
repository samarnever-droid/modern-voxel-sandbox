/** Deterministic hashing + noise utilities. Everything here is pure and seed-driven. */

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashInt(x: number, y: number, z = 0, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  return (h ^ (h >>> 15)) >>> 0;
}
/** 0..1 */
export const hash01 = (x: number, y: number, z = 0, seed = 0) => hashInt(x, y, z, seed) / 4294967296;

export function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

export class Noise {
  perm = new Uint8Array(512);
  constructor(seed: number) {
    const r = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  /** approx -1..1 */
  n2(x: number, y: number): number {
    const P = this.perm;
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y;
    const xi = X & 255, yi = Y & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const g = (h: number, dx: number, dy: number) => {
      const G = GRAD3[h % 12];
      return G[0] * dx + G[1] * dy;
    };
    const aa = P[P[xi] + yi], ab = P[P[xi] + yi + 1], ba = P[P[xi + 1] + yi], bb = P[P[xi + 1] + yi + 1];
    const x1 = g(aa, xf, yf) + u * (g(ba, xf - 1, yf) - g(aa, xf, yf));
    const x2 = g(ab, xf, yf - 1) + u * (g(bb, xf - 1, yf - 1) - g(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 1.15;
  }
  n3(x: number, y: number, z: number): number {
    const P = this.perm;
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const xf = x - X, yf = y - Y, zf = z - Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const f = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
    const u = f(xf), v = f(yf), w = f(zf);
    const gr = (h: number, dx: number, dy: number, dz: number) => {
      const G = GRAD3[h % 12];
      return G[0] * dx + G[1] * dy + G[2] * dz;
    };
    const A = P[xi] + yi, AA = P[A] + zi, AB = P[A + 1] + zi, B = P[xi + 1] + yi, BA = P[B] + zi, BB = P[B + 1] + zi;
    const l = (a: number, b: number, t: number) => a + t * (b - a);
    return (
      l(
        l(l(gr(P[AA], xf, yf, zf), gr(P[BA], xf - 1, yf, zf), u), l(gr(P[AB], xf, yf - 1, zf), gr(P[BB], xf - 1, yf - 1, zf), u), v),
        l(l(gr(P[AA + 1], xf, yf, zf - 1), gr(P[BA + 1], xf - 1, yf, zf - 1), u), l(gr(P[AB + 1], xf, yf - 1, zf - 1), gr(P[BB + 1], xf - 1, yf - 1, zf - 1), u), v),
        w,
      ) * 1.0
    );
  }
  fbm2(x: number, y: number, oct = 4, lac = 2, gain = 0.5): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * this.n2(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  ridged2(x: number, y: number, oct = 4): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(this.n2(x * f, y * f))); n += a; a *= 0.5; f *= 2; }
    return s / n;
  }
}
