/**
 * Vercel Serverless Function: Videos Endpoint
 * GET /api/videos - Returns list of all completed videos
 * GET /api/video-status/:jobId - Returns status of a specific video job
 * POST /api/videos?action=create-atomic-asset - Converts a video to atomic asset
 * 
 * Handles video listing, status checks, and atomic asset creation
 */

import { initializeFirebaseAdmin, getFirestore, getStorage, admin } from '../lib/firebase-admin.js';
import { uploadAtomicAsset } from '../lib/ArweaveUploader.js';
import { createAtomicAssetMetadata } from '../lib/AtomicAssetHelper.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle HEAD request (for health checks)
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  // Handle POST for atomic asset creation
  if (req.method === 'POST' && req.query.action === 'create-atomic-asset') {
    return await handleCreateAtomicAsset(req, res);
  }

  // Only allow GET for other operations
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check for download mode (must be checked before other query params)
    if (req.query.download === 'true' && req.query.videoUrl) {
      return await handleVideoDownload(req, res);
    }

    // Check if this is a status request (has jobId in query or path)
    const jobId = req.query.jobId || (req.url.includes('/video-status/') ? req.url.split('/video-status/')[1]?.split('?')[0] : null);
    
    // If jobId is provided, return status for that specific job
    if (jobId) {
      return await handleVideoStatus(req, res, jobId);
    }

    // Otherwise, return list of videos
    // Parse query parameters
    const limit = parseInt(req.query.limit) || 50;

    // Initialize Firebase Admin and Firestore
    initializeFirebaseAdmin();
    const db = getFirestore();

    let videos = [];

    // Get ALL jobs (including pending/processing) for frontend status tracking
    // Try with orderBy first, fallback to without if index missing
    let allJobsSnapshot;
    try {
      allJobsSnapshot = await db.collection('videoJobs')
        .orderBy('createdAt', 'desc')
        .limit(limit * 3) // Increased limit to get more videos
        .get();
      console.log(`[Videos] Fetched ${allJobsSnapshot.size} jobs from videoJobs collection`);
    } catch (orderByError) {
      // If orderBy fails (missing index), get all and sort in memory
      console.warn('[Videos] orderBy failed, fetching all and sorting:', orderByError.message);
      try {
        allJobsSnapshot = await db.collection('videoJobs')
          .limit(limit * 3) // Increased limit
          .get();
        console.log(`[Videos] Fetched ${allJobsSnapshot.size} jobs (without orderBy)`);
      } catch (fetchError) {
        console.error('[Videos] Failed to fetch jobs:', fetchError.message);
        // Return empty array if we can't fetch
        return res.status(200).json({
          success: true,
          videos: [],
          count: 0
        });
      }
    }

    allJobsSnapshot.forEach(doc => {
      const data = doc.data();
      // Handle both old structure (status in metadata) and new structure (status at root)
      const status = data.status || data.metadata?.status || 'pending';
      
      // Handle videoUrl in both root and metadata (for backwards compatibility)
      const videoUrl = data.videoUrl || data.metadata?.videoUrl || null;
      
      const videoData = {
        videoId: doc.id,
        jobId: data.jobId || doc.id,
        artist: data.artist || 'Unknown',
        mixTitle: data.metadata?.mixTitle || null,
        duration: data.duration || 30,
        fileSize: data.metadata?.fileSize || null,
        videoUrl: videoUrl,
        status: status,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
        completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt || null,
        metadata: data.metadata || {},
        atomicAsset: data.metadata?.atomicAsset || false,
        arweaveUrl: data.metadata?.arweaveUrl || null
      };
      
      // Log completed videos for debugging
      if (status === 'completed' && videoUrl) {
        console.log(`[Videos] Found completed video: ${videoData.jobId}, URL: ${videoUrl}`);
      } else if (status === 'completed' && !videoUrl) {
        console.warn(`[Videos] WARNING: Completed video ${videoData.jobId} has no videoUrl! Root: ${data.videoUrl || 'null'}, Metadata: ${data.metadata?.videoUrl || 'null'}`);
      }
      
      videos.push(videoData);
    });

    // Also get videos from videos collection to get actual artist names for completed videos
    const videosCollectionData = new Map(); // jobId -> video data
    try {
      const videosSnapshot = await db.collection('videos')
        .limit(limit * 2)
        .get();

      videosSnapshot.forEach(doc => {
        const data = doc.data();
        const jobId = data.jobId || doc.id;
        const videoData = {
          artist: data.artist,
          mixTitle: data.mixTitle,
          fileSize: data.fileSize,
          videoUrl: data.videoUrl,
          status: data.status || 'completed'
        };
        videosCollectionData.set(jobId, videoData);
        console.log(`[Videos] Loaded video from videos collection: jobId=${jobId}, artist=${data.artist || 'null'}`);
      });
      console.log(`[Videos] Loaded ${videosCollectionData.size} videos from videos collection`);
      
      // Log sample entries for debugging
      if (videosCollectionData.size > 0) {
        const sampleEntry = Array.from(videosCollectionData.entries())[0];
        console.log(`[Videos] Sample videos collection entry: jobId=${sampleEntry[0]}, artist=${sampleEntry[1].artist}`);
      }
    } catch (videosError) {
      // Videos collection might not exist yet, that's okay
      console.warn('[Videos] Videos collection query failed (may not exist yet):', videosError.message);
    }

    // Merge data: use videos collection data for completed videos (has actual artist name)
    try {
      console.log(`[Videos] Merging data from ${videosCollectionData.size} videos collection entries`);
      videos = videos.map(video => {
        try {
          // Try to find matching video in videos collection by jobId
          const videosData = videosCollectionData.get(video.jobId);
          
          if (videosData) {
            console.log(`[Videos] Found videos collection data for ${video.jobId}: artist=${videosData.artist || 'null'}`);
            // Use artist from videos collection (actual artist name) for ALL videos that have it
            return {
              videoId: video.videoId,
              jobId: video.jobId,
              artist: videosData.artist || video.artist || 'Unknown', // Prioritize videos collection artist
              mixTitle: videosData.mixTitle || video.mixTitle || null,
              duration: video.duration || 30,
              fileSize: videosData.fileSize || video.fileSize || null,
              videoUrl: videosData.videoUrl || video.videoUrl || null,
              status: videosData.status || video.status || 'completed',
              createdAt: video.createdAt,
              completedAt: video.completedAt
            };
          } else if (video.status === 'completed' && video.videoUrl) {
            // For completed videos without videos collection entry, check metadata
            console.log(`[Videos] No videos collection data for ${video.jobId}, checking metadata`);
            const metadata = video.mixTitle ? { mixTitle: video.mixTitle } : {};
            return {
              ...video,
              ...metadata
            };
          }
          return video;
        } catch (mapError) {
          console.warn(`[Videos] Error merging video ${video.jobId}:`, mapError.message);
          return video; // Return original if merge fails
        }
      });
      console.log(`[Videos] Merge complete. Sample merged video:`, videos.find(v => v.status === 'completed' && v.videoUrl));
    } catch (mergeError) {
      console.error('[Videos] Error during merge:', mergeError.message);
      console.error('[Videos] Merge error stack:', mergeError.stack);
      // Continue with original videos if merge fails
    }

    // Remove duplicates and sort by creation date
    const uniqueVideos = videos.filter((video, index, self) =>
      index === self.findIndex(v => (v.videoId === video.videoId || v.jobId === video.jobId))
    ).sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA; // Newest first
    });

    return res.status(200).json({
      success: true,
      videos: uniqueVideos.slice(0, limit),
      count: uniqueVideos.length
    });

  } catch (error) {
    console.error('[Videos] Error:', error.message);
    console.error('[Videos] Stack:', error.stack);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to get videos list',
      message: error.message 
    });
  }
}

/**
 * Handle video download request - proxies video from Firebase Storage
 */
async function handleVideoDownload(req, res) {
  const startTime = Date.now();
  try {
    console.log('[Video Download] ===== Download request received =====');
    console.log('[Video Download] Query params:', {
      download: req.query.download,
      hasVideoUrl: !!req.query.videoUrl,
      hasVideoUrlB64: !!req.query.videoUrlB64,
      videoUrlLength: req.query.videoUrl ? req.query.videoUrl.length : 0,
      videoUrlB64Length: req.query.videoUrlB64 ? req.query.videoUrlB64.length : 0,
      hasFilename: !!req.query.filename,
      filename: req.query.filename
    });
    
    // Support both base64 encoded (for signed URLs) and regular encoding
    let videoUrl;
    if (req.query.videoUrlB64) {
      // Decode base64-encoded URL (preserves signed URL signature exactly)
      try {
        videoUrl = decodeURIComponent(escape(atob(req.query.videoUrlB64)));
        console.log('[Video Download] Using base64-encoded URL');
      } catch (b64Error) {
        console.error('[Video Download] Base64 decode failed:', b64Error);
        return res.status(400).json({ error: 'Invalid base64 URL encoding' });
      }
    } else if (req.query.videoUrl) {
      // Fallback to regular URL encoding
      videoUrl = decodeURIComponent(req.query.videoUrl);
      console.log('[Video Download] Using regular URL encoding');
    } else {
      return res.status(400).json({ error: 'videoUrl or videoUrlB64 parameter required' });
    }
    
    const filename = req.query.filename ? decodeURIComponent(req.query.filename) : 'video.mp4';
    
    console.log('[Video Download] Decoded video URL length:', videoUrl.length);
    console.log('[Video Download] Video URL (first 150 chars):', videoUrl.substring(0, 150));
    console.log('[Video Download] Video URL (last 50 chars):', videoUrl.substring(videoUrl.length - 50));
    console.log('[Video Download] Filename:', filename);
    
    // Try to extract storage path from signed URL and use Admin SDK directly
    // This is more reliable than fetching the signed URL
    let videoBuffer;
    let useDirectFetch = true;
    
    try {
      // Extract storage path from signed URL
      // Format: https://storage.googleapis.com/BUCKET/PATH?GoogleAccessId=...&Expires=...&Signature=...
      // Or: https://BUCKET.storage.googleapis.com/PATH?...
      let bucketName, storagePath;
      
      // Try standard format first
      let urlMatch = videoUrl.match(/https:\/\/storage\.googleapis\.com\/([^\/]+)\/(.+?)(\?|$)/);
      if (urlMatch) {
        bucketName = urlMatch[1];
        storagePath = decodeURIComponent(urlMatch[2]);
      } else {
        // Try alternate format: https://BUCKET.storage.googleapis.com/PATH
        urlMatch = videoUrl.match(/https:\/\/([^\/]+)\.storage\.googleapis\.com\/(.+?)(\?|$)/);
        if (urlMatch) {
          bucketName = urlMatch[1];
          storagePath = decodeURIComponent(urlMatch[2]);
        }
      }
      
      if (bucketName && storagePath) {
        console.log('[Video Download] Extracted bucket:', bucketName);
        console.log('[Video Download] Extracted storage path:', storagePath);
        
        // Use Firebase Admin SDK to download directly (more reliable, no signature issues)
        initializeFirebaseAdmin();
        const storage = getStorage();
        // Use the bucket from storage (works with any bucket name format)
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(storagePath);
        
        console.log('[Video Download] Downloading directly from Firebase Storage using Admin SDK...');
        const downloadStart = Date.now();
        
        // Download file as buffer using Admin SDK
        const [fileBuffer] = await file.download();
        const downloadTime = Date.now() - downloadStart;
        
        console.log('[Video Download] Direct download completed in', downloadTime, 'ms');
        console.log('[Video Download] File buffer size:', fileBuffer.length, 'bytes');
        
        videoBuffer = fileBuffer;
        useDirectFetch = false;
      }
    } catch (adminError) {
      console.warn('[Video Download] Admin SDK download failed, falling back to fetch:', adminError.message);
      useDirectFetch = true;
    }
    
    // Fallback: Fetch video from signed URL if Admin SDK failed
    if (useDirectFetch) {
      console.log('[Video Download] Starting fetch from Firebase Storage signed URL...');
      const fetchStart = Date.now();
      const response = await fetch(videoUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const fetchTime = Date.now() - fetchStart;
    
      console.log('[Video Download] Fetch completed in', fetchTime, 'ms');
      console.log('[Video Download] Response status:', response.status, response.statusText);
      console.log('[Video Download] Response headers:', {
        'content-type': response.headers.get('content-type'),
        'content-length': response.headers.get('content-length'),
        'content-disposition': response.headers.get('content-disposition')
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[Video Download] Failed to fetch video:', response.status, response.statusText);
        console.error('[Video Download] Error response body:', errorText.substring(0, 500));
        return res.status(response.status).json({ 
          error: 'Failed to fetch video', 
          status: response.status,
          statusText: response.statusText
        });
      }
      
      console.log('[Video Download] Converting response to array buffer...');
      const bufferStart = Date.now();
      videoBuffer = await response.arrayBuffer();
      const bufferTime = Date.now() - bufferStart;
      console.log('[Video Download] Buffer conversion completed in', bufferTime, 'ms');
      console.log('[Video Download] Video buffer size:', videoBuffer.byteLength, 'bytes (', (videoBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB)');
    }
    
    // videoBuffer is now set (either from Admin SDK or fetch)
    if (!videoBuffer) {
      console.error('[Video Download] No video buffer obtained');
      return res.status(500).json({ error: 'Failed to obtain video data' });
    }
    
    // Convert to Buffer if needed
    const finalBuffer = Buffer.isBuffer(videoBuffer) ? videoBuffer : Buffer.from(videoBuffer);
    console.log('[Video Download] Final buffer size:', finalBuffer.length, 'bytes');
    
    // Set download headers
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', finalBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    
    console.log('[Video Download] Sending video buffer to client...');
    const sendStart = Date.now();
    // Send video buffer
    res.send(finalBuffer);
    const sendTime = Date.now() - sendStart;
    const totalTime = Date.now() - startTime;
    
    console.log('[Video Download] Video sent successfully');
    console.log('[Video Download] Send time:', sendTime, 'ms');
    console.log('[Video Download] Total request time:', totalTime, 'ms');
    console.log('[Video Download] ===== Download request completed =====');
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[Video Download] ===== Download request failed =====');
    console.error('[Video Download] Error name:', error.name);
    console.error('[Video Download] Error message:', error.message);
    console.error('[Video Download] Error stack:', error.stack);
    console.error('[Video Download] Total time before error:', totalTime, 'ms');
    return res.status(500).json({ 
      error: 'Download failed', 
      message: error.message,
      name: error.name
    });
  }
}

/**
 * Handle video status request for a specific job
 */
async function handleVideoStatus(req, res, jobId) {
  try {
    // Initialize Firebase Admin and Firestore
    initializeFirebaseAdmin();
    const db = getFirestore();

    // Try to get job document by jobId first
    let jobDoc = await db.collection('videoJobs').doc(jobId).get();
    
    // If not found, try querying by jobId field (in case document ID is different)
    if (!jobDoc.exists) {
      console.log(`[Video Status] Document ${jobId} not found, querying by jobId field...`);
      const querySnapshot = await db.collection('videoJobs')
        .where('jobId', '==', jobId)
        .limit(1)
        .get();
      
      if (!querySnapshot.empty) {
        jobDoc = querySnapshot.docs[0];
        console.log(`[Video Status] Found job by jobId field, document ID: ${jobDoc.id}`);
      }
    }

    if (!jobDoc.exists) {
      return res.status(404).json({ 
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`
      });
    }

    const jobData = jobDoc.data();
    
    // Handle both old structure (status in metadata) and new structure (status at root)
    const status = jobData.status || jobData.metadata?.status || 'pending';
    
    // Handle videoUrl in both root and metadata (for backwards compatibility)
    const videoUrl = jobData.videoUrl || jobData.metadata?.videoUrl || null;
    
    console.log(`[Video Status] Job ${jobId} status: ${status}, videoUrl: ${videoUrl ? 'exists' : 'null'}`);

    // Return job status
    return res.status(200).json({
      success: true,
      jobId,
      status: status,
      artist: jobData.artist,
      duration: jobData.duration,
      videoUrl: videoUrl,
      error: jobData.error || null,
      createdAt: jobData.createdAt?.toDate?.()?.toISOString() || jobData.createdAt,
      completedAt: jobData.completedAt?.toDate?.()?.toISOString() || jobData.completedAt,
      metadata: jobData.metadata || {}
    });

  } catch (error) {
    console.error('[Video Status] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to get job status',
      message: error.message 
    });
  }
}

