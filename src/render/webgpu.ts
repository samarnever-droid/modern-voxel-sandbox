/// <reference types="@webgpu/types" />
import { mat4, frustumPlanes, aabbInFrustum, Mat4 } from '../engine/math';
import type { Atlas } from '../engine/registry';
import type { ChunkMeshData } from '../world/mesher';
import { FrameParams, Quality, Renderer, RenderStats, DYN_STRIDE } from './types';
import { COMMON, TERRAIN, SHADOW, SKY, DYN, BLOOM, POST } from './shaders';

interface GPUChunk { vb?: GPUBuffer; ib?: GPUBuffer; n: number; tvb?: GPUBuffer; tib?: GPUBuffer; tn: number; x0: number; z0: number; minY: number; maxY: number; tminY: number; tmaxY: number }
const GLOBALS_FLOATS = 16 * 4 + 4 * 12; // 4 matrices + 12 vec4

export class WebGPURenderer implements Renderer {
  backend = 'webgpu' as const;
  onLost?: (r: string) => void;
  dev!: GPUDevice; ctx!: GPUCanvasContext; format!: GPUTextureFormat;
  q!: Quality; w = 1; h = 1; canvas!: HTMLCanvasElement;
  chunks = new Map<number, GPUChunk>();
  gbuf!: GPUBuffer; gdata = new Float32Array(GLOBALS_FLOATS);
  matBuf!: GPUBuffer; atlasTex!: GPUTexture; sampler!: GPUSampler; shSampler!: GPUSampler;
  shadowTex!: GPUTexture; shadowViews: GPUTextureView[] = []; shadowU: GPUBuffer[] = []; shadowBG: GPUBindGroup[] = [];
  mainBGL!: GPUBindGroupLayout; mainBG!: GPUBindGroup; shadowBGL!: GPUBindGroupLayout;
  pOpaque!: GPURenderPipeline; pTrans!: GPURenderPipeline; pShadow!: GPURenderPipeline; pSky!: GPURenderPipeline; pDynO!: GPURenderPipeline; pDynA!: GPURenderPipeline;
  pBright!: GPURenderPipeline; pBlur!: GPURenderPipeline; pPost!: GPURenderPipeline; bloomBGL!: GPUBindGroupLayout; postBGL!: GPUBindGroupLayout;
  hdr?: GPUTexture; depth?: GPUTexture; bloomA?: GPUTexture; bloomB?: GPUTexture;
  bloomBG: GPUBindGroup[] = []; postBG?: GPUBindGroup; bloomU: GPUBuffer[] = [];
  linSampler!: GPUSampler;
  dynOBuf!: GPUBuffer; dynABuf!: GPUBuffer;
  lvp0 = mat4.create(); lvp1 = mat4.create(); planes = new Float32Array(24);
  disposed = false;

  async init(canvas: HTMLCanvasElement, atlas: Atlas, q: Quality) {
    this.canvas = canvas; this.q = q;
    const nav = navigator as any;
    if (!nav.gpu) throw new Error('WebGPU not available');
    const adapter: GPUAdapter | null = await nav.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter');
    const dev = await adapter.requestDevice();
    this.dev = dev;
    dev.lost.then((i) => { if (!this.disposed) this.onLost?.('GPU device lost: ' + i.message); });
    const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!ctx) throw new Error('Cannot create WebGPU context');
    this.ctx = ctx;
    this.format = nav.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: dev, format: this.format, alphaMode: 'opaque' });
    dev.pushErrorScope('validation');
    this.createStatic(atlas);
    this.createShadow();
    await this.createPipelines();
    const err = await dev.popErrorScope();
    if (err) throw new Error('WebGPU validation error: ' + err.message);
  }

  private createStatic(atlas: Atlas) {
    const d = this.dev;
    this.gbuf = d.createBuffer({ size: GLOBALS_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.matBuf = d.createBuffer({ size: 1024 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(this.matBuf, 0, atlas.materials as Float32Array<ArrayBuffer>);
    this.atlasTex = d.createTexture({ size: [32, 32, atlas.layers], format: 'rgba8unorm', mipLevelCount: atlas.mips.length, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    atlas.mips.forEach((m, i) => d.queue.writeTexture({ texture: this.atlasTex, mipLevel: i }, m.data as Uint8Array<ArrayBuffer>, { bytesPerRow: m.size * 4, rowsPerImage: m.size }, [m.size, m.size, atlas.layers]));
    this.sampler = d.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'nearest', minFilter: 'linear', mipmapFilter: 'linear' });
    this.linSampler = d.createSampler({ addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge', magFilter: 'linear', minFilter: 'linear' });
    this.shSampler = d.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
    const dynSize = 60000 * DYN_STRIDE * 4;
    this.dynOBuf = d.createBuffer({ size: dynSize, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.dynABuf = d.createBuffer({ size: dynSize, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    for (let i = 0; i < 2; i++) this.shadowU.push(d.createBuffer({ size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    for (let i = 0; i < 2; i++) this.bloomU.push(d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
  }

  private createShadow() {
    const d = this.dev;
    this.shadowTex?.destroy();
    const res = this.q.shadows ? this.q.shadowRes : 4;
    this.shadowTex = d.createTexture({ size: [res, res, 2], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.shadowViews = [0, 1].map((i) => this.shadowTex.createView({ dimension: '2d', baseArrayLayer: i, arrayLayerCount: 1 }));
    if (this.shadowBGL) {
      this.shadowBG = [0, 1].map((i) => d.createBindGroup({ layout: this.shadowBGL, entries: [{ binding: 0, resource: { buffer: this.shadowU[i] } }] }));
      this.makeMainBG();
      this.makePostBG();
    }
  }
  private makeMainBG() {
    this.mainBG = this.dev.createBindGroup({
      layout: this.mainBGL,
      entries: [
        { binding: 0, resource: { buffer: this.gbuf } }, { binding: 1, resource: { buffer: this.matBuf } },
        { binding: 2, resource: this.atlasTex.createView({ dimension: '2d-array' }) }, { binding: 3, resource: this.sampler },
        { binding: 4, resource: this.shadowTex.createView({ dimension: '2d-array' }) }, { binding: 5, resource: this.shSampler },
      ],
    });
  }

  private async createPipelines() {
    const d = this.dev, F = GPUShaderStage.FRAGMENT, V = GPUShaderStage.VERTEX;
    const mod = async (code: string, label: string) => {
      const m = d.createShaderModule({ code, label });
      const info = await m.getCompilationInfo();
      const errs = info.messages.filter((x) => x.type === 'error');
      if (errs.length) throw new Error(`WGSL ${label}: ` + errs.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join('; '));
      return m;
    };
    const mTerrain = await mod(COMMON + TERRAIN, 'terrain');
    const mShadow = await mod(SHADOW, 'shadow');
    const mSky = await mod(COMMON + SKY, 'sky');
    const mDyn = await mod(COMMON + DYN, 'dyn');
    const mBloom = await mod(BLOOM, 'bloom');
    const mPost = await mod(COMMON + POST, 'post');
    this.mainBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: V | F, buffer: { type: 'uniform' } }, { binding: 1, visibility: V | F, buffer: { type: 'uniform' } },
        { binding: 2, visibility: F, texture: { viewDimension: '2d-array' } }, { binding: 3, visibility: F, sampler: { type: 'filtering' } },
        { binding: 4, visibility: F, texture: { viewDimension: '2d-array', sampleType: 'depth' } }, { binding: 5, visibility: F, sampler: { type: 'comparison' } },
      ],
    });
    this.shadowBGL = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: V, buffer: { type: 'uniform' } }] });
    this.shadowBG = [0, 1].map((i) => d.createBindGroup({ layout: this.shadowBGL, entries: [{ binding: 0, resource: { buffer: this.shadowU[i] } }] }));
    this.makeMainBG();
    const mainLayout = d.createPipelineLayout({ bindGroupLayouts: [this.mainBGL] });
    const terrainBuf: GPUVertexBufferLayout = { arrayStride: 32, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }, { shaderLocation: 1, offset: 16, format: 'float32x4' }] };
    const depthState = (write: boolean, cmp: GPUCompareFunction = 'less'): GPUDepthStencilState => ({ format: 'depth32float', depthWriteEnabled: write, depthCompare: cmp });
    const blend: GPUBlendState = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } };
    const prim: GPUPrimitiveState = { topology: 'triangle-list', cullMode: 'none' };
    this.pOpaque = d.createRenderPipeline({ layout: mainLayout, vertex: { module: mTerrain, entryPoint: 'vs', buffers: [terrainBuf] }, fragment: { module: mTerrain, entryPoint: 'fs_opaque', targets: [{ format: 'rgba16float' }] }, primitive: prim, depthStencil: depthState(true) });
    this.pTrans = d.createRenderPipeline({ layout: mainLayout, vertex: { module: mTerrain, entryPoint: 'vs', buffers: [terrainBuf] }, fragment: { module: mTerrain, entryPoint: 'fs_trans', targets: [{ format: 'rgba16float', blend }] }, primitive: prim, depthStencil: depthState(false) });
    this.pShadow = d.createRenderPipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [this.shadowBGL] }), vertex: { module: mShadow, entryPoint: 'vs', buffers: [terrainBuf] }, primitive: prim, depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2.5 } });
    this.pSky = d.createRenderPipeline({ layout: mainLayout, vertex: { module: mSky, entryPoint: 'vs_sky' }, fragment: { module: mSky, entryPoint: 'fs_sky', targets: [{ format: 'rgba16float' }] }, primitive: prim, depthStencil: depthState(false, 'always') });
    const dynBuf: GPUVertexBufferLayout = { arrayStride: DYN_STRIDE * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }, { shaderLocation: 2, offset: 24, format: 'float32x4' }, { shaderLocation: 3, offset: 40, format: 'float32x2' }] };
    this.pDynO = d.createRenderPipeline({ layout: mainLayout, vertex: { module: mDyn, entryPoint: 'vs_dyn', buffers: [dynBuf] }, fragment: { module: mDyn, entryPoint: 'fs_dyn', targets: [{ format: 'rgba16float' }] }, primitive: prim, depthStencil: depthState(true) });
    this.pDynA = d.createRenderPipeline({ layout: mainLayout, vertex: { module: mDyn, entryPoint: 'vs_dyn', buffers: [dynBuf] }, fragment: { module: mDyn, entryPoint: 'fs_dyn', targets: [{ format: 'rgba16float', blend }] }, primitive: prim, depthStencil: depthState(false) });
    this.bloomBGL = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: F, texture: {} }, { binding: 1, visibility: F, sampler: { type: 'filtering' } }, { binding: 2, visibility: F, buffer: { type: 'uniform' } }] });
    const bl = d.createPipelineLayout({ bindGroupLayouts: [this.bloomBGL] });
    this.pBright = d.createRenderPipeline({ layout: bl, vertex: { module: mBloom, entryPoint: 'vs_full' }, fragment: { module: mBloom, entryPoint: 'fs_bright', targets: [{ format: 'rgba16float' }] }, primitive: prim });
    this.pBlur = d.createRenderPipeline({ layout: bl, vertex: { module: mBloom, entryPoint: 'vs_full' }, fragment: { module: mBloom, entryPoint: 'fs_blur', targets: [{ format: 'rgba16float' }] }, primitive: prim });
    this.postBGL = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F, buffer: { type: 'uniform' } }, { binding: 1, visibility: F, texture: {} }, { binding: 2, visibility: F, texture: {} },
        { binding: 3, visibility: F, sampler: { type: 'filtering' } }, { binding: 4, visibility: F, texture: { sampleType: 'depth' } },
        { binding: 5, visibility: F, texture: { viewDimension: '2d-array', sampleType: 'depth' } }, { binding: 6, visibility: F, sampler: { type: 'comparison' } },
      ],
    });
    this.pPost = d.createRenderPipeline({ layout: d.createPipelineLayout({ bindGroupLayouts: [this.postBGL] }), vertex: { module: mPost, entryPoint: 'vs_full' }, fragment: { module: mPost, entryPoint: 'fs_post', targets: [{ format: this.format }] }, primitive: prim });
  }

  setQuality(q: Quality) {
    this.q = q;
    this.createShadow();
    this.resize(this.canvas.clientWidth || this.w, this.canvas.clientHeight || this.h);
  }

  resize(cw: number, ch: number) {
    const w = Math.max(2, Math.floor(cw * this.q.scale * Math.min(window.devicePixelRatio || 1, 2) / (this.q.scale < 1 ? 1 : 1))), h = Math.max(2, Math.floor(ch * this.q.scale * Math.min(window.devicePixelRatio || 1, 2)));
    this.canvas.width = w; this.canvas.height = h; this.w = w; this.h = h;
    const d = this.dev;
    this.hdr?.destroy(); this.depth?.destroy(); this.bloomA?.destroy(); this.bloomB?.destroy();
    const U = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING;
    this.hdr = d.createTexture({ size: [w, h], format: 'rgba16float', usage: U });
    this.depth = d.createTexture({ size: [w, h], format: 'depth32float', usage: U });
    const bw = Math.max(2, w >> 1), bh = Math.max(2, h >> 1);
    this.bloomA = d.createTexture({ size: [bw, bh], format: 'rgba16float', usage: U });
    this.bloomB = d.createTexture({ size: [bw, bh], format: 'rgba16float', usage: U });
    const mk = (tex: GPUTexture, u: GPUBuffer) => d.createBindGroup({ layout: this.bloomBGL, entries: [{ binding: 0, resource: tex.createView() }, { binding: 1, resource: this.linSampler }, { binding: 2, resource: { buffer: u } }] });
    // bloomBG[0]: hdr->A (bright), [1]: A->B (H), [2]: B->A (V)
    d.queue.writeBuffer(this.bloomU[0], 0, new Float32Array([1 / w, 1 / h, 1.1, 0]));
    d.queue.writeBuffer(this.bloomU[1], 0, new Float32Array([1 / bw, 0, 0, 0]));
    const vU = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(vU, 0, new Float32Array([0, 1 / bh, 0, 0]));
    this.bloomBG = [mk(this.hdr, this.bloomU[0]), mk(this.bloomA, this.bloomU[1]), mk(this.bloomB, vU)];
    this.makePostBG();
  }
  private makePostBG() {
    if (!this.hdr || !this.bloomA) return;
    this.postBG = this.dev.createBindGroup({
      layout: this.postBGL,
      entries: [
        { binding: 0, resource: { buffer: this.gbuf } }, { binding: 1, resource: this.hdr.createView() }, { binding: 2, resource: this.bloomA.createView() },
        { binding: 3, resource: this.linSampler }, { binding: 4, resource: this.depth!.createView({ aspect: 'depth-only' }) },
        { binding: 5, resource: this.shadowTex.createView({ dimension: '2d-array' }) }, { binding: 6, resource: this.shSampler },
      ],
    });
  }

  setChunk(key: number, cx: number, cz: number, mesh: ChunkMeshData | null) {
    this.removeChunk(key);
    if (!mesh || (!mesh.opaque && !mesh.trans)) return;
    const d = this.dev;
    const c: GPUChunk = { n: 0, tn: 0, x0: cx << 4, z0: cz << 4, minY: 0, maxY: 128, tminY: 0, tmaxY: 128 };
    const up = (v: Float32Array, i: Uint32Array) => {
      const vb = d.createBuffer({ size: v.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      const ib = d.createBuffer({ size: i.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      d.queue.writeBuffer(vb, 0, v as Float32Array<ArrayBuffer>); d.queue.writeBuffer(ib, 0, i as Uint32Array<ArrayBuffer>);
      return [vb, ib] as const;
    };
    if (mesh.opaque) { [c.vb, c.ib] = up(mesh.opaque.verts, mesh.opaque.idx); c.n = mesh.opaque.ni; c.minY = mesh.opaque.minY; c.maxY = mesh.opaque.maxY; }
    if (mesh.trans) { [c.tvb, c.tib] = up(mesh.trans.verts, mesh.trans.idx); c.tn = mesh.trans.ni; c.tminY = mesh.trans.minY; c.tmaxY = mesh.trans.maxY; }
    this.chunks.set(key, c);
  }
  removeChunk(key: number) {
    const c = this.chunks.get(key);
    if (!c) return;
    c.vb?.destroy(); c.ib?.destroy(); c.tvb?.destroy(); c.tib?.destroy();
    this.chunks.delete(key);
  }

  private lightMatrix(out: Mat4, f: FrameParams, radius: number, res: number) {
    const L = f.lightDir, c = f.cam;
    const eye: [number, number, number] = [c[0] + L[0] * 160, c[1] + L[1] * 160, c[2] + L[2] * 160];
    const view = mat4.lookAt(mat4.create(), eye, [c[0], c[1], c[2]], Math.abs(L[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0]);
    const proj = mat4.ortho(mat4.create(), -radius, radius, -radius, radius, 1, 340);
    mat4.multiply(out, proj, view);
    const s = res / 2;
    out[12] = Math.round(out[12] * s) / s; out[13] = Math.round(out[13] * s) / s;
  }

  render(f: FrameParams): RenderStats {
    const d = this.dev, q = this.q;
    if (!this.hdr || !this.depth || !this.postBG) return { chunks: 0, tris: 0, backend: 'webgpu' };
    const gd = this.gdata;
    const shadowMode = q.shadows;
    if (shadowMode >= 1) {
      this.lightMatrix(this.lvp0, f, shadowMode === 2 ? 30 : 64, q.shadowRes);
      if (shadowMode === 2) this.lightMatrix(this.lvp1, f, 110, q.shadowRes);
    }
    gd.set(f.viewProj, 0); gd.set(this.lvp0, 16); gd.set(this.lvp1, 32); gd.set(f.invViewProj, 48);
    let o = 64;
    const v4 = (a: number, b: number, c: number, e: number) => { gd[o++] = a; gd[o++] = b; gd[o++] = c; gd[o++] = e; };
    v4(f.cam[0], f.cam[1], f.cam[2], f.time);
    v4(f.sunDir[0], f.sunDir[1], f.sunDir[2], 0);
    v4(f.lightDir[0], f.lightDir[1], f.lightDir[2], 0);
    v4(f.sunColor[0], f.sunColor[1], f.sunColor[2], 0);
    v4(f.fogColor[0], f.fogColor[1], f.fogColor[2], f.fogDensity);
    v4(f.ambTop[0], f.ambTop[1], f.ambTop[2], 0);
    v4(f.ambBot[0], f.ambBot[1], f.ambBot[2], 0);
    v4(f.rain, f.underwater, f.cloud, shadowMode);
    v4(shadowMode === 2 ? 26 : 0, f.nightVision, f.hurt, f.sunset);
    v4(f.day, f.exposure, f.wind, 0);
    v4(1 / q.shadowRes, q.volumetric && shadowMode ? 1 : 0, 0, q.bloom ? 0.32 : 0);
    v4(this.w, this.h, 1 / this.w, 1 / this.h);
    d.queue.writeBuffer(this.gbuf, 0, gd as Float32Array<ArrayBuffer>);
    d.queue.writeBuffer(this.shadowU[0], 0, this.lvp0 as Float32Array<ArrayBuffer>);
    d.queue.writeBuffer(this.shadowU[1], 0, this.lvp1 as Float32Array<ArrayBuffer>);
    if (f.dynOn) d.queue.writeBuffer(this.dynOBuf, 0, f.dynO as Float32Array<ArrayBuffer>, 0, Math.min(f.dynOn, 60000) * DYN_STRIDE);
    if (f.dynAn) d.queue.writeBuffer(this.dynABuf, 0, f.dynA as Float32Array<ArrayBuffer>, 0, Math.min(f.dynAn, 60000) * DYN_STRIDE);

    const enc = d.createCommandEncoder();
    let tris = 0;
    // visible lists
    frustumPlanes(f.viewProj, this.planes);
    const vis: GPUChunk[] = [];
    for (const c of this.chunks.values()) {
      const lo = Math.min(c.minY, c.tminY), hi = Math.max(c.maxY, c.tmaxY);
      if (aabbInFrustum(this.planes, c.x0, lo, c.z0, c.x0 + 16, hi + 1, c.z0 + 16)) vis.push(c);
    }
    // shadow passes
    if (shadowMode >= 1) {
      const cascades = shadowMode === 2 ? 2 : 1;
      const sp = new Float32Array(24);
      for (let k = 0; k < cascades; k++) {
        frustumPlanes(k === 0 ? this.lvp0 : this.lvp1, sp);
        const pass = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadowViews[k], depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
        pass.setPipeline(this.pShadow); pass.setBindGroup(0, this.shadowBG[k]);
        for (const c of this.chunks.values()) {
          if (!c.vb || !aabbInFrustum(sp, c.x0, c.minY, c.z0, c.x0 + 16, c.maxY + 1, c.z0 + 16)) continue;
          pass.setVertexBuffer(0, c.vb); pass.setIndexBuffer(c.ib!, 'uint32'); pass.drawIndexed(c.n);
        }
        pass.end();
      }
    }
    // main pass
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.hdr.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: this.depth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    });
    pass.setBindGroup(0, this.mainBG);
    pass.setPipeline(this.pSky); pass.draw(3);
    pass.setPipeline(this.pOpaque);
    for (const c of vis) { if (!c.vb) continue; pass.setVertexBuffer(0, c.vb); pass.setIndexBuffer(c.ib!, 'uint32'); pass.drawIndexed(c.n); tris += c.n / 3; }
    if (f.dynOn) { pass.setPipeline(this.pDynO); pass.setVertexBuffer(0, this.dynOBuf); pass.draw(Math.min(f.dynOn, 60000)); }
    const cx = f.cam[0], cz = f.cam[2];
    const tv = vis.filter((c) => c.tvb).sort((a, b) => ((b.x0 + 8 - cx) ** 2 + (b.z0 + 8 - cz) ** 2) - ((a.x0 + 8 - cx) ** 2 + (a.z0 + 8 - cz) ** 2));
    pass.setPipeline(this.pTrans);
    for (const c of tv) { pass.setVertexBuffer(0, c.tvb!); pass.setIndexBuffer(c.tib!, 'uint32'); pass.drawIndexed(c.tn); tris += c.tn / 3; }
    if (f.dynAn) { pass.setPipeline(this.pDynA); pass.setVertexBuffer(0, this.dynABuf); pass.draw(Math.min(f.dynAn, 60000)); }
    pass.end();
    // bloom
    const bloomRun = (target: GPUTexture, bg: GPUBindGroup, p: GPURenderPipeline) => {
      const bp = enc.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      bp.setPipeline(p); bp.setBindGroup(0, bg); bp.draw(3); bp.end();
    };
    if (q.bloom) {
      bloomRun(this.bloomA!, this.bloomBG[0], this.pBright);
      bloomRun(this.bloomB!, this.bloomBG[1], this.pBlur);
      bloomRun(this.bloomA!, this.bloomBG[2], this.pBlur);
      bloomRun(this.bloomB!, this.bloomBG[1], this.pBlur);
      bloomRun(this.bloomA!, this.bloomBG[2], this.pBlur);
    }
    const post = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    post.setPipeline(this.pPost); post.setBindGroup(0, this.postBG); post.draw(3); post.end();
    d.queue.submit([enc.finish()]);
    return { chunks: vis.length, tris, backend: 'webgpu' };
  }

  /** Renders one synthetic frame under a validation scope so any shader/bind-group mistake triggers the WebGL2 fallback. */
  async selfTest() {
    const d = this.dev; d.pushErrorScope('validation');
    const I = mat4.create();
    const f: FrameParams = { view: I, proj: I, viewProj: I, invViewProj: I, cam: [0, 60, 0], time: 0, sunDir: [0.3, 0.8, 0.3], lightDir: [0.3, 0.8, 0.3], sunColor: [1, 1, 1], fogColor: [0.5, 0.5, 0.5], fogDensity: 0.01, ambTop: [0.5, 0.5, 0.5], ambBot: [0.2, 0.2, 0.2], rain: 0, underwater: 0, cloud: 0.3, day: 1, sunset: 0, wind: 0.1, nightVision: 0, hurt: 0, exposure: 1, dynO: new Float32Array(36 * DYN_STRIDE), dynOn: 3, dynA: new Float32Array(36 * DYN_STRIDE), dynAn: 3 };
    this.render(f);
    await d.queue.onSubmittedWorkDone();
    const err = await d.popErrorScope();
    if (err) throw new Error('WebGPU self-test failed: ' + err.message);
  }

  dispose() {
    this.disposed = true;
    for (const k of [...this.chunks.keys()]) this.removeChunk(k);
    try { this.dev.destroy(); } catch { /* ignore */ }
  }
}
