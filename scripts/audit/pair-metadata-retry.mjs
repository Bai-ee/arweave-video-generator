#!/usr/bin/env node
// Read-only. Retries ArFS metadata pairing only for audio data txs that
// pair-metadata.mjs failed to match (transient gateway errors), with lower
// concurrency and more retries. Merges results back into the paired file.
import fs from 'fs';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchJsonBody(txid, attempt = 1) {
  const url = `https://arweave.net/${txid}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      if (attempt >= 6) return { txid, error: `status ${res.status}` };
      await sleep(800 * attempt);
      return fetchJsonBody(txid, attempt + 1);
    }
    const text = await res.text();
    try {
      return { txid, json: JSON.parse(text) };
    } catch {
      return { txid, error: 'not JSON' };
    }
  } catch (err) {
    if (attempt >= 6) return { txid, error: err.message };
    await sleep(800 * attempt);
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
  const [, , rawFile, pairedFile] = process.argv;
  const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
  const paired = JSON.parse(fs.readFileSync(pairedFile, 'utf8'));

  const unmatched = paired.pairedAudio.filter((r) => !r.arfsMeta);
  console.error(`[retry] ${unmatched.length} audio rows still unmatched; re-scanning nearby ArFS metadata`);

  const WINDOW_BLOCKS = 30; // slightly wider net on retry
  const fileMeta = raw.rows.filter((r) => (r.tags || []).some((t) => t.name === 'Entity-Type' && t.value === 'file'));

  const candidateSet = new Map();
  for (const audio of unmatched) {
    if (audio.blockHeight == null) continue;
    for (const m of fileMeta) {
      if (m.blockHeight == null) continue;
      if (Math.abs(m.blockHeight - audio.blockHeight) <= WINDOW_BLOCKS) candidateSet.set(m.txid, m);
    }
  }
  // Exclude ones we already successfully fetched (in allMetaEntriesFetched)
  const alreadyHave = new Set(paired.allMetaEntriesFetched.map((e) => e.metaTxId));
  const candidates = Array.from(candidateSet.keys()).filter((id) => !alreadyHave.has(id));
  console.error(`[retry] fetching ${candidates.length} new candidate metadata bodies (concurrency 4)...`);

  let n = 0;
  const bodies = await mapWithConcurrency(candidates, 4, async (txid) => {
    const r = await fetchJsonBody(txid);
    n += 1;
    if (n % 20 === 0) console.error(`[retry] ${n}/${candidates.length}`);
    return r;
  });

  const newEntries = [];
  const byDataTxId = new Map();
  for (const b of bodies) {
    if (b.json && b.json.dataTxId) {
      const entry = { metaTxId: b.txid, name: b.json.name, size: b.json.size, lastModifiedDate: b.json.lastModifiedDate, dataContentType: b.json.dataContentType, dataTxId: b.json.dataTxId };
      newEntries.push(entry);
      byDataTxId.set(b.json.dataTxId, entry);
    }
  }

  let newlyMatched = 0;
  for (const r of paired.pairedAudio) {
    if (!r.arfsMeta && byDataTxId.has(r.txid)) {
      r.arfsMeta = byDataTxId.get(r.txid);
      newlyMatched += 1;
    }
  }
  paired.allMetaEntriesFetched.push(...newEntries);
  paired.matchedCount = paired.pairedAudio.filter((r) => r.arfsMeta).length;

  fs.writeFileSync(pairedFile, JSON.stringify(paired, null, 2));
  console.error(`[retry] newly matched ${newlyMatched}; total matched now ${paired.matchedCount}/${paired.audioCount}`);
}

main().catch((e) => { console.error('[retry] FATAL', e); process.exit(1); });
