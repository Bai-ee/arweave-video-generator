#!/usr/bin/env node
/**
 * Read-only. Fuzzy-matches the 45 reviewed-but-unhosted mixes (from the
 * crosswalk doc) against the wallet audio inventory built by
 * build-inventory.mjs. Normalizes (lowercase, strip punctuation/articles)
 * and compares artist + 2-3 title keywords. Outputs found/ambiguous/
 * not_on_arweave buckets with scores and evidence for a human/Agent 3 to
 * finish.
 *
 * Usage: node scripts/audit/fuzzy-match-reviews.mjs <reviewsJson> <inventoryJson> <outMd>
 */
import fs from 'fs';

const UNHOSTED_45 = [
  { published: '2024-07-13', artist: 'Bai-ee', title: '303 Day Acid Mix' },
  { published: '2024-07-18', artist: 'Specter', title: 'Brutus' },
  { published: '2024-07-22', artist: 'Craig Alexander', title: "Rolla' Disco" },
  { published: '2024-08-15', artist: 'Gant Garrard aka Gant-Man', title: "Groove Tha Feelin'" },
  { published: '2024-08-16', artist: 'Bai-ee', title: 'Live @ Podlasie' },
  { published: '2024-08-22', artist: 'Blue J', title: 'Shuffle Like This' },
  { published: '2024-08-30', artist: 'Derrick Carter', title: 'Textures' },
  { published: '2024-09-01', artist: 'Cesar Ramirez', title: 'Destination (Deep House Mix)' },
  { published: '2024-09-12', artist: 'Jevon Jackson', title: 'Live @ True Family Unit Anniversary Party 2009' },
  { published: '2024-09-15', artist: 'Phil Free Art', title: 'Live @ UndergroundExistence Block Party 2005' },
  { published: '2024-09-19', artist: 'Jimmy Krok', title: 'Live @ Underground Existence Party 2005' },
  { published: '2024-09-20', artist: 'BRC', title: 'Live @ UndergroundExistence 2007' },
  { published: '2024-09-22', artist: 'Paul Johnson', title: 'Jive Turkey' },
  { published: '2024-09-27', artist: 'Mark Almaria', title: 'Sol' },
  { published: '2024-09-29', artist: 'Terry Mullan', title: 'New School Fusion Vol. 1' },
  { published: '2024-10-03', artist: 'Mystic Bill', title: 'Monochrome Sets (Winter 98)' },
  { published: '2024-10-04', artist: 'Mastiksoul', title: 'Live December 2007' },
  { published: '2024-10-10', artist: 'DJ Sneak', title: 'Signature Sounds (Side B)' },
  { published: '2024-10-11', artist: 'Bai-ee', title: 'A Love Hate Relationship' },
  { published: '2024-10-13', artist: 'Billy O & K-Squared', title: 'Live 7/20 Underground' },
  { published: '2024-10-17', artist: 'Bai-ee', title: 'Live @ Fame, Millennium Park' },
  { published: '2024-10-18', artist: 'DJ Automoton', title: 'Live @ Block Party, July 2007' },
  { published: '2024-10-20', artist: 'Bai-ee', title: 'Barack' },
  { published: '2024-10-24', artist: 'Traxx', title: 'Misc.' },
  { published: '2024-10-25', artist: 'Ryan Tinsley', title: 'Live @ Underground Existence Party 2008' },
  { published: '2024-10-27', artist: 'Bai-ee', title: 'Live @ 7/20 Underground' },
  { published: '2024-10-31', artist: 'Jesse Lee vs Matt Martin', title: 'Jesse Lee vs Matt Martin' },
  { published: '2024-11-01', artist: 'Bai-ee', title: 'Gusto' },
  { published: '2024-11-03', artist: 'Kiddo & Antiphase', title: 'Mix 7-15-06' },
  { published: '2024-11-07', artist: 'Bai-ee', title: "Loft Livin' Vol. 2" },
  { published: '2024-11-08', artist: 'Pipeline', title: 'Live @ Underground Party 7/20/07' },
  { published: '2024-11-10', artist: 'Cesar Ramirez', title: 'Old School Chicago House Vol. 1' },
  { published: '2024-11-15', artist: 'Cesar Ramirez', title: 'The Return' },
  { published: '2024-11-17', artist: 'Mark Farina', title: 'Live @ Smartbar 4/26/2002' },
  { published: '2024-11-22', artist: 'Cesar Ramirez', title: 'Keep On Going' },
  { published: '2024-11-24', artist: 'Mark Farina', title: 'Seed Syllable' },
  { published: '2024-11-28', artist: 'Mark Farina', title: 'Parallel' },
  { published: '2024-11-29', artist: 'Derrick Carter', title: 'Live @ Smartbar 4/26/2002' },
  { published: '2024-12-01', artist: 'Specter', title: 'Bridgeport Blues' },
  { published: '2024-12-05', artist: 'Stephen P', title: 'Red Light Special' },
  { published: '2024-12-06', artist: "DJ Lil' John", title: 'Phan-Tas-Tique' },
  { published: '2024-12-08', artist: 'Kenny "Jammin" Jason', title: 'Live on WBMX Chicago' },
  { published: '2024-12-12', artist: 'Julian "Jumpin" Perez', title: 'Live on WBMX Chicago' },
  { published: '2024-12-13', artist: 'Specter', title: 'Pendulum' },
  { published: '2024-12-15', artist: 'Stephen P', title: "Let's Drop (Deep House Mix)" },
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'live', 'mix', 'mixes', 'mixtape', 'vol', 'volume', 'at', 'on', 'in',
  'party', 'chicago', 'underground', 'existence', 'ue', 'presents', 'side',
  'and', 'vs', 'b2b', 'feat', 'featuring', 'of', 'to', '2024', '2025',
  'dj', 'live_at', 'like', 'jazz', 'blues', 'club', 'set', 'sounds',
]);

function splitCamelAndDigits(str) {
  return (str || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase -> camel Case
    .replace(/([A-Za-z])(\d)/g, '$1 $2') // Day2024 -> Day 2024
    .replace(/(\d)([A-Za-z])/g, '$1 $2'); // 303Day -> 303 Day
}

function normalize(str) {
  return splitCamelAndDigits(str || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function keywordsOf(str) {
  return normalize(str).filter((w) => {
    if (STOPWORDS.has(w)) return false;
    if (w.length <= 1) return false;
    // Drop bare 1-2 digit numeric tokens (day/night fragments like "20" from
    // "7/20") — too weak/coincidental on their own. Keep 4-digit years and
    // any alphanumeric mix.
    if (/^\d{1,2}$/.test(w)) return false;
    return true;
  });
}

function artistTokens(artist) {
  // handles "Kenny "Jammin" Jason" style nicknames, "X aka Y", "X & Y"
  const cleaned = artist.replace(/aka/gi, ' ').replace(/&/g, ' ');
  return keywordsOf(cleaned);
}

function overlapCount(aWords, bWords) {
  const bSet = new Set(bWords);
  let n = 0;
  for (const w of aWords) if (bSet.has(w)) n += 1;
  return n;
}

function scoreCandidate(review, candidateText) {
  const candWords = keywordsOf(candidateText);
  const titleWords = keywordsOf(review.title);
  const artWords = artistTokens(review.artist);

  const titleOverlap = overlapCount(titleWords, candWords);
  const artistOverlap = overlapCount(artWords, candWords);

  let score = titleOverlap * 2 + artistOverlap * 3;
  return { score, titleOverlap, artistOverlap, titleWords, artWords };
}

async function main() {
  const [, , reviewsFile, inventoryFile, outFile, excludeTxidsFile] = process.argv;
  const reviewsData = JSON.parse(fs.readFileSync(reviewsFile, 'utf8'));
  const inventory = JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
  const excludeTxids = new Set(
    excludeTxidsFile ? JSON.parse(fs.readFileSync(excludeTxidsFile, 'utf8')) : []
  );

  const audioRows = inventory.rows.filter((r) => r.kind === 'audio' && !excludeTxids.has(r.txid));
  const candidates = audioRows.map((r) => {
    const text = [r.ardriveName, r.filenameTag].filter(Boolean).join(' ');
    return { row: r, text: text || r.txid };
  });

  const results = { found_on_arweave: [], ambiguous: [], not_on_arweave: [] };

  for (const review of UNHOSTED_45) {
    // find fuller review record if present (for context only)
    const fullReview = (reviewsData.reviews || []).find(
      (r) => r.title && review.title && r.title.toLowerCase() === review.title.toLowerCase() && r.artist && review.artist && r.artist.toLowerCase() === review.artist.toLowerCase()
    );

    let best = null;
    for (const c of candidates) {
      const s = scoreCandidate(review, c.text);
      if (!best || s.score > best.s.score) best = { c, s };
    }

    const row = {
      review,
      reviewId: fullReview ? fullReview.id : null,
      slug: fullReview ? fullReview.slug : null,
      best,
    };

    if (best && best.s.artistOverlap >= 1 && best.s.titleOverlap >= 2) {
      results.found_on_arweave.push(row);
    } else if (best && best.s.titleOverlap >= 1) {
      // Require at least one real (non-stopword, non-bare-digit) title
      // keyword in common — pure same-artist-different-mix or generic-word
      // collisions (venue names, "dj", short day/night numbers) are not
      // evidence and are pushed to not_on_arweave instead.
      results.ambiguous.push(row);
    } else {
      results.not_on_arweave.push(row);
    }
  }

  const lines = [];
  lines.push('# Wallet match candidates for the 45 reviewed-but-unhosted mixes — 2026-09-08');
  lines.push('');
  lines.push('Read-only fuzzy match of the crosswalk\'s 45 "no hosted mix" reviews against the full wallet audio inventory (`wallet-inventory-2026-09-08.md`, 154 audio transactions, filenames recovered via ArDrive ArFS metadata pairing). Normalized lowercase, punctuation/article-stripped, artist + title keyword overlap scoring: `score = titleKeywordOverlap*2 + artistKeywordOverlap*3`.');
  lines.push('');
  lines.push(`- found_on_arweave: ${results.found_on_arweave.length}`);
  lines.push(`- ambiguous: ${results.ambiguous.length}`);
  lines.push(`- not_on_arweave: ${results.not_on_arweave.length}`);
  lines.push('');

  function section(title, rows, note) {
    lines.push(`## ${title} (${rows.length})`);
    lines.push('');
    if (note) { lines.push(note); lines.push(''); }
    if (rows.length === 0) {
      lines.push('_none_');
      lines.push('');
      return;
    }
    lines.push('| Review (artist / title) | Published | Best wallet candidate | txid | Size | Score (title/artist overlap) |');
    lines.push('|---|---|---|---|---|---|');
    for (const r of rows) {
      // A best-candidate with zero title-keyword overlap is not real
      // evidence (it's just "some other file by the same prolific artist,
      // or a same-artist file already claimed by a different review") — do
      // not print a specific filename/txid that could be mistaken for a
      // finding; show plainly that nothing matched.
      const hasRealEvidence = r.best && r.best.s.titleOverlap >= 1;
      const cand = hasRealEvidence ? r.best.c : null;
      const candLabel = cand
        ? (cand.row.ardriveName || cand.row.filenameTag || '(no filename)')
        : (r.best ? `(no title-keyword match — closest same-artist file was ${r.best.c.row.ardriveName || r.best.c.row.filenameTag || r.best.c.row.txid}, not real evidence)` : '(no candidate found)');
      const candTxid = cand ? `\`${cand.row.txid}\`` : '';
      const candSize = cand && cand.row.size ? (Number(cand.row.size) / (1024 * 1024)).toFixed(1) + ' MB' : '';
      const scoreLabel = r.best ? `${r.best.s.score} (t${r.best.s.titleOverlap}/a${r.best.s.artistOverlap})` : '';
      lines.push(`| ${r.review.artist} / ${r.review.title} | ${r.review.published} | ${candLabel} | ${candTxid} | ${candSize} | ${scoreLabel} |`);
    }
    lines.push('');
  }

  section('found_on_arweave', results.found_on_arweave, 'Strong match (artist token match AND >=2 title keywords match) — txid is copy-pasteable into artists.json once a human confirms by ear.');
  section('ambiguous', results.ambiguous, 'Partial match — needs a human ear before wiring into artists.json.');
  section('not_on_arweave', results.not_on_arweave, 'No wallet audio transaction scored a meaningful artist/title keyword overlap. Candidate for the upload backlog.');

  fs.writeFileSync(outFile, lines.join('\n') + '\n');
  console.error(`[match] wrote ${outFile}: found=${results.found_on_arweave.length} ambiguous=${results.ambiguous.length} not_on_arweave=${results.not_on_arweave.length}`);
}

main();
