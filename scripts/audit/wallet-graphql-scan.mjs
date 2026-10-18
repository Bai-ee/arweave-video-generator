#!/usr/bin/env node
/**
 * Read-only Arweave GraphQL wallet scan.
 *
 * Enumerates every transaction ever posted by a given owner address across
 * BOTH arweave.net/graphql and arweave-search.goldsky.com/graphql (neither
 * is guaranteed complete on its own), unions the results by txid, and ALSO
 * runs a second pass filtered on audio Content-Type tags (owner-scoped and
 * un-scoped) to catch bundled items whose L1 owner is the bundler rather
 * than the wallet itself.
 *
 * This script makes ONLY read (GraphQL query / HEAD) network calls. It never
 * writes, uploads, or spends. It takes an address as a CLI arg — it does not
 * touch any keyfile or .env content itself.
 *
 * Usage:
 *   node scripts/audit/wallet-graphql-scan.mjs <address> [outFile.json]
 */

import fs from 'fs';
import path from 'path';

const ENDPOINTS = [
  'https://arweave.net/graphql',
  'https://arweave-search.goldsky.com/graphql',
];

const AUDIO_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/mp4',
];

const OWNER_QUERY = `
query($owners:[String!], $after:String) {
  transactions(owners:$owners, first:100, after:$after, sort:HEIGHT_DESC) {
    pageInfo { hasNextPage }
    edges { cursor node {
      id block { height timestamp } data { size type }
      tags { name value } bundledIn { id }
      owner { address }
    } }
  }
}`;

const TAG_QUERY = `
query($owners:[String!], $tags:[TagFilter!], $after:String) {
  transactions(owners:$owners, tags:$tags, first:100, after:$after, sort:HEIGHT_DESC) {
    pageInfo { hasNextPage }
    edges { cursor node {
      id block { height timestamp } data { size type }
      tags { name value } bundledIn { id }
      owner { address }
    } }
  }
}`;

const TAG_QUERY_NO_OWNER = `
query($tags:[TagFilter!], $after:String) {
  transactions(tags:$tags, first:100, after:$after, sort:HEIGHT_DESC) {
    pageInfo { hasNextPage }
    edges { cursor node {
      id block { height timestamp } data { size type }
      tags { name value } bundledIn { id }
      owner { address }
    } }
  }
}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function gql(endpoint, query, variables, attempt = 1) {
  const MAX_ATTEMPTS = 5;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(`${endpoint} gave up after ${attempt} attempts (status ${res.status})`);
      }
      const backoff = Math.min(2000 * 2 ** (attempt - 1), 20000);
      await sleep(backoff);
      return gql(endpoint, query, variables, attempt + 1);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${endpoint} HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(`${endpoint} GraphQL errors: ${JSON.stringify(json.errors).slice(0, 500)}`);
    }
    return json.data;
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS) throw err;
    const backoff = Math.min(1500 * 2 ** (attempt - 1), 15000);
    await sleep(backoff);
    return gql(endpoint, query, variables, attempt + 1);
  }
}

async function paginateAll(endpoint, query, baseVariables, label, maxPages = 500) {
  const results = [];
  let after = null;
  let page = 0;
  for (;;) {
    page += 1;
    if (page > maxPages) {
      console.error(`[scan] ${label} @ ${endpoint} HIT maxPages=${maxPages} cap, stopping (results so far: ${results.length})`);
      break;
    }
    const variables = { ...baseVariables, after };
    let data;
    try {
      data = await gql(endpoint, query, variables);
    } catch (err) {
      console.error(`[scan] ${label} @ ${endpoint} page ${page} FAILED: ${err.message}`);
      break;
    }
    const conn = data.transactions;
    const edges = conn.edges || [];
    for (const e of edges) results.push(e.node);
    console.error(`[scan] ${label} @ ${endpoint} page ${page}: +${edges.length} (running total ${results.length})`);
    if (!conn.pageInfo.hasNextPage || edges.length === 0) break;
    after = edges[edges.length - 1].cursor;
    await sleep(250); // be polite
  }
  return results;
}

function mergeByTxid(map, nodes, source) {
  for (const node of nodes) {
    const existing = map.get(node.id);
    if (existing) {
      existing.sources.add(source);
    } else {
      map.set(node.id, { node, sources: new Set([source]) });
    }
  }
}

async function main() {
  const address = process.argv[2];
  const outFile = process.argv[3] || null;
  if (!address) {
    console.error('Usage: node wallet-graphql-scan.mjs <address> [outFile.json]');
    process.exit(1);
  }

  const merged = new Map(); // txid -> { node, sources:Set }

  // Pass 1: owner-scoped, ALL transactions
  for (const endpoint of ENDPOINTS) {
    const nodes = await paginateAll(endpoint, OWNER_QUERY, { owners: [address] }, 'owner-scan');
    mergeByTxid(merged, nodes, `${endpoint}#owner`);
  }

  // Pass 2: owner-scoped, audio Content-Type tag filter (redundant with pass 1
  // for L1 txs, but tag filters sometimes surface bundled items pass 1 misses)
  for (const endpoint of ENDPOINTS) {
    const nodes = await paginateAll(
      endpoint,
      TAG_QUERY,
      { owners: [address], tags: [{ name: 'Content-Type', values: AUDIO_CONTENT_TYPES }] },
      'owner+audio-tag-scan'
    );
    mergeByTxid(merged, nodes, `${endpoint}#owner+audiotag`);
  }

  // Pass 3: NO owner filter, audio Content-Type tag filter — in principle
  // this catches bundled items whose L1 owner is the bundler rather than the
  // wallet. In practice arweave.net/goldsky index ANS-104 bundle contents
  // with owner.address set to the DATA ITEM's own signer (i.e. this wallet,
  // for items it uploaded via Turbo/ArDrive/Bundlr), so pass 1/2 (owner-
  // scoped) already surface those. A fully unscoped scan of every audio file
  // ever posted to Arweave by anyone is unbounded (network-wide corpus), so
  // this pass is capped hard and used only as a bundledIn cross-check
  // against bundle txids we already know are ours from pass 1/2 — never as
  // a primary enumeration source.
  const ownBundleIds = new Set();
  for (const { node } of merged.values()) {
    if (node.bundledIn && node.bundledIn.id) ownBundleIds.add(node.bundledIn.id);
  }
  for (const { node } of merged.values()) {
    const isBundleFormat = (node.tags || []).some(
      (t) => t.name === 'Bundle-Format' || t.name === 'Bundle-Version'
    );
    if (isBundleFormat) ownBundleIds.add(node.id);
  }

  const PASS3_MAX_PAGES = Number(process.env.WALLET_SCAN_PASS3_MAX_PAGES || 15);
  const pass3Candidates = [];
  if (ownBundleIds.size > 0) {
    for (const endpoint of ENDPOINTS) {
      const nodes = await paginateAll(
        endpoint,
        TAG_QUERY_NO_OWNER,
        { tags: [{ name: 'Content-Type', values: AUDIO_CONTENT_TYPES }] },
        'global-audio-tag-scan (bounded bundledIn cross-check)',
        PASS3_MAX_PAGES
      );
      for (const node of nodes) {
        if (node.bundledIn && node.bundledIn.id && ownBundleIds.has(node.bundledIn.id)) {
          pass3Candidates.push(node);
        }
      }
    }
  } else {
    console.error('[scan] pass3 skipped: no known bundle txids from pass 1/2 to cross-check against');
  }
  mergeByTxid(merged, pass3Candidates, 'bundledIn-cross-check(bounded)');

  const rows = Array.from(merged.values()).map(({ node, sources }) => ({
    txid: node.id,
    owner: node.owner ? node.owner.address : null,
    size: node.data ? node.data.size : null,
    contentType: node.data ? node.data.type : null,
    blockHeight: node.block ? node.block.height : null,
    blockTimestamp: node.block ? node.block.timestamp : null,
    bundledIn: node.bundledIn ? node.bundledIn.id : null,
    tags: node.tags || [],
    sources: Array.from(sources),
  }));

  rows.sort((a, b) => (a.blockTimestamp || 0) - (b.blockTimestamp || 0));

  const summary = {
    address,
    totalTransactions: rows.length,
    scannedAt: new Date().toISOString(),
    endpoints: ENDPOINTS,
    pass3BundledInCrossCheck: {
      note: 'bounded cross-check only, not exhaustive network-wide scan',
      maxPagesPerEndpoint: Number(process.env.WALLET_SCAN_PASS3_MAX_PAGES || 15),
      ownBundleIdsKnown: ownBundleIds.size,
    },
  };

  const payload = { summary, rows };

  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2));
    console.error(`[scan] wrote ${rows.length} rows to ${outFile}`);
  } else {
    console.log(JSON.stringify(payload, null, 2));
  }
}

main().catch((err) => {
  console.error('[scan] FATAL', err);
  process.exit(1);
});
