import { describe, it, expect, beforeAll } from 'vitest';
// @ts-ignore
import { WgslReflect } from '../../node_modules/wgsl_reflect/wgsl_reflect.module.js';
import { registerBaseContent } from '../content';
import { Reg, setStrictIds, ID } from '../engine/registry';
import { Game, DEFAULT_SETTINGS, runCommand } from '../game/core';
import { COMMON, TERRAIN, SHADOW, SKY, DYN, BLOOM, POST } from '../render/shaders';
import type { WorldMeta } from '../save/persist';

beforeAll(() => { setStrictIds(true); registerBaseContent(); });

describe('wgsl', () => {
  it('parses every shader module', () => {
    for (const [n, code] of Object.entries({ terrain: COMMON + TERRAIN, shadow: SHADOW, sky: COMMON + SKY, dyn: COMMON + DYN, bloom: BLOOM, post: COMMON + POST })) {
      expect(() => new WgslReflect(code), n).not.toThrow();
    }
  });
});

describe('game (headless)', () => {
  it('streams chunks, walks, mines, places, crafts', async () => {
    const meta: WorldMeta = { id: 't', name: 't', seed: 99, mode: 'survival', created: 0, played: 0, version: 1 };
    const g = new Game(null, null, meta, { ...DEFAULT_SETTINGS, viewDist: 4 });
    await g.init();
    expect(g.world.chunks.size).toBeGreaterThan(10);
    // fall to the ground
    for (let i = 0; i < 200; i++) g.update(0.016);
    expect(g.p.onGround).toBe(true);
    // walk
    const x0 = g.p.x, z0 = g.p.z;
    g.locked = true; g.keys.add('KeyW');
    for (let i = 0; i < 120; i++) g.update(0.016);
    expect(Math.hypot(g.p.x - x0, g.p.z - z0)).toBeGreaterThan(2);
    g.keys.clear();
    // mine the block below
    const bx = Math.floor(g.p.x), bz = Math.floor(g.p.z), by = Math.floor(g.p.y) - 1;
    const id = g.world.getBlock(bx, by, bz);
    expect(id).not.toBe(0);
    g.breakBlock(bx, by, bz, null);
    expect(g.world.getBlock(bx, by, bz)).toBe(0);
    // placing
    g.addItem('concrete', 4);
    g.target = { x: bx, y: by - 1, z: bz, nx: 0, ny: 1, nz: 0, t: 1, id: g.world.getBlock(bx, by - 1, bz) } as any;
    g.eyeRay = { x: g.p.x, y: g.p.y + 1.6, z: g.p.z, dx: 0, dy: -1, dz: 0 };
    expect(g.placeBlock(g.target!, Reg.byKey.get('concrete')!)).toBe(true);
    expect(g.world.getBlock(bx, by, bz)).toBe(ID.concrete);
    // crafting
    g.addItem('timber_log', 2);
    const r = Reg.recipes.find((q) => q.out === 'timber_planks')!;
    expect(g.craft(r)).toBe(true);
    expect(g.count('timber_planks')).toBeGreaterThanOrEqual(4);
    // simulation systems tick without throwing
    g.sim.spawnMachine('scrapper', g.p.x + 5, g.p.y, g.p.z);
    for (let i = 0; i < 200; i++) g.update(0.05);
    g.render(0.016);
    expect(runCommand(g, '/help')).toMatch(/Commands/);
    expect(runCommand(g, '/give scanner 1')).toBe('Given');
  }, 60000);

  it('power grid: solar + lamp', async () => {
    const meta: WorldMeta = { id: 't2', name: 't', seed: 5, mode: 'creative', created: 0, played: 0, version: 1 };
    const g = new Game(null, null, meta, { ...DEFAULT_SETTINGS, viewDist: 3 });
    await g.init();
    const x = Math.floor(g.p.x), z = Math.floor(g.p.z), y = g.world.topY(x, z) + 6;
    g.time = 0.5; g.dayFactor = 1;
    g.setBlock(x, y, z, ID.fusion_cell, 0, true);
    g.tile(`${x},${y},${z}`).fuel = 1000;
    g.setBlock(x + 1, y, z, ID.copper_cable, 0, true);
    g.setBlock(x + 2, y, z, ID.floodlight, 0, true);
    for (let i = 0; i < 4; i++) g.sim.update(0.5);
    expect(g.world.getState(x + 2, y, z) & 32).toBe(32);
  }, 60000);
});
