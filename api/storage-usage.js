/**
 * API endpoint to get Firebase Storage usage statistics
 * Returns total storage used and free tier limit
 */

import { initializeFirebaseAdmin, getStorage } from '../lib/firebase-admin.js';

// Firebase free tier limits (Blaze plan)
// Cloud Storage: First 1 GB stored is free, then $0.026/GB/month
// Bandwidth: First 10 GB/month is free, then $0.12/GB
const FREE_TIER_STORAGE_MB = 1024; // 1GB = 1024MB (Blaze plan free tier for storage)
const STORAGE_COST_PER_GB_MONTH = 0.026; // $0.026 per GB/month after free tier
const FREE_TIER_BANDWIDTH_GB = 10; // 10 GB/month free bandwidth
const BANDWIDTH_COST_PER_GB = 0.12; // $0.12 per GB after free tier

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
    const storage = getStorage();
    const bucket = storage.bucket();

    // Get all files in the bucket
    const [files] = await bucket.getFiles();

    // Calculate total size
    let totalSizeBytes = 0;
    files.forEach(file => {
      const size = parseInt(file.metadata.size || 0, 10);
      totalSizeBytes += size;
    });

    // Convert to MB and GB
    const totalSizeMB = totalSizeBytes / (1024 * 1024);
    const totalSizeGB = totalSizeMB / 1024;
    const freeTierLimitMB = FREE_TIER_STORAGE_MB;
    const freeTierLimitGB = FREE_TIER_STORAGE_MB / 1024;

    // Calculate storage cost (only for storage over 1GB)
    const storageOverFreeTierGB = Math.max(0, totalSizeGB - freeTierLimitGB);
    const estimatedStorageCost = storageOverFreeTierGB * STORAGE_COST_PER_GB_MONTH;

    // Format for display
    const formatSize = (mb) => {
      if (mb < 1) {
        return `${Math.round(mb * 100) / 100}MB`;
      } else if (mb < 1024) {
        return `${Math.round(mb)}MB`;
      } else {
        return `${(mb / 1024).toFixed(2)}GB`;
      }
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

    // Calculate percentage (capped at 100% for display purposes)
    const percentage = Math.min(100, (totalSizeMB / freeTierLimitMB) * 100);

    return res.status(200).json({
      success: true,
      usedMB: totalSizeMB,
      usedGB: totalSizeGB,
      limitMB: freeTierLimitMB,
      limitGB: freeTierLimitGB,
      usedBytes: totalSizeBytes,
      limitBytes: freeTierLimitMB * 1024 * 1024,
      storageOverFreeTierGB: storageOverFreeTierGB,
      estimatedStorageCost: estimatedStorageCost,
      formatted: {
        used: formatSize(totalSizeMB),
        limit: formatSize(freeTierLimitMB),
        display: `${Math.round(totalSizeMB)}/${freeTierLimitMB}MB`,
        cost: formatCost(estimatedStorageCost)
      },
      percentage: percentage
    });
  } catch (error) {
    console.error('[Storage Usage] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to calculate storage usage'
    });
  }
}
