#!/usr/bin/env node
/**
 * Read-only HEAD (falls back to a 2KB ranged GET when HEAD is blocked) check
 * against https://arweave.net/<txid> for one or more txids. Prints
 * status/content-type/content-length per txid. No writes, no uploads.
 *
 * Usage: node scripts/audit/head-check.mjs <txid> [<txid> ...]
 */

async function checkOne(txid) {
  const url = `https://arweave.net/${txid}`;
  try {
    let res = await fetch(url, { method: 'HEAD' });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-2047' } });
    }
    return {
      txid,
      url,
      status: res.status,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
    };
  } catch (err) {
    return { txid, url, status: 'ERROR', error: err.message };
  }
}

async function main() {
  const txids = process.argv.slice(2);
  if (txids.length === 0) {
    console.error('Usage: node head-check.mjs <txid> [<txid> ...]');
    process.exit(1);
  }
  for (const txid of txids) {
    const result = await checkOne(txid);
    console.log(JSON.stringify(result));
  }
}

main();
