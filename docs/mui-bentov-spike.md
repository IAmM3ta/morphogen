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
