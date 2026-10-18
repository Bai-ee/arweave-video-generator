// Page-aware gateway warming policy -- executable spec written BEFORE
// website/js/ue-warm.js exists (project's required first action; see
// docs/plans/... WARMING-CONTRACT.md in the Bballi_Portfolio workspace).
// These tests are expected to fail with the "ue-warm.js not implemented
// yet" message from tests/helpers/load-ue-warm.mjs until that file lands.
//
// Fixtures below mirror the REAL pages -- every href/txid/count was
// extracted programmatically from website/index.html, archive.html,
// acidman.html, andrewemil.html, and akila.html on 2026-09-08 (not
// hand-typed), so a passing suite here is evidence against the actual
// site markup, not an invented shape.
//
// JUDGMENT CALLS made while writing this spec (contract did not pin these
// down; flagged here for the implementer -- see also the per-test comments
// at the call site of each):
//   1. `policyFor(pageType, overrideAttr)`: when overrideAttr is a valid
//      mode ('list'|'viewport'|'none'), it is treated as UNCAPPED (limit 0)
//      rather than inheriting the derived page-type's numeric limit, since
//      the override attribute only names a mode, not a limit.
//   2. `selectInitialTargets(anchors, {mode:'none', ...})` returns [] even
//      when `anchors` is non-empty -- defensive, so browser glue can call
//      it uniformly without checking mode itself first.
//   3. `prioritize(txid)` on a txid the queue has NEVER seen (no prior
//      enqueue()) is treated as a harmless no-op, not as "create a queue
//      entry with no urls" -- the public signature takes no `urls` param,
//      so there is nothing to request. See tests/warm-queue.test.mjs.
//   4. `request(url, signal)`'s AbortSignal-based cancellation contract and
//      createWarmQueue's exact `stats()` shape are also this suite's calls
//      to make; see the header comment in tests/warm-queue.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDoc } from './helpers/fake-dom.mjs';
import { loadCore } from './helpers/load-core.mjs';
import { loadUeWarm } from './helpers/load-ue-warm.mjs';

const UEPlayerCore = loadCore();

// Loaded once, lazily surfaced per-test (see core() below) so every
// individual test() reports its OWN clear failure instead of one giant
// module-load crash taking down the whole file's test collection.
let UEWarm;
let loadErr = null;
try {
  UEWarm = loadUeWarm();
} catch (err) {
  loadErr = err;
}
function core() {
  if (loadErr) throw loadErr;
  return UEWarm;
}

const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM'; // real UE mix txid, appears on 4 real pages

function anchor(attrs) {
  return { tag: 'a', attrs: attrs };
}

/* ---------------------------------------------------------------------
   Fixtures -- verified real counts (2026-09-08):
     home:      featured-hero (1, data-featured-mix) + latest-mixes (6)  = 7
     artist:    artist-mixes, 2-3 (acidman=3 unique, andrewemil=2 unique,
                akila=2 anchors sharing ONE real txid -- see dedupe test)
     archive:   archive-catalog, 45 (44 playable + 1 data-unplayable="true")
     selectors: residents-directory, 0
     about:     about-content, 0
   --------------------------------------------------------------------- */

const HOME_DOC = makeFakeDoc({
  children: [
    {
      tag: 'section', attrs: { 'data-section': 'featured-hero' },
      children: [
        anchor({
          'data-playlist': '', 'data-featured-mix': '',
          href: 'https://arweave.net/Y5DfJ54VC_2-gKJ90Ts_RJZhhDKsV869SdsYB0n9GqM'
        })
      ]
    },
    {
      tag: 'section', attrs: { 'data-section': 'latest-mixes' },
      children: [
        { tag: 'article', attrs: { class: 'mix-card' }, children: [
          anchor({ 'data-playlist': '', href: 'https://arweave.net/obNw2Z8Iqiyb20nWRLGzLD0zeHQyoyPVkM7J7KpEGRc' })
        ] },
        { tag: 'article', attrs: { class: 'mix-card' }, children: [
          anchor({ 'data-playlist': '', href: 'https://arweave.net/Ex1n-m0Pdea7Kfm3a0F9IkT875idE2tyyE1LtXbxZSs' })
        ] },
        { tag: 'article', attrs: { class: 'mix-card' }, children: [
          anchor({ 'data-playlist': '', href: 'https://c2ejenrz2h6ng4vmnd73p5hhyvilkp4qhbcnwjhnjjwminyndq4a.arweave.net/FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg' })
        ] },
        { tag: 'article', attrs: { class: 'mix-card' }, children: [
          anchor({ 'data-playlist': '', href: 'https://yr7svqh3h2l5ka7nlu5sehndf5ekaytclzaje5z4b7of3xs4g3zq.arweave.net/xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM' })
        ] },
        { tag: 'article', attrs: { class: 'mix-card' }, children: [
          anchor({ 'data-playlist': '', href: 'https://unauv36jd54gznlsom5ojf27qw52nxush5txy4psfdyosjexr26q.arweave.net/o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0' })
        ] },
        { tag: 'article', attrs: { class: 'mix-card' }, children: [
          anchor({ 'data-playlist': '', href: 'https://nbdlqhjegffe2b43r4pz5db2nnluh6b6osbilcbqrlsc7e3ecxasq.arweave.net/aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU' })
        ] }
      ]
    }
  ]
});
const HOME_EXPECTED_5 = [
  'Y5DfJ54VC_2-gKJ90Ts_RJZhhDKsV869SdsYB0n9GqM', // featured -- must be first
  'obNw2Z8Iqiyb20nWRLGzLD0zeHQyoyPVkM7J7KpEGRc',
  'Ex1n-m0Pdea7Kfm3a0F9IkT875idE2tyyE1LtXbxZSs',
  'FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg',
  'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM'
  // dropped: o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0, aEa4HSQx...CuCU
];

function artistDoc(rows) {
  return makeFakeDoc({
    children: [
      { tag: 'section', attrs: { 'data-section': 'artist-detail' }, children: [] },
      {
        tag: 'section', attrs: { 'data-section': 'artist-mixes' },
        children: rows.map(function (attrs) {
          return { tag: 'div', attrs: { class: 'catalog-row' }, children: [anchor(attrs)] };
        })
      }
    ]
  });
}

// acidman.html -- 3 unique playable anchors, no duplicates
const ACIDMAN_DOC = artistDoc([
  { 'data-playlist': '', href: 'https://tsksz4eeemr4tlq46gvx2j3ikuv2xvzv7pzxft4dcc76qn3g3frq.arweave.net/nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM' },
  { 'data-playlist': '', href: 'https://pq4y62fmg2rlmdprylwbzvhf6weeg265x6wpdoknwfosey3pb7ua.arweave.net/fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g' },
  { 'data-playlist': '', href: 'https://2a3ilgvxa3h3qnbgs5kcfr3tclfsuf6w2qztps4igikcwczf2uba.arweave.net/0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI' }
]);

// andrewemil.html -- 2 unique playable anchors, no duplicates
const ANDREWEMIL_DOC = artistDoc([
  { 'data-playlist': '', href: 'https://yr7svqh3h2l5ka7nlu5sehndf5ekaytclzaje5z4b7of3xs4g3zq.arweave.net/xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM' },
  { 'data-playlist': '', href: 'https://i3iyj63muibfla4rgtxiuis72fy6iwbg3rcz7vda2try7xr3kzia.arweave.net/RtGE-2yiAlWDkTTuiiJf0XHkWCbcRZ_UYNTjj947VlA' }
]);

// akila.html -- REAL on-page duplicate: 2 anchors (different mix titles),
// SAME txid FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg (also reused on
// index.html's latest-mixes card above -- this mix appears at least twice
// site-wide under the same artist).
const AKILA_DOC = artistDoc([
  { 'data-playlist': '', href: 'https://c2ejenrz2h6ng4vmnd73p5hhyvilkp4qhbcnwjhnjjwminyndq4a.arweave.net/FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg' },
  { 'data-playlist': '', href: 'https://c2ejenrz2h6ng4vmnd73p5hhyvilkp4qhbcnwjhnjjwminyndq4a.arweave.net/FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg' }
]);

function fakeArchiveTxid(n) {
  return ('archTxid' + String(n).padStart(3, '0')).padEnd(43, '0');
}

function buildArchiveDoc(opts) {
  opts = opts || {};
  var rows = [];
  for (var i = 0; i < 44; i++) {
    rows.push({ tag: 'div', attrs: { class: 'catalog-row' }, children: [
      anchor({ 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(i) })
    ] });
  }
  // the real HPIT Promo Mix row -- verbatim from archive.html, including
  // its malformed (non-43-char) href, which is ALSO unparseable as a txid
  // regardless of the explicit data-unplayable exclusion.
  rows.push({ tag: 'div', attrs: { class: 'catalog-row is-unplayable' }, children: [
    anchor({ 'data-playlist': '', 'data-unplayable': 'true', href: 'https://arweave.net/neH-PrcWXd71JCZayTX' })
  ] });
  var sectionAttrs = { 'data-section': 'archive-catalog' };
  if (opts.override) sectionAttrs['data-warm-policy'] = opts.override;
  return makeFakeDoc({
    children: [
      { tag: 'section', attrs: { 'data-section': 'archive-header' }, children: [] },
      { tag: 'section', attrs: sectionAttrs, children: rows }
    ]
  });
}
const ARCHIVE_DOC = buildArchiveDoc();
const ARCHIVE_DOC_LIST_OVERRIDE = buildArchiveDoc({ override: 'list' });

const SELECTORS_DOC = makeFakeDoc({
  children: [
    { tag: 'section', attrs: { 'data-section': 'residents-header' }, children: [] },
    {
      tag: 'section', attrs: { 'data-section': 'residents-directory' },
      children: [{ tag: 'a', attrs: { href: 'acidman.html' } }, { tag: 'a', attrs: { href: 'akila.html' } }]
    }
  ]
});

const ABOUT_DOC = makeFakeDoc({
  children: [
    {
      tag: 'section', attrs: { 'data-section': 'about-content' },
      children: [{ tag: 'a', attrs: { href: 'https://docs.google.com/forms/d/e/xyz' } }]
    },
    { tag: 'section', attrs: { 'data-section': 'about-flyers' }, children: [] }
  ]
});

const UNKNOWN_DOC = makeFakeDoc({
  children: [{ tag: 'section', attrs: { 'data-section': 'checkout-flow' }, children: [] }]
});

function playableAnchors(doc) {
  return doc.querySelectorAll('a[data-playlist], a[data-link]');
}

/* ---------------------------------------------------------------------
   Deliverable 1 self-check -- fake-dom.mjs is new, untested infrastructure
   itself; a handful of direct assertions here give confidence the fixtures
   above mean what they look like they mean.
   --------------------------------------------------------------------- */
describe('fake-dom helper (self-check)', () => {
  test('querySelector finds by exact attribute value, not mere presence', () => {
    assert.notEqual(HOME_DOC.querySelector('[data-section="featured-hero"]'), null);
    assert.equal(HOME_DOC.querySelector('[data-section="archive-catalog"]'), null);
  });

  test('querySelectorAll supports a comma-separated selector list', () => {
    var found = playableAnchors(ACIDMAN_DOC);
    assert.equal(found.length, 3);
    found.forEach(function (el) { assert.equal(el.tag, 'a'); });
  });

  test('closest walks up to the nearest matching ancestor', () => {
    var anchorEl = playableAnchors(ACIDMAN_DOC)[0];
    var section = anchorEl.closest('[data-section]');
    assert.notEqual(section, null);
    assert.equal(section.getAttribute('data-section'), 'artist-mixes');
  });

  test('closest returns null when no ancestor matches', () => {
    var anchorEl = playableAnchors(ACIDMAN_DOC)[0];
    assert.equal(anchorEl.closest('.nonexistent-class'), null);
  });
});

/* ---------------------------------------------------------------------
   1. Page detection and policy
   --------------------------------------------------------------------- */
describe('detectPageType', () => {
  test('resolves each of the five real page types correctly', () => {
    var UEWarm = core();
    assert.equal(UEWarm.detectPageType(HOME_DOC), 'home');
    assert.equal(UEWarm.detectPageType(ACIDMAN_DOC), 'artist');
    assert.equal(UEWarm.detectPageType(ARCHIVE_DOC), 'archive');
    assert.equal(UEWarm.detectPageType(SELECTORS_DOC), 'selectors');
    assert.equal(UEWarm.detectPageType(ABOUT_DOC), 'about');
  });

  test('an unrecognised page resolves to unknown', () => {
    assert.equal(core().detectPageType(UNKNOWN_DOC), 'unknown');
    assert.equal(core().detectPageType(makeFakeDoc({ children: [] })), 'unknown');
  });

  test('detection never depends on artist names, filenames, or data-queue-idx', () => {
    // this fake-dom has no document.location/URL concept at all, so
    // filename-independence is structural: detectPageType(doc) cannot see
    // a filename through this harness even if it tried. Artist-name and
    // data-queue-idx independence is asserted directly below with a
    // deliberately weird/hydrated-looking fixture.
    var weirdDoc = artistDoc([
      { 'data-playlist': '', 'data-artist': 'ZZZ_NOT_A_REAL_ARTIST', 'data-queue-idx': '99', href: 'https://arweave.net/' + fakeArchiveTxid(500) },
      { 'data-playlist': '', 'data-artist': '', 'data-queue-idx': '0', href: 'https://arweave.net/' + fakeArchiveTxid(501) }
    ]);
    assert.equal(core().detectPageType(weirdDoc), 'artist');
    var targets = core().selectInitialTargets(playableAnchors(weirdDoc), core().policyFor('artist', null));
    assert.equal(targets.length, 2);
  });
});

describe('policyFor', () => {
  test('home / artist / archive resolve to the exact contract policy', () => {
    var UEWarm = core();
    assert.deepEqual(UEWarm.policyFor('home', null), { mode: 'list', limit: 5 });
    assert.deepEqual(UEWarm.policyFor('artist', null), { mode: 'list', limit: 0 });
    assert.deepEqual(UEWarm.policyFor('archive', null), { mode: 'viewport', limit: 0 });
  });

  test('unknown, selectors, and about all resolve to mode: none', () => {
    var UEWarm = core();
    assert.equal(UEWarm.policyFor('selectors', null).mode, 'none');
    assert.equal(UEWarm.policyFor('about', null).mode, 'none');
    assert.equal(UEWarm.policyFor('unknown', null).mode, 'none');
  });

  test('a valid data-warm-policy override replaces the derived mode', () => {
    var UEWarm = core();
    assert.equal(UEWarm.policyFor('archive', null).mode, 'viewport');
    var overridden = UEWarm.policyFor('archive', 'list');
    assert.equal(overridden.mode, 'list');
    // JUDGMENT CALL (see file header #1): an override names a mode only,
    // not a limit, so we treat it as uncapped.
    assert.equal(overridden.limit, 0);
    assert.equal(UEWarm.policyFor('home', 'none').mode, 'none');
  });

  test('an unrecognized override value is ignored -- the derived policy stands', () => {
    var UEWarm = core();
    var result = UEWarm.policyFor('archive', 'bogus-value');
    assert.equal(result.mode, 'viewport');
    assert.equal(result.limit, 0);
  });
});

/* ---------------------------------------------------------------------
   2. Target selection
   --------------------------------------------------------------------- */
describe('selectInitialTargets -- homepage', () => {
  test('selects the featured mix first, then at most 4 more -- 5 total, never 7', () => {
    var UEWarm = core();
    var anchors = playableAnchors(HOME_DOC);
    assert.equal(anchors.length, 7, 'fixture sanity: real homepage has 7 playable anchors');
    var targets = UEWarm.selectInitialTargets(anchors, UEWarm.policyFor('home', null));
    assert.deepEqual(targets.map(function (t) { return t.txid; }), HOME_EXPECTED_5);
  });

  test('featured-first holds even when the featured anchor is not DOM-first', () => {
    // synthetic, order-scrambled anchor list -- proves the algorithm
    // actively promotes data-featured-mix rather than relying on markup
    // happening to put it first (which it does on the real page).
    var UEWarm = core();
    var scrambled = [
      anchor({ 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(1) }),
      anchor({ 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(2) }),
      anchor({ 'data-playlist': '', 'data-featured-mix': '', href: 'https://arweave.net/' + fakeArchiveTxid(3) }),
      anchor({ 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(4) }),
      anchor({ 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(5) }),
      anchor({ 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(6) }),
      anchor({ 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(7) })
    ];
    var targets = UEWarm.selectInitialTargets(scrambled, UEWarm.policyFor('home', null));
    assert.equal(targets.length, 5);
    assert.equal(targets[0].txid, fakeArchiveTxid(3), 'featured must be first regardless of DOM position');
    assert.deepEqual(targets.slice(1).map(function (t) { return t.txid; }), [
      fakeArchiveTxid(1), fakeArchiveTxid(2), fakeArchiveTxid(4), fakeArchiveTxid(5)
    ]);
  });
});

describe('selectInitialTargets -- artist pages', () => {
  test('selects every unique playable anchor, no cap (acidman.html, 3 unique)', () => {
    var UEWarm = core();
    var targets = UEWarm.selectInitialTargets(playableAnchors(ACIDMAN_DOC), UEWarm.policyFor('artist', null));
    assert.equal(targets.length, 3);
    assert.deepEqual(targets.map(function (t) { return t.txid; }).sort(), [
      '0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI',
      'fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g',
      'nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM'
    ].sort());
  });

  test('selects every unique playable anchor, no cap (andrewemil.html, 2 unique)', () => {
    var UEWarm = core();
    var targets = UEWarm.selectInitialTargets(playableAnchors(ANDREWEMIL_DOC), UEWarm.policyFor('artist', null));
    assert.equal(targets.length, 2);
  });

  test('duplicate txids across different anchors dedupe to one target (akila.html, real on-page duplicate)', () => {
    var UEWarm = core();
    var anchors = playableAnchors(AKILA_DOC);
    assert.equal(anchors.length, 2, 'fixture sanity: akila.html really has 2 anchors sharing 1 txid');
    var targets = UEWarm.selectInitialTargets(anchors, UEWarm.policyFor('artist', null));
    assert.equal(targets.length, 1);
    assert.equal(targets[0].txid, 'FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg');
  });
});

describe('selectInitialTargets -- archive', () => {
  test('initial selection is empty -- viewport mode queues nothing at load, even across all 45 rows', () => {
    var UEWarm = core();
    var anchors = playableAnchors(ARCHIVE_DOC);
    assert.equal(anchors.length, 45, 'fixture sanity: real archive.html has 45 playable anchors');
    var targets = UEWarm.selectInitialTargets(anchors, UEWarm.policyFor('archive', null));
    assert.deepEqual(targets, []);
  });

  test('a data-warm-policy="list" override on archive-catalog forces full selection, still excluding the unplayable row', () => {
    var UEWarm = core();
    var section = ARCHIVE_DOC_LIST_OVERRIDE.querySelector('[data-section="archive-catalog"]');
    var overrideAttr = section.getAttribute('data-warm-policy');
    assert.equal(overrideAttr, 'list');
    var policy = UEWarm.policyFor('archive', overrideAttr);
    var targets = UEWarm.selectInitialTargets(playableAnchors(ARCHIVE_DOC_LIST_OVERRIDE), policy);
    assert.equal(targets.length, 44, '45 rows minus the 1 data-unplayable row');
  });
});

describe('selectInitialTargets -- pages with nothing to warm', () => {
  test('selectors (residents.html) and about.html both have 0 playable anchors', () => {
    var UEWarm = core();
    assert.equal(playableAnchors(SELECTORS_DOC).length, 0);
    assert.equal(playableAnchors(ABOUT_DOC).length, 0);
    assert.deepEqual(UEWarm.selectInitialTargets(playableAnchors(SELECTORS_DOC), UEWarm.policyFor('selectors', null)), []);
    assert.deepEqual(UEWarm.selectInitialTargets(playableAnchors(ABOUT_DOC), UEWarm.policyFor('about', null)), []);
  });

  test('mode: none returns [] even if anchors were somehow passed in (defensive)', () => {
    var UEWarm = core();
    var anchors = playableAnchors(ACIDMAN_DOC); // non-empty on purpose
    assert.deepEqual(UEWarm.selectInitialTargets(anchors, { mode: 'none' }), []);
  });
});

describe('selectInitialTargets -- exclusion and malformed input', () => {
  test('data-unplayable="true" anchors are excluded', () => {
    var UEWarm = core();
    var doc = artistDoc([
      { 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(10) },
      { 'data-playlist': '', 'data-unplayable': 'true', href: 'https://arweave.net/' + fakeArchiveTxid(11) }
    ]);
    var targets = UEWarm.selectInitialTargets(playableAnchors(doc), UEWarm.policyFor('artist', null));
    assert.equal(targets.length, 1);
    assert.equal(targets[0].txid, fakeArchiveTxid(10));
  });

  test('anchors with no parseable txid, or a non-http href, are skipped without throwing', () => {
    var UEWarm = core();
    var doc = artistDoc([
      { 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(20) },
      { 'data-playlist': '', href: 'javascript:void(0)' },
      // the real (malformed, too-short) HPIT Promo Mix href, WITHOUT the
      // data-unplayable flag this time -- must be skipped on txid-parse
      // failure alone, not only via the explicit exclusion path.
      { 'data-playlist': '', href: 'https://arweave.net/neH-PrcWXd71JCZayTX' },
      { 'data-playlist': '', href: 'https://arweave.net/' + fakeArchiveTxid(21) }
    ]);
    var anchors = playableAnchors(doc);
    assert.equal(anchors.length, 4);
    var targets;
    assert.doesNotThrow(() => {
      targets = UEWarm.selectInitialTargets(anchors, UEWarm.policyFor('artist', null));
    });
    assert.deepEqual(targets.map(function (t) { return t.txid; }), [fakeArchiveTxid(20), fakeArchiveTxid(21)]);
  });
});

/* ---------------------------------------------------------------------
   3. Request shape -- the critical invariant
   --------------------------------------------------------------------- */
describe('buildWarmRequest', () => {
  var SAMPLE_URLS = ['https://arweave.fllstck.dev/' + TXID, 'https://frostor.xyz/' + TXID];

  test('always produces exactly Range: bytes=0-65535, method GET, the given url unchanged', () => {
    var UEWarm = core();
    SAMPLE_URLS.forEach(function (url) {
      var req = UEWarm.buildWarmRequest(url);
      assert.equal(req.url, url);
      assert.equal(req.method, 'GET');
      assert.equal(req.headers.Range, 'bytes=0-65535');
    });
  });

  test('never produces an open-ended range and never omits the Range header', () => {
    var UEWarm = core();
    var req = UEWarm.buildWarmRequest(SAMPLE_URLS[0]);
    assert.ok(Object.prototype.hasOwnProperty.call(req.headers, 'Range'), 'Range header must be present');
    assert.notEqual(req.headers.Range, 'bytes=0-');
    assert.notEqual(req.headers.Range, undefined);
    // the literal-string assertion the 64 KiB invariant rests on:
    assert.equal(req.headers.Range, 'bytes=0-65535');
  });

  test('warm urls are always range-gateway urls from buildCandidates -- raw arweave.net never appears, even when the canonical URL is the input to the pipeline', () => {
    var UEWarm = core();
    var canonical = 'https://arweave.net/' + TXID;
    var candidates = UEPlayerCore.buildCandidates(canonical);
    assert.ok(candidates.length > 0);
    candidates.forEach(function (c) {
      var req = UEWarm.buildWarmRequest(c.url);
      assert.equal(req.headers.Range, 'bytes=0-65535');
      assert.ok(!req.url.startsWith('https://arweave.net/'), 'must be a range-gateway url, never raw arweave.net: ' + req.url);
      assert.ok(UEPlayerCore.RANGE_HOSTS.some(function (h) { return req.url.startsWith(h); }));
    });
  });
});

/* ---------------------------------------------------------------------
   5. Reduced data
   --------------------------------------------------------------------- */
describe('shouldWarmAtAll', () => {
  test('false when saveData is true', () => {
    assert.equal(core().shouldWarmAtAll({ saveData: true }), false);
  });

  test('false for slow-2g / 2g / 3g effectiveType', () => {
    var UEWarm = core();
    ['slow-2g', '2g', '3g'].forEach(function (effectiveType) {
      assert.equal(UEWarm.shouldWarmAtAll({ effectiveType: effectiveType }), false, effectiveType);
    });
  });

  test('true for 4g', () => {
    assert.equal(core().shouldWarmAtAll({ effectiveType: '4g' }), true);
  });

  test('true when navigator.connection is missing entirely', () => {
    assert.equal(core().shouldWarmAtAll(undefined), true);
    assert.equal(core().shouldWarmAtAll(null), true);
  });

  test('true when connection exists but reports neither saveData nor effectiveType', () => {
    assert.equal(core().shouldWarmAtAll({}), true);
  });
});
