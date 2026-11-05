import { Reg, Atlas } from '../engine/registry';
import { paintTexture, TS } from '../engine/textures';

let ATLAS: Atlas | null = null;
export const setIconAtlas = (a: Atlas) => { ATLAS = a; cache.clear(); };
const cache = new Map<string, string>();

function layerCanvas(data: Uint8ClampedArray): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = TS;
  const g = c.getContext('2d')!; g.putImageData(new ImageData(new Uint8ClampedArray(data), TS, TS), 0, 0);
  return c;
}
export function iconURL(key: string): string {
  const hit = cache.get(key); if (hit) return hit;
  const it = Reg.items.get(key); if (!it || typeof document === 'undefined') return '';
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  if (it.block && ATLAS) {
    const b = it.block;
    const L = (i: number) => layerCanvas(ATLAS!.data[i] ?? ATLAS!.data[0]);
    if (b.shape === 'cross' || b.shape === 'panel' || b.shape === 'ladder' || b.shape === 'carpet') { g.drawImage(L(b.fl[16]), 6, 6, 52, 52); }
    else {
      const top = L(b.fl[8]), right = L(b.fl[0]), left = L(b.fl[16]);
      g.save(); g.setTransform(26 / 32, 13 / 32, -26 / 32, 13 / 32, 32, 3); g.drawImage(top, 0, 0); g.restore();
      g.save(); g.setTransform(26 / 32, -13 / 32, 0, 28 / 32, 32, 30); g.drawImage(right, 0, 0); g.fillStyle = 'rgba(0,0,0,0.34)'; g.fillRect(0, 0, 32, 32); g.restore();
      g.save(); g.setTransform(26 / 32, 13 / 32, 0, 28 / 32, 6, 17); g.drawImage(left, 0, 0); g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(0, 0, 32, 32); g.restore();
    }
  } else if (it.icon) {
    const px = paintTexture(it.icon); g.drawImage(layerCanvas(px), 4, 4, 56, 56);
  }
  const url = c.toDataURL(); cache.set(key, url); return url;
}
