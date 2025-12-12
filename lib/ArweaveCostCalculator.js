/**
 * Arweave Cost Calculator
 * Calculates upload costs based on file sizes
 * Pricing: ~$0.10 per MB (~0.0001 AR per MB, varies with AR price)
 */

const BYTES_PER_MB = 1024 * 1024;
const COST_PER_MB_AR = 0.0001; // Approximate base rate
const COST_PER_MB_USD = 0.10; // Approximate base rate

// Cache AR price to avoid excessive API calls
let cachedARPrice = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get current AR price in USD from CoinGecko API
 * @returns {Promise<number>} AR price in USD
 */
async function getARPriceUSD() {
  try {
    // Check cache first
    if (cachedARPrice && cacheTimestamp && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
      return cachedARPrice;
    }
    
    // Fetch from CoinGecko
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd', {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    const price = data.arweave?.usd;
    
    if (price && price > 0) {
      cachedARPrice = price;
      cacheTimestamp = Date.now();
      console.log(`[CostCalculator] Fetched AR price: $${price.toFixed(2)} USD`);
      return price;
    }
    
    throw new Error('Invalid price data from API');
  } catch (error) {
    console.warn(`[CostCalculator] Could not fetch AR price: ${error.message}, using fallback`);
    // Fallback to default price
    return 10; // Default fallback: $10 per AR
  }
}

/**
 * Calculate cost for file size in bytes
 * @param {number} fileSizeBytes - File size in bytes
 * @param {number} arPriceUSD - Optional AR price in USD (will fetch if not provided)
 * @returns {Promise<Object>} Cost breakdown
 */
export async function calculateCost(fileSizeBytes, arPriceUSD = null) {
  if (!arPriceUSD) {
    arPriceUSD = await getARPriceUSD();
  }
  
  const sizeMB = fileSizeBytes / BYTES_PER_MB;
  const costAR = sizeMB * COST_PER_MB_AR;
  const costUSD = costAR * arPriceUSD;
  
  // Also provide approximate cost (using fixed rate)
  const costUSDApprox = sizeMB * COST_PER_MB_USD;
  
  return {
    sizeBytes: fileSizeBytes,
    sizeMB: parseFloat(sizeMB.toFixed(4)),
    sizeKB: parseFloat((fileSizeBytes / 1024).toFixed(2)),
    costAR: parseFloat(costAR.toFixed(8)),
    costUSD: parseFloat(costUSD.toFixed(4)),
    costUSDApprox: parseFloat(costUSDApprox.toFixed(4)),
    arPriceUSD: parseFloat(arPriceUSD.toFixed(2))
  };
}

/**
 * Calculate total cost for multiple files
 * @param {Array} files - Array of file objects with size or buffer property
 * @param {number} arPriceUSD - Optional AR price in USD
 * @returns {Promise<Object>} Total cost breakdown
 */
export async function calculateTotalCost(files, arPriceUSD = null) {
  const totalBytes = files.reduce((sum, file) => {
    if (file.size) return sum + file.size;
    if (file.buffer && Buffer.isBuffer(file.buffer)) return sum + file.buffer.length;
    if (file.buffer && file.buffer.length) return sum + file.buffer.length;
    return sum;
  }, 0);
  
  return await calculateCost(totalBytes, arPriceUSD);
}

/**
 * Format cost for display
 * @param {Object} cost - Cost object from calculateCost
 * @returns {string} Formatted string
 */
export function formatCost(cost) {
  if (cost.sizeMB < 1) {
    return `${cost.sizeKB} KB - ${cost.costAR.toFixed(6)} AR (~$${cost.costUSD.toFixed(4)} USD)`;
  }
  return `${cost.sizeMB.toFixed(2)} MB - ${cost.costAR.toFixed(6)} AR (~$${cost.costUSD.toFixed(4)} USD)`;
}



