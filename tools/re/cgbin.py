#!/usr/bin/env python3
"""Inspect compiled RSX Cg programs (.vpo / .fpo), such as the particle shaders in lines.qrc.

Reads the CgBinaryProgram container from the PS3 Cg toolchain, all big-endian:
  header      profile, format revision, total size, parameter count, parameter table
              offset, program header offset, microcode size, microcode offset
  parameter   48 bytes: type, resource, variability, resource index, name, default value,
              embedded constant, semantic, direction, parameter number, referenced, shared
  program     vertex: instruction count and slot, register count, attribute in/out masks
              fragment: instruction count, attribute input mask, texcoord masks, ...

RSX fragment programs have no constant registers: every uniform is embedded in the
microcode itself, and the driver patches those slots at run time. A parameter's
"embedded constant" lists the microcode offsets of its slots, so given the microcode
RPCS3 cached while the XMB ran (cache/.../shaders_cache/raw/*.fp), --runtime reads the
values the XMB actually used. Floats in fragment microcode have their 16-bit halves swapped.

Usage:
  cgbin.py <file.vpo|file.fpo> [--all]                  parameter table (referenced only
                                                         unless --all)
  cgbin.py <file.fpo> --runtime <cached.fp>             compare embedded uniform values
  cgbin.py <file.vpo|file.fpo> --find-in <raw dir>      which cached program is this one

RPCS3 caches vertex microcode with each 32-bit word byte-swapped, and fragment
microcode as-is but with the uniform slots patched, so --find-in compares vertex
programs after swapping and fragment programs outside the embedded constant slots.
"""

import argparse
import struct
import sys
from pathlib import Path

PROFILES = {7003: 'sce_vp_rsx', 7004: 'sce_fp_rsx'}
TYPES = {1045: 'float', 1046: 'float2', 1047: 'float3', 1048: 'float4', 1064: 'float4x4',
         1025: 'half', 1026: 'half2', 1027: 'half3', 1028: 'half4',
         1065: 'sampler1D', 1066: 'sampler2D', 1067: 'sampler3D', 1068: 'samplerRECT',
         1069: 'samplerCUBE', 1093: 'int', 1114: 'bool'}
VARIABILITY = {4101: 'varying', 4102: 'uniform', 4103: 'constant', 4104: 'mixed'}
DIRECTIONS = {4097: 'in', 4098: 'out', 4099: 'inout'}


def resource_name(res, index):
    if 2048 <= res <= 2063:
        return 'TEXUNIT%d' % (res - 2048)
    if 2113 <= res <= 2128:
        return 'ATTR%d' % (res - 2113)
    if 3220 <= res <= 3229:
        return 'TEXCOORD%d' % (res - 3220)
    if res == 2178:
        return 'c[%d]' % index
    if res == 3256:
        return '-'
    return 'res%d' % res


def fp_float(word):
    """Decode a fragment-microcode float, whose 16-bit halves are swapped."""
    swapped = ((word & 0xffff) << 16) | (word >> 16)
    return struct.unpack('>f', struct.pack('>I', swapped))[0]


class CgProgram:
    def __init__(self, raw):
        self.raw = raw
        (self.profile, self.revision, self.total, nparams, params_off, self.prog_off,
         ucode_size, ucode_off) = struct.unpack('>8I', raw[:32])
        if self.profile not in PROFILES:
            raise ValueError('unknown Cg profile %d' % self.profile)
        if self.total != len(raw):
            raise ValueError('size mismatch: header %d, file %d' % (self.total, len(raw)))
        self.ucode = raw[ucode_off:ucode_off + ucode_size]
        self.params = [self._param(params_off + i * 48) for i in range(nparams)]

    @property
    def is_fragment(self):
        return self.profile == 7004

    def _cstr(self, off):
        return self.raw[off:self.raw.index(b'\0', off)].decode('latin1') if off else ''

    def _param(self, off):
        (ptype, res, var, res_index, name, default, embedded, semantic, direction, paramno,
         referenced, shared) = struct.unpack('>3Ii5IiII', self.raw[off:off + 48])
        slots = []
        if embedded:
            (count,) = struct.unpack('>I', self.raw[embedded:embedded + 4])
            slots = list(struct.unpack('>%dI' % count, self.raw[embedded + 4:embedded + 4 + 4 * count]))
        return {
            'name': self._cstr(name),
            'type': TYPES.get(ptype, 'type%d' % ptype),
            'resource': resource_name(res, res_index),
            'var': VARIABILITY.get(var, str(var)),
            'dir': DIRECTIONS.get(direction, str(direction)),
            'semantic': self._cstr(semantic),
            'default': struct.unpack('>4f', self.raw[default:default + 16]) if default else None,
            'slots': slots,
            'referenced': bool(referenced),
        }

    def header_summary(self):
        p = self.prog_off
        if self.is_fragment:
            count, in_mask = struct.unpack('>II', self.raw[p:p + 8])
            return 'fragment program: %d instructions, attribute input mask 0x%08x' % (count, in_mask)
        count, slot, regs, in_mask, out_mask = struct.unpack('>5I', self.raw[p:p + 20])
        return ('vertex program: %d instructions at slot %d, %d registers, attribute input mask '
                '0x%08x, output mask 0x%08x' % (count, slot, regs, in_mask, out_mask))

    def matches_cached(self, cached):
        """True when a microcode image from RPCS3's shader cache is this program."""
        if len(cached) != len(self.ucode):
            return False
        if not self.is_fragment:
            swapped = b''.join(cached[i:i + 4][::-1] for i in range(0, len(cached), 4))
            return swapped == self.ucode
        patched = set()
        for param in self.params:
            for slot in param['slots']:
                patched.update(range(slot, slot + 16))
        return all(a == b for i, (a, b) in enumerate(zip(self.ucode, cached)) if i not in patched)

    def embedded_values(self, ucode, param):
        """Read a parameter's embedded constant slots from a microcode image."""
        values = []
        for slot in param['slots']:
            words = struct.unpack('>4I', ucode[slot:slot + 16])
            values.append(tuple(fp_float(w) for w in words))
        return values


def fmt_vec(vec):
    return '(' + ', '.join('%.6g' % v for v in vec) + ')'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('program', type=Path)
    ap.add_argument('--all', action='store_true', help='include unreferenced parameters')
    ap.add_argument('--runtime', type=Path, help='cached fragment microcode to read uniforms from')
    ap.add_argument('--find-in', type=Path, help="directory of RPCS3's cached raw programs")
    args = ap.parse_args(argv)

    prog = CgProgram(args.program.read_bytes())

    if args.find_in:
        suffix = '.fp' if prog.is_fragment else '.vp'
        hits = [p.name for p in sorted(args.find_in.glob('*' + suffix))
                if prog.matches_cached(p.read_bytes())]
        print('%s: %s' % (args.program.name, ', '.join(hits) if hits else 'not in the cache'))
        return 0

    print('%s, %s' % (PROFILES[prog.profile], prog.header_summary()))

    if args.runtime:
        if not prog.is_fragment:
            raise SystemExit('--runtime only applies to fragment programs')
        runtime = args.runtime.read_bytes()
        if len(runtime) != len(prog.ucode):
            raise SystemExit('microcode sizes differ: %d vs %d' % (len(runtime), len(prog.ucode)))
        for param in prog.params:
            if not param['slots']:
                continue
            compiled = prog.embedded_values(prog.ucode, param)[0]
            live = prog.embedded_values(runtime, param)[0]
            marker = '  ' if compiled == live else '* '
            print('%s%-28s compiled %-44s runtime %s'
                  % (marker, param['name'], fmt_vec(compiled), fmt_vec(live)))
        same = sum(1 for a, b in zip(prog.ucode, runtime) if a == b)
        print('microcode bytes identical outside the patched slots: %d of %d' % (same, len(runtime)))
        return 0

    for param in prog.params:
        if not (param['referenced'] or args.all):
            continue
        extra = []
        if param['semantic']:
            extra.append(param['semantic'])
        if param['default'] is not None:
            extra.append('default ' + fmt_vec(param['default']))
        if param['slots']:
            extra.append('embedded at %s' % ', '.join('0x%x' % s for s in param['slots']))
        print('  %-5s %-8s %-9s %-10s %-28s %s' % (param['dir'], param['var'], param['type'],
                                                  param['resource'], param['name'], '  '.join(extra)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
