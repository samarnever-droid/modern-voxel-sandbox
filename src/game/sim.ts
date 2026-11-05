/** Simulation of everything that isn't the player: machines, drops, bolts, particles, power grids, automation, beacons, weather & events. */
import { Reg, ID, S_ON, S_POWER, Block } from '../engine/registry';
import { hash01 } from '../engine/noise';
import { rayBox } from '../world/world';
import type { Chunk } from '../world/world';
import { Dyn } from './dyn';
import { emitMod } from '../mods/loader';
import { audio } from '../audio/audio';
import type { Game } from './core';

export interface Machine { id: number; type: 'scrapper' | 'sentinel' | 'warden'; x: number; y: number; z: number; vx: number; vy: number; vz: number; yaw: number; hp: number; max: number; cd: number; anim: number; hit: number; wander: number; wx: number; wz: number }
export interface Drop { x: number; y: number; z: number; vx: number; vy: number; vz: number; key: string; n: number; age: number }
export interface Bolt { x: number; y: number; z: number; dx: number; dy: number; dz: number; life: number; dmg: number; owner: 'player' | 'turret' | 'machine'; color: number[]; pierce: boolean; spread?: boolean }
export interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; c: number[]; e: number; g: number }
export interface Arc { a: number[]; b: number[]; life: number }
export interface PowerNode { x: number; y: number; z: number }

const MSTATS: Record<string, { hp: number; speed: number; dmg: number; aggro: number; w: number; h: number }> = {
  scrapper: { hp: 14, speed: 3.2, dmg: 3, aggro: 20, w: 0.45, h: 0.6 },
  sentinel: { hp: 9, speed: 3.6, dmg: 3, aggro: 26, w: 0.4, h: 0.8 },
  warden: { hp: 70, speed: 2.1, dmg: 8, aggro: 24, w: 0.6, h: 2.5 },
};
const nk = (x: number, y: number, z: number) => ((x + 32768) * 65536 + (z + 32768)) * 128 + y;
const SPARK = [1, 0.8, 0.3], CYAN = [0.3, 0.9, 1], RED = [1, 0.25, 0.2];

export class Sim {
  machines: Machine[] = []; drops: Drop[] = []; bolts: Bolt[] = []; parts: Particle[] = []; arcs: Arc[] = [];
  nodes = new Map<number, PowerNode>();
  nextId = 1; spawnT = 3; powerT = 0; slowT = 0; machT = new Map<number, number>();
  drone: { x: number; y: number; z: number; t: number; cd: number } | null = null;
  supply: { x: number; y: number; z: number; land: boolean; t: number } | null = null;
  weather = { rain: 0, target: 0, cloud: 0.25, storm: 0, wind: 0.1, timer: 90, flash: 0, thunderT: 0, kind: 'clear' as string };
  eventT = 120; banner: { text: string; t: number } | null = null; sweep = 0;
  constructor(private g: Game) {}

  // ---------------------------------------------------------------- chunk hooks
  scanChunk(c: Chunk) {
    const x0 = c.cx << 4, z0 = c.cz << 4;
    for (let i = 0; i < c.blocks.length; i++) {
      const id = c.blocks[i];
      if (id && Reg.blocks[id]!.power) this.nodes.set(nk(x0 + (i & 15), i >> 8, z0 + ((i >> 4) & 15)), { x: x0 + (i & 15), y: i >> 8, z: z0 + ((i >> 4) & 15) });
    }
  }
  dropChunk(c: Chunk) {
    const x0 = c.cx << 4, z0 = c.cz << 4;
    for (const [k, n] of this.nodes) if (n.x >= x0 && n.x < x0 + 16 && n.z >= z0 && n.z < z0 + 16) this.nodes.delete(k);
  }
  onBlock(x: number, y: number, z: number, id: number) {
    const k = nk(x, y, z);
    if (id && Reg.blocks[id]!.power) this.nodes.set(k, { x, y, z }); else this.nodes.delete(k);
    this.powerT = 0;
  }

  // ---------------------------------------------------------------- particles
  burst(x: number, y: number, z: number, kind: string, n: number, color?: number[]) {
    const g = this.g;
    for (let i = 0; i < n && this.parts.length < 1800; i++) {
      const a = Math.random() * 6.283, s = (kind === 'spark' ? 3 : 1.6) * (0.4 + Math.random());
      const up = kind === 'smoke' ? 0.8 + Math.random() : Math.random() * 3;
      const c = color ?? (kind === 'spark' ? SPARK : kind === 'smoke' ? [0.4, 0.4, 0.42] : kind === 'cyan' ? CYAN : kind === 'dust' ? [0.7, 0.62, 0.5] : kind === 'beacon' ? [1, 0.8, 0.3] : [0.6, 0.6, 0.6]);
      this.parts.push({ x: x + (Math.random() - 0.5) * 0.4, y: y + (Math.random() - 0.5) * 0.4, z: z + (Math.random() - 0.5) * 0.4, vx: Math.cos(a) * s, vy: up, vz: Math.sin(a) * s, life: 0, max: kind === 'smoke' ? 2.5 : 0.5 + Math.random() * 0.6, size: kind === 'smoke' ? 0.25 : 0.06 + Math.random() * 0.06, c: [c[0] * (0.8 + Math.random() * 0.4), c[1] * (0.8 + Math.random() * 0.4), c[2] * (0.8 + Math.random() * 0.4)], e: kind === 'spark' || kind === 'cyan' || kind === 'beacon' ? 1 : 0, g: kind === 'smoke' || kind === 'beacon' ? -0.3 : 14 });
    }
    void g;
  }
  blockChips(x: number, y: number, z: number, b: Block, n = 10) {
    const m = b.map ?? '#888888'; const c = [parseInt(m.slice(1, 3), 16) / 255, parseInt(m.slice(3, 5), 16) / 255, parseInt(m.slice(5, 7), 16) / 255];
    this.burst(x + 0.5, y + 0.5, z + 0.5, 'chip', n, c);
  }
  drop(x: number, y: number, z: number, key: string, n: number) {
    if (n <= 0 || !Reg.items.has(key)) return;
    this.drops.push({ x, y, z, vx: (Math.random() - 0.5) * 2.5, vy: 3 + Math.random() * 2, vz: (Math.random() - 0.5) * 2.5, key, n, age: 0 });
  }

  // ---------------------------------------------------------------- machines
  spawnMachine(type: Machine['type'], x: number, y: number, z: number) {
    const s = MSTATS[type];
    this.machines.push({ id: this.nextId++, type, x, y, z, vx: 0, vy: 0, vz: 0, yaw: Math.random() * 6.28, hp: s.hp, max: s.hp, cd: 1, anim: Math.random() * 6, hit: 0, wander: 0, wx: x, wz: z });
  }
  claimAt(x: number, z: number): boolean {
    for (const c of this.g.claims) if (Math.hypot(c.x - x, c.z - z) < c.r) return true;
    return false;
  }
  hurtMachine(m: Machine, dmg: number, kx = 0, kz = 0) {
    m.hp -= dmg; m.hit = 0.25; m.vx += kx; m.vz += kz;
    this.burst(m.x, m.y + 0.6, m.z, 'spark', 8);
    audio.sfx('arc', [m.x, m.y, m.z]);
    if (m.hp <= 0) this.killMachine(m);
  }
  killMachine(m: Machine) {
    this.machines = this.machines.filter((q) => q !== m);
    this.burst(m.x, m.y + 0.8, m.z, 'spark', 30); this.burst(m.x, m.y + 0.8, m.z, 'smoke', 8);
    audio.sfx('explode', [m.x, m.y, m.z], 0.7);
    const r = Math.random();
    this.drop(m.x, m.y + 0.5, m.z, 'scrap_metal', 1 + Math.floor(Math.random() * 3));
    if (r < 0.4) this.drop(m.x, m.y + 0.5, m.z, 'copper_wire', 1 + Math.floor(Math.random() * 2));
    if (r < 0.2) this.drop(m.x, m.y + 0.5, m.z, 'energy_cell', 1);
    if (r < 0.12 || m.type === 'warden') this.drop(m.x, m.y + 0.5, m.z, 'data_chip', m.type === 'warden' ? 2 : 1);
    if (m.type === 'warden' && Math.random() < 0.5) this.drop(m.x, m.y + 0.5, m.z, 'servo', 1);
    this.g.stat('machines', 1);
    emitMod('machine_destroyed', { type: m.type, x: m.x, y: m.y, z: m.z });
  }
  rayMachine(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): { m: Machine; t: number } | null {
    let best: { m: Machine; t: number } | null = null;
    for (const m of this.machines) {
      const s = MSTATS[m.type];
      const cy = m.type === 'sentinel' ? m.y - 0.2 : m.y;
      const t = rayBox(ox, oy, oz, dx, dy, dz, [m.x - s.w, cy, m.z - s.w, m.x + s.w, cy + s.h, m.z + s.w]);
      if (t >= 0 && t <= max && (!best || t < best.t)) best = { m, t };
    }
    return best;
  }
  private moveBody(o: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, w: number, h: number, dt: number, fly = false) {
    const wd = this.g.world;
    const solidAt = (x: number, y: number, z: number) => wd.isSolidAt(x, y, z);
    const nx = o.x + o.vx * dt;
    if (!solidAt(nx + Math.sign(o.vx) * w, o.y + 0.3, o.z) && !solidAt(nx + Math.sign(o.vx) * w, o.y + h * 0.9, o.z)) o.x = nx;
    else if (!fly && !solidAt(nx + Math.sign(o.vx) * w, o.y + 1.3, o.z) && !solidAt(nx, o.y + 1.3, o.z)) { o.vy = 6.5; } else o.vx = 0;
    const nz = o.z + o.vz * dt;
    if (!solidAt(o.x, o.y + 0.3, nz + Math.sign(o.vz) * w) && !solidAt(o.x, o.y + h * 0.9, nz + Math.sign(o.vz) * w)) o.z = nz;
    else if (!fly && !solidAt(o.x, o.y + 1.3, nz + Math.sign(o.vz) * w)) { o.vy = 6.5; } else o.vz = 0;
    if (!fly) o.vy -= 26 * dt;
    const ny = o.y + o.vy * dt;
    if (o.vy < 0 && solidAt(o.x, ny, o.z)) { o.y = Math.floor(ny) + 1; o.vy = 0; } else if (o.vy > 0 && solidAt(o.x, ny + h, o.z)) o.vy = 0; else o.y = ny;
    if (o.y < 0) o.y = 80;
  }
  private updateMachines(dt: number) {
    const g = this.g, p = g.p;
    const hostile = g.mode === 'survival' || g.mode === 'challenge';
    for (const m of [...this.machines]) {
      const s = MSTATS[m.type];
      m.anim += dt * (Math.hypot(m.vx, m.vz) * 1.6 + 1); m.hit = Math.max(0, m.hit - dt); m.cd -= dt;
      const dx = p.x - m.x, dz = p.z - m.z, dist = Math.hypot(dx, dz), dy = p.y + 1 - (m.y + s.h / 2);
      const claimed = this.claimAt(m.x, m.z);
      if (Math.hypot(dx, dz, dy) > 70) { this.machines = this.machines.filter((q) => q !== m); continue; }
      let tx = 0, tz = 0, speed = 0;
      const aggro = hostile && !claimed && dist < s.aggro && !g.p.dead;
      if (aggro) {
        const want = m.type === 'sentinel' ? 8 : 0.9;
        if (dist > want) { tx = dx / dist; tz = dz / dist; speed = s.speed; }
        else if (m.type === 'sentinel' && dist < want - 2) { tx = -dx / dist; tz = -dz / dist; speed = s.speed * 0.7; }
        m.yaw = Math.atan2(dx, dz);
        if (m.cd <= 0) {
          if (m.type === 'sentinel') {
            if (g.world.raycast(m.x, m.y, m.z, dx / dist, dy / dist, dz / dist, dist) === null || dist < 3) {
              const l = Math.hypot(dx, dy, dz);
              this.bolts.push({ x: m.x, y: m.y, z: m.z, dx: dx / l, dy: dy / l, dz: dz / l, life: 2.5, dmg: s.dmg, owner: 'machine', color: RED, pierce: false });
              audio.sfx('bolt', [m.x, m.y, m.z], 0.7); m.cd = 2.1;
            }
          } else if (dist < 1.6 && Math.abs(dy) < 2.2) { g.hurt(s.dmg, 'machine'); m.cd = 1.1; p.vx += tx * 5; p.vz += tz * 5; audio.sfx('zap', [m.x, m.y, m.z]); this.burst(p.x, p.y + 1, p.z, 'spark', 6); }
        }
      } else {
        m.wander -= dt;
        if (m.wander <= 0) { m.wander = 2 + Math.random() * 4; const a = Math.random() * 6.28; m.wx = m.x + Math.cos(a) * 6; m.wz = m.z + Math.sin(a) * 6; }
        const wx = m.wx - m.x, wz = m.wz - m.z, wl = Math.hypot(wx, wz);
        if (wl > 0.8) { tx = wx / wl; tz = wz / wl; speed = s.speed * 0.3; m.yaw = Math.atan2(wx, wz); }
        if (claimed && Math.random() < dt * 0.4) this.burst(m.x, m.y + 0.6, m.z, 'cyan', 1);
      }
      m.vx += (tx * speed - m.vx) * Math.min(1, dt * 6); m.vz += (tz * speed - m.vz) * Math.min(1, dt * 6);
      if (m.type === 'sentinel') {
        const gy = g.world.topY(Math.floor(m.x), Math.floor(m.z)) + 3.2, ty = aggro ? Math.max(gy, p.y + 3) : gy;
        m.vy += (ty - m.y) * dt * 3; m.vy *= 0.92; this.moveBody(m, s.w, s.h, dt, true);
      } else this.moveBody(m, s.w, s.h, dt);
      if (!this.machT.has(m.id) || (this.machT.get(m.id)! < performance.now() - 650 && speed > 0.5)) { this.machT.set(m.id, performance.now()); if (speed > 0.5 && dist < 24) audio.sfx('machine', [m.x, m.y, m.z], 0.6); }
    }
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    const g = this.g;
    this.updateWeather(dt);
    // spawn
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 2.5 + Math.random() * 2; this.trySpawn(); }
    this.updateMachines(dt);
    // drops
    for (const d of [...this.drops]) {
      d.age += dt; d.vy -= 18 * dt;
      const nx = d.x + d.vx * dt, ny = d.y + d.vy * dt, nz = d.z + d.vz * dt;
      if (g.world.isSolidAt(nx, d.y, d.z)) d.vx = 0; else d.x = nx;
      if (g.world.isSolidAt(d.x, d.y, nz)) d.vz = 0; else d.z = nz;
      if (g.world.isSolidAt(d.x, ny, d.z)) { d.vy = 0; d.vx *= 0.8; d.vz *= 0.8; } else d.y = ny;
      const dx = g.p.x - d.x, dy = g.p.y + 0.8 - d.y, dz = g.p.z - d.z, dist = Math.hypot(dx, dy, dz);
      if (d.age > 0.5 && dist < 3) { d.vx += (dx / dist) * 30 * dt; d.vy += (dy / dist) * 30 * dt; d.vz += (dz / dist) * 30 * dt; }
      if (d.age > 0.4 && dist < 1.3 && !g.p.dead) { const left = g.addItem(d.key, d.n); if (left < d.n) { audio.sfx('pickup'); g.pickupFlash(d.key, d.n - left); } if (left <= 0) this.drops = this.drops.filter((q) => q !== d); else d.n = left; }
      if (d.age > 300) this.drops = this.drops.filter((q) => q !== d);
    }
    // bolts
    for (const b of [...this.bolts]) {
      const sp = b.owner === 'player' ? 46 : 26, step = sp * dt;
      b.life -= dt;
      const hit = g.world.raycast(b.x, b.y, b.z, b.dx, b.dy, b.dz, step);
      const mh = b.owner !== 'machine' ? this.rayMachine(b.x, b.y, b.z, b.dx, b.dy, b.dz, step) : null;
      if (mh && (!hit || mh.t < hit.t)) {
        this.hurtMachine(mh.m, b.dmg, b.dx * 3, b.dz * 3);
        if (!b.pierce) { this.bolts = this.bolts.filter((q) => q !== b); continue; }
      }
      if (b.owner === 'machine') {
        const t = rayBox(b.x, b.y, b.z, b.dx, b.dy, b.dz, [g.p.x - 0.4, g.p.y, g.p.z - 0.4, g.p.x + 0.4, g.p.y + 1.8, g.p.z + 0.4]);
        if (t >= 0 && t <= step) { g.hurt(b.dmg, 'bolt'); this.burst(g.p.x, g.p.y + 1, g.p.z, 'spark', 8); this.bolts = this.bolts.filter((q) => q !== b); continue; }
      }
      if (hit) { this.burst(b.x + b.dx * hit.t, b.y + b.dy * hit.t, b.z + b.dz * hit.t, 'spark', 5); if (!b.pierce) { this.bolts = this.bolts.filter((q) => q !== b); continue; } }
      b.x += b.dx * step; b.y += b.dy * step; b.z += b.dz * step;
      if (b.life <= 0) this.bolts = this.bolts.filter((q) => q !== b);
      else if (Math.random() < 0.5) this.parts.push({ x: b.x, y: b.y, z: b.z, vx: 0, vy: 0, vz: 0, life: 0, max: 0.2, size: 0.05, c: b.color, e: 1, g: 0 });
    }
    // particles
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life += dt; if (p.life >= p.max) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.g > 0 && g.world.isSolidAt(p.x, p.y, p.z)) { p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; p.y += 0.05; }
    }
    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
    // slow systems
    this.powerT -= dt; if (this.powerT <= 0) { this.powerT = 0.5; this.powerTick(0.5); }
    this.slowT -= dt; if (this.slowT <= 0) { this.slowT = 1; this.machineTick(1); emitMod('tick', { time: g.time }); }
    this.drones(dt);
    this.events(dt);
  }

  private trySpawn() {
    const g = this.g, p = g.p;
    if (!(g.mode === 'survival' || g.mode === 'challenge') || p.dead) return;
    const night = g.dayFactor < 0.25;
    const underground = p.y < 36;
    const cap = (underground ? 5 : night ? 8 : 3) + (g.mode === 'challenge' ? 2 : 0) + (this.sweep > 0 ? 6 : 0);
    if (this.machines.length >= cap) return;
    for (let t = 0; t < 10; t++) {
      const a = Math.random() * 6.283, d = 22 + Math.random() * 16;
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!g.world.isLoaded(x, z) || this.claimAt(x, z)) continue;
      let y = -1;
      if (underground) { for (let yy = Math.floor(p.y) + 6; yy > Math.floor(p.y) - 10; yy--) if (g.world.getBlock(x, yy, z) === 0 && g.world.isSolidAt(x, yy - 1, z) && (g.world.getLight(x, yy, z) >> 4) < 4) { y = yy; break; } }
      else { const ty = g.world.topY(x, z); if (ty > 38 && g.world.getBlock(x, ty, z) !== ID.water) y = ty; }
      if (y < 0) continue;
      const r = Math.random(), bio = g.biome;
      const urban = bio === 'metropolis' || bio === 'industrial' || bio === 'research';
      const type: Machine['type'] = r < (urban || underground ? 0.1 : 0.03) ? 'warden' : r < (night || urban ? 0.55 : 0.25) ? 'sentinel' : 'scrapper';
      this.spawnMachine(type, x + 0.5, y, z + 0.5);
      return;
    }
  }

  // ---------------------------------------------------------------- power & automation
  private powerTick(dt: number) {
    const g = this.g, w = g.world;
    const seen = new Set<number>();
    const conduct = (n: PowerNode) => { const id = w.getBlock(n.x, n.y, n.z); const b = Reg.blocks[id]; if (!b || !b.power) return false; if (b.use === 'toggle' && !(w.getState(n.x, n.y, n.z) & S_ON)) return false; return true; };
    let peak = 0;
    for (const [k, n0] of this.nodes) {
      if (seen.has(k) || !conduct(n0)) continue;
      const comp: PowerNode[] = []; const q = [n0]; seen.add(k);
      while (q.length) {
        const n = q.pop()!; comp.push(n);
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const kk = nk(n.x + dx, n.y + dy, n.z + dz), nn = this.nodes.get(kk);
          if (nn && !seen.has(kk) && conduct(nn)) { seen.add(kk); q.push(nn); }
        }
      }
      let gen = 0, use = 0, cap = 0, stored = 0;
      const batts: any[] = [];
      for (const n of comp) {
        const b = Reg.blocks[w.getBlock(n.x, n.y, n.z)]!, pw = b.power!, key = `${n.x},${n.y},${n.z}`;
        if (pw.store) { const t = g.tile(key); t.charge = t.charge ?? 0; cap += pw.store; stored += t.charge; batts.push(t); }
        if (pw.use) use += pw.use;
        if (pw.gen) {
          if (pw.sun) gen += pw.gen * g.dayFactor * ((w.getLight(n.x, n.y + 1, n.z) >> 4) >= 14 ? 1 : 0) * (1 - this.weather.storm * 0.5);
          else if (b.use === 'generator') { const t = g.tile(key); if ((t.fuel ?? 0) > 0) { gen += pw.gen; t.fuel -= dt; if (Math.random() < 0.15) this.burst(n.x + 0.5, n.y + 1.1, n.z + 0.5, 'smoke', 1); } }
          else gen += pw.gen * (1 + this.weather.wind * 2);
        }
      }
      peak = Math.max(peak, gen);
      let powered = true;
      if (use > 0) {
        if (gen >= use) { const sur = (gen - use) * dt; let rem = sur; for (const t of batts) { const room = (cap / batts.length) - t.charge; const add = Math.min(room, rem); t.charge += add; rem -= add; } }
        else { const need = (use - gen) * dt; if (stored >= need) { let rem = need; for (const t of batts) { const take = Math.min(t.charge, rem); t.charge -= take; rem -= take; } } else powered = gen / use >= 0.55; }
      } else if (gen > 0) { let rem = gen * dt; for (const t of batts) { const add = Math.min((cap / batts.length) - t.charge, rem); t.charge += add; rem -= add; } }
      for (const n of comp) {
        const id = w.getBlock(n.x, n.y, n.z), b = Reg.blocks[id]!;
        if (!b.power!.use) continue;
        const st = w.getState(n.x, n.y, n.z), want = powered ? st | S_POWER : st & ~S_POWER;
        if (want !== st) { g.setBlock(n.x, n.y, n.z, id, want, false); if (powered && Math.random() < 0.3) audio.sfx('power', [n.x, n.y, n.z], 0.4); }
      }
    }
    if (peak > (g.stats.power_peak ?? 0)) g.stat('power_peak', peak - (g.stats.power_peak ?? 0));
  }
  private machineTick(dt: number) {
    const g = this.g, w = g.world, p = g.p;
    for (const n of this.nodes.values()) {
      const id = w.getBlock(n.x, n.y, n.z), b = Reg.blocks[id];
      if (!b) continue;
      const st = w.getState(n.x, n.y, n.z), key = `${n.x},${n.y},${n.z}`;
      const powered = !!(st & S_POWER);
      if (Math.hypot(n.x - p.x, n.z - p.z) > 40) continue;
      if (b.key === 'auto_drill' && powered) {
        const t = g.tile(key); t.t = (t.t ?? 0) + dt;
        if (t.t >= 3) {
          t.t = 0;
          const f = st & 3, DX = [0, -1, 0, 1][f], DZ = [1, 0, -1, 0][f];
          for (let d = 1; d <= 8; d++) {
            const x = n.x + DX * d, z = n.z + DZ * d, tid = w.getBlock(x, n.y, z), tb = Reg.blocks[tid];
            if (!tid || !tb || tb.shape === 'liquid') continue;
            if (tb.unbreakable || tb.hard < 0 || tb.tier > 2) break;
            g.setBlock(x, n.y, z, 0, 0, false);
            const key2 = tb.drop === undefined ? tb.key : tb.drop;
            if (key2) this.depositNear(n.x, n.y, n.z, key2, 1 + (tb.dropN ? Math.floor(Math.random() * (tb.dropN[1] - tb.dropN[0] + 1)) + tb.dropN[0] - 1 : 0));
            this.blockChips(x, n.y, z, tb, 8); audio.sfx('drill', [n.x, n.y, n.z]); break;
          }
        }
      }
      if (b.key === 'auto_turret' && powered) {
        let best: Machine | null = null, bd = 16;
        for (const m of this.machines) { const d = Math.hypot(m.x - n.x, m.y - n.y, m.z - n.z); if (d < bd) { bd = d; best = m; } }
        if (best) { const dx = best.x - n.x - 0.5, dy = best.y + 0.5 - n.y - 1, dz = best.z - n.z - 0.5, l = Math.hypot(dx, dy, dz); for (let k = 0; k < 2; k++) this.bolts.push({ x: n.x + 0.5, y: n.y + 0.9, z: n.z + 0.5, dx: dx / l + (Math.random() - 0.5) * 0.04, dy: dy / l, dz: dz / l, life: 1.5, dmg: 5, owner: 'turret', color: CYAN, pierce: false }); audio.sfx('bolt', [n.x, n.y, n.z], 0.6); }
      }
      if (b.key === 'tesla_coil' && powered) {
        for (const m of this.machines) if (Math.hypot(m.x - n.x, m.y - n.y, m.z - n.z) < 7) { this.arcs.push({ a: [n.x + 0.5, n.y + 0.9, n.z + 0.5], b: [m.x, m.y + 0.6, m.z], life: 0.25 }); this.hurtMachine(m, 5); break; }
      }
      if (b.key === 'charging_pad' && powered && Math.hypot(n.x + 0.5 - p.x, n.z + 0.5 - p.z) < 2 && Math.abs(n.y - p.y) < 2) g.repairHotbar(25);
      if (b.key === 'alarm_siren' && powered && this.machines.some((m) => Math.hypot(m.x - n.x, m.z - n.z) < 24)) audio.sfx('zap', [n.x, n.y, n.z], 0.5);
      if (b.key === 'frontline_beacon') {
        const c = g.claims.find((q) => q.x === n.x && q.z === n.z);
        if (!c) continue;
        if (Math.random() < 0.7) this.burst(n.x + 0.5, n.y + 1.2, n.z + 0.5, 'beacon', 2);
        for (let i = 0; i < 4 + c.tier * 3; i++) {
          const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * c.r, x = Math.floor(n.x + Math.cos(a) * r), z = Math.floor(n.z + Math.sin(a) * r);
          if (!w.isLoaded(x, z)) continue;
          const y = w.topY(x, z) - 1, bid = w.getBlock(x, y, z), rb = Reg.blocks[bid];
          const map: Record<string, string> = { dead_grass: 'grass', ash: 'dirt', cracked_concrete: 'concrete', asphalt_cracked: 'asphalt', rubble: 'gravel', rusted_steel: 'steel_block' };
          if (rb && map[rb.key]) { g.setBlock(x, y, z, ID[map[rb.key]], 0, false); this.burst(x + 0.5, y + 1.2, z + 0.5, 'beacon', 2); g.stat('restored', 1); if (map[rb.key] === 'grass' && w.getBlock(x, y + 1, z) === 0 && Math.random() < 0.4) g.setBlock(x, y + 1, z, Math.random() < 0.5 ? ID.tall_grass : ID.wildflower_blue, 0, false); }
        }
      }
    }
    // beacons in unloaded areas still count as claims, handled by g.claims list
  }
  private depositNear(x: number, y: number, z: number, key: string, n: number) {
    const g = this.g;
    for (const [dx, dy, dz] of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]) {
      const b = Reg.blocks[g.world.getBlock(x + dx, y + dy, z + dz)];
      if (b && (b.use === 'crate')) { const t = g.tile(`${x + dx},${y + dy},${z + dz}`); t.slots = t.slots ?? Array(27).fill(null); if (g.addToSlots(t.slots, key, n) < n) return; }
    }
    this.drop(x + 0.5, y + 1.2, z + 0.5, key, n);
  }

  // ---------------------------------------------------------------- drone, events, weather
  private drones(dt: number) {
    const d = this.drone, g = this.g; if (!d) return;
    d.t -= dt; d.cd -= dt;
    if (d.t <= 0) { this.drone = null; g.notify('Recon drone battery depleted.'); return; }
    const tx = g.p.x + Math.cos(performance.now() / 900) * 1.6, ty = g.p.y + 2.6, tz = g.p.z + Math.sin(performance.now() / 900) * 1.6;
    d.x += (tx - d.x) * Math.min(1, dt * 3); d.y += (ty - d.y) * Math.min(1, dt * 3); d.z += (tz - d.z) * Math.min(1, dt * 3);
    if (d.cd <= 0) {
      let best: Machine | null = null, bd = 16;
      for (const m of this.machines) { const q = Math.hypot(m.x - d.x, m.y - d.y, m.z - d.z); if (q < bd) { bd = q; best = m; } }
      if (best) { this.arcs.push({ a: [d.x, d.y, d.z], b: [best.x, best.y + 0.6, best.z], life: 0.2 }); this.hurtMachine(best, 4); d.cd = 0.9; }
    }
  }
  private events(dt: number) {
    const g = this.g;
    if (this.banner) { this.banner.t -= dt; if (this.banner.t <= 0) this.banner = null; }
    if (this.sweep > 0) this.sweep -= dt;
    if (this.supply) {
      const s = this.supply; s.t += dt;
      if (!s.land) { s.y -= 9 * dt; this.burst(s.x, s.y + 1, s.z, 'smoke', 1); if (s.y <= g.world.topY(Math.floor(s.x), Math.floor(s.z)) + 0.5) { s.land = true; const y = Math.floor(s.y); g.setBlock(Math.floor(s.x), y, Math.floor(s.z), ID.supply_crate, 0, false); audio.sfx('explode', [s.x, s.y, s.z], 0.5); this.burst(s.x, s.y + 0.5, s.z, 'dust', 30); } }
      else { this.burst(s.x, s.y + 1 + (s.t % 3), s.z, 'beacon', 1); if (s.t > 400) this.supply = null; }
    }
    if (g.mode === 'creative') return;
    this.eventT -= dt;
    if (this.eventT <= 0) {
      this.eventT = (g.mode === 'challenge' ? 70 : 150) + Math.random() * 120;
      const r = Math.random(), p = g.p;
      if (r < 0.34) { // supply drop
        const a = Math.random() * 6.28, d = 25 + Math.random() * 20, x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
        if (g.world.isLoaded(Math.floor(x), Math.floor(z))) { this.supply = { x, y: 110, z, land: false, t: 0 }; this.banner = { text: 'SUPPLY DROP INBOUND — look for the amber beam', t: 8 }; audio.sfx('chime'); g.notify('Supply drop inbound!'); }
      } else if (r < 0.62 && g.mode !== 'exploration') { // sweep
        this.sweep = 60; this.banner = { text: 'CUSTODIAN SWEEP DETECTED — machines are converging', t: 8 }; audio.sfx('zap'); g.notify('Custodian sweep! Claimed land is safe.');
        for (let i = 0; i < 4; i++) this.spawnT = 0;
      } else if (r < 0.8) { this.weather.target = 1; this.weather.storm = 1; this.weather.timer = 120; this.banner = { text: 'POWER SURGE — electrical storm overhead', t: 8 }; }
      else {
        const sites = g.gen.sitesAround(p.x, p.z, 400).filter((s) => !g.discovered.has(s.kind.id + ':' + s.i + ':' + s.j));
        if (sites.length) { const s = sites[0]; g.waypoint = { x: s.x, z: s.z, name: s.kind.name }; this.banner = { text: `SIGNAL ANOMALY — ${s.kind.name} marked on your compass`, t: 9 }; audio.sfx('discover'); g.notify('New signal detected. Check your compass.'); }
      }
      emitMod('event', { kind: this.banner?.text ?? '' });
    }
  }
  private updateWeather(dt: number) {
    const w = this.weather, g = this.g;
    w.timer -= dt;
    if (w.timer <= 0) {
      const r = Math.random();
      w.timer = 150 + Math.random() * 300;
      if (r < 0.55) { w.target = 0; w.storm = 0; w.kind = 'clear'; } else if (r < 0.85) { w.target = 0.5 + Math.random() * 0.4; w.storm = 0; w.kind = 'rain'; } else { w.target = 1; w.storm = 1; w.kind = 'storm'; }
    }
    w.rain += (w.target - w.rain) * Math.min(1, dt * 0.15);
    w.cloud += ((0.2 + w.rain * 0.8) - w.cloud) * Math.min(1, dt * 0.2);
    w.wind += ((0.08 + w.rain * 0.35 + w.storm * 0.4) - w.wind) * Math.min(1, dt * 0.3);
    w.flash = Math.max(0, w.flash - dt * 2.5);
    if (w.storm > 0.5) {
      w.thunderT -= dt;
      if (w.thunderT <= 0) { w.thunderT = 6 + Math.random() * 14; w.flash = 1; setTimeout(() => audio.sfx('thunder'), 300 + Math.random() * 1500); }
    }
    void g;
  }

  // ---------------------------------------------------------------- rendering
  render(o: Dyn, a: Dyn, cam: [number, number, number], right: number[], up: number[], t: number) {
    const g = this.g, w = this.weather;
    const lightAt = (x: number, y: number, z: number) => { const l = g.world.getLight(Math.floor(x), Math.floor(y + 1), Math.floor(z)); const sky = (l >> 4) / 15 * (0.15 + g.dayFactor * 0.85), bl = (l & 15) / 15; return Math.min(1, 0.18 + Math.max(sky, bl * 0.9)); };
    for (const m of this.machines) {
      const L = lightAt(m.x, m.y, m.z), flash = m.hit > 0 ? 1 : 0, sw = Math.sin(m.anim * 3) * 0.5;
      const c = (r: number, gg: number, b: number) => [Math.min(1, r * L + flash * 0.8), Math.min(1, gg * L + flash * 0.8), Math.min(1, b * L + flash * 0.8)];
      const cy = m.yaw;
      if (m.type === 'scrapper') {
        o.box(m.x, m.y + 0.35, m.z, 0.8, 0.32, 0.6, cy, 0, c(0.75, 0.38, 0.18)); o.box(m.x, m.y + 0.55, m.z, 0.5, 0.2, 0.4, cy, 0, c(0.55, 0.57, 0.6));
        o.box(m.x + Math.sin(cy) * 0.35, m.y + 0.42, m.z + Math.cos(cy) * 0.35, 0.18, 0.12, 0.1, cy, 0, [1, 0.2, 0.15], 1, 1);
        for (let i = 0; i < 4; i++) { const sx = i < 2 ? -0.4 : 0.4, sz = i % 2 ? 0.25 : -0.25, ph = (i % 2 ? 1 : -1) * sw; const px = Math.cos(cy) * sx + Math.sin(cy) * (sz + ph * 0.2), pz = -Math.sin(cy) * sx + Math.cos(cy) * (sz + ph * 0.2); o.box(m.x + px, m.y + 0.17, m.z + pz, 0.1, 0.34, 0.1, cy, 0, c(0.3, 0.3, 0.34)); }
      } else if (m.type === 'sentinel') {
        const by = m.y + Math.sin(t * 3 + m.id) * 0.1;
        o.box(m.x, by + 0.3, m.z, 0.55, 0.4, 0.55, cy, 0, c(0.6, 0.64, 0.7)); o.box(m.x, by + 0.62, m.z, 0.3, 0.12, 0.3, cy, 0, c(0.25, 0.27, 0.32));
        o.box(m.x + Math.sin(cy) * 0.28, by + 0.3, m.z + Math.cos(cy) * 0.28, 0.2, 0.2, 0.1, cy, 0, [1, 0.15, 0.1], 1, 1.4);
        o.box(m.x, by + 0.7, m.z, 1.1, 0.04, 0.12, t * 14 + m.id, 0, c(0.8, 0.85, 0.9), 0.85); o.box(m.x, by + 0.7, m.z, 1.1, 0.04, 0.12, t * 14 + m.id + 1.57, 0, c(0.8, 0.85, 0.9), 0.85);
      } else {
        o.box(m.x, m.y + 1.5, m.z, 0.9, 1.1, 0.6, cy, 0, c(0.3, 0.38, 0.5)); o.box(m.x, m.y + 2.25, m.z, 0.5, 0.4, 0.5, cy, 0, c(0.45, 0.48, 0.55));
        o.box(m.x + Math.sin(cy) * 0.27, m.y + 2.28, m.z + Math.cos(cy) * 0.27, 0.4, 0.1, 0.1, cy, 0, [1, 0.2, 0.15], 1, 1.6);
        o.box(m.x, m.y + 1.5, m.z, 0.5, 0.5, 0.64, cy, 0, [0.3, 0.9, 1], 1, 0.8);
        for (const s of [-1, 1]) { const px = Math.cos(cy) * s * 0.65, pz = -Math.sin(cy) * s * 0.65; o.box(m.x + px, m.y + 1.4, m.z + pz, 0.28, 1.1, 0.3, cy, s * sw * 0.8, c(0.38, 0.42, 0.5)); const lx = Math.cos(cy) * s * 0.28, lz = -Math.sin(cy) * s * 0.28; o.box(m.x + lx, m.y + 0.5, m.z + lz, 0.3, 1.0, 0.34, cy, -s * sw * 0.7, c(0.25, 0.28, 0.35)); }
      }
    }
    for (const d of this.drops) { const it = Reg.items.get(d.key); const b = it?.block; const mc = b?.map ?? '#cccccc'; const col = [parseInt(mc.slice(1, 3), 16) / 255, parseInt(mc.slice(3, 5), 16) / 255, parseInt(mc.slice(5, 7), 16) / 255]; const L = lightAt(d.x, d.y, d.z); o.box(d.x, d.y + 0.25 + Math.sin(t * 2 + d.age) * 0.06, d.z, 0.28, 0.28, 0.28, t * 1.5 + d.age, 0, col.map((v) => Math.min(1, v * (0.6 + L * 0.6))), 1, it?.type === 'block' ? 0 : 0.35); }
    if (this.drone) { const d = this.drone; o.box(d.x, d.y, d.z, 0.3, 0.16, 0.3, t, 0, [0.3, 0.34, 0.4]); o.box(d.x, d.y + 0.1, d.z, 0.5, 0.03, 0.06, t * 20, 0, [0.8, 0.85, 0.9], 0.8); o.box(d.x, d.y, d.z, 0.12, 0.12, 0.12, 0, 0, [0.3, 1, 0.7], 1, 1.4); }
    if (this.supply && !this.supply.land) { const s = this.supply; o.box(s.x, s.y, s.z, 0.9, 0.9, 0.9, t, 0, [0.35, 0.42, 0.3]); a.beam(s.x, s.y, s.z, s.x, s.y + 40, s.z, 0.08, [1, 0.7, 0.2], 0.4, 1); }
    if (this.supply && this.supply.land) a.beam(this.supply.x, this.supply.y, this.supply.z, this.supply.x, this.supply.y + 60, this.supply.z, 0.07, [1, 0.7, 0.2], 0.3, 1.2);
    for (const b of this.bolts) o.box(b.x, b.y, b.z, 0.07, 0.07, 0.5, Math.atan2(b.dx, b.dz), -Math.asin(b.dy), b.color, 1, 2);
    for (const ar of this.arcs) { let px = ar.a[0], py = ar.a[1], pz = ar.a[2]; for (let i = 1; i <= 6; i++) { const f = i / 6, nx = ar.a[0] + (ar.b[0] - ar.a[0]) * f + (i < 6 ? (Math.random() - 0.5) * 0.5 : 0), ny = ar.a[1] + (ar.b[1] - ar.a[1]) * f + (i < 6 ? (Math.random() - 0.5) * 0.5 : 0), nz = ar.a[2] + (ar.b[2] - ar.a[2]) * f + (i < 6 ? (Math.random() - 0.5) * 0.5 : 0); a.beam(px, py, pz, nx, ny, nz, 0.04, [0.6, 0.85, 1], 0.9, 2); px = nx; py = ny; pz = nz; } }
    for (const p of this.parts) { const k = 1 - p.life / p.max; const s = p.size * (p.g < 0 ? 1 + p.life : k * 0.5 + 0.5); a.quad(p.x, p.y, p.z, right[0] * s, right[1] * s, right[2] * s, up[0] * s, up[1] * s, up[2] * s, p.c, p.g < 0 ? k * 0.5 : Math.min(1, k * 1.5), p.e); }
    // rain / snow
    const rain = w.rain;
    if (rain > 0.05 && g.p.y > 30) {
      const n = Math.floor(rain * 260), snow = g.biome === 'snow' || g.biome === 'snowpeak' || g.cam[1] > 95;
      for (let i = 0; i < n; i++) {
        const sx = hash01(i, 1, 7, 3) * 36 - 18, sz = hash01(i, 2, 7, 3) * 36 - 18, sp = snow ? 2.2 : 22 + hash01(i, 3, 7, 3) * 8;
        const fy = (hash01(i, 4, 7, 3) * 22 - t * sp) % 22; const yy = cam[1] + 11 + (fy < 0 ? fy + 22 : fy) - 22 + 12;
        const x = Math.floor(cam[0]) + sx + (snow ? Math.sin(t + i) * 0.5 : 0), z = Math.floor(cam[2]) + sz;
        if (g.world.topY(Math.floor(x), Math.floor(z)) > yy) continue;
        if (snow) a.quad(x, yy, z, right[0] * 0.04, right[1] * 0.04, right[2] * 0.04, up[0] * 0.04, up[1] * 0.04, up[2] * 0.04, [1, 1, 1], 0.8, 0.3);
        else a.beam(x, yy, z, x - 0.12, yy - 0.9, z - 0.05, 0.012, [0.7, 0.8, 0.95], 0.35, 0.1);
      }
    }
  }
}
