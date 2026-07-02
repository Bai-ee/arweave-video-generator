# ue-mix-range-proxy

Cloudflare Worker that makes Arweave-hosted DJ mixes **scrubbable**. It re-serves the
same Arweave bytes with proper HTTP Range support so the site's audio player can play
**and** forward-seek. Mixes stay on Arweave — nothing is moved or re-uploaded.

Background + why a proxy is needed: [`../MIX_AUDIO_SCRUBBING.md`](../MIX_AUDIO_SCRUBBING.md).

## What it does

```
GET /mix/<txid>   (with the media element's Range header)
  → fetches a BOUNDED window from ar-io.dev/raw/<txid> (206)
  → returns 206 Partial Content with a correct Content-Range + Accept-Ranges
```

Open-ended `Range: bytes=0-` (playback start) is clamped to a 2 MB window so the
upstream never sees the open-ended request that ar-io.dev answers with `402`.

Logic is unit-tested (mocked upstream): `node test.mjs` → ALL PASS.

## Deploy (one-time — needs YOUR Cloudflare account)

This is the only step that can't be automated for you; a Worker deploys to your account.

```bash
cd mix-range-proxy
npx wrangler login        # opens browser → log into (or create) a free Cloudflare account
npx wrangler deploy       # → https://ue-mix-range-proxy.<your-account>.workers.dev
```

## Verify BEFORE pointing the site at it

```bash
HOST=https://ue-mix-range-proxy.<your-account>.workers.dev
TX=5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA
curl -s -o /dev/null -D - -H "Range: bytes=0-100" "$HOST/mix/$TX" | grep -iE "HTTP/|content-range|accept-ranges"
# expect: 206 + content-range: bytes 0-100/<total> + accept-ranges: bytes
curl -s -o /dev/null -D - -H "Range: bytes=60000000-60000100" "$HOST/mix/$TX" | grep -iE "HTTP/|content-range"
# expect: 206 + content-range: bytes 60000000-60000100/<total>
```

Then open a page that uses it and drag a playing mix — it should scrub, not freeze.

## Activate (point the site at the Worker)

Only after the Worker is verified live. In `lib/WebsitePageGenerator.cjs` (and the `.js`
twin), reintroduce a render-time rewrite at the two `href="${…mixArweaveURL}"` emit
points (same seam the reverted `toPlaybackGateway()` used), mapping a stored
`arweave.net/<txid>` to `https://<worker-host>/mix/<txid>`. Then redeploy the website.
Keep canonical `arweave.net` stored in Firestore — this stays a presentation-layer swap.

## Known risk / upgrade path

ar-io.dev may meter heavy egress. If bounded requests start returning `402` under load,
upgrade to an R2-backed cache: fetch each mix once into an R2 bucket, then serve Range
from R2 (native Range support, no upstream dependency). That's a bucket + binding + a
cache-fill path — bigger, but fully self-hosted.
