/** IndexedDB persistence: world metadata + RLE-compressed modified chunks. Palette-remapped so saves survive mod changes. */
import { Reg } from '../engine/registry';

export interface WorldMeta {
  id: string; name: string; seed: number; mode: 'survival' | 'creative' | 'exploration' | 'challenge';
  created: number; played: number; version: number;
  player?: any; time?: number; weather?: any; palette?: string[]; tiles?: any; claims?: any[]; stats?: any; mods?: string[];
}
const DB = 'frontline-zero-hour';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('worlds', { keyPath: 'id' }); r.result.createObjectStore('chunks'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async <T,>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode); const r = fn(t.objectStore(store));
    t.oncomplete = () => res(r ? (r as IDBRequest<T>).result : undefined); t.onerror = () => rej(t.error);
  });
};
export const listWorlds = async (): Promise<WorldMeta[]> => ((await tx<WorldMeta[]>('worlds', 'readonly', (s) => s.getAll())) ?? []).sort((a, b) => b.played - a.played);
export const saveWorldMeta = async (m: WorldMeta) => { await tx('worlds', 'readwrite', (s) => { s.put(m); }); };
export const loadWorldMeta = async (id: string) => tx<WorldMeta>('worlds', 'readonly', (s) => s.get(id));
export async function deleteWorld(id: string) {
  await tx('worlds', 'readwrite', (s) => { s.delete(id); });
  const d = await db();
  await new Promise<void>((res) => {
    const t = d.transaction('chunks', 'readwrite'); const s = t.objectStore('chunks');
    const r = s.openCursor(IDBKeyRange.bound(id + ':', id + ':\uffff'));
    r.onsuccess = () => { const c = r.result; if (c) { c.delete(); c.continue(); } };
    t.oncomplete = () => res();
  });
}
export const makePalette = () => Reg.blocks.map((b) => (b ? b.key : 'air'));

export function rle(a: Uint16Array | Uint8Array): Uint16Array {
  const out: number[] = [];
  let v = a[0], n = 1;
  for (let i = 1; i < a.length; i++) { if (a[i] === v && n < 65535) n++; else { out.push(v, n); v = a[i]; n = 1; } }
  out.push(v, n);
  return Uint16Array.from(out);
}
export function unrle(r: Uint16Array, len: number, Ctor: typeof Uint16Array | typeof Uint8Array): Uint16Array | Uint8Array {
  const out = new Ctor(len); let p = 0;
  for (let i = 0; i < r.length; i += 2) { out.fill(r[i], p, p + r[i + 1]); p += r[i + 1]; }
  return out;
}
export interface ChunkRec { blocks: Uint16Array; state: Uint16Array }
export const saveChunk = (worldId: string, cx: number, cz: number, blocks: Uint16Array, state: Uint8Array) =>
  tx('chunks', 'readwrite', (s) => { s.put({ b: rle(blocks), s: rle(state) }, `${worldId}:${cx},${cz}`); });
export async function loadChunk(worldId: string, cx: number, cz: number, remap: Uint16Array | null, len: number): Promise<{ blocks: Uint16Array; state: Uint8Array } | null> {
  const r = await tx<any>('chunks', 'readonly', (s) => s.get(`${worldId}:${cx},${cz}`));
  if (!r) return null;
  const blocks = unrle(r.b, len, Uint16Array) as Uint16Array;
  if (remap) for (let i = 0; i < blocks.length; i++) blocks[i] = remap[blocks[i]] ?? 0;
  return { blocks, state: unrle(r.s, len, Uint8Array) as Uint8Array };
}
export async function loadAllSavedChunkKeys(worldId: string): Promise<Set<string>> {
  const d = await db();
  return new Promise((res) => {
    const out = new Set<string>(); const t = d.transaction('chunks', 'readonly');
    const r = t.objectStore('chunks').openKeyCursor(IDBKeyRange.bound(worldId + ':', worldId + ':\uffff'));
    r.onsuccess = () => { const c = r.result; if (c) { out.add(String(c.key).slice(worldId.length + 1)); c.continue(); } };
    t.oncomplete = () => res(out);
  });
}
export function buildRemap(saved: string[] | undefined): Uint16Array | null {
  if (!saved) return null;
  const m = new Uint16Array(saved.length);
  let same = true;
  saved.forEach((k, i) => { const id = Reg.byKey.get(k)?.id ?? 0; m[i] = k === 'air' ? 0 : id; if (id !== i) same = false; });
  return same ? null : m;
}

export async function loadAllRaw(worldId: string): Promise<Map<string, any>> {
  const d = await db();
  return new Promise((res) => {
    const out = new Map<string, any>(); const t = d.transaction('chunks', 'readonly');
    const r = t.objectStore('chunks').openCursor(IDBKeyRange.bound(worldId + ':', worldId + ':\uffff'));
    r.onsuccess = () => { const c = r.result; if (c) { out.set(String(c.key).slice(worldId.length + 1), c.value); c.continue(); } };
    t.oncomplete = () => res(out); t.onerror = () => res(out);
  });
}
