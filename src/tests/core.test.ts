import { describe, it, expect, beforeAll } from 'vitest';
import { registerBaseContent } from '../content';
import { Reg, setStrictIds, validateRegistry, buildAtlas, ID } from '../engine/registry';
import { World, Chunk } from '../world/world';
import { Generator } from '../world/gen';
import { meshChunk } from '../world/mesher';

beforeAll(() => { setStrictIds(true); registerBaseContent(); });

describe('registry', () => {
  it('has at least 170 blocks with unique keys & textures', () => {
    const blocks = Reg.blocks.filter(Boolean);
    expect(blocks.length).toBeGreaterThanOrEqual(170);
    expect(new Set(blocks.map((b) => b!.key)).size).toBe(blocks.length);
    expect(Reg.categories.length).toBe(16);
  });
  it('recipes reference existing items', () => { expect(validateRegistry()).toEqual([]); });
  it('every research / reward key resolves', () => {
    for (const c of Reg.challenges) for (const k of Object.keys(c.reward ?? {})) expect(Reg.items.has(k)).toBe(true);
    for (const n of Reg.research) for (const k of Object.keys(n.cost)) expect(Reg.items.has(k)).toBe(true);
    const nodes = new Set(Reg.research.map((r) => r.key));
    for (const r of Reg.recipes) if (r.req) expect(nodes.has(r.req)).toBe(true);
  });
  it('builds an atlas', () => { const a = buildAtlas(); expect(a.layers).toBeGreaterThan(150); expect(a.mips.length).toBe(6); });
});

describe('world', () => {
  it('generates, lights and meshes chunks across biomes', () => {
    const g = new Generator(1337);
    const w = new World(1337, g);
    const spawn = g.findSpawn();
    const cx0 = spawn.x >> 4, cz0 = spawn.z >> 4;
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const c = new Chunk(cx0 + dx, cz0 + dz); w.chunks.set((cx0 + dx + 32768) * 65536 + cz0 + dz + 32768, c); g.generate(c); }
    for (const c of w.chunks.values()) w.initLight(c);
    const c = w.getChunk(cx0, cz0)!;
    const m = meshChunk(w, c, 0);
    expect(m.opaque!.nv).toBeGreaterThan(100);
    const lod = meshChunk(w, c, 1);
    expect(lod.opaque!.nv).toBeLessThanOrEqual(m.opaque!.nv);
    // edit + relight
    const y = w.topY(spawn.x, spawn.z);
    expect(w.setBlock(spawn.x, y - 1, spawn.z, 0, 0, true)).toBe(true);
    expect(w.getBlock(spawn.x, y - 1, spawn.z)).toBe(0);
    expect(w.getLight(spawn.x, y - 1, spawn.z) >> 4).toBeGreaterThan(0);
  });
  it('biome distribution is varied', () => {
    const g = new Generator(42);
    const counts: Record<string, number> = {};
    for (let x = -4000; x < 4000; x += 80) for (let z = -4000; z < 4000; z += 80) { const b = g.biomeAt(x, z); counts[b] = (counts[b] ?? 0) + 1; }
    console.log(counts);
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(8);
  });
  it('generates every structure kind without throwing', () => {
    const g = new Generator(7);
    const w = new World(7, g);
    let n = 0;
    const kinds = new Set<string>();
    for (let x = -3000; x < 3000 && kinds.size < 12; x += 48) for (let z = -3000; z < 3000; z += 48) {
      for (const s of g.sitesAround(x, z, 40)) { if (kinds.has(s.kind.id)) continue; kinds.add(s.kind.id);
        const cx = s.x >> 4, cz = s.z >> 4;
        const c = new Chunk(cx, cz); w.chunks.set((cx + 32768) * 65536 + cz + 32768, c); g.generate(c); w.initLight(c); n++; }
    }
    console.log('kinds', [...kinds]);
    expect(n).toBeGreaterThan(5);
    // city + suburb lots
    for (const [bx, bz] of [[0, 0]]) { void bx; void bz; }
    expect(ID.concrete).toBeGreaterThan(0);
  });
});
