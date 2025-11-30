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

    const videos = [];

    // Get from videoJobs collection (primary source)
    try {
      const jobsSnapshot = await db.collection('videoJobs')
        .where('status', '==', 'completed')
        .orderBy('completedAt', 'desc')
        .limit(limit)
        .get();

      jobsSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.videoUrl) {
          videos.push({
            videoId: doc.id,
            jobId: data.jobId || doc.id,
            artist: data.artist || 'Unknown',
            mixTitle: data.metadata?.mixTitle || null,
            duration: data.duration || 30,
            fileSize: data.metadata?.fileSize || null,
            videoUrl: data.videoUrl,
            status: 'completed',
            createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString()
          });
        }
      });
    } catch (jobsError) {
      // If query fails (e.g., missing index), try without orderBy
      console.warn('[Videos] Jobs query with orderBy failed, trying without:', jobsError.message);
      try {
        const jobsSnapshot = await db.collection('videoJobs')
          .where('status', '==', 'completed')
          .limit(limit)
          .get();

        jobsSnapshot.forEach(doc => {
          const data = doc.data();
          if (data.videoUrl) {
            videos.push({
              videoId: doc.id,
              jobId: data.jobId || doc.id,
              artist: data.artist || 'Unknown',
              mixTitle: data.metadata?.mixTitle || null,
              duration: data.duration || 30,
              fileSize: data.metadata?.fileSize || null,
              videoUrl: data.videoUrl,
              status: 'completed',
              createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString()
            });
          }
        });
      } catch (fallbackError) {
        console.warn('[Videos] Fallback query also failed:', fallbackError.message);
      }
    }

    // Also try videos collection (if it exists)
    try {
      const videosSnapshot = await db.collection('videos')
        .where('status', '==', 'completed')
        .limit(limit)
        .get();

      videosSnapshot.forEach(doc => {
        const data = doc.data();
        videos.push({
          videoId: doc.id,
          jobId: data.jobId || doc.id,
          artist: data.artist || 'Unknown',
          mixTitle: data.mixTitle || null,
          duration: data.duration || 30,
          fileSize: data.fileSize || null,
          videoUrl: data.videoUrl,
          status: 'completed',
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString()
        });
      });
    } catch (videosError) {
      // Videos collection might not exist yet, that's okay
      console.warn('[Videos] Videos collection query failed (may not exist yet):', videosError.message);
    }

    // Remove duplicates and sort by creation date
    const uniqueVideos = videos.filter((video, index, self) =>
      index === self.findIndex(v => v.videoId === video.videoId)
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

