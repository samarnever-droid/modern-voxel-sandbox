/**
 * Articulated models for the Custodian machines and the player avatar.
 * Everything is built from jointed boxes (a tiny rig with matrix frames) so limbs bend at knees/elbows,
 * rotors spin, eyes glow and attacks have wind-ups — instead of a pile of static cubes.
 */
import { Dyn } from './dyn';
import type { Machine } from './sim';

export type V3 = [number, number, number];
type M3 = number[];
const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mul = (A: M3, B: M3): M3 => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return o;
};
const apply = (R: M3, v: number[]): V3 => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
export const rotX = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
export const rotY = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
export const rotZ = (a: number): M3 => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
/** compose Y * X * Z */
export const rot = (rx = 0, ry = 0, rz = 0): M3 => mul(rotY(ry), mul(rotX(rx), rotZ(rz)));

export interface Frame { R: M3; o: V3 }
export const root = (x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0): Frame => ({ R: mul(rotY(yaw), mul(rotX(pitch), rotZ(roll))), o: [x, y, z] });
export const child = (f: Frame, off: number[], R2: M3 = I3): Frame => { const p = apply(f.R, off); return { R: mul(f.R, R2), o: [f.o[0] + p[0], f.o[1] + p[1], f.o[2] + p[2]] }; };

type Col = number[];
class Painter {
  constructor(private o: Dyn, private lit: number, private flash: number) {}
  c(r: number, g: number, b: number): Col { const f = this.flash; return [Math.min(1, r * this.lit + f * 0.85), Math.min(1, g * this.lit + f * 0.85), Math.min(1, b * this.lit + f * 0.85)]; }
  /** lit part */
  p(f: Frame, c: number[], s: number[], col: Col, e = 0, a = 1, grad = 0.28) {
    const q = apply(f.R, c);
    this.o.boxR(f.o[0] + q[0], f.o[1] + q[1], f.o[2] + q[2], s[0], s[1], s[2], f.R, col, a, e, grad);
  }
  /** emissive part (not affected by ambient light, only hit flash) */
  g(f: Frame, c: number[], s: number[], col: Col, e = 1.4, a = 1) { this.p(f, c, s, col, e, a, 0); }
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const PAL = {
  rust: [0.74, 0.36, 0.15], rustD: [0.5, 0.24, 0.1], steel: [0.5, 0.54, 0.6], steelD: [0.24, 0.26, 0.31], dark: [0.12, 0.13, 0.16],
  hazard: [0.95, 0.72, 0.08], blue: [0.3, 0.37, 0.5], blueL: [0.42, 0.48, 0.6], blueD: [0.2, 0.24, 0.33], red: [1, 0.16, 0.1], cyan: [0.3, 0.92, 1], orange: [1, 0.55, 0.15],
};

/** Draw every machine with its own rig. `lightAt` returns 0..1 ambient. */
export function drawMachine(o: Dyn, a: Dyn, m: Machine, L: number, t: number, cam: number[], right: number[], up: number[], groundY: number, hpMax: number, h: number) {
  const flash = m.hit > 0 ? Math.min(1, m.hit * 3) : 0;
  const P = new Painter(o, L, flash);
  const spd = Math.hypot(m.vx, m.vz);
  const mf = clamp(spd / 1.6, 0, 1);
  const blink = Math.sin(t * 6 + m.id * 1.7) > 0.2 ? 1 : 0.15;
  // ---- ground shadow
  const air = Math.max(0, m.y - groundY);
  const sr = (m.type === 'warden' ? 0.95 : m.type === 'sentinel' ? 0.6 : 0.55) * (1 - Math.min(0.5, air * 0.1));
  const sa = 0.34 * (1 - Math.min(0.75, air * 0.18));
  const sy = groundY + 0.025;
  a.quad(m.x, sy, m.z, sr, 0, 0, 0, 0, sr * 0.8, [0, 0, 0], sa, 0);
  a.quad(m.x, sy, m.z, sr * 0.7, 0, sr * 0.7, -sr * 0.56, 0, sr * 0.56, [0, 0, 0], sa, 0);

  if (m.type === 'scrapper') {
    const bob = Math.sin(m.anim * 3) * 0.015 * mf;
    const body = root(m.x, m.y + bob, m.z, m.yaw, -0.04 * mf);
    const snap = m.cd > 0.8 ? 1 : 0;
    P.p(child(body, [0, 0.37, 0]), [0, 0, 0], [0.64, 0.2, 0.86], P.c(...(PAL.rust as [number, number, number])));
    P.p(child(body, [0, 0.31, 0]), [0, 0, 0], [0.5, 0.12, 0.7], P.c(...(PAL.rustD as [number, number, number])));
    P.p(child(body, [0, 0.49, -0.04]), [0, 0, 0], [0.5, 0.1, 0.66], P.c(...(PAL.steel as [number, number, number])));
    P.p(child(body, [0, 0.545, -0.1]), [0, 0, 0], [0.34, 0.03, 0.34], P.c(...(PAL.steelD as [number, number, number])));
    // rivets
    for (const sx of [-1, 1]) for (const z of [-0.26, 0.2]) P.p(child(body, [sx * 0.22, 0.56, z]), [0, 0, 0], [0.05, 0.03, 0.05], P.c(0.2, 0.2, 0.22));
    // rear hazard bar + exhaust
    P.p(child(body, [0, 0.4, -0.45]), [0, 0, 0], [0.62, 0.12, 0.06], P.c(...(PAL.hazard as [number, number, number])));
    P.p(child(body, [0.16, 0.46, -0.48]), [0, 0, 0], [0.09, 0.09, 0.1], P.c(0.1, 0.1, 0.12));
    P.g(child(body, [0.16, 0.46, -0.54]), [0, 0, 0], [0.06, 0.06, 0.02], P.c(1, 0.5, 0.15), 1.1, 0.7);
    // head / sensor pod
    const head = child(body, [0, 0.43, 0.46], rotX(Math.sin(m.anim * 2) * 0.05));
    P.p(head, [0, 0, 0], [0.38, 0.22, 0.16], P.c(0.2, 0.21, 0.25));
    P.p(head, [0, 0.13, -0.02], [0.3, 0.05, 0.12], P.c(...(PAL.steel as [number, number, number])));
    P.g(head, [0, 0.01, 0.085], [0.24, 0.09, 0.03], P.c(...(PAL.red as [number, number, number])), 1.8);
    P.g(head, [0, 0.01, 0.1], [0.08, 0.04, 0.02], [1, 0.8, 0.7], 2.2);
    for (const sx of [-1, 1]) P.g(head, [sx * 0.16, -0.05, 0.085], [0.03, 0.03, 0.02], [1, 0.4, 0.15], 1.2 * blink + 0.2);
    // sensor dome + antenna
    P.p(child(body, [0, 0.6, 0.08]), [0, 0, 0], [0.18, 0.09, 0.18], P.c(0.16, 0.17, 0.2));
    P.g(child(body, [0, 0.66, 0.08]), [0, 0, 0], [0.08, 0.05, 0.08], P.c(0.3, 0.9, 1), 1.2);
    const ant = child(body, [0.2, 0.55, -0.26], rotZ(Math.sin(m.anim * 2.3) * 0.08 - 0.12));
    P.p(ant, [0, 0.16, 0], [0.025, 0.32, 0.025], P.c(0.6, 0.6, 0.64));
    P.g(ant, [0, 0.34, 0], [0.05, 0.05, 0.05], P.c(1, 0.2, 0.15), 2 * blink + 0.1);
    // mandibles (snap on attack)
    for (const sx of [-1, 1]) {
      const open = (snap ? -0.1 : 0.42 + Math.sin(m.anim * 2 + sx) * 0.1) * sx;
      const arm = child(body, [sx * 0.2, 0.34, 0.44], rotY(open));
      P.p(arm, [0, 0, 0.15], [0.07, 0.07, 0.3], P.c(0.35, 0.37, 0.42));
      const tip = child(arm, [0, 0, 0.3], rotY(-sx * 0.7));
      P.p(tip, [0, 0, 0.08], [0.05, 0.06, 0.18], P.c(0.75, 0.78, 0.82), 0, 1, 0.1);
      P.p(tip, [-sx * 0.025, 0, 0.14], [0.02, 0.05, 0.05], P.c(0.9, 0.9, 0.95), 0, 1, 0);
    }
    // six legs, tripod gait
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? -1 : 1, row = i % 3, z = -0.28 + row * 0.28;
      const ph = m.anim * 3.2 + ((row + (side > 0 ? 1 : 0)) % 2) * Math.PI;
      const sw = Math.sin(ph) * 0.5 * mf, lift = Math.max(0, Math.cos(ph)) * 0.45 * mf;
      const hip = child(body, [side * 0.3, 0.38, z], mul(rotY(sw * 0.6 + (row - 1) * 0.35 * side * -1), rotZ(side * (-0.5 - lift * 0.5))));
      P.p(hip, [side * 0.16, 0, 0], [0.34, 0.07, 0.07], P.c(0.36, 0.38, 0.43));
      P.p(hip, [side * 0.02, 0, 0], [0.1, 0.1, 0.1], P.c(0.2, 0.21, 0.25));
      const knee = child(hip, [side * 0.33, 0, 0], rotZ(side * (1.35 + lift * 0.3)));
      P.p(knee, [side * 0.02, 0, 0], [0.09, 0.09, 0.09], P.c(0.75, 0.38, 0.15));
      P.p(knee, [side * 0.19, 0, 0], [0.4, 0.05, 0.05], P.c(0.3, 0.32, 0.37));
      P.p(knee, [side * 0.4, 0, 0], [0.05, 0.05, 0.07], P.c(0.12, 0.12, 0.14), 0, 1, 0);
    }
  } else if (m.type === 'sentinel') {
    const fwd = [Math.sin(m.yaw), Math.cos(m.yaw)];
    const vf = m.vx * fwd[0] + m.vz * fwd[1], vs = m.vx * fwd[1] - m.vz * fwd[0];
    const by = m.y + 0.45 + Math.sin(t * 2.4 + m.id) * 0.06;
    const body = root(m.x, by, m.z, m.yaw, clamp(vf * 0.07, -0.35, 0.35), clamp(-vs * 0.06, -0.3, 0.3));
    const shotGlow = m.cd > 1.85 ? 1 : 0;
    // octagonal hull from two rotated prisms
    P.p(body, [0, 0, 0], [0.5, 0.36, 0.5], P.c(0.62, 0.66, 0.72));
    P.p(child(body, [0, 0, 0], rotY(Math.PI / 4)), [0, 0, 0], [0.5, 0.36, 0.5], P.c(0.58, 0.62, 0.69));
    P.p(body, [0, 0.21, 0], [0.34, 0.07, 0.34], P.c(...(PAL.steelD as [number, number, number])));
    P.p(body, [0, -0.2, 0], [0.38, 0.07, 0.38], P.c(...(PAL.steelD as [number, number, number])));
    P.p(body, [0, 0.0, 0], [0.56, 0.05, 0.56], P.c(0.9, 0.72, 0.1), 0, 1, 0);
    P.g(body, [0, -0.26, 0], [0.22, 0.04, 0.22], P.c(...(PAL.cyan as [number, number, number])), 1.6, 0.55 + 0.3 * Math.sin(t * 9 + m.id));
    // eye
    P.p(body, [0, 0.03, 0.26], [0.32, 0.3, 0.06], P.c(0.1, 0.11, 0.14));
    P.g(body, [0, 0.03, 0.3], [0.2, 0.2, 0.04], P.c(1, 0.12 + 0.2 * shotGlow, 0.08), 1.9 + shotGlow);
    P.g(body, [0, 0.03, 0.33], [0.07, 0.07, 0.02], [1, 0.9, 0.8], 2.4);
    // gun
    P.p(body, [0, -0.17, 0.3], [0.08, 0.08, 0.3], P.c(0.22, 0.24, 0.28));
    P.p(body, [0, -0.17, 0.47], [0.11, 0.11, 0.05], P.c(0.1, 0.1, 0.12));
    if (shotGlow) P.g(body, [0, -0.17, 0.52], [0.09, 0.09, 0.05], [1, 0.35, 0.2], 2.4);
    // side fins + antenna
    for (const sx of [-1, 1]) P.p(body, [sx * 0.3, 0.02, -0.06], [0.05, 0.22, 0.3], P.c(0.45, 0.48, 0.55));
    const ant = child(body, [0, 0.2, -0.16], rotX(-0.25));
    P.p(ant, [0, 0.15, 0], [0.025, 0.3, 0.025], P.c(0.6, 0.6, 0.64));
    P.g(ant, [0, 0.32, 0], [0.05, 0.05, 0.05], P.c(1, 0.2, 0.15), 2 * blink + 0.1);
    // four rotor arms with spinning blades
    for (let k = 0; k < 4; k++) {
      const arm = child(body, [0, 0.05, 0], rotY(Math.PI / 4 + k * Math.PI / 2));
      P.p(arm, [0, 0, 0.33], [0.06, 0.05, 0.4], P.c(0.34, 0.37, 0.42));
      P.p(arm, [0, 0.04, 0.55], [0.14, 0.09, 0.14], P.c(0.16, 0.17, 0.2));
      const rotor = child(arm, [0, 0.11, 0.55], rotY(t * 38 * (k % 2 ? 1 : -1) + k));
      P.g(rotor, [0, 0, 0], [0.62, 0.012, 0.07], [0.75, 0.8, 0.88], 0.1, 0.55);
      P.g(rotor, [0, 0, 0], [0.07, 0.012, 0.62], [0.75, 0.8, 0.88], 0.1, 0.55);
      a.quad(arm.o[0] + apply(arm.R, [0, 0.11, 0.55])[0], arm.o[1] + apply(arm.R, [0, 0.11, 0.55])[1], arm.o[2] + apply(arm.R, [0, 0.11, 0.55])[2], 0.3, 0, 0, 0, 0, 0.3, [0.8, 0.85, 0.95], 0.12, 0);
    }
  } else {
    // ===================================================== WARDEN — heavy bipedal enforcer
    const ph = m.anim * 2.1;
    const sw = Math.sin(ph) * 0.62 * mf;
    const bob = Math.abs(Math.sin(ph)) * 0.06 * mf;
    const atk = clamp((m.cd - 0.55) / 0.55, 0, 1);       // 1 right after swinging
    const core = 0.75 + 0.25 * Math.sin(t * 3 + m.id);
    const body = root(m.x, m.y, m.z, m.yaw);
    // legs
    for (const s of [-1, 1]) {
      const sg = sw * s * -1;
      const hip = child(body, [s * 0.25, 1.02 + bob * 0.5, 0], rotX(sg));
      P.p(hip, [0, -0.28, 0], [0.27, 0.6, 0.3], P.c(...(PAL.blue as [number, number, number])));
      P.p(hip, [0, 0, 0], [0.31, 0.2, 0.34], P.c(...(PAL.steelD as [number, number, number])));
      const knee = child(hip, [0, -0.58, 0], rotX(Math.max(0, -sg) * 0.9 + 0.08));
      P.p(knee, [0, 0, 0.13], [0.2, 0.22, 0.1], P.c(...(PAL.steel as [number, number, number])));
      P.p(knee, [0, -0.28, 0.0], [0.23, 0.58, 0.27], P.c(...(PAL.blueD as [number, number, number])));
      P.p(knee, [0, -0.2, 0.15], [0.24, 0.07, 0.02], P.c(...(PAL.hazard as [number, number, number])), 0, 1, 0);
      P.p(knee, [0, -0.2, 0.17], [0.24, 0.07, 0.02], P.c(0.1, 0.1, 0.1), 0, 1, 0);
      const foot = child(knee, [0, -0.58, 0], rotX(-sg * 0.35 - 0.05));
      P.p(foot, [0, -0.04, 0.1], [0.3, 0.14, 0.5], P.c(...(PAL.dark as [number, number, number])));
      P.p(foot, [0, 0.03, 0.08], [0.26, 0.06, 0.2], P.c(...(PAL.steel as [number, number, number])));
    }
    // pelvis
    P.p(child(body, [0, 1.06 + bob, 0]), [0, 0, 0], [0.72, 0.24, 0.46], P.c(...(PAL.steelD as [number, number, number])));
    // torso
    const torso = child(body, [0, 1.18 + bob, 0], mul(rotY(Math.sin(ph) * 0.1 * mf), rotX(0.06 * mf + atk * 0.12)));
    P.p(torso, [0, 0.02, 0], [0.58, 0.26, 0.42], P.c(0.16, 0.18, 0.22));
    P.p(torso, [0, 0.5, 0], [0.98, 0.78, 0.56], P.c(...(PAL.blue as [number, number, number])));
    P.p(torso, [0, 0.58, 0.31], [0.84, 0.52, 0.08], P.c(...(PAL.blueL as [number, number, number])));
    P.p(torso, [0, 0.9, 0.2], [0.9, 0.1, 0.4], P.c(...(PAL.steel as [number, number, number])));
    for (let i = 0; i < 3; i++) P.p(torso, [0, 0.27 + i * 0.08, 0.34], [0.62, 0.035, 0.03], P.c(0.08, 0.09, 0.11), 0, 1, 0);
    // reactor
    P.p(torso, [0, 0.6, 0.35], [0.36, 0.36, 0.05], P.c(0.1, 0.11, 0.14), 0, 1, 0);
    P.g(torso, [0, 0.6, 0.385], [0.24, 0.24, 0.04], [0.25 * core, 0.9 * core, 1 * core], 1.8);
    P.g(torso, [0, 0.6, 0.4], [0.1, 0.1, 0.03], [0.9, 1, 1], 2.4);
    // back pack + exhaust
    P.p(torso, [0, 0.52, -0.42], [0.64, 0.72, 0.28], P.c(...(PAL.dark as [number, number, number])));
    for (const s of [-1, 1]) {
      P.p(torso, [s * 0.2, 1.02, -0.42], [0.11, 0.34, 0.11], P.c(...(PAL.steel as [number, number, number])));
      P.g(torso, [s * 0.2, 1.2, -0.42], [0.08, 0.04, 0.08], [1, 0.5, 0.2], 1.2 * blink + 0.4);
    }
    // head
    const head = child(torso, [0, 1.12, 0.02], rotY(Math.sin(t * 0.8 + m.id) * 0.12));
    P.p(head, [0, -0.13, 0], [0.22, 0.1, 0.22], P.c(...(PAL.dark as [number, number, number])));
    P.p(head, [0, 0.05, 0.02], [0.5, 0.36, 0.46], P.c(0.55, 0.58, 0.65));
    P.p(head, [0, 0.26, 0.0], [0.44, 0.06, 0.4], P.c(...(PAL.steelD as [number, number, number])));
    P.p(head, [0, 0.14, 0.24], [0.46, 0.07, 0.1], P.c(...(PAL.dark as [number, number, number])));
    P.g(head, [0, 0.06, 0.255], [0.38, 0.1, 0.04], P.c(...(PAL.red as [number, number, number])), 2);
    P.p(head, [0, -0.08, 0.24], [0.3, 0.1, 0.06], P.c(0.2, 0.22, 0.26));
    for (const s of [-1, 1]) {
      P.p(head, [s * 0.27, 0.05, 0], [0.06, 0.2, 0.2], P.c(0.3, 0.32, 0.38));
      P.p(head, [s * 0.15, 0.4, -0.06], [0.03, 0.26, 0.03], P.c(0.6, 0.6, 0.64));
      P.g(head, [s * 0.15, 0.54, -0.06], [0.05, 0.05, 0.05], P.c(1, 0.2, 0.15), 1.8 * blink + 0.1);
    }
    // arms — right arm swings down in a slam when attacking
    for (const s of [-1, 1]) {
      const shoulder = child(torso, [s * 0.66, 0.84, 0], mul(rotX(s > 0 ? sw * 0.8 * -1 - atk * 2.0 : sw * 0.8), rotZ(s * 0.06)));
      P.p(shoulder, [0, 0.02, 0], [0.38, 0.3, 0.52], P.c(...(PAL.blueL as [number, number, number])));
      P.p(shoulder, [0, 0.19, 0], [0.34, 0.03, 0.44], P.c(...(PAL.hazard as [number, number, number])), 0, 1, 0);
      P.p(shoulder, [0, -0.35, 0], [0.24, 0.6, 0.27], P.c(...(PAL.blueD as [number, number, number])));
      const elbow = child(shoulder, [0, -0.66, 0], rotX(-0.35 - (s > 0 ? atk * 0.6 : 0.12 * mf)));
      P.p(elbow, [0, 0, 0], [0.2, 0.2, 0.2], P.c(...(PAL.steel as [number, number, number])));
      P.p(elbow, [0, -0.32, 0.03], [0.3, 0.6, 0.32], P.c(...(PAL.blue as [number, number, number])));
      P.p(elbow, [0, -0.2, 0.19], [0.3, 0.07, 0.02], P.c(...(PAL.hazard as [number, number, number])), 0, 1, 0);
      P.p(elbow, [0, -0.72, 0.05], [0.36, 0.3, 0.38], P.c(...(PAL.dark as [number, number, number])));
      P.p(elbow, [0, -0.72, 0.26], [0.26, 0.2, 0.06], P.c(0.3, 0.32, 0.37));
      if (s > 0) P.g(elbow, [0, -0.72, 0.3], [0.14, 0.1, 0.03], [1, 0.5, 0.2], 1.1 + atk * 1.5);
    }
  }
  // ---- health bar when damaged
  if (m.hp < hpMax && m.hp > 0) {
    const frac = clamp(m.hp / hpMax, 0, 1), w = m.type === 'warden' ? 0.7 : 0.45;
    const cy = m.y + h + (m.type === 'sentinel' ? 0.75 : 0.4);
    let dx = cam[0] - m.x, dy = cam[1] - cy, dz = cam[2] - m.z; const dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
    const fillW = w * frac;
    a.quad(m.x, cy, m.z, right[0] * (w + 0.03), right[1] * (w + 0.03), right[2] * (w + 0.03), up[0] * 0.06, up[1] * 0.06, up[2] * 0.06, [0.02, 0.02, 0.03], 0.78, 0);
    const k = 0.012, ox = -(w - fillW);
    a.quad(m.x + dx * k + right[0] * ox, cy + dy * k + right[1] * ox, m.z + dz * k + right[2] * ox, right[0] * fillW, right[1] * fillW, right[2] * fillW, up[0] * 0.04, up[1] * 0.04, up[2] * 0.04, frac > 0.5 ? [0.35, 1, 0.45] : frac > 0.25 ? [1, 0.8, 0.2] : [1, 0.25, 0.2], 0.95, 0.5);
  }
}

/** Third-person player avatar (jointed). */
export function drawAvatar(o: Dyn, x: number, y: number, z: number, yaw: number, pitch: number, L: number, walkPhase: number, moveF: number, swing: number, pack: boolean, sneak: boolean) {
  const P = new Painter(o, L, 0);
  const sw = Math.sin(walkPhase * 1.4) * 0.75 * moveF;
  const crouch = sneak ? 0.18 : 0;
  const body = root(x, y - crouch * 0.4, z, yaw + Math.PI);
  const suit = P.c(0.14, 0.5, 0.6), suitD = P.c(0.1, 0.36, 0.44), pant = P.c(0.18, 0.2, 0.26), skin = P.c(0.88, 0.7, 0.56), glove = P.c(0.15, 0.16, 0.2);
  // legs
  for (const s of [-1, 1]) {
    const hip = child(body, [s * 0.14, 0.76, 0], rotX(sw * s));
    P.p(hip, [0, -0.19, 0], [0.22, 0.4, 0.24], pant);
    const knee = child(hip, [0, -0.38, 0], rotX(Math.max(0, -sw * s) * 0.9 + crouch));
    P.p(knee, [0, -0.17, 0], [0.2, 0.36, 0.22], P.c(0.22, 0.24, 0.3));
    P.p(knee, [0, -0.38, 0.05], [0.22, 0.1, 0.32], glove);
    P.p(knee, [0, 0, 0.1], [0.18, 0.1, 0.06], P.c(0.4, 0.42, 0.48));
  }
  const tor = child(body, [0, 0.76, 0], rotX(crouch * 1.6));
  P.p(tor, [0, 0.3, 0], [0.5, 0.62, 0.28], suit);
  P.p(tor, [0, 0.12, 0.145], [0.52, 0.06, 0.02], P.c(0.95, 0.72, 0.1), 0, 1, 0);
  P.p(tor, [0, 0.02, 0], [0.52, 0.12, 0.3], P.c(0.1, 0.11, 0.14));
  P.g(tor, [0, 0.42, 0.145], [0.12, 0.12, 0.02], [0.3, 0.9, 1], 1.4);
  P.p(tor, [0, 0.58, 0], [0.54, 0.08, 0.3], suitD);
  if (pack) { P.p(tor, [0, 0.32, -0.24], [0.4, 0.5, 0.2], P.c(0.28, 0.3, 0.34)); P.g(tor, [0, 0.1, -0.35], [0.28, 0.05, 0.02], [1, 0.6, 0.2], 1); }
  // arms
  for (const s of [-1, 1]) {
    const act = s > 0 ? -swing * 1.6 : 0;
    const sh = child(tor, [s * 0.36, 0.55, 0], rotX(-sw * s * 0.9 + act));
    P.p(sh, [0, -0.02, 0], [0.18, 0.16, 0.2], suitD);
    P.p(sh, [0, -0.2, 0], [0.16, 0.4, 0.18], suit);
    const el = child(sh, [0, -0.38, 0], rotX(-0.25 - (s > 0 ? swing * 0.4 : 0)));
    P.p(el, [0, -0.17, 0], [0.15, 0.34, 0.16], suit);
    P.p(el, [0, -0.38, 0], [0.16, 0.12, 0.17], glove);
  }
  // head
  const head = child(tor, [0, 0.64, 0], rotX(clamp(-pitch, -0.7, 0.7) * 0.7));
  P.p(head, [0, 0.0, 0], [0.12, 0.08, 0.12], skin);
  P.p(head, [0, 0.2, 0], [0.34, 0.34, 0.34], skin);
  P.p(head, [0, 0.33, -0.01], [0.36, 0.1, 0.36], P.c(0.16, 0.17, 0.22));
  P.p(head, [0, 0.2, 0.15], [0.36, 0.14, 0.08], P.c(0.08, 0.1, 0.14));
  P.g(head, [0, 0.2, 0.195], [0.3, 0.09, 0.02], [0.3, 0.9, 1], 1.3);
  P.p(head, [0, 0.2, -0.18], [0.36, 0.3, 0.06], P.c(0.16, 0.17, 0.22));
}
