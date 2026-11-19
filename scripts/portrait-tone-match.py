#!/usr/bin/env python3
"""Tone-match a treated artist portrait to the existing UE artist set.

Measures luminance percentiles at CARD size (200px, where grain averages out —
the size the targets were measured at), builds an exact piecewise-linear LUT
onto the targets, applies it at full size, and refines a few passes.
Targets: p5/p25/p50/p75/p95 = 21/34/68/137/192 (8 existing portraits, 2026-11-18).
usage: python3 -I portrait-tone-match.py <in.png> <out.webp>
"""
import subprocess, sys

TARGET = [21, 34, 68, 137, 192]
QS = (.05, .25, .50, .75, .95)
SIZE = 1000

def ff(args, data=None):
    return subprocess.run(['ffmpeg', '-loglevel', 'error', *args], input=data, capture_output=True, check=True).stdout

def card_percentiles(raw):
    small = ff(['-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{SIZE}x{SIZE}', '-i', '-',
                '-vf', 'scale=200:200:flags=area', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], raw)
    v = sorted(small); n = len(v)
    return [v[int(q * (n - 1))] for q in QS]

def lut_for(src, dst):
    xs, ys = [0], [0]
    for x, y in zip(src + [255], dst + [min(255, dst[-1] + 30)]):
        if x > xs[-1]:
            xs.append(x); ys.append(y)
        else:
            ys[-1] = y
    out = bytearray(256)
    for i in range(256):
        k = 1
        while k < len(xs) - 1 and i > xs[k]:
            k += 1
        x0, x1, y0, y1 = xs[k - 1], xs[k], ys[k - 1], ys[k]
        out[i] = max(0, min(255, round(y0 + (y1 - y0) * (i - x0) / max(1, x1 - x0))))
    return bytes(out)

def main(inp, outp):
    base = ff(['-i', inp, '-vf', f'scale={SIZE}:{SIZE},format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
    goal = list(TARGET)
    raw = base
    for _ in range(4):  # refine: grain makes card-size percentiles respond non-linearly
        raw = base.translate(lut_for(card_percentiles(base), goal))
        got = card_percentiles(raw)
        goal = [max(0, min(255, g + (t - r))) for g, t, r in zip(goal, TARGET, got)]
        goal = [max(goal[i], goal[i - 1] + 1) if i else goal[i] for i in range(len(goal))]
    print('card percentiles', card_percentiles(raw), 'target', TARGET, file=sys.stderr)
    ff(['-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', f'{SIZE}x{SIZE}', '-i', '-', '-c:v', 'libwebp', '-quality', '86', outp], raw)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
