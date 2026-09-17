import { Slider } from "@/components/ui/slider";
import { beginGesture, endGesture } from "@/lib/morphogen/history";
import { cn } from "@/lib/utils";

export function ParamSlider({
  label,
  symbol,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onActive,
}: {
  label: string;
  /** VisualPDE-style symbol, e.g. F, k, Dᵤ — renders `name = value in [min, max]`. */
  symbol?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
  onActive?: (on: boolean) => void;
}) {
  const activate = () => {
    beginGesture();
    onActive?.(true);
  };
  const rest = () => {
    endGesture();
    onActive?.(false);
  };

  return (
    <label
      className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1"
      data-param={symbol ?? label}
      onPointerDown={activate}
      onPointerUp={rest}
      onPointerCancel={rest}
      onFocus={activate}
      onBlur={rest}
    >
      {symbol ? (
        <>
          <span className="font-mono text-xs tabular-nums text-fg">
            <span className="text-muted">{symbol}</span>
            {" = "}
            {format(value)}
          </span>
          <span className="font-mono text-xs tabular-nums text-faint">
            in [{format(min)}, {format(max)}]
          </span>
        </>
      ) : (
        <>
          <span className="text-xs tracking-wide text-muted">{label}</span>
          <span className="font-mono text-xs tabular-nums text-fg">{format(value)}</span>
        </>
      )}
      <Slider
        className={cn("col-span-2", symbol && "mt-0.5")}
        value={[value]}
        min={min}
        max={max}
        step={step}
        aria-label={symbol ?? label}
        onValueChange={(v) => {
          const n = v[0];
          if (n != null) onChange(n);
        }}
      />
    </label>
  );
}
