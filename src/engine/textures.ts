/**
 * Procedural pixel-art texture painters. Every block/item texture is a declarative
 * `TexSpec` ({painter, args}) — mods can use the same painters from JSON.
 * Painters write to plain RGBA buffers so they run in Node (tests) and the browser alike.
 */
import { mulberry32, strHash } from './noise';

export const TS = 32;
export type RGB = [number, number, number];
export interface TexSpec { p: string; a: any[] }

const hexCache = new Map<string, RGB>();
export function hex(h: string): RGB {
  let c = hexCache.get(h);
  if (!c) {
    let s = h.replace('#', '');
    if (s.length === 3) s = s.split('').map((x) => x + x).join('');
    const n = parseInt(s, 16) || 0;
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    hexCache.set(h, c);
  }
  return c;
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sh = (a: RGB, f: number): RGB => [a[0] * f, a[1] * f, a[2] * f];
const col = (c: string | RGB): RGB => (typeof c === 'string' ? hex(c) : c);

class Cv {
  d = new Uint8ClampedArray(TS * TS * 4);
  rng: () => number;
  lat = new Map<string, number>();
  seed: number;
  constructor(seed: number) { this.seed = seed; this.rng = mulberry32(seed); }
  set(x: number, y: number, c: RGB, a = 255) {
    x = ((Math.floor(x) % TS) + TS) % TS; y = ((Math.floor(y) % TS) + TS) % TS;
    const i = (y * TS + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  /** non-wrapping set (icons) */
  px(x: number, y: number, c: RGB, a = 255) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= TS || y >= TS) return;
    const i = (y * TS + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    x = ((x % TS) + TS) % TS; y = ((y % TS) + TS) % TS;
    const i = (y * TS + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2]];
  }
  alpha(x: number, y: number) { return this.d[(((y % TS) + TS) % TS * TS + (((x % TS) + TS) % TS)) * 4 + 3]; }
  fill(c: RGB, a = 255) { for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) this.set(x, y, c, a); }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  prect(x: number, y: number, w: number, h: number, c: RGB, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a); }
  lat2(ix: number, iy: number, n: number): number {
    const k = ((ix % n) + n) % n + ((iy % n) + n) % n * 64 + n * 4096 + this.seed * 7;
    const key = String(k);
    let v = this.lat.get(key);
    if (v === undefined) { v = (Math.imul(k, 2654435761) >>> 0) / 4294967296; v = ((Math.imul(Math.floor(v * 4294967296) ^ (this.seed | 0), 1597334677) >>> 0) / 4294967296); this.lat.set(key, v); }
    return v;
  }
  /** tileable value noise, cell must divide TS */
  vn(x: number, y: number, cell: number): number {
    const n = TS / cell, gx = x / cell, gy = y / cell;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    let fx = gx - ix, fy = gy - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fx * 0 + fy * fy * (3 - 2 * fy);
    const a = this.lat2(ix, iy, n), b = this.lat2(ix + 1, iy, n), c = this.lat2(ix, iy + 1, n), d = this.lat2(ix + 1, iy + 1, n);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  jitter(amt: number) {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const i = (y * TS + x) * 4, j = (this.rng() - 0.5) * amt;
      this.d[i] += j; this.d[i + 1] += j; this.d[i + 2] += j;
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, wrap = false, a = 255) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n; wrap ? this.set(x, y, c, a) : this.px(x, y, c, a); }
  }
  disc(cx: number, cy: number, r: number, c: RGB, a = 255) {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.px(x, y, c, a);
  }
  /** icon helper: 1px dark outline + top-left highlight */
  outline(oc: RGB = [14, 16, 22]) {
    const src = this.d.slice();
    const A = (x: number, y: number) => (x < 0 || y < 0 || x >= TS || y >= TS ? 0 : src[(y * TS + x) * 4 + 3]);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      if (A(x, y) < 128 && (A(x - 1, y) > 128 || A(x + 1, y) > 128 || A(x, y - 1) > 128 || A(x, y + 1) > 128)) this.px(x, y, oc);
      else if (A(x, y) > 128 && A(x - 1, y) > 128 && A(x, y - 1) < 128) {
        const i = (y * TS + x) * 4; this.d[i] = Math.min(255, src[i] + 38); this.d[i + 1] = Math.min(255, src[i + 1] + 38); this.d[i + 2] = Math.min(255, src[i + 2] + 38);
      }
    }
  }
}

type Painter = (c: Cv, ...a: any[]) => void;
const bev = (c: Cv, x: number, y: number, w: number, h: number, base: RGB, k = 0.25) => {
  for (let i = 0; i < w; i++) { c.set(x + i, y, sh(base, 1 + k)); c.set(x + i, y + h - 1, sh(base, 1 - k)); }
  for (let j = 0; j < h; j++) { c.set(x, y + j, sh(base, 1 + k * 0.6)); c.set(x + w - 1, y + j, sh(base, 1 - k * 0.6)); }
};

const PAINTERS: Record<string, Painter> = {
  solid(c, a, amt = 0.06) { c.fill(col(a)); c.jitter(amt * 255); },
  noise(c, a, b, grain = 0.5, cell = 4) {
    const c1 = col(a), c2 = col(b);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const t = c.vn(x, y, cell) * 0.65 + c.vn(x, y, 2) * 0.35;
      const m = mix(c1, c2, t), j = (c.rng() - 0.5) * grain * 48;
      c.set(x, y, [m[0] + j, m[1] + j, m[2] + j]);
    }
  },
  speckle(c, base, dark, light, dens = 0.12) {
    const b = col(base), d = col(dark), l = col(light);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const r = c.rng(), v = (c.vn(x, y, 8) - 0.5) * 20;
      c.set(x, y, r < dens ? d : r > 1 - dens ? l : [b[0] + v, b[1] + v, b[2] + v]);
    }
  },
  stone(c, base, dark, light) {
    PAINTERS.noise(c, dark, base, 0.55, 8);
    const l = col(light);
    for (let i = 0; i < 22; i++) { const x = c.rng() * TS, y = c.rng() * TS; c.set(x, y, l); c.set(x + 1, y, sh(l, 0.9)); }
    for (let i = 0; i < 3; i++) c.line(c.rng() * TS, c.rng() * TS, c.rng() * TS, c.rng() * TS, sh(col(dark), 0.7), true, 120);
  },
  concrete(c, base, stain, tie = 1) {
    PAINTERS.noise(c, base, stain, 0.35, 8);
    const b = col(base);
    if (tie) for (const [x, y] of [[4, 4], [20, 4], [4, 20], [20, 20]]) { c.rect(x, y, 2, 2, sh(b, 0.55)); c.set(x - 1, y - 1, sh(b, 1.12)); }
    for (let x = 0; x < TS; x++) { c.set(x, 0, sh(c.get(x, 0), 0.85)); c.set(x, 16, sh(c.get(x, 16), 0.93)); }
  },
  bricks(c, brick, mortar, rows = 8) {
    const m = col(mortar), b = col(brick), bh = TS / rows;
    c.fill(m); c.jitter(10);
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 4 : 0;
      for (let k = -1; k < TS / 8 + 1; k++) {
        const v = 0.85 + c.rng() * 0.3, bc = sh(b, v);
        c.rect(k * 8 + off + 1, r * bh + 1, 7, bh - 1, bc);
        for (let i = 0; i < 7; i++) c.set(k * 8 + off + 1 + i, r * bh + 1, sh(bc, 1.15));
      }
    }
    c.jitter(14);
  },
  tiles(c, base, grout, n = 4) {
    const s = TS / n, b = col(base);
    c.fill(col(grout));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = 0.94 + c.rng() * 0.12;
      c.rect(i * s + 1, j * s + 1, s - 1, s - 1, sh(b, v));
      bev(c, i * s + 1, j * s + 1, s - 1, s - 1, sh(b, v), 0.12);
    }
    c.jitter(8);
  },
  panel(c, base, seam, rivet, n = 2) {
    const b = col(base), sm = col(seam), rv = col(rivet), s = TS / n;
    for (let y = 0; y < TS; y++) { const v = 1 + (c.rng() - 0.5) * 0.08; for (let x = 0; x < TS; x++) c.set(x, y, sh(b, v + (c.vn(x, y, 8) - 0.5) * 0.1)); }
    for (let k = 0; k < n; k++) {
      for (let i = 0; i < TS; i++) { c.set(i, k * s, sm); c.set(k * s, i, sm); c.set(i, k * s + 1, sh(b, 1.2)); c.set(k * s + 1, i, sh(b, 1.2)); }
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) for (const [dx, dy] of [[3, 3], [s - 4, 3], [3, s - 4], [s - 4, s - 4]]) { c.rect(i * s + dx, j * s + dy, 2, 2, rv); c.set(i * s + dx + 1, j * s + dy + 1, sh(rv, 0.5)); }
  },
  plate(c, base, hi) {
    const b = col(base), h = col(hi);
    c.fill(b); c.jitter(10);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const cx = Math.floor(x / 8) % 2 ? 0 : 4;
      const u = (x + (Math.floor(y / 8) % 2) * 4) % 8, v = y % 8;
      if (Math.abs(u - 4 + (v - 4)) < 1.2 || Math.abs(u - 4 - (v - 4)) < 1.2) c.set(x, y, cx >= 0 ? h : b);
    }
  },
  grate(c, base, hole) {
    c.fill(col(hole));
    const b = col(base);
    for (let i = 0; i < TS; i += 4) { c.rect(0, i, TS, 2, b); c.rect(i, 0, 2, TS, sh(b, 0.85)); c.rect(0, i, TS, 1, sh(b, 1.2)); }
    c.rect(0, 0, TS, 2, b); c.rect(0, 0, 2, TS, b);
  },
  planks(c, c1, c2) {
    const a = col(c1), b = col(c2);
    for (let r = 0; r < 4; r++) {
      const m = mix(a, b, c.rng()), y0 = r * 8;
      for (let y = 0; y < 8; y++) for (let x = 0; x < TS; x++) {
        const g = (c.vn(x * 3, y0 + y, 4) - 0.5) * 22;
        c.set(x, y0 + y, y === 7 ? sh(m, 0.55) : y === 0 ? sh(m, 1.1) : [m[0] + g, m[1] + g, m[2] + g]);
      }
      c.set((r * 11) % TS, y0 + 3, sh(m, 0.6)); c.set((r * 11 + 17) % TS, y0 + 4, sh(m, 0.6));
    }
  },
  logSide(c, bark, dark) {
    const b = col(bark), d = col(dark);
    for (let x = 0; x < TS; x++) { const v = c.vn(x, 0, 2); for (let y = 0; y < TS; y++) c.set(x, y, mix(d, b, 0.35 + v * 0.65 + (c.rng() - 0.5) * 0.2)); }
  },
  logTop(c, ring, bark) {
    const r = col(ring), b = col(bark);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const d = Math.max(Math.abs(x - 15.5), Math.abs(y - 15.5));
      c.set(x, y, d > 13.5 ? sh(b, 0.9 + c.rng() * 0.2) : sh(r, 0.85 + 0.2 * Math.sin(d * 1.6) + (c.rng() - 0.5) * 0.06));
    }
  },
  leaves(c, a, b, hole = 0.25) {
    const c1 = col(a), c2 = col(b);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const n = c.vn(x, y, 4) * 0.6 + c.rng() * 0.4;
      if (n < hole) c.set(x, y, c1, 0); else c.set(x, y, mix(c1, c2, c.vn(x + 3, y + 5, 2) + (c.rng() - 0.5) * 0.3));
    }
  },
  grassTop(c, a, b) { PAINTERS.noise(c, a, b, 0.7, 4); for (let i = 0; i < 40; i++) { const x = c.rng() * TS, y = c.rng() * TS; c.set(x, y, sh(c.get(x, y), 1.15)); } },
  grassSide(c, grass, dirt) {
    PAINTERS.dirt(c, dirt, sh(col(dirt), 0.7), 0.1);
    const g = col(grass);
    for (let x = 0; x < TS; x++) { const h = 5 + Math.floor(c.rng() * 5); for (let y = 0; y < h; y++) c.set(x, y, sh(g, 0.8 + c.rng() * 0.35)); }
  },
  dirt(c, base, dark, pebble = 0.08) {
    PAINTERS.noise(c, dark, base, 0.6, 4);
    for (let i = 0; i < pebble * 100; i++) { const x = c.rng() * TS, y = c.rng() * TS; c.set(x, y, sh(col(base), 1.25)); c.set(x + 1, y, sh(col(base), 0.75)); }
  },
  gravel(c, base, hi) {
    const b = col(base), h = col(hi);
    c.fill(sh(b, 0.7));
    for (let i = 0; i < 60; i++) {
      const x = c.rng() * TS, y = c.rng() * TS, w = 2 + Math.floor(c.rng() * 4), v = 0.75 + c.rng() * 0.5;
      c.rect(x, y, w, w - 1, sh(mix(b, h, c.rng() * 0.5), v)); c.set(x, y, sh(h, 1.1));
    }
  },
  ore(c, base, dark, fleck, glow = 0) {
    PAINTERS.stone(c, base, dark, sh(col(base), 1.2));
    const f = col(fleck);
    for (let k = 0; k < 6; k++) {
      const cx = 3 + c.rng() * 26, cy = 3 + c.rng() * 26, n = 3 + Math.floor(c.rng() * 4);
      for (let i = 0; i < n; i++) {
        const x = cx + (c.rng() - 0.5) * 5, y = cy + (c.rng() - 0.5) * 4;
        const v = glow ? 1.1 + c.rng() * 0.3 : 0.8 + c.rng() * 0.4;
        c.rect(x, y, 2, 2, sh(f, v)); c.set(x, y, sh(f, glow ? 1.5 : 1.3));
      }
    }
  },
  glass(c, tint, alpha = 70, frame = '#c9d6df') {
    const t = col(tint), f = col(frame);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) c.set(x, y, t, alpha);
    for (let i = 0; i < TS; i++) for (const k of [0, TS - 1]) { c.set(i, k, f, 220); c.set(k, i, f, 220); }
    for (let i = 0; i < TS; i++) { c.set(1 + i, 1, f, 200); c.set(1, 1 + i, f, 200); }
    for (let i = 5; i < 17; i++) { c.set(i, 26 - i + 2, [255, 255, 255], 150); c.set(i + 4, 26 - i + 2, [255, 255, 255], 90); }
  },
  facade(c, wall, glassC, cols = 3, rows = 3, lit = 0.2, litC = '#ffd890') {
    const w = col(wall), g = col(glassC), l = col(litC);
    PAINTERS.concrete(c, wall, sh(w, 0.8), 0);
    const cw = Math.floor(TS / cols), rh = Math.floor(TS / rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const on = c.rng() < lit, x = i * cw + 2, y = j * rh + 2, ww = cw - 3, hh = rh - 3;
      for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < ww; xx++) {
        const grad = 1 - yy / hh * 0.4;
        c.set(x + xx, y + yy, on ? sh(l, 0.75 + grad * 0.35) : sh(mix(g, [200, 225, 255], (1 - yy / hh) * 0.35), 0.8 + (xx + yy) % 5 * 0.02));
      }
      for (let xx = 0; xx < ww; xx++) c.set(x + xx, y + hh, sh(w, 1.3));
    }
  },
  curtain(c, frameC, glassC, n = 4, tintHi = '#9fd4ff') {
    const f = col(frameC), g = col(glassC), hi = col(tintHi), s = TS / n;
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) c.set(x, y, mix(g, hi, (1 - y / TS) * 0.5 * c.vn(x, y, 8) + 0.1), 255);
    for (let k = 0; k < n; k++) { c.rect(0, k * s, TS, 1, f); c.rect(k * s, 0, 1, TS, f); }
    for (let i = 0; i < 6; i++) c.line(2 + i * 5, 0, 12 + i * 5, 14, sh(hi, 1.2), true, 90);
  },
  asphalt(c, kind = 'plain', axis = 0) {
    PAINTERS.noise(c, '#2a2d33', '#3b3f46', 0.7, 4);
    const line = (cc: RGB, w: number, pos: number, dash = 0) => {
      for (let i = 0; i < TS; i++) { if (dash && Math.floor(i / 8) % 2) continue; for (let k = 0; k < w; k++) { axis ? c.set(pos + k, i, cc) : c.set(i, pos + k, cc); } }
    };
    if (kind === 'cracked') for (let i = 0; i < 4; i++) c.line(c.rng() * TS, c.rng() * TS, c.rng() * TS, c.rng() * TS, [14, 15, 18], true);
    if (kind === 'line') { line([226, 178, 36], 1, 14); line([226, 178, 36], 1, 17); }
    if (kind === 'dash') line([220, 222, 226], 2, 15, 1);
    if (kind === 'edge') line([220, 222, 226], 2, 3);
    if (kind === 'cross') for (let k = 0; k < 4; k++) { for (let i = 0; i < TS; i++) for (let w = 0; w < 4; w++) axis ? c.set(k * 8 + w, i, [214, 216, 220]) : c.set(i, k * 8 + w, [214, 216, 220]); }
    if (kind === 'stop') line([230, 230, 235], 3, 14);
    if (kind === 'worn') { c.jitter(30); }
    for (let i = 0; i < 20; i++) { const x = c.rng() * TS, y = c.rng() * TS; c.set(x, y, sh(c.get(x, y), 1.35)); }
  },
  pavers(c, base, grout) {
    const b = col(base);
    c.fill(col(grout));
    for (let r = 0; r < 4; r++) { const off = r % 2 ? 8 : 0; for (let k = -1; k < 3; k++) { const v = 0.88 + c.rng() * 0.24; c.rect(k * 16 + off + 1, r * 8 + 1, 15, 7, sh(b, v)); bev(c, k * 16 + off + 1, r * 8 + 1, 15, 7, sh(b, v), 0.1); } }
    c.jitter(10);
  },
  circuit(c, bg, trace, glow) {
    const b = col(bg), t = col(trace), g = col(glow);
    c.fill(b); c.jitter(10);
    for (let i = 0; i < 9; i++) {
      let x = Math.floor(c.rng() * 8) * 4, y = Math.floor(c.rng() * 8) * 4;
      const horiz = c.rng() < 0.5, len = 6 + Math.floor(c.rng() * 14);
      for (let k = 0; k < len; k++) { c.set(horiz ? x + k : x, horiz ? y : y + k, t); }
      c.rect(horiz ? x + len : x, horiz ? y : y + len, 2, 2, g);
    }
    for (let i = 0; i < 4; i++) { const x = c.rng() * 26, y = c.rng() * 26; c.rect(x, y, 5, 4, sh(b, 0.55)); c.rect(x + 1, y + 1, 3, 2, sh(t, 0.55)); }
  },
  screen(c, bg, fg, kind = 'text') {
    const b = col(bg), f = col(fg);
    c.fill([18, 20, 26]); c.rect(2, 2, 28, 28, b);
    for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) c.set(x, y, sh(b, 0.85 + 0.15 * ((y % 2) as number)));
    if (kind === 'text') for (let r = 0; r < 6; r++) c.rect(4, 4 + r * 4, 4 + Math.floor(c.rng() * 20), 2, sh(f, 0.7 + c.rng() * 0.4));
    if (kind === 'graph') { let y = 20; for (let x = 4; x < 28; x++) { y = Math.max(5, Math.min(27, y + Math.floor((c.rng() - 0.5) * 5))); c.set(x, y, f); c.set(x, y + 1, sh(f, 0.6)); } }
    if (kind === 'radar') { for (let a = 0; a < 64; a++) { const an = (a / 64) * Math.PI * 2; c.set(16 + Math.cos(an) * 11, 16 + Math.sin(an) * 11, sh(f, 0.6)); } c.line(16, 16, 25, 9, f); c.set(21, 20, f); c.set(11, 12, f); }
    if (kind === 'bars') for (let i = 0; i < 6; i++) { const h = 4 + Math.floor(c.rng() * 18); c.rect(5 + i * 4, 28 - h, 3, h, sh(f, 0.7 + c.rng() * 0.4)); }
    if (kind === 'map') for (let i = 0; i < 30; i++) c.set(4 + c.rng() * 24, 4 + c.rng() * 24, sh(f, 0.5 + c.rng() * 0.6));
    if (kind === 'alert') { c.rect(14, 6, 4, 14, f); c.rect(14, 23, 4, 4, f); }
    if (kind === 'off') c.rect(2, 2, 28, 28, [10, 12, 16]);
  },
  hazard(c, a, b, w = 4) { const c1 = col(a), c2 = col(b); for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) c.set(x, y, Math.floor((x + y) / w) % 2 ? c1 : c2); c.jitter(14); },
  vent(c, base, dark) { const b = col(base), d = col(dark); c.fill(sh(b, 0.9)); for (let y = 0; y < TS; y += 4) { c.rect(2, y + 2, 28, 2, d); c.rect(2, y, 28, 2, sh(b, 1.12)); } bev(c, 0, 0, TS, TS, b, 0.3); c.jitter(8); },
  pipe(c, base, band) {
    const b = col(base), bd = col(band);
    for (let y = 0; y < TS; y++) { const v = 0.55 + 0.7 * Math.sin((y / (TS - 1)) * Math.PI); for (let x = 0; x < TS; x++) c.set(x, y, sh(b, v)); }
    for (const x of [0, 1, 15, 16, 30, 31]) for (let y = 0; y < TS; y++) c.set(x, y, sh(bd, 0.5 + 0.6 * Math.sin((y / 31) * Math.PI)));
    c.jitter(8);
  },
  lamp(c, core, rim, n = 1) {
    const k = col(core), r = col(rim), s = TS / n;
    c.fill(r);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) for (let y = 2; y < s - 2; y++) for (let x = 2; x < s - 2; x++) {
      const d = Math.hypot(x - s / 2, y - s / 2) / (s / 2);
      c.set(i * s + x, j * s + y, sh(k, 1.15 - d * 0.35));
    }
  },
  fabric(c, a, b) { const c1 = col(a), c2 = col(b); for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) c.set(x, y, mix(c1, c2, (x + y) % 2 ? 0.3 : 0.7 + (c.rng() - 0.5) * 0.2)); c.jitter(10); },
  sand(c, a, b) { PAINTERS.noise(c, a, b, 0.5, 8); for (let y = 0; y < TS; y += 5) for (let x = 0; x < TS; x++) c.set(x, y + Math.round(Math.sin(x / 3) * 1.2), sh(c.get(x, y), 0.93)); },
  snow(c, a) { const b = col(a); for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const v = c.vn(x, y, 4); c.set(x, y, [b[0] - (1 - v) * 14, b[1] - (1 - v) * 9, b[2] - (1 - v) * 3 + c.rng() * 3]); } },
  ice(c, a, b) { PAINTERS.noise(c, a, b, 0.25, 8); for (let i = 0; i < 3; i++) c.line(c.rng() * TS, 0, c.rng() * TS, TS, [235, 250, 255], true, 160); },
  water(c, a, b) { PAINTERS.noise(c, a, b, 0.2, 8); for (let i = 0; i < 20; i++) { const x = c.rng() * TS, y = c.rng() * TS; c.rect(x, y, 3, 1, sh(c.get(x, y), 1.35)); } },
  crystal(c, a, b) {
    const c1 = col(a), c2 = col(b);
    const pts = Array.from({ length: 7 }, () => [c.rng() * TS, c.rng() * TS, c.rng()]);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let best = 1e9, bi = 0, second = 1e9;
      pts.forEach((p, i) => { const d = Math.min((x - p[0]) ** 2, (x - p[0] + TS) ** 2, (x - p[0] - TS) ** 2) + Math.min((y - p[1]) ** 2, (y - p[1] + TS) ** 2, (y - p[1] - TS) ** 2); if (d < best) { second = best; best = d; bi = i; } else if (d < second) second = d; });
      const edge = Math.sqrt(second) - Math.sqrt(best);
      c.set(x, y, edge < 1.2 ? sh(c2, 1.3) : sh(mix(c1, c2, pts[bi][2]), 0.8 + pts[bi][2] * 0.4));
    }
  },
  door(c, base, glassC = '', handle = '#cfd5da') {
    const b = col(base);
    c.fill(sh(b, 0.9)); c.jitter(10);
    bev(c, 0, 0, TS, TS, b, 0.3);
    if (glassC) { for (let y = 4; y < 16; y++) for (let x = 6; x < 26; x++) c.set(x, y, mix(col(glassC), [255, 255, 255], (26 - x) / 60), 255); bev(c, 6, 4, 20, 12, b, 0.4); }
    else { bev(c, 5, 4, 22, 11, b, 0.35); }
    bev(c, 5, 19, 22, 10, b, 0.35);
    c.rect(24, 17, 3, 2, col(handle));
  },
  shelf(c, frame, _a?: any) {
    const f = col(frame);
    c.fill(sh(f, 0.4));
    for (let r = 0; r < 3; r++) {
      c.rect(0, r * 11 + 9, TS, 2, f);
      let x = 2;
      while (x < 28) { const w = 2 + Math.floor(c.rng() * 4), h = 4 + Math.floor(c.rng() * 4); c.rect(x, r * 11 + 9 - h, w, h, [60 + c.rng() * 160, 60 + c.rng() * 160, 60 + c.rng() * 160]); x += w + 1; }
    }
    c.rect(0, 0, 2, TS, f); c.rect(30, 0, 2, TS, f);
  },
  crate(c, base, band) {
    const b = col(base), bd = col(band);
    PAINTERS.planks(c, base, sh(b, 0.8));
    c.rect(0, 0, TS, 3, bd); c.rect(0, 29, TS, 3, bd); c.rect(0, 0, 3, TS, bd); c.rect(29, 0, 3, TS, bd);
    for (let i = 3; i < 29; i++) { c.set(i, i, bd); c.set(i + 1, i, bd); c.set(31 - i, i, bd); c.set(30 - i, i, bd); }
    c.jitter(10);
  },
  stripes(c, a, b, w = 4, vert = 0) { const c1 = col(a), c2 = col(b); for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) c.set(x, y, Math.floor((vert ? x : y) / w) % 2 ? c1 : c2); c.jitter(10); },
  mesh(c, base) { const b = col(base); for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const on = (x + y) % 8 < 2 || (x - y + 64) % 8 < 2; c.set(x, y, sh(b, 0.8 + (c.rng() * 0.3)), on ? 255 : 0); } },
  rust(c, base, rustC) { PAINTERS.noise(c, base, base, 0.5, 8); const r = col(rustC); for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const n = c.vn(x, y, 8) * 0.7 + c.vn(x, y, 4) * 0.3; if (n > 0.52) c.set(x, y, sh(mix(c.get(x, y), r, Math.min(1, (n - 0.5) * 3)), 0.9 + c.rng() * 0.2)); } },
  plant(c, kind, a, b, d = '#ffffff') {
    const c1 = col(a), c2 = col(b), c3 = col(d);
    c.fill([0, 0, 0], 0);
    const blade = (x: number, h: number, lean: number, cc: RGB) => { for (let y = 0; y < h; y++) c.px(x + Math.round(lean * (y / h)), 31 - y, sh(cc, 0.7 + (y / h) * 0.5)); };
    if (kind === 'tuft') for (let i = 0; i < 9; i++) blade(4 + i * 3, 8 + Math.floor(c.rng() * 12), (c.rng() - 0.5) * 6, c.rng() < 0.5 ? c1 : c2);
    if (kind === 'tall') for (let i = 0; i < 8; i++) blade(3 + i * 3, 18 + Math.floor(c.rng() * 12), (c.rng() - 0.5) * 5, c.rng() < 0.5 ? c1 : c2);
    if (kind === 'flower') { blade(15, 16, 1, c1); blade(16, 16, 1, c1); c.disc(16, 12, 4, c2); c.disc(16, 12, 1.5, c3); blade(10, 8, -2, c1); blade(22, 7, 2, c1); }
    if (kind === 'fern') for (let k = -1; k <= 1; k += 2) for (let i = 0; i < 14; i++) { c.px(16 + k * i * 0.9, 31 - i * 1.6 + Math.abs(k * i) * 0.3, sh(c1, 0.7 + i / 20)); c.px(16 + k * i * 0.9, 32 - i * 1.6 + Math.abs(k * i) * 0.3 - 3, sh(c2, 0.8)); }
    if (kind === 'mushroom') { c.rect(14, 22, 4, 9, c3); c.disc(16, 20, 7, c1); c.rect(8, 21, 16, 3, c1); for (const [x, y] of [[12, 17], [18, 16], [16, 19]]) c.px(x, y, c2); }
    if (kind === 'cactus') { c.rect(12, 6, 8, 25, c1); c.rect(6, 14, 6, 4, c1); c.rect(6, 8, 4, 8, c1); c.rect(20, 18, 6, 4, c1); c.rect(22, 11, 4, 9, c1); for (let i = 0; i < 18; i++) c.px(12 + c.rng() * 8, 6 + c.rng() * 24, c2); c.rect(15, 4, 2, 2, c3); }
    if (kind === 'reed') for (let i = 0; i < 5; i++) { blade(5 + i * 5, 22 + Math.floor(c.rng() * 8), (c.rng() - 0.5) * 3, c1); c.rect(5 + i * 5 - 1, 3 + Math.floor(c.rng() * 4), 2, 5, c2); }
    if (kind === 'sapling') { c.rect(15, 18, 2, 13, c3); c.disc(16, 12, 7, c1); c.disc(12, 15, 4, c2); c.disc(21, 14, 4, c2); }
    if (kind === 'bush') { c.disc(16, 22, 9, c1); c.disc(10, 24, 6, c2); c.disc(22, 24, 6, c2); for (let i = 0; i < 6; i++) c.px(8 + c.rng() * 16, 17 + c.rng() * 12, c3); }
    if (kind === 'vine') for (let i = 0; i < 6; i++) { let x = 3 + i * 5; for (let y = 0; y < 14 + c.rng() * 16; y++) { x += Math.round((c.rng() - 0.5) * 1.4); c.px(x, y, sh(c1, 0.7 + c.rng() * 0.5)); if (c.rng() < 0.15) c.px(x + 1, y, c2); } }
    if (kind === 'crop') for (let i = 0; i < 5; i++) { blade(4 + i * 6, 22, 0, c1); c.disc(5 + i * 6, 14 + (i % 2) * 3, 2.2, c2); }
    if (kind === 'grassblock') { c.fill(c1); }
  },
  neon(c, a, bgc = '#0c0f16') {
    const n = col(a);
    c.fill(col(bgc)); c.jitter(8);
    for (const y of [6, 15, 24]) for (let x = 0; x < TS; x++) for (let k = -2; k <= 2; k++) c.set(x, y + k, mix(col(bgc), n, k === 0 ? 1 : Math.max(0, 0.5 - Math.abs(k) * 0.22)));
    for (const x of [4, 28]) for (let y = 4; y < 27; y++) c.set(x, y, sh(n, 0.85));
  },
  carbon(c, a, b) { const c1 = col(a), c2 = col(b); for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const t = ((x >> 1) + (y >> 1)) % 2; const s = ((x + (t ? y : -y)) % 4 + 4) % 4; c.set(x, y, mix(c1, c2, t ? 0.3 + s * 0.15 : 0.7 - s * 0.12)); } },
  honey(c, a, line) {
    const b = col(a), l = col(line);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      const cx = (x % 8) - 3.5 + ((Math.floor(y / 6) % 2) ? -4 : 0), cy = (y % 6) - 2.5;
      const d = Math.abs(cx) * 0.8 + Math.abs(cy) * 0.9;
      c.set(x, y, d > 3.7 ? l : sh(b, 1.05 - d * 0.07));
    }
  },
  wires(c, bg, a, b) { c.fill(col(bg)); c.jitter(12); const cs = [col(a), col(b), [220, 190, 40] as RGB, [60, 120, 220] as RGB]; for (let i = 0; i < 8; i++) { const cc = cs[i % 4]; for (let x = 0; x < TS; x++) { c.set(x, i * 4 + 1, sh(cc, 1.15)); c.set(x, i * 4 + 2, cc); c.set(x, i * 4 + 3, sh(cc, 0.6)); } } },
  sign(c, bg, fg, kind = 'arrow') {
    c.fill(col(bg)); bev(c, 0, 0, TS, TS, col(bg), 0.35); const f = col(fg);
    c.rect(2, 2, 28, 1, f); c.rect(2, 29, 28, 1, f); c.rect(2, 2, 1, 28, f); c.rect(29, 2, 1, 28, f);
    if (kind === 'arrow') { c.rect(6, 14, 16, 4, f); for (let i = 0; i < 8; i++) c.rect(22 + i / 2, 16 - i, 1, 2 * i + 1, f); }
    if (kind === 'warn') { for (let i = 0; i < 18; i++) c.rect(16 - i / 2, 6 + i, i + 1, 1, f); c.rect(15, 12, 2, 7, col(bg)); c.rect(15, 21, 2, 2, col(bg)); }
    if (kind === 'text') for (let r = 0; r < 4; r++) c.rect(6, 7 + r * 6, 8 + Math.floor(c.rng() * 16), 3, f);
    if (kind === 'atom') { c.disc(16, 16, 3, f); for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; c.px(16 + Math.cos(t) * 11, 16 + Math.sin(t) * 5, f); c.px(16 + Math.cos(t + 2) * 5 + Math.sin(t) * 0, 16 + Math.sin(t) * 11 * Math.cos(1), f); } }
    if (kind === 'cross') { c.rect(13, 6, 6, 20, f); c.rect(6, 13, 20, 6, f); }
    if (kind === 'bolt') { c.line(18, 5, 11, 17, f); c.line(19, 5, 12, 17, f); c.line(11, 17, 21, 17, f); c.line(21, 17, 13, 28, f); c.line(22, 17, 14, 28, f); }
  },
  led(c, a, b) { const c1 = col(a), c2 = col(b); c.fill([16, 18, 22]); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) c.rect(x * 4 + 1, y * 4 + 1, 3, 3, c.rng() < 0.5 ? c1 : c2); },
  energy(c, a, b) { const c1 = col(a), c2 = col(b); for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) { const t = Math.sin(c.vn(x, y, 8) * 9) * 0.5 + 0.5; c.set(x, y, mix(c1, c2, t * (0.6 + c.vn(x, y, 4) * 0.5))); } },
  server(c, frame, ledA) {
    const f = col(frame), l = col(ledA);
    c.fill(sh(f, 0.5));
    for (let r = 0; r < 6; r++) {
      c.rect(1, r * 5 + 1, 30, 4, sh(f, 1 + (r % 2) * 0.1)); c.rect(2, r * 5 + 3, 14, 1, [10, 11, 14]);
      for (let k = 0; k < 4; k++) c.rect(19 + k * 3, r * 5 + 2, 2, 2, c.rng() < 0.7 ? l : [190, 60, 50]);
    }
  },
  solar(c, cell, frame) {
    const a = col(cell), f = col(frame);
    c.fill(f);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { c.rect(i * 8 + 1, j * 8 + 1, 7, 7, sh(a, 0.85 + ((i + j) % 2) * 0.12)); c.rect(i * 8 + 1, j * 8 + 1, 7, 1, sh(a, 1.4)); c.rect(i * 8 + 4, j * 8 + 1, 1, 7, sh(a, 1.35)); }
  },
  conveyor(c, belt, arrow) {
    const b = col(belt), a = col(arrow);
    c.fill(sh(b, 0.75)); c.jitter(10); c.rect(0, 0, TS, 3, [60, 66, 74]); c.rect(0, 29, TS, 3, [60, 66, 74]);
    for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) { c.set(k * 8 + 4 - i / 2 + 2, 8 + i, a); c.set(k * 8 + 4 - i / 2 + 2, 23 - i, a); }
  },
  rail(c) {
    c.fill([70, 62, 56]); c.jitter(24);
    for (let i = 0; i < 4; i++) c.rect(0, i * 8 + 2, TS, 3, [86, 62, 40]);
    c.rect(6, 0, 3, TS, [150, 156, 164]); c.rect(23, 0, 3, TS, [150, 156, 164]); c.rect(6, 0, 1, TS, [210, 216, 224]); c.rect(23, 0, 1, TS, [210, 216, 224]);
  },
  runes(c, base, glow) {
    PAINTERS.stone(c, base, sh(col(base), 0.6), sh(col(base), 1.4));
    const g = col(glow);
    for (let k = 0; k < 3; k++) { const x = 4 + k * 9, y = 5 + (k % 2) * 8; c.line(x, y, x + 5, y, g); c.line(x + 2, y, x + 2, y + 9, g); c.line(x, y + 9, x + 5, y + 4, g); c.px(x + 5, y + 13, g); }
  },
  battery(c, body, band) { const b = col(body), bd = col(band); c.fill(sh(b, 0.8)); for (let x = 0; x < TS; x++) for (let y = 0; y < TS; y++) c.set(x, y, sh(b, 0.65 + 0.5 * Math.sin((x / 31) * Math.PI))); c.rect(0, 8, TS, 3, bd); c.rect(0, 21, TS, 3, bd); for (let y = 12; y < 21; y++) c.rect(4, y, 24, 1, sh(bd, 0.4 + (y - 12) * 0.07)); },
  noiseBars(c, a, b) { const c1 = col(a), c2 = col(b); for (let x = 0; x < TS; x++) { const v = c.rng(); for (let y = 0; y < TS; y++) c.set(x, y, mix(c1, c2, v * 0.6 + c.vn(x, y, 8) * 0.4)); } },
  // ---------------------------------------------------------------- icons
  i_ingot(c, a, b) { const c1 = col(a), c2 = col(b); for (let k = 0; k < 9; k++) c.prect(6 + k, 20 - k * 1, 16, 8, k < 8 ? c2 : c1); c.prect(6, 12, 16, 8, c1); c.prect(22, 8, 4, 12, sh(c2, 0.8)); c.prect(8, 14, 12, 2, sh(c1, 1.25)); c.prect(10, 11, 12, 1, sh(c1, 1.1)); c.outline(); },
  i_chunk(c, a, b) { const c1 = col(a), c2 = col(b); for (let y = 8; y < 26; y++) for (let x = 5; x < 27; x++) { const d = Math.hypot((x - 16) * 0.9, (y - 17) * 1.15) + Math.sin(x * 1.7 + y) * 1.4; if (d < 9.5) c.px(x, y, mix(c1, c2, (y - 8) / 18 + c.rng() * 0.2)); } for (let i = 0; i < 6; i++) c.px(10 + c.rng() * 12, 10 + c.rng() * 12, sh(c1, 1.3)); c.outline(); },
  i_wire(c, a, b) { const c1 = col(a), c2 = col(b); for (let k = 0; k < 5; k++) c.disc(16, 16, 11 - k * 2, k % 2 ? c2 : c1); c.disc(16, 16, 3, [20, 22, 28]); c.outline(); },
  i_gear(c, a) { const g = col(a); for (let t = 0; t < 8; t++) { const an = (t / 8) * Math.PI * 2; c.disc(16 + Math.cos(an) * 11, 16 + Math.sin(an) * 11, 3, g); } c.disc(16, 16, 10, g); c.disc(16, 16, 4, [20, 22, 28]); c.disc(14, 13, 3, sh(g, 1.2), 90); c.outline(); },
  i_chip(c, a, glow) { const b = col(a), g = col(glow); for (let i = 0; i < 6; i++) { c.prect(4, 8 + i * 3, 3, 2, [200, 190, 150]); c.prect(25, 8 + i * 3, 3, 2, [200, 190, 150]); } c.prect(7, 6, 18, 20, b); c.prect(10, 9, 12, 14, sh(b, 0.6)); c.prect(13, 12, 6, 8, g); c.prect(8, 7, 16, 1, sh(b, 1.4)); c.outline(); },
  i_cell(c, a, glow) { const b = col(a), g = col(glow); c.prect(12, 3, 8, 3, [190, 196, 204]); c.prect(9, 6, 14, 22, b); c.prect(11, 9, 10, 16, sh(b, 0.5)); for (let i = 0; i < 4; i++) c.prect(12, 22 - i * 4, 8, 3, sh(g, 0.8 + i * 0.1)); c.prect(10, 7, 2, 20, sh(b, 1.3)); c.outline(); },
  i_core(c, a, glow) { const b = col(a), g = col(glow); c.disc(16, 16, 12, b); c.disc(16, 16, 8, sh(b, 0.45)); c.disc(16, 16, 5, g); c.disc(15, 15, 2, sh(g, 1.5)); for (let i = 0; i < 32; i++) { const an = (i / 32) * Math.PI * 2; c.px(16 + Math.cos(an) * 12, 16 + Math.sin(an) * 4, sh(b, 1.4)); } c.outline(); },
  i_plate(c, a, b) { const c1 = col(a), c2 = col(b); c.prect(4, 9, 24, 15, c2); c.prect(4, 9, 24, 12, c1); c.prect(7, 12, 18, 2, sh(c1, 1.3)); for (const [x, y] of [[6, 11], [24, 11], [6, 19], [24, 19]]) c.prect(x, y, 2, 2, sh(c1, 0.6)); c.outline(); },
  i_tool(c, a, glow, kind = 'cutter') {
    const h = col(a), g = col(glow);
    c.line(8, 26, 20, 14, [60, 52, 48]); c.line(9, 26, 21, 14, [86, 76, 70]); c.line(7, 26, 19, 14, [40, 36, 34]);
    c.line(8, 25, 20, 13, [60, 52, 48]);
    if (kind === 'cutter') { c.prect(18, 4, 4, 14, h); c.prect(22, 4, 4, 10, sh(h, 0.75)); c.prect(18, 3, 8, 2, g); c.prect(19, 6, 2, 8, g); }
    if (kind === 'drill') { for (let i = 0; i < 12; i++) c.prect(18 + i * 0.5, 14 - i, 6 - i * 0.3, 2, i % 2 ? h : sh(h, 0.7)); c.prect(22, 3, 3, 3, g); c.prect(16, 14, 8, 4, [90, 96, 104]); }
    if (kind === 'excav') { c.prect(14, 5, 14, 5, h); c.prect(14, 5, 14, 2, sh(h, 1.3)); c.prect(17, 10, 8, 6, sh(h, 0.8)); c.prect(19, 12, 4, 6, g); for (let i = 0; i < 4; i++) c.prect(15 + i * 4, 3, 2, 3, g); }
    if (kind === 'disrupt') { c.disc(22, 9, 7, h); c.disc(22, 9, 4, [10, 12, 18]); c.disc(22, 9, 2, g); for (let i = 0; i < 8; i++) { const an = (i / 8) * 6.28; c.px(22 + Math.cos(an) * 9, 9 + Math.sin(an) * 9, g); } }
    if (kind === 'baton') { c.prect(18, 3, 4, 14, g); c.prect(19, 3, 2, 14, [255, 255, 255]); c.prect(16, 17, 8, 3, h); }
    if (kind === 'spade') { c.prect(18, 3, 8, 12, h); c.prect(19, 14, 6, 3, sh(h, 0.8)); c.prect(20, 4, 2, 9, sh(h, 1.3)); c.prect(21, 7, 2, 4, g); }
    c.outline();
  },
  i_gun(c, a, glow, kind = 'emitter') {
    const b = col(a), g = col(glow);
    if (kind === 'emitter') { c.prect(4, 12, 20, 7, b); c.prect(22, 13, 6, 5, sh(b, 0.7)); c.prect(26, 14, 3, 3, g); c.prect(8, 19, 5, 8, sh(b, 0.8)); c.prect(6, 10, 10, 2, sh(b, 1.2)); c.prect(10, 14, 8, 2, g); }
    if (kind === 'scatter') { c.prect(3, 11, 18, 9, b); for (let i = 0; i < 3; i++) c.prect(21, 11 + i * 3, 7, 2, i % 2 ? g : sh(b, 0.7)); c.prect(7, 20, 5, 7, sh(b, 0.8)); c.prect(6, 9, 12, 2, sh(b, 1.3)); }
    if (kind === 'rail') { c.prect(2, 13, 26, 5, b); c.prect(2, 11, 26, 2, g); c.prect(2, 18, 26, 2, g); c.prect(24, 11, 5, 9, sh(b, 0.7)); c.prect(6, 18, 4, 8, sh(b, 0.8)); c.prect(12, 15, 8, 1, [255, 255, 255]); }
    c.outline();
  },
  i_gadget(c, kind, a, glow) {
    const b = col(a), g = col(glow);
    if (kind === 'scanner') { c.prect(8, 4, 16, 24, b); c.prect(10, 6, 12, 12, [12, 20, 22]); for (let i = 0; i < 3; i++) c.prect(11 + i * 4, 15 - i * 3, 2, 2 + i * 3, g); c.prect(10, 20, 5, 3, g); c.prect(17, 20, 5, 3, sh(b, 1.3)); c.prect(14, 1, 4, 3, sh(b, 0.7)); }
    if (kind === 'hook') { c.prect(6, 14, 14, 8, b); c.prect(20, 10, 5, 16, sh(b, 0.7)); c.prect(24, 8, 4, 5, g); c.prect(24, 23, 4, 5, g); c.line(6, 20, 2, 28, g); c.line(7, 20, 3, 28, g); }
    if (kind === 'shield') { for (let y = 3; y < 29; y++) { const w = y < 14 ? 11 : 11 - (y - 14) * 0.75; for (let x = 16 - w; x < 16 + w; x++) c.px(x, y, mix(b, g, y < 14 ? 0.2 : 0.4)); } c.disc(16, 13, 5, g); c.disc(16, 13, 2, [255, 255, 255]); }
    if (kind === 'drone') { c.prect(12, 12, 8, 8, b); c.prect(14, 14, 4, 4, g); for (const [x, y] of [[3, 5], [21, 5], [3, 22], [21, 22]]) { c.prect(x, y, 8, 2, [190, 200, 210]); c.line(x + 4, y + 1, 16, 16, sh(b, 0.8)); } }
    if (kind === 'pack') { c.prect(7, 5, 18, 22, b); c.prect(9, 8, 14, 7, sh(b, 0.7)); c.prect(10, 22, 5, 7, g); c.prect(17, 22, 5, 7, g); c.prect(5, 8, 3, 14, sh(b, 0.6)); c.prect(24, 8, 3, 14, sh(b, 0.6)); c.prect(12, 10, 8, 3, g); }
    if (kind === 'repair') { c.line(8, 25, 22, 8, [160, 168, 176]); c.line(9, 25, 23, 8, [200, 208, 216]); c.disc(23, 8, 5, b); c.disc(23, 8, 2, [12, 14, 18]); c.prect(5, 22, 7, 7, g); c.prect(6, 23, 5, 2, [255, 255, 255]); }
    if (kind === 'builder') { c.prect(5, 10, 16, 16, b, 255); c.prect(9, 6, 16, 16, g, 140); c.prect(5, 10, 16, 2, sh(b, 1.4)); c.prect(21, 6, 4, 2, g); c.prect(5, 24, 16, 2, sh(b, 0.6)); c.prect(10, 15, 6, 6, sh(b, 0.5)); }
    if (kind === 'terra') { for (let x = 3; x < 29; x++) { const y = 17 + Math.sin(x / 3) * 4; c.prect(x, y, 1, 28 - y, mix(b, g, 0.5)); c.px(x, y, g); } c.disc(16, 8, 4, b); c.disc(16, 8, 2, g); }
    if (kind === 'beacon') { c.prect(13, 4, 6, 18, b); c.prect(9, 22, 14, 5, sh(b, 0.7)); c.disc(16, 7, 5, g); c.disc(15, 6, 2, [255, 255, 255]); }
    c.outline();
  },
  i_food(c, kind, a, b) {
    const c1 = col(a), c2 = col(b);
    if (kind === 'bar') { c.prect(6, 11, 20, 11, c2); c.prect(8, 13, 16, 7, c1); c.prect(12, 14, 8, 5, sh(c2, 1.3)); }
    if (kind === 'can') { c.prect(9, 7, 14, 20, [186, 192, 200]); c.prect(9, 11, 14, 12, c1); c.prect(12, 14, 8, 5, c2); c.prect(9, 7, 14, 2, [220, 226, 232]); }
    if (kind === 'fruit') { c.disc(16, 18, 9, c1); c.disc(13, 15, 3, sh(c1, 1.35)); c.prect(15, 5, 2, 5, [90, 60, 36]); c.prect(17, 6, 5, 3, c2); }
    if (kind === 'tube') { c.prect(7, 12, 18, 8, c1); c.prect(4, 13, 3, 6, [150, 156, 164]); c.prect(24, 11, 4, 10, c2); c.prect(10, 14, 10, 2, sh(c1, 1.4)); }
    if (kind === 'meal') { c.disc(16, 18, 11, [220, 224, 230]); c.disc(16, 18, 8, c1); c.disc(13, 16, 3, c2); c.disc(19, 20, 2, sh(c2, 0.8)); }
    c.outline();
  },
  i_log(c, a, glow) { const b = col(a), g = col(glow); c.prect(7, 4, 18, 24, b); c.prect(9, 6, 14, 16, [10, 16, 18]); for (let i = 0; i < 4; i++) c.prect(10, 8 + i * 3, 4 + (i * 5) % 9, 1, g); c.prect(14, 24, 4, 2, g); c.outline(); },
  i_vial(c, a) { const b = col(a); c.prect(13, 3, 6, 4, [150, 156, 164]); c.prect(14, 7, 4, 4, [200, 220, 230]); c.prect(9, 11, 14, 16, [200, 220, 230], 220); c.prect(10, 16, 12, 10, b); c.prect(11, 12, 2, 12, [255, 255, 255], 140); c.outline(); },
  i_scrap(c, a, b) { const c1 = col(a), c2 = col(b); c.line(5, 22, 15, 6, c1); c.line(6, 22, 16, 6, c1); c.line(7, 22, 17, 6, c2); c.prect(14, 18, 12, 6, c2); c.prect(8, 22, 8, 4, c1); c.prect(20, 8, 5, 8, sh(c2, 0.8)); c.prect(16, 14, 6, 2, c1); c.outline(); },
  i_lens(c, a, glow) { const b = col(a), g = col(glow); c.disc(16, 16, 11, b); c.disc(16, 16, 8, [14, 20, 28]); c.disc(16, 16, 5, g); c.disc(14, 14, 2, [255, 255, 255]); c.outline(); },
  i_sheet(c, a, b) { const c1 = col(a), c2 = col(b); for (let k = 0; k < 3; k++) c.prect(5 + k * 2, 10 - k * 2 + 6, 20, 12, k ? c2 : c1); c.prect(5, 16, 20, 12, c1); c.prect(7, 18, 16, 2, sh(c1, 1.3)); c.outline(); },
  i_armor(c, a, glow) { const b = col(a), g = col(glow); for (let y = 4; y < 28; y++) { const w = y < 10 ? 12 - (10 - y) * 0.5 : 12 - Math.max(0, y - 20) * 0.9; c.prect(16 - w, y, w * 2, 1, y < 10 ? sh(b, 1.1) : b); } c.prect(13, 4, 6, 4, [10, 12, 16]); c.prect(14, 13, 4, 8, g); c.prect(8, 9, 3, 12, sh(b, 0.7)); c.prect(21, 9, 3, 12, sh(b, 0.7)); c.outline(); },
};

export const P: Record<string, (...a: any[]) => TexSpec> = new Proxy({} as any, {
  get: (_t, name: string) => (...a: any[]): TexSpec => ({ p: name, a }),
});
export const PAINTER_NAMES = Object.keys(PAINTERS);

export function paintTexture(spec: TexSpec): Uint8ClampedArray {
  if (spec.p === 'raw') return spec.a[0] as Uint8ClampedArray;
  const fn = PAINTERS[spec.p];
  const c = new Cv(strHash(JSON.stringify(spec)));
  if (!fn) { // missing texture: magenta checker
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) c.set(x, y, (x >> 3) % 2 ^ (y >> 3) % 2 ? [255, 0, 220] : [20, 20, 24]);
    return c.d;
  }
  fn(c, ...spec.a);
  return c.d;
}

export interface MipData { size: number; data: Uint8Array }
/** Build mip chain for `layers` textures (alpha-weighted box filter). */
export function buildMips(layers: Uint8ClampedArray[]): MipData[] {
  const out: MipData[] = [];
  let curSize = TS;
  let cur = new Uint8Array(layers.length * TS * TS * 4);
  layers.forEach((l, i) => cur.set(l, i * TS * TS * 4));
  out.push({ size: TS, data: cur });
  while (curSize > 1) {
    const ns = curSize >> 1;
    const next = new Uint8Array(layers.length * ns * ns * 4);
    for (let L = 0; L < layers.length; L++) {
      for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) {
        let r = 0, g = 0, b = 0, a = 0, wsum = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const i = (L * curSize * curSize + (y * 2 + dy) * curSize + x * 2 + dx) * 4;
          const w = cur[i + 3] + 1;
          r += cur[i] * w; g += cur[i + 1] * w; b += cur[i + 2] * w; a += cur[i + 3]; wsum += w;
        }
        const o = (L * ns * ns + y * ns + x) * 4;
        next[o] = r / wsum; next[o + 1] = g / wsum; next[o + 2] = b / wsum; next[o + 3] = a / 4;
      }
    }
    out.push({ size: ns, data: next });
    cur = next; curSize = ns;
  }
  return out;
}
