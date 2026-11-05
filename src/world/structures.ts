/** Designed structures. Each SiteKind is placed on a jittered grid and drawn (clipped) into every chunk it overlaps. */
import { hash01 } from '../engine/noise';
import { ID, S_TOP, S_UPPER } from '../engine/registry';
import type { Chunk } from './world';
import { CH } from './world';
import type { Generator } from './gen';

export interface SiteKind {
  id: string; name: string; tag: string; cell: number; extent: number; prob: number; salt: number;
  jitter?: number; biomes?: string[]; poi?: boolean; minY?: number; underground?: boolean;
  build(ctx: Ctx, s: Site, g: Generator): void;
}
export interface Site { kind: SiteKind; i: number; j: number; x: number; z: number; y: number; seed: number; biome: string }

export class Ctx {
  x0: number; z0: number;
  constructor(public c: Chunk, public g: Generator) { this.x0 = c.cx << 4; this.z0 = c.cz << 4; }
  put(x: number, y: number, z: number, id: number, st = 0) {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= CH) return;
    const i = (y << 8) | (lz << 4) | lx;
    this.c.blocks[i] = id; this.c.state[i] = st;
  }
  /** only if currently air */
  putAir(x: number, y: number, z: number, id: number, st = 0) {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= CH) return;
    const i = (y << 8) | (lz << 4) | lx;
    if (this.c.blocks[i] === 0) { this.c.blocks[i] = id; this.c.state[i] = st; }
  }
  get(x: number, y: number, z: number) {
    const lx = x - this.x0, lz = z - this.z0;
    if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= CH) return -1;
    return this.c.blocks[(y << 8) | (lz << 4) | lx];
  }
  box(ax: number, ay: number, az: number, bx: number, by: number, bz: number, id: number, st = 0) {
    const x0 = Math.max(ax, this.x0), x1 = Math.min(bx, this.x0 + 15), z0 = Math.max(az, this.z0), z1 = Math.min(bz, this.z0 + 15);
    const y0 = Math.max(0, ay), y1 = Math.min(CH - 1, by);
    if (x0 > x1 || z0 > z1 || y0 > y1) return;
    const { blocks, state } = this.c;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      let i = (y << 8) | ((z - this.z0) << 4) | (x0 - this.x0);
      for (let x = x0; x <= x1; x++, i++) { blocks[i] = id; state[i] = st; }
    }
  }
  shell(ax: number, ay: number, az: number, bx: number, by: number, bz: number, id: number) {
    this.box(ax, ay, az, bx, by, az, id); this.box(ax, ay, bz, bx, by, bz, id);
    this.box(ax, ay, az, ax, by, bz, id); this.box(bx, ay, az, bx, by, bz, id);
  }
  disc(cx: number, cz: number, r: number, y0: number, y1: number, id: number) {
    for (let x = Math.max(cx - r, this.x0); x <= Math.min(cx + r, this.x0 + 15); x++) for (let z = Math.max(cz - r, this.z0); z <= Math.min(cz + r, this.z0 + 15); z++)
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r + 0.5) this.box(x, y0, z, x, y1, z, id);
  }
  ring(cx: number, cz: number, r: number, y0: number, y1: number, id: number) {
    for (let x = Math.max(cx - r - 1, this.x0); x <= Math.min(cx + r + 1, this.x0 + 15); x++) for (let z = Math.max(cz - r - 1, this.z0); z <= Math.min(cz + r + 1, this.z0 + 15); z++) {
      const d = (x - cx) ** 2 + (z - cz) ** 2;
      if (d <= (r + 0.5) ** 2 && d >= (r - 0.6) ** 2) this.box(x, y0, z, x, y1, z, id);
    }
  }
  sphere(cx: number, cy: number, cz: number, r: number, id: number, hemi = false) {
    for (let x = Math.max(cx - r, this.x0); x <= Math.min(cx + r, this.x0 + 15); x++) for (let z = Math.max(cz - r, this.z0); z <= Math.min(cz + r, this.z0 + 15); z++)
      for (let y = hemi ? cy : cy - r; y <= cy + r; y++) if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 <= r * r) this.put(x, y, z, id);
  }
  shellSphere(cx: number, cy: number, cz: number, r: number, id: number) {
    for (let x = Math.max(cx - r, this.x0); x <= Math.min(cx + r, this.x0 + 15); x++) for (let z = Math.max(cz - r, this.z0); z <= Math.min(cz + r, this.z0 + 15); z++)
      for (let y = cy; y <= cy + r; y++) { const d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2; if (d <= r * r && d > (r - 1.2) ** 2) this.put(x, y, z, id); }
  }
  door(x: number, y: number, z: number, facing: number, id: number) { this.put(x, y, z, id, facing); this.put(x, y + 1, z, id, facing | S_UPPER); }
}

const R = (s: Site, a: number, b = 0, c = 0) => hash01(a, b, c, s.seed);
const K = ID;
const pick = <T,>(r: number, arr: T[]) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

function car(ctx: Ctx, x: number, y: number, z: number, alongX: boolean, v: number) {
  const body = [K.rusted_steel, K.container_blue, K.container_red, K.aluminum_cladding, K.container_green][v % 5];
  const [lx, lz] = alongX ? [4, 2] : [2, 4];
  ctx.box(x, y + 1, z, x + lx - 1, y + 1, z + lz - 1, body);
  ctx.box(alongX ? x + 1 : x, y + 2, alongX ? z : z + 1, alongX ? x + 2 : x + lx - 1, y + 2, alongX ? z + lz - 1 : z + 2, K.tinted_glass);
  ctx.box(alongX ? x + 1 : x, y + 3, alongX ? z : z + 1, alongX ? x + 2 : x + lx - 1, y + 3, alongX ? z + lz - 1 : z + 2, body);
  if (alongX) { ctx.put(x, y + 1, z, K.carbon_fiber_block); ctx.put(x + 3, y + 1, z + 1, K.carbon_fiber_block); }
  else { ctx.put(x, y + 1, z, K.carbon_fiber_block); ctx.put(x + 1, y + 1, z + 3, K.carbon_fiber_block); }
  ctx.box(x, y, z, x, y, z, 0); // wheel well handled by ground; no-op safeguard
}
function carAir(ctx: Ctx, x: number, y: number, z: number, alongX: boolean, v: number) { car(ctx, x, y - 1, z, alongX, v); }

function lamp(ctx: Ctx, x: number, y: number, z: number, facing: number) {
  ctx.box(x, y + 1, z, x, y + 4, z, K.industrial_pipe);
  ctx.put(x, y + 5, z, K.street_lamp, facing);
}
function crate(ctx: Ctx, x: number, y: number, z: number, id = K.supply_crate, facing = 0) { ctx.put(x, y, z, id, facing); }

function tower(ctx: Ctx, s: Site, x0: number, z0: number, w: number, d: number, y0: number, floors: number, facade: number, tag: number) {
  const H = floors * 4;
  const x1 = x0 + w - 1, z1 = z0 + d - 1;
  ctx.box(x0 + 1, y0, z0 + 1, x1 - 1, y0, z1 - 1, K.marble_tile);
  // setbacks: upper third narrower
  const split = Math.floor(floors * 0.65);
  const SH = split * 4;
  ctx.shell(x0, y0 + 1, z0, x1, y0 + SH, z1, facade);
  if (floors > split) {
    const ix = x0 + 2, iz = z0 + 2, jx = x1 - 2, jz = z1 - 2;
    ctx.box(x0, y0 + SH, z0, x1, y0 + SH, z1, K.concrete);
    ctx.box(x0 + 1, y0 + SH, z0 + 1, x1 - 1, y0 + SH, z1 - 1, K.concrete);
    ctx.shell(ix, y0 + SH + 1, iz, jx, y0 + H, jz, facade);
    ctx.box(ix, y0 + H + 1, iz, jx, y0 + H + 1, jz, K.concrete);
    ctx.shell(ix, y0 + H + 2, iz, jx, y0 + H + 2, jz, K.concrete_slab);
  } else {
    ctx.box(x0, y0 + H + 1, z0, x1, y0 + H + 1, z1, K.concrete);
    ctx.shell(x0, y0 + H + 2, z0, x1, y0 + H + 2, z1, K.concrete_slab);
  }
  const top = y0 + H + 2, cx = x0 + (w >> 1), cz = z0 + (d >> 1);
  // corner columns
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) ctx.box(px, y0 + 1, pz, px, y0 + Math.min(H, SH), pz, K.reinforced_concrete);
  // lobby glazing + entrance (faces the -z road)
  ctx.shell(x0 + 1, y0 + 1, z0, x1 - 1, y0 + 3, z0, K.storefront);
  ctx.box(cx - 1, y0 + 1, z0, cx, y0 + 3, z0, 0);
  // floors
  for (let f = 1; f < floors; f++) {
    const fy = y0 + f * 4;
    if (f * 4 >= SH) { ctx.box(x0 + 3, fy, z0 + 3, x1 - 3, fy, z1 - 3, K.concrete); ctx.put(x0 + 4, fy, z0 + 4, 0); }
    else { ctx.box(x0 + 1, fy, z0 + 1, x1 - 1, fy, z1 - 1, K.concrete); ctx.put(x0 + 2, fy, z0 + 1, 0); }
  }
  // stair core: wall + ladder
  if (floors > 0) {
    ctx.box(x0 + 1, y0 + 1, z0 + 2, x0 + 3, y0 + Math.min(H, SH), z0 + 2, K.concrete);
    ctx.box(x0 + 2, y0 + 1, z0 + 1, x0 + 2, y0 + SH, z0 + 1, K.ladder, 0);
  }
  // interiors
  for (let f = 0; f < Math.min(floors, split + 1); f++) {
    const fy = y0 + 1 + f * 4;
    for (let k = 0; k < 4; k++) {
      const px = x0 + 3 + Math.floor(R(s, f, k, tag) * (w - 6)), pz = z0 + 4 + Math.floor(R(s, f, k + 9, tag) * (d - 7));
      const r = R(s, f, k + 20, tag);
      if (ctx.get(px, fy, pz) !== 0) continue;
      if (r < 0.34) { ctx.put(px, fy, pz, K.desk, Math.floor(r * 12) & 3); ctx.put(px, fy, pz + 1, K.office_chair, 2); }
      else if (r < 0.5) ctx.put(px, fy, pz, K.server_rack, Math.floor(r * 40) & 3);
      else if (r < 0.62) ctx.put(px, fy, pz, K.potted_plant);
      else if (r < 0.7) ctx.put(px, fy, pz, K.terminal, Math.floor(r * 90) & 3);
      else if (r < 0.74) ctx.put(px, fy, pz, K.supply_crate);
      else if (r < 0.8) ctx.put(px, fy, pz, K.vending_machine, 2);
    }
    for (const [lx, lz] of [[0.3, 0.45], [0.7, 0.45], [0.5, 0.75]]) {
      const lxx = x0 + Math.floor(w * lx), lzz = z0 + Math.floor(d * lz);
      if (ctx.get(lxx, fy + 3, lzz) === 0 && R(s, f, lxx, lzz) < 0.45) ctx.put(lxx, fy + 3, lzz, K.ceiling_light, S_TOP);
    }
  }
  // rooftop
  ctx.put(cx, top + 1, cz, K.radar_dish, Math.floor(R(s, tag, 4) * 4));
  ctx.box(cx + 2, top + 1, cz, cx + 2, top + 5 + Math.floor(R(s, tag, 5) * 6), cz, K.comm_antenna);
  ctx.put(cx + 2, top + 12, cz, K.emergency_light);
  ctx.put(x0 + 1, top + 1, z0 + 1, K.fan_unit);
  // battle damage
  const holes = 2 + Math.floor(R(s, tag, 33) * 3);
  for (let k = 0; k < holes; k++) {
    const hy = y0 + Math.floor(H * (0.35 + R(s, tag, 40 + k) * 0.6)), side = Math.floor(R(s, tag, 50 + k) * 4);
    const hx = side < 2 ? x0 + Math.floor(R(s, tag, 60 + k) * w) : side === 2 ? x0 : x1, hz = side < 2 ? (side === 0 ? z0 : z1) : z0 + Math.floor(R(s, tag, 70 + k) * d);
    const rr = 2 + Math.floor(R(s, tag, 80 + k) * 3);
    if (R(s, tag, 90 + k) < 0.7) ctx.sphere(hx, hy, hz, rr, 0);
  }
}

function garage(ctx: Ctx, s: Site, x0: number, z0: number, y0: number) {
  const w = 20, d = 20;
  for (let lv = 0; lv < 4; lv++) {
    const fy = y0 + lv * 4;
    ctx.box(x0, fy, z0, x0 + w - 1, fy, z0 + d - 1, K.concrete);
    ctx.shell(x0, fy + 1, z0, x0 + w - 1, fy + 1, z0 + d - 1, K.concrete_slab);
    for (let px = x0; px < x0 + w; px += 5) for (let pz = z0; pz < z0 + d; pz += 5) ctx.box(px, fy + 1, pz, px, fy + 3, pz, K.reinforced_concrete);
    for (let k = 0; k < 3; k++) if (R(s, lv, k, 5) < 0.6) carAir(ctx, x0 + 2 + Math.floor(R(s, lv, k, 6) * 12), fy + 1, z0 + 2 + k * 6, R(s, lv, k, 7) < 0.5, Math.floor(R(s, lv, k, 8) * 5));
    ctx.put(x0 + 10, fy + 3, z0 + 10, K.ceiling_light, S_TOP);
  }
  ctx.box(x0, y0 + 16, z0, x0 + w - 1, y0 + 16, z0 + d - 1, K.concrete);
  ctx.box(x0 + 3, y0 + 4, z0 + 17, x0 + 5, y0 + 4, z0 + 18, 0);
  ctx.box(x0 + 4, y0 + 1, z0 + 17, x0 + 4, y0 + 16, z0 + 17, K.ladder, 0);
  ctx.box(x0 + 4, y0 + 1, z0 + 18, x0 + 4, y0 + 16, z0 + 18, K.reinforced_concrete);
}

function wreck(ctx: Ctx, s: Site, x0: number, z0: number, y0: number) {
  for (let x = x0; x < x0 + 20; x++) for (let z = z0; z < z0 + 20; z++) {
    const r = R(s, x, z, 3);
    const hgt = r < 0.35 ? 1 + Math.floor(r * 10) : 0;
    const cx = x - x0 - 10, cz = z - z0 - 10, mound = Math.max(0, 3 - Math.hypot(cx, cz) * 0.3);
    const hh = Math.floor(hgt * (0.4 + mound * 0.4));
    if (hh > 0) ctx.box(x, y0 + 1, z, x, y0 + hh, z, pick(R(s, x, z, 4), [K.rubble, K.rubble, K.cracked_concrete, K.rusted_steel, K.gravel]));
  }
  for (let k = 0; k < 6; k++) {
    const bx = x0 + 2 + Math.floor(R(s, k, 1, 9) * 16), bz = z0 + 2 + Math.floor(R(s, k, 2, 9) * 16);
    ctx.box(bx, y0 + 1, bz, bx, y0 + 3 + Math.floor(R(s, k, 3, 9) * 9), bz, K.steel_beam);
  }
  for (let k = 0; k < 3; k++) {
    const wx = x0 + Math.floor(R(s, k, 4, 9) * 14), wz = z0 + Math.floor(R(s, k, 5, 9) * 18);
    ctx.box(wx, y0 + 1, wz, wx + 4, y0 + 2 + Math.floor(R(s, k, 6, 9) * 6), wz, K.apartment_facade);
  }
  carAir(ctx, x0 + 3, y0 + 1, z0 + 15, true, Math.floor(R(s, 1, 1, 12) * 5));
  crate(ctx, x0 + 9, y0 + 1, z0 + 9);
}

function park(ctx: Ctx, s: Site, x0: number, z0: number, y0: number) {
  ctx.box(x0, y0, z0, x0 + 19, y0, z0 + 19, K.lawn);
  ctx.ring(x0 + 10, z0 + 10, 4, y0, y0 + 1, K.concrete);
  ctx.disc(x0 + 10, z0 + 10, 3, y0, y0, K.water);
  ctx.put(x0 + 10, y0 + 1, z0 + 10, K.glow_crystal);
  for (let k = 0; k < 6; k++) {
    const tx = x0 + 2 + Math.floor(R(s, k, 1, 21) * 16), tz = z0 + 2 + Math.floor(R(s, k, 2, 21) * 16);
    if (Math.hypot(tx - x0 - 10, tz - z0 - 10) < 6) continue;
    const th = 4 + Math.floor(R(s, k, 3, 21) * 3);
    ctx.box(tx, y0 + 1, tz, tx, y0 + th, tz, K.timber_log);
    ctx.sphere(tx, y0 + th + 1, tz, 3, K.leaves);
    ctx.put(tx, y0 + th, tz, K.timber_log);
  }
  for (const [bx, bz, f] of [[x0 + 4, z0 + 10, 3], [x0 + 16, z0 + 10, 1], [x0 + 10, z0 + 3, 0]]) ctx.put(bx, y0 + 1, bz, K.timber_planks_stairs, f);
  lamp(ctx, x0 + 1, y0, z0 + 1, 0); lamp(ctx, x0 + 18, y0, z0 + 18, 2);
}

function market(ctx: Ctx, _s: Site, x0: number, z0: number, y0: number) {
  ctx.box(x0, y0 + 5, z0 + 6, x0 + 15, y0 + 5, z0 + 13, K.aluminum_cladding);
  for (const [px, pz] of [[x0, z0 + 6], [x0 + 15, z0 + 6], [x0, z0 + 13], [x0 + 15, z0 + 13]]) ctx.box(px, y0 + 1, pz, px, y0 + 4, pz, K.steel_beam);
  ctx.box(x0 + 1, y0, z0 + 7, x0 + 14, y0, z0 + 12, K.industrial_floor);
  for (let k = 0; k < 3; k++) { ctx.put(x0 + 3 + k * 4, y0 + 1, z0 + 9, K.fuel_drum); ctx.put(x0 + 3 + k * 4, y0 + 1, z0 + 10, K.vending_machine, 0); }
  ctx.box(x0 + 2, y0 + 4, z0 + 7, x0 + 13, y0 + 4, z0 + 7, K.neon_sign);
  // shop
  ctx.shell(x0 + 3, y0 + 1, z0 + 14, x0 + 14, y0 + 4, z0 + 19, K.white_render);
  ctx.box(x0 + 4, y0 + 2, z0 + 14, x0 + 13, y0 + 3, z0 + 14, K.storefront);
  ctx.box(x0 + 8, y0 + 1, z0 + 14, x0 + 9, y0 + 3, z0 + 14, 0);
  ctx.box(x0 + 3, y0 + 5, z0 + 14, x0 + 14, y0 + 5, z0 + 19, K.concrete);
  ctx.box(x0 + 4, y0, z0 + 15, x0 + 13, y0, z0 + 18, K.lab_tile);
  for (let k = 0; k < 4; k++) ctx.put(x0 + 4 + k * 3, y0 + 1, z0 + 18, K.cargo_shelf, 2);
  crate(ctx, x0 + 13, y0 + 1, z0 + 16, K.supply_crate);
  ctx.put(x0 + 4, y0 + 1, z0 + 16, K.vending_machine, 3);
  carAir(ctx, x0 + 1, y0 + 1, z0 + 1, true, 2);
}

// ---------------------------------------------------------------------------------------------
export const SITE_KINDS: SiteKind[] = [];

// ---- metropolis lots
SITE_KINDS.push({
  id: 'city_lot', name: 'City Block', tag: 'city', cell: 32, extent: 34, prob: 1, salt: 100, biomes: ['metropolis'],
  build(ctx, s, g) {
    const X = s.i * 32, Z = s.j * 32, y0 = 46;
    if (g.heightAt(X + 16, Z + 16) !== 46) return;
    ctx.box(X, y0, Z, X + 31, y0, Z + 31, K.sidewalk);
    ctx.box(X, y0, Z, X + 7, y0, Z + 31, K.asphalt);
    ctx.box(X, y0, Z, X + 31, y0, Z + 7, K.asphalt);
    ctx.box(X + 3, y0, Z + 10, X + 3, y0, Z + 31, K.road_line_z); ctx.box(X + 4, y0, Z + 10, X + 4, y0, Z + 31, K.road_line_z);
    ctx.box(X + 10, y0, Z + 3, X + 31, y0, Z + 3, K.road_line_x); ctx.box(X + 10, y0, Z + 4, X + 31, y0, Z + 4, K.road_line_x);
    ctx.box(X, y0, Z + 8, X + 7, y0, Z + 9, K.crosswalk_z); ctx.box(X + 8, y0, Z, X + 9, y0, Z + 7, K.crosswalk_x);
    for (let k = 0; k < 40; k++) {
      const rx = Math.floor(R(s, k, 1, 5) * 8), rz = Math.floor(R(s, k, 2, 5) * 32);
      if (rx !== 3 && rx !== 4) ctx.put(X + rx, y0, Z + rz, K.asphalt_cracked);
      const rz2 = Math.floor(R(s, k, 3, 5) * 8), rx2 = Math.floor(R(s, k, 4, 5) * 32);
      if (rz2 !== 3 && rz2 !== 4 && rx2 > 9) ctx.put(X + rx2, y0, Z + rz2, K.asphalt_cracked);
    }
    for (const [lx, lz, f] of [[8, 8, 0], [31, 8, 1], [8, 31, 3], [31, 31, 2]]) if (R(s, lx, lz, 6) < 0.75) lamp(ctx, X + lx, y0, Z + lz, f);
    ctx.put(X + 6, y0 + 1, Z + 7, K.traffic_light, 0);
    if (R(s, 2, 2, 8) < 0.4) car(ctx, X + 1 + Math.floor(R(s, 3, 3, 8) * 2), y0, Z + 12 + Math.floor(R(s, 4, 4, 8) * 12), false, Math.floor(R(s, 5, 5, 8) * 5));
    if (R(s, 6, 6, 8) < 0.35) car(ctx, X + 14 + Math.floor(R(s, 7, 7, 8) * 10), y0, Z + 5, true, Math.floor(R(s, 8, 8, 8) * 5));
    if (R(s, 9, 9, 8) < 0.2) ctx.put(X + 6, y0, Z + 20, K.manhole_cover);
    const bx = X + 10, bz = Z + 10;
    const t = Math.floor(R(s, 1) * 12);
    ctx.box(bx, y0 + 1, bz, bx + 21, y0 + 90, bz + 21, 0);
    const facades = [K.curtain_wall_blue, K.curtain_wall_dark, K.office_facade, K.tower_facade_lit, K.brutalist_panel, K.curtain_wall_blue];
    if (t <= 3 || t === 11) {
      const fw = 12 + 2 * Math.floor(R(s, 2) * 4);
      const floors = 8 + Math.floor(R(s, 3) * 14);
      tower(ctx, s, bx + ((20 - fw) >> 1), bz + ((20 - fw) >> 1), fw, fw, y0, floors, pick(R(s, 4), facades), t);
    } else if (t === 4 || t === 5) tower(ctx, s, bx + 1, bz + 2, 18, 16, y0, 4 + Math.floor(R(s, 3) * 5), pick(R(s, 4), [K.office_facade, K.brutalist_panel, K.curtain_wall_blue]), t);
    else if (t === 6 || t === 7) tower(ctx, s, bx + 1, bz + 1, 16, 14, y0, 4 + Math.floor(R(s, 3) * 5), pick(R(s, 4), [K.apartment_facade, K.apartment_facade, K.travertine]), t);
    else if (t === 8) garage(ctx, s, bx, bz, y0);
    else if (t === 9) park(ctx, s, bx, bz, y0);
    else if (t === 10) market(ctx, s, bx + 2, bz, y0);
    if (t === 5) wreck(ctx, s, bx, bz, y0);
    if (t === 7) { wreck(ctx, s, bx, bz, y0); }
  },
});

// ---- subway
SITE_KINDS.push({
  id: 'subway', name: 'Subway Station', tag: 'subway', cell: 32, extent: 34, prob: 1, salt: 300, biomes: ['metropolis'],
  build(ctx, s, g) {
    if (((s.j % 3) + 3) % 3 !== 0) return;
    const X = s.i * 32, Z = s.j * 32;
    if (g.heightAt(X + 16, Z + 16) !== 46) return;
    ctx.box(X, 28, Z, X + 31, 37, Z + 7, K.tunnel_lining);
    ctx.box(X, 30, Z + 1, X + 31, 35, Z + 6, 0);
    ctx.box(X, 29, Z + 1, X + 31, 29, Z + 6, K.subway_tile);
    ctx.box(X, 30, Z + 2, X + 31, 30, Z + 2, K.rail_track); ctx.box(X, 30, Z + 5, X + 31, 30, Z + 5, K.rail_track);
    for (let x = 4; x < 32; x += 8) { ctx.put(X + x, 35, Z + 3, K.lamp_cold); ctx.put(X + x, 35, Z + 4, K.lamp_cold); }
    for (let x = 0; x < 32; x += 3) if (R(s, x, 1, 31) < 0.15) ctx.box(X + x, 30, Z + 1, X + x + 1, 31, Z + 1 + Math.floor(R(s, x, 2, 31) * 5), K.rubble);
    const station = ((s.i % 3) + 3) % 3 === 1;
    if (station) {
      ctx.box(X, 30, Z + 1, X + 31, 30, Z + 1, K.platform_edge); ctx.box(X, 30, Z + 6, X + 31, 30, Z + 6, K.platform_edge);
      for (let x = 2; x < 32; x += 6) { ctx.box(X + x, 31, Z + 3, X + x, 34, Z + 3, K.reinforced_concrete); ctx.put(X + x, 31, Z + 4, K.warning_sign, 0); }
      ctx.put(X + 12, 31, Z + 1, K.terminal, 0); ctx.put(X + 20, 31, Z + 6, K.vending_machine, 2);
      ctx.put(X + 16, 31, Z + 6, K.supply_crate, 2);
      // access shaft
      ctx.box(X + 12, 30, Z + 7, X + 12, 35, Z + 7, 0);
      ctx.box(X + 12, 30, Z + 8, X + 12, 46, Z + 8, K.ladder, 0);
      ctx.box(X + 11, 30, Z + 8, X + 11, 46, Z + 8, K.tunnel_lining); ctx.box(X + 13, 30, Z + 8, X + 13, 46, Z + 8, K.tunnel_lining);
      ctx.put(X + 12, 47, Z + 8, K.road_sign, 0);
      for (let y = 34; y < 46; y += 4) ctx.put(X + 12, y, Z + 9, K.emergency_light);
    }
  },
});

// ---- suburbs
SITE_KINDS.push({
  id: 'suburb_lot', name: 'Suburban Home', tag: 'suburb', cell: 28, extent: 30, prob: 1, salt: 200, biomes: ['suburb'],
  build(ctx, s, g) {
    const X = s.i * 28, Z = s.j * 28, y0 = 46;
    if (g.heightAt(X + 14, Z + 14) !== 46) return;
    ctx.box(X, y0, Z, X + 5, y0, Z + 27, K.asphalt); ctx.box(X, y0, Z, X + 27, y0, Z + 5, K.asphalt);
    ctx.box(X + 2, y0, Z + 6, X + 3, y0, Z + 27, K.road_line_z); ctx.box(X + 6, y0, Z + 2, X + 27, y0, Z + 3, K.road_line_x);
    ctx.box(X + 6, y0, Z + 6, X + 27, y0, Z + 6, K.sidewalk); ctx.box(X + 6, y0, Z + 6, X + 6, y0, Z + 27, K.sidewalk);
    ctx.box(X + 7, y0 + 1, Z + 7, X + 27, y0 + 14, Z + 27, 0);
    for (let k = 0; k < 10; k++) ctx.put(X + Math.floor(R(s, k, 1, 4) * 6), y0, Z + Math.floor(R(s, k, 2, 4) * 28), K.asphalt_cracked);
    if (R(s, 1, 2, 3) < 0.7) lamp(ctx, X + 6, y0, Z + 6, 2);
    const hx = X + 9, hz = Z + 9;
    const w = 12, d = 9, two = R(s, 3) < 0.3, H = two ? 8 : 4;
    const wall = pick(R(s, 4), [K.vinyl_siding, K.vinyl_siding_blue, K.stucco, K.brick, K.vinyl_siding]);
    const burned = R(s, 5) < 0.22;
    const x1 = hx + w - 1, z1 = hz + d - 1;
    ctx.box(hx, y0, hz, x1, y0, z1, K.parquet);
    ctx.shell(hx, y0 + 1, hz, x1, y0 + H, z1, wall);
    for (const [px, pz] of [[hx, hz], [x1, hz], [hx, z1], [x1, z1]]) ctx.box(px, y0 + 1, pz, px, y0 + H, pz, K.timber_log);
    for (let fl = 0; fl < (two ? 2 : 1); fl++) {
      const wy = y0 + 2 + fl * 4;
      for (let x = hx + 2; x < x1 - 1; x += 3) { ctx.put(x, wy, hz, K.glass); ctx.put(x, wy, z1, K.glass); }
      for (let z = hz + 2; z < z1 - 1; z += 3) { ctx.put(hx, wy, z, K.glass); ctx.put(x1, wy, z, K.glass); }
    }
    if (two) ctx.box(hx + 1, y0 + 4, hz + 1, x1 - 1, y0 + 4, z1 - 1, K.timber_planks);
    if (two) { ctx.put(hx + 1, y0 + 4, hz + 1, 0); ctx.box(hx + 1, y0 + 1, hz + 1, hx + 1, y0 + 7, hz + 1, K.ladder, 0); ctx.box(hx + 1, y0 + 1, hz + 2, hx + 1, y0 + 7, hz + 2, K.timber_cladding); }
    ctx.door(hx + 5, y0 + 1, hz, 2, K.steel_door);
    ctx.put(hx + 5, y0, hz - 1, K.sidewalk); ctx.box(hx + 5, y0, Z + 6, hx + 5, y0, hz - 1, K.sidewalk);
    // roof
    const top = y0 + H;
    const maxK = Math.floor((d + 1) / 2);
    for (let k = 0; k <= maxK; k++) {
      const za = hz - 1 + k, zb = z1 + 1 - k, y = top + 1 + k;
      if (burned && k >= 2) break;
      if (za > zb) break;
      if (za === zb) { ctx.box(hx - 1, y, za, x1 + 1, y, za, K.roof_shingles); break; }
      ctx.box(hx - 1, y, za, x1 + 1, y, za, K.roof_shingles_stairs, 2);
      ctx.box(hx - 1, y, zb, x1 + 1, y, zb, K.roof_shingles_stairs, 0);
      if (!burned) { ctx.box(hx, y, hz + k, hx, y, z1 - k, wall); ctx.box(x1, y, hz + k, x1, y, z1 - k, wall); }
    }
    if (burned) { ctx.sphere(hx + 4 + Math.floor(R(s, 8) * 4), top, hz + 3, 3, 0); for (let k = 0; k < 14; k++) ctx.put(hx + Math.floor(R(s, k, 3, 7) * w), y0 + 1, hz + Math.floor(R(s, k, 4, 7) * d), K.rubble); }
    // furniture
    const f1 = y0 + 1;
    ctx.put(hx + 2, f1, hz + 6, K.bed, 0); ctx.put(hx + 6, f1, hz + 7, K.sofa, 2); ctx.put(hx + 8, f1, hz + 4, K.dining_table);
    ctx.put(hx + 10, f1, hz + 2, K.kitchen_counter, 3); ctx.put(hx + 10, f1, hz + 3, K.refrigerator, 3);
    ctx.put(hx + 9, f1, z1 - 1, K.tv_screen, 2); ctx.put(hx + 3, f1, hz + 1, K.bookshelf, 0);
    ctx.put(hx + 3, f1 + 3, hz + 4, K.lamp_warm);
    if (R(s, 9) < 0.45) ctx.put(hx + 10, f1, z1 - 1, K.supply_crate, 2);
    if (R(s, 10) < 0.3) ctx.put(hx + 1, f1, hz + 4, K.storage_crate);
    // yard
    for (let x = X + 7; x <= X + 27; x++) { if (x < hx + 4 || x > hx + 6) ctx.put(x, y0 + 1, Z + 8, K.chain_link); ctx.put(x, y0 + 1, Z + 27, K.chain_link); }
    for (let z = Z + 8; z <= Z + 27; z++) { ctx.put(X + 7, y0 + 1, z, K.chain_link); ctx.put(X + 27, y0 + 1, z, K.chain_link); }
    if (R(s, 12) < 0.5) car(ctx, X + 20, y0, Z + 10, false, Math.floor(R(s, 13) * 5));
    if (R(s, 14) < 0.5) ctx.put(X + 24, y0 + 1, Z + 24, K.planter_box);
    if (R(s, 15) < 0.35) ctx.put(X + 22, y0 + 1, Z + 22, K.berry_bush);
  },
});

// ---- industrial
SITE_KINDS.push({
  id: 'industrial_plant', name: 'Industrial Plant', tag: 'industrial', cell: 64, extent: 66, prob: 0.9, salt: 400, biomes: ['industrial'], poi: true,
  build(ctx, s, g) {
    const X = s.i * 64, Z = s.j * 64, y0 = 46;
    if (g.heightAt(X + 32, Z + 32) !== 46) return;
    ctx.box(X, y0, Z, X + 63, y0, Z + 63, K.industrial_floor);
    ctx.box(X, y0, Z, X + 5, y0, Z + 63, K.asphalt); ctx.box(X, y0, Z, X + 63, y0, Z + 5, K.asphalt);
    ctx.box(X + 2, y0, Z + 6, X + 3, y0, Z + 63, K.road_line_z); ctx.box(X + 6, y0, Z + 2, X + 63, y0, Z + 3, K.road_line_x);
    ctx.box(X + 6, y0 + 1, Z + 6, X + 63, y0 + 50, Z + 63, 0);
    const t = Math.floor(R(s, 1) * 6);
    const bx = X + 10, bz = Z + 10;
    if (t === 0) { // warehouse
      ctx.shell(bx, y0 + 1, bz, bx + 39, y0 + 9, bz + 25, K.corrugated_metal);
      ctx.box(bx, y0 + 10, bz, bx + 39, y0 + 10, bz + 25, K.steel_block_slab); ctx.box(bx + 1, y0 + 10, bz + 1, bx + 38, y0 + 10, bz + 24, K.steel_plating);
      ctx.box(bx + 15, y0 + 1, bz, bx + 24, y0 + 6, bz, 0);
      ctx.box(bx + 15, y0 + 7, bz, bx + 24, y0 + 7, bz, K.hazard_block);
      for (let x = bx + 4; x < bx + 38; x += 8) { ctx.box(x, y0 + 1, bz + 1, x, y0 + 9, bz + 1, K.steel_beam); ctx.box(x, y0 + 1, bz + 24, x, y0 + 9, bz + 24, K.steel_beam); ctx.put(x, y0 + 9, bz + 12, K.floodlight, 2); }
      for (let k = 0; k < 26; k++) {
        const cx = bx + 2 + Math.floor(R(s, k, 1, 2) * 36), cz = bz + 4 + Math.floor(R(s, k, 2, 2) * 20), r = R(s, k, 3, 2);
        if (r < 0.4) { ctx.put(cx, y0 + 1, cz, K.pallet); ctx.put(cx, y0 + 2, cz, r < 0.2 ? K.storage_crate : K.supply_crate); }
        else if (r < 0.6) ctx.put(cx, y0 + 1, cz, K.cargo_shelf, Math.floor(r * 20) & 3);
        else if (r < 0.75) ctx.put(cx, y0 + 1, cz, K.chemical_barrel);
        else ctx.put(cx, y0 + 1, cz, K.fuel_drum);
      }
      ctx.box(bx + 2, y0 + 1, bz + 22, bx + 36, y0 + 1, bz + 22, K.conveyor_belt);
    } else if (t === 1) { // factory + smokestack
      ctx.shell(bx, y0 + 1, bz, bx + 27, y0 + 12, bz + 19, K.stained_concrete);
      ctx.box(bx, y0 + 13, bz, bx + 27, y0 + 13, bz + 19, K.concrete);
      ctx.box(bx + 10, y0 + 1, bz, bx + 17, y0 + 6, bz, 0);
      ctx.box(bx + 4, y0 + 2, bz, bx + 23, y0 + 3, bz, K.window_frame);
      ctx.box(bx + 10, y0 + 1, bz, bx + 17, y0 + 6, bz, 0);
      for (let x = bx + 3; x < bx + 26; x += 4) { ctx.put(x, y0 + 1, bz + 8, K.fabricator, 0); ctx.put(x, y0 + 1, bz + 14, K.server_rack, 2); ctx.put(x, y0 + 1, bz + 11, K.conveyor_belt); }
      ctx.put(bx + 3, y0 + 1, bz + 3, K.auto_drill, 0); ctx.put(bx + 24, y0 + 1, bz + 4, K.supply_crate, 0);
      for (let x = bx + 4; x < bx + 26; x += 6) ctx.put(x, y0 + 12, bz + 9, K.floodlight, 2);
      const sx = bx + 34, sz = bz + 5;
      for (let y = y0 + 1; y <= y0 + 42; y++) { ctx.shell(sx, y, sz, sx + 4, y, sz + 4, K.smokestack_brick); }
      ctx.box(sx + 1, y0 + 43, sz + 1, sx + 3, y0 + 43, sz + 3, K.slag_block);
      ctx.shell(sx - 1, y0 + 42, sz - 1, sx + 5, y0 + 42, sz + 5, K.hazard_block);
      ctx.put(sx + 2, y0 + 44, sz + 2, K.emergency_light);
      for (let y = y0 + 1; y < y0 + 12; y++) { ctx.put(sx - 1, y, sz + 2, K.industrial_pipe); }
      ctx.box(bx + 28, y0 + 11, sz + 2, sx - 1, y0 + 11, sz + 2, K.industrial_pipe);
    } else if (t === 2) { // silos + tanks
      for (let k = 0; k < 3; k++) {
        const cx = bx + 6 + k * 11, cz = bz + 8;
        for (let y = y0 + 1; y <= y0 + 22; y++) ctx.ring(cx, cz, 4, y, y, y % 8 === 0 ? K.hazard_block : K.concrete);
        ctx.disc(cx, cz, 4, y0 + 23, y0 + 23, K.concrete); ctx.put(cx, y0 + 24, cz, K.emergency_light);
        ctx.box(cx, y0 + 1, cz + 5, cx, y0 + 22, cz + 5, K.ladder, 0);
      }
      for (let k = 0; k < 2; k++) {
        const cx = bx + 10 + k * 16, cz = bz + 28;
        for (let y = y0 + 1; y <= y0 + 8; y++) ctx.ring(cx, cz, 6, y, y, K.steel_plating);
        ctx.disc(cx, cz, 6, y0 + 9, y0 + 9, K.steel_plating); ctx.put(cx, y0 + 10, cz, K.fan_unit);
      }
      ctx.box(bx + 6, y0 + 1, bz + 14, bx + 40, y0 + 1, bz + 14, K.industrial_pipe);
    } else if (t === 3) { // container yard
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const cx = bx + c * 12, cz = bz + r * 8, hgt = 1 + Math.floor(R(s, r, c, 7) * 3);
        if (R(s, r, c, 8) < 0.2) continue;
        const kind = pick(R(s, r, c, 9), [K.container_red, K.container_blue, K.container_green]);
        for (let lv = 0; lv < hgt; lv++) ctx.box(cx, y0 + 1 + lv * 3, cz, cx + 9, y0 + 3 + lv * 3, cz + 3, kind);
        if (hgt > 0) ctx.put(cx + 9, y0 + 2, cz + 4, K.supply_crate, 0);
      }
      for (const px of [bx - 2, bx + 46]) { ctx.box(px, y0 + 1, bz - 2, px, y0 + 13, bz - 2, K.steel_beam); ctx.box(px, y0 + 1, bz + 34, px, y0 + 13, bz + 34, K.steel_beam); }
      ctx.box(bx - 2, y0 + 13, bz - 2, bx + 46, y0 + 13, bz - 2, K.steel_beam); ctx.box(bx - 2, y0 + 13, bz + 34, bx + 46, y0 + 13, bz + 34, K.steel_beam);
      ctx.box(bx + 20, y0 + 13, bz - 2, bx + 20, y0 + 13, bz + 34, K.steel_truss);
    } else if (t === 4) { // substation
      ctx.shell(bx, y0 + 1, bz, bx + 30, y0 + 2, bz + 24, K.chain_link);
      for (let k = 0; k < 5; k++) { ctx.put(bx + 4 + k * 5, y0 + 1, bz + 6, K.transformer); ctx.put(bx + 4 + k * 5, y0 + 1, bz + 12, K.battery_bank); ctx.box(bx + 4 + k * 5, y0 + 1, bz + 7, bx + 4 + k * 5, y0 + 1, bz + 11, K.copper_cable); }
      for (const px of [bx + 3, bx + 27]) ctx.box(px, y0 + 1, bz + 19, px, y0 + 11, bz + 19, K.power_pylon);
      ctx.box(bx + 3, y0 + 11, bz + 19, bx + 27, y0 + 11, bz + 19, K.copper_cable);
      ctx.put(bx + 15, y0 + 1, bz + 2, K.terminal, 0); ctx.put(bx + 16, y0 + 1, bz + 2, K.supply_crate, 0);
      ctx.put(bx + 14, y0 + 1, bz, 0); ctx.put(bx + 15, y0 + 1, bz, 0); ctx.put(bx + 14, y0 + 2, bz, 0); ctx.put(bx + 15, y0 + 2, bz, 0);
    } else { // cooling towers
      for (let k = 0; k < 2; k++) {
        const cx = bx + 12 + k * 22, cz = bz + 14;
        for (let y = 1; y <= 34; y++) { const r = Math.round(10 - 4 * Math.sin((y / 34) * Math.PI * 0.9)); ctx.ring(cx, cz, r, y0 + y, y0 + y, y % 9 === 0 ? K.hazard_block : K.concrete); }
        ctx.box(cx + 10, y0 + 1, cz, cx + 10, y0 + 3, cz, 0);
        ctx.put(cx, y0 + 1, cz, K.arc_smelter, 0);
      }
    }
    for (let k = 0; k < 4; k++) if (R(s, k, 20, 1) < 0.5) lamp(ctx, X + 7 + Math.floor(R(s, k, 21, 1) * 50), y0, Z + 7, 0);
  },
});

// ---- mountain stations & The Spire
SITE_KINDS.push({
  id: 'summit_station', name: 'Summit Station', tag: 'mountain', cell: 160, extent: 20, prob: 0.8, salt: 500, biomes: ['mountain', 'snowpeak'], jitter: 90, minY: 72, poi: true,
  build(ctx, s, g) {
    const sx = s.x, sz = s.z, y = s.y + 1;
    const spire = R(s, 1) < 0.3;
    for (let dx = -7; dx <= 7; dx++) for (let dz = -7; dz <= 7; dz++) {
      if (dx * dx + dz * dz > 50) continue;
      const wx = sx + dx, wz = sz + dz;
      if (wx < ctx.x0 - 1 || wx > ctx.x0 + 16 || wz < ctx.z0 - 1 || wz > ctx.z0 + 16) continue;
      const th = g.heightAt(wx, wz);
      ctx.box(wx, Math.min(th, y) - 1, wz, wx, y - 1, wz, K.concrete);
      ctx.box(wx, y, wz, wx, y + 30, wz, 0);
    }
    ctx.shell(sx - 6, y, sz - 6, sx + 6, y, sz + 6, K.hazard_block);
    ctx.shell(sx - 5, y + 1, sz - 4, sx - 1, y + 4, sz, K.aluminum_cladding);
    ctx.box(sx - 4, y + 5, sz - 3, sx - 2, y + 5, sz - 1, K.aluminum_cladding); ctx.box(sx - 5, y + 5, sz - 4, sx - 1, y + 5, sz, K.aluminum_cladding);
    ctx.box(sx - 4, y + 2, sz, sx - 2, y + 3, sz, K.glass); ctx.door(sx - 3, y + 1, sz, 0, K.steel_door);
    ctx.put(sx - 4, y + 1, sz - 3, K.terminal, 0); ctx.put(sx - 2, y + 1, sz - 3, K.supply_crate, 0); ctx.put(sx - 4, y + 1, sz - 1, K.bed, 0); ctx.put(sx - 2, y + 1, sz - 1, K.workbench, 0);
    ctx.put(sx - 3, y + 4, sz - 2, K.lamp_cold);
    const th = spire ? 62 : 26;
    for (const [px, pz] of [[1, 1], [4, 1], [1, 4], [4, 4]]) ctx.box(sx + px, y + 1, sz + px * 0 + pz, sx + px, y + th, sz + pz, K.steel_truss);
    for (let yy = y + 4; yy < y + th; yy += 6) { ctx.shell(sx + 1, yy, sz + 1, sx + 4, yy, sz + 4, K.steel_plating); ctx.put(sx + 1, yy + 1, sz + 1, K.emergency_light); }
    ctx.box(sx + 2, y + 1, sz + 2, sx + 3, y + th, sz + 3, 0);
    ctx.box(sx + 2, y + 1, sz + 2, sx + 2, y + th, sz + 2, K.ladder, 0);
    ctx.box(sx + 2, y + 1, sz + 3, sx + 2, y + th, sz + 3, K.steel_plating);
    ctx.put(sx + 3, y + th + 1, sz + 3, K.radar_dish, 1);
    ctx.box(sx + 2, y + th + 1, sz + 2, sx + 2, y + th + 8, sz + 2, K.comm_antenna);
    ctx.put(sx + 2, y + th + 9, sz + 2, spire ? K.neon_magenta : K.emergency_light);
    if (spire) for (let k = 0; k < 8; k++) ctx.put(sx + 2, y + th + 10 + k, sz + 2, K.glow_crystal);
  },
});

// ---- desert research complex
SITE_KINDS.push({
  id: 'desert_complex', name: 'Aridlands Research Complex', tag: 'desert', cell: 128, extent: 30, prob: 0.7, salt: 600, biomes: ['desert'], jitter: 40, poi: true,
  build(ctx, s, g) {
    const cx = s.x, cz = s.z, y = s.y;
    for (let dx = -24; dx <= 24; dx++) for (let dz = -24; dz <= 24; dz++) {
      const wx = cx + dx, wz = cz + dz;
      if (wx < ctx.x0 || wx > ctx.x0 + 15 || wz < ctx.z0 || wz > ctx.z0 + 15) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 > 24 * 24) continue;
      const th = g.heightAt(wx, wz);
      if (th < y) ctx.box(wx, th, wz, wx, y - 1, wz, K.sandstone);
      ctx.box(wx, y + 1, wz, wx, y + 24, wz, 0);
      ctx.put(wx, y, wz, d2 < 22 * 22 ? (d2 < 14 * 14 ? K.lab_tile : K.concrete) : K.sandstone);
    }
    ctx.ring(cx, cz, 10, y + 1, y + 2, K.white_render);
    ctx.shellSphere(cx, y + 3, cz, 10, K.glass);
    for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.78; ctx.box(Math.round(cx + Math.cos(a) * 10), y + 1, Math.round(cz + Math.sin(a) * 10), Math.round(cx + Math.cos(a) * 10), y + 7, Math.round(cz + Math.sin(a) * 10), K.aluminum_cladding); }
    ctx.box(cx + 10, y + 1, cz, cx + 10, y + 3, cz, 0);
    ctx.put(cx, y + 1, cz, K.holo_table); ctx.put(cx - 3, y + 1, cz + 2, K.potted_plant); ctx.put(cx + 3, y + 1, cz - 3, K.terminal, 3); ctx.put(cx - 4, y + 1, cz - 3, K.research_station, 0);
    ctx.put(cx + 3, y + 1, cz + 4, K.supply_crate, 0); ctx.put(cx, y + 6, cz, K.lamp_cold);
    // lab block
    ctx.shell(cx - 21, y + 1, cz - 8, cx - 13, y + 4, cz + 4, K.white_render); ctx.box(cx - 21, y + 5, cz - 8, cx - 13, y + 5, cz + 4, K.concrete);
    ctx.box(cx - 19, y + 2, cz + 4, cx - 15, y + 3, cz + 4, K.glass); ctx.door(cx - 17, y + 1, cz + 4, 0, K.airlock_door);
    ctx.put(cx - 20, y + 1, cz - 6, K.server_rack, 3); ctx.put(cx - 20, y + 1, cz - 4, K.lab_bench); ctx.put(cx - 15, y + 1, cz - 6, K.centrifuge, 1); ctx.put(cx - 18, y + 4, cz - 2, K.cleanroom_panel);
    ctx.put(cx - 14, y + 1, cz - 3, K.supply_crate, 1);
    // solar field
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { ctx.put(cx + 12 + c * 2, y + 1, cz - 14 + r * 4, K.solar_panel); ctx.put(cx + 12 + c * 2, y, cz - 13 + r * 4, K.copper_cable); }
    // radar dishes
    for (const [dx, dz] of [[-6, 16], [6, 18]]) { ctx.box(cx + dx, y + 1, cz + dz, cx + dx, y + 6, cz + dz, K.steel_beam); ctx.put(cx + dx, y + 7, cz + dz, K.radar_dish, 2); }
    ctx.box(cx + 18, y + 1, cz + 12, cx + 18, y + 20, cz + 12, K.comm_antenna);
  },
});

// ---- snow installation
SITE_KINDS.push({
  id: 'snow_base', name: 'Frostline Installation', tag: 'snow', cell: 128, extent: 40, prob: 0.7, salt: 700, biomes: ['snow'], jitter: 30, poi: true,
  build(ctx, s, g) {
    const cx = s.x, cz = s.z, y = s.y;
    for (let dx = -30; dx <= 30; dx++) for (let dz = -22; dz <= 22; dz++) {
      const wx = cx + dx, wz = cz + dz;
      if (wx < ctx.x0 || wx > ctx.x0 + 15 || wz < ctx.z0 || wz > ctx.z0 + 15) continue;
      const th = g.heightAt(wx, wz);
      if (th < y) ctx.box(wx, th, wz, wx, y - 1, wz, K.permafrost);
      ctx.box(wx, y + 1, wz, wx, y + 20, wz, 0);
      ctx.put(wx, y, wz, Math.abs(dx) > 28 || Math.abs(dz) > 20 ? K.snow : (dx + dz) % 9 === 0 ? K.hazard_block : K.concrete);
    }
    ctx.shell(cx - 30, y + 1, cz - 22, cx + 30, y + 2, cz + 22, K.chain_link);
    ctx.box(cx - 1, y + 1, cz - 22, cx + 1, y + 2, cz - 22, 0);
    // hangar (half-cylinder along x)
    for (let dx = -26; dx <= -4; dx++) for (let dz = -9; dz <= 9; dz++) for (let yy = 0; yy <= 9; yy++) {
      const r = Math.hypot(dz, yy);
      if (r <= 9.3 && r > 8 && !(dx === -4 && Math.abs(dz) < 5 && yy < 6)) ctx.put(cx + dx, y + 1 + yy, cz - 10 + dz, yy % 4 === 3 ? K.hex_plate : K.corrugated_metal);
    }
    ctx.box(cx - 26, y + 1, cz - 18, cx - 26, y + 9, cz - 2, K.corrugated_metal);
    ctx.box(cx - 25, y, cz - 18, cx - 5, y, cz - 2, K.industrial_floor);
    for (let k = 0; k < 5; k++) { ctx.put(cx - 22 + k * 3, y + 1, cz - 15, K.container_green); ctx.put(cx - 22 + k * 3, y + 1, cz - 5, K.supply_crate, 2); }
    for (let x = cx - 24; x < cx - 5; x += 6) ctx.put(x, y + 8, cz - 10, K.floodlight, 2);
    ctx.put(cx - 24, y + 1, cz - 10, K.workbench, 0); ctx.put(cx - 24, y + 1, cz - 9, K.arc_smelter, 0);
    // bunker
    ctx.box(cx + 6, y + 1, cz - 6, cx + 16, y + 4, cz + 4, K.bunker_wall);
    ctx.box(cx + 7, y + 1, cz - 5, cx + 15, y + 3, cz + 3, 0);
    ctx.door(cx + 11, y + 1, cz + 4, 0, K.blast_door); ctx.box(cx + 10, y + 1, cz + 4, cx + 12, y + 3, cz + 4, K.bunker_wall); ctx.door(cx + 11, y + 1, cz + 4, 0, K.blast_door);
    ctx.put(cx + 8, y + 1, cz - 4, K.terminal, 3); ctx.put(cx + 14, y + 1, cz - 4, K.vault_safe, 2); ctx.put(cx + 8, y + 1, cz + 2, K.bed, 0); ctx.put(cx + 14, y + 1, cz + 2, K.supply_crate, 1); ctx.put(cx + 11, y + 3, cz - 2, K.emergency_light);
    // radar dome
    ctx.shellSphere(cx + 18, y + 6, cz + 14, 7, K.aluminum_cladding);
    for (const [px, pz] of [[11, 7], [25, 7], [11, 21], [25, 21]]) ctx.box(cx + px - 0 + 0, y + 1, cz + pz - 0, cx + px, y + 6, cz + pz, K.steel_beam);
    ctx.box(cx + 18, y + 13, cz + 14, cx + 18, y + 22, cz + 14, K.comm_antenna); ctx.put(cx + 18, y + 23, cz + 14, K.emergency_light);
    // watchtowers
    for (const px of [-28, 28]) { for (const [a, b] of [[0, 0], [2, 0], [0, 2], [2, 2]]) ctx.box(cx + px + a, y + 1, cz - 20 + b, cx + px + a, y + 12, cz - 20 + b, K.steel_truss); ctx.shell(cx + px, y + 13, cz - 20, cx + px + 2, y + 14, cz - 18, K.aluminum_cladding); ctx.box(cx + px, y + 15, cz - 20, cx + px + 2, y + 15, cz - 18, K.steel_plating); ctx.put(cx + px + 1, y + 13, cz - 19, K.floodlight, 0); }
    for (let k = 0; k < 14; k++) ctx.putAir(cx - 28 + Math.floor(R(s, k, 1, 4) * 56), y + 1, cz - 20 + Math.floor(R(s, k, 2, 4) * 40), K.snow);
  },
});

// ---- forest cabin
SITE_KINDS.push({
  id: 'cabin', name: 'Ranger Cabin', tag: 'forest', cell: 56, extent: 12, prob: 0.4, salt: 800, biomes: ['forest', 'plains'], jitter: 20, poi: true,
  build(ctx, s, g) {
    const x0 = s.x - 4, z0 = s.z - 3, y = s.y;
    for (let x = x0 - 2; x <= x0 + 10; x++) for (let z = z0 - 2; z <= z0 + 9; z++) {
      if (x < ctx.x0 || x > ctx.x0 + 15 || z < ctx.z0 || z > ctx.z0 + 15) continue;
      const th = g.heightAt(x, z);
      if (th < y) ctx.box(x, th, z, x, y - 1, z, K.dirt);
      ctx.box(x, y + 1, z, x, y + 9, z, 0);
      ctx.put(x, y, z, K.dirt);
    }
    ctx.box(x0, y, z0, x0 + 8, y, z0 + 6, K.timber_planks);
    ctx.shell(x0, y + 1, z0, x0 + 8, y + 3, z0 + 6, K.timber_planks);
    for (const [px, pz] of [[0, 0], [8, 0], [0, 6], [8, 6]]) ctx.box(x0 + px, y + 1, z0 + pz, x0 + px, y + 3, z0 + pz, K.timber_log);
    ctx.door(x0 + 4, y + 1, z0, 2, K.steel_door);
    ctx.put(x0 + 2, y + 2, z0, K.glass); ctx.put(x0 + 6, y + 2, z0, K.glass); ctx.put(x0, y + 2, z0 + 3, K.glass); ctx.put(x0 + 8, y + 2, z0 + 3, K.glass);
    for (let k = 0; k <= 4; k++) {
      const za = z0 - 1 + k, zb = z0 + 7 - k, yy = y + 4 + k;
      if (za > zb) break;
      if (za === zb) { ctx.box(x0 - 1, yy, za, x0 + 9, yy, za, K.timber_planks); break; }
      ctx.box(x0 - 1, yy, za, x0 + 9, yy, za, K.timber_planks_stairs, 2); ctx.box(x0 - 1, yy, zb, x0 + 9, yy, zb, K.timber_planks_stairs, 0);
      ctx.box(x0, yy, z0 + k, x0, yy, z0 + 6 - k, K.timber_planks); ctx.box(x0 + 8, yy, z0 + k, x0 + 8, yy, z0 + 6 - k, K.timber_planks);
    }
    ctx.put(x0 + 1, y + 1, z0 + 5, K.bed, 0); ctx.put(x0 + 7, y + 1, z0 + 5, K.workbench, 2); ctx.put(x0 + 7, y + 1, z0 + 1, K.storage_crate, 0); ctx.put(x0 + 1, y + 1, z0 + 1, K.bookshelf, 0);
    ctx.put(x0 + 4, y + 3, z0 + 3, K.lamp_warm); ctx.put(x0 + 4, y + 1, z0 + 3, K.dining_table);
    ctx.put(x0 + 11, y + 1, z0 + 2, K.slag_block); ctx.put(x0 + 11, y + 2, z0 + 2, K.glow_cap); ctx.put(x0 + 12, y + 1, z0 + 2, K.timber_log); ctx.put(x0 + 10, y + 1, z0 + 3, K.timber_log);
    ctx.put(x0 + 4, y + 1, z0 - 2, K.wildflower_red);
  },
});

// ---- hidden bunker
SITE_KINDS.push({
  id: 'bunker', name: 'Sealed Bunker', tag: 'lab', cell: 96, extent: 16, prob: 0.35, salt: 900, biomes: ['forest', 'plains', 'snow', 'desert', 'suburb'], jitter: 40, poi: true,
  build(ctx, s, g) {
    const x = s.x, z = s.z, y = g.heightAt(x, z), by = y - 14;
    if (by < 8) return;
    ctx.box(x - 8, by, z - 5, x + 8, by + 5, z + 5, K.reinforced_concrete);
    ctx.box(x - 7, by + 1, z - 4, x + 7, by + 4, z + 4, 0);
    ctx.box(x - 7, by, z - 4, x + 7, by, z + 4, K.industrial_floor);
    ctx.box(x - 2, by + 1, z - 4, x - 2, by + 4, z + 4, K.steel_plating); ctx.box(x + 3, by + 1, z - 4, x + 3, by + 4, z + 4, K.steel_plating);
    ctx.box(x - 2, by + 1, z, x - 2, by + 3, z, 0); ctx.box(x + 3, by + 1, z, x + 3, by + 3, z, 0);
    ctx.door(x - 2, by + 1, z, 3, K.steel_door); ctx.door(x + 3, by + 1, z, 3, K.blast_door);
    ctx.box(x - 1, by + 1, z + 1, x + 2, by + 1, z + 1, 0);
    ctx.put(x - 6, by + 1, z - 3, K.bed, 0); ctx.put(x - 6, by + 1, z + 3, K.bed, 2); ctx.put(x - 4, by + 1, z - 3, K.supply_crate, 0); ctx.put(x - 4, by + 1, z + 3, K.storage_crate, 0);
    ctx.put(x + 5, by + 1, z - 3, K.terminal, 1); ctx.put(x + 6, by + 1, z + 3, K.vault_safe, 2); ctx.put(x + 6, by + 1, z - 3, K.fabricator, 1);
    ctx.put(x, by + 4, z - 2, K.emergency_light); ctx.put(x - 5, by + 4, z, K.lamp_cold); ctx.put(x + 5, by + 4, z, K.lamp_cold);
    // shaft
    ctx.box(x - 1, by + 2, z - 1, x + 1, y + 1, z + 1, K.reinforced_concrete);
    ctx.box(x, by + 1, z - 1, x, y + 1, z, 0);
    ctx.box(x, by + 1, z, x, y, z, K.ladder, 0);
    ctx.box(x, by + 1, z + 1, x, by + 4, z + 1, K.reinforced_concrete);
    ctx.box(x - 2, y, z - 2, x + 2, y, z + 2, K.concrete);
    ctx.put(x, y + 1, z, 0); ctx.put(x, y, z - 1, K.floor_hatch, 0); ctx.put(x, y, z, 0);
    ctx.shell(x - 2, y + 1, z - 2, x + 2, y + 1, z + 2, K.concrete_wall);
    ctx.put(x + 2, y + 2, z, K.warning_sign, 3);
    for (let yy = by + 5; yy < y; yy += 4) ctx.put(x, yy, z - 1, K.emergency_light);
  },
});

// ---- anomaly / research zone
SITE_KINDS.push({
  id: 'monolith_array', name: 'Monolith Array', tag: 'research', cell: 80, extent: 24, prob: 0.9, salt: 1000, biomes: ['research'], jitter: 30, poi: true,
  build(ctx, s, g) {
    const cx = s.x, cz = s.z, y = s.y;
    for (let dx = -18; dx <= 18; dx++) for (let dz = -18; dz <= 18; dz++) {
      const wx = cx + dx, wz = cz + dz;
      if (wx < ctx.x0 || wx > ctx.x0 + 15 || wz < ctx.z0 || wz > ctx.z0 + 15) continue;
      const d = Math.hypot(dx, dz);
      if (d > 17.5) continue;
      const th = g.heightAt(wx, wz);
      if (th < y) ctx.box(wx, th, wz, wx, y - 1, wz, K.basalt);
      ctx.box(wx, y + 1, wz, wx, y + 40, wz, 0);
      ctx.put(wx, y, wz, d < 5 ? K.relic_panel : d < 14 && ((dx + dz) & 3) === 0 ? K.relic_panel : K.ash);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 6.2832, px = Math.round(cx + Math.cos(a) * 13), pz = Math.round(cz + Math.sin(a) * 13);
      const hgt = 7 + Math.floor(R(s, k, 1, 3) * 7);
      ctx.box(px, y + 1, pz, px, y + hgt, pz, K.monolith);
      ctx.put(px, y + hgt + 1, pz, K.glow_crystal);
    }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.2832 + 0.4; ctx.put(Math.round(cx + Math.cos(a) * 8), y + 1, Math.round(cz + Math.sin(a) * 8), K.anomaly_crystal); }
    ctx.box(cx - 2, y + 1, cz - 2, cx + 2, y + 1, cz + 2, K.steel_plating);
    ctx.put(cx, y + 2, cz, K.quantum_core);
    for (let yy = 3; yy < 30; yy++) { const r = Math.max(0, 2 - Math.floor(yy / 12)); ctx.box(cx - r, y + yy, cz - r, cx + r, y + yy, cz + r, K.monolith); }
    ctx.put(cx, y + 30, cz, K.zerite_block); ctx.box(cx, y + 31, cz, cx, y + 38, cz, K.neon_cyan);
    ctx.put(cx + 3, y + 2, cz, K.supply_crate, 3);
  },
});

// ---- underground laboratory
SITE_KINDS.push({
  id: 'sublevel_lab', name: 'Sublevel Laboratory', tag: 'lab', cell: 112, extent: 22, prob: 0.55, salt: 1100, jitter: 30, poi: true, minY: 44,
  build(ctx, s, g) {
    const cx = s.x, cz = s.z, ly = 20, h = g.heightAt(cx, cz + 0);
    if (h < 40) return;
    ctx.box(cx - 16, ly - 1, cz - 16, cx + 16, ly + 9, cz + 16, K.reinforced_concrete);
    const carve = (a: number, b: number, c: number, d: number, f = K.lab_tile) => { ctx.box(cx + a, ly + 1, cz + b, cx + c, ly + 8, cz + d, 0); ctx.box(cx + a, ly, cz + b, cx + c, ly, cz + d, f); };
    carve(-5, -5, 5, 5); carve(6, -1, 9, 1, K.industrial_floor); carve(-9, -1, -6, 1, K.industrial_floor); carve(-1, 6, 1, 9, K.industrial_floor); carve(-1, -9, 1, -6, K.industrial_floor);
    carve(10, -5, 15, 5); carve(-15, -5, -10, 5, K.lab_tile); carve(-5, 10, 5, 15, K.industrial_floor); carve(-5, -15, 5, -10);
    // ceilings lights
    for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, 0]]) ctx.put(cx + a, ly + 8, cz + b, K.cleanroom_panel);
    for (const [a, b] of [[12, 0], [-12, 0], [0, 12], [0, -12], [7, 0], [-7, 0], [0, 7], [0, -7]]) ctx.put(cx + a, ly + 8, cz + b, a === 0 && b === 12 ? K.emergency_light : K.cleanroom_panel);
    // central reactor
    ctx.box(cx - 2, ly + 1, cz - 2, cx + 2, ly + 1, cz + 2, K.steel_plating);
    ctx.put(cx, ly + 2, cz, K.quantum_core);
    for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) { ctx.box(cx + a, ly + 1, cz + b, cx + a, ly + 7, cz + b, K.containment_cell); }
    ctx.put(cx - 4, ly + 1, cz, K.terminal, 3); ctx.put(cx + 4, ly + 1, cz, K.terminal, 1);
    // doors in arms
    ctx.door(cx + 7, ly + 1, cz, 3, K.blast_door); ctx.door(cx - 7, ly + 1, cz, 1, K.airlock_door); ctx.door(cx, ly + 1, cz - 7, 2, K.airlock_door); ctx.door(cx, ly + 1, cz + 7, 0, K.blast_door);
    ctx.box(cx + 7, ly + 1, cz - 1, cx + 7, ly + 3, cz - 1, K.steel_plating); ctx.box(cx + 7, ly + 1, cz + 1, cx + 7, ly + 3, cz + 1, K.steel_plating);
    // east: cryo + tanks
    for (let k = -3; k <= 3; k += 3) { ctx.put(cx + 14, ly + 1, cz + k, K.cryo_pod, 3); ctx.put(cx + 11, ly + 1, cz + k, K.specimen_tank); }
    ctx.put(cx + 12, ly + 1, cz + 4, K.supply_crate, 3);
    // west: servers
    for (let k = -4; k <= 4; k += 2) { ctx.put(cx - 14, ly + 1, cz + k, K.server_rack, 1); }
    ctx.put(cx - 11, ly + 1, cz - 4, K.research_station, 1); ctx.put(cx - 11, ly + 1, cz + 4, K.fabricator, 1); ctx.put(cx - 11, ly + 1, cz, K.holo_table); ctx.put(cx - 12, ly + 1, cz + 3, K.supply_crate, 1);
    // north: biology
    for (let k = -4; k <= 4; k += 2) { ctx.put(cx + k, ly + 1, cz - 14, K.lab_bench); ctx.put(cx + k, ly + 1, cz - 11, k % 4 === 0 ? K.centrifuge : K.fume_hood, 0); }
    // south: vault
    ctx.put(cx - 3, ly + 1, cz + 14, K.vault_safe, 2); ctx.put(cx + 3, ly + 1, cz + 14, K.vault_safe, 2); ctx.put(cx, ly + 1, cz + 14, K.supply_crate, 2); ctx.put(cx + 4, ly + 1, cz + 11, K.supply_crate, 2);
    for (let k = 0; k < 10; k++) { const rx = Math.floor((R(s, k, 1, 5) - 0.5) * 28), rz = Math.floor((R(s, k, 2, 5) - 0.5) * 28); if (ctx.get(cx + rx, ly + 1, cz + rz) === 0) ctx.put(cx + rx, ly + 1, cz + rz, K.rubble); }
    ctx.put(cx + 2, ly + 1, cz + 3, K.radiation_sign, 0); ctx.put(cx - 8, ly + 3, cz - 2, K.biohazard_sign, 3);
    // shaft in N room corner + surface hut
    const sx = cx + 4, sz = cz - 14;
    ctx.box(sx - 1, ly + 1, sz - 2, sx + 1, h + 5, sz + 1, K.reinforced_concrete);
    ctx.box(sx, ly + 1, sz - 1, sx, h + 3, sz, 0);
    ctx.box(sx, ly + 1, sz, sx, h + 3, sz, K.ladder, 0);
    ctx.box(sx, ly + 1, sz + 1, sx, ly + 8, sz + 1, K.reinforced_concrete);
    ctx.box(sx, ly + 1, sz - 1, sx, ly + 1, sz - 1, K.lab_tile);
    ctx.box(sx, ly + 1, sz - 1, sx, ly + 3, sz - 2, 0);
    ctx.box(sx - 3, h + 1, sz - 4, sx + 3, h + 4, sz + 2, 0);
    ctx.shell(sx - 3, h + 1, sz - 4, sx + 3, h + 4, sz + 2, K.concrete);
    ctx.box(sx - 3, h + 5, sz - 4, sx + 3, h + 5, sz + 2, K.concrete);
    ctx.box(sx - 2, h, sz - 3, sx + 2, h, sz + 1, K.industrial_floor);
    ctx.box(sx, h, sz - 1, sx, h + 4, sz, 0); ctx.box(sx, h + 1, sz, sx, h + 3, sz, K.ladder, 0);
    ctx.box(sx, h + 1, sz + 1, sx, h + 4, sz + 1, K.reinforced_concrete);
    ctx.door(sx, h + 1, sz - 4, 2, K.blast_door);
    ctx.put(sx + 2, h + 3, sz - 2, K.emergency_light); ctx.put(sx - 2, h + 1, sz - 2, K.terminal, 1); ctx.put(sx + 2, h + 1, sz - 2, K.radiation_sign, 0);
    for (let yy = ly + 4; yy < h; yy += 4) ctx.put(sx, yy, sz - 1, K.emergency_light);
  },
});

export const siteKindById = (id: string) => SITE_KINDS.find((k) => k.id === id);
