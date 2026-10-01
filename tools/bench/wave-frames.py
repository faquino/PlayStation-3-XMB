#!/usr/bin/env python3
"""Extract the console's wave meshes from RPCS3 RSX captures and savestates, for tools/bench/wave.js.

spline.elf writes the wave into one of two buffers, io 0x500000 and 0x580000, as 128 lines of 128
vertices one line after the other, and lines1.vpo draws it from there. A vertex is 32 bytes: its
position, already projected by the XMB's camera (w is the view depth), then an unnormalised
normal. A capture holds the buffer its frame drew. A savestate holds both, a frame apart, which is
what gives the wave's speed; which of the two is the newer is not known.

The buffers are found in a savestate by what the camera does to a point: near 0.1 and far 1000 make
z = 1.0002 w - 0.20002 for every vertex. A savestate leaves out the 128-byte lines of memory that
are entirely zero, but no line of these buffers is.

Writes, under --out:
  <source>.f32   the frames as little-endian float32, frames x 16384 vertices x 8 (position, normal)
  index.json     one entry per source: its kind, when it was taken, its frames, the particles' live
                 glare, and for a capture the parameter set whichset.py names from the backdrop and
                 the uniforms the wave was drawn with

Running it again on a source replaces that source's entry and keeps the others.

Usage:
  wave-frames.py <capture.rrc.gz | savestate.SAVESTAT.zst> [more ...] [--out DIR] [--lines DIR]
"""
import argparse
import datetime
import gzip
import json
import re
import struct
import sys
from array import array
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 're'))
import cgbin  # noqa: E402
import rrc  # noqa: E402
import whichset  # noqa: E402

VERTICES = 128 * 128
RECORD = 32                      # bytes per vertex: position, then normal
Z_SCALE = 1000.1 / 999.9         # (far + near) / (far - near)
Z_OFFSET = 200.0 / 999.9         # 2 far near / (far - near)
UNIFORMS = {465: '_MipmapBias', 466: '_Brightness', 467: '_Fresnel'}


def to_floats(blob):
    """Big-endian PS3 floats as a native array."""
    values = array('f')
    values.frombytes(blob)
    if sys.byteorder == 'little':
        values.byteswap()
    return values


def capture_frames(path, lines1, sets, glare_program):
    raw = gzip.open(path).read()
    cap = rrc.Capture(raw)
    draws = list(cap.draws())
    wave = next((d for d in draws if rrc.program_name(d, {'lines1': lines1}) == 'lines1'), None)
    if wave is None:
        return None
    pos, nrm = wave['arrays'][0], wave['arrays'].get(9)
    strides = {rrc.attribute_format(wave['formats'][a])[2] for a in (0, 9)}
    if nrm != pos + 16 or strides != {RECORD}:
        raise SystemExit('%s: the wave is not laid out as 32-byte records' % path.name)
    blob = cap.memory(pos >> 31, pos & 0x7fffffff, VERTICES * RECORD)
    if blob is None:
        raise SystemExit('%s: the wave buffer is not in the capture' % path.name)
    fits = whichset.best_fits(draws, sets)
    stamp = re.search(r'_(\d{14})_', path.name)
    return {
        'kind': 'capture',
        'taken': datetime.datetime.strptime(stamp.group(1), '%Y%m%d%H%M%S').isoformat(sep=' ') if stamp else None,
        'buffers': ['0x%x' % (pos & 0x7fffffff)],
        'set': whichset.describe(*fits[0]) if fits else None,
        'glare': whichset.live_uniform(glare_program, raw, '_Glare'),
        'uniforms': {name: wave['consts'][slot][0] for slot, name in UNIFORMS.items() if slot in wave['consts']},
    }, [to_floats(blob)]


def find_buffers(image):
    """Offsets of the runs of projected vertices in a memory image, as (offset, vertices)."""
    hits = []
    for align in range(4):
        values = to_floats(image[align:align + (len(image) - align) // 4 * 4])
        for i in range(len(values) - 4):
            w = values[i + 3]
            if 0.1 < w < 1000 and abs(values[i + 2] - (Z_SCALE * w - Z_OFFSET)) < 2e-4:
                hits.append(align + 4 * i)
    # A stray hit inside a record would cut the run, so each offset modulo the record is walked apart.
    classes = {}
    for at in sorted(hits):
        classes.setdefault(at % RECORD, []).append(at)
    runs = []
    for group in classes.values():
        start = count = 0
        for prev, at in zip([None] + group, group):
            if prev is not None and at - prev == RECORD:
                count += 1
                continue
            if count >= VERTICES:
                runs.append((start, count))
            start, count = at, 1
        if count >= VERTICES:
            runs.append((start, count))
    return sorted(runs)


def savestate_frames(path, glare_program):
    image = path.read_bytes()
    if path.suffix == '.zst':
        from compression import zstd
        image = zstd.decompress(image)
    frames = []
    for start, count in find_buffers(image):
        if count % VERTICES:
            print('  %s: a run of %d vertices at %#x is not whole buffers; left out' % (path.name, count, start))
            continue
        for k in range(count // VERTICES):
            at = start + k * VERTICES * RECORD
            frames.append(to_floats(image[at:at + VERTICES * RECORD]))
    if not frames:
        return None
    taken = datetime.datetime.fromtimestamp(path.stat().st_mtime).replace(microsecond=0)
    return {
        'kind': 'savestate',
        'taken': taken.isoformat(sep=' ') if path.suffix == '.zst' else None,
        'buffers': ['memory order %d' % k for k in range(len(frames))],
        'set': None,
        'glare': whichset.live_uniform(glare_program, image, '_Glare'),
        'uniforms': {},
    }, frames


def source_name(path):
    name = path.name
    for suffix in ('.rrc.gz', '.SAVESTAT.zst', '.gz', '.zst', '.bin'):
        if name.endswith(suffix):
            return name[:-len(suffix)]
    return path.stem


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('sources', type=Path, nargs='+')
    ap.add_argument('--out', type=Path, default=Path('re-work/wave-frames'),
                    help='where the frames and index.json go (default: re-work/wave-frames)')
    ap.add_argument('--lines', type=Path, default=Path('re-work/lines'),
                    help='the extracted lines.qrc (default: re-work/lines)')
    args = ap.parse_args(argv)

    vpo = cgbin.CgProgram((args.lines / 'lib/moyou/lines1.vpo').read_bytes()).ucode
    lines1 = list(struct.unpack('>%dI' % (len(vpo) // 4), vpo))
    sets = whichset.load_sets(args.lines)
    glare_program = cgbin.CgProgram((args.lines / 'lib/particles/particles_second.fpo').read_bytes())

    args.out.mkdir(parents=True, exist_ok=True)
    index_path = args.out / 'index.json'
    index = json.loads(index_path.read_text()) if index_path.exists() else {}
    for path in args.sources:
        is_capture = path.name.endswith('.rrc.gz')
        found = capture_frames(path, lines1, sets, glare_program) if is_capture else savestate_frames(path, glare_program)
        name = source_name(path)
        if found is None:
            print('%s: no wave' % path.name)
            continue
        entry, frames = found
        entry.update(source=path.name, file=name + '.f32', frames=len(frames))
        with open(args.out / entry['file'], 'wb') as out:
            for frame in frames:
                if sys.byteorder != 'little':
                    frame.byteswap()
                frame.tofile(out)
        index[name] = entry
        print('%s: %d frame(s), set %s, glare %s' % (path.name, len(frames), entry['set'],
                                                     ', '.join('%.6f' % g for g in entry['glare']) or '-'))
    index_path.write_text(json.dumps(dict(sorted(index.items())), indent=1) + '\n')


if __name__ == '__main__':
    sys.exit(main())
