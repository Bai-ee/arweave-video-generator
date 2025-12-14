# API Reference Documentation

**Last Updated**: December 2025  
**Status**: ✅ Production Ready MVP

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
  "selectedFolders": ["rositas", "skyline", "neighborhood"],
  "useTrax": false,
  "videoFilter": "look_hard_bw_street_doc",
  "filterIntensity": 0.8,
  "enableOverlay": false
}
```

**Parameters**:
- `duration` (number, optional): Video duration in seconds. Default: 30
- `artist` (string, optional): Artist name or 'random'. Default: 'random'
- `selectedFolders` (array, required): Array of folder names. Must have at least one folder.
- `useTrax` (boolean, optional): `true` for tracks, `false` for mixes. Default: `false`
- `videoFilter` (string, optional): Filter key. Default: 'look_hard_bw_street_doc'
- `filterIntensity` (number, optional): Filter intensity 0.0-1.0. Default: 0.4
- `enableOverlay` (boolean, optional): Enable overlay effects. Default: `true`

**Validation**:
- `selectedFolders` must be an array with at least one folder
- Folder names must be valid: lowercase, alphanumeric, hyphens, underscores, forward slashes
- Excludes exact matches: `logos`, `paper_backgrounds`, `mixes`, `mixes/baiee`, `mixes/bai-ee`
- **Allows**: Any other folder, including user-created folders like 'rositas', 'retro_dust', 'noise', 'grit'

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

**Query Parameters**: None

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
- **Excludes**: Only `logos`, `paper_backgrounds`, `mixes/Baiee` (exact matches)

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

**Request Body**: None (no parameters needed)

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

Lists all artists from Firestore.

**Response** (200):
```json
{
  "success": true,
  "artists": [
    {
      "artistName": "TYREL WILLIAMS",
      "artistFilename": "tyrel.html",
      "mixes": [
        {
          "mixTitle": "Live at Podlasie",
          "mixArweaveURL": "https://arweave.net/...",
          "duration": 7200
        }
      ]
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
  "action": "create",
  "artistName": "New Artist",
  "artistImage": "base64-encoded-image",
  "mixes": [...]
}
```

**Actions**: `create`, `update`, `delete`

**Implementation**: `api/manage-artists.js`

---

### Utility

#### `POST /api/upload`

General file upload handler for artist images and media files.

**Request**: Multipart form data

**Implementation**: `api/upload.js`

---

#### `POST /api/migrate-image-urls`

Migrates image URLs in Firestore to Arweave URLs.

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
- `videos.js`: 5 seconds
- `upload-video.js`: 60 seconds
- `archive-upload.js`: 120 seconds
- `deploy-website.js`: 300 seconds (5 minutes)
- `usage.js`: 10 seconds

---

**Last Updated**: December 2025
