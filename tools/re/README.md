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
| `rrc.py` | Reads RPCS3 RSX frame captures (`captures/*.rrc.gz`, Alt+C in the emulator): the draw calls of one frame, the vertex constants at each draw, and each draw's vertex buffers, decoded to CSV. |
| `ppu_prx.py` | Loads decrypted PPU modules (PRX or executable), applies PRX relocations, finds the TOC, and disassembles with capstone. Also finds immediates, the code that reaches an address, and the callers of each named import. Needs `pip install capstone`. |
| `whichset.py` | Names the parameter set an RSX capture was taken under, or the pair it was crossfading and how far along, by fitting the backdrop's four corner colours against every `override/`. Reads the particles' live `glare` from the same capture. |
| `nids.py` | Computes PS3 function NIDs from names and names a module's imports. |

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

## Savestates

RPCS3 can save the emulated machine's state while the XMB runs (*File → Create
savestate*), into `savestates/vsh.self/*.SAVESTAT.zst`. The file is a zstd stream around
`RPCS3SAV`, which Python 3.14 opens with `compression.zstd`, and it holds main memory and
every SPU's local store. Searching the decompressed image for values you already know —
a parameter as a float, a vector as a triple — finds the structure that holds them, which
beats tracing the code that fills it. That is how the particle parameter block and the
particle pool in `PARTICLES_REVERSE_ENGINEER.md` were read. Live fragment-shader uniforms
are in there too: the microcode keeps them inline, with each float's halves swapped, so
searching for the constants beside them finds their current values.

**A frame capture carries the same uniforms, and does not hang the emulator.** Creating a
savestate of the running XMB tends to leave RPCS3 stuck and needing to be killed, while
Alt+C writes its capture and carries on. The capture holds the fragment microcode with the
same patched slots, so the reader above works on it unchanged - the particles' live `glare`
and the backdrop's `_MonthTime` both came back out of one - and `rrc.py` reads the vertex
constants beside it. Reach for a savestate only when main memory itself is what you need:
the particle pool, the 768-byte parameter block, anything `readblock.py` walks.

A capture also holds the wave's finished geometry, which is worth knowing before the wave's
own pass: `draws --vpo .../lines1.vpo` finds it (draw 4 in every capture so far, 16384
vertices), and `buffer` writes position, uv and normal per vertex to CSV. That is the console's
output, not the `b300`/`b380` inputs the spline notes still want, but it is ground truth to
measure a pipeline against.

The cache only grows, which makes it a coverage recorder. To find the code behind a
behaviour, copy `spu-safe-v1-tane.dat`, trigger the behaviour in RPCS3 (shake the
controller, move across icons), then run `spu_cache.py match ... --since <the copy>`.

## How the tools were validated

`spu_disasm.py` decodes all of `spline.elf` without a single unknown word, and
reproduces the instructions that `SPLINE_REVERSE_ENGINEER.md` quotes at their
addresses: the kernel loop at `0x4830` with its back edge at `0x4bcc`, `ceqi r121,r105,8`,
`rotmi r32,r37,-4`, and the eight `stqd` stores with their registers and offsets.
`spu_cache.py` finds 424 cached programs whose words equal `particles.elf` at the same
addresses. `cgbin.py` identifies all four particle shaders the XMB ran in RPCS3's cache.
