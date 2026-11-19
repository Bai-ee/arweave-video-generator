#!/usr/bin/env node
/**
 * Append new artists (or new mixes to an existing artist) to Firestore system/artists,
 * the source of truth for the UE site. Dry run by default; --write to change prod.
 *
 *   node scripts/ue-append-artists.mjs <record.json> [<record.json> ...]          # dry run
 *   node scripts/ue-append-artists.mjs <record.json> ... --write                  # write
 *   node scripts/ue-append-artists.mjs <record.json> --add-mixes-to "PAUL JOHNSON" --write
 *
 * A record is one artist in the system/artists shape (scripts/ravearchive/build-artist.py
 * writes them). With --add-mixes-to, only its mixes are appended to that existing artist.
 *
 * Safety, in order:
 *   1. Every record is validated: required fields, mix URL host allowed (archive.org keyed or
 *      the EditVideos Storage mixes prefix; Arweave only with --allow-arweave, for UE-owned audio),
 *      no duplicate titles within an artist.
 *   2. In ONE transaction: back up the whole doc to UE_BACKUP_DIR (default
 *      ~/server/data/ue-firestore-backups), refuse if the artist already exists (or, for
 *      --add-mixes-to, does not) or any mixArweaveURL is already anywhere in the doc, then append.
 *   3. Re-read and print counts.
 *
 * Credentials: EDITVIDEOS_FIREBASE_SERVICE_ACCOUNT_KEY (JSON or base64) from the environment, or
 * from the env file in UE_FIREBASE_ENV_FILE (default: the HITLOOP checkout's .env.local).
 * The key is never printed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ARCHIVE_RE = /^https:\/\/archive\.org\/download\/[^#\s]+\.mp3#\/[A-Za-z0-9_-]{43}$/;
const GCS_PREFIX = 'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/website/mixes/';
const ARWEAVE_RE = /^https:\/\/arweave\.net\/[A-Za-z0-9_-]{43}$/;
const REQUIRED_ARTIST = ['artistName', 'artistFilename', 'artistImageFilename', 'artistGenre'];
const REQUIRED_MIX = ['mixTitle', 'mixArweaveURL', 'mixDateYear', 'mixDuration', 'mixNote'];

export function validateRecord(rec, { allowArweave = false, mixesOnly = false } = {}) {
  const errors = [];
  if (!mixesOnly) {
    for (const k of REQUIRED_ARTIST) if (!rec[k] || typeof rec[k] !== 'string') errors.push(`missing ${k}`);
    if (rec.artistName && rec.artistName !== rec.artistName.toUpperCase()) errors.push('artistName must be CAPS');
    if (rec.artistFilename && !/^[a-z0-9]+\.html$/.test(rec.artistFilename)) errors.push('artistFilename must be <slug>.html');
  }
  if (!Array.isArray(rec.mixes) || rec.mixes.length === 0) errors.push('no mixes');
  const titles = new Set();
  for (const m of rec.mixes || []) {
    for (const k of REQUIRED_MIX) if (typeof m[k] !== 'string' || !m[k]) errors.push(`${m.mixTitle || '?'}: missing ${k}`);
    const u = m.mixArweaveURL || '';
    const ok = ARCHIVE_RE.test(u) || (u.startsWith(GCS_PREFIX) && /^[A-Za-z0-9_-]{43}$/.test(u.slice(GCS_PREFIX.length)))
      || (allowArweave && ARWEAVE_RE.test(u));
    if (!ok) errors.push(`${m.mixTitle}: mix URL host not allowed (${u.slice(0, 60)})`);
    if (titles.has(m.mixTitle)) errors.push(`duplicate title ${m.mixTitle}`);
    titles.add(m.mixTitle);
    if (m.mixDuration && !/^\d+:\d\d$/.test(m.mixDuration)) errors.push(`${m.mixTitle}: mixDuration must be M:SS`);
  }
  return errors;
}

export function planAppend(artists, records, { addMixesTo = null } = {}) {
  const names = new Set(artists.map((a) => String(a.artistName).toUpperCase()));
  const urls = new Set(artists.flatMap((a) => (a.mixes || []).map((m) => m.mixArweaveURL)));
  const errors = [];
  for (const r of records) for (const m of r.mixes) if (urls.has(m.mixArweaveURL)) errors.push(`already live: ${m.mixTitle}`);
  if (addMixesTo) {
    if (!names.has(addMixesTo.toUpperCase())) errors.push(`no artist ${addMixesTo} to add mixes to`);
  } else {
    for (const r of records) if (names.has(r.artistName.toUpperCase())) errors.push(`artist already exists: ${r.artistName}`);
  }
  if (errors.length) return { errors };
  const next = addMixesTo
    ? artists.map((a) => (String(a.artistName).toUpperCase() === addMixesTo.toUpperCase()
      ? { ...a, mixes: [...(a.mixes || []), ...records.flatMap((r) => r.mixes)] } : a))
    : [...artists, ...records];
  return { errors: [], next };
}

function loadKey() {
  let v = process.env.EDITVIDEOS_FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!v) {
    const file = process.env.UE_FIREBASE_ENV_FILE || path.join(os.homedir(), 'Documents/Repos/Bballi_Portfolio/.env.local');
    const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith('EDITVIDEOS_FIREBASE_SERVICE_ACCOUNT_KEY='));
    if (!line) throw new Error(`EDITVIDEOS_FIREBASE_SERVICE_ACCOUNT_KEY not found in ${file}`);
    v = line.slice(line.indexOf('=') + 1).trim();
  }
  if (/^['"]/.test(v)) v = v.slice(1, -1);
  return JSON.parse(v.startsWith('{') ? v : Buffer.from(v, 'base64').toString());
}

async function main(argv) {
  const write = argv.includes('--write');
  const allowArweave = argv.includes('--allow-arweave');
  const i = argv.indexOf('--add-mixes-to');
  const addMixesTo = i >= 0 ? argv[i + 1] : null;
  const files = argv.filter((a, j) => !a.startsWith('--') && argv[j - 1] !== '--add-mixes-to');
  if (!files.length) { console.error('usage: ue-append-artists.mjs <record.json>... [--add-mixes-to NAME] [--write]'); return 2; }
  const records = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  let bad = 0;
  for (const [j, r] of records.entries()) {
    const errs = validateRecord(r, { allowArweave, mixesOnly: !!addMixesTo });
    if (errs.length) { bad++; console.error(`${files[j]}:\n  ${errs.join('\n  ')}`); }
  }
  if (bad) return 1;

  const { default: admin } = await import('firebase-admin');
  admin.initializeApp({ credential: admin.credential.cert(loadKey()) });
  const db = admin.firestore();
  const ref = db.collection('system').doc('artists');
  const backupDir = process.env.UE_BACKUP_DIR || path.join(os.homedir(), 'server/data/ue-firestore-backups');

  if (!write) {
    const { errors, next } = planAppend((await ref.get()).data().artists, records, { addMixesTo });
    if (errors.length) { console.error(errors.join('\n')); return 1; }
    console.log(`DRY RUN: would ${addMixesTo ? `add ${records.reduce((n, r) => n + r.mixes.length, 0)} mixes to ${addMixesTo}` : `append ${records.map((r) => `${r.artistName} (${r.mixes.length})`).join(', ')}`}`);
    console.log(`artists ${next.length}, mixes ${next.reduce((n, a) => n + (a.mixes || []).length, 0)}. Re-run with --write.`);
    return 0;
  }

  fs.mkdirSync(backupDir, { recursive: true });
  let backup;
  await db.runTransaction(async (t) => {
    const d = (await t.get(ref)).data();
    backup = path.join(backupDir, `system-artists-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify(d, null, 1));
    const { errors, next } = planAppend(d.artists, records, { addMixesTo });
    if (errors.length) throw new Error(errors.join('; '));
    t.update(ref, { artists: next });
  });
  const after = (await ref.get()).data().artists;
  console.log(`written. backup ${backup}`);
  console.log(`artists ${after.length}, mixes ${after.reduce((n, a) => n + (a.mixes || []).length, 0)}`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(String(e.message || e)); process.exit(1); });
}
