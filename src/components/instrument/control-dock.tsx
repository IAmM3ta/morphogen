import { useRef, useState, type ReactNode } from "react";
import {
  Aperture,
  AudioLines,
  Camera,
  Circle,
  Copy,
  House,
  ImagePlus,
  Layers,
  Radio,
  RotateCcw,
  Smartphone,
  SlidersHorizontal,
  Square,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ParamSlider } from "./param-slider";
import { KeyPad } from "./key-pad";
import { LoopRack } from "./loop-rack";
import { FieldLibrary, type FieldShot } from "./field-library";
import { PALETTES, PRESETS, WAVEFORMS, waveformById, type ImageMode, type SimParams } from "@/lib/morphogen/presets";
import type { LoopClip } from "@/lib/morphogen/loops";
import { MIDI_MAP, TD_CALLBACKS } from "@/lib/morphogen/td-script";
import { useInstrument, type ImageSlot } from "@/lib/morphogen/store";
import { runtime } from "@/lib/morphogen/runtime";
import { maybeCheckpoint } from "@/lib/morphogen/history";
import { formatKeyMode } from "@/lib/morphogen/theory";
import type { TdStatus } from "@/lib/morphogen/td-client";
import type { MidiDevice } from "@/lib/morphogen/midi-out";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TABS = [
  { id: "field", label: "Field", icon: SlidersHorizontal },
  { id: "image", label: "Image", icon: ImagePlus },
  { id: "sense", label: "Body", icon: Smartphone },
  { id: "sound", label: "Sound", icon: AudioLines },
  { id: "sync", label: "Sync", icon: Radio },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ControlDock({
  tab,
  onTab,
  tdStatus,
  tdError,
  onTdConnect,
  onTdDisconnect,
  midiDevices,
  onMidiSelect,
  onToggleMic,
  onToggleCamera,
  onToggleGyro,
  cameraOn,
  onAddImage,
  onPickImage,
  onUsePalette,
  onLock,
  onPop,
  onClearLocks,
  lockCount,
  onReset,
  onDefaults,
  atDefaults,
  onRecord,
  recording,
  onUndo,
  canUndo,
  compassLive,
  shots,
  onCapture,
  onDownloadShot,
  loops,
  layerRecording,
  onLayerRecord,
  onLayerStop,
  onLoopPlay,
  onLoopLoop,
  onLoopRemove,
}: {
  tab: TabId;
  onTab: (t: TabId) => void;
  tdStatus: TdStatus;
  tdError: string;
  onTdConnect: () => void;
  onTdDisconnect: () => void;
  midiDevices: MidiDevice[];
  onMidiSelect: (id: string | null) => void;
  onToggleMic: (on: boolean) => void;
  onToggleCamera: (on: boolean) => void;
  onToggleGyro: (on: boolean) => void;
  cameraOn: boolean;
  onAddImage: (files: FileList | null) => void;
  onPickImage: (id: string) => void;
  onUsePalette: () => void;
  onLock: () => void;
  onPop: () => void;
  onClearLocks: () => void;
  lockCount: number;
  onReset: () => void;
  onDefaults: () => void;
  atDefaults: boolean;
  onRecord: () => void;
  recording: boolean;
  onUndo: () => void;
  canUndo: boolean;
  compassLive: boolean;
  shots: FieldShot[];
  onCapture: () => void;
  onDownloadShot: (id: string) => void;
  loops: LoopClip[];
  layerRecording: boolean;
  onLayerRecord: () => void;
  onLayerStop: () => void;
  onLoopPlay: (id: string, playing: boolean) => void;
  onLoopLoop: (id: string, looping: boolean) => void;
  onLoopRemove: (id: string) => void;
}) {
  const {
    params,
    setParam,
    setImageMode,
    applyPreset,
    presetId,
    waveform,
    setWaveform,
    images,
    activeImageId,
    gyroOn,
    micOn,
    audioOn,
    volume,
    muted,
    tdUrl,
    tdGrid,
    midiOn,
    midiId,
    panelOpen,
    patch,
    keyId,
    modeId,
    pitchMinHz,
    pitchMaxHz,
  } = useInstrument();
  const fileRef = useRef<HTMLInputElement>(null);
  const [face, setFace] = useState<"field" | "sound">("sound");

  if (!panelOpen) {
    const fmt4 = (n: number) => n.toFixed(4);
    const soundLabel = `${waveformById(waveform).name} · ${formatKeyMode(keyId, modeId)} · ${Math.round(pitchMinHz)}–${Math.round(pitchMaxHz)} Hz`;
    return (
      <div
        data-ui
        className="pointer-events-auto relative z-50 flex w-full max-h-[min(44dvh,24rem)] flex-col overflow-hidden rounded-xl bg-bg-elevated px-3 pt-3 pb-3 text-fg shadow-[var(--shadow-border)] sm:absolute sm:right-3 sm:bottom-3 sm:max-h-[min(70dvh,36rem)] sm:w-80"
      >
        <div className="flex shrink-0 flex-col gap-2">
          <div className="flex gap-1.5">
            <Button
              variant={lockCount > 0 ? "secondary" : "outline"}
              size="default"
              className="min-h-11 flex-1"
              onClick={onLock}
              aria-label="Freeze drone"
              title="Hold the last pitch as a drone. Play over it. Release peels a layer."
            >
              <Layers />
              {lockCount > 0 ? `Freeze ${lockCount}` : "Freeze"}
            </Button>
            <Button
              variant="ghost"
              size="default"
              className="min-h-11 flex-1"
              onClick={onPop}
              disabled={lockCount === 0}
              aria-label="Release freeze"
            >
              Release
            </Button>
          </div>
          {lockCount > 1 && (
            <button type="button" className="self-end text-xs text-faint hover:text-muted" onClick={onClearLocks}>
              Release all
            </button>
          )}
          <div className="flex gap-1">
            <Button
              variant={face === "field" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setFace("field")}
              aria-pressed={face === "field"}
            >
              Field
            </Button>
            <Button
              variant={face === "sound" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1"
              onClick={() => setFace("sound")}
              aria-pressed={face === "sound"}
            >
              Sound
            </Button>
            <Button variant="ghost" size="sm" onClick={() => patch({ panelOpen: true })}>
              More
            </Button>
          </div>
        </div>

        {face === "field" ? (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <p className="text-xs leading-relaxed text-muted">
              Freeze holds the last pitch as a quiet drone — not noise. Release
              peels one layer. Four layers. Fingers play over it.
            </p>
            <button
              type="button"
              onClick={() => setFace("sound")}
              className="rounded-sm px-2.5 py-2 text-left text-xs shadow-[var(--shadow-border)] hover:bg-fg/6"
            >
              <span className="block tracking-[0.18em] text-muted uppercase">Sound</span>
              <span className="mt-0.5 block text-fg">{soundLabel}</span>
            </button>
            <ParamSlider
              label="Feed"
              symbol="F"
              value={params.feed}
              min={0.01}
              max={0.09}
              step={0.0005}
              format={fmt4}
              onChange={(n) => setParam("feed", n)}
            />
            <ParamSlider
              label="Kill"
              symbol="k"
              value={params.kill}
              min={0.03}
              max={0.08}
              step={0.0005}
              format={fmt4}
              onChange={(n) => setParam("kill", n)}
            />
            <div className="flex gap-2">
              <Button
                variant={atDefaults ? "secondary" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={onDefaults}
                aria-pressed={atDefaults}
              >
                <House /> Default
              </Button>
              <Button variant="ghost" size="sm" className="flex-1" onClick={onReset}>
                <RotateCcw /> Reset
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <p className="text-xs leading-relaxed text-muted">
              Sine is The Hum. Height is pitch inside the Hz window. C♯, Aeolian,
              and pentatonic live here.
            </p>
            <div>
              <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Waveform</p>
              <div className="grid grid-cols-3 gap-1.5">
                {WAVEFORMS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWaveform(w.id)}
                    className={cn(
                      "rounded-sm px-2 py-2 text-center shadow-[var(--shadow-border)] transition-colors duration-150",
                      waveform === w.id ? "bg-fg text-bg" : "bg-transparent text-fg hover:bg-fg/6",
                    )}
                    aria-pressed={waveform === w.id}
                  >
                    <span className="block text-xs font-medium">{w.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <KeyPad compassLive={compassLive} compact />
            <div className="flex gap-2">
              <Button
                variant={atDefaults ? "secondary" : "ghost"}
                size="sm"
                className="flex-1"
                onClick={onDefaults}
                aria-pressed={atDefaults}
              >
                <House /> Default
              </Button>
              <Button variant="ghost" size="sm" className="flex-1" onClick={onReset}>
                <RotateCcw /> Reset
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      data-ui
      className="pointer-events-auto relative z-50 flex max-h-[min(62dvh,34rem)] w-full flex-col overflow-hidden rounded-xl bg-bg-elevated text-fg shadow-[var(--shadow-border)] sm:absolute sm:right-3 sm:top-hud-t sm:bottom-3 sm:w-80 sm:max-h-none"
    >
      <header className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-xs tracking-[0.28em] text-muted uppercase">Console</p>
        <Button variant="faint" size="icon-sm" onClick={() => patch({ panelOpen: false })} aria-label="Close">
          <X />
        </Button>
      </header>
      <nav className="flex gap-0.5 px-3 pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              className={cn(
                "flex h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-sm text-muted transition-colors duration-150",
                on ? "bg-bg-subtle text-fg" : "hover:text-fg",
              )}
              aria-pressed={on}
              title={t.label}
            >
              <Icon className="size-4" />
              <span className="text-[9px] tracking-[0.1em] uppercase">{t.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        {tab === "field" && (
          <FieldTab
            params={params}
            presetId={presetId}
            lockCount={lockCount}
            recording={recording}
            canUndo={canUndo}
            setParam={setParam}
            applyPreset={applyPreset}
            onLock={onLock}
            onPop={onPop}
            onClearLocks={onClearLocks}
            onUndo={onUndo}
            onReset={onReset}
            onDefaults={onDefaults}
            atDefaults={atDefaults}
            onRecord={onRecord}
            shots={shots}
            onCapture={onCapture}
            onDownloadShot={onDownloadShot}
          />
        )}

        {tab === "image" && (
          <ImageTab
            images={images}
            activeImageId={activeImageId}
            imageMode={params.imageMode}
            imageMix={params.imageMix}
            fileRef={fileRef}
            cameraOn={cameraOn}
            onAddImage={onAddImage}
            onPickImage={onPickImage}
            onUsePalette={onUsePalette}
            onToggleCamera={onToggleCamera}
            setImageMode={setImageMode}
            setMix={(n) => setParam("imageMix", n)}
          />
        )}

        {tab === "sense" && (
          <div className="flex flex-col gap-5">
            <ToggleRow
              label="Tilt & motion"
              hint="How you hold the phone is the other antenna. Tilt brightens The Hum, roll pans and beats, spin is tremolo. Absolute pose — not a dead rest."
              checked={gyroOn}
              onCheckedChange={onToggleGyro}
            />
            <ToggleRow
              label="Microphone"
              hint="Voice and room tone frequency-modulate the lead and inoculate the field."
              checked={micOn}
              onCheckedChange={onToggleMic}
            />
            <p className="text-xs leading-relaxed text-muted">
              On an iPhone this is a spatial instrument: tilt, roll, compass,
              acceleration, finger pressure. Each finger is a theremin voice —
              height is pitch, across is amplitude. The compass can walk the
              key around the circle of fifths. Fingers do not paint. Move
              the pointer on a laptop the same way, no click required.
            </p>
            <div className="rounded-md bg-bg-subtle p-3">
              <p className="text-xs text-muted">Open on another phone</p>
              <p className="mt-2 break-all font-mono text-[11px] text-fg">
                {typeof window !== "undefined" ? window.location.origin : ""}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3 w-full"
                onClick={() => {
                  const link = window.location.origin;
                  void navigator.clipboard?.writeText(link);
                  toast("Link copied");
                }}
              >
                <Copy /> Copy link
              </Button>
            </div>
          </div>
        )}

        {tab === "sound" && (
          <div className="flex flex-col gap-5">
            <ToggleRow
              label="Default settings"
              hint="Sine Hum, C Ionian, factory mix. Clears recorded layers. Home, if you get lost in the noise."
              checked={atDefaults}
              onCheckedChange={(on) => {
                if (on) onDefaults();
              }}
            />
            <ToggleRow
              label="Voice of the field"
              hint="The Hum is always on — Schumann resonances as a sine pad. Live voices follow your hands."
              checked={audioOn}
              onCheckedChange={(on) => patch({ audioOn: on })}
            />
            <ParamSlider
              label="Level"
              value={volume}
              min={0}
              max={1}
              step={0.01}
              format={(n) => `${Math.round(n * 100)}%`}
              onChange={(n) => patch({ volume: n })}
            />
            <ToggleRow
              label="Mute"
              hint="Silence without stopping the field."
              checked={muted}
              onCheckedChange={(on) => patch({ muted: on })}
            />
            <p className="text-xs text-muted">
              Up the glass is pitch, across is amplitude. Voices snap to the
              selected key and mode, inside the Hz window below. Sine is the
              default. Roll pans. Press harder for more harmonic.
            </p>
            <div>
              <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Waveform</p>
              <p className="mb-2 text-xs leading-relaxed text-muted">
                Sine is The Hum. Spectrum reads the field as harmonic
                partials — the chemistry becomes the timbre.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {WAVEFORMS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWaveform(w.id)}
                    className={cn(
                      "rounded-sm px-2.5 py-2 text-left shadow-[var(--shadow-border)] transition-colors duration-150",
                      waveform === w.id ? "bg-fg text-bg" : "bg-transparent text-fg hover:bg-fg/6",
                    )}
                  >
                    <span className="block text-xs font-medium">{w.name}</span>
                    <span className={cn("block text-[10px]", waveform === w.id ? "text-bg/70" : "text-faint")}>
                      {w.blurb}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <KeyPad compassLive={compassLive} />
            <LoopRack
              clips={loops}
              recording={layerRecording}
              onRecord={onLayerRecord}
              onStop={onLayerStop}
              onTogglePlay={onLoopPlay}
              onToggleLoop={onLoopLoop}
              onRemove={onLoopRemove}
            />
          </div>
        )}

        {tab === "sync" && (
          <SyncTab
            tdUrl={tdUrl}
            tdGrid={tdGrid}
            tdStatus={tdStatus}
            tdError={tdError}
            midiOn={midiOn}
            midiId={midiId}
            midiDevices={midiDevices}
            onTdConnect={onTdConnect}
            onTdDisconnect={onTdDisconnect}
            onMidiSelect={onMidiSelect}
          />
        )}
      </div>
    </aside>
  );
}

function FieldTab({
  params,
  presetId,
  lockCount,
  recording,
  canUndo,
  setParam,
  applyPreset,
  onLock,
  onPop,
  onClearLocks,
  onUndo,
  onReset,
  onDefaults,
  atDefaults,
  onRecord,
  shots,
  onCapture,
  onDownloadShot,
}: {
  params: SimParams;
  presetId: string;
  lockCount: number;
  recording: boolean;
  canUndo: boolean;
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  applyPreset: (id: string) => void;
  onLock: () => void;
  onPop: () => void;
  onClearLocks: () => void;
  onUndo: () => void;
  onReset: () => void;
  onDefaults: () => void;
  atDefaults: boolean;
  onRecord: () => void;
  shots: FieldShot[];
  onCapture: () => void;
  onDownloadShot: (id: string) => void;
}) {
  const [term, setTerm] = useState<PdeTerm>(null);
  const fmt4 = (n: number) => n.toFixed(4);
  const fmt3 = (n: number) => n.toFixed(3);
  const fmt2 = (n: number) => n.toFixed(2);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <ToggleRow
          label="Default settings"
          hint="Mitosis, The Hum (sine), C Ionian. Clears loops, layers, and locks. Home, if you get lost in the noise."
          checked={atDefaults}
          onCheckedChange={(on) => {
            if (on) onDefaults();
          }}
        />
      </section>

      <section>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Equations</p>
        <p className="mb-2 text-xs leading-relaxed text-muted">
          Pearson Gray–Scott. Touch a coefficient to bind the slider.
        </p>
        <GrayScottPde active={term} onPick={setTerm} />
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-xs tracking-[0.18em] text-muted uppercase">Parameters</p>
        <ParamSlider
          label="Feed"
          symbol="F"
          value={params.feed}
          min={0.01}
          max={0.09}
          step={0.0005}
          format={fmt4}
          onChange={(n) => setParam("feed", n)}
          onActive={(on) => {
            if (on) setTerm("F");
          }}
        />
        <ParamSlider
          label="Kill"
          symbol="k"
          value={params.kill}
          min={0.03}
          max={0.08}
          step={0.0005}
          format={fmt4}
          onChange={(n) => setParam("kill", n)}
          onActive={(on) => {
            if (on) setTerm("k");
          }}
        />
        <ParamSlider
          label="Diffusion U"
          symbol="Dᵤ"
          value={params.du}
          min={0.08}
          max={0.36}
          step={0.005}
          format={fmt3}
          onChange={(n) => setParam("du", n)}
          onActive={(on) => {
            if (on) setTerm("Du");
          }}
        />
        <ParamSlider
          label="Diffusion V"
          symbol="Dᵥ"
          value={params.dv}
          min={0.04}
          max={0.2}
          step={0.005}
          format={fmt3}
          onChange={(n) => setParam("dv", n)}
          onActive={(on) => {
            if (on) setTerm("Dv");
          }}
        />
      </section>

      <section>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Species</p>
        <p className="mb-2 text-xs leading-relaxed text-muted">
          Named (F, k, Dᵤ, Dᵥ) packs. Morphs in place — the field is not reset.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={cn(
                "rounded-sm px-2.5 py-2 text-left shadow-[var(--shadow-border)] transition-colors duration-150",
                presetId === p.id ? "bg-fg text-bg" : "bg-transparent text-fg hover:bg-fg/6",
              )}
            >
              <span className="block text-xs font-medium">{p.name}</span>
              <span className={cn("block text-xs", presetId === p.id ? "text-bg/70" : "text-faint")}>
                F {p.feed.toFixed(3)} · k {p.kill.toFixed(3)}
              </span>
            </button>
          ))}
        </div>
      </section>

      <FieldLibrary shots={shots} onCapture={onCapture} onDownloadShot={onDownloadShot} />

      <section className="flex flex-col gap-3">
        <p className="text-xs tracking-[0.18em] text-muted uppercase">Brush</p>
        <p className="text-xs leading-relaxed text-muted">
          Disk · species <em>v</em> = 1, <em>u</em> = ½. Paints initial conditions, not a mark on the glass.
        </p>
        <ParamSlider
          label="Radius"
          symbol="R"
          value={params.brushSize}
          min={0.01}
          max={0.07}
          step={0.002}
          format={fmt3}
          onChange={(n) => setParam("brushSize", n)}
        />
        <ParamSlider
          label="Value"
          symbol="B"
          value={params.brushStrength}
          min={0.15}
          max={1}
          step={0.01}
          format={fmt2}
          onChange={(n) => setParam("brushStrength", n)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-xs tracking-[0.18em] text-muted uppercase">Time</p>
        <ParamSlider
          label="Steps / frame"
          symbol="N"
          value={params.steps}
          min={4}
          max={40}
          step={1}
          format={(n) => String(Math.round(n))}
          onChange={(n) => setParam("steps", Math.round(n))}
        />
        <ParamSlider
          label="Timestep"
          symbol="Δt"
          value={params.speed}
          min={0.35}
          max={1.2}
          step={0.05}
          format={fmt2}
          onChange={(n) => setParam("speed", n)}
        />
      </section>

      <section>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Views</p>
        <p className="mb-2 text-xs leading-relaxed text-muted">Colour map of <em>v</em>, with hillshade from ∇v.</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.name}
              onClick={() => setParam("paletteId", p.id)}
              className={cn(
                "size-7 overflow-hidden rounded-full shadow-[var(--shadow-border)]",
                params.paletteId === p.id && "ring-2 ring-fg",
              )}
              aria-label={p.name}
            >
              <span
                className="block h-full w-full"
                style={{
                  background: `linear-gradient(135deg, rgb(${p.stops[1].map((c) => Math.round(c * 255)).join(",")}), rgb(${p.stops[3].map((c) => Math.round(c * 255)).join(",")}))`,
                }}
              />
            </button>
          ))}
        </div>
        <ParamSlider
          label="Lighting"
          symbol="L"
          value={params.glow}
          min={0.2}
          max={2}
          step={0.05}
          format={fmt2}
          onChange={(n) => setParam("glow", n)}
        />
        <Button
          variant="secondary"
          size="sm"
          className="mt-3 w-full"
          onClick={() => {
            maybeCheckpoint();
            runtime.seedNonce += 1;
          }}
        >
          <RotateCcw /> Reseed
        </Button>
      </section>

      <section>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Loop</p>
        <p className="mb-3 text-xs leading-relaxed text-muted">
          Freeze holds the last pitch as a drone you play over. Further motion
          grows off the frozen field. Four layers. Release peels one; it is
          not a noise gate.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onLock}>
            Freeze
          </Button>
          <Button variant="ghost" size="sm" onClick={onPop} disabled={lockCount === 0}>
            Release
          </Button>
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onUndo} disabled={!canUndo}>
            <Undo2 /> Undo
          </Button>
          <Button variant="ghost" size="sm" className="flex-1" onClick={onReset}>
            <RotateCcw /> Reset
          </Button>
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            variant={atDefaults ? "secondary" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={onDefaults}
            aria-pressed={atDefaults}
          >
            <House /> Defaults
          </Button>
          <Button
            variant={recording ? "secondary" : "ghost"}
            size="sm"
            className="flex-1"
            onClick={onRecord}
          >
            {recording ? <Square /> : <Circle />}
            {recording ? "Stop" : "Record"}
          </Button>
        </div>
        {lockCount > 1 && (
          <button type="button" className="mt-2 text-xs text-faint hover:text-muted" onClick={onClearLocks}>
            Clear all loops
          </button>
        )}
      </section>
    </div>
  );
}

type PdeTerm = "F" | "k" | "Du" | "Dv" | null;

function GrayScottPde({ active, onPick }: { active: PdeTerm; onPick: (t: PdeTerm) => void }) {
  const t = (id: Exclude<PdeTerm, null>, label: ReactNode) => (
    <button
      type="button"
      className="pde-term"
      data-on={active === id}
      data-pde-term={id}
      aria-pressed={active === id}
      onClick={() => onPick(active === id ? null : id)}
    >
      {label}
    </button>
  );

  return (
    <div className="pde rounded-md bg-bg-subtle px-3 py-2.5">
      <p>
        ∂<em>u</em>/∂t = {t("Du", <>D<sub>u</sub></>)} ∇²<em>u</em> − <em>uv</em>² + {t("F", "F")}(1−<em>u</em>)
      </p>
      <p>
        ∂<em>v</em>/∂t = {t("Dv", <>D<sub>v</sub></>)} ∇²<em>v</em> + <em>uv</em>² − ({t("F", "F")}+{t("k", "k")})<em>v</em>
      </p>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-sm text-fg">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ImageTab({
  images,
  activeImageId,
  imageMode,
  imageMix,
  fileRef,
  cameraOn,
  onAddImage,
  onPickImage,
  onUsePalette,
  onToggleCamera,
  setImageMode,
  setMix,
}: {
  images: ImageSlot[];
  activeImageId: string | null;
  imageMode: ImageMode;
  imageMix: number;
  fileRef: React.RefObject<HTMLInputElement | null>;
  cameraOn: boolean;
  onAddImage: (files: FileList | null) => void;
  onPickImage: (id: string) => void;
  onUsePalette: () => void;
  onToggleCamera: (on: boolean) => void;
  setImageMode: (m: ImageMode) => void;
  setMix: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onAddImage(e.target.files)}
      />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => fileRef.current?.click()}>
          <Upload /> Add image
        </Button>
        <Button
          variant={cameraOn ? "default" : "secondary"}
          size="sm"
          onClick={() => onToggleCamera(!cameraOn)}
        >
          <Camera />
        </Button>
      </div>
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onPickImage(img.id)}
              className={cn(
                "size-14 shrink-0 overflow-hidden rounded-sm",
                activeImageId === img.id ? "ring-2 ring-fg" : "shadow-[var(--shadow-border)]",
              )}
            >
              <img src={img.url} alt={img.name} className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div>
        <p className="mb-2 text-xs text-muted">How the photograph feeds the field</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(
            [
              ["inoculate", "Inoculate"],
              ["develop", "Develop"],
              ["resist", "Resist"],
              ["palette", "Palette only"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setImageMode(id)}
              className={cn(
                "rounded-sm px-2 py-2 text-xs shadow-[var(--shadow-border)]",
                imageMode === id ? "bg-fg text-bg" : "text-fg hover:bg-fg/6",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ParamSlider
        label="Image mix"
        value={imageMix}
        min={0}
        max={1}
        step={0.01}
        format={(n) => `${Math.round(n * 100)}%`}
        onChange={setMix}
      />
      <Button variant="outline" size="sm" onClick={onUsePalette}>
        <Aperture /> Sample colors from image
      </Button>
      <p className="text-xs leading-relaxed text-muted">
        Drop a photo onto the field, or use the camera. Inoculate seeds growth in
        bright regions. Develop lets the picture emerge through the reaction.
        Resist turns dark areas into walls.
      </p>
    </div>
  );
}

function SyncTab({
  tdUrl,
  tdGrid,
  tdStatus,
  tdError,
  midiOn,
  midiId,
  midiDevices,
  onTdConnect,
  onTdDisconnect,
  onMidiSelect,
}: {
  tdUrl: string;
  tdGrid: boolean;
  tdStatus: TdStatus;
  tdError: string;
  midiOn: boolean;
  midiId: string | null;
  midiDevices: MidiDevice[];
  onTdConnect: () => void;
  onTdDisconnect: () => void;
  onMidiSelect: (id: string | null) => void;
}) {
  const patch = useInstrument((s) => s.patch);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-fg">TouchDesigner WebSocket</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Run a WebSocket DAT as a server, then connect Morphogen as the client.
          Packets are JSON at 20 Hz: params, sensors, audio, field stats, optional
          16×16 grid.
        </p>
        <input
          value={tdUrl}
          onChange={(e) => patch({ tdUrl: e.target.value })}
          spellCheck={false}
          className="mt-3 h-11 w-full rounded-md bg-bg px-3 font-mono text-xs text-fg shadow-[var(--shadow-border)] outline-none focus:ring-2 focus:ring-ring/50"
          placeholder="ws://127.0.0.1:9980"
        />
        <div className="mt-2 flex gap-2">
          {tdStatus === "connected" ? (
            <Button variant="secondary" size="sm" className="flex-1" onClick={onTdDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" className="flex-1" onClick={onTdConnect}>
              Connect
            </Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted">
          {tdStatus === "connected"
            ? "Streaming"
            : tdStatus === "connecting"
              ? "Connecting…"
              : tdStatus === "error"
                ? tdError
                : "Idle"}
        </p>
        <ToggleRow
          label="Include 16×16 grid"
          hint="Rebuild as a TOP from Table DAT morphogen_grid."
          checked={tdGrid}
          onCheckedChange={(v) => patch({ tdGrid: v })}
        />
        <div className="mt-3 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              void navigator.clipboard?.writeText(TD_CALLBACKS);
              toast("TouchDesigner callbacks copied");
            }}
          >
            <Copy /> Copy TD callbacks
          </Button>
          <a
            href="/td/morphogen_ws_callbacks.py"
            download
            className="inline-flex h-9 items-center rounded-sm px-3 text-xs text-fg shadow-[var(--shadow-border)]"
          >
            Download
          </a>
        </div>
      </div>
      <div>
        <p className="text-sm text-fg">MIDI to TouchDesigner</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Same-machine path with no network. Enable a virtual port (IAC / loopMIDI)
          and a MIDI In CHOP. CCs 20–29.
        </p>
        <ToggleRow
          label="Send MIDI CC"
          hint={MIDI_MAP.map((m) => `${m.cc} ${m.name}`).join(" · ")}
          checked={midiOn}
          onCheckedChange={(v) => {
            patch({ midiOn: v });
            if (!v) onMidiSelect(null);
          }}
        />
        {midiDevices.length > 0 && (
          <select
            className="mt-2 h-11 w-full rounded-md bg-bg px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none"
            value={midiId ?? ""}
            onChange={(e) => onMidiSelect(e.target.value || null)}
          >
            <option value="">Choose port</option>
            {midiDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div>
        <p className="text-sm text-fg">Projector picture</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Hide the chrome (H) and fullscreen (F). Capture this window with NDI
          Screen Capture or a Window COMP. The living field is the video; the
          socket and MIDI are the data.
        </p>
      </div>
    </div>
  );
}
