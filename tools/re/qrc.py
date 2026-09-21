#!/usr/bin/env python3
"""Extract Sony QRC resource containers, such as dev_flash/vsh/resource/qgl/lines.qrc.

Reads only your own firmware files and writes into re-work/ (gitignored). Extracted
firmware assets must never be committed.

Format, reverse engineered from the containers themselves:

  QRCC  'QRCC' + u32 decompressed size + zlib stream, which inflates to a QRCF.
        Some containers (icontex.qrc) are stored as a bare QRCF.

  QRCF  big-endian header: 'QRCF', u32 version (0x110), then (offset, size) pairs for
        the element tree, the id strings, the key strings, two unused tables, and the
        data section. The data section runs to the end of the file.

  Element tree: a compiled XML document, <qrc><file-table><file src=... id=.../>...
        Each element is 7 words -- tag, attribute count, parent, previous sibling,
        next sibling, first child, last child -- followed by 16-byte attributes of
        (key, value type, v0, v1). Tags and keys are offsets into the key strings
        ("qrc", "file-table", "file", "src", "id"); tree links are offsets into the
        tree, -1 when absent.
        Value type 6 is a blob: v0 is its offset in the data section, v1 its size.
        Value type 7 is a string: v0 is its offset in the id strings, which store a
        u32 back-reference to the owning element before each NUL-terminated string.

Usage:
  qrc.py list    <file.qrc>
  qrc.py extract <file.qrc> [-o OUTDIR] [--mnu-json]
"""

import argparse
import json
import struct
import sys
import zlib
from pathlib import Path

NONE = 0xFFFFFFFF
VTYPE_BLOB = 6
VTYPE_STRING = 7

REPO_ROOT = Path(__file__).resolve().parents[2]


def decompress(raw):
    if raw[:4] == b'QRCC':
        (size,) = struct.unpack('>I', raw[4:8])
        data = zlib.decompress(raw[8:])
        if len(data) != size:
            raise ValueError('QRCC size mismatch: header %d, inflated %d' % (size, len(data)))
        return data
    if raw[:4] == b'QRCF':
        return raw
    raise ValueError('not a QRC container (magic %r)' % raw[:4])


class Qrcf:
    def __init__(self, data):
        if data[:4] != b'QRCF':
            raise ValueError('missing QRCF magic')
        self.data = data
        fields = struct.unpack('>I12I', data[4:0x38])
        self.version = fields[0]
        self.tree, _, self.ids, _, self.keys, self.keys_size = fields[1:7]
        self.data_off, data_size = fields[11], fields[12]
        if self.data_off + data_size != len(data):
            raise ValueError('data section does not end at the end of the file')

    def u32(self, off):
        return struct.unpack('>I', self.data[off:off + 4])[0]

    def cstr(self, off):
        end = self.data.index(b'\0', off)
        return self.data[off:end].decode('latin1')

    def key(self, off):
        return self.cstr(self.keys + off)

    def element(self, off):
        base = self.tree + off
        tag, nattrs, parent, prev, nxt, first, last = struct.unpack('>7I', self.data[base:base + 28])
        attrs = {}
        for i in range(nattrs):
            a = base + 28 + i * 16
            key, vtype, v0, v1 = struct.unpack('>4I', self.data[a:a + 16])
            attrs[self.key(key)] = (vtype, v0, v1)
        return {'tag': self.key(tag), 'attrs': attrs, 'first': first, 'next': nxt}

    def walk(self, off=0):
        node = self.element(off)
        yield node
        child = node['first']
        while child != NONE:
            yield from self.walk(child)
            child = self.element(child)['next']

    def files(self):
        """Yield (id, bytes) for every <file> element, in document order."""
        for node in self.walk():
            if node['tag'] != 'file':
                continue
            vtype, v0, _ = node['attrs']['id']
            if vtype != VTYPE_STRING:
                raise ValueError('unexpected id value type %d' % vtype)
            name = self.cstr(self.ids + v0 + 4)
            vtype, off, size = node['attrs']['src']
            if vtype != VTYPE_BLOB:
                raise ValueError('unexpected src value type %d for %s' % (vtype, name))
            start = self.data_off + off
            yield name, self.data[start:start + size]


def parse_mnu(text):
    """Parse a '#MNU_1.0' parameter file: one 'name:type:value' per line."""
    params = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        name, vtype, value = line.rsplit(':', 2)
        params[name] = float(value) if vtype == 'float' else value
    return params


def safe_target(outdir, name):
    target = (outdir / name).resolve()
    if outdir.resolve() not in target.parents:
        raise ValueError('refusing to write outside the output directory: %s' % name)
    return target


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    p_list = sub.add_parser('list', help='list the files in a container')
    p_list.add_argument('qrc', type=Path)
    p_ext = sub.add_parser('extract', help='extract every file in a container')
    p_ext.add_argument('qrc', type=Path)
    p_ext.add_argument('-o', '--outdir', type=Path, help='default: re-work/<container name>/')
    p_ext.add_argument('--mnu-json', action='store_true', help='also write each .mnu as .json')
    args = ap.parse_args(argv)

    qrc = Qrcf(decompress(args.qrc.read_bytes()))

    if args.cmd == 'list':
        for name, blob in qrc.files():
            print('%9d  %s' % (len(blob), name))
        return 0

    outdir = args.outdir or REPO_ROOT / 're-work' / args.qrc.stem
    count = 0
    for name, blob in qrc.files():
        target = safe_target(outdir, name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(blob)
        if args.mnu_json and name.endswith('.mnu'):
            params = parse_mnu(blob.decode('latin1'))
            target.with_suffix('.json').write_text(json.dumps(params, indent=2) + '\n')
        count += 1
    print('extracted %d files to %s' % (count, outdir))
    return 0


if __name__ == '__main__':
    sys.exit(main())
