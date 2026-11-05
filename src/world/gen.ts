/**
 * Procedural + designed world generation. Fully deterministic per (seed, chunk), independent of load order:
 * structures are described by grid "sites" and drawn (clipped) into every chunk they overlap.
 */
import { Noise, hash01, hashInt } from '../engine/noise';
import { smoothstep, lerp } from '../engine/math';
import { ID, Reg } from '../engine/registry';
import { Chunk, CS, CH, SEA, Gen } from './world';
import { SITE_KINDS, SiteKind, Site, Ctx } from './structures';

export type BiomeId = string;
export interface Climate { temp: number; moist: number; urban: number; ind: number; elev: number; rz: number; dead: number }

export const BIOME_INFO: Record<string, { name: string; tag: string; fog: [number, number, number]; ambience: string; music: string }> = {
  plains: { name: 'Fallow Plains', tag: 'forest', fog: [0.62, 0.74, 0.86], ambience: 'wind', music: 'explore' },
  forest: { name: 'Overgrown Woods', tag: 'forest', fog: [0.5, 0.66, 0.64], ambience: 'forest', music: 'explore' },
  desert: { name: 'Aridlands', tag: 'desert', fog: [0.82, 0.74, 0.58], ambience: 'desert', music: 'explore' },
  snow: { name: 'Frostline', tag: 'snow', fog: [0.74, 0.82, 0.9], ambience: 'blizzard', music: 'explore' },
  mountain: { name: 'Spine Range', tag: 'mountain', fog: [0.6, 0.68, 0.78], ambience: 'wind', music: 'explore' },
  snowpeak: { name: 'Whiteout Peaks', tag: 'mountain', fog: [0.78, 0.84, 0.92], ambience: 'blizzard', music: 'explore' },
  metropolis: { name: 'Dead Metropolis', tag: 'city', fog: [0.55, 0.6, 0.68], ambience: 'city', music: 'city' },
  suburb: { name: 'Quiet Suburbs', tag: 'suburb', fog: [0.62, 0.7, 0.78], ambience: 'suburb', music: 'explore' },
  industrial: { name: 'Industrial District', tag: 'industrial', fog: [0.6, 0.58, 0.55], ambience: 'industrial', music: 'city' },
  research: { name: 'Anomaly Zone', tag: 'research', fog: [0.5, 0.45, 0.62], ambience: 'anomaly', music: 'discovery' },
};

export class Generator implements Gen {
  nCont: Noise; nDet: Noise; nElev: Noise; nTemp: Noise; nMoist: Noise; nUrban: Noise; nInd: Noise; nRz: Noise; nDead: Noise; nRiver: Noise; nCave: Noise; nCave2: Noise; nMisc: Noise;
  heightCache = new Map<number, number>();
  constructor(public seed: number) {
    const s = (k: number) => new Noise(seed * 31 + k * 977);
    this.nCont = s(1); this.nDet = s(2); this.nElev = s(3); this.nTemp = s(4); this.nMoist = s(5); this.nUrban = s(6);
    this.nInd = s(7); this.nRz = s(8); this.nDead = s(9); this.nRiver = s(10); this.nCave = s(11); this.nCave2 = s(12); this.nMisc = s(13);
  }

  climate(x: number, z: number): Climate {
    const j = this.nMisc.n2(x / 14, z / 14) * 0.03;
    return {
      temp: this.nTemp.fbm2(x / 780, z / 780, 2) * 1.5 + j,
      moist: this.nMoist.fbm2(x / 640, z / 640, 2) * 1.5 + j,
      urban: this.nUrban.fbm2(x / 620, z / 620, 2) * 1.5 + 0.06 + j,
      ind: this.nInd.fbm2(x / 380, z / 380, 2) * 1.5,
      elev: this.nElev.fbm2(x / 520, z / 520, 3) * 1.4,
      rz: this.nRz.fbm2(x / 700, z / 700, 2) * 1.6 + j,
      dead: this.nDead.fbm2(x / 90, z / 90, 2),
    };
  }
  biomeOf(c: Climate, x = 0, z = 0): BiomeId {
    const m = smoothstep(0.2, 0.45, c.elev);
    if (m > 0.5) return c.temp < -0.05 ? 'snowpeak' : 'mountain';
    for (const b of Reg.biomes) {
      if (c.temp >= b.temp[0] && c.temp <= b.temp[1] && c.moist >= b.moist[0] && c.moist <= b.moist[1] && hash01(Math.floor(x / 256), Math.floor(z / 256), 7, this.seed) < (b.rarity ?? 0.3)) return b.key;
    }
    if (c.rz > 0.62) return 'research';
    if (c.urban > 0.3) {
      if (c.ind > 0.22) return 'industrial';
      if (c.urban > 0.5) return 'metropolis';
      return 'suburb';
    }
    if (c.temp > 0.3 && c.moist < 0.1) return 'desert';
    if (c.temp < -0.3) return 'snow';
    if (c.moist > 0.08) return 'forest';
    return 'plains';
  }
  biomeAt(x: number, z: number): BiomeId { return this.biomeOf(this.climate(x, z), x, z); }

  heightAt(x: number, z: number, c?: Climate): number {
    x = Math.floor(x); z = Math.floor(z);
    const ck = x * 73856093 ^ z * 19349663;
    const cached = this.heightCache.get(ck);
    if (cached !== undefined) return cached;
    const cl = c ?? this.climate(x, z);
    let h = 46 + this.nCont.fbm2(x / 260, z / 260, 3) * 16 + this.nDet.fbm2(x / 38, z / 38, 3) * 4;
    const r = Math.abs(this.nRiver.n2(x / 230 + 50, z / 230));
    if (r < 0.05) h -= ((0.05 - r) / 0.05) * 9;
    const mt = smoothstep(0.2, 0.5, cl.elev);
    if (mt > 0) h += mt * (this.nElev.ridged2(x / 150, z / 150, 4) * 62 + 8);
    const dw = smoothstep(0.2, 0.4, cl.temp) * (1 - smoothstep(0.05, 0.15, cl.moist));
    if (dw > 0) h += dw * (this.nDet.n2(x / 34, z / 34) * 5 + 3);
    const u = smoothstep(0.1, 0.22, cl.urban) * (1 - mt);
    if (u > 0) h = lerp(h, 46, u);
    if (cl.rz > 0.5) h = lerp(h, 48 + this.nDet.n2(x / 20, z / 20) * 2, smoothstep(0.5, 0.65, cl.rz) * (1 - mt));
    h = Math.max(4, Math.min(CH - 8, Math.floor(h)));
    if (this.heightCache.size > 200000) this.heightCache.clear();
    this.heightCache.set(ck, h);
    return h;
  }

  findSpawn(): { x: number; z: number; y: number } {
    let best = { x: 0, z: 0, y: 60 }, bestScore = -1;
    for (let r = 0; r <= 640; r += 32) {
      const steps = Math.max(1, Math.floor((r * 6.28) / 48));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * 6.283, x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        const h = this.heightAt(x, z);
        if (h <= SEA + 1) continue;
        const b = this.biomeAt(x, z);
        if (b === 'metropolis' || b === 'industrial' || b === 'mountain' || b === 'snowpeak' || b === 'research') continue;
        const seen = new Set<string>();
        for (let q = 0; q < 8; q++) seen.add(this.biomeAt(x + Math.cos(q * 0.785) * 140, z + Math.sin(q * 0.785) * 140));
        const score = seen.size * 10 - r * 0.02 + (seen.has('metropolis') ? 8 : 0);
        if (score > bestScore) { bestScore = score; best = { x, z, y: h + 2 }; }
      }
      if (bestScore > 38) break;
    }
    return best;
  }

  /** Landmarks / points of interest around a position (for discovery + minimap). */
  sitesAround(x: number, z: number, r: number): Site[] {
    const out: Site[] = [];
    for (const k of SITE_KINDS) {
      if (!k.poi) continue;
      for (let i = Math.floor((x - r) / k.cell); i <= Math.floor((x + r) / k.cell); i++)
        for (let j = Math.floor((z - r) / k.cell); j <= Math.floor((z + r) / k.cell); j++) {
          const s = this.siteFor(k, i, j);
          if (s && Math.hypot(s.x - x, s.z - z) <= r) out.push(s);
        }
    }
    return out;
  }
  private siteCache = new Map<string, Site | null>();
  siteFor(k: SiteKind, i: number, j: number): Site | null {
    const key = k.id + ':' + i + ':' + j;
    if (this.siteCache.has(key)) return this.siteCache.get(key)!;
    let site: Site | null = null;
    const seed = hashInt(i, j, k.salt, this.seed);
    const p = hash01(i, j, k.salt + 1, this.seed);
    const jx = k.jitter ? Math.floor((hash01(i, j, k.salt + 2, this.seed) - 0.5) * k.jitter) : 0;
    const jz = k.jitter ? Math.floor((hash01(i, j, k.salt + 3, this.seed) - 0.5) * k.jitter) : 0;
    const x = i * k.cell + Math.floor(k.cell / 2) + jx, z = j * k.cell + Math.floor(k.cell / 2) + jz;
    if (p < k.prob) {
      const cl = this.climate(x, z);
      const b = this.biomeOf(cl, x, z);
      if (!k.biomes || k.biomes.includes(b)) {
        const y = this.heightAt(x, z, cl);
        if (!k.minY || y >= k.minY) if (y > SEA + 1 || k.underground) site = { kind: k, i, j, x, z, y, seed, biome: b };
      }
    }
    if (this.siteCache.size > 5000) this.siteCache.clear();
    this.siteCache.set(key, site);
    return site;
  }

  generate(c: Chunk) {
    const x0 = c.cx << 4, z0 = c.cz << 4;
    const K = ID;
    const { blocks } = c;
    const cls: Climate[] = [], bios: BiomeId[] = [], hts: number[] = [];
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const cl = this.climate(x0 + x, z0 + z);
      cls.push(cl); bios.push(this.biomeOf(cl, x0 + x, z0 + z)); hts.push(this.heightAt(x0 + x, z0 + z, cl));
    }
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = z * CS + x, wx = x0 + x, wz = z0 + z, h = hts[col], b = bios[col], cl = cls[col];
      const at = (y: number) => (y << 8) | col;
      let top = K.stone, sub = K.stone, subDepth = 4;
      switch (b) {
        case 'plains': top = cl.dead > 0.12 ? K.dead_grass : K.grass; sub = K.dirt; break;
        case 'forest': top = cl.dead > 0.45 ? K.dead_grass : K.grass; sub = K.dirt; break;
        case 'desert': top = K.sand; sub = this.nMisc.n2(wx / 50, wz / 50) > 0 ? K.sandstone : K.red_sandstone; subDepth = 5; break;
        case 'snow': top = K.snow; sub = K.permafrost; subDepth = 4; break;
        case 'mountain': top = h > 92 ? K.snow : (this.nMisc.n2(wx / 20, wz / 20) > 0.3 ? K.gravel : K.stone); sub = this.nMisc.n2(wx / 40 + 9, wz / 40) > 0.1 ? K.granite : K.stone; subDepth = 3; break;
        case 'snowpeak': top = K.snow; sub = K.granite; subDepth = 3; break;
        case 'metropolis': top = K.concrete; sub = K.stone; subDepth = 2; break;
        case 'suburb': top = cl.dead > 0.1 ? K.dead_grass : K.lawn; sub = K.dirt; break;
        case 'industrial': top = this.nMisc.n2(wx / 12, wz / 12) > 0 ? K.gravel : K.stained_concrete; sub = K.stone; subDepth = 2; break;
        case 'research': top = K.ash; sub = K.basalt; subDepth = 3; break;
        default: {
          const mb = Reg.biomes.find((q) => q.key === b);
          if (mb) { top = K[mb.surface] ?? K.grass; sub = K[mb.filler] ?? K.dirt; }
        }
      }
      if (h <= SEA + 1 && b !== 'metropolis') { top = h < SEA - 3 ? K.gravel : K.sand; sub = K.sand; if (b === 'snow' || b === 'snowpeak') top = K.permafrost; }
      if (h <= SEA && b === 'mountain') { top = K.gravel; }
      blocks[at(0)] = K.bedrock;
      for (let y = 1; y <= h; y++) {
        let id: number;
        if (y === h) id = top;
        else if (y > h - subDepth) id = sub;
        else id = y < 14 + (hashInt(wx, wz, 0, this.seed) & 3) ? K.basalt : K.stone;
        if (y === 1 && hashInt(wx, wz, 1, this.seed) % 3 === 0) id = K.bedrock;
        blocks[at(y)] = id;
      }
      if (h < SEA) for (let y = h + 1; y <= SEA; y++) blocks[at(y)] = (b === 'snow' || b === 'snowpeak') && y === SEA ? K.ice : K.water;
      // caves
      if (h > 12) {
        const ymax = Math.min(h - 5, 72);
        for (let y = 6; y <= ymax; y++) {
          const a = this.nCave.n3(wx * 0.045, y * 0.08, wz * 0.045);
          if (a > 0.46 || Math.abs(this.nCave2.n3(wx * 0.03, y * 0.05 + 40, wz * 0.03)) < 0.045 && a > -0.3) blocks[at(y)] = 0;
        }
      }
    }
    // ores: cell-blob veins
    this.ores(c);
    // mod features
    for (const f of Reg.features) this.feature(c, f);
    // vegetation
    this.vegetation(c, cls, bios, hts);
    // structures
    const ctx = new Ctx(c, this);
    for (const k of SITE_KINDS) {
      const m = k.extent;
      for (let i = Math.floor((x0 - m) / k.cell); i <= Math.floor((x0 + CS + m) / k.cell); i++)
        for (let j = Math.floor((z0 - m) / k.cell); j <= Math.floor((z0 + CS + m) / k.cell); j++) {
          const s = this.siteFor(k, i, j);
          if (s) k.build(ctx, s, this);
        }
    }
    for (const t of Reg.structures) this.templateStructure(ctx, t);
    c.status = 1;
  }

  private ores(c: Chunk) {
    const K = ID, x0 = c.cx << 4, z0 = c.cz << 4;
    const types: { id: number; min: number; max: number; p: number; r: number }[] = [
      { id: K.copper_ore, min: 8, max: 60, p: 0.1, r: 2.1 }, { id: K.ferrite_ore, min: 6, max: 56, p: 0.09, r: 2.2 },
      { id: K.carbon_seam, min: 12, max: 64, p: 0.08, r: 2.4 }, { id: K.bauxite_ore, min: 8, max: 44, p: 0.05, r: 2 },
      { id: K.oil_shale, min: 10, max: 52, p: 0.05, r: 2.6 }, { id: K.lithium_ore, min: 6, max: 34, p: 0.035, r: 1.8 },
      { id: K.titanite_ore, min: 4, max: 28, p: 0.03, r: 1.7 }, { id: K.zerite_ore, min: 2, max: 14, p: 0.018, r: 1.6 },
    ];
    for (let cx = 0; cx < 4; cx++) for (let cz = 0; cz < 4; cz++) for (let cy = 0; cy < CH / 4; cy++) {
      const gx = (c.cx << 2) + cx, gz = (c.cz << 2) + cz;
      const hsh = hash01(gx, cy, gz, this.seed + 55);
      if (hsh > 0.12) continue;
      const t = types[Math.floor(hash01(gx, cy, gz, this.seed + 56) * types.length)];
      const y0 = cy * 4;
      if (y0 < t.min || y0 > t.max || hash01(gx, cy, gz, this.seed + 57) > t.p * 8) continue;
      const ccx = gx * 4 + 1 + hash01(gx, cy, gz, 61) * 2, ccy = y0 + 1 + hash01(gx, cy, gz, 62) * 2, ccz = gz * 4 + 1 + hash01(gx, cy, gz, 63) * 2;
      for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 4; dy++) for (let dz = 0; dz < 4; dz++) {
        const x = gx * 4 + dx, y = y0 + dy, z = gz * 4 + dz;
        if ((x - ccx - 0.5) ** 2 + (y - ccy - 0.5) ** 2 + (z - ccz - 0.5) ** 2 > t.r * t.r * 0.9) continue;
        const i = (y << 8) | ((z - z0) << 4) | (x - x0);
        const cur = c.blocks[i];
        if (cur === K.stone || cur === K.basalt || cur === K.granite) c.blocks[i] = t.id;
      }
    }
  }
  private feature(c: Chunk, f: { block: string; replace?: string; minY: number; maxY: number; size: number; perChunk: number }) {
    const id = ID[f.block], rep = ID[f.replace ?? 'stone'], x0 = c.cx << 4, z0 = c.cz << 4;
    if (!id) return;
    for (let n = 0; n < f.perChunk; n++) {
      const sd = hashInt(c.cx, c.cz, n, this.seed + hashInt(f.block.length, f.minY, f.size, 5));
      const cx = (sd & 15), cz = (sd >> 4) & 15, cy = f.minY + ((sd >> 8) % Math.max(1, f.maxY - f.minY));
      const r = Math.max(1, f.size / 2);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
        const x = cx + dx, z = cz + dz, y = cy + dy;
        if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y >= CH) continue;
        const i = (y << 8) | (z << 4) | x;
        if (c.blocks[i] === rep) c.blocks[i] = id;
      }
    }
    void x0; void z0;
  }

  private vegetation(c: Chunk, _cls: Climate[], bios: BiomeId[], hts: number[]) {
    const K = ID, x0 = c.cx << 4, z0 = c.cz << 4;
    const set = (x: number, y: number, z: number, id: number, onlyAir = true) => {
      const lx = x - x0, lz = z - z0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= CH) return;
      const i = (y << 8) | (lz << 4) | lx;
      if (!onlyAir || c.blocks[i] === 0) c.blocks[i] = id;
    };
    // ground cover
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const col = z * CS + x, b = bios[col], h = hts[col], wx = x0 + x, wz = z0 + z;
      if (h <= SEA) { if ((b === 'plains' || b === 'forest') && h === SEA && hash01(wx, wz, 3, this.seed) < 0.12) set(wx, h + 1, wz, K.reed); continue; }
      const top = c.blocks[(h << 8) | col];
      const r = hash01(wx, wz, 5, this.seed);
      let cover = 0;
      if ((top === K.grass || top === K.lawn) && b !== 'suburb') cover = r < 0.12 ? K.tall_grass : r < 0.135 ? K.wildflower_red : r < 0.15 ? K.wildflower_blue : r < 0.16 && b === 'forest' ? K.fern : r < 0.164 ? K.berry_bush : 0;
      else if (top === K.dead_grass) cover = r < 0.07 ? K.dry_grass : r < 0.085 ? K.dead_bush : 0;
      else if (top === K.sand && b === 'desert') cover = r < 0.012 ? K.cactus : r < 0.03 ? K.dead_bush : 0;
      else if (top === K.ash) cover = r < 0.01 ? K.glow_cap : 0;
      else if (top === K.lawn || (b === 'suburb' && top === K.dead_grass)) cover = r < 0.03 ? K.tall_grass : 0;
      if (cover) set(wx, h + 1, wz, cover);
    }
    // trees: iterate expanded area
    for (let z = -3; z < CS + 3; z++) for (let x = -3; x < CS + 3; x++) {
      const wx = x0 + x, wz = z0 + z;
      const hsh = hash01(wx, wz, 9, this.seed);
      if (hsh > 0.055) continue;
      const cl = this.climate(wx, wz);
      const b = this.biomeOf(cl, wx, wz);
      let dens = 0, kind = 0;
      if (b === 'forest') { dens = 0.055; kind = cl.temp < -0.1 ? 1 : 0; }
      else if (b === 'plains') dens = 0.008;
      else if (b === 'snow') { dens = 0.012; kind = 1; }
      else if (b === 'mountain') { dens = 0.012; kind = 1; }
      else if (b === 'suburb') dens = 0.006;
      else if (b === 'research') { dens = 0.004; kind = 2; }
      if (hsh > dens) continue;
      if (b === 'forest' && cl.dead > 0.45) kind = 2;
      const h = this.heightAt(wx, wz, cl);
      if (h <= SEA + 1 || h > 100) continue;
      if (b === 'suburb' && (((wx % 28) + 28) % 28 < 7 || ((wz % 28) + 28) % 28 < 7)) continue;
      const th = 4 + Math.floor(hash01(wx, wz, 10, this.seed) * 4) + (kind === 1 ? 2 : 0);
      const logId = kind === 1 ? K.pine_log : K.timber_log, leafId = kind === 1 ? K.pine_needles : K.leaves;
      for (let y = 1; y <= th; y++) set(wx, h + y, wz, logId);
      if (kind === 2) { set(wx + 1, h + th - 1, wz, logId); set(wx - 1, h + th - 2, wz, logId); continue; }
      if (kind === 1) {
        for (let ly = 0; ly < th - 1; ly++) {
          const rad = Math.max(0, Math.min(2, Math.floor((th - 1 - ly) / 2)));
          for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (Math.abs(dx) + Math.abs(dz) <= rad + (rad > 1 ? 1 : 0)) set(wx + dx, h + 2 + ly, wz + dz, leafId);
        }
        set(wx, h + th + 1, wz, leafId);
      } else {
        for (let dy = -1; dy <= 2; dy++) {
          const rad = dy >= 2 ? 1 : 2;
          for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
            if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy > 0 || hash01(wx + dx, wz + dz, dy, 77) < 0.5)) continue;
            set(wx + dx, h + th + dy, wz + dz, leafId);
          }
        }
      }
    }
  }

  private templateStructure(ctx: Ctx, t: { key: string; biomes: string[]; rarity: number; palette: Record<string, string>; layers: string[][] }) {
    const w = Math.max(...t.layers.flat().map((r) => r.length)), d = Math.max(...t.layers.map((l) => l.length)), cell = 96;
    const x0 = ctx.c.cx << 4, z0 = ctx.c.cz << 4;
    for (let i = Math.floor((x0 - w) / cell); i <= Math.floor((x0 + 16) / cell); i++)
      for (let j = Math.floor((z0 - d) / cell); j <= Math.floor((z0 + 16) / cell); j++) {
        const sd = hashInt(i, j, t.key.length * 131 + t.key.charCodeAt(0), this.seed + 999);
        if ((sd % 1000) / 1000 > t.rarity) continue;
        const sx = i * cell + 10 + (sd >> 3) % (cell - w - 20), sz = j * cell + 10 + (sd >> 11) % (cell - d - 20);
        const b = this.biomeAt(sx + w / 2, sz + d / 2);
        if (t.biomes.length && !t.biomes.includes(b)) continue;
        const y = this.heightAt(sx + (w >> 1), sz + (d >> 1));
        if (y <= SEA) continue;
        t.layers.forEach((layer, ly) => layer.forEach((row, rz) => { for (let rx = 0; rx < row.length; rx++) { const ch = row[rx]; if (ch === ' ') continue; const k = t.palette[ch]; ctx.put(sx + rx, y + 1 + ly, sz + rz, k === 'air' ? 0 : ID[k] ?? 0); } }));
      }
  }
}
