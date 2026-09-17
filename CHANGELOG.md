# Changelog

All notable changes to Morphogen are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-09-17

First public cut. A Gray–Scott audiovisual instrument: VisualPDE-class field,
The Hum, polyphonic theremin voices, phone IMU, loop lock, optional
TouchDesigner / MIDI for projection. Playable in any modern browser.

### Added

- WebGL2 Gray–Scott solver with a 9-point isotropic Laplacian, aspect-correct
  sim FBO, and adaptive 4K-class resolution.
- VisualPDE-shaped **Field** console:
  - Typeset Pearson Gray–Scott
    (`∂u/∂t = Dᵤ ∇²u − uv² + F(1−u)`, `∂v/∂t = Dᵥ ∇²v + uv² − (F+k)v`).
    Touch a coefficient to bind its slider.
  - Named parameters in `name = value in [min, max]` form: **F**, **k**,
    **Dᵤ**, **Dᵥ**.
  - **Brush** — disk inoculum of species *v*, radius **R** and value **B**.
  - **Time** — steps/frame **N** and timestep **Δt**.
  - **Views** — colour map of *v* and hillshade lighting **L**.
- Species packs (mitosis, solitons, pulsing, holes, mazes, fingerprint,
  spirals, worms, coral, skate) that morph F / k / Dᵤ / Dᵥ / palette in
  place — the field is not reset.
- **The Hum** — always-on Schumann-resonance sine pad (7.83 Hz and audible
  octaves). Default waveform is sine.
- Polyphonic theremin: one live voice per finger (height is pitch, pan from
  *x*, pressure opens harmonics). Pointer hover is an audio-only antenna.
- Waveforms: sine, triangle, saw, square, pulse, and spectrum (the living
  field as harmonic partials).
- Phone chassis as the other antenna: tilt, roll, spin, and g-force sculpt
  The Hum and live pitch. Motion permission is requested on Enter.
- Loop lock (double-tap and hold, or `L`) — freeze the current generation
  as sound + overlay memory. Four layers. `Z` releases, `Shift+Z` clears.
- Undo (`U` / `⌘Z`) over field, chemistry, waveform, and lock count.
- Reset (`R`), restore defaults (`Shift+R`), session record (`C`).
- Image modes: inoculate, develop, resist, palette-from-photograph.
  Optional camera.
- TouchDesigner WebSocket client (JSON at 20 Hz) and MIDI CC 20–29.
  Callbacks in `public/td/morphogen_ws_callbacks.py`.
- PWA identity **Morphogen** (site title wins over the host slug).

### Changed

- Solver runs many Euler steps **every animation frame** (default 20) so
  the pattern lives, instead of a gated ~30 Hz petri dish.
- Default chemistry is Pearson mitosis (`F = 0.037`, `k = 0.06`,
  `Dᵤ = 0.21`, `Dᵥ = 0.105`) with the scientific **Field** colormap and
  hillshade from ∇*v*.
- Click / touch seeds a modest disk of *v* = 1, *u* = ½ (Pearson IC).
  Fingers do not paint marks, ripples, or halos on the glass.
- Gyro uses **absolute pose** for audio (holding the phone *is* the
  instrument) and rest-relative flow for the field, so tilt does not
  streak the colonies.
- Species, feed, kill, and diffusion sliders never reseed the field.

### Fixed

- Vertical LED-like streaks from a square FBO, gyro wind, and hot
  inoculum feeding locked layers back into the solver.
- Colonies dying after lift-off (cool seeds at 4K); inoculum is now a
  VisualPDE-style disk of *v* = 1.
- Preview / PWA title picking up a grok.me host slug
  (“Cap Granite Lagoon Rocket”) instead of Morphogen.
- Gyro appearing silent: rest-relative pose zeroed a stable hold, and
  mappings were inaudible. Absolute pose and stronger Hum / FM mapping.
- Adaptive quality collapsing after the CPU seed hitch; first 90 frames
  are ignored for downsample.
- Enter hanging on MIDI init and PeriodicWave construction; audio unlock
  is wrapped, `started` is set first.

### Keyboard

| Key | Action |
| --- | --- |
| `1`–`9` | Morph to a species pack |
| `L` | Lock loop |
| `Z` | Release last loop |
| `Shift+Z` | Clear all loops |
| `U` / `⌘Z` | Undo |
| `R` | Reset field |
| `Shift+R` | Restore defaults |
| `C` | Record / stop |
| `H` | Hide chrome |
| `F` | Fullscreen |

[Unreleased]: https://github.com/IAmM3ta/morphogen/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/IAmM3ta/morphogen/releases/tag/v0.1.0
