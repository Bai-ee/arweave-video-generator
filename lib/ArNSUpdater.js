/**
 * ArNS Updater Module
 * Updates ArNS (Arweave Name Service) records to point to deployment manifest
 * Uses @ar.io/sdk for ANT (Arweave Name Token) interactions
 */

import { ANT, ArweaveSigner } from '@ar.io/sdk';

/**
 * Update ArNS record to point to a transaction ID (manifest ID)
 * @param {string} transactionId - The Arweave transaction ID (manifest ID) to point to
 * @returns {Promise<Object>} Result with ArNS URL or error
 */
export async function updateArNSRecord(transactionId) {
  try {
    // Get environment variables
    const antProcessId = process.env.ARNS_ANT_PROCESS_ID;
    const walletJwkString = process.env.ARWEAVE_WALLET_JWK;

    if (!antProcessId) {
      throw new Error('ARNS_ANT_PROCESS_ID environment variable not set');
    }

    if (!walletJwkString) {
      throw new Error('ARWEAVE_WALLET_JWK environment variable not set');
    }

    // Parse wallet JWK
    let walletJwk;
    try {
      walletJwk = JSON.parse(walletJwkString);
    } catch (parseError) {
      throw new Error(`Failed to parse ARWEAVE_WALLET_JWK: ${parseError.message}`);
    }

    // Validate JWK structure
    if (!walletJwk.kty || !walletJwk.n || !walletJwk.e) {
      throw new Error('Invalid JWK structure: missing required fields (kty, n, e)');
    }

    console.log('[ArNSUpdater] Initializing ANT with process ID:', antProcessId.substring(0, 20) + '...');

    // Initialize ANT with signer
    const ant = ANT.init({
      signer: new ArweaveSigner(walletJwk),
      processId: antProcessId
    });

    console.log('[ArNSUpdater] Updating ArNS record to point to transaction:', transactionId);

    // Update the base name record to point to the manifest transaction ID
    // TTL of 900 seconds (15 minutes) - can be adjusted if needed
    const { id: txId } = await ant.setBaseNameRecord({
      transactionId: transactionId,
      ttlSeconds: 900 // 15 minutes
    });

    console.log('[ArNSUpdater] ✅ ArNS record updated successfully');
    console.log('[ArNSUpdater] Update transaction ID:', txId);

    // Construct ArNS URL (format: https://{name}.ar.io)
    // Use ARNS_NAME environment variable if set, otherwise default to "undergroundexistence"
    const arnsName = process.env.ARNS_NAME || 'undergroundexistence';
    const arnsUrl = `https://${arnsName}.ar.io`;

    return {
      success: true,
      transactionId: txId,
      arnsUrl: arnsUrl,
      manifestId: transactionId
    };

  } catch (error) {
    console.error('[ArNSUpdater] Error updating ArNS record:', error.message);
    console.error('[ArNSUpdater] Stack:', error.stack);
    
    return {
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}
