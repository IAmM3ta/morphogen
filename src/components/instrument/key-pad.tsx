import { KEYS, MODES } from "@/lib/morphogen/theory";
import { useInstrument } from "@/lib/morphogen/store";
import { cn } from "@/lib/utils";

export function KeyPad({ compassLive }: { compassLive: boolean }) {
  const keyId = useInstrument((s) => s.keyId);
  const modeId = useInstrument((s) => s.modeId);
  const compassKey = useInstrument((s) => s.compassKey);
  const setKey = useInstrument((s) => s.setKey);
  const setMode = useInstrument((s) => s.setMode);
  const setCompassKey = useInstrument((s) => s.setCompassKey);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Key</p>
        <p className="mb-2 text-xs leading-relaxed text-muted">
          Circle of fifths. Compass can walk the ring as you turn.
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {KEYS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKey(k.id)}
              className={cn(
                "rounded-sm px-1.5 py-2 text-center shadow-[var(--shadow-border)] transition-colors duration-150",
                keyId === k.id ? "bg-fg text-bg" : "text-fg hover:bg-fg/6",
              )}
              aria-pressed={keyId === k.id}
            >
              <span className="block text-xs font-medium">{k.name}</span>
              <span className={cn("block text-xs", keyId === k.id ? "text-bg/70" : "text-faint")}>{k.relative}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs tracking-[0.18em] text-muted uppercase">Mode</p>
        <div className="grid grid-cols-2 gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                "rounded-sm px-2.5 py-2 text-left shadow-[var(--shadow-border)] transition-colors duration-150",
                modeId === m.id ? "bg-fg text-bg" : "text-fg hover:bg-fg/6",
              )}
              aria-pressed={modeId === m.id}
            >
              <span className="block text-xs font-medium">
                {m.roman} {m.name}
              </span>
              <span className={cn("block text-xs", modeId === m.id ? "text-bg/70" : "text-faint")}>{m.blurb}</span>
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setCompassKey(!compassKey)}
        className={cn(
          "rounded-sm px-2.5 py-2 text-left text-xs shadow-[var(--shadow-border)]",
          compassKey ? "bg-fg text-bg" : "text-fg hover:bg-fg/6",
        )}
        aria-pressed={compassKey}
      >
        Compass steers key
        <span className={cn("mt-0.5 block", compassKey ? "text-bg/70" : "text-faint")}>
          {compassLive ? "Heading is live — turning the chassis walks the circle of fifths." : "Waiting for a compass. On a phone, grant motion on Enter."}
        </span>
      </button>
    </div>
  );
}
