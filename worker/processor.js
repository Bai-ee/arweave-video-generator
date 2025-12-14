/**
 * GitHub Actions Worker: Async Video Processor
 * 
 * Processes pending video jobs from Firestore,
 * generates videos using ArweaveVideoGenerator,
 * uploads to Firebase Storage,
 * and updates job status.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFirestore, getStorage, admin } from './firebase-admin.js';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { getFilter } from './lib/VideoFilters.js';
import fs from 'fs-extra';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize video generator
const videoGenerator = new ArweaveVideoGenerator();

// Polling configuration
const MAX_CONCURRENT_JOBS = 1; // Process one at a time for MVP

let isProcessing = false;
let currentJobId = null;

/**
 * Process a single video job
 */
async function processVideoJob(jobId, jobData, documentId = null) {
  // CRITICAL: Always use documentId (from Firestore snapshot) for updates
  // The documentId is the actual Firestore document ID, which may differ from jobId
  if (!documentId) {
    console.error(`❌ ERROR: documentId is required! Got jobId: ${jobId}`);
    throw new Error('documentId is required for Firestore updates');
  }
  const docId = documentId; // Always use documentId, never jobId for Firestore doc reference
  console.log(`\n🎬 Processing video job:`);
  console.log(`   JobId: ${jobId}`);
  console.log(`   Document ID (for Firestore): ${docId}`);
  console.log(`   Artist: ${jobData.artist}, Duration: ${jobData.duration}s`);

  const db = getFirestore();
  const storage = getStorage();
  const bucket = storage.bucket();

  try {
    // Update status to processing
    console.log(`📝 Updating status to 'processing' for document: ${docId}`);
    await db.collection('videoJobs').doc(docId).update({
      status: 'processing',
      startedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ Status updated to 'processing'`);

    // Generate video
    // Get video filter from job data
    let videoFilter = null;
    if (jobData.videoFilter) {
      const filterIntensity = jobData.filterIntensity !== undefined ? parseFloat(jobData.filterIntensity) : 0.4;
      const filterDef = getFilter(jobData.videoFilter, filterIntensity);
      if (filterDef) {
        videoFilter = filterDef.filter;
        console.log(`[Processor] Using video filter: ${filterDef.name} (intensity: ${(filterIntensity * 100).toFixed(0)}%)`);
      } else {
        console.warn(`[Processor] Unknown filter key: ${jobData.videoFilter}, using default`);
      }
    }
    
    const videoResult = await videoGenerator.generateVideoWithAudio({
      duration: jobData.duration,
      artist: jobData.artist === 'random' ? null : jobData.artist,
      width: 720,
      height: 720,
      fadeIn: 2,
      fadeOut: 2,
      videoFilter: videoFilter,
      useTrax: jobData.useTrax === true, // Pass useTrax flag to video generator
      selectedFolders: jobData.selectedFolders || [], // Pass selected folders array
      enableOverlay: jobData.enableOverlay !== undefined ? jobData.enableOverlay : true, // Pass overlay toggle (default: true)
      overlayEffect: jobData.overlayEffect || null, // Pass specific overlay effect or null for random
      topLogo: jobData.topLogo || null, // Pass top logo filename or null for random
      endLogo: jobData.endLogo || null // Pass end logo filename or null for random
    });

    if (!videoResult.success) {
      throw new Error('Video generation returned unsuccessful result');
    }

    console.log(`✅ Video generated: ${videoResult.fileName}`);
    console.log(`📁 Video file path: ${videoResult.videoPath}`);
    console.log(`📊 Video result keys:`, Object.keys(videoResult));

    // Verify video file exists
    const videoFilePath = videoResult.videoPath;
    if (!videoFilePath) {
      throw new Error('Video file path is missing from videoResult');
    }
    
    const fileExists = await fs.pathExists(videoFilePath);
    if (!fileExists) {
      throw new Error(`Video file does not exist at path: ${videoFilePath}`);
    }
    console.log(`✅ Video file exists: ${videoFilePath}`);

    // Upload to Firebase Storage
    const storagePath = `videos/${videoResult.fileName}`;
    
    console.log(`📤 Uploading to Firebase Storage: ${storagePath}`);
    console.log(`📦 Bucket name: ${bucket.name}`);
    
    await bucket.upload(videoFilePath, {
      destination: storagePath,
      metadata: {
        contentType: 'video/mp4',
        metadata: {
          artist: videoResult.artist,
          mixTitle: videoResult.mixTitle,
          duration: videoResult.duration.toString(),
          generatedAt: new Date().toISOString()
        }
      }
    });
    console.log(`✅ File uploaded to Storage successfully`);

    // Get file reference and generate signed URL (works with CORS, no Google Cloud setup needed)
    const file = bucket.file(storagePath);
    console.log(`🔓 Making file public: ${storagePath}`);
    await file.makePublic(); // Make file publicly accessible
    console.log(`✅ File is now public`);
    
    // Generate signed URL (valid for 1 year) - this works with CORS without any Google Cloud configuration
    // Signed URLs bypass CORS issues and work the same way as before
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
    });
    const videoUrl = signedUrl;
    console.log(`✅ Video uploaded with signed URL: ${videoUrl.substring(0, 100)}...`);

    // Update job status to completed
    // IMPORTANT: status must be at root level, not in metadata
    try {
      // Update with status at root level and metadata fields
      // Use set with merge for nested fields to ensure they update correctly
      const updateData = {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        videoUrl: videoUrl,
        metadata: {
          fileName: videoResult.fileName,
          fileSize: videoResult.fileSize,
          mixTitle: videoResult.mixTitle
          // Don't include status in metadata - it's at root level now
        }
      };
      
      // First, try to remove old metadata.status if it exists
      try {
        const currentDoc = await db.collection('videoJobs').doc(docId).get();
        if (currentDoc.exists) {
          const currentData = currentDoc.data();
          if (currentData.metadata && currentData.metadata.status) {
            // Use update with field path to delete nested field
            await db.collection('videoJobs').doc(docId).update({
              'metadata.status': admin.firestore.FieldValue.delete()
            });
            console.log(`🧹 Removed old metadata.status field`);
          }
        }
      } catch (cleanupError) {
        console.warn(`⚠️ Could not cleanup old metadata.status:`, cleanupError.message);
      }
      
      console.log(`📝 Updating Firestore document ${docId} with:`, {
        status: 'completed',
        videoUrl: videoUrl,
        fileName: videoResult.fileName
      });
      console.log(`📝 Full update data:`, JSON.stringify(updateData, null, 2));
      
      // Perform the update
      await db.collection('videoJobs').doc(docId).update(updateData);
      console.log(`✅ Update call completed`);
      
      // Wait a moment for Firestore to propagate
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verify the update - read the document multiple times to ensure consistency
      let updatedDoc = await db.collection('videoJobs').doc(docId).get();
      if (!updatedDoc.exists) {
        throw new Error(`Document ${docId} does not exist after update!`);
      }
      
      let updatedData = updatedDoc.data();
      console.log(`📖 First read - Full document data:`, JSON.stringify(updatedData, null, 2));
      console.log(`📖 First read - Status: ${updatedData.status}, VideoUrl: ${updatedData.videoUrl || 'null'}`);
      
      // Read again to confirm
      await new Promise(resolve => setTimeout(resolve, 500));
      updatedDoc = await db.collection('videoJobs').doc(docId).get();
      updatedData = updatedDoc.data();
      console.log(`📖 Second read - Status: ${updatedData.status}, VideoUrl: ${updatedData.videoUrl || 'null'}`);
      
      // Final verification
      if (updatedData.status !== 'completed') {
        console.error(`❌ CRITICAL: Status update failed! Expected 'completed', got '${updatedData.status}'`);
        console.error(`❌ Full document:`, JSON.stringify(updatedData, null, 2));
        throw new Error(`Status update verification failed: expected 'completed', got '${updatedData.status}'`);
      }
      if (!updatedData.videoUrl) {
        console.error(`❌ CRITICAL: VideoUrl update failed! videoUrl is null`);
        console.error(`❌ Full document:`, JSON.stringify(updatedData, null, 2));
        throw new Error(`VideoUrl update verification failed: videoUrl is null`);
      }
      
      console.log(`✅✅✅ Firestore update VERIFIED - Status: ${updatedData.status}, VideoUrl: ${updatedData.videoUrl}`);
    } catch (updateError) {
      console.error(`❌ Failed to update Firestore for job ${jobId}:`, updateError.message);
      console.error('Update error details:', updateError);
      throw updateError; // Re-throw to trigger error handling
    }

    // Also create/update video document in videos collection
    console.log(`📝 Creating/updating document in 'videos' collection: ${jobId}`);
    await db.collection('videos').doc(jobId).set({
      videoId: jobId,
      jobId: jobId,
      artist: videoResult.artist,
      mixTitle: videoResult.mixTitle,
      duration: videoResult.duration,
      fileSize: videoResult.fileSize,
      videoUrl: videoUrl,
      status: 'completed',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`✅ Document created/updated in 'videos' collection`);
    
    // Verify videos collection document
    const videoDoc = await db.collection('videos').doc(jobId).get();
    if (videoDoc.exists) {
      const videoData = videoDoc.data();
      console.log(`✅ Verified 'videos' collection document - Status: ${videoData.status}, VideoUrl: ${videoData.videoUrl || 'null'}`);
    } else {
      console.error(`❌ WARNING: Document not found in 'videos' collection after creation!`);
    }

    // Cleanup local video file
    try {
      await fs.remove(videoFilePath);
      console.log(`🧹 Cleaned up local file: ${videoResult.fileName}`);
    } catch (cleanupError) {
      console.warn(`⚠️ Failed to cleanup local file: ${cleanupError.message}`);
    }

    console.log(`✅ Job ${jobId} completed successfully`);

  } catch (error) {
    console.error(`❌ Error processing job ${jobId}:`, error.message);
    console.error(error.stack);

    // Update job status to failed
    // IMPORTANT: status must be at root level, not in metadata
    try {
      const docId = documentId || jobId;
      console.log(`📝 Updating status to 'failed' for document: ${docId}`);
      await db.collection('videoJobs').doc(docId).update({
        status: 'failed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: error.message,
        'metadata.status': admin.firestore.FieldValue.delete() // Remove old nested status
      });
      console.log(`✅ Status updated to 'failed'`);
    } catch (updateError) {
      console.error(`❌ Failed to update job status: ${updateError.message}`);
      console.error('Update error details:', updateError);
    }
  }
}

/**
 * Poll Firestore for pending jobs
 */
async function pollForPendingJobs() {
  if (isProcessing) {
    return; // Skip if already processing
  }

  try {
    const db = getFirestore();

    // Query for pending jobs
    let pendingJobsSnapshot;
    try {
      // Try with where clause first (status at root level)
      pendingJobsSnapshot = await db.collection('videoJobs')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'asc')
        .limit(MAX_CONCURRENT_JOBS)
        .get();
      
      console.log(`[Processor] Found ${pendingJobsSnapshot.size} pending job(s) via query`);
    } catch (queryError) {
      // If query fails (missing index or status in metadata), get all and filter
      console.warn('[Processor] Status query failed, fetching all and filtering:', queryError.message);
      const allJobsSnapshot = await db.collection('videoJobs')
        .limit(20)
        .get();
      
      console.log(`[Processor] Fetched ${allJobsSnapshot.size} total jobs, filtering for pending...`);
      
      // Filter for pending jobs (check both root and metadata)
      const pendingDocs = allJobsSnapshot.docs.filter(doc => {
        const data = doc.data();
        const status = data.status || data.metadata?.status;
        const isPending = status === 'pending';
        if (isPending) {
          console.log(`[Processor] Found pending job: ${doc.id}, status location: ${data.status ? 'root' : 'metadata'}`);
        }
        return isPending;
      });
      
      console.log(`[Processor] Filtered to ${pendingDocs.length} pending job(s)`);
      
      // Create a fake snapshot-like object
      pendingJobsSnapshot = {
        empty: pendingDocs.length === 0,
        docs: pendingDocs.slice(0, MAX_CONCURRENT_JOBS)
      };
    }

    if (pendingJobsSnapshot.empty) {
      return; // No pending jobs
    }

    // Process the first pending job
    const jobDoc = pendingJobsSnapshot.docs[0];
    const documentId = jobDoc.id; // Firestore document ID
    const jobData = jobDoc.data();
    const jobId = jobData.jobId || documentId; // Use jobId from data, fallback to documentId

    console.log(`[Processor] Processing job - Document ID: ${documentId}, JobId from data: ${jobData.jobId || 'none'}, Using jobId: ${jobId}`);

    isProcessing = true;
    currentJobId = jobId;

    // Pass documentId to ensure we update the correct document
    await processVideoJob(jobId, jobData, documentId);

    isProcessing = false;
    currentJobId = null;

  } catch (error) {
    console.error('❌ Error polling for jobs:', error.message);
    isProcessing = false;
    currentJobId = null;
  }
}

/**
 * Main worker loop
 * Supports both continuous polling (for Railway/Render) and one-time execution (for GitHub Actions)
 */
async function startWorker() {
  const isScheduled = process.env.GITHUB_ACTIONS === 'true' || process.argv.includes('--once');
  
  if (isScheduled) {
    // Scheduled mode: process jobs once and exit
    console.log('🚀 Scheduled Video Processor (GitHub Actions mode)');
    console.log(`⚙️ Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);
    
    try {
      await pollForPendingJobs();
      console.log('✅ Job processing complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error processing jobs:', error);
      process.exit(1);
    }
  } else {
    // Continuous polling mode (for local dev or other platforms)
    console.log('🔄 Starting continuous polling for video jobs...');
    console.log(`⚙️ Polling interval: 3000 seconds`);
    console.log(`⚙️ Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);
    
    // Initial poll
    pollForPendingJobs();
    
    // Start polling interval
    setInterval(pollForPendingJobs, 3000);
  }
}

// Start the worker
startWorker().catch(console.error);

