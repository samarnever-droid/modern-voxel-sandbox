/** The Game: player, input, chunk streaming, interaction, survival, progression and per-frame render assembly. */
import { mat4, clamp, smoothstep, lerp } from '../engine/math';
import { hash01, hashInt } from '../engine/noise';
import { Reg, ID, Block, S_ON, S_TOP, S_UPPER, S_POWER, DX, DZ, SOLID, LIQ } from '../engine/registry';
import { World, Chunk, ckey, CH, CVOL, collisionBoxes } from '../world/world';
import { Generator, BIOME_INFO } from '../world/gen';
import { meshChunk } from '../world/mesher';
import { Renderer, Quality, QUALITY, FrameParams, DYN_STRIDE } from '../render/types';
import { Dyn } from './dyn';
import { Sim } from './sim';
import { audio, Mood } from '../audio/audio';
import { WorldMeta, makePalette, buildRemap, saveChunk, saveWorldMeta, unrle } from '../save/persist';
import { emitMod, setModHost, modRuntime } from '../mods/loader';
import { LORE } from '../content';

export interface Stack { key: string; n: number; dur?: number }
export interface Settings {
  quality: 'low' | 'medium' | 'high' | 'ultra'; viewDist: number; fov: number; sens: number; invertY: boolean; reduceMotion: boolean; uiScale: number; highContrast: boolean;
  master: number; music: number; sfx: number; ambience: number; sprintToggle: boolean; showFps: boolean; keys: Record<string, string>; renderScale: number;
}
export const DEFAULT_KEYS: Record<string, string> = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft', inventory: 'KeyE', drop: 'KeyQ', perspective: 'KeyV', console: 'KeyT', gadget: 'KeyF', map: 'KeyM', fly: 'KeyX' };
export const DEFAULT_SETTINGS: Settings = { quality: 'high', viewDist: 8, fov: 75, sens: 1, invertY: false, reduceMotion: false, uiScale: 1, highContrast: false, master: 0.8, music: 0.5, sfx: 0.8, ambience: 0.6, sprintToggle: false, showFps: true, keys: { ...DEFAULT_KEYS }, renderScale: 1 };

const STATIONS: Record<string, string[]> = { workbench: ['workbench'], smelter: ['smelter'], fabricator: ['fabricator'], research: ['lab'], foundry: ['foundry'] };
export const CLS_BY_SND: Record<string, string> = { stone: 'stone', metal: 'metal', wood: 'wood', glass: 'glass', tech: 'tech', grass: 'soft', dirt: 'soft', sand: 'soft', snow: 'soft', gravel: 'soft', fabric: 'soft', plastic: 'soft', water: 'soft' };
const LOOT: Record<string, [string, number, number, number][]> = {
  base: [['scrap_metal', 2, 6, 10], ['copper_wire', 1, 4, 6], ['ration_bar', 1, 2, 4], ['wild_berries', 2, 5, 3], ['data_chip', 1, 2, 4], ['energy_cell', 1, 2, 3], ['circuit_board', 1, 2, 3], ['polymer', 1, 4, 4], ['silicon', 1, 3, 3], ['canned_stew', 1, 1, 2], ['data_log', 1, 1, 3], ['carbon', 2, 6, 4], ['steel_ingot', 1, 3, 4]],
  lab: [['data_chip', 2, 4, 10], ['circuit_board', 2, 4, 8], ['optic_lens', 1, 2, 5], ['nanogel', 1, 2, 4], ['power_core', 1, 1, 3], ['titanium_ingot', 1, 3, 5], ['zerite_shard', 1, 2, 3], ['servo', 1, 2, 5], ['energy_cell', 2, 3, 6], ['nutrient_paste', 1, 3, 4], ['data_log', 1, 1, 6]],
  industrial: [['steel_ingot', 2, 5, 9], ['servo', 1, 3, 6], ['copper_ingot', 2, 6, 6], ['alu_ingot', 1, 4, 5], ['carbon_fiber', 1, 2, 2], ['power_core', 1, 1, 1], ['scrap_metal', 4, 9, 8], ['data_chip', 1, 2, 4]],
  military: [['pulse_emitter', 1, 1, 1], ['energy_cell', 2, 4, 8], ['reactive_vest', 1, 1, 1], ['canned_stew', 1, 3, 6], ['titanium_ingot', 1, 2, 4], ['data_chip', 2, 3, 6], ['servo', 1, 2, 5], ['scatter_arc', 1, 1, 1], ['shield_projector', 1, 1, 1]],
};

export class Game {
  // --- systems
  world!: World; gen!: Generator; sim!: Sim; renderer: Renderer | null; canvas: HTMLCanvasElement | null;
  dynO = new Dyn(); dynA = new Dyn();
  settings: Settings; q: Quality; meta: WorldMeta; mode: WorldMeta['mode'];
  // --- player
  p = { x: 0, y: 70, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false, flying: false, inWater: false, under: false, health: 20, hunger: 20, air: 15, sprint: false, sneak: false, fall: 0, dead: false, shield: 0, hurtT: 0, step: 0, walk: 0, swing: 0, regen: 0, starve: 0, jetFuel: 100, stepSmooth: 0, lastJump: -9 };
  inv: (Stack | null)[] = Array(36).fill(null); hot = 0; equip: { pack: Stack | null; armor: Stack | null; visor: Stack | null } = { pack: null, armor: null, visor: null };
  tech = new Set<string>(); stats: Record<string, number> = {}; done = new Set<string>(); discovered = new Set<string>();
  claims: { x: number; y: number; z: number; r: number; tier: number }[] = [];
  tiles = new Map<string, any>(); spawn = { x: 0, y: 70, z: 0 };
  // --- state
  time = 0.3; dayFactor = 1; biome = 'plains'; biomeT = 0; fog: [number, number, number] = [0.6, 0.7, 0.85]; fogMul = 1; third = false; cam: [number, number, number] = [0, 0, 0];
  keys = new Set<string>(); mouse = [false, false, false]; locked = false; lookDX = 0; lookDY = 0;
  target: ReturnType<World['raycast']> = null; mining = { x: 0, y: 0, z: 0, p: 0, t: 0 };
  cooldown = new Map<string, number>(); hook: { x: number; y: number; z: number; t: number } | null = null;
  scanPings: { x: number; y: number; z: number; c: string; t: number; n: string }[] = [];
  waypoint: { x: number; z: number; name: string } | null = null;
  panel: 'none' | 'inventory' | 'container' | 'terminal' | 'pause' | 'console' | 'map' = 'none';
  panelData: any = null; tab = 'inventory'; chat: string[] = []; toasts: { id: number; text: string; t: number; kind: string }[] = []; toastId = 1;
  hud: any = {}; fps = 60; frames = 0; fpsT = 0; running = false; paused = false; last = 0; raf = 0;
  lastCx = 1e9; lastCz = 1e9; ring: number[][] = []; saved = new Map<string, any>(); remap: Uint16Array | null = null; urgent = new Set<Chunk>();
  swingT = 0; equipAnim = 0; bob = 0; shake = 0; vp = mat4.create(); eyeY = 1.62; autoSave = 30; modified = new Set<Chunk>(); stations = new Set<string>(['hand']); stationT = 0; minimap: HTMLCanvasElement | null = null; mapT = 0;
  lightFlash = 0; pendingTip = ''; subtitle = ''; pickups: { key: string; n: number; t: number }[] = []; lastMood: Mood = 'explore'; combatT = 0; discT = 0; sprintLatch = false; tickListeners = new Set<() => void>();

  constructor(canvas: HTMLCanvasElement | null, renderer: Renderer | null, meta: WorldMeta, settings: Settings) {
    this.canvas = canvas; this.renderer = renderer; this.meta = meta; this.mode = meta.mode; this.settings = settings; this.q = { ...QUALITY[settings.quality], viewDist: settings.viewDist };
    this.gen = new Generator(meta.seed); this.world = new World(meta.seed, this.gen); this.sim = new Sim(this);
    const m = meta, pl = m.player;
    if (pl) {
      Object.assign(this.p, pl.p ?? {}); this.p.dead = false; this.p.vx = this.p.vy = this.p.vz = 0; this.inv = pl.inv ?? this.inv; this.hot = pl.hot ?? 0; this.equip = pl.equip ?? this.equip;
      this.tech = new Set(pl.tech ?? []); this.stats = pl.stats ?? {}; this.done = new Set(pl.done ?? []); this.discovered = new Set(pl.discovered ?? []); this.claims = pl.claims ?? []; this.spawn = pl.spawn ?? this.spawn;
      this.time = m.time ?? 0.3; this.tiles = new Map(Object.entries(m.tiles ?? {}));
    } else {
      const s = this.gen.findSpawn(); this.spawn = s; Object.assign(this.p, { x: s.x + 0.5, y: s.y + 0.5, z: s.z + 0.5, yaw: 2.4 });
      this.inv[0] = { key: 'salvage_cutter', n: 1, dur: 160 }; this.inv[1] = { key: 'ration_bar', n: 3 };
      if (this.mode === 'exploration') { this.addItem('scanner', 1); this.addItem('tether_hook', 1); this.addItem('canned_stew', 4); }
      if (this.mode === 'survival' || this.mode === 'challenge') { this.addItem('scrap_metal', 6); this.addItem('timber_planks', 8); this.addItem('frontline_beacon', 1); this.pendingTip = 'Deploy your Frontline Beacon (right-click the ground) to claim land, then craft a Workbench in the inventory (E).'; }
      if (this.mode === 'creative') this.p.flying = true;
    }
    this.remap = buildRemap(m.palette);
    setModHost({
      log: (id, msg) => { this.chat.push(`[${id}] ${msg}`); if (this.chat.length > 80) this.chat.shift(); },
      notify: (msg) => this.notify(msg, 'mod'),
      getBlock: (x, y, z) => Reg.blocks[this.world.getBlock(x, y, z)]?.key ?? 'air',
      setBlock: (x, y, z, key) => { const id = key === 'air' ? 0 : Reg.byKey.get(key)?.id; return id === undefined ? false : this.setBlock(x, y, z, id, 0, true); },
      give: (key, n) => this.addItem(key, n) < n,
      playerPos: () => [this.p.x, this.p.y, this.p.z], time: () => this.time,
      spawnParticles: (x, y, z, kind, n) => this.sim.burst(x + 0.5, y + 0.5, z + 0.5, kind, n), play: (n) => audio.sfx(n),
      registerCommand: (name, mod, fn) => { modRuntime.commands.set(name, { mod, fn }); },
    });
  }
  async init(savedRaw?: Map<string, any>) {
    if (savedRaw) this.saved = savedRaw;
    audio.loadModSfx();
    if (this.pendingTip) this.notify(this.pendingTip, 'challenge');
    this.dayFactor = this.calcDay();
    // preload: generate until nearby ring is meshed
    const t0 = performance.now();
    while (performance.now() - t0 < 20000) {
      this.stream(60, true);
      const c = this.world.getChunk(Math.floor(this.p.x / 16), Math.floor(this.p.z / 16));
      let ready = 0, total = 0;
      for (const [cx, cz, d] of this.ring) if (d <= 2) { total++; const ch = this.world.getChunk(cx, cz); if (ch && ch.meshLod >= 0) ready++; }
      if (c && ready >= total) break;
      await new Promise((r) => setTimeout(r, 0));
    }
    // settle on ground
    for (let y = Math.min(120, Math.floor(this.p.y) + 40); y > 1 && !this.meta.player; y--) if (this.world.isSolidAt(this.p.x, y, this.p.z)) { this.p.y = y + 1.05; break; }
  }

  // ------------------------------------------------------------------ utilities
  calcDay() { const s = Math.sin((this.time - 0.25) * Math.PI * 2); return smoothstep(-0.12, 0.2, s); }
  notify(text: string, kind = 'info') { this.toasts.push({ id: this.toastId++, text, t: 5, kind }); if (this.toasts.length > 5) this.toasts.shift(); }
  stat(k: string, n: number) { this.stats[k] = (this.stats[k] ?? 0) + n; this.checkChallenges(); }
  tile(key: string) { let t = this.tiles.get(key); if (!t) { t = {}; this.tiles.set(key, t); } return t; }
  pickupFlash(key: string, n: number) { this.pickups.push({ key, n, t: 2.5 }); if (this.pickups.length > 5) this.pickups.shift(); }
  checkChallenges() {
    for (const c of Reg.challenges) {
      if (this.done.has(c.key)) continue;
      const v = c.stat === 'depth' ? this.stats.depth ?? 0 : this.stats[c.stat] ?? 0;
      if (v >= c.goal) { this.done.add(c.key); this.notify(`Challenge complete: ${c.name}`, 'challenge'); audio.sfx('discover'); for (const [k, n] of Object.entries(c.reward ?? {})) this.addItem(k, n); emitMod('challenge', { key: c.key }); }
    }
  }
  // ---- inventory
  addToSlots(slots: (Stack | null)[], key: string, n: number): number {
    const it = Reg.items.get(key); if (!it) return n;
    const max = it.stack;
    for (const s of slots) if (s && s.key === key && s.n < max && max > 1) { const add = Math.min(max - s.n, n); s.n += add; n -= add; if (!n) return 0; }
    for (let i = 0; i < slots.length && n > 0; i++) if (!slots[i]) { const add = Math.min(max, n); slots[i] = { key, n: add, dur: it.spec?.tool?.dur ?? it.spec?.weapon?.dur ?? (it.type === 'gadget' ? 9999 : undefined) }; n -= add; }
    return n;
  }
  addItem(key: string, n: number): number { return this.addToSlots(this.inv, key, n); }
  count(key: string) { let c = 0; for (const s of this.inv) if (s && s.key === key) c += s.n; return c; }
  removeItem(key: string, n: number) { for (const s of this.inv) if (s && s.key === key && n > 0) { const t = Math.min(s.n, n); s.n -= t; n -= t; if (s.n <= 0) this.inv[this.inv.indexOf(s)] = null; } }
  held(): Stack | null { return this.inv[this.hot]; }
  heldItem() { const h = this.held(); return h ? Reg.items.get(h.key) ?? null : null; }
  repairHotbar(amount: number) { for (let i = 0; i < 9; i++) { const s = this.inv[i]; const it = s && Reg.items.get(s.key); const max = it?.spec?.tool?.dur ?? it?.spec?.weapon?.dur; if (s && max && (s.dur ?? max) < max) s.dur = Math.min(max, (s.dur ?? max) + amount); } }
  useDur(s: Stack, n = 1) { if (this.mode === 'creative' || s.dur === undefined || s.dur > 9000) return; s.dur -= n; if (s.dur <= 0) { const i = this.inv.indexOf(s); if (i >= 0) this.inv[i] = null; audio.sfx('explode', undefined, 0.2); this.notify('Your equipment burned out!', 'warn'); } }

  // ---- crafting & research
  hasStation(st: string) { if (this.mode === 'creative' || st === 'hand') return true; if (this.stations.has(st)) return true; if (st === 'workbench') return this.stations.has('fabricator') || this.stations.has('foundry'); if (st === 'fabricator') return this.stations.has('foundry'); return false; }
  unlocked(r: { req?: string }) { return !r.req || this.tech.has(r.req) || this.mode === 'creative'; }
  canCraft(r: { in: Record<string, number>; st: string; req?: string }) { if (!this.unlocked(r) || !this.hasStation(r.st)) return false; for (const [k, n] of Object.entries(r.in)) if (this.count(k) < n) return false; return true; }
  craft(r: { out: string; n: number; in: Record<string, number>; st: string; req?: string }) {
    if (!this.canCraft(r)) return false;
    for (const [k, n] of Object.entries(r.in)) this.removeItem(k, n);
    const outKey = r.out === 'steel_ingot_scrap' ? 'steel_ingot' : r.out;
    if (this.addItem(outKey, r.n) > 0) this.sim.drop(this.p.x, this.p.y + 1, this.p.z, outKey, r.n);
    audio.sfx('craft'); this.stat('crafted', 1); emitMod('crafted', { item: outKey }); return true;
  }
  canResearch(n: { key: string; cost: Record<string, number>; requires: string[] }) { if (this.tech.has(n.key)) return false; if (!n.requires.every((q) => this.tech.has(q))) return false; if (!this.hasStation('lab') && this.mode !== 'creative') return false; for (const [k, c] of Object.entries(n.cost)) if (this.count(k) < c) return false; return true; }
  research(n: { key: string; name: string; cost: Record<string, number>; requires: string[] }) { if (!this.canResearch(n)) return false; for (const [k, c] of Object.entries(n.cost)) this.removeItem(k, c); this.tech.add(n.key); audio.sfx('research'); this.notify(`Research complete: ${n.name}`, 'research'); this.stat('research', 1); emitMod('research', { key: n.key }); return true; }

  // ------------------------------------------------------------------ world edits
  setBlock(x: number, y: number, z: number, id: number, state = 0, user = false): boolean {
    const old = this.world.getBlock(x, y, z);
    const ok = this.world.setBlock(x, y, z, id, state, user);
    if (ok) {
      this.sim.onBlock(x, y, z, id);
      const c = this.world.getChunk(x >> 4, z >> 4)!; if (user) this.modified.add(c);
      this.urgent.add(c);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if ((dx < 0 && (x & 15) === 0) || (dx > 0 && (x & 15) === 15) || (dz < 0 && (z & 15) === 0) || (dz > 0 && (z & 15) === 15)) { const n = this.world.getChunk((x >> 4) + dx, (z >> 4) + dz); if (n) this.urgent.add(n); }
      if (old !== id) { const ob = Reg.blocks[old]; if (ob?.key === 'frontline_beacon') this.claims = this.claims.filter((q) => !(q.x === x && q.z === z)); }
    }
    return ok;
  }
  breakTime(b: Block, tool: Stack | null): number {
    if (this.mode === 'creative') return 0.01;
    if (b.hard < 0) return Infinity;
    const ti = tool && Reg.items.get(tool.key)?.spec?.tool;
    let speed = ti ? ti.speed : 1;
    const cls = b.cls ?? CLS_BY_SND[b.snd];
    if (ti?.bonus?.includes(cls as any)) speed *= 1.5;
    if (!ti && b.tier > 0) speed *= 0.3;
    if (ti && b.tier > ti.tier) speed *= 0.3;
    return Math.max(0.05, b.hard / speed);
  }
  dropsFor(b: Block, tool: Stack | null): [string, number] | null {
    const ti = tool && Reg.items.get(tool.key)?.spec?.tool;
    if (b.tier > (ti?.tier ?? 0) && this.mode !== 'creative') return null;
    const key = b.drop === undefined ? b.key : b.drop;
    if (!key) return null;
    const n = b.dropN ? b.dropN[0] + Math.floor(Math.random() * (b.dropN[1] - b.dropN[0] + 1)) : 1;
    return [key, n];
  }
  breakBlock(x: number, y: number, z: number, tool: Stack | null, silent = false) {
    const id = this.world.getBlock(x, y, z), b = Reg.blocks[id];
    if (!b || b.unbreakable || b.hard < 0) return false;
    const st = this.world.getState(x, y, z);
    const key = `${x},${y},${z}`;
    if (b.use === 'crate' || b.use === 'loot') { const t = this.tiles.get(key); if (t?.slots) for (const s of t.slots) if (s) this.sim.drop(x + 0.5, y + 0.5, z + 0.5, s.key, s.n); this.tiles.delete(key); }
    else if (this.tiles.has(key)) this.tiles.delete(key);
    if (b.shape === 'door') { const oy = st & S_UPPER ? y - 1 : y + 1; if (this.world.getBlock(x, oy, z) === id) this.setBlock(x, oy, z, 0, 0, true); }
    if (!silent) { this.sim.blockChips(x, y, z, b, 14); audio.sfx('break:' + b.snd, [x + 0.5, y + 0.5, z + 0.5]); }
    this.setBlock(x, y, z, 0, 0, true);
    const d = this.dropsFor(b, tool);
    if (d && this.mode !== 'creative') this.sim.drop(x + 0.5, y + 0.5, z + 0.5, d[0], d[1]);
    this.stat('blocks_broken', 1); emitMod('block_broken', { x, y, z, block: b.key });
    // blocks resting on removed support: cross plants above
    const above = Reg.blocks[this.world.getBlock(x, y + 1, z)];
    if (above && above.shape === 'cross' && above.key !== 'vine_curtain') this.setBlock(x, y + 1, z, 0, 0, true);
    return true;
  }
  placeBlock(hit: NonNullable<Game['target']>, it: Block): boolean {
    let x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    const tb = Reg.blocks[hit.id]!;
    if (tb.shape === 'cross' || tb.shape === 'liquid') { x = hit.x; y = hit.y; z = hit.z; }
    const cur = Reg.blocks[this.world.getBlock(x, y, z)];
    if (this.world.getBlock(x, y, z) !== 0 && !(cur && (cur.shape === 'cross' || cur.shape === 'liquid'))) return false;
    if (y < 1 || y >= CH - 1) return false;
    const p = this.p;
    const hx = -Math.sin(p.yaw), hz = -Math.cos(p.yaw);
    let facing = 0, best = -9;
    for (let f = 0; f < 4; f++) { const d = -(DX[f] * hx + DZ[f] * hz); if (d > best) { best = d; facing = f; } }
    let st = 0;
    if (it.rot === 'facing4') st = facing;
    if (it.shape === 'panel' || it.shape === 'ladder') { if (hit.ny !== 0) return false; for (let f = 0; f < 4; f++) if (DX[f] === hit.nx && DZ[f] === hit.nz) st = f; }
    if (it.shape === 'slab' || it.shape === 'stair' || it.shape === 'trapdoor') { const fy = hit.t > 0 ? this.eyeRay.y + this.eyeRay.dy * hit.t - hit.y : 0.5; if (hit.ny === -1 || (hit.ny === 0 && fy > 0.5)) st |= S_TOP; }
    if (it.shape === 'door') { if (this.world.getBlock(x, y + 1, z) !== 0 || !SOLID[this.world.getBlock(x, y - 1, z)]) return false; }
    if (it.shape === 'cross' && !SOLID[this.world.getBlock(x, y - 1, z)] && it.key !== 'vine_curtain') return false;
    // player collision
    if (it.solid) { const bx = x, by = y, bz = z; if (p.x + 0.3 > bx && p.x - 0.3 < bx + 1 && p.z + 0.3 > bz && p.z - 0.3 < bz + 1 && p.y + 1.8 > by && p.y < by + 1) return false; }
    if (!this.setBlock(x, y, z, it.id, st, true)) return false;
    if (it.shape === 'door') this.setBlock(x, y + 1, z, it.id, st | S_UPPER, true);
    if (it.use === 'beacon') { this.claims.push({ x, y, z, r: 32, tier: 0 }); this.stat('beacons', 1); audio.sfx('beacon'); this.notify('Frontline established. This land is yours to restore.', 'challenge'); this.sim.burst(x + 0.5, y + 1, z + 0.5, 'beacon', 40); this.spawn = { x: x + 0.5, y: y + 1, z: z + 0.5 }; }
    if (it.use === 'crate') this.tile(`${x},${y},${z}`).slots = Array(27).fill(null);
    audio.sfx('place:' + it.snd, [x + 0.5, y + 0.5, z + 0.5]);
    this.stat('blocks_placed', 1); emitMod('block_placed', { x, y, z, block: it.key });
    return true;
  }
  eyeRay = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1 };

  // ------------------------------------------------------------------ interaction
  rollLoot(x: number, y: number, z: number, vault: boolean): (Stack | null)[] {
    const slots: (Stack | null)[] = Array(27).fill(null);
    const bio = this.gen.biomeAt(x, z);
    const table = y < 36 ? LOOT.lab : bio === 'industrial' ? LOOT.industrial : bio === 'snow' || bio === 'mountain' || bio === 'snowpeak' ? LOOT.military : LOOT.base;
    const rolls = vault ? 7 : 3 + Math.floor(hash01(x, y, z, 11) * 3);
    for (let i = 0; i < rolls; i++) {
      const tbl = hash01(x, y, z, 20 + i) < 0.35 ? LOOT.base : table;
      const tw = tbl.reduce((a, q) => a + q[3], 0); let r = hash01(x, y, z, 40 + i) * tw; let pick = tbl[0];
      for (const q of tbl) { r -= q[3]; if (r <= 0) { pick = q; break; } }
      this.addToSlots(slots, pick[0], pick[1] + Math.floor(hash01(x, y, z, 70 + i) * (pick[2] - pick[1] + 1)));
    }
    return slots;
  }
  loreFor(x: number, z: number, y: number) {
    const tag = y < 36 ? 'lab' : BIOME_INFO[this.gen.biomeAt(x, z)]?.tag ?? 'city';
    const pool = Reg.lore.filter((l) => l.tag === tag); const all = pool.length ? pool : Reg.lore;
    return all[hashInt(x, y, z, this.world.seed) % all.length]?.text ?? LORE.city[0];
  }
  interact(hit: NonNullable<Game['target']>): boolean {
    const b = Reg.blocks[hit.id]; if (!b || !b.use) return false;
    const { x, y, z } = hit, key = `${x},${y},${z}`, st = this.world.getState(x, y, z);
    switch (b.use) {
      case 'door': case 'trapdoor': {
        const flip = (yy: number) => { const s2 = this.world.getState(x, yy, z); this.world.setBlock(x, yy, z, hit.id, s2 ^ S_ON); };
        flip(y); if (b.shape === 'door') { const oy = st & S_UPPER ? y - 1 : y + 1; if (this.world.getBlock(x, oy, z) === hit.id) flip(oy); }
        this.urgent.add(this.world.getChunk(x >> 4, z >> 4)!); audio.sfx('door', [x, y, z]); return true;
      }
      case 'toggle': this.setBlock(x, y, z, hit.id, st ^ S_ON, false); audio.sfx('ui'); this.sim.powerT = 0; return true;
      case 'crate': case 'loot': {
        const t = this.tile(key);
        if (!t.slots) t.slots = this.rollLoot(x, y, z, b.key === 'vault_safe');
        this.panel = 'container'; this.panelData = { key, name: b.name }; this.tab = 'inventory'; this.releaseLock(); audio.sfx('door', [x, y, z]); return true;
      }
      case 'workbench': case 'smelter': case 'fabricator': case 'foundry': this.panel = 'inventory'; this.tab = 'crafting'; this.releaseLock(); audio.sfx('ui'); return true;
      case 'research': this.panel = 'inventory'; this.tab = 'research'; this.releaseLock(); audio.sfx('ui'); return true;
      case 'terminal': { this.panel = 'terminal'; this.panelData = { text: this.loreFor(x, z, y), title: b.name }; this.releaseLock(); this.stat('logs', 1); audio.sfx('ui'); return true; }
      case 'bed': { this.spawn = { x: x + 0.5, y: y + 1, z: z + 0.5 }; if (this.dayFactor < 0.3) { this.time = 0.27; this.notify('You slept until dawn.'); } else this.notify('Spawn point set.'); audio.sfx('ui'); return true; }
      case 'generator': {
        const h = this.held(); const t = this.tile(key); const fuelKey = b.key === 'fusion_cell' ? 'plasma_cell' : 'carbon';
        if (h && h.key === fuelKey) { t.fuel = (t.fuel ?? 0) + (fuelKey === 'carbon' ? 60 : 600); h.n--; if (h.n <= 0) this.inv[this.hot] = null; audio.sfx('power', [x, y, z]); this.notify(`Fuel: ${Math.round(t.fuel)}s`); }
        else this.notify(`${b.name}: ${Math.round(t.fuel ?? 0)}s of fuel. Right-click with ${fuelKey === 'carbon' ? 'Carbon' : 'a Plasma Cell'}.`);
        return true;
      }
      case 'beacon': {
        const c = this.claims.find((q) => q.x === x && q.z === z); const h = this.held();
        if (c && h && h.key === 'power_core' && c.tier < 3) { c.tier++; c.r = 32 + c.tier * 16; h.n--; if (h.n <= 0) this.inv[this.hot] = null; audio.sfx('beacon'); this.notify(`Beacon upgraded: radius ${c.r}`, 'challenge'); }
        else if (c) this.notify(`Frontline Beacon — radius ${c.r}, Mk ${c.tier + 1}. Restored ${this.stats.restored ?? 0} blocks. Right-click with a Power Core to expand.`);
        return true;
      }
    }
    return false;
  }
  releaseLock() { if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock(); this.locked = false; }
  hurt(dmg: number, src = '') {
    const p = this.p;
    if (p.dead || this.mode === 'creative' || this.mode === 'exploration' || p.shield > 0) { if (p.shield > 0) audio.sfx('shield'); return; }
    const def = this.equip.armor ? Reg.items.get(this.equip.armor.key)?.spec?.equip?.def ?? 0 : 0;
    p.health -= dmg * (1 - def); p.hurtT = 0.6; this.shake = 0.3; this.combatT = 12; audio.sfx('hurt'); emitMod('player_hurt', { dmg, src });
    if (p.health <= 0) { p.dead = true; p.health = 0; audio.sfx('death'); this.releaseLock(); this.panel = 'none'; emitMod('player_died', { src }); }
  }
  respawn() {
    const p = this.p; p.dead = false; p.health = 20; p.hunger = 14; p.air = 15; p.vx = p.vy = p.vz = 0; p.hurtT = 0;
    const s = this.claims.length ? { x: this.claims[this.claims.length - 1].x + 0.5, y: this.claims[this.claims.length - 1].y + 2, z: this.claims[this.claims.length - 1].z + 0.5 } : this.spawn;
    p.x = s.x; p.y = s.y + 0.5; p.z = s.z; this.sim.machines = []; this.sim.bolts = [];
  }

  // ---- gadgets & weapons
  cd(key: string, t: number) { const now = performance.now() / 1000; if ((this.cooldown.get(key) ?? 0) > now) return false; this.cooldown.set(key, now + t); return true; }
  look(): [number, number, number] { const p = this.p; return [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)]; }
  eye(): [number, number, number] { return [this.p.x, this.p.y + (this.p.sneak ? 1.4 : 1.62), this.p.z]; }
  useItem(): boolean {
    const s = this.held(), it = this.heldItem(); if (!s || !it) return false;
    const e = this.eye(), d = this.look(), sp = it.spec;
    if (it.type === 'food' && sp?.food) {
      if (this.p.hunger >= 20 && !sp.food.heal) return false;
      if (!this.cd('eat', 0.8)) return true;
      this.p.hunger = Math.min(20, this.p.hunger + sp.food.hunger); this.p.health = Math.min(20, this.p.health + (sp.food.heal ?? 1)); audio.sfx('eat'); if (this.mode !== 'creative') { s.n--; if (s.n <= 0) this.inv[this.hot] = null; } return true;
    }
    if (it.key === 'data_log') { this.panel = 'terminal'; this.panelData = { text: this.loreFor(Math.floor(this.p.x), Math.floor(this.p.z), Math.floor(this.p.y)), title: 'Recovered Log' }; this.releaseLock(); return true; }
    if (it.type === 'equip' && sp?.equip) { const slot = sp.equip.slot; const cur = this.equip[slot]; this.equip[slot] = { ...s, n: 1 }; this.inv[this.hot] = cur ? cur : null; this.notify(`Equipped ${it.name}`); audio.sfx('ui'); return true; }
    if (it.type !== 'gadget' || !sp?.gadget) return false;
    const k = sp.gadget.kind;
    if (!this.cd(it.key, sp.gadget.cd)) { this.notify('Recharging...', 'warn'); return true; }
    switch (k) {
      case 'scanner': {
        audio.sfx('scan'); this.scanPings = []; const R = 36, cx = Math.floor(this.p.x), cy = Math.floor(this.p.y), cz = Math.floor(this.p.z);
        for (let x = cx - R; x <= cx + R; x++) for (let z = cz - R; z <= cz + R; z++) for (let y = Math.max(1, cy - 24); y <= Math.min(CH - 1, cy + 24); y++) {
          const id = this.world.getBlock(x, y, z); if (!id) continue; const b = Reg.blocks[id]!;
          if (b.key.endsWith('_ore') || b.key === 'carbon_seam' || b.key === 'oil_shale') { if ((x + y + z) % 3 === 0 || b.key === 'zerite_ore') this.scanPings.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, c: b.key === 'zerite_ore' ? '#4ff0d0' : '#ffd048', t: 12, n: b.name }); }
          else if (b.use === 'loot' || (b.use === 'crate' && !this.tiles.has(`${x},${y},${z}`))) this.scanPings.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, c: '#58ffb0', t: 12, n: 'Cache' });
        }
        for (const m of this.sim.machines) this.scanPings.push({ x: m.x, y: m.y + 1, z: m.z, c: '#ff4a40', t: 12, n: m.type });
        for (const s2 of this.gen.sitesAround(this.p.x, this.p.z, 200)) this.scanPings.push({ x: s2.x, y: s2.y + 6, z: s2.z, c: '#58d8ff', t: 12, n: s2.kind.name });
        if (this.scanPings.length > 160) this.scanPings.length = 160;
        this.notify(`Scan complete: ${this.scanPings.length} signatures`); break;
      }
      case 'hook': { const h = this.world.raycast(e[0], e[1], e[2], d[0], d[1], d[2], 42); if (h) { this.hook = { x: h.x + 0.5 + h.nx * 0.6, y: h.y + 0.5 + h.ny * 0.6, z: h.z + 0.5 + h.nz * 0.6, t: 1.8 }; audio.sfx('hook'); this.useDur(s, 1); } break; }
      case 'shield': this.p.shield = 6; audio.sfx('shield'); break;
      case 'drone': this.sim.drone = { x: this.p.x, y: this.p.y + 2, z: this.p.z, t: 60, cd: 0 }; audio.sfx('drone'); break;
      case 'repair': { const n = this.inv[(this.hot + 1) % 9]; const ni = n && Reg.items.get(n.key); const max = ni?.spec?.tool?.dur ?? ni?.spec?.weapon?.dur; if (n && max) { n.dur = Math.min(max, (n.dur ?? max) + max * 0.5); audio.sfx('craft'); this.notify(`Repaired ${ni!.name}`); this.sim.burst(this.p.x, this.p.y + 1.2, this.p.z, 'cyan', 14); } else this.notify('Put a damaged tool in the next slot.', 'warn'); break; }
      case 'builder': {
        const t = this.target, n = this.inv[(this.hot + 1) % 9], nb = n && Reg.items.get(n.key)?.block;
        if (!t || !nb) { this.notify('Aim at a surface with a block in the next slot.', 'warn'); break; }
        const ax = Math.abs(t.nx) ? 0 : 1, bx = Math.abs(t.nz) ? 0 : (Math.abs(t.nx) ? 2 : 2);
        let placed = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          const off = [0, 0, 0]; if (t.ny !== 0) { off[0] = i; off[2] = j; } else if (t.nx !== 0) { off[1] = i; off[2] = j; } else { off[0] = i; off[1] = j; }
          void ax; void bx;
          const x = t.x + t.nx + off[0], y = t.y + t.ny + off[1], z = t.z + t.nz + off[2];
          if (this.world.getBlock(x, y, z) === 0 && SOLID[this.world.getBlock(x - t.nx, y - t.ny, z - t.nz)] && (this.mode === 'creative' || n!.n > 0)) { this.setBlock(x, y, z, nb.id, 0, true); placed++; if (this.mode !== 'creative') { n!.n--; if (n!.n <= 0) { this.inv[(this.hot + 1) % 9] = null; break; } } }
        }
        if (placed) { audio.sfx('place:' + nb.snd); this.stat('blocks_placed', placed); } break;
      }
      case 'terra': {
        const t = this.target; if (!t) break; const R = 5, y0 = t.y; let n = 0;
        for (let x = t.x - R; x <= t.x + R; x++) for (let z = t.z - R; z <= t.z + R; z++) {
          if (Math.hypot(x - t.x, z - t.z) > R) continue;
          for (let y = y0 + 1; y <= y0 + 8; y++) { const id = this.world.getBlock(x, y, z); if (id && Reg.blocks[id]!.hard >= 0 && !Reg.blocks[id]!.use) { this.setBlock(x, y, z, 0, 0, true); n++; } }
          for (let y = y0 - 1; y >= y0 - 6; y--) { if (this.world.getBlock(x, y, z) === 0 || LIQ[this.world.getBlock(x, y, z)]) this.setBlock(x, y, z, ID.dirt, 0, true); else break; }
          if (this.world.getBlock(x, y0, z) === 0) this.setBlock(x, y0, z, this.world.getBlock(t.x, y0, t.z), 0, true);
        }
        audio.sfx('explode', undefined, 0.4); this.sim.burst(t.x + 0.5, t.y + 1, t.z + 0.5, 'dust', 40); this.useDur(s, 0); this.stat('blocks_broken', n); break;
      }
      default: return false;
    }
    return true;
  }
  attack(): boolean {
    const s = this.held(), it = this.heldItem(); const e = this.eye(), d = this.look();
    const w = it?.spec?.weapon;
    const reach = w?.kind === 'melee' ? (w.range ?? 3.2) : 3.4;
    if (w && w.kind !== 'melee') {
      if (!this.cd(it!.key, w.cd)) return true;
      this.swingT = 0.25; this.combatT = 10; this.p.swing = 1;
      const o: [number, number, number] = [e[0] + d[0] * 0.5, e[1] - 0.15 + d[1] * 0.5, e[2] + d[2] * 0.5];
      if (w.kind === 'bolt') { this.sim.bolts.push({ x: o[0], y: o[1], z: o[2], dx: d[0], dy: d[1], dz: d[2], life: 1.6, dmg: w.dmg, owner: 'player', color: [0.4, 0.9, 1], pierce: false }); audio.sfx('bolt'); }
      else if (w.kind === 'spread') { for (let i = 0; i < 6; i++) { const sx = (Math.random() - 0.5) * 0.28, sy = (Math.random() - 0.5) * 0.2; const l = Math.hypot(d[0] + sx, d[1] + sy, d[2]); this.sim.bolts.push({ x: o[0], y: o[1], z: o[2], dx: (d[0] + sx) / l, dy: (d[1] + sy) / l, dz: d[2] / l, life: 0.3, dmg: w.dmg, owner: 'player', color: [1, 0.7, 0.3], pierce: false }); } audio.sfx('spread'); }
      else { this.sim.bolts.push({ x: o[0], y: o[1], z: o[2], dx: d[0], dy: d[1], dz: d[2], life: 1.2, dmg: w.dmg, owner: 'player', color: [0.9, 0.5, 1], pierce: true }); this.sim.arcs.push({ a: o, b: [e[0] + d[0] * 40, e[1] + d[1] * 40, e[2] + d[2] * 40], life: 0.12 }); audio.sfx('rail'); this.shake = 0.15; }
      if (s) this.useDur(s, 1);
      return true;
    }
    // melee
    const mh = this.sim.rayMachine(e[0], e[1], e[2], d[0], d[1], d[2], reach);
    if (mh) {
      if (!this.cd('melee', w?.cd ?? 0.4)) return true;
      const dmg = w ? w.dmg : 2 + (it?.spec?.tool?.tier ?? 0) * 1.2;
      this.sim.hurtMachine(mh.m, dmg, d[0] * 5, d[2] * 5); this.swingT = 0.25; this.p.swing = 1; this.combatT = 10;
      if (s && w) this.useDur(s, 1);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ chunk streaming
  stream(budgetMs: number, loading = false) {
    const pcx = Math.floor(this.p.x / 16), pcz = Math.floor(this.p.z / 16), R = this.q.viewDist;
    if (pcx !== this.lastCx || pcz !== this.lastCz || !this.ring.length) {
      this.lastCx = pcx; this.lastCz = pcz; this.ring = [];
      for (let dx = -R - 2; dx <= R + 2; dx++) for (let dz = -R - 2; dz <= R + 2; dz++) { const d = Math.hypot(dx, dz); if (d <= R + 2.5) this.ring.push([pcx + dx, pcz + dz, d]); }
      this.ring.sort((a, b) => a[2] - b[2]);
    }
    const t0 = performance.now();
    const w = this.world;
    for (const [cx, cz] of this.ring) {
      if (performance.now() - t0 > budgetMs * 0.55) break;
      const key = ckey(cx, cz);
      if (w.chunks.has(key)) continue;
      const c = new Chunk(cx, cz);
      this.gen.generate(c);
      const raw = this.saved.get(`${cx},${cz}`);
      if (raw) { const b = unrle(raw.b, CVOL, Uint16Array) as Uint16Array; const s = unrle(raw.s, CVOL, Uint8Array) as Uint8Array; if (this.remap) for (let i = 0; i < b.length; i++) b[i] = this.remap[b[i]] ?? 0; c.blocks.set(b); c.state.set(s); c.modified = true; }
      w.chunks.set(key, c); w.initLight(c); this.sim.scanChunk(c);
      if (loading && performance.now() - t0 > budgetMs) break;
    }
    // urgent (edited) chunks first
    let meshed = 0;
    for (const c of this.urgent) { if (meshed++ > 5) break; this.meshOne(c, true); }
    this.urgent.clear();
    for (const [cx, cz, d] of this.ring) {
      if (performance.now() - t0 > budgetMs) break;
      if (d > R + 0.5) continue;
      const c = w.getChunk(cx, cz); if (!c || c.status < 2) continue;
      const lod = d > this.q.lodDist ? 1 : 0;
      if (!c.dirty && c.meshLod === lod) continue;
      this.meshOne(c, false, lod);
    }
    // unload
    if (!loading) {
      for (const c of w.chunks.values()) {
        if (Math.hypot(c.cx - pcx, c.cz - pcz) > R + 4) {
          if (c.modified) this.persistChunk(c);
          this.renderer?.removeChunk(ckey(c.cx, c.cz)); this.sim.dropChunk(c); w.chunks.delete(ckey(c.cx, c.cz)); (w as any).cache = undefined; this.modified.delete(c);
        }
      }
    }
  }
  meshOne(c: Chunk, urgent: boolean, lodIn?: number) {
    const w = this.world;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const n = w.getChunk(c.cx + dx, c.cz + dz); if (!n || n.status < 2) return; }
    const d = Math.hypot(c.cx - this.lastCx, c.cz - this.lastCz);
    const lod = lodIn ?? (d > this.q.lodDist ? 1 : 0);
    const m = meshChunk(w, c, urgent ? 0 : lod);
    c.dirty = false; c.meshLod = urgent ? 0 : lod;
    this.renderer?.setChunk(ckey(c.cx, c.cz), c.cx, c.cz, m);
  }
  persistChunk(c: Chunk) { const pal = this.meta.palette; void pal; this.saved.set(`${c.cx},${c.cz}`, { b: rleSafe(c.blocks), s: rleSafe(c.state) }); saveChunk(this.meta.id, c.cx, c.cz, c.blocks, c.state).catch(() => {}); }
  async save() {
    for (const c of this.world.chunks.values()) if (c.modified && this.modified.has(c)) this.persistChunk(c);
    this.modified.clear();
    const m = this.meta;
    m.played = Date.now(); m.palette = makePalette(); m.time = this.time; m.tiles = Object.fromEntries(this.tiles);
    m.player = { p: { ...this.p }, inv: this.inv, hot: this.hot, equip: this.equip, tech: [...this.tech], stats: this.stats, done: [...this.done], discovered: [...this.discovered], claims: this.claims, spawn: this.spawn };
    m.mods = [...modRuntime.mods.keys()];
    await saveWorldMeta(m);
  }

  // ------------------------------------------------------------------ main loop
  start() { this.running = true; this.last = performance.now(); const loop = (now: number) => { if (!this.running) return; this.raf = requestAnimationFrame(loop); const dt = Math.min(0.06, (now - this.last) / 1000); this.last = now; this.frame(dt); }; this.raf = requestAnimationFrame(loop); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }
  frame(dt: number) {
    this.frames++; this.fpsT += dt; if (this.fpsT >= 0.5) { this.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; }
    if (!this.paused) this.update(dt);
    this.render(dt);
  }
  key(a: string) { return this.keys.has(this.settings.keys[a] ?? DEFAULT_KEYS[a]); }

  update(dt: number) {
    const p = this.p, w = this.world;
    this.time = (this.time + dt / 1200) % 1; this.dayFactor = this.calcDay();
    this.stream(5.5);
    const inUI = this.panel !== 'none' && this.panel !== 'map';
    const live = !p.dead && !inUI;
    // look
    if (this.locked && live) { const s = 0.0022 * this.settings.sens; p.yaw -= this.lookDX * s; p.pitch = clamp(p.pitch - this.lookDY * s * (this.settings.invertY ? -1 : 1), -1.55, 1.55); }
    this.lookDX = this.lookDY = 0;
    // physics
    const eyeY = p.y + 1.62;
    p.inWater = LIQ[w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.6), Math.floor(p.z))] === 1;
    p.under = LIQ[w.getBlock(Math.floor(p.x), Math.floor(eyeY), Math.floor(p.z))] === 1;
    const loaded = w.isLoaded(Math.floor(p.x), Math.floor(p.z));
    if (loaded && !p.dead) {
      let fx = 0, fz = 0;
      if (live) { if (this.key('forward')) fz -= 1; if (this.key('back')) fz += 1; if (this.key('left')) fx -= 1; if (this.key('right')) fx += 1; }
      const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
      const sneak = live && this.key('sneak'); p.sneak = sneak && !p.flying;
      const wantSprint = live && (this.key('sprint') || this.sprintLatch) && fz < 0 && p.hunger > 3 && !p.sneak;
      p.sprint = wantSprint;
      let sp = p.flying ? (p.sprint ? 18 : 10.5) : p.sneak ? 1.8 : p.sprint ? 6.4 : 4.3;
      if (p.inWater && !p.flying) sp *= 0.55;
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      const wx = (fx * cy + fz * sy) * sp, wz = (-fx * sy + fz * cy) * sp;
      const acc = p.onGround || p.flying ? 14 : 3.5;
      p.vx += (wx - p.vx) * Math.min(1, acc * dt); p.vz += (wz - p.vz) * Math.min(1, acc * dt);
      const jump = live && this.key('jump');
      if (p.flying) { p.vy += (((jump ? 1 : 0) - (sneak ? 1 : 0)) * (p.sprint ? 14 : 8) - p.vy) * Math.min(1, 8 * dt); }
      else {
        const climbing = Reg.blocks[w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.5), Math.floor(p.z))]?.climb;
        if (climbing) { p.vy = jump ? 3.6 : sneak ? -3 : Math.max(p.vy, -1.5) * 0.8 - 0; if (!jump && !sneak) p.vy = 0; p.fall = 0; }
        else if (p.inWater) { p.vy += ((jump ? 3.4 : -1.6) - p.vy) * Math.min(1, 4 * dt); p.fall = 0; }
        else { p.vy -= 27 * dt; if (p.vy < -48) p.vy = -48; }
        if (jump && p.onGround && !p.inWater) { p.vy = 8.6; p.onGround = false; audio.sfx('step:' + this.groundMat(), [p.x, p.y, p.z], 1.2); }
        // thruster pack
        if (this.equip.pack?.key === 'thruster_pack' && jump && !p.onGround && !p.inWater) { if (p.jetFuel > 0) { p.vy = Math.min(p.vy + 40 * dt, 7); p.jetFuel -= 30 * dt; if (Math.random() < 0.3) { this.sim.burst(p.x, p.y, p.z, 'spark', 2); audio.sfx('thruster'); } } }
        if (p.onGround) p.jetFuel = Math.min(100, p.jetFuel + 60 * dt); else if (!jump) p.jetFuel = Math.min(100, p.jetFuel + 10 * dt);
      }
      if (this.hook) { const h = this.hook; const dx = h.x - p.x, dy = h.y - (p.y + 1), dz = h.z - p.z, d = Math.hypot(dx, dy, dz); h.t -= dt; if (d < 2 || h.t <= 0) { this.hook = null; p.vy = Math.max(p.vy, 4); } else { p.vx += (dx / d * 28 - p.vx) * Math.min(1, 6 * dt); p.vy += (dy / d * 28 - p.vy) * Math.min(1, 6 * dt); p.vz += (dz / d * 28 - p.vz) * Math.min(1, 6 * dt); p.fall = 0; } }
      this.move(dt);
      // fall damage
      if (!p.flying && !p.inWater) { if (p.vy < -0.5 && !p.onGround) p.fall = Math.max(p.fall, 0) + -p.vy * dt; }
    }
    if (p.y < -20) { p.y = 90; p.vy = 0; this.hurt(6, 'void'); }
    // eye smoothing
    p.stepSmooth *= Math.max(0, 1 - dt * 10);
    // survival
    p.hurtT = Math.max(0, p.hurtT - dt); p.shield = Math.max(0, p.shield - dt); p.swing = Math.max(0, p.swing - dt * 4); this.swingT = Math.max(0, this.swingT - dt); this.shake = Math.max(0, this.shake - dt);
    if (this.mode === 'survival' || this.mode === 'challenge') {
      p.hunger = Math.max(0, p.hunger - dt * (p.sprint ? 0.07 : 0.012));
      if (p.hunger > 14 && p.health < 20 && !p.dead) { p.regen += dt; if (p.regen > 2.5) { p.regen = 0; p.health = Math.min(20, p.health + 1); p.hunger -= 0.3; } }
      if (p.hunger <= 0) { p.starve += dt; if (p.starve > 4) { p.starve = 0; this.hurt(1, 'hunger'); } }
      if (p.under) { p.air -= dt; if (p.air < 0) { p.air = 0; p.regen += dt; if (p.regen > 1) { p.regen = 0; this.hurt(2, 'drown'); } } } else p.air = Math.min(15, p.air + dt * 6);
    } else { p.hunger = 20; p.health = 20; p.air = 15; }
    // fall landing handled in move()
    if (!p.dead && !inUI) this.interactTick(dt);
    this.sim.update(dt);
    this.slow(dt);
    // audio
    if (this.panel === 'pause') return;
    const e = this.eye(), l = this.look(); audio.setListener(e, l);
    this.combatT = Math.max(0, this.combatT - dt);
    const urban = this.biome === 'metropolis' || this.biome === 'industrial';
    const mood: Mood = this.combatT > 0 || this.sim.machines.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < 14) ? 'combat' : this.discT > 0 ? 'discovery' : p.y < 34 ? 'underground' : this.dayFactor < 0.2 ? 'night' : urban ? 'city' : 'explore';
    this.discT = Math.max(0, this.discT - dt);
    const wthr = this.sim.weather;
    audio.update(dt, { mood, ambience: BIOME_INFO[this.biome]?.ambience ?? 'wind', rain: wthr.rain, wind: wthr.wind, underwater: p.under, underground: p.y < 36 && (this.world.getLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)) >> 4) < 8, night: this.dayFactor < 0.25, storm: wthr.storm, machines: this.sim.machines.length }, [p.x, p.y, p.z]);
  }
  groundMat() { const b = Reg.blocks[this.world.getBlock(Math.floor(this.p.x), Math.floor(this.p.y - 0.2), Math.floor(this.p.z))]; return b?.snd ?? 'stone'; }

  move(dt: number) {
    const p = this.p, hw = 0.3, h = p.sneak ? 1.5 : 1.8;
    const w = this.world;
    const box: number[] = [];
    const collide = (axis: number, delta: number): boolean => {
      if (delta === 0) return false;
      const pos = [p.x, p.y, p.z]; pos[axis] += delta;
      const x0 = pos[0] - hw, x1 = pos[0] + hw, y0 = pos[1], y1 = pos[1] + h, z0 = pos[2] - hw, z1 = pos[2] + hw;
      let hit = false;
      for (let x = Math.floor(x0); x <= Math.floor(x1 - 1e-6); x++) for (let z = Math.floor(z0); z <= Math.floor(z1 - 1e-6); z++) for (let y = Math.floor(y0); y <= Math.floor(y1 - 1e-6); y++) {
        const id = w.getBlock(x, y, z); if (!id || !SOLID[id]) continue;
        const b = Reg.blocks[id]!;
        const list = b.shape === 'cube' ? [[0, 0, 0, 1, 1, 1]] : collisionBoxes(b, w.getState(x, y, z)).map((q) => q.b as number[]);
        for (const q of list) {
          const bx0 = x + q[0], by0 = y + q[1], bz0 = z + q[2], bx1 = x + q[3], by1 = y + q[4], bz1 = z + q[5];
          if (x1 <= bx0 + 1e-6 || x0 >= bx1 - 1e-6 || y1 <= by0 + 1e-6 || y0 >= by1 - 1e-6 || z1 <= bz0 + 1e-6 || z0 >= bz1 - 1e-6) continue;
          hit = true;
          if (axis === 0) pos[0] = delta > 0 ? Math.min(pos[0], bx0 - hw) : Math.max(pos[0], bx1 + hw);
          else if (axis === 2) pos[2] = delta > 0 ? Math.min(pos[2], bz0 - hw) : Math.max(pos[2], bz1 + hw);
          else pos[1] = delta > 0 ? Math.min(pos[1], by0 - h) : Math.max(pos[1], by1);
        }
      }
      p.x = pos[0]; p.y = pos[1]; p.z = pos[2];
      return hit;
    };
    void box;
    const hadGround = p.onGround;
    for (const axis of [0, 2]) {
      const d = (axis === 0 ? p.vx : p.vz) * dt;
      const ox = p.x, oz = p.z;
      let hit = collide(axis, d);
      if (hit && (hadGround || p.inWater) && !p.flying) {
        // auto step up to 0.6
        const sx = p.x, sz = p.z, sy = p.y; p.x = ox; p.z = oz; p.y = sy + 0.6;
        if (!collide(1, 0.0001) && !collide(axis, d)) { p.y = sy + 0.6; collide(1, -0.6); p.stepSmooth += p.y - sy; hit = false; } else { p.x = sx; p.z = sz; p.y = sy; }
      }
      if (hit) { if (axis === 0) p.vx = 0; else p.vz = 0; }
      if (p.sneak && hadGround && !p.flying) { // edge safety
        const below = (() => { const sy = p.y; p.y -= 0.35; const sx = p.x; const r = collide(1, -0.0001); p.y = sy; p.x = sx; return r; })();
        if (!below) { p.x = ox; p.z = oz; }
      }
    }
    const vyd = p.vy * dt;
    const hitY = collide(1, vyd);
    if (hitY) {
      if (p.vy < 0) {
        if (!p.onGround && p.fall > 3.2 && !p.flying) { const dmg = Math.floor(p.fall - 3); if (dmg > 0 && !p.inWater) { this.hurt(dmg, 'fall'); this.shake = 0.3; audio.sfx('step:' + this.groundMat(), undefined, 2); } }
        p.fall = 0; p.onGround = true;
      } else p.onGround = false;
      p.vy = 0;
    } else { p.onGround = false; }
    if (p.onGround) p.fall = 0;
    // footsteps & stats
    const spd = Math.hypot(p.vx, p.vz);
    if (p.onGround && spd > 1) { p.walk += spd * dt; this.bob += spd * dt * 1.6; if (p.walk > (p.sprint ? 2.1 : 1.7)) { p.walk = 0; audio.sfx('step:' + this.groundMat(), [p.x, p.y, p.z], p.sneak ? 0.4 : 1); } this.stats.distance = (this.stats.distance ?? 0) + spd * dt; }
    if (p.inWater && !this.wasInWater) audio.sfx('splash', [p.x, p.y, p.z]);
    this.wasInWater = p.inWater;
  }
  wasInWater = false;

  interactTick(dt: number) {
    const e = this.eye(), d = this.look(), p = this.p;
    this.eyeRay = { x: e[0], y: e[1], z: e[2], dx: d[0], dy: d[1], dz: d[2] };
    const reach = this.mode === 'creative' ? 8 : 5.5;
    this.target = this.world.raycast(e[0], e[1], e[2], d[0], d[1], d[2], reach);
    const s = this.held(), it = this.heldItem();
    const lock = this.locked;
    const weaponHeld = !!it?.spec?.weapon;
    if (lock && this.mouse[0]) {
      const isRanged = it?.spec?.weapon && it.spec.weapon.kind !== 'melee';
      const attacked = (weaponHeld || !this.target) ? this.attack() : (this.sim.rayMachine(e[0], e[1], e[2], d[0], d[1], d[2], this.target.t) ? this.attack() : false);
      if (!attacked && this.target && !isRanged) this.mineTick(dt, s);
      else this.mining.p = 0;
    } else this.mining.p = 0;
    void p;
  }
  mineTick(dt: number, s: Stack | null) {
    const t = this.target!, id = t.id, b = Reg.blocks[id]!;
    if (b.unbreakable || b.hard < 0) return;
    const m = this.mining;
    if (m.x !== t.x || m.y !== t.y || m.z !== t.z) { m.x = t.x; m.y = t.y; m.z = t.z; m.p = 0; }
    const time = this.breakTime(b, s);
    m.p += dt / time; m.t -= dt; this.swingT = Math.max(this.swingT, 0.1);
    if (m.t <= 0) { m.t = 0.2; audio.sfx('mine:' + b.snd, [t.x + 0.5, t.y + 0.5, t.z + 0.5]); this.sim.blockChips(t.x, t.y, t.z, b, 2); this.p.swing = 1; }
    if (m.p >= 1) {
      m.p = 0;
      const ti = s && Reg.items.get(s.key)?.spec?.tool;
      this.breakBlock(t.x, t.y, t.z, s);
      if (ti?.area) { const ax = Math.abs(t.nx), ay = Math.abs(t.ny); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { if (!i && !j) continue; const o = ay ? [i, 0, j] : ax ? [0, i, j] : [i, j, 0]; const x = t.x + o[0], y = t.y + o[1], z = t.z + o[2]; const nb = Reg.blocks[this.world.getBlock(x, y, z)]; if (nb && nb.hard >= 0 && nb.tier <= ti.tier && !nb.use) this.breakBlock(x, y, z, s, true); } }
      if (ti?.vein) { const q: number[][] = [[t.x, t.y, t.z]]; const seen = new Set<string>(); let n = 0; while (q.length && n < 14) { const [x, y, z] = q.shift()!; for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const k = `${x + dx},${y + dy},${z + dz}`; if (seen.has(k)) continue; seen.add(k); if (this.world.getBlock(x + dx, y + dy, z + dz) === id) { this.breakBlock(x + dx, y + dy, z + dz, s, true); q.push([x + dx, y + dy, z + dz]); n++; } } } }
      if (s) this.useDur(s, 1);
    }
  }
  /** called by UI on mouse events */
  mouseDown(btn: number) {
    this.mouse[btn] = true;
    if (!this.locked || this.p.dead) return;
    if (btn === 2) {
      if (this.target) { const sneakBypass = this.p.sneak; const tb = Reg.blocks[this.target.id]; if (tb?.use && !sneakBypass && this.interact(this.target)) return; }
      if (this.useItem()) return;
      const it = this.heldItem();
      if (it?.block && this.target) { if (this.placeBlock(this.target, it.block)) { this.swingT = 0.2; this.p.swing = 1; if (this.mode !== 'creative') { const s = this.held()!; s.n--; if (s.n <= 0) this.inv[this.hot] = null; } } }
    } else if (btn === 1 && this.target) {
      const b = Reg.blocks[this.target.id]; if (b && this.mode === 'creative') { const idx = this.inv.findIndex((s) => s && s.key === b.key); if (idx >= 0 && idx < 9) this.hot = idx; else { this.inv[this.hot] = { key: b.key, n: 64 }; } }
    }
  }
  mouseUp(btn: number) { this.mouse[btn] = false; }
  keyDown(code: string) {
    this.keys.add(code);
    const k = this.settings.keys;
    if (/^Digit[1-9]$/.test(code) && this.panel === 'none') this.hot = parseInt(code.slice(5)) - 1;
    if (code === k.perspective) this.third = !this.third;
    if (code === k.gadget && this.locked) { for (let i = 0; i < 9; i++) { const it = Reg.items.get(this.inv[i]?.key ?? ''); if (it?.key === 'scanner') { const old = this.hot; this.hot = i; this.useItem(); this.hot = old; break; } } }
    if (code === k.fly && this.mode === 'creative') this.p.flying = !this.p.flying;
    if (code === k.jump) { const now = performance.now() / 1000; if (now - this.p.lastJump < 0.3 && this.mode === 'creative') { this.p.flying = !this.p.flying; } this.p.lastJump = now; }
    if (code === k.drop && this.panel === 'none' && this.locked) { const s = this.held(); if (s) { this.sim.drop(this.p.x - Math.sin(this.p.yaw) * 0.8, this.p.y + 1.3, this.p.z - Math.cos(this.p.yaw) * 0.8, s.key, 1); s.n--; if (s.n <= 0) this.inv[this.hot] = null; } }
    if (code === k.sprint && this.settings.sprintToggle) this.sprintLatch = !this.sprintLatch;
  }
  keyUp(code: string) { this.keys.delete(code); }
  wheel(dy: number) { if (this.panel === 'none') this.hot = (this.hot + (dy > 0 ? 1 : 8)) % 9; }

  slow(dt: number) {
    const p = this.p;
    this.biomeT -= dt;
    if (this.biomeT <= 0) { this.biomeT = 0.5; this.biome = this.gen.biomeAt(p.x, p.z); }
    const info = BIOME_INFO[this.biome] ?? BIOME_INFO.plains;
    const mb = Reg.biomes.find((b) => b.key === this.biome);
    const tf = mb?.fog ? [parseInt(mb.fog.slice(1, 3), 16) / 255, parseInt(mb.fog.slice(3, 5), 16) / 255, parseInt(mb.fog.slice(5, 7), 16) / 255] : info.fog;
    const k = Math.min(1, dt * 0.6);
    for (let i = 0; i < 3; i++) this.fog[i] += (tf[i] - this.fog[i]) * k;
    const tm = this.biome === 'industrial' ? 1.5 : this.biome === 'research' ? 1.6 : this.biome === 'desert' ? 1.2 : this.biome === 'snowpeak' ? 1.8 : 1;
    this.fogMul += (tm - this.fogMul) * k;
    this.stationT -= dt;
    if (this.stationT <= 0) {
      this.stationT = 0.5; this.stations = new Set(['hand']);
      const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
      for (let x = cx - 5; x <= cx + 5; x++) for (let y = cy - 3; y <= cy + 4; y++) for (let z = cz - 5; z <= cz + 5; z++) {
        const id = this.world.getBlock(x, y, z); if (!id) continue; const b = Reg.blocks[id]!;
        if (b.use && STATIONS[b.use] && (!b.power?.use || this.world.getState(x, y, z) & S_POWER)) for (const s of STATIONS[b.use]) this.stations.add(s);
      }
    }
    // stats & discovery
    this.stats.depth = Math.max(this.stats.depth ?? 0, 40 - p.y > 0 ? Math.floor(40 - p.y) : 0);
    this.stats.height = Math.max(this.stats.height ?? 0, Math.floor(p.y - 40));
    this.discT2 -= dt;
    if (this.discT2 <= 0) {
      this.discT2 = 1.2;
      for (const s of this.gen.sitesAround(p.x, p.z, 64)) {
        const id = s.kind.id + ':' + s.i + ':' + s.j;
        if (!this.discovered.has(id) && Math.hypot(s.x - p.x, s.z - p.z) < 48) {
          this.discovered.add(id); this.notify(`Discovered: ${s.kind.name}`, 'discover'); audio.sfx('discover'); this.discT = 14; this.stat('discoveries', 1);
          if (this.mode === 'exploration') this.addItem('data_chip', 1);
          if (this.waypoint && Math.hypot(this.waypoint.x - s.x, this.waypoint.z - s.z) < 90) this.waypoint = null;
          emitMod('discovered', { name: s.kind.name });
        }
      }
    }
    for (const t of this.toasts) t.t -= dt; this.toasts = this.toasts.filter((t) => t.t > 0);
    for (const t of this.pickups) t.t -= dt; this.pickups = this.pickups.filter((t) => t.t > 0);
    for (const q of this.scanPings) q.t -= dt; this.scanPings = this.scanPings.filter((q) => q.t > 0);
    this.autoSave -= dt; if (this.autoSave <= 0) { this.autoSave = 30; this.save().catch(() => {}); }
    for (const l of this.tickListeners) l();
  }
  discT2 = 0;

  // ------------------------------------------------------------------ rendering
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean; d: number } {
    const m = this.vp; const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / cw, ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw;
    return { x: (nx * 0.5 + 0.5) * 100, y: (0.5 - ny * 0.5) * 100, visible: cw > 0.1 && Math.abs(nx) < 1.2 && Math.abs(ny) < 1.2, d: cw };
  }
  render(dt: number) {
    const p = this.p, r = this.renderer;
    const aspect = this.canvas ? (this.canvas.clientWidth || 16) / (this.canvas.clientHeight || 9) : 16 / 9;
    const sm = this.settings.reduceMotion ? 0 : 1;
    const bobY = Math.sin(this.bob * 1.1) * 0.035 * sm * (p.onGround ? 1 : 0), bobX = Math.cos(this.bob * 0.55) * 0.03 * sm * (p.onGround ? 1 : 0);
    let eye: [number, number, number] = [p.x + bobX * Math.cos(p.yaw), p.y + (p.sneak ? 1.4 : 1.62) + bobY - p.stepSmooth, p.z - bobX * Math.sin(p.yaw)];
    const look = this.look();
    if (this.shake > 0 && sm) { eye[0] += (Math.random() - 0.5) * this.shake * 0.15; eye[1] += (Math.random() - 0.5) * this.shake * 0.15; }
    let tgt: [number, number, number] = [eye[0] + look[0], eye[1] + look[1], eye[2] + look[2]];
    if (this.third) {
      let back = 4.2; const h = this.world.raycast(eye[0], eye[1], eye[2], -look[0], -look[1], -look[2], back); if (h) back = Math.max(0.6, h.t - 0.3);
      tgt = [eye[0], eye[1], eye[2]]; eye = [eye[0] - look[0] * back, eye[1] - look[1] * back + 0.3, eye[2] - look[2] * back];
    }
    this.cam = eye;
    const fov = ((this.settings.fov + (p.sprint ? 7 : 0) + (this.hook ? 12 : 0)) * Math.PI) / 180;
    const view = mat4.lookAt(mat4.create(), eye, tgt, [0, 1, 0]);
    const proj = mat4.perspective(mat4.create(), fov, aspect, 0.08, 800);
    const vp = mat4.multiply(this.vp, proj, view);
    const inv = mat4.invert(mat4.create(), vp);
    const right = [view[0], view[4], view[8]], up = [view[1], view[5], view[9]];
    const t = performance.now() / 1000;
    this.dynO.reset(); this.dynA.reset();
    this.sim.render(this.dynO, this.dynA, eye, right, up, t);
    this.drawPlayerAndHeld(eye, look, view, t);
    this.drawTarget();
    // beacon beams
    for (const c of this.claims) { if (Math.hypot(c.x - p.x, c.z - p.z) < 120) { const pulse = 0.2 + 0.1 * Math.sin(t * 2); this.dynA.beam(c.x + 0.5, c.y + 1, c.z + 0.5, c.x + 0.5, c.y + 90, c.z + 0.5, 0.12, [1, 0.75, 0.25], pulse, 1.4); } }
    if (this.waypoint) { this.dynA.beam(this.waypoint.x, 60, this.waypoint.z, this.waypoint.x, 140, this.waypoint.z, 0.3, [0.35, 0.85, 1], 0.25, 1.2); }
    if (!r) return;
    // atmosphere
    const ang = (this.time - 0.25) * Math.PI * 2;
    const sd = [Math.cos(ang), Math.sin(ang), 0.28]; const sl = Math.hypot(sd[0], sd[1], sd[2]); sd[0] /= sl; sd[1] /= sl; sd[2] /= sl;
    const day = this.dayFactor, sunUp = sd[1] > 0.02, rain = this.sim.weather.rain, flash = this.sim.weather.flash;
    const dim = 1 - 0.55 * rain;
    const warm = smoothstep(0.5, 0, sd[1]);
    const sunColor = sunUp ? [lerp(1, 1, 0) * 1, lerp(0.96, 0.58, warm), lerp(0.88, 0.32, warm)].map((v) => v * 3.4 * smoothstep(0, 0.22, sd[1]) * dim) : [0.38, 0.5, 0.85].map((v) => v * 0.55 * (1 - day) * dim);
    const ambTop = [lerp(0.035, 0.46, day) * dim + flash * 0.8, lerp(0.05, 0.6, day) * dim + flash * 0.85, lerp(0.11, 0.86, day) * dim + flash], ambBot = [lerp(0.025, 0.34, day) * dim, lerp(0.028, 0.3, day) * dim, lerp(0.045, 0.26, day) * dim];
    const vd = this.q.viewDist;
    const fogC = this.fog.map((c, i) => c * (0.06 + 0.94 * day) * dim + (i === 2 ? 0.01 : 0) + flash * 0.4) as [number, number, number];
    const density = (2.1 / (vd * 16)) * this.fogMul + rain * 0.008 + (this.biome === 'desert' && this.sim.weather.storm ? 0.02 : 0);
    const nv = this.equip.visor ? 1 : 0;
    const frame: FrameParams = {
      view, proj, viewProj: vp, invViewProj: inv, cam: eye, time: t, sunDir: sd as [number, number, number], lightDir: (sunUp ? sd : [-sd[0], -sd[1], -sd[2]]) as [number, number, number], sunColor: sunColor as [number, number, number],
      fogColor: fogC, fogDensity: density, ambTop: ambTop as [number, number, number], ambBot: ambBot as [number, number, number], rain, underwater: this.p.under && eye[1] < this.p.y + 1.7 ? 1 : 0, cloud: this.sim.weather.cloud,
      day, sunset: warm * (sd[1] > -0.25 ? 1 : 0) * (1 - rain * 0.5), wind: this.sim.weather.wind, nightVision: nv, hurt: p.hurtT > 0 ? p.hurtT / 0.6 : 0, exposure: lerp(1.25, 1, day),
      dynO: this.dynO.f, dynOn: this.dynO.n, dynA: this.dynA.f, dynAn: this.dynA.n,
    };
    const stats = r.render(frame);
    this.hud.stats = stats;
    this.updateHud(dt);
    void DYN_STRIDE;
  }

  tintOf(key: string): { c: number[]; g: number[] } {
    const it = Reg.items.get(key); const hexes: string[] = (it?.icon?.a ?? []).filter((a: any) => typeof a === 'string' && a[0] === '#');
    const f = (h?: string, d = [0.6, 0.6, 0.65]) => (h ? [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255] : d);
    if (it?.block) return { c: f(it.block.map), g: f(it.block.map) };
    return { c: f(hexes[0]), g: f(hexes[1] ?? hexes[0]) };
  }
  drawPlayerAndHeld(eye: number[], look: number[], view: Float32Array, t: number) {
    const o = this.dynO, p = this.p, s = this.held(), it = this.heldItem();
    const lv = this.world.getLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z)); const L = Math.min(1, 0.25 + Math.max((lv >> 4) / 15 * (0.2 + this.dayFactor * 0.8), (lv & 15) / 15));
    if (this.third && !p.dead) {
      const sw = Math.sin(this.bob * 1.4) * 0.7 * Math.min(1, Math.hypot(p.vx, p.vz) / 4), yaw = p.yaw + Math.PI;
      const sx = Math.cos(yaw), sz = -Math.sin(yaw);
      const col = (r: number, g: number, b: number) => [r * L, g * L, b * L];
      o.box(p.x, p.y + 1.05, p.z, 0.5, 0.7, 0.28, yaw, 0, col(0.15, 0.55, 0.65)); o.box(p.x, p.y + 1.62, p.z, 0.42, 0.42, 0.42, yaw, 0, col(0.85, 0.7, 0.55)); o.box(p.x - Math.sin(yaw) * 0.2 * -1, p.y + 1.64, p.z - Math.cos(yaw) * 0.2 * -1, 0.36, 0.12, 0.05, yaw, 0, [0.3, 0.9, 1], 1, 1);
      for (const sgn of [-1, 1]) { o.box(p.x + sx * 0.36 * sgn, p.y + 1.05, p.z + sz * 0.36 * sgn, 0.2, 0.7, 0.2, yaw, sw * sgn, col(0.15, 0.5, 0.6), 1, 0, 0.3); o.box(p.x + sx * 0.13 * sgn, p.y + 0.35, p.z + sz * 0.13 * sgn, 0.22, 0.7, 0.24, yaw, -sw * sgn, col(0.2, 0.22, 0.28), 1, 0, 0.3); }
      if (this.equip.pack) o.box(p.x - look[0] * 0.2 * 0, p.y + 1.1, p.z, 0.4, 0.5, 0.2, yaw, 0, col(0.3, 0.3, 0.34), 1, 0);
    }
    if (this.third || p.dead) return;
    // first-person viewmodel (camera space → world)
    const rx = view[0], ry = view[4], rz = view[8], ux = view[1], uy = view[5], uz = view[9], fx = -view[2], fy = -view[6], fz = -view[10];
    const sw = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.25) * Math.PI) : 0;
    const bobS = this.settings.reduceMotion ? 0 : Math.sin(this.bob * 1.1) * 0.012;
    const mineSwing = this.mouse[0] && this.mining.p > 0 ? Math.sin(t * 16) * 0.05 : 0;
    const place = (lx: number, ly: number, lz: number) => [eye[0] + rx * lx + ux * ly + fx * lz, eye[1] + ry * lx + uy * ly + fy * lz, eye[2] + rz * lx + uz * ly + fz * lz];
    const lightC = (c: number[]) => c.map((v) => v * (0.5 + 0.5 * L));
    const hand = place(0.34 - sw * 0.15, -0.3 + bobS - sw * 0.08 + mineSwing, 0.6 + sw * 0.1);
    const yaw = p.yaw + Math.PI, pitch = -p.pitch;
    const tc = s ? this.tintOf(s.key) : null;
    const rot = (x: number, y: number, z: number, sx: number, sy: number, sz: number, col: number[], e = 0, tilt = 0) => { const q = place(0.34 + x - sw * 0.15, -0.3 + y + bobS - sw * 0.08 + mineSwing, 0.6 + z + sw * 0.1); o.box(q[0], q[1], q[2], sx, sy, sz, yaw, pitch + tilt - sw * 0.6, col, 1, e); };
    if (!s || !it) { rot(0, -0.08, 0, 0.13, 0.13, 0.4, lightC([0.85, 0.7, 0.55])); return; }
    if (it.block) { const sz = it.block.shape === 'cube' ? 0.22 : 0.16; rot(0, 0, 0, sz, sz, sz, lightC(tc!.c), it.block.emit ? 0.6 : 0, 0.2); return; }
    const sp = it.spec; void hand;
    if (it.type === 'tool' || (it.type === 'weapon' && sp?.weapon?.kind === 'melee')) { rot(0, -0.02, 0.0, 0.05, 0.05, 0.42, lightC([0.3, 0.27, 0.25])); rot(0, 0.02, 0.2, 0.09, 0.09, 0.2, lightC(tc!.c)); rot(0, 0.02, 0.32, 0.05, 0.05, 0.1, tc!.g, 1.5); }
    else if (it.type === 'weapon') { rot(0, -0.03, 0.05, 0.1, 0.12, 0.42, lightC(tc!.c)); rot(0, 0.0, 0.3, 0.05, 0.05, 0.12, tc!.g, 1.6); rot(0, -0.12, -0.05, 0.07, 0.14, 0.08, lightC([0.25, 0.25, 0.3])); }
    else if (it.type === 'gadget' || it.type === 'equip') { rot(0, 0, 0.05, 0.16, 0.22, 0.1, lightC(tc!.c)); rot(0, 0.04, 0.11, 0.1, 0.1, 0.02, tc!.g, 1.4); }
    else rot(0, 0, 0.0, 0.16, 0.16, 0.16, lightC(tc!.c), 0.3, 0.3);
    void look;
  }
  drawTarget() {
    const t = this.target; if (!t || this.panel !== 'none' || this.third && false) return;
    const b = Reg.blocks[t.id]; if (!b) return;
    const c = 0.003;
    this.dynA.box(t.x + 0.5, t.y + 0.5, t.z + 0.5, 1 + c * 2, 1 + c * 2, 1 + c * 2, 0, 0, [1, 1, 1], 0.07 + Math.sin(performance.now() / 250) * 0.02, 0.6);
    if (this.mining.p > 0 && this.mining.x === t.x && this.mining.y === t.y && this.mining.z === t.z) this.dynA.box(t.x + 0.5, t.y + 0.5, t.z + 0.5, 1.01, 1.01, 1.01, 0, 0, [0, 0, 0], this.mining.p * 0.55, 0);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) this.dynO.box(t.x + dx, t.y + 0.5, t.z + dz, 0.025, 1.03, 0.025, 0, 0, [0.05, 0.05, 0.06], 1, 0.1);
  }

  updateHud(dt: number) {
    const p = this.p, h = this.hud; void dt;
    h.hp = p.health; h.hunger = p.hunger; h.air = p.air; h.fps = this.fps; h.pos = [p.x, p.y, p.z]; h.biome = BIOME_INFO[this.biome]?.name ?? Reg.biomes.find((b) => b.key === this.biome)?.name ?? this.biome;
    h.time = this.time; h.mode = this.mode; h.shield = p.shield; h.jet = p.jetFuel; h.yaw = p.yaw; h.dead = p.dead; h.mining = this.mining.p; h.weather = this.sim.weather.kind; h.claim = this.claims.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r);
    h.target = this.target ? Reg.blocks[this.target.id]?.name : null; h.sim = { machines: this.sim.machines.length };
    const hi = this.heldItem(); h.held = hi ? hi.name : ''; h.heldDur = this.held()?.dur; h.heldMax = hi?.spec?.tool?.dur ?? hi?.spec?.weapon?.dur;
    const cdEnd = hi && hi.spec?.gadget ? (this.cooldown.get(hi.key) ?? 0) : 0; h.cd = cdEnd > performance.now() / 1000 ? (cdEnd - performance.now() / 1000) / (hi!.spec!.gadget!.cd || 1) : 0;
    h.banner = this.sim.banner?.text; h.power = [...this.sim.nodes.values()].length;
    h.widgets = Reg.hudWidgets.map((w) => ({ pos: w.pos, text: w.text.replace('{x}', String(Math.floor(p.x))).replace('{y}', String(Math.floor(p.y))).replace('{z}', String(Math.floor(p.z))).replace('{time}', (this.time * 24).toFixed(1)).replace('{fps}', String(this.fps)).replace('{biome}', h.biome) }));
    this.mapT -= dt;
    if (this.mapT <= 0) { this.mapT = 0.5; this.drawMinimap(); }
  }
  drawMinimap() {
    if (typeof document === 'undefined') return;
    if (!this.minimap) { this.minimap = document.createElement('canvas'); this.minimap.width = this.minimap.height = 96; }
    const g = this.minimap.getContext('2d')!, img = g.createImageData(96, 96), p = this.p, w = this.world;
    const S = 1.2;
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
    for (let j = 0; j < 96; j++) for (let i = 0; i < 96; i++) {
      const dx = (i - 48) * S, dz = (j - 48) * S;
      const wx = Math.floor(p.x + dx * cy + dz * sy * -1 * -1 * 1), wz = Math.floor(p.z - dx * sy + dz * cy);
      const o = (j * 96 + i) * 4;
      if (Math.hypot(i - 48, j - 48) > 47) { img.data[o + 3] = 0; continue; }
      if (!w.isLoaded(wx, wz)) { img.data[o] = 12; img.data[o + 1] = 14; img.data[o + 2] = 20; img.data[o + 3] = 200; continue; }
      const ty = w.topY(wx, wz), id = w.getBlock(wx, ty - 1, wz), b = Reg.blocks[id];
      const c = b?.map ?? '#222222'; const sh = 0.7 + Math.min(0.5, Math.max(0, (ty - 40) / 60)) * 0.5;
      img.data[o] = parseInt(c.slice(1, 3), 16) * sh; img.data[o + 1] = parseInt(c.slice(3, 5), 16) * sh; img.data[o + 2] = parseInt(c.slice(5, 7), 16) * sh; img.data[o + 3] = 235;
    }
    g.putImageData(img, 0, 0);
    g.save(); g.translate(48, 48);
    const mark = (x: number, z: number, col: string, r = 2.5) => { const dx = x - p.x, dz = z - p.z; const lx = (dx * cy - dz * sy) / S, lz = (dx * sy + dz * cy) / S; const d = Math.hypot(lx, lz); const k = d > 44 ? 44 / d : 1; g.fillStyle = col; g.beginPath(); g.arc(lx * k, lz * k, r, 0, 6.28); g.fill(); };
    for (const c of this.claims) mark(c.x, c.z, '#ffd048', 3);
    for (const m of this.sim.machines) mark(m.x, m.z, '#ff4a40', 2);
    if (this.waypoint) mark(this.waypoint.x, this.waypoint.z, '#58d8ff', 3.5);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -5); g.lineTo(4, 4); g.lineTo(-4, 4); g.closePath(); g.fill();
    g.restore();
  }
  dispose() { this.stop(); this.renderer?.dispose(); }
}

function rleSafe(a: Uint16Array | Uint8Array): Uint16Array {
  const out: number[] = []; let v = a[0], n = 1;
  for (let i = 1; i < a.length; i++) { if (a[i] === v && n < 65535) n++; else { out.push(v, n); v = a[i]; n = 1; } }
  out.push(v, n); return Uint16Array.from(out);
}
export function runCommand(g: Game, line: string): string {
  const [cmd, ...a] = line.replace(/^\//, '').trim().split(/\s+/);
  const mod = modRuntime.commands.get(cmd);
  if (mod) { try { return String(mod.fn(a) ?? 'ok'); } catch (e: any) { return 'Error: ' + e.message; } }
  switch (cmd) {
    case 'help': return 'Commands: /gamemode <survival|creative|exploration|challenge> /time <0-1|day|night> /give <item> [n] /tp x y z /weather <clear|rain|storm> /spawn <scrapper|sentinel|warden> /fly /heal /seed /clear /mods' + (modRuntime.commands.size ? ' | mod: ' + [...modRuntime.commands.keys()].map((k) => '/' + k).join(' ') : '');
    case 'gamemode': { if (!['survival', 'creative', 'exploration', 'challenge'].includes(a[0])) return 'Usage: /gamemode survival|creative|exploration|challenge'; g.mode = a[0] as any; g.meta.mode = g.mode; g.p.flying = g.mode === 'creative'; return 'Game mode: ' + a[0]; }
    case 'time': g.time = a[0] === 'day' ? 0.35 : a[0] === 'night' ? 0.9 : parseFloat(a[0]) || 0.3; return 'Time set';
    case 'give': { const k = a[0]; if (!Reg.items.has(k)) return 'Unknown item ' + k; g.addItem(k, parseInt(a[1] ?? '1') || 1); return 'Given'; }
    case 'tp': g.p.x = parseFloat(a[0]); g.p.y = parseFloat(a[1]); g.p.z = parseFloat(a[2]); g.p.vy = 0; return 'Teleported';
    case 'weather': { const w = g.sim.weather; w.target = a[0] === 'clear' ? 0 : a[0] === 'storm' ? 1 : 0.7; w.storm = a[0] === 'storm' ? 1 : 0; w.timer = 300; w.kind = a[0]; return 'Weather: ' + a[0]; }
    case 'spawn': g.sim.spawnMachine((a[0] as any) ?? 'scrapper', g.p.x + 4, g.p.y + 1, g.p.z); return 'Spawned';
    case 'fly': g.p.flying = !g.p.flying; return g.p.flying ? 'Flying' : 'Walking';
    case 'heal': g.p.health = 20; g.p.hunger = 20; return 'Healed';
    case 'seed': return String(g.meta.seed);
    case 'clear': g.chat.length = 0; return '';
    case 'mods': return [...modRuntime.mods.keys()].join(', ') || 'No script mods loaded';
    default: return 'Unknown command. Try /help';
  }
}
void S_TOP;
