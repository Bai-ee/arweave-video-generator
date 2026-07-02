// Cloudflare Worker — range proxy for Arweave-hosted DJ mixes.
//
// Why this exists: the mixes are large bundled ANS-104 data-items. arweave.net
// serves them 200-without-Range (plays, but forward-scrub freezes); ar-io.dev
// honors BOUNDED Range (206) but returns 402 on the open-ended `Range: bytes=0-`
// a media element sends to start playback. Neither works alone. This Worker
// re-serves the SAME Arweave bytes with proper Range by always requesting a
// bounded window upstream — giving the audio player real playback AND scrub.
// Mixes are NOT moved or re-uploaded; they stay on Arweave. See MIX_AUDIO_SCRUBBING.md.
//
//   Client:   GET /mix/<txid>   (Range header from the <audio> element)
//   Upstream: GET ar-io.dev/raw/<txid> with a bounded Range → 206
//
// Known risk: ar-io.dev may meter heavy egress. If bounded requests start 402ing,
// upgrade to an R2-backed cache (fetch full file once into R2, serve Range from R2).

const UPSTREAM = 'https://ar-io.dev/raw'; // bounded-range requests only (never open-ended)
const CHUNK = 2 * 1024 * 1024;            // window size for open-ended / oversized requests
const TXID_RE = /^[A-Za-z0-9_-]{43}$/;    // Arweave tx id

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
    ...extra,
  };
}

// Parse a `Range: bytes=A-B` header into {start, end|null}. Returns null on malformed.
export function parseRange(header) {
  if (!header) return { start: 0, end: null };
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === '' && m[2] === '')) return null;
  const start = m[1] === '' ? 0 : parseInt(m[1], 10);
  const end = m[2] === '' ? null : parseInt(m[2], 10);
  if (end !== null && end < start) return null;
  return { start, end };
}

// Clamp an (open-ended or oversized) request to a bounded upstream window.
export function boundedWindow(start, end, chunk = CHUNK) {
  if (end === null || end - start + 1 > chunk) return { start, end: start + chunk - 1 };
  return { start, end };
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });

    const { pathname } = new URL(request.url);
    const seg = pathname.match(/^\/mix\/([^/]+)$/);
    if (!seg || !TXID_RE.test(seg[1]))
      return new Response('Bad or missing tx id', { status: 400, headers: corsHeaders() });
    const txid = seg[1];

    const parsed = parseRange(request.headers.get('Range'));
    if (parsed === null) return new Response('Invalid Range', { status: 416, headers: corsHeaders() });
    const win = boundedWindow(parsed.start, parsed.end);

    let upstream;
    try {
      upstream = await fetch(`${UPSTREAM}/${txid}`, { headers: { Range: `bytes=${win.start}-${win.end}` } });
    } catch (e) {
      return new Response('Upstream fetch failed: ' + e.message, { status: 502, headers: corsHeaders() });
    }
    if (upstream.status !== 206)
      return new Response(`Upstream did not honor Range (status ${upstream.status})`, { status: 502, headers: corsHeaders() });

    // Trust the upstream's actual served range (handles EOF clamping and true total size).
    const cr = upstream.headers.get('Content-Range') || '';
    const crm = cr.match(/bytes (\d+)-(\d+)\/(\d+|\*)/);
    const uStart = crm ? crm[1] : String(win.start);
    const uEnd = crm ? crm[2] : String(win.end);
    const total = crm ? crm[3] : '*';

    const headers = corsHeaders({
      'Content-Range': `bytes ${uStart}-${uEnd}/${total}`,
      'Content-Length': String(Number(uEnd) - Number(uStart) + 1),
      'Accept-Ranges': 'bytes',
      'Content-Type': upstream.headers.get('Content-Type') || 'audio/mpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });

    if (request.method === 'HEAD') return new Response(null, { status: 206, headers });
    return new Response(upstream.body, { status: 206, headers });
  },
};
