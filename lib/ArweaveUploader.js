/**
 * Arweave Uploader Module
 * Reusable module for uploading files to Arweave via ArDrive/Turbo
 * Accepts file buffers/streams and returns transaction IDs and URLs
 */

import { TurboFactory } from '@ardrive/turbo-sdk';
import { ArweaveSigner } from '@ardrive/turbo-sdk';

/**
 * Get content type from file extension or provided content type
 */
function getContentType(fileName, providedContentType = null) {
  if (providedContentType) {
    return providedContentType;
  }

  const fileExtension = fileName.toLowerCase().split('.').pop();
  const contentTypes = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'm4v': 'video/x-m4v',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'json': 'application/json',
    'txt': 'text/plain'
  };

  return contentTypes[fileExtension] || 'application/octet-stream';
}

/**
 * Upload file buffer to Arweave via Turbo
 * @param {Buffer|Uint8Array} fileData - File data as buffer
 * @param {string} fileName - Name of the file
 * @param {Object} options - Upload options
 * @param {Object} options.metadata - Custom metadata tags
 * @param {string} options.contentType - Content type (auto-detected if not provided)
 * @param {string} options.folderName - Firebase folder name (for organization)
 * @returns {Promise<Object>} Upload result with transaction ID and URLs
 */
export async function uploadToArweave(fileData, fileName, options = {}) {
  try {
    // Validate environment variables
    if (!process.env.ARWEAVE_WALLET_JWK) {
      throw new Error('ARWEAVE_WALLET_JWK environment variable is required');
    }

    // Parse wallet JWK with better error handling
    // Note: dotenv may strip outer quotes, so we need to handle various formats
    let walletJwk;
    let jwkString = process.env.ARWEAVE_WALLET_JWK;
    
    if (!jwkString) {
      throw new Error('ARWEAVE_WALLET_JWK environment variable is required');
    }
    
    // Log JWK info for debugging (without exposing full key)
    console.log('[ArweaveUploader] JWK length:', jwkString.length);
    console.log('[ArweaveUploader] JWK starts with:', jwkString.substring(0, 20));
    console.log('[ArweaveUploader] JWK ends with:', jwkString.substring(jwkString.length - 20));
    
    try {
      // First, try parsing as-is (in case it's already valid JSON)
      try {
        walletJwk = JSON.parse(jwkString);
        console.log('[ArweaveUploader] ✅ JWK parsed successfully (first attempt)');
      } catch (firstError) {
        console.log('[ArweaveUploader] First parse attempt failed, trying cleanup...');
        // If that fails, try removing outer quotes if present
        let cleaned = jwkString;
        if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
          cleaned = cleaned.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
        } else if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
          cleaned = cleaned.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
        }
        
        // Unescape any escaped characters
        cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
        cleaned = cleaned.replace(/\r\n/g, '').replace(/\n/g, '').replace(/\r/g, '');
        
        try {
          walletJwk = JSON.parse(cleaned);
          console.log('[ArweaveUploader] ✅ JWK parsed successfully (after cleanup)');
        } catch (secondError) {
          // If still failing and it looks like missing quotes, we can't auto-fix it
          // The user needs to fix their Vercel environment variable
          console.error('[ArweaveUploader] JSON Parse Error (first attempt):', firstError.message);
          console.error('[ArweaveUploader] JSON Parse Error (second attempt):', secondError.message);
          console.error('[ArweaveUploader] JWK preview (first 150 chars):', jwkString.substring(0, 150));
          console.error('[ArweaveUploader] JWK preview (last 150 chars):', jwkString.substring(jwkString.length - 150));
          
          if (cleaned.trim().startsWith('{d:') || cleaned.trim().startsWith('{d ')) {
            throw new Error(`ARWEAVE_WALLET_JWK appears to be malformed (missing quotes around property names). The JWK in your Vercel environment variables may have been incorrectly formatted. Please check that it's stored as a valid JSON string with all property names and string values properly quoted.`);
          }
          
          throw new Error(`Failed to parse ARWEAVE_WALLET_JWK: ${secondError.message}. Please ensure the JSON is properly formatted in your Vercel environment variables.`);
        }
      }
      
      // Validate JWK structure
      const requiredFields = ['d', 'dp', 'dq', 'e', 'kty', 'n', 'p', 'q', 'qi'];
      const missingFields = requiredFields.filter(field => !(field in walletJwk));
      if (missingFields.length > 0) {
        throw new Error(`ARWEAVE_WALLET_JWK is missing required fields: ${missingFields.join(', ')}`);
      }
      
      console.log('[ArweaveUploader] ✅ JWK structure validated');
    } catch (error) {
      // Re-throw with more context
      throw error;
    }
    const walletAddress = process.env.ARWEAVE_WALLET_ADDRESS || '';
    const driveId = process.env.ARWEAVE_DRIVE_ID || '';
    const folderId = process.env.ARWEAVE_FOLDER_ID || '';

    console.log('[ArweaveUploader] Starting upload...');
    console.log(`[ArweaveUploader] File: ${fileName}`);
    console.log(`[ArweaveUploader] Size: ${fileData.length} bytes`);
    console.log(`[ArweaveUploader] Drive ID: ${driveId || 'Not specified'}`);

    // Initialize Turbo with wallet
    const signer = new ArweaveSigner(walletJwk);
    const turbo = TurboFactory.authenticated({
      signer: signer,
      config: {
        gatewayUrl: 'https://turbo.ardrive.io',
        uploadUrl: 'https://turbo.ardrive.io'
      }
    });

    console.log('[ArweaveUploader] ✅ Turbo initialized');

    // Determine content type
    const contentType = getContentType(fileName, options.contentType);
    console.log(`[ArweaveUploader] Content-Type: ${contentType}`);

    // Build tags array
    const tags = [
      { name: 'Content-Type', value: contentType },
      { name: 'File-Name', value: fileName },
      { name: 'Upload-Date', value: new Date().toISOString() },
      { name: 'File-Size', value: fileData.length.toString() }
    ];

    // Add drive and folder IDs if provided
    if (driveId) {
      tags.push({ name: 'Drive-ID', value: driveId });
    }
    if (folderId) {
      tags.push({ name: 'Folder-ID', value: folderId });
    }
    if (walletAddress) {
      tags.push({ name: 'Wallet-Address', value: walletAddress });
    }

    // Add folder name if provided
    if (options.folderName) {
      tags.push({ name: 'Folder-Name', value: options.folderName });
    }

    // Add custom metadata tags
    if (options.metadata) {
      Object.entries(options.metadata).forEach(([key, value]) => {
        tags.push({
          name: `Meta-${key}`,
          value: value.toString()
        });
      });
    }

    // Upload to Turbo
    console.log('[ArweaveUploader] ⚡ Uploading to Turbo...');
    let turboResult;
    try {
      turboResult = await turbo.upload({
        data: fileData,
        dataItemOpts: {
          tags: tags
        },
        turboOpts: {
          payment: {
            token: 'arweave'
          }
        }
      });
    } catch (uploadError) {
      // Handle Turbo API errors that might return HTML
      console.error('[ArweaveUploader] ❌ Turbo upload error:', uploadError.message);
      console.error('[ArweaveUploader] Error type:', uploadError.constructor.name);
      console.error('[ArweaveUploader] Error stack:', uploadError.stack);
      
      // Check if it's a response error with status
      if (uploadError.response) {
        const status = uploadError.response.status;
        const statusText = uploadError.response.statusText;
        const responseData = uploadError.response.data;
        
        console.error(`[ArweaveUploader] HTTP ${status} ${statusText}`);
        console.error('[ArweaveUploader] Response headers:', uploadError.response.headers);
        console.error('[ArweaveUploader] Response data type:', typeof responseData);
        console.error('[ArweaveUploader] Response data (first 1000 chars):', typeof responseData === 'string' ? responseData.substring(0, 1000) : JSON.stringify(responseData).substring(0, 1000));
        
        if (status === 403) {
          // Check if response contains specific error messages
          let errorMsg = 'Arweave upload forbidden (403): ';
          if (typeof responseData === 'string') {
            if (responseData.includes('Forbidden') || responseData.includes('403')) {
              errorMsg += 'The Turbo API rejected the request. ';
            }
            if (responseData.includes('wallet') || responseData.includes('credential')) {
              errorMsg += 'Check your wallet credentials. ';
            }
            if (responseData.includes('permission') || responseData.includes('authorized')) {
              errorMsg += 'The wallet may not have sufficient permissions or balance. ';
            }
          }
          errorMsg += 'Please verify: 1) ARWEAVE_WALLET_JWK is correctly set in Vercel environment variables, 2) The wallet has sufficient AR balance, 3) The wallet has proper permissions for Turbo uploads.';
          throw new Error(errorMsg);
        } else if (status === 401) {
          throw new Error('Arweave upload unauthorized (401): Check your wallet credentials. The ARWEAVE_WALLET_JWK may be incorrect or the wallet signature is invalid.');
        } else if (status >= 400) {
          const errorDetail = typeof responseData === 'string' ? responseData.substring(0, 500) : JSON.stringify(responseData).substring(0, 500);
          throw new Error(`Arweave upload failed with HTTP ${status}: ${statusText}. ${errorDetail}`);
        }
      }
      
      // Check for common error patterns in the message
      if (uploadError.message && (uploadError.message.includes('Forbidden') || uploadError.message.includes('403'))) {
        throw new Error('Arweave upload forbidden: The Turbo API rejected the request. This may indicate: 1) Invalid wallet credentials, 2) Insufficient wallet balance, 3) Wallet permissions issue. Please check your ARWEAVE_WALLET_JWK in Vercel environment variables.');
      }
      
      // Re-throw with more context
      throw new Error(`Turbo upload failed: ${uploadError.message || 'Unknown error'}. Check Vercel logs for more details.`);
    }

    if (!turboResult || !turboResult.id) {
      throw new Error('Turbo upload returned invalid result: missing transaction ID');
    }

    console.log('[ArweaveUploader] ✅ Upload successful!');
    console.log(`[ArweaveUploader] Transaction ID: ${turboResult.id}`);

    // Build result object
    const result = {
      success: true,
      transactionId: turboResult.id,
      arweaveUrl: `https://arweave.net/${turboResult.id}`,
      turboUrl: `https://turbo.ardrive.io/${turboResult.id}`,
      fileName: fileName,
      fileSize: fileData.length,
      contentType: contentType,
      driveId: driveId || null,
      folderId: folderId || null,
      walletAddress: walletAddress || null,
      uploadDate: new Date().toISOString(),
      metadata: options.metadata || {},
      note: 'File uploaded successfully to Arweave via Turbo. Transaction is pending blockchain confirmation (typically 2-10 minutes).'
    };

    return result;

  } catch (error) {
    console.error('[ArweaveUploader] ❌ Upload failed:', error.message);
    return {
      success: false,
      error: error.message,
      fileName: fileName
    };
  }
}

/**
 * Upload file from Firebase Storage to Arweave
 * Downloads file from Firebase first, then uploads to Arweave
 * @param {Object} firebaseFile - Firebase Storage file reference
 * @param {string} folderName - Firebase folder name
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} Upload result
 */
export async function uploadFromFirebase(firebaseFile, folderName, metadata = {}) {
  try {
    // Download file from Firebase
    const [fileBuffer] = await firebaseFile.download();
    const fileName = firebaseFile.name.split('/').pop();
    
    // Get content type from Firebase metadata
    const [metadataObj] = await firebaseFile.getMetadata();
    const contentType = metadataObj.contentType || null;

    // Upload to Arweave
    return await uploadToArweave(fileBuffer, fileName, {
      contentType: contentType,
      folderName: folderName,
      metadata: {
        ...metadata,
        firebasePath: firebaseFile.name,
        firebaseSize: metadataObj.size || fileBuffer.length
      }
    });

  } catch (error) {
    console.error('[ArweaveUploader] Firebase download failed:', error.message);
    return {
      success: false,
      error: `Firebase download failed: ${error.message}`,
      fileName: firebaseFile.name
    };
  }
}

