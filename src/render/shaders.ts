/** WGSL shader library for the WebGPU renderer. */

export const COMMON = /* wgsl */ `
struct Globals {
  viewProj: mat4x4f,
  lightVP0: mat4x4f,
  lightVP1: mat4x4f,
  invViewProj: mat4x4f,
  camPos: vec4f,
  sunDir: vec4f,
  lightDir: vec4f,
  sunColor: vec4f,
  fogColor: vec4f,
  ambTop: vec4f,
  ambBot: vec4f,
  p0: vec4f,
  p1: vec4f,
  p2: vec4f,
  p3: vec4f,
  screen: vec4f,
}
@group(0) @binding(0) var<uniform> g: Globals;

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn fbm(p0: vec2f) -> f32 {
  var p = p0;
  var a = 0.5;
  var s = 0.0;
  for (var i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2f(17.0, 9.0);
    a *= 0.5;
  }
  return s;
}
fn skyColor(dir: vec3f, full: bool) -> vec3f {
  let day = g.p2.x;
  let sunD = g.sunDir.xyz;
  let up = clamp(dir.y, 0.0, 1.0);
  let zen = mix(vec3f(0.006, 0.012, 0.035), vec3f(0.11, 0.29, 0.70), day);
  var hor = mix(vec3f(0.02, 0.035, 0.07), vec3f(0.58, 0.72, 0.90), day);
  let hd = normalize(vec3f(dir.x, 0.0, dir.z) + vec3f(0.0001, 0.0, 0.0001));
  let sd2 = normalize(vec3f(sunD.x, 0.0, sunD.z) + vec3f(0.0001, 0.0, 0.0001));
  let sdm = max(dot(hd, sd2), 0.0);
  hor = mix(hor, vec3f(1.0, 0.42, 0.18), clamp(g.p1.w, 0.0, 1.0) * (0.3 + 0.7 * sdm) * (1.0 - up));
  var col = mix(hor, zen, pow(up, 0.5));
  let cs = max(dot(dir, sunD), 0.0);
  col += vec3f(1.0, 0.72, 0.45) * (pow(cs, 5.0) * 0.16 + pow(cs, 48.0) * 0.4) * (0.15 + day) * (0.5 + g.p1.w);
  col = mix(col, hor * 0.45, 1.0 - smoothstep(-0.25, 0.0, dir.y));
  if (full) {
    // sun disc
    col += vec3f(1.0, 0.9, 0.7) * smoothstep(0.99955, 0.99985, cs) * 40.0 * clamp(sunD.y * 4.0 + 0.5, 0.0, 1.0);
    // moon
    let md = max(dot(dir, -sunD), 0.0);
    col += vec3f(0.75, 0.82, 1.0) * smoothstep(0.9993, 0.9997, md) * 2.2 * (1.0 - day);
    col += vec3f(0.2, 0.25, 0.4) * pow(md, 30.0) * 0.25 * (1.0 - day);
    // stars
    let sp = floor(dir * 230.0);
    let sh = hash21(sp.xy + vec2f(sp.z * 17.0, sp.z * 3.0));
    let star = step(0.9962, sh) * (1.0 - day) * smoothstep(0.0, 0.25, dir.y);
    col += vec3f(star) * (0.5 + 0.8 * hash21(sp.yz));
    // clouds
    if (dir.y > 0.012) {
      let t = 320.0 / dir.y;
      let wind = g.camPos.w * (1.2 + g.p2.z * 6.0);
      let p = (g.camPos.xz + dir.xz * t + vec2f(wind, wind * 0.3)) * 0.0045;
      let n = fbm(p);
      let n2 = fbm(p + sd2 * 0.06);
      let cover = g.p0.z;
      let dens = smoothstep(0.62 - cover * 0.34, 0.92 - cover * 0.3, n);
      let shade = clamp((n - n2) * 5.0 + 0.55, 0.0, 1.0);
      let lit = mix(vec3f(0.60, 0.66, 0.78), vec3f(1.0, 0.97, 0.92), shade);
      var cc = lit * (0.08 + day * 0.92) + vec3f(1.0, 0.45, 0.2) * g.p1.w * 0.5 * shade;
      cc *= 1.0 - cover * 0.45;
      col = mix(col, cc, dens * smoothstep(0.012, 0.18, dir.y) * 0.92);
    }
  }
  return col;
}
fn applyFog(col: vec3f, wpos: vec3f) -> vec3f {
  let v = wpos - g.camPos.xyz;
  let d = length(v);
  let dir = v / max(d, 0.001);
  let dens = g.fogColor.w;
  let hf = exp(-max(0.0, (g.camPos.y + wpos.y) * 0.5 - 38.0) * 0.04);
  var f = 1.0 - exp(-d * dens * (0.3 + 0.7 * hf));
  var fc = mix(g.fogColor.rgb, skyColor(dir, false), 0.6);
  fc += g.sunColor.rgb * pow(max(dot(dir, g.sunDir.xyz), 0.0), 8.0) * 0.06 * g.p2.x;
  if (g.p0.y > 0.5) {
    fc = vec3f(0.03, 0.2, 0.3) * (0.25 + 0.75 * g.p2.x);
    f = 1.0 - exp(-d * 0.1);
  }
  return mix(col, fc, clamp(f, 0.0, 1.0));
}
fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}
`;

export const TERRAIN = /* wgsl */ `
@group(0) @binding(1) var<uniform> mats: array<vec4f, 1024>;
@group(0) @binding(2) var atlas: texture_2d_array<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var shadowTex: texture_depth_2d_array;
@group(0) @binding(5) var shadowSamp: sampler_comparison;

struct VIn { @location(0) a: vec4f, @location(1) b: vec4f }
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) layer: u32,
  @location(3) @interpolate(flat) face: u32,
  @location(4) light: vec3f,
  @location(5) ao: f32,
}

@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  var p = v.a.xyz;
  let lf = u32(v.b.y);
  let layer = lf >> 3u;
  let face = lf & 7u;
  let m = mats[layer];
  let fl = u32(m.w);
  let t = g.camPos.w;
  if ((fl & 4u) != 0u) {
    var wgt = 0.16;
    if (face == 6u) { wgt = 1.0 - v.b.x; }
    let amp = wgt * (1.0 + g.p2.z * 2.5);
    p.x += sin(t * 1.7 + p.x * 0.9 + p.z * 0.6) * 0.06 * amp;
    p.z += cos(t * 1.3 + p.z * 0.8 + p.x * 0.5) * 0.05 * amp;
  }
  if ((fl & 2u) != 0u) {
    p.y += (sin(p.x * 1.3 + t * 1.6) + sin(p.z * 1.1 + t * 1.2)) * 0.012;
  }
  o.pos = g.viewProj * vec4f(p, 1.0);
  o.wpos = p;
  o.uv = vec2f(v.a.w, v.b.x);
  o.layer = layer;
  o.face = face;
  let li = u32(v.b.w);
  o.light = vec3f(f32(li & 15u) / 15.0, f32((li >> 4u) & 15u) / 15.0, f32((li >> 8u) & 1u));
  o.ao = v.b.z / 3.0;
  return o;
}

fn faceNormal(face: u32) -> vec3f {
  switch (face) {
    case 0u: { return vec3f(1.0, 0.0, 0.0); }
    case 1u: { return vec3f(-1.0, 0.0, 0.0); }
    case 2u: { return vec3f(0.0, 1.0, 0.0); }
    case 3u: { return vec3f(0.0, -1.0, 0.0); }
    case 4u: { return vec3f(0.0, 0.0, 1.0); }
    case 5u: { return vec3f(0.0, 0.0, -1.0); }
    default: { return vec3f(0.0, 1.0, 0.0); }
  }
}

fn shadowAt(wp: vec3f, n: vec3f, dist: f32) -> f32 {
  let mode = g.p0.w;
  if (mode < 0.5) { return 1.0; }
  var cascade = 0;
  var lp = g.lightVP0 * vec4f(wp + n * 0.07, 1.0);
  if (mode > 1.5 && dist > g.p1.x) {
    cascade = 1;
    lp = g.lightVP1 * vec4f(wp + n * 0.2, 1.0);
  }
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || lp.z > 1.0) { return 1.0; }
  let texel = g.p3.x;
  var s = 0.0;
  for (var j = -1; j <= 1; j++) {
    for (var i = 0; i < 3; i++) {
      s += textureSampleCompareLevel(shadowTex, shadowSamp, uv + vec2f(f32(i - 1), f32(j)) * texel, cascade, lp.z - 0.0006);
    }
  }
  return s / 9.0;
}

fn shade(albedoIn: vec3f, nIn: vec3f, wpos: vec3f, light: vec3f, ao: f32, roughIn: f32, metal: f32, glow: f32) -> vec3f {
  let N = nIn;
  let V = normalize(g.camPos.xyz - wpos);
  let L = g.lightDir.xyz;
  let dist = length(g.camPos.xyz - wpos);
  let sky = light.x;
  var albedo = albedoIn;
  var rough = roughIn;
  let wet = g.p0.x * smoothstep(0.6, 0.95, sky) * (0.35 + 0.65 * max(N.y, 0.0));
  albedo = albedo * (1.0 - 0.32 * wet);
  rough = mix(rough, 0.1, wet * 0.9);
  let ndl = max(dot(N, L), 0.0);
  var sunVis = smoothstep(0.5, 0.95, sky);
  if (ndl > 0.0 && sunVis > 0.0) { sunVis = sunVis * shadowAt(wpos, N, dist); }
  let sun = g.sunColor.rgb * ndl * sunVis;
  let hemi = mix(g.ambBot.rgb, g.ambTop.rgb, N.y * 0.5 + 0.5);
  let aoF = mix(0.32, 1.0, ao);
  var amb = hemi * (sky * sky * 0.95 + 0.035) * aoF;
  amb += vec3f(0.04, 0.2, 0.1) * g.p1.y * aoF;
  let blk = vec3f(1.0, 0.76, 0.5) * pow(light.y, 1.5) * 1.5 * mix(0.55, 1.0, ao);
  let kd = 1.0 - metal;
  var col = albedo * kd * (sun + amb + blk) + albedo * metal * (amb * 0.25 + blk * 0.3);
  let H = normalize(L + V);
  let ndh = max(dot(N, H), 0.0);
  let shin = mix(260.0, 10.0, rough);
  let f0 = mix(vec3f(0.04), albedo, metal);
  col += pow(ndh, shin) * (shin + 8.0) / 22.0 * f0 * sunVis * ndl * (1.0 - rough * 0.5) * g.sunColor.rgb * 0.45;
  let R = reflect(-V, N);
  let fres = f0 + (vec3f(1.0) - f0) * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  let sr = (1.0 - rough) * (1.0 - rough);
  col += skyColor(R, false) * fres * sr * (sky * sky * 0.9 + 0.04) * aoF * (1.0 + wet * 2.0);
  let lum = dot(albedoIn, vec3f(0.3, 0.59, 0.11));
  col += albedoIn * glow * light.z * smoothstep(0.12, 0.55, lum) * 2.4;
  return col;
}

fn sampleAtlas(i: VOut) -> vec4f {
  var c = textureSample(atlas, samp, i.uv, i.layer);
  c = vec4f(pow(c.rgb, vec3f(2.2)), c.a);
  return c;
}

@fragment fn fs_opaque(i: VOut) -> @location(0) vec4f {
  let tex = sampleAtlas(i);
  let m = mats[i.layer];
  let fl = u32(m.w);
  if ((fl & 1u) != 0u && tex.a < 0.5) { discard; }
  let N = faceNormal(i.face);
  var col = shade(tex.rgb, N, i.wpos, i.light, i.ao, m.x, m.y, m.z);
  col = applyFog(col, i.wpos);
  return vec4f(col, 1.0);
}

fn wh(p: vec2f, t: f32) -> f32 {
  return vnoise(p * 0.9 + vec2f(t * 0.5, t * 0.3)) + 0.5 * vnoise(p * 2.3 - vec2f(t * 0.4, -t * 0.6)) + 0.25 * vnoise(p * 5.1 + vec2f(t * 0.8, t * 0.5));
}

@fragment fn fs_trans(i: VOut) -> @location(0) vec4f {
  let tex = sampleAtlas(i);
  let m = mats[i.layer];
  let fl = u32(m.w);
  let V = normalize(g.camPos.xyz - i.wpos);
  let t = g.camPos.w;
  if ((fl & 2u) != 0u) {
    let e = 0.12;
    let p = i.wpos.xz;
    let h0 = wh(p, t);
    let hx = wh(p + vec2f(e, 0.0), t);
    let hz = wh(p + vec2f(0.0, e), t);
    var N = normalize(vec3f(-(hx - h0) * 0.55 / e, 1.0, -(hz - h0) * 0.55 / e));
    if (i.face != 2u) { N = faceNormal(i.face); }
    let R = reflect(-V, N);
    let fres = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
    let dayAmb = 0.08 + 0.92 * g.p2.x;
    let deep = mix(vec3f(0.02, 0.13, 0.2), tex.rgb * vec3f(0.35, 0.6, 0.7), 0.5) * dayAmb;
    let lit = deep * (0.35 + i.light.x * 0.9) + vec3f(1.0, 0.76, 0.5) * pow(i.light.y, 1.5) * 0.25;
    var refl = skyColor(R, false) * (0.25 + i.light.x * 0.75);
    refl += g.sunColor.rgb * pow(max(dot(R, g.lightDir.xyz), 0.0), 380.0) * 14.0 * i.light.x;
    var col = mix(lit, refl, clamp(fres + g.p0.x * 0.1, 0.0, 1.0));
    col += vec3f(0.9) * smoothstep(0.78, 0.95, h0 * 0.62) * 0.05 * dayAmb;
    col = applyFog(col, i.wpos);
    return vec4f(col, mix(0.62, 0.97, fres));
  }
  let N = faceNormal(i.face);
  var col = shade(tex.rgb, N, i.wpos, i.light, 1.0, m.x, max(m.y, 0.0), m.z);
  let fres = 0.05 + 0.95 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  let a = clamp(max(tex.a, fres * 0.55), 0.0, 1.0);
  col = applyFog(col, i.wpos);
  return vec4f(col, a);
}
`;

export const SHADOW = /* wgsl */ `
struct ShadowU { vp: mat4x4f }
@group(0) @binding(0) var<uniform> sh: ShadowU;
struct VIn { @location(0) a: vec4f, @location(1) b: vec4f }
@vertex fn vs(v: VIn) -> @builtin(position) vec4f {
  return sh.vp * vec4f(v.a.xyz, 1.0);
}
`;

export const SKY = /* wgsl */ `
struct SOut { @builtin(position) pos: vec4f, @location(0) ndc: vec2f }
@vertex fn vs_sky(@builtin(vertex_index) vi: u32) -> SOut {
  var o: SOut;
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  o.pos = vec4f(p * 2.0 - 1.0, 1.0, 1.0);
  o.ndc = p * 2.0 - 1.0;
  return o;
}
@fragment fn fs_sky(i: SOut) -> @location(0) vec4f {
  let wp = g.invViewProj * vec4f(i.ndc, 1.0, 1.0);
  let dir = normalize(wp.xyz / wp.w - g.camPos.xyz);
  var col = skyColor(dir, true);
  if (g.p0.y > 0.5) { col = vec3f(0.03, 0.2, 0.3) * (0.25 + 0.75 * g.p2.x); }
  return vec4f(col, 1.0);
}
`;

export const DYN = /* wgsl */ `
struct DIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) col: vec4f, @location(3) ex: vec2f }
struct DOut { @builtin(position) p: vec4f, @location(0) wpos: vec3f, @location(1) nrm: vec3f, @location(2) col: vec4f, @location(3) ex: vec2f }
@vertex fn vs_dyn(v: DIn) -> DOut {
  var o: DOut;
  o.p = g.viewProj * vec4f(v.pos, 1.0);
  o.wpos = v.pos; o.nrm = v.nrm; o.col = v.col; o.ex = v.ex;
  return o;
}
@fragment fn fs_dyn(i: DOut) -> @location(0) vec4f {
  let N = normalize(i.nrm);
  let ndl = max(dot(N, g.lightDir.xyz), 0.0);
  let hemi = mix(g.ambBot.rgb, g.ambTop.rgb, N.y * 0.5 + 0.5);
  var col = i.col.rgb * (hemi * 0.9 + g.sunColor.rgb * ndl * 0.55 + vec3f(0.03));
  col += i.col.rgb * i.ex.x * 2.5;
  col = applyFog(col, i.wpos);
  return vec4f(col, i.col.a);
}
`;

export const BLOOM = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var lin: sampler;
@group(0) @binding(2) var<uniform> bp: vec4f;
struct FOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs_full(@builtin(vertex_index) vi: u32) -> FOut {
  var o: FOut;
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
@fragment fn fs_bright(i: FOut) -> @location(0) vec4f {
  let o = bp.xy;
  var c = textureSampleLevel(src, lin, i.uv + vec2f(o.x, o.y), 0.0).rgb;
  c += textureSampleLevel(src, lin, i.uv + vec2f(-o.x, o.y), 0.0).rgb;
  c += textureSampleLevel(src, lin, i.uv + vec2f(o.x, -o.y), 0.0).rgb;
  c += textureSampleLevel(src, lin, i.uv + vec2f(-o.x, -o.y), 0.0).rgb;
  c = min(c * 0.25, vec3f(12.0));
  let lum = max(c.r, max(c.g, c.b));
  let w = smoothstep(bp.z, bp.z + 1.2, lum);
  return vec4f(c * w, 1.0);
}
@fragment fn fs_blur(i: FOut) -> @location(0) vec4f {
  var w = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
  var c = textureSampleLevel(src, lin, i.uv, 0.0).rgb * w[0];
  for (var k = 1; k < 5; k++) {
    let off = bp.xy * f32(k) * 1.6;
    c += textureSampleLevel(src, lin, i.uv + off, 0.0).rgb * w[k];
    c += textureSampleLevel(src, lin, i.uv - off, 0.0).rgb * w[k];
  }
  return vec4f(c, 1.0);
}
`;

export const POST = /* wgsl */ `
@group(0) @binding(1) var hdr: texture_2d<f32>;
@group(0) @binding(2) var bloomT: texture_2d<f32>;
@group(0) @binding(3) var lin: sampler;
@group(0) @binding(4) var depthT: texture_depth_2d;
@group(0) @binding(5) var shadowTex: texture_depth_2d_array;
@group(0) @binding(6) var shadowSamp: sampler_comparison;
struct FOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs_full(@builtin(vertex_index) vi: u32) -> FOut {
  var o: FOut;
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
  o.uv = vec2f(p.x, 1.0 - p.y);
  return o;
}
@fragment fn fs_post(i: FOut) -> @location(0) vec4f {
  var suv = i.uv;
  if (g.p0.y > 0.5) {
    suv += vec2f(sin(i.uv.y * 40.0 + g.camPos.w * 2.0), cos(i.uv.x * 34.0 + g.camPos.w * 1.7)) * 0.0016;
  }
  let c = suv - vec2f(0.5);
  let ca = dot(c, c) * 0.01;
  var col = vec3f(
    textureSampleLevel(hdr, lin, suv + c * ca, 0.0).r,
    textureSampleLevel(hdr, lin, suv, 0.0).g,
    textureSampleLevel(hdr, lin, suv - c * ca, 0.0).b);
  col += textureSampleLevel(bloomT, lin, suv, 0.0).rgb * g.p3.w;
  if (g.p3.y > 0.5 && g.p0.w > 0.5) {
    let dims = vec2f(textureDimensions(depthT));
    let d = textureLoad(depthT, vec2i(suv * dims), 0);
    let ndc = vec4f(suv.x * 2.0 - 1.0, 1.0 - suv.y * 2.0, d, 1.0);
    let wp4 = g.invViewProj * ndc;
    let wp = wp4.xyz / wp4.w;
    let ro = g.camPos.xyz;
    var rl = length(wp - ro);
    let rd = (wp - ro) / max(rl, 0.001);
    rl = min(rl, 80.0);
    let jit = hash21(suv * dims + vec2f(g.camPos.w * 13.0, 0.0));
    var acc = 0.0;
    for (var s = 0; s < 14; s++) {
      let t = (f32(s) + jit) / 14.0 * rl;
      let sp = ro + rd * t;
      var lp = g.lightVP0 * vec4f(sp, 1.0);
      var cascade = 0;
      if (g.p0.w > 1.5) { lp = g.lightVP1 * vec4f(sp, 1.0); cascade = 1; }
      let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
      if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
        acc += textureSampleCompareLevel(shadowTex, shadowSamp, uv, cascade, lp.z - 0.002);
      } else {
        acc += 1.0;
      }
    }
    let ph = 0.25 + pow(max(dot(rd, g.lightDir.xyz), 0.0), 6.0) * 1.8;
    col += g.sunColor.rgb * (acc / 14.0) * (rl / 80.0) * ph * g.fogColor.w * 3.2 * g.p2.x;
  }
  col = col * g.p2.y;
  col = aces(col);
  if (g.p0.y > 0.5) { col = col * vec3f(0.7, 0.95, 1.1); }
  let vig = 1.0 - smoothstep(0.38, 1.1, length(c) * 1.3);
  col = col * mix(0.6, 1.0, vig);
  col = mix(col, vec3f(0.75, 0.04, 0.04), clamp(g.p1.z * ((1.0 - vig) * 0.9 + 0.12), 0.0, 0.85));
  col = pow(col, vec3f(1.0 / 2.2));
  col += (hash21(i.uv * g.screen.xy + vec2f(g.camPos.w, 0.0)) - 0.5) * 0.012;
  return vec4f(col, 1.0);
}
`;
