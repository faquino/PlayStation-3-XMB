# History: superseded readings, closed investigations and dead ends

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md). Nothing here is needed for everyday work:
the topics hold what is known now. Read it to reopen a question, or before following a lead that
may already be ruled out.

## Ruled out

- **The glare's textures fading to a black border.** Their CLAMP was read as the RSX's, which
  blends a texture's edge with its border colour, black. RPCS3 runs it as clamp-to-edge, and its
  screenshots under the music, bright up to the top right corner, are 27 to 33 levels brighter
  there than a black border gives - see [The glare](postprocess.md#the-glare).
- **The captures' y running down the screen.** Plotted beside a frame of a video recorded the
  same minute, a capture's wave looked upside down. It is not. In the captures the icons'
  category row sits at y = +0.463, at the top of the screen as in the video - see [Where the icons
  are](../particles/flow-grid.md#where-the-icons-are). The wave's tilt changes sign over time: two
  frames of that video, 25 seconds apart, tilt opposite ways.
- **`b380` as a descriptor list run by an interpreter** - upstream's [b380 and the descriptor
  executor](../../SPLINE_REVERSE_ENGINEER.md#b380-and-the-descriptor-executor). It is the
  deformation's lattice of 11 × 7 × 7 points - see [The lattice](inputs.md#the-lattice). What the
  code upstream called its executor, `LAB_00007b30`, does is not followed.
- **`b300` as sixteen scalar parameters** - upstream's [How b300 is
  used](../../SPLINE_REVERSE_ENGINEER.md#how-b300-is-used). It is the matrix from the wave's space
  to clip space, and the four helpers upstream traced multiply it by a point - see [The
  matrix](inputs.md#the-matrix).
- **`FUN_00003c68` as a normalisation** - upstream's [Main table and
  normalization](../../SPLINE_REVERSE_ENGINEER.md#main-table-and-normalization). It is the
  free-form deformation - see [The deformation](spu-task.md#the-deformation).
- **The table built on the SPU from `b380`** - upstream's [What is missing for perfect
  replica](../../SPLINE_REVERSE_ENGINEER.md#what-is-missing-for-perfect-replica). The table arrives
  by DMA from main memory, and the SPU only deforms and transforms it - see [The
  steps](spu-task.md#the-steps).
- **The second vector as a normal in camera space.** Against the mesh's own normal in camera
  space, its direction agrees only to a median |cos| of 0.63. In clip space it agrees to 1.0000 -
  see [The mesh](output.md#the-mesh).
- **The day cycle's mix of sets behind the bench's gap.** Run under one set, the page's wave sat a
  tenth lower and 0.4 deeper than the console's, which mixes four. Run under each source's own
    sets, from the reset, to its lattice time, it still does - see [Against the
  console](implementation.md#against-the-console).
- **The lines' steps behind their slower pace.** From the console's own start the steps give
  every savestate's speed and every capture's band; the pace was the start's, made then under the
  day cycle's values - see [The start](lines.md#the-start).
- **The noise drawn once a boot, and a pair of tables for the music.** The notes had the noise
  drawn afresh at each boot, and the music's captures binding the other pair of preexpose tables.
  The HDR renderer draws the noise every frame and flips both to their other copy each frame, the
  frame's parity picking the pair - see [The noise](postprocess.md#the-noise).
- **The passes after the wave as a gain on the wave's light.** The page stood a gain of 1.5 in for
  them, set by eye against a video. They lay the wave over the backdrop and expose the two
  together, taking 1/16 off first, so a faint light only shows where the backdrop has some
  already - see [The passes after the wave](postprocess.md).

## The spline layer, before the port

Until `wave-reverse.js`, the page drew upstream's port of its own reading of `spline.elf`,
`spline-reverse.js`: a 100 × 100 grid in clip space with no camera, moved up and down by a
256 × 64 texture the pipeline filled from inputs it made up, cross-faded with a hand-tuned sum of
waves. Against the console its band was half as tall (0.20 to 0.31 against 0.31 to 0.65 NDC), it
moved three times as slowly, and its vertices only moved up and down. The particles were born on it
through a modelled mapping that the port retired with it: a depth band of 7.77 to 9.47 fitted to
the pool's newborns, the 128 columns spread 1.55 times past the screen's edges, and the wave's
motion read 3.5 times faster (`WAVE_SPEED_GAIN`). Git keeps both, and the bench's figures as they
were on 1 October.
