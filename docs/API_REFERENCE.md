# API Reference Documentation

**Last Updated**: December 2025  
**Status**: ✅ Production Ready MVP  
**Version**: 1.1.0

## Overview

This document provides complete API reference for all 12 serverless functions in the Arweave Video Generator system.

**⚠️ CRITICAL**: Vercel Hobby plan limit is **12 serverless functions**. We're currently at the limit. New endpoints must be combined with existing ones.

---

## API Endpoints

### Video Generation

#### `POST /api/generate-video`

Creates a video generation job in Firestore. Processing happens asynchronously via GitHub Actions.

**Request Body**:
```json
{
  "duration": 30,
  "artist": "random",
  "mixTitle": "Live at Podlasie",
  "selectedFolders": ["rositas", "skyline", "neighborhood"],
  "useTrax": false,
  "videoFilter": null,
  "filterIntensity": 0.4,
  "enableOverlay": true,
  "overlayEffect": null,
  "topLogo": null,
  "endLogo": null,
  "useArtistImage": true,
  "customEndMedia": null,
  "endTextOverlay": null,
  "videoOrder": null
}
```

**Parameters**:
- `duration` (number, optional): Video duration in seconds. Default: 30
- `artist` (string, optional): Artist name or 'random'. Default: 'random'
- `mixTitle` (string, optional): Specific mix title (for MIXES mode). If provided, uses this specific mix instead of random selection. Default: null (random)
- `selectedFolders` (array, required): Array of folder names. Must have at least one folder.
- `useTrax` (boolean, optional): true for ORIGINAL TRACKS, false for DJ MIXES. Default: false
- `videoFilter` (string, optional): Filter key from VIDEO_FILTERS or null. Default: null
- `filterIntensity` (number, optional): Filter intensity 0.0-1.0. Default: 0.4
- `enableOverlay` (boolean, optional): Enable overlay effects. Default: true
- `overlayEffect` (string, optional): Overlay effect name ('analog_film', 'gritt', 'noise', 'retro_dust') or null for random. Default: null
- `topLogo` (string, optional): Top logo filename from logos/ folder or null for default (ue_barcode_black.png). Default: null
- `endLogo` (string, optional): End logo filename from logos/ folder or null for default (ue_square.png). Default: null
- `useArtistImage` (boolean, optional): Use artist thumbnail as last 2 segments (5th & 6th). When enabled, uses 4 video segments + 2 artist image segments. When disabled, uses 6 video segments. Default: true
- `customEndMedia` (object, optional): Custom end media selection for the final segment. Shape: `{ folder, fileName, fullPath, type }`.
- `endTextOverlay` (string, optional): Text overlay used when no artist image is used.
- `videoOrder` (array, optional): Only for a single selected folder; array of 6 items `{ segmentIndex, videoName }`.

**Validation**:
- `selectedFolders` must be an array with at least one folder
- Folder names must be valid: lowercase, alphanumeric, hyphens, underscores, forward slashes
- Excludes exact matches: `logos`, `paper_backgrounds`, `mixes`, `mixes/baiee`, `mixes/bai-ee`, `videos`
- **Allows**: Any other folder, including user-created folders like 'rositas', 'retro_dust', 'noise', 'grit'
- `videoOrder` can only be used when exactly one folder is selected and must contain 6 items with sequential `segmentIndex` values

**Response** (200):
```json
{
  "success": true,
  "jobId": "uuid-here",
  "status": "pending",
  "message": "Video generation job created. Processing will begin shortly.",
  "estimatedTime": "10-20 seconds"
}
```

**Error Responses**:
- `400`: Invalid request (missing folders, invalid folder names)
- `405`: Method not allowed
- `500`: Server error

**Implementation**: `api/generate-video.js`

---

### Video Status & List

#### `GET /api/videos`

Lists all generated videos from both `videoJobs` and `videos` collections.

**Query Parameters**:
- `limit` (number, optional): Max videos returned (default: 50)

**Response** (200):
```json
{
  "success": true,
  "videos": [
    {
      "videoId": "job-id",
      "jobId": "job-id",
      "artist": "TYREL WILLIAMS",
      "mixTitle": "Live at Podlasie",
      "videoUrl": "https://storage.googleapis.com/...",
      "status": "completed",
      "createdAt": "2025-12-13T21:48:17.369Z",
      "completedAt": "2025-12-13T21:48:43.692Z"
    }
  ],
  "count": 15
}
```

**Implementation**: `api/videos.js`

---

#### `GET /api/video-status?jobId={jobId}`

Gets status of a specific video generation job.

**Query Parameters**:
- `jobId` (string, required): Job ID to check status for

**Response** (200):
```json
{
  "success": true,
  "jobId": "job-id",
  "status": "processing",
  "artist": "TYREL WILLIAMS",
  "duration": 30,
  "videoUrl": null,
  "error": null,
  "createdAt": "2025-12-13T21:48:17.369Z",
  "completedAt": null,
  "metadata": {}
}
```

**Status Values**:
- `pending`: Job created, waiting for processing
- `processing`: Currently being processed
- `completed`: Video generated successfully
- `failed`: Generation failed

**Error Responses**:
- `400`: Job ID required
- `404`: Job not found
- `500`: Server error

**Implementation**: `api/videos.js` (same file, handles both routes via `vercel.json`)

---

#### `GET /api/videos?download=true&videoUrl={url}` (or `videoUrlB64`)

Proxies a Firebase Storage video URL for downloads (used for iOS/desktop download flow).

**Query Parameters**:
- `download` (string, required): Must be `true`
- `videoUrl` (string, optional): URL-encoded Firebase Storage URL
- `videoUrlB64` (string, optional): Base64-encoded URL (preferred for signed URLs)
- `filename` (string, optional): Suggested download filename (default: `video.mp4`)

**Response**: Binary file stream with `Content-Disposition: attachment`.

**Implementation**: `api/videos.js`

---

#### `POST /api/videos?action=create-atomic-asset`

Converts a completed video job into an Arweave atomic asset (ANS-110).

**Request Body**:
```json
{
  "jobId": "job-id",
  "metadata": {
    "title": "My Video Title",
    "description": "Optional description",
    "collection": "GeneratedVideos"
  }
}
```

**Requirements**:
- `jobId` must exist and be `completed`
- `metadata.title` is required
- Env vars: `ARWEAVE_WALLET_JWK`, `ARWEAVE_WALLET_ADDRESS`, `ATOMIC_ASSET_CONTRACT_SRC`

**Response** (200):
```json
{
  "success": true,
  "transactionId": "arweave-tx-id",
  "arweaveUrl": "https://arweave.net/...",
  "turboUrl": "https://turbo.ardrive.io/...",
  "fileName": "video_job-id.mp4",
  "fileSize": 12345678,
  "metadata": { "Title": "My Video Title" }
}
```

**Implementation**: `api/videos.js`

---

### Folder Management

#### `GET /api/video-folders`

Lists all available folders in Firebase Storage (dynamically discovered).

**Query Parameters**: None

**Response** (200):
```json
{
  "success": true,
  "folders": [
    {
      "name": "rositas",
      "count": 2,
      "displayName": "Rositas",
      "type": "video"
    },
    {
      "name": "skyline",
      "count": 15,
      "displayName": "Skyline",
      "type": "video"
    },
    {
      "name": "assets/chicago-skyline-videos",
      "count": 25,
      "displayName": "Chicago Skyline Videos",
      "type": "video"
    }
  ]
}
```

**Key Features**:
- **Dynamic Discovery**: Discovers all folders by listing files (no hardcoded list)
- **Supports New Folders**: Any user-created folder automatically appears
- **Excludes**: `logos`, `paper_backgrounds`, `mixes`, `mixes/baiee`, `mixes/bai-ee`, `videos` (exact matches)

**Implementation**: `api/video-folders.js`

---

#### `GET /api/video-folders?folder={folderName}`

Lists files in a specific folder with signed URLs.

**Query Parameters**:
- `folder` (string, required): Folder name (e.g., 'rositas', 'skyline')

**Response** (200):
```json
{
  "success": true,
  "folder": "rositas",
  "videos": [
    {
      "name": "user_upload_1765661962768_0_IMG_5176.mov",
      "fullPath": "rositas/user_upload_1765661962768_0_IMG_5176.mov",
      "size": 12345678,
      "contentType": "video/quicktime",
      "updated": "2025-12-13T...",
      "publicUrl": "https://storage.googleapis.com/..."
    }
  ],
  "count": 2
}
```

**Signed URLs**: 
- Valid for 1 hour
- CORS-compliant
- Works for both public and private files

**Implementation**: `api/video-folders.js`

---

### Usage Tracking

#### `GET /api/usage?type=storage`

Gets Firebase Storage usage and estimated monthly cost.

**Query Parameters**:
- `type` (string, optional): `storage`, `firestore`, or `both`. Default: `both`

**Response** (200):
```json
{
  "success": true,
  "storage": {
    "usedMB": 6469,
    "usedGB": 6.32,
    "limitMB": 1024,
    "usedBytes": 6786048000,
    "storageOverFreeTierGB": 5.32,
    "estimatedStorageCost": 0.14,
    "formatted": {
      "used": "6469MB",
      "limit": "1024MB",
      "display": "6469/1024MB",
      "cost": "$0.14"
    },
    "percentage": 631.35
  }
}
```

**Cost Calculation**:
- Free tier: 1GB (1024MB)
- Cost after free tier: $0.026 per GB/month
- Calculation: `(usedGB - 1GB) * $0.026`

**Implementation**: `api/usage.js`

---

#### `GET /api/usage?type=firestore`

Gets Firestore usage (reads/writes) and estimated monthly cost.

**Response** (200):
```json
{
  "success": true,
  "firestore": {
    "estimatedDailyReads": 1000,
    "estimatedDailyWrites": 100,
    "readsOverFreeTier": 0,
    "writesOverFreeTier": 0,
    "estimatedMonthlyReads": 30000,
    "estimatedMonthlyWrites": 3000,
    "estimatedReadCost": 0.00,
    "estimatedWriteCost": 0.00,
    "estimatedTotalCost": 0.00,
    "freeTierReadsPerDay": 50000,
    "freeTierWritesPerDay": 20000,
    "readsPercentage": 2.0,
    "writesPercentage": 0.5,
    "totalDocuments": 500,
    "collectionCounts": {
      "artists": 15,
      "videos": 200,
      "videoJobs": 285
    },
    "formatted": {
      "reads": "1.0K/50.0K/day",
      "writes": "100.0/20.0K/day",
      "cost": "$0.00",
      "readsDisplay": "1.0K/50.0K",
      "writesDisplay": "100.0/20.0K"
    },
    "note": "Estimates based on document counts. For accurate usage, use Google Cloud Monitoring API."
  }
}
```

**Cost Calculation**:
- Free tier: 50K reads/day, 20K writes/day
- Cost after free tier: $0.06 per 100K reads, $0.18 per 100K writes
- **Note**: Estimates based on document counts, not actual Cloud Monitoring data

**Implementation**: `api/usage.js`

---

#### `GET /api/usage` (or `GET /api/usage?type=both`)

Gets both Storage and Firestore usage.

**Response** (200):
```json
{
  "success": true,
  "storage": { /* ... */ },
  "firestore": { /* ... */ }
}
```

**Implementation**: `api/usage.js`

---

### Website Deployment

#### `POST /api/deploy-website`

Deploys website to Arweave and updates ArNS record.

**Request Body** (optional):
```json
{
  "websiteDir": "website",
  "updateOnly": false
}
```

**Notes**:
- `websiteDir` can be a relative or absolute path.
- `updateOnly: true` will sync artists + regenerate HTML without deploying (local only; blocked in Vercel production).

**Response** (200):
```json
{
  "success": true,
  "manifestId": "K9aEuTPUJEUV-1RlB5K75J-c8YXgb2g4c3kf1RxKlQQ",
  "manifestUrl": "https://arweave.net/.../manifest.json",
  "websiteUrl": "https://arweave.net/.../index.html",
  "arnsUrl": "https://undergroundexistence.ar.io",
  "filesUploaded": 56,
  "filesUnchanged": 0,
  "totalFiles": 56,
  "costEstimate": 0.001,
  "message": "Website deployed successfully to Arweave"
}
```

**Process**:
1. Syncs Firebase artists to `website/artists.json`
2. Generates HTML pages for each artist
3. Uploads changed files to Arweave (via ArDrive Turbo SDK)
4. Creates and uploads manifest
5. **Updates ArNS record** to point to manifest ID
6. Returns ArNS URL

**ArNS Update**:
- Non-blocking: deployment succeeds even if ArNS update fails
- Uses `lib/ArNSUpdater.js`
- Propagation time: 5-60 minutes

**Implementation**: `api/deploy-website.js`

---

#### `GET /api/deploy-website`

Returns a cost estimate for the next deployment (after syncing artists and regenerating pages).

**Query Parameters**:
- `websiteDir` (string, optional): Path to website directory (default: `website`)

**Implementation**: `api/deploy-website.js`

---

#### `POST /api/update-website`

Alias for `/api/deploy-website` (same handler).

**Implementation**: `api/deploy-website.js` (via `vercel.json` routing)

---

### Archive Upload

#### `POST /api/archive-upload`

Archives files from Firebase Storage to Arweave.

**Request Body**:
```json
{
  "folder": "rositas",
  "fileName": "user_upload_1765661962768_0_IMG_5176.mov"
}
```

**Parameters**:
- `folder` (string, required): Folder name in Firebase Storage
- `fileName` (string, required): File name to archive

**Response** (200):
```json
{
  "success": true,
  "transactionId": "arweave-tx-id",
  "arweaveUrl": "https://arweave.net/...",
  "turboUrl": "https://turbo.ardrive.io/...",
  "cost": 0.0001
}
```

**Process**:
1. Downloads file from Firebase Storage
2. Uploads to Arweave via ArDrive Turbo SDK
3. Creates job in `archiveJobs` collection
4. Updates `archiveManifest` collection
5. Returns transaction IDs and URLs

**Confirmation Time**: 2-10 minutes (blockchain confirmation)

**Implementation**: `api/archive-upload.js`

---

#### `GET /api/archive-status`

Gets status of archive jobs.

**Query Parameters**:
- `folder` (string, optional): Filter by folder
- `fileName` (string, optional): Filter by file name

**Response** (200):
```json
{
  "success": true,
  "jobs": [
    {
      "folder": "rositas",
      "fileName": "user_upload_1765661962768_0_IMG_5176.mov",
      "status": "completed",
      "transactionId": "arweave-tx-id",
      "arweaveUrl": "https://arweave.net/...",
      "turboUrl": "https://turbo.ardrive.io/..."
    }
  ]
}
```

**Implementation**: `api/archive-upload.js` (via `vercel.json` routing)

---

#### `GET /api/archive-manifest`

Gets archive manifest.

**Response** (200):
```json
{
  "success": true,
  "manifest": {
    "version": "1.0",
    "lastUpdated": "2025-12-13T...",
    "folders": {
      "rositas": [
        {
          "fileName": "user_upload_1765661962768_0_IMG_5176.mov",
          "arweaveUrl": "https://arweave.net/...",
          "transactionId": "arweave-tx-id"
        }
      ]
    }
  }
}
```

**Implementation**: `api/archive-upload.js` (via `vercel.json` routing)

---

### Video Management

#### `POST /api/upload-video`

Optimizes and uploads videos to Firebase Storage.

**Request**: Multipart form data
- `file`: Video file
- `folder`: Destination folder name
- `orientation`: Orientation (auto-detect, square, portrait, landscape)

**Response** (200):
```json
{
  "success": true,
  "videoUrl": "https://storage.googleapis.com/...",
  "fileName": "optimized_video.mp4",
  "fileSize": 12345678
}
```

**Implementation**: `api/upload-video.js`

---

#### `DELETE /api/delete-video?folder={folder}&file={fileName}`

Deletes a video from Firebase Storage.

**Query Parameters**:
- `folder` (string, required): Folder name
- `file` (string, required): File name

**Response** (200):
```json
{
  "success": true,
  "message": "Video deleted successfully"
}
```

**Implementation**: `api/delete-video.js`

---

### Artist Management

#### `GET /api/artists`

Lists all artists from Firestore (`system/artists` document) or local fallback data.

**Query Parameters**:
- `artist` (string, optional): If provided, returns mixes for a specific artist
- `includeMixes` (string, optional): `true` to include mixes (also implied by `artist`)

**Response** (200):
```json
{
  "success": true,
  "artists": [
    {
      "name": "TYREL WILLIAMS",
      "genre": "Electronic",
      "mixCount": 12,
      "trackCount": 3,
      "imageUrl": "https://arweave.net/..."
    }
  ],
  "count": 15
}
```

**Implementation**: `api/artists.js`

---

#### `POST /api/manage-artists`

Creates or updates artists in Firestore.

**Request Body**:
```json
{
  "action": "addMix",
  "artistName": "New Artist",
  "mixUrl": "https://arweave.net/...",
  "mixTitle": "Live at Podlasie",
  "mixDateYear": "2025",
  "mixDuration": "60:00",
  "mixImageFilename": ""
}
```

**Actions**:
- `addMix`: adds a mix entry
- `addTrack`: adds a track entry
- `updateArtist`: updates artist fields (currently `artistGenre`)

**Implementation**: `api/manage-artists.js`

---

### Utility

#### `POST /api/upload`

General file upload handler for artist images and media files.

**Request**:
- Multipart form data (legacy)
- JSON body with `firebasePath` for Firebase-to-Arweave uploads

**Implementation**: `api/upload.js`

---

#### `GET /api/upload?fileSize={bytes}`

Returns an Arweave cost estimate for a file size.

**Implementation**: `api/upload.js`

---

#### `POST /api/migrate-image-urls`

Migrates image URLs in Firestore to Arweave URLs.

**Note**: This handler is not routed in `vercel.json` by default; use as a one-off migration or add a route if needed.

**Implementation**: `api/migrate-image-urls.js`

---

## Route Configuration

Routes are configured in `vercel.json`:

```json
{
  "routes": [
    { "src": "/api/generate-video", "dest": "/api/generate-video.js" },
    { "src": "/api/video-status", "dest": "/api/videos.js" },
    { "src": "/api/video-status/(.*)", "dest": "/api/videos.js" },
    { "src": "/api/videos", "dest": "/api/videos.js" },
    { "src": "/api/usage", "dest": "/api/usage.js" },
    { "src": "/api/storage-usage", "dest": "/api/usage.js" },
    { "src": "/api/firestore-usage", "dest": "/api/usage.js" },
    // ... etc
  ]
}
```

**Key Points**:
- Multiple routes can point to the same function file
- This allows combining endpoints to stay within 12 function limit
- Route matching is done by Vercel before function execution

---

## Error Handling

All endpoints follow consistent error response format:

```json
{
  "success": false,
  "error": "Error message",
  "message": "Detailed error message (in development mode)"
}
```

**Status Codes**:
- `200`: Success
- `400`: Bad request (validation errors)
- `404`: Not found
- `405`: Method not allowed
- `500`: Server error

---

## CORS

All endpoints set CORS headers:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

---

## Function Timeouts

Configured in `vercel.json`:
- `generate-video.js`: 10 seconds
- `videos.js`: 60 seconds
- `upload-video.js`: 60 seconds
- `artists.js`: 5 seconds
- `video-folders.js`: 10 seconds
- `delete-video.js`: 10 seconds
- `archive-upload.js`: 120 seconds
- `upload.js`: 300 seconds
- `manage-artists.js`: 60 seconds
- `deploy-website.js`: 300 seconds (5 minutes)
- `usage.js`: 10 seconds

---

**Last Updated**: December 2025
