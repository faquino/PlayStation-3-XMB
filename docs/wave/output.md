# What the console draws

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): the wave as `spline.elf` hands it to the
RSX, read out of RPCS3's frame captures and savestates with `tools/bench/wave-frames.py`. It is
what the implementation is measured against - see [The spline layer against the
console](implementation.md#against-the-console).

## The buffers

**Verified** from 23 RSX captures and 9 savestates.

- `lib/moyou/lines1.vpo` draws the wave in one indexed draw of 16384 vertices, the frame's fifth
  (draw 4) in every capture.
- The vertices sit in main memory, in one of two 512 KB buffers at io `0x500000` and `0x580000`,
  and the frames alternate between them: 14 captures draw the first, 9 the second.
- A savestate holds both, one after the other. The task's local store in the same savestate
  reproduces one of them exactly - see [The SPU task](spu-task.md) - so that one is the newer, and
  the other differs from it everywhere by a small, smooth step, a median of 0.003 in camera space:
  they are consecutive frames, and that step is the wave's speed.
- A vertex is 32 bytes: its position, then a second vector, four floats each.

## The mesh

**Verified.**

- 128 lines of 128 vertices, one line after the other, so vertex ix of line iy is record
  128 iy + ix. Along a line, column 0 is the right end.
- The index buffer (local memory, 32-bit, the same in every capture) draws triangle strips between
  neighbouring lines, 17 columns at a time with a primitive restart between strips: 8 strips for
  each of the 127 pairs of lines.
- The position is in clip space, already projected by the camera the particles use - see
  [Camera](../particles/shaders.md#camera). w is the view depth, and z = 1.0002 w - 0.20002 for
  every vertex. `lines1.vpo` passes it through untouched and has no matrix, so where the wave sits
  and how it turns are in the vertices.
- The second vector is the surface's normal in clip space, not normalised: the cross product of
  its derivative across the lines with its derivative along them - see [The
  surface](spu-task.md#the-surface).
- The texture coordinates sit in local memory and are the same in every capture. u is the line's
  index over 127. v fades the mesh out towards its edges: v = f(ix) f(iy), with
  f(i) = min(1, 10 min(i, 127 - i) / 127).
- The wave blends additively, with no depth test - see
  [How the two passes work](../particles/shaders.md#how-the-two-passes-work).

## The mesh is a B-spline surface

**Verified** - see [The surface](spu-task.md#the-surface). The wave is the bicubic B-spline surface
over 19 × 19 control points in clip space, sampled 8 times per span in each direction at
t = j × 16/127. It shows in the mesh itself, which is how it was first found:

- in both directions the vertices come in blocks of eight, evenly spaced within a block, and the
  step from one block to the next is 0.937 times the others (median over the lines of a capture),
  which is 1 - 7 × 16/127 = 0.118 of a span against 16/127 = 0.126;
- the normal's length is (127/16)² = 63.0 times the cross product of the steps per vertex (median
  63.006), since it is taken per span.

The 361 = 19 × 19 control points are the table upstream's reading found, `DAT_00009c00` - see
[Main table and normalization](../../SPLINE_REVERSE_ENGINEER.md#main-table-and-normalization) -
indexed 19 × row + column ([Index math](../../SPLINE_REVERSE_ENGINEER.md#index-math-inside-fun_000045c0)),
and `.rodata`'s [0, 1/6, 2/3, 1/6] is the cubic B-spline's basis at t = 0
([What r37 seems to be](../../SPLINE_REVERSE_ENGINEER.md#what-r37-seems-to-be)).

## The draw's uniforms

**Verified** from the captures and from RPCS3's decompilation of the program, the one vertex program
in its shader log that reads attributes 0, 8 and 9.

| Uniform | Register | Parameter |
|---|---|---|
| internal constant 2 | c[464] | none |
| `_MipmapBias` | c[465] | `LINE1.mnu: MIPMAP BIAS` |
| `_Brightness` | c[466] | `LINE1.mnu: BRIGHTNESS` |
| `_Fresnel` | c[467] | `LINE1.mnu: FRESNEL` |

The three values move with the parameter sets, by the same factor as the particles' - see [Themes
blend over hours](../particles/day-cycle.md#themes-blend-over-hours).

The program passes the position and u through. Let e be the position normalised and n the normal
normalised. The program works out:

- m = |e · normal| / |position| × `_MipmapBias`, with the normal as it comes, so m grows with the
  cell's size;
- TEXCOORD0 = (u, m), and TEXCOORD1 = (`_Fresnel` m, `_Brightness` m, |e · n| m, v);
- e reflected about n (using c[464]), written to an output the fragment program does not read.

What the fragment program makes of them, with its `_Stripes` and `_FresLUT` textures and the
embedded `_Spacing` and `_Thinness`, is for the shading pass.
