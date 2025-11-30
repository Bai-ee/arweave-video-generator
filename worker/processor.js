/**
 * Railway Worker: Async Video Processor
 * 
 * Continuously polls Firestore for pending video jobs,
 * processes them using ArweaveVideoGenerator,
 * uploads to Firebase Storage,
 * and updates job status.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFirestore, getStorage } from './firebase-admin.js';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import fs from 'fs-extra';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize video generator
const videoGenerator = new ArweaveVideoGenerator();

// Polling configuration
const POLL_INTERVAL = 3000; // Check every 3 seconds
const MAX_CONCURRENT_JOBS = 1; // Process one at a time for MVP

let isProcessing = false;
let currentJobId = null;

/**
 * Process a single video job
 */
async function processVideoJob(jobId, jobData) {
  console.log(`\n🎬 Processing video job: ${jobId}`);
  console.log(`   Artist: ${jobData.artist}, Duration: ${jobData.duration}s`);

  const db = getFirestore();
  const storage = getStorage();
  const bucket = storage.bucket();

  try {
    // Update status to processing
    await db.collection('videoJobs').doc(jobId).update({
      status: 'processing',
      startedAt: new Date()
    });

    // Generate video
    const videoResult = await videoGenerator.generateVideoWithAudio({
      duration: jobData.duration,
      artist: jobData.artist === 'random' ? null : jobData.artist,
      width: 720,
      height: 720,
      fadeIn: 2,
      fadeOut: 2
    });

    if (!videoResult.success) {
      throw new Error('Video generation returned unsuccessful result');
    }

    console.log(`✅ Video generated: ${videoResult.fileName}`);

    // Upload to Firebase Storage
    const videoFilePath = videoResult.videoPath;
    const storagePath = `videos/${videoResult.fileName}`;
    
    console.log(`📤 Uploading to Firebase Storage: ${storagePath}`);
    
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

    // Get public URL
    const file = bucket.file(storagePath);
    await file.makePublic(); // Make file publicly accessible
    const videoUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    console.log(`✅ Video uploaded: ${videoUrl}`);

    // Update job status to completed
    await db.collection('videoJobs').doc(jobId).update({
      status: 'completed',
      completedAt: new Date(),
      videoUrl: videoUrl,
      metadata: {
        fileName: videoResult.fileName,
        fileSize: videoResult.fileSize,
        mixTitle: videoResult.mixTitle
      }
    });

    // Also create/update video document in videos collection
    await db.collection('videos').doc(jobId).set({
      videoId: jobId,
      jobId: jobId,
      artist: videoResult.artist,
      mixTitle: videoResult.mixTitle,
      duration: videoResult.duration,
      fileSize: videoResult.fileSize,
      videoUrl: videoUrl,
      status: 'completed',
      createdAt: new Date()
    }, { merge: true });

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
    try {
      await db.collection('videoJobs').doc(jobId).update({
        status: 'failed',
        completedAt: new Date(),
        error: error.message
      });
    } catch (updateError) {
      console.error(`❌ Failed to update job status: ${updateError.message}`);
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
    const pendingJobsSnapshot = await db.collection('videoJobs')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
      .limit(MAX_CONCURRENT_JOBS)
      .get();

    if (pendingJobsSnapshot.empty) {
      return; // No pending jobs
    }

    // Process the first pending job
    const jobDoc = pendingJobsSnapshot.docs[0];
    const jobId = jobDoc.id;
    const jobData = jobDoc.data();

    isProcessing = true;
    currentJobId = jobId;

    await processVideoJob(jobId, jobData);

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
    // Continuous mode: poll every few seconds (for Railway/Render)
    console.log('🚀 Continuous Video Worker starting...');
    console.log(`📊 Polling interval: ${POLL_INTERVAL}ms`);
    console.log(`⚙️ Max concurrent jobs: ${MAX_CONCURRENT_JOBS}`);

    // Initial poll
    await pollForPendingJobs();

    // Set up polling interval
    setInterval(async () => {
      await pollForPendingJobs();
    }, POLL_INTERVAL);

    console.log('✅ Worker started and polling for jobs');
  }
}

// Start the worker
startWorker().catch(error => {
  console.error('❌ Fatal error starting worker:', error);
  process.exit(1);
});

// Graceful shutdown (only for continuous mode)
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

