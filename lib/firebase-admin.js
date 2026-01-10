/**
 * Firebase Admin SDK Initialization
 * Used by Vercel API functions and GitHub Actions worker
 */

import admin from 'firebase-admin';

let firebaseAdminInitialized = false;

export function initializeFirebaseAdmin() {
  if (firebaseAdminInitialized) {
    return admin;
  }

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      } catch (e) {
        console.warn('[Firebase Admin] First JSON parse attempt failed, trying cleanup...');
        // Robust JSON parsing for service account key
        let cleanedKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        
        // Remove outer quotes if present
        if (cleanedKey.startsWith('"') && cleanedKey.endsWith('"')) {
          cleanedKey = cleanedKey.slice(1, -1);
        } else if (cleanedKey.startsWith("'") && cleanedKey.endsWith("'")) {
          cleanedKey = cleanedKey.slice(1, -1);
        }
        
        // Unescape characters
        cleanedKey = cleanedKey
          .replace(/\\n/g, '\n')
          .replace(/\\"/g, '"')
          .replace(/\\'/g, "'")
          .replace(/\\\\/g, '\\');
        
        try {
          serviceAccount = JSON.parse(cleanedKey);
          console.log('[Firebase Admin] ✅ Service Account Key parsed after cleanup');
        } catch (cleanError) {
          throw new Error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY: ${e.message}. Cleaned attempt also failed: ${cleanError.message}`);
        }
      }
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'editvideos-63486.firebasestorage.app'
      });
    } else {
      throw new Error('Firebase credentials not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY');
    }

    firebaseAdminInitialized = true;
    console.log('✅ Firebase Admin initialized');
    return admin;
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    throw error;
  }
}

export function getFirestore() {
  if (!firebaseAdminInitialized) {
    initializeFirebaseAdmin();
  }
  return admin.firestore();
}

export function getStorage() {
  if (!firebaseAdminInitialized) {
    initializeFirebaseAdmin();
  }
  return admin.storage();
}

export { admin };


