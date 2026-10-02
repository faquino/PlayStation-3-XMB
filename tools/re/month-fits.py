#!/usr/bin/env python3
"""Fit the backdrop's month textures with cubic polynomials and write them as ps3xmbwave/background-months.js.

The XMB draws its backdrop out of 24 textures, textures/month_bg/rgb/01..12.dds and night/01..12.dds in
lines.qrc, 64 x 32 BGRA. They are firmware and stay out of the repository; what the page uses instead is, for
each texture and each of red, green and blue, the ten coefficients of the cubic that fits it best:

    c(u, v) = k0 + k1 u + k2 v + k3 u v + k4 u^2 + k5 v^2 + k6 u^3 + k7 v^3 + k8 u^2 v + k9 u v^2

over the texture's own coordinates, u across and v down the file's rows from 0 to 1, texel centres at
(x + 0.5) / 64 and (y + 0.5) / 32, colours from 0 to 1. Across the 24 they leave 0.4 to 3.2 levels of 255
(rms) of the texture, and the backdrop the console would draw from them is within 1.5 levels (rms) of the
one it draws from the textures themselves.

Usage:
  month-fits.py <extracted lines.qrc>/textures/month_bg [-o ps3xmbwave/background-months.js]
"""
import argparse
from pathlib import Path

HEADER = """'use strict';
// The backdrop's 24 month textures as cubic fits, written by tools/re/month-fits.py from the firmware's
// textures/month_bg (which stay out of the repository). Read by `backdrop.js`.

// For each month, January first, the day's texture (rgb/) and the night's (night/): red, green and blue, each the
// coefficients of 1, u, v, u v, u^2, v^2, u^3, v^3, u^2 v and u v^2 over the texture - u across, v down its rows,
// both 0 to 1 - in colours from 0 to 1.
window.BG_MONTH_FITS = {
"""


def basis(u, v):
    return [1.0, u, v, u * v, u * u, v * v, u * u * u, v * v * v, u * u * v, u * v * v]


def solve(rows, target):
    """Least squares through the normal equations, by Gauss-Jordan with partial pivoting."""
    n = len(rows[0])
    m = [[sum(r[i] * r[j] for r in rows) for j in range(n)] for i in range(n)]
    b = [sum(r[i] * t for r, t in zip(rows, target)) for i in range(n)]
    for i in range(n):
        p = max(range(i, n), key=lambda k: abs(m[k][i]))
        m[i], m[p] = m[p], m[i]
        b[i], b[p] = b[p], b[i]
        for k in range(n):
            if k != i:
                f = m[k][i] / m[i][i]
                for c in range(i, n):
                    m[k][c] -= f * m[i][c]
                b[k] -= f * b[i]
    return [b[i] / m[i][i] for i in range(n)]


def fit(path):
    """The three channels' coefficients for one DDS (64 x 32, 32-bit BGRA after the 128-byte header)."""
    raw = path.read_bytes()[128:128 + 64 * 32 * 4]
    rows, channels = [], [[], [], []]
    for y in range(32):
        for x in range(64):
            i = (y * 64 + x) * 4
            rows.append(basis((x + 0.5) / 64, (y + 0.5) / 32))
            channels[0].append(raw[i + 2] / 255)
            channels[1].append(raw[i + 1] / 255)
            channels[2].append(raw[i] / 255)
    return [solve(rows, channel) for channel in channels]


def format_month(channels):
    return '[' + ', '.join('[' + ', '.join('%.6g' % k for k in ks) + ']' for ks in channels) + ']'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('month_bg', type=Path, help="the extracted textures/month_bg folder")
    ap.add_argument('-o', '--out', type=Path, default=Path('ps3xmbwave/background-months.js'))
    args = ap.parse_args(argv)
    lines = [HEADER]
    for kind, name in (('rgb', 'day'), ('night', 'night')):
        lines.append('  %s: [\n' % name)
        for month in range(1, 13):
            channels = fit(args.month_bg / kind / ('%02d.dds' % month))
            lines.append('    %s,\n' % format_month(channels))
        lines.append('  ],\n')
    lines.append('};\n')
    args.out.write_text(''.join(lines), encoding='utf-8')
    print('written', args.out)


if __name__ == '__main__':
    main()
