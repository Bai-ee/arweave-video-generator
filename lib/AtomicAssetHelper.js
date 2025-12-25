/**
 * Atomic Asset Helper Module
 * Handles ANS-110 atomic asset metadata creation and registration
 */

/**
 * Create ANS-110 compliant metadata for atomic asset
 * @param {Object} options - Metadata options
 * @returns {Object} ANS-110 compliant metadata object
 */
export function createAtomicAssetMetadata(options = {}) {
  const {
    videoTitle,
    description,
    artist,
    mixTitle,
    duration,
    resolution = '720x720',
    aspectRatio = '1:1',
    frameRate = '30',
    codec = 'h264',
    format = 'mp4',
    collection = 'GeneratedVideos',
    license = 'yRj4a5KMctX_uOmKWCFJIjmY8DeJcus-vkzhHa61aL0', // Standard Arweave license
    contractSrc = process.env.ATOMIC_ASSET_CONTRACT_SRC || '',
    walletAddress = process.env.ARWEAVE_WALLET_ADDRESS || '',
    thumbnailTxId = null
  } = options;

  if (!contractSrc) {
    throw new Error('ATOMIC_ASSET_CONTRACT_SRC environment variable is required');
  }

  if (!walletAddress) {
    throw new Error('ARWEAVE_WALLET_ADDRESS environment variable is required');
  }

  const timestamp = new Date().toISOString();
  const initState = JSON.stringify({
    owner: walletAddress,
    ticker: 'VIDEO',
    balances: {}
  });

  // Build ANS-110 compliant metadata
  const metadata = {
    Type: 'Video',
    Title: videoTitle || mixTitle || 'Generated Video',
    Description: description || `Generated video for ${artist || 'Unknown Artist'}`,
    License: license,
    'App-Name': 'AtomicVideo',
    'App-Version': '1.0.0',
    'Content-Type': 'video/mp4',
    'Contract-Src': contractSrc,
    'Init-State': initState,
    Creator: walletAddress,
    Collection: collection,
    Timestamp: timestamp,
    Format: format,
    Duration: duration ? duration.toString() : '',
    Resolution: resolution,
    'Aspect-Ratio': aspectRatio,
    'Frame-Rate': frameRate,
    Codec: codec
  };

  // Add optional fields
  if (artist) {
    metadata.Artist = artist;
  }
  if (mixTitle) {
    metadata['Mix-Title'] = mixTitle;
  }
  if (thumbnailTxId) {
    metadata.Thumbnail = thumbnailTxId;
  }

  return metadata;
}

/**
 * Convert metadata object to ANS-110 transaction tags
 * @param {Object} metadata - Metadata object
 * @returns {Array} Array of tag objects {name, value}
 */
export function metadataToTags(metadata) {
  const tags = [];
  
  // Add all metadata fields as tags
  Object.entries(metadata).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      tags.push({
        name: key,
        value: value.toString()
      });
    }
  });

  return tags;
}

