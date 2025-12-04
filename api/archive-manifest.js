/**
 * API endpoint to get and update archive manifest
 * Master JSON of all archived files with Arweave URLs
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
    const manifestRef = db.collection('archiveManifest').doc('main');

    if (req.method === 'GET') {
      // Get manifest
      const manifestDoc = await manifestRef.get();

      if (!manifestDoc.exists) {
        // Return empty manifest structure
        return res.status(200).json({
          success: true,
          manifest: {
            version: '1.0.0',
            lastUpdated: null,
            folders: {}
          }
        });
      }

      const manifest = manifestDoc.data();

      // Optionally filter by folder
      const { folder } = req.query;
      if (folder && manifest.folders) {
        return res.status(200).json({
          success: true,
          manifest: {
            version: manifest.version || '1.0.0',
            lastUpdated: manifest.lastUpdated,
            folders: {
              [folder]: manifest.folders[folder] || { files: [] }
            }
          }
        });
      }

      return res.status(200).json({
        success: true,
        manifest: manifest
      });

    } else if (req.method === 'POST') {
      // Update manifest (used internally, but exposed for manual updates)
      const { manifest } = req.body;

      if (!manifest) {
        return res.status(400).json({
          success: false,
          error: 'Manifest data is required'
        });
      }

      // Ensure required structure
      const updatedManifest = {
        version: manifest.version || '1.0.0',
        lastUpdated: new Date().toISOString(),
        folders: manifest.folders || {}
      };

      await manifestRef.set(updatedManifest);

      return res.status(200).json({
        success: true,
        manifest: updatedManifest
      });
    }

  } catch (error) {
    console.error('[ArchiveManifest] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to get/update archive manifest'
    });
  }
}


