import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn("relative flex h-6 w-full touch-none items-center select-none", className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-px w-full grow overflow-hidden bg-border">
        <SliderPrimitive.Range className="absolute h-full bg-fg" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-3 rounded-full bg-fg shadow-[var(--shadow-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
    </SliderPrimitive.Root>
  );
}
