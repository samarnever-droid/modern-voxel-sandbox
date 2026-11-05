/**
 * Fully synthesised audio: spatial SFX, ambience beds and a mood-driven generative score.
 * No samples — everything is built from oscillators and filtered noise, so it is original by construction.
 */
import { Reg } from '../engine/registry';

export type Mood = 'explore' | 'city' | 'underground' | 'night' | 'discovery' | 'combat';
export interface AudioEnv {
  mood: Mood; ambience: string; rain: number; wind: number; underwater: boolean; underground: boolean; night: boolean; storm: number; machines: number;
}
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode; musicBus!: GainNode; sfxBus!: GainNode; ambBus!: GainNode; lp!: BiquadFilterNode;
  vol = { master: 0.8, music: 0.5, sfx: 0.8, ambience: 0.6 };
  noiseBuf!: AudioBuffer;
  amb: Record<string, { g: GainNode; f?: BiquadFilterNode }> = {};
  mood: Mood = 'explore'; moodUntil = 0; nextBar = 0; bar = 0; padGain: GainNode | null = null;
  lastStep = 0;
  customSfx = new Map<string, any>();

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
    this.musicBus = c.createGain(); this.sfxBus = c.createGain(); this.ambBus = c.createGain();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.musicBus.connect(this.lp); this.sfxBus.connect(this.lp); this.ambBus.connect(this.lp); this.lp.connect(comp); comp.connect(this.master); this.master.connect(c.destination);
    // reverb-ish feedback delay on music
    const d = c.createDelay(1); d.delayTime.value = 0.37; const fb = c.createGain(); fb.gain.value = 0.38; const df = c.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 2400;
    this.musicBus.connect(d); d.connect(df); df.connect(fb); fb.connect(d); df.connect(this.lp);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const ch = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    this.setVolumes(this.vol);
    this.initAmbience();
  }
  setVolumes(v: { master: number; music: number; sfx: number; ambience: number }) {
    this.vol = v;
    if (!this.ctx) return;
    this.master.gain.value = v.master; this.musicBus.gain.value = v.music * 0.55; this.sfxBus.gain.value = v.sfx; this.ambBus.gain.value = v.ambience * 0.7;
  }
  setListener(p: [number, number, number], fwd: [number, number, number]) {
    if (!this.ctx) return;
    const l = this.ctx.listener as any;
    if (l.positionX) { l.positionX.value = p[0]; l.positionY.value = p[1]; l.positionZ.value = p[2]; l.forwardX.value = fwd[0]; l.forwardY.value = fwd[1]; l.forwardZ.value = fwd[2]; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
    else if (l.setPosition) { l.setPosition(p[0], p[1], p[2]); l.setOrientation(fwd[0], fwd[1], fwd[2], 0, 1, 0); }
  }

  // ------------------------------------------------------------------ primitives
  private out(pos?: [number, number, number], vol = 1): AudioNode | null {
    const c = this.ctx; if (!c) return null;
    const g = c.createGain(); g.gain.value = vol;
    if (pos) {
      const p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 4; p.maxDistance = 60; p.rolloffFactor = 1.3;
      p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2];
      g.connect(p); p.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    return g;
  }
  tone(freq: number, dur: number, o: { type?: OscillatorType; vol?: number; slide?: number; pos?: [number, number, number]; a?: number; delay?: number; bus?: AudioNode } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (o.delay ?? 0);
    const g = c.createGain(); const osc = c.createOscillator();
    osc.type = o.type ?? 'sine'; osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
    const a = o.a ?? 0.005;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    const out = o.bus ?? this.out(o.pos);
    if (!out) return;
    g.connect(out); osc.start(t); osc.stop(t + dur + 0.05);
  }
  noise(dur: number, o: { type?: BiquadFilterType; f?: number; q?: number; vol?: number; pos?: [number, number, number]; sweep?: number; delay?: number; bus?: AudioNode } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + (o.delay ?? 0);
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = o.type ?? 'bandpass'; f.frequency.setValueAtTime(o.f ?? 1000, t); f.Q.value = o.q ?? 1;
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.sweep), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(o.vol ?? 0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g);
    const out = o.bus ?? this.out(o.pos); if (!out) return;
    g.connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------ sfx
  sfx(name: string, pos?: [number, number, number], vol = 1) {
    if (!this.ctx) return;
    const [kind, mat] = name.split(':');
    const cs = this.customSfx.get(name);
    if (cs) { this.playCustom(cs, pos, vol); return; }
    const P = pos;
    const mats: Record<string, [number, number, string]> = { stone: [900, 1.2, 'triangle'], metal: [2200, 6, 'square'], glass: [3800, 8, 'sine'], wood: [500, 2, 'triangle'], grass: [2600, 0.7, 'sine'], dirt: [420, 0.8, 'sine'], sand: [3000, 0.6, 'sine'], snow: [2000, 0.5, 'sine'], gravel: [1500, 0.9, 'sine'], fabric: [350, 0.5, 'sine'], water: [800, 0.8, 'sine'], tech: [1800, 4, 'square'], plastic: [1200, 2, 'triangle'] };
    const m = mats[mat] ?? mats.stone;
    switch (kind) {
      case 'step': this.noise(0.09, { f: m[0] * 0.7, q: m[1], vol: 0.12 * vol, pos: P }); if (mat === 'metal' || mat === 'tech') this.tone(180 + Math.random() * 40, 0.12, { type: 'triangle', vol: 0.05 * vol, pos: P }); break;
      case 'mine': this.noise(0.07, { f: m[0], q: m[1], vol: 0.22 * vol, pos: P }); this.tone(m[0] * 0.18 + Math.random() * 30, 0.08, { type: m[2] as OscillatorType, vol: 0.08 * vol, pos: P }); break;
      case 'break': this.noise(0.28, { f: m[0], q: m[1] * 0.6, vol: 0.5 * vol, pos: P, sweep: m[0] * 0.4 }); this.tone(m[0] * 0.12, 0.18, { type: 'triangle', vol: 0.12 * vol, slide: m[0] * 0.05, pos: P }); if (mat === 'glass') for (let i = 0; i < 5; i++) this.tone(2500 + Math.random() * 3500, 0.2, { vol: 0.05 * vol, pos: P, delay: i * 0.03 }); break;
      case 'place': this.noise(0.1, { f: m[0] * 0.6, q: m[1], vol: 0.3 * vol, pos: P }); this.tone(m[0] * 0.1 + 60, 0.1, { type: 'triangle', vol: 0.1 * vol, slide: 50, pos: P }); break;
      case 'ui': this.tone(900, 0.06, { type: 'triangle', vol: 0.08 * vol, bus: this.musicBus }); break;
      case 'ui_back': this.tone(520, 0.08, { type: 'triangle', vol: 0.08 * vol, bus: this.musicBus }); break;
      case 'pickup': this.tone(700, 0.08, { type: 'sine', vol: 0.12, slide: 1300 }); this.tone(1400, 0.1, { vol: 0.06, delay: 0.05 }); break;
      case 'craft': for (let i = 0; i < 3; i++) this.tone(500 + i * 220, 0.16, { type: 'triangle', vol: 0.12, delay: i * 0.07 }); this.noise(0.15, { f: 4000, vol: 0.08 }); break;
      case 'hurt': this.tone(160, 0.25, { type: 'sawtooth', vol: 0.25, slide: 70 }); this.noise(0.15, { f: 600, vol: 0.2 }); break;
      case 'death': this.tone(300, 1.2, { type: 'sawtooth', vol: 0.25, slide: 40 }); this.noise(0.8, { type: 'lowpass', f: 900, sweep: 80, vol: 0.4 }); break;
      case 'bolt': this.tone(1500, 0.18, { type: 'sawtooth', vol: 0.16 * vol, slide: 260, pos: P }); this.noise(0.06, { f: 5000, vol: 0.12 * vol, pos: P }); break;
      case 'spread': for (let i = 0; i < 4; i++) this.tone(900 - i * 90, 0.14, { type: 'square', vol: 0.08 * vol, slide: 200, pos: P, delay: i * 0.012 }); this.noise(0.15, { f: 2500, vol: 0.2 * vol, pos: P }); break;
      case 'rail': this.tone(80, 0.5, { type: 'sine', vol: 0.4, slide: 30, pos: P }); this.tone(2400, 0.4, { type: 'sawtooth', vol: 0.12, slide: 120, pos: P }); this.noise(0.4, { f: 8000, sweep: 300, vol: 0.25, pos: P }); break;
      case 'arc': this.noise(0.12, { f: 3500, q: 3, vol: 0.3 * vol, pos: P }); this.tone(220, 0.1, { type: 'sawtooth', vol: 0.12 * vol, slide: 700, pos: P }); break;
      case 'zap': this.noise(0.2, { f: 4000, q: 5, vol: 0.28 * vol, pos: P }); this.tone(1800, 0.2, { type: 'square', vol: 0.08 * vol, slide: 200, pos: P }); break;
      case 'scan': for (let i = 0; i < 5; i++) this.tone(400 + i * 180, 0.5, { type: 'sine', vol: 0.12, slide: 1600 + i * 300, delay: i * 0.08, a: 0.1 }); break;
      case 'shield': this.tone(220, 0.8, { type: 'sine', vol: 0.2, slide: 880, a: 0.2 }); this.tone(330, 0.8, { type: 'triangle', vol: 0.1, slide: 1320, a: 0.2 }); break;
      case 'hook': this.noise(0.25, { f: 3000, sweep: 600, vol: 0.3 }); this.tone(900, 0.2, { type: 'square', vol: 0.1, slide: 200 }); break;
      case 'drone': this.tone(300, 0.6, { type: 'sawtooth', vol: 0.1, slide: 600 }); break;
      case 'thruster': this.noise(0.25, { type: 'lowpass', f: 700, sweep: 300, vol: 0.2, q: 0.5 }); break;
      case 'explode': this.noise(0.9, { type: 'lowpass', f: 1200, sweep: 60, vol: 0.7, pos: P }); this.tone(90, 0.6, { type: 'sine', vol: 0.5, slide: 28, pos: P }); break;
      case 'door': this.tone(140, 0.25, { type: 'square', vol: 0.12, slide: 90, pos: P }); this.noise(0.2, { f: 700, vol: 0.2, pos: P }); break;
      case 'power': this.tone(180, 0.5, { type: 'sawtooth', vol: 0.1, slide: 720, pos: P }); this.tone(1200, 0.2, { type: 'sine', vol: 0.06, delay: 0.3, pos: P }); break;
      case 'beacon': for (let i = 0; i < 6; i++) this.tone(midi(57 + [0, 7, 12, 16, 19, 24][i]), 1.6, { type: 'triangle', vol: 0.14, delay: i * 0.12, a: 0.05, bus: this.musicBus }); break;
      case 'research': for (let i = 0; i < 4; i++) this.tone(midi(64 + i * 3), 0.6, { type: 'sine', vol: 0.15, delay: i * 0.1, bus: this.musicBus }); break;
      case 'discover': for (let i = 0; i < 5; i++) this.tone(midi(60 + [0, 4, 7, 11, 14][i]), 1.2, { type: 'sine', vol: 0.16, delay: i * 0.14, a: 0.03, bus: this.musicBus }); break;
      case 'thunder': this.noise(2.5, { type: 'lowpass', f: 400, sweep: 50, vol: 0.9, q: 0.4 }); this.tone(55, 2.2, { type: 'sine', vol: 0.4, slide: 30 }); break;
      case 'machine': this.tone(90 + Math.random() * 20, 0.12, { type: 'square', vol: 0.07 * vol, pos: P }); this.noise(0.05, { f: 2000, vol: 0.1 * vol, pos: P }); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noise(0.07, { f: 1200, q: 2, vol: 0.2, delay: i * 0.12 }); break;
      case 'drill': this.noise(0.15, { f: 1800, q: 4, vol: 0.14 * vol, pos: P }); this.tone(120, 0.15, { type: 'sawtooth', vol: 0.08 * vol, pos: P }); break;
      case 'splash': this.noise(0.4, { f: 1500, q: 0.5, vol: 0.35, pos: P, sweep: 400 }); break;
      case 'chime': this.tone(880, 0.3, { type: 'sine', vol: 0.12 }); this.tone(1320, 0.4, { type: 'sine', vol: 0.08, delay: 0.1 }); break;
      default: this.tone(600, 0.1, { vol: 0.1, pos: P });
    }
  }
  private playCustom(spec: any, pos: [number, number, number] | undefined, vol: number) {
    const parts: any[] = Array.isArray(spec.layers) ? spec.layers : [spec];
    for (const p of parts) {
      if (p.noise) this.noise(p.dur ?? 0.2, { f: p.freq ?? 1000, q: p.q ?? 1, vol: (p.vol ?? 0.3) * vol, pos, sweep: p.slide, type: p.filter });
      else this.tone(p.freq ?? 440, p.dur ?? 0.2, { type: p.wave ?? 'sine', vol: (p.vol ?? 0.3) * vol, slide: p.slide, pos, delay: p.delay });
    }
  }
  registerCustomSfx(id: string, spec: any) { this.customSfx.set(id, spec); }

  // ------------------------------------------------------------------ ambience
  private loopNoise(f: number, q: number, type: BiquadFilterType): { g: GainNode; f: BiquadFilterNode } {
    const c = this.ctx!;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    s.connect(fl); fl.connect(g); g.connect(this.ambBus); s.start();
    return { g, f: fl };
  }
  private initAmbience() {
    const c = this.ctx!;
    this.amb.wind = this.loopNoise(500, 0.6, 'bandpass');
    this.amb.rain = this.loopNoise(5000, 0.4, 'highpass');
    this.amb.water = this.loopNoise(300, 0.5, 'lowpass');
    // hum: stacked oscillators
    const hum = c.createGain(); hum.gain.value = 0; hum.connect(this.ambBus);
    for (const [f, v] of [[50, 0.5], [100, 0.3], [150, 0.15], [75.4, 0.2]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const lf = c.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 260; const gg = c.createGain(); gg.gain.value = v; o.connect(lf); lf.connect(gg); gg.connect(hum); o.start(); }
    this.amb.hum = { g: hum };
    const drone = c.createGain(); drone.gain.value = 0; drone.connect(this.ambBus);
    for (const f of [38, 57, 84.5]) { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const l = c.createOscillator(); l.frequency.value = 0.07 + f * 0.001; const lg = c.createGain(); lg.gain.value = f * 0.02; l.connect(lg); lg.connect(o.frequency); const gg = c.createGain(); gg.gain.value = 0.4; o.connect(gg); gg.connect(drone); o.start(); l.start(); }
    this.amb.drone = { g: drone };
    this.amb.crickets = this.loopNoise(5200, 14, 'bandpass');
    const lfo = c.createOscillator(); lfo.frequency.value = 9; const lg = c.createGain(); lg.gain.value = 800; lfo.connect(lg); lg.connect(this.amb.crickets.f!.frequency); lfo.start();
  }
  update(dt: number, e: AudioEnv, _pos: [number, number, number]) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime;
    const set = (k: string, v: number) => { const a = this.amb[k]; if (a) a.g.gain.setTargetAtTime(v, t, 0.6); };
    const open = e.underground ? 0.1 : 1;
    const windy = e.ambience === 'blizzard' ? 1 : e.ambience === 'desert' || e.ambience === 'wind' ? 0.6 : e.ambience === 'forest' ? 0.3 : 0.25;
    set('wind', (windy * 0.12 + e.wind * 0.3 + e.storm * 0.2) * open);
    if (this.amb.wind.f) this.amb.wind.f.frequency.setTargetAtTime(350 + e.wind * 900 + windy * 300, t, 0.5);
    set('rain', e.rain * 0.22 * open);
    set('water', e.underwater ? 0.5 : 0);
    set('hum', ((e.ambience === 'city' || e.ambience === 'industrial') ? 0.12 : 0) + (e.underground ? 0.05 : 0) + (e.ambience === 'anomaly' ? 0.1 : 0));
    set('drone', e.underground || e.ambience === 'anomaly' ? 0.18 : 0.02);
    set('crickets', e.night && !e.underground && (e.ambience === 'forest' || e.ambience === 'suburb' || e.ambience === 'wind') && e.rain < 0.2 ? 0.05 : 0);
    this.lp.frequency.setTargetAtTime(e.underwater ? 520 : 20000, t, 0.15);
    // music
    if (e.mood !== this.mood && t > this.moodUntil) { this.mood = e.mood; this.moodUntil = t + (e.mood === 'discovery' ? 14 : 18); this.nextBar = t + 0.2; this.bar = 0; if (this.padGain) { this.padGain.gain.setTargetAtTime(0, t, 1.5); this.padGain = null; } }
    if (this.nextBar === 0) this.nextBar = t + 3;
    while (this.nextBar < t + 0.5) { this.scheduleBar(this.nextBar); this.nextBar += this.barLen(); this.bar++; }
    void dt;
  }
  private barLen() { return ({ explore: 4.8, city: 3.6, underground: 6, night: 5.5, discovery: 3.2, combat: 2.0 } as Record<Mood, number>)[this.mood]; }
  private scheduleBar(t0: number) {
    const c = this.ctx!, m = this.mood, bl = this.barLen();
    const prog: Record<Mood, number[][]> = {
      explore: [[62, 65, 69, 72], [58, 62, 65, 69], [60, 64, 67, 71], [57, 60, 64, 67]],
      city: [[57, 60, 64], [55, 58, 62], [53, 57, 60], [52, 55, 59]],
      underground: [[45, 52, 57], [43, 50, 55], [41, 48, 53], [46, 53, 58]],
      night: [[57, 64, 67, 71], [55, 62, 65, 69], [53, 60, 64, 67], [52, 59, 62, 66]],
      discovery: [[60, 64, 67, 71], [65, 69, 72, 76], [62, 67, 71, 74], [67, 71, 74, 79]],
      combat: [[45, 52, 57], [45, 52, 57], [43, 50, 55], [41, 48, 53]],
    };
    const chord = prog[m][this.bar % 4];
    const padV = ({ explore: 0.07, city: 0.05, underground: 0.08, night: 0.06, discovery: 0.08, combat: 0.045 } as Record<Mood, number>)[m];
    // pad
    const pg = c.createGain(); pg.gain.setValueAtTime(0.0001, t0); pg.gain.linearRampToValueAtTime(padV, t0 + bl * 0.4); pg.gain.linearRampToValueAtTime(0.0001, t0 + bl * 1.15); pg.connect(this.musicBus);
    const pf = c.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = m === 'underground' ? 500 : m === 'combat' ? 1400 : 1000; pf.connect(pg);
    for (const n of chord) for (const det of [-7, 7]) { const o = c.createOscillator(); o.type = m === 'discovery' ? 'triangle' : 'sawtooth'; o.frequency.value = midi(n - (m === 'combat' ? 12 : 0)); o.detune.value = det; o.connect(pf); o.start(t0); o.stop(t0 + bl * 1.2); }
    const beat = bl / 8;
    if (m === 'explore' || m === 'night' || m === 'discovery') {
      const sc = m === 'discovery' ? [0, 2, 4, 7, 9, 12, 14, 16] : [0, 3, 5, 7, 10, 12, 15, 17];
      const dens = m === 'night' ? 0.35 : m === 'discovery' ? 0.8 : 0.5;
      for (let i = 0; i < 8; i++) if (Math.random() < dens) this.tone(midi(chord[0] + 12 + sc[(Math.random() * sc.length) | 0]), 1.6, { type: 'sine', vol: m === 'night' ? 0.08 : 0.07, bus: this.musicBus, delay: t0 + i * beat - c.currentTime, a: 0.01 });
    }
    if (m === 'city') {
      for (let i = 0; i < 8; i++) { if (i % 2 === 0) this.noise(0.04, { type: 'highpass', f: 7000, vol: 0.05, bus: this.musicBus, delay: t0 + i * beat - c.currentTime }); if (i % 4 === 0) this.tone(midi(chord[0] - 12), 0.4, { type: 'sine', vol: 0.18, bus: this.musicBus, delay: t0 + i * beat - c.currentTime, slide: midi(chord[0] - 12) * 0.9 }); }
      if (this.bar % 2 === 0) for (let i = 0; i < 4; i++) this.tone(midi(chord[(i * 2) % chord.length] + 12), 0.3, { type: 'square', vol: 0.03, bus: this.musicBus, delay: t0 + i * beat * 2 + beat * 0.5 - c.currentTime });
    }
    if (m === 'underground') { if (Math.random() < 0.6) { this.tone(midi(chord[0] + 24), 3, { type: 'sine', vol: 0.05, bus: this.musicBus, delay: t0 + Math.random() * bl - c.currentTime }); } if (Math.random() < 0.35) this.noise(0.5, { f: 2400, q: 18, vol: 0.06, bus: this.musicBus, delay: t0 + Math.random() * bl - c.currentTime }); }
    if (m === 'combat') {
      for (let i = 0; i < 8; i++) {
        const dt = t0 + i * beat - c.currentTime;
        this.tone(midi(chord[0] - 12), beat * 0.9, { type: 'sawtooth', vol: 0.14, bus: this.musicBus, delay: dt });
        if (i % 4 === 0) { this.tone(110, 0.2, { type: 'sine', vol: 0.4, slide: 40, bus: this.musicBus, delay: dt }); }
        if (i % 4 === 2) this.noise(0.12, { f: 1800, q: 1, vol: 0.15, bus: this.musicBus, delay: dt });
        this.tone(midi(chord[(i * 3) % chord.length] + 12), beat * 0.6, { type: 'square', vol: 0.035, bus: this.musicBus, delay: dt + beat * 0.5 });
      }
    }
  }
  /** Mods can register extra sfx from JSON */
  loadModSfx() { for (const [k, v] of Reg.sounds) this.registerCustomSfx(k, v); }
}
export const audio = new AudioEngine();
