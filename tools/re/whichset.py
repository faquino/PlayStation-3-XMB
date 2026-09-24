#!/usr/bin/env python3
"""Name the parameter set an RSX capture was taken under, or the pair it was crossfading.

Every override in lines.qrc carries its own BACKGROUND.mnu, and the four corner colours of
that file reach the GPU as vertex constants c[464] to c[467], in the order corner 4, 3, 1, 2.
Twelve numbers is plenty to tell the sets apart: fitting them against every pair of sets and
keeping the best fit names the set on screen, and when the console is walking from one set to
another it also gives how far along it is. The residual says whether to believe it - a real
match lands around 1e-6, which is float noise.

The day-cycle sets (day, yoake, higure, night) share the base backdrop, so nothing separates
them there; the particles' `glare` does, and it is read out of the fragment microcode in the
same capture.

Usage:
  whichset.py <capture.rrc.gz> [more captures ...]
"""
import argparse
import gzip
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cgbin
import rrc

CORNER_SLOTS = (464, 465, 466, 467)
CORNER_ORDER = (4, 3, 1, 2)


def read_mnu(path):
    if not path.exists():
        return None
    out = {}
    for line in path.read_text(encoding='latin1').splitlines():
        if ':' in line and not line.startswith('#'):
            name, kind, value = line.split(':', 2)
            out[name] = float(value) if kind == 'float' else int(value)
    return out


def load_sets(lines_dir):
    """{name: ([corner colours in capture order], glare or None)} for the base and every override."""
    sets = {}
    folders = [('(base)', lines_dir)] + [(d.name, d) for d in sorted((lines_dir / 'override').iterdir())
                                         if d.is_dir()]
    for name, folder in folders:
        background = read_mnu(folder / 'BACKGROUND.mnu')
        if background is None:
            continue
        corners = [tuple(background['%d %s' % (i, c)] for c in ('RED', 'GREEN', 'BLUE'))
                   for i in CORNER_ORDER]
        particles = read_mnu(folder / 'PARTICLES.mnu')
        sets[name] = (corners, particles['glare'] if particles else None)
    return sets


def fit(measured, sets):
    """Every pair of sets, best first, as (residual, from, to, factor)."""
    out = []
    for a_name, (a, _) in sets.items():
        for b_name, (b, _) in sets.items():
            num = den = 0.0
            for i in range(4):
                for j in range(3):
                    step = b[i][j] - a[i][j]
                    num += (measured[i][j] - a[i][j]) * step
                    den += step * step
            if den < 1e-9:
                if a_name != b_name:
                    continue  # the two sets share a backdrop; nothing to fit
                factor = 0.0
            else:
                factor = num / den
            worst = max(abs(a[i][j] + (b[i][j] - a[i][j]) * factor - measured[i][j])
                        for i in range(4) for j in range(3))
            out.append((worst, a_name, b_name, factor))
    out.sort()
    return out


def corners_of(draws):
    """Every distinct reading of the four corner slots in the frame.

    Those constants are per-draw state and other draws pass their own things through the same
    slots, so the caller picks the reading that actually fits a pair of sets.
    """
    out = []
    for draw in draws:
        if all(slot in draw['consts'] for slot in CORNER_SLOTS):
            corners = [tuple(draw['consts'][slot][:3]) for slot in CORNER_SLOTS]
            if corners not in out:
                out.append(corners)
    return out


def live_uniform(program, memory, name):
    """A fragment program's live values for one uniform, oldest copy first.

    The microcode sits in the capture with its uniform slots patched in place, so a stretch of
    the .fpo that holds no slots finds every copy of it, and the slots can be read from there.
    """
    patched = set()
    for param in program.params:
        for slot in param['slots']:
            patched.update(range(slot, slot + 16))
    slots = next((p['slots'] for p in program.params if p['name'] == name), None)
    if not slots:
        return []
    span = 48
    windows = [o for o in range(0, len(program.ucode) - span, 16)
               if not set(range(o, o + span)) & patched]
    bases = None
    for offset in windows[::max(1, len(windows) // 24)][:24]:
        needle = program.ucode[offset:offset + span]
        hits, pos = set(), memory.find(needle)
        while pos != -1:
            hits.add(pos - offset)
            pos = memory.find(needle, pos + 1)
        bases = hits if bases is None else bases & hits
        if not bases:
            return []
    values = []
    for base in sorted(bases or []):
        word = struct.unpack('>I', memory[base + slots[0]:base + slots[0] + 4])[0]
        value = cgbin.fp_float(word)
        if value and value not in values:
            values.append(value)
    return values


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('captures', type=Path, nargs='+')
    ap.add_argument('--lines', type=Path, default=Path('re-work/lines'),
                    help='the extracted lines.qrc (default: re-work/lines)')
    ap.add_argument('--all', action='store_true', help='show the three best fits, not just one')
    args = ap.parse_args(argv)

    sets = load_sets(args.lines)
    if not sets:
        raise SystemExit('no BACKGROUND.mnu under %s - extract lines.qrc first' % args.lines)
    glare_program = cgbin.CgProgram((args.lines / 'lib/particles/particles_second.fpo').read_bytes())

    for path in args.captures:
        raw = gzip.open(path).read()
        capture = rrc.Capture(raw)
        draws = list(capture.draws())
        readings = corners_of(draws)
        print('%s  %d draws' % (path.name, len(draws)))
        if not readings:
            print('    no backdrop draw: this frame does not run the lines scene')
            continue
        best = min((fit(m, sets) for m in readings), key=lambda f: f[0][0])
        for worst, a_name, b_name, factor in best[:3 if args.all else 1]:
            if a_name == b_name or factor < 1e-6:
                print('    %-40s residual %.1g' % (a_name, worst))
            elif factor > 1 - 1e-6:
                print('    %-40s residual %.1g' % (b_name, worst))
            else:
                # one frame cannot say which way the crossfade is running, so name both ends
                print('    %-40s residual %.1g'
                      % ('between %s and %s, %.4f towards %s' % (a_name, b_name, factor, b_name), worst))
        glare = live_uniform(glare_program, raw, '_Glare')
        if glare:
            named = {name: g for name, (_, g) in sets.items() if g is not None}
            for value in glare:
                match = [n for n, g in named.items() if abs(g - value) < 1e-6]
                print('    particles: glare %.6f%s' % (value, '  = %s' % ', '.join(match) if match else ''))


if __name__ == '__main__':
    sys.exit(main())
