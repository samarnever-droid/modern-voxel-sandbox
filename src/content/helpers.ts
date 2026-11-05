import { BlockSpec, TexMap, defineBlock, CraftSpec } from '../engine/registry';

export const C = {
  terr: 'Terrain & Natural', veg: 'Vegetation & Landscaping', con: 'Construction Materials', ind: 'Concrete & Industrial',
  road: 'Roads & Transportation', arch: 'Modern Architecture', glass: 'Glass & Transparent', metal: 'Metal & Structural',
  elec: 'Electrical Systems', light: 'Lighting & Power', tech: 'Technology & Machinery', store: 'Storage & Logistics',
  furn: 'Furniture & Interiors', lab: 'Laboratory Equipment', def: 'Defensive Construction', deco: 'Decorative & Rare',
};

export const B = (key: string, name: string, cat: string, tex: TexMap, o: Partial<BlockSpec> = {}) =>
  defineBlock({ key, name, cat, tex, ...o });

export const hand = (i: Record<string, number>, n = 1, req?: string): CraftSpec => ({ st: 'hand', in: i, n, req });
export const wb = (i: Record<string, number>, n = 1, req?: string): CraftSpec => ({ st: 'workbench', in: i, n, req });
export const fab = (i: Record<string, number>, n = 1, req?: string): CraftSpec => ({ st: 'fabricator', in: i, n, req });
export const sm = (i: Record<string, number>, n = 1): CraftSpec => ({ st: 'smelter', in: i, n });
export const lab = (i: Record<string, number>, n = 1, req?: string): CraftSpec => ({ st: 'lab', in: i, n, req });
export const fnd = (i: Record<string, number>, n = 1, req?: string): CraftSpec => ({ st: 'foundry', in: i, n, req });

/** Slab + stair family derived from a base block. */
export function family(baseKey: string, name: string, cat: string, tex: TexMap, o: Partial<BlockSpec> = {}, st = 'workbench') {
  B(baseKey + '_slab', name + ' Slab', cat, tex, { ...o, shape: 'slab', craft: { st, in: { [baseKey]: 1 }, n: 2 }, drop: undefined });
  B(baseKey + '_stairs', name + ' Stairs', cat, tex, { ...o, shape: 'stair', rot: 'facing4', craft: { st, in: { [baseKey]: 3 }, n: 4 }, drop: undefined });
}
