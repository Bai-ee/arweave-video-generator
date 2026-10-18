#!/usr/bin/env node
/**
 * Read-only. Pairs every audio data transaction found in the GraphQL raw
 * scan with its ArDrive ArFS "file" metadata transaction (a small JSON body
 * carrying {name, size, lastModifiedDate, dataContentType, dataTxId}) that
 * is NOT linked via tags to the data tx — only by upload-time proximity
 * (same or very close block height). This recovers original filenames that
 * a raw L1 GraphQL query alone cannot see.
 *
 * Strategy: for each audio data tx, look at Entity-Type=file metadata
 * transactions within +/- WINDOW blocks of the data tx's block height,
 * fetch each candidate's tiny JSON body (GET, a few hundred bytes), and
 * keep the one whose `dataTxId` field matches. Also records EVERY
 * Entity-Type=file metadata body fetched (deduped) so a companion script
 * can fuzzy-match filenames against the 45 un-hosted reviews even for
 * files whose data tx isn't in our starting audio set.
 *
 * Usage: node scripts/audit/pair-metadata.mjs <rawScanFile.json> <outFile.json>
 */
import fs from 'fs';

const WINDOW_BLOCKS = 20;
const CONCURRENCY = 8;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJsonBody(txid, attempt = 1) {
  const url = `https://arweave.net/${txid}`;
  try {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 4) return { txid, error: `status ${res.status}` };
      await sleep(1000 * attempt);
      return fetchJsonBody(txid, attempt + 1);
    }
    if (!res.ok) return { txid, error: `status ${res.status}` };
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      return { txid, json };
    } catch (e) {
      return { txid, error: 'not JSON', raw: text.slice(0, 100) };
    }
  } catch (err) {
    if (attempt >= 4) return { txid, error: err.message };
    await sleep(1000 * attempt);
    return fetchJsonBody(txid, attempt + 1);
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const my = idx++;
      results[my] = await fn(items[my], my);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

async function main() {
  const [, , rawFile, outFile] = process.argv;
  if (!rawFile || !outFile) {
    console.error('Usage: node pair-metadata.mjs <rawScanFile.json> <outFile.json>');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  const rows = data.rows;

  const AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp4']);
  const audioRows = rows.filter(
    (r) => AUDIO_TYPES.has(r.contentType) || (r.tags || []).some((t) => t.name === 'Content-Type' && AUDIO_TYPES.has(t.value))
  );

  const fileMeta = rows.filter((r) => (r.tags || []).some((t) => t.name === 'Entity-Type' && t.value === 'file'));
  console.error(`[pair] audio data txs: ${audioRows.length}, ArFS file-metadata candidates: ${fileMeta.length}`);

  // Build candidate metadata txids to fetch: union of, for every audio row,
  // all fileMeta entries within WINDOW_BLOCKS of its blockHeight.
  const candidateSet = new Map(); // txid -> metaRow
  for (const audio of audioRows) {
    if (audio.blockHeight == null) continue;
    for (const m of fileMeta) {
      if (m.blockHeight == null) continue;
      if (Math.abs(m.blockHeight - audio.blockHeight) <= WINDOW_BLOCKS) {
        candidateSet.set(m.txid, m);
      }
    }
  }
  const candidates = Array.from(candidateSet.keys());
  console.error(`[pair] fetching ${candidates.length} candidate metadata JSON bodies (concurrency ${CONCURRENCY})...`);

  let fetched = 0;
  const bodies = await mapWithConcurrency(candidates, CONCURRENCY, async (txid) => {
    const result = await fetchJsonBody(txid);
    fetched += 1;
    if (fetched % 25 === 0) console.error(`[pair] fetched ${fetched}/${candidates.length}`);
    return result;
  });

  const byDataTxId = new Map(); // dataTxId -> {name,size,lastModifiedDate,dataContentType,metaTxId}
  const allMetaEntries = [];
  for (const b of bodies) {
    if (b.json && b.json.dataTxId) {
      const entry = {
        metaTxId: b.txid,
        name: b.json.name,
        size: b.json.size,
        lastModifiedDate: b.json.lastModifiedDate,
        dataContentType: b.json.dataContentType,
        dataTxId: b.json.dataTxId,
      };
      allMetaEntries.push(entry);
      byDataTxId.set(b.json.dataTxId, entry);
    }
  }

  const pairedAudio = audioRows.map((audio) => {
    const meta = byDataTxId.get(audio.txid) || null;
    return { ...audio, arfsMeta: meta };
  });

  const matchedCount = pairedAudio.filter((r) => r.arfsMeta).length;
  console.error(`[pair] matched ${matchedCount}/${audioRows.length} audio data txs to a filename`);

  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        windowBlocks: WINDOW_BLOCKS,
        audioCount: audioRows.length,
        matchedCount,
        pairedAudio,
        allMetaEntriesFetched: allMetaEntries,
      },
      null,
      2
    )
  );
  console.error(`[pair] wrote ${outFile}`);
}

main().catch((err) => {
  console.error('[pair] FATAL', err);
  process.exit(1);
});
