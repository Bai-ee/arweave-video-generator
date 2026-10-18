// Tests for UELinks.runShareFlow -- the pure share-strategy cascade -- using
// injected fake capabilities (no real navigator/DOM). Covers: native share
// preferred + called synchronously; share absent -> clipboard; clipboard
// rejecting -> execCommand fallback; everything absent -> manual (visible
// URL) fallback; a user cancelling the native share sheet is reported
// distinctly and does not fall through to clipboard.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeLinks } from './helpers/load-ue-links.mjs';

const UELinks = loadUeLinks({ window: {} });
const URL_ = 'https://ue.example/baiee.html?mix=xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';

describe('runShareFlow', () => {
  test('native share available -> uses it, called synchronously', async () => {
    let calledSynchronously = false;
    let receivedPayload = null;
    const share = (data) => {
      calledSynchronously = true; // set before any microtask/await elapses
      receivedPayload = data;
      return Promise.resolve();
    };
    const flow = UELinks.runShareFlow({ title: 'T', text: 'T', url: URL_ }, { share });
    // the assignment above must already have happened by the time
    // runShareFlow() returns -- proving share() ran synchronously, not
    // after a tick -- before we ever await the returned promise.
    assert.equal(calledSynchronously, true);
    assert.deepEqual(receivedPayload, { title: 'T', text: 'T', url: URL_ });
    const result = await flow;
    assert.deepEqual(result, { method: 'share', url: URL_ });
  });

  test('share() rejecting (user cancelled) is reported as cancelled, not clipboard fallback', async () => {
    let clipboardCalled = false;
    const share = () => Promise.reject(new Error('AbortError'));
    const clipboardWrite = () => { clipboardCalled = true; return Promise.resolve(); };
    const result = await UELinks.runShareFlow({ url: URL_ }, { share, clipboardWrite });
    assert.equal(result.method, 'share');
    assert.equal(result.cancelled, true);
    assert.equal(clipboardCalled, false);
  });

  test('share() throwing synchronously falls back to clipboard', async () => {
    const share = () => { throw new Error('nope'); };
    let clipboardCalledWith = null;
    const clipboardWrite = (text) => { clipboardCalledWith = text; return Promise.resolve(); };
    const result = await UELinks.runShareFlow({ url: URL_ }, { share, clipboardWrite });
    assert.equal(result.method, 'clipboard');
    assert.equal(clipboardCalledWith, URL_);
  });

  test('share absent -> uses clipboard.writeText', async () => {
    let clipboardCalledWith = null;
    const clipboardWrite = (text) => { clipboardCalledWith = text; return Promise.resolve(); };
    const result = await UELinks.runShareFlow({ url: URL_ }, { clipboardWrite });
    assert.deepEqual(result, { method: 'clipboard', url: URL_ });
    assert.equal(clipboardCalledWith, URL_);
  });

  test('clipboard rejecting -> falls back to execCommand', async () => {
    const clipboardWrite = () => Promise.reject(new Error('denied'));
    let execCalledWith = null;
    const execCommandCopy = (text) => { execCalledWith = text; return true; };
    const result = await UELinks.runShareFlow({ url: URL_ }, { clipboardWrite, execCommandCopy });
    assert.deepEqual(result, { method: 'execCommand', url: URL_ });
    assert.equal(execCalledWith, URL_);
  });

  test('clipboard rejecting + execCommand also failing -> manual fallback', async () => {
    const clipboardWrite = () => Promise.reject(new Error('denied'));
    const execCommandCopy = () => false;
    const result = await UELinks.runShareFlow({ url: URL_ }, { clipboardWrite, execCommandCopy });
    assert.deepEqual(result, { method: 'manual', url: URL_ });
  });

  test('clipboard synchronously throwing is treated the same as rejecting', async () => {
    const clipboardWrite = () => { throw new Error('nope'); };
    const execCommandCopy = () => true;
    const result = await UELinks.runShareFlow({ url: URL_ }, { clipboardWrite, execCommandCopy });
    assert.equal(result.method, 'execCommand');
  });

  test('execCommandCopy throwing is treated as a failed copy, not an uncaught error', async () => {
    const execCommandCopy = () => { throw new Error('nope'); };
    const result = await UELinks.runShareFlow({ url: URL_ }, { execCommandCopy });
    assert.deepEqual(result, { method: 'manual', url: URL_ });
  });

  test('all capabilities absent -> manual (visible-URL) fallback', async () => {
    const result = await UELinks.runShareFlow({ url: URL_ }, {});
    assert.deepEqual(result, { method: 'manual', url: URL_ });
    const resultNoCaps = await UELinks.runShareFlow({ url: URL_ });
    assert.deepEqual(resultNoCaps, { method: 'manual', url: URL_ });
  });

  test('always resolves to a plain object, never throws, for a garbage payload', async () => {
    await assert.doesNotReject(UELinks.runShareFlow());
    await assert.doesNotReject(UELinks.runShareFlow(null, null));
  });
});
