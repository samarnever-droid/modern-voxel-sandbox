import { DYN_STRIDE } from '../render/types';

const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5], [.5, -.5, .5]] },
  { n: [-1, 0, 0], c: [[-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5], [-.5, -.5, -.5]] },
  { n: [0, 1, 0], c: [[-.5, .5, -.5], [-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5]] },
  { n: [0, -1, 0], c: [[-.5, -.5, .5], [-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5]] },
  { n: [0, 0, 1], c: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]] },
  { n: [0, 0, -1], c: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]] },
];
export const MAX_DYN = 60000;

/** CPU-built dynamic triangle soup for entities, held items, particles, rain and UI-in-world effects. */
export class Dyn {
  f = new Float32Array(MAX_DYN * DYN_STRIDE);
  n = 0;
  reset() { this.n = 0; }
  private v(x: number, y: number, z: number, nx: number, ny: number, nz: number, r: number, g: number, b: number, a: number, e: number) {
    if (this.n >= MAX_DYN) return;
    const o = this.n * DYN_STRIDE, f = this.f;
    f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = nx; f[o + 4] = ny; f[o + 5] = nz; f[o + 6] = r; f[o + 7] = g; f[o + 8] = b; f[o + 9] = a; f[o + 10] = e; f[o + 11] = 0;
    this.n++;
  }
  /** rotated box: size (sx,sy,sz), rotated by pitch (x) then yaw (y) around its centre */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number, pitch: number, col: number[], a = 1, e = 0, pivotY = 0) {
    if (this.n + 36 > MAX_DYN) return;
    const cy0 = Math.cos(yaw), sy0 = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const tr = (x: number, y: number, z: number): [number, number, number] => {
      const y1 = y * cp - z * sp, z1 = y * sp + z * cp;
      return [x * cy0 + z1 * sy0, y1, -x * sy0 + z1 * cy0];
    };
    for (const F of FACES) {
      const nn = tr(F.n[0], F.n[1], F.n[2]);
      const shade = 0.78 + 0.22 * F.n[1] * 0.5 + (F.n[1] < 0 ? -0.15 : 0);
      const pts = F.c.map((c) => { const p = tr(c[0] * sx, c[1] * sy + pivotY, c[2] * sz); return [cx + p[0], cy + p[1], cz + p[2]]; });
      const r = col[0] * shade, g = col[1] * shade, b = col[2] * shade;
      for (const k of [0, 1, 2, 0, 2, 3]) this.v(pts[k][0], pts[k][1], pts[k][2], nn[0], nn[1], nn[2], r, g, b, a, e);
    }
  }
  quad(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, ux: number, uy: number, uz: number, col: number[], a: number, e: number) {
    const p = [[cx - rx - ux, cy - ry - uy, cz - rz - uz], [cx + rx - ux, cy + ry - uy, cz + rz - uz], [cx + rx + ux, cy + ry + uy, cz + rz + uz], [cx - rx + ux, cy - ry + uy, cz - rz + uz]];
    const nx = ry * uz - rz * uy, ny = rz * ux - rx * uz, nz = rx * uy - ry * ux;
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const k of [0, 1, 2, 0, 2, 3]) this.v(p[k][0], p[k][1], p[k][2], nx / l, ny / l, nz / l, col[0], col[1], col[2], a, e);
  }
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, col: number[], a: number, e: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz) || 1;
    const yaw = Math.atan2(dx, dz), pitch = -Math.asin(dy / len);
    this.box((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, w, len, yaw, pitch, col, a, e);
  }
}
