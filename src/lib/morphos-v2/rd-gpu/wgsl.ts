/**
 * WGSL for the WebGPU Gray–Scott field (MORPHOS v2 primary path).
 * f32 storage buffers for the chemistry (no 8-bit quantisation), a 9-point
 * Laplacian (Karl Sims: centre −1, edges .2, diagonals .05), anisotropic
 * diffusion, a spatial style map, flow, brush/onset seeding and MorphoMark
 * lock planting. Rendering samples an rgba16float copy with crisp,
 * derivative-anti-aliased iso edges and height-map lighting.
 */

const NOISE = /* wgsl */ `
const TAU: f32 = 6.28318530718;
const PI: f32 = 3.14159265359;

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  let w = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

fn fold(q: vec2f, n: f32, rot: f32) -> vec2f {
  let r = length(q);
  var a = atan2(q.y, q.x) + rot;
  let seg = TAU / max(n, 1.0);
  a = a - seg * floor(a / seg);
  a = abs(a - seg * 0.5);
  return vec2f(cos(a), sin(a)) * r;
}
`;

export const SIM = NOISE + /* wgsl */ `
struct SimU {
  res: vec4f,     // w, h, 1/w, 1/h
  rd: vec4f,      // feed, kill, du, dv
  rd2: vec4f,     // dt, feed2, kill2, varyAmount
  flow: vec4f,    // advX, advY (cells/step), swirl, time
  aniso: vec4f,   // strength, dirX, dirY, orientMode (0 linear, 1 radial, 2 circular)
  style: vec4f,   // varyMode, chladniN, chladniM, symmetry
  img: vec4f,     // hasImage, imageMix, imageMode, motion
  lock: vec4f,    // hasLock, lockGrow, lockImpulse, beat
  pts: vec4f,     // lockX, lockY, beatX, beatY
  brush: array<vec4f, 8>,
  trail: array<vec4f, 8>,
  seeds: array<vec4f, 8>, // x, y, radius, amount (per step)
  wave: vec4f,    // ripple→feed gain, ripple→kill gain, gridPin, gridN
  wave2: vec4f,   // grid line width, grid refraction, 0, 0
};

@group(0) @binding(0) var<uniform> u: SimU;
@group(0) @binding(1) var<storage, read> src: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(3) var<storage, read> lockB: array<vec2f>;
@group(0) @binding(4) var imgTex: texture_2d<f32>;
@group(0) @binding(5) var samp: sampler;
@group(0) @binding(6) var rippleTex: texture_2d<f32>; // h, dh/dx, dh/dy (top-down)

fn idx(x: i32, y: i32) -> u32 {
  let w = i32(u.res.x);
  let h = i32(u.res.y);
  let xx = ((x % w) + w) % w;
  let yy = ((y % h) + h) % h;
  return u32(yy * w + xx);
}

fn at(x: i32, y: i32) -> vec2f {
  return src[idx(x, y)];
}

fn bilin(p: vec2f) -> vec2f {
  let q = p - 0.5;
  let i = floor(q);
  let f = q - i;
  let ix = i32(i.x);
  let iy = i32(i.y);
  return mix(mix(at(ix, iy), at(ix + 1, iy), f.x), mix(at(ix, iy + 1), at(ix + 1, iy + 1), f.x), f.y);
}

fn finger(i: i32, uv: vec2f) -> f32 {
  let b = u.brush[i];
  if (b.w <= 0.0001) { return 0.0; }
  let d0 = (uv - b.xy) * u.res.xy;
  let rad = max(b.z, 0.003) * min(u.res.x, u.res.y);
  let t0 = length(d0) / rad;
  return b.w * (1.0 - smoothstep(0.62, 1.0, t0));
}

fn styleMask(uv: vec2f, q: vec2f) -> f32 {
  let mode = i32(u.style.x);
  let r = length(q);
  if (mode == 1) { return 1.0 - smoothstep(0.06, 0.4, r); }
  if (mode == 2) { let d = (r - 0.3) / 0.1; return exp(-d * d); }
  if (mode == 3) { return smoothstep(0.32, 0.68, vnoise(q * 2.2 + vec2f(u.flow.w * 0.011, -u.flow.w * 0.007))); }
  if (mode == 4) { return smoothstep(0.15, 0.95, uv.y); }
  if (mode == 5) {
    let x = q.x * 1.4;
    let y = q.y * 1.4;
    let n = u.style.y;
    let m = u.style.z;
    let f = cos(n * PI * x) * cos(m * PI * y) - cos(m * PI * x) * cos(n * PI * y);
    return exp(-abs(f) * 3.0);
  }
  return 0.0;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = u32(u.res.x);
  let H = u32(u.res.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  let uv = (vec2f(gid.xy) + 0.5) * u.res.zw;
  let aspect = u.res.x / u.res.y;
  let q = (uv - 0.5) * vec2f(aspect, 1.0);

  var s = 0.0;
  var wake = vec2f(0.0);
  for (var i = 0; i < 8; i = i + 1) {
    let f = finger(i, uv);
    s = s + f;
    wake = wake + u.trail[i].xy * f;
  }
  s = clamp(s, 0.0, 1.0);
  wake = clamp(wake, vec2f(-0.06), vec2f(0.06));

  // Flow: global drift (sensors) + swirl field + finger wake, in cells/step.
  var vel = u.flow.xy + wake * 1.6 * u.res.xy * 0.02;
  if (u.flow.z > 0.0001) {
    let ang = vnoise(q * 1.8 + vec2f(u.flow.w * 0.02, u.flow.w * -0.013)) * TAU * 2.0;
    vel = vel + vec2f(cos(ang), sin(ang)) * u.flow.z * 0.12;
  }
  let p = vec2f(gid.xy) + 0.5 - vel;
  var c: vec2f;
  var pi = vec2i(x, y);
  if (dot(vel, vel) > 0.0004) {
    c = bilin(p);
    pi = vec2i(floor(p));
  } else {
    c = at(x, y);
  }

  let c0 = at(pi.x, pi.y);
  let n = at(pi.x, pi.y + 1);
  let so = at(pi.x, pi.y - 1);
  let e = at(pi.x + 1, pi.y);
  let w = at(pi.x - 1, pi.y);
  let ne = at(pi.x + 1, pi.y + 1);
  let nw = at(pi.x - 1, pi.y + 1);
  let se = at(pi.x + 1, pi.y - 1);
  let sw = at(pi.x - 1, pi.y - 1);
  var lap = (n + so + e + w) * 0.2 + (ne + nw + se + sw) * 0.05 - c0;

  // Orientation: diffusion faster along a direction (linear / radial / circular).
  let an = u.aniso.x;
  if (an > 0.001) {
    var d = u.aniso.yz;
    let om = i32(u.aniso.w);
    if (om >= 1) {
      let rq = normalize(q + vec2f(1e-5, 0.0));
      d = select(rq, vec2f(-rq.y, rq.x), om == 2);
    }
    let uxx = e + w - 2.0 * c0;
    let uyy = n + so - 2.0 * c0;
    let uxy = (ne + sw - nw - se) * 0.25;
    let dd = d.x * d.x * uxx + 2.0 * d.x * d.y * uxy + d.y * d.y * uyy;
    let pp = uxx + uyy - dd;
    lap = lap + an * 0.5 * (dd - pp);
  }

  // Style map: blend the species regime with a drifting second regime.
  let m = styleMask(uv, q) * u.rd2.w;
  // Ripple layer: crests feed growth, steep wave fronts raise kill, so the
  // waves visibly reshape the pattern rather than just sliding over it.
  let rv = textureSampleLevel(rippleTex, samp, vec2f(uv.x, 1.0 - uv.y), 0.0);
  let F = clamp(mix(u.rd.x, u.rd2.y, m) + u.wave.x * rv.x, 0.006, 0.1);
  let K = clamp(mix(u.rd.y, u.rd2.z, m) + u.wave.y * length(rv.yz), 0.03, 0.08);
  var A = c.x;
  var B = c.y;
  let r = A * B * B;
  A = A + (u.rd.z * lap.x - r + F * (1.0 - A)) * u.rd2.x;
  B = B + (u.rd.w * lap.y + r - (F + K) * B) * u.rd2.x;

  A = mix(A, 0.5, s);
  B = mix(B, 1.0, s);

  // Fluidica: hold a diamond lattice (refracted by the ripples) until a
  // bass-drop releases it into a branching web.
  let pin = u.wave.z;
  if (pin > 0.001) {
    let gN = u.wave.w;
    let gq = q + vec2f(rv.y, -rv.z) * u.wave2.y;
    let d1 = abs(fract((gq.x + gq.y) * gN) - 0.5);
    let d2 = abs(fract((gq.x - gq.y) * gN) - 0.5);
    let dl = min(d1, d2);
    let pxw = 1.5 * gN * u.res.w;
    let line = 1.0 - smoothstep(u.wave2.x, u.wave2.x + pxw, dl);
    B = mix(B, max(B * (0.15 + 0.85 * line), line * 0.42), pin * 0.22);
    A = mix(A, mix(1.0, 0.45, line), pin * 0.22);
  }

  let minSide = min(u.res.x, u.res.y);
  let bd = (uv - u.pts.zw) * u.res.xy;
  let beat = u.lock.w * exp(-dot(bd, bd) / max(minSide * minSide * 0.014, 1.0));
  B = mix(B, 1.0, beat * 0.9);
  A = mix(A, 0.48, beat * 0.5);

  // Onsets plant soft seeds (n-fold symmetric for mandala looks).
  let sym = u.style.w;
  for (var k = 0; k < 8; k = k + 1) {
    let sd = u.seeds[k];
    if (sd.w > 0.0001) {
      var a0 = q;
      var b0 = (sd.xy - 0.5) * vec2f(aspect, 1.0);
      if (sym > 1.5) {
        a0 = fold(a0, sym, 0.0);
        b0 = fold(b0, sym, 0.0);
      }
      let t = length(a0 - b0) / max(sd.z, 0.002);
      let disk = 1.0 - smoothstep(0.55, 1.0, t);
      B = mix(B, 1.0, disk * sd.w);
      A = mix(A, 0.5, disk * sd.w * 0.5);
    }
  }

  if (u.lock.x > 0.5) {
    let locked = lockB[u32(y) * W + u32(x)];
    let plant = s * 0.62 * u.lock.y;
    B = mix(B, max(B, locked.y), plant);
    A = mix(A, mix(A, locked.x, 0.6), plant);
    let dp = (uv - u.pts.xy) * u.res.xy;
    let radial = exp(-dot(dp, dp) / max(minSide * minSide * 0.05, 1.0));
    let bloom = radial * u.lock.z * 0.4;
    B = mix(B, max(B, locked.y), bloom);
    A = mix(A, locked.x, bloom * 0.5);
  }

  if (u.img.x > 0.5) {
    let im = textureSampleLevel(imgTex, samp, vec2f(uv.x, 1.0 - uv.y), 0.0).rgb;
    let lum = dot(im, vec3f(0.299, 0.587, 0.114));
    let mixAmt = u.img.y;
    if (u.img.z < 0.5) {
      A = mix(A, lum, mixAmt * 0.03);
    } else if (u.img.z < 1.5) {
      B = mix(B, max(B, lum * 0.28), mixAmt * 0.08);
      A = mix(A, 1.0 - lum * 0.35, mixAmt * 0.015);
    } else {
      B = B * mix(1.0, smoothstep(0.05, 0.55, lum), mixAmt);
      A = mix(A, max(A, lum), mixAmt * 0.02);
    }
  }

  let nz = hash21(vec2f(gid.xy) + vec2f(floor(u.flow.w * 6.0) * 17.0, 3.0));
  B = B + (nz - 0.5) * 0.00045;
  dst[u32(y) * W + u32(x)] = vec2f(clamp(A, 0.0, 1.0), clamp(B, 0.0, 1.0));
}
`;

/**
 * Ripple layer: low-res 2D wave equation, ping-pong (h, hPrev). Impulses are
 * Gaussian kicks (onsets at the centre, touches where they land). Edges are
 * damped so rings fade instead of reflecting. Grid is top-down (y down).
 */
export const WAVE = /* wgsl */ `
struct WaveU {
  res: vec4f,              // w, h, 1/w, 1/h
  p: vec4f,                // c², damping, substep impulse scale, aspect
  imp: array<vec4f, 4>,    // x, y (0..1, y down), radius (0..1 of height), amplitude
};
@group(0) @binding(0) var<uniform> u: WaveU;
@group(0) @binding(1) var<storage, read> src: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec2f>;

fn hAt(x: i32, y: i32) -> f32 {
  let w = i32(u.res.x);
  let h = i32(u.res.y);
  return src[u32(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1))].x;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = u32(u.res.x);
  let H = u32(u.res.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  let c = src[gid.y * W + gid.x];
  let lap = hAt(x + 1, y) + hAt(x - 1, y) + hAt(x, y + 1) + hAt(x, y - 1) - 4.0 * c.x;
  var nh = (2.0 * c.x - c.y + u.p.x * lap) * u.p.y;
  let ex = f32(min(min(x, i32(W) - 1 - x), min(y, i32(H) - 1 - y)));
  nh = nh * mix(0.86, 1.0, clamp(ex / 10.0, 0.0, 1.0));
  let uv = (vec2f(gid.xy) + 0.5) * u.res.zw;
  for (var k = 0; k < 4; k = k + 1) {
    let im = u.imp[k];
    if (abs(im.w) > 0.00001) {
      let d = length((uv - im.xy) * vec2f(u.p.w, 1.0)) / max(im.z, 0.004);
      nh = nh + im.w * u.p.z * exp(-d * d);
    }
  }
  dst[gid.y * W + gid.x] = vec2f(clamp(nh, -4.0, 4.0), c.x);
}
`;

/** Ripple height + gradient into a filterable texture for the sim and scene. */
export const WPACK = /* wgsl */ `
struct WaveU {
  res: vec4f,
  p: vec4f,
  imp: array<vec4f, 4>,
};
@group(0) @binding(0) var<uniform> u: WaveU;
@group(0) @binding(1) var<storage, read> state: array<vec2f>;
@group(0) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;

fn hAt(x: i32, y: i32) -> f32 {
  let w = i32(u.res.x);
  let h = i32(u.res.y);
  return state[u32(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1))].x;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = u32(u.res.x);
  let H = u32(u.res.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  let h = hAt(x, y);
  let gx = (hAt(x + 1, y) - hAt(x - 1, y)) * 0.5;
  let gy = (hAt(x, y + 1) - hAt(x, y - 1)) * 0.5;
  textureStore(outTex, gid.xy, vec4f(h, gx, gy, 1.0));
}
`;

/** Copy chemistry + lock ghosts into a filterable rgba16float texture for display. */
export const PACK = /* wgsl */ `
struct PackU {
  res: vec4f,      // w, h, 0, 0
  weights: vec4f,  // per lock slot display weight (0 = unused)
};
@group(0) @binding(0) var<uniform> u: PackU;
@group(0) @binding(1) var<storage, read> state: array<vec2f>;
@group(0) @binding(2) var<storage, read> l0: array<vec2f>;
@group(0) @binding(3) var<storage, read> l1: array<vec2f>;
@group(0) @binding(4) var<storage, read> l2: array<vec2f>;
@group(0) @binding(5) var<storage, read> l3: array<vec2f>;
@group(0) @binding(6) var outTex: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = u32(u.res.x);
  let H = u32(u.res.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let i = gid.y * W + gid.x;
  let c = state[i];
  var ghost = 0.0;
  if (u.weights.x > 0.0) { ghost = ghost + u.weights.x * smoothstep(0.01, 0.46, l0[i].y); }
  if (u.weights.y > 0.0) { ghost = ghost + u.weights.y * smoothstep(0.01, 0.46, l1[i].y); }
  if (u.weights.z > 0.0) { ghost = ghost + u.weights.z * smoothstep(0.01, 0.46, l2[i].y); }
  if (u.weights.w > 0.0) { ghost = ghost + u.weights.w * smoothstep(0.01, 0.46, l3[i].y); }
  // Row 0 of the state is the bottom of the field; textures are top-down.
  textureStore(outTex, vec2u(gid.x, H - 1u - gid.y), vec4f(c.x, c.y, ghost, 1.0));
}
`;

/** Bilinear resample of the chemistry when the grid size changes. */
export const RESAMPLE = /* wgsl */ `
struct RsU { src: vec4f, dst: vec4f };
@group(0) @binding(0) var<uniform> u: RsU;
@group(0) @binding(1) var<storage, read> a: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> b: array<vec2f>;

fn at(x: i32, y: i32) -> vec2f {
  let w = i32(u.src.x);
  let h = i32(u.src.y);
  let xx = ((x % w) + w) % w;
  let yy = ((y % h) + h) % h;
  return a[u32(yy * w + xx)];
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let W = u32(u.dst.x);
  let H = u32(u.dst.y);
  if (gid.x >= W || gid.y >= H) { return; }
  let uv = (vec2f(gid.xy) + 0.5) / u.dst.xy;
  let p = uv * u.src.xy - 0.5;
  let i = floor(p);
  let f = p - i;
  let ix = i32(i.x);
  let iy = i32(i.y);
  let v = mix(mix(at(ix, iy), at(ix + 1, iy), f.x), mix(at(ix, iy + 1), at(ix + 1, iy + 1), f.x), f.y);
  b[gid.y * W + gid.x] = v;
}
`;

/** 16×16 coarse grid of mean (A, B) for the audio/stat probes. */
export const STATS = /* wgsl */ `
struct StU { res: vec4f };
@group(0) @binding(0) var<uniform> u: StU;
@group(0) @binding(1) var<storage, read> state: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> outGrid: array<vec2f>;

@compute @workgroup_size(16, 16)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let W = u32(u.res.x);
  let H = u32(u.res.y);
  var acc = vec2f(0.0);
  for (var j = 0u; j < 8u; j = j + 1u) {
    for (var i = 0u; i < 8u; i = i + 1u) {
      let x = min(W - 1u, ((lid.x * 8u + i) * W) / 128u);
      let y = min(H - 1u, ((lid.y * 8u + j) * H) / 128u);
      acc = acc + state[y * W + x];
    }
  }
  outGrid[lid.y * 16u + lid.x] = acc / 64.0;
}
`;

const VIEW = /* wgsl */ `
struct ViewU {
  res: vec4f,     // w, h, 1/w, 1/h
  sim: vec4f,     // simW, simH, 1/simW, 1/simH
  time: vec4f,    // t, aspect, flash, reducedMotion
  look: vec4f,    // material, emboss, specular, edge
  look2: vec4f,   // crisp, lutShift, glow, threshold
  kal: vec4f,     // mode, foldOrder, rot, coreR
  audio: vec4f,   // rms, bass, centroid, onset
  light: vec4f,   // lx, ly, lz, playHue
  fx: vec4f,      // bloom, haze, grain, vignette
  tint: vec4f,    // haze rgb, playAmp
  ripples: array<vec4f, 8>, // x, y (0..1, y down), age, strength
  lp0: vec4f,     // roughness, thin-film strength, film phase, wrap
  lp1: vec4f,     // cavity AO, emissive gain, key intensity, fill intensity
  keyc: vec4f,    // key rgb (warm), faux SSS
  fillc: vec4f,   // fill rgb (cool), fine normal noise
  rip: vec4f,     // ripple refraction, grid glow, grid N, breathing warp
  modal: vec4f,   // bass, mid, high band amplitudes, modal strength
  modal2: vec4f,  // tighten (centroid), shatter glow, ripple normal gain, grid width
  bw: vec4f,      // bloom level weights (½, ¼, ⅛), bright-pass threshold
};
@group(0) @binding(0) var<uniform> u: ViewU;

@vertex
fn vsFull(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  var pts = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(pts[vi], 0.0, 1.0);
}
`;

export const SCENE = NOISE + VIEW + /* wgsl */ `
@group(0) @binding(1) var fieldTex: texture_2d<f32>;
@group(0) @binding(2) var lutTex: texture_2d<f32>;
@group(0) @binding(3) var sampRep: sampler;
@group(0) @binding(4) var sampClamp: sampler;
@group(0) @binding(5) var rippleTex: texture_2d<f32>;

// ---- Lighting pass helpers (video-informed looks) ----
fn schlick(cosT: f32, f0: f32) -> f32 {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(cosT, 0.0, 1.0), 5.0);
}
// GGX / Trowbridge-Reitz with Schlick-Smith visibility; view is +z (screen).
fn ggx(n: vec3f, l: vec3f, rough: f32) -> f32 {
  let vv = vec3f(0.0, 0.0, 1.0);
  let hv = normalize(l + vv);
  let a = max(rough * rough, 0.002);
  let a2 = a * a;
  let nh = max(dot(n, hv), 0.0);
  let dd = nh * nh * (a2 - 1.0) + 1.0;
  let D = a2 / (PI * dd * dd);
  let nl = max(dot(n, l), 0.0);
  let nv = max(n.z, 0.001);
  let k = a * 0.5;
  let G = (nl / (nl * (1.0 - k) + k)) * (nv / (nv * (1.0 - k) + k));
  return D * G / max(4.0 * nv, 0.004);
}
fn wrapDiffuse(n: vec3f, l: vec3f, w: f32) -> f32 {
  return max((dot(n, l) + w) / (1.0 + w), 0.0);
}
// Signed distance to the nearest hex-cell edge (cells of inradius 0.5).
fn hexEdge(p: vec2f) -> f32 {
  let r = vec2f(1.0, 1.7320508);
  let hr = r * 0.5;
  let a = p - r * floor(p / r) - hr;
  let pb = p - hr;
  let b = pb - r * floor(pb / r) - hr;
  let g = select(b, a, dot(a, a) < dot(b, b));
  let ga = abs(g);
  return 0.5 - max(dot(ga, vec2f(0.5, 0.8660254)), ga.x);
}

fn lut(t: f32) -> vec3f {
  return textureSampleLevel(lutTex, sampClamp, vec2f(clamp(t, 0.0, 1.0) * 0.996 + 0.002, 0.25), 0.0).rgb;
}
fn lutWrap(t: f32) -> vec3f {
  return textureSampleLevel(lutTex, sampRep, vec2f(fract(t), 0.25), 0.0).rgb;
}
fn accent(t: f32) -> vec3f {
  return textureSampleLevel(lutTex, sampRep, vec2f(fract(t), 0.75), 0.0).rgb;
}
fn fieldAt(uv: vec2f) -> vec4f {
  return textureSampleLevel(fieldTex, sampRep, uv, 0.0);
}
fn hueRotate(c: vec3f, a: f32) -> vec3f {
  let k = vec3f(0.57735);
  let ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

@fragment
fn fsScene(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let aspect = u.time.y;
  let uv = fc.xy * u.res.zw;                 // y down, matches the field texture
  let q = (uv - 0.5) * vec2f(aspect, 1.0);
  let r = length(q);
  let mode = u.kal.x;
  let order = u.kal.y;
  let o0 = floor(order);
  let ofr = fract(order);
  let rot = u.kal.z;
  let coreR = u.kal.w;

  // Kaleidoscopic symmetry of the domain (core only, or full field).
  let k0 = fold(q, o0, rot);
  let k1 = fold(q, o0 + 1.0, rot);
  let kq = select(k0, k1, ofr > 0.5);
  var kMix = 0.0;
  if (mode > 1.5) { kMix = 1.0; }
  else if (mode > 0.5) { kMix = 1.0 - smoothstep(coreR * 0.97, coreR, r); }
  let fq = mix(q, kq * 0.92, kMix);
  // Ripple layer refracts where the field is sampled; Oscillators also breathe.
  let rv = textureSampleLevel(rippleTex, sampClamp, uv, 0.0);
  let wv = u.rip.w * vec2f(sin(q.y * 2.7 + u.time.x * 0.31), cos(q.x * 2.3 - u.time.x * 0.27));
  let suv = fq / vec2f(aspect, 1.0) + 0.5 + rv.yz * u.rip.x + wv;

  let st = fieldAt(suv);
  let v = st.y;
  // Derivative-based anti-aliasing: crisp at any zoom, never mushy.
  let aa = max(fwidth(v) * 1.1, 0.0012);
  let th = u.look2.w;
  let fill = smoothstep(th - aa, th + aa, v);
  let tone = clamp(v * 2.4, 0.0, 1.0);
  let crisp = u.look2.x;
  let t = mix(tone, fill * 0.8 + tone * 0.2, crisp);

  // Height-map lighting (emboss) from one-texel gradients of B.
  let px = u.sim.zw;
  let gx = fieldAt(suv + vec2f(px.x, 0.0)).y - fieldAt(suv - vec2f(px.x, 0.0)).y;
  let gy = fieldAt(suv + vec2f(0.0, px.y)).y - fieldAt(suv - vec2f(0.0, px.y)).y;
  let E = 2.0 + u.look.y * 10.0;
  let nrm = normalize(vec3f(-gx * E, -gy * E, 1.0)); // screen space, y down
  let L = normalize(u.light.xyz);
  let diff = max(dot(nrm, L), 0.0);
  let spec = pow(max(dot(reflect(-L, nrm), vec3f(0.0, 0.0, 1.0)), 0.0), 18.0 + 46.0 * u.look.z) * u.look.z;
  let thread = 1.0 - smoothstep(0.0, aa * 1.6, abs(v - th));
  let iso = abs(fract(v * 6.0 + 0.5) - 0.5) / 6.0;
  // No iso lines on the empty ground (B≈0), where noise made them speckle.
  let isoLine = (1.0 - smoothstep(0.0, aa * 1.3, iso)) * smoothstep(0.02, 0.06, v);

  let mat = i32(u.look.x);
  let edge = u.look.w;
  let cen = u.audio.z;
  let bass = u.audio.y;
  let tm = u.time.x;
  var col = lut(t);

  if (mat == 0) {
    col = col * (0.82 + 0.26 * diff) + lut(0.72) * thread * edge * 0.35 + spec * 0.25;
  } else if (mat == 1) {
    col = col * (0.5 + 0.62 * diff) + spec * 0.65 + isoLine * edge * vec3f(0.85, 0.9, 1.0) * 0.55;
  } else if (mat == 2) {
    col = col * (0.22 + 1.0 * diff) + spec * vec3f(1.0, 0.86, 0.56);
    col = col * (1.0 - thread * 0.4);
    col = hueRotate(col, (cen - 0.4) * 0.25);
    // Heart of the figure: iridescent mandala core + moiré halo.
    let petal = cos(atan2(k0.y, k0.x) * 2.0 * o0) * 0.5 + 0.5;
    let iris = accent(r * 3.2 - tm * 0.04 + petal * 0.12 + cen * 0.35 + v * 0.6);
    let core = 1.0 - smoothstep(coreR * 0.94, coreR, r);
    let irisLit = iris * (0.35 + 0.9 * diff) * (0.55 + 0.6 * fill) + spec * 0.8;
    col = mix(col, irisLit, core);
    let moire = 0.5 + 0.5 * cos(r * 160.0) * cos(length(q - vec2f(0.01 * sin(tm * 0.17), 0.0)) * 166.0);
    let halo = smoothstep(coreR * 1.7, coreR * 1.05, r) * smoothstep(coreR, coreR * 1.05, r);
    col = col + halo * moire * vec3f(1.0, 0.8, 0.4) * 0.16;
  } else if (mat == 3) {
    let refl = t * 0.9 + nrm.x * 0.45 + nrm.y * 0.3 + u.look2.y;
    let c = lutWrap(refl);
    let fres = pow(1.0 - nrm.z, 2.0);
    // Metal only where the pattern stands; the empty field is a dark, tinted mirror.
    let body = smoothstep(0.015, max(th, 0.05), v);
    col = c * (0.42 + 0.6 * diff) + vec3f(spec * 1.3) + fres * 0.25;
    col = mix(c * 0.07 + vec3f(0.012, 0.01, 0.02), col, body);
    col = col * (1.0 - thread * 0.55);
  } else if (mat == 4) {
    col = col * (0.45 + 0.55 * diff) + thread * edge * vec3f(0.35, 1.0, 0.95) * 0.9 + spec * 0.3;
    var beams = 0.0;
    for (var k = 0; k < 5; k = k + 1) {
      let fk = f32(k);
      let origin = vec2f((fk - 2.0) * 0.32 * aspect, -0.62);
      let ang = 1.5708 + sin(tm * 0.05 + fk * 1.7) * 0.4 + u.light.x * 0.15;
      let dir = vec2f(cos(ang), sin(ang));
      let d = q - origin;
      let along = dot(d, dir);
      let perp = abs(d.x * dir.y - d.y * dir.x);
      let width = 0.012 + max(along, 0.0) * 0.06;
      beams = beams + exp(-perp * perp / (width * width)) * smoothstep(0.0, 0.1, along) * exp(-along * 0.9) * (0.6 + 0.4 * sin(tm * 0.21 + fk * 2.1));
    }
    col = col + beams * vec3f(0.1, 0.85, 0.8) * (0.25 + 0.75 * (1.0 - fill)) * (0.35 + bass * 0.7);
  } else if (mat == 5) {
    col = col * (0.42 + 0.66 * diff) + spec * 0.45;
    col = col + thread * edge * accent(atan2(k0.y, k0.x) / TAU * 2.0 + r * 1.5 - tm * 0.03 + cen);
    let moire = 0.5 + 0.5 * cos(r * 170.0) * cos(length(q - vec2f(0.0, 0.01 * sin(tm * 0.13))) * 177.0);
    let halo = smoothstep(0.62, 0.48, r) * smoothstep(0.36, 0.46, r);
    col = col + halo * moire * vec3f(0.7, 0.3, 1.0) * 0.14;
    col = col + (1.0 - smoothstep(0.0, 0.07, r)) * accent(tm * 0.02 + cen) * (0.25 + bass * 0.35);
  } else if (mat == 6) {
    col = lutWrap(t + u.look2.y) * (0.58 + 0.52 * diff) + spec * 0.35 + thread * edge * lutWrap(t + 0.5 + u.look2.y) * 0.6;
  } else if (mat == 7) {
    col = col * (0.4 + 0.72 * diff) + spec * 0.5 + thread * edge * vec3f(1.0, 0.9, 0.6) * 0.7;
  } else {
    // ---- Lighting pass: height/normal from the RD field (+ ripple heights).
    let rg = u.modal2.z;
    let Ek = 3.0 + u.look.y * 14.0;
    var nL = normalize(vec3f(-gx * Ek - rv.y * rg, -gy * Ek - rv.z * rg, 1.0));
    if (u.fillc.w > 0.0) {
      let nn = vec2f(hash21(floor(suv * u.sim.xy)), hash21(floor(suv * u.sim.xy) + 17.0)) - 0.5;
      nL = normalize(nL + vec3f(nn * u.fillc.w, 0.0));
    }
    let Lk = L;
    let Lf = normalize(vec3f(0.75, 0.25, 0.55));
    let ndv = clamp(nL.z, 0.0, 1.0);
    let rough = u.lp0.x;
    let o3 = px * 3.0;
    let blurB = (fieldAt(suv + o3).y + fieldAt(suv - o3).y + fieldAt(suv + vec2f(o3.x, -o3.y)).y + fieldAt(suv + vec2f(-o3.x, o3.y)).y) * 0.25;
    let cav = mix(1.0, clamp(1.0 - max(blurB - v, 0.0) * 7.0, 0.0, 1.0), u.lp1.x);
    let keyS = ggx(nL, Lk, rough) * u.lp1.z;
    let fillS = ggx(nL, Lf, min(1.0, rough * 1.5)) * u.lp1.w;
    let kd = wrapDiffuse(nL, Lk, u.lp0.w);
    let fd = wrapDiffuse(nL, Lf, u.lp0.w);
    let fres = schlick(ndv, 0.04);
    let em = u.lp1.y;

    if (mat == 8) {
      // Iridescent: inky navy body, thin-film cyan→magenta→gold by Fresnel.
      let film = accent(u.lp0.z + (1.0 - ndv) * 1.7 + v * 0.9 + tm * 0.008 + cen * 0.15);
      col = lut(t) * (0.35 + 0.65 * kd) * cav;
      let bodyI = smoothstep(0.02, th + 0.08, v);
      col = col + film * u.lp0.y * (0.18 + 1.1 * fres) * (0.06 + 0.94 * bodyI);
      col = col + u.keyc.rgb * keyS + u.fillc.rgb * fillS;
      col = col + film * isoLine * edge * 0.55 * em + film * thread * 0.35 * em;
    } else if (mat == 9) {
      // Oscillators: slate-teal valleys → peach/gold peaks, velvet + cavity AO.
      let roll = sin(q.x * 3.1 + tm * 0.21) * cos(q.y * 2.3 - tm * 0.17);
      let H = clamp(v * 2.2, 0.0, 1.0) * 0.72 + (roll * 0.5 + 0.5) * 0.28;
      let pal = lut(smoothstep(0.04, 0.96, H));
      let sheen = pow(1.0 - ndv, 3.0) * 0.25;
      let sss = u.keyc.rgb * pow(H, 3.0) * u.keyc.w * (0.4 + 0.6 * (1.0 - kd));
      col = pal * (0.1 + kd * u.lp1.z * u.keyc.rgb + fd * u.lp1.w * u.fillc.rgb) * cav;
      col = col + sss + sheen * u.fillc.rgb + vec3f(keyS * 0.25);
    } else if (mat == 10) {
      // Hex Cymatic: dark glossy base, AA hex grid refracted by ripples,
      // modal sin(nx)sin(my) web keyed to the bands, HDR amber glow.
      col = lut(t) * 0.3 * (0.4 + 0.6 * kd) * cav + u.keyc.rgb * keyS * 0.5 + u.fillc.rgb * fillS * 0.4;
      let gp = (q + rv.yz * u.rip.x * 1.8) * u.rip.z;
      let he = hexEdge(gp);
      let aaH = max(fwidth(he) * 1.2, 0.0008);
      let gw = u.modal2.w;
      let hexL = 1.0 - smoothstep(gw - aaH, gw + aaH, he);
      let tq = gp * 2.0;
      let t1 = abs(fract(tq.x) - 0.5);
      let t2 = abs(fract(dot(tq, vec2f(0.5, 0.8660254))) - 0.5);
      let t3 = abs(fract(dot(tq, vec2f(-0.5, 0.8660254))) - 0.5);
      let tri = min(t1, min(t2, t3));
      let aaT = max(fwidth(tri) * 1.2, 0.0008);
      let triL = (1.0 - smoothstep(gw * 0.5 - aaT, gw * 0.5 + aaT, tri)) * 0.18;
      let centreW = 0.3 + 0.7 * (1.0 - smoothstep(0.15, 0.85, r));
      let mx = q * 2.0;
      let tg = u.modal2.x;
      let n1 = 2.0 + tg;
      let n2 = 4.0 + tg * 2.0;
      let n3 = 7.0 + tg * 3.0;
      // Antisymmetric pairs of sin(nx)·sin(my) modes give Chladni nodal webs;
      // each audio band weights one mode, centroid "tightens" the order.
      let a1 = cos(n1 * PI * mx.x) * cos((n1 + 2.0) * PI * mx.y) + cos((n1 + 2.0) * PI * mx.x) * cos(n1 * PI * mx.y);
      let a2 = sin(n2 * PI * mx.x) * sin((n2 + 3.0) * PI * mx.y) + sin((n2 + 3.0) * PI * mx.x) * sin(n2 * PI * mx.y);
      let a3 = cos(n3 * PI * length(mx)) * 0.7;
      let mval = u.modal.x * a1 + u.modal.y * a2 + u.modal.z * a3;
      let aaM = max(fwidth(mval) * 1.2, 0.0015);
      let web = (1.0 - smoothstep(0.0, aaM * 1.5 + 0.004, abs(mval))) * u.modal.w * (1.0 - smoothstep(0.35, 0.8, r));
      let glow = accent(0.3 + v * 0.5 + cen * 0.2);
      let pulse = 0.55 + bass * 0.9 + abs(rv.x) * 0.8;
      col = col + glow * (hexL + triL) * u.rip.y * pulse * em * centreW;
      col = col + accent(0.7) * web * em * 0.6;
      col = col + glow * thread * edge * em * 0.4;
    } else {
      // Fluidica: #080C16 oily liquid, silver Fresnel highlights, gold web.
      let base = vec3f(0.031, 0.047, 0.086) * (0.55 + 0.45 * (1.0 - smoothstep(0.1, 0.9, r)));
      col = base * (0.5 + 0.5 * kd);
      col = col + u.fillc.rgb * fres * (0.55 + 0.9 * fd) + u.fillc.rgb * fillS + u.keyc.rgb * keyS * 0.6;
      let body = smoothstep(th - aa, th + aa, v);
      let hot = smoothstep(0.12, 0.5, v);
      let webC = lut(0.45 + 0.55 * hot);
      col = col + webC * (body * 0.3 + thread * 0.7 + hot * hot * 0.25) * em * (0.75 + 0.35 * bass) * cav;
      col = col + webC * u.modal2.y * smoothstep(0.0, 0.6, abs(rv.x));
    }
  }

  // MorphoMark ghosts.
  col = col + lut(0.78) * st.z * 0.45;

  // Onsets: soft contour ripples that travel along the edges, never a flash.
  var ring = 0.0;
  for (var k = 0; k < 8; k = k + 1) {
    let rp = u.ripples[k];
    if (rp.w > 0.001) {
      let d = length(q - (rp.xy - 0.5) * vec2f(aspect, 1.0));
      let x = (d - rp.z * 0.28) * 16.0;
      ring = ring + exp(-x * x) * exp(-rp.z * 1.3) * rp.w;
    }
  }
  col = col + (thread * 0.7 + 0.05) * ring * lut(0.92);

  let pa = u.tint.w;
  if (pa > 0.001) {
    col = hueRotate(col, u.light.w) * (1.0 + pa * 0.18);
  }
  col = col + vec3f(u.time.z) * 0.06;
  return vec4f(max(col, vec3f(0.0)), 1.0);
}
`;

export const BLOOM = VIEW + /* wgsl */ `
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var sampClamp: sampler;

fn tap(uv: vec2f) -> vec3f {
  let c = textureSampleLevel(sceneTex, sampClamp, uv, 0.0).rgb;
  let l = max(c.r, max(c.g, c.b));
  // Per-look bright-pass knee; bass lowers it a touch.
  let th = u.bw.w - u.audio.y * 0.08;
  return c * smoothstep(th, th + 0.7, l);
}

// Down-sample + 9-tap tent (no threshold) for the ¼ and ⅛ bloom levels.
@fragment
fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dims = vec2f(max(textureDimensions(sceneTex) / 2u, vec2u(1u)));
  let uv = fc.xy / dims;
  let p = 1.0 / vec2f(textureDimensions(sceneTex));
  var c = textureSampleLevel(sceneTex, sampClamp, uv, 0.0).rgb * 0.25;
  c = c + (textureSampleLevel(sceneTex, sampClamp, uv + vec2f(p.x * 1.5, 0.0), 0.0).rgb
         + textureSampleLevel(sceneTex, sampClamp, uv - vec2f(p.x * 1.5, 0.0), 0.0).rgb
         + textureSampleLevel(sceneTex, sampClamp, uv + vec2f(0.0, p.y * 1.5), 0.0).rgb
         + textureSampleLevel(sceneTex, sampClamp, uv - vec2f(0.0, p.y * 1.5), 0.0).rgb) * 0.125;
  c = c + (textureSampleLevel(sceneTex, sampClamp, uv + p * 1.5, 0.0).rgb
         + textureSampleLevel(sceneTex, sampClamp, uv - p * 1.5, 0.0).rgb
         + textureSampleLevel(sceneTex, sampClamp, uv + vec2f(p.x, -p.y) * 1.5, 0.0).rgb
         + textureSampleLevel(sceneTex, sampClamp, uv + vec2f(-p.x, p.y) * 1.5, 0.0).rgb) * 0.0625;
  return vec4f(c * (0.98 + u.bw.x * 0.0), 1.0);
}

@fragment
fn fsBloom(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dims = vec2f(max(textureDimensions(sceneTex) / 2u, vec2u(1u)));
  let uv = fc.xy / dims;
  let p = 2.0 / dims;
  var c = tap(uv) * 0.16;
  c = c + (tap(uv + vec2f(p.x, 0.0)) + tap(uv - vec2f(p.x, 0.0)) + tap(uv + vec2f(0.0, p.y)) + tap(uv - vec2f(0.0, p.y))) * 0.1;
  c = c + (tap(uv + p) + tap(uv - p) + tap(uv + vec2f(p.x, -p.y)) + tap(uv + vec2f(-p.x, p.y))) * 0.065;
  let p2 = p * 2.2;
  c = c + (tap(uv + vec2f(p2.x, 0.0)) + tap(uv - vec2f(p2.x, 0.0)) + tap(uv + vec2f(0.0, p2.y)) + tap(uv - vec2f(0.0, p2.y))) * 0.045;
  return vec4f(c, 1.0);
}
`;

export const FINAL = NOISE + VIEW + /* wgsl */ `
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var bloomTex: texture_2d<f32>;
@group(0) @binding(3) var sampClamp: sampler;
@group(0) @binding(4) var bloom2: texture_2d<f32>;
@group(0) @binding(5) var bloom3: texture_2d<f32>;

fn soft(c: f32) -> f32 {
  return select(c, 0.82 + 0.18 * (1.0 - exp(-(c - 0.82) / 0.18)), c > 0.82);
}

@fragment
fn fsFinal(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy * u.res.zw;
  let aspect = u.time.y;
  let q = (uv - 0.5) * vec2f(aspect, 1.0);
  // Exact pixel fetch: the field is never filtered on the way out.
  var col = textureLoad(sceneTex, vec2i(fc.xy), 0).rgb;
  let b = textureSampleLevel(bloomTex, sampClamp, uv, 0.0).rgb * u.bw.x
        + textureSampleLevel(bloom2, sampClamp, uv, 0.0).rgb * u.bw.y
        + textureSampleLevel(bloom3, sampClamp, uv, 0.0).rgb * u.bw.z;
  col = col + b * u.fx.x * (1.0 + u.audio.y * 0.8 + u.audio.x * 0.4);
  let tm = u.time.x;
  let hz = vnoise(q * 1.4 + vec2f(tm * 0.011, -tm * 0.007)) * vnoise(q * 3.1 - vec2f(tm * 0.006, 0.0));
  col = col + hz * u.fx.y * u.tint.rgb * (0.6 + u.audio.y * 0.5);
  let vig = 1.0 - smoothstep(0.45, 1.35, length(q / vec2f(max(aspect, 1.0), 1.0)) * 1.1) * u.fx.w;
  col = col * vig;
  col = vec3f(soft(col.r), soft(col.g), soft(col.b));
  col = col + (hash21(fc.xy + vec2f(fract(tm * 7.13) * 311.0, fract(tm * 3.7) * 177.0)) - 0.5) * u.fx.z;
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;
