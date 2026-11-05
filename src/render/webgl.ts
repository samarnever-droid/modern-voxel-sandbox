/** WebGL2 fallback renderer — same mesh format, simplified lighting (no shadow maps / bloom). */
import { frustumPlanes, aabbInFrustum } from '../engine/math';
import type { Atlas } from '../engine/registry';
import type { ChunkMeshData } from '../world/mesher';
import { FrameParams, Quality, Renderer, RenderStats, DYN_STRIDE } from './types';

const HEAD = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler2DArray;
uniform vec4 uCam, uSunDir, uLightDir, uSunCol, uFog, uAmbTop, uAmbBot, uP0, uP1, uP2;
uniform mat4 uVP, uInvVP;
float hash21(vec2 p){ vec2 q = fract(p*vec2(123.34,456.21)); q += dot(q, q+45.32); return fract(q.x*q.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float a=0.5,s=0.0; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.0,9.0); a*=0.5; } return s; }
vec3 skyColor(vec3 dir, bool full){
  float day=uP2.x; vec3 sunD=uSunDir.xyz; float up=clamp(dir.y,0.0,1.0);
  vec3 zen=mix(vec3(0.006,0.012,0.035),vec3(0.11,0.29,0.70),day);
  vec3 hor=mix(vec3(0.02,0.035,0.07),vec3(0.58,0.72,0.90),day);
  vec3 hd=normalize(vec3(dir.x,0.0,dir.z)+vec3(0.0001)); vec3 sd2=normalize(vec3(sunD.x,0.0,sunD.z)+vec3(0.0001));
  hor=mix(hor,vec3(1.0,0.42,0.18),clamp(uP1.w,0.0,1.0)*(0.3+0.7*max(dot(hd,sd2),0.0))*(1.0-up));
  vec3 col=mix(hor,zen,pow(up,0.5)); float cs=max(dot(dir,sunD),0.0);
  col+=vec3(1.0,0.72,0.45)*(pow(cs,5.0)*0.16+pow(cs,48.0)*0.4)*(0.15+day)*(0.5+uP1.w);
  col=mix(col,hor*0.45,1.0-smoothstep(-0.25,0.0,dir.y));
  if(full){
    col+=vec3(1.0,0.9,0.7)*smoothstep(0.99955,0.99985,cs)*40.0*clamp(sunD.y*4.0+0.5,0.0,1.0);
    float md=max(dot(dir,-sunD),0.0);
    col+=vec3(0.75,0.82,1.0)*smoothstep(0.9993,0.9997,md)*2.2*(1.0-day);
    vec3 sp=floor(dir*230.0); float sh=hash21(sp.xy+vec2(sp.z*17.0,sp.z*3.0));
    col+=vec3(step(0.9962,sh)*(1.0-day)*smoothstep(0.0,0.25,dir.y))*(0.5+0.8*hash21(sp.yz));
    if(dir.y>0.012){
      float t=320.0/dir.y; float wind=uCam.w*(1.2+uP2.z*6.0);
      vec2 p=(uCam.xz+dir.xz*t+vec2(wind,wind*0.3))*0.0045; float n=fbm(p), n2=fbm(p+sd2.xz*0.06);
      float cover=uP0.z; float dens=smoothstep(0.62-cover*0.34,0.92-cover*0.3,n);
      float shade=clamp((n-n2)*5.0+0.55,0.0,1.0);
      vec3 lit=mix(vec3(0.60,0.66,0.78),vec3(1.0,0.97,0.92),shade);
      vec3 cc=lit*(0.08+day*0.92)+vec3(1.0,0.45,0.2)*uP1.w*0.5*shade; cc*=1.0-cover*0.45;
      col=mix(col,cc,dens*smoothstep(0.012,0.18,dir.y)*0.92);
    }
  }
  return col;
}
vec3 applyFog(vec3 col, vec3 wpos){
  vec3 v=wpos-uCam.xyz; float d=length(v); vec3 dir=v/max(d,0.001);
  float hf=exp(-max(0.0,(uCam.y+wpos.y)*0.5-38.0)*0.04);
  float f=1.0-exp(-d*uFog.w*(0.3+0.7*hf));
  vec3 fc=mix(uFog.rgb,skyColor(dir,false),0.6)+uSunCol.rgb*pow(max(dot(dir,uSunDir.xyz),0.0),8.0)*0.06*uP2.x;
  if(uP0.y>0.5){ fc=vec3(0.03,0.2,0.3)*(0.25+0.75*uP2.x); f=1.0-exp(-d*0.1); }
  return mix(col,fc,clamp(f,0.0,1.0));
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
vec3 finish(vec3 col, vec2 sc){
  col*=uP2.y; col=aces(col); if(uP0.y>0.5) col*=vec3(0.7,0.95,1.1);
  float vig=1.0-smoothstep(0.38,1.1,length(sc)*1.3); col*=mix(0.6,1.0,vig);
  col=mix(col,vec3(0.75,0.04,0.04),clamp(uP1.z*((1.0-vig)*0.9+0.12),0.0,0.85));
  return pow(col,vec3(1.0/2.2));
}
`;

const T_VS = HEAD + `
layout(location=0) in vec4 a; layout(location=1) in vec4 b;
uniform sampler2D uMats;
out vec3 vW; out vec2 vUV; flat out int vLayer; flat out int vFace; out vec3 vLight; out float vAO;
void main(){
  vec3 p=a.xyz; int lf=int(b.y+0.5); int layer=lf>>3; int face=lf&7;
  vec4 m=texelFetch(uMats,ivec2(layer,0),0); int fl=int(m.w+0.5); float t=uCam.w;
  if((fl&4)!=0){ float wgt=face==6?1.0-b.x:0.16; float amp=wgt*(1.0+uP2.z*2.5);
    p.x+=sin(t*1.7+p.x*0.9+p.z*0.6)*0.06*amp; p.z+=cos(t*1.3+p.z*0.8+p.x*0.5)*0.05*amp; }
  if((fl&2)!=0) p.y+=(sin(p.x*1.3+t*1.6)+sin(p.z*1.1+t*1.2))*0.012;
  gl_Position=uVP*vec4(p,1.0); gl_Position.z=gl_Position.z*2.0-gl_Position.w;
  vW=p; vUV=vec2(a.w,b.x); vLayer=layer; vFace=face;
  int li=int(b.w+0.5); vLight=vec3(float(li&15)/15.0,float((li>>4)&15)/15.0,float((li>>8)&1)); vAO=b.z/3.0;
}`;

const T_FS = HEAD + `
uniform sampler2DArray uAtlas; uniform sampler2D uMats; uniform int uTrans;
in vec3 vW; in vec2 vUV; flat in int vLayer; flat in int vFace; in vec3 vLight; in float vAO;
out vec4 outc;
vec3 fn(int f){ if(f==0)return vec3(1,0,0); if(f==1)return vec3(-1,0,0); if(f==3)return vec3(0,-1,0); if(f==4)return vec3(0,0,1); if(f==5)return vec3(0,0,-1); return vec3(0,1,0); }
float wh(vec2 p,float t){ return vnoise(p*0.9+vec2(t*0.5,t*0.3))+0.5*vnoise(p*2.3-vec2(t*0.4,-t*0.6))+0.25*vnoise(p*5.1+vec2(t*0.8,t*0.5)); }
vec3 shade(vec3 albedoIn, vec3 N, vec3 light, float ao, float rough, float metal, float glow){
  vec3 V=normalize(uCam.xyz-vW); vec3 L=uLightDir.xyz; float sky=light.x;
  float wet=uP0.x*smoothstep(0.6,0.95,sky)*(0.35+0.65*max(N.y,0.0));
  vec3 albedo=albedoIn*(1.0-0.32*wet); rough=mix(rough,0.1,wet*0.9);
  float ndl=max(dot(N,L),0.0); float sunVis=smoothstep(0.5,0.95,sky);
  vec3 sun=uSunCol.rgb*ndl*sunVis; vec3 hemi=mix(uAmbBot.rgb,uAmbTop.rgb,N.y*0.5+0.5);
  float aoF=mix(0.32,1.0,ao); vec3 amb=hemi*(sky*sky*0.95+0.035)*aoF+vec3(0.04,0.2,0.1)*uP1.y*aoF;
  vec3 blk=vec3(1.0,0.76,0.5)*pow(light.y,1.5)*1.5*mix(0.55,1.0,ao);
  vec3 col=albedo*(1.0-metal)*(sun+amb+blk)+albedo*metal*(amb*0.25+blk*0.3);
  vec3 H=normalize(L+V); float shin=mix(260.0,10.0,rough); vec3 f0=mix(vec3(0.04),albedo,metal);
  col+=pow(max(dot(N,H),0.0),shin)*(shin+8.0)/22.0*f0*sunVis*ndl*(1.0-rough*0.5)*uSunCol.rgb*0.45;
  vec3 R=reflect(-V,N); vec3 fres=f0+(vec3(1.0)-f0)*pow(1.0-max(dot(N,V),0.0),5.0);
  col+=skyColor(R,false)*fres*(1.0-rough)*(1.0-rough)*(sky*sky*0.9+0.04)*aoF*(1.0+wet*2.0);
  float lum=dot(albedoIn,vec3(0.3,0.59,0.11)); col+=albedoIn*glow*light.z*smoothstep(0.12,0.55,lum)*2.4;
  return col;
}
void main(){
  vec4 tex=texture(uAtlas,vec3(vUV,float(vLayer))); tex.rgb=pow(tex.rgb,vec3(2.2));
  vec4 m=texelFetch(uMats,ivec2(vLayer,0),0); int fl=int(m.w+0.5);
  if(uTrans==0){ if((fl&1)!=0&&tex.a<0.5) discard; }
  vec3 N=fn(vFace); vec3 col; float alpha=1.0;
  if(uTrans==1&&(fl&2)!=0){
    float t=uCam.w; vec2 p=vW.xz; float e=0.12; float h0=wh(p,t), hx=wh(p+vec2(e,0),t), hz=wh(p+vec2(0,e),t);
    N=normalize(vec3(-(hx-h0)*0.55/e,1.0,-(hz-h0)*0.55/e)); if(vFace!=2) N=fn(vFace);
    vec3 V=normalize(uCam.xyz-vW); vec3 R=reflect(-V,N); float fres=0.03+0.97*pow(1.0-max(dot(N,V),0.0),4.0);
    float dayAmb=0.08+0.92*uP2.x; vec3 deep=mix(vec3(0.02,0.13,0.2),tex.rgb*vec3(0.35,0.6,0.7),0.5)*dayAmb;
    vec3 lit=deep*(0.35+vLight.x*0.9)+vec3(1.0,0.76,0.5)*pow(vLight.y,1.5)*0.25;
    vec3 refl=skyColor(R,false)*(0.25+vLight.x*0.75)+uSunCol.rgb*pow(max(dot(R,uLightDir.xyz),0.0),380.0)*14.0*vLight.x;
    col=mix(lit,refl,clamp(fres+uP0.x*0.1,0.0,1.0)); alpha=mix(0.62,0.97,fres);
  } else {
    col=shade(tex.rgb,N,vLight,uTrans==1?1.0:vAO,m.x,max(m.y,0.0),m.z);
    if(uTrans==1){ vec3 V=normalize(uCam.xyz-vW); float fres=0.05+0.95*pow(1.0-max(dot(N,V),0.0),4.0); alpha=clamp(max(tex.a,fres*0.55),0.0,1.0); }
  }
  col=applyFog(col,vW);
  outc=vec4(finish(col,gl_FragCoord.xy/vec2(uP2.w,uP1.x)-vec2(0.5)),alpha);
}`;

const S_VS = HEAD + `
out vec2 vN;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.0-1.0,1.0,1.0); vN=p*2.0-1.0; }`;
const S_FS = HEAD + `
in vec2 vN; out vec4 outc;
void main(){ vec4 wp=uInvVP*vec4(vN,1.0,1.0); vec3 dir=normalize(wp.xyz/wp.w-uCam.xyz);
  vec3 col=skyColor(dir,true); if(uP0.y>0.5) col=vec3(0.03,0.2,0.3)*(0.25+0.75*uP2.x);
  outc=vec4(finish(col,vN*0.5),1.0); }`;

const D_VS = HEAD + `
layout(location=0) in vec3 pos; layout(location=1) in vec3 nrm; layout(location=2) in vec4 colr; layout(location=3) in vec2 ex;
out vec3 vW; out vec3 vN; out vec4 vC; out vec2 vE;
void main(){ gl_Position=uVP*vec4(pos,1.0); gl_Position.z=gl_Position.z*2.0-gl_Position.w; vW=pos; vN=nrm; vC=colr; vE=ex; }`;
const D_FS = HEAD + `
in vec3 vW; in vec3 vN; in vec4 vC; in vec2 vE; out vec4 outc;
void main(){ vec3 N=normalize(vN); float ndl=max(dot(N,uLightDir.xyz),0.0); vec3 hemi=mix(uAmbBot.rgb,uAmbTop.rgb,N.y*0.5+0.5);
  vec3 col=vC.rgb*(hemi*0.9+uSunCol.rgb*ndl*0.55+vec3(0.03)); col+=vC.rgb*vE.x*2.5; col=applyFog(col,vW);
  outc=vec4(finish(col,gl_FragCoord.xy/vec2(uP2.w,uP1.x)-vec2(0.5)),vC.a); }`;

interface GLChunk { vao?: WebGLVertexArrayObject; vb?: WebGLBuffer; ib?: WebGLBuffer; n: number; tvao?: WebGLVertexArrayObject; tvb?: WebGLBuffer; tib?: WebGLBuffer; tn: number; x0: number; z0: number; minY: number; maxY: number }

export class WebGL2Renderer implements Renderer {
  backend = 'webgl2' as const;
  onLost?: (r: string) => void;
  gl!: WebGL2RenderingContext; canvas!: HTMLCanvasElement; q!: Quality;
  chunks = new Map<number, GLChunk>();
  progT!: WebGLProgram; progS!: WebGLProgram; progD!: WebGLProgram;
  atlasTex!: WebGLTexture; matTex!: WebGLTexture;
  dynVao!: WebGLVertexArrayObject; dynBuf!: WebGLBuffer;
  w = 1; h = 1; planes = new Float32Array(24);

  async init(canvas: HTMLCanvasElement, atlas: Atlas, q: Quality) {
    this.canvas = canvas; this.q = q;
    const gl = canvas.getContext('webgl2', { antialias: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.onLost?.('WebGL context lost'); });
    this.progT = this.prog(T_VS, T_FS); this.progS = this.prog(S_VS, S_FS); this.progD = this.prog(D_VS, D_FS);
    this.atlasTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlasTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, atlas.mips.length, gl.RGBA8, 32, 32, atlas.layers);
    atlas.mips.forEach((m, i) => gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, i, 0, 0, 0, m.size, m.size, atlas.layers, gl.RGBA, gl.UNSIGNED_BYTE, m.data));
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    this.matTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.matTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1024, 1, 0, gl.RGBA, gl.FLOAT, atlas.materials);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.dynVao = gl.createVertexArray()!; this.dynBuf = gl.createBuffer()!;
    gl.bindVertexArray(this.dynVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
    gl.bufferData(gl.ARRAY_BUFFER, 60000 * DYN_STRIDE * 4, gl.DYNAMIC_DRAW);
    const S = DYN_STRIDE * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 40);
    gl.bindVertexArray(null);
  }
  private prog(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const sh = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('GLSL: ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('GL link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  setQuality(q: Quality) { this.q = q; this.resize(this.canvas.clientWidth || this.w, this.canvas.clientHeight || this.h); }
  resize(cw: number, ch: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(2, Math.floor(cw * this.q.scale * dpr)); this.h = Math.max(2, Math.floor(ch * this.q.scale * dpr));
    this.canvas.width = this.w; this.canvas.height = this.h;
  }
  setChunk(key: number, cx: number, cz: number, mesh: ChunkMeshData | null) {
    this.removeChunk(key);
    if (!mesh || (!mesh.opaque && !mesh.trans)) return;
    const gl = this.gl;
    const c: GLChunk = { n: 0, tn: 0, x0: cx << 4, z0: cz << 4, minY: 0, maxY: 128 };
    const up = (v: Float32Array, i: Uint32Array) => {
      const vao = gl.createVertexArray()!, vb = gl.createBuffer()!, ib = gl.createBuffer()!;
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, i, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return [vao, vb, ib] as const;
    };
    if (mesh.opaque) { [c.vao, c.vb, c.ib] = up(mesh.opaque.verts, mesh.opaque.idx); c.n = mesh.opaque.ni; c.minY = mesh.opaque.minY; c.maxY = mesh.opaque.maxY; }
    if (mesh.trans) { [c.tvao, c.tvb, c.tib] = up(mesh.trans.verts, mesh.trans.idx); c.tn = mesh.trans.ni; c.minY = Math.min(c.minY, mesh.trans.minY); c.maxY = Math.max(c.maxY, mesh.trans.maxY); }
    this.chunks.set(key, c);
  }
  removeChunk(key: number) {
    const c = this.chunks.get(key); if (!c) return; const gl = this.gl;
    for (const b of [c.vb, c.ib, c.tvb, c.tib]) if (b) gl.deleteBuffer(b);
    for (const v of [c.vao, c.tvao]) if (v) gl.deleteVertexArray(v);
    this.chunks.delete(key);
  }
  private uniforms(p: WebGLProgram, f: FrameParams) {
    const gl = this.gl, u = (n: string) => gl.getUniformLocation(p, n);
    gl.uniformMatrix4fv(u('uVP'), false, f.viewProj); gl.uniformMatrix4fv(u('uInvVP'), false, f.invViewProj);
    gl.uniform4f(u('uCam'), f.cam[0], f.cam[1], f.cam[2], f.time);
    gl.uniform4f(u('uSunDir'), f.sunDir[0], f.sunDir[1], f.sunDir[2], 0); gl.uniform4f(u('uLightDir'), f.lightDir[0], f.lightDir[1], f.lightDir[2], 0);
    gl.uniform4f(u('uSunCol'), f.sunColor[0], f.sunColor[1], f.sunColor[2], 0); gl.uniform4f(u('uFog'), f.fogColor[0], f.fogColor[1], f.fogColor[2], f.fogDensity);
    gl.uniform4f(u('uAmbTop'), f.ambTop[0], f.ambTop[1], f.ambTop[2], 0); gl.uniform4f(u('uAmbBot'), f.ambBot[0], f.ambBot[1], f.ambBot[2], 0);
    gl.uniform4f(u('uP0'), f.rain, f.underwater, f.cloud, 0); gl.uniform4f(u('uP1'), this.h, f.nightVision, f.hurt, f.sunset);
    gl.uniform4f(u('uP2'), f.day, f.exposure, f.wind, this.w);
  }
  render(f: FrameParams): RenderStats {
    const gl = this.gl;
    gl.viewport(0, 0, this.w, this.h);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
    // sky
    gl.disable(gl.DEPTH_TEST); gl.useProgram(this.progS); this.uniforms(this.progS, f); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.useProgram(this.progT); this.uniforms(this.progT, f);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlasTex); gl.uniform1i(gl.getUniformLocation(this.progT, 'uAtlas'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.matTex); gl.uniform1i(gl.getUniformLocation(this.progT, 'uMats'), 1);
    const tl = gl.getUniformLocation(this.progT, 'uTrans');
    frustumPlanes(f.viewProj, this.planes);
    const vis: GLChunk[] = []; let tris = 0;
    for (const c of this.chunks.values()) if (aabbInFrustum(this.planes, c.x0, c.minY, c.z0, c.x0 + 16, c.maxY + 1, c.z0 + 16)) vis.push(c);
    gl.uniform1i(tl, 0);
    for (const c of vis) if (c.vao) { gl.bindVertexArray(c.vao); gl.drawElements(gl.TRIANGLES, c.n, gl.UNSIGNED_INT, 0); tris += c.n / 3; }
    if (f.dynOn) this.drawDyn(f, f.dynO, f.dynOn, false);
    gl.useProgram(this.progT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.uniform1i(tl, 1);
    const cx = f.cam[0], cz = f.cam[2];
    const tv = vis.filter((c) => c.tvao).sort((a, b) => ((b.x0 + 8 - cx) ** 2 + (b.z0 + 8 - cz) ** 2) - ((a.x0 + 8 - cx) ** 2 + (a.z0 + 8 - cz) ** 2));
    for (const c of tv) { gl.bindVertexArray(c.tvao!); gl.drawElements(gl.TRIANGLES, c.tn, gl.UNSIGNED_INT, 0); tris += c.tn / 3; }
    if (f.dynAn) this.drawDyn(f, f.dynA, f.dynAn, true);
    gl.depthMask(true); gl.bindVertexArray(null);
    return { chunks: vis.length, tris, backend: 'webgl2' };
  }
  private drawDyn(f: FrameParams, data: Float32Array, n: number, alpha: boolean) {
    const gl = this.gl;
    gl.useProgram(this.progD); this.uniforms(this.progD, f);
    if (alpha) { gl.enable(gl.BLEND); gl.depthMask(false); }
    gl.bindVertexArray(this.dynVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
    const cnt = Math.min(n, 60000);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, cnt * DYN_STRIDE);
    gl.drawArrays(gl.TRIANGLES, 0, cnt);
    gl.bindVertexArray(null);
  }
  dispose() { for (const k of [...this.chunks.keys()]) this.removeChunk(k); }
}
