import { useRef } from "react";
import {
  Aperture,
  AudioLines,
  Camera,
  Circle,
  Copy,
  ImagePlus,
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
import { PALETTES, PRESETS, WAVEFORMS, type ImageMode } from "@/lib/morphogen/presets";
import { MIDI_MAP, TD_CALLBACKS } from "@/lib/morphogen/td-script";
import { useInstrument, type ImageSlot } from "@/lib/morphogen/store";
import { runtime } from "@/lib/morphogen/runtime";
import { maybeCheckpoint } from "@/lib/morphogen/history";
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
  onRecord,
  recording,
  onUndo,
  canUndo,
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
  onRecord: () => void;
  recording: boolean;
  onUndo: () => void;
  canUndo: boolean;
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
  } = useInstrument();
  const fileRef = useRef<HTMLInputElement>(null);

  if (!panelOpen) return null;

  return (
    <aside
      data-ui
      className="pointer-events-auto absolute inset-x-3 bottom-3 z-30 flex max-h-[min(62dvh,560px)] flex-col overflow-hidden rounded-xl bg-bg-elevated/92 shadow-[var(--shadow-border)] sm:inset-x-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-80 sm:max-h-none"
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
                "flex h-9 flex-1 items-center justify-center rounded-sm text-muted transition-colors duration-150",
                on ? "bg-bg-subtle text-fg" : "hover:text-fg",
              )}
              aria-pressed={on}
              title={t.label}
            >
              <Icon className="size-4" />
              <span className="sr-only">{t.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        {tab === "field" && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-xs text-muted">Loop lock</p>
              <p className="mb-3 text-xs leading-relaxed text-muted">
                Double-tap and hold to freeze this generation as a memory —
                sound and a quiet overlay. The living field keeps evolving.
                Paint after a lock to grow new colonies from it. Four layers
                deep. Z releases the last; shift+Z clears. U or ⌘Z undoes.
                R resets, shift+R restores defaults, C records.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={onLock}>
                  Lock loop
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
                <Button variant="ghost" size="sm" className="flex-1" onClick={onDefaults}>
                  Defaults
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
                <button
                  type="button"
                  className="mt-2 text-xs text-faint hover:text-muted"
                  onClick={onClearLocks}
                >
                  Clear all loops
                </button>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs text-muted">Species</p>
              <p className="mb-2 text-xs leading-relaxed text-muted">
                Morphs the living chemistry in place. The field is not reset.
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
                    <span className={cn("block text-[10px]", presetId === p.id ? "text-bg/70" : "text-faint")}>
                      {p.blurb}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <ParamSlider
              label="Feed"
              value={params.feed}
              min={0.01}
              max={0.09}
              step={0.0005}
              format={(n) => n.toFixed(4)}
              onChange={(n) => setParam("feed", n)}
            />
            <ParamSlider
              label="Kill"
              value={params.kill}
              min={0.04}
              max={0.07}
              step={0.0005}
              format={(n) => n.toFixed(4)}
              onChange={(n) => setParam("kill", n)}
            />
            <ParamSlider
              label="Speed"
              value={params.speed}
              min={0.3}
              max={1.8}
              step={0.05}
              format={(n) => n.toFixed(2)}
              onChange={(n) => setParam("speed", n)}
            />
            <ParamSlider
              label="Field coupling"
              value={params.brushStrength}
              min={0}
              max={0.6}
              step={0.02}
              format={(n) => `${Math.round(n * 100)}%`}
              onChange={(n) => setParam("brushStrength", n)}
            />
            <div>
              <p className="mb-2 text-xs text-muted">Look</p>
              <div className="flex flex-wrap gap-1.5">
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
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  maybeCheckpoint();
                  runtime.seedNonce += 1;
                }}
              >
                <RotateCcw /> Reseed
              </Button>
            </div>
          </div>
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
              height is pitch, left/right is pan. Fingers do not paint. Move
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
              Up the glass is higher pitch, across is stereo. Sine locks to
              the cavity. Press harder for more harmonic. Locking a loop
              freezes this voicing. If a tab sleeps, tap anywhere to wake it.
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
