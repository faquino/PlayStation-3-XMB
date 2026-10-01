# PlayStation 3 XMB particles: reverse engineering notes

The goal is a faithful reimplementation of the XMB sparkles, including how they react to the
Sixaxis and to icon navigation. What is still open is listed under [Still missing](#still-missing).

Everything here comes from firmware 4.93 as installed in RPCS3, analysed with the tools in
[`tools/re/`](tools/re/README.md). **Verified** means checked against the firmware files or
against what RPCS3 recorded while running the XMB; anything else is marked as inferred.
**Modelled** marks what the implementation in `ps3xmbwave/` supplies until the code is found.

The notes are split by topic under [`docs/particles/`](docs/particles/), and this file is their
index. Read it first, then only the topics the task needs - see
[Keeping these notes](#keeping-these-notes).

## Topics

| File | What it covers |
|---|---|
| [`firmware.md`](docs/particles/firmware.md) | `lines.qrc`, `particles.elf`, the `.mnu` parameters, the PPU modules, and why the scene is `custom_render_plugin` |
| [`parameter-sets.md`](docs/particles/parameter-sets.md) | The override sets, what puts each one in (the boot sequences, the music), and how to tell them apart in a capture |
| [`day-cycle.md`](docs/particles/day-cycle.md) | The four windows the day's sets blend over, and the scene's clock, which Theme Settings' Colour stops |
| [`scene-events.md`](docs/particles/scene-events.md) | Who sends the scene its events; `PARTICLES_SPE.mnu`'s two factors, the fade on `_Color`, What's New's board |
| [`shaders.md`](docs/particles/shaders.md) | The two passes: Cg interfaces, run-time uniforms, the decompiled programs, the iridescent texture, the camera |
| [`spu-task.md`](docs/particles/spu-task.md) | `particles.elf`'s update step by step, the record it walks, the free-slot list, the vertex records |
| [`parameter-block.md`](docs/particles/parameter-block.md) | The 2304-byte block: its layout, how `0x31494` fills it, its two copies, the PPU's parameters with `PARTICLES_SPE.mnu` added |
| [`flow-grid.md`](docs/particles/flow-grid.md) | The 32 × 16 grid: how the task samples it, the icon wind that writes it, its decay, where the icons are |
| [`emitter.md`](docs/particles/emitter.md) | The wave the particles are born on, the emitter and its random numbers, the pool's commands, what the pool says |
| [`controller.md`](docs/particles/controller.md) | How D-pad steps and the Sixaxis reach the scene, and what they do to the field and the noise |
| [`implementation.md`](docs/particles/implementation.md) | What `ps3xmbwave/` models and why, and how it compares with the console |
| [`history.md`](docs/particles/history.md) | Superseded readings, closed investigations and dead ends, for reopening a question |

## Status

What `ps3xmbwave/` ports as verified and what it models, file by file;
[`implementation.md`](docs/particles/implementation.md) has the detail.

| File | Verified | Modelled |
|---|---|---|
| `particles-reverse.js` | The update task, steps 1 to 8. The pool layout, free marker, life bounds and camera. The parameter block: its layout, the values at every offset, and how the PPU fills it, the flow grid and the noise included. The emitter and its random numbers. The controller's response: the D-pad's turn and kicks, the motion, the shake detectors. `PARTICLES_SPE.mnu`, as the PPU applies it, and its first factor's animation. The particles' fade, `_Color`. The icons' layout on screen, measured. | Where the wave's vertices fall and how fast they move; how the icons move; how often the XMB repeats a held direction; the pool's first orientations, uniform as the console's are after many generations. |
| `particles.js` | Both passes, re-authored from the decompiled programs, fed with the `.mnu` values [`shaders.md`](docs/particles/shaders.md) maps to uniforms, `PARTICLES_SPE.mnu` applied. `color_control` as the programs use it, and `_Color` from the system's fade. | `_Gamma` held at 1, its value in every savestate. The iridescent texture comes from the fit. |
| `particles-themes.js` | The nine distinct theme sets, as their differences from the base. The boot sequences: which set each step puts in, when, and over how long. The music, and Theme Settings' Colour. | Which set applies when: [the day cycle](docs/particles/day-cycle.md), with a four-hour smoothstep between neighbours. The curve of the other blends, taken to be the same smoothstep. |
| `wave-surface-cpu.js` | | A CPU copy of the spline layer's wave vertex shader, so particles are born on the wave that is drawn. |
| `xmb-input.js` | What it hands over: steps with the XMB's four directions, and the four sensors in the PPU's units. | The rest: the mouse and keyboard stand in for the controller. |

## Still missing

The implementation models all of these:

- How the icons move, which sets the flow grid's values. The rule that writes the cells and where
  the icons sit are ported - see [The flow grid](docs/particles/flow-grid.md#the-flow-grid) - and
  the easing between places is modelled. The XMB moves them, not the scene.
- When the XMB sends a step. Every step's effect is ported - see [The
  controller](docs/particles/controller.md#the-controller) - and a held direction repeating every 8
  frames is inferred from the captures; how long the XMB waits before the first repeat is not known.
- The wave the emitter reads. The spline layer's wave is not the console's: flatter, slower, and
  with the console's 128 × 128 mesh laid over it by hand - see [Modelled
  choices](docs/particles/implementation.md#modelled-choices). That is the spline notes' open
  question, and it now sets the newborns' speeds.

Also missing:

- Which of the XMB's actions open What's New's board in which mode, and so switch the first
  `PARTICLES_SPE.mnu` factor on - see [What's New's
  board](docs/particles/scene-events.md#whats-news-board). The board's side, and the factor's
  animation, are traced.
- How the wave's renderer uses the fade `_Color` is sent with (`0x4fe2c`), so the spline layer can
  fade too - see [The particles' fade](docs/particles/scene-events.md#the-particles-fade).
- `proc_iridescent` exactly. It is a file of the firmware's resources, not generated at run time, so
  the implementation stands in for it with [the
  fit](docs/particles/shaders.md#the-iridescent-texture).
- `_Gamma`'s source - see [Uniform values at run
  time](docs/particles/shaders.md#uniform-values-at-run-time).
- The curve of the blend between sets, which runs in `qglbase`; what starts `anim_coldboot`, the
  opening with the logo; and who sends events 2 and 3, a game's boot and another's.

## Keeping these notes

- **Read narrowly.** This index first, then the topics the task needs. To find an address, a
  function or a parameter, search for it (`grep -rn 0x2dde4 docs/particles`) rather than reading
  every file. [`history.md`](docs/particles/history.md) is for reopening a closed question.
- **Write what is known now.** A finding goes into its topic, and a reading it overturns is
  corrected where it stands, not answered by a new section further down. How it was found (which
  captures, at what time, the leads that failed) goes in the commit message, and in `history.md`
  only if it is worth keeping beside the notes.
- **Close the loop here.** When a question opens or closes, update [Status](#status) and
  [Still missing](#still-missing) in the same commit.
- **Retire what is superseded.** A reading that no longer holds leaves its topic; git keeps it. A
  dead end that would save someone the search gets a line under
  [Ruled out](docs/particles/history.md#ruled-out).
- **Mind the size.** Keep this index under 8 KB and each topic under 15 KB. A topic that outgrows
  it is split by subject, and the new file goes into [Topics](#topics).
- **Don't restate the code.** Constants and their addresses are commented in `ps3xmbwave/`, and
  the bench's figures live only in `implementation.md`, replaced when it runs again rather than
  added to.
- **Methods go with the tools.** How to read savestates and captures, and how to get RPCS3 where
  a reading needs it, is in [`tools/re/README.md`](tools/re/README.md).
