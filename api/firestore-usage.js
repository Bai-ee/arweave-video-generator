/**
 * API endpoint to get Firestore usage statistics
 * Returns read/write counts and estimated costs
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

// Firebase free tier limits (Blaze plan)
const FREE_TIER_READS_PER_DAY = 50000; // 50K reads/day free
const FREE_TIER_WRITES_PER_DAY = 20000; // 20K writes/day free
const FREE_TIER_DELETES_PER_DAY = 20000; // 20K deletes/day free

// Firestore pricing (after free tier)
const COST_PER_READ = 0.06 / 100000; // $0.06 per 100K reads
const COST_PER_WRITE = 0.18 / 100000; // $0.18 per 100K writes
const COST_PER_DELETE = 0.02 / 100000; // $0.02 per 100K deletes

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

  try {
    // Initialize Firebase Admin
    initializeFirebaseAdmin();
    const db = getFirestore();

    // Note: Firestore doesn't provide direct usage stats via Admin SDK
    // We'll need to estimate based on collection/document counts
    // For accurate usage, you'd need Google Cloud Monitoring API
    
    // Get approximate document counts from main collections
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
        console.warn(`[Firestore Usage] Could not count ${collectionName}:`, error.message);
        collectionCounts[collectionName] = 0;
      }
    }

    // Estimate daily operations (rough approximation)
    // This is a simplified estimate - actual usage would come from Cloud Monitoring
    const estimatedDailyReads = Math.max(1000, totalDocuments * 2); // Rough estimate
    const estimatedDailyWrites = Math.max(100, totalDocuments * 0.1); // Rough estimate
    
    // Calculate if over free tier
    const readsOverFreeTier = Math.max(0, estimatedDailyReads - FREE_TIER_READS_PER_DAY);
    const writesOverFreeTier = Math.max(0, estimatedDailyWrites - FREE_TIER_WRITES_PER_DAY);
    
    // Estimate monthly cost (30 days)
    const monthlyReads = estimatedDailyReads * 30;
    const monthlyWrites = estimatedDailyWrites * 30;
    const readsOverFreeTierMonthly = readsOverFreeTier * 30;
    const writesOverFreeTierMonthly = writesOverFreeTier * 30;
    
    const estimatedReadCost = readsOverFreeTierMonthly * COST_PER_READ;
    const estimatedWriteCost = writesOverFreeTierMonthly * COST_PER_WRITE;
    const estimatedTotalCost = estimatedReadCost + estimatedWriteCost;

    // Calculate percentages
    const readsPercentage = Math.min(100, (estimatedDailyReads / FREE_TIER_READS_PER_DAY) * 100);
    const writesPercentage = Math.min(100, (estimatedDailyWrites / FREE_TIER_WRITES_PER_DAY) * 100);

    const formatNumber = (num) => {
      if (num >= 1000000) {
        return `${(num / 1000000).toFixed(1)}M`;
      } else if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K`;
      }
      return num.toString();
    };

    const formatCost = (cost) => {
      if (cost < 0.01) {
        return '$0.00';
      } else if (cost < 1) {
        return `$${cost.toFixed(2)}`;
      } else {
        return `$${cost.toFixed(2)}`;
      }
    };

    return res.status(200).json({
      success: true,
      // Daily estimates
      estimatedDailyReads: estimatedDailyReads,
      estimatedDailyWrites: estimatedDailyWrites,
      readsOverFreeTier: readsOverFreeTier,
      writesOverFreeTier: writesOverFreeTier,
      // Monthly estimates
      estimatedMonthlyReads: monthlyReads,
      estimatedMonthlyWrites: monthlyWrites,
      estimatedReadCost: estimatedReadCost,
      estimatedWriteCost: estimatedWriteCost,
      estimatedTotalCost: estimatedTotalCost,
      // Free tier limits
      freeTierReadsPerDay: FREE_TIER_READS_PER_DAY,
      freeTierWritesPerDay: FREE_TIER_WRITES_PER_DAY,
      // Percentages
      readsPercentage: readsPercentage,
      writesPercentage: writesPercentage,
      // Document counts
      totalDocuments: totalDocuments,
      collectionCounts: collectionCounts,
      // Formatted for display
      formatted: {
        reads: `${formatNumber(estimatedDailyReads)}/${formatNumber(FREE_TIER_READS_PER_DAY)}/day`,
        writes: `${formatNumber(estimatedDailyWrites)}/${formatNumber(FREE_TIER_WRITES_PER_DAY)}/day`,
        cost: formatCost(estimatedTotalCost),
        readsDisplay: `${formatNumber(estimatedDailyReads)}/${formatNumber(FREE_TIER_READS_PER_DAY)}`,
        writesDisplay: `${formatNumber(estimatedDailyWrites)}/${formatNumber(FREE_TIER_WRITES_PER_DAY)}`
      },
      note: 'Estimates based on document counts. For accurate usage, use Google Cloud Monitoring API.'
    });
  } catch (error) {
    console.error('[Firestore Usage] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate Firestore usage'
    });
  }
}
