# PlayStation 3 XMB Waves Recreation

## Click the image for a demo!

[![Demo of PlayStation 3 XMB Waves Recreation](demo.png)](https://linkev.github.io/PlayStation-3-XMB)

## About the project

WebGL-based recreation of the PlayStation 3 XrossMediaBar (XMB) background wave system.

This repo used to be mostly "looks close enough, ship it" shader guesswork (still archived in `old-research`), but the active implementation now lives in `ps3xmbwave` and is based on reverse engineering of `spline.elf`. I will eventually reverse engineer `particles.elf` as much as is possible with AI, unless someone smarter is reading this and would like to help!

It is still a beautiful mess. It is just now a slightly more informed mess.

This whole idea and project came to be because I wanted an easter egg in an internal DevOps tool I was developing at work and I thought why not open-source it and make it better for everyone, since I couldn't find any other similar projects or clones.

## Credits

While this is inspired by the official PlayStation 3 XMB background wave design, the major starting point was from this [CodePen by Alphardex](https://codepen.io/alphardex/pen/poPZNwE). All of the modern optimizations and cleanups have been made from this code and I must admit, it was mostly trial and error with Claude/Gemini/ChatGPT, I'M SORRY!

## Current Features (new implementation in `ps3xmbwave`)

- **Reverse-engineered wave**: `wave-reverse.js` builds the wave the way the console does - the PPU's simulation of 19 lines, the GPU's deformation lattice and the SPU's B-spline surface - into the console's own 128 × 128 mesh, and `spline.js` draws it with the XMB's line programs re-authored in GLSL. The firmware's parameter sets move it as they move the particles: through the day, the XMB's start, a game's launch and the music.
- **WebGL2 renderer**: Pure WebGL2 rendering path (background + spline mesh + particles), no framework dependency.
- **Day/Night monthly gradient presets**: 12 month presets with day/night variants are available in the UI, plus a fallback "Original (RGB Sliders)" mode. The default is `Auto (date and time)`, which does what the console does: it walks from this month's colour to next month's across the month and mixes the day and night tables by the hour.
- **Live control panels**: Separate spline and particle panels with per-setting sliders/selects and reset buttons.
- **Reverse-engineered particle system**: `particles-reverse.js` is a port of the SPU update task in the PS3's `particles.elf`, drawn in the two passes the XMB uses, re-authored in GLSL. The firmware's own parameter sets come with it: the day cycle runs by the clock, and the controller stand-in (mouse drag, pointer, arrow keys) stirs the field the way the real one does.
- **Reverse engineering notes included**: [SPLINE_REVERSE_ENGINEER.md](SPLINE_REVERSE_ENGINEER.md), [WAVE_REVERSE_ENGINEER.md](WAVE_REVERSE_ENGINEER.md) (an index into [`docs/wave/`](docs/wave/)), [PARTICLES_REVERSE_ENGINEER.md](PARTICLES_REVERSE_ENGINEER.md) (an index into [`docs/particles/`](docs/particles/)) and [BACKGROUND_REVERSE_ENGINEER.md](BACKGROUND_REVERSE_ENGINEER.md) (an index into [`docs/background/`](docs/background/)) document traced functions, memory ranges, and what is still modelled, each one saying which is which.

## Reality check (what still needs work)

- Day/night gradients are now integrated as actual presets, but they're not perfect like in the .dds files, so this issue is partially solved.
- Sparkles run the console's own update task now, and a headless bench (`tools/bench/particles.js`) compares their pool with one read out of a savestate. What is left is the PPU side that feeds it - the emitter and the flow field are still modelled - and they drift about twice as fast as the console's late in life.
- The wave's geometry is the console's own now, checked piece by piece against savestates. What is left is its look - some thirty post-processing passes run after it on the console and are not traced yet, so a single exposure stands in for them - and the pace of its lines, which run a little slower and lower than the console's.

## Local Development

1. Clone the repository:
```bash
git clone https://github.com/linkev/PlayStation-3-XMB.git
cd PlayStation-3-XMB
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run start
```

4. Open in browser:
- Main current implementation: `http://localhost:8000/ps3xmbwave/`
- Old implementation archive: `http://localhost:8000/old-research/`
- DDS gradient utility: `http://localhost:8000/dds/`

## Explanation of the files and folders

- `ps3xmbwave`: Current active implementation (reverse-engineering-based spline + particles + settings UI).
- `old-research`: Previous implementation and experiments (guesswork/prototyping era), kept for history and references.
- `dds`: "Poor man's gradient extraction" tool. Loads PS3 `.dds` files, solves best-fit 2D linear gradients (angle + colors), previews reconstruction, and exports JS preset code.
- `SPLINE_REVERSE_ENGINEER.md`: Reverse-engineering notes from Ghidra pass on PS3 spline code.
- `demo.png`: Preview image used in this README.

## How to Use (`ps3xmbwave`)

1. **Spline panel (top-right)**:
   - Leave the gradient on `Auto (date and time)`, or pick a preset (`MM Day` / `MM Night`), or go back to `Original (RGB Sliders)`.
   - Tweak the wave with `LINE1.mnu`'s own parameters - its springs, noise, placement, deformation and lighting - and `Exposure`, which stands in for the passes after it.

2. **Particles panel (top-left)**:
   - Tweak sparkle count, opacity, base size, variance, and speed.

3. **UI visibility**:
   - Each panel has a `Hide` button and a matching `Show ...` button.
   - There is no global fullscreen/hide-all hotkey in the new version right now.

## Technical Details (subject to change anytime)

### WebGL implementation (`ps3xmbwave`)
- **Rendering path**: WebGL2 only.
- **Layering**: Background gradient pass, the wave's mesh added on top, additive particles pass.
- **Wave source**: the console's 128 × 128 mesh, built on the CPU each frame by `wave-reverse.js` and uploaded as a vertex buffer.

### Reverse-engineered wave status
- **What is implemented**: the lines' simulation, the deformation lattice, the free-form deformation, the camera and the B-spline surface, with the line programs' shading, and the firmware's `LINE1.mnu` sets - see [WAVE_REVERSE_ENGINEER.md](WAVE_REVERSE_ENGINEER.md).
- **What is still missing**: the post-processing passes that follow the wave, and why its lines run slower than the console's.

## Contributing

Pull requests are very welcome. I WILL TAKE ANY HELP!

### Development Guidelines

As long as we move towards an identical replica of the XMB waves background, do whatever you want!

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments and a Thank You

- Everyone at Sony for the original PS3 XMB implementation, especially the people who worked on the spline and particles files, personally I think this is the best thing they have designed and I really love it!

- [Alphardex](https://codepen.io/alphardex/pen/poPZNwE) for the original code, seriously, this CodePen was the closest thing I could find to an XMB code starting point.

## Support

### [Open an issue on GitHub!](https://github.com/linkev/Playstation-3-XMB/issues)

## TODO

- Trace the post-processing passes that follow the wave, and find why the wave's lines run slower than the console's.
- Find what makes the sparkles drift twice as fast as the console's late in life; the notes list six causes already ruled out.
- Keep tuning wave calmness and flow cadence to better match real hardware captures. I realise the waves have sharp edges, when the real thing is like a water wave (just realised it!)
- Validate month day/night gradients against more references and tighten remaining color/angle drift.
- Trace the PPU side of the particles: the emitter and what the flow grid holds.
