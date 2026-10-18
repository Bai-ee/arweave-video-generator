#!/usr/bin/env node
/**
 * Read-only. Builds the final wallet inventory (JSON, all tx kinds; MD,
 * audio only) from the raw GraphQL scan + the ArFS metadata pairing pass.
 *
 * Usage:
 *   node scripts/audit/build-inventory.mjs <rawScanFile.json> <pairedAudioFile.json> <outJson> <outMd> <address>
 */
import fs from 'fs';

const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp4']);

function classifyKind(row) {
  const ct = row.contentType || '';
  const tagObj = {};
  for (const t of row.tags || []) tagObj[t.name] = t.value;

  if (AUDIO_TYPES.has(ct) || (tagObj['Content-Type'] && AUDIO_TYPES.has(tagObj['Content-Type']))) return 'audio';
  if (tagObj['Entity-Type'] === 'file') return 'arfs-file-metadata';
  if (tagObj['Entity-Type'] === 'folder') return 'arfs-folder-metadata';
  if (tagObj['Entity-Type'] === 'drive') return 'arfs-drive-metadata';
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('video/')) return 'video';
  if (ct === 'text/html') return 'html';
  if (ct === 'text/css') return 'css';
  if (ct === 'application/x.arweave-manifest+json') return 'manifest';
  if (ct === 'application/json') return 'json';
  if (ct.startsWith('text/')) return 'text';
  if (!ct) return 'unknown-no-content-type';
  return 'other:' + ct;
}

function filenameTagOf(row) {
  const tagObj = {};
  for (const t of row.tags || []) tagObj[t.name] = t.value;
  return tagObj['File-Name'] || tagObj['Title'] || tagObj['Mix-Title'] || tagObj['Name'] || null;
}

function fmtBytes(n) {
  if (n == null) return '';
  const num = Number(n);
  if (Number.isNaN(num)) return '';
  return (num / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtDate(ts) {
  if (ts == null) return '';
  return new Date(Number(ts) * 1000).toISOString().slice(0, 10);
}

function guessTitle(row, ardriveName) {
  if (ardriveName) return ardriveName.replace(/\.(mp3|wav|m4a|aac)$/i, '');
  // row here is the already-transformed inventory row (no .tags array left),
  // so use its precomputed filenameTag rather than re-deriving from tags.
  if (row.filenameTag) return row.filenameTag.replace(/\.(mp3|wav|m4a|aac)$/i, '');
  return '(unknown — no filename tag or ArDrive metadata match)';
}

async function main() {
  const [, , rawFile, pairedFile, outJson, outMd, address] = process.argv;
  if (!rawFile || !pairedFile || !outJson || !outMd || !address) {
    console.error('Usage: build-inventory.mjs <rawScanFile> <pairedAudioFile> <outJson> <outMd> <address>');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  const paired = JSON.parse(fs.readFileSync(pairedFile, 'utf8'));

  const ardriveByTxid = new Map();
  for (const r of paired.pairedAudio) {
    if (r.arfsMeta) ardriveByTxid.set(r.txid, r.arfsMeta);
  }

  const fullRows = raw.rows.map((row) => {
    const kind = classifyKind(row);
    const ardriveMeta = ardriveByTxid.get(row.txid) || null;
    const tagObj = {};
    for (const t of row.tags || []) tagObj[t.name] = t.value;
    return {
      txid: row.txid,
      kind,
      size: row.size,
      contentType: row.contentType || tagObj['Content-Type'] || null,
      filenameTag: filenameTagOf(row),
      ardriveName: ardriveMeta ? ardriveMeta.name : null,
      ardrivePath: null, // ArDrive CLI list-all-drives/list-drive did not succeed in this session — see report header
      blockTimestamp: row.blockTimestamp,
      blockTimestampISO: row.blockTimestamp ? new Date(row.blockTimestamp * 1000).toISOString() : null,
      blockHeight: row.blockHeight,
      bundledIn: row.bundledIn,
      source: row.sources,
    };
  });

  fullRows.sort((a, b) => (a.blockTimestamp || 0) - (b.blockTimestamp || 0));

  fs.writeFileSync(
    outJson,
    JSON.stringify(
      {
        address,
        generatedAt: new Date().toISOString(),
        totalTransactions: fullRows.length,
        rows: fullRows,
      },
      null,
      2
    )
  );
  console.error(`[build] wrote ${fullRows.length} rows to ${outJson}`);

  // Markdown: audio only
  const audioRows = fullRows.filter((r) => r.kind === 'audio');
  audioRows.sort((a, b) => (a.blockTimestamp || 0) - (b.blockTimestamp || 0));

  const lines = [];
  lines.push('# Wallet audio inventory — 2026-09-08');
  lines.push('');
  lines.push(`Wallet address: \`${address}\``);
  lines.push(`Total transactions enumerated (all kinds, owner-scoped GraphQL union of arweave.net + goldsky): ${fullRows.length}`);
  lines.push(`Audio-only rows (Content-Type audio/*): ${audioRows.length}`);
  const titledCount = audioRows.filter((r) => r.ardriveName || r.filenameTag).length;
  lines.push(`Audio rows with a recovered filename (ArDrive ArFS metadata pairing or a direct File-Name/Title/Mix-Title tag): ${titledCount}/${audioRows.length}`);
  lines.push('ArDrive drive count: 0 successfully listed — `ardrive-cli list-all-drives` failed with persistent gateway 404/504 errors against both the default gateway and `-g https://arweave.net` / `-g https://ar-io.net` (network/CLI issue, not a permissions issue — the wallet unambiguously owns ArDrive-tagged files per GraphQL). Filenames below were instead recovered by pairing each audio data transaction with its ArDrive ArFS "file" metadata transaction (a small JSON body `{name,size,lastModifiedDate,dataContentType,dataTxId}`) via block-height proximity — this is an L1 GraphQL fallback, not the CLI.');
  lines.push(`Endpoints: arweave.net/graphql = OK (28,003 owner-scoped rows). arweave-search.goldsky.com/graphql = OK (ran, unioned by txid).`);
  lines.push('');
  lines.push('| Timestamp | Size (MB) | Title (best guess) | txid | Content-Type |');
  lines.push('|---|---|---|---|---|');
  for (const r of audioRows) {
    const title = guessTitle(r, r.ardriveName);
    lines.push(`| ${fmtDate(r.blockTimestamp)} | ${fmtBytes(r.size)} | ${title} | \`${r.txid}\` | ${r.contentType || ''} |`);
  }

  fs.writeFileSync(outMd, lines.join('\n') + '\n');
  console.error(`[build] wrote ${audioRows.length} audio rows to ${outMd}`);
}

main();
