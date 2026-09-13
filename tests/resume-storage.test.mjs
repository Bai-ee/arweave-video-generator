// ue-resume.js -- readRecord/writeRecord/clearRecord against fake storage
// (including storage that throws, simulating private-mode Safari/Firefox)
// and getLocalStorage's defense against a `window.localStorage` PROPERTY
// ACCESS itself throwing (not just getItem/setItem). No real localStorage
// anywhere; no DOM. See tests/helpers/load-ue-resume.mjs for the loader.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeResume } from './helpers/load-ue-resume.mjs';

const UEResume = loadUeResume();
const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const NOW = 1_800_000_000_000;

function makeMemoryStorage(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    store, // exposed for assertions
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
}

function makeThrowingStorage() {
  return {
    getItem() { throw new Error('SecurityError: getItem blocked'); },
    setItem() { throw new Error('SecurityError: setItem blocked'); },
    removeItem() { throw new Error('SecurityError: removeItem blocked'); }
  };
}

function goodRecord(overrides) {
  return UEResume.makeRecord(Object.assign({
    txid: TXID, page: '/baiee.html', position: 90, duration: 600,
    title: 'Mix', artist: 'Artist', now: NOW
  }, overrides || {}));
}

describe('writeRecord / readRecord round-trip', () => {
  test('a record written can be read back unchanged', () => {
    const storage = makeMemoryStorage();
    const record = goodRecord();
    assert.equal(UEResume.writeRecord(storage, record), true);
    const read = UEResume.readRecord(storage, { now: NOW, ttlMs: UEResume.TTL_MS });
    assert.deepEqual(read, record);
  });

  test('readRecord returns null when nothing is stored, without touching storage destructively', () => {
    const storage = makeMemoryStorage();
    assert.equal(UEResume.readRecord(storage, { now: NOW }), null);
  });

  test('readRecord returns null and a missing storageLike never throws', () => {
    assert.equal(UEResume.readRecord(null, { now: NOW }), null);
    assert.equal(UEResume.readRecord(undefined, { now: NOW }), null);
  });
});

describe('readRecord discards corrupt/expired values', () => {
  test('a corrupt (non-JSON) stored value is discarded from storage, not just ignored', () => {
    const storage = makeMemoryStorage({ [UEResume.STORAGE_KEY]: '{not json' });
    const result = UEResume.readRecord(storage, { now: NOW });
    assert.equal(result, null);
    assert.equal(storage.store.has(UEResume.STORAGE_KEY), false, 'corrupt entry must be removed');
  });

  test('an expired stored value is discarded', () => {
    const stale = goodRecord({ now: NOW - UEResume.TTL_MS - 5000 });
    const storage = makeMemoryStorage({ [UEResume.STORAGE_KEY]: JSON.stringify(stale) });
    const result = UEResume.readRecord(storage, { now: NOW, ttlMs: UEResume.TTL_MS });
    assert.equal(result, null);
    assert.equal(storage.store.has(UEResume.STORAGE_KEY), false);
  });

  test('a record with a hostile page (javascript: scheme) is discarded, never surfaced', () => {
    const raw = JSON.stringify(Object.assign(goodRecord(), { page: 'javascript:alert(1)' }));
    const storage = makeMemoryStorage({ [UEResume.STORAGE_KEY]: raw });
    assert.equal(UEResume.readRecord(storage, { now: NOW }), null);
    assert.equal(storage.store.has(UEResume.STORAGE_KEY), false);
  });
});

describe('storage that throws on access (private-mode degrade)', () => {
  test('readRecord returns null when getItem throws, never propagates', () => {
    const storage = makeThrowingStorage();
    assert.doesNotThrow(() => {
      const result = UEResume.readRecord(storage, { now: NOW });
      assert.equal(result, null);
    });
  });

  test('writeRecord returns false when setItem throws, never propagates', () => {
    const storage = makeThrowingStorage();
    assert.doesNotThrow(() => {
      const ok = UEResume.writeRecord(storage, goodRecord());
      assert.equal(ok, false);
    });
  });

  test('clearRecord returns false when removeItem throws, never propagates', () => {
    const storage = makeThrowingStorage();
    assert.doesNotThrow(() => {
      const ok = UEResume.clearRecord(storage);
      assert.equal(ok, false);
    });
  });

  test('readRecord discarding a corrupt value also degrades cleanly if removeItem then throws', () => {
    // getItem returns corrupt JSON (triggering the internal clearRecord
    // call), and removeItem throws -- the whole readRecord call must still
    // just return null, not propagate the removeItem failure.
    const storage = {
      getItem() { return '{not json'; },
      removeItem() { throw new Error('blocked'); }
    };
    assert.doesNotThrow(() => {
      assert.equal(UEResume.readRecord(storage, { now: NOW }), null);
    });
  });
});

describe('clearRecord', () => {
  test('removes an existing entry', () => {
    const storage = makeMemoryStorage({ [UEResume.STORAGE_KEY]: 'anything' });
    assert.equal(UEResume.clearRecord(storage), true);
    assert.equal(storage.store.has(UEResume.STORAGE_KEY), false);
  });

  test('no-ops safely with a missing storageLike', () => {
    assert.equal(UEResume.clearRecord(null), false);
  });
});

describe('getLocalStorage -- property access itself can throw', () => {
  test('returns the real localStorage when access succeeds', () => {
    const prevWindow = globalThis.window;
    const fakeStorage = makeMemoryStorage();
    globalThis.window = { localStorage: fakeStorage };
    try {
      assert.equal(UEResume.getLocalStorage(), fakeStorage);
    } finally {
      globalThis.window = prevWindow;
    }
  });

  test('returns null, without throwing, when the localStorage GETTER itself throws', () => {
    const prevWindow = globalThis.window;
    const hostileWindow = {};
    Object.defineProperty(hostileWindow, 'localStorage', {
      get() { throw new Error('SecurityError: access denied in private mode'); }
    });
    globalThis.window = hostileWindow;
    try {
      assert.doesNotThrow(() => {
        assert.equal(UEResume.getLocalStorage(), null);
      });
    } finally {
      globalThis.window = prevWindow;
    }
  });

  test('returns null when window is undefined (node:vm / non-browser load)', () => {
    const prevWindow = globalThis.window;
    globalThis.window = undefined;
    try {
      assert.equal(UEResume.getLocalStorage(), null);
    } finally {
      globalThis.window = prevWindow;
    }
  });
});
