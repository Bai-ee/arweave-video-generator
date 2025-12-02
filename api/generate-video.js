/**
 * Vercel Serverless Function: Generate Video Endpoint
 * POST /api/generate-video
 * 
 * Creates a video generation job and returns immediately (async processing)
 */

import { initializeFirebaseAdmin, getFirestore, admin } from '../lib/firebase-admin.js';
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

  try {
    // Get parameters from request body
    const duration = req.body.duration || 30;
    const artist = req.body.artist || 'random';
    const videoFilter = req.body.videoFilter || null; // Optional video filter
    const useTrax = req.body.useTrax === true; // true for tracks, false for mixes
    const filterIntensity = req.body.filterIntensity !== undefined ? parseFloat(req.body.filterIntensity) : 0.4; // Filter intensity 0.0-1.0 (default 0.4 = 40%)
    const selectedFolders = req.body.selectedFolders || []; // Array of selected folder names

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
      videoFilter: videoFilter, // Optional video filter key
      filterIntensity: filterIntensity, // Filter intensity 0.0-1.0
      useTrax: useTrax, // Flag to use tracks instead of mixes
      selectedFolders: selectedFolders, // Array of selected folder names
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

    // Trigger GitHub Actions workflow immediately via webhook
    try {
      if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
        const [owner, repo] = process.env.GITHUB_REPO.split('/');
        const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
        
        await axios.post(githubApiUrl, {
          event_type: 'process-video-job',
          client_payload: {
            jobId: jobId,
            timestamp: new Date().toISOString()
          }
        }, {
          headers: {
            'Authorization': `token ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`[Generate Video] GitHub Actions workflow triggered for job: ${jobId}`);
      } else {
        console.log('[Generate Video] GitHub token not configured - workflow will run on schedule');
      }
    } catch (webhookError) {
      // Don't fail the request if webhook fails - scheduled run will pick it up
      console.warn('[Generate Video] Failed to trigger webhook (will use scheduled run):', webhookError.message);
    }

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


