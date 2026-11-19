#!/usr/bin/env python3
"""Keep a private copy of the Rave Archive mixes UE streams, on the NAS.

  python3 -I scripts/ravearchive/mirror-nas.py [DEST] [--verify]

Reads the artist records in ~/server/data/ravearchive/*-artist.json, and for every archive item they
use, downloads its ORIGINAL mp3s and photos to DEST/<ARTIST>/<item id>/ plus a credit.json.
Each file is written to .part, checked against archive.org's md5, then renamed. Re-runs skip files
that are already present with the right md5. Never deletes anything.
Also copies the pipeline's own state (portrait sources, artist records, Firestore backups) to
DEST/_pipeline-data/, since ~/server/data has no other backup.
"""
import glob, hashlib, json, os, sys, time, urllib.parse, urllib.request

RA = os.environ.get('UE_RAVEARCHIVE_DATA', os.path.expanduser('~/server/data/ravearchive'))
DEST = next((a for a in sys.argv[1:] if not a.startswith('--')), None) or '/Volumes/bryan/DJMIXES/Rave Archive'
UA = {'User-Agent': 'ue-catalog-draft/0.1 (private copy)'}
KEEP = ('.mp3', '.jpg', '.jpeg', '.png')


def md5(path):
    h = hashlib.md5()
    with open(path, 'rb') as fh:
        for b in iter(lambda: fh.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def fetch(url, out, want):
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r, open(out + '.part', 'wb') as fh:
                while True:
                    b = r.read(1 << 20)
                    if not b:
                        break
                    fh.write(b)
            if md5(out + '.part') == want:
                os.replace(out + '.part', out)
                return True
            print('  md5 mismatch, retry', os.path.basename(out), flush=True)
        except Exception as e:
            print('  error', os.path.basename(out), e, flush=True)
        time.sleep(5 * (attempt + 1))
    return False


def main():
    done = skipped = failed = 0
    for rec_path in sorted(glob.glob(os.path.join(RA, '*-artist.json'))):
        rec = json.load(open(rec_path))
        artist = rec['artistName']
        items = sorted({m['mixNote'].split('/details/')[1].split('. ')[0].rstrip('.') for m in rec['mixes']})
        for ident in items:
            meta = json.load(open(os.path.join(RA, 'meta', ident + '.json')))
            d = os.path.join(DEST, artist, ident)
            os.makedirs(d, exist_ok=True)
            md = meta.get('metadata', {})
            json.dump({'artist': artist, 'item': ident, 'title': md.get('title'), 'date': md.get('date'),
                       'source': f'https://archive.org/details/{ident}',
                       'credit': 'Rave Archive (ravearchive.com, Dan Labovitch) via the Internet Archive. '
                                 'Owner permission to use, 2026-11-18. Private copy; not for redistribution.'},
                      open(os.path.join(d, 'credit.json'), 'w'), indent=1)
            for f in meta['files']:
                if f.get('source') != 'original' or not f['name'].lower().endswith(KEEP):
                    continue
                out = os.path.join(d, os.path.basename(f['name']))
                # md5 was checked when the file landed; re-runs only compare size (fast over SMB).
                # --verify re-reads every file and checks its md5 again.
                if os.path.exists(out) and os.path.getsize(out) == int(f.get('size', -1)) and (
                        '--verify' not in sys.argv or md5(out) == f['md5']):
                    skipped += 1
                    continue
                url = f'https://archive.org/download/{ident}/' + urllib.parse.quote(f['name'])
                ok = fetch(url, out, f['md5'])
                done += ok
                failed += not ok
                print(('OK   ' if ok else 'FAIL ') + f'{artist}/{ident}/{f["name"]}', flush=True)
    # Pipeline state that exists nowhere else: portrait source photos, artist records, specs-in-use
    # and Firestore backups. Copied (never deleted) to DEST/_pipeline-data/.
    import shutil
    home = os.path.expanduser('~')
    for src in [os.path.join(home, 'server/data/artist-portraits/sources'),
                os.path.join(home, 'server/data/ue-firestore-backups'),
                os.path.join(home, 'server/data/jeffcraven'), RA]:
        if not os.path.isdir(src):
            continue
        dst = os.path.join(DEST, '_pipeline-data', os.path.relpath(src, os.path.join(home, 'server/data')))
        for root, dirs, names in os.walk(src):
            dirs[:] = [x for x in dirs if x != 'meta']          # archive metadata cache is re-fetchable
            for n in names:
                s = os.path.join(root, n)
                t = os.path.join(dst, os.path.relpath(s, src))
                if not os.path.exists(t) or os.path.getsize(t) != os.path.getsize(s):
                    os.makedirs(os.path.dirname(t), exist_ok=True)
                    shutil.copy2(s, t)
    print(json.dumps({'downloaded': done, 'already_there': skipped, 'failed': failed, 'dest': DEST}), flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
