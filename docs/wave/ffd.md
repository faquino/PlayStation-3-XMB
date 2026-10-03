# The lattice: a fragment program on the GPU

Part of the [wave notes](../../WAVE_REVERSE_ENGINEER.md): where the deformation's lattice - see
[The lattice](inputs.md#the-lattice) - comes from. It is drawn every frame by `lib/moyou/ffd_shader1.fpo`
into a 128 × 1 target, which the PPU reads back the next frame.

**Verified** in all nine savestates: the formula below, taken one step of the clock earlier than
the program's live `_Time`, gives every one of the lattice's 539 points to 5e-5.

## The draws

Every frame capture draws, before the wave:

- draw 2, `ffd_shader1.fpo`, a quad over a 128 × 1 target: the lattice at the time;
- draw 3, `ffd_alpha_blend.fpo`, which writes `_TexA` + (`_TexB` - `_TexA`) × `_Alpha` into the
  target the PPU reads back, `_TexA` being draw 2's lattice and `_TexB` the one [the crossing
  over](#the-crossing-over) leaves behind.

`_Alpha` is 0 while no crossing over runs, so draw 3 passes draw 2's lattice through. It reads 0
in every capture.

`LINE1.mnu`'s `FFD SHADER` picks the program from a table of four (`0xa0f28`, the index held to
3), which the renderer's set-up fills with `ffd_shader0` to `ffd_shader3` in that order and loads
`ffd_alpha_blend` beside (`0x570f8`). Every set has it at 1, so the other three never run, and
RPCS3's cache holds none of them. All four take `_Time` and `_UVW` and nothing else.

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
of 2. The clock goes back to 0 past 10, so T goes back to 0 past 100, about every 14 minutes at
that `TIMESTEP`. The lattice does not jump when it does: it crosses over.

## The crossing over

**Verified** in the code. The lattice is drawn by an object of its own, at the lines object's
+0x00 - see [The object](lines.md#the-object). Its +0x0c is the program drawn now and +0x10 the
one crossed over from, +0x14 the old lattice's share, +0x18 a flag, and +0xb4 and +0xb8 the time
the lattice is drawn at and the old time.

Each frame, after the lines' steps, `0x4c4e4` hands `0x4a220` ten times the clock:

1. the old time moves on as far as the new one has, and the new time becomes the one handed over;
2. the program draws the lattice at the new time;
3. while the share is above 0, the old program draws it again at the old time into a second
   target, and the share loses 0.005;
4. `ffd_alpha_blend` mixes the two, `_Alpha` being the smoothstep of the share before it lost its
   step, 3s² - 2s³.

Setting the lines' clock (`0x4b6a4`) sets the lattice's time too, and starts a crossing over
(`0x47af0`): the old time takes the time the lattice was last drawn at, the new one the clock's
value, the share 1, and the old program is the one drawn now. So when the clock goes back to 0,
the lattice is drawn at both times, the old one carrying on past 100, and moves from the one to
the other over 200 frames, 3.3 seconds at 60 frames a second. A change of `FFD SHADER` does the
same between two programs (`0x480ec`, from the parameter's copy at `0x2a204`), and one that comes
during a crossing over keeps the mix as it stands and crosses over from that, the flag set.

The reset (`0x4e624`) sets the clock twice, to a time that goes with its state and then to 0,
and then calls the crossing over off: the share and both times to 0 (`0x4eae0`). Nothing crosses
over as the lines start afresh, and the state's time goes nowhere.

Every savestate agrees, its object read beside its lines: the share is 0, the program 1, the new
time ten times the clock and the old time equal to it, as only a run that has not passed 10 since
the reset leaves them - one that had would leave the old time 100 ahead.
