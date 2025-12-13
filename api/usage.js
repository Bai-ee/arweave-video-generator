/**
 * Combined API endpoint for Firebase usage statistics
 * Handles both Storage and Firestore usage tracking
 * 
 * Routes:
 * - GET /api/usage?type=storage - Storage usage
 * - GET /api/usage?type=firestore - Firestore usage
 * - GET /api/usage - Both (default)
 */

import { initializeFirebaseAdmin, getStorage, getFirestore } from '../lib/firebase-admin.js';

// Firebase free tier limits (Blaze plan)
const FREE_TIER_STORAGE_MB = 1024; // 1GB = 1024MB (Blaze plan free tier for storage)
const STORAGE_COST_PER_GB_MONTH = 0.026; // $0.026 per GB/month after free tier
const FREE_TIER_READS_PER_DAY = 50000; // 50K reads/day free
const FREE_TIER_WRITES_PER_DAY = 20000; // 20K writes/day free
const COST_PER_READ = 0.06 / 100000; // $0.06 per 100K reads
const COST_PER_WRITE = 0.18 / 100000; // $0.18 per 100K writes

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { type } = req.query || {};
  const includeStorage = !type || type === 'storage' || type === 'both';
  const includeFirestore = !type || type === 'firestore' || type === 'both';

  try {
    initializeFirebaseAdmin();
    
    const result = {
      success: true,
      storage: null,
      firestore: null
    };

    // Get Storage usage if requested
    if (includeStorage) {
      try {
        const storage = getStorage();
        const bucket = storage.bucket();
        const [files] = await bucket.getFiles();

        let totalSizeBytes = 0;
        files.forEach(file => {
          const size = parseInt(file.metadata.size || 0, 10);
          totalSizeBytes += size;
        });

        const totalSizeMB = totalSizeBytes / (1024 * 1024);
        const totalSizeGB = totalSizeMB / 1024;
        const storageOverFreeTierGB = Math.max(0, totalSizeGB - (FREE_TIER_STORAGE_MB / 1024));
        const estimatedStorageCost = storageOverFreeTierGB * STORAGE_COST_PER_GB_MONTH;
        const percentage = Math.min(100, (totalSizeMB / FREE_TIER_STORAGE_MB) * 100);

        const formatSize = (mb) => {
          if (mb < 1) return `${Math.round(mb * 100) / 100}MB`;
          if (mb < 1024) return `${Math.round(mb)}MB`;
          return `${(mb / 1024).toFixed(2)}GB`;
        };

        const formatCost = (cost) => {
          if (cost < 0.01) return '$0.00';
          return `$${cost.toFixed(2)}`;
        };

        result.storage = {
          usedMB: totalSizeMB,
          usedGB: totalSizeGB,
          limitMB: FREE_TIER_STORAGE_MB,
          usedBytes: totalSizeBytes,
          storageOverFreeTierGB: storageOverFreeTierGB,
          estimatedStorageCost: estimatedStorageCost,
          formatted: {
            used: formatSize(totalSizeMB),
            limit: formatSize(FREE_TIER_STORAGE_MB),
            display: `${Math.round(totalSizeMB)}/${FREE_TIER_STORAGE_MB}MB`,
            cost: formatCost(estimatedStorageCost)
          },
          percentage: percentage
        };
      } catch (error) {
        console.error('[Usage] Storage error:', error);
        result.storage = { error: error.message };
      }
    }

    // Get Firestore usage if requested
    if (includeFirestore) {
      try {
        const db = getFirestore();
        const collections = ['artists', 'videos', 'videoJobs'];
        let totalDocuments = 0;
        const collectionCounts = {};
        
        for (const collectionName of collections) {
          try {
            const snapshot = await db.collection(collectionName).count().get();
            const count = snapshot.data().count || 0;
            collectionCounts[collectionName] = count;
            totalDocuments += count;
          } catch (error) {
            console.warn(`[Usage] Could not count ${collectionName}:`, error.message);
            collectionCounts[collectionName] = 0;
          }
        }

        const estimatedDailyReads = Math.max(1000, totalDocuments * 2);
        const estimatedDailyWrites = Math.max(100, totalDocuments * 0.1);
        const readsOverFreeTier = Math.max(0, estimatedDailyReads - FREE_TIER_READS_PER_DAY);
        const writesOverFreeTier = Math.max(0, estimatedDailyWrites - FREE_TIER_WRITES_PER_DAY);
        
        const monthlyReads = estimatedDailyReads * 30;
        const monthlyWrites = estimatedDailyWrites * 30;
        const readsOverFreeTierMonthly = readsOverFreeTier * 30;
        const writesOverFreeTierMonthly = writesOverFreeTier * 30;
        
        const estimatedReadCost = readsOverFreeTierMonthly * COST_PER_READ;
        const estimatedWriteCost = writesOverFreeTierMonthly * COST_PER_WRITE;
        const estimatedTotalCost = estimatedReadCost + estimatedWriteCost;
        const readsPercentage = Math.min(100, (estimatedDailyReads / FREE_TIER_READS_PER_DAY) * 100);
        const writesPercentage = Math.min(100, (estimatedDailyWrites / FREE_TIER_WRITES_PER_DAY) * 100);

        const formatNumber = (num) => {
          if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
          if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
          return num.toString();
        };

        const formatCost = (cost) => {
          if (cost < 0.01) return '$0.00';
          return `$${cost.toFixed(2)}`;
        };

        result.firestore = {
          estimatedDailyReads: estimatedDailyReads,
          estimatedDailyWrites: estimatedDailyWrites,
          readsOverFreeTier: readsOverFreeTier,
          writesOverFreeTier: writesOverFreeTier,
          estimatedMonthlyReads: monthlyReads,
          estimatedMonthlyWrites: monthlyWrites,
          estimatedReadCost: estimatedReadCost,
          estimatedWriteCost: estimatedWriteCost,
          estimatedTotalCost: estimatedTotalCost,
          freeTierReadsPerDay: FREE_TIER_READS_PER_DAY,
          freeTierWritesPerDay: FREE_TIER_WRITES_PER_DAY,
          readsPercentage: readsPercentage,
          writesPercentage: writesPercentage,
          totalDocuments: totalDocuments,
          collectionCounts: collectionCounts,
          formatted: {
            reads: `${formatNumber(estimatedDailyReads)}/${formatNumber(FREE_TIER_READS_PER_DAY)}/day`,
            writes: `${formatNumber(estimatedDailyWrites)}/${formatNumber(FREE_TIER_WRITES_PER_DAY)}/day`,
            cost: formatCost(estimatedTotalCost),
            readsDisplay: `${formatNumber(estimatedDailyReads)}/${formatNumber(FREE_TIER_READS_PER_DAY)}`,
            writesDisplay: `${formatNumber(estimatedDailyWrites)}/${formatNumber(FREE_TIER_WRITES_PER_DAY)}`
          },
          note: 'Estimates based on document counts. For accurate usage, use Google Cloud Monitoring API.'
        };
      } catch (error) {
        console.error('[Usage] Firestore error:', error);
        result.firestore = { error: error.message };
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('[Usage] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate usage'
    });
  }
}
