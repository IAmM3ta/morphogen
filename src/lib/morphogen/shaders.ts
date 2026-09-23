export const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform sampler2D uImage;
uniform vec2 uResolution;
uniform float uFeed;
uniform float uKill;
uniform float uDu;
uniform float uDv;
uniform float uDt;
uniform vec2 uAdvect;
uniform float uHasImage;
uniform float uImageMix;
uniform float uImageMode;
uniform float uTime;
uniform vec4 uBrush[8];
uniform vec4 uTrail[8];
uniform sampler2D uLock;
uniform float uHasLock;
uniform float uLockGrow;
uniform float uMotion;
uniform float uLockImpulse;
uniform vec2 uLockPoint;
uniform float uBeat;
uniform vec2 uBeatAt;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 lap9(vec2 uv, vec2 px) {
  vec2 c  = texture(uPrev, uv).rg;
  vec2 n  = texture(uPrev, uv + vec2(0.0, px.y)).rg;
  vec2 s  = texture(uPrev, uv - vec2(0.0, px.y)).rg;
  vec2 e  = texture(uPrev, uv + vec2(px.x, 0.0)).rg;
  vec2 w  = texture(uPrev, uv - vec2(px.x, 0.0)).rg;
  vec2 ne = texture(uPrev, uv + vec2(px.x, px.y)).rg;
  vec2 nw = texture(uPrev, uv + vec2(-px.x, px.y)).rg;
  vec2 se = texture(uPrev, uv + vec2(px.x, -px.y)).rg;
  vec2 sw = texture(uPrev, uv + vec2(-px.x, -px.y)).rg;
  return (n + s + e + w) * 0.2 + (ne + nw + se + sw) * 0.05 - c;
}

float gauss(vec2 uv, vec2 c, float radius, vec2 res) {
  vec2 d = (uv - c) * res;
  float r = max(radius, 0.004) * min(res.x, res.y);
  float t = length(d) / r;
  return exp(-t * t * 2.6);
}

float finger(int i, vec2 uv, vec2 res) {
  vec4 b = uBrush[i];
  if (b.w <= 0.0001) return 0.0;
  vec2 d0 = (uv - b.xy) * res;
  float rad = max(b.z, 0.003) * min(res.x, res.y);
  float t0 = length(d0) / rad;
  return b.w * (1.0 - smoothstep(0.62, 1.0, t0));
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uResolution;
  vec2 wake = vec2(0.0);
  wake += uTrail[0].xy * finger(0, uv, uResolution);
  wake += uTrail[1].xy * finger(1, uv, uResolution);
  wake += uTrail[2].xy * finger(2, uv, uResolution);
  wake += uTrail[3].xy * finger(3, uv, uResolution);
  wake += uTrail[4].xy * finger(4, uv, uResolution);
  wake += uTrail[5].xy * finger(5, uv, uResolution);
  wake += uTrail[6].xy * finger(6, uv, uResolution);
  wake += uTrail[7].xy * finger(7, uv, uResolution);
  wake = clamp(wake, vec2(-0.06), vec2(0.06));
  vec2 sampleUv = fract(uv - uAdvect * px * 0.28 - wake * 1.6);
  vec2 chem = texture(uPrev, sampleUv).rg;
  vec2 lap = lap9(sampleUv, px);
  float u = chem.r;
  float v = chem.g;

  float s =
    finger(0, uv, uResolution) +
    finger(1, uv, uResolution) +
    finger(2, uv, uResolution) +
    finger(3, uv, uResolution) +
    finger(4, uv, uResolution) +
    finger(5, uv, uResolution) +
    finger(6, uv, uResolution) +
    finger(7, uv, uResolution);
  s = clamp(s, 0.0, 1.0);

  float uvv = u * v * v;
  float du = uDu * lap.x - uvv + uFeed * (1.0 - u);
  float dv = uDv * lap.y + uvv - (uFeed + uKill) * v;
  u += du * uDt;
  v += dv * uDt;

  u = mix(u, 0.50, s);
  v = mix(v, 1.0, s);

  vec2 bd = (uv - uBeatAt) * uResolution;
  float minSide = min(uResolution.x, uResolution.y);
  float beat = uBeat * exp(-dot(bd, bd) / max(minSide * minSide * 0.014, 1.0));
  v = mix(v, 1.0, beat * 0.9);
  u = mix(u, 0.48, beat * 0.5);

  if (uHasLock > 0.5) {
    vec2 locked = texture(uLock, uv).rg;
    float plant = s * 0.62 * uLockGrow;
    v = mix(v, max(v, locked.g), plant);
    u = mix(u, mix(u, locked.r, 0.6), plant);
    vec2 dp = (uv - uLockPoint) * uResolution;
    float minSide = min(uResolution.x, uResolution.y);
    float radial = exp(-dot(dp, dp) / max(minSide * minSide * 0.05, 1.0));
    float bloom = radial * uLockImpulse * 0.4;
    v = mix(v, max(v, locked.g), bloom);
    u = mix(u, locked.r, bloom * 0.5);
  }

  if (uHasImage > 0.5) {
    vec3 img = texture(uImage, vec2(uv.x, 1.0 - uv.y)).rgb;
    float lum = dot(img, vec3(0.299, 0.587, 0.114));
    float mixAmt = uImageMix;
    if (uImageMode < 0.5) {
      u = mix(u, lum, mixAmt * 0.03);
    } else if (uImageMode < 1.5) {
      v = mix(v, max(v, lum * 0.28), mixAmt * 0.08);
      u = mix(u, 1.0 - lum * 0.35, mixAmt * 0.015);
    } else {
      v *= mix(1.0, smoothstep(0.05, 0.55, lum), mixAmt);
      u = mix(u, max(u, lum), mixAmt * 0.02);
    }
  }

  float n = hash(uv * uResolution + floor(uTime * 6.0));
  v += (n - 0.5) * 0.00045;

  u = clamp(u, 0.0, 1.0);
  v = clamp(v, 0.0, 1.0);
  fragColor = vec4(u, v, 0.0, 1.0);
}
`;

export const SEED_FRAG = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uHasImage;
uniform sampler2D uImage;
uniform float uImageMix;
in vec2 vUv;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float blob(vec2 uv, vec2 c, float r, vec2 res) {
  vec2 d = (uv - c) * res;
  float rad = r * min(res.x, res.y);
  float t = length(d) / max(rad, 1.0);
  return 1.0 - smoothstep(0.55, 1.0, t);
}

void main() {
  vec2 uv = vUv;
  vec2 res = uResolution;
  float n = hash(uv * 73.1 + uTime);
  float n2 = hash(uv * 191.7 + 2.3);
  float u = 1.0;
  float v = 0.0;

  float ink = 0.0;
  ink = max(ink, blob(uv, vec2(0.50, 0.50), 0.090, res));
  ink = max(ink, blob(uv, vec2(0.32, 0.38), 0.070, res));
  ink = max(ink, blob(uv, vec2(0.68, 0.58), 0.065, res));
  ink = max(ink, blob(uv, vec2(0.42, 0.70), 0.055, res));
  ink = max(ink, blob(uv, vec2(0.62, 0.30), 0.050, res));
  ink = max(ink, blob(uv, vec2(0.22, 0.62), 0.048, res));
  ink = max(ink, blob(uv, vec2(0.78, 0.40), 0.046, res));
  ink = max(ink, blob(uv, vec2(0.38, 0.22), 0.040, res));
  ink = max(ink, blob(uv, vec2(0.58, 0.82), 0.038, res));
  v = ink * (0.92 + n2 * 0.08);
  u = mix(1.0, 0.50, ink);

  if (n > 0.972) {
    v = max(v, 0.85);
    u = min(u, 0.52);
  }

  if (uHasImage > 0.5) {
    vec3 img = texture(uImage, vec2(uv.x, 1.0 - uv.y)).rgb;
    float lum = dot(img, vec3(0.299, 0.587, 0.114));
    v = max(v, smoothstep(0.45, 0.85, lum) * 0.24 * uImageMix);
    u = mix(u, clamp(1.0 - lum * 0.4, 0.2, 1.0), uImageMix * 0.5);
  }

  fragColor = vec4(u, v, 0.0, 1.0);
}
`;

export const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform sampler2D uLock0;
uniform sampler2D uLock1;
uniform sampler2D uLock2;
uniform sampler2D uLock3;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uLP[16];
uniform float uLockCount;
uniform float uGlow;
uniform float uVignette;
uniform float uFlash;
uniform vec4 uSense;
uniform vec4 uPlay;
in vec2 vUv;
out vec4 fragColor;

vec3 paletteStops(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  t = clamp(t, 0.0, 1.0);
  float a = 0.3333;
  if (t < a) return mix(c0, c1, t / a);
  if (t < a * 2.0) return mix(c1, c2, (t - a) / a);
  return mix(c2, c3, (t - a) / a);
}

vec3 colorize(sampler2D field, vec3 c0, vec3 c1, vec3 c2, vec3 c3, float glowAmt, vec2 uv) {
  vec2 px = 1.0 / uResolution;
  vec2 chem = texture(field, uv).rg;
  float v = chem.g;
  float vN = texture(field, uv + vec2(0.0, px.y)).g;
  float vS = texture(field, uv - vec2(0.0, px.y)).g;
  float vE = texture(field, uv + vec2(px.x, 0.0)).g;
  float vW = texture(field, uv - vec2(px.x, 0.0)).g;
  float edge = abs(vN - vS) + abs(vE - vW);
  float sharp = clamp(v * 1.35 - (vN + vS + vE + vW) * 0.12, 0.0, 1.0);
  v = mix(v, sharp, 0.18);
  float body = smoothstep(0.05, 0.72, v);
  float rim = clamp(edge * 4.5, 0.0, 1.0);
  float t = clamp(body * 0.38 + rim * 0.34, 0.0, 0.9);
  vec3 col = paletteStops(t, c0, c1, c2, c3);
  vec3 nrm = normalize(vec3(-(vE - vW) * (2.2 + glowAmt), (vN - vS) * (2.2 + glowAmt), 0.28));
  float ndl = max(0.0, dot(nrm, normalize(vec3(-0.42, 0.68, 0.78))));
  col *= 0.62 + 0.32 * ndl;
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uResolution;
  float aberr = (uSense.x * 1.6 + uPlay.x * uPlay.z * 2.2) * px.x;
  vec3 live = colorize(uField, uC0, uC1, uC2, uC3, uGlow, uv);
  vec3 liveR = colorize(uField, uC0, uC1, uC2, uC3, uGlow * 0.85, uv + vec2(aberr, 0.0));
  vec3 liveB = colorize(uField, uC0, uC1, uC2, uC3, uGlow * 0.85, uv - vec2(aberr, 0.0));
  vec3 col = vec3(liveR.r, live.g, liveB.b);

  if (uLockCount > 0.5) {
    col += colorize(uLock0, uLP[0], uLP[1], uLP[2], uLP[3], uGlow * 0.55, uv) * 0.16;
  }
  if (uLockCount > 1.5) {
    col += colorize(uLock1, uLP[4], uLP[5], uLP[6], uLP[7], uGlow * 0.6, uv) * 0.20;
  }
  if (uLockCount > 2.5) {
    col += colorize(uLock2, uLP[8], uLP[9], uLP[10], uLP[11], uGlow * 0.65, uv) * 0.24;
  }
  if (uLockCount > 3.5) {
    col += colorize(uLock3, uLP[12], uLP[13], uLP[14], uLP[15], uGlow * 0.7, uv) * 0.28;
  }

  vec2 q = vUv * 2.0 - 1.0;
  float vig = 1.0 - dot(q, q) * uVignette;
  col *= vig;
  float hue = (uPlay.y - 0.5) * uPlay.x * 0.62;
  float coss = cos(hue);
  float sinn = sin(hue);
  vec3 axis = vec3(0.57735);
  col = col * coss + cross(axis, col) * sinn + axis * dot(axis, col) * (1.0 - coss);
  col *= 1.0 + uPlay.x * 0.22;
  col += vec3(uFlash) * 0.06;

  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

export const STATS_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uField;
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 chem = texture(uField, vUv).rg;
  fragColor = vec4(chem.r, chem.g, 0.0, 1.0);
}
`;
