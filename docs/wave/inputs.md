# The inputs: what the PPU sends the task

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): the three blocks and three parameters
[`spline.elf`](spu-task.md) receives every frame, read out of its local store in nine savestates.
The grid and the matrix come from `custom_render_plugin`'s lines object - see [The lines](lines.md) -
and the lattice from a fragment program - see [The lattice: a fragment program on the GPU](ffd.md).

## What the job carries

**Verified** from `FUN_000053e0`. The job's quadwords, in order:

- the first holds the address of the buffer to write in its first word, `0x20900000` and
  `0x20980000` in turn, the grid's in its second and the matrix's in its fourth;
- the second holds the lattice's address in its first word;
- the next three are copied to `0xd590`, `0xd5a0` and `0xd5b0`, and are `LINE1.mnu`'s
  `FFD SCALE1`, `FFD SCALE2` and `FFD OFFSET`, each with w = 1. The day cycle's savestates read
  (5.67726, 1.00077, 1), (3.2, 1.2, 3) and (0, -0.469999, 0), and the one taken with a track
  playing reads `music_1`'s (5.13725, 1.00077, 1) and (3.2, 0.99579, 3.41782).

## The matrix

**Verified.** The 64 bytes at `0xb300` are a 4 × 4 matrix, stored as its four columns, that takes
the wave from its own space to clip space: the particles' projection and view - see
[Camera](../particles/shaders.md#camera) - times the wave's model matrix, which is

- a rotation by `ANG ROT` degrees about (`ANG X`, `ANG Y`, `ANG Z`) normalised,
- then a translation to (`POS X`, `POS Y`, `POS Z`),

with no scale. Taking the projection and view off leaves exactly that. In the savestates of the day
cycle the translation is (-8.2, -1.08844, -6.40286) and the rotation 10.007° about the base set's
axis, which is `night`'s `ANG ROT` of 10 with the blend from `higure` all but done. With a track
playing they are `music_1`'s, (-7.5, 0, -5.2) and 13.121° about its axis.

## The grid

**Verified.** The grid is the lines object's A0: 19 lines of 19 points, each line anchored at
x = 0 in column 18 and running out to x = 4 to 5.3 in column 0 - see [The lines](lines.md). The
savestate of 22 September at 22:55 holds it at `0x20401f00`, where the job points. Undoing the
matrix and the deformation on the local store's grid gives it back to within 1e-3, about a frame's
motion.

## The lattice

**Verified** in all nine savestates. The `0x2200` bytes at `0xb380` hold the deformation's
11 × 7 × 7 points, each (x, y, 0, 1), then their count, 539. They are drawn on the GPU every frame -
see [The lattice: a fragment program on the GPU](ffd.md) - and what the task receives is
8 × 4 × 4 control points with their edges repeated:

- every row of 11 carries the same x, -0.8516 to 5.7926 in the day cycle's sets, `FFD SCALE1 X`
  times 1.3 X² + 0.2 X - 0.15;
- y is a curve along x plus an offset that depends only on the row's last index, both moving;
- nothing moves in z, and nothing varies along the middle index.

Through [the deformation](spu-task.md#the-deformation), that makes x a fixed stretch of the line's
length, y the lines' own height plus the lattice's moving curve, and z the lines' own depth,
scaled. A line's start, x = 0, always lands at x = -2.59 in the wave's space, which is the curve's
start, -0.8087, times `FFD SCALE2 X`.
