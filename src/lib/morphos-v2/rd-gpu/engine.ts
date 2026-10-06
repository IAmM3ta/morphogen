/**
 * RDGpuEngine — WebGPU Gray–Scott field, the primary MORPHOS v2 path.
 *
 * Sharp by construction: f32 chemistry, sim grid sized to the device pixel
 * grid (up to 2048 on the long side), many solver steps per frame, and a
 * display pass that resolves iso-edges with derivative anti-aliasing instead
 * of blurring. Sound and motion drive the chemistry itself: bass swells feed,
 * centroid nudges kill, highs open diffusion, tilt/compass steer anisotropy
 * and flow, onsets plant soft seeds (n-fold symmetric for mandala looks).
 *
 * Adaptive quality lowers solver steps first, then the sim grid — never the
 * output resolution. Any GPU error or device loss calls `onLost` so the app
 * can drop back to the WebGL2 engine without a crash.
 */
import { MAX_BRUSHES, paletteById, type Brush, type FieldStats, type Palette } from "@/lib/morphogen/presets";
import { runtime, tickMorph } from "@/lib/morphogen/runtime";
import { features, MAX_RIPPLES, SPECTRUM_BANDS } from "../features";
import { control } from "../control";
import { approach } from "../smoothing";
import type { FieldEngine } from "../field-engine";
import { RegimeDrift } from "../rd-regimes";
import { buildLut, LUT_W } from "../visuals/lut";
import { VARY_INDEX, visualById, type RGB, type VisualPreset } from "../visuals/presets";
import { look, lookStatus } from "./look";
import { BLOOM, FINAL, PACK, RESAMPLE, SCENE, SIM, STATS } from "./wgsl";

const SIM_FLOATS = 33 * 4;
const VIEW_FLOATS = 18 * 4;
const HDR: GPUTextureFormat = "rgba16float";
const STEP_LADDER = [6, 8, 10, 12, 16, 20, 24, 28, 32, 36, 40];
const SCALE_LADDER = [1, 0.85, 0.72, 0.6, 0.5];

const EMPTY: Brush = { id: -1, x: 0, y: 0, px: 0, py: 0, size: 0.03, strength: 0, pressure: 0, radius: 0 };

type Tex = { tex: GPUTexture; view: GPUTextureView; w: number; h: number };

function chooseSim(cssW: number, cssH: number, maxSide: number) {
  const a = Math.max(1, cssW) / Math.max(1, cssH);
  if (a >= 1) return { w: maxSide, h: Math.max(180, Math.round(maxSide / a)) };
  return { w: Math.max(180, Math.round(maxSide * a)), h: maxSide };
}

function isCoarse() {
  return typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
}

export type GpuCreateResult = { ok: true; engine: RDGpuEngine } | { ok: false; reason: string };

export class RDGpuEngine implements FieldEngine {
  readonly canvas: HTMLCanvasElement;
  simW = 0;
  simH = 0;
  lockCount = 0;
  flash = 0;
  onFrame: ((dt: number, stats: FieldStats) => void) | null = null;
  onLost: ((reason: string) => void) | null = null;

  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private format: GPUTextureFormat;
  private failed = false;
  private destroyed = false;
  private running = false;
  private raf = 0;
  private lastT = 0;
  private lastPresent = 0;

  // pipelines
  private pSim!: GPUComputePipeline;
  private pPack!: GPUComputePipeline;
  private pStats!: GPUComputePipeline;
  private pResample!: GPUComputePipeline;
  private pScene!: GPURenderPipeline;
  private pBloom!: GPURenderPipeline;
  private pFinal!: GPURenderPipeline;
  private pFinalCap: GPURenderPipeline | null = null;
  private mScene!: GPUShaderModule;
  private mBloom!: GPUShaderModule;
  private mFinal!: GPUShaderModule;

  // resources
  private simU: GPUBuffer;
  private packU: GPUBuffer;
  private statsU: GPUBuffer;
  private viewU: GPUBuffer;
  private simData = new Float32Array(SIM_FLOATS);
  private viewData = new Float32Array(VIEW_FLOATS);
  private packData = new Float32Array(8);
  private state: [GPUBuffer, GPUBuffer] | null = null;
  private cur = 0;
  private locks: (GPUBuffer | null)[] = [null, null, null, null];
  private lockStart = 0;
  private lockPoint: [number, number] = [0.5, 0.5];
  private lockImpulse = 0;
  private history: { buf: GPUBuffer; w: number; h: number }[] = [];
  private readonly historyMax: number;
  private dummy: GPUBuffer;
  private statsBuf: GPUBuffer;
  private statsRead: GPUBuffer;
  private statsPending = false;
  private fieldTex: Tex | null = null;
  private lutTex: GPUTexture;
  private imgTex: GPUTexture;
  private dummyImg: GPUTexture;
  private sampRep: GPUSampler;
  private sampClamp: GPUSampler;
  private scene: Tex | null = null;
  private bloom: Tex | null = null;

  private bgSim: [GPUBindGroup, GPUBindGroup] | null = null;
  private bgPack: [GPUBindGroup, GPUBindGroup] | null = null;
  private bgStats: [GPUBindGroup, GPUBindGroup] | null = null;
  private bgScene: GPUBindGroup | null = null;
  private bgBloom: GPUBindGroup | null = null;
  private bgFinal: GPUBindGroup | null = null;

  // control state
  private seedSeen = -1;
  private scatterSeen = -1;
  private smoothScale = 1;
  private frames = 0;
  private statsEvery = 0;
  private lutKey = "";
  private drift = new RegimeDrift();
  private rippleSeen = new Float64Array(MAX_RIPPLES).fill(-1);
  private sBass = 0;
  private sCen = 0.4;
  private sHigh = 0;
  private sRms = 0;
  private sOnset = 0;
  private foldOrder = 6;
  private foldTarget = 6;
  private foldHold = 0;
  private kalRot = 0;
  private chladN = 2;
  private chladM = 3;
  private anisoAngle = Math.PI / 2;
  private time = 0;

  // governor
  private ema = 16.7;
  // GPU backpressure: never queue more than two frames of work, and feed the
  // governor the measured GPU time, not just the rAF interval.
  private inFlight = 0;
  private gpuMs = 0;
  private cool = 120;
  private stepCap: number;
  private scaleIdx: number;
  private readonly simCap: number;

  static async create(canvas: HTMLCanvasElement): Promise<GpuCreateResult> {
    try {
      const gpu = navigator.gpu;
      if (!gpu) return { ok: false, reason: "WebGPU unavailable" };
      const adapter = await Promise.race([
        gpu.requestAdapter({ powerPreference: "high-performance" }),
        new Promise<null>((r) => setTimeout(() => r(null), 4000)),
      ]);
      if (!adapter) return { ok: false, reason: "No WebGPU adapter" };
      const device = await adapter.requestDevice({
        requiredLimits: {
          maxStorageBufferBindingSize: Math.min(adapter.limits.maxStorageBufferBindingSize, 256 * 1024 * 1024),
          maxBufferSize: Math.min(adapter.limits.maxBufferSize, 256 * 1024 * 1024),
        },
      });
      const ctx = canvas.getContext("webgpu");
      if (!ctx) {
        device.destroy();
        return { ok: false, reason: "No WebGPU canvas context" };
      }
      const format = gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: "opaque" });
      const engine = new RDGpuEngine(canvas, device, ctx, format);
      const err = await engine.build();
      if (err) {
        engine.destroy();
        return { ok: false, reason: err };
      }
      engine.fitSim(true);
      return { ok: true, engine };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
  }

  private constructor(canvas: HTMLCanvasElement, device: GPUDevice, ctx: GPUCanvasContext, format: GPUTextureFormat) {
    this.canvas = canvas;
    this.device = device;
    this.ctx = ctx;
    this.format = format;
    canvas.style.touchAction = "none";
    const coarse = isCoarse();
    this.historyMax = coarse ? 5 : 8;
    this.simCap = coarse ? 1600 : 2048;
    this.stepCap = coarse ? 20 : 32;
    this.scaleIdx = 0;
    if (look.quality === "low") {
      this.stepCap = 12;
      this.scaleIdx = 3;
    }
    const U = GPUBufferUsage;
    this.simU = device.createBuffer({ size: SIM_FLOATS * 4, usage: U.UNIFORM | U.COPY_DST });
    this.viewU = device.createBuffer({ size: VIEW_FLOATS * 4, usage: U.UNIFORM | U.COPY_DST });
    this.packU = device.createBuffer({ size: 32, usage: U.UNIFORM | U.COPY_DST });
    this.statsU = device.createBuffer({ size: 16, usage: U.UNIFORM | U.COPY_DST });
    this.dummy = device.createBuffer({ size: 16, usage: U.STORAGE });
    this.statsBuf = device.createBuffer({ size: 256 * 8, usage: U.STORAGE | U.COPY_SRC });
    this.statsRead = device.createBuffer({ size: 256 * 8, usage: U.MAP_READ | U.COPY_DST });
    this.lutTex = device.createTexture({
      size: [LUT_W, 2],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.dummyImg = device.createTexture({
      size: [1, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: this.dummyImg }, new Uint8Array([0, 0, 0, 255]), { bytesPerRow: 4 }, [1, 1]);
    this.imgTex = this.dummyImg;
    this.sampRep = device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "repeat",
    });
    this.sampClamp = device.createSampler({ magFilter: "linear", minFilter: "linear" });
    device.lost.then((info) => {
      if (!this.destroyed) this.fail(`GPU device lost: ${info.message || info.reason}`);
    });
    device.addEventListener("uncapturederror", (ev) => {
      if (this.destroyed) return;
      this.fail(`GPU error: ${(ev as GPUUncapturedErrorEvent).error.message}`);
    });
  }

  private fail(reason: string) {
    if (this.failed) return;
    console.warn("[morphos-v2] WebGPU field failed:", reason);
    this.failed = true;
    lookStatus.reason = reason;
    this.stop();
    try {
      this.onLost?.(reason);
    } catch {
      /* the app decides what to do */
    }
  }

  private async module(code: string, label: string) {
    const m = this.device.createShaderModule({ code, label });
    const info = await m.getCompilationInfo();
    const errs = info.messages.filter((x) => x.type === "error");
    if (errs.length) throw new Error(`${label}: ${errs.map((e) => `${e.lineNum}:${e.linePos} ${e.message}`).join("; ")}`);
    return m;
  }

  private async build(): Promise<string | null> {
    const d = this.device;
    d.pushErrorScope("validation");
    try {
      const [mSim, mPack, mStats, mRs, mScene, mBloom, mFinal] = await Promise.all([
        this.module(SIM, "rd-sim"),
        this.module(PACK, "rd-pack"),
        this.module(STATS, "rd-stats"),
        this.module(RESAMPLE, "rd-resample"),
        this.module(SCENE, "rd-scene"),
        this.module(BLOOM, "rd-bloom"),
        this.module(FINAL, "rd-final"),
      ]);
      this.mScene = mScene;
      this.mBloom = mBloom;
      this.mFinal = mFinal;
      const comp = (m: GPUShaderModule) => d.createComputePipelineAsync({ layout: "auto", compute: { module: m, entryPoint: "main" } });
      [this.pSim, this.pPack, this.pStats, this.pResample, this.pScene, this.pBloom, this.pFinal] = await Promise.all([
        comp(mSim),
        comp(mPack),
        comp(mStats),
        comp(mRs),
        this.fullPipe(mScene, "fsScene", HDR),
        this.fullPipe(mBloom, "fsBloom", HDR),
        this.fullPipe(mFinal, "fsFinal", this.format),
      ]);
    } catch (e) {
      await d.popErrorScope().catch(() => null);
      return e instanceof Error ? e.message : String(e);
    }
    const err = await d.popErrorScope();
    return err ? err.message : null;
  }

  private fullPipe(m: GPUShaderModule, fs: string, format: GPUTextureFormat) {
    return this.device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module: m, entryPoint: "vsFull" },
      fragment: { module: m, entryPoint: fs, targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    if (this.running || this.destroyed || this.failed) return;
    this.running = true;
    this.seed(true);
    this.lastT = performance.now();
    const loop = (now: number) => {
      if (!this.running || this.destroyed) return;
      this.raf = requestAnimationFrame(loop);
      const cap = look.maxFps;
      if (cap > 0 && now - this.lastPresent < 1000 / cap - 2) return;
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      this.lastPresent = now;
      try {
        this.frame(dt, now / 1000);
      } catch (e) {
        this.fail(e instanceof Error ? e.message : String(e));
      }
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
    try {
      this.state?.forEach((b) => b.destroy());
      this.locks.forEach((b) => b?.destroy());
      this.clearFieldHistory();
      this.fieldTex?.tex.destroy();
      this.scene?.tex.destroy();
      this.bloom?.tex.destroy();
      if (this.imgTex !== this.dummyImg) this.imgTex.destroy();
      this.ctx.unconfigure();
      this.device.destroy();
    } catch {
      /* already gone */
    }
  }

  // ---------------------------------------------------------------- field ops

  private cellBytes() {
    return this.simW * this.simH * 8;
  }

  private makeStateBuffer() {
    return this.device.createBuffer({
      size: this.cellBytes(),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
  }

  private currentMaxSide() {
    const dpr = Math.min(look.maxDpr, window.devicePixelRatio || 1);
    const cssW = this.canvas.clientWidth || window.innerWidth || 1;
    const cssH = this.canvas.clientHeight || window.innerHeight || 1;
    const longPx = Math.max(cssW, cssH) * dpr;
    const target = Math.min(this.simCap, longPx) * SCALE_LADDER[this.scaleIdx]!;
    return Math.max(560, Math.round(target));
  }

  private fitSim(force = false) {
    const cssW = this.canvas.clientWidth || window.innerWidth || 1;
    const cssH = this.canvas.clientHeight || window.innerHeight || 1;
    const dim = chooseSim(cssW, cssH, this.currentMaxSide());
    if (!force && this.state && Math.abs(dim.w - this.simW) < 12 && Math.abs(dim.h - this.simH) < 12) return;
    const old = this.state;
    const oldW = this.simW;
    const oldH = this.simH;
    const oldCur = this.cur;
    const oldAspect = oldW / Math.max(1, oldH);
    const newAspect = dim.w / Math.max(1, dim.h);
    this.simW = dim.w;
    this.simH = dim.h;
    this.state = [this.makeStateBuffer(), this.makeStateBuffer()];
    this.cur = 0;
    this.locks.forEach((b) => b?.destroy());
    this.locks = [null, null, null, null];
    this.lockCount = 0;
    this.lockStart = 0;
    runtime.lockCount = 0;
    this.clearFieldHistory();
    this.fieldTex?.tex.destroy();
    const ft = this.device.createTexture({
      size: [dim.w, dim.h],
      format: HDR,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.fieldTex = { tex: ft, view: ft.createView(), w: dim.w, h: dim.h };
    this.bgSim = null;
    this.bgPack = null;
    this.bgStats = null;
    this.bgScene = null;
    lookStatus.simW = dim.w;
    lookStatus.simH = dim.h;
    const aspectShift = Math.abs(oldAspect - newAspect) / Math.max(oldAspect, 0.01);
    if (old && !force && aspectShift <= 0.08) {
      this.resample(old[oldCur]!, oldW, oldH);
      const o = old;
      void this.device.queue.onSubmittedWorkDone().then(() => o.forEach((b) => b.destroy()));
    } else {
      old?.forEach((b) => b.destroy());
      this.seed(true);
    }
  }

  private resample(src: GPUBuffer, w: number, h: number) {
    const d = this.device;
    const u = d.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    d.queue.writeBuffer(u, 0, new Float32Array([w, h, 0, 0, this.simW, this.simH, 0, 0]));
    const bg = d.createBindGroup({
      layout: this.pResample.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: u } },
        { binding: 1, resource: { buffer: src } },
        { binding: 2, resource: { buffer: this.state![0] } },
      ],
    });
    const enc = d.createCommandEncoder();
    const p = enc.beginComputePass();
    p.setPipeline(this.pResample);
    p.setBindGroup(0, bg);
    p.dispatchWorkgroups(Math.ceil(this.simW / 16), Math.ceil(this.simH / 16));
    p.end();
    d.queue.submit([enc.finish()]);
    this.cur = 0;
  }

  seed(force = false) {
    if (!force && this.seedSeen === runtime.seedNonce) return;
    this.seedSeen = runtime.seedNonce;
    if (!this.state) return;
    const w = this.simW;
    const h = this.simH;
    const data = new Float32Array(w * h * 2);
    for (let i = 0; i < w * h; i++) data[i * 2] = 1;
    const minSide = Math.min(w, h);
    const paint = (cx: number, cy: number, r: number, vAmt: number) => {
      const rad = r * minSide;
      const x0 = Math.max(0, Math.floor(cx * w - rad - 1));
      const x1 = Math.min(w - 1, Math.ceil(cx * w + rad + 1));
      const y0 = Math.max(0, Math.floor(cy * h - rad - 1));
      const y1 = Math.min(h - 1, Math.ceil(cy * h + rad + 1));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = Math.hypot(x + 0.5 - cx * w, y + 0.5 - cy * h) / Math.max(rad, 1);
          if (t >= 1) continue;
          const ink = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
          const o = (y * w + x) * 2;
          data[o] = Math.min(data[o]!, 1 - ink * 0.5);
          data[o + 1] = Math.max(data[o + 1]!, ink * vAmt);
        }
      }
    };
    for (const [cx, cy, r] of [
      [0.5, 0.52, 0.13],
      [0.3, 0.66, 0.07],
      [0.72, 0.36, 0.055],
      [0.22, 0.28, 0.04],
    ] as const)
      paint(cx, cy, r, 1);
    for (let s = 0; s < 10; s++) paint(0.1 + Math.random() * 0.8, 0.1 + Math.random() * 0.8, 0.02 + Math.random() * 0.028, 1);
    for (let s = 0; s < 36; s++) paint(0.06 + Math.random() * 0.88, 0.06 + Math.random() * 0.88, 0.007 + Math.random() * 0.012, 0.9);
    this.device.queue.writeBuffer(this.state[this.cur]!, 0, data);
  }

  setImage(source: TexImageSource | null) {
    if (!source) {
      if (this.imgTex !== this.dummyImg) {
        const t = this.imgTex;
        this.imgTex = this.dummyImg;
        this.bgSim = null;
        void this.device.queue.onSubmittedWorkDone().then(() => t.destroy());
      }
      runtime.hasImage = false;
      return;
    }
    const s = source as unknown as {
      videoWidth?: number;
      videoHeight?: number;
      naturalWidth?: number;
      naturalHeight?: number;
      displayWidth?: number;
      displayHeight?: number;
      width?: number;
      height?: number;
    };
    const w = s.videoWidth || s.naturalWidth || s.displayWidth || s.width || 0;
    const h = s.videoHeight || s.naturalHeight || s.displayHeight || s.height || 0;
    if (!w || !h) return;
    try {
      if (this.imgTex === this.dummyImg || this.imgTex.width !== w || this.imgTex.height !== h) {
        if (this.imgTex !== this.dummyImg) {
          const old = this.imgTex;
          void this.device.queue.onSubmittedWorkDone().then(() => old.destroy());
        }
        this.imgTex = this.device.createTexture({
          size: [w, h],
          format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.bgSim = null;
      }
      this.device.queue.copyExternalImageToTexture(
        { source: source as GPUCopyExternalImageSource },
        { texture: this.imgTex },
        [w, h],
      );
      runtime.hasImage = true;
    } catch {
      /* unsupported source: keep the field running without it */
    }
  }

  currentPalette(): Palette {
    if (runtime.liveStops) return { id: "live", name: "Live", stops: runtime.liveStops };
    const params = runtime.params;
    return params.paletteId === "image" && runtime.customPalette ? runtime.customPalette : paletteById(params.paletteId);
  }

  private ensureLock(slot: number) {
    if (!this.locks[slot]) {
      this.locks[slot] = this.makeStateBuffer();
      this.bgPack = null;
    }
    return this.locks[slot]!;
  }

  private copyState(dst: GPUBuffer, fromState = true) {
    const enc = this.device.createCommandEncoder();
    if (fromState) enc.copyBufferToBuffer(this.state![this.cur]!, 0, dst, 0, this.cellBytes());
    else enc.copyBufferToBuffer(dst, 0, this.state![this.cur]!, 0, this.cellBytes());
    this.device.queue.submit([enc.finish()]);
  }

  lockLayer(x = 0.5, y = 0.5): number {
    if (!this.state) return this.lockCount;
    let slot: number;
    if (this.lockCount < 4) {
      slot = (this.lockStart + this.lockCount) % 4;
      this.lockCount += 1;
    } else {
      slot = this.lockStart;
      this.lockStart = (this.lockStart + 1) % 4;
    }
    this.copyState(this.ensureLock(slot));
    this.bgSim = null;
    this.lockPoint = [x, 1 - y];
    this.lockImpulse = 0.22;
    this.flash = 0.18;
    runtime.lockCount = this.lockCount;
    return this.lockCount;
  }

  popLock(): number {
    if (this.lockCount <= 0) return 0;
    this.lockCount -= 1;
    this.bgSim = null;
    runtime.lockCount = this.lockCount;
    return this.lockCount;
  }

  clearLocks() {
    this.lockCount = 0;
    this.lockStart = 0;
    this.bgSim = null;
    runtime.lockCount = 0;
  }

  checkpoint() {
    if (!this.state) return;
    let slot: { buf: GPUBuffer; w: number; h: number };
    if (this.history.length >= this.historyMax) {
      slot = this.history.shift()!;
      if (slot.w !== this.simW || slot.h !== this.simH) {
        slot.buf.destroy();
        slot = { buf: this.makeStateBuffer(), w: this.simW, h: this.simH };
      }
    } else {
      slot = { buf: this.makeStateBuffer(), w: this.simW, h: this.simH };
    }
    this.copyState(slot.buf);
    this.history.push(slot);
  }

  undo(): boolean {
    const slot = this.history.pop();
    if (!slot) return false;
    if (slot.w === this.simW && slot.h === this.simH) this.copyState(slot.buf, false);
    const b = slot.buf;
    void this.device.queue.onSubmittedWorkDone().then(() => b.destroy());
    this.flash = 0.4;
    return true;
  }

  clearFieldHistory() {
    for (const h of this.history) h.buf.destroy();
    this.history = [];
  }

  private newestLockSlot(): number {
    if (this.lockCount <= 0) return -1;
    return (this.lockStart + this.lockCount - 1) % 4;
  }

  // ---------------------------------------------------------------- bind groups

  private ensureBindGroups() {
    const d = this.device;
    const st = this.state!;
    if (!this.bgSim) {
      const ls = this.newestLockSlot();
      const lockBuf = ls >= 0 ? (this.locks[ls] ?? this.dummy) : this.dummy;
      const mk = (from: number) =>
        d.createBindGroup({
          layout: this.pSim.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.simU } },
            { binding: 1, resource: { buffer: st[from]! } },
            { binding: 2, resource: { buffer: st[1 - from]! } },
            { binding: 3, resource: { buffer: lockBuf } },
            { binding: 4, resource: this.imgTex.createView() },
            { binding: 5, resource: this.sampClamp },
          ],
        });
      this.bgSim = [mk(0), mk(1)];
    }
    if (!this.bgPack) {
      const mk = (from: number) =>
        d.createBindGroup({
          layout: this.pPack.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.packU } },
            { binding: 1, resource: { buffer: st[from]! } },
            { binding: 2, resource: { buffer: this.locks[0] ?? this.dummy } },
            { binding: 3, resource: { buffer: this.locks[1] ?? this.dummy } },
            { binding: 4, resource: { buffer: this.locks[2] ?? this.dummy } },
            { binding: 5, resource: { buffer: this.locks[3] ?? this.dummy } },
            { binding: 6, resource: this.fieldTex!.view },
          ],
        });
      this.bgPack = [mk(0), mk(1)];
    }
    if (!this.bgStats) {
      const mk = (from: number) =>
        d.createBindGroup({
          layout: this.pStats.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.statsU } },
            { binding: 1, resource: { buffer: st[from]! } },
            { binding: 2, resource: { buffer: this.statsBuf } },
          ],
        });
      this.bgStats = [mk(0), mk(1)];
    }
    if (!this.bgScene) {
      this.bgScene = this.sceneBindGroup(this.pScene);
    }
  }

  private sceneBindGroup(p: GPURenderPipeline) {
    return this.device.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.viewU } },
        { binding: 1, resource: this.fieldTex!.view },
        { binding: 2, resource: this.lutTex.createView() },
        { binding: 3, resource: this.sampRep },
        { binding: 4, resource: this.sampClamp },
      ],
    });
  }

  private ensureTargets(w: number, h: number) {
    if (this.scene && this.scene.w === w && this.scene.h === h && this.bgFinal) return;
    this.scene?.tex.destroy();
    this.bloom?.tex.destroy();
    this.scene = this.makeTex(w, h);
    this.bloom = this.makeTex(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.bgBloom = this.bloomBindGroup(this.pBloom, this.scene);
    this.bgFinal = this.finalBindGroup(this.pFinal, this.scene, this.bloom);
  }

  private makeTex(w: number, h: number): Tex {
    const tex = this.device.createTexture({
      size: [w, h],
      format: HDR,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    return { tex, view: tex.createView(), w, h };
  }

  private bloomBindGroup(p: GPURenderPipeline, scene: Tex) {
    return this.device.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.viewU } },
        { binding: 1, resource: scene.view },
        { binding: 2, resource: this.sampClamp },
      ],
    });
  }

  private finalBindGroup(p: GPURenderPipeline, scene: Tex, bloom: Tex) {
    return this.device.createBindGroup({
      layout: p.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.viewU } },
        { binding: 1, resource: scene.view },
        { binding: 2, resource: bloom.view },
        { binding: 3, resource: this.sampClamp },
      ],
    });
  }

  // ---------------------------------------------------------------- per frame

  private governor(dt: number) {
    this.frames++;
    if (this.frames < 60 || look.quality === "high") return;
    const ms = Math.max(dt * 1000, this.gpuMs);
    if (!(ms > 0)) return;
    this.ema += (ms - this.ema) * 0.05;
    if (this.cool > 0) {
      this.cool--;
      return;
    }
    const budget = look.maxFps > 0 ? 1000 / look.maxFps : 16.7;
    if (this.ema > budget * 1.22) {
      // Steps first, then sim grid. Output resolution is never lowered.
      const i = STEP_LADDER.findIndex((s) => s >= this.stepCap);
      if (i > 1) {
        this.stepCap = STEP_LADDER[i - 1]!;
      } else if (this.scaleIdx < SCALE_LADDER.length - 1) {
        this.scaleIdx++;
        this.fitSim();
      }
      this.cool = 90;
      this.ema = budget;
    } else if (this.ema < budget * 0.82) {
      const max = isCoarse() ? 24 : 40;
      if (this.scaleIdx > 0 && this.stepCap >= 16) {
        this.scaleIdx--;
        this.fitSim();
      } else if (this.stepCap < max) {
        const i = STEP_LADDER.findIndex((s) => s >= this.stepCap);
        this.stepCap = STEP_LADDER[Math.min(STEP_LADDER.length - 1, i + 1)]!;
      }
      this.cool = 240;
    }
  }

  private updateLut(p: VisualPreset) {
    const species = this.currentPalette().stops as RGB[];
    const key = `${p.id}|${look.rev}|${p.stops ? "" : species.flat().map((x) => x.toFixed(3)).join(",")}`;
    if (key === this.lutKey) return;
    this.lutKey = key;
    this.device.queue.writeTexture({ texture: this.lutTex }, buildLut(p, species), { bytesPerRow: LUT_W * 4 }, [LUT_W, 2]);
  }

  private frame(dt: number, time: number) {
    if (this.failed || !this.state) return;
    if (this.inFlight >= 2) {
      // GPU is behind: skip this frame's work but keep audio/UI ticking.
      try {
        this.onFrame?.(dt, runtime.stats);
      } catch {
        /* keep going */
      }
      return;
    }
    this.governor(dt);
    if (runtime.seedNonce !== this.seedSeen) this.seed();
    if (runtime.scatterNonce !== this.scatterSeen) this.scatterSeen = runtime.scatterNonce;
    tickMorph(dt);
    this.fitSim();

    const p = visualById(look.visual);
    const calm = look.reducedMotion ? 0.4 : 1;
    this.time += dt * calm;
    const f = features;
    const k = look.reactivity;
    this.sBass = approach(this.sBass, Math.max(f.bass, f.sub * 0.8), dt, f.bass > this.sBass ? 0.1 : 0.5);
    this.sCen = approach(this.sCen, f.centroid, dt, 1.2);
    this.sHigh = approach(this.sHigh, f.high, dt, 0.25);
    this.sRms = approach(this.sRms, f.rms, dt, 0.15);
    this.sOnset = approach(this.sOnset, f.onset, dt, 0.1);
    this.drift.tick(look.morph ? dt : 0, 48, this.sCen);
    lookStatus.regime = this.drift.name;

    const params = runtime.params;
    const imageMode = params.imageMode === "develop" ? 0 : params.imageMode === "inoculate" ? 1 : 2;
    const L = Math.max(0, Math.min(1, runtime.listen));
    const b = runtime.bands;
    const heard = b.rms > 0.03 ? L : 0;
    const sense = runtime.sense;
    const posed =
      runtime.gyroOn &&
      (sense.compass || sense.spin > 0.008 || Math.abs(sense.roll) + Math.abs(sense.pitch) + Math.abs(sense.yaw) > 0.02);
    const heading = ((sense.heading % 360) + 360) % 360;
    const hRad = (heading * Math.PI) / 180;
    const north = 0.5 + 0.5 * Math.cos(hRad);
    const east = 0.5 + 0.5 * Math.sin(hRad);
    const breathe = 0.82 + 0.28 * (0.5 + 0.5 * Math.sin(time * 0.23));
    const stir = posed ? Math.min(1, sense.spin * 1.7 + Math.max(0, sense.gforce - 0.03) * 1.2) : 0;
    const poseTarget = posed ? 0.48 + 0.9 * north + 0.28 * east : breathe;
    this.smoothScale += (poseTarget - this.smoothScale) * 0.04;
    const grain = posed ? 1 : Math.max(1, Math.min(1.7, Math.min(this.simW, this.simH) / 1100));
    let feed = params.feed + b.bass * heard * 0.02 + (posed ? sense.pitch * 0.012 + (north - 0.5) * 0.006 + stir * 0.006 : 0);
    let kill = params.kill - b.mid * heard * 0.012 + (posed ? -sense.roll * 0.01 + (east - 0.5) * 0.005 : 0);
    // v2: the music breathes through the chemistry.
    feed += this.sBass * 0.0045 * k;
    kill += (this.sCen - 0.4) * 0.0035 * k;
    let du = params.du * (1 + b.high * heard * 0.4) * this.smoothScale * grain * look.scale * (1 + this.sHigh * 0.08 * k);
    let dv = params.dv * (1 - b.bass * heard * 0.22) * this.smoothScale * grain * look.scale;
    let simDt = Math.max(
      0.35,
      Math.min(posed ? 1.85 : 2.1, params.speed * (posed ? 1.05 + stir * 0.35 : grain) * (1 + b.rms * heard * 0.7 + runtime.beat * 0.35)),
    );
    if (look.reducedMotion) simDt *= 0.6;

    // Orientation from tilt (or compass, or a slow drift).
    const tilt = Math.hypot(control.tiltX, control.tiltY);
    let targetAngle = this.anisoAngle;
    if (control.sensing && tilt > 0.06) targetAngle = Math.atan2(control.tiltY, control.tiltX);
    else if (sense.compass) targetAngle = hRad;
    else targetAngle = Math.PI / 2 + Math.sin(this.time * 0.013) * 1.2;
    let da = targetAngle - this.anisoAngle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.anisoAngle += da * Math.min(1, dt * 1.5);
    let aniso = Math.min(0.6, p.aniso + Math.min(0.3, tilt * 0.45) * k);
    const orient = p.id === "temple-gold" ? 2 : p.id === "uv-mandala" ? 1 : 0;
    // keep the explicit scheme stable: D·dt·(1.6 + 2·aniso) < 1.8
    const lim = 1.8 / (1.6 + 2 * aniso);
    if (du * simDt > lim) du = lim / simDt;
    if (dv * simDt > lim) dv = lim / simDt;
    if (aniso < 0.002) aniso = 0;

    const ax = runtime.flowX * (posed ? 0.55 : 1) + (b.high - b.bass) * heard * 0.22 + (posed ? 0 : Math.sin(time * 0.37) * 0.1);
    const ay = runtime.flowY * (posed ? 0.55 : 1) + (b.centroid - 0.4) * heard * 0.16 + (posed ? 0 : Math.cos(time * 0.29) * 0.08);
    const flowX = (ax * 0.28 + control.tiltX * 0.35 * k) * calm;
    const flowY = (ay * 0.28 - control.tiltY * 0.35 * k) * calm;
    const swirl = p.swirl * (0.6 + 0.6 * this.sBass) * calm;

    // Chladni modes from the strongest band (Cymatic look).
    let best = 0;
    let bi = 4;
    for (let i = 2; i < SPECTRUM_BANDS; i++) {
      const v = f.spectrum[i]!;
      if (v > best) {
        best = v;
        bi = i;
      }
    }
    this.chladN = approach(this.chladN, 1 + (bi % 5), dt, 2.5);
    this.chladM = approach(this.chladM, 2 + (bi % 5) + ((bi >> 2) % 4), dt, 2.5);

    const steps = runtime.paused ? 0 : Math.max(4, Math.min(this.stepCap, params.steps | 0, 40));
    lookStatus.steps = steps;

    // Onsets → soft seeds.
    const s = this.simData;
    s.fill(0);
    let o = 0;
    const v4 = (a: number, b2: number, c: number, d: number) => {
      s[o++] = a;
      s[o++] = b2;
      s[o++] = c;
      s[o++] = d;
    };
    v4(this.simW, this.simH, 1 / this.simW, 1 / this.simH);
    v4(Math.max(0.008, Math.min(0.095, feed)), Math.max(0.03, Math.min(0.08, kill)), Math.max(0.05, du), Math.max(0.025, dv));
    v4(simDt, this.drift.feed, this.drift.kill, p.varyAmount);
    v4(flowX, flowY, swirl, this.time);
    v4(aniso, Math.cos(this.anisoAngle), Math.sin(this.anisoAngle), orient);
    v4(VARY_INDEX[p.vary], this.chladN, this.chladM, p.symmetry);
    v4(runtime.hasImage && params.imageMode !== "palette" ? 1 : 0, params.imageMix, imageMode, runtime.motion);
    const ls = this.newestLockSlot();
    v4(ls >= 0 ? 1 : 0, ls >= 0 ? 1 : 0, this.lockImpulse, runtime.beat);
    const hands = runtime.brushes;
    let bx = 0.5;
    let by = 0.5;
    if (hands.length) {
      bx = hands.reduce((a, h) => a + h.x, 0) / hands.length;
      by = 1 - hands.reduce((a, h) => a + h.y, 0) / hands.length;
    }
    v4(this.lockPoint[0], this.lockPoint[1], bx, by);
    for (let i = 0; i < MAX_BRUSHES; i++) {
      const br = runtime.brushes[i] ?? EMPTY;
      v4(br.x, 1 - br.y, br.size, br.strength);
    }
    for (let i = 0; i < MAX_BRUSHES; i++) {
      const br = runtime.brushes[i] ?? EMPTY;
      v4(br.strength > 0 ? br.x - br.px : 0, br.strength > 0 ? br.py - br.y : 0, 0, 0);
    }
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = f.ripples[i]!;
      let amt = 0;
      if (r.t !== this.rippleSeen[i] && r.seed && r.strength > 0 && f.now - r.t < 0.25 && steps > 0) {
        this.rippleSeen[i] = r.t;
        const total = Math.min(0.85, 0.6 * r.strength * k * (look.reducedMotion ? 0.5 : 1));
        amt = 1 - Math.pow(1 - total, 1 / steps);
      }
      v4(r.x, 1 - r.y, 0.012 + 0.022 * r.strength, amt);
    }
    this.device.queue.writeBuffer(this.simU, 0, s);

    // Pack uniforms (lock ghosts).
    const pw = this.packData;
    pw.fill(0);
    pw[0] = this.simW;
    pw[1] = this.simH;
    for (let i = 0; i < this.lockCount; i++) {
      const slot = (this.lockStart + i) % 4;
      pw[4 + slot] = 0.16 + 0.04 * i;
    }
    this.device.queue.writeBuffer(this.packU, 0, pw);
    this.updateLut(p);

    this.ensureBindGroups();
    const enc = this.device.createCommandEncoder();
    const gx = Math.ceil(this.simW / 16);
    const gy = Math.ceil(this.simH / 16);
    const cp = enc.beginComputePass();
    cp.setPipeline(this.pSim);
    for (let i = 0; i < steps; i++) {
      cp.setBindGroup(0, this.bgSim![this.cur]!);
      cp.dispatchWorkgroups(gx, gy);
      this.cur = 1 - this.cur;
    }
    cp.setPipeline(this.pPack);
    cp.setBindGroup(0, this.bgPack![this.cur]!);
    cp.dispatchWorkgroups(gx, gy);
    this.statsEvery++;
    const doStats = this.statsEvery % 15 === 0 && !this.statsPending;
    if (doStats) {
      this.device.queue.writeBuffer(this.statsU, 0, new Float32Array([this.simW, this.simH, 0, 0]));
      cp.setPipeline(this.pStats);
      cp.setBindGroup(0, this.bgStats![this.cur]!);
      cp.dispatchWorkgroups(1);
    }
    cp.end();
    if (doStats) enc.copyBufferToBuffer(this.statsBuf, 0, this.statsRead, 0, 256 * 8);

    this.renderTo(enc, p, time, null);
    this.device.queue.submit([enc.finish()]);
    if (doStats) this.readStats();
    const solo = this.inFlight === 0;
    const t0 = performance.now();
    this.inFlight++;
    void this.device.queue.onSubmittedWorkDone().then(
      () => {
        this.inFlight = Math.max(0, this.inFlight - 1);
        if (solo) this.gpuMs += (Math.min(250, performance.now() - t0) - this.gpuMs) * 0.15;
      },
      () => {
        this.inFlight = Math.max(0, this.inFlight - 1);
      },
    );

    this.flash *= Math.exp(-2.4 * dt);
    this.lockImpulse *= Math.exp(-3.2 * dt);
    lookStatus.fps = Math.round(1000 / Math.max(1, this.ema));
    try {
      this.onFrame?.(dt, runtime.stats);
    } catch {
      /* audio / UI must not stall the solver */
    }
  }

  private packView(p: VisualPreset, w: number, h: number) {
    const v = this.viewData;
    v.fill(0);
    let o = 0;
    const v4 = (a: number, b: number, c: number, d: number) => {
      v[o++] = a;
      v[o++] = b;
      v[o++] = c;
      v[o++] = d;
    };
    const f = features;
    // Drone pitch → fold order, changed only after it holds steady.
    const want = Math.round(Math.max(3, Math.min(12, p.foldBase - 2 + f.drone.norm * 6)));
    if (want !== this.foldTarget) {
      this.foldHold += 1 / 60;
      if (this.foldHold > 1.2) {
        this.foldTarget = want;
        this.foldHold = 0;
      }
    } else this.foldHold = 0;
    this.foldOrder = this.foldTarget;
    this.kalRot += (0.004 + this.sRms * 0.01) * (look.reducedMotion ? 0.3 : 1) / 60;
    const play = runtime.play;
    v4(w, h, 1 / w, 1 / h);
    v4(this.simW, this.simH, 1 / this.simW, 1 / this.simH);
    v4(this.time, w / h, this.flash, look.reducedMotion ? 1 : 0);
    v4(p.material, p.emboss, p.specular, p.edge);
    const cyc = p.id === "chrome-bloom" || p.id === "projection";
    v4(p.crisp, cyc ? this.sCen * 0.3 + this.time * 0.004 : 0, 1, 0.2);
    v4(p.kaleido, this.foldOrder, this.kalRot + (control.heading || 0) * 0.5, 0.2 + this.sBass * 0.015);
    v4(this.sRms, this.sBass, this.sCen, this.sOnset);
    v4(-0.45 + control.tiltX * 0.5, -0.55 + control.tiltY * 0.4, 0.75, (play.pitch - 0.5) * play.amp * 0.62);
    v4(p.bloom, p.haze, look.reducedMotion ? p.grain * 0.5 : p.grain, p.vignette);
    v4(p.hazeTint[0], p.hazeTint[1], p.hazeTint[2], p.id === "off" ? play.amp : 0);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = f.ripples[i]!;
      const age = f.now - r.t;
      const on = age >= 0 && age < 3.5 ? r.strength * (look.reducedMotion ? 0.3 : 1) : 0;
      v4(r.x, r.y, Math.max(0, age), on);
    }
  }

  private renderTo(enc: GPUCommandEncoder, p: VisualPreset, _time: number, capture: { view: GPUTextureView; w: number; h: number } | null) {
    let w: number;
    let h: number;
    if (capture) {
      w = capture.w;
      h = capture.h;
    } else {
      const dpr = Math.min(look.maxDpr, window.devicePixelRatio || 1);
      const cssW = this.canvas.clientWidth || 1;
      const cssH = this.canvas.clientHeight || 1;
      w = Math.max(1, Math.round(cssW * dpr));
      h = Math.max(1, Math.round(cssH * dpr));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
    }
    this.packView(p, w, h);
    this.device.queue.writeBuffer(this.viewU, 0, this.viewData);
    let scene: Tex;
    let bloom: Tex;
    let bgBloom: GPUBindGroup;
    let bgFinal: GPUBindGroup;
    let pFinal: GPURenderPipeline;
    let out: GPUTextureView;
    if (capture) {
      scene = this.makeTex(w, h);
      bloom = this.makeTex(Math.max(1, w >> 1), Math.max(1, h >> 1));
      pFinal = this.pFinalCap!;
      bgBloom = this.bloomBindGroup(this.pBloom, scene);
      bgFinal = this.finalBindGroup(pFinal, scene, bloom);
      out = capture.view;
    } else {
      this.ensureTargets(w, h);
      scene = this.scene!;
      bloom = this.bloom!;
      bgBloom = this.bgBloom!;
      bgFinal = this.bgFinal!;
      pFinal = this.pFinal;
      out = this.ctx.getCurrentTexture().createView();
    }
    const pass = (view: GPUTextureView, pipe: GPURenderPipeline, bg: GPUBindGroup) => {
      const rp = enc.beginRenderPass({
        colorAttachments: [{ view, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      });
      rp.setPipeline(pipe);
      rp.setBindGroup(0, bg);
      rp.draw(3);
      rp.end();
    };
    pass(scene.view, this.pScene, this.bgScene!);
    pass(bloom.view, this.pBloom, bgBloom);
    pass(out, pFinal, bgFinal);
    if (capture) {
      const sc = scene;
      const bl = bloom;
      void this.device.queue.onSubmittedWorkDone().then(() => {
        sc.tex.destroy();
        bl.tex.destroy();
      });
    }
  }

  private readStats() {
    this.statsPending = true;
    const buf = this.statsRead;
    buf
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        if (this.destroyed) return;
        const data = new Float32Array(buf.getMappedRange().slice(0));
        buf.unmap();
        const grid = runtime.stats.grid;
        let sumU = 0;
        let sumV = 0;
        let cx = 0;
        let cy = 0;
        let mass = 0;
        let edge = 0;
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const i = y * 16 + x;
            const u = data[i * 2]!;
            const v = data[i * 2 + 1]!;
            grid[i] = v;
            sumU += u;
            sumV += v;
            cx += x * v;
            cy += y * v;
            mass += v;
            if (x > 0) edge += Math.abs(v - grid[i - 1]!);
          }
        }
        const n = 256;
        runtime.stats.meanU = sumU / n;
        runtime.stats.meanV = sumV / n;
        runtime.stats.energy = Math.min(1, sumV / (n * 0.08));
        runtime.stats.cx = mass > 1e-5 ? cx / mass / 15 : 0.5;
        runtime.stats.cy = mass > 1e-5 ? 1 - cy / mass / 15 : 0.5;
        runtime.stats.edge = Math.min(1, edge / 40);
      })
      .catch(() => {
        /* device gone */
      })
      .finally(() => {
        this.statsPending = false;
      });
  }

  async capturePng(): Promise<Blob> {
    if (this.failed || !this.state) throw new Error("Could not capture the field.");
    if (!this.pFinalCap) this.pFinalCap = await this.fullPipe(this.mFinal, "fsFinal", "rgba8unorm");
    const cssW = Math.max(1, this.canvas.clientWidth || 1);
    const cssH = Math.max(1, this.canvas.clientHeight || 1);
    const aspect = cssW / cssH;
    const dpr = Math.min(look.maxDpr, window.devicePixelRatio || 1);
    const screenLong = Math.max(cssW, cssH) * dpr;
    const capLong = Math.min(3200, Math.max(2048, screenLong, Math.max(this.simW, this.simH)));
    const cw = aspect >= 1 ? Math.round(capLong) : Math.max(1, Math.round(capLong * aspect));
    const ch = aspect >= 1 ? Math.max(1, Math.round(capLong / aspect)) : Math.round(capLong);
    const tex = this.device.createTexture({
      size: [cw, ch],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const bytesPerRow = Math.ceil((cw * 4) / 256) * 256;
    const buf = this.device.createBuffer({ size: bytesPerRow * ch, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    this.renderTo(enc, visualById(look.visual), performance.now() / 1000, { view: tex.createView(), w: cw, h: ch });
    enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow }, [cw, ch]);
    this.device.queue.submit([enc.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(buf.getMappedRange());
    const pixels = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) pixels.set(src.subarray(y * bytesPerRow, y * bytesPerRow + cw * 4), y * cw * 4);
    buf.unmap();
    buf.destroy();
    tex.destroy();
    const plate = document.createElement("canvas");
    plate.width = cw;
    plate.height = ch;
    const c2 = plate.getContext("2d");
    if (!c2) throw new Error("Could not capture the field.");
    c2.putImageData(new ImageData(pixels, cw, ch), 0, 0);
    return new Promise((resolve, reject) => {
      plate.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not capture the field."))), "image/png");
    });
  }
}
