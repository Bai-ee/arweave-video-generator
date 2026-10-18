#!/usr/bin/env node
/**
 * validate-artists-json.mjs
 *
 * Structural + (optional) live validator for website/artists.json.
 *
 * Usage:
 *   node scripts/validate-artists-json.mjs            # structural checks only
 *   node scripts/validate-artists-json.mjs --live      # also HEAD/GET-check every txid on arweave.net
 *
 * Exit code: non-zero on any STRUCTURAL failure (bad txid format, subdomain/txid
 * mismatch, an un-allowlisted duplicate txid, a malformed mixDateYear). Live-check
 * failures (gateway timeouts, 404s, etc.) are reported but never affect exit code,
 * per the master plan ("gateways flake"). Image-host warnings are also non-fatal.
 *
 * No new dependencies. Base32 (RFC 4648, lowercase, no padding) is implemented here
 * by hand and self-checked at startup against a known-good txid/subdomain pair.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ARTISTS_JSON_PATH = path.join(REPO_ROOT, 'website', 'artists.json');

const LIVE = process.argv.includes('--live');
const CONCURRENCY = 5;
const TIMEOUT_MS = 10_000;
const RANGE_BYTES = 2048;

const MIRROR_ALLOWLIST = new Set(['VIVA ACID', 'RED EYE']);
const TXID_RE = /^[A-Za-z0-9_-]{43}$/;
const YEAR_RE = /^('\d{2}|\d{4}|\d{1,2}\/\d{2}(\/\d{2})?|Circa .+|\?\?|20\?\?)$/;

// ---------------------------------------------------------------------------
// Base32 (RFC 4648), lowercase alphabet, no padding — matches Arweave's
// sandboxed-subdomain gateway encoding of the raw (base64url-decoded) txid bytes.
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function base64UrlToBytes(b64url) {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return Buffer.from(b64, 'base64');
}

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function selfCheckBase32() {
  const knownTxid = 'aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU';
  const knownSubdomain = 'nbdlqhjegffe2b43r4pz5dbnnluh6b6osbilcbqrlsc7e3ecxasq';
  const got = base32Encode(base64UrlToBytes(knownTxid));
  if (got !== knownSubdomain) {
    console.error('FATAL: base32 self-check failed.');
    console.error(`  txid:     ${knownTxid}`);
    console.error(`  expected: ${knownSubdomain}`);
    console.error(`  got:      ${got}`);
    console.error('Refusing to run — the encoder disagrees with the known-good pair.');
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// URL / txid parsing
// ---------------------------------------------------------------------------

// Mixes not yet on Arweave: Firebase Storage objects named by a 43-char content
// id (see DIRECT_PREFIX in website/js/player-core.js). The id plays the txid role.
const DIRECT_AUDIO_PREFIX = 'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/website/mixes/';

function parseArweaveUrl(rawUrl) {
  if (typeof rawUrl === 'string' && rawUrl.startsWith(DIRECT_AUDIO_PREFIX)) {
    return { ok: true, host: 'storage.googleapis.com', isBareGateway: false, isSubdomain: false, isDirect: true,
      subdomain: null, txid: rawUrl.slice(DIRECT_AUDIO_PREFIX.length), extraPath: '' };
  }
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, error: `not a valid URL: ${rawUrl}` };
  }
  const host = u.hostname.toLowerCase();
  const isBareGateway = host === 'arweave.net';
  const isSubdomain = host.endsWith('.arweave.net') && host !== 'arweave.net';
  if (!isBareGateway && !isSubdomain) {
    return { ok: false, error: `unexpected host (not arweave.net): ${host}`, host };
  }
  const segments = u.pathname.split('/').filter(Boolean);
  const txid = segments[0] || '';
  const subdomain = isSubdomain ? host.slice(0, host.length - '.arweave.net'.length) : null;
  return { ok: true, host, isBareGateway, isSubdomain, subdomain, txid, extraPath: segments.slice(1).join('/') };
}

function checkImageHost(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, host: null };
  }
  const host = u.hostname.toLowerCase();
  const ok = host === 'arweave.net' || host.endsWith('.arweave.net');
  return { ok, host };
}

// ---------------------------------------------------------------------------
// Structural validation
// ---------------------------------------------------------------------------

function loadArtists() {
  if (!fs.existsSync(ARTISTS_JSON_PATH)) {
    console.error(`FATAL: ${ARTISTS_JSON_PATH} does not exist.`);
    process.exit(2);
  }
  const raw = fs.readFileSync(ARTISTS_JSON_PATH, 'utf8');
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`FATAL: ${ARTISTS_JSON_PATH} is not valid JSON: ${e.message}`);
    process.exit(2);
  }
  if (!Array.isArray(data)) {
    console.error('FATAL: artists.json top level is not an array.');
    process.exit(2);
  }
  return data;
}

const ARTIST_KEYS = ['artistName', 'artistFilename', 'artistImageFilename', 'artistGenre', 'mixes'];
const MIX_KEYS = ['mixTitle', 'mixArweaveURL', 'mixDateYear', 'mixDuration', 'mixImageFilename'];

function checkSchema(artists) {
  const problems = [];
  artists.forEach((artist, ai) => {
    for (const k of ARTIST_KEYS) {
      if (!(k in artist)) problems.push(`artist[${ai}] (${artist.artistName ?? '?'}) missing key "${k}"`);
    }
    if (!Array.isArray(artist.mixes)) {
      problems.push(`artist[${ai}] (${artist.artistName ?? '?'}) "mixes" is not an array`);
      return;
    }
    artist.mixes.forEach((mix, mi) => {
      for (const k of MIX_KEYS) {
        if (!(k in mix)) problems.push(`artist[${ai}].mixes[${mi}] (${mix.mixTitle ?? '?'}) missing key "${k}"`);
      }
    });
  });
  return problems;
}

function validateRecords(artists) {
  const rows = []; // one per mix, carries everything downstream needs (structural + live)
  const txidOwners = new Map(); // txid -> [{artistName, mixTitle, allowlisted}]
  const structuralFailures = [];
  const warnings = [];

  for (const artist of artists) {
    const allowlisted = MIRROR_ALLOWLIST.has(artist.artistName);

    const artistImg = checkImageHost(artist.artistImageFilename);
    if (!artistImg.ok) {
      warnings.push(`[image-host] ${artist.artistName}: artistImageFilename host is "${artistImg.host}", not arweave.net`);
    }

    for (const mix of artist.mixes || []) {
      const row = {
        artistName: artist.artistName,
        mixTitle: mix.mixTitle,
        mixArweaveURL: mix.mixArweaveURL,
        mixDateYear: mix.mixDateYear,
        mixDuration: mix.mixDuration,
        txid: null,
        host: null,
        notes: [],
      };

      const parsed = parseArweaveUrl(mix.mixArweaveURL);
      if (!parsed.ok) {
        structuralFailures.push(`[url] ${artist.artistName} / "${mix.mixTitle}": ${parsed.error}`);
        row.notes.push('invalid URL/host');
      } else {
        row.txid = parsed.txid;
        row.host = parsed.host;
        if (!TXID_RE.test(parsed.txid)) {
          structuralFailures.push(
            `[txid-format] ${artist.artistName} / "${mix.mixTitle}": txid "${parsed.txid}" is ${parsed.txid.length} chars (need exactly 43, [A-Za-z0-9_-])`
          );
          row.notes.push(`bad txid length (${parsed.txid.length})`);
        }
        if (parsed.isSubdomain && TXID_RE.test(parsed.txid)) {
          const expected = base32Encode(base64UrlToBytes(parsed.txid));
          if (expected !== parsed.subdomain) {
            structuralFailures.push(
              `[subdomain-mismatch] ${artist.artistName} / "${mix.mixTitle}": subdomain "${parsed.subdomain}" != expected base32 "${expected}" for txid ${parsed.txid}`
            );
            row.notes.push(`subdomain mismatch (expected ${expected})`);
          }
        }
        if (TXID_RE.test(parsed.txid)) {
          if (!txidOwners.has(parsed.txid)) txidOwners.set(parsed.txid, []);
          // mixCoListed: a shared set deliberately listed on each artist's page — explained, like a mirror.
          txidOwners.get(parsed.txid).push({ artistName: artist.artistName, mixTitle: mix.mixTitle,
            allowlisted: allowlisted || mix.mixCoListed === true });
        }
      }

      if (!YEAR_RE.test(mix.mixDateYear ?? '')) {
        structuralFailures.push(`[year-format] ${artist.artistName} / "${mix.mixTitle}": mixDateYear "${mix.mixDateYear}" does not match expected pattern`);
        row.notes.push('bad mixDateYear format');
      }

      const mixImg = checkImageHost(mix.mixImageFilename);
      if (!mixImg.ok) {
        warnings.push(`[image-host] ${artist.artistName} / "${mix.mixTitle}": mixImageFilename host is "${mixImg.host}", not arweave.net`);
      }

      rows.push(row);
    }
  }

  // Duplicate txid detection: flag only if more than one NON-allowlisted record
  // shares the txid (VIVA ACID / RED EYE mirrors are expected to reuse txids).
  const duplicateGroups = [];
  for (const [txid, owners] of txidOwners.entries()) {
    const nonAllowlisted = owners.filter((o) => !o.allowlisted);
    if (nonAllowlisted.length > 1) {
      duplicateGroups.push({ txid, owners });
      structuralFailures.push(
        `[duplicate-txid] txid ${txid} shared by ${nonAllowlisted.length} non-mirror records: ` +
          nonAllowlisted.map((o) => `${o.artistName} / "${o.mixTitle}"`).join(' <-> ')
      );
      for (const o of owners) {
        const r = rows.find((rr) => rr.artistName === o.artistName && rr.mixTitle === o.mixTitle && rr.txid === txid);
        if (r) r.notes.push(o.allowlisted ? 'shares txid (allowlisted mirror)' : 'DUPLICATE txid — shared with another non-mirror record');
      }
    } else if (owners.length > 1) {
      // Shared, but fully explained by the mirror allowlist — annotate, don't flag.
      for (const o of owners) {
        const r = rows.find((rr) => rr.artistName === o.artistName && rr.mixTitle === o.mixTitle && rr.txid === txid);
        if (r) r.notes.push('shares txid (allowlisted mirror)');
      }
    }
  }

  return { rows, structuralFailures, warnings, duplicateGroups };
}

// ---------------------------------------------------------------------------
// Live gateway checks
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function headOrRangedGet(txid) {
  const url = `https://arweave.net/${txid}`;
  const attempt = async () => {
    try {
      const res = await fetchWithTimeout(url, { method: 'HEAD' }, TIMEOUT_MS);
      if (res.status === 405 || res.status === 501) {
        // HEAD not supported — fall back to ranged GET.
        const getRes = await fetchWithTimeout(url, { method: 'GET', headers: { Range: `bytes=0-${RANGE_BYTES - 1}` } }, TIMEOUT_MS);
        return {
          method: 'GET(range,fallback-from-405)',
          status: getRes.status,
          contentType: getRes.headers.get('content-type'),
          contentLength: getRes.headers.get('content-length') || getRes.headers.get('content-range')?.split('/')?.[1] || null,
        };
      }
      return {
        method: 'HEAD',
        status: res.status,
        contentType: res.headers.get('content-type'),
        contentLength: res.headers.get('content-length'),
      };
    } catch (e) {
      // Network-level failure (incl. abort/timeout) — try ranged GET once as a fallback method.
      try {
        const getRes = await fetchWithTimeout(url, { method: 'GET', headers: { Range: `bytes=0-${RANGE_BYTES - 1}` } }, TIMEOUT_MS);
        return {
          method: 'GET(range,fallback-from-error)',
          status: getRes.status,
          contentType: getRes.headers.get('content-type'),
          contentLength: getRes.headers.get('content-length') || getRes.headers.get('content-range')?.split('/')?.[1] || null,
        };
      } catch (e2) {
        throw e2;
      }
    }
  };

  try {
    return await attempt();
  } catch (e) {
    // Retry once on network error.
    try {
      return await attempt();
    } catch (e2) {
      return { method: 'HEAD/GET', status: null, contentType: null, contentLength: null, error: e2.message || String(e2) };
    }
  }
}

// Public, unauthenticated GraphQL metadata lookup (no wallet/owner filter — just
// "what is transaction <id>"). The data-serving gateway route above does not emit a
// Content-Length header for these ArDrive-bundled data items and ignores Range
// requests (it streams the full chunked body instead), so this is the reliable,
// bandwidth-cheap way to get exact byte size for the Content-Length column.
async function fetchGraphqlSize(txid) {
  const body = JSON.stringify({
    query: `query { transaction(id: "${txid}") { data { size type } tags { name value } bundledIn { id } } }`,
  });
  const attempt = async () => {
    const res = await fetchWithTimeout(
      'https://arweave.net/graphql',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      TIMEOUT_MS
    );
    if (!res.ok) return { size: null, contentType: null, bundledIn: null };
    const json = await res.json();
    const tx = json?.data?.transaction;
    if (!tx) return { size: null, contentType: null, bundledIn: null };
    const ctTag = (tx.tags || []).find((t) => t.name.toLowerCase() === 'content-type');
    return {
      size: tx.data?.size ?? null,
      contentType: tx.data?.type ?? ctTag?.value ?? null,
      bundledIn: tx.bundledIn?.id ?? null,
    };
  };
  try {
    return await attempt();
  } catch {
    try {
      return await attempt();
    } catch (e) {
      return { size: null, contentType: null, bundledIn: null, error: e.message || String(e) };
    }
  }
}

async function runConcurrent(items, worker) {
  let idx = 0;
  let active = 0;
  return new Promise((resolve) => {
    const results = new Array(items.length);
    let done = 0;
    function pump() {
      if (done === items.length) return resolve(results);
      while (active < CONCURRENCY && idx < items.length) {
        const i = idx++;
        active++;
        worker(items[i]).then((r) => {
          results[i] = r;
          active--;
          done++;
          pump();
        });
      }
    }
    pump();
  });
}

async function runLiveChecks(rows) {
  let idx = 0;
  let active = 0;
  return new Promise((resolve) => {
    const results = new Array(rows.length);
    let done = 0;
    function pump() {
      if (done === rows.length) return resolve(results);
      while (active < CONCURRENCY && idx < rows.length) {
        const i = idx++;
        const row = rows[i];
        if (!row.txid || !TXID_RE.test(row.txid)) {
          results[i] = { status: null, contentType: null, contentLength: null, error: 'skipped (no valid txid)' };
          done++;
          continue;
        }
        active++;
        headOrRangedGet(row.txid).then((r) => {
          results[i] = r;
          active--;
          done++;
          pump();
        });
      }
    }
    pump();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  selfCheckBase32();
  const artists = loadArtists();

  const schemaProblems = checkSchema(artists);
  const { rows, structuralFailures, warnings, duplicateGroups } = validateRecords(artists);

  const allStructural = [...schemaProblems, ...structuralFailures];

  console.log('# artists.json validation report');
  console.log('');
  console.log(`Source: ${path.relative(REPO_ROOT, ARTISTS_JSON_PATH)}`);
  console.log(`Artists: ${artists.length}  |  Mix records: ${rows.length}`);
  console.log('');

  console.log('## Structural checks');
  console.log('');
  if (allStructural.length === 0) {
    console.log('PASS — no structural failures.');
  } else {
    console.log(`FAIL — ${allStructural.length} structural issue(s):`);
    for (const p of allStructural) console.log(`- ${p}`);
  }
  console.log('');

  console.log('## Warnings (non-fatal)');
  console.log('');
  if (warnings.length === 0) {
    console.log('None.');
  } else {
    for (const w of warnings) console.log(`- ${w}`);
  }
  console.log('');

  let liveResults = null;
  let gqlResults = null;
  if (LIVE) {
    console.log('## Live gateway status (https://arweave.net/<txid>)');
    console.log('');
    liveResults = await runLiveChecks(rows);

    // The gateway HEAD/GET route above does not emit Content-Length for these
    // bundled items, so fetch exact byte size from the public GraphQL endpoint
    // (metadata-only, read-only, no wallet/owner filter).
    gqlResults = await runConcurrent(rows, (row) => (row.txid && TXID_RE.test(row.txid) ? fetchGraphqlSize(row.txid) : Promise.resolve({ size: null, contentType: null })));

    console.log('| Artist | Mix Title | Txid | HTTP Status | Content-Type | Content-Length (bytes) | Note |');
    console.log('|---|---|---|---|---|---|---|');
    rows.forEach((row, i) => {
      const r = liveResults[i] || {};
      const g = gqlResults[i] || {};
      const status = r.status ?? (r.error ? `ERROR: ${r.error}` : 'n/a');
      const ct = r.contentType ?? g.contentType ?? '';
      const cl = g.size ?? r.contentLength ?? '';
      const note = row.notes.join('; ');
      console.log(`| ${row.artistName} | ${row.mixTitle} | ${row.txid ?? ''} | ${status} | ${ct} | ${cl} | ${note} |`);
    });
    console.log('');
    console.log('Content-Length is sourced from the public Arweave GraphQL endpoint (`data.size`), since the gateway data route omits Content-Length for these bundled ArDrive items and ignores Range requests.');
    console.log('');

    const okAudio = rows.filter((row, i) => {
      const r = liveResults[i] || {};
      const g = gqlResults[i] || {};
      const ct = r.contentType ?? g.contentType ?? '';
      return r.status === 200 && ct.startsWith('audio/');
    }).length;
    const notOk = rows.length - okAudio;
    console.log(`Live summary: ${okAudio}/${rows.length} returned HTTP 200 with an audio/* Content-Type. ${notOk} did not (see table for status/reason).`);
    console.log('');
  }

  console.log('## Machine-readable summary');
  console.log('');
  console.log('```json');
  console.log(
    JSON.stringify(
      {
        source: path.relative(REPO_ROOT, ARTISTS_JSON_PATH),
        artistCount: artists.length,
        mixCount: rows.length,
        structuralFailureCount: allStructural.length,
        structuralFailures: allStructural,
        warningCount: warnings.length,
        warnings,
        duplicateGroups: duplicateGroups.map((g) => ({
          txid: g.txid,
          owners: g.owners.map((o) => ({ artistName: o.artistName, mixTitle: o.mixTitle, allowlisted: o.allowlisted })),
        })),
        live: LIVE
          ? rows.map((row, i) => ({
              artistName: row.artistName,
              mixTitle: row.mixTitle,
              txid: row.txid,
              status: liveResults[i]?.status ?? null,
              contentType: liveResults[i]?.contentType ?? gqlResults[i]?.contentType ?? null,
              contentLength: gqlResults[i]?.size ?? liveResults[i]?.contentLength ?? null,
              contentLengthSource: gqlResults[i]?.size != null ? 'graphql' : liveResults[i]?.contentLength != null ? 'gateway-header' : null,
              bundledIn: gqlResults[i]?.bundledIn ?? null,
              method: liveResults[i]?.method ?? null,
              error: liveResults[i]?.error ?? null,
            }))
          : null,
      },
      null,
      2
    )
  );
  console.log('```');

  if (allStructural.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('FATAL: unhandled error in validator:', e);
  process.exit(2);
});
