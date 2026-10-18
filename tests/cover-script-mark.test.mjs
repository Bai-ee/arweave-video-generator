// The handwritten artist mark laid across mix thumbnails and resident
// portraits — lib/WebsitePageGenerator.cjs `coverScriptHtml()` and friends.
//
// What matters here, and why:
//   - a two-word name STACKS. "TYREL WILLIAMS" on one line would be half the
//     size of "AKILA" on the same tile; the stack is the whole point.
//   - the split minimises the widest line, because the widest line is what
//     sets the size of every other one.
//   - the mark is a signature, so an "AKA …"/parenthetical tail is dropped
//     from the ARTWORK copy only — the card body still carries the full name.
//   - --script-w must never UNDERSTATE a line's width. The stylesheet divides
//     the tile width by it, so an understated width oversizes the type and the
//     tile clips it. The per-character table cannot see Gately's kerning
//     (~16% on capital-heavy names), which is what SCRIPT_W_SAFETY covers.
//   - the mark is aria-hidden: the same name is already in the card as a real
//     link/heading, and a screen reader should not hear it twice.
//
// lib/WebsitePageGenerator.cjs is CommonJS; imported here via createRequire.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  scriptDisplayName,
  splitScriptLines,
  scriptWidthEm,
  coverScriptHtml
} = require('../lib/WebsitePageGenerator.cjs');

test('a one-word name stays on one line', () => {
  assert.deepEqual(splitScriptLines('AKILA'), ['AKILA']);
  assert.deepEqual(splitScriptLines('SASSMOUTH'), ['SASSMOUTH']);
});

test('a two-word name always stacks onto two lines', () => {
  assert.deepEqual(splitScriptLines('TYREL WILLIAMS'), ['TYREL', 'WILLIAMS']);
  assert.deepEqual(splitScriptLines('VIVA ACID'), ['VIVA', 'ACID']);
  assert.deepEqual(splitScriptLines('Chicago Skyway'), ['Chicago', 'Skyway']);
});

test('three words take two lines, four or more take three', () => {
  assert.equal(splitScriptLines('A B C').length, 2);
  assert.equal(splitScriptLines('A B C D').length, 3);
  assert.equal(splitScriptLines('A B C D E').length, 3);
});

test('the split minimises the widest line rather than filling greedily', () => {
  // WILLIAMS is much wider than TYREL, so the break goes before it, not after
  const lines = splitScriptLines('TYREL WILLIAMS JONES');
  const widest = Math.max(...lines.map(scriptWidthEm));
  // any other 2-line split of the same words must be at least as wide
  const words = ['TYREL', 'WILLIAMS', 'JONES'];
  for (let cut = 1; cut < words.length; cut++) {
    const alt = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    assert.ok(widest <= Math.max(...alt.map(scriptWidthEm)) + 1e-9,
      'chosen split is wider than the alternative ' + JSON.stringify(alt));
  }
});

test('the mark wears the stage name — an alias tail is dropped', () => {
  assert.equal(scriptDisplayName('BLUE JAY (AKA Josh Zeitler)'), 'BLUE JAY');
  assert.equal(scriptDisplayName('DJ RELEASE AKA IKE'), 'DJ RELEASE');
  assert.equal(scriptDisplayName('SEAN SMITH'), 'SEAN SMITH');
  // trimming must never empty the mark
  assert.equal(scriptDisplayName('(AKA Someone)'), '(AKA Someone)');
});

test('--script-w pads the estimate so a line can never be sized too big', () => {
  const html = coverScriptHtml('STAR TRAXX');
  const widths = [...html.matchAll(/--script-w:([0-9.]+)/g)].map(m => Number(m[1]));
  const lines = splitScriptLines('STAR TRAXX');
  assert.equal(widths.length, lines.length);
  lines.forEach((line, i) => {
    // padded above the raw sum-of-advances, which is the value that kerning
    // makes too narrow on exactly this kind of capital-heavy name
    assert.ok(widths[i] > scriptWidthEm(line),
      line + ': --script-w ' + widths[i] + ' must exceed the raw estimate');
  });
});

test('the markup carries the line count, is aria-hidden, and escapes the name', () => {
  const html = coverScriptHtml('TYREL WILLIAMS');
  assert.match(html, /class="cover-script"/);
  assert.match(html, /--script-lines:2/);
  assert.match(html, /aria-hidden="true"/);
  assert.equal((html.match(/cover-script-line/g) || []).length, 2);

  const nasty = coverScriptHtml('A<script>"&');
  assert.ok(!nasty.includes('<script>'), 'name must be escaped into the mark');
  assert.match(nasty, /&lt;script&gt;/);
});

test('a nameless entry produces no mark at all', () => {
  assert.equal(coverScriptHtml(''), '');
  assert.equal(coverScriptHtml(null), '');
  assert.equal(coverScriptHtml('   '), '');
});
