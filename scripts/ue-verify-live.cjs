#!/usr/bin/env node
/**
 * Prove a deployed UE manifest works for the artists you just shipped:
 * page loads, portrait loads, a mix plays, and dragging the waveform to 60% seeks.
 *
 *   node scripts/ue-verify-live.cjs <manifestId|base url> <slug> [<slug> ...]
 *
 * Exits non-zero if any check fails. Needs Playwright with Chromium; it is not a repo
 * dependency, so point PLAYWRIGHT_MODULE at an install (default: the HITLOOP checkout's).
 */
const path = require('path');
const os = require('os');

const pw = require(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), 'Documents/Repos/Bballi_Portfolio/node_modules/playwright'));

async function main([target, ...slugs]) {
  if (!target || !slugs.length) { console.error('usage: ue-verify-live.cjs <manifestId|url> <slug>...'); return 2; }
  const base = /^https?:/.test(target) ? target.replace(/\/(index\.html)?$/, '') : `https://turbo-gateway.com/${target}`;
  const b = await pw.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  let failed = 0;
  for (const slug of slugs) {
    const r = { slug };
    try {
      const resp = await p.goto(`${base}/${slug}.html`, { waitUntil: 'load', timeout: 90000 });
      r.page = resp && resp.ok();
      await p.waitForTimeout(1500);
      r.rows = await p.locator('[data-playlist]').count();
      r.portrait = await p.evaluate(async (s) => {
        const img = new Image(); img.src = `img/about/${s}/portrait.webp`;
        try { await img.decode(); return img.naturalWidth; } catch { return 0; }
      }, slug);
      await p.locator('[data-playlist]').first().click();
      let t = 0;
      for (let i = 0; i < 40 && t <= 3; i++) { await p.waitForTimeout(1000); t = await p.evaluate(() => (window.__ueAudioEl ? window.__ueAudioEl.currentTime : 0)); }
      r.plays = t > 3;
      await p.waitForTimeout(4000);
      r.seekDisabled = await p.evaluate(() => !!document.querySelector('#player-bar-waveform.is-seek-disabled'));
      const about = p.getByRole('button', { name: /about/i }).first();
      if (await about.count()) { await about.click(); await p.waitForTimeout(1500); }
      const before = await p.evaluate(() => window.__ueAudioEl.currentTime);
      const bb = await p.locator('#player-bar-waveform').first().boundingBox();
      if (bb) {
        const x = bb.x + bb.width * 0.6, y = bb.y + bb.height / 2;
        await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 2, y); await p.mouse.up();
        await p.waitForTimeout(4000);
      }
      const after = await p.evaluate(() => window.__ueAudioEl.currentTime);
      r.scrub = `${before.toFixed(0)}s -> ${after.toFixed(0)}s`;
      r.ok = r.page && r.rows > 0 && r.portrait > 0 && r.plays && !r.seekDisabled && after > before + 60;
    } catch (e) {
      r.error = String(e.message || e).slice(0, 200); r.ok = false;
    }
    failed += !r.ok;
    console.log((r.ok ? 'OK   ' : 'FAIL ') + JSON.stringify(r));
  }
  await b.close();
  return failed ? 1 : 0;
}

main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
