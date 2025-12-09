/**
 * Redirect endpoint for custom domain
 * Points to the latest deployed manifest on Arweave
 * 
 * This allows undergroundexistence.info to always point to the latest deployment
 * by reading the manifest transaction ID from Firebase and redirecting to it
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  try {
    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();
    
    // Get the latest manifest transaction ID from Firebase
    const manifestRef = db.collection('system').doc('deployment-manifest');
    const manifestDoc = await manifestRef.get();
    
    if (!manifestDoc.exists) {
      return res.status(404).json({
        error: 'No deployment found',
        message: 'No website has been deployed yet. Please deploy the website first.'
      });
    }
    
    const manifestData = manifestDoc.data();
    const manifestId = manifestData.manifestTransactionId;
    
    if (!manifestId) {
      return res.status(404).json({
        error: 'Manifest ID not found',
        message: 'Deployment manifest exists but no transaction ID found. Please redeploy the website.'
      });
    }
    
    // Get the requested path (default to index.html)
    const requestedPath = req.query.path || 'index.html';
    
    // Construct the Arweave URL
    // For manifest-hosted sites, use the manifest ID with the path
    const arweaveUrl = `https://arweave.net/${manifestId}/${requestedPath}`;
    
    // Alternative: Use ar.io or arweave.dev gateways
    // const arweaveUrl = `https://ar-io.dev/${manifestId}/${requestedPath}`;
    
    console.log(`[Redirect] Redirecting to latest manifest: ${manifestId}`);
    console.log(`[Redirect] Requested path: ${requestedPath}`);
    console.log(`[Redirect] Full URL: ${arweaveUrl}`);
    
    // Perform 302 redirect to the latest Arweave manifest
    res.redirect(302, arweaveUrl);
    
  } catch (error) {
    console.error('[Redirect] Error:', error.message);
    console.error('[Redirect] Stack:', error.stack);
    
    // Return error response instead of redirecting to avoid infinite loops
    return res.status(500).json({
      error: 'Redirect failed',
      message: error.message || 'Failed to get latest deployment',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
