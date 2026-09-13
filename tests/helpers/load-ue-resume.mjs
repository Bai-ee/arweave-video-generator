// Loads website/js/ue-resume.js the same way a <script> tag would, but
// inside node:vm -- modelled directly on tests/helpers/load-core.mjs (see
// that file's own comment for why vm.runInThisContext in the CURRENT realm
// is used rather than vm.createContext: a fresh vm realm gets its own
// Array/Object intrinsics and assert.deepStrictEqual would fail every
// structural comparison against plain Node arrays/objects for that reason
// alone).
//
// ue-resume.js's exported pure decision logic (makeRecord, validateRecord,
// shouldSave, isComplete, formatTime, pageHasTxid, createResumeHandler,
// readRecord/writeRecord/clearRecord, ...) does not read window.UEPlayerCore
// or any other global at call time, so this loader does not need to seed
// anything beyond the same minimal `module`/`window` shim load-core.mjs
// uses -- unlike tests/helpers/load-ue-warm.mjs, which seeds
// window.UEPlayerCore because ue-warm.js's build step depends on it.
//
// A bare `window = {}` (no `document`) is deliberate: it exercises the
// file's own top-level guard (`typeof document !== 'undefined' && typeof
// window !== 'undefined'`) that skips auto-init under node:vm, proving the
// file never touches the DOM or fires a resume just from being loaded.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, '..', '..', 'website', 'js', 'ue-resume.js');

export function loadUeResume() {
  const code = fs.readFileSync(SOURCE_PATH, 'utf8');
  const prevModule = globalThis.module;
  const prevWindow = globalThis.window;
  globalThis.module = { exports: {} };
  globalThis.window = {};
  try {
    vm.runInThisContext(code, { filename: SOURCE_PATH });
    return globalThis.module.exports;
  } finally {
    globalThis.module = prevModule;
    globalThis.window = prevWindow;
  }
}
