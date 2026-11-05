import { useEffect, useRef, useState, ReactNode } from 'react';
import { Reg, API_VERSION } from '../engine/registry';
import type { Game, Settings, Stack } from '../game/core';
import { DEFAULT_KEYS, DEFAULT_SETTINGS, runCommand } from '../game/core';
import { iconURL } from './icons';
import { audio } from '../audio/audio';
import { QUALITY } from '../render/types';
import { WorldMeta } from '../save/persist';
import { InstalledMod, ModReport, importFiles, loadInstalled, saveInstalled, validateManifest } from '../mods/loader';
import { EXAMPLE_MODS } from '../mods/examples';

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');
const panel = 'bg-slate-950/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/60';
export const btn = 'px-4 py-2 rounded-lg font-semibold tracking-wide bg-white/5 hover:bg-amber-400/20 hover:text-amber-200 border border-white/10 hover:border-amber-300/50 transition active:scale-95 text-slate-100';
export const btnP = 'px-5 py-2.5 rounded-lg font-bold tracking-widest uppercase bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 hover:from-amber-200 hover:to-amber-400 transition active:scale-95 shadow-lg shadow-amber-500/20';

export function Icon({ k, size = 40, className = '' }: { k: string; size?: number; className?: string }) {
  const src = iconURL(k);
  return <img src={src} width={size} height={size} draggable={false} className={cx('pixelated select-none', className)} style={{ imageRendering: 'pixelated', width: size, height: size }} alt="" />;
}

function useTick(ms: number) { const [, s] = useState(0); useEffect(() => { const i = setInterval(() => s((x) => x + 1), ms); return () => clearInterval(i); }, [ms]); }

// ====================================================================== HUD
export function Hud({ game }: { game: Game }) {
  useTick(90);
  const h = game.hud, st = game.settings, scale = st.uiScale;
  const hc = st.highContrast;
  const clock = (() => { const t = (game.time * 24 + 0) % 24; return `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`; })();
  const mapRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = mapRef.current; if (el && game.minimap && el.firstChild !== game.minimap) { el.replaceChildren(game.minimap); game.minimap.style.cssText = 'width:100%;height:100%;border-radius:9999px'; } });
  const yaw = game.p.yaw;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const heading = ((-yaw * 180) / Math.PI + 360 * 10) % 360;
  const objective = Reg.challenges.find((c) => !game.done.has(c.key));
  const showCross = game.locked && game.panel === 'none' && !game.p.dead && !game.third;
  return (
    <div className="absolute inset-0 pointer-events-none select-none text-slate-100" style={{ transform: `scale(${scale})`, transformOrigin: 'center bottom' }}>
      {game.p.under && <div className="absolute inset-0 bg-cyan-900/20" />}
      {game.sim.weather.flash > 0 && <div className="absolute inset-0 bg-white" style={{ opacity: game.sim.weather.flash * 0.35 }} />}
      {showCross && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><div className={cx('w-5 h-5 relative', hc && 'scale-125')}><i className="absolute left-1/2 top-0 w-0.5 h-1.5 -translate-x-1/2 bg-white/90" /><i className="absolute left-1/2 bottom-0 w-0.5 h-1.5 -translate-x-1/2 bg-white/90" /><i className="absolute top-1/2 left-0 h-0.5 w-1.5 -translate-y-1/2 bg-white/90" /><i className="absolute top-1/2 right-0 h-0.5 w-1.5 -translate-y-1/2 bg-white/90" /></div>{h.mining > 0.02 && <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-16 h-1.5 bg-black/50 rounded"><div className="h-full bg-amber-300 rounded" style={{ width: `${Math.min(100, h.mining * 100)}%` }} /></div>}{h.target && <div className="absolute top-8 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap bg-black/40 px-2 py-0.5 rounded">{h.target}</div>}</div>}
      {/* compass */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[420px] max-w-[60vw] h-8 overflow-hidden rounded-full bg-black/35 border border-white/10">
        {Array.from({ length: 24 }).map((_, i) => { const deg = i * 15; let d = ((deg - heading + 540) % 360) - 180; const label = deg % 45 === 0 ? dirs[deg / 45] : ''; return <div key={i} className="absolute top-0 h-full flex flex-col items-center justify-center text-[10px] text-slate-300" style={{ left: `${50 + d * 0.55}%`, opacity: Math.max(0, 1 - Math.abs(d) / 85) }}><span className={cx(label === 'N' && 'text-amber-300 font-bold')}>{label || '·'}</span></div>; })}
        {game.waypoint && (() => { const a = (Math.atan2(game.waypoint.x - game.p.x, -(game.waypoint.z - game.p.z)) * 180) / Math.PI; const d = ((a - heading + 540) % 360) - 180; return <div className="absolute top-0 h-full flex items-center text-cyan-300 text-xs" style={{ left: `${50 + Math.max(-45, Math.min(45, d * 0.55))}%` }}>◆</div>; })()}
        <div className="absolute left-1/2 top-0 h-1.5 w-0.5 bg-amber-300" />
      </div>
      {/* banner */}
      {h.banner && <div className="absolute top-14 left-1/2 -translate-x-1/2 px-6 py-2 bg-amber-500/20 border border-amber-300/50 text-amber-100 tracking-[0.2em] text-xs font-bold rounded animate-pulse">{h.banner}</div>}
      {/* minimap */}
      <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
        <div className="w-28 h-28 rounded-full border-2 border-white/20 bg-black/40 overflow-hidden shadow-lg" ref={mapRef} />
        <div className="text-xs bg-black/40 rounded px-2 py-0.5">{h.biome}</div>
        <div className="text-xs bg-black/40 rounded px-2 py-0.5 flex gap-2"><span>{clock}</span><span>{h.weather === 'storm' ? '⚡' : h.weather === 'rain' ? '🌧' : game.dayFactor > 0.3 ? '☀' : '☾'}</span>{h.claim && <span className="text-amber-300">◈ CLAIMED</span>}</div>
        {st.showFps && <div className="text-[10px] bg-black/40 rounded px-2 py-0.5 text-slate-300">{h.fps} FPS · {h.stats?.backend} · {h.stats?.chunks} ch</div>}
      </div>
      {/* widgets */}
      {(h.widgets ?? []).map((w: any, i: number) => <div key={i} className={cx('absolute text-xs bg-black/45 rounded px-2 py-1 font-mono', w.pos === 'bottom-left' ? 'left-3 bottom-24' : w.pos === 'top-left' ? 'left-3 top-3' : 'right-3 top-60')}>{w.text}</div>)}
      {/* objective */}
      {game.mode === 'challenge' && objective && <div className="absolute left-3 top-3 w-60 bg-black/45 border border-white/10 rounded-lg p-2 text-xs"><div className="text-amber-300 font-bold tracking-widest text-[10px]">OBJECTIVE</div><div className="font-semibold">{objective.name}</div><div className="text-slate-300">{objective.desc}</div><div className="mt-1 h-1.5 bg-white/10 rounded"><div className="h-full bg-amber-300 rounded" style={{ width: `${Math.min(100, ((game.stats[objective.stat] ?? 0) / objective.goal) * 100)}%` }} /></div></div>}
      {/* toasts */}
      <div className="absolute right-3 top-72 flex flex-col gap-1 items-end">
        {game.toasts.map((t) => <div key={t.id} className={cx('px-3 py-1.5 rounded-lg text-sm border backdrop-blur', t.kind === 'challenge' || t.kind === 'research' ? 'bg-amber-500/25 border-amber-300/50' : t.kind === 'discover' ? 'bg-cyan-500/25 border-cyan-300/50' : t.kind === 'warn' ? 'bg-rose-500/25 border-rose-300/50' : 'bg-black/55 border-white/10')} style={{ opacity: Math.min(1, t.t) }}>{t.text}</div>)}
      </div>
      <div className="absolute left-3 bottom-28 flex flex-col gap-1">{game.pickups.map((p, i) => <div key={i} className="flex items-center gap-2 bg-black/45 rounded px-2 py-0.5 text-sm" style={{ opacity: Math.min(1, p.t) }}><Icon k={p.key} size={20} /> +{p.n} {Reg.items.get(p.key)?.name}</div>)}</div>
      {/* scan pings */}
      {game.scanPings.map((q, i) => { const s = game.project(q.x, q.y, q.z); if (!s.visible || s.d < 0) return null; return <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center" style={{ left: `${s.x}%`, top: `${s.y}%`, opacity: Math.min(1, q.t / 3) }}><div className="w-2.5 h-2.5 rotate-45 border-2" style={{ borderColor: q.c, boxShadow: `0 0 8px ${q.c}` }} /><span className="text-[9px] mt-0.5" style={{ color: q.c }}>{q.n} · {Math.round(s.d)}m</span></div>; })}
      {/* bottom: status + hotbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
        {game.mode !== 'creative' && game.mode !== 'exploration' && <div className="flex gap-4 items-center">
          <Bar value={h.hp / 20} color="from-rose-500 to-rose-400" label="HP" w={190} />
          <Bar value={h.hunger / 20} color="from-amber-500 to-amber-300" label="FOOD" w={190} />
          {h.air < 14.5 && <Bar value={h.air / 15} color="from-cyan-500 to-cyan-300" label="O₂" w={100} />}
        </div>}
        {game.equip.pack && <Bar value={h.jet / 100} color="from-orange-500 to-yellow-300" label="THRUST" w={150} />}
        {h.shield > 0 && <div className="text-cyan-300 text-xs tracking-widest animate-pulse">◈ SHIELD {h.shield.toFixed(1)}s</div>}
        <div className="flex gap-1 p-1.5 rounded-xl bg-black/50 border border-white/10 backdrop-blur">
          {Array.from({ length: 9 }).map((_, i) => { const s = game.inv[i]; const it = s && Reg.items.get(s.key); const max = it?.spec?.tool?.dur ?? it?.spec?.weapon?.dur; return <div key={i} className={cx('relative w-12 h-12 rounded-lg border flex items-center justify-center', i === game.hot ? 'border-amber-300 bg-amber-300/20 scale-110 shadow-lg shadow-amber-400/20' : 'border-white/10 bg-white/5')}>{s && <Icon k={s.key} size={36} />}{s && s.n > 1 && <span className="absolute bottom-0 right-1 text-[11px] font-bold drop-shadow">{s.n}</span>}{s && max && s.dur !== undefined && s.dur < max && <div className="absolute bottom-0.5 left-1 right-1 h-0.5 bg-black/60"><div className="h-full bg-emerald-400" style={{ width: `${(s.dur / max) * 100}%` }} /></div>}<span className="absolute top-0 left-1 text-[9px] text-slate-400">{i + 1}</span></div>; })}
        </div>
        <div className="text-xs text-slate-300 h-4">{h.held}{h.cd > 0 && <span className="text-rose-300"> · recharging</span>}</div>
      </div>
      {game.panel === 'none' && !game.locked && !game.p.dead && <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none"><div className="px-5 py-3 rounded-xl bg-black/60 border border-white/10 text-sm tracking-widest">CLICK TO RESUME</div></div>}
      {game.p.hurtT > 0 && <div className="absolute inset-0 bg-rose-600/20" style={{ opacity: game.p.hurtT }} />}
    </div>
  );
}
function Bar({ value, color, label, w }: { value: number; color: string; label: string; w: number }) {
  return <div className="flex items-center gap-1.5"><span className="text-[10px] font-bold tracking-widest text-slate-300 w-9 text-right">{label}</span><div className="h-3 rounded-full bg-black/55 border border-white/10 overflow-hidden" style={{ width: w }}><div className={cx('h-full bg-gradient-to-r transition-all', color)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div></div>;
}

// ====================================================================== slots
function Slot({ s, sel, onClick, size = 48 }: { s: Stack | null; sel?: boolean; onClick?: () => void; size?: number }) {
  const it = s && Reg.items.get(s.key); const max = it?.spec?.tool?.dur ?? it?.spec?.weapon?.dur;
  return <div onClick={onClick} title={it ? `${it.name}${it.desc ? ' — ' + it.desc : ''}` : ''} className={cx('relative rounded-md border flex items-center justify-center cursor-pointer hover:border-amber-300/70 hover:bg-white/10', sel ? 'border-amber-300 bg-amber-300/20' : 'border-white/10 bg-black/30')} style={{ width: size, height: size }}>
    {s && <Icon k={s.key} size={size - 10} />}{s && s.n > 1 && <span className="absolute bottom-0 right-1 text-[11px] font-bold drop-shadow">{s.n}</span>}
    {s && max && s.dur !== undefined && s.dur < max && <div className="absolute bottom-0.5 left-1 right-1 h-0.5 bg-black/60"><div className="h-full bg-emerald-400" style={{ width: `${(s.dur / max) * 100}%` }} /></div>}
  </div>;
}

// ====================================================================== inventory / crafting / research
export function InventoryPanel({ game, close }: { game: Game; close: () => void }) {
  useTick(200);
  const [tab, setTab] = useState(game.tab);
  useEffect(() => { game.tab = tab; }, [tab, game]);
  const [sel, setSel] = useState<number | null>(null);
  const [q, setQ] = useState(''); const [cat, setCat] = useState('All');
  const tabs = ['inventory', 'crafting', 'research', 'challenges', ...(game.mode === 'creative' ? ['creative'] : []), 'atlas'];
  const click = (i: number) => {
    if (sel === null) { if (game.inv[i]) setSel(i); return; }
    const a = game.inv[sel], b = game.inv[i];
    if (sel !== i) { if (a && b && a.key === b.key && Reg.items.get(a.key)!.stack > 1) { const m = Math.min(Reg.items.get(a.key)!.stack - b.n, a.n); b.n += m; a.n -= m; if (a.n <= 0) game.inv[sel] = null; } else { game.inv[sel] = b; game.inv[i] = a; } }
    setSel(null); audio.sfx('ui');
  };
  const recipes = Reg.recipes.filter((r) => r.st !== 'none' && Reg.items.has(r.out) && (q === '' || Reg.items.get(r.out)!.name.toLowerCase().includes(q.toLowerCase())) && (cat === 'All' || r.st === cat));
  const craftable = recipes.filter((r) => game.canCraft(r)), locked = recipes.filter((r) => !game.canCraft(r));
  const sorted = [...craftable, ...locked].slice(0, 120);
  const equipSlot = (slot: 'pack' | 'armor' | 'visor', label: string) => { const s = game.equip[slot]; return <div className="flex flex-col items-center text-[10px] text-slate-400">{label}<Slot s={s} onClick={() => { if (s) { if (game.addItem(s.key, 1) === 0) game.equip[slot] = null; } }} /></div>; };
  return (
    <div className={cx(panel, 'w-[860px] max-w-[96vw] h-[600px] max-h-[92vh] p-4 flex flex-col pointer-events-auto')}>
      <div className="flex gap-1 mb-3 items-center">{tabs.map((t) => <button key={t} onClick={() => { setTab(t); audio.sfx('ui'); }} className={cx('px-3 py-1.5 rounded-lg text-sm font-bold uppercase tracking-widest', tab === t ? 'bg-amber-400 text-slate-950' : 'bg-white/5 hover:bg-white/10')}>{t}</button>)}<div className="flex-1" /><span className="text-xs text-slate-400 mr-2">Stations: {[...game.stations].join(', ')}</span><button onClick={close} className={btn}>✕</button></div>
      <div className="flex-1 overflow-auto">
        {tab === 'inventory' && <div className="flex gap-6"><div><div className="text-xs text-slate-400 mb-1 tracking-widest">BACKPACK</div><div className="grid grid-cols-9 gap-1">{game.inv.map((s, i) => <Slot key={i} s={s} sel={sel === i} onClick={() => click(i)} />)}</div><div className="text-[11px] text-slate-500 mt-2">Click a slot, then another to move/swap. Top row is your hotbar. Right-click a tool/gadget in-game to use equipment; equip packs, vests and visors by right-clicking them.</div></div>
          <div className="flex flex-col gap-3"><div className="text-xs text-slate-400 tracking-widest">EQUIPMENT</div><div className="flex gap-2">{equipSlot('pack', 'Pack')}{equipSlot('armor', 'Armor')}{equipSlot('visor', 'Visor')}</div>
            <div className="text-xs text-slate-400 tracking-widest mt-3">TECH TIER</div><div className="text-amber-300 font-bold text-2xl">{Math.max(0, ...Reg.research.filter((r) => game.tech.has(r.key)).map((r) => r.tier))} <span className="text-xs text-slate-400">/ 5</span></div></div></div>}
        {tab === 'crafting' && <div><div className="flex gap-2 mb-2"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes…" className="bg-black/40 border border-white/10 rounded px-3 py-1.5 text-sm flex-1" />{['All', 'hand', 'workbench', 'smelter', 'fabricator', 'lab', 'foundry'].map((c) => <button key={c} onClick={() => setCat(c)} className={cx('px-2 py-1 text-xs rounded', cat === c ? 'bg-amber-400 text-slate-950' : 'bg-white/5')}>{c}</button>)}</div>
          <div className="grid grid-cols-2 gap-2">{sorted.map((r, i) => { const can = game.canCraft(r); const lock = !game.unlocked(r); return <div key={i} className={cx('flex items-center gap-3 p-2 rounded-lg border', can ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/10 bg-black/20 opacity-70')}><Icon k={r.out} size={40} /><div className="flex-1 min-w-0"><div className="font-semibold text-sm truncate">{Reg.items.get(r.out)!.name} {r.n > 1 && <span className="text-slate-400">×{r.n}</span>}</div><div className="flex flex-wrap gap-1 mt-0.5">{Object.entries(r.in).map(([k, n]) => <span key={k} className={cx('text-[10px] px-1 rounded flex items-center gap-0.5', game.count(k) >= n ? 'bg-white/10' : 'bg-rose-500/20 text-rose-200')}><Icon k={k} size={12} />{game.count(k)}/{n}</span>)}</div><div className="text-[10px] text-slate-500">{r.st}{lock ? ` · needs research: ${Reg.research.find((x) => x.key === r.req)?.name ?? r.req}` : ''}</div></div><button disabled={!can} onClick={() => game.craft(r)} className={cx('px-3 py-1 rounded text-xs font-bold', can ? 'bg-emerald-400 text-slate-950' : 'bg-white/5 text-slate-500')}>CRAFT</button></div>; })}</div></div>}
        {tab === 'research' && <div><div className="text-xs text-slate-400 mb-2">Spend Data Chips and materials at a powered Research Station to unlock new technology.{!game.hasStation('lab') && <span className="text-rose-300"> No research station nearby.</span>}</div>
          {[1, 2, 3, 4, 5].map((t) => <div key={t} className="mb-3"><div className="text-amber-300 text-xs font-bold tracking-widest mb-1">TIER {t}</div><div className="grid grid-cols-2 gap-2">{Reg.research.filter((n) => n.tier === t).map((n) => { const has = game.tech.has(n.key), can = game.canResearch(n), pre = n.requires.every((r) => game.tech.has(r)); return <div key={n.key} className={cx('p-2 rounded-lg border', has ? 'border-amber-300/60 bg-amber-300/10' : pre ? 'border-white/15 bg-black/25' : 'border-white/5 bg-black/20 opacity-50')}><div className="flex justify-between"><span className="font-semibold text-sm">{n.name}</span><span className="text-[10px] text-slate-400">{n.branch}</span></div><div className="text-xs text-slate-300">{n.desc}</div><div className="flex flex-wrap gap-1 my-1">{Object.entries(n.cost).map(([k, c]) => <span key={k} className={cx('text-[10px] px-1 rounded flex items-center gap-0.5', game.count(k) >= c ? 'bg-white/10' : 'bg-rose-500/20')}><Icon k={k} size={12} />{game.count(k)}/{c}</span>)}</div>{n.requires.length > 0 && <div className="text-[10px] text-slate-500">requires: {n.requires.map((r) => Reg.research.find((x) => x.key === r)?.name ?? r).join(', ')}</div>}<button disabled={!can} onClick={() => game.research(n)} className={cx('mt-1 px-3 py-0.5 rounded text-xs font-bold', has ? 'bg-amber-300 text-slate-950' : can ? 'bg-cyan-300 text-slate-950' : 'bg-white/5 text-slate-500')}>{has ? 'RESEARCHED' : 'RESEARCH'}</button></div>; })}</div></div>)}</div>}
        {tab === 'challenges' && <div className="grid grid-cols-2 gap-2">{Reg.challenges.map((c) => { const v = Math.min(c.goal, game.stats[c.stat] ?? 0), d = game.done.has(c.key); return <div key={c.key} className={cx('p-3 rounded-lg border', d ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-black/25')}><div className="flex justify-between"><b className="text-sm">{c.name}</b><span className="text-xs">{d ? '✔' : `${Math.floor(v)}/${c.goal}`}</span></div><div className="text-xs text-slate-300">{c.desc}</div><div className="h-1.5 bg-white/10 rounded mt-1"><div className="h-full bg-amber-300 rounded" style={{ width: `${(v / c.goal) * 100}%` }} /></div>{c.reward && <div className="flex gap-1 mt-1 text-[10px] text-slate-400">Reward: {Object.entries(c.reward).map(([k, n]) => <span key={k} className="flex items-center gap-0.5"><Icon k={k} size={12} />×{n}</span>)}</div>}</div>; })}</div>}
        {tab === 'creative' && <div className="grid grid-cols-12 gap-1">{[...Reg.items.values()].map((it) => <Slot key={it.key} s={{ key: it.key, n: it.stack > 1 ? it.stack : 1, dur: it.spec?.tool?.dur ?? it.spec?.weapon?.dur ?? (it.type === 'gadget' ? 9999 : undefined) }} onClick={() => { game.inv[game.hot] = { key: it.key, n: it.stack > 1 ? it.stack : 1, dur: it.spec?.tool?.dur ?? it.spec?.weapon?.dur ?? (it.type === 'gadget' ? 9999 : undefined) }; audio.sfx('ui'); }} size={44} />)}</div>}
        {tab === 'atlas' && <div className="space-y-2 text-sm"><div className="grid grid-cols-4 gap-2">{[['Discoveries', game.stats.discoveries ?? 0], ['Blocks placed', game.stats.blocks_placed ?? 0], ['Blocks broken', game.stats.blocks_broken ?? 0], ['Machines disabled', game.stats.machines ?? 0], ['Land restored', game.stats.restored ?? 0], ['Beacons', game.claims.length], ['Distance', Math.floor(game.stats.distance ?? 0)], ['Peak power', Math.floor(game.stats.power_peak ?? 0)]].map(([a, b]) => <div key={a as string} className="bg-black/30 border border-white/10 rounded-lg p-2"><div className="text-[10px] text-slate-400 tracking-widest uppercase">{a}</div><div className="text-xl font-bold text-amber-300">{b}</div></div>)}</div><div className="text-slate-300">{Reg.blocks.length - 1} blocks · {Reg.items.size - Reg.blocks.length + 1} items · {Reg.recipes.length} recipes registered.</div><div className="text-slate-400 text-xs">World seed: {game.meta.seed}. Mode: {game.mode}. Place a <b>Frontline Beacon</b> to claim land and restore it over time. Use the Survey Scanner to find caches and landmarks.</div></div>}
      </div>
    </div>
  );
}

export function ContainerPanel({ game, close }: { game: Game; close: () => void }) {
  useTick(200);
  const t = game.tile(game.panelData.key); const slots: (Stack | null)[] = t.slots ?? (t.slots = Array(27).fill(null));
  const toInv = (i: number) => { const s = slots[i]; if (!s) return; const left = game.addItem(s.key, s.n); slots[i] = left ? { ...s, n: left } : null; audio.sfx('pickup'); };
  const toBox = (i: number) => { const s = game.inv[i]; if (!s) return; const left = game.addToSlots(slots, s.key, s.n); game.inv[i] = left ? { ...s, n: left } : null; audio.sfx('ui'); };
  return <div className={cx(panel, 'p-4 pointer-events-auto')}><div className="flex justify-between mb-2"><b className="tracking-widest uppercase text-amber-200">{game.panelData.name}</b><button className={btn} onClick={close}>✕</button></div>
    <div className="grid grid-cols-9 gap-1">{slots.map((s, i) => <Slot key={i} s={s} onClick={() => toInv(i)} />)}</div><div className="text-xs text-slate-400 my-2 tracking-widest">YOUR BACKPACK — click an item to move it</div>
    <div className="grid grid-cols-9 gap-1">{game.inv.map((s, i) => <Slot key={i} s={s} onClick={() => toBox(i)} />)}</div></div>;
}
export function TerminalPanel({ game, close }: { game: Game; close: () => void }) {
  return <div className={cx(panel, 'w-[560px] max-w-[92vw] p-6 pointer-events-auto font-mono')}><div className="text-emerald-300 text-xs tracking-[0.3em] mb-2">▌ {game.panelData.title?.toUpperCase()} — DECRYPTED</div><p className="text-emerald-100 leading-relaxed text-sm">{game.panelData.text}</p><div className="mt-4 flex justify-end"><button className={btn} onClick={close}>CLOSE</button></div></div>;
}
export function ConsolePanel({ game, close }: { game: Game; close: () => void }) {
  useTick(300); const [v, setV] = useState('');
  return <div className="absolute left-3 bottom-3 w-[520px] max-w-[94vw] pointer-events-auto"><div className={cx(panel, 'p-2 font-mono text-xs')}><div className="h-40 overflow-auto flex flex-col justify-end">{game.chat.slice(-12).map((l, i) => <div key={i} className="text-slate-200">{l}</div>)}</div>
    <form onSubmit={(e) => { e.preventDefault(); if (!v.trim()) return close(); game.chat.push('> ' + v); game.chat.push(runCommand(game, v)); setV(''); }}><input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close(); }} placeholder="/help" className="w-full mt-1 bg-black/50 border border-white/10 rounded px-2 py-1 text-slate-100 outline-none focus:border-amber-300/60" /></form></div></div>;
}
export function DeathScreen({ game }: { game: Game }) {
  return <div className="absolute inset-0 bg-rose-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 pointer-events-auto"><div className="text-5xl font-black tracking-[0.3em] text-rose-200">SIGNAL LOST</div><div className="text-slate-300">Your suit's emergency beacon is rebooting…</div><button className={btnP} onClick={() => { game.respawn(); }}>Re-deploy</button></div>;
}

// ====================================================================== settings
export function SettingsPanel({ s, onChange, close, applyQuality }: { s: Settings; onChange: (s: Settings) => void; close: () => void; applyQuality: (s: Settings) => void }) {
  const [tab, setTab] = useState('graphics'); const [bind, setBind] = useState<string | null>(null);
  const set = (p: Partial<Settings>, q = false) => { const n = { ...s, ...p }; onChange(n); if (q) applyQuality(n); };
  useEffect(() => { if (!bind) return; const f = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); if (e.code !== 'Escape') set({ keys: { ...s.keys, [bind]: e.code } }); setBind(null); }; window.addEventListener('keydown', f, true); return () => window.removeEventListener('keydown', f, true); });
  const row = (label: string, node: ReactNode) => <div className="flex items-center justify-between py-1.5 border-b border-white/5 text-sm"><span>{label}</span>{node}</div>;
  const slider = (v: number, min: number, max: number, step: number, on: (v: number) => void) => <div className="flex items-center gap-2"><input type="range" min={min} max={max} step={step} value={v} onChange={(e) => on(parseFloat(e.target.value))} className="w-44 accent-amber-400" /><span className="w-10 text-right text-xs text-slate-400">{Math.round(v * 100) / 100}</span></div>;
  const tgl = (v: boolean, on: (v: boolean) => void) => <button onClick={() => on(!v)} className={cx('w-12 h-6 rounded-full relative transition', v ? 'bg-amber-400' : 'bg-white/15')}><i className={cx('absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all', v ? 'left-6' : 'left-0.5')} /></button>;
  return <div className={cx(panel, 'w-[640px] max-w-[94vw] max-h-[90vh] overflow-auto p-5 pointer-events-auto')}><div className="flex items-center mb-3"><div className="font-black tracking-[0.25em] text-amber-200">SETTINGS</div><div className="flex-1" /><button onClick={close} className={btn}>Done</button></div>
    <div className="flex gap-1 mb-3">{['graphics', 'audio', 'controls', 'accessibility'].map((t) => <button key={t} onClick={() => setTab(t)} className={cx('px-3 py-1 text-xs uppercase tracking-widest rounded', tab === t ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-white/5')}>{t}</button>)}</div>
    {tab === 'graphics' && <div>{row('Preset', <div className="flex gap-1">{(['low', 'medium', 'high', 'ultra'] as const).map((q) => <button key={q} onClick={() => set({ quality: q, viewDist: QUALITY[q].viewDist, renderScale: QUALITY[q].scale }, true)} className={cx('px-3 py-1 rounded text-xs uppercase font-bold', s.quality === q ? 'bg-amber-400 text-slate-950' : 'bg-white/10')}>{q}</button>)}</div>)}
      {row('View distance (chunks)', slider(s.viewDist, 3, 14, 1, (v) => set({ viewDist: v }, true)))}{row('Field of view', slider(s.fov, 55, 110, 1, (v) => set({ fov: v })))}
      <div className="text-xs text-slate-400 mt-3 leading-relaxed">Low: no shadows, 70% resolution, short view distance. Medium/High: sun shadows + bloom. Ultra: two-cascade shadows and volumetric light shafts. Presets set the render resolution too.</div></div>}
    {tab === 'audio' && <div>{(['master', 'music', 'sfx', 'ambience'] as const).map((k) => row(k[0].toUpperCase() + k.slice(1), slider(s[k], 0, 1, 0.05, (v) => { set({ [k]: v } as any); audio.setVolumes({ ...s, [k]: v } as any); })))}</div>}
    {tab === 'controls' && <div>{row('Mouse sensitivity', slider(s.sens, 0.2, 3, 0.05, (v) => set({ sens: v })))}{row('Invert Y', tgl(s.invertY, (v) => set({ invertY: v })))}{row('Toggle sprint', tgl(s.sprintToggle, (v) => set({ sprintToggle: v })))}
      <div className="grid grid-cols-2 gap-x-6 mt-2">{Object.keys(DEFAULT_KEYS).map((a) => row(a, <button onClick={() => setBind(a)} className="px-2 py-0.5 rounded bg-white/10 text-xs min-w-24 text-center border border-white/10">{bind === a ? 'press a key…' : s.keys[a]}</button>))}</div><button className={cx(btn, 'mt-3 text-xs')} onClick={() => set({ keys: { ...DEFAULT_KEYS } })}>Reset keys</button>
      <div className="text-xs text-slate-500 mt-2">Mouse: left = mine/attack, right = place/use, middle = pick block. 1-9 / wheel = hotbar.</div></div>}
    {tab === 'accessibility' && <div>{row('Reduce motion (no bob / shake)', tgl(s.reduceMotion, (v) => set({ reduceMotion: v })))}{row('High-contrast HUD', tgl(s.highContrast, (v) => set({ highContrast: v })))}{row('Show FPS', tgl(s.showFps, (v) => set({ showFps: v })))}{row('UI scale', slider(s.uiScale, 0.8, 1.4, 0.05, (v) => set({ uiScale: v })))}</div>}
  </div>;
}

// ====================================================================== mod manager
const SDK_DOC = `FRONTLINE MOD SDK (API ${API_VERSION})
=============================
A mod = declarative JSON data + optional sandboxed Lua scripts. No core source changes.

Folder layout            Single file (.json/.frontmod)
  mymod/mod.json           { "manifest": {...}, "data": {...}, "scripts": {"main.lua": "..."} }
  mymod/data/blocks.json   (also items, recipes, research, challenges, structures,
  mymod/data/items.json     biomes, features, lore, sounds, hud)
  mymod/scripts/main.lua
  mymod/textures/foo.png   (32x32 PNG; use {"png":"textures/foo.png"} as a texture)

manifest: { "id":"my-mod", "name":"...", "version":"1.0.0", "apiVersion":"^1.0.0",
            "dependencies": { "frontline-core":">=1.0.0", "other-mod":"^1.2.0" } }

Texture spec: {"p":"noise","a":["#223344","#445566",0.5,4]}  (painters: noise, speckle, stone, concrete,
  bricks, tiles, panel, plate, grate, planks, glass, facade, curtain, asphalt, circuit, screen, hazard, vent,
  pipe, lamp, neon, crystal, ore, plant, door, sign, led, energy, server, solar, rust, carbon, honey ...)
Block: { key, name, cat, tex:{all|top|side|bottom|front}, shape:"cube|slab|stair|cross|panel|fence|wall|pole|door|custom",
  boxes:[{b:[x0,y0,z0,x1,y1,z1],t:"texName"}], hard, tier, snd, emit, glow, rough, metal, render, rot:"facing4",
  use:"door|toggle|crate|terminal|...", power:{use|gen|cable|store}, craft:{st,in:{item:n},n}, drop }
Recipe: { out, n, in:{...}, st:"hand|workbench|smelter|fabricator|lab|foundry", req:"researchKey" }
Structure: { key, biomes:[...], rarity, palette:{"#":"block"}, layers:[ [ "row", "row" ] , ... ] }  (y up, rows = z)
Biome: { key, name, temp:[a,b], moist:[a,b], surface, filler, rarity }   Feature: { block, replace, minY, maxY, size, perChunk }

Lua API (global 'frontline'): log(msg) notify(msg) on(event, fn) register_command(name, fn)
  get_block(x,y,z) set_block(x,y,z,key) give(key,n) player_pos() time() random() spawn_particles(x,y,z,kind,n) play(sfx)
  register_block/item/recipe/research/challenge/lore/feature{...} (load time)
Events: block_broken, block_placed, tick, player_hurt, player_died, machine_destroyed, crafted, research, discovered, event, challenge
Sandbox: base/string/table/math only, 400k-instruction budget per call. Reload the game to apply mod changes.`;

export function ModManager({ reports, close }: { reports: ModReport[]; close: () => void }) {
  const [mods, setMods] = useState<InstalledMod[]>(loadInstalled()); const [tab, setTab] = useState('installed'); const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement>(null), dir = useRef<HTMLInputElement>(null);
  const persist = (m: InstalledMod[]) => { setMods(m); saveInstalled(m); setMsg('Changes saved — reload to apply.'); };
  const install = (b: any) => { const e = validateManifest(b.manifest); if (e.length) return setMsg('Invalid mod: ' + e.join('; ')); persist([...mods.filter((m) => m.bundle.manifest.id !== b.manifest.id), { bundle: b, enabled: true }]); };
  const onFiles = async (fl: FileList | null) => { if (!fl || !fl.length) return; try { install(await importFiles([...fl])); } catch (e: any) { setMsg('Import failed: ' + e.message); } };
  const download = (b: any) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })); a.download = b.manifest.id + '.frontmod'; a.click(); };
  return <div className={cx(panel, 'w-[780px] max-w-[96vw] h-[600px] max-h-[92vh] p-4 flex flex-col pointer-events-auto')}>
    <div className="flex items-center gap-1 mb-3"><b className="tracking-[0.25em] text-amber-200 mr-3">MOD MANAGER</b>{['installed', 'examples', 'sdk'].map((t) => <button key={t} onClick={() => setTab(t)} className={cx('px-3 py-1 text-xs uppercase tracking-widest rounded', tab === t ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-white/5')}>{t}</button>)}<div className="flex-1" /><button className={btn} onClick={close}>✕</button></div>
    <div className="flex-1 overflow-auto text-sm">
      {tab === 'installed' && <div className="space-y-2"><div className="flex gap-2 flex-wrap"><button className={btnP} onClick={() => file.current?.click()}>Import .json / .zip</button><button className={btn} onClick={() => dir.current?.click()}>Import folder</button><input ref={file} type="file" accept=".json,.frontmod,.zip" className="hidden" onChange={(e) => onFiles(e.target.files)} /><input ref={dir} type="file" className="hidden" {...({ webkitdirectory: '' } as any)} multiple onChange={(e) => onFiles(e.target.files)} /><button className={btn} onClick={() => location.reload()}>Reload to apply</button></div>{msg && <div className="text-amber-300 text-xs">{msg}</div>}
        {mods.length === 0 && <div className="text-slate-400 p-6 text-center border border-dashed border-white/10 rounded-lg">No mods installed. Try the Examples tab, or import your own.</div>}
        {mods.map((m) => { const r = reports.find((x) => x.id === m.bundle.manifest.id); return <div key={m.bundle.manifest.id} className="p-3 rounded-lg border border-white/10 bg-black/25"><div className="flex items-center gap-2"><b>{m.bundle.manifest.name}</b><span className="text-xs text-slate-400">v{m.bundle.manifest.version} · {m.bundle.manifest.id}</span><span className={cx('text-[10px] px-1.5 rounded', r?.status === 'loaded' ? 'bg-emerald-500/30' : r?.status === 'error' ? 'bg-rose-500/30' : 'bg-white/10')}>{r?.status ?? 'pending reload'}</span><div className="flex-1" /><button className={btn + ' text-xs'} onClick={() => persist(mods.map((x) => (x === m ? { ...x, enabled: !x.enabled } : x)))}>{m.enabled ? 'Disable' : 'Enable'}</button><button className={btn + ' text-xs'} onClick={() => download(m.bundle)}>Export</button><button className={btn + ' text-xs'} onClick={() => persist(mods.filter((x) => x !== m))}>Remove</button></div><div className="text-xs text-slate-300">{m.bundle.manifest.description}</div>{r && <div className="text-[11px] text-slate-400 mt-1">{Object.entries(r.counts).map(([k, v]) => `${v} ${k}`).join(' · ')}</div>}{r?.errors.map((e, i) => <div key={i} className="text-[11px] text-rose-300 font-mono">⚠ {e}</div>)}{m.bundle.manifest.dependencies && <div className="text-[10px] text-slate-500">deps: {Object.entries(m.bundle.manifest.dependencies).map(([k, v]) => `${k} ${v}`).join(', ')}</div>}</div>; })}</div>}
      {tab === 'examples' && <div className="space-y-2">{EXAMPLE_MODS.map((b) => <div key={b.manifest.id} className="p-3 rounded-lg border border-white/10 bg-black/25 flex items-center gap-3"><div className="flex-1"><b>{b.manifest.name}</b> <span className="text-xs text-slate-400">v{b.manifest.version}</span><div className="text-xs text-slate-300">{b.manifest.description}</div></div><button className={btn + ' text-xs'} onClick={() => download(b)}>Download template</button><button className={btnP + ' !py-1.5 text-xs'} onClick={() => install(b)}>{mods.some((m) => m.bundle.manifest.id === b.manifest.id) ? 'Reinstall' : 'Install'}</button></div>)}<div className="text-xs text-slate-400">Install, then press “Reload to apply”. Every example is a complete, editable template — export it, change the JSON/Lua, and import it back.</div></div>}
      {tab === 'sdk' && <pre className="text-[11px] leading-relaxed text-emerald-100/90 whitespace-pre-wrap font-mono">{SDK_DOC}</pre>}
    </div></div>;
}

// ====================================================================== main menu
export function MainMenu({ worlds, onPlay, onNew, onDelete, onSettings, onMods, backend, modCount }: { worlds: WorldMeta[]; onPlay: (w: WorldMeta) => void; onNew: (name: string, seed: string, mode: WorldMeta['mode']) => void; onDelete: (id: string) => void; onSettings: () => void; onMods: () => void; backend: string; modCount: number }) {
  const [creating, setCreating] = useState(false); const [name, setName] = useState('Frontier'); const [seed, setSeed] = useState(''); const [mode, setMode] = useState<WorldMeta['mode']>('survival');
  const modes: [WorldMeta['mode'], string, string][] = [['survival', 'Survival', 'Gather, craft, build and push back the machines.'], ['creative', 'Creative', 'Unlimited blocks, flight, instant build.'], ['exploration', 'Exploration', 'No hunger or danger. Discover landmarks and secrets.'], ['challenge', 'Sandbox Challenges', 'Survival with objectives and frequent world events.']];
  return <div className="absolute inset-0 overflow-auto bg-slate-950 text-slate-100">
    <div className="absolute inset-0 opacity-70" style={{ background: 'radial-gradient(1200px 600px at 70% 10%, rgba(255,160,40,.25), transparent), radial-gradient(900px 600px at 10% 90%, rgba(40,200,255,.18), transparent), linear-gradient(180deg,#05070d,#0b1220 60%,#141018)' }} />
    <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '48px 48px', maskImage: 'linear-gradient(180deg,transparent,black 40%,black)' }} />
    <svg className="absolute bottom-0 left-0 w-full h-1/2 opacity-60" viewBox="0 0 1200 300" preserveAspectRatio="none"><g fill="#0a0f1a">{Array.from({ length: 34 }).map((_, i) => { const h = 60 + ((i * 53) % 170); return <rect key={i} x={i * 36} y={300 - h} width={26 + (i % 3) * 6} height={h} />; })}</g><g fill="#ffcf70" opacity=".8">{Array.from({ length: 90 }).map((_, i) => <rect key={i} x={((i * 97) % 1190)} y={120 + ((i * 41) % 170)} width="3" height="3" />)}</g></svg>
    <div className="relative z-10 max-w-5xl mx-auto px-6 py-10 flex flex-col min-h-full">
      <div className="mb-8"><div className="text-amber-300 tracking-[0.5em] text-xs font-bold">A VOXEL SANDBOX OF THE LAST FRONTIER</div><h1 className="text-6xl md:text-7xl font-black tracking-tight leading-none mt-2"><span className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">FRONTLINE</span> <span className="text-amber-400">ZERO HOUR</span></h1><p className="mt-4 text-slate-300 max-w-2xl">The cities went quiet at 06:00. The machines still walk the streets. Light a beacon, claim the ground beneath your feet, and push the frontline outward — block by block.</p></div>
      <div className="grid md:grid-cols-[1fr_320px] gap-6">
        <div className={cx(panel, 'p-5')}>{!creating ? <><div className="flex items-center justify-between mb-3"><b className="tracking-[0.25em] text-sm text-slate-300">WORLDS</b><button className={btnP} onClick={() => setCreating(true)}>+ New World</button></div>
          {worlds.length === 0 && <div className="text-slate-400 py-10 text-center border border-dashed border-white/10 rounded-xl">No saved worlds yet. Create one to begin your deployment.</div>}
          <div className="space-y-2 max-h-80 overflow-auto">{worlds.map((w) => <div key={w.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-amber-300/50 transition"><div className="flex-1"><div className="font-bold">{w.name}</div><div className="text-xs text-slate-400 capitalize">{w.mode} · seed {w.seed} · {new Date(w.played).toLocaleString()}</div></div><button className={btnP + ' !py-1.5'} onClick={() => onPlay(w)}>Play</button><button className={btn + ' !py-1.5 text-xs'} onClick={() => confirm('Delete this world?') && onDelete(w.id)}>Delete</button></div>)}</div></>
          : <div className="space-y-3"><b className="tracking-[0.25em] text-sm text-slate-300">NEW WORLD</b><div className="grid grid-cols-2 gap-2"><input className="bg-black/40 border border-white/10 rounded px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="World name" /><input className="bg-black/40 border border-white/10 rounded px-3 py-2" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Seed (random)" /></div>
            <div className="grid grid-cols-2 gap-2">{modes.map(([k, t, d]) => <button key={k} onClick={() => setMode(k)} className={cx('text-left p-3 rounded-xl border transition', mode === k ? 'border-amber-300 bg-amber-300/10' : 'border-white/10 bg-white/5 hover:bg-white/10')}><div className="font-bold">{t}</div><div className="text-xs text-slate-400">{d}</div></button>)}</div>
            <div className="flex gap-2"><button className={btnP} onClick={() => onNew(name || 'Frontier', seed, mode)}>Deploy</button><button className={btn} onClick={() => setCreating(false)}>Cancel</button></div></div>}</div>
        <div className="flex flex-col gap-3"><button className={cx(btn, 'text-left p-4')} onClick={onSettings}>⚙ Settings & Controls</button><button className={cx(btn, 'text-left p-4')} onClick={onMods}>🧩 Mod Manager <span className="text-xs text-slate-400">({modCount} active)</span></button>
          <div className={cx(panel, 'p-4 text-xs text-slate-300 space-y-1')}><div className="text-amber-300 font-bold tracking-widest">QUICK START</div><div>WASD move · Space jump · Shift sneak · Ctrl sprint</div><div>Left click mine · Right click place/use · E inventory</div><div>1-9 hotbar · F scan · V camera · T console</div><div className="pt-1 text-slate-400">Renderer: <b className="text-emerald-300">{backend}</b> — {Reg.blocks.length - 1} blocks, {Reg.recipes.length} recipes</div></div></div>
      </div></div></div>;
}
export { DEFAULT_SETTINGS };
