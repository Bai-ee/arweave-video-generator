/**
 * Firebase Admin SDK Setup for Railway Worker
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
    // Initialize with service account credentials from environment
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      });
    } else if (process.env.FIREBASE_PROJECT_ID) {
      // Alternative: Initialize with individual env vars
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      });
    } else {
      throw new Error('Firebase credentials not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_PROJECT_ID');
    }

    firebaseAdminInitialized = true;
    console.log('✅ Firebase Admin initialized for worker');
    return admin;
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    throw error;
  }
}

export function getFirestore() {
  const admin = initializeFirebaseAdmin();
  return admin.firestore();
}

export function getStorage() {
  const admin = initializeFirebaseAdmin();
  return admin.storage();
}

export { admin };

