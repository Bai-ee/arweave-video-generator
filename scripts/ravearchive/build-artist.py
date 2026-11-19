#!/usr/bin/env python3
"""Read-only: build a UE artist record (Firestore system/artists shape) from Rave Archive items.

  python3 -I scripts/ravearchive/build-artist.py config/ravearchive/<slug>.json [OUT_DIR]

spec.json: {"artistName": "MARK FARINA", "slug": "markfarina", "artistGenre": "house",
            "items": [{"id": "rave_Mark_Farina_Mushroom_Jazz", "with": ""}, ...]}

One mix per MP3 side, streamed from archive.org with the player's #/<id> key.
Every URL is range-probed (must answer 206). Writes OUT/<slug>-artist.json; touches nothing else.
"""
import base64, hashlib, json, os, re, sys, urllib.parse, urllib.request

OUT = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('UE_RAVEARCHIVE_DATA', os.path.expanduser('~/server/data/ravearchive'))
META = os.path.join(OUT, 'meta')
UA = {'User-Agent': 'ue-catalog-draft/0.1 (read-only)'}
CREDIT = 'Rave Archive (ravearchive.com) via the Internet Archive: https://archive.org/details/{id}. Owner permission, 2026-11-18.'


def item(ident):
    p = os.path.join(META, ident + '.json')
    if not os.path.exists(p):
        with urllib.request.urlopen(urllib.request.Request(
                'https://archive.org/metadata/' + urllib.parse.quote(ident), headers=UA), timeout=60) as r:
            d = json.load(r)
        json.dump(d, open(p, 'w'))
    return json.load(open(p))


def key(url):
    return base64.urlsafe_b64encode(hashlib.sha256(url.encode()).digest()).decode().rstrip('=')


def probe(url):
    req = urllib.request.Request(url, headers={**UA, 'Range': 'bytes=0-99'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except Exception as e:
        return getattr(e, 'code', str(e))


def mmss(secs):
    s = int(round(secs))
    return f'{s // 60}:{s % 60:02d}'


def side_title(fname, tag_title, artist_prefix):
    base = re.sub(r'\.mp3$', '', fname, flags=re.I)
    if '_-_' in base:
        base = base.split('_-_', 1)[1]
    elif ' - ' in base:
        parts = base.split(' - ')
        base = ' - '.join(parts[1:]) if len(parts) > 1 else base
    base = re.sub(r'-(19|20)\d\d$', '', base)           # trailing -1995 goes to mixDateYear
    t = re.sub(r'\s+', ' ', base.replace('_', ' ')).strip()
    return clean(t, artist_prefix)


def clean(t, artist):
    """House style: 'Title (Side A)'; years live in mixDateYear, not the title."""
    t = re.sub(r'^\((19|20)\d\d\)\s*', '', t)                       # leading (1996)
    t = re.sub(r'-(19|20)\d\d(?=\s|\)|$)', '', t)                    # Basic Foods-1995
    t = re.sub(r'(?<=[A-Za-z])(19|20)\d\d$', '', t)                   # Rocketship1997
    t = re.sub(r',?\s+(19|20)\d\d$', '', t)                          # Live In Duluth 1995
    first = artist.split()[-1].title()                                # 'Sneak Signature Sounds' -> 'Signature Sounds'
    t = re.sub(rf'^{re.escape(first)}\s+', '', t)
    m = re.search(r'\s*-?\s*\bSide ([A-D])\b(.*)$', t)
    if m and not re.search(r'\(Side [A-D]\)$', t):
        rest = m.group(2).strip(' -')
        t = t[:m.start()].strip(' -') + f' (Side {m.group(1)}' + (f' - {rest}' if rest else '') + ')'
    t = re.sub(r'\s+', ' ', t).strip()
    return t[:1].upper() + t[1:]


def year(fname, md):
    m = re.search(r'(?<!\d)(19[89]\d|20[0-2]\d)(?!\d)', fname + ' ' + md.get('title', ''))
    if m:
        return m.group(1)
    d = str(md.get('date', ''))
    return d[:4] if re.match(r'(19[89]\d|20[0-2]\d)', d) else '??'


def main():
    spec = json.load(open(sys.argv[1]))
    mixes, problems = [], []
    for it in spec['items']:
        ident, with_ = it['id'], it.get('with', '')
        m = item(ident)
        md = m.get('metadata', {})
        files = m.get('files', [])
        mp3s = sorted([f for f in files if f['name'].lower().endswith('.mp3') and f.get('source') == 'original'],
                      key=lambda f: f['name'])
        imgs = [f['name'] for f in files if f.get('format') == 'JPEG' and f.get('source') == 'original']
        cover = f'https://archive.org/download/{ident}/' + urllib.parse.quote(imgs[0]) if imgs else ''
        if not mp3s:
            problems.append(f'{ident}: no original mp3')
            continue
        for f in mp3s:
            url = f'https://archive.org/download/{ident}/' + urllib.parse.quote(f['name'])
            st = probe(url)
            if st != 206:
                problems.append(f'{ident}/{f["name"]}: range probe {st}')
                continue
            stem = re.sub(r'\.mp3$', '', f['name'], flags=re.I)
            title = spec.get('rename', {}).get(stem) or side_title(f['name'], f.get('title', ''), spec['artistName'])
            if with_ and 'with' not in title.lower():
                title += f' (with {with_})'
            mixes.append({
                'mixTitle': title,
                'mixArweaveURL': url + '#/' + key(url),
                'mixDateYear': year(f['name'], md),
                'mixDuration': mmss(float(f.get('length') or 0)),
                'mixImageFilename': cover,
                'mixNote': CREDIT.format(id=ident),
            })
    titles = [x['mixTitle'] for x in mixes]
    dups = sorted({t for t in titles if titles.count(t) > 1})
    rec = {'artistName': spec['artistName'], 'artistFilename': spec['slug'] + '.html',
           'artistImageFilename': f'img/about/{spec["slug"]}/portrait.webp',
           'artistGenre': spec.get('artistGenre', 'house'), 'mixes': mixes}
    out = os.path.join(OUT, spec['slug'] + '-artist.json')
    json.dump(rec, open(out, 'w'), indent=1)
    print(json.dumps({'out': out, 'items': len(spec['items']), 'mixes': len(mixes),
                      'hours': round(sum(int(x['mixDuration'].split(':')[0]) for x in mixes) / 60, 1),
                      'duplicate_titles': dups, 'problems': problems}, indent=1))
    return 1 if problems else 0


if __name__ == '__main__':
    sys.exit(main())
