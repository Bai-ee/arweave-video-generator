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
    const selectedFolders = req.body.selectedFolders || []; // Array of selected folder names (normalized, without assets/ prefix)
    const enableOverlay = req.body.enableOverlay !== undefined ? req.body.enableOverlay : true; // Overlay feature toggle (default: true)

    // Validate selectedFolders
    if (!Array.isArray(selectedFolders)) {
      return res.status(400).json({
        success: false,
        error: 'selectedFolders must be an array'
      });
    }

    // Validate at least one folder is selected
    if (selectedFolders.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one folder must be selected'
      });
    }

    // Normalize folder names (remove assets/ prefix, lowercase, trim)
    const normalizedFolders = selectedFolders.map(f => {
      const normalized = f.toString().toLowerCase().trim().replace(/^assets\//, '');
      return normalized;
    });

    // Exclude folders that should never be used for video generation
    const excludedFolders = ['logos', 'paper_backgrounds', 'mixes/baiee', 'mixes', 'baiee'];
    const invalidFolders = normalizedFolders.filter(f => {
      // Check if folder is in excluded list or contains excluded terms
      return excludedFolders.some(excluded => 
        f === excluded || f.includes(excluded) || excluded.includes(f)
      );
    });
    
    if (invalidFolders.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid folder names: ${invalidFolders.join(', ')}. These folders are reserved for internal use only.`
      });
    }

    // Validate folder names are not empty and contain valid characters
    const emptyOrInvalid = normalizedFolders.filter(f => {
      return !f || f.length === 0 || /[^a-z0-9_\-/]/.test(f);
    });
    
    if (emptyOrInvalid.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid folder name format: ${emptyOrInvalid.join(', ')}. Folder names can only contain lowercase letters, numbers, hyphens, underscores, and forward slashes.`
      });
    }

    console.log(`[Generate Video] Validated ${normalizedFolders.length} folder(s): [${normalizedFolders.join(', ')}]`);

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
      enableOverlay: enableOverlay, // Overlay feature toggle
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
    
    // Verify job was created
    const createdJob = await db.collection('videoJobs').doc(jobId).get();
    if (!createdJob.exists) {
      throw new Error('Failed to create job in Firestore');
    }
    
    console.log(`[Generate Video] ✅ Job created and verified in Firestore: ${jobId}`);
    console.log(`[Generate Video] Job status: ${createdJob.data().status}`);

    // Trigger GitHub Actions workflow immediately via webhook
    try {
      if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
        const [owner, repo] = process.env.GITHUB_REPO.split('/');
        const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
        
        console.log(`[Generate Video] Triggering GitHub Actions webhook for job: ${jobId}`);
        console.log(`[Generate Video] Repo: ${owner}/${repo}, URL: ${githubApiUrl}`);
        
        const webhookResponse = await axios.post(githubApiUrl, {
          event_type: 'process-video-job',
          client_payload: {
            jobId: jobId,
            timestamp: new Date().toISOString()
          }
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`[Generate Video] ✅ GitHub Actions workflow triggered successfully for job: ${jobId}`);
        console.log(`[Generate Video] Webhook response status: ${webhookResponse.status}`);
      } else {
        console.error('[Generate Video] ❌ GitHub token not configured!');
        console.error(`[Generate Video] GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? 'SET' : 'MISSING'}`);
        console.error(`[Generate Video] GITHUB_REPO: ${process.env.GITHUB_REPO || 'MISSING'}`);
        console.warn('[Generate Video] Workflow will only run on schedule (every minute)');
      }
    } catch (webhookError) {
      // Log full error details for debugging
      console.error('[Generate Video] ❌ Failed to trigger webhook:', webhookError.message);
      if (webhookError.response) {
        console.error('[Generate Video] Response status:', webhookError.response.status);
        console.error('[Generate Video] Response data:', JSON.stringify(webhookError.response.data, null, 2));
      }
      console.warn('[Generate Video] Job will be processed by scheduled run (every minute)');
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


