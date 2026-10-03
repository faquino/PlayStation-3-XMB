# Parameter sets: the overrides and what puts them in

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): the sets the particles'
parameters come from, what puts each one in, and how to tell them apart in a capture. The day
cycle's windows, and the clock that walks them, are in [the day
cycle](day-cycle.md#themes-blend-over-hours).

## Theme overrides

Each `override/<theme>/PARTICLES.mnu` is a complete parameter set. Differences from the base:

| Theme | Changes |
|---|---|
| `night` | `far focus_dist` 4.09678 |
| `day` | `size middle` 0.0464771, `far focus` 12.2008, `far focus_dist` 4.02735, `glare` 0.201367 |
| `yoake` (dawn) | `far focus` 12.0064, `far focus_dist` 4.02735, `glare` 0.180536 |
| `higure` (dusk) | `size middle` 0.0464771, `far focus` 12.6869, `far focus_dist` 4.02735, `glare` 0.18748 |
| `black`, `music_1` | `size middle` 0.0464771, `far focus` 12.0064, `glare` 0.201367; `black` also `global alpha` 0 |
| `coldboot1/2` | as `black`, plus `emit vel mul` 3.7496 |
| `gameboot3/4` | 19 changes, including `delta time` 0.08; `gameboot4` also sets `global alpha` 0 |
| `welcome_1/2` | 31 changes, including `emit per frame` 70.5765 |

**The numbering is a sequence, not a duplicate.** `welcome_1` and `welcome_2` carry the same
`PARTICLES.mnu`, and so do `coldboot1` and `coldboot2`, which is why only one of each is on the
particle side of `scene-themes.js` - but their other files differ, so the console is walking a
chain of stages. `welcome_1` opens at a 158.7 degree field of view with a backdrop colour of (0.34,
1.16, 10); `welcome_2` closes at 81.24 with (0.12, 6.24, 8.93). Both run `EXPOSURE` 3.404 against
the base 1.05. `gameboot1` to `gameboot5` walk from the wave alone through the backdrop alone and
two stages with nothing lit - the third and fourth being the ones that touch the particles, the
fourth with `global alpha` 0 - and back to the wave alone.

## What puts each set in

**Verified** in `custom_render_plugin` and its own `custom_render_plugin.rco`. The scene changes
set on animation events. Its `.rco` holds four animations whose steps fire `native:/anim_...`
events, and a table at `0x9cbc0` maps each event to a handler, which applies an
`override/<set>` to each of the scene's layers with a blend time (`0x39728`), a smoothstep from
where the parameters stand - see [How one set blends into
another](day-cycle.md#how-one-set-blends-into-another). Read from the `.rco`, with the fades of the
logo left out:

| Animation | Started by | Steps |
|---|---|---|
| `anim_coldboot2` | event 1, sub-event 0, which `vsh.elf` sends | BootBG2 at 0; NormalBG2 at 4 s; ShowGUI at 5.5 s; Finished at 10 s |
| `anim_coldboot` | nothing in the code | BootBG1 and NormalBG at 0; ShowGUI at 5.5 s; Finished at 10 s |
| `anim_gameboot` | event 2 | BG2 at 0; BG3 at 0.5 s; Finished at 2.8 s |
| `anim_otherboot` | event 3 | BG3 at 0; BG4 at 0.2 s; Finished at 0.5 s |

And what the handlers apply:

| Event | Set | Blend |
|---|---|---|
| coldboot BootBG1 (`0xfa38`) | `coldboot1` | at once |
| coldboot BootBG2 (`0x110dc`) | `coldboot1` at once, then `coldboot2` | 3 s |
| coldboot NormalBG, NormalBG2 (`0x11bbc`, `0x11b20`) | the day cycle's set (`0x11600`) | 7.5 s |
| gameboot BG2 (`0xf440`) | `gameboot2` | 0.25 s |
| gameboot BG3 (`0xf210`) | `gameboot3` | 1.25 s |
| otherboot BG3 (`0xeb28`) | `gameboot3` | 0.2 s |
| otherboot BG4 (`0xe8f8`) | `gameboot4` | 0.3 s |

So:

- **`black` is where the scene starts.** Its start-up (`0x11d68`, in the plugin's vtable after
  `0x4050`) applies `override/black` at once, and right after it puts the cycle's set in over 5
  seconds - see [Theme Settings' Colour stops the
  clock](day-cycle.md#theme-settings-colour-stops-the-clock); how the two combine runs in `qglbase`.
  The cold boot then takes it to `coldboot1` at once and, 4 seconds in, over 7.5 seconds into the
  cycle - the opening the captures show, since `coldboot1` and `coldboot2` carry the same
  `PARTICLES.mnu`. Event 10's code names `black` too.
- **Launching a game** takes the particles to `gameboot2` in a quarter of a second and, half a
  second in, to `gameboot3` over 1.25 seconds - `delta time` 0.08, nine times the base - until the
  game takes the screen at 2.8 seconds. **Other content** goes to `gameboot3` in 0.2 seconds and to
  `gameboot4`, with `global alpha` 0, in 0.3 more.
- **Nothing applies `bright`, `welcome_1`, `welcome_2` or `initial_setting` in 4.93**: they are
  loaded with the rest (`0x388b8`) and named nowhere else. Neither does anything fire the handlers
  for gameboot BG1, BG4, BG5 and MoyouZoom (`0xf6c8`, `0xefe0`, `0xedb0`, `0xf8f8`), which apply
  `gameboot1`, `gameboot4` and `gameboot5` over 0, 0.5 and 0.5 seconds: an older sequence the table
  still carries.
- `music_1` is event 4 - see [Where the events come
  from](scene-events.md#where-the-events-come-from) - and how it comes in and goes out is in [The
  music set](music.md).

`scene-themes.js` plays the three sequences on the particles and the wave, on top of the theme, as
`sequence` names them - see [Modelled choices](implementation.md#modelled-choices).

## The XMB starts by fading out of `coldboot1`

Five captures taken during start-up, across two boots, say what the opening transition is - and
it is not `welcome`. Fitting each capture's twelve colour channels against every pair of sets
lands on the same answer three times, to within 6e-7, which is float noise:

| Capture | Blend | Factor | Particles alive |
|---|---|---|---|
| 18:21:00 | `coldboot1` into the cycle's set | 0.458315 | 492 |
| 18:21:07 | same | 0.842647 | 1317 |
| 18:22:52 | same | 0.996244 | 2019 |
| 18:23:04 | settled | 1 | 2022 |
| 18:23:18 | settled | 1 | 2004 |

The particles' `glare` agrees on where it comes from: 0.201367 in the first two, which is
`coldboot1`'s value where the cycle at that hour would be holding `higure`'s 0.18748 - and
0.18748 exactly in the last two. It holds the coldboot value through the first two because what
the backdrop measures there is the approach to `coldboot2`, whose particles are `coldboot1`'s: the
wave's uniforms put those captures 61 and 184 frames after `BootBG2` - see [How one set blends
into another](day-cycle.md#how-one-set-blends-into-another). In the third, 0.188132 is 95.3 per
cent of the way to `higure`'s, where the backdrop and the wave are at 96.3.

**And the pool fills from empty.** The draws carry 492 particles, then 1317, then 2019 and
about 2020 from there on - 73, 205 and 405 of the lines' steps after the reset, by the lattice's
time, where the page's pool, emptied as its start begins, holds 444 to 524, 1286 to 1449 and about
2030 over three seeds. The console opens the XMB with nothing in the air and lets emission
fill it; `ps3xmbwave/` instead pre-warms 300 steps on its first frame, so the page opens full.
That is a deliberate difference, not a missing piece.

RPCS3 boots `vsh.self` directly, so what these captures see is the tail of the console's own
boot: the XMB coming up out of the `coldboot` sequence. Nothing in 4.93 applies `welcome_1` and
`welcome_2` - see [What puts each set in](#what-puts-each-set-in).

**The `gameboot` path is closed under RPCS3**, which cannot launch a game from the XMB, so
neither the boot sequence nor the return from it can be captured there. Every value of those
sets is already read out of the `.mnu` files, and the order and timing are now read out of the
scene's `.rco` - see [What puts each set in](#what-puts-each-set-in).

**Two other screens leave the set alone.** The first-run wizard does not run this scene at all, and
the XMB that comes up after it opens from `coldboot1` like any other; the saved-data utility keeps
the running set, so the way it dims the icons and defocuses the backdrop happens outside
`lines.qrc`. The captures that show it are in
[history](history.md#the-first-run-wizard-the-saved-data-utility-and-the-welcome-sets).

`tools/re/whichset.py` does this matching, for any capture: it fits `BACKGROUND.mnu`'s four
colours against every pair of sets and reads the particles' `glare` beside them.

## Telling the sets apart in a capture

Since a capture carries those colours as vertex constants and the particles' `glare` inside the
microcode, these numbers name the set on screen, or the pair being crossfaded:

| Set | colour 1 | colour 4 | `FOVY` | `COLOUR SHADER` | `EXPOSURE` | `glare` |
|---|---|---|---|---|---|---|
| base | 1, 1, 1 | 0.925, 0.923, 0.923 | 71.85 | 0 | 1.05 | 0.159705 |
| `yoake` | = base | = base | 71.85 | 0 | 1.1 | 0.180536 |
| `day` | = base | = base | 71.85 | 0 | 1.05 | 0.201367 |
| `higure` | = base | = base | 71.85 | 0 | 1.2 | 0.18748 |
| `night` | = base | = base | 71.85 | 0 | 1.41 | 0.159705 |
| `music_1` | 0.579, 0.435, 0.472 | 0.5, 0, 0.5 | 83.2 | 1 | 1.51 | 0.201367 |
| `black` | 0, 0, 0 | 0, 0, 0 | 72 | 0 | 1.41 | 0.201367 |
| `bright` | = base | 0.925, 0.924, 0.924 | 71.85 | 0 | 1.356 | - |
| `initial_setting` | 0, 0, 0 | 1, 0.9995, 0.9995 | 72 | 0 | 1.41 | - |
| `coldboot1` | 0.0021 grey | 0, 0, 0 | 71.8 | 0 | 1.64 | 0.201367 |
| `coldboot2` | = base | = base | 71.85 | 0 | 1.05 | 0.201367 |
| `gameboot1` | 0.0021, 0.0022, 0.0023 | 1.012, 0.952, 0.968 | 71.93 | 0 | 1.392 | - |
| `gameboot2` | 0.8, 0.8, 0.8 | 0, 0, 0 | 72 | 0 | 1.41 | - |
| `gameboot3` | 0, 0, 0 | 0, 0, 0 | 72 | 0 | 1 | 0.423566 |
| `gameboot4` | 0, 0, 0 | 0, 0, 0 | 72 | 0 | 1.41 | 0.423566 |
| `gameboot5` | 0, 0, 0 | 1, 0.9995, 0.9995 | 72 | 0 | 1.41 | - |
| `welcome_1` | 0.343, 1.157, 10 | 0.775, 1.814, 0.697 | 158.7 | 1 | 3.404 | 0.222198 |
| `welcome_2` | 0.123, 6.237, 8.927 | 0.228, 2.143, 10 | 81.24 | 1 | 3.404 | 0.222198 |

The day-cycle sets share the base backdrop, so only `glare` separates them - which is what the
cycle was measured with. Everything else has colours of its own, and the two `welcome`
stages are unmistakable: no other set puts a colour above 1, let alone at 10.

**Verified: overrides apply at run time.** The glare value the XMB fed `particles_second`
was 0.201367, an override value rather than the base 0.159705.
