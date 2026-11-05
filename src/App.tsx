import { useCallback, useEffect, useRef, useState } from 'react';
import { registerBaseContent } from './content';
import { Reg, buildAtlas, Atlas } from './engine/registry';
import { loadMods, loadInstalled, ModReport } from './mods/loader';
import { setIconAtlas } from './ui/icons';
import { Game, Settings, DEFAULT_SETTINGS, DEFAULT_KEYS } from './game/core';
import { QUALITY, Renderer } from './render/types';
import { WebGPURenderer } from './render/webgpu';
import { WebGL2Renderer } from './render/webgl';
import { WorldMeta, listWorlds, saveWorldMeta, deleteWorld, loadAllRaw, makePalette } from './save/persist';
import { audio } from './audio/audio';
import { Hud, InventoryPanel, ContainerPanel, TerminalPanel, ConsolePanel, DeathScreen, SettingsPanel, ModManager, btnP, btn, cx } from './ui/ui';
import { MainMenu, HelpPanel } from './ui/menus';
import { strHash } from './engine/noise';

const loadSettings = (): Settings => { try { const s = JSON.parse(localStorage.getItem('fl_settings') ?? '{}'); return { ...DEFAULT_SETTINGS, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys ?? {}) } }; } catch { return { ...DEFAULT_SETTINGS }; } };

export default function App() {
  const [screen, setScreen] = useState<'boot' | 'menu' | 'loading' | 'game' | 'error'>('boot');
  const [msg, setMsg] = useState('Initialising content registry…');
  const [worlds, setWorlds] = useState<WorldMeta[]>([]);
  const [reports, setReports] = useState<ModReport[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [overlay, setOverlay] = useState<'none' | 'settings' | 'mods'>('none');
  const [, force] = useState(0);
  const atlas = useRef<Atlas | null>(null);
  const game = useRef<Game | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  const backend = useRef(typeof navigator !== 'undefined' && (navigator as any).gpu ? 'WebGPU' : 'WebGL2 fallback');

  // ---- boot
  useEffect(() => {
    (async () => {
      try {
        registerBaseContent();
        setMsg('Loading mods…');
        const r = await loadMods(loadInstalled());
        setReports(r);
        setMsg('Painting materials…');
        await new Promise((res) => setTimeout(res, 30));
        atlas.current = buildAtlas(); setIconAtlas(atlas.current);
        setWorlds(await listWorlds().catch(() => []));
        setScreen('menu');
      } catch (e: any) { setMsg('Startup failed: ' + (e?.message ?? e)); setScreen('error'); }
    })();
  }, []);
  useEffect(() => { localStorage.setItem('fl_settings', JSON.stringify(settings)); audio.setVolumes(settings); if (game.current) game.current.settings = settings; }, [settings]);
  useEffect(() => { if (screen !== 'game') return; const i = setInterval(() => force((x) => x + 1), 100); return () => clearInterval(i); }, [screen]);

  const applyQuality = useCallback((s: Settings) => {
    const g = game.current; if (!g || !g.renderer) return;
    g.q = { ...QUALITY[s.quality], viewDist: s.viewDist, scale: s.renderScale }; g.ring = []; g.renderer.setQuality(g.q);
    for (const c of g.world.chunks.values()) c.dirty = true;
  }, []);

  // ---- start world
  const startWorld = useCallback(async (meta: WorldMeta) => {
    try {
      audio.start();
      setScreen('loading'); setMsg('Creating renderer…');
      const s = settings; const q = { ...QUALITY[s.quality], viewDist: s.viewDist, scale: s.renderScale };
      let renderer: Renderer | null = null, canvas = document.createElement('canvas');
      const mount = () => { canvas.className = 'absolute inset-0 w-full h-full'; holder.current!.replaceChildren(canvas); };
      mount();
      if ((navigator as any).gpu) {
        const r = new WebGPURenderer();
        try { await r.init(canvas, atlas.current!, q); r.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight); await r.selfTest(); renderer = r; backend.current = 'WebGPU'; }
        catch (e) { console.warn('WebGPU unavailable or failed validation, falling back to WebGL2:', e); try { r.dispose(); } catch { /* ignore */ } canvas = document.createElement('canvas'); mount(); }
      }
      if (!renderer) { const r = new WebGL2Renderer(); await r.init(canvas, atlas.current!, q); renderer = r; backend.current = 'WebGL2 fallback'; }
      renderer.onLost = (why) => { game.current?.notify(why + ' — please reload.', 'warn'); };
      renderer.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
      setMsg('Generating the frontier…');
      const g = new Game(canvas, renderer, meta, s); g.q = q;
      const saved = await loadAllRaw(meta.id).catch(() => new Map());
      meta.palette = meta.palette ?? makePalette();
      await g.init(saved);
      game.current = g; g.start(); (window as any).__game = g;
      setScreen('game');
    } catch (e: any) { console.error(e); setMsg('Could not start the world: ' + (e?.message ?? e)); setScreen('error'); }
  }, [settings]);

  const newWorld = async (name: string, seed: string, mode: WorldMeta['mode']) => {
    const sd = seed.trim() ? (/^-?\d+$/.test(seed.trim()) ? parseInt(seed.trim(), 10) : strHash(seed.trim())) : Math.floor(Math.random() * 1e9);
    const meta: WorldMeta = { id: 'w' + Date.now().toString(36), name, seed: sd, mode, created: Date.now(), played: Date.now(), version: 1, palette: makePalette() };
    try { await saveWorldMeta(meta); } catch (e) { console.warn('Could not persist world metadata (private mode?)', e); }
    startWorld(meta);
  };
  const quit = async () => {
    const g = game.current; if (!g) return;
    setMsg('Saving…'); setScreen('loading');
    try { await g.save(); } catch (e) { console.warn(e); }
    g.dispose(); game.current = null; holder.current?.replaceChildren();
    if (document.pointerLockElement) document.exitPointerLock();
    setWorlds(await listWorlds().catch(() => [])); setScreen('menu');
  };

  // ---- input
  useEffect(() => {
    if (screen !== 'game') return;
    const g = game.current!, canvas = g.canvas!;
    const lock = () => { if (g.panel === 'none' && !g.p.dead) canvas.requestPointerLock?.(); };
    const closePanel = () => { g.panel = 'none'; g.panelData = null; g.paused = false; g.keys.clear(); lock(); force((x) => x + 1); };
    const openPanel = (p: Game['panel'], tab?: string) => { g.panel = p; if (tab) g.tab = tab; if (p === 'inventory') g.stats.inv_open = (g.stats.inv_open ?? 0) + 1; g.releaseLock(); g.mouse = [false, false, false]; force((x) => x + 1); };
    const kd = (e: KeyboardEvent) => {
      if (g.panel === 'console') return;
      const k = g.settings.keys;
      if (e.code === 'Escape') { if (g.panel !== 'none' && g.panel !== 'pause') { closePanel(); } else if (g.panel === 'pause') { closePanel(); } return; }
      if (e.code === 'F3') { e.preventDefault(); setSettings((s) => ({ ...s, showFps: !s.showFps })); return; }
      if (e.code === k.inventory && !g.p.dead) { e.preventDefault(); if (g.panel === 'inventory' || g.panel === 'container') closePanel(); else if (g.panel === 'none') openPanel('inventory', 'inventory'); return; }
      if ((e.code === k.help || e.code === 'F1') && !g.p.dead) { e.preventDefault(); if (g.panel === 'help') closePanel(); else if (g.panel === 'none') openPanel('help'); return; }
      if (e.code === k.console && g.panel === 'none' && !g.p.dead) { e.preventDefault(); openPanel('console'); return; }
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F5') e.preventDefault();
      if (g.panel === 'none' || g.panel === 'map') g.keyDown(e.code);
    };
    const ku = (e: KeyboardEvent) => g.keyUp(e.code);
    const md = (e: MouseEvent) => { const t = e.target as HTMLElement; if (t.closest('[data-ui]')) return; if (!g.locked) { if (g.panel === 'none' && !g.p.dead) lock(); return; } e.preventDefault(); g.mouseDown(e.button); };
    const mu = (e: MouseEvent) => g.mouseUp(e.button);
    const mm = (e: MouseEvent) => { if (g.locked) { g.lookDX += e.movementX; g.lookDY += e.movementY; } };
    const wh = (e: WheelEvent) => { if (g.locked) g.wheel(e.deltaY); };
    const pl = () => { g.locked = document.pointerLockElement === canvas; if (!g.locked && g.panel === 'none' && !g.p.dead) { g.panel = 'pause'; g.mouse = [false, false, false]; g.keys.clear(); } force((x) => x + 1); };
    const cm = (e: Event) => e.preventDefault();
    const rs = () => g.renderer?.resize(canvas.clientWidth, canvas.clientHeight);
    const bl = () => { g.keys.clear(); g.mouse = [false, false, false]; };
    const vis = () => { if (document.hidden) g.save().catch(() => {}); };
    const unload = () => { g.save().catch(() => {}); };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('mousedown', md); window.addEventListener('mouseup', mu); window.addEventListener('mousemove', mm); window.addEventListener('wheel', wh, { passive: true });
    document.addEventListener('pointerlockchange', pl); window.addEventListener('contextmenu', cm); window.addEventListener('resize', rs); window.addEventListener('blur', bl); document.addEventListener('visibilitychange', vis); window.addEventListener('beforeunload', unload);
    (g as any)._closePanel = closePanel;
    if (!localStorage.getItem('fl_seen_help')) { localStorage.setItem('fl_seen_help', '1'); setTimeout(() => openPanel('help'), 400); }
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('mousedown', md); window.removeEventListener('mouseup', mu); window.removeEventListener('mousemove', mm); window.removeEventListener('wheel', wh); document.removeEventListener('pointerlockchange', pl); window.removeEventListener('contextmenu', cm); window.removeEventListener('resize', rs); window.removeEventListener('blur', bl); document.removeEventListener('visibilitychange', vis); window.removeEventListener('beforeunload', unload); };
  }, [screen]);

  const g = game.current;
  if (g) g.paused = g.panel === 'pause' || g.panel === 'help';
  const closePanel = () => (g as any)?._closePanel?.();

  return (
    <div className="fixed inset-0 bg-black overflow-hidden font-sans text-slate-100" onContextMenu={(e) => e.preventDefault()}>
      <div ref={holder} className="absolute inset-0" />
      {screen === 'boot' && <Splash msg={msg} />}
      {screen === 'loading' && <Splash msg={msg} />}
      {screen === 'error' && <div className="absolute inset-0 flex items-center justify-center bg-slate-950"><div className="max-w-lg p-8 rounded-2xl border border-rose-400/40 bg-rose-950/30 text-center space-y-4"><div className="text-2xl font-black tracking-widest text-rose-200">SYSTEM FAULT</div><p className="text-slate-300 text-sm">{msg}</p><p className="text-xs text-slate-400">FRONTLINE needs WebGPU (preferred) or WebGL2. Try a current Chrome, Edge, Firefox or Safari with hardware acceleration enabled.</p><button className={btnP} onClick={() => { setScreen('menu'); }}>Back</button></div></div>}
      {screen === 'menu' && <MainMenu worlds={worlds} backend={backend.current} modCount={reports.filter((r) => r.status === 'loaded').length} onPlay={startWorld} onNew={newWorld} onDelete={async (id: string) => { await deleteWorld(id); setWorlds(await listWorlds()); }} onSettings={() => setOverlay('settings')} onMods={() => setOverlay('mods')} />}
      {screen === 'game' && g && <>
        <Hud game={g} />
        <div data-ui className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {(g.panel === 'inventory') && <div className="absolute inset-0 bg-black/45 pointer-events-auto" onClick={closePanel} />}
          {g.panel === 'inventory' && <InventoryPanel game={g} close={closePanel} />}
          {g.panel === 'container' && <><div className="absolute inset-0 bg-black/45 pointer-events-auto" onClick={closePanel} /><ContainerPanel game={g} close={closePanel} /></>}
          {g.panel === 'terminal' && <><div className="absolute inset-0 bg-black/55 pointer-events-auto" onClick={closePanel} /><TerminalPanel game={g} close={closePanel} /></>}
          {g.panel === 'help' && <><div className="absolute inset-0 bg-black/60 pointer-events-auto" onClick={closePanel} /><HelpPanel onClose={closePanel} keys={g.settings.keys} initial="basics" /></>}
          {g.panel === 'console' && <ConsolePanel game={g} close={closePanel} />}
          {g.p.dead && <DeathScreen game={g} />}
          {g.panel === 'pause' && overlay === 'none' && <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-auto"><div className="w-72 p-6 rounded-2xl bg-slate-950/90 border border-white/10 flex flex-col gap-2"><div className="text-center font-black tracking-[0.3em] text-amber-200 mb-2">PAUSED</div><button className={btnP} onClick={closePanel}>Resume</button><button className={btn} onClick={() => (g as any).panel = 'help'}>How to Play</button><button className={btn} onClick={() => setOverlay('settings')}>Settings</button><button className={btn} onClick={() => setOverlay('mods')}>Mod Manager</button><button className={btn} onClick={() => g.save().then(() => g.notify('World saved'))}>Save now</button><button className={btn} onClick={quit}>Save & Quit</button><div className="text-[10px] text-slate-500 text-center mt-1">{backend.current} · seed {g.meta.seed}</div></div></div>}
        </div>
      </>}
      {overlay !== 'none' && <div data-ui className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center pointer-events-auto" onMouseDown={(e) => e.stopPropagation()}>
        {overlay === 'settings' && <SettingsPanel s={settings} onChange={setSettings} applyQuality={applyQuality} close={() => setOverlay('none')} />}
        {overlay === 'mods' && <ModManager reports={reports} close={() => setOverlay('none')} />}
      </div>}
    </div>
  );
}

const TIPS = ['Hold the left mouse button to mine. Right-click to place.', 'Craft Timber Ladders by hand: 2 planks → 3 ladders.', 'Light your Frontline Beacon to keep machines away.', 'Press H any time for the full manual.', 'Click the side of a ladder to extend it upward.', 'Sentinels shoot from the air — break line of sight.', 'Watch the Warden\'s raised arm: that is its slam.', 'Shift on a ladder holds you in place.', 'Stand near a Workbench to craft advanced recipes.'];
function Splash({ msg }: { msg: string }) {
  const tip = useRef(TIPS[Math.floor(Math.random() * TIPS.length)]).current;
  return <div className="absolute inset-0 z-40 bg-slate-950 flex flex-col items-center justify-center gap-5">
    <div className="text-4xl font-black tracking-[0.3em]"><span className="text-white">FRONT</span><span className="text-amber-400">LINE</span></div>
    <div className="w-64 h-1 bg-white/10 rounded overflow-hidden"><div className="h-full w-1/3 bg-amber-400 rounded" style={{ animation: 'slide 1.1s infinite ease-in-out' }} /></div>
    <div className={cx('text-xs tracking-widest text-slate-400 uppercase')}>{msg}</div>
    <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    <div className="max-w-md text-center text-sm text-amber-200/80 px-6">💡 {tip}</div><div className="hidden">{Reg.blocks.length}</div>
  </div>;
}
