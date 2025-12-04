/**
 * API endpoint to get archive job status
 * Tracks upload progress and confirmation status
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    initializeFirebaseAdmin();
    const db = getFirestore();

    if (req.method === 'GET') {
      // Get single job status
      const { jobId } = req.query;

      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: 'jobId is required'
        });
      }

      const jobRef = db.collection('archiveJobs').doc(jobId);
      const jobDoc = await jobRef.get();

      if (!jobDoc.exists) {
        return res.status(404).json({
          success: false,
          error: 'Job not found'
        });
      }

      const jobData = jobDoc.data();
      return res.status(200).json({
        success: true,
        job: {
          id: jobId,
          ...jobData
        }
      });

    } else if (req.method === 'POST') {
      // Get multiple job statuses
      const { jobIds } = req.body;

      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'jobIds array is required'
        });
      }

      // Fetch all jobs
      const jobs = await Promise.all(
        jobIds.map(async (jobId) => {
          const jobRef = db.collection('archiveJobs').doc(jobId);
          const jobDoc = await jobRef.get();

          if (jobDoc.exists) {
            return {
              id: jobId,
              ...jobDoc.data()
            };
          }
          return null;
        })
      );

      const validJobs = jobs.filter(job => job !== null);

      return res.status(200).json({
        success: true,
        jobs: validJobs,
        count: validJobs.length
      });
    }

  } catch (error) {
    console.error('[ArchiveStatus] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get archive status'
    });
  }
}


