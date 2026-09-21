# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

WebGL2 recreation of the PlayStation 3 XMB background wave ("spline") and sparkle particles. The active implementation in `ps3xmbwave/` is driven by a CPU-side pipeline reverse-engineered from the PS3's SPU `spline.elf`; `SPLINE_REVERSE_ENGINEER.md` is the source of truth for that reverse engineering and documents what is traced vs. still synthetic.

## Commands

```bash
npm install          # only needed for the dev server / deploy tooling
npm run start        # serve the whole repo at http://localhost:8000
npm run dev          # same, opens a browser
npm run deploy       # gh-pages, publishes ps3xmbwave/ as the site root
```

Entry points once served: `/ps3xmbwave/` (active), `/dds/` (gradient extraction tool), `/old-research/` (archived guesswork-era implementation).

Each of the three folders also has its own `docker-compose.yml` (nginx, read-only mount) if you want them served independently: `ps3xmbwave` → 9913, `dds` → 9919, `old-research` → 9828.

**There is no build step, no test suite, and no working lint setup.** Both tool scripts glob only the repo root: `npm run lint` (`eslint *.js`) matches no files and there is no eslint config, and `npm run format` (`prettier --write *.js *.html *.md`) only ever rewrites the root Markdown files (`README.md`, `SPLINE_REVERSE_ENGINEER.md`, this file) — it never reaches `ps3xmbwave/` or `dds/`. Don't rely on either as a verification gate. Verification is visual: serve the repo and look at the canvas, plus the browser console for shader compile/link errors (both renderers throw on failure).

## Architecture

### Module system: browser globals, load-order dependent

`ps3xmbwave/` uses no bundler and no ES modules. Everything communicates through `window`: the data files (`*-settings.js`, `background-gradients-*.js`) are plain top-level `window.X = {...}` assignments, and every other file is an IIFE that exports onto it. `index.html` loads them with plain `<script>` tags in an order that matters:

1. `background-gradients-night.js`, then `background-gradients-day.js` — the day file's trailing IIFE **merges both** month tables into `window.BG_GRADIENT_PRESETS` and `window.BG_GRADIENT_PRESET_OPTIONS` (keys `MM_day` / `MM_night`, plus a `default` legacy entry).
2. `spline-settings.js` — reads `BG_GRADIENT_PRESET_OPTIONS` **at load time** to build the preset dropdown, so it must come after both gradient files.
3. `particles-settings.js`, `settings-panels.js`, `spline-reverse.js`, then `spline.js` / `particles.js`.

The global contract: `SPLINE_SETTINGS` + `SPLINE_SETTINGS_META`, `PARTICLE_SETTINGS` + `PARTICLE_SETTINGS_META`, `createSettingsPanel`, `PS3SplineReverse`, `createSplineLayer`, `createParticlesLayer`. `dds/` is the exception — it uses real ES modules (`<script type="module">`).

### Frame loop and layering

`index.html` owns the canvas, the WebGL2 context, DPR-aware resize, and the `requestAnimationFrame` loop. It advances two independent clocks (particles start at a random offset) and calls `splineLayer.render(t)` then `particlesLayer.render(t)`. Per frame:

- background gradient fullscreen quad — blending off
- wave mesh (100×100 triangle-strip grid) — `SRC_ALPHA / ONE_MINUS_SRC_ALPHA`
- particles (point sprites) — additive `ONE / ONE`

Depth testing is never enabled, and the wave vertex shader writes `gl_Position` straight from grid coordinates (`vec3(aPos.x, 0, aPos.y)` with displacement applied) — **there is no projection or view matrix**, positions are effectively clip space. Normals for the fresnel term come from `dFdx`/`dFdy` of the interpolated position.

### The reverse-engineered spline pipeline

`spline-reverse.js` exports `PS3SplineReverse.createPipeline()`. Each frame `spline.js` calls `writeDisplacementTexture(settings, timeSec, ...)`, which runs the traced PS3 chain and fills a `256 × 64` single-channel float (`R32F`) array; `spline.js` uploads it via `texSubImage2D` and the wave vertex shader samples it for height (and again, u-scrolled, for z detail).

Stage order inside the pipeline mirrors the ELF flow documented in `SPLINE_REVERSE_ENGINEER.md`:

`buildRuntimeInputs` (settings → synthetic `b300`, 16 floats) → `buildSplineTable` (synthetic `b380` descriptor bytes → 361 × vec4 table, blended by `b300` then normalized through `NORM_A`/`NORM_B` and `tanh`) → `runKernel` (8 iterations × 8 stored vec4s, matching the `0x400`-stride store layout of `FUN_000045c0`, then temporally smoothed) → per-row B-spline evaluation over 28 control points into the texture.

Constants in this file are not arbitrary: `PS3.TABLE_ENTRY_COUNT` (`0x169`), `STORE_OFFSETS_BYTES`, `OUTPUT_STRIDE_BYTES`, `R37_WORDS`, the `19 * (word >> 4) + (word & 0xF)` index math, and `NORM_A`/`NORM_B` all come from traced addresses. If you change them, reconcile with `SPLINE_REVERSE_ENGINEER.md` (and update that doc) rather than tuning them as free parameters.

`settings.rePipelineBlend` cross-fades each control point between the reverse-engineered core and the older hand-tuned "legacy" wave sum, so `0` reproduces the guesswork look and `1` is pure RE pipeline. The `b300`/`b380` inputs are synthesized from UI settings because real runtime payloads have never been captured — that is the known gap for 1:1 output. `spline.js` stashes the pipeline's intermediates on `window.__PS3_REVERSE_STATE` each frame for console inspection.

### Settings and UI

`settings-panels.js` generates panels by **introspecting the settings objects**: every finite numeric key becomes a slider, keys whose meta says `type: 'select'` become a dropdown, and keys missing from the meta map fall back to an inferred ±2× range. It snapshots the settings object at creation time to implement per-row Reset, and mutates the live object in place — renderers read `settings.*` fresh on every frame, so no re-initialization or event wiring is needed.

Consequences when adding a knob:

- A new numeric key in `SPLINE_SETTINGS` / `PARTICLE_SETTINGS` gets a slider automatically; add a matching `*_SETTINGS_META` entry or the range will be nonsense.
- Wiring it to a shader needs three edits in the renderer: the `uniform` declaration in the GLSL string, the `uloc` lookup in the `waveU`/`ptU` map, and the `gl.uniform*` call in `render`.
- Pipeline-only knobs (the `re*` family, `band*`, `travel*`) need no shader change — they are read inside `spline-reverse.js`.

`particles.js` rebuilds its seed buffer whenever `settings.count` changes; its motion is entirely procedural from three per-particle random seeds, with no CPU-side simulation state.

### `dds/` — gradient extraction tool

Standalone browser tool (ES modules) used to produce the month presets. `dds-reader.js` parses DDS (DXT1/3/5 and masked uncompressed formats) in pure JS; `gradient-fit.js` brute-forces the gradient angle and runs per-channel linear regression to fit a 2D linear gradient, reporting RMSE; `export-code.js` emits JS preset source. The exported record shape (`width`/`height`/`rmse` included) does not match what `background-gradients-*.js` actually stores (`angleDeg`, `colorStart`, `colorEnd`), so exported output is trimmed by hand when pasted in. The `.dds` source files are firmware assets and are not in the repo.

## Conventions

- `'use strict'` at the top of every `ps3xmbwave/` file, with the logic files wrapped in an IIFE; two-space indent; single quotes in `ps3xmbwave/` (double quotes in `dds/`).
- Every `ps3xmbwave/` file except the two `background-gradients-*.js` data tables opens with a two-line header comment stating what it produces and which files consume it — keep this up to date when dependencies shift.
- Settings files are declarative only: no runtime logic in `*-settings.js`.
- `old-research/` is a frozen archive (uses regl + stats.js). Don't refactor it or import from it; it exists for reference only.
