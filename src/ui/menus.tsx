import { useEffect, useMemo, useState, ReactNode } from 'react';
import { Reg } from '../engine/registry';
import type { Game } from '../game/core';
import { DEFAULT_KEYS } from '../game/core';
import { guideState, guideSteps } from '../game/guide';
import type { WorldMeta } from '../save/persist';
import { audio } from '../audio/audio';
import { cx } from './ui';

// ------------------------------------------------------------------ pixel UI kit
export const mcBtn = 'relative block w-full text-center font-mono font-bold tracking-wide text-[15px] py-2.5 px-4 text-slate-100 select-none cursor-pointer ' +
  'bg-[#707070] hover:bg-[#6f7fd0] border-2 border-t-[#c8c8c8] border-l-[#c8c8c8] border-b-[#2a2a2a] border-r-[#2a2a2a] hover:border-t-[#e8ecff] hover:border-l-[#e8ecff] ' +
  'shadow-[0_3px_0_0_rgba(0,0,0,.55)] active:translate-y-[2px] active:shadow-none [text-shadow:2px_2px_0_rgba(0,0,0,.6)] hover:text-yellow-200 transition-colors';
export const mcBtnGreen = mcBtn.replace('bg-[#707070]', 'bg-[#4f8f2f]').replace('hover:bg-[#6f7fd0]', 'hover:bg-[#62b13a]').replace('border-t-[#c8c8c8] border-l-[#c8c8c8]', 'border-t-[#a6e07c] border-l-[#a6e07c]');
const kc = (code: string) => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', 'Space').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('Arrow', '↔');

export function KeyCap({ k, wide }: { k: string; wide?: boolean }) {
  return <span className={cx('inline-flex items-center justify-center h-7 min-w-7 px-1.5 mx-0.5 rounded-md text-[12px] font-bold font-mono text-slate-100 bg-gradient-to-b from-slate-500 to-slate-700 border border-slate-300/30 border-b-4 border-b-slate-900 shadow', wide && 'px-3')}>{k}</span>;
}

// ------------------------------------------------------------------ pixel sprites for the machine cards
const PAL: Record<string, string> = { R: '#c1602a', r: '#7d3a18', S: '#9aa2ac', s: '#6c747e', D: '#1c1e25', E: '#ff2a1a', Y: '#f2b80f', L: '#4a4e58', W: '#ffffff', C: '#46e4ff', B: '#4b5f80', b: '#34445e', g: '#cfd6de', O: '#ff8a2a' };
const SPRITES: Record<string, string[]> = {
  scrapper: [
    '..........Y.....', '..........L.....', '...gg.....L.....', '..gSSSSSSSS.....', '.gRRRRRRRRRRg...', '..RRDDDDDDRRR...', '..RRDEEWEDRRR...', '..rRDDDDDDRRr...', '.LL.rRRRRRr.LL..', 'L.L.L.L..L.L.L.L', 'L.L.L.L..L.L.L.L',
  ],
  sentinel: [
    'CC..........CC..', 'gg....SSSS....gg', '.s.sSSSSSSSs.s..', '..SSSSDDDDSSSS..', '..SSSDEEEEDSSS..', '..SYSDEWWEDSYS..', '..SSSDEEEEDSSS..', '..sSSSDDDDSSSs..', '...ssSSLLSSss...', '.....D.OO.D.....', '......CCCC......',
  ],
  warden: [
    '.....gSSSSg.....', '.....SDDDDS.....', '.....SEEEES.....', '..YYBBBSSBBBYY..', '.BBBBBBBBBBBBBB.', '.BbBBBCCCCBBBbB.', '.BbBBBCWWCBBBbB.', '.BbBBBBBBBBBBbB.', '..bb.BBBBBB.bb..', '..DD.sssssss.DD.', '.....BB..BB.....', '.....bb..bb.....', '.....bb..bb.....', '....DDDD.DDDD...',
  ],
};
export function Sprite({ id, size = 6 }: { id: string; size?: number }) {
  const g = SPRITES[id];
  return <svg width={16 * size} height={g.length * size} viewBox={`0 0 16 ${g.length}`} shapeRendering="crispEdges">{g.flatMap((row, y) => row.split('').map((c, x) => (PAL[c] ? <rect key={x + ',' + y} x={x} y={y} width="1.02" height="1.02" fill={PAL[c]} /> : null)))}</svg>;
}

// ------------------------------------------------------------------ HELP / HOW TO PLAY
const Sec = ({ t, children }: { t: string; children: ReactNode }) => <section className="mb-5"><h3 className="text-amber-300 font-black tracking-[0.2em] text-xs mb-2">{t}</h3>{children}</section>;
const Row = ({ keys, text }: { keys: string[]; text: string }) => <div className="flex items-center justify-between gap-3 py-1 border-b border-white/5 text-sm"><span className="text-slate-300">{text}</span><span className="flex shrink-0">{keys.map((k) => <KeyCap key={k} k={k} wide={k.length > 2} />)}</span></div>;

export function HelpPanel({ onClose, keys = DEFAULT_KEYS, initial = 'basics' }: { onClose: () => void; keys?: Record<string, string>; initial?: string }) {
  const [tab, setTab] = useState(initial);
  const K = (a: string) => kc(keys[a] ?? DEFAULT_KEYS[a]);
  const tabs: [string, string][] = [['basics', '🎮 Controls'], ['survival', '🗺 How to Play'], ['machines', '🤖 Machines'], ['world', '🌍 World & Tips'], ['modes', '🎲 Game Modes']];
  return (
    <div data-ui className="w-[900px] max-w-[96vw] h-[640px] max-h-[92vh] flex flex-col rounded-2xl bg-slate-950/95 border border-white/10 shadow-2xl shadow-black/70 pointer-events-auto overflow-hidden">
      <div className="flex items-center gap-1 p-3 border-b border-white/10 bg-gradient-to-r from-amber-500/10 to-transparent">
        <b className="tracking-[0.3em] text-amber-200 mr-3 text-sm">HOW TO PLAY</b>
        {tabs.map(([k, l]) => <button key={k} onClick={() => { setTab(k); audio.sfx('ui'); }} className={cx('px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide', tab === k ? 'bg-amber-400 text-slate-950' : 'bg-white/5 hover:bg-white/10 text-slate-200')}>{l}</button>)}
        <div className="flex-1" />
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-rose-500/40 text-sm font-bold">✕ Close</button>
      </div>
      <div className="flex-1 overflow-auto p-5 text-slate-200 text-sm leading-relaxed">
        {tab === 'basics' && <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <Sec t="MOVEMENT"><Row keys={[K('forward'), K('left'), K('back'), K('right')]} text="Walk" /><Row keys={[K('jump')]} text="Jump (double-tap to fly in Creative)" /><Row keys={[K('sprint')]} text="Sprint (hold while moving forward)" /><Row keys={[K('sneak')]} text="Sneak — slower, never falls off edges" /><Row keys={[K('perspective')]} text="Switch first / third person" /></Sec>
            <Sec t="MOUSE"><Row keys={['LMB']} text="Hold to mine · click to attack" /><Row keys={['RMB']} text="Place block · use item · open stations & crates" /><Row keys={['MMB']} text="Pick block (Creative)" /><Row keys={['1-9', 'Wheel']} text="Choose hotbar slot" /></Sec>
          </div>
          <div>
            <Sec t="INTERFACE"><Row keys={[K('inventory')]} text="Inventory · crafting · research · challenges" /><Row keys={[K('drop')]} text="Drop the held item" /><Row keys={[K('gadget')]} text="Use Survey Scanner" /><Row keys={[K('map')]} text="Map" /><Row keys={[K('help')]} text="This help screen" /><Row keys={[K('guide')]} text="Show / hide the guide tracker" /><Row keys={[K('console')]} text="Console (/help for commands)" /><Row keys={['F3']} text="Toggle FPS" /></Sec>
            <Sec t="🪜 LADDERS & CLIMBING">
              <ol className="list-decimal ml-5 space-y-1 text-[13px]">
                <li>Craft <b className="text-amber-200">Timber Ladders</b> by hand (2 planks → 3 ladders).</li>
                <li>Right-click the <b>side of a wall</b>. The ladder sticks to that wall.</li>
                <li>Right-click the ladder again to <b>extend it</b> up (upper half) or down (lower half).</li>
                <li>Walk into it: <KeyCap k={K('forward')} /> / <KeyCap k={K('jump')} /> climb, <KeyCap k={K('back')} /> descends, <KeyCap k={K('sneak')} wide /> holds on.</li>
                <li>Hold forward at the top to hop over the edge. Ladders drop off if their wall is mined away.</li>
              </ol>
            </Sec>
          </div>
        </div>}
        {tab === 'survival' && <div>
          <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 mb-4 text-[13px]"><b className="text-amber-200">Your goal:</b> the cities went quiet and the machines never stopped patrolling. Gather resources, claim land with a <b>Frontline Beacon</b>, build tech up tier by tier, and push the frontline outward. The tracker in the top-left corner always shows your next step.</div>
          <div className="grid md:grid-cols-2 gap-2">{guideSteps('survival').map((s, i) => <div key={s.key} className="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/10"><div className="w-9 h-9 shrink-0 rounded-lg bg-amber-400/15 flex items-center justify-center text-xl">{s.icon}</div><div><div className="font-bold text-slate-100"><span className="text-amber-300 mr-1">{i + 1}.</span>{s.title}</div><div className="text-[12px] text-slate-300">{s.desc}</div></div></div>)}</div>
          <Sec t="TECH LADDER"><div className="flex flex-wrap items-center gap-1 text-xs font-bold mt-2">{['Hand', 'Workbench', 'Arc Smelter', 'Fabricator', 'Research Station', 'Foundry'].map((t, i, a) => <span key={t} className="flex items-center gap-1"><span className="px-2 py-1 rounded bg-cyan-400/15 border border-cyan-300/30">{t}</span>{i < a.length - 1 && <span className="text-slate-500">→</span>}</span>)}</div><p className="text-[12px] text-slate-400 mt-2">Stand within 5 blocks of a station to use its recipes. Machines that need power (Fabricator, Research Station) must be wired to a Solar Panel, Combustion Generator or other source with cables.</p></Sec>
        </div>}
        {tab === 'machines' && <div className="space-y-3">
          <p className="text-slate-300">The <b>Custodians</b> are the city's old maintenance machines. They never enter a beacon zone and they hunt harder at night and in cities. Their health bar appears when they are hurt.</p>
          {[
            ['scrapper', 'SCRAPPER', '14 HP · melee · fast', 'A six-legged salvage crawler. Bites when it gets close. Circle-strafe it and strike while its mandibles are open.'],
            ['sentinel', 'SENTINEL', '9 HP · ranged · flying', 'A quad-rotor drone that hovers overhead and fires red bolts every couple of seconds. Break line of sight behind walls, then close in.'],
            ['warden', 'WARDEN', '70 HP · heavy melee · rare', 'A bipedal enforcer guarding cities and bunkers. Slow but devastating — watch the raised right arm: that is the slam. Back off, then hit it from the side.'],
          ].map(([id, n, st, d]) => <div key={id} className="flex gap-4 items-center p-3 rounded-xl bg-white/5 border border-white/10"><div className="w-28 flex justify-center"><Sprite id={id} size={id === 'warden' ? 6 : 6} /></div><div><div className="font-black tracking-widest text-rose-300">{n} <span className="text-[11px] text-slate-400 font-semibold tracking-normal ml-2">{st}</span></div><div className="text-[13px] text-slate-300">{d}</div></div></div>)}
          <p className="text-[12px] text-slate-400">Drops: scrap metal, copper wire, energy cells, data chips (needed for research) and servos from Wardens. Better weapons: Pulse Emitter, Scatter Arc, Rail weapons — loot military crates.</p>
        </div>}
        {tab === 'world' && <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <Sec t="THE WORLD"><ul className="list-disc ml-5 space-y-1 text-[13px]"><li>Ten environments: metropolis, suburbs, industrial, forest, plains, desert, snow, mountains, anomaly zones and underground labs & subways.</li><li>Landmarks (skyscrapers, silos, hangars, radar domes…) hold loot crates. Right-click them.</li><li>The day lasts 20 minutes. Night is dark and dangerous — build lamps.</li><li>Weather rolls in: rain, storms, snow. Thunder means lightning flashes.</li></ul></Sec>
            <Sec t="FRONTLINE BEACONS"><p className="text-[13px]">A beacon claims land in a 32-block radius: machines won't attack inside, dead land is restored, and you respawn there. Place several to build a safe road across the map.</p></Sec>
          </div>
          <div>
            <Sec t="SURVIVAL BASICS"><ul className="list-disc ml-5 space-y-1 text-[13px]"><li>HP and FOOD bars sit above the hotbar. Eat when hungry; sprinting burns food.</li><li>Falling more than 3 blocks hurts — ladders and water save you.</li><li>Tools and weapons wear out; the bar under the item shows durability. Repair at stations.</li><li>Press <KeyCap k="M" /> for the map and set waypoints from lore terminals.</li></ul></Sec>
            <Sec t="HANDY COMMANDS (T)"><div className="font-mono text-[12px] bg-black/40 rounded-lg p-3 text-emerald-200 space-y-0.5"><div>/gamemode creative</div><div>/give timber_ladder 16</div><div>/time day · /time night</div><div>/spawn warden · /heal · /tp x y z</div></div></Sec>
          </div>
        </div>}
        {tab === 'modes' && <div className="grid md:grid-cols-2 gap-3">{MODES.map(([k, t, d, e]) => <div key={k} className="p-4 rounded-xl bg-white/5 border border-white/10"><div className="text-2xl mb-1">{e}</div><div className="font-black tracking-widest text-amber-200">{t}</div><div className="text-[13px] text-slate-300 mt-1">{d}</div></div>)}</div>}
      </div>
    </div>
  );
}
export const MODES: [WorldMeta['mode'], string, string, string][] = [
  ['survival', 'SURVIVAL', 'Hunger, health and hostile machines. Gather, craft, claim land and push the frontline. The classic experience — and the one with the full guided tutorial.', '⚔'],
  ['creative', 'CREATIVE', 'Unlimited blocks, instant mining and free flight. Build anything. Machines stay passive.', '🏗'],
  ['exploration', 'EXPLORATION', 'No hunger, no danger. Discover landmarks, read lore terminals and collect data chips. Great for sightseeing.', '🧭'],
  ['challenge', 'CHALLENGES', 'Survival with a goal list: 14 sandbox challenges with rewards, plus frequent world events.', '🏆'],
];

// ------------------------------------------------------------------ HUD guide tracker
export function GuideCard({ game }: { game: Game }) {
  const gs = guideState(game);
  if (!game.guideOn) return <div className="absolute left-3 top-3 text-[10px] bg-black/40 rounded px-2 py-0.5 text-slate-400">Guide hidden — press {kc(game.settings.keys.guide ?? 'KeyG')}</div>;
  const done = gs.idx < 0 ? gs.total : gs.idx;
  const step = gs.step;
  const prog = step?.prog?.(game);
  return (
    <div className={cx('absolute left-3 top-3 w-72 rounded-xl border backdrop-blur-md p-3 text-xs shadow-xl shadow-black/40 transition', game.guideFlash > 0 ? 'bg-emerald-500/25 border-emerald-300/70' : 'bg-slate-950/65 border-white/10')}>
      <div className="flex items-center justify-between mb-1.5"><span className="text-[10px] font-black tracking-[0.25em] text-amber-300">GUIDE</span><span className="text-[10px] text-slate-400">{done}/{gs.total}</span></div>
      <div className="flex gap-0.5 mb-2">{gs.steps.map((s, i) => <i key={s.key} className={cx('h-1 flex-1 rounded-full', i < done ? 'bg-emerald-400' : i === gs.idx ? 'bg-amber-300 animate-pulse' : 'bg-white/10')} />)}</div>
      {step ? <>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100"><span className="text-lg">{step.icon}</span>{step.title}</div>
        <div className="mt-1 text-slate-300 leading-snug">{step.desc}</div>
        {prog && <div className="mt-2 flex items-center gap-2"><div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-amber-300 rounded-full transition-all" style={{ width: `${(prog[0] / prog[1]) * 100}%` }} /></div><span className="text-[10px] text-slate-300 tabular-nums">{prog[0]}/{prog[1]}</span></div>}
        <div className="mt-2 text-[10px] text-slate-400 leading-snug">💡 {step.tip}</div>
      </> : <div className="text-emerald-300 font-bold">✔ Guide complete! Open the inventory (E) → Challenges for bigger goals.</div>}
      <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{kc(game.settings.keys.guide ?? 'KeyG')} hide</span><span>{kc(game.settings.keys.help ?? 'KeyH')} full help</span></div>
    </div>
  );
}

// ------------------------------------------------------------------ MAIN MENU (Minecraft-style)
const SPLASHES = ['Climb every ladder!', 'Beacons keep the dark away!', 'Now with better robots!', 'Hold left click!', 'Mind the Warden!', 'Also try Creative!', 'Press H for help!', 'Zero hour is every hour!', 'Rungs, rails, rope!', 'Ladders are not a bug!', 'Light the frontier!', 'Made of voxels!', 'Right click the wall!', 'Sentinels are watching!', 'Build it up!', '100% machine-free* (*not really)'];

function Landscape() {
  const hills = useMemo(() => {
    const layers: { y: number; col: string; cols: { h: number }[] }[] = [];
    const rnd = (i: number, s: number) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
    const cfg = [{ y: 170, col: '#6a8fbf', amp: 5, s: 1 }, { y: 195, col: '#4f7f9f', amp: 6, s: 2 }, { y: 225, col: '#3e8a4a', amp: 5, s: 3 }, { y: 255, col: '#2f6f38', amp: 4, s: 4 }];
    for (const c of cfg) {
      const cols: { h: number }[] = []; let h = 6;
      for (let i = 0; i < 64; i++) { if (rnd(i, c.s) > 0.62) h += rnd(i, c.s + 9) > 0.5 ? 1 : -1; h = Math.max(1, Math.min(c.amp * 2, h)); cols.push({ h }); }
      layers.push({ y: c.y, col: c.col, cols });
    }
    return layers;
  }, []);
  const stars = useMemo(() => Array.from({ length: 40 }, (_, i) => ({ x: (i * 97) % 100, y: (i * 41) % 45, d: (i % 5) * 0.6 })), []);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'linear-gradient(180deg,#0b1030 0%,#2a3a7a 26%,#e0875a 62%,#f6c372 80%,#2f6f38 80%)', animation: 'skyshift 40s ease-in-out infinite alternate' }}>
      {stars.map((s, i) => <i key={i} className="absolute w-[3px] h-[3px] bg-white" style={{ left: `${s.x}%`, top: `${s.y}%`, opacity: 0.8, animation: `twinkle 3s ${s.d}s infinite` }} />)}
      <div className="absolute w-24 h-24 right-[18%] top-[22%]" style={{ background: '#ffe9a0', boxShadow: '0 0 80px 30px rgba(255,200,100,.55), inset -8px -8px 0 rgba(240,170,60,.55)' }} />
      {[0, 1, 2, 3].map((i) => <div key={i} className="absolute" style={{ top: `${8 + i * 9}%`, left: '-20%', animation: `cloud ${70 + i * 25}s linear ${-i * 22}s infinite` }}><div className="flex items-end opacity-80">{[40, 70, 100, 70, 44].map((w, k) => <i key={k} className="block bg-white/90" style={{ width: w, height: 14 + (k % 3 === 1 ? 14 : 0) }} />)}</div></div>)}
      <svg className="absolute bottom-0 left-0 w-full h-[62%]" viewBox="0 0 1280 300" preserveAspectRatio="none" shapeRendering="crispEdges">
        {hills.map((L, li) => <g key={li}>{L.cols.map((c, i) => <rect key={i} x={i * 20} y={L.y - c.h * 10 - 90 + li * 0} width="21" height="400" fill={L.col} opacity={0.55 + li * 0.15} />)}</g>)}
        {/* blocky trees */}
        {[80, 260, 460, 700, 980, 1180].map((x, i) => <g key={i} transform={`translate(${x} ${250 - (i % 2) * 6})`}><rect x="8" y="0" width="8" height="26" fill="#5a3b1c" /><rect x="-8" y="-24" width="40" height="26" fill="#2d7a3a" /><rect x="0" y="-40" width="24" height="18" fill="#3a9448" /></g>)}
        {/* tower with a ladder + beacon */}
        <g transform="translate(900 120)"><rect width="46" height="140" fill="#4a505c" /><rect x="0" y="0" width="46" height="8" fill="#6a7280" />{Array.from({ length: 6 }).map((_, r) => Array.from({ length: 2 }).map((__, c) => <rect key={r + '-' + c} x={8 + c * 20} y={20 + r * 20} width="10" height="10" fill={(r + c) % 3 === 0 ? '#ffcf70' : '#252a33'} />)) }<g fill="#b9c2cc"><rect x="52" y="30" width="3" height="110" /><rect x="64" y="30" width="3" height="110" />{Array.from({ length: 9 }).map((_, i) => <rect key={i} x="52" y={36 + i * 12} width="15" height="3" />)}</g><rect x="14" y="-30" width="18" height="30" fill="#e8ecf0" /><rect x="18" y="-26" width="10" height="14" fill="#ffd048" /></g>
      </svg>
      <div className="absolute left-[calc(50%+283px)] bottom-[38%] w-2 h-[60%] bg-gradient-to-t from-amber-300/50 to-transparent blur-[1px]" style={{ animation: 'beam 3s ease-in-out infinite' }} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/50" />
      <style>{`@keyframes cloud{from{transform:translateX(0)}to{transform:translateX(150vw)}}@keyframes twinkle{0%,100%{opacity:.2}50%{opacity:1}}@keyframes beam{0%,100%{opacity:.5}50%{opacity:1}}@keyframes skyshift{from{filter:hue-rotate(0deg)}to{filter:hue-rotate(-25deg) brightness(1.05)}}@keyframes splash{0%,100%{transform:rotate(-14deg) scale(1)}50%{transform:rotate(-14deg) scale(1.1)}}`}</style>
    </div>
  );
}

type View = 'home' | 'worlds' | 'new' | 'help';
export function MainMenu({ worlds, onPlay, onNew, onDelete, onSettings, onMods, backend, modCount }: { worlds: WorldMeta[]; onPlay: (w: WorldMeta) => void; onNew: (name: string, seed: string, mode: WorldMeta['mode']) => void; onDelete: (id: string) => void; onSettings: () => void; onMods: () => void; backend: string; modCount: number }) {
  const [view, setView] = useState<View>('home');
  const [name, setName] = useState('My World'); const [seed, setSeed] = useState(''); const [mode, setMode] = useState<WorldMeta['mode']>('survival');
  const splash = useMemo(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)], []);
  useEffect(() => { if (view === 'home' && worlds.length === 0 && !localStorage.getItem('fl_seen_menu')) { localStorage.setItem('fl_seen_menu', '1'); } }, [view, worlds.length]);
  const sorted = [...worlds].sort((a, b) => b.played - a.played);
  const logo = 'font-black tracking-[0.12em] leading-none select-none';
  const stack3d = '2px 2px 0 #7a4a00, 4px 4px 0 #5a3500, 6px 6px 0 #3a2200, 8px 8px 12px rgba(0,0,0,.6)';
  return (
    <div className="absolute inset-0 overflow-auto text-slate-100 font-mono">
      <Landscape />
      <div className="relative z-10 min-h-full flex flex-col items-center px-4 py-8">
        <div className="relative mt-4 mb-6 text-center">
          <div className={cx(logo, 'text-6xl md:text-8xl text-slate-100')} style={{ textShadow: '2px 2px 0 #8a8f99, 4px 4px 0 #555a64, 6px 6px 0 #2b2e36, 8px 8px 14px rgba(0,0,0,.6)' }}>FRONTLINE</div>
          <div className={cx(logo, 'text-3xl md:text-5xl text-amber-300 mt-2')} style={{ textShadow: stack3d }}>ZERO HOUR</div>
          <div className="absolute -right-4 md:-right-24 -bottom-3 text-yellow-300 font-bold text-sm md:text-lg whitespace-nowrap [text-shadow:2px_2px_0_#3a3000]" style={{ animation: 'splash .9s ease-in-out infinite' }}>{splash}</div>
        </div>

        {view === 'home' && <div className="w-[min(440px,92vw)] space-y-3">
          <button className={mcBtnGreen} onClick={() => onNew('Frontier', '', 'survival')}>▶ QUICK START — new Survival world</button>
          <button className={mcBtn} onClick={() => setView('worlds')}>Singleplayer{worlds.length > 0 && <span className="text-slate-300 text-xs ml-2">({worlds.length} saved)</span>}</button>
          <button className={mcBtn} onClick={() => setView('help')}>How to Play</button>
          <div className="grid grid-cols-2 gap-3"><button className={mcBtn} onClick={onSettings}>Settings</button><button className={mcBtn} onClick={onMods}>Mods ({modCount})</button></div>
          <div className="mt-5 rounded-lg bg-black/45 border border-white/10 p-3 text-[12px] text-slate-200 backdrop-blur">
            <div className="text-amber-300 font-bold tracking-widest mb-1">NEW HERE?</div>
            Hit <b>Quick Start</b>. A guide card in the corner walks you through mining, crafting, ladders, building and fighting step by step. Press <KeyCap k="H" /> any time for the full manual.
          </div>
        </div>}

        {view === 'worlds' && <div className="w-[min(640px,94vw)] rounded-xl bg-black/60 backdrop-blur border border-white/15 p-4">
          <div className="text-center font-bold tracking-[0.3em] text-sm mb-3">SELECT WORLD</div>
          <div className="space-y-2 max-h-[46vh] overflow-auto pr-1">
            {sorted.length === 0 && <div className="text-slate-400 text-center py-8 border-2 border-dashed border-white/15 rounded-lg">No worlds yet — create your first one!</div>}
            {sorted.map((w) => <div key={w.id} className="flex items-center gap-3 p-3 bg-black/40 border-2 border-slate-600 hover:border-amber-300 transition">
              <div className="w-12 h-12 shrink-0 flex items-center justify-center text-2xl bg-gradient-to-b from-sky-400 to-emerald-700 border-2 border-black/50">{w.mode === 'creative' ? '🏗' : w.mode === 'exploration' ? '🧭' : w.mode === 'challenge' ? '🏆' : '⚔'}</div>
              <div className="flex-1 min-w-0"><div className="font-bold truncate">{w.name}</div><div className="text-[11px] text-slate-400 capitalize">{w.mode} · seed {w.seed}</div><div className="text-[11px] text-slate-500">{new Date(w.played).toLocaleString()}</div></div>
              <button className={cx(mcBtnGreen, '!w-auto !py-1.5')} onClick={() => onPlay(w)}>Play</button>
              <button className={cx(mcBtn, '!w-auto !py-1.5 !text-xs')} onClick={() => confirm('Delete this world forever?') && onDelete(w.id)}>Delete</button>
            </div>)}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4"><button className={mcBtnGreen} onClick={() => setView('new')}>Create New World</button><button className={mcBtn} onClick={() => setView('home')}>Back</button></div>
        </div>}

        {view === 'new' && <div className="w-[min(720px,95vw)] rounded-xl bg-black/65 backdrop-blur border border-white/15 p-5 space-y-4">
          <div className="text-center font-bold tracking-[0.3em] text-sm">CREATE NEW WORLD</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-[11px] text-slate-400">World name<input className="mt-1 w-full bg-black/60 border-2 border-slate-500 focus:border-amber-300 outline-none px-3 py-2 text-slate-100 text-sm" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="text-[11px] text-slate-400">Seed (blank = random)<input className="mt-1 w-full bg-black/60 border-2 border-slate-500 focus:border-amber-300 outline-none px-3 py-2 text-slate-100 text-sm" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="e.g. 12345 or any word" /></label>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">{MODES.map(([k, t, d, e]) => <button key={k} onClick={() => setMode(k)} className={cx('text-left p-3 border-2 transition', mode === k ? 'border-amber-300 bg-amber-300/15' : 'border-slate-600 bg-black/40 hover:border-slate-300')}><div className="font-bold text-sm">{e} {t}{k === 'survival' && <span className="ml-2 text-[10px] text-emerald-300">RECOMMENDED</span>}</div><div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{d}</div></button>)}</div>
          <div className="grid grid-cols-2 gap-3"><button className={mcBtnGreen} onClick={() => onNew(name || 'My World', seed, mode)}>Create & Play</button><button className={mcBtn} onClick={() => setView('worlds')}>Cancel</button></div>
        </div>}

        {view === 'help' && <HelpPanel onClose={() => setView('home')} />}

        <div className="mt-auto pt-10 w-full flex justify-between text-[11px] text-slate-200/80 [text-shadow:1px_1px_0_#000] max-w-5xl"><span>Frontline: Zero Hour · {Reg.blocks.length - 1} blocks · {Reg.recipes.length} recipes</span><span>Renderer: {backend}</span></div>
      </div>
    </div>
  );
}

