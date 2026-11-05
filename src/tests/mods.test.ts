import { describe, it, expect, beforeAll } from 'vitest';
import { registerBaseContent } from '../content';
import { Reg, setStrictIds, validateRegistry } from '../engine/registry';
import { loadMods, satisfies, modRuntime, emitMod, setModHost } from '../mods/loader';
import { EXAMPLE_MODS } from '../mods/examples';
import { LuaMod } from '../mods/lua';

beforeAll(() => { setStrictIds(false); registerBaseContent(); });

describe('semver', () => {
  it('handles ranges', () => {
    expect(satisfies('1.2.0', '^1.0.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
    expect(satisfies('1.0.5', '~1.0.0')).toBe(true);
    expect(satisfies('1.1.0', '~1.0.0')).toBe(false);
    expect(satisfies('1.0.0', '>=1.0.0')).toBe(true);
    expect(satisfies('0.9.0', '>=1.0.0')).toBe(false);
  });
});
describe('lua sandbox', () => {
  const host: any = { log: () => {}, notify: () => {}, getBlock: () => 'air', setBlock: () => true, give: () => true, playerPos: () => [1, 2, 3], time: () => 0.5, spawnParticles: () => {}, play: () => {}, registerCommand: () => {}, register: () => {} };
  it('runs scripts and blocks dangerous globals', () => {
    const m = new LuaMod('t', host);
    expect(m.run('x = 1 + 1')).toBeNull();
    expect(m.run('os.exit()')).toMatch(/nil|attempt/);
    expect(m.run('io.open("x")')).toMatch(/nil|attempt/);
    expect(m.run('require("os")')).toMatch(/nil|attempt/);
  });
  it('aborts infinite loops', () => { const m = new LuaMod('t', host); expect(m.run('while true do end')).toMatch(/budget/); });
  it('dispatches events', () => {
    const seen: string[] = [];
    const m = new LuaMod('t', { ...host, notify: (s: string) => seen.push(s) });
    m.run('frontline.on("hi", function(e) frontline.notify("got " .. e.block .. e.x) end)');
    m.emit('hi', { block: 'a', x: 3 });
    expect(seen).toEqual(['got a3']);
  });
});
describe('mod loader', () => {
  it('loads the example mods, registers content, runs scripts', async () => {
    const cmds: string[] = [];
    setModHost({ registerCommand: (n: string) => { cmds.push(n); } });
    const before = Reg.blocks.length;
    const reports = await loadMods(EXAMPLE_MODS.map((bundle) => ({ bundle, enabled: true })));
    for (const r of reports) expect(r.errors).toEqual([]);
    expect(reports.every((r) => r.status === 'loaded')).toBe(true);
    expect(Reg.blocks.length).toBeGreaterThan(before + 5);
    expect(Reg.byKey.has('neon-district:neon_tile')).toBe(true);
    expect(Reg.items.has('neon-district:neon_baton')).toBe(true);
    expect(Reg.biomes.length).toBe(1);
    expect(cmds).toContain('hello');
    expect(validateRegistry()).toEqual([]);
    expect(modRuntime.mods.size).toBe(3);
    emitMod('block_broken', { x: 1, y: 2, z: 3, block: 'neon-district:neon_tile' });
  });
  it('reports dependency & version errors', async () => {
    const bad = { manifest: { id: 'bad-mod', name: 'Bad', version: '1.0.0', apiVersion: '^1.0.0', dependencies: { nothere: '^1.0.0' } } };
    const old = { manifest: { id: 'old-mod', name: 'Old', version: '1.0.0', apiVersion: '^0.5.0' } };
    const r = await loadMods([{ bundle: bad as any, enabled: true }, { bundle: old as any, enabled: true }]);
    expect(r.find((x) => x.id === 'bad-mod')!.errors[0]).toMatch(/Missing dependency/);
    expect(r.find((x) => x.id === 'old-mod')!.errors[0]).toMatch(/targets API/);
  });
});
