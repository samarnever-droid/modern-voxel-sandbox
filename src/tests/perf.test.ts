import { it, beforeAll } from 'vitest';
import { registerBaseContent } from '../content';
import { setStrictIds } from '../engine/registry';
import { World, Chunk } from '../world/world';
import { Generator } from '../world/gen';
import { meshChunk } from '../world/mesher';

beforeAll(() => { setStrictIds(true); registerBaseContent(); });
it('chunk pipeline timing (informational)', () => {
  const g = new Generator(2024), w = new World(2024, g);
  const sp = g.findSpawn(); const cx0 = sp.x >> 4, cz0 = sp.z >> 4;
  let tg = 0, tl = 0, tm = 0, n = 0, verts = 0, worst = 0;
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) {
    const c = new Chunk(cx0 + dx, cz0 + dz); w.chunks.set((cx0 + dx + 32768) * 65536 + cz0 + dz + 32768, c);
    let t = performance.now(); g.generate(c); tg += performance.now() - t;
    t = performance.now(); w.initLight(c); tl += performance.now() - t; n++;
  }
  for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
    const t = performance.now(); const m = meshChunk(w, w.getChunk(cx0 + dx, cz0 + dz)!, 0); const e = performance.now() - t; tm += e; worst = Math.max(worst, e); verts += (m.opaque?.nv ?? 0);
  }
  console.log(`PERF per chunk: gen ${(tg / n).toFixed(1)}ms light ${(tl / n).toFixed(1)}ms mesh ${(tm / 49).toFixed(1)}ms (worst ${worst.toFixed(1)}) avg verts ${(verts / 49) | 0}`);
});
