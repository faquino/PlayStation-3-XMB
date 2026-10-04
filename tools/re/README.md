# Reverse-engineering tools

Python 3, standard library only, except `ppu_prx.py`, which needs capstone. They read
firmware files from **your own** PS3 firmware (for example an RPCS3 install) and write
everything they extract into `re-work/` at the repository root, which is gitignored.
Extracted firmware assets must never be committed.

| Tool | What it does |
|---|---|
| `qrc.py` | Lists and extracts Sony `.qrc` resource containers (`dev_flash/vsh/resource/qgl/*.qrc`). `--mnu-json` also converts the `.mnu` parameter files to JSON. |
| `spu_disasm.py` | Disassembles SPU ELF files (the SPURS tasks inside `lines.qrc`), with Ghidra-style `FUN_`/`LAB_` labels, the quadwords that `lqr`/`lqa` read, and the constants built by `ilhu`/`iohl`. |
| `spu_cache.py` | Matches RPCS3's SPU program cache (`spu-*.dat`) against an ELF: which of its code actually ran, and with `--since`, which code ran for the first time. |
| `cgbin.py` | Reads compiled RSX Cg programs (`.vpo`/`.fpo`): parameter tables, register assignments, and the uniform values the XMB set at run time, read from RPCS3's shader cache. `--fc-table` maps the `_fetch_constant(n)` of RPCS3's decompiled fragment programs to those uniforms and literals. |
| `rrc.py` | Reads RPCS3 RSX frame captures (`captures/*.rrc.gz`, Alt+C in the emulator): the draw calls of one frame, the vertex constants at each draw, and each draw's vertex buffers, decoded to CSV. `frame` lists the draws with their programs, the surface each writes, the textures it reads, its blend and its live uniforms. |
| `ppu_prx.py` | Loads decrypted PPU modules (PRX or executable), applies PRX relocations, finds the TOC, and disassembles with capstone. Also finds immediates, the code that reaches an address, the callers of each named import, and the variables a module imports and exports. Needs `pip install capstone`. |
| `whichset.py` | Names the parameter set an RSX capture was taken under, or the pair it was crossfading and how far along, by fitting the backdrop's four corner colours against every `override/`. Reads the particles' live `glare` from the same capture. |
| `readblock.py` | Reads the particle task's 2304-byte parameter block out of RSX captures, at the offsets the task reads it: force, drag, the field's rotation, the noise scale, and the flow grid's non-empty cells. |
| `coverage.py` | Finds where a PPU module sits in a savestate from the return addresses its stacks keep, and lists the module's call sites among them - which functions ran - and the ones only one savestate holds. So far only `vsh.elf` leaves any. |
| `savestate.py` | Reads a savestate's memory by the PS3's own addresses, through the bitmaps RPCS3 writes it with, and finds where a PRX's code and data were loaded, so that a module's globals and the objects they point to can be followed. |
| `nids.py` | Computes PS3 function NIDs from names and names a module's imports. |
| `month-fits.py` | Fits the backdrop's 24 month textures with cubics and writes `ps3xmbwave/background-months.js`, the fitted data the page draws the backdrop from. |

## Typical workflow

```bash
# 1. Extract the XMB wave and particle resources
python tools/re/qrc.py extract /c/opt/rpcs3/dev_flash/vsh/resource/qgl/lines.qrc --mnu-json

# 2. Disassemble the particle task
python tools/re/spu_disasm.py re-work/lines/spurs/particles/particles/particles.elf > re-work/particles.dis

# 3. See which of it ran in the emulator
python tools/re/spu_cache.py match <rpcs3>/cache/vsh/ppu-*-vsh.self/spu-safe-v1-tane.dat \
    re-work/lines/spurs/particles/particles/particles.elf --ranges

# 4. Shader interfaces, and the values the XMB fed them
python tools/re/cgbin.py re-work/lines/lib/particles/particles_quads.fpo --find-in <raw dir>
python tools/re/cgbin.py re-work/lines/lib/particles/particles_quads.fpo --runtime <raw dir>/<hash>.fp
python tools/re/cgbin.py re-work/lines/lib/particles/particles_quads.fpo --fc-table <raw dir>/<hash>.fp
```

`<raw dir>` is `<rpcs3>/cache/vsh/ppu-*-vsh.self/shaders_cache/raw`.

```bash
# 5. A frame capture: find the particle draw, then read its constants and buffers
python tools/re/rrc.py draws <capture.rrc.gz> --vpo re-work/lines/lib/particles/particles_quads.vpo
python tools/re/rrc.py consts <capture.rrc.gz> <draw> 455 13
python tools/re/rrc.py buffer <capture.rrc.gz> <draw> -o re-work/particles.csv
```

## Imported variables

A module reaches the variables it imports from another - `qgl_base`'s blend mode, two of
`paf`'s - through `lis`/`lwz` pairs the loader patches from the import table, not from the
relocations, so in the disassembly they read as small absolute addresses (`0x30(r9)` off
`lis r9, 0`). `ppu_prx.py <module> vars` lists the variables a module imports, with the
instructions patched with each one's address, and those it exports, with where each lives and its
first words - so, run on the exporting module, it gives a variable's starting value.

## Savestates

RPCS3 can save the emulated machine's state while the XMB runs (*File → Create
savestate*), into `savestates/vsh.self/*.SAVESTAT.zst`. The file is a zstd stream around
`RPCS3SAV`, which Python 3.14 opens with `compression.zstd`, and it holds main memory and
every SPU's local store. Searching the decompressed image for values you already know —
a parameter as a float, a vector as a triple — finds the structure that holds them, which
beats tracing the code that fills it. That is how the particle
[parameter block](../../docs/particles/parameter-block.md) and
[pool](../../docs/particles/emitter.md#the-pool) were read. Live fragment-shader uniforms
are in there too: the microcode keeps them inline, with each float's halves swapped, so
searching for the constants beside them finds their current values.

**The backdrop's uniforms were read that way** - see [What the uniforms
read](../../docs/background/uniforms.md). `cgbin.py` finds `back_colours0.fpo` among RPCS3's
cached shaders and maps its constants:

```bash
python tools/re/cgbin.py re-work/lines/lib/moyou/back_colours0.fpo --find-in <raw dir>
python tools/re/cgbin.py re-work/lines/lib/moyou/back_colours0.fpo --fc-table <raw dir>/<hash>.fp
```

and, for the live values, find that microcode in a decompressed savestate by a stretch of it that
holds no constant slots, then read the slots at the offsets the parameter table gives.
`whichset.py`'s `live_uniform` does that for one uniform.

**A frame capture carries the same uniforms, and does not hang the emulator.** Creating a
savestate of the running XMB tends to leave RPCS3 stuck and needing to be killed, while
Alt+C writes its capture and carries on. The capture holds the fragment microcode with the
same patched slots, so the reader above works on it unchanged - the particles' live `glare`
and the backdrop's `_MonthTime` both came back out of one - and `rrc.py` reads the vertex
constants beside it. Reach for a savestate only when main memory itself is what you need, like
the particle pool.

**A savestate leaves out every 128-byte line of memory that is entirely zero.** Values read
right, but a distance measured across empty memory comes out 128 bytes short for each line left
out - which is how the particle parameter block once read as a 768-byte structure, and how its
force once read as zero. Measure layouts in a capture, which keeps memory whole, or read the
savestate through `savestate.py`. Each mapping's bytes follow a bitmap of the lines kept, one byte
a kilobyte, and the user memory's mappings come first, in a section of their own, given their
addresses only in the list of locations after it (`vm::save` and `serialize_memory_bytes` in
RPCS3's `vm.cpp`). `savestate.py` reads both, so it gives the memory at any address, a line left
out reading as zero, and the address any byte of the file holds:

```bash
python tools/re/savestate.py <savestate> module re-work/vsh-modules/custom_render_plugin.prx
python tools/re/savestate.py <savestate> read 0x20094d10 0x20
```

A module's code and data load at addresses of their own each boot - `custom_render_plugin`'s at
`0xba0000` and `0xc40000` in one session, `0xb80000` and `0xc20000` in another - so a global is read
at the data's address plus its offset from the data segment's link address. That is how the scene's
layers were read: the scene object behind the global `0x9ff40`, and each layer's blend window -
see [The music set](../../docs/particles/music.md).

Finding one's way around a savestate's local store takes one correction. Searching for 64 bytes
of `particles.elf` at a known vaddr finds the copies of the task and gives each local store's
base in the file, and code and read-only data sit at that base plus their address; but every
all-zero line the file leaves out brings what follows 128 bytes closer. The task's own data
already sits 128 bytes early - the pointers its start-up stores at `0xb080` and `0xb180` read at
`0xb000` and `0xb100` - which is what once put the block at `0xb180` instead of the `0xb200` the
code loads it into.

`spline.elf`'s local store takes the same correction. Its code turns up twice: the copy with an
ELF header 256 bytes before the code is the file itself, in main memory, and the other is a local
store. There everything from `0x9b80` sits 128 bytes early, the zero line at `0x9b80` being left
out. The B-spline basis matrix the task builds at `0xd5c0`, `be2aaaaa 3effffff beffffff 3e2aaaaa`,
anchors the data. When two local stores hold the task, the one whose grid reproduces a wave buffer
is the one that ran last - see [The SPU task](../../docs/wave/spu-task.md).

**A savestate holds one step of a simulation, and the task downstream holds the frame before.**
The wave's lines object turns up by its 19 and 19 at +0x2c and the count 361 in its descriptors
at +0x40, +0xa0, +0xd0 and +0x160; its arrays follow it, the velocities 0x2d00 bytes early because
the two unused arrays before them are all zero. Their points before and after the last step and
their velocities after it check the integration, but not the forces, which need the velocity going
into the step. `spline.elf`'s local store supplies it: its grid, undone through the matrix and the
deformation, is the lines' grid a frame back - see [A step](../../docs/wave/lines.md#a-step).
Undoing a task's arithmetic that closely means reproducing its estimates too: until the
deformation's reciprocal estimate was fitted, its error of about 1e-4 made the forces look wrong by
several times the noise. And the closer the accumulator is to 1, the closer the frame back sits to
the step, so the check is sharpest in savestates with a low one.

**A savestate also remembers what code ran.** Stacks keep the return addresses of recent calls,
stale frames included, and `coverage.py` recognises the frames by their layout, places the module
by voting (each saved return address, paired with each `bl`, votes for a load address) and lists
the call sites. A relocatable module loads somewhere else each boot, and a relocated `lis`/`lfs`
pair in its code is no way to find out where: short sequences recur across modules, and a match in
the savestate can be another module's copy. The vote is checked instead - at the right address most
of the values that land in the code follow a `bl`, at a wrong one a tenth or so. In the savestates
taken so far it places `vsh.elf` and no PRX module at all - not even `xmb_plugin`, which runs all
the time and, at the load address its module info record gives, has no return address on the
stacks. So a module it does not place may still have run. Compare savestates from one session:
stale frames differ between boots.

**A savestate also says which PRX modules are loaded.** A loaded module keeps its module info
record in memory: attributes, version 1.1, a 28-byte name padded with zeros, then its TOC and the
bounds of its export and import tables. Searching for that shape lists the modules, and the export
table's address less its link address is where the module's code sits. That is how
`custom_render_plugin`, and not `qgl_gaia_app`, turned out to be the XMB's scene.

A capture also holds **the particle parameter block**, whole: `readblock.py` finds it by its life
bounds and reads it at the task's own offsets, the flow grid included. Captures accumulate, each one
carrying the blocks of those before it, so a single capture gives a handful of recent values - the
one its own memory map points at is current, and `readblock.py` marks the rest as old.

A capture also holds the wave's finished geometry: `draws --vpo .../lines1.vpo` finds it (draw 4
in every capture so far, 16384 vertices), and `buffer` writes position, uv and normal per vertex
to CSV. **A savestate holds both of the wave's buffers, a frame apart,** which a capture cannot
give. They are found by what the camera does to a projected point: z = 1.0002 w - 0.20002 at
every vertex. `tools/bench/wave-frames.py` extracts the wave from both kinds of file into
`re-work/wave-frames/`, naming each capture's set, for `tools/bench/wave.js` - see
[What the console draws](../../docs/wave/output.md).

**The lines' own start is in the module.** The reset copies 361 points from `0x97c18` and 361
velocities from `0x98d04`, three big-endian floats each, line by line - see [The
start](../../docs/wave/lines.md#the-start). `ppu_prx.py`'s `Prx(...).f32` reads them out of the
decrypted `custom_render_plugin.prx`; written as a JSON of `positions` and `velocities` into
`re-work/`, they are what `tools/bench/wave.js --start` takes.

**`ffd_shader1`'s live `_Time` dates a source.** Ten times the lines' clock a step back, it says how
many steps they have run since the cold boot reset them - see [The
time](../../docs/wave/ffd.md#the-time) - and `wave-frames.py` records it. A savestate holds one copy
of the program; a capture, as with the parameter block, also keeps the copies of the captures before
it in the session, and its own is the latest, so the largest. Within a change of set, the wave's
`_Brightness`, `_MipmapBias` and `_Fresnel`, which its draw carries as vertex constants, say how far
the blend had got - see [How one set blends into
another](../../docs/particles/day-cycle.md#how-one-set-blends-into-another).

**A capture's `preexpose_Noise` counts its frames.** The composite's unit 13 is drawn afresh each
frame from a counter that starts with the scene - see [The
noise](../../docs/wave/postprocess.md#the-noise). Read its 32 × 32 texels out of `cap.memory` at the
unit's offset and search the frame whose fill gives them, with `postprocess.js`'s `fillNoise`: one
frame matches in any 2²¹ (nine hours), and beside `_Time`'s steps it says how many frames the scene
drew to get there.

The cache only grows, which makes it a coverage recorder. To find the code behind a
behaviour, copy `spu-safe-v1-tane.dat`, trigger the behaviour in RPCS3 (shake the
controller, move across icons), then run `spu_cache.py match ... --since <the copy>`.

## A capture's frame

`rrc.py frame` lists a capture's draws with what each does: its fragment and vertex programs, named
by matching the `.fpo` and `.vpo` files' microcode, the surface it writes, the textures its program
samples - format, size, filters, wrap - its blend, and with `--uniforms` its fragment program's
uniforms.

```bash
python tools/re/rrc.py frame <capture.rrc.gz> --programs re-work/lines/lib --uniforms
```

Three things to know when reading a frame:

- **The uniforms are the draw's own.** The XMB patches fragment programs' constants between draws
  with inline transfers - an NV3062 destination and NV308A points and colours in its FIFO - so a
  program drawn six times can run with six sets of values, as the glare's `AccGlare` does. The
  memory blocks hold the microcode as it was first needed, and `frame` lays the frame's transfers
  so far over it. `whichset.py`'s `live_uniform` reads the block alone, which is right for a program
  patched once a frame and not for one patched between draws.
- **Render targets read as zeros.** RPCS3 keeps them on the GPU and does not write them back, so a
  capture says what a pass draws, never what it drew. What the CPU uploads reads as it was: the
  wave's `_Stripes` and `_Encode` and the composite's preexpose tables and noise came out of
  `cap.memory`, at the offsets the texture registers give. A texture `frame` does not call linear
  is swizzled: the texel at (x, y) sits at the offset whose bits interleave x's and y's from the
  lowest, x first, until the shorter runs out - which is how `_Stripes`' 16 × 4 lie.
- **`Copy`, `GlareSource` and `back_colours_cpy` are one program**, the same microcode; `frame`
  names the first it finds.

That is how [the passes after the wave](../../docs/wave/postprocess.md) were read. Their result can
only be checked against what RPCS3 shows: its screenshots, in `screenshots/`, are the 1920 × 1080
frame as it went out, lossless.

## Checking a re-authored program

RPCS3's shader log holds each program's decompilation in GLSL. Its setting, *Log shader programs*,
is in the configuration's Debug tab, which RPCS3 hides unless `showDebugTab=true` in
`GuiConfigs/CurrentSettings.ini`; or, with RPCS3 closed, set `Log shader programs: true` under
`Video:` in `config/config.yml`. Booting the XMB then decompiles every program in the shader cache
into `shaderlog/` - one a past session used only once, such as the music's, included - numbering
them afresh over the last run's, so copy those aside into `re-work/` first. With a few definitions
a decompilation runs in WebGL2 as it is: `_select` as
`mix`, `fma(a, b, c)` as `a * b + c`, `_builtin_rcp(x)` returning a `vec4`, each `TEX2D(n, uv)` as a
`texture` call, the uniforms as `vec4`s, and the `_fetch_constant(n)` filled in from `cgbin.py
--fc-table`. Run over the same inputs as the re-authored program into a float target, the two can be
compared texel by texel - that is how [the backdrop's program](../../docs/background/program.md) was
checked, to 4e-7. Keep that harness in a scratch folder: a decompilation is firmware.

Then the whole chain can be checked against a screenshot: the program fed what a capture taken a few
seconds from it held - its uniforms, and the textures out of the firmware - and put through the
composite after the wave gives the screenshot's pixels where only the backdrop shows. A capture's
own wave mesh (`tools/bench/wave-frames.py` writes them into `re-work/wave-frames/`), drawn in place
of the page's, does the same for the wave.

## Getting the XMB where a reading needs it

- **Another hour.** RPCS3's *Console time offset* moves the emulated clock without waiting for
  the hour, which is how the day cycle's night window was measured.
- **Music.** Getting music into the XMB under RPCS3 needs the media database rebuilt - dropping
  files into `/dev_hdd0/music` leaves them invisible, because nothing scans that folder (RPCS3
  issue #18601; deleting `/dev_hdd0/mms` forces the rebuild).

## How the tools were validated

`spu_disasm.py` decodes all of `spline.elf` without a single unknown word, and
reproduces the instructions that `SPLINE_REVERSE_ENGINEER.md` quotes at their
addresses: the kernel loop at `0x4830` with its back edge at `0x4bcc`, `ceqi r121,r105,8`,
`rotmi r32,r37,-4`, and the eight `stqd` stores with their registers and offsets.
`spu_cache.py` finds 424 cached programs whose words equal `particles.elf` at the same
addresses. `cgbin.py` identifies all four particle shaders the XMB ran in RPCS3's cache.
