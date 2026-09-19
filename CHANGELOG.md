# Changelog

All notable changes to Morphogen are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Compact **Sound** face is the default on the card: waveform chips, C♯ / D♭,
  Ionian through Locrian plus Major / Minor / pentatonic / blues / sus, and a
  **Hz window** (factory 47–376, open either end). Field (F, k) is one tap away.
- Twelve-page **instrument guide** (PDF): what has been built, how to play,
  and the next chapter (Ableton, Serum, Resolume, Synesthesia). Linked from
  Enter and from the repository.
- Always-visible **Default settings** toggle (header, Field, and Sound). Restores
  mitosis, The Hum (sine), C Ionian, factory mix, and clears loops, layers, and
  locks — a way home if you get lost in the noise.
- Circle-of-fifths **key** and church **mode** (plus blues / suspended) toggles.
  Live pitch quantizes to the scale. The phone compass can walk the key in
  realtime.
- Audio **layer** looper: record looping samples, stack overdubs, play/pause
  each layer from Sound.
- Field **patches** (save F/k/Du/Dv/species/colour) and **screenshots** of the
  living pattern.
- Compiled release packages (Vercel prebuilt zip + source archive + SHA256SUMS)
  attached to GitHub Releases. `npm run package` rebuilds them. A Release
  workflow compiles the same archives whenever a GitHub release is published.

### Changed

- Waveforms are architecturally distinct (mix, filter, FM, harmonic layout);
  live voices bypass the Hum tilt filter so saw/square/pulse cut through.
- Play surface is an XY pad: **height is pitch**, **across is amplitude**.
  Pan comes from roll.
- Restore-defaults also resets volume, mute, audio, gyro, key, and recorded
  layers (Shift+R, or the Default toggle).
- F, k, Freeze, and Sound sit in a **card under the wordmark** on the
  phone (and bottom-right on a laptop) so preview chrome cannot cover them.
  The card starts as a thin **Freeze / Release / Hide** bar; Field and Sound
  sheets open on tap. **Sound** is waveform, key, mode, and Hz range. **More**
  opens the full Field / Image / Body / Sound / Sync console (tabs are labeled).
  **Hide** (eye-off) clears the chrome so the field is the whole glass.
- **Freeze** / **Release** are labeled, full-width controls (not an unlabeled
  layers glyph). Freeze holds the last pitch as a quiet drone you play over —
  no noise bed, no delay wash, no interval stacking. **Release** peels one
  layer; **Release all** clears the stack. Four layers. The HUD reads DRONE N.

### Fixed

- The compact control card could not be dismissed: Close on the console
  collapsed it to a Sound sheet that stayed parked in the middle of the
  field, and Hide chrome never unmounted the dock. Hide now removes the
  card; a single eye restores it. Field / Sound are sheets, not a permanent
  slab.
- The unlabeled layers glyph stacked filtered noise into a delay with high
  feedback, then multiplied live pitch by a fifth/octave per layer, so each
  tap was louder white noise climbing out of the Hz window, with no off
  switch except Reset. Freeze is a musical drone inside the window; Release
  is the off switch. The always-on noise bed is muted so The Hum stays sine.

- First contact froze the whole instrument: scale-degree lookup used a
  float as an array index (`intervals[3.7]` → `NaN` Hz), `setTargetAtTime`
  threw, and the animation frame never rescheduled. Pitch is interpolated;
  audio ramps ignore non-finite values; the solver keeps running if a
  voice errors. Window-level capturing listeners no longer swallow the
  console while a finger is down.

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
