/**
 * Vercel Serverless Function: Generate Video Endpoint
 * POST /api/generate-video
 * 
 * Creates a video generation job and returns immediately (async processing)
 */

import { initializeFirebaseAdmin, getFirestore, admin } from '../lib/firebase-admin.js';
import { v4 as uuidv4 } from 'uuid';

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

  try {
    // Default to 30 seconds, random artist (MVP simplification)
    const duration = 30;
    const artist = 'random'; // Always random for MVP

    // Generate unique job ID
    const jobId = uuidv4();

    // Initialize Firebase Admin and Firestore
    initializeFirebaseAdmin();
    const db = getFirestore();

    // Create job document in Firestore
    // Use Firestore Timestamp for proper date handling
    // Note: status is at root level (not in metadata) for easier querying
    const jobData = {
      jobId,
      status: 'pending', // Root level for easy querying
      artist,
      duration,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      completedAt: null,
      videoUrl: null,
      error: null,
      metadata: {
        fileName: null,
        fileSize: null,
        mixTitle: null
      }
    };

    // Save to Firestore
    await db.collection('videoJobs').doc(jobId).set(jobData);

    console.log(`[Generate Video] Job created: ${jobId}`);

    // Return immediately with job ID
    return res.status(200).json({
      success: true,
      jobId,
      status: 'pending',
      message: 'Video generation job created. Processing will begin shortly.',
      estimatedTime: '10-20 seconds'
    });

  } catch (error) {
    console.error('[Generate Video] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to create video generation job',
      message: error.message 
    });
  }
}

