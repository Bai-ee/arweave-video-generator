/**
 * Vercel Serverless Function: Video Status Endpoint
 * GET /api/video-status/:jobId
 * 
 * Returns the current status of a video generation job
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
    // Get jobId from query parameter or path
    const jobId = req.query.jobId || req.url.split('/').pop();

    if (!jobId) {
      return res.status(400).json({ 
        error: 'Job ID is required',
        message: 'Provide jobId as query parameter or in URL path'
      });
    }

    // Initialize Firebase Admin and Firestore
    initializeFirebaseAdmin();
    const db = getFirestore();

    // Get job document
    const jobDoc = await db.collection('videoJobs').doc(jobId).get();

    if (!jobDoc.exists) {
      return res.status(404).json({ 
        error: 'Job not found',
        message: `No job found with ID: ${jobId}`
      });
    }

    const jobData = jobDoc.data();

    // Handle both old structure (status in metadata) and new structure (status at root)
    const status = jobData.status || jobData.metadata?.status || 'pending';

    // Return job status
    return res.status(200).json({
      success: true,
      jobId,
      status: status,
      artist: jobData.artist,
      duration: jobData.duration,
      videoUrl: jobData.videoUrl || null,
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

