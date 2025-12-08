/**
 * One-time endpoint to upload complete artists JSON to Firebase
 * DELETE THIS FILE AFTER USE
 */

import fs from 'fs-extra';
import path from 'path';
import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Upload Artists] Starting upload...');
    
    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();
    
    // Read the complete artists JSON
    const jsonPath = path.join(process.cwd(), 'COMPLETE_ARTISTS_JSON.json');
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ 
        success: false,
        error: `JSON file not found: ${jsonPath}` 
      });
    }
    
    const artistsData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`[Upload Artists] Loaded ${artistsData.length} artists`);
    
    // Upload to Firebase
    const artistsRef = db.collection('system').doc('artists');
    await artistsRef.set({ artists: artistsData }, { merge: false });
    
    console.log(`[Upload Artists] ✅ Successfully uploaded ${artistsData.length} artists to Firebase!`);
    
    // Verify
    const verifyDoc = await artistsRef.get();
    let verifyCount = 0;
    if (verifyDoc.exists) {
      const verifyData = verifyDoc.data();
      verifyCount = verifyData.artists ? verifyData.artists.length : 0;
    }
    
    return res.status(200).json({
      success: true,
      message: `Successfully uploaded ${artistsData.length} artists to Firebase`,
      artistsCount: artistsData.length,
      verifiedCount: verifyCount
    });

  } catch (error) {
    console.error('[Upload Artists] ❌ Error:', error.message);
    console.error(error.stack);
    return res.status(500).json({ 
      success: false,
      error: 'Upload failed',
      message: error.message 
    });
  }
}

