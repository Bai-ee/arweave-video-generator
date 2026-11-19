#!/usr/bin/env python3
"""Read-only: build a draft catalog of archive.org collection 'ravearchive' (Rave Archive, Dan Labovitch).
Public archive.org APIs only; caches per-item metadata in OUT/meta/. No writes anywhere else.
Usage: python3 -I scripts/ravearchive/catalog.py [OUT_DIR]"""
import json, os, re, sys, csv, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

OUT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('UE_RAVEARCHIVE_DATA', os.path.expanduser('~/server/data/ravearchive'))
META = os.path.join(OUT, 'meta'); os.makedirs(META, exist_ok=True)
UA = {'User-Agent': 'ue-catalog-draft/0.1 (read-only)'}

def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(2 * (i + 1))

# Chicago DJs / terms. 'strong' = known Chicago artist; 'term' = keyword evidence.
CHICAGO_DJS = ['derrick carter','terry mullan','dj sneak','mark farina','paul johnson','bad boy bill','gene farris',
 'boo williams','dj funk','ron hardy','green velvet','cajmere','frankie knuckles','farley','lil louis','dj pierre',
 'steve hurley','silk hurley','ralphi rosario','julian perez','jumpin perez','mickey oliver','kenny jason','scott silz',
 'hot mix 5','dj rush','dj deeon','dj slugo','rp boo','dj rashad','dj spinn','traxman','gene hunt','jamie 3:26',
 'terry hunter','tyree cooper','lady d','dj heather','colette','jesse de la pena','justin long','mike dunn','armando',
 'robert owens','marshall jefferson','larry heard','ron trent','chez damier','glenn underground','hieroglyphic being',
 'joe smooth','mark grusane','dj skull','felix da housecat','johnny fiasco','teri bristol','hyperactive','hitman wilson',
 'mike hitman','dj milton','dj sneak','k-alexi','k alexi','phuture','spanky','tim shumaker','george thompson',
 'curtis jones','gant-man','dj clent','paul anthony','sneak']
TERMS = ['chicago','wbmx','wgci','b96','hot mix','smartbar','music box','warehouse','juke','ghetto house','ghetto','footwork',
 'acid','jackin','jack','dance mania','relief records','cajual']

def norm(s): return re.sub(r'\s+', ' ', re.sub(r'[_\-\.\(\)\[\]]+', ' ', s or '')).strip().lower()

def chicago(text):
    t = ' ' + norm(text) + ' '
    djs = sorted({d for d in CHICAGO_DJS if f' {d} ' in t or (len(d) > 6 and d in t)})
    terms = sorted({w for w in TERMS if f' {w} ' in t})
    score = 2 * len(djs) + len(terms)
    return djs, terms, ('likely' if djs else 'maybe' if terms else 'no'), score

def split_artist(fname, title):
    base = re.sub(r'\.(mp3|ogg)$', '', fname, flags=re.I)
    base = re.sub(r'_?\((side|part|tape)[^)]*\)$', '', base, flags=re.I)
    if '_-_' in base:
        a, t = base.split('_-_', 1)
        return a.replace('_', ' ').strip(), t.replace('_', ' ').strip()
    return '', (title or base.replace('_', ' ')).strip()

def dur(v):
    v = str(v or '').strip()
    if not v: return 0.0
    if ':' in v:
        n = [float(x) for x in v.split(':')]
        return sum(x * 60 ** i for i, x in enumerate(reversed(n)))
    try: return float(v)
    except ValueError: return 0.0

def item(ident):
    p = os.path.join(META, ident + '.json')
    if os.path.exists(p):
        return json.load(open(p))
    d = get('https://archive.org/metadata/' + urllib.parse.quote(ident))
    json.dump(d, open(p, 'w'))
    return d

def main():
    q = 'https://archive.org/advancedsearch.php?' + urllib.parse.urlencode(
        {'q': 'collection:ravearchive', 'fl[]': ['identifier', 'title'], 'rows': 5000, 'output': 'json'}, doseq=True)
    docs = get(q)['response']['docs']
    print('items', len(docs), file=sys.stderr)
    with ThreadPoolExecutor(4) as ex:
        metas = list(ex.map(lambda d: (d, item(d['identifier'])), docs))
    rows = []
    for d, m in metas:
        ident = d['identifier']; md = m.get('metadata', {}); files = m.get('files', [])
        mp3s = sorted([f for f in files if f['name'].lower().endswith('.mp3')], key=lambda f: f['name'])
        imgs = [f['name'] for f in files if f.get('format') == 'JPEG' and not f['name'].endswith('_thumb.jpg')]
        title = re.sub(r'\s+', ' ', md.get('title', d.get('title', ''))).strip()
        artist, mixtitle = split_artist(mp3s[0]['name'], title) if mp3s else ('', title)
        djs, terms, verdict, score = chicago(' '.join([title, artist, mixtitle, ' '.join(f['name'] for f in mp3s)]))
        secs = sum(dur(f.get('length')) for f in mp3s)
        rows.append({
            'id': ident, 'artist': artist, 'title': mixtitle, 'raw_title': title,
            'sides': len(mp3s), 'minutes': round(secs / 60, 1),
            'mp3_urls': [f'https://archive.org/download/{ident}/' + urllib.parse.quote(f['name']) for f in mp3s],
            'cover_url': (f'https://archive.org/download/{ident}/' + urllib.parse.quote(imgs[0])) if imgs else f'https://archive.org/services/img/{ident}',
            'page_url': f'https://archive.org/details/{ident}', 'added': md.get('addeddate', ''),
            'chicago': verdict, 'chicago_score': score, 'matched_djs': djs, 'matched_terms': terms,
            'credit': 'Rave Archive (ravearchive.com) via Internet Archive',
        })
    rows.sort(key=lambda r: (-r['chicago_score'], r['artist'].lower(), r['title'].lower()))
    json.dump(rows, open(os.path.join(OUT, 'catalog.json'), 'w'), indent=1)
    with open(os.path.join(OUT, 'catalog.csv'), 'w', newline='') as fh:
        w = csv.writer(fh); w.writerow(['chicago', 'score', 'artist', 'title', 'sides', 'minutes', 'matched_djs', 'matched_terms', 'page_url', 'id'])
        for r in rows: w.writerow([r['chicago'], r['chicago_score'], r['artist'], r['title'], r['sides'], r['minutes'], '; '.join(r['matched_djs']), '; '.join(r['matched_terms']), r['page_url'], r['id']])
    from collections import Counter
    c = Counter(r['chicago'] for r in rows)
    noaudio = sum(1 for r in rows if not r['sides'])
    noartist = sum(1 for r in rows if not r['artist'])
    print(json.dumps({'items': len(rows), 'chicago': c, 'no_audio': noaudio, 'no_artist_split': noartist,
                      'hours_total': round(sum(r['minutes'] for r in rows) / 60)}, default=dict))

main()
