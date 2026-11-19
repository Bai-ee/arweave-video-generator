#!/usr/bin/env python3
"""Locked artist portraits: verify, render or check sources against config/artist-portraits.json.

  python3 -I scripts/artist-portraits.py verify              # committed WebPs match their locked sha256
  python3 -I scripts/artist-portraits.py render <slug> [--out PATH]
                                                             # re-render one portrait from its recipe
                                                             # (default: a temp file, compared to the lock;
                                                             #  --out website/... to replace the committed file)
  python3 -I scripts/artist-portraits.py sources             # source photos present and unchanged

Source photos live OUTSIDE the repo (the repo is public and the photos are not
ours to redistribute): $UE_PORTRAIT_SOURCES, default ~/server/data/artist-portraits/sources.
"""
import hashlib, json, os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, 'config', 'artist-portraits.json')
SOURCES = os.environ.get('UE_PORTRAIT_SOURCES', os.path.expanduser('~/server/data/artist-portraits/sources'))
TREAT = os.path.join(ROOT, 'scripts', 'artist-portrait-treatment.sh')


def sha(path):
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()


def load():
    with open(CONFIG) as fh:
        return json.load(fh)['portraits']


def find(slug):
    for p in load():
        if p['slug'] == slug:
            return p
    sys.exit(f'no locked portrait for slug {slug!r}')


def render(p, out):
    src = os.path.join(SOURCES, p['source']['file'])
    if not os.path.exists(src):
        sys.exit(f'missing source photo {src} (download {p["source"]["url"]})')
    if sha(src) != p['source']['sha256']:
        sys.exit(f'source photo {src} changed (sha256 mismatch); refusing to render')
    env = dict(os.environ)
    for k in ('CURVE', 'SM', 'SH', 'HB', 'BL', 'BR', 'LS', 'TONE'):
        env.pop(k, None)
    env.update(p.get('env', {}))
    subprocess.run([TREAT, src, out, p['crop']], env=env, check=True, cwd=ROOT,
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return sha(out)


def main(argv):
    cmd = argv[1] if len(argv) > 1 else 'verify'
    bad = 0
    if cmd == 'verify':
        for p in load():
            got = sha(os.path.join(ROOT, p['output']))
            ok = got == p['outputSha256']
            bad += not ok
            print(('OK      ' if ok else 'CHANGED ') + p['output'])
    elif cmd == 'sources':
        for p in load():
            src = os.path.join(SOURCES, p['source']['file'])
            ok = os.path.exists(src) and sha(src) == p['source']['sha256']
            bad += not ok
            print(('OK      ' if ok else 'MISSING/CHANGED ') + src)
    elif cmd == 'render':
        if len(argv) < 3:
            sys.exit('usage: render <slug> [--out PATH]')
        p = find(argv[2])
        out = argv[argv.index('--out') + 1] if '--out' in argv else os.path.join(tempfile.mkdtemp(), 'portrait.webp')
        got = render(p, out)
        same = got == p['outputSha256']
        print(f'wrote {out}\n{"matches the lock" if same else "DIFFERS from the lock (new toolchain or changed treatment): review, then update outputSha256"}')
        bad += 0 if same else 1
    else:
        sys.exit(__doc__)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
