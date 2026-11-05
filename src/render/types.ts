import type { Mat4 } from '../engine/math';
import type { Atlas } from '../engine/registry';
import type { ChunkMeshData } from '../world/mesher';

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';
export interface Quality {
  name: QualityName;
  shadows: 0 | 1 | 2;     // off, single cascade, two cascades
  shadowRes: number;
  bloom: boolean;
  volumetric: boolean;
  scale: number;          // render resolution scale
  viewDist: number;       // chunks
  lodDist: number;        // chunks beyond this use the simplified mesh
}
export const QUALITY: Record<QualityName, Quality> = {
  low: { name: 'low', shadows: 0, shadowRes: 512, bloom: false, volumetric: false, scale: 0.7, viewDist: 5, lodDist: 3 },
  medium: { name: 'medium', shadows: 1, shadowRes: 1024, bloom: true, volumetric: false, scale: 0.9, viewDist: 7, lodDist: 4 },
  high: { name: 'high', shadows: 1, shadowRes: 2048, bloom: true, volumetric: false, scale: 1, viewDist: 9, lodDist: 6 },
  ultra: { name: 'ultra', shadows: 2, shadowRes: 2048, bloom: true, volumetric: true, scale: 1, viewDist: 12, lodDist: 8 },
};

export interface FrameParams {
  view: Mat4; proj: Mat4; viewProj: Mat4; invViewProj: Mat4;
  cam: [number, number, number];
  time: number;
  sunDir: [number, number, number];     // toward the sun
  lightDir: [number, number, number];   // toward the dominant light
  sunColor: [number, number, number];
  fogColor: [number, number, number]; fogDensity: number;
  ambTop: [number, number, number]; ambBot: [number, number, number];
  rain: number; underwater: number; cloud: number;
  day: number; sunset: number; wind: number;
  nightVision: number; hurt: number; exposure: number;
  dynO: Float32Array; dynOn: number;   // opaque entity triangles (12 floats / vertex)
  dynA: Float32Array; dynAn: number;   // alpha triangles
}
export const DYN_STRIDE = 12;

export interface RenderStats { chunks: number; tris: number; backend: string }

export interface Renderer {
  backend: 'webgpu' | 'webgl2';
  init(canvas: HTMLCanvasElement, atlas: Atlas, q: Quality): Promise<void>;
  setQuality(q: Quality): void;
  resize(w: number, h: number): void;
  setChunk(key: number, cx: number, cz: number, mesh: ChunkMeshData | null): void;
  removeChunk(key: number): void;
  render(f: FrameParams): RenderStats;
  onLost?: (reason: string) => void;
  dispose(): void;
}
