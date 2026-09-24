# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WebGL2 recreation of the PlayStation 3 XMB background wave ("spline") and sparkle particles. The active implementation in `ps3xmbwave/` is driven by CPU-side pipelines reverse-engineered from the PS3's SPU tasks: `spline.elf` for the wave and `particles.elf` for the particles. `SPLINE_REVERSE_ENGINEER.md`, `PARTICLES_REVERSE_ENGINEER.md` and `BACKGROUND_REVERSE_ENGINEER.md` are the sources of truth for that reverse engineering and document what is traced vs. still synthetic.

## Commands

```bash
npm install          # only needed for the dev server / deploy tooling
npm run start        # serve the whole repo at http://localhost:8000
npm run dev          # same, opens a browser
npm run deploy       # gh-pages, publishes ps3xmbwave/ as the site root
```

Entry points once served: `/ps3xmbwave/` (active), `/dds/` (gradient extraction tool), `/old-research/` (archived guesswork-era implementation).

Each of the three folders also has its own `docker-compose.yml` (nginx, read-only mount) if you want them served independently: `ps3xmbwave` → 9913, `dds` → 9919, `old-research` → 9828.

```bash
node tools/bench/particles.js --seconds 30 --runs 3 --seed 1
```

The one bench there is: it runs the particle simulation headless over the spline layer's wave and prints its pool and its drawn particles beside the same measurements read off the console — a savestate's pool and two RSX frame captures. Use it before and after touching the modelled emitter. It needs no firmware — the console's column is recorded inside it, and `tools/bench/pool-from-savestate.py` regenerates that column from a savestate if a better one turns up.

**There is no build step, no test suite, and no working lint setup.** Both tool scripts glob only the repo root: `npm run lint` (`eslint *.js`) matches no files and there is no eslint config, and `npm run format` (`prettier --write *.js *.html *.md`) only ever rewrites the root Markdown files (`README.md`, `SPLINE_REVERSE_ENGINEER.md`, this file) — it never reaches `ps3xmbwave/` or `dds/`. Don't rely on either as a verification gate. Verification is visual: serve the repo and look at the canvas, plus the browser console for shader compile/link errors (both renderers throw on failure). A caution when checking an edit that way: browsers hold on to the `.js` files hard here, and a forced reload does not always shift them — loading the page from `http://127.0.0.1:8000/` instead of `http://localhost:8000/` is a different origin with an empty cache, which does.

## Architecture

### Module system: browser globals, load-order dependent

`ps3xmbwave/` uses no bundler and no ES modules. Everything communicates through `window`: the data files (`*-settings.js`, `background-gradients-*.js`) are plain top-level `window.X = {...}` assignments, and every other file is an IIFE that exports onto it. `index.html` loads them with plain `<script>` tags in an order that matters:

1. `background-gradients-night.js`, then `background-gradients-day.js` — the day file's trailing IIFE **merges both** month tables into `window.BG_GRADIENT_PRESETS` and `window.BG_GRADIENT_PRESET_OPTIONS` (keys `MM_day` / `MM_night`, plus a `default` legacy entry and an `auto` one), and exports `window.bgGradientForDate`, which `spline.js` calls each frame under `auto`. The XMB walks from one month's texture to the next across the month rather than switching on the 1st, which is what that function reproduces; `BACKGROUND_REVERSE_ENGINEER.md` has the measurements.
2. `spline-settings.js` — reads `BG_GRADIENT_PRESET_OPTIONS` **at load time** to build the preset dropdown, so it must come after both gradient files.
3. `particles-themes.js`, then `particles-settings.js` — same pattern: the settings file reads `PARTICLE_THEME_OPTIONS` at load time for its theme dropdown.
4. `settings-panels.js`, `spline-reverse.js`, `wave-surface-cpu.js`, `particles-reverse.js`, `xmb-input.js`, then `spline.js` / `particles.js`.

The global contract: `SPLINE_SETTINGS` + `SPLINE_SETTINGS_META`, `BG_GRADIENT_PRESETS` + `BG_GRADIENT_PRESET_OPTIONS` + `bgGradientForDate`, `PARTICLE_SETTINGS` + `PARTICLE_SETTINGS_META`, `PARTICLE_THEMES` + `PARTICLE_THEME_OPTIONS` + `applyParticleTheme`, `createSettingsPanel`, `PS3SplineReverse`, `WaveSurfaceCPU`, `PS3ParticlesReverse`, `createXmbInput`, `createSplineLayer`, `createParticlesLayer`. `dds/` is the exception — it uses real ES modules (`<script type="module">`).

### Frame loop and layering

`index.html` owns the canvas, the WebGL2 context, DPR-aware resize, and the `requestAnimationFrame` loop. It advances one clock and calls `splineLayer.render(t)` then `particlesLayer.render(t, dt)`: the particles are emitted from the wave just drawn, so they share its clock. It hands the spline layer's `surface` (its settings plus the displacement array) and the input adapter to the particle layer. Per frame:

- background gradient fullscreen quad — blending off
- wave mesh (100×100 triangle-strip grid) — `SRC_ALPHA / ONE_MINUS_SRC_ALPHA`
- particles (instanced quads, two passes: lit flakes, then glare sprites) — additive `ONE / ONE`

Depth testing is never enabled, and the wave vertex shader writes `gl_Position` straight from grid coordinates (`vec3(aPos.x, 0, aPos.y)` with displacement applied) — **there is no projection or view matrix**, positions are effectively clip space. Normals for the fresnel term come from `dFdx`/`dFdy` of the interpolated position. The particles, unlike the wave, use the XMB's real camera (eye at (0, 0, 2) looking down −z, 53° vertical field of view), and `particles-reverse.js` places wave points in that world at a fixed depth range.

### The reverse-engineered spline pipeline

`spline-reverse.js` exports `PS3SplineReverse.createPipeline()`. Each frame `spline.js` calls `writeDisplacementTexture(settings, timeSec, ...)`, which runs the traced PS3 chain and fills a `256 × 64` single-channel float (`R32F`) array; `spline.js` uploads it via `texSubImage2D` and the wave vertex shader samples it for height (and again, u-scrolled, for z detail).

Stage order inside the pipeline mirrors the ELF flow documented in `SPLINE_REVERSE_ENGINEER.md`:

`buildRuntimeInputs` (settings → synthetic `b300`, 16 floats) → `buildSplineTable` (synthetic `b380` descriptor bytes → 361 × vec4 table, blended by `b300` then normalized through `NORM_A`/`NORM_B` and `tanh`) → `runKernel` (8 iterations × 8 stored vec4s, matching the `0x400`-stride store layout of `FUN_000045c0`, then temporally smoothed) → per-row B-spline evaluation over 28 control points into the texture.

Constants in this file are not arbitrary: `PS3.TABLE_ENTRY_COUNT` (`0x169`), `STORE_OFFSETS_BYTES`, `OUTPUT_STRIDE_BYTES`, `R37_WORDS`, the `19 * (word >> 4) + (word & 0xF)` index math, and `NORM_A`/`NORM_B` all come from traced addresses. If you change them, reconcile with `SPLINE_REVERSE_ENGINEER.md` (and update that doc) rather than tuning them as free parameters.

`settings.rePipelineBlend` cross-fades each control point between the reverse-engineered core and the older hand-tuned "legacy" wave sum, so `0` reproduces the guesswork look and `1` is pure RE pipeline. The `b300`/`b380` inputs are synthesized from UI settings because real runtime payloads have never been captured — that is the known gap for 1:1 output. `spline.js` stashes the pipeline's intermediates on `window.__PS3_REVERSE_STATE` each frame for console inspection.

### The reverse-engineered particle system

`particles-reverse.js` exports `PS3ParticlesReverse.createSystem()`, and `particles.js` calls its `update(...)` once per frame before drawing. The file has two halves, marked in the code:

- **Verified:** `runTask` is the SPU update task of `particles.elf`, steps 1–8 of `PARTICLES_REVERSE_ENGINEER.md` in order: flow grid sample, noise from three generators reseeded every frame, field rotation, vec4 integration (life in `position.w`, aging rate in `velocity.w`), quaternion spin, death back to the free list, vertex record. Its constants (`FREE = -666`, `LIFE_END`, `NOISE_SEEDS`, `SPIN_FREQS`, `LIFE_MIN`/`LIFE_MAX`, `CAMERA`) are traced, and the parameter block `createParams` describes — its 768-byte layout, the 32 × 16 grid, `GRID_SCALE`/`GRID_ORIGIN`, `FIELD_CENTRE` — was read out of an RPCS3 savestate. None of them are free parameters; reconcile with the doc before changing them.
- **Modelled:** what the PPU puts in the block, which is not traced yet: the flow grid's contents, the emitter (`emitOne`), and the input response inside `buildParams`. Its constants (`WAVE_DEPTH_NEAR`/`FAR`, `EMIT_EXTENT`) are calibrated against the RSX captures, and the doc records how.

The simulation steps at a fixed 60 Hz, because the task's semantics are per frame (life advances by the aging rate once per step). It runs at most 4 steps per frame, pre-warms 300 steps on the first frame so the scene starts full, and skips frames while the canvas is empty. Input gathered between steps is held until a step consumes it. `window.__PS3_PARTICLES_STATE` holds its counters for console inspection.

`wave-surface-cpu.js` is a CPU copy of the wave vertex shader in `spline.js`, so particles are emitted on the wave that is drawn. **Any change to that shader's math must be mirrored there.**

`particles.js` draws the system in the two passes the XMB uses, `particles_quads` then `particles_second`, re-authored in GLSL from the decompiled programs. They are rewritten, not copied — firmware shaders never go in the repo. The iridescent texture is generated at start-up from a 16-colour table fitted to the firmware one.

`xmb-input.js` stands in for the controller:

- the pointer crossing a virtual 7 × 7 icon grid, and the arrow keys, press the D-pad;
- dragging with the mouse moves a virtual Sixaxis, reported as acceleration in g.

The system polls it once per frame.

The simulation files run under Node for headless checks with `globalThis.window = globalThis` and an indirect `eval` of each file in load order. Don't use a `vm` context: global lookups there make it about 30× slower. `tools/bench/particles.js` is that harness: it compares the pool against the console's, slot for slot in the task's own record layout, which is why `createSystem` takes an optional `seed` and the system exposes `pool`, `stride` and `free`.

### Settings and UI

`settings-panels.js` generates panels by **introspecting the settings objects**: every finite numeric key becomes a slider, keys whose meta says `type: 'select'` become a dropdown, and keys missing from the meta map fall back to an inferred ±2× range. It snapshots the settings object at creation time to implement per-row Reset, and mutates the live object in place — renderers read `settings.*` fresh on every frame, so no re-initialization or event wiring is needed.

Consequences when adding a knob:

- A new numeric key in `SPLINE_SETTINGS` / `PARTICLE_SETTINGS` gets a slider automatically; add a matching `*_SETTINGS_META` entry or the range will be nonsense.
- Wiring it to a shader needs three edits in the renderer: the `uniform` declaration in the GLSL string, the location lookup (the `waveU` map in `spline.js`, the `UNIFORMS` list in `particles.js`), and the `gl.uniform*` call (`render` in `spline.js`, `setUniforms` in `particles.js`).
- Pipeline-only knobs (the `re*` family, `band*`, `travel*`) need no shader change — they are read inside `spline-reverse.js`.

`PARTICLE_SETTINGS` keys are the `.mnu` parameter names in camelCase (`PARTICLES.mnu`, then `PARTICLES_UI.mnu`), with the firmware values as defaults — keep that mapping so the settings can be checked against the firmware. Knobs of the modelled side and the mouse adapter go in the last group.

`particles-themes.js` holds the firmware's per-theme parameter sets as differences from those defaults, and `applyParticleTheme(settings, theme)` writes one of them (or, on `'auto'`, the day's blend of two) into the live settings. It is idempotent: it writes only when the theme or the blend moves, so edits made by hand survive. `index.html` calls it every frame and, when it reports a write, calls `refresh()` on the panel that `createSettingsPanel` returns — the controls catch up with the settings, and the values they land on become what Reset returns to. Anything else that writes settings from outside the panel has to do the same.

### `tools/re/` — reverse-engineering tooling

Python tools (standard library only, except `ppu_prx.py`, which needs capstone) that read the user's own PS3 firmware (for example an RPCS3 install): a `.qrc` extractor, an SPU disassembler, a matcher that uses RPCS3's SPU cache to show which code actually ran, a Cg binary (`.vpo`/`.fpo`) inspector that recovers uniform values from RPCS3's shader cache and maps the constants of RPCS3's decompiled fragment programs back to uniforms, a reader for RPCS3 RSX frame captures (vertex constants and vertex buffers per draw call), and a PPU module loader and disassembler. `tools/re/README.md` has the workflow. They write into `re-work/`, which is gitignored — **firmware files (ELFs, `.qrc` contents, textures, decompiled shaders) must never be committed**. `PARTICLES_REVERSE_ENGINEER.md` and `BACKGROUND_REVERSE_ENGINEER.md` are the particle system's and the backdrop's counterparts of the spline notes, in progress on the `particles-reeng` branch.

### `dds/` — gradient extraction tool

Standalone browser tool (ES modules) used to produce the month presets. `dds-reader.js` parses DDS (DXT1/3/5 and masked uncompressed formats) in pure JS; `gradient-fit.js` brute-forces the gradient angle and runs per-channel linear regression to fit a 2D linear gradient, reporting RMSE; `export-code.js` emits JS preset source. The exported record shape (`width`/`height`/`rmse` included) does not match what `background-gradients-*.js` actually stores (`angleDeg`, `colorStart`, `colorEnd`), so exported output is trimmed by hand when pasted in. The `.dds` source files are firmware assets and are not in the repo.

## Conventions

- `'use strict'` at the top of every `ps3xmbwave/` file, with the logic files wrapped in an IIFE; two-space indent; single quotes in `ps3xmbwave/` (double quotes in `dds/`).
- Every `ps3xmbwave/` file except the two `background-gradients-*.js` data tables opens with a two-line header comment stating what it produces and which files consume it — keep this up to date when dependencies shift.
- Settings files are declarative only: no runtime logic in `*-settings.js`.
- `old-research/` is a frozen archive (uses regl + stats.js). Don't refactor it or import from it; it exists for reference only.
