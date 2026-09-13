/* ==========================================================================
   Underground Existence — player-core.js

   Pure, testable playback/source-policy module for the custom audio player.
   NO DOM, NO fetch, NO setTimeout/setInterval, NO Date.now() outside the
   injectable `options.now`. This file only computes state transitions and
   returns plain "command" objects describing what the host (website/js/
   player.js) should do to the real <audio> element and the UI. It never
   touches an <audio> element itself.

   Why this file exists: the previous inline logic in player.js reloaded the
   media source on a frozen 15s clock (restarting healthy-but-slow buffering)
   and trusted `loadedmetadata` to resume a seek without ever confirming the
   seek actually landed. That produced the two user-visible bugs — mixes
   restarting mid-stream, and waveform scrubbing doing nothing. This module
   replaces that ad-hoc logic with an explicit state machine, a verified
   seek/resume path, and a conservative stall watchdog, and it is unit
   testable without a browser or live gateways (see tests/).

   See docs/plans/UNDERGROUND_EXISTENCE_AUDIO_STREAMING_REMEDIATION_MASTER_PLAN.md
   (Bballi_Portfolio repo) for the accepted design, and the integration
   contract in that same working session for the exact API this file must
   expose to the host.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- gateway policy ---------- */

  /* Measured 2026-09-08 against a live 120-min / 280,171,663-byte mix
     (txid xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM):
       - https://arweave.fllstck.dev/<txid>  -> 302 to a sandbox subdomain,
         then 206 Partial Content with a valid Content-Range. Cold latency
         ~12.5s before the first byte.
       - https://frostor.xyz/<txid>          -> 302 to a sandbox subdomain,
         then can TIME OUT at 30s when cold (no response at all).
       - https://arweave.net/<txid> (raw)    -> 302 then 200 full-file,
         NEVER 206. Not seekable. Never used here — download-only.
     fllstck goes first because it is the gateway actually observed
     returning a 206; frostor is the second-chance candidate. */
  var RANGE_HOSTS = ['https://arweave.fllstck.dev/', 'https://frostor.xyz/'];

  /* txid must be a path segment — sandbox-subdomain hostnames are ALSO
     43 chars (base32), so a bare 43-char match without a leading "/" would
     grab the host instead of the txid. Kept identical to the regex already
     in player.js so both files agree on what a txid looks like. */
  var TXID_RE = /\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/;

  function extractTxid(url) {
    var m = TXID_RE.exec(String(url || ''));
    return m ? m[1] : null;
  }

  /* One candidate per range gateway, in RANGE_HOSTS order. Never includes
     the original/raw URL — raw arweave.net is download-only, enforced here
     by construction rather than by a runtime check anywhere downstream. */
  function buildCandidates(url) {
    var txid = extractTxid(url);
    if (!txid) return [];
    var out = [];
    for (var i = 0; i < RANGE_HOSTS.length; i++) {
      out.push({
        url: RANGE_HOSTS[i] + txid,
        host: RANGE_HOSTS[i],
        rangeConfirmed: false,
        rangeRejected: false,
        failures: 0,
        tried: false,
        unhealthy: false
      });
    }
    return out;
  }

  /* "bytes <start>-<end>/<total>" — the only Content-Range shape a range
     probe response is trusted to parse. Anything else (missing unit, the
     unsatisfiable-range wildcard form, start > end, total <= 0) is not
     coherent and is rejected. */
  var CONTENT_RANGE_RE = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i;

  function parseContentRange(str) {
    if (typeof str !== 'string') return null;
    var m = CONTENT_RANGE_RE.exec(str.trim());
    if (!m) return null;
    var start = parseInt(m[1], 10);
    var end = parseInt(m[2], 10);
    var total = parseInt(m[3], 10);
    if (!(start <= end) || !(total > 0)) return null;
    return { start: start, end: end, total: total };
  }

  /* A candidate only "enters the streaming pool" (plan Phase 0 step 4) on a
     206 with a coherent Content-Range. A 200 (raw arweave.net's behavior on
     these bundled items) is explicitly rejected — a full-file response can
     start playback but must never be treated as seekable. */
  function evaluateProbe(result) {
    result = result || {};
    if (result.status !== 206) {
      return { rangeCapable: false, reason: 'no-206' };
    }
    var range = parseContentRange(result.contentRange);
    if (!range) {
      return { rangeCapable: false, reason: 'bad-content-range' };
    }
    return { rangeCapable: true, reason: 'ok' };
  }

  /* seekableRanges is the host's translation of the live audio.seekable
     TimeRanges object into [{start,end}, ...]. */
  function isTimeSeekable(seekableRanges, time, tolerance) {
    if (!Array.isArray(seekableRanges)) return false;
    tolerance = typeof tolerance === 'number' ? tolerance : 0;
    for (var i = 0; i < seekableRanges.length; i++) {
      var r = seekableRanges[i];
      if (!r) continue;
      if (time >= r.start - tolerance && time <= r.end + tolerance) return true;
    }
    return false;
  }

  /* ---------- playback controller ---------- */

  /* Ignore currentTime jitter smaller than this when deciding whether
     playback is genuinely advancing (vs. the same frozen sample reported
     twice). Not a tunable in the contract — an implementation-internal
     epsilon. */
  var PROGRESS_EPS_SEC = 0.05;

  /* plan/contract: an `ended` event landing more than 10s before the known
     duration is a premature end, not a real one. */
  var PREMATURE_END_THRESHOLD_SEC = 10;

  function createPlaybackController(options) {
    options = options || {};

    var candidates = (Array.isArray(options.candidates) ? options.candidates : []).map(function (c) {
      c = c || {};
      return {
        url: c.url,
        host: c.host,
        rangeConfirmed: !!c.rangeConfirmed,
        rangeRejected: !!c.rangeRejected,
        failures: c.failures || 0,
        tried: !!c.tried,
        unhealthy: !!c.unhealthy,
        recoveries: 0
      };
    });

    var expectedDurationSec = typeof options.expectedDurationSec === 'number' ? options.expectedDurationSec : 0;

    /* Accept a seek within +/-2s of the request — generous enough to absorb
       gateway/keyframe rounding, tight enough that "seek did nothing" is
       still caught. */
    var seekToleranceSec = typeof options.seekToleranceSec === 'number' ? options.seekToleranceSec : 2;

    /* fllstck's measured cold latency is ~12.5s. A resume/seek verification
       that takes materially longer than that on a cold gateway is treated
       as failed and fails over to the other candidate — this is a known
       tight margin against fllstck's own cold-start number, called out
       here deliberately: if manual testing shows this firing on ordinary
       cold starts, raise it, it is not a measured-safe number, only the
       contract-specified default. */
    var seekTimeoutMs = typeof options.seekTimeoutMs === 'number' ? options.seekTimeoutMs : 12000;

    /* Comfortably exceeds fllstck's measured 12.5s cold latency, so an
       ordinary cold start is never mistaken for a stall. frostor's worse
       30s-cold case can still trip this window occasionally — that is
       expected and is bounded by maxRecoveriesPerCandidate below rather
       than by raising this further, so a genuinely dead frostor still
       fails over in reasonable time instead of hanging for 30s+ per
       attempt. */
    var stallGraceMs = typeof options.stallGraceMs === 'number' ? options.stallGraceMs : 20000;

    /* Bounds the `loading` state itself. Before this option existed, tick()
       returned early for anything that wasn't 'playing'/'seeking' unless
       pendingSeekTime was set — so a *first* play from idle (confirmedTime
       still 0, no pendingSeekTime) had NO timeout at all: a
       reachable-but-dead candidate (TCP hangs, or the gateway accepts the
       connection and never sends media bytes) fires no native `error`
       event and would sit in `loading` forever with the UI stuck on
       "Buffering". Also covers failoverTo()/beginRecovery()/retry() when
       they resume at confirmedTime===0, which likewise sets no
       pendingSeekTime and was equally unbounded.
       Measured cold gateway first-byte latency: 0.91-12.73s typical, one
       24.98s worst observation, one historical 30s hang on frostor.xyz
       (see the RANGE_HOSTS comment above and player.js's PROBE_TIMEOUT_MS).
       25s sits comfortably above the worst *observed* cold start, so a
       genuinely slow-but-alive gateway is never misclassified as dead —
       that exact misclassification is the bug this whole remediation
       project exists to fix. Do not shorten this without new measured
       evidence; anything under ~20s risks the same false positive. */
    var loadTimeoutMs = typeof options.loadTimeoutMs === 'number' ? options.loadTimeoutMs : 25000;

    /* One reconnect-in-place per candidate before that candidate is marked
       unhealthy and the controller moves on — this is the fix for the old
       "15s frozen clock -> setSrc, forever, on the same source" bug. */
    var maxRecoveriesPerCandidate = typeof options.maxRecoveriesPerCandidate === 'number' ? options.maxRecoveriesPerCandidate : 1;

    var now = typeof options.now === 'function' ? options.now : Date.now;
    var logFn = typeof options.log === 'function' ? options.log : null;

    var txid = candidates.length ? extractTxid(candidates[0].url) : null;

    var state = 'idle';
    var generation = 0;
    var activeIndex = -1;
    var confirmedTime = 0;
    var pendingSeekTime = null;
    var seekStartedAt = null;
    /* when the CURRENT `loading` attempt started — set wherever state
       becomes 'loading' (folded into resetProgressTracking(), which is
       already called from every one of those places), and pushed forward
       again on live loadedmetadata/canplay evidence so a responding-but-
       slow gateway is never penalized for the time before it responded. */
    var loadStartedAt = null;
    var terminalReason = null;
    var wantPlay = false;
    var duration = expectedDurationSec;
    var currentReadyState = null;
    var lastProgressAt = now();
    var sawWaitingOrStalled = false;

    /* ---------- small internal helpers ---------- */

    function activeHost() {
      var c = candidates[activeIndex];
      return c ? c.host : null;
    }

    function activeRangeConfirmed() {
      var c = candidates[activeIndex];
      return c ? !!c.rangeConfirmed : false;
    }

    /* every command carries the generation it was produced under, so the
       host can drop anything that arrives after a newer load/failover
       superseded it */
    function stampGeneration(obj, gen) {
      obj.generation = typeof gen === 'number' ? gen : generation;
      return obj;
    }

    function setSrcCmd(url, resumeTime, gen) {
      return stampGeneration({ type: 'setSrc', url: url, resumeTime: resumeTime }, gen);
    }
    function setCurrentTimeCmd(time, gen) {
      return stampGeneration({ type: 'setCurrentTime', time: time }, gen);
    }
    function playCmd(gen) {
      return stampGeneration({ type: 'play' }, gen);
    }
    function pauseCmd(gen) {
      return stampGeneration({ type: 'pause' }, gen);
    }
    function statusCmd(level, code, message, gen) {
      return stampGeneration({ type: 'status', level: level, code: code, message: message }, gen);
    }
    /* entry shape per the plan's Observability section:
       { t, txid, host, event, state, currentTime, requestedSeek, attempt,
         rangeConfirmed, reason }
       `event` must stay inside the documented vocabulary: probe, loadstart,
       canplay, seeking, seeked, stalled, error, ended, recovery. */
    function logCmd(partial, gen) {
      var entry = {
        t: now(),
        txid: txid,
        host: partial.host !== undefined ? partial.host : activeHost(),
        event: partial.event,
        state: state,
        currentTime: partial.currentTime !== undefined ? partial.currentTime : confirmedTime,
        requestedSeek: partial.requestedSeek !== undefined ? partial.requestedSeek : pendingSeekTime,
        attempt: activeIndex + 1,
        rangeConfirmed: activeRangeConfirmed(),
        reason: partial.reason
      };
      if (logFn) {
        try { logFn(entry); } catch (err) { /* a broken logger must never break playback */ }
      }
      return stampGeneration({ type: 'log', entry: entry }, gen);
    }

    function resetProgressTracking(nowMs) {
      /* Deliberately does NOT touch currentReadyState: readyState is always
         a "last value reported by the most recent event" fact, independent
         of why we're resetting the progress clock. Nulling it here used to
         erase a readyState the SAME triggering event had just legitimately
         reported (e.g. a `playing` event with readyState:4 arriving right
         as this function ran), which could mask a genuinely healthy
         source as "unknown". A stale readyState after a candidate switch
         is harmless — null/stale both read as "unknown", which is the
         conservative (don't-recover) direction already. */
      lastProgressAt = nowMs;
      sawWaitingOrStalled = false;
      loadStartedAt = nowMs;
    }

    /* first candidate (in RANGE_HOSTS order) that is not unhealthy and is
       not `excludeIndex`; -1 when nothing eligible remains */
    function selectCandidateIndex(excludeIndex) {
      for (var i = 0; i < candidates.length; i++) {
        if (i === excludeIndex) continue;
        if (candidates[i].unhealthy) continue;
        return i;
      }
      return -1;
    }

    /* No eligible candidate left at all — terminal, visible retry state.
       Never silently falls back to a raw/non-range URL. */
    function terminalFail(reason, nowMs) {
      state = 'failed';
      terminalReason = reason;
      pendingSeekTime = null;
      seekStartedAt = null;
      var commands = [];
      commands.push(statusCmd('error', 'failed', 'Playback connection failed — Retry.'));
      commands.push(logCmd({ event: 'error', reason: reason, currentTime: confirmedTime }));
      return commands;
    }

    /* Move to a specific candidate, resuming from `confirmedTime` (never
       from an optimistic UI position, never resetting to 0 except when
       confirmedTime already is 0). Bumps generation so any in-flight event
       from the abandoned source is provably stale. */
    function failoverTo(nextIndex, reason, nowMs) {
      var commands = [];
      var resumeTime = confirmedTime;
      activeIndex = nextIndex;
      var candidate = candidates[nextIndex];
      candidate.tried = true;
      generation += 1;
      state = 'loading';
      resetProgressTracking(nowMs);
      if (resumeTime > 0) {
        pendingSeekTime = resumeTime;
        seekStartedAt = nowMs;
      } else {
        pendingSeekTime = null;
        seekStartedAt = null;
      }
      commands.push(logCmd({ event: 'recovery', reason: reason, host: candidate.host, currentTime: resumeTime }));
      commands.push(setSrcCmd(candidate.url, resumeTime));
      if (wantPlay) commands.push(playCmd());
      commands.push(statusCmd('busy', 'reconnecting', 'Reconnecting…'));
      return commands;
    }

    /* This candidate's recovery budget (or its only remaining chance) is
       spent — mark it unhealthy and either move to the next eligible
       candidate or fail out entirely. */
    function handleCandidateExhausted(reason, nowMs) {
      var commands = [];
      var candidate = candidates[activeIndex];
      if (candidate) candidate.unhealthy = true;
      var nextIdx = selectCandidateIndex(activeIndex);
      if (nextIdx === -1) {
        commands = commands.concat(terminalFail(reason, nowMs));
      } else {
        commands = commands.concat(failoverTo(nextIdx, reason, nowMs));
      }
      return commands;
    }

    /* Reconnect the SAME candidate at confirmedTime (a stall/premature-end
       is a "this source is currently misbehaving", not "this source is
       bad" signal — retry it once before giving up on it). Bounded by
       maxRecoveriesPerCandidate via the caller. */
    function beginRecovery(reason, nowMs) {
      var commands = [];
      var candidate = candidates[activeIndex];
      candidate.recoveries = (candidate.recoveries || 0) + 1;
      var resumeTime = confirmedTime;
      generation += 1;
      resetProgressTracking(nowMs);
      if (resumeTime > 0) {
        pendingSeekTime = resumeTime;
        seekStartedAt = nowMs;
      } else {
        pendingSeekTime = null;
        seekStartedAt = null;
      }
      commands.push(logCmd({ event: 'recovery', reason: reason, host: candidate.host, currentTime: resumeTime }));
      commands.push(setSrcCmd(candidate.url, resumeTime));
      if (wantPlay) commands.push(playCmd());
      commands.push(statusCmd('busy', 'reconnecting', 'Reconnecting…'));
      state = 'loading';
      return commands;
    }

    function handleSeekTimeout(nowMs) {
      var commands = [];
      var wasExplicitSeek = state === 'seeking';
      var candidate = candidates[activeIndex];
      if (wasExplicitSeek) {
        /* an explicit mid-playback scrub never landed — restore the prior
           confirmed position on the (still otherwise-working) source
           rather than leaving the UI at an unplayed future position */
        commands.push(setCurrentTimeCmd(confirmedTime));
      }
      if (candidate) { candidate.unhealthy = true; candidate.failures = (candidate.failures || 0) + 1; }
      pendingSeekTime = null;
      seekStartedAt = null;
      var nextIdx = selectCandidateIndex(activeIndex);
      commands.push(logCmd({ event: 'error', reason: 'seek-timeout', currentTime: confirmedTime }));
      if (nextIdx === -1) {
        state = wasExplicitSeek ? 'playing' : state;
        commands = commands.concat(terminalFail('seek-timeout', nowMs));
      } else {
        commands = commands.concat(failoverTo(nextIdx, 'seek-timeout', nowMs));
      }
      return commands;
    }

    /* ---------- seeked-event handling ---------- */

    function handleSeeked(evt, nowMs) {
      var commands = [];
      if (pendingSeekTime === null) {
        /* not something we're verifying (e.g. a host-mirrored native event
           for a seek we didn't request) — informational only */
        if (typeof evt.currentTime === 'number') confirmedTime = evt.currentTime;
        commands.push(logCmd({ event: 'seeked', reason: 'unsolicited', currentTime: confirmedTime }));
        return commands;
      }

      var target = pendingSeekTime;
      var landed = typeof evt.currentTime === 'number' ? evt.currentTime : null;
      var withinTolerance = landed !== null && Math.abs(landed - target) <= seekToleranceSec;
      var seekable = isTimeSeekable(evt.seekableRanges, target, seekToleranceSec);

      if (withinTolerance && seekable) {
        confirmedTime = landed;
        pendingSeekTime = null;
        seekStartedAt = null;
        state = 'playing';
        resetProgressTracking(nowMs);
        commands.push(statusCmd('info', 'clear', ''));
        commands.push(logCmd({ event: 'seeked', reason: 'confirmed', currentTime: confirmedTime, requestedSeek: target }));
        return commands;
      }

      /* rejected: didn't land close enough, or landed somewhere the media
         element itself doesn't consider seekable */
      pendingSeekTime = null;
      seekStartedAt = null;

      if (state === 'seeking') {
        /* an explicit user scrub failed on an otherwise-fine source —
           restore the prior confirmed position and report the failure,
           do not fail the candidate over this alone */
        commands.push(setCurrentTimeCmd(confirmedTime));
        state = 'playing';
        commands.push(statusCmd('error', 'failed', 'Seek failed — restored previous position.'));
        commands.push(logCmd({ event: 'seeked', reason: 'rejected', currentTime: confirmedTime, requestedSeek: target }));
        return commands;
      }

      /* a resume-after-failover position never verified — this source
         cannot be trusted to land where asked, so treat it like a hard
         failure of the candidate rather than retrying the same landing */
      commands.push(logCmd({ event: 'seeked', reason: 'resume-rejected', currentTime: confirmedTime, requestedSeek: target }));
      commands = commands.concat(handleCandidateExhausted('resume-seek-rejected', nowMs));
      return commands;
    }

    function handleError(evt, nowMs) {
      var commands = [];
      var candidate = candidates[activeIndex];
      if (candidate) { candidate.unhealthy = true; candidate.failures = (candidate.failures || 0) + 1; }
      pendingSeekTime = null;
      seekStartedAt = null;
      commands.push(logCmd({
        event: 'error',
        currentTime: confirmedTime,
        reason: evt.errorCode !== undefined && evt.errorCode !== null ? String(evt.errorCode) : 'media-error'
      }));
      var nextIdx = selectCandidateIndex(activeIndex);
      if (nextIdx === -1) {
        commands = commands.concat(terminalFail('exhausted', nowMs));
      } else {
        commands = commands.concat(failoverTo(nextIdx, 'error', nowMs));
      }
      return commands;
    }

    function handleEnded(evt, nowMs) {
      var commands = [];
      var d = duration > 0 ? duration : expectedDurationSec;
      var ct = typeof evt.currentTime === 'number' ? evt.currentTime : confirmedTime;
      var premature = d > 0 && ct < d - PREMATURE_END_THRESHOLD_SEC;

      if (!premature) {
        state = 'idle';
        terminalReason = null;
        confirmedTime = ct;
        commands.push(statusCmd('info', 'clear', ''));
        commands.push(logCmd({ event: 'ended', reason: 'natural', currentTime: confirmedTime }));
        return commands;
      }

      confirmedTime = Math.max(0, ct);
      var candidate = candidates[activeIndex];
      if (candidate && (candidate.recoveries || 0) < maxRecoveriesPerCandidate) {
        commands.push(logCmd({ event: 'ended', reason: 'premature', currentTime: confirmedTime }));
        commands = commands.concat(beginRecovery('premature-end', nowMs));
      } else {
        commands.push(logCmd({ event: 'ended', reason: 'premature-budget-exhausted', currentTime: confirmedTime }));
        commands = commands.concat(handleCandidateExhausted('premature-end-exhausted', nowMs));
      }
      return commands;
    }

    /* ---------- public methods ---------- */

    function requestPlay() {
      wantPlay = true;
      var commands = [];

      if (state === 'idle') {
        var idx = selectCandidateIndex(-1);
        if (idx === -1) {
          return commands.concat(terminalFail('no-candidates', now()));
        }
        activeIndex = idx;
        candidates[idx].tried = true;
        generation += 1;
        state = 'loading';
        resetProgressTracking(now());
        var resumeTime = confirmedTime; /* 0 on first play or after reset() */
        if (resumeTime > 0) {
          pendingSeekTime = resumeTime;
          seekStartedAt = now();
        }
        commands.push(setSrcCmd(candidates[idx].url, resumeTime));
        /* MUST be emitted synchronously in this call so the host can call
           audio.play() inside the user-gesture activation window (iOS). */
        commands.push(playCmd());
        commands.push(logCmd({ event: 'loadstart', currentTime: resumeTime }));
        return commands;
      }

      if (state === 'failed') {
        /* leaving `failed` is an explicit action — retry(), not requestPlay() */
        return commands;
      }

      commands.push(playCmd());
      return commands;
    }

    function requestPause() {
      wantPlay = false;
      return [pauseCmd()];
    }

    function applyProbeResult(candidateIndex, probeEval) {
      var commands = [];
      var candidate = candidates[candidateIndex];
      if (!candidate) return commands;

      if (probeEval && probeEval.rangeCapable) {
        candidate.rangeConfirmed = true;
        candidate.rangeRejected = false;
      } else {
        candidate.rangeRejected = true;
        candidate.rangeConfirmed = false;
      }

      commands.push(logCmd({
        event: 'probe',
        host: candidate.host,
        reason: probeEval && probeEval.reason,
        currentTime: confirmedTime
      }));

      /* Only pre-empt the active source while we're still trying to get it
         playing at all (`loading`) — once real playback has started
         (`playing`/`seeking`), a late/redundant probe result must not yank
         a source that is demonstrably already working (plan: "avoid...
         duplicate audio requests while another source is already usable"). */
      if (candidateIndex === activeIndex && candidate.rangeRejected && state === 'loading') {
        var altIndex = -1;
        for (var i = 0; i < candidates.length; i++) {
          if (i !== activeIndex && candidates[i].rangeConfirmed && !candidates[i].unhealthy) { altIndex = i; break; }
        }
        if (altIndex !== -1) {
          candidate.unhealthy = true;
          commands = commands.concat(failoverTo(altIndex, 'probe-rejected', now()));
        }
      }

      return commands;
    }

    function handleMediaEvent(evt) {
      evt = evt || {};
      /* stale-generation guard: an event from an abandoned load/failover
         must never mutate current state or emit a command */
      if (evt.generation !== generation) return [];

      var nowMs = now();
      if (typeof evt.readyState === 'number') currentReadyState = evt.readyState;
      if (typeof evt.duration === 'number' && evt.duration > 0) duration = evt.duration;

      var commands = [];

      switch (evt.type) {
        case 'loadstart':
          commands.push(logCmd({ event: 'loadstart', currentTime: confirmedTime }));
          break;

        case 'loadedmetadata':
        case 'canplay':
          /* readyState/duration already captured above; nothing else to do
             here — the host applies any pending resumeTime once metadata
             is in, and we verify it via the `seeked` event, not here.
             This IS however live evidence the candidate is responding, so
             while still `loading` it pushes the load-timeout window
             forward rather than letting the ORIGINAL load-start time keep
             counting against a gateway that is demonstrably alive and
             making progress toward playable. */
          if (state === 'loading') loadStartedAt = nowMs;
          break;

        case 'playing':
          if (pendingSeekTime === null && (state === 'loading' || state === 'recovering')) {
            state = 'playing';
            if (typeof evt.currentTime === 'number') confirmedTime = evt.currentTime;
            resetProgressTracking(nowMs);
            commands.push(statusCmd('info', 'clear', ''));
            commands.push(logCmd({ event: 'canplay', currentTime: confirmedTime }));
          }
          break;

        case 'timeupdate':
          if (pendingSeekTime === null && state !== 'failed') {
            if (state === 'loading' || state === 'recovering') state = 'playing';
            if (typeof evt.currentTime === 'number') {
              if (evt.currentTime > confirmedTime + PROGRESS_EPS_SEC) {
                lastProgressAt = nowMs;
                sawWaitingOrStalled = false;
              }
              confirmedTime = evt.currentTime;
            }
          }
          break;

        case 'waiting':
        case 'stalled':
          sawWaitingOrStalled = true;
          commands.push(statusCmd('busy', 'buffering', 'Buffering…'));
          commands.push(logCmd({ event: 'stalled', reason: evt.type, currentTime: confirmedTime }));
          break;

        case 'seeking':
          commands.push(logCmd({ event: 'seeking', reason: 'media-event', currentTime: confirmedTime }));
          break;

        case 'seeked':
          commands = commands.concat(handleSeeked(evt, nowMs));
          break;

        case 'error':
          commands = commands.concat(handleError(evt, nowMs));
          break;

        case 'ended':
          commands = commands.concat(handleEnded(evt, nowMs));
          break;

        case 'pause':
        case 'play':
        default:
          break;
      }

      return commands;
    }

    function requestSeek(timeSec) {
      var commands = [];
      if (activeIndex < 0 || !candidates[activeIndex]) {
        commands.push(statusCmd('error', 'failed', 'Seeking unavailable — no active source.'));
        return commands;
      }
      var anyEligible = false;
      for (var i = 0; i < candidates.length; i++) {
        if (!candidates[i].rangeRejected) { anyEligible = true; break; }
      }
      if (!anyEligible) {
        commands.push(statusCmd('error', 'failed', 'Seeking unavailable — no range-capable source.'));
        return commands;
      }

      pendingSeekTime = timeSec;
      seekStartedAt = now();
      state = 'seeking';
      commands.push(setCurrentTimeCmd(timeSec));
      commands.push(statusCmd('busy', 'seeking', 'Seeking…'));
      commands.push(logCmd({ event: 'seeking', reason: 'requested', currentTime: confirmedTime, requestedSeek: timeSec }));
      return commands;
    }

    function tick(nowMs) {
      nowMs = typeof nowMs === 'number' ? nowMs : now();
      var commands = [];

      if (pendingSeekTime !== null) {
        if (seekStartedAt !== null && nowMs - seekStartedAt >= seekTimeoutMs) {
          return handleSeekTimeout(nowMs);
        }
        return commands; /* still within the seek/resume grace period */
      }

      if (!wantPlay) return commands;

      /* Bounded `loading` timeout (see loadTimeoutMs above). Only reachable
         here when pendingSeekTime is null — a resume/failover at a
         non-zero confirmedTime already returned above, governed by
         seekTimeoutMs instead; this branch exists for the case that timer
         never covers: a first play from idle, or any failover/recovery/
         retry that resumes at confirmedTime===0. A `playing` or
         `timeupdate` event moves state out of 'loading' entirely (see
         handleMediaEvent), so real progress structurally exits this branch
         for good, not just resets it — this timer can never kill a load
         that has actually started producing audio. */
      if (state === 'loading') {
        if (activeIndex < 0 || !candidates[activeIndex]) return commands;
        if (loadStartedAt !== null && nowMs - loadStartedAt >= loadTimeoutMs) {
          return handleCandidateExhausted('load-timeout', nowMs);
        }
        return commands;
      }

      if (state !== 'playing' && state !== 'seeking') return commands;
      if (activeIndex < 0 || !candidates[activeIndex]) return commands;

      var elapsedSinceProgress = nowMs - lastProgressAt;
      var readyLow = currentReadyState !== null && currentReadyState < 3;
      var sawStallSignal = sawWaitingOrStalled || readyLow;

      /* Conservative on purpose: progress still advancing, or readyState
         is HAVE_FUTURE_DATA+, or no waiting/stalled has been seen at all,
         each individually block recovery. This is the fix for the bug
         where healthy-but-slow buffering got reloaded and restarted the
         mix. */
      if (elapsedSinceProgress >= stallGraceMs && sawStallSignal) {
        var candidate = candidates[activeIndex];
        if (candidate && (candidate.recoveries || 0) < maxRecoveriesPerCandidate) {
          commands = commands.concat(beginRecovery('stall', nowMs));
        } else {
          commands = commands.concat(handleCandidateExhausted('stall-budget-exhausted', nowMs));
        }
      }

      return commands;
    }

    function retry() {
      for (var i = 0; i < candidates.length; i++) {
        candidates[i].unhealthy = false;
        candidates[i].failures = 0;
        candidates[i].recoveries = 0;
        candidates[i].tried = false;
      }
      terminalReason = null;
      generation += 1;

      var idx = selectCandidateIndex(-1);
      if (idx === -1) idx = 0; /* defensive; unreachable once budgets are cleared above */
      activeIndex = idx;
      candidates[idx].tried = true;
      state = 'loading';
      var nowMs = now();
      resetProgressTracking(nowMs);

      var resumeTime = confirmedTime; /* restart at last confirmed position, never 0 */
      if (resumeTime > 0) {
        pendingSeekTime = resumeTime;
        seekStartedAt = nowMs;
      } else {
        pendingSeekTime = null;
        seekStartedAt = null;
      }

      var commands = [];
      commands.push(logCmd({ event: 'recovery', reason: 'retry', host: candidates[idx].host, currentTime: resumeTime }));
      commands.push(setSrcCmd(candidates[idx].url, resumeTime));
      if (wantPlay) commands.push(playCmd());
      commands.push(statusCmd('busy', 'reconnecting', 'Reconnecting…'));
      return commands;
    }

    function reset() {
      /* Same-track restart (repeat-one, "previous" within the restart
         threshold, an explicit restart) — NOT a new controller. The
         candidate URLs are unchanged; only position/health bookkeeping
         resets. A genuinely new track gets a brand-new controller built
         from buildCandidates(newTrackUrl), since this API has no
         setCandidates(). rangeConfirmed/rangeRejected are deliberately
         preserved — that is real knowledge from an actual probe and does
         not go stale just because playback restarted. */
      for (var i = 0; i < candidates.length; i++) {
        candidates[i].unhealthy = false;
        candidates[i].failures = 0;
        candidates[i].recoveries = 0;
        candidates[i].tried = false;
      }
      generation += 1;
      activeIndex = -1;
      confirmedTime = 0;
      pendingSeekTime = null;
      seekStartedAt = null;
      terminalReason = null;
      state = 'idle';
      return [];
    }

    function snapshot() {
      return {
        state: state,
        generation: generation,
        activeIndex: activeIndex,
        activeHost: activeHost(),
        activeUrl: activeIndex >= 0 && candidates[activeIndex] ? candidates[activeIndex].url : null,
        confirmedTime: confirmedTime,
        pendingSeekTime: pendingSeekTime,
        duration: duration,
        readyState: currentReadyState,
        terminalReason: terminalReason,
        wantPlay: wantPlay,
        txid: txid,
        candidates: candidates.map(function (c) {
          return {
            url: c.url,
            host: c.host,
            rangeConfirmed: c.rangeConfirmed,
            rangeRejected: c.rangeRejected,
            failures: c.failures,
            tried: c.tried,
            unhealthy: c.unhealthy,
            recoveries: c.recoveries || 0
          };
        })
      };
    }

    var controller = {};
    Object.defineProperty(controller, 'state', { enumerable: true, get: function () { return state; } });
    Object.defineProperty(controller, 'generation', { enumerable: true, get: function () { return generation; } });
    Object.defineProperty(controller, 'activeIndex', { enumerable: true, get: function () { return activeIndex; } });
    Object.defineProperty(controller, 'confirmedTime', { enumerable: true, get: function () { return confirmedTime; } });
    Object.defineProperty(controller, 'pendingSeekTime', { enumerable: true, get: function () { return pendingSeekTime; } });
    Object.defineProperty(controller, 'terminalReason', { enumerable: true, get: function () { return terminalReason; } });
    Object.defineProperty(controller, 'wantPlay', { enumerable: true, get: function () { return wantPlay; } });

    controller.requestPlay = requestPlay;
    controller.requestPause = requestPause;
    controller.applyProbeResult = applyProbeResult;
    controller.handleMediaEvent = handleMediaEvent;
    controller.requestSeek = requestSeek;
    controller.tick = tick;
    controller.retry = retry;
    controller.reset = reset;
    controller.snapshot = snapshot;

    return controller;
  }

  /* ---------- exports ---------- */

  var UEPlayerCore = {
    RANGE_HOSTS: RANGE_HOSTS,
    extractTxid: extractTxid,
    buildCandidates: buildCandidates,
    evaluateProbe: evaluateProbe,
    parseContentRange: parseContentRange,
    isTimeSeekable: isTimeSeekable,
    createPlaybackController: createPlaybackController
  };

  if (typeof module === 'object' && module.exports) { module.exports = UEPlayerCore; }
  if (typeof window !== 'undefined') { window.UEPlayerCore = UEPlayerCore; }

})();
