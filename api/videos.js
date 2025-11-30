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
    const orderBy = req.query.orderBy || 'createdAt';
    const orderDirection = req.query.orderDirection || 'desc';

    // Initialize Firebase Admin and Firestore
    initializeFirebaseAdmin();
    const db = getFirestore();

    // Get completed videos from Firestore
    let query = db.collection('videos')
      .where('status', '==', 'completed')
      .orderBy(orderBy, orderDirection)
      .limit(limit);

    const snapshot = await query.get();

    // Format videos for response
    const videos = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      videos.push({
        videoId: doc.id,
        jobId: data.jobId,
        artist: data.artist,
        mixTitle: data.mixTitle,
        duration: data.duration,
        fileSize: data.fileSize,
        videoUrl: data.videoUrl,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt
      });
    });

    // Also get from videoJobs collection (for backwards compatibility)
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
          artist: data.artist,
          mixTitle: data.metadata?.mixTitle,
          duration: data.duration,
          fileSize: data.metadata?.fileSize,
          videoUrl: data.videoUrl,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt
        });
      }
    });

    // Remove duplicates and sort
    const uniqueVideos = videos.filter((video, index, self) =>
      index === self.findIndex(v => v.videoId === video.videoId)
    ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({
      success: true,
      videos: uniqueVideos.slice(0, limit),
      count: uniqueVideos.length
    });

  } catch (error) {
    console.error('[Videos] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to get videos list',
      message: error.message 
    });
  }
}

