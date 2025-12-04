# Arweave Archive Environment Variables Setup

This document describes the required environment variables for the Arweave archive functionality.

## Required Environment Variables

### ARWEAVE_WALLET_JWK
**Required:** Yes  
**Type:** JSON string  
**Description:** Your Arweave wallet in JWK (JSON Web Key) format. This is used to authenticate and sign transactions when uploading to Arweave.

**Example:**
```json
{
  "d": "your-private-key-d-value",
  "dp": "your-dp-value",
  "dq": "your-dq-value",
  "e": "AQAB",
  "kty": "RSA",
  "n": "your-modulus-n-value",
  "p": "your-prime-p-value",
  "q": "your-prime-q-value",
  "qi": "your-qi-value"
}
```

**How to get it:**
- Export your wallet from ArConnect or Arweave wallet extension
- Or generate a new wallet using Arweave tools
- **Important:** Keep this secure and never commit it to version control

**For Vercel:**
- Go to your Vercel project settings
- Navigate to Environment Variables
- Add `ARWEAVE_WALLET_JWK` as a new variable
- Paste the entire JSON object as a string (you may need to escape quotes or use single quotes)

### ARWEAVE_WALLET_ADDRESS
**Required:** No (but recommended)  
**Type:** String  
**Description:** Your Arweave wallet address. Used for metadata tagging and identification.

**Example:**
```
5Gp_ilmFM4D0xwRmc9YcAxPo5B9zlfc4m35zcA1s_nw
```

### ARWEAVE_DRIVE_ID
**Required:** No (but recommended)  
**Type:** String (UUID)  
**Description:** Your ArDrive drive ID. Used to organize uploaded files in ArDrive.

**Example:**
```
ed829e8b-cdd7-45a0-9b45-20ac5fc6fee8
```

**How to get it:**
- Create a drive in ArDrive (https://app.ardrive.io)
- Copy the drive ID from the drive settings

### ARWEAVE_FOLDER_ID
**Required:** No  
**Type:** String (UUID)  
**Description:** Specific folder ID within your ArDrive. If not provided, files will be uploaded to the root of the drive.

**Example:**
```
6edf3ab5-de9f-4520-a611-3fc1be2f70f7
```

## Local Development Setup

1. Create a `.env.local` file in the project root:
```bash
ARWEAVE_WALLET_JWK='{"d":"...","dp":"...","dq":"...","e":"AQAB","kty":"RSA","n":"...","p":"...","q":"...","qi":"..."}'
ARWEAVE_WALLET_ADDRESS="5Gp_ilmFM4D0xwRmc9YcAxPo5B9zlfc4m35zcA1s_nw"
ARWEAVE_DRIVE_ID="ed829e8b-cdd7-45a0-9b45-20ac5fc6fee8"
ARWEAVE_FOLDER_ID="6edf3ab5-de9f-4520-a611-3fc1be2f70f7"
```

2. **Important:** Add `.env.local` to `.gitignore` to prevent committing secrets:
```
.env.local
.env*.local
```

## Vercel Deployment Setup

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - `ARWEAVE_WALLET_JWK` - Paste the full JSON object as a string
   - `ARWEAVE_WALLET_ADDRESS` - Your wallet address
   - `ARWEAVE_DRIVE_ID` - Your ArDrive drive ID
   - `ARWEAVE_FOLDER_ID` - (Optional) Your folder ID

4. Select the environments where these should be available (Production, Preview, Development)
5. Redeploy your application

## Security Notes

- ⚠️ **Never commit wallet JWK to version control**
- ⚠️ **Never share your wallet private key**
- ⚠️ **Use environment variables, never hardcode credentials**
- ⚠️ **Ensure your wallet has sufficient AR tokens for uploads** (costs are minimal, typically < $0.01 per file)

## Testing

After setting up environment variables, test the archive functionality:

1. Navigate to `/archive.html` on your site
2. Select a folder from Firebase Storage
3. Select one or more files
4. Click "Archive Selected Files to Arweave"
5. Monitor the progress and check transaction IDs on https://arweave.net

## Troubleshooting

### "ARWEAVE_WALLET_JWK environment variable is required"
- Ensure the environment variable is set in your deployment environment
- For local development, check `.env.local` exists and is properly formatted
- For Vercel, verify the variable is added in project settings

### Upload fails with authentication error
- Verify your wallet JWK is correctly formatted JSON
- Ensure your wallet has AR tokens (check balance on https://viewblock.io/arweave)
- Verify the wallet address matches the JWK

### Files not appearing in ArDrive
- Files uploaded via Turbo may take a few minutes to appear in ArDrive
- Check the transaction ID on https://arweave.net to verify upload succeeded
- The Arweave URL will work immediately even if ArDrive hasn't indexed it yet


