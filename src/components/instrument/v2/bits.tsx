import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function V2Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format = (n: number) => `${Math.round(n * 100)}`,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (n: number) => string;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-3">
      <span className="text-[11px] tracking-wide text-muted">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-fg">{format(value)}</span>
      <Slider
        className="col-span-2"
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </label>
  );
}

export function Chip({
  active,
  onClick,
  children,
  label,
  className,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "min-h-9 rounded-full px-3 text-xs tracking-wide transition-colors",
        active ? "bg-fg text-bg" : "bg-fg/8 text-fg hover:bg-fg/14",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <section
      data-ui
      aria-label={title}
      className="pointer-events-auto max-h-[52dvh] w-[min(36rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl bg-bg-elevated/88 p-3 text-fg shadow-[var(--shadow-border)] backdrop-blur-md"
    >
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] tracking-[0.18em] text-muted uppercase">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-8 rounded-full px-3 text-xs text-muted hover:text-fg"
          aria-label={`Close ${title}`}
          title={`Close ${title}`}
        >
          Close
        </button>
      </header>
      {children}
    </section>
  );
}
