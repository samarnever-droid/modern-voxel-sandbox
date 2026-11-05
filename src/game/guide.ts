/**
 * The in-game guide: a short, guided first hour that teaches the loop
 * (gather → build → craft → defend → explore → research) and contextual hints.
 * Progress is derived from persistent player stats, so it survives save/load and never needs extra bookkeeping.
 */
import { Reg } from '../engine/registry';
import type { Game } from './core';

export interface GuideStep {
  key: string; title: string; desc: string; tip: string; icon: string;
  done: (g: Game) => boolean;
  prog?: (g: Game) => [number, number];
}
const st = (g: Game, k: string) => g.stats[k] ?? 0;
const counter = (k: string, goal: number) => ({ done: (g: Game) => st(g, k) >= goal, prog: (g: Game): [number, number] => [Math.min(goal, Math.floor(st(g, k))), goal] as [number, number] });

const MOVE: GuideStep = { key: 'move', icon: '🚶', title: 'Get moving', desc: 'Walk with W A S D, jump with Space, sprint by holding Ctrl while moving forward.', tip: 'Look around with the mouse. Click the game window first if the cursor is not captured.', ...counter('distance', 12) };
const MINE: GuideStep = { key: 'mine', icon: '⛏', title: 'Mine your first blocks', desc: 'Point at a block and HOLD the left mouse button until it breaks. Walk over the drops to pick them up.', tip: 'Tougher blocks need better tools. Your Salvage Cutter (hotbar slot 1) is faster than bare hands.', ...counter('blocks_broken', 5) };
const INV: GuideStep = { key: 'inv', icon: '🎒', title: 'Open your inventory', desc: 'Press E. The bottom 9 slots are your hotbar — switch with keys 1-9 or the mouse wheel.', tip: 'Click an item, then click another slot to move or swap it. Press E or Esc to close.', done: (g) => st(g, 'inv_open') >= 1 };
const PLACE: GuideStep = { key: 'place', icon: '🧱', title: 'Place some blocks', desc: 'Select a block in the hotbar and RIGHT-click a surface to place it. Left-click removes it again.', tip: 'Hold Shift while right-clicking a machine block to place against it instead of opening it.', ...counter('blocks_placed', 3) };
const BEACON: GuideStep = { key: 'beacon', icon: '◈', title: 'Light your Frontline Beacon', desc: 'Select the Frontline Beacon in your hotbar and RIGHT-click the ground. It claims a 32-block zone where machines will not attack and sets your respawn point.', tip: 'A tall golden beam marks every beacon. Break and move it any time.', done: (g) => st(g, 'beacons') >= 1 };
const BENCH: GuideStep = { key: 'bench', icon: '🛠', title: 'Craft a Workbench', desc: 'Press E → Crafting. The Workbench needs 4 Timber Planks + 2 Scrap Metal and can be crafted by hand anywhere.', tip: 'Recipes you can afford glow green. Use the search box to find anything.', done: (g) => st(g, 'made_workbench') >= 1 || g.stations.has('workbench') };
const BENCH2: GuideStep = { key: 'bench2', icon: '📍', title: 'Set it down and stand beside it', desc: 'Right-click the ground to place the Workbench. Standing within 5 blocks unlocks every Workbench recipe.', tip: 'Stations show up in the top bar of the inventory ("Stations: hand, workbench").', done: (g) => g.stations.has('workbench') };
const LADDER: GuideStep = { key: 'ladder', icon: '🪜', title: 'Craft a ladder', desc: 'In Crafting, make Timber Ladders (2 planks → 3 ladders). Steel Ladders unlock once you smelt steel.', tip: 'Ladders cost almost nothing — build vertical shortcuts everywhere.', done: (g) => st(g, 'made_timber_ladder') >= 1 || st(g, 'made_ladder') >= 1 || g.count('timber_ladder') + g.count('ladder') > 0 };
const CLIMB: GuideStep = { key: 'climb', icon: '🧗', title: 'Build a wall and climb it', desc: 'Stack a wall 4+ blocks tall. RIGHT-click its SIDE with a ladder; click the ladder again to extend it. Walk into it: W / Space climbs, S descends, Shift holds on.', tip: 'Look steeply down while holding W to go down. Ladders pop off if the wall behind them is removed.', ...counter('climbed', 6) };
const FIGHT: GuideStep = { key: 'fight', icon: '⚔', title: 'Defeat a Custodian machine', desc: 'Machines wander the land and hunt you at night. Left-click to strike. Scrappers bite, Sentinels shoot from the air, Wardens smash — keep moving!', tip: 'Stay inside your beacon zone to be safe. Defeated machines drop scrap, wire and data chips.', ...counter('machines', 1) };
const SMELT: GuideStep = { key: 'smelt', icon: '🔥', title: 'Build an Arc Smelter', desc: 'At a Workbench craft an Arc Smelter (8 Stone + 4 Scrap). Stand near it to turn scrap into steel and unlock stronger tools.', tip: 'Dig down for stone. Steel ingots → Steel Ladders, Pulse Cutter, power gear.', done: (g) => st(g, 'made_arc_smelter') >= 1 || g.stations.has('smelter') };
const EXPLORE: GuideStep = { key: 'explore', icon: '🧭', title: 'Discover a landmark', desc: 'Explore! Ruins, towers, bunkers and labs are scattered around. Open the map with M, follow your compass, and right-click crates to loot them.', tip: 'Press F with a Survey Scanner in the hotbar to ping nearby resources.', ...counter('discoveries', 1) };
const RESEARCH: GuideStep = { key: 'research', icon: '🔬', title: 'Research new technology', desc: 'Craft a Research Station and a Solar Panel, power it with cable, then spend Data Chips in the Research tab to climb the tech tiers.', tip: 'Check the Challenges tab (E) for long-term goals and rewards.', ...counter('research', 1) };
const FLY: GuideStep = { key: 'fly', icon: '🕊', title: 'Take flight', desc: 'Double-tap Space (or press X) to fly. Space rises, Shift descends, Ctrl goes faster.', tip: 'Creative mode has unlimited blocks — use the Creative tab in the inventory (E).', done: (g) => st(g, 'flew') >= 3 };
const DISC3: GuideStep = { key: 'explore3', icon: '🗺', title: 'Discover three landmarks', desc: 'Wander in any direction. Each landmark gives you a Data Chip in Exploration mode.', tip: 'Press T and type /tp x y z to jump, or /time night to see the city lights.', ...counter('discoveries', 3) };

export function guideSteps(mode: string): GuideStep[] {
  if (mode === 'creative') return [MOVE, INV, PLACE, FLY, CLIMB];
  if (mode === 'exploration') return [MOVE, INV, EXPLORE, CLIMB, DISC3];
  return [MOVE, MINE, INV, PLACE, BEACON, BENCH, BENCH2, LADDER, CLIMB, FIGHT, SMELT, EXPLORE, RESEARCH];
}
const dk = (k: string) => 'guide:' + k;
export function guideState(g: Game) {
  const steps = guideSteps(g.mode);
  const idx = steps.findIndex((s) => !g.done.has(dk(s.key)));
  return { steps, idx, step: idx >= 0 ? steps[idx] : null, total: steps.length, finished: idx < 0 };
}
/** Called a few times per second. Marks completed steps and announces the next one. */
export function guideTick(g: Game) {
  const steps = guideSteps(g.mode);
  for (const s of steps) {
    if (g.done.has(dk(s.key))) continue;
    if (s.done(g)) {
      g.done.add(dk(s.key));
      const i = steps.indexOf(s), nx = steps[i + 1];
      g.notify(`✔ ${s.title}` + (nx ? `   — next: ${nx.title}` : '   — Guide complete! Open E → Challenges for bigger goals.'), 'challenge');
      g.guideFlash = 4;
    }
    break; // only one step is "active" at a time
  }
}

/** One-line contextual hint shown above the hotbar. */
export function contextHint(g: Game): string {
  const p = g.p;
  if (p.dead) return '';
  if (g.onLadder) return 'LADDER  ·  W / Space climb  ·  S descend  ·  Shift hold on';
  if (p.inWater) return 'Swimming — hold Space to rise';
  if (p.air < 6 && p.under) return 'Running out of air! Swim up!';
  if (g.mode === 'survival' || g.mode === 'challenge') {
    if (p.health <= 6) return 'Low health — retreat into a beacon zone and eat (right-click food)';
    if (p.hunger <= 5) return 'Hungry — select food in the hotbar and right-click to eat';
    if (g.sim.machines.some((m) => Math.hypot(m.x - p.x, m.z - p.z) < 14) && !g.hud.claim) return 'Machine nearby! Fight with left-click, or run to a beacon zone';
    if (g.dayFactor < 0.2 && !g.hud.claim && g.claims.length === 0) return 'Night falls — machines get bolder. Place your Frontline Beacon!';
  }
  const t = g.target && Reg.blocks[g.target.id];
  if (t) {
    if (t.use === 'crate' || t.use === 'loot') return 'Right-click to open';
    if (t.use === 'door' || t.use === 'trapdoor') return 'Right-click to open / close';
    if (t.use === 'bed') return 'Right-click to set spawn';
    if (t.use === 'terminal') return 'Right-click to read the log';
    if (t.use && ['workbench', 'smelter', 'fabricator', 'lab', 'foundry', 'research'].includes(t.use)) return 'Station — stand within 5 blocks to craft with it (E)';
    if (t.climb) return 'Climbable — walk into it, W / Space to climb';
  }
  return '';
}
