/**
 * Vercel Serverless Function: Optimize Video Endpoint
 * POST /api/upload-video
 * 
 * Optimizes a video that's already uploaded to Firebase Storage
 * Client uploads directly to Firebase Storage, then calls this to optimize
 */

import { initializeFirebaseAdmin, getStorage } from '../lib/firebase-admin.js';
import { VideoOptimizer } from '../worker/lib/VideoOptimizer.js';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let tempFilePath = null;
  let optimizedFilePath = null;

  try {
    const { videoUrl, orientation = 'auto', folder = 'user-uploads' } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ error: 'videoUrl is required' });
    }

    console.log(`[upload-video] Optimizing video from: ${videoUrl}`);
    console.log(`[upload-video] Orientation: ${orientation}, Folder: ${folder}`);

    // Initialize Firebase
    initializeFirebaseAdmin();
    const storage = getStorage();
    const bucket = storage.bucket();

    // Download video from Firebase Storage URL
    const tempDir = path.join(process.cwd(), 'temp-uploads');
    await fs.ensureDir(tempDir);
    tempFilePath = path.join(tempDir, `download_${uuidv4()}.mp4`);

    console.log(`[upload-video] Downloading video...`);
    const response = await axios({
      url: videoUrl,
      method: 'GET',
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(tempFilePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`[upload-video] Downloaded to: ${tempFilePath}`);

    // Optimize video
    const optimizer = new VideoOptimizer();
    const optimizationOptions = {
      maxWidth: 720,
      maxHeight: 720,
      orientation: orientation,
      quality: 23,
      maxFileSizeMB: 50
    };

    console.log(`[upload-video] Optimizing video...`);
    const optimizationResult = await optimizer.optimizeVideo(tempFilePath, optimizationOptions);
    optimizedFilePath = optimizationResult.outputPath;

    console.log(`[upload-video] Optimization complete:`);
    console.log(`  Original: ${(optimizationResult.originalSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Optimized: ${(optimizationResult.optimizedSize / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  Compression: ${optimizationResult.compressionRatio}%`);
    console.log(`  Dimensions: ${optimizationResult.dimensions.width}x${optimizationResult.dimensions.height}`);

    // Upload optimized version back to Firebase Storage
    const fileName = `optimized_${Date.now()}_${uuidv4()}.mp4`;
    const storagePath = `${folder}/${fileName}`;
    const file = bucket.file(storagePath);

    console.log(`[upload-video] Uploading optimized video to: ${storagePath}`);

    // Upload file
    await file.save(await fs.readFile(optimizedFilePath), {
      metadata: {
        contentType: 'video/mp4',
        metadata: {
          originalUrl: videoUrl,
          originalSize: optimizationResult.originalSize.toString(),
          optimizedSize: optimizationResult.optimizedSize.toString(),
          dimensions: `${optimizationResult.dimensions.width}x${optimizationResult.dimensions.height}`,
          orientation: orientation,
          optimizedAt: new Date().toISOString()
        }
      }
    });

    // Make file publicly accessible
    await file.makePublic();

    // Generate signed URL for CORS compliance (consistent with other endpoints)
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
    });
    const publicUrl = signedUrl;

    console.log(`[upload-video] ✅ Optimization complete: ${publicUrl.substring(0, 100)}...`);

    // Clean up temp files
    await optimizer.cleanup(tempFilePath);
    await optimizer.cleanup(optimizedFilePath);

    // Return success response
    return res.status(200).json({
      success: true,
      data: {
        url: publicUrl,
        fileName: fileName,
        storagePath: storagePath,
        dimensions: optimizationResult.dimensions,
        originalSize: optimizationResult.originalSize,
        optimizedSize: optimizationResult.optimizedSize,
        compressionRatio: optimizationResult.compressionRatio
      }
    });

  } catch (error) {
    console.error('[upload-video] Error:', error);

    // Clean up temp files on error
    if (tempFilePath) {
      try {
        await fs.remove(tempFilePath);
      } catch (e) {
        console.warn('[upload-video] Failed to cleanup temp file:', e.message);
      }
    }
    if (optimizedFilePath) {
      try {
        await fs.remove(optimizedFilePath);
      } catch (e) {
        console.warn('[upload-video] Failed to cleanup optimized file:', e.message);
      }
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Video optimization failed'
    });
  }
}

// Note: This endpoint optimizes videos that are already uploaded to Firebase Storage
// The client should:
// 1. Upload directly to Firebase Storage (bypasses Vercel's 10MB limit)
// 2. Call this endpoint with the Firebase Storage URL to optimize
// 3. Use the optimized URL returned

