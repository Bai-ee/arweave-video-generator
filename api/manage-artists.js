/**
 * API endpoint for managing artists JSON in Firebase
 * POST /api/manage-artists
 * 
 * Supports:
 * - addArtist: Add a new artist
 * - addMix: Add a mix to an existing artist (by URL or Arweave URL)
 * - addTrack: Add a track to an existing artist (by URL or Arweave URL)
 * - updateArtist: Update artist properties
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';
import { syncFirebaseToWebsiteJSON } from '../lib/WebsiteSync.js';
import { deployWebsiteToArweave } from '../lib/WebsiteDeployer.js';
import path from 'path';
import { createRequire } from 'module';

// Skyline thumbnail pipeline (contract §3.12) — ingestion/admin seam owned by Workstream C.
import { classifyMixImage, classifyArtistImage, isProtected, IMAGE_STATE } from '../lib/skyline/classify.js';
import { deriveMixKey, deriveArtistKey } from '../lib/skyline/keys.js';
import { createAssignmentStore } from '../lib/SkylineAssignmentStore.js';
import {
  THUMBNAIL_STATUS,
  createThumbnailJobQueue,
  requestThumbnailGeneration,
  locateMixIndex,
  transactionalArtistPatch,
} from '../lib/SkylineThumbnailJobs.js';

const require = createRequire(import.meta.url);

// New skyline-thumbnail admin/status actions never touch website/artists.json or Arweave —
// they only read/write system/artists and the job queue (contract §1 rule 6/§3.12).
const THUMBNAIL_ADMIN_ACTIONS = new Set([
  'thumbnailStatus',
  'requestThumbnail',
  'regenerateThumbnail',
  'retryThumbnail',
  'restoreThumbnail',
  'lockThumbnail',
  'unlockThumbnail',
  'setUploadedArtwork',
]);

/**
 * @param {object} req
 * @param {object} res
 * @param {{db?: object}} [deps] Test-only injection seam — never populated in production,
 *   where Vercel always calls handler(req, res) with exactly two arguments.
 */
export default async function handler(req, res, deps = {}) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      action, artistName, mixUrl, mixTitle, mixDateYear, mixDuration, mixImageFilename, isTrack, artistGenre,
      // Skyline thumbnail admin/status actions (contract §3.12):
      entityType, mixArweaveURL, imageUrl, jobId, requestedBy,
    } = req.body;

    if (!action || !artistName) {
      return res.status(400).json({
        success: false,
        error: 'action and artistName are required'
      });
    }

    // Initialize Firebase (or use an injected db — test-only seam, see the `deps` param above;
    // never populated in production).
    const db = deps.db || (initializeFirebaseAdmin(), getFirestore());

    let result;

    switch (action) {
      case 'addMix':
        if (!mixUrl) {
          return res.status(400).json({
            success: false,
            error: 'mixUrl is required for addMix action'
          });
        }
        result = await addMixToArtist(db, artistName, {
          mixTitle: mixTitle || 'Untitled Mix',
          mixArweaveURL: mixUrl,
          mixDateYear: mixDateYear || new Date().getFullYear().toString(),
          mixDuration: mixDuration || '0:00',
          mixImageFilename: mixImageFilename || '',
          isTrack: false
        });
        break;

      case 'addTrack':
        if (!mixUrl) {
          return res.status(400).json({
            success: false,
            error: 'mixUrl is required for addTrack action'
          });
        }
        result = await addMixToArtist(db, artistName, {
          mixTitle: mixTitle || 'Untitled Track',
          mixArweaveURL: mixUrl,
          mixDateYear: mixDateYear || new Date().getFullYear().toString(),
          mixDuration: mixDuration || '0:00',
          mixImageFilename: mixImageFilename || '',
          isTrack: true
        });
        break;

      case 'updateArtist':
        result = await updateArtist(db, artistName, {
          genre: artistGenre
        });
        break;

      // ---- Skyline thumbnail admin/status actions (contract §3.12) ----

      case 'thumbnailStatus':
        if (!entityType) {
          return res.status(400).json({ success: false, error: 'entityType is required' });
        }
        result = await getThumbnailStatus(db, { entityType, artistName, mixArweaveURL, mixTitle });
        break;

      case 'requestThumbnail':
        if (!entityType) {
          return res.status(400).json({ success: false, error: 'entityType is required' });
        }
        result = await requestThumbnailAction(db, { entityType, artistName, mixArweaveURL, mixTitle, requestedBy: requestedBy || 'admin' });
        break;

      case 'regenerateThumbnail':
        if (!entityType) {
          return res.status(400).json({ success: false, error: 'entityType is required' });
        }
        result = await regenerateThumbnailAction(db, { entityType, artistName, mixArweaveURL, mixTitle, requestedBy: requestedBy || 'admin' });
        break;

      case 'retryThumbnail':
        result = await retryThumbnailAction(db, { jobId, entityType, artistName, mixArweaveURL, mixTitle });
        break;

      case 'restoreThumbnail':
        if (!entityType) {
          return res.status(400).json({ success: false, error: 'entityType is required' });
        }
        result = await restoreThumbnailAction(db, { entityType, artistName, mixArweaveURL, mixTitle });
        break;

      case 'lockThumbnail':
      case 'unlockThumbnail':
        if (!entityType) {
          return res.status(400).json({ success: false, error: 'entityType is required' });
        }
        result = await setThumbnailLock(db, { entityType, artistName, mixArweaveURL, mixTitle, locked: action === 'lockThumbnail' });
        break;

      case 'setUploadedArtwork':
        if (!entityType || !imageUrl) {
          return res.status(400).json({ success: false, error: 'entityType and imageUrl are required' });
        }
        result = await setUploadedArtworkAction(db, { entityType, artistName, mixArweaveURL, mixTitle, imageUrl });
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}. Supported: addMix, addTrack, updateArtist, thumbnailStatus, requestThumbnail, regenerateThumbnail, retryThumbnail, restoreThumbnail, lockThumbnail, unlockThumbnail, setUploadedArtwork`
        });
    }

    // Update website (non-blocking - don't fail if website update fails).
    // Skyline thumbnail admin/status actions are excluded — they never touch
    // website/artists.json or Arweave (contract §1 rule 6).
    let websiteUpdateResult = null;
    if (!THUMBNAIL_ADMIN_ACTIONS.has(action)) {
      try {
        websiteUpdateResult = await updateWebsite(db);
      } catch (websiteError) {
        console.warn('[Manage Artists] Website update failed (non-blocking):', websiteError.message);
      }
    }

    return res.status(200).json({
      success: true,
      action: action,
      artistName: artistName,
      result: result,
      message: `Successfully ${action} for ${artistName}`,
      websiteUpdate: websiteUpdateResult
    });

  } catch (error) {
    console.error('[Manage Artists] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to manage artists',
      message: error.message 
    });
  }
}

/**
 * Add mix/track to artist in Firebase artists JSON.
 *
 * mixImageFilename is optional (contract §3.12): when a mix is created without one, a skyline
 * thumbnail generation job is enqueued after the write succeeds. A brand new artist created
 * inline here (no separate artist-creation step) gets the same treatment for its artist image.
 * A thumbnail enqueue failure is caught and reported via the returned `thumbnail`/
 * `artistThumbnail` fields — it never fails this write.
 */
export async function addMixToArtist(db, artistName, mixData) {
  try {
    const artistsRef = db.collection('system').doc('artists');
    const artistsDoc = await artistsRef.get();

    let artistsData = [];
    if (artistsDoc.exists) {
      artistsData = artistsDoc.data().artists || [];
    }

    // Find or create artist
    let artist = artistsData.find(a => a.artistName === artistName);
    let isNewArtist = false;

    if (!artist) {
      // Create new artist
      artist = {
        artistName: artistName,
        artistFilename: artistName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html',
        artistImageFilename: '',
        artistGenre: 'electronic',
        mixes: [],
        trax: []
      };
      artistsData.push(artist);
      isNewArtist = true;
      console.log(`[Manage Artists] Created new artist: ${artistName}`);
    }

    // Add mix or track
    const mixEntry = {
      mixTitle: mixData.mixTitle,
      mixArweaveURL: mixData.mixArweaveURL,
      mixDateYear: mixData.mixDateYear,
      mixDuration: mixData.mixDuration,
      mixImageFilename: mixData.mixImageFilename || ''
    };

    let mixIndex = -1;
    if (mixData.isTrack) {
      // Add as track
      if (!artist.trax) {
        artist.trax = [];
      }
      const trackEntry = {
        trackTitle: mixEntry.mixTitle,
        trackArweaveURL: mixEntry.mixArweaveURL,
        trackDateYear: mixEntry.mixDateYear,
        trackDuration: mixEntry.mixDuration,
        trackImageFilename: mixEntry.mixImageFilename
      };
      artist.trax.push(trackEntry);
      console.log(`[Manage Artists] Added track "${mixData.mixTitle}" to ${artistName}`);
    } else {
      // Add as mix
      if (!artist.mixes) {
        artist.mixes = [];
      }
      artist.mixes.push(mixEntry);
      mixIndex = artist.mixes.length - 1;
      console.log(`[Manage Artists] Added mix "${mixData.mixTitle}" to ${artistName}`);
    }

    // Save back to Firebase
    await artistsRef.set({ artists: artistsData }, { merge: false });
    console.log(`[Manage Artists] ✅ Updated artists JSON in Firebase`);

    // Skyline thumbnails: a mix saved with no supplied art gets an automatic generation job.
    // Tracks are out of scope for v1 (not an entityType the contract defines).
    let thumbnail = { status: THUMBNAIL_STATUS.NOT_REQUESTED };
    if (!mixData.isTrack && !mixEntry.mixImageFilename) {
      try {
        thumbnail = await requestThumbnailGeneration({
          db,
          entityType: 'mix',
          artistFilename: artist.artistFilename,
          mixIndex,
          mixTitle: mixEntry.mixTitle,
          mixArweaveURL: mixEntry.mixArweaveURL,
          assignmentVersion: 1,
          requestedBy: 'ingestion',
        });
      } catch (thumbError) {
        console.warn(`[Manage Artists] Mix thumbnail enqueue failed for "${artistName}":`, thumbError.message);
        thumbnail = { status: 'failed', reason: thumbError.message };
      }
    }

    let artistThumbnail = { status: THUMBNAIL_STATUS.NOT_REQUESTED };
    if (isNewArtist) {
      try {
        artistThumbnail = await requestThumbnailGeneration({
          db,
          entityType: 'artist',
          artistFilename: artist.artistFilename,
          assignmentVersion: 1,
          requestedBy: 'ingestion',
        });
      } catch (thumbError) {
        console.warn(`[Manage Artists] Artist thumbnail enqueue failed for "${artistName}":`, thumbError.message);
        artistThumbnail = { status: 'failed', reason: thumbError.message };
      }
    }

    return { added: true, artistName: artistName, isNewArtist, thumbnail, artistThumbnail };

  } catch (error) {
    console.error('[Manage Artists] Error updating artists JSON:', error.message);
    throw error;
  }
}

/**
 * Update website after Firebase changes (sync, regenerate, deploy)
 * Non-blocking - errors are logged but don't throw
 */
async function updateWebsite(db) {
  try {
    console.log('[Manage Artists] Updating website after Firebase changes...');
    
    // Step 1: Sync Firebase to website/artists.json
    const syncResult = await syncFirebaseToWebsiteJSON(db, 'website');
    if (!syncResult.success) {
      throw new Error(`Sync failed: ${syncResult.error}`);
    }
    console.log('[Manage Artists] ✅ Synced Firebase to website/artists.json');

    // Step 2: Generate HTML pages
    const generateScript = require(path.join(process.cwd(), 'website', 'scripts', 'generate_artist_pages.js'));
    const generateResult = generateScript.generatePages();
    if (!generateResult.success) {
      throw new Error(`Generate failed: ${generateResult.error}`);
    }
    console.log('[Manage Artists] ✅ Generated HTML pages');

    // Step 3: Deploy to Arweave (with database for incremental uploads)
    const deployResult = await deployWebsiteToArweave('website', db);
    if (!deployResult.success) {
      throw new Error(`Deploy failed: ${deployResult.error}`);
    }
    console.log('[Manage Artists] ✅ Deployed website to Arweave');

    return {
      success: true,
      manifestId: deployResult.manifestId,
      websiteUrl: deployResult.websiteUrl,
      filesUploaded: deployResult.filesUploaded,
      filesUnchanged: deployResult.filesUnchanged || 0,
      totalFiles: deployResult.totalFiles || deployResult.filesUploaded,
      costEstimate: deployResult.costEstimate
    };
  } catch (error) {
    console.error('[Manage Artists] Website update error:', error.message);
    throw error;
  }
}

/**
 * Update artist properties
 */
export async function updateArtist(db, artistName, updates) {
  try {
    const artistsRef = db.collection('system').doc('artists');
    const artistsDoc = await artistsRef.get();
    
    let artistsData = [];
    if (artistsDoc.exists) {
      artistsData = artistsDoc.data().artists || [];
    }

    // Find artist
    const artist = artistsData.find(a => a.artistName === artistName);
    
    if (!artist) {
      throw new Error(`Artist "${artistName}" not found`);
    }

    // Update properties
    if (updates.genre) {
      artist.artistGenre = updates.genre;
    }

    // Save back to Firebase
    await artistsRef.set({ artists: artistsData }, { merge: false });
    console.log(`[Manage Artists] ✅ Updated artist ${artistName} in Firebase`);
    
    return { updated: true, artistName: artistName };

  } catch (error) {
    console.error('[Manage Artists] Error updating artist:', error.message);
    throw error;
  }
}

// =====================================================================
// Skyline thumbnail admin/status actions (contract §3.12)
// Owner: Workstream C. All read/write only system/artists + the job queue —
// never website/artists.json, never Arweave.
// =====================================================================

async function readArtistsList(db) {
  const snap = await db.collection('system').doc('artists').get();
  return snap.exists ? (snap.data().artists || []) : [];
}

/**
 * Truthful status for one mix/artist thumbnail: uploaded | generating | generated | failed |
 * not-requested (contract §3.12/§1 rule — never report "generated" for a still-queued job).
 */
export async function getThumbnailStatus(db, { entityType, artistName, mixArweaveURL, mixTitle }) {
  if (entityType !== 'mix' && entityType !== 'artist') {
    return { success: false, reason: 'entityType must be "mix" or "artist"' };
  }
  const artists = await readArtistsList(db);
  const artist = artists.find((a) => a.artistName === artistName);
  if (!artist) return { success: false, reason: 'artist-not-found' };

  let classification;
  let currentUrl;
  let currentMeta;
  let previousUrl;

  if (entityType === 'artist') {
    classification = classifyArtistImage({ artist });
    currentUrl = artist.artistImageFilename || '';
    currentMeta = artist.artistImageMeta || null;
    previousUrl = artist.previousArtistImageFilename || '';
  } else {
    const mixIndex = locateMixIndex(artist, { mixArweaveURL, mixTitle });
    if (mixIndex === -1) return { success: false, reason: 'mix-not-found' };
    const mix = artist.mixes[mixIndex];
    classification = classifyMixImage({ mix, artist });
    currentUrl = mix.mixImageFilename || '';
    currentMeta = mix.mixImageMeta || null;
    previousUrl = mix.previousMixImageFilename || '';
  }

  const entityKey =
    entityType === 'artist'
      ? deriveArtistKey({ artistFilename: artist.artistFilename })
      : deriveMixKey({ artistFilename: artist.artistFilename, mixArweaveURL, mixTitle });

  const queue = createThumbnailJobQueue({ db });
  const jobInfo = await queue.statusFor({ entityType, entityKey });

  let thumbnailStatus;
  if (classification.state === IMAGE_STATE.UPLOADED) {
    thumbnailStatus = THUMBNAIL_STATUS.UPLOADED;
  } else if (jobInfo.status === THUMBNAIL_STATUS.GENERATING) {
    thumbnailStatus = THUMBNAIL_STATUS.GENERATING;
  } else if (jobInfo.status === THUMBNAIL_STATUS.FAILED) {
    thumbnailStatus = THUMBNAIL_STATUS.FAILED;
  } else if (classification.state === IMAGE_STATE.GENERATED) {
    thumbnailStatus = THUMBNAIL_STATUS.GENERATED;
  } else {
    thumbnailStatus = THUMBNAIL_STATUS.NOT_REQUESTED;
  }

  return {
    success: true,
    entityType,
    entityKey,
    thumbnailStatus,
    imageState: classification.state,
    origin: currentMeta?.origin || null,
    locked: !!classification.locked,
    imageUrl: currentUrl,
    sourceVideoId: currentMeta?.sourceVideoId || null,
    sourceTimeSec: currentMeta?.sourceTimeSec ?? null,
    assignmentVersion: currentMeta?.assignmentVersion ?? null,
    hasPrevious: !!previousUrl,
    job: jobInfo.job
      ? { id: jobInfo.job.id, status: jobInfo.job.status, attempts: jobInfo.job.attempts, error: jobInfo.job.error }
      : null,
  };
}

async function requestOrRegenerateThumbnail(db, { entityType, artistName, mixArweaveURL, mixTitle, requestedBy = 'admin' }, { forceRegenerate }) {
  if (entityType !== 'mix' && entityType !== 'artist') {
    return { status: 'failed', reason: 'entityType must be "mix" or "artist"' };
  }
  const artists = await readArtistsList(db);
  const artist = artists.find((a) => a.artistName === artistName);
  if (!artist) return { status: 'failed', reason: 'artist-not-found' };

  let mixIndex = null;
  let mixTitleOut = null;
  let classification;
  let currentMeta;

  if (entityType === 'mix') {
    mixIndex = locateMixIndex(artist, { mixArweaveURL, mixTitle });
    if (mixIndex === -1) return { status: 'failed', reason: 'mix-not-found' };
    const mix = artist.mixes[mixIndex];
    classification = classifyMixImage({ mix, artist });
    currentMeta = mix.mixImageMeta;
    mixTitleOut = mix.mixTitle;
  } else {
    classification = classifyArtistImage({ artist });
    currentMeta = artist.artistImageMeta;
  }

  // Uploaded/locked art is never enqueued for generation — not on request, not on regenerate.
  if (isProtected(classification.state, currentMeta)) {
    return { status: THUMBNAIL_STATUS.UPLOADED, reason: 'protected' };
  }

  const baseVersion = currentMeta && typeof currentMeta.assignmentVersion === 'number' ? currentMeta.assignmentVersion : 0;
  const assignmentVersion = forceRegenerate ? baseVersion + 1 : (baseVersion || 1);

  try {
    return await requestThumbnailGeneration({
      db,
      entityType,
      artistFilename: artist.artistFilename,
      mixIndex,
      mixTitle: mixTitleOut,
      mixArweaveURL,
      assignmentVersion,
      requestedBy,
    });
  } catch (err) {
    console.error('[Manage Artists] Thumbnail enqueue failed:', err.message);
    return { status: 'failed', reason: err.message };
  }
}

/** Enqueue at the entity's current assignment version (first generation, or a same-version retry). */
export async function requestThumbnailAction(db, params) {
  return requestOrRegenerateThumbnail(db, params, { forceRegenerate: false });
}

/** Enqueue at assignmentVersion + 1 — a deliberately different deterministic candidate. */
export async function regenerateThumbnailAction(db, params) {
  return requestOrRegenerateThumbnail(db, params, { forceRegenerate: true });
}

/** Admin retry of a failed job — by jobId, or resolved from the entity's current failed job. */
export async function retryThumbnailAction(db, { jobId, entityType, artistName, mixArweaveURL, mixTitle }) {
  try {
    const queue = createThumbnailJobQueue({ db });
    let id = jobId;
    if (!id) {
      if (entityType !== 'mix' && entityType !== 'artist') {
        return { status: 'failed', reason: 'jobId or entityType is required' };
      }
      const artists = await readArtistsList(db);
      const artist = artists.find((a) => a.artistName === artistName);
      if (!artist) return { status: 'failed', reason: 'artist-not-found' };
      const entityKey =
        entityType === 'artist'
          ? deriveArtistKey({ artistFilename: artist.artistFilename })
          : deriveMixKey({ artistFilename: artist.artistFilename, mixArweaveURL, mixTitle });
      const { job } = await queue.statusFor({ entityType, entityKey });
      if (!job) return { status: 'failed', reason: 'no-job-to-retry' };
      id = job.id;
    }
    const result = await queue.retry(id);
    return {
      status: result.retried ? THUMBNAIL_STATUS.GENERATING : THUMBNAIL_STATUS.FAILED,
      jobId: id,
      retried: !!result.retried,
    };
  } catch (err) {
    console.error('[Manage Artists] retryThumbnail failed:', err.message);
    return { status: 'failed', reason: err.message };
  }
}

/** previous* -> live, via the real assignment store (contract §3.9). */
export async function restoreThumbnailAction(db, { entityType, artistName, mixArweaveURL, mixTitle }) {
  if (entityType !== 'mix' && entityType !== 'artist') {
    return { applied: false, reason: 'entityType must be "mix" or "artist"' };
  }
  const artists = await readArtistsList(db);
  const artist = artists.find((a) => a.artistName === artistName);
  if (!artist) return { applied: false, reason: 'artist-not-found' };

  let mixIndex = null;
  if (entityType === 'mix') {
    mixIndex = locateMixIndex(artist, { mixArweaveURL, mixTitle });
    if (mixIndex === -1) return { applied: false, reason: 'mix-not-found' };
  }

  const store = createAssignmentStore({ db });
  return store.restore({ entityType, artistFilename: artist.artistFilename, mixIndex });
}

/**
 * Lock/unlock is a meta-only toggle and must always be able to act — including unlocking an
 * already-locked record — so it deliberately bypasses the automatic-path protection guard via
 * transactionalArtistPatch rather than lib/SkylineAssignmentStore.js's applyEntityAssignment.
 */
export async function setThumbnailLock(db, { entityType, artistName, mixArweaveURL, mixTitle, locked }) {
  if (entityType !== 'mix' && entityType !== 'artist') {
    return { changed: false, reason: 'entityType must be "mix" or "artist"' };
  }
  return transactionalArtistPatch({
    db,
    artistName,
    entityType,
    mixArweaveURL,
    mixTitle,
    mutate: (artist, mixIndex) => {
      if (entityType === 'artist') {
        const meta = { ...(artist.artistImageMeta || {}), locked: !!locked };
        return { nextArtist: { ...artist, artistImageMeta: meta }, changed: true };
      }
      const mixes = artist.mixes.slice();
      const mix = mixes[mixIndex];
      const meta = { ...(mix.mixImageMeta || {}), locked: !!locked };
      mixes[mixIndex] = { ...mix, mixImageMeta: meta };
      return { nextArtist: { ...artist, mixes }, changed: true };
    },
  });
}

/**
 * Explicit-upload path (contract §3.12/master-plan Phase 3 item 2): sets origin:'uploaded',
 * locked:true and enqueues nothing. Deliberately bypasses the automatic-path protection guard
 * (an admin replacing an already-generated or already-uploaded image must always be able to) —
 * see transactionalArtistPatch's doc comment.
 */
export async function setUploadedArtworkAction(db, { entityType, artistName, mixArweaveURL, mixTitle, imageUrl }) {
  if (entityType !== 'mix' && entityType !== 'artist') {
    return { changed: false, reason: 'entityType must be "mix" or "artist"' };
  }
  if (!imageUrl) {
    return { changed: false, reason: 'imageUrl is required' };
  }
  const nowIso = new Date().toISOString();
  return transactionalArtistPatch({
    db,
    artistName,
    entityType,
    mixArweaveURL,
    mixTitle,
    mutate: (artist, mixIndex) => {
      if (entityType === 'artist') {
        const hasPrevious = Object.prototype.hasOwnProperty.call(artist, 'previousArtistImageFilename');
        const patch = {
          artistImageFilename: imageUrl,
          artistImageMeta: {
            origin: 'uploaded',
            locked: true,
            assignmentVersion: (artist.artistImageMeta?.assignmentVersion || 0) + 1,
            generatedAt: nowIso,
          },
        };
        if (!hasPrevious) patch.previousArtistImageFilename = artist.artistImageFilename || '';
        return { nextArtist: { ...artist, ...patch }, changed: true };
      }
      const mixes = artist.mixes.slice();
      const mix = mixes[mixIndex];
      const hasPrevious = Object.prototype.hasOwnProperty.call(mix, 'previousMixImageFilename');
      const patch = {
        mixImageFilename: imageUrl,
        mixImageMeta: {
          origin: 'uploaded',
          locked: true,
          assignmentVersion: (mix.mixImageMeta?.assignmentVersion || 0) + 1,
          generatedAt: nowIso,
        },
      };
      if (!hasPrevious) patch.previousMixImageFilename = mix.mixImageFilename || '';
      mixes[mixIndex] = { ...mix, ...patch };
      return { nextArtist: { ...artist, mixes }, changed: true };
    },
  });
}

