/**
 * Vercel Serverless Function: Get Artists Endpoint
 * GET /api/artists
 * 
 * Returns list of available artists for video generation
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    // Check if requesting a specific artist's mixes
    const artistName = req.query.artist;
    const includeMixes = req.query.includeMixes === 'true' || artistName;

    // Try to load from Firebase first
    let artistsData = null;
    
    try {
      initializeFirebaseAdmin();
      const db = getFirestore();
      const artistsRef = db.collection('system').doc('artists');
      const artistsDoc = await artistsRef.get();
      
      if (artistsDoc.exists) {
        const data = artistsDoc.data();
        if (data.artists && Array.isArray(data.artists) && data.artists.length > 0) {
          artistsData = data.artists;
          console.log(`[Artists] Loaded ${artistsData.length} artists from Firebase`);
        }
      }
    } catch (firebaseError) {
      console.warn('[Artists] Firebase load failed, trying local files:', firebaseError.message);
    }

    // Fallback to local files if Firebase didn't work
    if (!artistsData || artistsData.length === 0) {
      const artistsPaths = [
        path.join(process.cwd(), 'worker', 'data', 'sample-artists.json'),
        path.join(process.cwd(), 'data', 'sample-artists.json'),
        path.join(__dirname, '..', 'worker', 'data', 'sample-artists.json'),
        path.join(__dirname, '..', 'data', 'sample-artists.json')
      ];

      for (const artistsPath of artistsPaths) {
        try {
          if (fs.existsSync(artistsPath)) {
            const fileContent = fs.readFileSync(artistsPath, 'utf-8');
            artistsData = JSON.parse(fileContent);
            console.log(`[Artists] Loaded ${artistsData.length} artists from ${artistsPath}`);
            break;
          }
        } catch (error) {
          console.warn(`[Artists] Failed to load from ${artistsPath}:`, error.message);
          continue;
        }
      }
    }

    if (!artistsData || artistsData.length === 0) {
      return res.status(200).json({
        success: true,
        artists: [],
        message: 'No artists data available'
      });
    }

    // If requesting a specific artist's mixes
    if (artistName) {
      const normalizedSearch = artistName.toLowerCase();
      const artist = artistsData.find(a => {
        const normalizedName = a.artistName.toLowerCase();
        return normalizedName === normalizedSearch || 
               normalizedName.includes(normalizedSearch) || 
               normalizedSearch.includes(normalizedName);
      });

      if (!artist) {
        return res.status(404).json({
          success: false,
          error: `Artist "${artistName}" not found`
        });
      }

      // Filter mixes with valid Arweave URLs
      const validMixes = (artist.mixes || []).filter(mix => 
        mix.mixArweaveURL && 
        mix.mixArweaveURL.startsWith('http') && 
        mix.mixArweaveURL.includes('arweave.net')
      );

      return res.status(200).json({
        success: true,
        artist: {
          name: artist.artistName,
          genre: artist.artistGenre || 'Electronic',
          mixCount: validMixes.length
        },
        mixes: validMixes.map(mix => ({
          title: mix.mixTitle,
          arweaveURL: mix.mixArweaveURL,
          dateYear: mix.mixDateYear || '',
          duration: mix.mixDuration || ''
        })),
        count: validMixes.length
      });
    }

    // Extract artist names and genres (default behavior)
    const artists = artistsData.map(artist => ({
      name: artist.artistName,
      genre: artist.artistGenre || 'Electronic',
      mixCount: artist.mixes ? artist.mixes.length : 0,
      trackCount: artist.trax ? artist.trax.length : 0
    }));

    return res.status(200).json({
      success: true,
      artists: artists,
      count: artists.length
    });

  } catch (error) {
    console.error('[Artists] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to load artists',
      message: error.message 
    });
  }
}



