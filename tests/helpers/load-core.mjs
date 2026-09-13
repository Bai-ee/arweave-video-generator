// Loads website/js/player-core.js the same way a <script> tag would, but
// inside node:vm so the classic (non-module, IIFE) script can run under the
// Node test runner without a browser. We hand it a fake `module`/`window`
// pair; the file's own dual-export tail —
//   if (typeof module === 'object' && module.exports) module.exports = ...;
//   if (typeof window !== 'undefined') window.UEPlayerCore = ...;
// — picks up `module.exports` from that pair. This keeps player-core.js
// itself framework-free: it never imports/exports via ESM or CommonJS
// directly, so the identical file also loads fine as a plain browser
// <script src="js/player-core.js">.
//
// Deliberately uses vm.runInThisContext (current realm), NOT
// vm.createContext + runInContext (a fresh realm). A fresh vm context gets
// its own Array/Object/RegExp intrinsics, and Node's assert.deepStrictEqual
// treats values built from a different realm's Array as not equal to a
// plain Node array even when structurally identical — every array/object
// this module hands back (RANGE_HOSTS, buildCandidates(), etc.) would fail
// assertions in the test files for that reason alone. Running in this
// context avoids the split realm while still exercising the file through
// node:vm.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, '..', '..', 'website', 'js', 'player-core.js');

export function loadCore() {
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
