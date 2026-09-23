import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Circle,
  Eye,
  EyeOff,
  House,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Square,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ControlDock } from "./control-dock";
import { StartGate } from "./start-gate";
import { ArOverlay } from "./ar-overlay";
import { OrbitGlass } from "./orbit-glass";
import { LivingField, MorphoMark, Wordmark } from "./wordmark";
import { RDEngine } from "@/lib/morphogen/rd-engine";
import { AudioEngine } from "@/lib/morphogen/audio-engine";
import { MidiOut, type MidiDevice } from "@/lib/morphogen/midi-out";
import { TdClient, type TdStatus } from "@/lib/morphogen/td-client";
import { attachSensors, localPointerBrushes, requestSensorPermission } from "@/lib/morphogen/sensors";
import { extractPaletteFromImage } from "@/lib/morphogen/extract-palette";
import { PRESETS, MAX_BRUSHES, pickSimMaxSide, waveformById, DEFAULT_WAVEFORM, type Brush } from "@/lib/morphogen/presets";
import { runtime } from "@/lib/morphogen/runtime";
import { artistFromState, audioFromState, isFactoryInstrument, useInstrument } from "@/lib/morphogen/store";
import { SessionRecorder, downloadBlob } from "@/lib/morphogen/recorder";
import { headingToKey, formatKeyMode } from "@/lib/morphogen/theory";
import { glassToWorld } from "@/lib/morphogen/space";
import { snapshotOrigin, originStamp } from "@/lib/morphogen/origin";
import { decodeGlyphToken, lastRecalledGlyph, type Glyph } from "@/lib/morphogen/glyph";
import type { LoopClip } from "@/lib/morphogen/loops";
import type { FieldShot } from "./field-library";
import {
  bindHistory,
  clearHistory,
  finishUndo,
  maybeCheckpoint,
  subscribeHistory,
  undo as popUndo,
} from "@/lib/morphogen/history";
import { cn } from "@/lib/utils";

type TabId = "field" | "image" | "sense" | "sound" | "sync";

function formatRec(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function MorphogenApp() {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<RDEngine | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const midiRef = useRef<MidiOut | null>(null);
  const tdRef = useRef<TdClient | null>(null);
  const recorderRef = useRef(new SessionRecorder());
  const cameraStream = useRef<MediaStream | null>(null);
  const localBrushes = useRef<Brush[]>([]);
  const remoteBrushes = useRef<Map<string, Brush[]>>(new Map());
  const remoteFlow = useRef({ x: 0, y: 0, n: 0 });
  const imageEl = useRef<HTMLImageElement | null>(null);
  const performLockRef = useRef<(x?: number, y?: number) => void>(() => {});
  const resetRef = useRef<() => void>(() => {});
  const defaultsRef = useRef<() => void>(() => {});
  const recordRef = useRef<() => void>(() => {});
  const undoRef = useRef<() => void>(() => {});
  const huntAfter = useRef(false);
  const lastLockAt = useRef(0);
  const sensorsUnhook = useRef<(() => void) | null>(null);

  const started = useInstrument((s) => s.started);
  const uiHidden = useInstrument((s) => s.uiHidden);
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
  const restoreDefaults = useInstrument((s) => s.restoreDefaults);
  const waveform = useInstrument((s) => s.waveform);
  const keyId = useInstrument((s) => s.keyId);
  const modeId = useInstrument((s) => s.modeId);
  const orbitRate = useInstrument((s) => s.orbitRate);
  const applySnapshot = useInstrument((s) => s.applySnapshot);

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
  const [recording, setRecording] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [senseReady, setSenseReady] = useState(false);
  const [loops, setLoops] = useState<LoopClip[]>([]);
  const [layerRecording, setLayerRecording] = useState(false);
  const [shots, setShots] = useState<FieldShot[]>([]);
  const [compassLive, setCompassLive] = useState(false);
  const [edition, setEdition] = useState<Glyph | null>(lastRecalledGlyph);
  const [hunting, setHunting] = useState(false);
  const [trackName, setTrackName] = useState("");
  const [trackOn, setTrackOn] = useState(false);
  const [webAr, setWebAr] = useState(false);
  const factory = useInstrument(isFactoryInstrument);
  const atDefaults = factory && lockCount === 0 && loops.length === 0;

  const performLock = useCallback((x = 0.5, y = 0.5) => {
    const now = performance.now();
    if (now - lastLockAt.current < 180) return;
    lastLockAt.current = now;
    maybeCheckpoint();
    const n = engineRef.current?.lockLayer(x, y) ?? 0;
    audioRef.current?.lockLoop(x, y);
    setLockCount(n);
    const hz = Math.round(audioRef.current?.lastHz ?? 0);
    const pitch = hz > 24 ? `${hz} Hz` : "tonic";
    toast(
      n === 1
        ? `Drone 1 — ${pitch} holds. Release peels it.`
        : `Drone ${n}/4 — ${pitch} stacked. Release peels a layer.`,
    );
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
    if (cur === 0) toast("Drone released.");
  }, []);

  const clearAllLocks = useCallback(() => {
    engineRef.current?.clearLocks();
    audioRef.current?.clearLocks();
    setLockCount(0);
  }, []);

  const resetField = useCallback(() => {
    maybeCheckpoint();
    runtime.seedNonce += 1;
    clearAllLocks();
    if (engineRef.current) engineRef.current.flash = 0.7;
  }, [clearAllLocks]);

  const onDefaults = useCallback(() => {
    restoreDefaults();
    clearAllLocks();
    audioRef.current?.clearLoops();
    audioRef.current?.setWaveform(DEFAULT_WAVEFORM);
    setLoops([]);
    setLayerRecording(false);
    if (engineRef.current) engineRef.current.flash = 0.85;
    toast("Default settings");
  }, [restoreDefaults, clearAllLocks]);

  const undoLast = useCallback(() => {
    const snap = popUndo();
    if (!snap) return;
    applySnapshot(snap);
    audioRef.current?.setWaveform(snap.waveform);
    const engine = engineRef.current;
    if (engine) {
      while (engine.lockCount > snap.lockCount) {
        engine.popLock();
        audioRef.current?.popLock();
      }
      setLockCount(engine.lockCount);
    }
    finishUndo();
  }, [applySnapshot]);

  const toggleRecord = useCallback(() => {
    const rec = recorderRef.current;
    if (rec.recording) {
      rec.stop();
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      toast("Nothing to record yet");
      return;
    }
    rec.onError = (msg) => {
      setRecording(false);
      toast(msg);
    };
    rec.onStop = (blob, name) => {
      setRecording(false);
      setRecElapsed(0);
      if (blob.size < 32) {
        toast("Recording was empty");
        return;
      }
      const s = useInstrument.getState();
      const origin = snapshotOrigin("loop", s.presetId, rec.elapsed, {
        visual: artistFromState(s),
        audio: audioFromState(s),
        release: s.releaseTitle,
        track: s.trackTitle,
        index: s.tracks.length,
      });
      const stamp = originStamp(origin.capturedAt);
      downloadBlob(blob, name.startsWith("morphogen") ? `morphos-${stamp}.${name.split(".").pop()}` : name);
      const originBytes = new Blob([`${JSON.stringify(origin, null, 2)}\n`], { type: "application/json" });
      downloadBlob(originBytes, `MORPHOS-${stamp}-origin.json`);
      toast("Loop + origin saved");
    };
    const ok = rec.start(canvas, audioRef.current?.captureStream() ?? null);
    if (ok) {
      setRecording(true);
      setRecElapsed(0);
    }
  }, []);

  const toggleLayer = useCallback(() => {
    if (layerRecording) {
      void audioRef.current?.stopLayerRecord().then((clip) => {
        setLayerRecording(false);
        if (clip) toast("Loop is ready");
      });
      return;
    }
    const ok = audioRef.current?.startLayerRecord();
    if (!ok) toast("Could not record a loop");
    else setLayerRecording(true);
  }, [layerRecording]);

  const togglePlayback = useCallback(() => {
    const clips = audioRef.current?.getLoops() ?? loops;
    if (!clips.length) {
      toast("Record a loop first");
      return;
    }
    const playing = clips.some((c) => c.playing);
    for (const c of clips) audioRef.current?.setLoopPlaying(c.id, !playing);
  }, [loops]);

  const captureField = useCallback(async () => {
    try {
      const blob = await engineRef.current?.capturePng();
      if (!blob) {
        toast("Could not capture the field");
        return;
      }
      const s = useInstrument.getState();
      const origin = snapshotOrigin("still", s.presetId, undefined, {
        visual: artistFromState(s),
        audio: audioFromState(s),
        release: s.releaseTitle,
        track: s.trackTitle,
        index: s.tracks.length,
      });
      const stamp = originStamp(origin.capturedAt);
      const name = `morphos-${stamp}.png`;
      const url = URL.createObjectURL(blob);
      const id = `shot-${stamp}`;
      setShots((prev) => [{ id, url, name, origin }, ...prev].slice(0, 6));
      downloadBlob(blob, name);
      downloadBlob(new Blob([`${JSON.stringify(origin, null, 2)}\n`], { type: "application/json" }), `MORPHOS-${stamp}-origin.json`);
      toast("High-resolution still saved");
    } catch {
      toast("Could not capture the field");
    }
  }, []);
  performLockRef.current = performLock;
  resetRef.current = resetField;
  defaultsRef.current = onDefaults;
  recordRef.current = toggleRecord;
  undoRef.current = undoLast;

  useEffect(() => {
    const sync = () => {
      const s = useInstrument.getState();
      Object.assign(runtime.params, s.params);
      runtime.waveform = s.waveform;
      runtime.keyId = s.keyId;
      runtime.modeId = s.modeId;
      runtime.pitchMinHz = s.pitchMinHz;
      runtime.pitchMaxHz = s.pitchMaxHz;
      runtime.orbitRate = s.orbitRate;
      runtime.gyroOn = s.gyroOn;
    };
    sync();
    return useInstrument.persist.onFinishHydration(sync);
  }, []);

  useEffect(() => {
    const applyFrom = (raw: string | null) => {
      if (!raw) return;
      const g = decodeGlyphToken(raw) ?? decodeGlyphToken(`M1.${raw}`);
      if (!g) return;
      useInstrument.getState().recallGlyph(g);
      setEdition(g);
      const params = new URLSearchParams(window.location.search);
      const asWebAr = params.get("ar") !== "0";
      if (asWebAr) {
        huntAfter.current = true;
        setWebAr(true);
      } else {
        const who = g.a?.n ? ` · ${g.a.n}` : "";
        toast(`Edition recalled${who}`);
      }
    };
    const apply = () => applyFrom(new URLSearchParams(window.location.search).get("o"));
    if (useInstrument.persist.hasHydrated()) apply();
    const unsub = useInstrument.persist.onFinishHydration(apply);
    const w = window as Window & {
      launchQueue?: { setConsumer: (cb: (p: { targetURL: string }) => void) => void };
    };
    w.launchQueue?.setConsumer((p) => {
      try {
        applyFrom(new URL(p.targetURL).searchParams.get("o"));
      } catch {
        /* ignore */
      }
    });
    return unsub;
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

  useEffect(() => subscribeHistory((n) => setCanUndo(n > 0)), []);

  useEffect(() => {
    if (!started || !huntAfter.current) return;
    huntAfter.current = false;
    setHunting(true);
    patch({ cameraOn: false, uiHidden: true, panelOpen: false });
  }, [started, patch]);

  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => {
      setRecElapsed(recorderRef.current.elapsed);
    }, 250);
    return () => window.clearInterval(id);
  }, [recording]);

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
    bindHistory({
      capture: () => {
        const s = useInstrument.getState();
        return {
          params: { ...s.params },
          presetId: s.presetId,
          waveform: s.waveform,
          lockCount: engine.lockCount,
          keyId: s.keyId,
          modeId: s.modeId,
          pitchMinHz: s.pitchMinHz,
          pitchMaxHz: s.pitchMaxHz,
        };
      },
      checkpointField: () => engine.checkpoint(),
      restoreField: () => engine.undo(),
    });
    engine.onFrame = (_dt, stats) => {
      try {
        audioRef.current?.tick();
      } catch {
        /* keep the field alive if a voice errors */
      }
      const inst = useInstrument.getState();
      if (inst.gyroOn && inst.compassKey && runtime.sense.compass) {
        const next = headingToKey(runtime.sense.heading, inst.keyId);
        if (next !== inst.keyId) inst.setKey(next, true);
      }
      if (runtime.sense.compass) setCompassLive(true);
      setEnergy((e) => (Math.abs(e - stats.energy) > 0.02 ? stats.energy : e));
      const a = audioRef.current;
      const brushes = runtime.brushes;
      const brushAmp = brushes.length
        ? Math.min(1, brushes.reduce((sum, b) => sum + b.strength, 0) / brushes.length)
        : 0;
      const hzNow = a?.lastHz ?? 0;
      const lo = runtime.pitchMinHz;
      const hi = Math.max(lo + 1, runtime.pitchMaxHz);
      const pitch = hzNow > 1 ? Math.log(Math.max(hzNow, lo) / lo) / Math.log(hi / lo) : 0.5;
      const timbre =
        runtime.waveform === "sine"
          ? 0.12
          : runtime.waveform === "triangle"
            ? 0.34
            : runtime.waveform === "sawtooth"
              ? 0.72
              : runtime.waveform === "square"
                ? 0.86
                : runtime.waveform === "pulse"
                  ? 1
                  : 0.48;
      runtime.play.amp = Math.max(brushAmp, runtime.bands.rms * runtime.listen);
      runtime.play.pitch = Math.max(0, Math.min(1, pitch));
      runtime.play.timbre = timbre;
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
      fingers: runtime.brushes.length,
      locks: engine.lockCount,
      feed: runtime.params.feed,
      kill: runtime.params.kill,
      du: runtime.params.du,
      dv: runtime.params.dv,
      steps: runtime.params.steps,
      speed: runtime.params.speed,
      sim: { w: engine.simW, h: engine.simH },
      gyro: useInstrument.getState().gyroOn,
      sense: { ...runtime.sense },
      preset: useInstrument.getState().presetId,
      hz: audioRef.current?.lastHz ?? 0,
      voices: audioRef.current?.voiceCount ?? 0,
      audio: audioRef.current?.contextState() ?? "none",
      audioOn: useInstrument.getState().audioOn,
      antenna: runtime.antenna.on,
      recording: recorderRef.current.recording,
      morphing: Boolean(runtime.morph),
      waveform: runtime.waveform,
      history: runtime.historyDepth,
      key: runtime.keyId,
      mode: runtime.modeId,
      palette: runtime.params.paletteId,
      pitch: [runtime.pitchMinHz, runtime.pitchMaxHz],
      vibrato: [runtime.vibratoRate, runtime.vibratoDepth],
      heading: runtime.sense.heading,
      loops: audioRef.current?.getLoops().length ?? 0,
      space: runtime.brushes.map((b) => glassToWorld(b.x, b.y)),
      atDefaults: isFactoryInstrument(useInstrument.getState()),
    });
    (window as unknown as { __morphogen: typeof probe }).__morphogen = probe;
    return () => {
      delete (window as unknown as { __morphogen?: typeof probe }).__morphogen;
      bindHistory(null);
      clearHistory();
      recorderRef.current.stop();
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
        const remotes: Brush[] = [];
        remoteBrushes.current.forEach((list) => remotes.push(...list));
        runtime.brushes = [...b, ...remotes].slice(0, MAX_BRUSHES);
      },
      (x, y) => performLockRef.current(x, y),
      (v, x, y) => setCharge({ v, x, y }),
      (evt) => {
        audioRef.current?.resume();
        if (evt.type === "down" && localBrushes.current.length <= 1) maybeCheckpoint();
      },
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
      runtime.gyroOn = useInstrument.getState().gyroOn;
      if (!runtime.gyroOn) {
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
    if (!started || !gyroOn || !senseReady) return;
    const stop = attachSensors();
    sensorsUnhook.current = stop;
    return () => {
      stop();
      if (sensorsUnhook.current === stop) sensorsUnhook.current = null;
    };
  }, [gyroOn, started, senseReady]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.setVolume(audioOn ? volume : 0);
    audio.setMuted(muted || !audioOn);
  }, [audioOn, volume, muted]);

  useEffect(() => {
    runtime.waveform = waveform;
    audioRef.current?.setWaveform(waveform);
  }, [waveform]);

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
        if (e.shiftKey) defaultsRef.current();
        else resetRef.current();
      } else if (e.key === "c" || e.key === "C") {
        recordRef.current();
      } else if (e.key === "u" || e.key === "U") {
        e.preventDefault();
        undoRef.current();
      } else if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undoRef.current();
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
        if (preset) applyPreset(preset.id);
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
    let audio: AudioEngine | null = null;
    try {
      audio = new AudioEngine();
      audio.unlock();
      audioRef.current = audio;
      audio.setVolume(useInstrument.getState().volume);
      audio.setMuted(useInstrument.getState().muted || !useInstrument.getState().audioOn);
      audio.setWaveform(useInstrument.getState().waveform);
      audio.onLoops = (clips, rec) => {
        setLoops(clips);
        setLayerRecording(rec);
      };
    } catch {
      toast("Audio could not start — tap again to retry");
    }

    runtime.started = true;
    patch({ started: true, panelOpen: false, uiHidden: true });
    const sensePromise = requestSensorPermission();
    await sensePromise;
    audio?.resume();
    patch({ gyroOn: true });
    setSenseReady(true);

    if (useInstrument.getState().micOn && audioRef.current) {
      const ok = await audioRef.current.connectMic();
      if (!ok) toast("Microphone permission was declined");
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

  useEffect(() => {
    if (!webAr) return;
    huntAfter.current = true;
    if (!started) void enter();
  }, [webAr, started, enter, patch]);

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
        <canvas ref={canvasRef} className={cn("block h-full w-full touch-none", hunting && "opacity-0")} />
        {started && !hunting && orbitRate > 0.05 && (
          <OrbitGlass n={runtime.orbitN} rot={runtime.orbitRot} degrees={runtime.orbitDegrees} />
        )}
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
            <span className="lock-pulse absolute block size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-fg/40" />
          </div>
        )}
      </div>

      {hunting && (
        <ArOverlay
          field={canvasRef.current}
          onClose={() => {
            setHunting(false);
            patch({ uiHidden: false });
          }}
          onLock={(g) => {
            useInstrument.getState().recallGlyph(g);
            setEdition(g);
            const who = g.a?.n ? ` · ${g.a.n}` : "";
            toast(`Field found${who}`);
          }}
          onWake={() => {
            audioRef.current?.unlock();
            void audioRef.current?.resume();
          }}
        />
      )}

      {glError && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-bg px-6 text-center">
          <p className="max-w-sm text-sm text-muted">{glError}</p>
        </div>
      )}

      {!started && !glError && !webAr && (
        <StartGate
          onEnter={() => void enter()}
          onHunt={() => {
            huntAfter.current = true;
            void enter();
          }}
          edition={edition}
        />
      )}

      {started && recording && (
        <div
          data-ui
          className="pointer-events-none absolute top-[max(0.55rem,env(safe-area-inset-top))] left-1/2 z-30 -translate-x-1/2"
        >
          <div className="flex items-center gap-2 rounded-full bg-bg-elevated/90 px-3 py-1.5 shadow-[var(--shadow-border)]">
            <span className="rec-pulse block size-2 rounded-full bg-destructive" />
            <span className="font-mono text-xs tabular-nums text-fg">REC {formatRec(recElapsed)}</span>
          </div>
        </div>
      )}

      {started && !hunting && !uiHidden && (
        <div data-ui className="pointer-events-auto absolute top-hud-t left-3 z-50">
          <Button
            variant="ghost"
            size="sm"
            className="bg-bg/45 shadow-[var(--shadow-border)] backdrop-blur-sm"
            onClick={() => void captureField()}
            aria-label="Capture still"
            title="Save a high-resolution still of the field"
          >
            <Camera />
            Still
          </Button>
        </div>
      )}

      {started && !uiHidden && (
        <header
          data-ui
          className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-center px-16 pt-hud-t sm:justify-between sm:px-4"
        >
          <div className="pointer-events-none max-w-[calc(100%-8.5rem)] rounded-md bg-bg-elevated/90 px-2 py-1 shadow-[var(--shadow-border)]">
            <p className="flex items-center gap-1.5 text-lg text-fg">
              <MorphoMark className="size-5" />
              <Wordmark variant="hud" />
            </p>
            <LivingField className="mt-0.5 text-[9px]" />
            <p className="font-mono text-[10px] tracking-[0.12em] tabular-nums text-muted">
              F {params.feed.toFixed(4)} · k {params.kill.toFixed(4)} · E {energy.toFixed(2)}
              {` · ${formatKeyMode(keyId, modeId)}`}
              {` · ${waveformById(waveform).tag}`}
              {lockCount > 0 ? ` · DRONE ${lockCount}` : ""}
              {loops.length > 0 ? ` · LAY ${loops.length}` : ""}
              {voices > 0 ? ` · ${Math.round(hz)} Hz · ${voices}v` : ""}
              {runtime.orbitPeriod > 1 ? ` · P${runtime.orbitPeriod}` : ""}
              {runtime.listen > 0.02 && runtime.bands.rms > 0.04 ? " · LISTEN" : ""}
            </p>
          </div>
          <div className="pointer-events-auto hidden flex-wrap justify-end gap-1 rounded-md bg-bg-elevated/90 p-1 shadow-[var(--shadow-border)] sm:flex">
            <Button
              variant={atDefaults ? "secondary" : "ghost"}
              size="sm"
              onClick={onDefaults}
              aria-pressed={atDefaults}
              aria-label="Default settings"
              title="Restore default settings"
            >
              <House />
              Default
            </Button>
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
              onClick={undoLast}
              disabled={!canUndo}
              aria-label="Undo"
            >
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={resetField} aria-label="Reset field">
              <RotateCcw />
            </Button>
            <Button
              variant={recording ? "secondary" : "ghost"}
              size="icon-sm"
              onClick={toggleRecord}
              aria-label={recording ? "Stop recording" : "Record session"}
            >
              {recording ? <Square /> : <Circle />}
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
          </div>
          <div className="pointer-events-auto absolute top-hud-t right-3 z-40 sm:hidden">
            <Button
              variant="ghost"
              size="sm"
              className="bg-bg/55 shadow-[var(--shadow-border)] backdrop-blur-md"
              onClick={() => patch({ uiHidden: true, panelOpen: false })}
              aria-label="Hide controls"
            >
              <EyeOff />
              Hide
            </Button>
          </div>
        </header>
      )}

      {started && !uiHidden && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex flex-col items-stretch justify-end px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:inset-auto sm:p-0">
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
            onShareSystem={() => {
              void audioRef.current?.connectSystem().then((result) => {
                if (result === "ok") toast("The field is hearing the shared audio");
                else if (result === "unsupported") toast("This browser can't share audio. Use Room, or drop a file.");
                else if (result === "silent") toast("That share had no audio. Include audio, or use Room.");
                else toast("Share was cancelled");
              });
            }}
            onLoadTrack={(file) => {
              void audioRef.current?.loadTrack(file).then((ok) => {
                if (!ok) {
                  toast("Track would not play");
                  return;
                }
                setTrackName(file.name.replace(/\.[^.]+$/, ""));
                setTrackOn(true);
                toast("The field is listening");
              });
            }}
            onToggleTrack={() => {
              const on = audioRef.current?.toggleTrack() ?? false;
              setTrackOn(on);
            }}
            trackOn={trackOn}
            trackName={trackName}
            onToggleCamera={(on) => patch({ cameraOn: on })}
            onHunt={() => {
              patch({ cameraOn: false, uiHidden: true, panelOpen: false });
              setHunting(true);
            }}
            onToggleGyro={(on) => {
              patch({ gyroOn: on });
              if (on) {
                void requestSensorPermission().then(() => setSenseReady(true));
              }
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
            onReset={resetField}
            onDefaults={onDefaults}
            atDefaults={atDefaults}
            onRecord={toggleRecord}
            recording={recording}
            onUndo={undoLast}
            canUndo={canUndo}
            compassLive={compassLive}
            shots={shots}
            onCapture={() => void captureField()}
            onDownloadShot={(id) => {
              const shot = shots.find((s) => s.id === id);
              if (!shot) return;
              const a = document.createElement("a");
              a.href = shot.url;
              a.download = shot.name;
              a.click();
            }}
            loops={loops}
            layerRecording={layerRecording}
            onLayerRecord={() => {
              const ok = audioRef.current?.startLayerRecord();
              if (!ok) toast("Could not record a layer");
              else setLayerRecording(true);
            }}
            onLayerStop={() => {
              void audioRef.current?.stopLayerRecord().then((clip) => {
                setLayerRecording(false);
                if (clip) toast(`${clip.name} looping`);
              });
            }}
            onLoopPlay={(id, playing) => audioRef.current?.setLoopPlaying(id, playing)}
            onLoopLoop={(id, looping) => audioRef.current?.setLoopLooping(id, looping)}
            onLoopRemove={(id) => audioRef.current?.removeLoop(id)}
          />
        </div>
      )}

      {started && uiHidden && !hunting && (
        <div
          data-ui
          className="pointer-events-auto fixed top-hud-t left-1/2 z-50 flex -translate-x-1/2 items-end gap-0.5 rounded-full bg-bg/28 px-1 py-1 text-fg shadow-[var(--shadow-border)] backdrop-blur-md"
        >
          <button
            type="button"
            className="flex w-11 flex-col items-center gap-0.5 rounded-full px-1 py-1 text-fg"
            onClick={() => patch({ uiHidden: false })}
            aria-label="Show controls"
          >
            <Eye className="size-4" />
            <span className="text-[8px] tracking-[0.14em] text-muted uppercase">View</span>
          </button>
          <button
            type="button"
            className="flex w-11 flex-col items-center gap-0.5 rounded-full px-1 py-1"
            onClick={onDefaults}
            aria-label="Default settings"
          >
            <House className="size-4" />
            <span className="text-[8px] tracking-[0.14em] text-muted uppercase">Reset</span>
          </button>
          <button
            type="button"
            className="flex w-11 flex-col items-center gap-0.5 rounded-full px-1 py-1"
            onClick={toggleRecord}
            aria-label={recording ? "Stop recording" : "Record"}
          >
            {recording ? <Square className="size-4 text-destructive" /> : <Circle className="size-4" />}
            <span className="text-[8px] tracking-[0.14em] text-muted uppercase">{recording ? "Stop" : "Rec"}</span>
          </button>
          <button
            type="button"
            className="flex w-11 flex-col items-center gap-0.5 rounded-full px-1 py-1"
            onClick={toggleLayer}
            aria-label={layerRecording ? "Stop loop" : "Record a loop"}
          >
            <Repeat className={cn("size-4", layerRecording && "text-destructive")} />
            <span className="text-[8px] tracking-[0.14em] text-muted uppercase">Loop</span>
          </button>
          <button
            type="button"
            className="flex w-11 flex-col items-center gap-0.5 rounded-full px-1 py-1"
            onClick={togglePlayback}
            aria-label={loops.some((c) => c.playing) ? "Pause loops" : "Play loops"}
          >
            {loops.some((c) => c.playing) ? <Pause className="size-4" /> : <Play className="size-4" />}
            <span className="text-[8px] tracking-[0.14em] text-muted uppercase">Play</span>
          </button>
        </div>
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
