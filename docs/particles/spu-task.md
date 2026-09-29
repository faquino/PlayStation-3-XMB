# The SPU update task (`particles.elf`)

Part of the [particle notes](../../PARTICLES_REVERSE_ENGINEER.md).

**Verified** from the disassembly of `particles.elf` (`tools/re/spu_disasm.py`). Which `.mnu` value
fills each parameter offset is verified too, in the PPU code that writes the block - see
[How the block is filled](parameter-block.md#how-the-block-is-filled).

## What it does and does not do

`particles.elf` only updates live particles. It integrates their motion, ages them, spins
them, kills them, and writes the vertex records the shaders read. **It never creates a
particle.** Several things point that way:

- its only random number generator feeds a per-frame noise force;
- no code writes a new particle into a free slot;
- `main` hands the batch machinery a single callback, the update at `0x6ed0`.

Emission, the flow grid and the input-driven rotation are prepared by whoever fills its parameter
block: the PPU, in `custom_render_plugin` - see [The PPU
side](firmware.md#the-ppu-side-in-progress).

## Main loop (`main` at `0x80e8`)

For each 56-byte record in a list handed over by the PPU (one per particle system):

- GET 2304 bytes from the address at `+32` into `0xb200`: the parameter block, **P** below;
- GET 16 bytes from `+20` into `0xb000`, and PUT them back at the end: persistent state;
- process the pool in chunks of 512 particles (24576 bytes), 64 particles per update call;
- PUT 128 bytes from `0xb100` to `+28`, and 1024 bytes to `+44`;
- PUTF a 4-byte completion flag to `+36`.

A pool record is 48 bytes: position xyz plus life in w (0 to 1), velocity xyz plus aging
rate in w, and a rotation quaternion. **A free slot has position.w = -666.**

## The task's record

**Verified** from the resting savestate. The record the task walks holds the addresses its main
loop uses:

| Offset | Value | What the task does with it |
|---|---|---|
| +0 | `0x2046a900` | the pool |
| +4 to +16 | `0x20482980`, `0x800`, `0x204a1700`, `0x800` | not traced |
| +20 | `0x200df890` | GETs, and PUTs back at the end, the 16 bytes of persistent state |
| +28 | `0x200dfe00` | PUTs 128 bytes from LS `0xb100` |
| +32 | `0x200def80` | GETs the 2304-byte parameter block |
| +36 | `0x60300810` | PUTF of the completion flag |
| +40 | 1 | |
| +44 | `0x204c1800` | PUTs 1024 bytes |
| +48, +52 | `0x400`, `0x80` | 1024 and 128, the sizes of those two PUTs |

## The free-slot list

**Verified from the SPU side: emission goes through a free-slot list.** The 16-byte
state block holds the main-memory address of a list of free slots and its length. The
task:

- brings the list into local store;
- appends every slot it frees during the update;
- writes the list and the state back.

So the PPU writes new particles straight into slots taken from that list, and never
needs the -666 marker. No module contains -666.0f, as a float or as an integer
immediate. The PPU side agrees: it takes the list's last slot - see
[The emitter](emitter.md#the-emitter).

## Per live particle (`0x6ed0`)

1. **Flow grid.**
   - `g = M1 · (pos, 1)`, with M1 at P+1856.
   - Sample the grid of vectors at P+128 bilinearly at g (`FUN_000068e0`, `FUN_00003cb0`).
   - Bring the result back to world space: `flow = M2 · (sample, 0)`, with M2 at P+1792.
2. **Noise:** `n = r · P[2212] + P[2192]`, where r is a random vector.
   - Its three components come from three generators, one per axis:
     `s = s · 16807 mod 2³²`, value `asfloat(0x40000000 | s >> 9) − 3`, uniform in [−1, 1).
   - The seeds are reset every frame to 0x98756161, 0x21324889 and 0x82181158
     (`FUN_00004978`). So the k-th live particle processed gets the same vector every
     frame: a near-constant drift per particle rather than Brownian motion. It only
     changes when particles ahead of it in the pool die or are born.
3. **Force:** `F = P[0].xyz + n + flow · P[2208]`.
4. **Field rotation.**
   - `vel += (c + R · (pos − c) − pos) / dt`.
   - c is the point at P+2096.
   - R is the matrix at P+2112, rebuilt every frame from the rotation vector at P+2176
     (`FUN_000048b8`): its length is the angle and its direction the axis
     (`FUN_00004688`, vectormath's rotation). A vector shorter than 1e-5 gives the
     identity, so a turn slower than 1e-5 radians a frame does not happen at all.
5. **Integration:** `vel += (F − P[16] ⊙ vel) · dt`, then `pos += vel · dt`, with
   `dt = P[2224]`. These are vec4 operations, so life (pos.w) advances by the aging rate
   (vel.w).
6. **Spin.**
   - `ω = (sin(2π·0.37·life), cos(2π·0.17·life), cos(2π·0.31·life))`.
   - Then `q += ½ (ω ⊗ q) · P[2220]/60`, and q is renormalised.
   - Sine and cosine are the SPU SIMD math library's `sinf`/`cosf`. The two differ only by
     the cosine's quadrant offset.
7. **Death:** life ≥ 0.99999, or the position leaves the box [P+2048, P+2064], which is
   `_LifeBounds` in the shader. The slot becomes free.
8. **Output** (32 bytes):
   - `(pos.xyz, alpha)`, with `alpha = min(life, 0.02) · 50 · (1 − max(life − 0.94, 0) · 16.6667)`;
   - then q as four halves;
   - then the unused old position.

Cross-check with the captures: alpha is exactly 1 for life in [0.02, 0.94], 92% of a life,
and exactly 92% of the captured particles have w = 1.

The block these steps read is laid out, value by value, in
[The parameter block](parameter-block.md#the-parameter-block-read-out-of-a-savestate).

## The particle buffer

From the two RSX captures - see [Frame captures](shaders.md#frame-captures).

- The SPU writes one 32-byte record per particle into main memory. The RSX reads it with
  a vertex frequency divider of 4, so each record drives the four corners of a quad
  (primitive: quads). `uv0` is a separate static buffer of the four corners, repeated
  modulo 4.
- Record layout:
  - `+0x00`: position x, y, z and a fourth value w (4 × f32);
  - `+0x10`: rotation quaternion (4 × f16), unit length in every record;
  - `+0x18`: old position (4 × f16), zero in every record.
- 2028 particles in the first capture, 2041 in the second.
- In the first capture positions span x [-10, 10], y [-2.7, 4.3], z [-9.6, -2.4]. In
  both, w is exactly 1 for 92% of the
  particles and lower for the rest (5th percentile 0.60–0.67). It behaves like an opacity
  that drops at the end of a life (inferred).
