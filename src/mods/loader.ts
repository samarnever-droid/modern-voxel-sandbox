/**
 * Mod loader. Mods are declarative data packs (JSON) + optional sandboxed Lua scripts.
 * Installable as: single .json/.frontmod bundle, a folder, or a .zip. No core source changes required.
 */
import { API_VERSION, Reg, defineBlock, defineItem, defineRecipe, defineResearch, defineChallenge, BlockSpec, ItemSpec } from '../engine/registry';
import type { TexSpec } from '../engine/textures';
import { LuaMod, LuaHost } from './lua';
import { unzipSync, strFromU8 } from 'fflate';

export interface Manifest { id: string; name: string; version: string; apiVersion: string; description?: string; author?: string; dependencies?: Record<string, string> }
export interface ModBundle {
  manifest: Manifest;
  data?: Partial<Record<'blocks' | 'items' | 'recipes' | 'research' | 'challenges' | 'structures' | 'biomes' | 'features' | 'lore', any[]>> & { sounds?: Record<string, any>; music?: any[]; hud?: any[] };
  scripts?: Record<string, string>;
  textures?: Record<string, string>;
}
export interface ModReport { id: string; name: string; version: string; status: 'loaded' | 'error' | 'disabled'; errors: string[]; counts: Record<string, number> }
export interface InstalledMod { bundle: ModBundle; enabled: boolean }

// ----------------------------------------------------------------- semver
export const parseVer = (v: string): [number, number, number] => { const p = v.replace(/^[^\d]*/, '').split('.').map((x) => parseInt(x, 10) || 0); return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0]; };
export const cmpVer = (a: string, b: string) => { const x = parseVer(a), y = parseVer(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
export function satisfies(version: string, range: string): boolean {
  range = (range ?? '*').trim();
  if (range === '*' || range === '') return true;
  const v = parseVer(version), r = parseVer(range);
  if (range.startsWith('^')) return v[0] === r[0] && cmpVer(version, range.slice(1)) >= 0 && (r[0] > 0 || true);
  if (range.startsWith('~')) return v[0] === r[0] && v[1] === r[1] && v[2] >= r[2];
  if (range.startsWith('>=')) return cmpVer(version, range.slice(2)) >= 0;
  if (range.startsWith('>')) return cmpVer(version, range.slice(1)) > 0;
  if (range.startsWith('<=')) return cmpVer(version, range.slice(2)) <= 0;
  if (range.startsWith('<')) return cmpVer(version, range.slice(1)) < 0;
  return cmpVer(version, range) === 0;
}

// ----------------------------------------------------------------- storage
const KEY = 'fl_mods_v1';
export const loadInstalled = (): InstalledMod[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
export const saveInstalled = (m: InstalledMod[]) => localStorage.setItem(KEY, JSON.stringify(m));

// ----------------------------------------------------------------- import helpers
export function validateManifest(m: any): string[] {
  const e: string[] = [];
  if (!m || typeof m !== 'object') return ['manifest missing'];
  if (typeof m.id !== 'string' || !/^[a-z][a-z0-9_-]{1,31}$/.test(m.id)) e.push('manifest.id must be lowercase letters/digits/_/- (2-32 chars)');
  if (typeof m.name !== 'string') e.push('manifest.name required');
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+/.test(m.version)) e.push('manifest.version must look like 1.0.0');
  if (typeof m.apiVersion !== 'string') e.push('manifest.apiVersion required (e.g. "^1.0.0")');
  return e;
}
export function bundleFromFiles(files: Record<string, string | Uint8Array>): ModBundle {
  const text = (v: string | Uint8Array) => (typeof v === 'string' ? v : strFromU8(v));
  const find = (suffix: string) => Object.keys(files).find((k) => k.replace(/\\/g, '/').endsWith(suffix));
  const mk = find('mod.json') ?? find('manifest.json');
  if (!mk) throw new Error('No mod.json found');
  const root = mk.replace(/mod\.json$|manifest\.json$/, '');
  const raw = JSON.parse(text(files[mk]));
  const bundle: ModBundle = { manifest: raw.manifest ?? raw, data: raw.data ?? {}, scripts: raw.scripts && !Array.isArray(raw.scripts) ? raw.scripts : {}, textures: raw.textures ?? {} };
  for (const [path, v] of Object.entries(files)) {
    const p = path.replace(/\\/g, '/'); if (!p.startsWith(root)) continue;
    const rel = p.slice(root.length);
    const m = rel.match(/^data\/(\w+)\.json$/);
    if (m) { const j = JSON.parse(text(v)); (bundle.data as any)[m[1]] = Array.isArray(j) ? [...((bundle.data as any)[m[1]] ?? []), ...j] : { ...((bundle.data as any)[m[1]] ?? {}), ...j }; }
    else if (rel.startsWith('scripts/') && rel.endsWith('.lua')) bundle.scripts![rel] = text(v);
    else if (rel.startsWith('textures/') && rel.endsWith('.png') && typeof v !== 'string') { let s = ''; for (let i = 0; i < v.length; i++) s += String.fromCharCode(v[i]); bundle.textures![rel] = 'data:image/png;base64,' + btoa(s); }
  }
  if (!bundle.manifest.id && raw.id) bundle.manifest = raw;
  return bundle;
}
export async function importFiles(list: File[]): Promise<ModBundle> {
  if (list.length === 1 && /\.zip$/i.test(list[0].name)) {
    const u = unzipSync(new Uint8Array(await list[0].arrayBuffer()));
    return bundleFromFiles(u);
  }
  if (list.length === 1 && /\.(json|frontmod)$/i.test(list[0].name)) {
    const j = JSON.parse(await list[0].text());
    if (j.manifest) return j as ModBundle;
    return bundleFromFiles({ 'mod.json': JSON.stringify(j) });
  }
  const files: Record<string, string | Uint8Array> = {};
  for (const f of list) { const p = (f as any).webkitRelativePath || f.name; files[p] = /\.png$/i.test(p) ? new Uint8Array(await f.arrayBuffer()) : await f.text(); }
  return bundleFromFiles(files);
}

// ----------------------------------------------------------------- registration
async function decodePng(url: string): Promise<Uint8ClampedArray | null> {
  if (typeof document === 'undefined') return null;
  const img = new Image(); img.src = url;
  await img.decode();
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0, 32, 32);
  return g.getImageData(0, 0, 32, 32).data;
}
const hostStub: LuaHost = {
  log: () => {}, notify: () => {}, getBlock: () => 'air', setBlock: () => false, give: () => false, playerPos: () => [0, 0, 0], time: () => 0,
  spawnParticles: () => {}, play: () => {}, registerCommand: () => {}, register: () => {},
};
export const modRuntime = { host: hostStub as LuaHost, mods: new Map<string, LuaMod>(), commands: new Map<string, { mod: string; fn: (a: string[]) => string | void }>(), logs: [] as string[] };

export function setModHost(h: Partial<LuaHost>) {
  Object.assign(modRuntime.host, h);
}
export function emitMod(event: string, payload: any) { for (const m of modRuntime.mods.values()) m.emit(event, payload); }

export async function loadMods(installed: InstalledMod[]): Promise<ModReport[]> {
  const reports: ModReport[] = [];
  const byId = new Map(installed.map((m) => [m.bundle.manifest?.id, m]));
  const order: InstalledMod[] = [], state = new Map<string, 'visiting' | 'done'>();
  const failed = new Set<string>();
  const rep = (b: ModBundle, status: ModReport['status'], errors: string[], counts: Record<string, number> = {}) => reports.push({ id: b.manifest?.id ?? '?', name: b.manifest?.name ?? '?', version: b.manifest?.version ?? '?', status, errors, counts });
  const visit = (m: InstalledMod, chain: string[]): boolean => {
    const id = m.bundle.manifest.id;
    if (state.get(id) === 'done') return !failed.has(id);
    if (state.get(id) === 'visiting') { failed.add(id); rep(m.bundle, 'error', ['Circular dependency: ' + [...chain, id].join(' -> ')]); return false; }
    state.set(id, 'visiting');
    let ok = true; const errs: string[] = [];
    for (const [dep, range] of Object.entries(m.bundle.manifest.dependencies ?? {})) {
      if (dep === 'frontline-core') { if (!satisfies(API_VERSION, range)) { ok = false; errs.push(`Needs frontline-core ${range} (have ${API_VERSION})`); } continue; }
      const d = byId.get(dep);
      if (!d || !d.enabled) { ok = false; errs.push(`Missing dependency "${dep}" ${range}`); continue; }
      if (!satisfies(d.bundle.manifest.version, range)) { ok = false; errs.push(`Dependency "${dep}" is ${d.bundle.manifest.version}, needs ${range}`); }
      if (!visit(d, [...chain, id])) { ok = false; errs.push(`Dependency "${dep}" failed to load`); }
    }
    if (!ok) { failed.add(id); rep(m.bundle, 'error', errs); }
    else order.push(m);
    state.set(id, 'done');
    return ok;
  };
  for (const m of installed) {
    const e = validateManifest(m.bundle.manifest);
    if (e.length) { rep(m.bundle, 'error', e); failed.add(m.bundle.manifest?.id); state.set(m.bundle.manifest?.id, 'done'); continue; }
    if (!m.enabled) { rep(m.bundle, 'disabled', []); state.set(m.bundle.manifest.id, 'done'); failed.add(m.bundle.manifest.id); continue; }
    if (!satisfies(API_VERSION, m.bundle.manifest.apiVersion)) { rep(m.bundle, 'error', [`Mod targets API ${m.bundle.manifest.apiVersion}; game provides ${API_VERSION}`]); failed.add(m.bundle.manifest.id); state.set(m.bundle.manifest.id, 'done'); continue; }
    visit(m, []);
  }
  for (const m of order) {
    const b = m.bundle, id = b.manifest.id, errors: string[] = [], counts: Record<string, number> = {};
    const ns = (k: string) => (k.includes(':') ? k : `${id}:${k}`);
    const resolveTex = async (t: any): Promise<TexSpec> => {
      if (t && typeof t.png === 'string') { const url = b.textures?.[t.png] ?? t.png; const px = await decodePng(url); if (px) return { p: 'raw', a: [px] }; return { p: '__missing', a: [] }; }
      if (t && typeof t.p === 'string') return t as TexSpec;
      throw new Error('texture must be {p,a} or {png}');
    };
    const guard = async (kind: string, spec: any, fn: () => void | Promise<void>) => {
      try { await fn(); counts[kind] = (counts[kind] ?? 0) + 1; } catch (e: any) { errors.push(`${kind} "${spec?.key ?? spec?.name ?? '?'}": ${e.message ?? e}`); }
    };
    const regBlock = async (s: any) => {
      if (!s.key || !s.name) throw new Error('key and name required');
      const tex: any = {};
      const tm = s.tex?.p ? { all: s.tex } : s.tex;
      if (!tm) throw new Error('tex required');
      for (const [k, v] of Object.entries(tm)) tex[k] = await resolveTex(v);
      const spec: BlockSpec = { ...s, key: ns(s.key), cat: s.cat ?? 'Mods', tex };
      if (spec.craft) spec.craft = { ...spec.craft, in: remapKeys(spec.craft.in) };
      defineBlock(spec, id);
    };
    const remapKeys = (o: Record<string, number>) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [Reg.items.has(k) ? k : ns(k), v]));
    const regItem = async (s: any) => {
      if (!s.key || !s.name || !s.icon) throw new Error('key, name and icon required');
      const spec: ItemSpec = { ...s, key: ns(s.key), icon: await resolveTex(s.icon), type: s.type ?? 'material' };
      if (spec.craft) spec.craft = { ...spec.craft, in: remapKeys(spec.craft.in) };
      defineItem(spec, id);
    };
    const regRecipe = (s: any) => { if (!s.out || !s.in) throw new Error('out and in required'); defineRecipe({ out: Reg.items.has(s.out) ? s.out : ns(s.out), n: s.n ?? 1, in: remapKeys(s.in), st: s.st ?? 'workbench', req: s.req }, id); };
    const d = b.data ?? {};
    for (const s of d.blocks ?? []) await guard('blocks', s, () => regBlock(s));
    for (const s of d.items ?? []) await guard('items', s, () => regItem(s));
    for (const s of d.recipes ?? []) await guard('recipes', s, () => regRecipe(s));
    for (const s of d.research ?? []) await guard('research', s, () => { defineResearch({ key: ns(s.key), name: s.name, desc: s.desc ?? '', cost: remapKeys(s.cost ?? {}), requires: s.requires ?? [], tier: s.tier ?? 1, branch: s.branch ?? id }); });
    for (const s of d.challenges ?? []) await guard('challenges', s, () => { defineChallenge({ key: ns(s.key), name: s.name, desc: s.desc ?? '', stat: s.stat, goal: s.goal, reward: s.reward ? remapKeys(s.reward) : undefined }); });
    for (const s of d.structures ?? []) await guard('structures', s, () => { if (!s.layers || !s.palette) throw new Error('palette and layers required'); Reg.structures.push({ key: ns(s.key), name: s.name ?? s.key, biomes: s.biomes ?? [], rarity: s.rarity ?? 0.1, palette: Object.fromEntries(Object.entries(s.palette).map(([k, v]) => [k, v === 'air' || Reg.byKey.has(v as string) ? (v as string) : ns(v as string)])), layers: s.layers, story: s.story, mod: id }); });
    for (const s of d.biomes ?? []) await guard('biomes', s, () => { Reg.biomes.push({ ...s, key: ns(s.key), surface: Reg.byKey.has(s.surface) ? s.surface : ns(s.surface), filler: Reg.byKey.has(s.filler) ? s.filler : ns(s.filler) }); });
    for (const s of d.features ?? []) await guard('features', s, () => { Reg.features.push({ ...s, key: ns(s.key), block: Reg.byKey.has(s.block) ? s.block : ns(s.block) }); });
    for (const s of d.lore ?? []) await guard('lore', s, () => { Reg.lore.push({ tag: s.tag ?? 'city', text: s.text }); });
    for (const [k, v] of Object.entries(d.sounds ?? {})) Reg.sounds.set(k.includes(':') ? k : `${id}:${k}`, v);
    for (const s of d.music ?? []) Reg.music.push(s);
    for (const s of d.hud ?? []) Reg.hudWidgets.push({ id: ns(s.id), text: s.text, pos: s.pos ?? 'top-right', mod: id });
    // scripts
    const scripts = Object.entries(b.scripts ?? {});
    if (scripts.length) {
      const host: LuaHost = {
        ...modRuntime.host,
        log: (mid, msg) => modRuntime.host.log(mid, msg),
        registerCommand: (n, mid, fn) => modRuntime.host.registerCommand(n, mid, fn),
        register: (kind, mid, spec) => {
          // scripts may register content during load only
          const sp = { ...spec };
          if (kind === 'block') { const tm: any = {}; const src = sp.tex?.p ? { all: sp.tex } : sp.tex; for (const [k, v] of Object.entries(src ?? {})) tm[k] = v; defineBlock({ ...sp, key: ns(sp.key), cat: sp.cat ?? 'Mods', tex: tm }, mid); }
          else if (kind === 'item') defineItem({ ...sp, key: ns(sp.key), type: sp.type ?? 'material' }, mid);
          else if (kind === 'recipe') regRecipe(sp);
          else if (kind === 'research') defineResearch({ key: ns(sp.key), name: sp.name, desc: sp.desc ?? '', cost: remapKeys(sp.cost ?? {}), requires: sp.requires ?? [], tier: sp.tier ?? 1 });
          else if (kind === 'challenge') defineChallenge({ key: ns(sp.key), name: sp.name, desc: sp.desc ?? '', stat: sp.stat, goal: sp.goal });
          else if (kind === 'lore') Reg.lore.push({ tag: sp.tag ?? 'city', text: sp.text });
          else if (kind === 'feature') Reg.features.push({ ...sp, key: ns(sp.key), block: ns(sp.block) });
          else throw new Error('unsupported registration kind ' + kind);
        },
      };
      // route host calls dynamically so runtime hooks installed later (setModHost) are honoured
      const proxy = new Proxy(host, { get: (t, k: string) => (k === 'register' ? t.register : (modRuntime.host as any)[k]) });
      try {
        const lm = new LuaMod(id, proxy as LuaHost);
        for (const [name, code] of scripts) { const err = lm.run(code, name); if (err) errors.push(err); else counts.scripts = (counts.scripts ?? 0) + 1; }
        modRuntime.mods.set(id, lm);
      } catch (e: any) { errors.push('Lua init failed: ' + (e.message ?? e)); }
    }
    rep(b, errors.length ? 'error' : 'loaded', errors, counts);
    if (errors.length) Reg.errors.push(...errors.map((x) => `[${id}] ${x}`));
  }
  return reports;
}
