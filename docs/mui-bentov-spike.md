# MUI Bentov spike (Elliot) — post–M-24

**Status:** design lock only. No new dock faces until M-24 live clear (`6b37d6c` Stage · Sync on main + morphos republish).  
**Constraint:** WebGPU (WGSL) first; WebGL2/GLSL full peer path (Metta 2026-10-07). Shared chemistry/state. Same Play / Freeze / Sync semantics on both renderers. Opaque dock stays chrome.

## Map 1–4 → opaque-dock + sound engine (no new faces)

| Face / chip | Engine meaning | Hook today | Spike wire |
|---|---|---|---|
| **Play** | Working beam — touch adventure; pitch from finger vs Sync clock (Doppler feel) | hands → audio pitch; FACE_COPY.play | delta(Play − Sync clock) → detune / Doppler; keep toast one-liner MEMETiC-owned |
| **Sync** | Reference beam — MIDI + steady clock | Stage · Sync door; FACE_COPY.sync | expose `refClockHz`; MIDI clock locks reference; Play measures against it |
| **Freeze** | Node — point of rest | lockCount / Freeze | freeze = pin RD + mute adventure path; Release = antinode (growth + audio resume) |
| **Plant** | Pebble into interference pan | brushes | each brush = source; multi-touch = N sources into shared interference buffer |
| **Hum** | Entrainment lock | drone / sound tab | lock field + drone + MIDI to one pulse; lose lock → decoherence cut (not soft fade) |

## Post-clear tickets (open after SAUL M-24 clear)

1. **Beat face** (Stage panel, not a fifth chrome face until gated): two close oscillators → audible beat → slow third rhythm morphs Gray–Scott `F`/`k` via `morph_OnBeat` + `morph_BeatTime`. WebGPU-first; GLSL peer (Synesthesia-class uniforms).
2. **Dual renderers:** shared RD chemistry + interference state; `renderer: 'webgpu' | 'webgl2'`; identical Play/Freeze/Sync contracts.
3. **Cymatic / Hex:** Chladni modes keyed to audio bands (v2 sketch) — same state bus.

## Out of scope until clear

- New dock chrome faces
- On-glass Bentov jargon (MEMETiC one-liners only)
- Republish before main carries `6b37d6c`


## Visual gold standard (research lock — Metta 2026-10-07)

Sources (engineers only; **never** name on-glass — MEMETiC):
- [Synesthesia](https://synesthesia.live/) / [SSF audio uniforms](https://synesthesia.live/docs/ssf/audio_uniforms.html) — GLSL scene runtime + music reaction
- [Shadertoy](https://www.shadertoy.com) — multipass grammar (Buffer A–D + Image); import/adapt, do not rehost

### Morphos GLSL / WGSL audio contract (`morph_` = our names; mirror `syn_` semantics)

Feed from Morphos audio-engine (Hum / Play / Sync / Beat), not a third-party host.

**Textures (1D samplers)**
| Uniform | Channels | Notes |
|---|---|---|
| `morph_Spectrum` | r raw FFT · g **juiced FFT** (default) · b smooth FFT · a waveform | Prefer `.g` for shapes |
| `morph_LevelTrail` | r whole · g bass · b mid · a high | Band level over time |

**Bands:** Bass · Mid · MidHigh · High (+ whole-spectrum)

| Family | Uniforms (0–1 unless noted) | Use |
|---|---|---|
| Level | `morph_Level`, `morph_*Level` | Loudness, smoothed |
| Hits | `morph_Hits`, `morph_*Hits` | Transients / drums |
| Presence | `morph_Presence`, `morph_*Presence` | Rising/falling structure (not per-hit) |
| Time | `morph_Time`, `morph_*Time`, `morph_CurvedTime` | Clocks advance when band is loud (≈ `TIME` scale) |
| Beat | `morph_OnBeat`, `morph_ToggleOnBeat`, `morph_RandomOnBeat`, `morph_BeatTime` | Beat detection |
| BPM | `morph_BPM` (50–220), `morph_BPMConfidence`, `morph_BPMTwitcher`, `morph_BPMSin{,2,4,8}`, `morph_BPMTri{,2,4,8}` | Groove clocks |
| Large | `morph_FadeInOut`, `morph_Intensity` | Scene fade / song intensity |

**Beat face (post–M-24):** wire audible beat + slow third rhythm → `morph_OnBeat` + `morph_BeatTime` (+ optional `morph_BPMSin*`) into Gray–Scott `F`/`k` and both renderers.

### Multipass peer model (Shadertoy grammar)

| Pass | Role in Morphos |
|---|---|
| Buffer A | Chemistry / RD state (or interference field) |
| Buffer B | Feedback / previous-frame trails |
| Buffer C–D | Aux (beat accumulators, Chladni modes, fluid) |
| Image | Final composite (look / Hex / Cymatic) |

Same pass graph on **WGSL** and **GLSL**; shared CPU/GPU state bus. Import path later: Shadertoy / ISF → Morphos scene; Spout/Syphon/NDI wallpaper out is post-demo.

### Scene unit

One look = fragment program(s) + control panel + music reaction. MIDI/OSC mappable controls align with Stage · Sync.

## On-glass one-liners (MEMETiC lock — plain English)

- **Play** — Touch to hear the pitch under your finger.
- **Plant** — Drag to put new growth in the field.
- **Freeze** — Stop growth. Release lets it grow again.
- **Stage · Sync** — Connect MIDI and keep the beat. Permission only opens here.
- **Hum** — The steady tone underneath. When it locks, everything pulls into one pulse.
- **Beat** (Stage, after M-24) — Two close tones make a slow pulse. That pulse shapes the field.

Splash unchanged. Theory stays in the Guide.

## Visual-layer on-glass (MEMETiC lock — plain English)

- **Look** — Pick how the field paints to the sound.
- **Bass · Mid · High** — How hard each band pushes the picture.
- **Hit** — A sharp flash when that band spikes.
- **Beat** — Pulses with the clock. Same face as Stage · Sync’s beat.
- **Fade** — Soften or brighten the whole look.

Scene titles: plain only (“Ripple”, “Sand”, “Trail”). Guide may credit references; glass must not.


## Bentov research lock (Guide / engine only — never on-glass)

**Source:** Itzhak Bentov, *Stalking the Wild Pendulum: On the Mechanics of Consciousness* (1977). Biomedical inventor (steerable cardiac catheter). Speculative **model**, not proven physics — Bentov frames it as a model that should be replaced when it breaks.

### Chapter map

| Ch | Focus | Morphos use |
|---|---|---|
| 1 | Sound, waves, vibration, nodes, Chladni, interference, beats, hologram, coherence, resonance/entrainment | Toolkit already in MUI map 1–4 + visual multipass |
| 2 | Matter as mostly void + oscillating fields | Field as vibratory medium (RD / Look) |
| 3 | Action/rest Morse code (nodes) | Freeze = rest; Release/Play = action half-cycle |
| 4 | Time dilates in altered states; observer expands at rest points | Freeze dwell as “rest-point” attention (Guide) |
| 5 | Consciousness = quantity (response count) × quality (frequency refinement) | Bass·Mid·High as quality bands (engine) |
| 6–7 | Relative realities; learning as climbing frequency bands | Look scenes as band-tuned aesthetics |
| 8 | Toroidal / holographic universe (“absolute” as calm sea; realities as ripples) | Multipass interference; wallpaper fragment = part holds whole |
| 9–10 | Intuition + Creator reflections | Out of product scope |
| App. | Physio-kundalini as standing waves in the ventricles | Guide theory only |

### Core claim for Morphos (engine feel, not UI copy)

Heart–aorta resonates ~**7 Hz** in stillness → ~**14 rest points/s** → at each node, momentum ≈ 0 so position is indefinite → psyche briefly couples to a holographic field. Meditation ≈ entrainment to Earth’s ~7.5 Hz cavity. Resonance minimizes energy; **decoherence is waste** (Hum unlock = hard cut, not soft fade).

- Hum lock target feel ≈ **7 Hz** pulse (do **not** banner Schumann or Bentov on-glass — M-23 stays cleared).
- Freeze = node / rest. Play = action half-cycle.
- Beat = beat-frequency down-conversion (fast → slow shapes Gray–Scott).
- Look multipass = interference / hologram grammar.
- Bass·Mid·High = frequency bands of “quality.”

Theory lives in the Guide (may credit Bentov). Glass stays MEMETiC plain English only.

## Guide credit (MEMETiC lock — Guide only)

> Inspired by Itzhak Bentov’s *Stalking the Wild Pendulum* — a model of vibratory matter, rest points, and entrainment. Morphos treats that as metaphor for play: freeze as a pause in the field, the Hum as the steady pulse, Beat as two tones making a slower pulse. Bentov’s claims are speculative; the instrument is the proof surface.

On-glass Hum stays: “The steady tone underneath. When it locks, everything pulls into one pulse.” No Bentov, no Schumann, no 7 Hz on the chrome.
