#!/usr/bin/env python3
"""Read RPCS3 RSX frame captures (captures/*.rrc.gz, made with Alt+C while a game runs).

A capture holds every RSX register write of one frame, plus the memory each write
needed. That gives what RPCS3's shader cache cannot: the vertex program constants and
the vertex buffers of each draw call.

Format (RPCS3's frame_capture_data, version 6), written by its utils::serial: integers
raw little-endian, container sizes as a variable-length integer (7 bits per byte, low
bits first, high bit set on all but the last byte), structs marked for bitwise
serialisation as their raw bytes.

  u32 magic 'RRC\\0', u32 version, u32 little-endian flag
  tile_map             count, then per entry: tile_state (432 bytes), u64 key
  memory_map           count, then per entry: memory_block, u64 key
                         memory_block = u32 offset, u32 location, u64 data key
  memory_data_map      count, then per entry: bytes (count + raw), u64 key
  display_buffers_map  count, then per entry: display_buffers_state (132 bytes), u64 key
  replay_commands      count, then per command:
                         u32 FIFO header, u32 data word,
                         memory blocks to apply first (count + u64 keys),
                         u64 tile key, u64 display buffer key

The commands are the FIFO stream as the RSX consumed it. A packet's first command carries
its header (method | word count << 18, bit 30 for "don't increment the method") and its
first data word; each further data word follows as a command whose header is 0.

The capture holds main memory as it was when each block was first needed, keyed by
RSX location: 0 is local (video) memory, 1 is main memory mapped through the IO table.

Usage:
  rrc.py summary <capture.rrc.gz>
  rrc.py draws   <capture.rrc.gz> [--vpo P.vpo ...]   draw calls, naming known programs
  rrc.py consts  <capture.rrc.gz> <draw> [first] [n]  vertex constants at a draw
  rrc.py buffer  <capture.rrc.gz> <draw> [-o F.csv]   a draw's vertex attributes, decoded
"""

import argparse
import gzip
import struct
import sys
from pathlib import Path

MAGIC = 0x00435252
TILE_STATE_SIZE = 15 * 16 + 8 * 24
DISPLAY_STATE_SIZE = 8 * 16 + 4

# NV4097 methods (byte offsets) used here.
TRANSFORM_PROGRAM_LOAD = 0x1e9c
TRANSFORM_PROGRAM_START = 0x1ea0
TRANSFORM_PROGRAM = 0x0b80          # 32 words of vertex microcode per batch
TRANSFORM_CONSTANT_LOAD = 0x1efc
TRANSFORM_CONSTANT = 0x1f00         # 32 words, i.e. 8 constants per batch
FREQUENCY_DIVIDER_OPERATION = 0x1fc0  # bit n set: attribute n repeats modulo its frequency
SHADER_PROGRAM = 0x08e4             # fragment program offset and location
VERTEX_DATA_ARRAY_OFFSET = 0x1680   # 16 attributes
VERTEX_DATA_ARRAY_FORMAT = 0x1740   # 16 attributes
BEGIN_END = 0x1808
DRAW_ARRAYS = 0x1814
INDEX_ARRAY_ADDRESS = 0x181c
INDEX_ARRAY_DMA = 0x1820            # bits 0-3 location, bit 4 set for 16-bit indices
DRAW_INDEX_ARRAY = 0x1824


class Reader:
    def __init__(self, data):
        self.data = data
        self.pos = 0

    def raw(self, n):
        chunk = self.data[self.pos:self.pos + n]
        if len(chunk) != n:
            raise ValueError('unexpected end of capture at %d' % self.pos)
        self.pos += n
        return chunk

    def u32(self):
        return struct.unpack('<I', self.raw(4))[0]

    def u64(self):
        return struct.unpack('<Q', self.raw(8))[0]

    def vle(self):
        value, shift = 0, 0
        while True:
            byte = self.data[self.pos]
            self.pos += 1
            value |= (byte & 0x7f) << shift
            shift += 7
            if not byte & 0x80:
                return value


class Capture:
    def __init__(self, data):
        r = Reader(data)
        magic, self.version, little = r.u32(), r.u32(), r.u32()
        if magic != MAGIC:
            raise ValueError('not an RSX capture')
        if self.version != 6 or not little:
            raise ValueError('unsupported capture version %d' % self.version)

        self.tiles = {}
        for _ in range(r.vle()):
            state = r.raw(TILE_STATE_SIZE)
            self.tiles[r.u64()] = state

        self.blocks = {}
        for _ in range(r.vle()):
            offset, location, data_key = struct.unpack('<IIQ', r.raw(16))
            self.blocks[r.u64()] = (offset, location, data_key)

        self.block_data = {}
        for _ in range(r.vle()):
            blob = r.raw(r.vle())
            self.block_data[r.u64()] = blob

        self.displays = {}
        for _ in range(r.vle()):
            state = r.raw(DISPLAY_STATE_SIZE)
            self.displays[r.u64()] = state

        # Expand FIFO packets into single register writes: (method, value, packet start,
        # word index within the packet).
        self.commands = []
        method, step, packet, word = 0, 4, 0, 0
        for _ in range(r.vle()):
            header, value = r.u32(), r.u32()
            for _ in range(r.vle()):
                r.u64()  # memory blocks to apply
            r.u64()  # tile state key
            r.u64()  # display buffer state key
            if header:
                method = header & 0xfffc
                step = 0 if header & 0x40000000 else 4
                packet, word = len(self.commands), 0
            else:
                word += 1
            self.commands.append((method + step * word, value, packet, word))
        self.tail = len(data) - r.pos  # rsx_state and memory_indexer, not decoded

    def memory(self, location, offset, size):
        """Bytes at an RSX address, from the latest captured block that covers them."""
        best = None
        for block_offset, block_location, data_key in self.blocks.values():
            if block_location != location:
                continue
            blob = self.block_data.get(data_key)
            if blob and block_offset <= offset and offset + size <= block_offset + len(blob):
                best = blob[offset - block_offset:offset - block_offset + size]
        return best

    def draws(self):
        """Replay register writes; yield the state at each draw call.

        Constants and vertex microcode are uploaded through 32-word windows, each packet
        after a LOAD filling the next block of 32 words. When a packet is cut at a FIFO
        segment boundary, the capture keeps the cut packet's full word count (the words
        past the cut are garbage) and the rest follows as a packet whose method starts
        mid-window. So a packet at window offset 0 opens the next block, a packet at
        offset k > 0 rewrites the current block from word k, and a word's position
        since the LOAD gives its slot (position // 4) and component (position % 4).
        """
        consts, program = {}, {}
        const_load = prog_load = 0
        const_block = prog_block = None
        vp_start, fp, divider_op = 0, None, 0
        index_address, index_dma = 0, 0
        arrays, formats = {}, {}
        in_draw, ranges, indexed, count = False, [], [], 0

        def window_position(block, reg, window, word):
            offset = (reg - window) // 4 - word
            if word == 0:
                block = 0 if block is None else block + (32 if offset == 0 else 0)
            return block, block + offset + word

        for index, (reg, value, packet, word) in enumerate(self.commands):
            if reg == TRANSFORM_CONSTANT_LOAD:
                const_load, const_block = value, None
            elif TRANSFORM_CONSTANT <= reg < TRANSFORM_CONSTANT + 0x80:
                const_block, pos = window_position(const_block, reg, TRANSFORM_CONSTANT, word)
                vec = consts.setdefault(const_load + pos // 4, [0.0] * 4)
                vec[pos % 4] = struct.unpack('<f', struct.pack('<I', value))[0]
            elif reg == TRANSFORM_PROGRAM_LOAD:
                prog_load, prog_block = value, None
            elif TRANSFORM_PROGRAM <= reg < TRANSFORM_PROGRAM + 0x80:
                prog_block, pos = window_position(prog_block, reg, TRANSFORM_PROGRAM, word)
                program.setdefault(prog_load + pos // 4, [0] * 4)[pos % 4] = value
            elif reg == TRANSFORM_PROGRAM_START:
                vp_start = value
            elif reg == SHADER_PROGRAM:
                fp = value
            elif reg == FREQUENCY_DIVIDER_OPERATION:
                divider_op = value
            elif reg == INDEX_ARRAY_ADDRESS:
                index_address = value
            elif reg == INDEX_ARRAY_DMA:
                index_dma = value
            elif VERTEX_DATA_ARRAY_OFFSET <= reg < VERTEX_DATA_ARRAY_OFFSET + 0x40:
                arrays[(reg - VERTEX_DATA_ARRAY_OFFSET) // 4] = value
            elif VERTEX_DATA_ARRAY_FORMAT <= reg < VERTEX_DATA_ARRAY_FORMAT + 0x40:
                formats[(reg - VERTEX_DATA_ARRAY_FORMAT) // 4] = value
            elif reg == BEGIN_END:
                if value:
                    in_draw, ranges, indexed, primitive = True, [], [], value
                elif in_draw:
                    in_draw = False
                    if indexed:
                        ranges = [(0, self.index_span(index_address, index_dma, indexed))]
                    yield {'index': count, 'command': index,
                           'consts': {k: list(v) for k, v in consts.items()},
                           'program': {k: list(v) for k, v in program.items()},
                           'vp_start': vp_start, 'fp': fp, 'arrays': dict(arrays),
                           'formats': dict(formats), 'divider_op': divider_op,
                           'primitive': primitive, 'ranges': ranges,
                           'indexed': bool(indexed)}
                    count += 1
            elif reg == DRAW_ARRAYS and in_draw:
                ranges.append((value & 0xffffff, (value >> 24) + 1))
            elif reg == DRAW_INDEX_ARRAY and in_draw:
                indexed.append((value & 0xffffff, (value >> 24) + 1))

    def index_span(self, address, dma, ranges):
        """Number of vertices an indexed draw touches: its largest index plus one.

        The all-ones index is the primitive restart marker of strip meshes, not a vertex.
        """
        width = 2 if dma & 0x10 else 4
        restart = 0xffff if width == 2 else 0xffffffff
        location = 0 if (dma & 0xf) == 0 else 1
        top = -1
        for first, n in ranges:
            blob = self.memory(location, address + first * width, n * width)
            if blob is None:
                continue
            fmt = '>%d%s' % (n, 'H' if width == 2 else 'I')
            top = max([top] + [i for i in struct.unpack(fmt, blob) if i != restart])
        return top + 1


def program_name(draw, vpos):
    """Name of the .vpo whose microcode is loaded at the draw's start slot, if any."""
    for name, words in vpos.items():
        slots = range(draw['vp_start'], draw['vp_start'] + len(words) // 4)
        loaded = [w for s in slots for w in draw['program'].get(s, [None] * 4)]
        if loaded == words:
            return name
    return None


def attribute_format(fmt):
    """Decode NV4097_SET_VERTEX_DATA_ARRAY_FORMAT: (type, size, stride)."""
    kinds = {1: 's1', 2: 'f32', 3: 'f16', 4: 'u8', 5: 's32k', 6: 'cmp', 7: 'u8'}
    return kinds.get(fmt & 0xf, 't%d' % (fmt & 0xf)), (fmt >> 4) & 0xf, (fmt >> 8) & 0xff


# Component decoders for the vertex types, reading big-endian PS3 memory.
DECODERS = {
    'f32': (4, lambda b: struct.unpack('>f', b)[0]),
    'f16': (2, lambda b: struct.unpack('>e', b)[0]),
    's1': (2, lambda b: max(-1.0, struct.unpack('>h', b)[0] / 32767.0)),
    's32k': (2, lambda b: float(struct.unpack('>h', b)[0])),
    'u8': (1, lambda b: b[0] / 255.0),
}


def read_attributes(cap, draw):
    """Decode every enabled vertex attribute of a draw.

    Returns {attribute: list of tuples}. An attribute with frequency f > 1 advances
    once every f vertices, or, when its bit is set in the frequency divider operation,
    repeats modulo f; either way it holds fewer records than the draw has vertices.
    """
    vertices = sum(n for _, n in draw['ranges'])
    out = {}
    for attr, fmt in sorted(draw['formats'].items()):
        kind, size, stride = attribute_format(fmt)
        if not size or kind not in DECODERS:
            continue
        freq = max(1, fmt >> 16)
        if draw['divider_op'] & (1 << attr):
            records = freq
        else:
            records = -(-vertices // freq)
        offset = draw['arrays'].get(attr, 0)
        width, decode = DECODERS[kind]
        blob = cap.memory(offset >> 31, offset & 0x7fffffff, (records - 1) * stride + size * width)
        if blob is None:
            continue
        out[attr] = [tuple(decode(blob[r * stride + c * width:r * stride + (c + 1) * width])
                           for c in range(size)) for r in range(records)]
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('summary')
    p.add_argument('capture', type=Path)
    p = sub.add_parser('draws')
    p.add_argument('capture', type=Path)
    p.add_argument('--vpo', type=Path, nargs='*', default=[],
                   help='vertex programs to recognise in the draws')
    p = sub.add_parser('consts')
    p.add_argument('capture', type=Path)
    p.add_argument('draw', type=int)
    p.add_argument('first', type=int, nargs='?', default=0)
    p.add_argument('n', type=int, nargs='?', default=468)
    p = sub.add_parser('buffer', help="write a draw's decoded vertex attributes as CSV")
    p.add_argument('capture', type=Path)
    p.add_argument('draw', type=int)
    p.add_argument('-o', '--out', type=Path, help='CSV file (default: stdout)')
    args = ap.parse_args(argv)

    cap = Capture(gzip.open(args.capture).read())

    if args.cmd == 'summary':
        total = sum(len(b) for b in cap.block_data.values())
        print('version %d: %d tile states, %d memory blocks, %d data blobs (%d bytes), '
              '%d display states, %d register writes, %d bytes of trailing state'
              % (cap.version, len(cap.tiles), len(cap.blocks), len(cap.block_data), total,
                 len(cap.displays), len(cap.commands), cap.tail))
        return 0

    draws = list(cap.draws())
    if args.cmd == 'draws':
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from cgbin import CgProgram
        vpos = {}
        for path in args.vpo:
            ucode = CgProgram(path.read_bytes()).ucode
            vpos[path.stem] = list(struct.unpack('>%dI' % (len(ucode) // 4), ucode))
        for d in draws:
            attrs = []
            for i in sorted(d['formats']):
                kind, size, stride = attribute_format(d['formats'][i])
                if size:
                    attrs.append('a%d:%s%dx/%d@%08x' % (i, kind, size, stride, d['arrays'].get(i, 0)))
            verts = sum(n for _, n in d['ranges'])
            print('draw %3d  cmd %6d  vp@%3d %-18s fp=%08x  %5d verts  %s'
                  % (d['index'], d['command'], d['vp_start'], program_name(d, vpos) or '',
                     d['fp'] or 0, verts, ' '.join(attrs)))
        return 0

    d = draws[args.draw]
    if args.cmd == 'buffer':
        attrs = read_attributes(cap, d)
        if not attrs:
            raise SystemExit('draw %d has no vertex data in the capture' % args.draw)
        rows = max(len(v) for v in attrs.values())
        header = ['record'] + ['a%d.%s' % (a, 'xyzw'[c]) for a in attrs for c in range(len(attrs[a][0]))]
        lines = [','.join(header)]
        for r in range(rows):
            cells = [str(r)]
            for a in attrs:
                rec = attrs[a][r] if r < len(attrs[a]) else ('',) * len(attrs[a][0])
                cells += ['%.6g' % v if v != '' else '' for v in rec]
            lines.append(','.join(cells))
        text = '\n'.join(lines) + '\n'
        if args.out:
            args.out.write_text(text)
            print('%d records of %s written to %s' % (rows, ', '.join('a%d' % a for a in attrs), args.out))
        else:
            sys.stdout.write(text)
        return 0

    for slot in range(args.first, args.first + args.n):
        if slot in d['consts']:
            print('c[%3d] = (%s)' % (slot, ', '.join('%.6g' % v for v in d['consts'][slot])))
    return 0


if __name__ == '__main__':
    sys.exit(main())
