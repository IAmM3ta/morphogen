import { useCallback, useEffect, useRef, useState } from "react";
import {
  Eye,
  EyeOff,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ControlDock } from "./control-dock";
import { StartGate } from "./start-gate";
import { Wordmark } from "./wordmark";
import { RDEngine } from "@/lib/morphogen/rd-engine";
import { AudioEngine } from "@/lib/morphogen/audio-engine";
import { MidiOut, type MidiDevice } from "@/lib/morphogen/midi-out";
import { TdClient, type TdStatus } from "@/lib/morphogen/td-client";
import { attachSensors, localPointerBrushes, requestSensorPermission } from "@/lib/morphogen/sensors";
import { extractPaletteFromImage } from "@/lib/morphogen/extract-palette";
import { PRESETS, MAX_BRUSHES, pickSimMaxSide, type Brush } from "@/lib/morphogen/presets";
import { runtime } from "@/lib/morphogen/runtime";
import { useInstrument } from "@/lib/morphogen/store";
import { cn } from "@/lib/utils";

type TabId = "field" | "image" | "sense" | "sound" | "sync";

export function MorphogenApp() {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<RDEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const midiRef = useRef<MidiOut | null>(null);
  const tdRef = useRef<TdClient | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const localBrushes = useRef<Brush[]>([]);
  const remoteBrushes = useRef<Map<string, Brush[]>>(new Map());
  const remoteFlow = useRef({ x: 0, y: 0, n: 0 });
  const imageEl = useRef<HTMLImageElement | null>(null);
  const performLockRef = useRef<(x?: number, y?: number) => void>(() => {});
  const lastLockAt = useRef(0);

  const started = useInstrument((s) => s.started);
  const uiHidden = useInstrument((s) => s.uiHidden);
  const panelOpen = useInstrument((s) => s.panelOpen);
  const params = useInstrument((s) => s.params);
  const gyroOn = useInstrument((s) => s.gyroOn);
  const micOn = useInstrument((s) => s.micOn);
  const cameraOn = useInstrument((s) => s.cameraOn);
  const audioOn = useInstrument((s) => s.audioOn);
  const volume = useInstrument((s) => s.volume);
  const muted = useInstrument((s) => s.muted);
  const images = useInstrument((s) => s.images);
  const activeImageId = useInstrument((s) => s.activeImageId);
  const patch = useInstrument((s) => s.patch);
  const applyPreset = useInstrument((s) => s.applyPreset);

  const [tab, setTab] = useState<TabId>("field");
  const [paused, setPaused] = useState(false);
  const [energy, setEnergy] = useState(0);
  const [glError, setGlError] = useState<string | null>(null);
  const [tdStatus, setTdStatus] = useState<TdStatus>("idle");
  const [tdError, setTdError] = useState("");
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [isFs, setIsFs] = useState(false);
  const [lockCount, setLockCount] = useState(0);
  const [hz, setHz] = useState(0);
  const [voices, setVoices] = useState(0);
  const [charge, setCharge] = useState({ v: 0, x: 0.5, y: 0.5 });
  const [pulse, setPulse] = useState<{ x: number; y: number; id: number } | null>(null);

  const performLock = useCallback((x = 0.5, y = 0.5) => {
    const now = performance.now();
    if (now - lastLockAt.current < 180) return;
    lastLockAt.current = now;
    const n = engineRef.current?.lockLayer(x, y) ?? 0;
    audioRef.current?.lockLoop();
    setLockCount(n);
    const id = now;
    setPulse({ x, y, id });
    window.setTimeout(() => {
      setPulse((p) => (p?.id === id ? null : p));
    }, 720);
  }, []);

  const popTo = useCallback((n: number) => {
    let cur = engineRef.current?.lockCount ?? 0;
    while (cur > n) {
      engineRef.current?.popLock();
      audioRef.current?.popLock();
      cur -= 1;
    }
    setLockCount(cur);
  }, []);

  const clearAllLocks = useCallback(() => {
    engineRef.current?.clearLocks();
    audioRef.current?.clearLocks();
    setLockCount(0);
  }, []);

  performLockRef.current = performLock;

  useEffect(() => {
    const sync = () => {
      Object.assign(runtime.params, useInstrument.getState().params);
    };
    sync();
    return useInstrument.persist.onFinishHydration(sync);
  }, []);

  useEffect(() => {
    runtime.paused = paused;
  }, [paused]);

  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    onFs();
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: RDEngine;
    try {
      engine = new RDEngine(canvas, pickSimMaxSide());
    } catch (err) {
      setGlError(err instanceof Error ? err.message : "WebGL2 unavailable");
      return;
    }
    engineRef.current = engine;
    engine.onFrame = (_dt, stats) => {
      audioRef.current?.tick();
      setEnergy((e) => (Math.abs(e - stats.energy) > 0.02 ? stats.energy : e));
      const a = audioRef.current;
      if (a) {
        setHz((h) => (Math.abs(h - a.lastHz) > 1.5 ? a.lastHz : h));
        setVoices(a.voiceCount);
      }
    };
    engine.start();
    const probe = () => ({
      energy: runtime.stats.energy,
      meanV: runtime.stats.meanV,
      brushes: runtime.brushes.map((b) => ({ id: b.id, x: +b.x.toFixed(3), y: +b.y.toFixed(3) })),
      locks: engine.lockCount,
      feed: runtime.params.feed,
      kill: runtime.params.kill,
      sim: { w: engine.simW, h: engine.simH },
      gyro: useInstrument.getState().gyroOn,
      preset: useInstrument.getState().presetId,
      hz: audioRef.current?.lastHz ?? 0,
      voices: audioRef.current?.voiceCount ?? 0,
      antenna: runtime.antenna.on,
    });
    (window as unknown as { __morphogen: typeof probe }).__morphogen = probe;
    return () => {
      delete (window as unknown as { __morphogen?: typeof probe }).__morphogen;
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const unpaint = localPointerBrushes(
      wrap,
      () => {
        const p = useInstrument.getState().params;
        return { size: p.brushSize, strength: p.brushStrength };
      },
      (b) => {
        localBrushes.current = b;
      },
      (x, y) => performLockRef.current(x, y),
      (v, x, y) => setCharge({ v, x, y }),
    );
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      const slots = [...useInstrument.getState().images];
      let lastId = "";
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const url = URL.createObjectURL(file);
        const id = `img-${Math.random().toString(36).slice(2, 8)}`;
        slots.push({ id, name: file.name, url });
        lastId = id;
      }
      if (lastId) useInstrument.getState().patch({ images: slots, activeImageId: lastId });
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    wrap.addEventListener("drop", onDrop);
    wrap.addEventListener("dragover", onDragOver);
    return () => {
      unpaint();
      wrap.removeEventListener("drop", onDrop);
      wrap.removeEventListener("dragover", onDragOver);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const remotes: Brush[] = [];
      remoteBrushes.current.forEach((list) => remotes.push(...list));
      runtime.brushes = [...localBrushes.current, ...remotes].slice(0, MAX_BRUSHES);
      if (remoteFlow.current.n > 0) {
        runtime.flowX += remoteFlow.current.x;
        runtime.flowY += remoteFlow.current.y;
      }
      runtime.pointerFlowX *= 0.72;
      runtime.pointerFlowY *= 0.72;
      runtime.pointerMotion *= 0.82;
      if (!useInstrument.getState().gyroOn) {
        runtime.flowX = 0;
        runtime.flowY = 0;
      }
      runtime.motion = Math.min(
        2.2,
        Math.hypot(runtime.flowX, runtime.flowY) + runtime.pointerMotion + runtime.mic * 1.35,
      );
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!gyroOn || !started) return;
    return attachSensors((mag) => {
      runtime.brushes = [
        ...runtime.brushes,
        {
          id: -2,
          x: 0.5,
          y: 0.5,
          px: 0.5,
          py: 0.5,
          size: 0.07 + mag * 0.08,
          strength: 0.18 + mag * 0.2,
          pressure: 0.7,
          radius: 0.6,
        },
      ].slice(0, MAX_BRUSHES);
    });
  }, [gyroOn, started]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setVolume(audioOn ? volume : 0);
    audio.setMuted(muted || !audioOn);
  }, [audioOn, volume, muted]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") audioRef.current?.resume();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "h" || e.key === "H") {
        patch({ uiHidden: !useInstrument.getState().uiHidden, panelOpen: false });
      } else if (e.key === "f" || e.key === "F") {
        void toggleFullscreen();
      } else if (e.key === "r" || e.key === "R") {
        runtime.seedNonce += 1;
      } else if (e.key === "l" || e.key === "L") {
        performLockRef.current();
      } else if ((e.key === "z" || e.key === "Z") && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (e.shiftKey) clearAllLocks();
        else popTo((engineRef.current?.lockCount ?? 1) - 1);
      } else if (e.key === "Escape") {
        patch({ panelOpen: false, uiHidden: false });
      } else if (e.key >= "1" && e.key <= "9") {
        const preset = PRESETS[Number(e.key) - 1];
        if (preset) {
          applyPreset(preset.id);
          runtime.seedNonce += 1;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyPreset, patch, clearAllLocks, popTo]);

  const applyImageUrl = useCallback((url: string | null) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!url) {
      engine.setImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageEl.current = img;
      engine.setImage(img);
    };
    img.src = url;
  }, []);

  useEffect(() => {
    const slot = images.find((i) => i.id === activeImageId);
    if (!cameraOn) applyImageUrl(slot?.url ?? null);
  }, [images, activeImageId, cameraOn, applyImageUrl]);

  useEffect(() => {
    let raf = 0;
    const video = videoRef.current;
    if (!cameraOn || !video) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        cameraStream.current = stream;
        video.srcObject = stream;
        await video.play();
        const tick = () => {
          if (cancelled) return;
          if (video.readyState >= 2) engineRef.current?.setImage(video);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        toast("Camera permission was declined");
        patch({ cameraOn: false });
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cameraStream.current?.getTracks().forEach((t) => t.stop());
      cameraStream.current = null;
      if (video) video.srcObject = null;
    };
  }, [cameraOn, patch]);

  const enter = useCallback(async () => {
    const audio = new AudioEngine();
    audio.unlock();
    audioRef.current = audio;
    audio.setVolume(useInstrument.getState().volume);
    runtime.started = true;
    patch({ started: true });

    if (useInstrument.getState().micOn) {
      const ok = await audio.connectMic();
      if (!ok) toast("Microphone permission was declined");
    }
    const gyro = useInstrument.getState().gyroOn;
    if (gyro) void requestSensorPermission();
    else {
      patch({ gyroOn: true });
      void requestSensorPermission();
    }
    const midi = new MidiOut();
    midi.onDevices = setMidiDevices;
    midiRef.current = midi;
    void midi.init();
    const td = new TdClient();
    td.onStatus = (s, err) => {
      setTdStatus(s);
      setTdError(err ?? "");
    };
    tdRef.current = td;
  }, [patch]);

  const onToggleMic = useCallback(
    async (on: boolean) => {
      patch({ micOn: on });
      const audio = audioRef.current;
      if (!audio) return;
      if (on) {
        const ok = await audio.connectMic();
        if (!ok) {
          toast("Microphone permission was declined");
          patch({ micOn: false });
        }
      } else {
        audio.stopMic();
      }
    },
    [patch],
  );

  const onUsePalette = useCallback(() => {
    const src = imageEl.current ?? videoRef.current;
    if (!src) {
      toast("Add an image or enable the camera first");
      return;
    }
    const pal = extractPaletteFromImage(src, "image");
    runtime.customPalette = pal;
    useInstrument.getState().setParam("paletteId", "image");
    toast("Palette sampled from image");
  }, []);

  const onTdConnect = useCallback(() => {
    const s = useInstrument.getState();
    tdRef.current?.connect(s.tdUrl, s.tdGrid, () => runtime.mic);
  }, []);

  const onMidiSelect = useCallback(
    (id: string | null) => {
      patch({ midiId: id, midiOn: Boolean(id) });
      const midi = midiRef.current;
      if (!midi) return;
      midi.select(id);
      midi.setEnabled(Boolean(id));
    },
    [patch],
  );

  const requestFs = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast("Fullscreen was blocked");
    }
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg text-fg select-none">
      <div ref={canvasWrapRef} className="absolute inset-0 touch-none" style={{ touchAction: "none" }}>
        <canvas ref={canvasRef} className="block h-full w-full" />
        <video ref={videoRef} className="hidden" playsInline muted />
        {charge.v > 0.02 && (
          <div
            className="lock-charge pointer-events-none absolute z-10 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${charge.x * 100}%`,
              top: `${charge.y * 100}%`,
              ["--charge" as string]: String(charge.v),
            }}
          />
        )}
        {pulse && (
          <div
            className="pointer-events-none absolute z-10 size-0"
            style={{ left: `${pulse.x * 100}%`, top: `${pulse.y * 100}%` }}
          >
            <span className="lock-pulse absolute block size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fg/55" />
          </div>
        )}
      </div>

      {glError && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg px-6 text-center">
          <p className="max-w-sm text-sm text-muted">{glError}</p>
        </div>
      )}

      {!started && !glError && <StartGate onEnter={() => void enter()} />}

      {started && !uiHidden && (
        <>
          <header
            data-ui
            className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4"
          >
            <div className="pointer-events-none">
              <p className="text-lg text-fg">
                <Wordmark variant="hud" />
              </p>
              <p className="font-mono text-[10px] tabular-nums text-muted">
                F {params.feed.toFixed(4)} · K {params.kill.toFixed(4)} · E {energy.toFixed(2)}
                {lockCount > 0 ? ` · LOOP ${lockCount}` : ""}
                {voices > 0 ? ` · ${Math.round(hz)} Hz · ${voices}v` : ""}
              </p>
            </div>
            <div className="pointer-events-auto flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Play" : "Pause"}
              >
                {paused ? <Play /> : <Pause />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  runtime.seedNonce += 1;
                }}
                aria-label="Reseed"
              >
                <RotateCcw />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => patch({ uiHidden: true, panelOpen: false })}
                aria-label="Hide chrome"
              >
                <EyeOff />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => void requestFs()} aria-label="Fullscreen">
                {isFs ? <Minimize2 /> : <Maximize2 />}
              </Button>
              <Button
                variant={panelOpen ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => patch({ panelOpen: !panelOpen })}
                aria-label="Console"
              >
                <SlidersHorizontal />
              </Button>
            </div>
          </header>

          <ControlDock
            tab={tab}
            onTab={setTab}
            tdStatus={tdStatus}
            tdError={tdError}
            onTdConnect={onTdConnect}
            onTdDisconnect={() => tdRef.current?.disconnect()}
            midiDevices={midiDevices}
            onMidiSelect={onMidiSelect}
            onToggleMic={(on) => void onToggleMic(on)}
            onToggleCamera={(on) => patch({ cameraOn: on })}
            onToggleGyro={(on) => {
              patch({ gyroOn: on });
              if (on) void requestSensorPermission();
            }}
            cameraOn={cameraOn}
            onAddImage={(files) => {
              if (!files?.length) return;
              const slots = [...useInstrument.getState().images];
              let lastId = "";
              for (const file of Array.from(files)) {
                const url = URL.createObjectURL(file);
                const id = `img-${Math.random().toString(36).slice(2, 8)}`;
                slots.push({ id, name: file.name, url });
                lastId = id;
              }
              patch({ images: slots, activeImageId: lastId || useInstrument.getState().activeImageId });
            }}
            onPickImage={(id) => patch({ activeImageId: id, cameraOn: false })}
            onUsePalette={onUsePalette}
            onLock={() => performLock()}
            onPop={() => popTo(lockCount - 1)}
            onClearLocks={clearAllLocks}
            lockCount={lockCount}
          />
        </>
      )}

      {started && (
        <div
          data-ui
          className="pointer-events-auto absolute bottom-[max(0.85rem,env(safe-area-inset-bottom))] left-3 z-20 flex items-center gap-2"
        >
          <Button
            variant={lockCount > 0 ? "secondary" : "ghost"}
            size="icon"
            onClick={() => performLock()}
            aria-label="Lock loop"
            title="Lock this generation"
          >
            <Layers />
          </Button>
          <div className="flex h-11 items-center gap-1.5 px-1" aria-label={`${lockCount} locked loops`}>
            {[0, 1, 2, 3].map((i) => {
              const on = i < lockCount;
              return (
                <button
                  key={i}
                  type="button"
                  className="flex h-11 w-6 items-center justify-center"
                  onClick={() => {
                    if (!on) return;
                    popTo(i === lockCount - 1 ? i : i + 1);
                  }}
                  aria-label={on ? `Keep loops 1–${i + 1}` : `Empty loop ${i + 1}`}
                  disabled={!on}
                >
                  <span
                    className={cn(
                      "block size-2 rounded-full transition-colors duration-200",
                      on ? "bg-fg" : "bg-fg/25",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {started && uiHidden && (
        <button
          type="button"
          data-ui
          className="absolute top-3 right-3 z-20 flex size-11 items-center justify-center rounded-md text-fg/40 hover:text-fg"
          onClick={() => patch({ uiHidden: false })}
          aria-label="Show chrome"
        >
          <Eye className="size-4" />
        </button>
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg/50 to-transparent",
          (uiHidden || !started) && "opacity-0",
        )}
      />
    </div>
  );
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* ignore */
  }
}
