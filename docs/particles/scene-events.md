# The scene's events: the factors, the fade and What's New

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): the commands the XMB sends the
scene, and what they move. How `PARTICLES_SPE.mnu`'s offsets are added under the two factors is in
[The parameters, as the PPU holds them](parameter-block.md#the-parameters-as-the-ppu-holds-them);
the sets the boot and music events put in, in [What puts each set
in](parameter-sets.md#what-puts-each-set-in).

## What moves the two factors

Both are animations the object runs towards a target over a
duration, easing from where they stand with a smoothstep, 3t² - 2t³ (`0x2b9b4`). They run on
the time the scene's update hands the object, `0x31494` moving them on once `0x31f44` has
applied them, and they count in seconds: the handler divides event 0's fade times, which arrive
in milliseconds, by 1000 before it starts the same kind of animation.

- **The first, events 11 and 12 of the scene's interface.** The scene registers an interface
  for the XMB (`0x4050`, through `paf`), and its third function, `0x15330`, takes an event, a
  sub-event and an argument. Events 11 and 12 run the same code: sub-event 2 takes the factor
  to 1 over 2 seconds (`0x2b6a8`), sub-event 3 back to 0 over 2 seconds, each from wherever
  the factor stands. At 1 the particles move 39% faster, their glare rises from 0.16 to 0.24,
  and `specular power` falls from 35 to 6, so a flake glints across a far wider range of
  angles. What's New's board sends event 11 - see [What's New's board](#whats-news-board).
- **The second, the video output.** The scene's resize method (`0x1b348`) stores the frame's
  width, height and aspect, passes them to the particle object, and then sets the factor at
  once (`0x1acb4`) by the height: 0 above 1079 lines, 0.5 above 719, 1 below. So on a 720p
  output `size middle` grows by a fifth and `global alpha` drops to 0.72, and on SD by two
  fifths and to 0.44: bigger, fainter particles where each covers fewer pixels.

Every capture was taken at 1920 × 1080, and all 23 with particles in them carry both factors at
zero: `glare`, `global alpha` and `size middle` sit exactly on the set blend, across rest,
navigation, music, start-up and the saved-data utility.

## Where the events come from

The same handler takes the XMB's other scene commands. All 211
modules of `dev_flash/vsh/module` are decrypted and searched: 27 name `custom_render_plugin`,
and every place they fetch the scene's interface is accounted for.

- event 0 is the menu. Sub-event 9 is the D-pad step: `explore_plugin`, the XMB's menu, sends it
  whenever the focus moves (`0x554e4`, through the interface it keeps at `0x2deec0`, from the
  focus handlers `0x592c8`, `0x5c908` and `0x5dc80`), and `xmb_plugin` sends it too (`0x2638`)
  - see [The controller](controller.md#the-controller). Sub-events 2, 3 and 7 are the scene's fade - see
  [The fade](#the-fade) - and 6 and 4 are Theme Settings' Colour and Date and
  Time Settings, which set the moment the day cycle shows - see
  [Theme Settings' Colour stops the clock](day-cycle.md#theme-settings-colour-stops-the-clock);
- event 1 is the cold boot (`page_coldboot`, `anim_coldboot2`, the cold-boot sounds), which
  `vsh.elf` sends with sub-events 0 and 5 (`0xcd628`, `0xcf31c`), and `explore_plugin` and the
  XMB's columns (`explore_category_*`) with 5;
- event 2 is a game's boot (`anim_gameboot`), event 3 another boot (`anim_otherboot`);
- event 4 is the music, and the scene sends it to itself from two callbacks it registers
  (`0x3184`): sub-event 2 (`0x16808`) takes in `override/music_1` unless it is in already, and
  3 (`0x1672c`) leaves it;
- event 10 comes from the time zone setting. `sysconf_plugin` sends sub-event 2 as the setting
  opens (`0x7fc1c`), 8 with the zone picked (`0x81ebc`), and 3 as it closes (`0x7fb88`), whose
  code names `override/black`;
- event 11 comes from What's New's board, below, and nothing sends event 12.

The music visualizer, `soundvisualizer_plugin`, drives the scene through the interface's first
two functions (`0xe690`, `0xe4b8`) rather than through the handler.

## The fade

**Verified.** Event 0 of the scene's interface fades the whole scene: one call (`0x1afdc`) starts
the particles' fade and the wave's renderer's alike, towards the same grey over the same time.

- sub-event 3 takes it to black and sub-event 2 back to the scene's brightness, each over the
  time its argument carries, in milliseconds, and each holds the scene's clock until that time has
  run - see [Theme Settings' Colour stops the
  clock](day-cycle.md#theme-settings-colour-stops-the-clock);
- sub-event 7 sets the brightness to 1 - 0.15 × its argument, 0 to 5, and fades to it over 1
  second. It is Theme Settings' Brightness, whose six labels are Normal and -1 to -5:
  `sysconf_plugin` sends it as the setting changes (`0x11110`) and keeps it in the registry
  (key 0x60), and `system_plugin` sends it as it applies the theme (`0x88f4`, `0x9340`). The
  scene has `system_plugin` dim the wallpaper by the same brightness too (`0x6b08`).

`system_plugin` sends sub-events 3 and 2 from two functions of its interface, +0x1c (`0x6db4`)
and +0x20 (`0x852c`), which also hide or show the theme's background pages. Their callers are
the modules that take the screen: the video player (200 ms), the web browser and video chat
(500 ms), SACD playback and `nas_plugin` (1000 ms out), the audio player (200 ms), the Store,
What's New's board (200 ms out, back at once) and others at 100 ms. When the theme's wallpaper
goes, `system_plugin` sends 3 with no time and then 2.

**The particles.** `_Color`, which both passes multiply their colour by, is an animation of the
particle object (`+0xd0`, written to B+0x1340 every frame by `0x31494`). A fade runs from where
`_Color` stands to (b, b, b, 0) or to zero with the factors' smoothstep (`0x2b658`, `0x2c1f8`) on
the frame's time, and one of no time lands on the next frame. The scene starts at brightness 1
(`0x4050`), and the three savestates read (1, 1, 1, 0).

**The wave and the backdrop.** The wave's renderer, the object that draws the backdrop and the
passes after the wave, keeps three animations of its own, one a channel (`+0x270`, `+0x290` and
`+0x2b0`, which `0x4fe2c` starts through `0x4fb8c`). Each runs from where it stands to the grey
sent, with the same smoothstep (`0x453ac`), and one of no time lands at once. Each frame moves
them on by the frame's time and keeps them as a colour (`+0x260`, `0x56f1c`) before the backdrop
is drawn, and `BACKGROUND.mnu`'s four colours reach the composite multiplied by it (`0x4fec8` to
`0x50000`) - see [The composite](../wave/postprocess.md#the-composite). So the backdrop and the
wave's light fade with the particles, ahead of the tone curve. The animations start at black
(`0x4fb54`). Every capture taken at Normal has them at 1, and the one taken at -3, at 11:38 on 3
October, has them and `_Color` at 0.55.

## What's New's board

**Verified** in `wboard_plugin`, the board behind What's New, the first item of the Game,
Video, TV and PlayStation Network columns (`seg_welcome`, `sel://localhost/welcome?type=...`
in the columns' XML). The board registers an interface whose first function (`0x3330`) opens
it with a word of flags (`0x1038c`, `0x1016c`). Opening builds the list page (`expage_wblist`)
and a dimmer, then goes by the flags' second hex digit:

- 0, 1, 2 or 4 (`0xf320`): the board puts a picture behind the menu - What's New's
  (`cinfo-bg-whatsnew.jpg`) for 0 and 4, the Store's for games for 1 and for video for 2, each
  with an SD version - and has `system_plugin` hide the theme and fade the particles' `_Color`
  to zero over 200 ms (the function at +0x20 of its interface, `0x852c`, which sends event 0,
  sub-event 3). The first factor does not move.
- Any other value: it sends event 11, sub-event 2 (`0x102d8`), and over 2 seconds the particles
  speed up and glint.

Closing the board (`0x104e8`) always sends event 11, sub-event 3, taking the factor back to 0
over 2 seconds from wherever it stands, and if the board had faded the theme and `_Color`, it
brings them back at once (`0x10980`). Which of the XMB's actions opens the board with which
flags is not traced: they come from its caller.
