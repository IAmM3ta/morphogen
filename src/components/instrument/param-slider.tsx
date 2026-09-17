import { Slider } from "@/components/ui/slider";

export function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (n: number) => string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <span className="text-xs tracking-wide text-muted">{label}</span>
      <span className="font-mono text-xs tabular-nums text-fg">{format(value)}</span>
      <Slider
        className="col-span-2"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          const n = v[0];
          if (n != null) onChange(n);
        }}
      />
    </label>
  );
}
