// Small test-only helpers that stand in for the real <audio> element and
// the wall clock, so controller tests never depend on real timers or a
// browser. The controller itself never touches these — it only ever
// receives plain `evt` objects and returns plain "command" arrays; these
// helpers just make constructing/asserting on those plain objects less
// repetitive in the test files.

// A controllable clock to hand to `options.now`.
export function makeClock(startMs) {
  let t = typeof startMs === 'number' ? startMs : 0;
  return {
    now: () => t,
    advance: (ms) => { t += ms; return t; },
    set: (ms) => { t = ms; return t; }
  };
}

// Simulates one native media event reaching the controller. Auto-fills
// `generation` from the controller's CURRENT generation unless the caller
// explicitly overrides it (tests override it to simulate a stale event).
export function pushEvent(controller, type, overrides) {
  const evt = Object.assign(
    {
      type,
      generation: controller.generation,
      currentTime: controller.confirmedTime,
      duration: 0,
      readyState: 4,
      seekableRanges: [],
      paused: false,
      errorCode: null
    },
    overrides || {}
  );
  return controller.handleMediaEvent(evt);
}

// Records every structured log entry passed to `options.log`.
export function recordLog() {
  const entries = [];
  return { entries, fn: (entry) => entries.push(entry) };
}

export function commandsOfType(commands, type) {
  return commands.filter((c) => c.type === type);
}

export function firstCommandOfType(commands, type) {
  return commands.find((c) => c.type === type) || null;
}
