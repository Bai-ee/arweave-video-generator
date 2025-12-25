/**
 * Vercel Serverless Function: Create Atomic Asset
 * POST /api/create-atomic-asset - Converts a generated video to ANS-110 atomic asset
 */

import { initializeFirebaseAdmin, getFirestore, getStorage } from '../lib/firebase-admin.js';
import { uploadAtomicAsset } from '../lib/ArweaveUploader.js';
import { createAtomicAssetMetadata } from '../lib/AtomicAssetHelper.js';
import admin, { firestore } from 'firebase-admin';

export default async function handler(req, res) {
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
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    const { jobId, metadata } = req.body;

    // Validate required fields
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'jobId is required'
      });
    }

    if (!metadata || !metadata.title) {
      return res.status(400).json({
        success: false,
        error: 'metadata.title is required'
      });
    }

    console.log(`[CreateAtomicAsset] Processing jobId: ${jobId}`);

    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();
    const storage = getStorage();

    // Get video job from Firestore
    const jobDoc = await db.collection('videoJobs').doc(jobId).get();
    
    if (!jobDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Video job not found'
      });
    }

    const jobData = jobDoc.data();

    // Verify video is completed
    if (jobData.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Video is not completed. Current status: ${jobData.status}`
      });
    }

    // Check if video URL exists
    if (!jobData.videoUrl) {
      return res.status(400).json({
        success: false,
        error: 'Video URL not found in job data'
      });
    }

    console.log(`[CreateAtomicAsset] Video URL: ${jobData.videoUrl.substring(0, 100)}...`);

    // Download video from Firebase Storage
    // Extract storage path from videoUrl (signed URL or public URL)
    let videoBuffer;
    let videoFileName = jobData.metadata?.fileName || `video_${jobId}.mp4`;

    try {
      // Try to download from the videoUrl (could be signed URL or public URL)
      const videoResponse = await fetch(jobData.videoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.status} ${videoResponse.statusText}`);
      }
      const arrayBuffer = await videoResponse.arrayBuffer();
      videoBuffer = Buffer.from(arrayBuffer);
      console.log(`[CreateAtomicAsset] ✅ Downloaded video: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
    } catch (downloadError) {
      console.error(`[CreateAtomicAsset] ❌ Video download failed:`, downloadError.message);
      return res.status(500).json({
        success: false,
        error: `Failed to download video: ${downloadError.message}`
      });
    }

    // Get video metadata from job
    const videoMetadata = {
      videoTitle: metadata.title,
      description: metadata.description || `Generated video for ${jobData.metadata?.artist || 'Unknown Artist'}`,
      artist: jobData.metadata?.artist || '',
      mixTitle: jobData.metadata?.mixTitle || metadata.title,
      duration: jobData.metadata?.duration || jobData.duration || 30,
      resolution: '720x720',
      aspectRatio: '1:1',
      frameRate: '30',
      codec: 'h264',
      format: 'mp4',
      collection: metadata.collection || 'GeneratedVideos',
      walletAddress: process.env.ARWEAVE_WALLET_ADDRESS,
      contractSrc: process.env.ATOMIC_ASSET_CONTRACT_SRC
    };

    // Validate contract source
    if (!process.env.ATOMIC_ASSET_CONTRACT_SRC) {
      return res.status(500).json({
        success: false,
        error: 'ATOMIC_ASSET_CONTRACT_SRC environment variable is not set'
      });
    }

    // Create atomic asset metadata
    const atomicMetadata = createAtomicAssetMetadata(videoMetadata);

    // Additional tags for linking
    const additionalTags = [
      { name: 'Video-Job-Id', value: jobId },
      { name: 'Generated-At', value: jobData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString() },
      { name: 'Firebase-Url', value: jobData.videoUrl }
    ];

    // Upload as atomic asset
    console.log(`[CreateAtomicAsset] ⚡ Uploading to Arweave as atomic asset...`);
    const uploadResult = await uploadAtomicAsset(
      videoBuffer,
      videoFileName,
      atomicMetadata,
      additionalTags
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: `Failed to upload atomic asset: ${uploadResult.error}`
      });
    }

    console.log(`[CreateAtomicAsset] ✅ Atomic asset uploaded: ${uploadResult.transactionId}`);

    // Update Firestore with atomic asset info
    const updateData = {
      'metadata.atomicAsset': true,
      'metadata.arweaveTxId': uploadResult.transactionId,
      'metadata.arweaveUrl': uploadResult.arweaveUrl,
      'metadata.atomicAssetMetadata': atomicMetadata,
      'metadata.atomicAssetCreatedAt': admin.firestore.Timestamp.now()
    };

    await db.collection('videoJobs').doc(jobId).update(updateData);

    console.log(`[CreateAtomicAsset] ✅ Firestore updated with atomic asset information`);

    // Return success response
    return res.status(200).json({
      success: true,
      transactionId: uploadResult.transactionId,
      arweaveUrl: uploadResult.arweaveUrl,
      turboUrl: uploadResult.turboUrl,
      fileName: uploadResult.fileName,
      fileSize: uploadResult.fileSize,
      metadata: atomicMetadata,
      message: 'Video successfully converted to atomic asset'
    });

  } catch (error) {
    console.error('[CreateAtomicAsset] ❌ Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}

