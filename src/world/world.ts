import { OPAQ, EMIT, EMON, SOLID, FULL, LIQ, ID, Reg, blockBoxes, pickBoxes, Box, S_ON, S_POWER, Block } from '../engine/registry';

export const CS = 16;
export const CH = 128;
export const SEA = 40;
export const CVOL = CS * CS * CH;

export class Chunk {
  blocks = new Uint16Array(CVOL);
  state = new Uint8Array(CVOL);
  light = new Uint8Array(CVOL);
  hm = new Uint8Array(CS * CS);       // highest non-air y (+1)
  sh = new Int16Array(CS * CS);       // highest light-blocking y (-1 none)
  status = 0;                         // 0 empty, 1 generated, 2 lit
  dirty = true;
  modified = false;
  version = 0;
  meshLod = -1;
  meshVersion = -1;
  meshing = false;
  constructor(public cx: number, public cz: number) {}
}

export const ckey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
export const emitOf = (id: number, st: number) => (EMON[id] && st & (S_ON | S_POWER) ? EMON[id] : EMIT[id]);

export interface Gen { generate(c: Chunk): void }

export class World {
  chunks = new Map<number, Chunk>();
  tiles = new Map<string, any>();
  editLog = new Set<number>();
  private cache: Chunk | undefined;
  constructor(public seed: number, public gen: Gen) {}

  getChunk(cx: number, cz: number): Chunk | undefined {
    const c = this.cache;
    if (c && c.cx === cx && c.cz === cz) return c;
    const r = this.chunks.get(ckey(cx, cz));
    if (r) this.cache = r;
    return r;
  }
  isLoaded(x: number, z: number) { const c = this.chunks.get(ckey(x >> 4, z >> 4)); return !!c && c.status >= 1; }
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return ID.bedrock;
    if (y >= CH) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0;
  }
  getState(x: number, y: number, z: number): number {
    if (y < 0 || y >= CH) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.state[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0;
  }
  getLight(x: number, y: number, z: number): number {
    if (y >= CH) return 0xf0;
    if (y < 0) return 0;
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.light[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0xf0;
  }
  topY(x: number, z: number): number {
    const c = this.getChunk(x >> 4, z >> 4);
    return c ? c.hm[((z & 15) << 4) | (x & 15)] : 0;
  }

  /** Set a block; handles heightmap, lighting, dirty flags. */
  setBlock(x: number, y: number, z: number, id: number, state = 0, user = false): boolean {
    if (y < 0 || y >= CH) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c || c.status < 1) return false;
    const lx = x & 15, lz = z & 15, i = (y << 8) | (lz << 4) | lx;
    const old = c.blocks[i];
    if (old === id && c.state[i] === state) return false;
    c.blocks[i] = id; c.state[i] = state;
    // heightmaps
    const col = (lz << 4) | lx;
    if (id !== 0 && y >= c.hm[col]) c.hm[col] = y + 1;
    else if (id === 0 && y === c.hm[col] - 1) { let t = y; while (t > 0 && c.blocks[(t << 8) | col] === 0) t--; c.hm[col] = t + 1; }
    if (OPAQ[id] >= 15 && y > c.sh[col]) c.sh[col] = y;
    else if (OPAQ[id] < 15 && y === c.sh[col]) { let t = y - 1; while (t >= 0 && OPAQ[c.blocks[(t << 8) | col]] < 15) t--; c.sh[col] = t; }
    if (user) { c.modified = true; }
    this.touch(c, lx, lz);
    if (c.status >= 2) this.updateLightAt(x, y, z);
    return true;
  }
  touch(c: Chunk, lx: number, lz: number) {
    c.dirty = true; c.version++;
    const mark = (cx: number, cz: number) => { const n = this.getChunk(cx, cz); if (n) { n.dirty = true; n.version++; } };
    if (lx === 0) mark(c.cx - 1, c.cz); if (lx === 15) mark(c.cx + 1, c.cz);
    if (lz === 0) mark(c.cx, c.cz - 1); if (lz === 15) mark(c.cx, c.cz + 1);
    if (lx === 0 && lz === 0) mark(c.cx - 1, c.cz - 1); if (lx === 15 && lz === 15) mark(c.cx + 1, c.cz + 1);
    if (lx === 0 && lz === 15) mark(c.cx - 1, c.cz + 1); if (lx === 15 && lz === 0) mark(c.cx + 1, c.cz - 1);
  }

  // ------------------------------------------------------------------ lighting
  /** Compute initial light for a freshly generated chunk. */
  initLight(c: Chunk) {
    const { blocks, light } = c;
    light.fill(0);
    c.hm.fill(0); c.sh.fill(-1);
    const sq: number[] = [], bq: number[] = [];
    const x0 = c.cx << 4, z0 = c.cz << 4;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = (z << 4) | x;
      let s = 15, blocked = false, hm = 0, sh = -1;
      for (let y = CH - 1; y >= 0; y--) {
        const id = blocks[(y << 8) | col];
        if (id !== 0 && hm === 0) hm = y + 1;
        if (!blocked) {
          const op = OPAQ[id];
          if (op >= 15) { blocked = true; sh = y; } else { s = Math.max(0, s - op); light[(y << 8) | col] = s << 4; if (s === 0) blocked = true; }
        }
        if (blocked && hm > 0) break;
      }
      c.hm[col] = hm; c.sh[col] = sh;
      if (sh < 0) { let t = CH - 1; while (t >= 0 && OPAQ[blocks[(t << 8) | col]] < 15) t--; c.sh[col] = t; }
    }
    // emission
    for (let i = 0; i < CVOL; i++) {
      const id = blocks[i];
      if (id === 0) continue;
      const e = emitOf(id, c.state[i]);
      if (e > 0) { light[i] = (light[i] & 0xf0) | e; bq.push(x0 + (i & 15), i >> 8, z0 + ((i >> 4) & 15)); }
    }
    // sky seeds: lit cells adjacent to higher blocking columns
    const shAt = (x: number, z: number): number => {
      if (x >= 0 && x < CS && z >= 0 && z < CS) return c.sh[(z << 4) | x];
      const n = this.getChunk((x0 + x) >> 4, (z0 + z) >> 4);
      return n && n.status >= 2 ? n.sh[(((z0 + z) & 15) << 4) | ((x0 + x) & 15)] : -1;
    };
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const h = c.sh[(z << 4) | x];
      const nm = Math.max(shAt(x - 1, z), shAt(x + 1, z), shAt(x, z - 1), shAt(x, z + 1));
      for (let y = h + 1; y <= Math.min(nm, CH - 1); y++) if (((light[(y << 8) | (z << 4) | x] >> 4) & 15) > 1) sq.push(x0 + x, y, z0 + z);
    }
    // border pulls from neighbours
    const pull = (lx: number, lz: number, nx: number, nz: number) => {
      const n = this.getChunk((x0 + nx) >> 4, (z0 + nz) >> 4);
      if (!n || n.status < 2) return;
      const ni = ((nz & 15) << 4) | (nx & 15), ci = (lz << 4) | lx;
      for (let y = 0; y < CH; y++) {
        const id = blocks[(y << 8) | ci], op = OPAQ[id];
        if (op >= 15) continue;
        const nl = n.light[(y << 8) | ni], cl = light[(y << 8) | ci];
        const ns = nl >> 4, nb = nl & 15;
        const dec = Math.max(1, op);
        if (ns - dec > (cl >> 4)) { light[(y << 8) | ci] = ((ns - dec) << 4) | (light[(y << 8) | ci] & 15); sq.push(x0 + lx, y, z0 + lz); }
        if (nb - dec > (light[(y << 8) | ci] & 15)) { light[(y << 8) | ci] = (light[(y << 8) | ci] & 0xf0) | (nb - dec); bq.push(x0 + lx, y, z0 + lz); }
      }
    };
    for (let k = 0; k < CS; k++) { pull(0, k, -1, k); pull(15, k, 16, k); pull(k, 0, k, -1); pull(k, 15, k, 16); }
    c.status = 2;
    this.bfs(sq, 4); this.bfs(bq, 0);
    c.dirty = true;
  }

  private chan(x: number, y: number, z: number, shift: number): number {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return -1;
    return (c.light[(y << 8) | ((z & 15) << 4) | (x & 15)] >> shift) & 15;
  }
  private setChan(c: Chunk, i: number, shift: number, v: number) {
    c.light[i] = shift === 4 ? (c.light[i] & 15) | (v << 4) : (c.light[i] & 0xf0) | v;
  }
  private markLight(c: Chunk, lx: number, lz: number) { c.dirty = true; c.version++; if (lx === 0 || lx === 15 || lz === 0 || lz === 15) this.touch(c, lx, lz); }

  private bfs(q: number[], shift: number) {
    const D = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
    for (let h = 0; h < q.length; h += 3) {
      const x = q[h], y = q[h + 1], z = q[h + 2];
      const v = this.chan(x, y, z, shift);
      if (v <= 1) continue;
      for (let d = 0; d < 18; d += 3) {
        const nx = x + D[d], ny = y + D[d + 1], nz = z + D[d + 2];
        if (ny < 0 || ny >= CH) continue;
        const c = this.getChunk(nx >> 4, nz >> 4);
        if (!c || c.status < 2) continue;
        const i = (ny << 8) | ((nz & 15) << 4) | (nx & 15);
        const op = OPAQ[c.blocks[i]];
        if (op >= 15) continue;
        const nv = shift === 4 && D[d + 1] === -1 && v === 15 && op === 0 ? 15 : v - Math.max(1, op);
        if (nv > ((c.light[i] >> shift) & 15)) { this.setChan(c, i, shift, nv); this.markLight(c, nx & 15, nz & 15); q.push(nx, ny, nz); }
      }
    }
  }
  private removeLight(x: number, y: number, z: number, shift: number): number[] {
    const D = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
    const c0 = this.getChunk(x >> 4, z >> 4)!;
    const v0 = this.chan(x, y, z, shift);
    this.setChan(c0, (y << 8) | ((z & 15) << 4) | (x & 15), shift, 0);
    const rq = [x, y, z, v0], re: number[] = [];
    for (let h = 0; h < rq.length; h += 4) {
      const cx = rq[h], cy = rq[h + 1], cz = rq[h + 2], v = rq[h + 3];
      for (let d = 0; d < 18; d += 3) {
        const nx = cx + D[d], ny = cy + D[d + 1], nz = cz + D[d + 2];
        if (ny < 0 || ny >= CH) continue;
        const c = this.getChunk(nx >> 4, nz >> 4);
        if (!c || c.status < 2) continue;
        const i = (ny << 8) | ((nz & 15) << 4) | (nx & 15);
        const nv = (c.light[i] >> shift) & 15;
        if (nv === 0) continue;
        if (nv < v || (shift === 4 && D[d + 1] === -1 && v === 15 && nv === 15)) {
          this.setChan(c, i, shift, 0); this.markLight(c, nx & 15, nz & 15); rq.push(nx, ny, nz, nv);
        } else re.push(nx, ny, nz);
      }
    }
    return re;
  }
  updateLightAt(x: number, y: number, z: number) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return;
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    const id = c.blocks[i];
    const op = OPAQ[id];
    this.markLight(c, x & 15, z & 15);
    for (const shift of [4, 0]) {
      const re = this.removeLight(x, y, z, shift);
      const q: number[] = re;
      if (shift === 4) {
        if (op < 15) {
          if (y === CH - 1 || this.chan(x, y + 1, z, 4) === 15 && op === 0) { this.setChan(c, i, 4, 15); q.push(x, y, z); }
        }
      } else {
        const e = emitOf(id, c.state[i]);
        if (e > 0) { this.setChan(c, i, 0, e); q.push(x, y, z); }
      }
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const ny = y + dy; if (ny < 0 || ny >= CH) continue;
        if (this.chan(x + dx, ny, z + dz, shift) > 0) q.push(x + dx, ny, z + dz);
      }
      this.bfs(q, shift);
    }
  }

  // ------------------------------------------------------------------ physics helpers
  boxesAt(x: number, y: number, z: number, out: Box[]) {
    const id = this.getBlock(x, y, z);
    if (!id || !SOLID[id]) return;
    const b = Reg.blocks[id]!;
    if (b.shape === 'cube') { out.push([x, y, z, x + 1, y + 1, z + 1]); return; }
    for (const bx of collisionBoxes(b, this.getState(x, y, z))) out.push([x + bx.b[0], y + bx.b[1], z + bx.b[2], x + bx.b[3], y + bx.b[4], z + bx.b[5]]);
  }
  isSolidAt(x: number, y: number, z: number) { return !!SOLID[this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))]; }

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, hitLiquid = false) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx ? Math.abs(1 / dx) : 1e30, tdy = dy ? Math.abs(1 / dy) : 1e30, tdz = dz ? Math.abs(1 / dz) : 1e30;
    let tx = dx ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : 1e30, ty = dy ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : 1e30, tz = dz ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : 1e30;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let n = 0; n < 200 && t <= max; n++) {
      const id = this.getBlock(x, y, z);
      if (id && (!LIQ[id] || hitLiquid)) {
        if (FULL[id]) return { x, y, z, nx, ny, nz, t, id };
        const b = Reg.blocks[id]!;
        const st = this.getState(x, y, z);
        let best = 1e9;
        for (const bx of pickBoxes(b, st, connMask(this, x, y, z, b))) {
          const th = rayBox(ox - x, oy - y, oz - z, dx, dy, dz, bx.b);
          if (th >= 0 && th < best) best = th;
        }
        if (best < 1e9 && best <= max) {
          const px = ox + dx * best - x, py = oy + dy * best - y, pz = oz + dz * best - z;
          const ax = Math.abs(px - 0.5), ay = Math.abs(py - 0.5), az = Math.abs(pz - 0.5);
          let fx = 0, fy = 0, fz = 0;
          if (ax >= ay && ax >= az) fx = px > 0.5 ? 1 : -1; else if (ay >= az) fy = py > 0.5 ? 1 : -1; else fz = pz > 0.5 ? 1 : -1;
          return { x, y, z, nx: fx, ny: fy, nz: fz, t: best, id };
        }
      }
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}

export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box): number {
  let tmin = 0, tmax = 1e9;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < b[a] || o[a] > b[a + 3]) return -1; }
    else {
      let t1 = (b[a] - o[a]) / d[a], t2 = (b[a + 3] - o[a]) / d[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

const colCache = new Map<string, { b: Box }[]>();
export function collisionBoxes(b: Block, state: number): { b: Box }[] {
  const key = b.id + ':' + state;
  let r = colCache.get(key);
  if (!r) {
    if (b.shape === 'fence') r = [{ b: [0.375, 0, 0.375, 0.625, 1.5, 0.625] }];
    else if (b.shape === 'wall') r = [{ b: [0.25, 0, 0.25, 0.75, 1.5, 0.75] }];
    else if (b.shape === 'pole') r = [{ b: [0.375, 0, 0.375, 0.625, 1, 0.625] }];
    else r = blockBoxes(b, state, 0);
    colCache.set(key, r);
  }
  return r;
}

/** connection bitmask (+z,-x,-z,+x) for fence-like shapes */
export function connMask(w: World, x: number, y: number, z: number, b: Block): number {
  if (b.shape !== 'fence' && b.shape !== 'wall' && b.shape !== 'pole') return 0;
  const chk = (xx: number, zz: number) => {
    const id = w.getBlock(xx, y, zz);
    if (!id) return 0;
    const n = Reg.blocks[id]!;
    return (n.connect && n.connect === b.connect) || (n.shape === 'cube' && n.render === 'opaque' && b.shape !== 'pole') || (b.shape === 'pole' && n.power?.cable) || (b.shape === 'pole' && n.use !== undefined && n.shape === 'cube') ? 1 : 0;
  };
  return chk(x, z + 1) | (chk(x - 1, z) << 1) | (chk(x, z - 1) << 2) | (chk(x + 1, z) << 3);
}
