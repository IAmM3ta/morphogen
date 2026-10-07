# MORPHOS

**Living Field.** A theremin made of chemistry. You play a Gray–Scott field with your fingers and with the way you hold the phone. The glass opens dark and clear. The first finger is a pitch. The phone tunes the pattern.

Public instrument: **[morphos.grok.me](https://morphos.grok.me)** · repository: [`IAmM3ta/morphogen`](https://github.com/IAmM3ta/morphogen).

**[Changelog](CHANGELOG.md)** · **[Instrument guide (PDF)](docs/Morphos-Instrument-Guide.pdf)** · **[HTML guide](docs/morphogen-guide.html)** · **[Grok builder republish](docs/GROK-APP-BUILDER-REPUBLISH.md)** · **[MUI / Bentov spike](docs/mui-bentov-spike.md)** · **[Releases](https://github.com/IAmM3ta/morphogen/releases)**

---

## Ship status (read this first)

| Surface | Branch / tip | Live? |
| --- | --- | --- |
| Glass + opaque dock (M-24) | `main` (fold from `opaque-dock-m24`) | **Only after** Grok app-builder republish — GitHub does not auto-deploy |
| MORPHOS v2 (WebGPU RD, looks, wallpaper) | draft [PR #2](https://github.com/IAmM3ta/morphogen/pull/2) `morphos-v2` | Not merged — do not republish until M-24 clears and Metta green-lights |
| Gates | SAUL M-24 / M-06 | HOLD until live verify on morphos.grok.me |

**Live hosting fact:** `morphos.grok.me` is served by **Grok’s app builder**. Merging to `main` updates GitHub only. Step-by-step republish: **[docs/GROK-APP-BUILDER-REPUBLISH.md](docs/GROK-APP-BUILDER-REPUBLISH.md)**.

---

## Opaque dock (M-24) — Musical chrome

Panels are solid (`bg-bg-elevated`), not glass-washed over the field.

| Face | On-glass meaning (MEMETiC) |
| --- | --- |
| **Play** | Touch to hear the pitch under your finger. |
| **Plant** | Drag to put new growth in the field. |
| **Freeze** | Stop growth. Release lets it grow again. |
| **Stage · Sync** | Connect MIDI and keep the beat. Permission only opens here. |

Status chips (not faces): **Hum · Hands · Field**. Hum chip: *The steady tone underneath. When it locks, everything pulls into one pulse.*

Splash (locked): *Tap to start sound. Drag to plant growth. Touch the field to hear it.*

Post-clear Stage faces (not on chrome until SAUL clears M-24): Look · Bass·Mid·High · Hit · Beat · Fade — copy in `FACE_COPY` / [mui-bentov-spike.md](docs/mui-bentov-spike.md).

---

## Play

1. Open the app and tap **Enter**. Grant motion. After Enter, chips read **audio unlocked|failed · motion on|denied**. MIDI is only requested from **Stage · Sync**.
2. **View** opens the menu. **Reset** returns the factory field. **Rec** / **Loop** record session layers.
3. **One finger.** Slide up and the pitch rises. Slide down and it falls. Warm sine in D Dorian (~125–501 Hz). Lo opens toward a deep fundamental (~7.83 Hz) — engine detail; not labeled on chrome.
4. **Two fingers, then three.** Second is a fifth; third is the octave.
5. **The phone is the other hand.** Heading scales the pattern; tilt changes growth.
6. Field stays dark. Pattern bodies are deep colour.
7. **Freeze** stops growth; **Release** lets it grow. Touch plays pitch; **drag** plants. `L` freezes, `Z` releases, `Shift+Z` clears.
8. **Headphones** for spatial audio.
9. **Listen** (Sound face) hears a room, file, or shared tab — not Spotify’s stream.
10. `U` / `⌘Z` undo · `R` reseed · `Shift+R` factory reset · `C` record · `H` / `G` hide chrome · `F` fullscreen (v2).

---

## Field

**View** opens the card. **Sound** is waveform, key, mode, Hz window, vibrato. **Stage · Sync** owns MIDI. Field pane follows [VisualPDE Parameters](https://visualpde.com/user-guide/advanced-options#parameters).

| Symbol | Meaning |
| --- | --- |
| **F**, **k** | feed and kill (phone nudges while held) |
| **Dᵤ**, **Dᵥ** | diffusion (heading scales) |
| **R**, **B** | disk brush radius and value |
| **N**, **Δt** | steps per frame and timestep |
| **L** | hillshade |

Species packs set chemistry without reseeding. Factory rest is **Living**.

---

## Run locally

```bash
git clone https://github.com/IAmM3ta/morphogen.git
cd morphogen
git checkout main
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

### Requirements

- Node 22+
- Browser with **WebGL2** (current `main`); **WebGPU** preferred on `morphos-v2`
- iPhone / iPad: Safari or Chrome; motion permission on first Enter
- Headphones for spatial audio

---

## Docs map (engineers)

| Doc | Purpose |
| --- | --- |
| [docs/GROK-APP-BUILDER-REPUBLISH.md](docs/GROK-APP-BUILDER-REPUBLISH.md) | Step-by-step live publish to morphos.grok.me |
| [docs/mui-bentov-spike.md](docs/mui-bentov-spike.md) | Bentov MUI map · Synesthesia audio uniforms · Shadertoy multipass · dual WGSL/GLSL after M-24 |
| [docs/morphogen-guide.html](docs/morphogen-guide.html) | Player guide + Bentov credit (Guide only — never on chrome) |
| [docs/v2/](docs/v2/) | v2 design (on `morphos-v2` branch) |

**Chrome rules:** no Bentov, Schumann, Synesthesia, or Shadertoy names on-glass. Theory and credits stay in the Guide.

---

## Update the live app (Grok)

1. Merge / confirm desired tip on `main` (this repo).
2. Follow **[docs/GROK-APP-BUILDER-REPUBLISH.md](docs/GROK-APP-BUILDER-REPUBLISH.md)** in the Grok app builder (sync from GitHub `main` → build → publish).
3. Hard-refresh morphos.grok.me and ping SAUL for glass-verify.

There is no automated path from this repository to the live host.

---

## Download (tagged package)

Compiled packages for the tagged cut live on the [v0.1.0 release](https://github.com/IAmM3ta/morphogen/releases/tag/v0.1.0). `main` is ahead of that tag — see [CHANGELOG](CHANGELOG.md).

```bash
unzip morphogen-0.1.0-vercel.zip -d .vercel/output
npx vercel deploy --prebuilt
```

---

## TouchDesigner

Open **Stage · Sync** and connect to a WebSocket DAT as a server. Callbacks: `public/td/morphogen_ws_callbacks.py`. Packets are v2 (TouchDesigner Tutorial 087). MIDI CCs 20–35 are the other path.

---

## Stack

TanStack Start, React 19, WebGL2 Gray–Scott (main), WebGPU Gray–Scott (`morphos-v2`), Web Audio (polyphonic theremin, HRTF, The Hum).
