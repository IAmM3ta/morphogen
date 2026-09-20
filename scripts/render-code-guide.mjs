#!/usr/bin/env node
/**
 * Morphogen Code Guide — owners / developers only.
 * Not copied to public/. Not linked from the instrument.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "docs/developer");
mkdirSync(outDir, { recursive: true });

const FILES = [
  "src/router.tsx",
  "src/routes/__root.tsx",
  "src/routes/index.tsx",
  "src/styles.css",
  "src/lib/morphogen/runtime.ts",
  "src/lib/morphogen/presets.ts",
  "src/lib/morphogen/theory.ts",
  "src/lib/morphogen/shaders.ts",
  "src/lib/morphogen/rd-engine.ts",
  "src/lib/morphogen/audio-engine.ts",
  "src/lib/morphogen/sensors.ts",
  "src/lib/morphogen/store.ts",
  "src/lib/morphogen/history.ts",
  "src/lib/morphogen/loops.ts",
  "src/lib/morphogen/recorder.ts",
  "src/lib/morphogen/extract-palette.ts",
  "src/lib/morphogen/midi-out.ts",
  "src/lib/morphogen/td-client.ts",
  "src/lib/morphogen/td-script.ts",
  "public/td/morphogen_ws_callbacks.py",
  "src/components/instrument/morphogen-app.tsx",
  "src/components/instrument/start-gate.tsx",
  "src/components/instrument/wordmark.tsx",
  "src/components/instrument/control-dock.tsx",
  "src/components/instrument/key-pad.tsx",
  "src/components/instrument/param-slider.tsx",
  "src/components/instrument/loop-rack.tsx",
  "src/components/instrument/field-library.tsx",
  "src/components/instrument/sensor-remote.tsx",
  "src/components/instrument/stage-link.tsx",
  "src/components/ui/button.tsx",
  "src/components/ui/slider.tsx",
  "src/components/ui/switch.tsx",
];

const ABOUT = {
  "src/router.tsx": {
    title: "Router factory",
    body: `<p>TanStack Start requires a named <code>getRouter()</code>. The tree is generated; the only Morphogen choice here is <code>defaultErrorComponent</code>, so a crash still shows the message instead of a blank frame.</p>`,
  },
  "src/routes/__root.tsx": {
    title: "Document shell",
    body: `<p>The HTML document: fonts (Anybody, Syne, IBM Plex Mono), theme-color void, viewport-fit for the notch, <code>AuthProvider</code> (auth is off — the provider is a no-op shell the platform requires), <code>PreviewHostBridge</code> (preview chrome postMessage; silent elsewhere), and Sonner toasts. Meta <code>og:*</code> is intentionally absent — the PWA injector owns the share card.</p>`,
  },
  "src/routes/index.tsx": {
    title: "Home route",
    body: `<p>The only product route. It mounts <code>MorphogenApp</code> and nothing else. There is no marketing page in front of the instrument.</p>`,
  },
  "src/styles.css": {
    title: "Design tokens",
    body: `<p>Tailwind v4 <code>@theme</code>: void <code>#07080a</code>, ivory <code>#ece8dc</code>, Anybody (display, variable width), Syne (UI), IBM Plex Mono (readouts). HUD spacing tokens (<code>--spacing-hud-t</code>, <code>--spacing-hud-panel</code>) keep the card under the wordmark and clear of preview chrome. Wordmark, lock-pulse, and PDE term styles live here. Buttons get <code>cursor: pointer</code> because v4 Preflight would otherwise leave them as default.</p>`,
  },
  "src/lib/morphogen/runtime.ts": {
    title: "The bus",
    body: `<p>A plain object, not React state. The solver, the audio graph, sensors, and the HUD all read and write it every frame. React is too slow and too batched for a 4K Gray–Scott loop plus Web Audio ramps.</p>
<p><code>params</code> is the live chemistry. <code>brushes</code> are the current fingers (max 8). <code>antenna</code> is the mouse-hover theremin (audio only, id −1). <code>sense</code> is absolute pose plus compass. <code>stats</code> is the GPU reduction of the field (energy, meanV, edge, 16×16 grid). <code>beginPresetMorph</code> / <code>tickMorph</code> lerp F, k, Du, Dv and the colormap over ~0.9s so a species change does not reseed.</p>
<p>Key, mode, and Hz window live here as well as in the zustand store — the audio tick cannot subscribe to React.</p>`,
  },
  "src/lib/morphogen/presets.ts": {
    title: "Chemistry, colour, waveforms",
    body: `<p>Named Pearson packs (mitosis … skate), four-stop palettes, waveform ids, default <code>SimParams</code>, <code>Brush</code> and <code>FieldStats</code> types, and <code>pickSimMaxSide()</code> (desktop 1440–2160, mobile 960–1600). Default chemistry is mitosis: F 0.037, k 0.060, Du 0.21, Dv 0.105, Field colormap. Default waveform is sine. Image modes: inoculate, develop, resist, palette.</p>
<p><code>MAX_BRUSHES = 8</code> is a shader uniform width. Changing it requires <code>uBrush[N]</code> in <code>SIM_FRAG</code> as well.</p>`,
  },
  "src/lib/morphogen/theory.ts": {
    title: "Pitch, key, mode",
    body: `<p>Circle of fifths (<code>KEYS</code>, C♯ sits on D♭), church modes plus major/minor/pentatonic/blues/suspended. <code>yToScaleHz</code> maps vertical glass position onto scale degrees inside the Hz window, interpolating between adjacent degrees so a float is never used as an array index (that bug used to throw <code>setTargetAtTime(NaN)</code> and kill the rAF). Final clamp is the window, not 27.5–4186. <code>headingToKey</code> walks fifths with 18° hysteresis. <code>tonicHz</code> picks the tonic nearest the geometric mean of the window — Freeze uses this when no finger has spoken.</p>`,
  },
  "src/lib/morphogen/shaders.ts": {
    title: "GLSL 300 es",
    body: `<p>Five programs as strings.</p>
<ul>
<li><code>VERT</code> — fullscreen triangle, UV from clip.</li>
<li><code>SIM_FRAG</code> — Pearson Gray–Scott. 9-point isotropic Laplacian (Sims 0.2 / 0.05). Weak rest-relative advection. Disk inoculum of v=1, u=½ at each live brush. Image modes. Lock impulse is a display/seed flash, not a re-injection of locked.g into the solver (that was the infinite-loop streak).</li>
<li><code>SEED_FRAG</code> — CPU-disk fallback / nonce reseed.</li>
<li><code>DISPLAY_FRAG</code> — 4-stop colormap of v, hillshade from ∇v, composite of up to four frozen generation textures, flash.</li>
<li><code>STATS_FRAG</code> — downsample to a tiny FBO so the CPU can read energy / meanV / edge / a 16×16 grid without stalling 4K.</li>
</ul>
<p>Sim textures are 8-bit RGBA NEAREST. Display and stats sample LINEAR. RGBA16F LINEAR wrote zeros in WebKit.</p>`,
  },
  "src/lib/morphogen/rd-engine.ts": {
    title: "GPU solver",
    body: `<p><code>RDEngine</code> owns the canvas, ping-pong sim FBOs, stats FBO, four lock slots, and an 8-deep GPU undo blit. Construction picks an aspect-correct sim size from CSS × dpr, capped by <code>pickSimMaxSide()</code>. After a 90-frame warmup, slow frames may downsample — the first hitch is the CPU disk seed, not the steady state.</p>
<p><code>frame()</code> runs <code>inner = clamp(params.steps, 4, 40)</code> Euler steps (default 20) every animation frame, then display, then <code>onFrame</code> (audio + HUD). <code>rAF</code> is scheduled in <code>try/finally</code> so a voice error cannot freeze the field.</p>
<p><code>lockLayer</code> blits sim A into the next lock slot and sets a short impulse/flash. Grow is at the fingertips only. FIFO at 4. <code>capturePng</code> reads the display FBO (<code>preserveDrawingBuffer: true</code> on the canvas).</p>
<p>Do not feed locked.g back into the sim. Do not use a square FBO. Do not advect with absolute gyro — rest-relative only, or colonies streak into LEDs.</p>`,
  },
  "src/lib/morphogen/audio-engine.ts": {
    title: "The Hum and the voices",
    body: `<p>Web Audio graph. <code>unlock()</code> on Enter builds it.</p>
<p><strong>Hum bus</strong> — Schumann 7.83 Hz and audible octaves, all sines, through a tilt filter, delay, and echo. Absolute pose sculpts it. The always-on noise bed is built but ramped to gain 0 so The Hum stays sine.</p>
<p><strong>Lead bus</strong> — one <code>LiveVoice</code> per finger (plus antenna id −1). Each voice: osc + detune + harmonic + sub + FM, then filter and pan. <code>SHAPE</code> table makes sine / triangle / saw / square / pulse / spectrum architecturally distinct. Lead bypasses the Hum tilt filter. Y → <code>yToScaleHz</code>; X → amplitude; pan from roll. <code>ramp()</code> ignores non-finite values. <code>tick()</code> is try/caught so it cannot kill rAF.</p>
<p><strong>Freeze</strong> — <code>lockLoop</code> starts one or two oscillators at the last pitch (or tonic), into <code>loopBus</code>, no delay, no noise. Four layers. <code>popLock</code> / <code>clearLocks</code> peel.</p>
<p><strong>Loop rack</strong> — MediaRecorder on <code>recDest</code> (lead + loops, not Hum). Decode, looping BufferSource, max 6.</p>`,
  },
  "src/lib/morphogen/sensors.ts": {
    title: "Chassis and fingers",
    body: `<p><code>requestSensorPermission</code> on Enter (iOS requires a gesture). <code>attachSensors</code> listens to <code>deviceorientation</code> / <code>deviceorientationabsolute</code> / <code>devicemotion</code>. Audio gets absolute pose. The field gets rest-relative flow so a stable hold is not a wind. Compass: <code>webkitCompassHeading</code> or absolute alpha → <code>runtime.sense.heading</code> + <code>compass</code>.</p>
<p><code>localPointerBrushes</code> unifies PointerEvents and TouchEvents onto one <code>Finger</code> map. Never <code>setPointerCapture</code> on touch (iOS would drop extra fingers). Window move is passive. <code>clearAll</code> on blur / visibility. Hover with no buttons down is the antenna, not a brush — audio only. Pressure and radius from the event when the browser provides them.</p>`,
  },
  "src/lib/morphogen/store.ts": {
    title: "Durable instrument state",
    body: `<p>Zustand + persist, name <code>morphogen-v12</code>. Holds what should survive a reload: chemistry, waveform, key, mode, Hz window, gyro/mic/camera flags, volume, TD URL, patches. <code>started</code>, <code>panelOpen</code>, and <code>uiHidden</code> are not persisted — a reload always shows Enter and the card.</p>
<p><code>applyPreset</code> calls <code>beginPresetMorph</code>; it does not increment <code>seedNonce</code>. <code>setParam</code> on F/k/Du/Dv cancels a morph and marks the preset custom. <code>restoreDefaults</code> is the way home. <code>isFactoryInstrument</code> drives the Default toggle.</p>`,
  },
  "src/lib/morphogen/history.ts": {
    title: "Undo",
    body: `<p>Eight-deep stack of <code>UndoSnap</code> (params, preset, waveform, lockCount, key, mode, Hz window). GPU field snapshots live on the engine, not here. <code>beginGesture</code> / <code>endGesture</code> coalesce a slider drag into one entry. <code>maybeCheckpoint</code> is the paint / freeze / species call. While restoring, checkpoints are ignored.</p>`,
  },
  "src/lib/morphogen/loops.ts": {
    title: "Loop clip type",
    body: `<p>The rack’s data shape and mime picker. The engine owns the BufferSources; this module is the contract the UI renders.</p>`,
  },
  "src/lib/morphogen/recorder.ts": {
    title: "Session record",
    body: `<p>Captures the canvas stream plus the audio capture destination into a WebM (or mp4 fallback). Used by the Record control / <code>C</code>. Separate from the Sound-tab loop rack.</p>`,
  },
  "src/lib/morphogen/extract-palette.ts": {
    title: "Sample a photograph",
    body: `<p>Reads a source into a canvas, histograms HSV, builds a four-stop <code>Palette</code> for “palette only” / “sample colors from image.”</p>`,
  },
  "src/lib/morphogen/midi-out.ts": {
    title: "MIDI CC 20–29",
    body: `<p>Web MIDI output. CCs carry F, k, energy, edge, Hum-ish level, pose. This is the seed of the Ableton chapter — control change today, per-finger notes next.</p>`,
  },
  "src/lib/morphogen/td-client.ts": {
    title: "TouchDesigner client",
    body: `<p>WebSocket JSON at 20 Hz: params, sensors, audio, field stats, optional 16×16 grid of v. Morphogen is the client; the DAT is the server. <code>buildPacket</code> is the schema. Reconnect is the caller’s job (Sync tab).</p>`,
  },
  "src/lib/morphogen/td-script.ts": {
    title: "DAT callbacks, as a string",
    body: `<p>The Python that operators paste into a WebSocket DAT, plus the MIDI CC map, shipped inside the app so Sync can show / copy it. The file on disk under <code>public/td/</code> is the same text, loadable as a DAT file.</p>`,
  },
  "public/td/morphogen_ws_callbacks.py": {
    title: "TouchDesigner DAT (on disk)",
    body: `<p>Identical callbacks as a real <code>.py</code> next to the static assets. Fills Table DATs <code>morphogen_json</code> and <code>morphogen_grid</code>.</p>`,
  },
  "src/components/instrument/morphogen-app.tsx": {
    title: "The conductor",
    body: `<p>Mounts the canvas, the engines, sensors, MIDI, TD, recorder, HUD, and dock. <code>enter()</code> unlocks audio, requests motion, sets <code>started</code>. <code>engine.start(onFrame)</code> is the heartbeat: copy store params into runtime, tick morph, tick audio, push HUD numbers.</p>
<p><code>performLock</code> checkpoints, blits the field, starts a drone, toasts the Hz. <code>onDefaults</code> restores factory and clears drones/loops. Keyboard: 1–9 species, L freeze, Z release, Shift+Z clear, U undo, R reset, Shift+R defaults, C record, space pause, H hide, F fullscreen.</p>
<p>The compact card is always mounted once started (not gated on <code>uiHidden</code>) so preview chrome cannot make the instrument disappear. Wordmark sits in <code>pt-hud-t</code>; the card in <code>pt-hud-panel</code>.</p>
<p><code>window.__morphogen</code> is a probe for QA. Safe to leave; it is not a public API.</p>`,
  },
  "src/components/instrument/start-gate.tsx": {
    title: "Enter",
    body: `<p>First surface. Wordmark, one paragraph, Enter (unlocks audio + motion). The player-facing instrument guide is a secondary button. This code volume is not linked here.</p>`,
  },
  "src/components/instrument/wordmark.tsx": {
    title: "Morphogen, as a bump",
    body: `<p>Anybody variable width. Each letter’s <code>wdth</code> follows a 1D concentration bump — hero more extreme, HUD tighter — so the name behaves like an inoculum, not a logo file.</p>`,
  },
  "src/components/instrument/control-dock.tsx": {
    title: "Card and console",
    body: `<p>Two bodies. Compact (<code>panelOpen === false</code>): Freeze / Release, Field | Sound | More. Sound is the default face (waveforms, KeyPad, range). Field is F, k, Default, Reset. Full console: labeled tabs Field, Image, Body, Sound, Sync. Field tab is VisualPDE-shaped (typeset PDE, named sliders, species, brush, time, views, patches, screenshot). The player guide may be offered from the compact row; this code guide is not.</p>`,
  },
  "src/components/instrument/key-pad.tsx": {
    title: "Key, mode, range",
    body: `<p><code>PitchRange</code> sliders Lo 27.5–220 / Hi 120–2093, factory 47–376. Twelve fifths, fourteen modes. Compact mode drops blurbs so the card can scroll. Compass toggle.</p>`,
  },
  "src/components/instrument/param-slider.tsx": {
    title: "VisualPDE slider",
    body: `<p><code>name = value in [min, max]</code> when a symbol is passed. Wraps a gesture so a drag is one undo entry. Optional <code>onActive</code> binds the PDE term highlight.</p>`,
  },
  "src/components/instrument/loop-rack.tsx": {
    title: "Overdub rack",
    body: `<p>Record / stop / play / loop / remove for decoded clips. Max 6. Lives on Console → Sound.</p>`,
  },
  "src/components/instrument/field-library.tsx": {
    title: "Patches and plates",
    body: `<p>Save current F/k/Du/Dv/species/colour as a named patch (max 12). Load morphs in place. Screenshot via <code>RDEngine.capturePng()</code>.</p>`,
  },
  "src/components/instrument/sensor-remote.tsx": {
    title: "Dormant — phone as remote",
    body: `<p>P2P remote-sensor UI. The signaling path was dropped because it pulled <code>@/lib/db</code> into the preview and crashed PGLite. Kept as source for a future room, not mounted on the live path. Do not wire it back without a signaling host that is not Postgres.</p>`,
  },
  "src/components/instrument/stage-link.tsx": {
    title: "Dormant — stage follower",
    body: `<p>Companion to the remote. Same status: not mounted. A later stage mode (NDI / clean 16:9) should not revive this as-is.</p>`,
  },
  "src/components/ui/button.tsx": {
    title: "Button primitive",
    body: `<p>CVA variants: default / secondary / ghost / outline / faint; sizes default (h-11, 44px), sm, icon. <code>asChild</code> via Radix Slot. Compact Freeze uses default size on purpose — sm is 36px, below a thumb.</p>`,
  },
  "src/components/ui/slider.tsx": {
    title: "Slider primitive",
    body: `<p>Radix slider, token colours. ParamSlider is the product skin on top of this.</p>`,
  },
  "src/components/ui/switch.tsx": {
    title: "Switch primitive",
    body: `<p>Radix switch for Default / gyro / mute / compass rows.</p>`,
  },
};

function escapeHtml(s) {
  return s.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

function highlight(code) {
  const re =
    /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|<!--[\s\S]*?-->|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
  const parts = [];
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    if (m.index > last) parts.push(["code", code.slice(last, m.index)]);
    const t = m[0];
    parts.push([t.startsWith("/") || t.startsWith("<!") || t.startsWith("<!--") ? "cmt" : "str", t]);
    last = m.index + t.length;
  }
  if (last < code.length) parts.push(["code", code.slice(last)]);
  const kw =
    /\b(export|import|from|const|let|var|function|return|class|extends|new|if|else|for|while|of|in|try|catch|finally|throw|async|await|void|null|undefined|true|false|this|super|static|private|public|readonly|as|typeof|keyof|never|unknown|boolean|number|string|type|interface|enum|implements|package|switch|case|break|continue|default|with|yield|delete|in|out|uniform|precision|highp|sampler2D|vec2|vec3|vec4|float|int|void|layout|location)\b/g;
  return parts
    .map(([k, v]) => {
      if (k === "cmt") return `<span class="cmt">${escapeHtml(v)}</span>`;
      if (k === "str") return `<span class="str">${escapeHtml(v)}</span>`;
      return escapeHtml(v)
        .replace(kw, '<span class="kw">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
    })
    .join("");
}

function listing(rel) {
  const abs = resolve(root, rel);
  const src = readFileSync(abs, "utf8").replace(/\t/g, "  ");
  const hi = highlight(src);
  const lines = hi.split("\n");
  const body = lines
    .map((line, i) => {
      const n = String(i + 1).padStart(4, " ");
      return `<div class="ln"><span class="n">${n}</span><span class="c">${line || " "}</span></div>`;
    })
    .join("");
  return { lines: lines.length, html: body };
}

const modulesHtml = FILES.map((rel, i) => {
  const meta = ABOUT[rel] ?? { title: rel, body: "<p></p>" };
  const { lines, html } = listing(rel);
  const n = String(i + 1).padStart(2, "0");
  return `
  <article class="mod" id="m-${i + 1}">
    <p class="kicker">${n} · ${escapeHtml(rel)} · ${lines} lines</p>
    <h2>${escapeHtml(meta.title)}</h2>
    ${meta.body}
    <div class="src">${html}</div>
  </article>`;
}).join("\n");

const toc = FILES.map((rel, i) => {
  const meta = ABOUT[rel] ?? { title: rel };
  const n = String(i + 1).padStart(2, "0");
  return `<li><span class="n">${n}</span><span class="t">${escapeHtml(meta.title)}</span><span class="f">${escapeHtml(rel)}</span></li>`;
}).join("");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Morphogen — Code Guide (Confidential)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@50..150,200..800&family=IBM+Plex+Mono:wght@400;500&family=Syne:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<style>
  :root {
    --bg:#07080a; --elev:#101216; --fg:#ece8dc; --muted:#8a8e8b; --faint:#5a5e5c;
    --line:rgba(236,232,220,.14); --warn:#c45a4a;
    --display:"Anybody","Segoe UI",system-ui,sans-serif;
    --sans:"Syne","Segoe UI",system-ui,sans-serif;
    --mono:"IBM Plex Mono","SF Mono",ui-monospace,monospace;
  }
  * { box-sizing:border-box; }
  html,body { margin:0; background:var(--bg); color:var(--fg); font-family:var(--sans); -webkit-font-smoothing:antialiased; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  @page { size: letter; margin: 0.62in 0.62in 0.7in; }
  .cover { page-break-after: always; min-height: 9.6in; position:relative; margin: -0.62in; padding: 0.7in; overflow:hidden; }
  .cover-bg {
    position:absolute; inset:0;
    background:
      linear-gradient(180deg, rgba(7,8,10,.2) 0%, rgba(7,8,10,.55) 48%, rgba(7,8,10,.96) 100%),
      url("../guide-assets/cover-field.jpg") center 28% / cover no-repeat;
  }
  .cover-copy { position:relative; margin-top: 5.8in; }
  .banner {
    font-family:var(--mono); font-size:8px; letter-spacing:.28em; text-transform:uppercase;
    color:var(--warn); border:1px solid color-mix(in oklab, var(--warn) 55%, transparent);
    display:inline-block; padding:.08in .12in; margin-bottom:.22in;
  }
  .wordmark { display:flex; font-family:var(--display); font-size:56px; line-height:.9; color:var(--fg); }
  .wordmark span { display:inline-block; }
  .kicker { font-family:var(--mono); font-size:8.5px; letter-spacing:.28em; text-transform:uppercase; color:var(--muted); }
  h1 { font-family:var(--display); font-weight:500; font-size:28px; letter-spacing:.02em; line-height:1.1; font-variation-settings:"wdth" 112,"wght" 500; margin:.1in 0 .18in; }
  h2 { font-family:var(--display); font-weight:500; font-size:18px; letter-spacing:.04em; font-variation-settings:"wdth" 112,"wght" 520; margin:.06in 0 .12in; }
  p { font-size:10.5px; line-height:1.55; margin:0 0 .1in; }
  p.muted { color:var(--muted); }
  ul { margin:.04in 0 .12in .18in; padding:0; }
  ul li { font-size:10.5px; line-height:1.5; margin:0 0 .04in; }
  code { font-family:var(--mono); font-size:9px; }
  .rule { height:1px; background:var(--line); border:0; margin:.16in 0; }
  .toc { list-style:none; padding:0; margin:.1in 0 .3in; }
  .toc li { display:grid; grid-template-columns: .4in 1.7in 1fr; gap:.1in; padding:.07in 0; border-bottom:1px solid rgba(236,232,220,.08); font-size:10.5px; align-items:baseline; }
  .toc .n { font-family:var(--mono); font-size:8.5px; letter-spacing:.14em; color:var(--faint); }
  .toc .f { font-family:var(--mono); font-size:8px; color:var(--faint); }
  .flow { background:var(--elev); border:1px solid var(--line); padding:.16in .18in; font-family:var(--mono); font-size:8.5px; line-height:1.55; white-space:pre; margin:.14in 0 .2in; }
  .mod { page-break-before: always; }
  .src { margin-top:.14in; background:#0b0d10; border:1px solid var(--line); padding:.08in .08in .1in; }
  .ln { display:flex; font-family:var(--mono); font-size:7.05pt; line-height:1.36; white-space:pre-wrap; word-break:break-word; }
  .ln .n { flex:0 0 2.15em; color:var(--faint); user-select:none; }
  .ln .c { flex:1; color:var(--fg); }
  .kw { color:#c8c4b4; }
  .str { color:#9aa89a; }
  .cmt { color:#5a5e5c; font-style:italic; }
  .num { color:#a8a49a; }
  .note { background:var(--elev); border-left:2px solid var(--warn); padding:.12in .16in; margin:.16in 0; }
  .note p { font-size:10px; color:var(--muted); margin:0; }
</style>
</head>
<body>

<section class="cover">
  <div class="cover-bg"></div>
  <div class="cover-copy">
    <div class="banner">Confidential · owners / developers only · not for distribution</div>
    <p class="kicker">Earth cavity · 7.83 Hz</p>
    <h1 class="wordmark" aria-label="Morphogen">
      <span style="font-variation-settings:'wdth' 72,'wght' 320">M</span>
      <span style="font-variation-settings:'wdth' 96,'wght' 320">o</span>
      <span style="font-variation-settings:'wdth' 124,'wght' 320">r</span>
      <span style="font-variation-settings:'wdth' 146,'wght' 320">p</span>
      <span style="font-variation-settings:'wdth' 150,'wght' 320">h</span>
      <span style="font-variation-settings:'wdth' 138,'wght' 320">o</span>
      <span style="font-variation-settings:'wdth' 116,'wght' 320">g</span>
      <span style="font-variation-settings:'wdth' 92,'wght' 320">e</span>
      <span style="font-variation-settings:'wdth' 70,'wght' 320">n</span>
    </h1>
    <div class="rule" style="width:.7in;"></div>
    <p style="font-size:14px;">Code guide. Source of the instrument, module by module.</p>
    <p class="muted">v0.1 · 18 September 2026 · not linked from the glass</p>
  </div>
</section>

<section>
  <p class="kicker">00</p>
  <h1>How to read this volume</h1>
  <div class="note">
    <p>This book is for Morphogen owners and developers. It is not served from the public instrument, not offered on Enter, and not intended for contractors, audiences, or the player-facing preview. The twelve-page instrument guide is the public document. This is the internals.</p>
  </div>
  <p>Each chapter is one source file: a description of what it is for, the invariants it is not allowed to break, then the full text as it ships. Platform scaffolding that Morphogen does not use (auth, Postgres, app-data, grok-pwa injectors) is omitted on purpose.</p>
  <p class="muted">Auth is off. Database is off. Persistence is <code>localStorage</code> via zustand. The only server-ish surface in product is the optional TouchDesigner WebSocket, which Morphogen initiates as a client.</p>
</section>

<section>
  <p class="kicker">00 · architecture</p>
  <h1>Data flow</h1>
  <p>React is the chrome. The field and the sound run outside of it.</p>
  <pre class="flow">pointer / touch / IMU
        │
        ▼
 sensors.ts ──► runtime.brushes
        │       runtime.sense      (absolute pose for audio,
        │                           rest-relative flow for vis)
        ▼
 MorphogenApp (conductor)
        │
        ├─► RDEngine.frame()        shaders.ts  SIM → DISPLAY
        │         │                 20 Euler steps / rAF
        │         ▼
        │   runtime.stats           energy, meanV, edge, 16×16
        │         │
        ├─► AudioEngine.tick()      theory.yToScaleHz
        │         │                 Hum + live voices + freeze drones
        │         ▼
        ├─► MidiOut / TdClient      CC 20–29 · JSON 20 Hz
        │
        └─► zustand store           durable room (not the bus)
              ControlDock HUD</pre>
  <p>Two clocks. The GPU clock is <code>RDEngine</code>’s rAF. The audio clock is <code>AudioContext.currentTime</code>, ramped from the rAF tick. They meet in <code>runtime</code>. If a ramp is handed NaN, <code>ramp()</code> no-ops. If <code>tick()</code> throws, the solver still reschedules. Those two guards are why the instrument survived the float-as-index bug.</p>
  <p class="muted">Invariants worth tattooing: no locked.g re-injection; no square FBO; no <code>setPointerCapture</code> on touch; no <code>seedNonce++</code> on species morph; no freeze noise; live pitch stays inside the Hz window; Default is the way home.</p>
</section>

<section>
  <p class="kicker">00 · contents</p>
  <h1>Modules</h1>
  <ol class="toc">${toc}</ol>
</section>

${modulesHtml}

</body>
</html>
`;

const htmlPath = resolve(outDir, "morphogen-code-guide.html");
const pdfPath = resolve(outDir, "Morphogen-Code-Guide.pdf");
writeFileSync(htmlPath, html);
console.log("html", htmlPath, Buffer.byteLength(html), "bytes");

const browser = await chromium.launch({ args: ["--disable-web-security"] });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle", timeout: 120000 });
await page.evaluate(() => document.fonts?.ready);
await page.waitForTimeout(500);
await page.pdf({
  path: pdfPath,
  printBackground: true,
  format: "Letter",
  displayHeaderFooter: true,
  headerTemplate: `<div style="font-size:8px;color:#5a5e5c;width:100%;padding:0 0.62in;font-family:'IBM Plex Mono',monospace;display:flex;justify-content:space-between;"><span>MORPHOGEN · CODE GUIDE · CONFIDENTIAL</span><span>OWNERS / DEVELOPERS</span></div>`,
  footerTemplate: `<div style="font-size:8px;color:#5a5e5c;width:100%;padding:0 0.62in;font-family:'IBM Plex Mono',monospace;display:flex;justify-content:space-between;"><span>NOT FOR DISTRIBUTION</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  margin: { top: "0.55in", bottom: "0.55in", left: "0.62in", right: "0.62in" },
});
await browser.close();

if (!existsSync(pdfPath)) throw new Error("pdf missing");
const { statSync } = await import("node:fs");
console.log(JSON.stringify({ ok: true, html: htmlPath, pdf: pdfPath, bytes: statSync(pdfPath).size }));
