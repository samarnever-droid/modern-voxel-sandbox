import { describe, it, expect, beforeAll } from 'vitest';
import { registerBaseContent } from '../content';
import { Reg, setStrictIds, DX, DZ, blockBoxes } from '../engine/registry';
import { Game, DEFAULT_SETTINGS } from '../game/core';
import { Dyn } from '../game/dyn';
import { guideState, guideTick } from '../game/guide';
import type { WorldMeta } from '../save/persist';

beforeAll(() => { setStrictIds(true); registerBaseContent(); });
const mk = async (mode: WorldMeta['mode'] = 'survival') => {
  const meta: WorldMeta = { id: 'l', name: 'l', seed: 7, mode, created: 0, played: 0, version: 1 };
  const g = new Game(null, null, meta, { ...DEFAULT_SETTINGS, viewDist: 4 });
  await g.init(); for (let i = 0; i < 120; i++) g.update(0.016);
  return g;
};

describe('ladders', () => {
  it('has real geometry: rails + rungs, not a slab', () => {
    const b = Reg.byKey.get('ladder')!;
    const boxes = blockBoxes(b, 0);
    expect(boxes.length).toBe(6);
    expect(boxes.every((q) => q.b[5] <= 1 && q.b[2] >= 0.8)).toBe(true);
  });
  it('sticks to the wall that was clicked, extends, can be climbed and pops off', async () => {
    const g = await mk();
    const bx = Math.floor(g.p.x) + 3, bz = Math.floor(g.p.z), by = Math.floor(g.p.y);
    const wall = Reg.byKey.get('concrete')!.id;
    for (let y = by - 1; y <= by + 8; y++) for (let x = bx - 2; x <= bx + 2; x++) for (let z = bz - 2; z <= bz + 2; z++) g.world.setBlock(x, y, z, y < by ? wall : 0, 0, true);
    for (let y = by; y <= by + 8; y++) g.world.setBlock(bx, y, bz, wall, 0, true);
    const lad = Reg.byKey.get('timber_ladder')!;
    // click the -x face of the wall column (normal -1,0,0) from the open side
    g.eyeRay = { x: bx - 2, y: by + 1.5, z: bz + 0.5, dx: 1, dy: 0, dz: 0 };
    const hit = { x: bx, y: by, z: bz, nx: -1, ny: 0, nz: 0, t: 1, id: wall } as any;
    expect(g.placeBlock(hit, lad)).toBe(true);
    const st = g.world.getState(bx - 1, by, bz) & 3;
    expect(DX[st]).toBe(1); expect(DZ[st]).toBe(0); // ladder sits against the wall on its +x side
    // extend upward by clicking the ladder's upper half
    for (let i = 0; i < 4; i++) {
      const top = by + i;
      const h2 = { x: bx - 1, y: top, z: bz, nx: 0, ny: 1, nz: 0, t: 0, id: lad.id } as any;
      expect(g.placeBlock(h2, lad)).toBe(true);
    }
    expect(g.world.getBlock(bx - 1, by + 4, bz)).toBe(lad.id);
    // climb it
    g.p.x = bx - 0.6; g.p.z = bz + 0.5; g.p.y = by; g.p.vx = g.p.vy = g.p.vz = 0; g.p.yaw = -Math.PI / 2; g.locked = true; g.keys.add('KeyW');
    for (let i = 0; i < 100; i++) g.update(0.016);
    expect(g.p.y).toBeGreaterThan(by + 2.5);
    expect(g.stats.climbed).toBeGreaterThan(2);
    g.keys.clear();
    // removing the wall pops the ladder
    g.breakBlock(bx, by + 1, bz, null);
    expect(g.world.getBlock(bx - 1, by + 1, bz)).toBe(0);
  });
});

describe('machines & guide', () => {
  it('renders every machine type with articulated rigs without overflowing the buffer', async () => {
    const g = await mk();
    for (const t of ['scrapper', 'sentinel', 'warden'] as const) g.sim.spawnMachine(t, g.p.x + 3, g.p.y + 1, g.p.z + 3);
    g.sim.machines.forEach((m) => { m.hp = 3; });
    const o = new Dyn(), a = new Dyn();
    g.sim.render(o, a, [g.p.x, g.p.y + 1.6, g.p.z], [1, 0, 0], [0, 1, 0], 1.3);
    expect(o.n).toBeGreaterThan(300);
    expect(a.n).toBeGreaterThan(30);
    expect(o.f.slice(0, o.n * 12).every((v) => Number.isFinite(v))).toBe(true);
  });
  it('guide advances from stats', async () => {
    const g = await mk();
    expect(guideState(g).step?.key).toBe('move');
    g.stats.distance = 50; guideTick(g);
    expect(g.done.has('guide:move')).toBe(true);
    expect(guideState(g).step?.key).toBe('mine');
  });
});
