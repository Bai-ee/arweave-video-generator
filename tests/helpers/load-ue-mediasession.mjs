// Loads website/js/ue-mediasession.js the same way a <script> tag would,
// via node:vm (see tests/helpers/load-core.mjs for why vm.runInThisContext
// in the CURRENT realm -- not vm.createContext's fresh realm -- is required:
// a fresh realm's Array/Object intrinsics would fail assert.deepStrictEqual
// against plain Node arrays/objects for every structural comparison).
//
// Unlike load-core.mjs / load-ue-warm.mjs (pure modules, no side effects at
// load time), ue-mediasession.js self-initializes: its IIFE calls init()
// unconditionally at the bottom, exactly as it will when boot.js inserts it
// as a bare <script src="js/ue-mediasession.js"> with no callback. So the
// caller-supplied fakes (`navigator`, `document`, `MediaMetadata`, `window`)
// must be installed as REAL globals before the module executes -- init()'s
// own decisions (whether navigator.mediaSession exists, whether to wait for
// `ue-player-ready`, etc.) run synchronously during this call, against
// whatever is installed at that moment.
//
// Because of that, this loader does NOT restore the previous globals before
// returning (unlike load-core.mjs) -- a caller that wired a fake
// `window`/`document`/host may need those same fakes to still be live when
// it later fires a deferred callback (e.g. simulating the `ue-player-ready`
// event, or a host.on() callback captured during init()). Call the returned
// `restore()` once the test is done driving the module (Node's test runner
// `t.after(restore)` is the natural place).
//
// `navigator` (and, on some Node versions, nothing else) already exists as
// a real global with only a getter (no setter) -- a plain
// `globalThis.navigator = ...` assignment throws in this file's strict-mode
// ESM. `setGlobal()` below always deletes the own property first (that
// getter is configurable), then reinstalls either the caller's fake or
// (if the caller didn't ask for that global at all) leaves it deleted, so
// `typeof navigator === 'undefined'` inside the module -- the "absent API"
// case the integration contract requires every module to survive.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, '..', '..', 'website', 'js', 'ue-mediasession.js');

function setGlobal(name, provided, value) {
  const hadOwn = Object.prototype.hasOwnProperty.call(globalThis, name);
  const prevDescriptor = hadOwn ? Object.getOwnPropertyDescriptor(globalThis, name) : null;
  delete globalThis[name];
  if (provided) {
    globalThis[name] = value;
  }
  return function restore() {
    delete globalThis[name];
    if (prevDescriptor) Object.defineProperty(globalThis, name, prevDescriptor);
  };
}

// env: { window, navigator, document, MediaMetadata } -- each key OMITTED
// entirely means "absent" for that global (not merely `undefined`), which
// is how the "no navigator.mediaSession" / "no MediaMetadata" test cases
// are expressed. `window` always defaults to a plain `{}` (mirrors
// load-core.mjs) since every real load, and every other module's loader,
// does the same.
export function loadUeMediaSession(env) {
  const opts = env || {};
  const code = fs.readFileSync(SOURCE_PATH, 'utf8');

  const prevModule = globalThis.module;
  const prevWindow = globalThis.window;
  const restoreNavigator = setGlobal('navigator', 'navigator' in opts, opts.navigator);
  const restoreDocument = setGlobal('document', 'document' in opts, opts.document);
  const restoreMediaMetadata = setGlobal('MediaMetadata', 'MediaMetadata' in opts, opts.MediaMetadata);

  globalThis.module = { exports: {} };
  globalThis.window = opts.window || {};

  function restore() {
    globalThis.module = prevModule;
    globalThis.window = prevWindow;
    restoreNavigator();
    restoreDocument();
    restoreMediaMetadata();
  }

  try {
    vm.runInThisContext(code, { filename: SOURCE_PATH });
  } catch (err) {
    restore();
    throw err;
  }
  return { exports: globalThis.module.exports, restore: restore };
}
