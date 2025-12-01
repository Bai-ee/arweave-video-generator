/**
 * Vercel Serverless Function: Videos List Endpoint
 * GET /api/videos
 * 
 * Returns list of all completed videos
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
        completedAt: data.completedAt?.toDate?.()?.toISOString() || data.completedAt || null
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

