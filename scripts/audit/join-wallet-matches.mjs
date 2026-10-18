#!/usr/bin/env node
/**
 * join-wallet-matches.mjs
 *
 * Agent 3 deliverable (review-to-record reconciliation, 2026-09-08).
 *
 * Joins:
 *   - docs/audits/reviews-normalized-2026-09-08.json   (this agent's normalized 67-review corpus)
 *   - docs/audits/artists-json-proposed-patch-2026-09-08.json  (this agent's proposed edits/additions)
 *   - docs/audits/wallet-inventory-2026-09-08.json      (Agent 2's read-only wallet/ArDrive audit -- may not exist yet)
 *   - docs/audits/wallet-match-candidates-2026-09-08.md (Agent 2's optional human-readable candidates -- may not exist yet)
 *
 * against a fuzzy artist+title match, and:
 *   1. classifies every un-hosted review as found / ambiguous / not_on_arweave
 *   2. resolves (or reports still-unresolved) the four hard cases:
 *        AKILA (...Head Ass!!! vs A drink and a smoke on the veranda)
 *        BLUE JAY (Live at Studio409 New York) vs BERNARD BADIE (Live at UE B2B Sean Smith)
 *        Chicago Skyway (For Hakim vs Little White Earbuds Mix)
 *        BAI-EE HPIT Promo Mix (truncated txid, prefix search)
 *   3. writes a RESOLVED copy of the proposed patch with mixArweaveURL filled in wherever a
 *      confident match was found, alongside a join report -- it never overwrites the original
 *      proposed-patch file, and it never touches website/artists.json (read-only, proposal-only,
 *      matching the rest of this agent's contract).
 *
 * Degrades gracefully: if wallet-inventory-2026-09-08.json does not exist yet, prints a clear
 * message, still runs the review/patch cross-check it can do without wallet data, and exits 0
 * (this is an expected, non-error state while Agent 2 is still running).
 *
 * Usage:
 *   node scripts/audit/join-wallet-matches.mjs
 *   node scripts/audit/join-wallet-matches.mjs --date 2026-09-08   (defaults to 2026-09-08)
 *   node scripts/audit/join-wallet-matches.mjs --inventory /path/to/other-inventory.json
 *
 * Read-only: makes no network calls, writes nothing outside docs/audits/.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const AUDITS_DIR = path.join(REPO_ROOT, 'docs', 'audits');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const RUN_DATE = argVal('--date', '2026-09-08');
const INVENTORY_PATH = argVal('--inventory', path.join(AUDITS_DIR, `wallet-inventory-${RUN_DATE}.json`));
const CANDIDATES_MD_PATH = argVal('--candidates', path.join(AUDITS_DIR, `wallet-match-candidates-${RUN_DATE}.md`));
const NORMALIZED_PATH = path.join(AUDITS_DIR, `reviews-normalized-${RUN_DATE}.json`);
const PATCH_PATH = path.join(AUDITS_DIR, `artists-json-proposed-patch-${RUN_DATE}.json`);
const RESOLVED_OUT_PATH = path.join(AUDITS_DIR, `artists-json-proposed-patch-${RUN_DATE}.resolved.json`);
const REPORT_OUT_PATH = path.join(AUDITS_DIR, `join-wallet-matches-report-${RUN_DATE}.json`);

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function readJsonIfExists(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error(`[join-wallet-matches] WARNING: ${p} exists but is not valid JSON: ${err.message}`);
    return null;
  }
}

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/['’`"“”]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenSet(s) {
  return new Set(normalizeText(s).split(' ').filter(Boolean).filter(w => w.length > 1));
}

// Jaccard-ish overlap score between two token sets, weighted toward the smaller set
// (so a short title fully contained in a long ArDrive path still scores well).
function scoreOverlap(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  const smaller = Math.min(a.size, b.size);
  return hits / smaller;
}

// Extract every plausible "name-ish" string out of one wallet inventory record, regardless of
// which field-naming variant Agent 2 shipped (schema not guaranteed to match the master plan's
// suggested shape exactly, since Agent 2 runs independently/concurrently).
function inventoryItemText(item) {
  const parts = [];
  for (const key of ['filenameTag', 'filename', 'name', 'fileName', 'ardrivePath', 'path', 'title']) {
    if (item[key]) parts.push(String(item[key]));
  }
  if (Array.isArray(item.tags)) {
    for (const t of item.tags) {
      if (t && (t.name === 'File-Name' || t.name === 'Name' || /name/i.test(t.name || ''))) {
        if (t.value) parts.push(String(t.value));
      }
    }
  }
  return parts.join(' ');
}

function inventoryTxid(item) {
  return item.txid || item.id || item.dataTxId || item.transactionId || null;
}

function loadInventoryArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const key of ['transactions', 'items', 'inventory', 'audioTransactions', 'records', 'files']) {
    if (Array.isArray(raw[key])) return raw[key];
  }
  console.error('[join-wallet-matches] WARNING: wallet-inventory JSON found but shape not recognized (expected an array, or an object with a transactions/items/inventory/files array). Proceeding with zero inventory items.');
  return [];
}

// ---------------------------------------------------------------------------
// load inputs
// ---------------------------------------------------------------------------
console.log(`[join-wallet-matches] run date: ${RUN_DATE}`);

const normalized = readJsonIfExists(NORMALIZED_PATH);
if (!normalized) {
  console.error(`[join-wallet-matches] FATAL: ${NORMALIZED_PATH} not found. This is Agent 3's own output and should always exist -- re-run docs/audits generation before the joiner.`);
  process.exit(1);
}

const patch = readJsonIfExists(PATCH_PATH);
if (!patch) {
  console.error(`[join-wallet-matches] FATAL: ${PATCH_PATH} not found. This is Agent 3's own output and should always exist -- re-run docs/audits generation before the joiner.`);
  process.exit(1);
}

const inventoryRaw = readJsonIfExists(INVENTORY_PATH);
const inventoryExists = inventoryRaw !== null;
const inventory = loadInventoryArray(inventoryRaw);

if (!inventoryExists) {
  console.log(`[join-wallet-matches] Agent 2's wallet inventory not found yet at ${INVENTORY_PATH}.`);
  console.log('[join-wallet-matches] This is expected if Agent 2 has not finished. Nothing to join against wallet data --');
  console.log('[join-wallet-matches] every un-hosted review and every hard case will be classified "pending-wallet-audit".');
  console.log('[join-wallet-matches] Re-run this script once that file lands to get real found/ambiguous/not_on_arweave results.\n');
} else {
  console.log(`[join-wallet-matches] loaded wallet inventory: ${inventory.length} item(s) from ${INVENTORY_PATH}`);
}

let candidatesMdExists = fs.existsSync(CANDIDATES_MD_PATH);
if (candidatesMdExists) {
  console.log(`[join-wallet-matches] found ${CANDIDATES_MD_PATH} (informational; not required for the join -- the join runs directly off wallet-inventory JSON).`);
}

// Precompute token sets for every inventory item once.
const invTokens = inventory.map(item => ({
  item,
  txid: inventoryTxid(item),
  tokens: tokenSet(inventoryItemText(item)),
}));

const AUDIO_CONTENT_TYPES = /^audio\//i;
function isAudioItem(entry) {
  const ct = entry.item.contentType || entry.item.content_type || (entry.item.data && entry.item.data.type) || '';
  if (!ct) return true; // unknown content-type: don't exclude, let the text match decide
  return AUDIO_CONTENT_TYPES.test(ct);
}

// ---------------------------------------------------------------------------
// fuzzy match: artist + title tokens vs. inventory item tokens
// ---------------------------------------------------------------------------
const FOUND_THRESHOLD = 0.6;   // best match must cover >=60% of the smaller token set
const AMBIGUOUS_GAP = 0.15;    // if 2nd-best is within this of best, it's ambiguous, not found
const TITLE_FLOOR = 0.34;      // title-only overlap must ALSO clear this, or the match is rejected

// Scoring artist+title as one bag of words lets a short, generic mix title (e.g. "Barack",
// "Gusto") false-positive match ANY other inventory item from the same artist purely on the
// artist-name tokens ("bai", "ee") -- observed in local testing. Require the TITLE tokens alone
// to carry real signal; artist tokens only ever help as a secondary combined score, never as the
// sole basis for a match.
function matchReview(artistName, mixTitle) {
  const titleTokens = tokenSet(mixTitle);
  const queryTokens = tokenSet(`${artistName} ${mixTitle}`);
  const scored = invTokens
    .filter(isAudioItem)
    .map(entry => ({
      entry,
      score: scoreOverlap(queryTokens, entry.tokens),
      titleScore: scoreOverlap(titleTokens, entry.tokens),
    }))
    .filter(x => x.score > 0 && x.titleScore >= TITLE_FLOOR)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { status: 'not_on_arweave', candidates: [] };
  }
  const best = scored[0];
  const second = scored[1];
  if (best.score < FOUND_THRESHOLD) {
    return { status: 'not_on_arweave', candidates: scored.slice(0, 3).map(fmtCandidate) };
  }
  if (second && best.score - second.score < AMBIGUOUS_GAP) {
    return { status: 'ambiguous', candidates: scored.slice(0, 3).map(fmtCandidate) };
  }
  return { status: 'found', txid: best.entry.txid, candidates: [fmtCandidate(best)] };
}

function fmtCandidate(x) {
  return { txid: x.entry.txid, score: Number(x.score.toFixed(3)), text: inventoryItemText(x.entry.item).slice(0, 160) };
}

function searchTerms(terms) {
  const q = tokenSet(terms.join(' '));
  return invTokens
    .map(entry => ({ entry, score: scoreOverlap(q, entry.tokens) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(fmtCandidate);
}

// ---------------------------------------------------------------------------
// 1. classify every un-hosted review (backlog items) against the wallet
// ---------------------------------------------------------------------------
const unhosted = normalized.reviews.filter(r => !r.hosted);
const classification = unhosted.map(r => {
  const result = inventoryExists ? matchReview(r.artistName, r.mixTitle) : { status: 'pending-wallet-audit', candidates: [] };
  return { reviewId: r.reviewId, artistName: r.artistName, mixTitle: r.mixTitle, asanaLink: r.asanaLink, ...result };
});

const counts = classification.reduce((acc, c) => {
  acc[c.status] = (acc[c.status] || 0) + 1;
  return acc;
}, {});

console.log('[join-wallet-matches] --- un-hosted review classification ---');
console.log(JSON.stringify(counts, null, 2));

// ---------------------------------------------------------------------------
// 2. the four hard cases
// ---------------------------------------------------------------------------
console.log('\n[join-wallet-matches] --- hard cases ---');

const hardCases = {};

// AKILA: search for a second file distinct from the already-known shared txid.
const AKILA_SHARED_TXID = 'FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg';
{
  const candidates = inventoryExists ? searchTerms(['akila', 'head', 'ass', 'drink', 'smoke', 'veranda']) : [];
  const distinctFromShared = candidates.filter(c => c.txid && c.txid !== AKILA_SHARED_TXID);
  let resolution;
  if (!inventoryExists) {
    resolution = { status: 'pending-wallet-audit', note: 'wallet inventory not available yet' };
  } else if (distinctFromShared.length === 0) {
    resolution = {
      status: 'not_on_arweave',
      note: 'No Akila audio transaction found other than the already-shared txid. One Akila title was likely never uploaded -- keep the shared txid on whichever title the ArDrive filename/path most resembles (inspect the raw inventory manually if the automatic match is inconclusive), mark the other mixArweaveURL "" and add/keep it on the upload backlog.',
      candidates,
    };
  } else {
    resolution = {
      status: distinctFromShared.length === 1 ? 'found' : 'ambiguous',
      note: 'Candidate second-Akila-file txid(s) found distinct from the shared one. Inspect the filename/path text below to decide which review title ("...Head Ass!!!" vs "A drink and a smoke on the veranda") it matches, then assign accordingly.',
      candidates: distinctFromShared,
    };
  }
  hardCases.akila = resolution;
  console.log('AKILA:', JSON.stringify(resolution, null, 2));
}

// BLUE JAY / BERNARD BADIE: confirm which side the shared file belongs to via wallet filenames.
{
  const candidates = inventoryExists ? searchTerms(['zeitler', 'blue', 'jay', '409', 'studio', 'badie', 'smith', 'ue', '2009']) : [];
  const resolution = inventoryExists
    ? {
        status: candidates.length ? 'candidates_found' : 'no_candidates',
        note: 'Agent 3\'s duration-based call (see artists-json-proposed-changes-2026-09-08.md hard case 2): the shared txid pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg (173:12) is almost certainly the Bernard Badie/Sean Smith 2009 UE party, not Blue Jay\'s Studio409 (2024) mix. Use these candidates to find Blue Jay\'s actual Studio409 file (a 128-166kbps mix in the tens-of-minutes range, not hours).',
        candidates,
      }
    : { status: 'pending-wallet-audit', note: 'wallet inventory not available yet' };
  hardCases.blueJayBernardBadie = resolution;
  console.log('BLUE JAY / BERNARD BADIE:', JSON.stringify(resolution, null, 2));
}

// Chicago Skyway: For Hakim vs Little White Earbuds Mix.
{
  const candidates = inventoryExists ? searchTerms(['skyway', 'hakim', 'lwe', 'little', 'white', 'earbuds']) : [];
  const resolution = inventoryExists
    ? {
        status: candidates.length ? 'candidates_found' : 'no_candidates',
        note: 'Agent 3\'s medium-confidence call (see hard case 3): the shared txid 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA (57:05, 320kbps) is provisionally "Little White Earbuds Mix". Use these candidates to find "For Hakim"\'s actual file.',
        candidates,
      }
    : { status: 'pending-wallet-audit', note: 'wallet inventory not available yet' };
  hardCases.chicagoSkyway = resolution;
  console.log('CHICAGO SKYWAY:', JSON.stringify(resolution, null, 2));
}

// BAI-EE HPIT Promo Mix: prefix search + keyword search.
{
  const PREFIX = 'neH-PrcWXd71JCZayTX';
  const prefixMatches = inventoryExists ? invTokens.filter(e => e.txid && e.txid.startsWith(PREFIX)).map(e => ({ txid: e.txid, text: inventoryItemText(e.item).slice(0, 160) })) : [];
  const keywordCandidates = inventoryExists ? searchTerms(['hpit', 'promo', 'bai', 'ee', '2022']) : [];
  let resolution;
  if (!inventoryExists) {
    resolution = { status: 'pending-wallet-audit', note: 'wallet inventory not available yet' };
  } else if (prefixMatches.length > 0) {
    resolution = { status: 'found', note: 'txid starting with the truncated string found directly.', candidates: prefixMatches };
  } else {
    resolution = { status: keywordCandidates.length ? 'candidates_found' : 'not_on_arweave', note: 'No txid starts with the truncated string; falling back to keyword candidates.', candidates: keywordCandidates };
  }
  hardCases.hpitPromoMix = resolution;
  console.log('BAI-EE HPIT PROMO MIX:', JSON.stringify(resolution, null, 2));
}

// ---------------------------------------------------------------------------
// 3. write a RESOLVED copy of the patch (never mutate the original file)
// ---------------------------------------------------------------------------
const resolvedPatch = JSON.parse(JSON.stringify(patch)); // deep clone
let filledCount = 0;

function applyFoundTxid(list, matchFn) {
  for (const entry of list) {
    if (entry.mixArweaveURL !== '') continue; // only fill genuinely-empty slots
    const m = matchFn(entry);
    if (m && m.status === 'found' && m.txid) {
      entry.mixArweaveURL = `https://arweave.net/${m.txid}`;
      entry._joinerResolved = { from: 'wallet-inventory', txid: m.txid, score: m.candidates?.[0]?.score };
      filledCount++;
    } else if (m) {
      entry._joinerClassification = m.status;
    }
  }
}

applyFoundTxid(resolvedPatch.additions, (entry) => inventoryExists ? matchReview(entry.artistName, entry.mixTitle) : { status: 'pending-wallet-audit' });

// hard cases: only auto-apply the genuinely unambiguous ones (HPIT prefix match). The other three
// stay as human/owner decisions even when candidates exist, since they involve picking between two
// *existing* titles rather than filling one empty slot -- the report above gives the evidence,
// applying it is a deliberate integration-pass edit, not something this script should silently do.
if (hardCases.hpitPromoMix.status === 'found') {
  const hpitEdit = resolvedPatch.edits.find(e => e.artistName === 'BAI-EE' && e.mixTitle === 'HPIT Promo Mix');
  if (hpitEdit) {
    hpitEdit.set.mixArweaveURL = `https://arweave.net/${hardCases.hpitPromoMix.candidates[0].txid}`;
    hpitEdit._joinerResolved = { from: 'wallet-inventory-prefix-match', txid: hardCases.hpitPromoMix.candidates[0].txid };
    filledCount++;
  }
}

fs.writeFileSync(RESOLVED_OUT_PATH, JSON.stringify(resolvedPatch, null, 2) + '\n');
console.log(`\n[join-wallet-matches] wrote ${RESOLVED_OUT_PATH} (${filledCount} mixArweaveURL slot(s) auto-filled from wallet inventory; original proposed-patch file untouched)`);

const report = {
  runDate: RUN_DATE,
  inventoryFound: inventoryExists,
  inventoryItemCount: inventory.length,
  unhostedReviewCount: unhosted.length,
  classificationCounts: counts,
  hardCases,
  autoFilledCount: filledCount,
  resolvedPatchPath: path.relative(REPO_ROOT, RESOLVED_OUT_PATH),
};
fs.writeFileSync(REPORT_OUT_PATH, JSON.stringify(report, null, 2) + '\n');
console.log(`[join-wallet-matches] wrote ${REPORT_OUT_PATH}`);

if (!inventoryExists) {
  console.log('\n[join-wallet-matches] Exiting 0 -- degraded-but-successful run (no wallet inventory yet). Re-run once Agent 2 lands its output.');
}
process.exit(0);
