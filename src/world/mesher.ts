/**
 * Chunk mesher: greedy meshing of full-cube faces with per-vertex ambient occlusion + smooth voxel light,
 * plus a box-model path for slabs, stairs, doors, machines, fences and plants.
 * Vertex layout (8 floats): x y z tu | tv layer*8+face ao light(sky + 16*blk + 256*emissive)
 */
import { World, Chunk, CS, CH, connMask } from './world';
import { Reg, OPAQ, FULL, REND, OCCL, EMON, blockBoxes, BoxDef, S_ON, S_POWER } from '../engine/registry';
import { hash01 } from '../engine/noise';

export const STRIDE = 8;
const PW = 18;

class Builder {
  f = new Float32Array(STRIDE * 8192);
  i = new Uint32Array(12288);
  nv = 0; ni = 0; minY = 1e9; maxY = -1e9;
  vert(x: number, y: number, z: number, u: number, v: number, lf: number, ao: number, li: number) {
    if ((this.nv + 1) * STRIDE > this.f.length) { const n = new Float32Array(this.f.length * 2); n.set(this.f); this.f = n; }
    const o = this.nv * STRIDE, f = this.f;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = u; f[o + 4] = v; f[o + 5] = lf; f[o + 6] = ao; f[o + 7] = li;
    if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
    this.nv++;
  }
  tris(a: number, b: number, c: number, d: number, flip: boolean) {
    if (this.ni + 6 > this.i.length) { const n = new Uint32Array(this.i.length * 2); n.set(this.i); this.i = n; }
    const base = this.nv - 4, I = this.i;
    if (!flip) { I[this.ni++] = base + a; I[this.ni++] = base + b; I[this.ni++] = base + c; I[this.ni++] = base + a; I[this.ni++] = base + c; I[this.ni++] = base + d; }
    else { I[this.ni++] = base + b; I[this.ni++] = base + c; I[this.ni++] = base + d; I[this.ni++] = base + b; I[this.ni++] = base + d; I[this.ni++] = base + a; }
  }
  done(): MeshBuf | null {
    if (!this.nv) return null;
    return { verts: this.f.slice(0, this.nv * STRIDE), idx: this.i.slice(0, this.ni), nv: this.nv, ni: this.ni, minY: this.minY, maxY: this.maxY };
  }
}
export interface MeshBuf { verts: Float32Array; idx: Uint32Array; nv: number; ni: number; minY: number; maxY: number }
export interface ChunkMeshData { opaque: MeshBuf | null; trans: MeshBuf | null }

const boxCache = new Map<number, BoxDef[]>();
let gB!: Uint16Array, gL!: Uint8Array;
const ix = (x: number, y: number, z: number) => (y * PW + (z + 1)) * PW + (x + 1);
const occAt = (x: number, y: number, z: number) => (y < 0 || y >= CH ? 0 : OCCL[gB[ix(x, y, z)]]);
const opAt = (x: number, y: number, z: number) => (y < 0 || y >= CH ? 0 : OPAQ[gB[ix(x, y, z)]]);
const lightAt = (x: number, y: number, z: number) => (y < 0 ? 0 : y >= CH ? 0xf0 : gL[ix(x, y, z)]);
const SIDE_TO_FACE = [0, 1, 2, 3, 4, 5];
void SIDE_TO_FACE;

export function meshChunk(world: World, c: Chunk, lod: number): ChunkMeshData {
  const B = new Uint16Array(PW * PW * CH), S = new Uint8Array(PW * PW * CH), L = new Uint8Array(PW * PW * CH);
  const ox = c.cx << 4, oz = c.cz << 4;
  let top = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const n = world.getChunk(c.cx + dx, c.cz + dz); if (n) { const hm = n.hm; for (let i = 0; i < 256; i++) if (hm[i] > top) top = hm[i]; } }
  const YT = Math.min(CH, top + 2);
  for (let pz = -1; pz <= CS; pz++) for (let px = -1; px <= CS; px++) {
    const sc = world.getChunk(c.cx + (px < 0 ? -1 : px >= CS ? 1 : 0), c.cz + (pz < 0 ? -1 : pz >= CS ? 1 : 0));
    const base = (pz + 1) * PW + (px + 1);
    if (!sc) { for (let y = 0; y < YT; y++) L[y * PW * PW + base] = 0xf0; continue; }
    const li = ((pz & 15) << 4) | (px & 15);
    for (let y = 0; y < YT; y++) {
      const o = y * PW * PW + base;
      B[o] = sc.blocks[(y << 8) | li]; S[o] = sc.state[(y << 8) | li]; L[o] = sc.light[(y << 8) | li];
    }
  }
  const idx = (x: number, y: number, z: number) => (y * PW + (z + 1)) * PW + (x + 1);
  const op = new Builder(), tr = new Builder();
  const blocks = Reg.blocks;
  const dims = [CS, YT, CS];
  gB = B; gL = L;

  // ---------------------------------------------------------------- greedy cubes
  const mask = new Int32Array(CH * CS), mAO = new Int32Array(CH * CS), mLt = new Int32Array(CH * CS);
  const p = [0, 0, 0], np = [0, 0, 0];
  for (let d = 0; d < 6; d++) {
    const axis = d >> 1, sgn = d & 1 ? -1 : 1;
    const uA: number = axis === 0 ? 2 : 0, vA: number = axis === 1 ? 2 : 1;
    const nU = dims[uA], nV = dims[vA];
    const flipU = d === 0 || d === 5;
    const eUx = uA === 0 ? 1 : 0, eUy = uA === 1 ? 1 : 0, eUz = uA === 2 ? 1 : 0, eVx = vA === 0 ? 1 : 0, eVy = vA === 1 ? 1 : 0, eVz = vA === 2 ? 1 : 0;
    for (let s = 0; s < dims[axis]; s++) {
      let any = false;
      for (let v = 0; v < nV; v++) for (let u = 0; u < nU; u++) {
        const m = v * nU + u;
        mask[m] = -1;
        p[axis] = s; p[uA] = u; p[vA] = v;
        const i0 = idx(p[0], p[1], p[2]);
        const id = B[i0];
        if (!id || !FULL[id]) continue;
        np[0] = p[0]; np[1] = p[1]; np[2] = p[2]; np[axis] += sgn;
        const ny = np[1];
        const nb = ny < 0 ? 1 : ny >= CH ? 0 : B[idx(np[0], ny, np[2])];
        const r = REND[id];
        if (OCCL[nb]) continue;
        if (nb === id && r !== 1) continue;
        const blk = blocks[id]!;
        const layer = blk.fl[d * 4 + (blk.rot === 'facing4' || blk.layers.front !== undefined ? S[i0] & 3 : 0)];
        let ao = 0xff, lt = 0;
        const nIdx = ny < 0 || ny >= CH ? i0 : idx(np[0], ny, np[2]);
        if (lod === 0 && r <= 2) {
          ao = 0;
          for (let k = 0; k < 4; k++) {
            const su = k === 1 || k === 2 ? 1 : -1, sv = k >= 2 ? 1 : -1;
            const ax = np[0] + su * eUx, ay = np[1] + su * eUy, az = np[2] + su * eUz;
            const bx = np[0] + sv * eVx, by = np[1] + sv * eVy, bz = np[2] + sv * eVz;
            const cx2 = ax + sv * eVx, cy2 = ay + sv * eVy, cz2 = az + sv * eVz;
            const s1 = occAt(ax, ay, az), s2 = occAt(bx, by, bz), cn = occAt(cx2, cy2, cz2);
            ao |= (s1 && s2 ? 0 : 3 - (s1 + s2 + cn)) << (k * 2);
            const o1 = opAt(ax, ay, az) >= 15, o2 = opAt(bx, by, bz) >= 15;
            const c0 = lightAt(np[0], np[1], np[2]);
            let sk = c0 >> 4, bl = c0 & 15, cnt = 1;
            if (!o1) { const q = lightAt(ax, ay, az); sk += q >> 4; bl += q & 15; cnt++; }
            if (!o2) { const q = lightAt(bx, by, bz); sk += q >> 4; bl += q & 15; cnt++; }
            if (!(o1 && o2) && opAt(cx2, cy2, cz2) < 15) { const q = lightAt(cx2, cy2, cz2); sk += q >> 4; bl += q & 15; cnt++; }
            lt |= ((Math.round(sk / cnt) << 4) | Math.round(bl / cnt)) << (k * 8);
          }
        } else {
          const l8 = ny < 0 || ny >= CH ? 0xf0 : L[nIdx];
          lt = l8 | (l8 << 8) | (l8 << 16) | (l8 << 24);
          ao = 0xff;
        }
        if (r === 4 && d !== 2 && d !== 3 || r === 4 && d === 2) { /* water lowering flag */
          const above = s + 0; void above;
        }
        if (r === 4) {
          const aboveId = p[1] + 1 >= CH ? 0 : B[idx(p[0], p[1] + 1, p[2])];
          if (aboveId !== id) ao |= 256;
        }
        mask[m] = layer; mAO[m] = ao; mLt[m] = lt | 0;
        any = true;
      }
      if (!any) continue;
      // greedy merge
      for (let v = 0; v < nV; v++) for (let u = 0; u < nU;) {
        const m0 = v * nU + u, layer = mask[m0];
        if (layer < 0) { u++; continue; }
        const a0 = mAO[m0], l0 = mLt[m0];
        let w = 1;
        while (u + w < nU && mask[m0 + w] === layer && mAO[m0 + w] === a0 && mLt[m0 + w] === l0) w++;
        let h = 1;
        outer: for (; v + h < nV; h++) {
          for (let k = 0; k < w; k++) { const mm = (v + h) * nU + u + k; if (mask[mm] !== layer || mAO[mm] !== a0 || mLt[mm] !== l0) break outer; }
        }
        for (let hh = 0; hh < h; hh++) for (let ww = 0; ww < w; ww++) mask[(v + hh) * nU + u + ww] = -1;
        // emit
        p[axis] = s; p[uA] = u; p[vA] = v;
        const idb = B[idx(p[0], p[1], p[2])];
        const out = REND[idb] >= 3 ? tr : op;
        const plane = s + (sgn > 0 ? 1 : 0);
        const lower = a0 & 256 ? 0.125 : 0;
        const corners = [[0, 0], [w, 0], [w, h], [0, h]];
        const e = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const du = corners[k][0], dv = corners[k][1];
          e[axis] = plane; e[uA] = u + du; e[vA] = v + dv;
          let y = e[1];
          if (lower && ((axis === 1 && sgn > 0) || (axis !== 1 && dv === h))) y -= lower;
          const tu = flipU ? w - du : du, tv = axis === 1 ? dv : h - dv;
          const l8 = (mLt[m0] >>> (k * 8)) & 255;
          const light = (l8 >> 4) + 16 * (l8 & 15) + 256;
          out.vert(ox + e[0], y, oz + e[2], tu, tv, layer * 8 + d, (a0 >> (k * 2)) & 3, light);
        }
        const aoA = [(a0) & 3, (a0 >> 2) & 3, (a0 >> 4) & 3, (a0 >> 6) & 3];
        out.tris(0, 1, 2, 3, aoA[0] + aoA[2] < aoA[1] + aoA[3]);
        u += w;
      }
    }
  }

  // ---------------------------------------------------------------- box models (non-cube blocks)
  if (lod === 0) {
    for (let y = 0; y < YT; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const i0 = idx(x, y, z), id = B[i0];
      if (!id || FULL[id]) continue;
      const blk = blocks[id]!;
      const st = S[i0];
      const out = blk.render === 'glass' ? tr : op;
      const emis = !EMON[id] || st & (S_ON | S_POWER) ? 256 : 0;
      const l8 = L[i0];
      const light = (l8 >> 4) + 16 * (l8 & 15) + emis;
      const wx = ox + x, wz = oz + z;
      if (blk.shape === 'cross') {
        const jx = (hash01(wx, y, wz, 1) - 0.5) * 0.3, jz = (hash01(wx, y, wz, 2) - 0.5) * 0.3;
        const lay = blk.fl[8];
        const q = [[0.05, 0.05, 0.95, 0.95], [0.05, 0.95, 0.95, 0.05]];
        for (const [x0, z0, x1, z1] of q) {
          const lf = lay * 8 + 6;
          out.vert(wx + x0 + jx, y, wz + z0 + jz, 0, 1, lf, 3, light);
          out.vert(wx + x1 + jx, y, wz + z1 + jz, 1, 1, lf, 3, light);
          out.vert(wx + x1 + jx, y + 1, wz + z1 + jz, 1, 0, lf, 3, light);
          out.vert(wx + x0 + jx, y + 1, wz + z0 + jz, 0, 0, lf, 3, light);
          out.tris(0, 1, 2, 3, false);
        }
        continue;
      }
      let boxes = boxCache.get(id * 256 + st);
      const dyn = blk.shape === 'fence' || blk.shape === 'wall' || blk.shape === 'pole';
      let conn = 0;
      if (dyn) conn = connMask(world, wx, y, wz, blk);
      if (!boxes || dyn) { boxes = blockBoxes(blk, st, conn); if (!dyn) boxCache.set(id * 256 + st, boxes); }
      const facing = blk.rot === 'facing4' || blk.shape === 'custom' || blk.shape === 'stair' ? st & 3 : 0;
      for (const bd of boxes) {
        const [x0, y0, z0, x1, y1, z1] = bd.b;
        for (let d = 0; d < 6; d++) {
          // cull boundary faces against occluding neighbours
          if (d === 0 && x1 >= 1 && OCCL[B[idx(x + 1, y, z)]]) continue;
          if (d === 1 && x0 <= 0 && OCCL[B[idx(x - 1, y, z)]]) continue;
          if (d === 2 && y1 >= 1 && y + 1 < CH && OCCL[B[idx(x, y + 1, z)]]) continue;
          if (d === 3 && y0 <= 0 && y > 0 && OCCL[B[idx(x, y - 1, z)]]) continue;
          if (d === 4 && z1 >= 1 && OCCL[B[idx(x, y, z + 1)]]) continue;
          if (d === 5 && z0 <= 0 && OCCL[B[idx(x, y, z - 1)]]) continue;
          const layer = bd.t !== undefined && blk.layers[bd.t] !== undefined ? blk.layers[bd.t] : blk.fl[d * 4 + facing];
          let pos: number[][], uvs: number[][];
          const flipU = d === 0 || d === 5;
          const U = (a: number) => (flipU ? 1 - a : a);
          switch (d) {
            case 0: pos = [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]]; uvs = [[U(z0), 1 - y0], [U(z1), 1 - y0], [U(z1), 1 - y1], [U(z0), 1 - y1]]; break;
            case 1: pos = [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]; uvs = [[U(z0), 1 - y0], [U(z1), 1 - y0], [U(z1), 1 - y1], [U(z0), 1 - y1]]; break;
            case 2: pos = [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]; uvs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; break;
            case 3: pos = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]; uvs = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]; break;
            case 4: pos = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; uvs = [[x0, 1 - y0], [x1, 1 - y0], [x1, 1 - y1], [x0, 1 - y1]]; break;
            default: pos = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]]; uvs = [[U(x0), 1 - y0], [U(x1), 1 - y0], [U(x1), 1 - y1], [U(x0), 1 - y1]]; break;
          }
          for (let k = 0; k < 4; k++) out.vert(wx + pos[k][0], y + pos[k][1], wz + pos[k][2], uvs[k][0], uvs[k][1], layer * 8 + d, 3, light);
          out.tris(0, 1, 2, 3, false);
        }
      }
    }
  }
  return { opaque: op.done(), trans: tr.done() };
}
