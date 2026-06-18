/**
 * Firebase Admin SDK Initialization for Worker
 * Used by GitHub Actions worker
 */

import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

let firebaseAdminInitialized = false;

export function initializeFirebaseAdmin() {
  if (firebaseAdminInitialized) {
    return admin;
  }

  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      let raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
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




