import { Circle, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_LOOPS, type LoopClip } from "@/lib/morphogen/loops";
import { cn } from "@/lib/utils";

function fmt(d: number) {
  const s = Math.max(0, d);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  const ds = Math.floor((s % 1) * 10);
  return `${m}:${String(r).padStart(2, "0")}.${ds}`;
}

export function LoopRack({
  clips,
  recording,
  onRecord,
  onStop,
  onTogglePlay,
  onToggleLoop,
  onRemove,
}: {
  clips: LoopClip[];
  recording: boolean;
  onRecord: () => void;
  onStop: () => void;
  onTogglePlay: (id: string, playing: boolean) => void;
  onToggleLoop: (id: string, looping: boolean) => void;
  onRemove: (id: string) => void;
}) {
  const full = clips.length >= MAX_LOOPS;
  return (
    <div>
      <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Layers</p>
      <p className="mb-3 text-xs leading-relaxed text-muted">
        Record a layer of the live voice. It loops while you add another on top. Six deep.
      </p>
      <Button
        variant={recording ? "secondary" : "ghost"}
        size="sm"
        className="w-full"
        disabled={!recording && full}
        onClick={() => (recording ? onStop() : onRecord())}
      >
        {recording ? <Square /> : <Circle />}
        {recording ? "Stop layer" : full ? "Bank full" : "Record layer"}
      </Button>
      {clips.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {clips.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 shadow-[var(--shadow-border)]"
            >
              <button
                type="button"
                className={cn("text-xs font-medium", c.playing ? "text-fg" : "text-muted")}
                onClick={() => onTogglePlay(c.id, !c.playing)}
              >
                {c.playing ? "Playing" : "Paused"}
              </button>
              <span className="min-w-0 flex-1 truncate font-mono text-xs tabular-nums text-muted">
                {c.name} · {fmt(c.duration)}
              </span>
              <button
                type="button"
                className={cn("text-xs", c.looping ? "text-fg" : "text-faint")}
                onClick={() => onToggleLoop(c.id, !c.looping)}
              >
                Loop
              </button>
              <button type="button" className="text-muted hover:text-fg" onClick={() => onRemove(c.id)} aria-label={`Remove ${c.name}`}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
