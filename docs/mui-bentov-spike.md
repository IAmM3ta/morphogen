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

1. **Beat face** (Stage panel, not a fifth chrome face until gated): two close oscillators → audible beat → slow third rhythm morphs Gray–Scott `F`/`k`. WebGPU-first; GLSL peer.
2. **Dual renderers:** shared RD chemistry + interference state; `renderer: 'webgpu' | 'webgl2'`; identical Play/Freeze/Sync contracts.
3. **Cymatic / Hex:** Chladni modes keyed to audio bands (v2 sketch) — same state bus.

## Out of scope until clear

- New dock chrome faces
- On-glass Bentov jargon (MEMETiC one-liners only)
- Republish before main carries `6b37d6c`


## On-glass one-liners (MEMETiC lock — plain English)

- **Play** — Touch to hear the pitch under your finger.
- **Plant** — Drag to put new growth in the field.
- **Freeze** — Stop growth. Release lets it grow again.
- **Stage · Sync** — Connect MIDI and keep the beat. Permission only opens here.
- **Hum** — The steady tone underneath. When it locks, everything pulls into one pulse.
- **Beat** (Stage, after M-24) — Two close tones make a slow pulse. That pulse shapes the field.

Splash unchanged. Theory stays in the Guide.
