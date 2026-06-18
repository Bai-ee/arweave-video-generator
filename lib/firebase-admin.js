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
      // Keep this logic in sync with worker/firebase-admin.js to avoid surprise parse errors.
      // vercel env pull wraps the JSON in outer quotes and dotenv converts \n → actual newlines.
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
      // Re-escape actual newlines dotenv may have unescaped inside string values.
      raw = raw.replace(/\n/g, '\\n');
      const serviceAccount = JSON.parse(raw);

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
