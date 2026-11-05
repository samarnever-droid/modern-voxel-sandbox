import { it, expect, beforeAll } from 'vitest';
import { registerBaseContent } from '../content';
import { Reg } from '../engine/registry';
beforeAll(() => registerBaseContent());

/** Fixpoint: every craftable item must be obtainable from a fresh survival start (no tech deadlocks). */
it('tech tree has no deadlocks: every item is reachable from the starting kit', () => {
  const R = new Set<string>(['scrap_metal', 'timber_planks', 'salvage_cutter', 'ration_bar', 'frontline_beacon', 'data_chip', 'wild_berries']);
  const nat = (b: any) => b.cat === 'Terrain & Natural' || b.cat === 'Vegetation & Landscaping' || b.key === 'rubble';
  const stationItem: Record<string, string> = { hand: '', workbench: 'workbench', smelter: 'arc_smelter', fabricator: 'fabricator', lab: 'research_station', foundry: 'assembly_foundry' };
  const tech = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    const maxTier = Math.max(...[...R].map((k) => Reg.items.get(k)?.spec?.tool?.tier ?? -1), 0);
    const add = (k: string) => { if (!R.has(k)) { R.add(k); changed = true; } };
    for (const b of Reg.blocks) if (b && nat(b) && b.tier <= maxTier && !b.unbreakable) { const d = b.drop === undefined ? b.key : b.drop; if (d) add(d); }
    for (const n of Reg.research) if (!tech.has(n.key) && n.requires.every((q) => tech.has(q)) && Object.keys(n.cost).every((k) => R.has(k)) && R.has('research_station')) { tech.add(n.key); changed = true; }
    for (const r of Reg.recipes) {
      if (R.has(r.out === 'steel_ingot_scrap' ? 'steel_ingot' : r.out)) continue;
      if (r.st !== 'hand' && !R.has(stationItem[r.st])) continue;
      if (r.req && !tech.has(r.req)) continue;
      if (Object.keys(r.in).every((k) => R.has(k))) add(r.out === 'steel_ingot_scrap' ? 'steel_ingot' : r.out);
    }
  }
  const missing = [...Reg.items.keys()].filter((k) => !R.has(k) && !['data_log', 'fresh_meal', 'canned_stew', 'steel_ingot_scrap'].includes(k));
  // World-only blocks (decor, loot containers, natural ores) are obtained by mining them where they generate.
  const crafted = missing.filter((k) => Reg.recipes.some((r) => r.out === k) || !Reg.byKey.has(k));
  expect(crafted).toEqual([]);
});
