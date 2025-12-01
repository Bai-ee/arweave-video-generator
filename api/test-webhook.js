/**
 * Test endpoint to verify webhook configuration
 * GET /api/test-webhook
 */

import axios from 'axios';

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

  const results = {
    githubToken: !!process.env.GITHUB_TOKEN,
    githubRepo: process.env.GITHUB_REPO || 'NOT SET',
    testResult: null,
    error: null
  };

  // Test the webhook
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
    try {
      const [owner, repo] = process.env.GITHUB_REPO.split('/');
      const githubApiUrl = `https://api.github.com/repos/${owner}/${repo}/dispatches`;
      
      const response = await axios.post(githubApiUrl, {
        event_type: 'process-video-job',
        client_payload: {
          test: true,
          timestamp: new Date().toISOString()
        }
      }, {
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        }
      });
      
      results.testResult = 'SUCCESS';
      results.statusCode = response.status;
    } catch (error) {
      results.testResult = 'FAILED';
      results.error = error.response?.data?.message || error.message;
      results.statusCode = error.response?.status;
    }
  } else {
    results.testResult = 'SKIPPED';
    results.error = 'Missing GITHUB_TOKEN or GITHUB_REPO';
  }

  return res.status(200).json({
    success: true,
    config: results,
    message: 'Check the results above to verify webhook setup'
  });
}

