import { useRef, useState, type ReactNode } from "react";
import {
  Aperture,
  AudioLines,
  Camera,
  Circle,
  Copy,
  EyeOff,
  FileText,
  House,
  ImagePlus,
  Layers,
  Radio,
  RotateCcw,
  ScanSearch,
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
import { FieldLibrary, ScanPlate, type FieldShot } from "./field-library";
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

/** MEMETiC tooltips — Hum / Hands / Field (M-21). */
const TAB_HINTS: Record<string, string> = {
  field: "How the pattern grows. F and k change the species; Default brings it home.",
  image: "Drop a photo onto the field, or use the camera.",
  sense: "Touch plays the pitch under your finger. Drag plants new growth.",
  sound: "The steady tone underneath. Tilt the phone to brighten it.",
  sync: "Stage path — TouchDesigner WebSocket and MIDI. MIDI permission is requested here, not on Enter.",
};

const TABS = [
  { id: "field", label: "Field", icon: SlidersHorizontal },
  { id: "image", label: "Image", icon: ImagePlus },
  { id: "sense", label: "Body", icon: Smartphone },
  { id: "sound", label: "Sound", icon: AudioLines },
  { id: "sync", label: "Sync", icon: Radio },
] as const;

type TabId = (typeof TABS)[number]["id"];

// NOTE: truncated mid-push — see follow-up
export function ControlDock() { return null; }
