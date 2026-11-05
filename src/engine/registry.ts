/**
 * Central, data-driven content registry. Base content and mods go through the SAME API.
 * Nothing in the engine hardcodes block ids — worldgen & gameplay look blocks up by key via `ID`.
 */
import { TexSpec, paintTexture, buildMips, MipData } from './textures';

export const API_VERSION = '1.0.0';
export const MAX_BLOCKS = 4096;
export const MAX_LAYERS = 1024;

export type SoundMat = 'stone' | 'metal' | 'glass' | 'wood' | 'grass' | 'dirt' | 'sand' | 'snow' | 'gravel' | 'fabric' | 'water' | 'tech' | 'plastic';
export type Shape = 'cube' | 'slab' | 'stair' | 'cross' | 'panel' | 'fence' | 'wall' | 'pole' | 'door' | 'trapdoor' | 'carpet' | 'custom' | 'liquid' | 'ladder';
export type ToolClass = 'soft' | 'wood' | 'stone' | 'metal' | 'glass' | 'tech';
export type Box = [number, number, number, number, number, number];
export interface BoxDef { b: Box; t?: string }
export type TexMap = TexSpec | Partial<Record<string, TexSpec>>;
export type Use = 'door' | 'trapdoor' | 'toggle' | 'crate' | 'workbench' | 'smelter' | 'fabricator' | 'lab' | 'foundry' | 'terminal' | 'beacon' | 'bed' | 'generator' | 'research' | 'loot';
export interface CraftSpec { st?: string; in: Record<string, number>; n?: number; req?: string }

export interface BlockSpec {
  key: string; name: string; cat: string; tex: TexMap;
  shape?: Shape; boxes?: BoxDef[];
  hard?: number; cls?: ToolClass; tier?: number;
  snd?: SoundMat; rough?: number; metal?: number; emit?: number; emitOn?: number; glow?: number;
  opacity?: number; solid?: boolean; render?: 'opaque' | 'cutout' | 'glass' | 'water';
  rot?: 'none' | 'facing4' | 'facing6'; use?: Use; drop?: string | null; dropN?: [number, number];
  power?: { gen?: number; use?: number; cable?: boolean; sun?: boolean; store?: number };
  craft?: CraftSpec; tags?: string[]; map?: string; sway?: boolean; unbreakable?: boolean;
  climb?: boolean; connect?: string; desc?: string; slip?: number; stack?: number;
}
export interface Block extends BlockSpec {
  id: number; shape: Shape; hard: number; tier: number; snd: SoundMat; opacity: number; solid: boolean;
  render: 'opaque' | 'cutout' | 'glass' | 'water'; rot: 'none' | 'facing4' | 'facing6';
  layers: Record<string, number>;
  /** layer for face(0..5) x facing(0..3) */
  fl: Int32Array;
  mod: string; full: boolean;
}

export interface ItemSpec {
  key: string; name: string; type: 'material' | 'tool' | 'weapon' | 'gadget' | 'food' | 'equip' | 'ammo';
  icon: TexSpec; desc?: string; stack?: number;
  tool?: { speed: number; tier: number; dur: number; bonus?: ToolClass[]; area?: number; vein?: boolean };
  weapon?: { dmg: number; kind: 'melee' | 'bolt' | 'spread' | 'rail'; cd: number; range?: number; dur: number };
  gadget?: { kind: string; cd: number; dur?: number };
  food?: { hunger: number; heal?: number };
  equip?: { slot: 'pack' | 'armor' | 'visor'; def?: number; boost?: number };
  craft?: CraftSpec; upgradeTo?: string;
}
export interface Item {
  key: string; name: string; type: ItemSpec['type'] | 'block'; stack: number; desc: string;
  icon?: TexSpec; block?: Block; spec?: ItemSpec; mod: string;
}
export interface Recipe { out: string; n: number; in: Record<string, number>; st: string; req?: string; mod: string }
export interface ResearchNode { key: string; name: string; desc: string; cost: Record<string, number>; requires: string[]; tier: number; branch?: string }
export interface Challenge { key: string; name: string; desc: string; stat: string; goal: number; reward?: Record<string, number> }
export interface StructureTemplate { key: string; name: string; biomes: string[]; rarity: number; palette: Record<string, string>; layers: string[][]; story?: string; mod: string }
export interface FeatureSpec { key: string; block: string; replace?: string; minY: number; maxY: number; size: number; perChunk: number; biomes?: string[] }
export interface BiomeSpec { key: string; name: string; temp: [number, number]; moist: [number, number]; surface: string; filler: string; rarity?: number; fog?: string; scatter?: { block: string; chance: number }[]; ambient?: string }

export const Reg = {
  blocks: [null] as (Block | null)[],
  byKey: new Map<string, Block>(),
  items: new Map<string, Item>(),
  recipes: [] as Recipe[],
  research: [] as ResearchNode[],
  challenges: [] as Challenge[],
  structures: [] as StructureTemplate[],
  features: [] as FeatureSpec[],
  biomes: [] as BiomeSpec[],
  texSpecs: [] as TexSpec[],
  texMat: [] as number[][],
  texIndex: new Map<string, number>(),
  lore: [] as { tag: string; text: string }[],
  sounds: new Map<string, any>(),
  music: [] as any[],
  hudWidgets: [] as { id: string; text: string; pos: string; mod: string }[],
  errors: [] as string[],
  categories: [] as string[],
};

// Per-id property tables (fast lookups for mesher/physics/light)
export const OPAQ = new Uint8Array(MAX_BLOCKS);   // light opacity 0..15
export const SOLID = new Uint8Array(MAX_BLOCKS);  // collides
export const FULL = new Uint8Array(MAX_BLOCKS);   // full cube
export const REND = new Uint8Array(MAX_BLOCKS);   // 0 none 1 opaque 2 cutout 3 glass 4 water
export const EMIT = new Uint8Array(MAX_BLOCKS);
export const EMON = new Uint8Array(MAX_BLOCKS);  // emission when powered/on (0 = n/a)
export const OCCL = new Uint8Array(MAX_BLOCKS);   // full opaque cube occluding neighbours' faces & AO
export const LIQ = new Uint8Array(MAX_BLOCKS);

let strict = false;
export const setStrictIds = (b: boolean) => { strict = b; };
const idTable: Record<string, number> = { air: 0 };
export const ID: Record<string, number> = new Proxy(idTable, {
  get(t, k: string) {
    if (k in t) return t[k];
    if (strict) throw new Error('Unknown block key: ' + k);
    return 0;
  },
});

const isTexSpec = (t: TexMap): t is TexSpec => typeof (t as TexSpec).p === 'string';
export const DX = [0, -1, 0, 1];
export const DZ = [1, 0, -1, 0];
export const FACE_DIR = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_TO_DIR: Record<number, number> = { 4: 0, 1: 1, 5: 2, 0: 3 };

function texLayer(spec: TexSpec, rough: number, metal: number, glow: number, flags: number): number {
  const mat = [rough, metal, glow, flags];
  const key = JSON.stringify(spec) + mat.join(',');
  let i = Reg.texIndex.get(key);
  if (i === undefined) {
    if (Reg.texSpecs.length >= MAX_LAYERS) { Reg.errors.push('Texture layer limit reached'); return 0; }
    i = Reg.texSpecs.length;
    Reg.texSpecs.push(spec); Reg.texMat.push(mat); Reg.texIndex.set(key, i);
  }
  return i;
}
// layer 0 = missing texture
Reg.texSpecs.push({ p: '__missing', a: [] }); Reg.texMat.push([0.9, 0, 0, 0]);

export function defineBlock(s: BlockSpec, mod = 'base'): Block {
  if (Reg.byKey.has(s.key)) throw new Error(`Duplicate block key "${s.key}"`);
  if (Reg.blocks.length >= MAX_BLOCKS) throw new Error('Block limit reached');
  const shape: Shape = s.shape ?? 'cube';
  const render = s.render ?? (shape === 'liquid' ? 'water' : 'opaque');
  const full = shape === 'cube' || shape === 'liquid';
  const solid = s.solid ?? !(shape === 'cross' || shape === 'liquid' || shape === 'ladder' || render === 'water');
  const id = Reg.blocks.length;
  const flags = (render === 'cutout' ? 1 : 0) | (render === 'water' ? 2 : 0) | (s.sway ? 4 : 0) | (render === 'glass' ? 8 : 0);
  const rough = s.rough ?? 0.85, metal = s.metal ?? 0, glow = s.glow ?? (s.emit ? Math.min(2.5, 0.5 + s.emit / 8) : 0);
  const layers: Record<string, number> = {};
  const texMap: Record<string, TexSpec> = isTexSpec(s.tex) ? { all: s.tex } : (s.tex as Record<string, TexSpec>);
  for (const [name, spec] of Object.entries(texMap)) {
    const g = name === 'screen' || name === 'glow' || name === 'lamp' ? Math.max(glow, 1.2) : name === 'all' || name === 'top' || name === 'side' || name === 'bottom' || name === 'front' || name === 'back' ? glow : 0;
    layers[name] = texLayer(spec, rough, metal, g, flags);
  }
  const pick = (...names: string[]) => { for (const n of names) if (layers[n] !== undefined) return layers[n]; return 0; };
  const fl = new Int32Array(24);
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    let l: number;
    if (f === 2) l = pick('top', 'all', 'side');
    else if (f === 3) l = pick('bottom', 'all', 'side', 'top');
    else if (s.rot === 'facing4' || layers.front !== undefined) {
      const rel = (FACE_TO_DIR[f] - k + 4) % 4;
      l = rel === 0 ? pick('front', 'side', 'all') : rel === 2 ? pick('back', 'side', 'all') : pick('side', 'all', 'top');
    } else l = pick('side', 'all', 'top');
    fl[f * 4 + k] = l;
  }
  const b: Block = {
    ...s, id, shape, render, solid, full, hard: s.hard ?? 2, tier: s.tier ?? 0, snd: s.snd ?? 'stone',
    opacity: s.opacity ?? (render === 'opaque' && full ? 15 : render === 'cutout' && full ? 1 : render === 'glass' ? 0 : render === 'water' ? 2 : shape === 'cube' ? 15 : 0),
    rot: s.rot ?? 'none', layers, fl, mod,
  };
  if (shape !== 'cube' && shape !== 'liquid' && s.opacity === undefined) b.opacity = 0;
  Reg.blocks.push(b); Reg.byKey.set(s.key, b); idTable[s.key] = id;
  OPAQ[id] = b.opacity; SOLID[id] = solid ? 1 : 0; FULL[id] = full ? 1 : 0;
  REND[id] = render === 'opaque' ? 1 : render === 'cutout' ? 2 : render === 'glass' ? 3 : 4;
  EMIT[id] = s.emit ?? 0; EMON[id] = s.emitOn ?? 0; OCCL[id] = shape === 'cube' && render === 'opaque' ? 1 : 0; LIQ[id] = shape === 'liquid' ? 1 : 0;
  if (!Reg.categories.includes(s.cat)) Reg.categories.push(s.cat);
  Reg.items.set(s.key, { key: s.key, name: s.name, type: 'block', stack: s.stack ?? 64, desc: s.desc ?? '', block: b, mod });
  if (s.craft) Reg.recipes.push({ out: s.key, n: s.craft.n ?? 1, in: s.craft.in, st: s.craft.st ?? 'hand', req: s.craft.req, mod });
  return b;
}

export function defineItem(s: ItemSpec, mod = 'base'): Item {
  if (Reg.items.has(s.key)) throw new Error(`Duplicate item key "${s.key}"`);
  const it: Item = { key: s.key, name: s.name, type: s.type, stack: s.stack ?? (s.type === 'tool' || s.type === 'weapon' || s.type === 'gadget' || s.type === 'equip' ? 1 : 64), desc: s.desc ?? '', icon: s.icon, spec: s, mod };
  Reg.items.set(s.key, it);
  if (s.craft) Reg.recipes.push({ out: s.key, n: s.craft.n ?? 1, in: s.craft.in, st: s.craft.st ?? 'hand', req: s.craft.req, mod });
  return it;
}
export function defineRecipe(r: Omit<Recipe, 'mod'> & { mod?: string }, mod = 'base') { Reg.recipes.push({ ...r, mod }); }
export const defineResearch = (n: ResearchNode) => { Reg.research.push(n); };
export const defineChallenge = (c: Challenge) => { Reg.challenges.push(c); };

export const getBlock = (id: number): Block | null => Reg.blocks[id] ?? null;
export const blockKeyToId = (k: string) => Reg.byKey.get(k)?.id ?? 0;

/** Validate cross references (ingredients, drops). Returns list of problems. */
export function validateRegistry(): string[] {
  const probs: string[] = [];
  for (const r of Reg.recipes) {
    if (!Reg.items.has(r.out)) probs.push(`recipe output missing: ${r.out}`);
    for (const k of Object.keys(r.in)) if (!Reg.items.has(k)) probs.push(`recipe ${r.out}: missing ingredient ${k}`);
  }
  for (const b of Reg.blocks) if (b && b.drop && !Reg.items.has(b.drop)) probs.push(`block ${b.key}: bad drop ${b.drop}`);
  return probs;
}

export interface Atlas { layers: number; mips: MipData[]; materials: Float32Array; data: Uint8ClampedArray[] }
export function buildAtlas(): Atlas {
  const data = Reg.texSpecs.map((s) => paintTexture(s));
  const mips = buildMips(data);
  const materials = new Float32Array(MAX_LAYERS * 4);
  Reg.texMat.forEach((m, i) => materials.set(m, i * 4));
  return { layers: data.length, mips, materials, data };
}

/* ---------- block state helpers (state byte layout) ----------
 * bits0-1 facing | bit2 top/flip | bit3 open/on | bit4 upper-half | bit5 powered | bits6-7 vertical dir (1 up, 2 down)
 */
export const S_TOP = 4, S_ON = 8, S_UPPER = 16, S_POWER = 32;
export const stFacing = (s: number) => s & 3;

const _rot = (b: Box, f: number): Box => {
  if (f === 0) return b;
  const p = (x: number, z: number): [number, number] => {
    const cx = x - 0.5, cz = z - 0.5;
    if (f === 1) return [-cz + 0.5, cx + 0.5];
    if (f === 2) return [-cx + 0.5, -cz + 0.5];
    return [cz + 0.5, -cx + 0.5];
  };
  const a = p(b[0], b[2]), c = p(b[3], b[5]);
  return [Math.min(a[0], c[0]), b[1], Math.min(a[1], c[1]), Math.max(a[0], c[0]), b[4], Math.max(a[1], c[1])];
};
export const rotBox = _rot;

/** Boxes (block-local 0..1) for a block + state. `conn` = bitmask of connections (+z,-x,-z,+x) for fence-like shapes. */
export function blockBoxes(b: Block, state: number, conn = 0): BoxDef[] {
  const f = state & 3, top = !!(state & S_TOP), open = !!(state & S_ON);
  const R = (x: Box) => ({ b: _rot(x, f) });
  switch (b.shape) {
    case 'cube': case 'liquid': return [{ b: [0, 0, 0, 1, 1, 1] }];
    case 'slab': return [{ b: top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1] }];
    case 'stair': {
      const low: BoxDef = { b: top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1] };
      const hi = R(top ? [0, 0, 0.5, 1, 0.5, 1] : [0, 0.5, 0.5, 1, 1, 1]);
      // facing 0 => the high step sits on the -z? we want the back (away from the front) high: front = +z so high part at -z
      const hi2 = R(top ? [0, 0, 0, 1, 0.5, 0.5] : [0, 0.5, 0, 1, 1, 0.5]);
      void hi;
      return [low, hi2];
    }
    case 'carpet': return [{ b: [0, 0, 0, 1, 0.0625, 1] }];
    case 'cross': return [{ b: [0.1, 0, 0.1, 0.9, 0.9, 0.9] }];
    case 'panel': return [R([0, 0, 0.8125, 1, 1, 1])];
    case 'ladder': return [R([0, 0, 0.875, 1, 1, 1])];
    case 'pole': {
      const o: BoxDef[] = [{ b: [0.375, 0, 0.375, 0.625, 1, 0.625] }];
      if (conn & 1) o.push({ b: [0.4, 0.4, 0.625, 0.6, 0.6, 1] }); if (conn & 2) o.push({ b: [0, 0.4, 0.4, 0.375, 0.6, 0.6] });
      if (conn & 4) o.push({ b: [0.4, 0.4, 0, 0.6, 0.6, 0.375] }); if (conn & 8) o.push({ b: [0.625, 0.4, 0.4, 1, 0.6, 0.6] });
      return o;
    }
    case 'fence': case 'wall': {
      const w = b.shape === 'wall' ? 0.25 : 0.125, h = b.shape === 'wall' ? 0.875 : 1;
      const o: BoxDef[] = [{ b: [0.5 - w, 0, 0.5 - w, 0.5 + w, 1, 0.5 + w] }];
      const aw = b.shape === 'wall' ? 0.1875 : 0.0625;
      const arm = (x0: number, z0: number, x1: number, z1: number) => { o.push({ b: [x0, 0.0, z0, x1, h * 0.85, z1] }); };
      if (conn & 1) arm(0.5 - aw, 0.5, 0.5 + aw, 1); if (conn & 2) arm(0, 0.5 - aw, 0.5, 0.5 + aw);
      if (conn & 4) arm(0.5 - aw, 0, 0.5 + aw, 0.5); if (conn & 8) arm(0.5, 0.5 - aw, 1, 0.5 + aw);
      return o;
    }
    case 'door': {
      // closed: thin slab on the back side of facing; open: rotated 90deg to hinge side
      const t: Box = [0, 0, 0.8125, 1, 1, 1];
      return [{ b: _rot(open ? [0, 0, 0, 0.1875, 1, 1] : t, f) }];
    }
    case 'trapdoor': {
      const closed: Box = top ? [0, 0.8125, 0, 1, 1, 1] : [0, 0, 0, 1, 0.1875, 1];
      return [{ b: open ? _rot([0, 0, 0.8125, 1, 1, 1], f) : closed }];
    }
    case 'custom': return (b.boxes ?? [{ b: [0, 0, 0, 1, 1, 1] }]).map((x) => ({ b: _rot(x.b, f), t: x.t }));
  }
  return [{ b: [0, 0, 0, 1, 1, 1] }];
}
