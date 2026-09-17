import { DISPLAY_FRAG, SEED_FRAG, SIM_FRAG, STATS_FRAG, VERT } from "./shaders";
import { MAX_BRUSHES, paletteById, type Brush, type FieldStats, type Palette } from "./presets";
import { runtime } from "./runtime";

type GL = WebGL2RenderingContext;

type Program = {
  prog: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
};

type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number };

function compile(gl: GL, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("Failed to create shader");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "shader compile failed";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function makeProgram(gl: GL, frag: string, uniformNames: string[]): Program {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram();
  if (!prog) throw new Error("Failed to create program");
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? "program link failed";
    gl.deleteProgram(prog);
    throw new Error(log);
  }
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(prog, name);
  return { prog, uniforms };
}

function makeTarget(
  gl: GL,
  w: number,
  h: number,
  internalFormat: number,
  format: number,
  type: number,
  filter: number,
): Target {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create texture");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("Failed to create framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error("Framebuffer incomplete");
  }
  return { tex, fbo, w, h };
}

function chooseSim(cssW: number, cssH: number, maxSide: number) {
  const w = Math.max(1, cssW);
  const h = Math.max(1, cssH);
  const a = w / h;
  if (a >= 1) {
    return { w: maxSide, h: Math.max(180, Math.round(maxSide / a)) };
  }
  return { w: Math.max(180, Math.round(maxSide * a)), h: maxSide };
}

const SIM_UNIFORMS = [
  "uPrev",
  "uImage",
  "uResolution",
  "uFeed",
  "uKill",
  "uDu",
  "uDv",
  "uDt",
  "uAdvect",
  "uHasImage",
  "uImageMix",
  "uImageMode",
  "uTime",
  "uBrush[0]",
  "uTrail[0]",
  "uLock",
  "uHasLock",
  "uLockGrow",
  "uMotion",
  "uLockImpulse",
  "uLockPoint",
];

const DISPLAY_UNIFORMS = [
  "uField",
  "uLock0",
  "uLock1",
  "uLock2",
  "uLock3",
  "uResolution",
  "uTime",
  "uC0",
  "uC1",
  "uC2",
  "uC3",
  "uLP[0]",
  "uGlow",
  "uVignette",
  "uFlash",
  "uLockCount",
  "uSense",
];

const EMPTY: Brush = {
  id: -1,
  x: 0,
  y: 0,
  px: 0,
  py: 0,
  size: 0.03,
  strength: 0,
  pressure: 0,
  radius: 0,
};

export class RDEngine {
  readonly canvas: HTMLCanvasElement;
  private gl: GL;
  private simA: Target;
  private simB: Target;
  private statsTarget: Target;
  private simProg: Program;
  private seedProg: Program;
  private displayProg: Program;
  private statsProg: Program;
  private quad: WebGLBuffer;
  private imageTex: WebGLTexture | null = null;
  private dummyTex: WebGLTexture;
  private locks: Target[] = [];
  private lockPalettes: Palette[] = [];
  private lockStart = 0;
  lockCount = 0;
  flash = 0;
  private lockPoint: [number, number] = [0.5, 0.5];
  private lockImpulse = 0;
  private lpLoc: WebGLUniformLocation | null = null;
  private brushLoc: WebGLUniformLocation | null = null;
  private trailLoc: WebGLUniformLocation | null = null;
  private brushData = new Float32Array(MAX_BRUSHES * 4);
  private trailData = new Float32Array(MAX_BRUSHES * 4);
  simW: number;
  simH: number;
  private maxSide: number;
  private texInternal: number;
  private texFormat: number;
  private texType: number;
  private texFilter: number;
  private raf = 0;
  private lastT = 0;
  private seedSeen = -1;
  private scatterSeen = -1;
  private statsEvery = 0;
  private pixels: Uint8Array;
  private destroyed = false;
  private running = false;
  private acc = 0;
  private slow = 0;
  private frames = 0;
  onFrame: ((dt: number, stats: FieldStats) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, maxSide = 1440) {
    this.canvas = canvas;
    this.maxSide = maxSide;
    canvas.style.touchAction = "none";
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL2 is required for Morphogen.");
    this.gl = gl;

    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("OES_texture_float_linear");
    gl.getExtension("EXT_float_blend");
    this.texFilter = gl.NEAREST;
    this.texInternal = gl.RGBA;
    this.texFormat = gl.RGBA;
    this.texType = gl.UNSIGNED_BYTE;

    const dummy = gl.createTexture();
    if (!dummy) throw new Error("Failed to create texture");
    gl.bindTexture(gl.TEXTURE_2D, dummy);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.dummyTex = dummy;

    const cssW = canvas.clientWidth || window.innerWidth || 512;
    const cssH = canvas.clientHeight || window.innerHeight || 512;
    const dim = chooseSim(cssW, cssH, maxSide);
    this.simW = dim.w;
    this.simH = dim.h;
    this.simA = makeTarget(gl, dim.w, dim.h, this.texInternal, this.texFormat, this.texType, this.texFilter);
    this.simB = makeTarget(gl, dim.w, dim.h, this.texInternal, this.texFormat, this.texType, this.texFilter);
    this.statsTarget = makeTarget(gl, 16, 16, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    this.pixels = new Uint8Array(16 * 16 * 4);
    this.locks = [0, 1, 2, 3].map(() =>
      makeTarget(gl, dim.w, dim.h, this.texInternal, this.texFormat, this.texType, this.texFilter),
    );

    this.simProg = makeProgram(gl, SIM_FRAG, SIM_UNIFORMS);
    this.seedProg = makeProgram(gl, SEED_FRAG, ["uResolution", "uTime", "uHasImage", "uImage", "uImageMix"]);
    this.displayProg = makeProgram(gl, DISPLAY_FRAG, DISPLAY_UNIFORMS);
    this.statsProg = makeProgram(gl, STATS_FRAG, ["uField"]);
    this.lpLoc =
      gl.getUniformLocation(this.displayProg.prog, "uLP[0]") ??
      gl.getUniformLocation(this.displayProg.prog, "uLP");
    this.brushLoc =
      this.simProg.uniforms["uBrush[0]"] ?? gl.getUniformLocation(this.simProg.prog, "uBrush");
    this.trailLoc =
      this.simProg.uniforms["uTrail[0]"] ?? gl.getUniformLocation(this.simProg.prog, "uTrail");

    const quad = gl.createBuffer();
    if (!quad) throw new Error("Failed to create buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.quad = quad;

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
  }

  start() {
    if (this.running || this.destroyed) return;
    this.running = true;
    this.seed(true);
    this.lastT = performance.now();
    const loop = (now: number) => {
      if (!this.running || this.destroyed) return;
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      this.frame(dt, now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy() {
    this.stop();
    this.destroyed = true;
    const gl = this.gl;
    gl.deleteBuffer(this.quad);
    gl.deleteProgram(this.simProg.prog);
    gl.deleteProgram(this.seedProg.prog);
    gl.deleteProgram(this.displayProg.prog);
    gl.deleteProgram(this.statsProg.prog);
    this.deleteTarget(this.simA);
    this.deleteTarget(this.simB);
    this.deleteTarget(this.statsTarget);
    for (const lock of this.locks) this.deleteTarget(lock);
    if (this.imageTex) gl.deleteTexture(this.imageTex);
    gl.deleteTexture(this.dummyTex);
  }

  private deleteTarget(t: Target) {
    this.gl.deleteTexture(t.tex);
    this.gl.deleteFramebuffer(t.fbo);
  }

  private imageOrDummy(): WebGLTexture {
    return this.imageTex ?? this.dummyTex;
  }

  setImage(source: TexImageSource | null) {
    const gl = this.gl;
    if (!source) {
      if (this.imageTex) {
        gl.deleteTexture(this.imageTex);
        this.imageTex = null;
      }
      runtime.hasImage = false;
      return;
    }
    if (!this.imageTex) {
      this.imageTex = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    runtime.hasImage = true;
  }

  seed(force = false) {
    if (!force && this.seedSeen === runtime.seedNonce) return;
    this.seedSeen = runtime.seedNonce;
    const gl = this.gl;
    const w = this.simW;
    const h = this.simH;
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      data[o] = 255;
      data[o + 3] = 255;
    }
    const spots: [number, number, number][] = [
      [0.5, 0.52, 0.055],
      [0.38, 0.44, 0.038],
      [0.63, 0.58, 0.034],
      [0.47, 0.68, 0.03],
      [0.6, 0.36, 0.028],
      [0.31, 0.6, 0.026],
      [0.7, 0.42, 0.024],
      [0.42, 0.32, 0.022],
      [0.55, 0.78, 0.02],
    ];
    const minSide = Math.min(w, h);
    const paint = (cx: number, cy: number, r: number, vAmt: number) => {
      const rad = r * minSide;
      const x0 = Math.max(0, Math.floor(cx * w - rad - 1));
      const x1 = Math.min(w - 1, Math.ceil(cx * w + rad + 1));
      const y0 = Math.max(0, Math.floor(cy * h - rad - 1));
      const y1 = Math.min(h - 1, Math.ceil(cy * h + rad + 1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx * w;
          const dy = y + 0.5 - cy * h;
          const t = Math.hypot(dx, dy) / Math.max(rad, 1);
          if (t >= 1) continue;
          const ink = t < 0.58 ? 1 : 1 - (t - 0.58) / 0.42;
          const o = (y * w + x) * 4;
          data[o] = Math.min(data[o]!, Math.round((1 - ink * 0.5) * 255));
          data[o + 1] = Math.max(data[o + 1]!, Math.round(ink * vAmt * 255));
        }
      }
    };
    for (const [cx, cy, r] of spots) paint(cx, cy, r, 0.28);
    for (let s = 0; s < 40; s++) {
      paint(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, 0.008 + Math.random() * 0.01, 0.22);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.simA.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.acc = 0;
  }

  private bindQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  private packBrushes() {
    const brushes = runtime.brushes;
    for (let i = 0; i < MAX_BRUSHES; i++) {
      const b = brushes[i] ?? EMPTY;
      const o = i * 4;
      this.brushData[o] = b.x;
      this.brushData[o + 1] = 1 - b.y;
      this.brushData[o + 2] = b.size;
      this.brushData[o + 3] = b.strength;
      this.trailData[o] = b.px;
      this.trailData[o + 1] = 1 - b.py;
      this.trailData[o + 2] = 0;
      this.trailData[o + 3] = 0;
    }
  }

  private blit(src: WebGLTexture, dest: Target) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo);
    gl.viewport(0, 0, dest.w, dest.h);
    gl.useProgram(this.statsProg.prog);
    this.bindQuad();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniform1i(this.statsProg.uniforms.uField, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private fitSim(force = false) {
    const cssW = this.canvas.clientWidth || window.innerWidth || 1;
    const cssH = this.canvas.clientHeight || window.innerHeight || 1;
    const dim = chooseSim(cssW, cssH, this.maxSide);
    if (!force && Math.abs(dim.w - this.simW) < 12 && Math.abs(dim.h - this.simH) < 12) return;
    const gl = this.gl;
    const oldAspect = this.simW / Math.max(1, this.simH);
    const newAspect = dim.w / Math.max(1, dim.h);
    const aspectShift = Math.abs(oldAspect - newAspect) / Math.max(oldAspect, 0.01);
    const oldTex = this.simA.tex;
    const oldFbo = this.simA.fbo;
    this.deleteTarget(this.simB);
    for (const lock of this.locks) this.deleteTarget(lock);
    this.simW = dim.w;
    this.simH = dim.h;
    this.simA = makeTarget(gl, dim.w, dim.h, this.texInternal, this.texFormat, this.texType, this.texFilter);
    this.simB = makeTarget(gl, dim.w, dim.h, this.texInternal, this.texFormat, this.texType, this.texFilter);
    this.locks = [0, 1, 2, 3].map(() =>
      makeTarget(gl, dim.w, dim.h, this.texInternal, this.texFormat, this.texType, this.texFilter),
    );
    this.lockCount = 0;
    this.lockStart = 0;
    runtime.lockCount = 0;
    if (aspectShift > 0.08 || force) {
      gl.deleteTexture(oldTex);
      gl.deleteFramebuffer(oldFbo);
      this.seed(true);
    } else {
      this.blit(oldTex, this.simA);
      gl.deleteTexture(oldTex);
      gl.deleteFramebuffer(oldFbo);
    }
  }

  currentPalette(): Palette {
    const params = runtime.params;
    return params.paletteId === "image" && runtime.customPalette
      ? runtime.customPalette
      : paletteById(params.paletteId);
  }

  lockLayer(x = 0.5, y = 0.5): number {
    const pal = this.currentPalette();
    if (this.lockCount < 4) {
      const slot = (this.lockStart + this.lockCount) % 4;
      this.blit(this.simA.tex, this.locks[slot]!);
      this.lockPalettes[slot] = pal;
      this.lockCount += 1;
    } else {
      const slot = this.lockStart;
      this.blit(this.simA.tex, this.locks[slot]!);
      this.lockPalettes[slot] = pal;
      this.lockStart = (this.lockStart + 1) % 4;
    }
    this.lockPoint = [x, 1 - y];
    this.lockImpulse = 1;
    this.flash = 1;
    runtime.lockCount = this.lockCount;
    return this.lockCount;
  }

  popLock(): number {
    if (this.lockCount <= 0) return 0;
    this.lockCount -= 1;
    runtime.lockCount = this.lockCount;
    return this.lockCount;
  }

  clearLocks() {
    this.lockCount = 0;
    this.lockStart = 0;
    runtime.lockCount = 0;
  }

  private newestLock(): Target | null {
    if (this.lockCount <= 0) return null;
    const slot = (this.lockStart + this.lockCount - 1) % 4;
    return this.locks[slot] ?? null;
  }

  private frame(dt: number, time: number) {
    this.frames++;
    if (this.frames > 90) {
      if (dt > 0.028) this.slow += 1;
      else this.slow = Math.max(0, this.slow - 2);
      if (this.slow > 48 && this.maxSide > 800) {
        this.maxSide = Math.round(this.maxSide * 0.82);
        this.slow = 0;
        this.fitSim(true);
      }
    }

    if (runtime.seedNonce !== this.seedSeen) this.seed();
    if (runtime.scatterNonce !== this.scatterSeen) this.scatterSeen = runtime.scatterNonce;
    this.fitSim();

    const gl = this.gl;
    const params = runtime.params;
    const imageMode = params.imageMode === "develop" ? 0 : params.imageMode === "inoculate" ? 1 : 2;

    if (!runtime.paused) {
      this.acc += dt;
      const stepDt = 1 / 30;
      const simDt = Math.max(0.55, Math.min(1.15, params.speed));
      const maxSteps = Math.max(1, Math.min(6, params.steps | 0));
      let steps = 0;
      while (this.acc >= stepDt && steps < maxSteps) {
        this.acc -= stepDt;
        steps++;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.simB.fbo);
        gl.viewport(0, 0, this.simW, this.simH);
        gl.useProgram(this.simProg.prog);
        this.bindQuad();
        const u = this.simProg.uniforms;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.simA.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.uniform1i(u.uPrev, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.imageOrDummy());
        gl.uniform1i(u.uImage, 1);
        gl.uniform2f(u.uResolution, this.simW, this.simH);
        gl.uniform1f(u.uFeed, params.feed);
        gl.uniform1f(u.uKill, params.kill);
        gl.uniform1f(u.uDu, params.du);
        gl.uniform1f(u.uDv, params.dv);
        gl.uniform1f(u.uDt, simDt);
        gl.uniform2f(u.uAdvect, runtime.flowX, runtime.flowY);
        gl.uniform1f(u.uHasImage, runtime.hasImage && params.imageMode !== "palette" ? 1 : 0);
        gl.uniform1f(u.uImageMix, params.imageMix);
        gl.uniform1f(u.uImageMode, imageMode);
        gl.uniform1f(u.uTime, time);
        this.packBrushes();
        if (this.brushLoc) gl.uniform4fv(this.brushLoc, this.brushData);
        if (this.trailLoc) gl.uniform4fv(this.trailLoc, this.trailData);
        const newest = this.newestLock();
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, newest?.tex ?? this.simA.tex);
        gl.uniform1i(u.uLock, 2);
        gl.uniform1f(u.uHasLock, newest ? 1 : 0);
        gl.uniform1f(u.uLockGrow, newest ? 1 : 0);
        gl.uniform1f(u.uMotion, runtime.motion);
        gl.uniform1f(u.uLockImpulse, this.lockImpulse);
        gl.uniform2f(u.uLockPoint, this.lockPoint[0], this.lockPoint[1]);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        const tmp = this.simA;
        this.simA = this.simB;
        this.simB = tmp;
      }
      if (this.acc > stepDt * 4) this.acc = 0;
    }

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssW = this.canvas.clientWidth || 1;
    const cssH = this.canvas.clientHeight || 1;
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(this.displayProg.prog);
    this.bindQuad();
    const pal = this.currentPalette();
    const du = this.displayProg.uniforms;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.simA.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(du.uField, 0);
    const lp = new Float32Array(48);
    for (let i = 0; i < 4; i++) {
      const slot = (this.lockStart + i) % 4;
      const layer = this.locks[slot];
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl.TEXTURE_2D, i < this.lockCount && layer ? layer.tex : this.simA.tex);
      gl.uniform1i(du[`uLock${i}` as "uLock0"], 1 + i);
      const p = i < this.lockCount ? (this.lockPalettes[slot] ?? pal) : pal;
      for (let s = 0; s < 4; s++) {
        const stop = p.stops[s]!;
        const o = (i * 4 + s) * 3;
        lp[o] = stop[0];
        lp[o + 1] = stop[1];
        lp[o + 2] = stop[2];
      }
    }
    if (this.lpLoc) gl.uniform3fv(this.lpLoc, lp);
    gl.uniform1f(du.uLockCount, this.lockCount);
    gl.uniform2f(du.uResolution, this.simW, this.simH);
    gl.uniform1f(du.uTime, time);
    gl.uniform3f(du.uC0, pal.stops[0][0], pal.stops[0][1], pal.stops[0][2]);
    gl.uniform3f(du.uC1, pal.stops[1][0], pal.stops[1][1], pal.stops[1][2]);
    gl.uniform3f(du.uC2, pal.stops[2][0], pal.stops[2][1], pal.stops[2][2]);
    gl.uniform3f(du.uC3, pal.stops[3][0], pal.stops[3][1], pal.stops[3][2]);
    gl.uniform1f(du.uGlow, params.glow);
    gl.uniform1f(du.uVignette, params.vignette);
    gl.uniform1f(du.uFlash, this.flash);
    gl.uniform4f(du.uSense, runtime.sense.roll, runtime.sense.pitch, runtime.sense.spin, runtime.sense.pressure);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, this.simA.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.flash *= Math.exp(-2.4 * dt);
    this.lockImpulse *= Math.exp(-3.2 * dt);

    this.statsEvery++;
    if (this.statsEvery % 3 === 0) this.readStats();
    this.onFrame?.(dt, runtime.stats);
  }

  private readStats() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.statsTarget.fbo);
    gl.viewport(0, 0, 16, 16);
    gl.useProgram(this.statsProg.prog);
    this.bindQuad();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.simA.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(this.statsProg.uniforms.uField, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.readPixels(0, 0, 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const grid = runtime.stats.grid;
    let sumU = 0;
    let sumV = 0;
    let cx = 0;
    let cy = 0;
    let mass = 0;
    let edge = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        const u = this.pixels[i]! / 255;
        const v = this.pixels[i + 1]! / 255;
        grid[y * 16 + x] = v;
        sumU += u;
        sumV += v;
        cx += x * v;
        cy += y * v;
        mass += v;
        if (x > 0) edge += Math.abs(v - grid[y * 16 + x - 1]!);
      }
    }
    const n = 256;
    runtime.stats.meanU = sumU / n;
    runtime.stats.meanV = sumV / n;
    runtime.stats.energy = Math.min(1, sumV / (n * 0.08));
    runtime.stats.cx = mass > 1e-5 ? cx / mass / 15 : 0.5;
    runtime.stats.cy = mass > 1e-5 ? 1 - cy / mass / 15 : 0.5;
    runtime.stats.edge = Math.min(1, edge / 40);
  }
}
