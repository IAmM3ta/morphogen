import { useRef } from "react";
import { toast } from "sonner";
import { DRUM_LANES, SCENES, STEPS, type LaneId } from "@/lib/morphos-v2/loop";
import type { SoundV2, SoundV2Snapshot } from "@/lib/morphos-v2/sound-v2";
import { downloadBlob } from "@/lib/morphogen/recorder";
import { Chip, Sheet } from "./bits";
import { cn } from "@/lib/utils";

const LANE_NAME: Record<LaneId, string> = { kick: "Kick", clap: "Clap", hat: "Hat", perc: "Perc", bass: "Bass", drone: "Drone" };

export function LoopPanel({ sound, snap, onClose }: { sound: SoundV2; snap: SoundV2Snapshot; onClose: () => void }) {
  const taps = useRef<number[]>([]);
  const loop = sound.loop;
  const p = sound.pattern;
  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 2500), now];
    if (taps.current.length >= 3) {
      const iv = taps.current.slice(1).map((t, i) => t - taps.current[i]!);
      const avg = iv.reduce((a, b) => a + b, 0) / iv.length;
      sound.setBpm(Math.round(60000 / avg));
    }
  };
  const laneState = (lane: LaneId) => (loop.solo === lane ? "S" : loop.mute[lane] ? "M" : "");
  return (
    <Sheet title="Loop" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={snap.playing} onClick={() => sound.togglePlay()} label={snap.playing ? "Stop" : "Play"}>
          {snap.playing ? "Stop" : "Play"}
        </Chip>
        <Chip onClick={() => sound.setBpm(loop.bpm - 1)} label="Slower">
          −
        </Chip>
        <span className="w-14 text-center font-mono text-xs tabular-nums">{loop.bpm} bpm</span>
        <Chip onClick={() => sound.setBpm(loop.bpm + 1)} label="Faster">
          +
        </Chip>
        <Chip onClick={tap} label="Tap the tempo">
          Tap
        </Chip>
        <Chip onClick={() => sound.setSwing(loop.swing >= 0.45 ? 0 : loop.swing + 0.15)} label="Swing">
          Swing {Math.round(loop.swing * 100)}
        </Chip>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {SCENES.map((id) => (
          <Chip
            key={id}
            active={loop.scene === id}
            onClick={() => sound.launchScene(id)}
            label={`Scene ${id}${snap.queued === id ? " (next bar)" : ""}`}
            className={cn(snap.queued === id && "animate-pulse")}
          >
            {id}
          </Chip>
        ))}
        <Chip
          onClick={() => {
            const next = SCENES[(SCENES.indexOf(loop.scene) + 1) % SCENES.length]!;
            sound.duplicateTo(next);
            toast(`Scene ${loop.scene} copied to ${next}`);
          }}
          label="Copy this scene to the next"
        >
          Copy →
        </Chip>
        <Chip onClick={() => sound.clearScene()} label="Clear this scene">
          Clear
        </Chip>
        <Chip onClick={() => sound.undo()} label="Undo the last edit" className={cn(!snap.canUndo && "opacity-40")}>
          Undo
        </Chip>
      </div>
      <div className="mt-3 space-y-1" role="grid" aria-label="Drum steps">
        {DRUM_LANES.map((lane) => (
          <div key={lane} className="grid grid-cols-[3.25rem_repeat(16,minmax(0,1fr))_2.5rem] items-center gap-0.5">
            <span className="text-[10px] tracking-wide text-muted">{LANE_NAME[lane]}</span>
            {Array.from({ length: STEPS }, (_, i) => {
              const v = p[lane][i] ?? 0;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => sound.cycleDrum(lane, i)}
                  aria-label={`${LANE_NAME[lane]} step ${i + 1}: ${v === 0 ? "off" : v === 2 ? (lane === "hat" ? "open" : "accent") : "on"}`}
                  title="Tap: off → on → accent"
                  className={cn(
                    "h-8 rounded-sm",
                    v === 2 ? "bg-fg" : v === 1 ? "bg-fg/55" : i % 4 === 0 ? "bg-fg/14" : "bg-fg/7",
                    snap.step === i && "outline outline-1 outline-offset-1 outline-fg/70",
                  )}
                />
              );
            })}
            <button
              type="button"
              className="h-8 rounded-sm bg-fg/8 font-mono text-[10px]"
              onClick={() => (loop.mute[lane] ? sound.setMute(lane, false) : sound.setMute(lane, true))}
              onContextMenu={(e) => {
                e.preventDefault();
                sound.setSolo(lane);
              }}
              aria-label={`Mute ${LANE_NAME[lane]} (right-click to solo)`}
              title={`Mute ${LANE_NAME[lane]} (right-click to solo)`}
            >
              {laneState(lane) || "M"}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] tracking-wide text-muted">Drone lane</span>
        <Chip active={snap.recArmed || snap.recording} onClick={() => sound.toggleRecord()} label="Arm: recording starts on the next bar">
          {snap.recording ? "Recording" : snap.recArmed ? "Armed" : "Arm"}
        </Chip>
        <Chip active={snap.overdub} onClick={() => sound.setOverdub(!snap.overdub)} label="Layer over what is there instead of replacing it">
          Overdub
        </Chip>
        {([1, 2, 4] as const).map((b) => (
          <Chip key={b} active={p.auto.bars === b} onClick={() => sound.setAutoBars(b)} label={`${b} bar lane`}>
            {b}
          </Chip>
        ))}
        <Chip onClick={() => sound.clearLane("drone")} label="Clear the drone lane">
          Clear
        </Chip>
        <Chip onClick={() => sound.setSolo("drone")} active={loop.solo === "drone"} label="Solo the drone lane">
          Solo
        </Chip>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip
          onClick={() => {
            void sound.exportWav().then((blob) => {
              if (!blob) {
                toast("WAV export is not available here");
                return;
              }
              downloadBlob(blob, `morphos-loop-${loop.scene}-${loop.bpm}bpm.wav`);
              toast("Loop exported");
            });
          }}
          label="Render this scene to a WAV file"
        >
          Export WAV
        </Chip>
        <Chip onClick={() => sound.resetFactory()} label="Bring back the starter loop">
          Starter loop
        </Chip>
      </div>
    </Sheet>
  );
}
