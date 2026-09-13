# Audio streaming & scrubbing remediation — verification evidence

Companion to `MIX_AUDIO_SCRUBBING.md` (which documents the design). This file is the
measured evidence behind it, gathered 2026-09-08 against the live gateways and a real browser.
Plan: `docs/plans/UNDERGROUND_EXISTENCE_AUDIO_STREAMING_REMEDIATION_MASTER_PLAN.md` in the
Bballi_Portfolio workspace.

Unit tests: `npm test` -> 55/55 passing (`node --test tests/*.test.mjs`, no dependencies).

---


Both builds served as static files and driven in the same Chrome 152 profile, with the tab
**foregrounded**.

- BEFORE: `http://localhost:8898` — the pre-change `website/js/player.js` (byte copy taken before
  any edit) plus a reconstruction of the pre-change `boot.js`. `window.UEPlayerCore` is absent and
  `js/player-core.js` 404s, confirming the old code path is what ran.
- AFTER: `http://localhost:8899` — the repository working copy as delivered.

> **Correction to an earlier note in this file.** A first pass at the baseline was run in a
> background MCP tab and appeared to show that mixes never start at all. That was an artifact: a
> Chrome tab whose `document.visibilityState` is `hidden` defers media loading entirely —
> `readyState` stays 0 with no error even for a 2-second WAV **data URI** with no network involved.
> Once the tab is foregrounded the baseline build *does* start playing. Every measurement below was
> re-taken with the tab visible. The source-selection and seek findings survived that correction;
> the "never starts" claim did not, and is withdrawn.

## BEFORE — the two defects, measured

Page `acidman.html`, mix "Live @ Smartbar", started with a real mouse click.

**1. Playback is routed to the non-seekable raw gateway.**

```
queue[0].srcTier      2                      <- tier 2 == raw arweave.net
audio.src             https://tsksz4ee….arweave.net/nJUs8IQjI8muHPGrfSdoVSur1zX783L…
audio.readyState      4
audio.duration        5361
```

Tier 2 is the "plays, no scrub" tier. It was chosen even though **both** range gateways were warm
and answering `206` in ~1 s at that moment (measured immediately before: fllstck 1.10 s / 1.20 s,
frostor 0.99 s / 0.81 s). Cause: `resolveStartTier()` caps its probe race at 4000 ms and the media
element's own open-ended request is far slower than a 128-byte probe, so the race routinely expires
and calls back with `lastTier`.

**2. The chosen source cannot seek, and the failure is invisible.**

```
audio.seekable            [[0, 0]]        <- zero-width: nothing is seekable
audio.buffered            [[0, 2.9]]
audio.currentTime = 2680  -> no exception thrown
   ... 7 s later          currentTime == 0
audio.currentTime = 1200  -> no exception thrown
   ... 5 s later          currentTime == 0
```

`duration` is known (5361 s), so the UI happily paints a progress position, but the media element
reports a **zero-width** seekable range and silently discards every seek, snapping back to 0. The
old `seekToFraction()` treats "the assignment did not throw" as success and paints progress
immediately — so the waveform shows a position the audio never reached. This is precisely the
reported symptom: "clicking/dragging the waveform does nothing."

There is also no status UI to report any of it: `document.getElementById('player-bar-status-region')`
is `null` on the baseline build.

## AFTER — the same two measurements

Same browser, same mixes, foregrounded tab.

**1. Playback is routed to a confirmed range gateway, never the raw one.**

```
audio.src        https://arweave.fllstck.dev/<txid>
snapshot.state   playing
candidates       arweave.fllstck.dev  rangeConfirmed=true
                 frostor.xyz          rangeConfirmed=true
audio.seekable   [[0, 4501]]      <- the whole file
```

Across every test in this session — including a forced double-gateway failure — `audio.src` never
contained `arweave.net`. The canonical `arweave.net` URL remains on the download controls
(verified: `#player-bar-status-download-link` and `#featured-download-button` both point at it).

**2. Seeks land exactly, and are confirmed before the UI commits.**

Measured at the `seeked` confirmation (not sampled later, which would include normal playback
drift):

| target | requested | landed | delta | outcome |
|---|---|---|---|---|
| 25 % | 1125.34 | 1125.34 | **0.00 s** | confirmed |
| 50 % | 2250.68 | 2250.68 | **0.00 s** | confirmed |
| 75 % | 3376.02 | 3376.02 | **0.00 s** | confirmed |
| 60 % (drag) | 2700.81 | 2700.81 | **0.00 s** | confirmed |
| 40 % (after a forced failover, hero waveform) | 1447.55 | 1447.55 | **0.00 s** | confirmed |

All of these were performed after >10 minutes of continuous playback on the same track.

---


Harness: `python3 -m http.server 8899` serving `website/`; Chrome 152 on macOS; tab foregrounded.
Baseline comparison harness: same, port 8898, serving the pre-change `player.js` + reconstructed
pre-change `boot.js`, with no `player-core.js` (verified 404).

> Environment note that shapes every result below: a Chrome tab whose `document.visibilityState`
> is `hidden` **defers media loading entirely** — `readyState` stays 0 with no error, even for a
> 2-second WAV data URI with no network involved. Sustained playback is unaffected once started.
> Every playback test here was therefore started with the tab foregrounded, and only one tab can
> be foreground at a time, so all playback tests are serial.

## AC — Playback continuity, 120-minute mix

Mix: ANDREW EMIL — "Live @ Viva Acid '24", txid `xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM`,
280,171,663 bytes, `audio.duration` 7004 s. Page `andrewemil.html`, started by a real mouse click
on the row's play control.

Sampled every 5 s in-page for the whole run:

| metric | result |
|---|---|
| samples | 127 |
| wall time sampled | 635 s |
| **continuous playback** | **10.5 min** (currentTime 33.32 → 663.32) |
| distinct playback states | `playing` only |
| distinct generations | `1` (no source replacement at any point) |
| distinct hosts | `https://arweave.fllstck.dev/` only |
| status messages shown | none (empty string throughout) |
| readyState values | `4` only |
| ever paused | no |
| backward time jumps | 0 |
| sample-to-sample advance | min 4.99 s, max 5.01 s (1:1 with wall clock) |
| recovery/error log entries | 0 |

**PASS** — exceeds the ">= 10 continuous minutes, no reset, no manual interaction, no false
terminal state" criterion. Note this run exercised the streaming path as finally shipped; the
later review fixes touched only the gesture unlock, pending-seek bookkeeping, status-pill reset,
and pointer-capture release — none of which are in the streaming path.

## AC — Playback continuity, 60-minute mix (final build)

Mix: ACIDMAN — "Stargazers vs Sunbathers", txid `fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g`,
`audio.duration` 4501 s. Page `acidman.html`, started by a real mouse click.

| metric | result |
|---|---|
| samples | 115 (+ a 40 s confirmation window) |
| **continuous playback** | **10.35 min** |
| distinct states / generations / hosts | `playing` / `1` / `arweave.fllstck.dev` only |
| status messages | none |
| readyState | `4` only |
| ever paused / backward jumps | no / 0 |
| sample advance | 4.99–5.01 s (1:1 with wall clock) |
| recovery/error entries | 0 |
| `audio.seekable` | `[0, 4501]` (whole file) |

**PASS**

## AC — Forced primary-gateway failure resumes within 2 s of last confirmed position

Ran twice, on two different pages/mixes, by dispatching the media element's own `error` event mid
-playback (what a gateway dying produces; the controller cannot distinguish it from a real one).

| run | before | after | position delta | wall time to resume |
|---|---|---|---|---|
| acidman.html, 60-min mix | t=2736.51 on `arweave.fllstck.dev`, gen 1 | t=2736.38 on `frostor.xyz`, gen 2, `playing` | **−0.13 s** | ≤ 2.0 s |
| index.html, featured mix | t=21.62 on `arweave.fllstck.dev`, gen 1 | t=21.50 on `frostor.xyz`, gen 2, `playing` | **−0.12 s** | ≤ 2.0 s |

The failed candidate is marked `unhealthy=true` and is not retried. Wall time is quantised by the
250–500 ms polling interval used to detect resumption, so it is an upper bound, not a precise
figure.

**PASS** (criterion: within 2 seconds of last confirmed time)

## AC — Both range gateways fail: visible retry/error, no restart, no non-seekable fallback

`acidman.html?uefail=all` (test-only flag rewrites every candidate host to an unreachable address).

```
snapshot.state            failed
snapshot.terminalReason   exhausted
candidates                both unhealthy=true
audio.src                 https://ue-fail-test.invalid/…    (never arweave.net)
audio.currentTime         0        (nothing played, nothing restarted)
status text               "Playback unavailable"
status region class       player-status-region is-failed
live region               "Playback unavailable"
Retry button              rendered and visible (offsetParent set)
download link             https://tsksz4ee….arweave.net/…   (canonical, unchanged)
waveform                  .is-seek-disabled applied
error log                 error:4 -> recovery:error -> error:4 -> error:exhausted
```

One failover attempt per candidate, then terminal. **PASS**

### Retry control

Clicking `#player-bar-retry-button` re-attempted both candidates (generation 2 → 4), returned to
`failed`, and **stayed** there: generation was still 4 after a further 8 s idle, so there is no
retry loop. `audio.src` never became a raw `arweave.net` URL at any point. **PASS**

### Defect found and fixed during this test

Provoking a waveform seek *while already in the terminal state* showed the transient
"Seek failed — restored previous position." notice, and when that notice expired 4 s later the
status region was cleared completely — leaving `state: 'failed'` with **no message and no Retry
button**. Dead playback with a silent UI, i.e. the exact failure the criterion forbids.

Fixed in `player.js`: the transient's expiry now restores the authoritative status rather than
blanking unconditionally. Re-verified in the browser:

| moment | status text | region class | Retry visible |
|---|---|---|---|
| terminal reached | Playback unavailable | `is-failed` | yes |
| during transient (+1.2 s) | Seek failed — restored previous position. | `is-seeking` | no |
| after transient (+6 s) | **Playback unavailable** | **`is-failed`** | **yes** |

## AC — Seeking

Measured at the `seeked` confirmation. Full table in `BASELINE-BROWSER-EVIDENCE.md`.

- 25 % / 50 % / 75 %: requested vs landed delta **0.00 s** in all three (criterion: within 2 s). **PASS**
- Drag: `pointerdown` moved the audio **not at all** (baseline seeked on pointerdown — fixed); six
  `pointermove`s left `currentTime` advancing normally (3397.68 → 3398.29, i.e. ordinary playback,
  no seek); release committed **exactly one** seek, landing exactly on target. **PASS**
- After >5 minutes of playback: every seek above was performed after 10+ continuous minutes. **PASS**
- After a simulated source failover: seek on the hero waveform, requested 1447.55 → landed 1447.55,
  delta **0.00 s**, confirmed. **PASS**
- Failed seek restores the confirmed playhead: with no range-capable source, a waveform click left
  `currentTime` unchanged, requested **no** seek from the controller, and surfaced
  "Seek failed — restored previous position." in both the visible pill and the live region, with the
  waveform marked `.is-seek-disabled`. **PASS**

## AC — Regression and deploy safety

| feature | result |
|---|---|
| queue building | 7 entries, every anchor has `data-queue-idx`, 7 `.play-circle` wired |
| shuffle | toggles, `is-on` class stays in sync |
| repeat | cycles off → all → one → off, `data-mode` attribute tracks it |
| prev, `currentTime > 4 s` | restarts the SAME track (t 1493.9 → 4.7, index unchanged, still playing) |
| next | advances 0 → 1 ("Love Manifesto 3"), plays on a range gateway, not raw |
| volume | applies (0.42) and persists to `localStorage['ue-volume']` |
| downloads | hero + status links both on the canonical `arweave.net` URL while playback is on a gateway |
| featured mix randomiser | ran, swapped hero title/artist/meta/duration, hero waveform reseeded |
| hero surface | status region, Retry, live region all built; `role="slider"` on the waveform |
| search overlay | opens, filters ("acid" → Selectors + Mixes), closes |
| mobile menu | opens and closes |
| playback during all of the above | uninterrupted |
| Arweave path-manifest safety | no root-absolute paths in the changed JS/CSS; assets referenced as `js/…`, `img/…`, `artists.json`; no `url()` or external host in the new CSS |

**PASS**

## Not verified

- **iOS Safari / real mobile.** No device or simulator was available. The autoplay-unlock fix is
  implemented to the standard pattern (the shared `<audio>` element is created in `boot.js` and
  played synchronously inside the genuine, trusted first tap, using a decodable silent WAV source)
  but its effect on WebKit's autoplay gate is unverified.
- **A real gateway outage.** Failover was exercised with the media element's own `error` event and
  with unreachable candidate hosts, not by an actual gateway going down mid-stream.
- **The seek-timeout and rejected-landing paths** could not be forced against a healthy gateway
  in-browser; they are covered by unit tests only.
- **Very long unattended playback.** Continuity was verified to ~10.5 minutes per mix, per the
  criterion — not to the full 60/120-minute duration.

---

# Appendix — gateway probe evidence


Measured 2026-09-08 by the gateway-evidence agent. All numbers below come from the exact `curl`
commands shown; nothing is extrapolated or assumed. Raw header dumps for every probe are saved in
`headers/` next to this file; the raw stdout lines are in `RESULTS.log`, `RESULTS_sizing_extra.log`,
`RESULTS_semantics.log` in the same directory.

Base probe command (parameterized by host/txid/range):

```bash
curl -sS -L -o /dev/null -D <headerfile> \
  -H "Range: <range>" \
  -w 'code=%{http_code} time=%{time_total} size=%{size_download} redirects=%{num_redirects}' \
  --max-time 45 "<host><txid>"
```

## 1. Test corpus

Selected from `website/artists.json`. Byte totals below are measured, not the nominal
`mixDuration` field (which turned out to be an unreliable label — see note).

| slot | artist | title | `mixDuration` (label) | txid | total bytes (measured) |
|---|---|---|---|---|---|
| ~60 min | ACIDMAN | Stargazers vs Sunbathers | 60:00 | `fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g` | 108,034,116 (103.0 MiB) |
| 120 min | ANDREW EMIL / RED EYE / VIVA ACID — "Live @ Viva Acid '24" | 120:00 | `xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM` | 280,171,663 (267.2 MiB) — **matches the lead's number exactly** |
| longest available | TYREL WILLIAMS | Live at Podlasie | 120:00 | `aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU` | 300,733,046 (286.8 MiB) |
| short/other | STAR TRAXX | Mix Tape | 30:00 | `3Pl3Q1KVjHMQcLycnIlLW2HHAx5_LxmT819YVnUA-JQ` | 43,747,288 (41.7 MiB) |

Canonical URLs (host is the sandbox subdomain named in `artists.json`, path is the txid):
- `https://pq4y62fmg2rlmdprylwbzvhf6weeg265x6wpdoknwfosey3pb7ua.arweave.net/fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g`
- `https://yr7svqh3h2l5ka7nlu5sehndf5ekaytclzaje5z4b7of3xs4g3zq.arweave.net/xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM`
- `https://nbdlqhjegffe2b43r4pz5dbnnluh6b6osbilcbqrlsc7e3ecxasq.arweave.net/aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU`
- `https://3t4xoq2sswghgedqxsojzckllnq4oay6p4xrte7tl5mfm5ia7cka.arweave.net/3Pl3Q1KVjHMQcLycnIlLW2HHAx5_LxmT819YVnUA-JQ`

**Corpus-selection note:** `mixDuration` is not a reliable proxy for file size. Five different
mixes carry the label `"120:00"`. I sized all five via a `bytes=0-127` probe on
`arweave.fllstck.dev` before finalizing the corpus:

| candidate | txid | measured total bytes | outcome |
|---|---|---|---|
| SASSMOUTH — Live at Podlasie | `o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0` | 234,337,525 | rejected — smaller than Tyrel's |
| ANDREW EMIL/RED EYE — Live @ Viva Acid '24 | `xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM` | 280,171,663 | kept as the "120-minute" slot |
| **TYREL WILLIAMS — Live at Podlasie** | `aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU` | **300,733,046** | **kept as "longest available"** |
| JOHN SIMMONS — Live @ UE.info | `pLuskRb2iI0Q1A2lw9MWfi3G5qm9CIkz71T3p4k4cjM` | n/a — see anomaly below | rejected |
| SEAN SMITH — Martians Mixtape | `DlB2BFAYP_zTWS-uakYisom_3CIlqm7d1Zc7lrZ9C0Y` | 188,692,025 | rejected — smaller |

Anomaly found during sizing: the John Simmons txid returned `HTTP/1.1 404 Not Found` on
`arweave.fllstck.dev` (35.96s, 9-byte body) while still carrying `Content-Type: audio/mpeg;
charset=utf-8` and a `Content-Range: bytes 0-127/76657276` header. A 404 error page can carry a
plausible-looking `Content-Range`. This is a real, measured argument for the integration contract's
`evaluateProbe` rule of gating strictly on `status === 206`, not on header presence alone. This txid
was dropped from the corpus and is not part of the main matrix below.

## 2–3. Full probe matrix (status / Content-Range / Accept-Ranges / seconds)

`a` = `bytes=0-127`. `b` = `bytes=<total/2>-<total/2+65535>` (midpoint computed from each mix's
measured total above). Attempt 2/3 rows are warm re-runs of the same exact request.

| host | mix | range | attempt | status | Content-Range | Accept-Ranges | redirects | seconds |
|---|---|---|---|---|---|---|---|---|
| arweave.fllstck.dev | 60-min | a | 1 | 206 | `bytes 0-127/108034116` | bytes | 1 | 11.331 |
| arweave.fllstck.dev | 60-min | b | 1 | 206 | `bytes 54017058-54082593/108034116` | bytes | 1 | 1.466 |
| arweave.fllstck.dev | 120-min | a | 1 | 206 | `bytes 0-127/280171663` | bytes | 1 | 0.910 |
| arweave.fllstck.dev | 120-min | b | 1 | 206 | `bytes 140085831-140151366/280171663` | bytes | 1 | 5.357 |
| arweave.fllstck.dev | longest (Tyrel) | a | 1 (cold, from sizing sweep) | 206 | `bytes 0-127/300733046` | bytes | 1 | 12.725 |
| arweave.fllstck.dev | longest (Tyrel) | a | 2 (warm) | 206 | `bytes 0-127/300733046` | bytes | 1 | 2.125 |
| arweave.fllstck.dev | longest (Tyrel) | a | 3 (warm) | 206 | `bytes 0-127/300733046` | bytes | 1 | 5.712 |
| arweave.fllstck.dev | longest (Tyrel) | b | 1 | 206 | `bytes 150366523-150432058/300733046` | bytes | 1 | 7.394 |
| arweave.fllstck.dev | short | a | 1 | 206 | `bytes 0-127/43747288` | bytes | 1 | 10.814 |
| arweave.fllstck.dev | short | b | 1 | 206 | `bytes 21873644-21939179/43747288` | bytes | 1 | 8.757 |
| frostor.xyz | 60-min | a | 1 | 206 | `bytes 0-127/108034116` | bytes | 1 | 6.120 |
| frostor.xyz | 60-min | b | 1 | 206 | `bytes 54017058-54082593/108034116` | bytes | 1 | 1.393 |
| frostor.xyz | 120-min | a | 1 (cold) | 206 | `bytes 0-127/280171663` | bytes | 1 | 4.820 |
| frostor.xyz | 120-min | a | 2 (warm) | 206 | `bytes 0-127/280171663` | bytes | 1 | 0.640 |
| frostor.xyz | 120-min | a | 3 (warm) | 206 | `bytes 0-127/280171663` | bytes | 1 | 1.652 |
| frostor.xyz | 120-min | b | 1 | 206 | `bytes 140085831-140151366/280171663` | bytes | 1 | 2.092 |
| frostor.xyz | longest (Tyrel) | a | 1 | 206 | `bytes 0-127/300733046` | bytes | 1 | 1.285 |
| frostor.xyz | longest (Tyrel) | b | 1 | 206 | `bytes 150366523-150432058/300733046` | bytes | 1 | 2.351 |
| frostor.xyz | short | a | 1 | 206 | `bytes 0-127/43747288` | bytes | 1 | 1.997 |
| frostor.xyz | short | b | 1 | 206 | `bytes 21873644-21939179/43747288` | bytes | 1 | 1.993 |
| **arweave.net (control)** | 60-min | a | 1 | **200** (full stream) | *(none)* | *(none)* | 1 | **timeout 44.999** (21,821,596 B received of 108,034,116) |
| **arweave.net (control)** | 60-min | b (mid-file range requested) | 1 | **200** (full stream, started from byte 0 — mid-file range ignored) | *(none)* | *(none)* | 1 | **timeout 45.005** (60,097,148 B received) |
| **arweave.net (control)** | 120-min | a | 1 | **200** | *(none)* | *(none)* | 1 | **timeout 45.009** (13,446,820 B received) |
| **arweave.net (control)** | longest (Tyrel) | a | 1 | **200** | *(none)* | *(none)* | 1 | **timeout 45.234** (7,891,906 B received) |
| **arweave.net (control)** | short | a | 1 | **200** | *(none)* | *(none)* | 1 | **timeout 45.003** (14,937,270 B received) |

Core range-gateway matrix (fllstck.dev + frostor.xyz, 4 mixes × 2 ranges × 2 hosts = 16 cells):
**16/16 returned 206 with a coherent, correctly-offset `Content-Range` and `Accept-Ranges: bytes`.**

Control (arweave.net): **5/5 probes run returned 200 full-stream, zero `Content-Range`, zero
`Accept-Ranges`, and were still mid-download when the 45s cap fired** — including the mid-file
range request, which downloaded past the requested midpoint instead of honoring it, proving the
Range header is not merely delayed but fully ignored. I did not run the remaining 3 of the possible
8 control cells (b-range for the 120-min/longest/short mixes) — the first 5 already fully establish
the invariant (ignores Range regardless of offset, mix, or file size) and each additional cell costs
another ~45s of wall time for zero new information, which conflicts with "never let a request
download a whole mix."

## 3. Cold vs warm latency summary

| host | cold samples (first touch per mix, n) | cold range | cold mean | warm samples (re-run same request) | warm range |
|---|---|---|---|---|---|
| arweave.fllstck.dev | 0.910, 11.331, 12.725, 10.814 (n=4) | 0.91s – 12.73s | ~8.9s | 2.125, 5.712 (Tyrel, n=2) | 2.1s – 5.7s |
| frostor.xyz | 4.820, 6.120, 1.285, 1.997 (n=4) | 1.28s – 6.12s | ~3.6s | 0.640, 1.652 (mix120, n=2) | 0.64s – 1.65s |
| arweave.net (control) | 44.999 – 45.234 (n=5, all timeouts) | n/a | n/a | not re-run — expected/consistent failure mode already established on first touch |

**frostor.xyz reliability check (the lead's specific concern):** the integration contract records
the lead measuring `frostor.xyz` timing out at 30s (cold) for txid `xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM`
earlier on 2026-09-08. In my testing, several hours later on the same day, the identical
host+txid+range combination answered in **4.820s on the first attempt**, then **0.640s** and
**1.652s** on immediate re-runs — no timeout occurred on any of 3 attempts. Across the whole
4-mix corpus, `frostor.xyz` never timed out and never exceeded 6.12s, cold or warm.

This does not mean the lead's measurement was wrong — it means gateway "cold" state is
edge/cache-dependent and non-deterministic across time, not a fixed per-request cost. Both outcomes
(the lead's 30s timeout and my sub-6.2s success, for the exact same host+txid) are real, measured
data points from the same calendar day. Treat `frostor.xyz` as **currently healthy but historically
flaky** — a single anecdote of severe cold failure exists, and today's testing could not reproduce
it. This is exactly the situation the plan's per-candidate failover + cooldown design (not a
single static host ranking) is built to handle.

## 4. Range-request semantics (both range hosts, txid `xH8qwPs-...` / 120-min mix)

| test | host | status | Content-Range | seconds | bytes received (capped by 45s) | throughput |
|---|---|---|---|---|---|---|
| `Range: bytes=0-` (open-ended) | fllstck.dev | 206 | `bytes 0-280171662/280171663` | timeout 45.370 | 621,418 | ~13.9 KB/s |
| `Range: bytes=0-` (open-ended) | frostor.xyz | 206 | `bytes 0-280171662/280171663` | timeout 44.453 | 1,301,795 | ~29.3 KB/s |
| `Range: bytes=100000000-` (mid-file, no end) | fllstck.dev | 206 | `bytes 100000000-280171662/280171663` | timeout 44.670 | 293,730 | ~6.6 KB/s |
| `Range: bytes=100000000-` (mid-file, no end) | frostor.xyz | 206 | `bytes 100000000-280171662/280171663` | timeout 42.182 | 24,026,027 | ~569.7 KB/s |
| direct request to the 302 target (redirect bypassed) | fllstck.dev sandbox subdomain | 206 | `bytes 0-127/280171663` | 1.189 | 128 | n/a (small range) |
| direct request to the 302 target (redirect bypassed) | frostor.xyz sandbox subdomain | 206 | `bytes 0-127/280171663` | 0.429 | 128 | n/a (small range) |

**Open-ended and mid-file-no-end ranges both get correct 206 semantics on both hosts** — the
`Content-Range` end and total are always correct, and the mid-file-no-end probe proves the gateway
seeks to the requested byte offset server-side rather than streaming from 0 (this is the literal
mechanism a `<audio>` element's seek relies on). **A media element could seek on every one of these
responses** — status and headers are all seek-correct.

**But sustained throughput after the 206 handshake is highly variable and sometimes very low**:
6.6–13.9 KB/s on two of the four large-range samples, vs 29.3–569.7 KB/s on the other two, all
against the *same* two gateways and the *same* txid. A typical DJ-mix MP3 at 128–192 kbps needs
roughly 16–24 KB/s sustained to avoid buffer starvation in real time; the 6.6 KB/s and 13.9 KB/s
samples are below that floor. This throughput swing is not explained by host alone (frostor was
both the fastest and, on a different range, present in the fast column; fllstck was in the slow
column both times) — it looks like per-request/edge-cache-state noise, not a fixed rate cap. This is
a **separate risk from cold seek latency** and is new evidence beyond what the master plan
anticipated; see Risks.

**Redirect preserves Range.** Both hosts issue a single `302 Found` (not multiple hops,
`redirects=1` throughout) to a sandbox subdomain of **the range host itself** — not to
`arweave.net` — e.g. `https://arweave.fllstck.dev/<txid>` → `Location: https://yr7svqh3h2l5ka7nlu5sehndf5ekaytclzaje5z4b7of3xs4g3zq.arweave.fllstck.dev/<txid>?`. Requesting that target URL
directly (no redirect hop, `redirects=0`) with the same `Range: bytes=0-127` reproduces the exact
same `206` + `Content-Range: bytes 0-127/280171663` as the two-hop short form, and is markedly
faster once warm (1.19s / 0.43s vs the multi-second short-form times) since it skips the redirect
round trip. `curl -L` correctly resent the `Range` header across the redirect in every one of the
16 core-matrix probes above (all show correct partial-content offsets, which would be impossible if
Range were dropped on redirect and the gateway fell back to a full 200). Browsers preserve headers
like `Range` across a same-origin-family 302 for GET requests as a matter of course, so this should
hold for `<audio>`/`fetch()` in production too, but it is one more round trip added to the cold-path
latency budget documented above.

## Verdict

**Does the master plan's premise — "the two range gateways currently return 206" — hold?**

**Holds, and is strongly reconfirmed.** 16/16 core-matrix probes (4 mixes × 2 hosts × 2 ranges)
returned `206 Partial Content` with a coherent, correctly-offset `Content-Range` and
`Accept-Ranges: bytes`; the open-ended, mid-file-no-end, and direct-redirect-target semantics
probes (6/6) also returned correct 206 responses on both hosts. `arweave.net` never returned 206
(5/5 control probes = 200 full-stream, Range header fully ignored even for a mid-file request) —
confirms it must stay download-only and never be an interactive streaming source, exactly as the
plan requires.

One sub-claim does **not** reproduce today: the specific historical data point that `frostor.xyz`
times out cold (30s, one measurement). My testing found `frostor.xyz` consistently fast (1.28s–6.12s
cold, sub-2s warm, zero timeouts across 12 probes including 3 repeats of the exact txid the lead
flagged). Net effect: **both candidate gateways are range-capable and currently healthy**; treat
`frostor.xyz`'s single historical timeout as a real but unreproduced tail-risk rather than disproof
of its viability — the plan's per-candidate cooldown/failover design already accounts for this.

**Recommended candidate order:** keep the integration contract's existing order —
1. `https://arweave.fllstck.dev/` (two independent successful cold measurements today: 0.91s–12.73s,
   plus the lead's 12.5s; consistent, no failures observed by either party)
2. `https://frostor.xyz/` (fastest/most consistent host in today's data, but carries the one
   historical severe-timeout data point from the lead, so keep it as the fallback, not primary,
   until it accumulates more track record)
3. `https://arweave.net/<txid>` — **never** an interactive candidate; download-link/archival only.

**Recommended probe/timeout budget**, justified by the numbers above:
- **Connectivity probe (`bytes=0-127`) run in the background, non-blocking on play:** budget
  ~20–25 seconds per candidate. My worst cold observation was 12.73s (final corpus, fllstck.dev);
  a rejected sizing candidate hit 24.98s; the lead's own worst observation was a 30s timeout. A
  4-second cap (the documented current bug) is far too tight — it will misclassify a healthy but
  cold gateway as failed on a meaningful fraction of requests, which is the root cause already
  identified in the integration contract.
- **`seekTimeoutMs` for an *already-open* candidate:** the contract's default of 12000ms is
  empirically comfortable — every mid-file range-b probe on an already-touched candidate (i.e. a
  true "seek" scenario, connection already warm) completed in 1.39s–8.76s, well inside 12s.
- **Caveat:** a seek routed to a candidate that has *not* yet been probed/warmed could itself take
  up to the ~12–25s cold range observed above, which would blow a 12s `seekTimeoutMs` budget. The
  practical mitigation (already implied by the plan's architecture) is to only offer a candidate for
  interactive seeking once its connectivity probe has already returned 206 — never let the first-ever
  request to a candidate be a user-triggered seek.

## Risks (things that could make a browser fail to seek even though curl got a 206)

1. **Sustained throughput variance, not just first-byte latency.** Measured 6.6–570 KB/s across
   four large-range samples on the *same two gateways and same txid* (see §4). Two of the four
   samples (6.6 KB/s, 13.9 KB/s, both on requests without an explicit end byte) are below the
   ~16–24 KB/s a 128–192 kbps MP3 needs for real-time playback. A browser could get a correct 206
   response and then still stall mid-buffer. This is new evidence the master plan does not
   currently call out; the existing `stallGraceMs`/conservative-recovery design is the right
   mitigation, but the team should know the failure mode exists independent of seek correctness.
2. **404-with-plausible-headers anomaly.** A rejected corpus candidate (John Simmons txid) returned
   404 on fllstck.dev while still carrying `Content-Type: audio/mpeg` and a `Content-Range` header.
   Confirms the contract's `evaluateProbe` must gate strictly on `status === 206`, not on header
   presence — which it already does; this is corroborating evidence the design choice is correct,
   not a new bug to fix.
3. **Redirect adds a round trip on cold cache.** Every short-form probe took one 302 hop
   (`redirects=1`) to a sandbox-subdomain URL before the real response; direct-to-target requests
   were faster once warm. This is folded into the cold-latency numbers above, not a separate cost,
   but worth knowing if a future optimization wants to cache the resolved redirect target per txid
   for the session (the plan's source-state record already has room for this via the `host` field).
4. **CORS: no gap found, but worth stating explicitly since the task asked.** Both hosts return
   `access-control-allow-origin: *` and `access-control-expose-headers: *` on both the 302 and the
   206 response, on every probe. This is sufficient for a page on a different origin (an
   `arweave.net` manifest path, or `localhost`) to `fetch()` these URLs and read `Content-Range`/
   `Accept-Ranges` via JS, which matters only if the player's connectivity probe uses `fetch()`/XHR
   (as recommended) rather than blind `<audio src>` assignment — plain `<audio>`/`<video>` playback
   does not require CORS at all for same-quality audio decode. No missing-header risk found for
   either host on either response type checked.
5. **Non-determinism across time is itself a systemic risk.** The same host+txid pair produced a
   0.91s response in this session and a 12.5s response in the lead's earlier session (both fllstck,
   both success); frostor produced a 30s timeout for the lead and sub-6.2s for every one of my 12
   probes. Any fixed timeout will sometimes be wrong in both directions. The plan's per-candidate,
   per-session cooldown/failure-budget design (rather than a single global "gateway X is bad" flag)
   is the correct architecture for this — flagging as confirmation, not as a new risk to design
   around.

## Commands actually run (representative — full parameterized set is in `probe.sh` + `RESULTS*.log`)

```bash
# sizing / corpus probe
curl -sS -L -o /dev/null -D headers/mix60.hdr -H "Range: bytes=0-127" \
  -w 'code=%{http_code} time=%{time_total} size=%{size_download} redirects=%{num_redirects}' \
  --max-time 45 "https://arweave.fllstck.dev/fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g"

# mid-file range probe (b)
curl -sS -L -o /dev/null -D headers/mix120_b.hdr -H "Range: bytes=140085831-140151366" \
  -w 'code=%{http_code} time=%{time_total} size=%{size_download} redirects=%{num_redirects}' \
  --max-time 45 "https://frostor.xyz/xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM"

# control (arweave.net), never let it finish
curl -sS -L -o /dev/null -D headers/control_mix60.hdr -H "Range: bytes=0-127" \
  -w 'code=%{http_code} time=%{time_total} size=%{size_download} redirects=%{num_redirects}' \
  --max-time 45 "https://arweave.net/fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g"

# open-ended range semantics
curl -sS -L -o /dev/null -D headers/openend_H1.hdr -H "Range: bytes=0-" \
  -w 'code=%{http_code} time=%{time_total} size=%{size_download} redirects=%{num_redirects}' \
  --max-time 45 "https://arweave.fllstck.dev/xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM"

# mid-file no-end range semantics
curl -sS -L -o /dev/null -D headers/midnoend_H2.hdr -H "Range: bytes=100000000-" \
  -w 'code=%{http_code} time=%{time_total} size=%{size_download} redirects=%{num_redirects}' \
  --max-time 45 "https://frostor.xyz/xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM"

# redirect-target capture (no -L, single hop)
curl -sS -o /dev/null -D - --max-time 20 -H "Range: bytes=0-127" \
  "https://arweave.fllstck.dev/xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM"

# direct request to the redirect target (redirect bypassed, verifies Range preserved)
curl -sS -L -o /dev/null -D headers/directtarget_fllstck.hdr -H "Range: bytes=0-127" \
  -w 'code=%{http_code} time=%{time_total} size=%{size_download} redirects=%{num_redirects}' \
  --max-time 45 "https://yr7svqh3h2l5ka7nlu5sehndf5ekaytclzaje5z4b7of3xs4g3zq.arweave.fllstck.dev/xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM"
```

Every probe used `-o /dev/null` and `--max-time 45`; no mix was ever fully downloaded. The 5
control-host timeouts and the 2 open-range/mid-no-end-range timeouts are expected results of that
safeguard, not failed commands — the partial byte counts and elapsed times they report are the
actual measured data for those rows.

---

# Phase 2 — gateway warming (start latency)

Unit tests after this phase: `npm test` -> **107/107** (97 from phase 1 + the warming suites).


Harness: `python3 -m http.server 8899` serving `website/`; Chrome 152 on macOS.
Live condition during these runs: **`arweave.fllstck.dev` was failing DNS resolution** from this
machine (5/5 `host` lookups failed; Cloudflare 1.1.1.1 still resolved it globally, so a local
resolver fault, not a dead gateway). `frostor.xyz` healthy. This turned the whole session into an
unplanned real-outage test of candidate fallback and gateway affinity.

## Why warming is worth doing (measured, live gateways, same mix, apples-to-apples)

| mix | cold bounded 64 KiB TTFB | warm bounded 64 KiB TTFB | open-ended after warm |
|---|---|---|---|
| `Ex1n-m0Pdea7…` | 2.08 s | 0.60 s | 0.61 s |
| `qmOWTuGHuf7-…` | 7.54 s | 4.30 s | 0.58 s |

Other cold bounded warms measured 9.97 s, 10.12 s, 12.35 s. First touch of a cold mix costs
2–12 s; warming moves that off the user's click.

⚠️ The "open-ended after warm" column downloaded **105,605,531** and **98,623,297 bytes**. That is
what an unbounded warm would cost a visitor. Hence the hard 64 KiB cap.

## The 64 KiB cap, proven at the wire

A `fetch` probe installed in the page **before** any warm ran, on `archive.html`, captured every
warm request. Every single one:

```
Range: bytes=0-65535            <- the ONLY Range value observed across all warms
-> 206
   Content-Length: 65536
   Content-Range: bytes 0-65535/93477147     (93 MB file)
   Content-Range: bytes 0-65535/176010019    (176 MB file)
   Content-Range: bytes 0-65535/280171663    (280 MB file)
```

64 KiB pulled from files up to 280 MB. Source-level confirmation: the only Range literals anywhere
in the shipped JS are `bytes=0-127` (the player's pre-existing probe) and `bytes=0-65535` (warm) —
**no open-ended range exists in the codebase.**

## Page policy — measured on the real generated pages

| page | detected type | policy | playable anchors | unique txids | warmed | verdict |
|---|---|---|---|---|---|---|
| `index.html` | `home` | `list` limit 5 | 7 | — | **5** (featured + 4) | PASS |
| `andrewemil.html` | `artist` | `list` limit 0 | 2 | 2 | **2** (all) | PASS |
| `akila.html` | `artist` | `list` limit 0 | 2 | **1** (same txid twice) | **1** | PASS — dedupe |
| `archive.html` @ scroll 0 | `archive` | `viewport` | 44 (+1 excluded `data-unplayable`) | 35 | **8–10** | PASS — not the archive |
| `archive.html` after scrolling | `archive` | `viewport` | 44 | 35 | grows 8 → 33 | PASS — viewport-driven |
| `residents.html` | `selectors` | `none` | 0 | 0 | **0** | PASS |

Archive gating measured precisely at scroll 0: 6 anchors in viewport, 10 within the 400 px
lookahead, **exactly 10 tracked** of 44 — then growing only as rows were revealed. In-flight count
never exceeded **2** at any observation.

## Gateway affinity, exercised by a real outage

First visit: all 5 homepage warms went to `frostor.xyz`, none to the DNS-dead
`arweave.fllstck.dev` — per-txid candidate fallback working against a genuinely unreachable host.
`localStorage['ue-gw-pref-v1']` = `{"host":"https://frostor.xyz/","ts":…}`.

Second load: the runtime-injected preconnect targeted **`frostor.xyz`** (both credential modes)
instead of the dead host — the stored preference steered the hint to the gateway that actually
works. Warm timings on that load: first 1506 ms, then 306/308/312/322 ms.

## Connection hints

Static, in every generated page (3 tags): `dns-prefetch` for both range gateways +
`preconnect` for `arweave.net` (artwork; every page loads images from it).

The expensive gateway `preconnect` (including the `crossorigin` variant needed for the CORS warm
pool) is injected **at runtime, only on pages that actually warm**. Confirmed: `residents.html`
(zero playable mixes) receives **no** gateway preconnect, while `index.html` does. The original
implementation put 6 preconnects in the shared head, which would have opened four sockets to audio
gateways on `about.html` and `residents.html` — pages that never play audio.

Known limitation (measured, documented in the partial): both gateways 302-redirect every request to
a per-transaction sandbox subdomain, so an apex hint only saves the first hop; the socket that
actually carries the bytes is per-mix and cannot be hinted statically.

## Post-fix startup status, measured in-browser

MutationObserver on the status region across a real click (`acidman.html`):

```
t=0        ""                          (idle)
t=4550ms   "Starting mix"  is-starting (painted on the click)
t=5770ms   ""                          (cleared once audio actually ran)
```

Two calm announcements, then silence — no per-tick narration. A defect found here and fixed:
the pill originally never cleared (measured stuck on "Starting mix" over a track playing for
25.9 s at readyState 4). Cause: player-core.js only emits `clear` from its `playing` case while
its state is still `loading`, but a `timeupdate` often arrives first and silently promotes the
state, so no `clear` was ever produced. Fixed host-side, driven off real playback evidence.

Seek regression on the final build: 50% seek requested 2680.47 -> landed 2680.47, delta
**0.00 s**, `confirmed`, exactly one `seeked` event, playback uninterrupted.
