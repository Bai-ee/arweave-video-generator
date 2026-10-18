// Loads website/js/ue-warm.js through node:vm, modelled on
// tests/helpers/load-core.mjs (see that file's own comment for why
// vm.runInThisContext + a real-realm module/window shim -- not
// vm.createContext -- is used: a fresh vm realm gets its own Array/Object
// intrinsics and assert.deepStrictEqual would fail every structural
// comparison against plain Node arrays/objects for that reason alone).
//
// ue-warm.js does not exist yet as of this file's authorship -- writing
// this loader and the failing tests that call it IS the project's required
// first action (see the integration contract). When the file is missing we
// throw ONE clear, actionable error instead of letting node:fs's raw ENOENT
// propagate, so every test that calls loadUeWarm() fails legibly with
// "not implemented yet" rather than a confusing module-not-found trace.
//
// ue-warm.js expects UEPlayerCore on `window` -- exactly like the real
// page, where player-core.js loads via a <script> tag before ue-warm.js.
// This loader loads player-core.js first (via loadCore()) and seeds the
// fake `window` with it, so ue-warm.js's own `window.UEPlayerCore` lookup
// succeeds under vm too, and so tests exercise the REAL buildCandidates/
// RANGE_HOSTS rather than a mock.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadCore } from './load-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, '..', '..', 'website', 'js', 'ue-warm.js');

export function loadUeWarm() {
  if (!fs.existsSync(SOURCE_PATH)) {
    const err = new Error(
      'ue-warm.js not implemented yet (' + SOURCE_PATH + ' does not exist). ' +
      'This is the EXPECTED state before the warming agent lands website/js/ue-warm.js -- ' +
      'see the integration contract\'s "website/js/ue-warm.js public API" section. ' +
      'This is not a bug in this test file; it is the required first-action failing state.'
    );
    err.code = 'UE_WARM_NOT_IMPLEMENTED';
    throw err;
  }

  const code = fs.readFileSync(SOURCE_PATH, 'utf8');
  const prevModule = globalThis.module;
  const prevWindow = globalThis.window;
  globalThis.module = { exports: {} };
  globalThis.window = { UEPlayerCore: loadCore() };
  try {
    vm.runInThisContext(code, { filename: SOURCE_PATH });
    return globalThis.module.exports;
  } finally {
    globalThis.module = prevModule;
    globalThis.window = prevWindow;
  }
}
