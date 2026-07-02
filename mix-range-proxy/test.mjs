// Local unit test for the range-proxy Worker. Mocks the ar-io.dev upstream so we
// verify the Worker's Range math/headers without deploying. Run: node test.mjs
import worker, { parseRange, boundedWindow } from './src/index.js';

const TOTAL = 137018513;
const TXID = '5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA';
let lastUpstreamRange = null;
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('  ❌ ' + m); } else console.log('  ✅ ' + m); };

// Mock upstream: behaves like ar-io.dev bounded-range (206), clamps end to TOTAL-1.
globalThis.fetch = async (url, opts) => {
  const r = (opts?.headers?.Range || '').match(/bytes=(\d+)-(\d+)/);
  lastUpstreamRange = opts?.headers?.Range;
  const s = Number(r[1]);
  const e = Math.min(Number(r[2]), TOTAL - 1);
  return new Response(new Uint8Array(e - s + 1), {
    status: 206,
    headers: { 'Content-Range': `bytes ${s}-${e}/${TOTAL}`, 'Content-Type': 'audio/mpeg' },
  });
};

const call = (method, path, range) =>
  worker.fetch(new Request('https://w.dev' + path, { method, headers: range ? { Range: range } : {} }));

// helper pure fns
console.log('parseRange / boundedWindow:');
ok(JSON.stringify(parseRange(null)) === JSON.stringify({ start: 0, end: null }), 'no header → 0-open');
ok(parseRange('bytes=0-') .end === null && parseRange('bytes=0-').start === 0, 'bytes=0- → open');
ok(parseRange('bytes=100-200').end === 200, 'bounded parsed');
ok(parseRange('bytes=abc') === null, 'garbage → null');
ok(parseRange('bytes=500-100') === null, 'end<start → null');
ok(boundedWindow(0, null).end === 2 * 1024 * 1024 - 1, 'open clamped to 2MB');
ok(boundedWindow(10, 20).end === 20, 'small bounded kept');

console.log('OPTIONS:');
{ const r = await call('OPTIONS', '/mix/' + TXID); ok(r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === '*', 'preflight 204 + CORS'); }

console.log('GET open (playback start, Range: bytes=0-):');
{ const r = await call('GET', '/mix/' + TXID, 'bytes=0-');
  ok(r.status === 206, '206');
  ok(lastUpstreamRange === 'bytes=0-2097151', 'upstream requested bounded 2MB, not open');
  ok(r.headers.get('Content-Range') === `bytes 0-2097151/${TOTAL}`, 'Content-Range has real total');
  ok(r.headers.get('Accept-Ranges') === 'bytes', 'Accept-Ranges: bytes');
  ok(Number(r.headers.get('Content-Length')) === 2097152, 'Content-Length = chunk'); }

console.log('GET bounded mid-file seek:');
{ const r = await call('GET', '/mix/' + TXID, 'bytes=60000000-60000100');
  ok(r.status === 206 && r.headers.get('Content-Range') === `bytes 60000000-60000100/${TOTAL}`, 'seek range echoed'); }

console.log('GET near-EOF (upstream clamps):');
{ const r = await call('GET', '/mix/' + TXID, `bytes=${TOTAL - 50}-`);
  ok(r.headers.get('Content-Range') === `bytes ${TOTAL - 50}-${TOTAL - 1}/${TOTAL}`, 'end clamped to total-1');
  ok(Number(r.headers.get('Content-Length')) === 50, 'Content-Length = 50 at EOF'); }

console.log('errors:');
{ const r = await call('GET', '/mix/not-a-txid'); ok(r.status === 400, 'bad txid → 400'); }
{ const r = await call('POST', '/mix/' + TXID); ok(r.status === 405, 'POST → 405'); }
{ const r = await call('GET', '/mix/' + TXID, 'bytes=abc'); ok(r.status === 416, 'bad Range → 416'); }

console.log(fail === 0 ? '\nALL PASS' : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
