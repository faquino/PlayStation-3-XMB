# The lattice: a fragment program on the GPU

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): where the deformation's lattice - see
[The lattice](inputs.md#the-lattice) - comes from. It is drawn every frame by `lib/moyou/ffd_shader1.fpo`
into a 128 × 1 target, which the PPU reads back the next frame.

**Verified** in all nine savestates: the formula below, taken one step of the clock earlier than
the program's live `_Time`, gives every one of the lattice's 539 points to 5e-5.

## The draws

Every frame capture draws, before the wave:

- draw 2, `ffd_shader1.fpo`, a quad over the target;
- draw 3, `ffd_alpha_blend.fpo`, which mixes two textures, `_TexA` and `_TexB`, by `_Alpha` (not
  followed).

`LINE1.mnu`'s `FFD SHADER` picks among `ffd_shader0` to `ffd_shader3` (inferred from the name).
Every set in the firmware has it at 1, and the other three are not in RPCS3's cache.

## The program

`ffd_shader1` reads a texel of `_UVW`, a 128 × 1 texture the renderer fills once (`0x493c4`): the
base lattice, 8 × 4 × 4 points at X = i/8, Y = j/4, Z = k/4. With T its uniform `_Time`, it writes

- x = 1.3 X² + 0.2 X - 0.15
- y = 0.24 (tanh(X - 0.5) + 1) (sin 2T + 3) e^(-0.0001 T) sin(7.85 X - 2.5 T - 1.25)
  + sin(0.25 T) / 2 + e^(-50 (X - 0.833333 (sin(0.1 T) + 0.2))²) + sin(T - 6.28 Z) / 8
- z = 0, w = 0

read from RPCS3's decompilation, with `tools/re/cgbin.py --fc-table` naming its constants. So the
lattice moves along X - a wave travelling along it, under an envelope that grows with X, plus a
bump whose place swings with sin(0.1 T) - and along Z only by sin(T - 6.28 Z) / 8. Nothing depends
on Y.

## What the PPU does with it

**Verified.** The renderer's per-frame code (`0x4a848`) takes the target's 128 points, multiplies
each by a vector at its +0x60 and adds one at its +0x80 - `FFD SCALE1` and `FFD OFFSET`, with w 1
- and keeps the result as the control lattice. `0x47b1c` then copies it into the 11 × 7 × 7 points
the task receives, index -1 to 9 along X clamped to 0 to 7, and -1 to 5 along Y and Z clamped to
0 to 3. That repeats the first control point once and the last twice, which makes the B-spline
volume reach its edges, and puts the count, 539, in the block's next word.

## The time

`_Time` follows ten times [the lines' clock](lines.md#a-step). In the savestate of 22:55 the clock
reads 0.438606 and `_Time` 4.38406, ten times the clock a step back, and the lattice in the task's
local store is the program's output a step before that, at 4.38206 - the target being read back a
frame late (inferred). Each step adds `TIMESTEP` × 0.001 to T, 0.12 a second at night's `TIMESTEP`
of 2. The lines' clock wrapping at 10 should take T back to 0 at 100, about every 14 minutes (not
checked).
