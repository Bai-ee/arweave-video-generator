/**
 * API endpoint to migrate image URLs in Firebase
 * POST /api/migrate-image-urls
 * 
 * Updates Firebase artists collection with Arweave image URLs
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

// Image mapping - existing images from original manifest + newly uploaded
const IMAGE_MAPPING = {
  // Existing in original manifest
  "img/artists/acidman.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/acidman.jpg", source: "original-manifest" },
  "img/artists/akila.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/akila.jpg", source: "original-manifest" },
  "img/artists/andrew_emil.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/andrew_emil.jpg", source: "original-manifest" },
  "img/artists/bai-ee2.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/bai-ee2.jpg", source: "original-manifest" },
  "img/artists/cesarramirez.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/cesarramirez.jpg", source: "original-manifest" },
  "img/artists/sassmouth.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/sassmouth.jpg", source: "original-manifest" },
  "img/artists/sean_smith.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/sean_smith.jpg", source: "original-manifest" },
  "img/artists/tyrelwilliams.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/tyrelwilliams.jpg", source: "original-manifest" },
  "img/covers/acidtest.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/covers/acidtest.jpg", source: "original-manifest" },
  "img/covers/letyourselfgo.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/covers/letyourselfgo.jpg", source: "original-manifest" },
  "img/covers/loftlivin.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/covers/loftlivin.jpg", source: "original-manifest" },
  "img/covers/lovemanifesto.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/covers/lovemanifesto.jpg", source: "original-manifest" },
  "img/covers/lovemanifesto2.jpg": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/covers/lovemanifesto2.jpg", source: "original-manifest" },
  "img/loge_horiz.png": { arweaveUrl: "https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/loge_horiz.png", source: "original-manifest" },
  
  // Newly uploaded images
  "img/artists/JoshZ_B2B_Baiee.png": { arweaveUrl: "https://arweave.net/vnmSmKghjAhsYxACdMHRBN-n1usjcHGVDCbrmXTUom8", source: "uploaded" },
  "img/artists/ike.jpg": { arweaveUrl: "https://arweave.net/iooeHM6ipGw_iUvx6_rlFZnjl3XkprLX1v_VmMogOHU", source: "uploaded" },
  "img/artists/josh_zeitler.png": { arweaveUrl: "https://arweave.net/D7QsuJ9bl4ze6ci6kOctGBm8F0joW9uUXb4YWg96N1c", source: "uploaded" },
  "img/artists/js.jpg": { arweaveUrl: "https://arweave.net/jTID0iQiLffUIft9t4aRnXANGMi_0xKoNso_4wwbhcc", source: "uploaded" },
  "img/artists/lorelei.png": { arweaveUrl: "https://arweave.net/H7w1srzoay7y9bPmBXjJL6FPEmgY98CbfMFkCrgK8m0", source: "uploaded" },
  "img/artists/redeye.png": { arweaveUrl: "https://arweave.net/n_UpDMJVzl1EreTTlb4-lubx_aDtOsidIC2KmqcPeJk", source: "uploaded" },
  "img/artists/startraxxthumb.jpg": { arweaveUrl: "https://arweave.net/_RZiEh4ns9t2kqWwYLg4cjaUz3MFiP1uUhlEY-frQYc", source: "uploaded" },
  "img/artists/vivaacid.png": { arweaveUrl: "https://arweave.net/anRQF_s1AwqnNpChVgfwAzzxnLGwIIKb4JAHF8jigX4", source: "uploaded" },
  "img/artists/vivaacid_podlasie_71825.png": { arweaveUrl: "https://arweave.net/OGIxa5jdy-k9FaQkLTEdAUjsCsq0Orb9XB8roeW4N7w", source: "uploaded" },
  "img/bai_ee_closing_partyVAjpg.jpg": { arweaveUrl: "https://arweave.net/uqBNvxk9bd-LETdZOD_O-QaKPiP6TYWi-9aP1zQZ4nY", source: "uploaded" },
  "img/covers/andrewb2bredeye.png": { arweaveUrl: "https://arweave.net/xuaroc0oIIAuIuokRn3LJwg0a-UgpVLtv-jcKm1NS18", source: "uploaded" },
  "img/covers/andrewemilflammable.png": { arweaveUrl: "https://arweave.net/ADJklMqtq8c_YoKnyYZ2JHBfWrsZTkjDgQZ-4KuywGg", source: "uploaded" },
  "img/roughtimes.jpg": { arweaveUrl: "https://arweave.net/OsLJiW54iwyNfzAcR6w0pGd9pTcYn5rd3NA10cVFFYU", source: "uploaded" }
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    console.log('[Migrate Image URLs] Starting migration...');
    
    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();
    
    // Get artists from Firebase (stored as system/artists document)
    const artistsRef = db.collection('system').doc('artists');
    const artistsDoc = await artistsRef.get();
    
    if (!artistsDoc.exists) {
      return res.status(404).json({ success: false, error: 'Artists document not found' });
    }
    
    const data = artistsDoc.data();
    const artists = data.artists || [];
    
    console.log(`[Migrate Image URLs] Found ${artists.length} artists`);
    
    let updatedCount = 0;
    const updates = [];
    
    const updatedArtists = artists.map(artist => {
      let artistUpdated = false;
      const updatedArtist = { ...artist };
      
      // Check artist image
      const artistImg = artist.artistImageFilename;
      if (artistImg && !artistImg.startsWith('http')) {
        const mapping = IMAGE_MAPPING[artistImg];
        if (mapping) {
          updatedArtist.artistImageFilename = mapping.arweaveUrl;
          artistUpdated = true;
          updates.push({ artist: artist.artistName, field: 'artistImage', from: artistImg, to: mapping.arweaveUrl });
        }
      }
      
      // Check mix images
      if (artist.mixes && Array.isArray(artist.mixes)) {
        updatedArtist.mixes = artist.mixes.map(mix => {
          const mixImg = mix.mixImageFilename;
          if (mixImg && !mixImg.startsWith('http')) {
            const mapping = IMAGE_MAPPING[mixImg];
            if (mapping) {
              artistUpdated = true;
              updates.push({ artist: artist.artistName, mix: mix.mixTitle, field: 'mixImage', from: mixImg, to: mapping.arweaveUrl });
              return { ...mix, mixImageFilename: mapping.arweaveUrl };
            }
          }
          return mix;
        });
      }
      
      if (artistUpdated) {
        updatedCount++;
        console.log(`[Migrate Image URLs] Updated: ${artist.artistName}`);
      }
      
      return updatedArtist;
    });
    
    // Save updated artists back to Firebase
    await artistsRef.update({ artists: updatedArtists });
    
    // Save the mapping to Firebase for future reference
    const mappingRef = db.collection('system').doc('image-asset-mapping');
    await mappingRef.set({
      mapping: IMAGE_MAPPING,
      lastUpdated: new Date().toISOString(),
      totalImages: Object.keys(IMAGE_MAPPING).length,
      version: 'v1'
    });
    
    console.log(`[Migrate Image URLs] ✅ Migration complete`);
    
    return res.status(200).json({
      success: true,
      message: 'Image URL migration complete',
      stats: {
        totalArtists: artists.length,
        artistsUpdated: updatedCount,
        totalUpdates: updates.length,
        imagesInMapping: Object.keys(IMAGE_MAPPING).length
      },
      updates: updates
    });
    
  } catch (error) {
    console.error('[Migrate Image URLs] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
