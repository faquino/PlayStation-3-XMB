# Reverse-engineering tools

Python 3, standard library only. They read firmware files from **your own** PS3 firmware
(for example an RPCS3 install) and write everything they extract into `re-work/` at the
repository root, which is gitignored. Extracted firmware assets must never be committed.

| Tool | What it does |
|---|---|
| `qrc.py` | Lists and extracts Sony `.qrc` resource containers (`dev_flash/vsh/resource/qgl/*.qrc`). `--mnu-json` also converts the `.mnu` parameter files to JSON. |
| `spu_disasm.py` | Disassembles SPU ELF files (the SPURS tasks inside `lines.qrc`), with Ghidra-style `FUN_`/`LAB_` labels, the quadwords that `lqr`/`lqa` read, and the constants built by `ilhu`/`iohl`. |
| `spu_cache.py` | Matches RPCS3's SPU program cache (`spu-*.dat`) against an ELF: which of its code actually ran, and with `--since`, which code ran for the first time. |
| `cgbin.py` | Reads compiled RSX Cg programs (`.vpo`/`.fpo`): parameter tables, register assignments, and the uniform values the XMB set at run time, read from RPCS3's shader cache. |

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
```

`<raw dir>` is `<rpcs3>/cache/vsh/ppu-*-vsh.self/shaders_cache/raw`.

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
