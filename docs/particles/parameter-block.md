# The parameter block

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md): the 2304 bytes the task reads
every frame, how the PPU fills them, and the parameters it fills them from. What the task does with
each field is in [The SPU update task](spu-task.md#per-live-particle-0x6ed0); the grid inside the
block, in [The flow grid](flow-grid.md#the-flow-grid).

## The parameter block, read out of a savestate

**Verified.** An RPCS3 savestate (*File → Create savestate*, 0.0.42) holds the emulated
PS3's memory. The file is zstd-compressed around a `RPCS3SAV` stream, so Python's
`compression.zstd` opens it. Searching the 55 MB for `_LifeBounds` as a float triple, and
for the time step as three equal floats followed by 1, finds the block four times: twice
in main memory, one after the other, and twice inside the local store of an SPU thread,
where the task receives it at `0xb200`.

**The block is the task's whole 2304-byte transfer, and the savestate stores it shorter.**
A savestate leaves out every 128-byte line of memory that is entirely zero, and the
transfer has twelve of them between the drag and the rest - an empty flow grid, below - so
the savestate holds 768 of its bytes. A frame capture keeps memory whole, and there the
transfer is laid out exactly as the disassembly reads it: the force and the drag at +0 and
+16, the flow grid from +128, everything else from +1792. Dropping the all-zero lines from
a capture's transfer gives the savestate's layout byte for byte, at rest and while
navigating. The offsets below are a resting savestate's: past the drag, the transfer's are
1536 higher, which is how the task's own `P+2048` and the rest address them.

| Offset | Field | In the savestate | Source |
|---|---|---|---|
| 0 | constant force | (0, -6.8e-05, 0, 1) | `gravity`, alone: the wind goes to +656 |
| 16 | drag | (0.030551, 0.030551, 0.030551, 0) | `friction` |
| 256 | M2, grid vector to world | diag(15.9546, 8.97447, 1), translation (-7.9773, -4.48723, -7) | the camera: what it sees at a distance of 9 |
| 320 | M1, world to grid | its exact inverse | M2, inverted by a `qglbase` export |
| 384 | flow grid descriptor | a pointer, then 32 and 16 | the task points it at the grid, P+128 |
| 400, 448 | the same size as floats, then 32, 16, 31, 15 | | |
| 512, 528 | `_LifeBoundsMin` / `Max` | (-10, -10, -12) / (10, 10, 7) | not in any `.mnu`; a constant in `custom_render_plugin` |
| 560 | field centre | the origin | 2 units in front of the camera |
| 576 | field rotation | the identity matrix | the rotation vector's matrix |
| 640 | field rotation vector | zero at rest | the D-pad's turn and the shakes' |
| 656 | noise offset | zero | the wind: `wind dir` normalised, × (`wind scale` + 10 × `wind scale 10`), both 0 |
| 672 | flow strength, noise scale, `size middle`, spin rate | (1, 0.225311, 0.0536233, 2.74) | a constant 1; `brownian scale` plus two input terms, zero at rest; `size middle`; `spin time scale` |
| 688 | time step | (0.0088883, 0.0088883, 0.0088883, 1) | `delta time`, and the 1 that ages a particle once per frame |

The sources were first read off the values; the PPU code that writes them now confirms every
one - see [How the block is filled](#how-the-block-is-filled).

Reading that block settles several things:

- **The time step's w is 1**, so life advances by the aging rate once per frame. The
  particle count already implied it; now it is read from memory.
- **At rest the noise scale is `brownian scale` itself.** The two terms the PPU adds for the
  controller, one of them the `brownian` of `PARTICLES_UI.mnu` times a level, are zero then.
- **The flow strength is 1**, not something small.
- **The field turns about the origin**, and at rest its rotation vector is zero and its matrix
  the identity.
- **The flow grid is 32 x 16** over normalised coordinates, and the rectangle its matrices
  describe, 15.95 by 8.97, is exactly what the camera sees at a depth of 9 with a 53°
  field of view. That is the median depth of the captured particles: the grid is the
  screen, at the particles' own distance.

`size middle` sits next to the spin rate because the PPU puts it there with the rest, though none of
[the task's steps](spu-task.md#per-live-particle-0x6ed0) reads it. The grid's data, which the block
seemed not to hold, is the twelve lines the savestate leaves out - see [The flow
grid](flow-grid.md#the-flow-grid). The strings between the fields are recycled heap, left from
whatever used the memory before, in slots the task never reads.

## How the block is filled

**Verified** in `custom_render_plugin`. The particle object points at `+0x18` to a larger
object, B, laid out as the resting savestate shows it, with B at `0x200de580`: the first block
at B+0x100, its grid at B+0x180, the second block at B+0xa00, the persistent state at
B+0x1310, the field of view at B+0x1358, and the parameters at B+0x1360, with their second
copy at B+0x1490. Every frame, `0x31494` writes the first block field by field:

| Block | What `0x31494` puts there |
|---|---|
| +0, force | (0, `gravity`, 0), leaving w as it is |
| +16, drag | `friction` three times, leaving w as it is |
| +128, grid | the previous frame's cells, decayed in place by `0x2c588` - see [The flow grid](flow-grid.md#the-flow-grid) |
| +1792, M2 | what the camera sees at a distance of 9, at z = -7: 2 × 9 × `tanf`(fov / 2) = 8.97447 high, and the camera's aspect, 16 / 9, times that wide, 15.9546 |
| +1856, M1 | M2 inverted, through a `qglbase` export |
| +2048, +2064 | the life bounds, two vector constants at `0x940b0` and `0x940c0` |
| +2096, field centre | 2 units in front of the camera, which is the origin, written by `0x2d02c` - see [The controller](controller.md#the-controller) |
| +2112, field rotation | the rotation vector's matrix, or the identity below 1e-5, written by `0x2d02c`; the task rebuilds it the same way |
| +2176, rotation vector | zero, at the start of the update, then the D-pad's turn and the shakes' - see [The controller](controller.md#the-controller) |
| +2192, noise offset | a vector the object keeps at `+0x680`, plus `wind dir` normalised × (`wind scale` + 10 × `wind scale 10`) when `wind dir` is longer than 0.0001 |
| +2208, flow strength | the object's `+0xc0`: 1, from its constructor, and written nowhere else |
| +2212, noise scale | `brownian scale` + level × `brownian` + motion × `rshake brw`, below |
| +2216 | `size middle` |
| +2220, spin rate | `spin time scale` |
| +2224, time step | (`delta time` × 3, 1) |

The noise's two input terms:

- **The level** is a damped spring the object keeps at `+0x1d8`. Each frame its velocity
  becomes 0.6 times itself, less 0.004 times its position, plus an impulse, which is then
  cleared; the position moves by the velocity; and the level, at `+0x1d4`, is the position
  clamped to [0, 1]. The D-pad and the shakes write the impulse - see
  [The controller](controller.md#the-controller).
- **The motion** comes from `0x2c758`, which the update calls while a byte at `+0x1004` is
  set, as the constructor leaves it: the length of the newest of up to 16 vectors the object
  keeps in a ring at `+0x400`, times `rshake brw`, kept at `+0x604`. The vectors are how far
  the Sixaxis's accelerometer moved from one frame to the next.

A byte at `+0xb4` collapses both life bounds to zero for one frame when set, and is cleared
again: a way to kill every particle at once. **Nothing sets it**: the only code that writes it
is the constructor and `0x31494` itself, both clearing it.

## The two blocks

**The block the task reads is the second of two.** The first starts 2304 bytes earlier, at
`0x200de680`, and holds the same values - force, drag, rotation, time step - down to a grid
descriptor pointing at its own grid, `0x200de700`, which the second block carries too. The
savestate stores the pair 768 bytes apart, having left out their empty grids. That reads as the PPU
composing the first block and copying it whole into the second, and both halves are verified
now. `0x31494` writes the first block - see [How the block is filled](#how-the-block-is-filled) -
and the block object's submit, `0x5ddc8` (and its twin at `0x6213c`), runs the pool's commands
(`0x5cad0`) and then copies the first block into the second (`0x5ca00`, through the block's
field-by-field copy, `0x599bc`) before it goes on to the rest of its work and flips its double
buffer. So the task reads the block as the frame left it, with the frame's births already in the
pool, which is the order the implementation keeps with a single block.

## The parameters, as the PPU holds them

**Verified** from the same savestate. 96 bytes after the second block - past the persistent state
and the camera's vertical field of view, 0.925025 - come the values of `PARTICLES.mnu` and then of
`PARTICLES_UI.mnu`, in the files' order and with the hour's blend already applied (`size middle`
0.0536168 and `glare` 0.15973 at 22:55). A second copy follows 304 bytes later. The struct is not
the files word for word:

- `emit per frame` holds the integer **16** where the file says 16.6539;
- two zero words follow `aging variance`, and the integers 6 and 4 follow `brownian scale`;
- `spot pos` and `spot attn` are padded to four words each.

**Verified** in the code as well. `0x329a4` fills the second copy from the particle menu's values,
and `0x3288c` its `PARTICLES_UI` part, 232 bytes in. That is where the integer comes from: `emit per
frame` goes through `fctiwz`, which truncates it to 16. It also shows the word after the wind
direction, at +80, holding `wind scale` + 10 × `wind scale 10`, the scale the block's wind is built
with. The emitter reads the 16 as it is - see [The emitter](emitter.md#the-emitter).

**Verified: the first copy is the second plus `PARTICLES_SPE.mnu`.** Every frame the particle
object's per-frame method, `0x31f44`, copies the second copy over the first, 0x128 bytes. It then
adds to five of its fields the words at the same offsets of a third struct, at B+0x15c0, each
weighted by one of two factors the object keeps at `+0x140` and `+0x160`, both clamped to
[0, 1], and clamps the results:

| Field | Weighted by | Clamped to |
|---|---|---|
| `delta time` | the first factor | 1/300 to 1/12 |
| `glare` | the first factor | 0 to 1 |
| `specular power` | the first factor | 0 to 100 |
| `size middle` | the second factor | 0 to 90 |
| `global alpha` | the second factor | 0 to 1 |

The five fields are exactly the five names of `PARTICLES_SPE.mnu`, whose values - one of them
-29 for `specular power` - read as offsets rather than a set. **Verified** in three savestates:
the copies sit at B+0x1360 and B+0x1490 and the third struct at B+0x15c0, 0x130 bytes apart,
and the third holds `PARTICLES_SPE.mnu`'s five values at exactly the five offsets `0x31f44`
reads (`delta time` 0.00346295 at +0x38, `specular power` -29.3657 at +0x80, `global alpha`
-0.555603 at +0x9c, `size middle` 0.0218883 at +0xa0, `glare` 0.0832176 at +0xd8). Its other
fields hold values no file sets, which `0x31f44` never reads. No theme carries a
`PARTICLES_SPE.mnu` of its own. The clamps apply with the factors at zero too, and no set in
the firmware reaches them.
