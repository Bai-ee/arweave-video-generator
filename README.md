# 🎬 Arweave Video Generator - Production MVP

**Status**: ✅ Production Ready MVP  
**Last Updated**: December 2025  
**Version**: 1.1.0

> **📚 Documentation Map**: This README is the **single-file context** for new chat threads. For detailed documentation, see:
> - **[DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)** - Complete navigation guide to all documentation
> - **[FUTURE_PROOFING.md](./FUTURE_PROOFING.md)** - ⚠️ **CRITICAL**: Read before making any code changes
> - **[API_REFERENCE.md](./API_REFERENCE.md)** - Complete API endpoint documentation
> - **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)** - Detailed architecture documentation
> - **[FEATURES.md](./FEATURES.md)** - All MVP features with verification status
> - **[DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)** - Development best practices and patterns

## 📋 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [MVP Features](#mvp-features)
5. [System Components](#system-components)
6. [API Reference](#api-reference)
7. [Development Workflow](#development-workflow)
8. [Environment Setup](#environment-setup)
9. [Deployment](#deployment)
10. [Future-Proofing Guidelines](#future-proofing-guidelines)
11. [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

The Arweave Video Generator is a **production-ready MVP** that automatically generates branded music videos by combining:

- **Audio** from Arweave decentralized storage (DJ mixes or original tracks)
- **Video segments** from Firebase Storage folders (dynamically discovered)
- **AI-generated backgrounds** (DALL-E 3 fallback)
- **Branded overlays** (logos, text, paper textures)

### Key Capabilities

✅ **Video Generation**: 30-second videos from 5-second segments  
✅ **Dynamic Folder Discovery**: Automatically finds new folders in Firebase Storage  
✅ **Artist Thumbnails**: Multiple Arweave-hosted thumbnails per artist, used as last 2 video segments  
✅ **Artist Image Toggle**: Enable/disable artist thumbnail usage in video generation  
✅ **ArNS Integration**: Automatic domain updates (`undergroundexistence.ar.io`)  
✅ **Website Deployment**: Deploys generated website to Arweave  
✅ **Usage Tracking**: Real-time Firebase Storage and Firestore usage indicators  
✅ **New Folder Creation**: Users can create folders on-the-fly during upload  
✅ **Archive to Arweave**: Permanent decentralized storage via ArDrive Turbo SDK

### Technology Stack

- **Frontend**: Single-page HTML/JavaScript application
- **Backend API**: Vercel Serverless Functions (Node.js ES Modules)
- **Video Processing**: GitHub Actions (FFmpeg on Ubuntu)
- **Storage**: Firebase Storage (videos, images, assets)
- **Database**: Firestore (job tracking, metadata, artists)
- **Audio Source**: Arweave decentralized storage
- **Archive**: Arweave via ArDrive Turbo SDK
- **Domain**: ArNS (Arweave Name System)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (ES Modules)
- Firebase project with Storage and Firestore enabled
- Arweave wallet (for ArNS and archive uploads)
- Vercel account (for deployment)
- GitHub repository (for Actions workflow)

### Installation

```bash
# Clone repository
git clone https://github.com/Bai-ee/arweave-video-generator.git
cd arweave-video-generator

# Install root dependencies
npm install

# Install worker dependencies
cd worker
npm install
cd ..
```

### Environment Variables

#### Vercel Environment Variables

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

```
FIREBASE_SERVICE_ACCOUNT_KEY={full JSON string}
FIREBASE_STORAGE_BUCKET=editvideos-63486.firebasestorage.app
GITHUB_TOKEN={GitHub personal access token}
GITHUB_REPO=Bai-ee/arweave-video-generator
ARWEAVE_WALLET_JWK={Arweave wallet JSON string}
ARNS_ANT_PROCESS_ID=tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw
ARNS_NAME=undergroundexistence
OPENAI_API_KEY={OpenAI API key for DALL-E fallback}
```

#### GitHub Actions Secrets

Set these in GitHub → Repository → Settings → Secrets and variables → Actions:

```
FIREBASE_SERVICE_ACCOUNT_KEY={full JSON string}
FIREBASE_STORAGE_BUCKET=editvideos-63486.firebasestorage.app
OPENAI_API_KEY={OpenAI API key}
```

### Local Development

```bash
# Test video generation locally
cd worker
node test-local.js

# Test ArNS integration
node test-arns.js

# Check ArNS record
node check-arns-record.js
```

### Deploy

```bash
# Deploy to Vercel
vercel --prod

# Or push to main branch (auto-deploys)
git push origin main
```

---

## 🏗️ Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Browser (Frontend)                   │
│  - index.html (Single-page application)                     │
│  - Firebase SDK (client-side uploads)                        │
│  - Real-time status polling                                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ HTTP Requests
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Vercel (Serverless Functions)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  API Endpoints (12 functions - Hobby plan limit)      │  │
│  │  - /api/generate-video                                │  │
│  │  - /api/videos (handles /video-status too)           │  │
│  │  - /api/video-folders                                │  │
│  │  - /api/upload-video                                 │  │
│  │  - /api/usage (handles /storage-usage, /firestore)   │  │
│  │  - /api/deploy-website                                │  │
│  │  - /api/archive-upload                                │  │
│  │  - /api/artists                                       │  │
│  │  - /api/manage-artists                                │  │
│  │  - /api/delete-video                                  │  │
│  │  - /api/upload                                        │  │
│  │  - /api/migrate-image-urls                            │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Firebase Admin SDK
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Firebase Services                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Firestore Collections:                              │  │
│  │  - videoJobs (job tracking)                           │  │
│  │  - videos (completed videos)                          │  │
│  │  - artists (artist/mix metadata)                      │  │
│  │  - archiveJobs (archive tracking)                     │  │
│  │  - archiveManifest (archive index)                     │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Firebase Storage Folders:                           │  │
│  │  - videos/ (generated videos)                          │  │
│  │  - skyline/, decks/, equipment/, etc. (user uploads) │  │
│  │  - assets/chicago-skyline-videos/ (pre-generated)     │  │
│  │  - logos/ (logo images)                                │  │
│  │  - paper_backgrounds/ (overlay textures)               │  │
│  │  - {any-new-folder}/ (dynamically discovered)          │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Webhook (optional) or Cron
                        ▼
┌─────────────────────────────────────────────────────────────┐
│           GitHub Actions Workflow                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Runs every minute (cron: '*/1 * * * *')              │  │
│  │  - Polls Firestore for pending jobs                  │  │
│  │  - Processes one job at a time                        │  │
│  │  - Uses system FFmpeg (apt-get install)               │  │
│  │  - Uploads result to Firebase Storage                 │  │
│  │  - Updates Firestore status                          │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Video Generation Pipeline
                        ▼
┌─────────────────────────────────────────────────────────────┐
│         Worker Libraries (worker/lib/)                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  ArweaveVideoGenerator.js (orchestrator)             │  │
│  │  ├─ ArweaveAudioClient.js (audio from Arweave)       │  │
│  │  ├─ VideoLoader.js (dynamic folder discovery)        │  │
│  │  ├─ VideoSegmentCompositor.js (5s segments → 30s)    │  │
│  │  ├─ VideoCompositor.js (overlays, filters)           │  │
│  │  ├─ DALLEImageGenerator.js (fallback backgrounds)     │  │
│  │  └─ ImageLoader.js (logo/image loading)              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow: Video Generation

1. **User Action**: Selects audio source (MIXES/TRACKS), folders, clicks "Generate"
2. **Frontend**: POST to `/api/generate-video` with `selectedFolders` array
3. **API**: Creates job in Firestore `videoJobs` collection (status: 'pending')
4. **GitHub Actions**: Workflow runs every minute, finds pending job
5. **Worker**:
   - Updates status to 'processing'
   - **Dynamically discovers folders** from Firebase Storage
   - Loads videos from selected folders (supports new folders like 'rositas')
   - Extracts 5-second segments from videos
   - Concatenates segments into 30-second background video
   - Applies video filters (Hard B&W Street Doc @ 80%)
   - Adds overlays (paper texture, logos, text)
   - Combines with audio track
   - Uploads to Firebase Storage (`videos/{jobId}.mp4`)
   - Generates signed URL (1 year expiry, CORS-compliant)
   - Updates Firestore (status: 'completed', videoUrl)
6. **Frontend**: Polls `/api/videos` every 2 seconds, displays video when ready

### Data Flow: Website Deployment

1. **User Action**: Clicks "Deploy Website" button
2. **Frontend**: POST to `/api/deploy-website`
3. **API**:
   - Syncs Firebase artists to `website/artists.json`
   - Generates HTML pages for each artist
   - Uploads website files to Arweave (via ArDrive Turbo SDK)
   - Creates manifest and uploads manifest
   - **Updates ArNS record** to point to manifest ID
   - Returns ArNS URL (`https://undergroundexistence.ar.io`)
4. **Frontend**: Displays ArNS URL in success modal

---

## ✅ MVP Features

### 1. Video Generation with Dynamic Folder Selection

**Status**: ✅ Production Ready

**How It Works**:
- User selects audio source (DJ MIXES or ORIGINAL TRACKS)
- User selects one or more video folders (checkboxes, all selected by default)
- System **dynamically discovers** all folders in Firebase Storage
- Supports **any new folder** created by users (e.g., 'rositas', 'retro_dust', 'noise')
- Extracts 5-second segments from videos in selected folders
- Concatenates segments into 30-second background video
- Applies video filters and overlays
- Combines with audio track

**Default Folders Auto-Selected**:
- `chicago-skyline-videos`
- `skyline`
- `neighborhood`

**Technical Details**:
- **API**: `POST /api/generate-video`
- **Parameters**:
  ```json
  {
    "selectedFolders": ["rositas", "skyline"],
    "useTrax": false,
    "artist": "random",
    "mixTitle": "Live at Podlasie",
    "duration": 30,
    "videoFilter": "look_hard_bw_street_doc",
    "filterIntensity": 0.8,
    "enableOverlay": true,
    "overlayEffect": null,
    "topLogo": null,
    "endLogo": null,
    "useArtistImage": true
  }
  ```
- **Processing**: GitHub Actions workflow (runs every minute)
- **Output**: Video stored in `videos/{jobId}.mp4` in Firebase Storage
- **Artist Thumbnails**: When `useArtistImage` is true, uses artist thumbnail as last 2 segments (5th & 6th, last 10 seconds)

### 2. Dynamic Folder Discovery

**Status**: ✅ Production Ready

**How It Works**:
- System automatically discovers all folders in Firebase Storage
- No hardcoded folder lists - works with any folder structure
- Excludes only: `logos`, `paper_backgrounds`, `mixes/Baiee` (exact matches)
- Allows: `retro_dust`, `noise`, `grit`, and any user-created folders

**Implementation**:
- `api/video-folders.js`: Discovers folders by listing all files
- `worker/lib/VideoLoader.js`: Uses dynamic discovery (not hardcoded folderMap)
- `worker/lib/VideoSegmentCompositor.js`: Supports any folder key (not just known folders)

### 3. New Folder Creation During Upload

**Status**: ✅ Production Ready

**How It Works**:
- User can create new folders when uploading videos/images
- Radio buttons: "Existing Folder" or "New Folder"
- New folder name is sanitized (lowercase, hyphens for spaces)
- Folder automatically appears in folder selection UI after creation
- Firebase Storage rules allow dynamic folder creation

**Storage Rules**:
- Allows writes to any new folder (excluding `logos`, `paper_backgrounds`, `assets`)
- File size limit: 500MB (videos), 50MB (images)
- Content type validation: `video/*` or `image/*`

### 4. ArNS Integration

**Status**: ✅ Production Ready

**How It Works**:
- After successful website deployment, automatically updates ArNS record
- Points `undergroundexistence.ar.io` to the new manifest ID
- Uses `@ar.io/sdk` ANT (Arweave Name Token) SDK
- Non-blocking: deployment succeeds even if ArNS update fails

**Environment Variables**:
- `ARNS_ANT_PROCESS_ID`: ANT process ID
- `ARNS_NAME`: ArNS domain name (default: 'undergroundexistence')
- `ARWEAVE_WALLET_JWK`: Arweave wallet JSON (for signing transactions)

**Propagation Time**: ArNS updates may take 5-60 minutes to propagate

### 5. Firebase Usage Indicators

**Status**: ✅ Production Ready

**Features**:
- **Storage Usage**: Shows `6.4GB/1.0GB` format (converts to GB when >1GB)
- **Firestore Usage**: Shows `1.0K/50.0K` format (reads per day)
- **Status Dots**: Color-coded (red ≥90%, orange ≥75%, green <75%)
- **Cost Estimates**: Monthly cost estimates for Blaze plan
- **Auto-refresh**: Updates every 30 seconds

**API Endpoint**: `GET /api/usage?type=storage|firestore|both`

### 6. Website Deployment to Arweave

**Status**: ✅ Production Ready

**How It Works**:
- Syncs Firebase artists to `website/artists.json`
- Generates HTML pages for each artist
- Uploads website files to Arweave (via ArDrive Turbo SDK)
- Creates manifest and uploads manifest
- Updates ArNS record automatically
- Returns ArNS URL and direct Arweave URL

**API Endpoint**: `POST /api/deploy-website`

### 7. Archive Upload to Arweave

**Status**: ✅ Production Ready

**How It Works**:
- User selects folder and files from Firebase Storage
- System downloads files from Firebase Storage
- Uploads to Arweave via ArDrive Turbo SDK
- Creates archive manifest in Firestore
- Returns transaction IDs and Arweave URLs

**API Endpoint**: `POST /api/archive-upload`

---

## 🧩 System Components

### Frontend (`public/index.html`)

**Single-Page Application** with collapsible sections:

1. **UPLOAD** Section:
   - Upload videos/images to Firebase Storage
   - Create new folders or use existing
   - View uploaded videos by folder

2. **GENERATE** Section:
   - Step 1: Select audio source (DJ MIXES / ORIGINAL TRACKS)
   - Step 2: Select artist (for MIXES only)
   - Step 3: Select folders (dynamic discovery, default: chicago-skyline-videos, skyline, neighborhood)
   - Step 4: Add filter (currently hardcoded to Hard B&W Street Doc @ 80%)
   - Step 5: Overlay effect toggle
   - Step 6: Generate button
   - Step 7: View generated videos table

3. **DEPLOY** Section:
   - Deploy website to Arweave
   - View deployed site

4. **ARCHIVE** Section (archive.html):
   - Select folder and files
   - Archive to Arweave

**Key JavaScript Functions**:
- `generateVideo()`: Creates video generation job
- `handleVideoUpload()`: Uploads videos to Firebase Storage
- `loadVideos()`: Loads and displays generated videos
- `deployWebsite()`: Deploys website to Arweave
- `loadStorageUsage()`, `loadFirestoreUsage()`: Updates usage indicators

### API Layer (`api/`)

**12 Serverless Functions** (Vercel Hobby plan limit):

#### Core Video Functions

1. **`generate-video.js`**
   - Creates video generation jobs
   - Validates folder names (excludes reserved folders)
   - Triggers GitHub Actions webhook (optional)
   - Returns job ID immediately

2. **`videos.js`** (handles `/api/videos` and `/api/video-status`)
   - Lists all generated videos
   - Returns job status for specific job ID
   - Merges data from `videoJobs` and `videos` collections

3. **`video-folders.js`**
   - **Dynamically discovers** all folders in Firebase Storage
   - Returns folder list with video counts
   - Returns file list for specific folder
   - Generates signed URLs for video access

4. **`upload-video.js`**
   - Optimizes uploaded videos
   - Handles orientation detection
   - Returns optimized video URL

5. **`delete-video.js`**
   - Deletes videos from Firebase Storage
   - Updates UI after deletion

#### Usage & Management

6. **`usage.js`** (handles `/api/usage`, `/api/storage-usage`, `/api/firestore-usage`)
   - Calculates Firebase Storage usage and cost
   - Estimates Firestore usage (reads/writes) and cost
   - Returns formatted display strings

7. **`artists.js`**
   - Lists all artists from Firestore
   - Returns artist metadata

8. **`manage-artists.js`**
   - Creates/updates artists in Firestore
   - Handles artist image uploads

#### Deployment & Archive

9. **`deploy-website.js`** (handles `/api/deploy-website` and `/api/update-website`)
   - Syncs Firebase to `website/artists.json`
   - Generates HTML pages
   - Uploads website to Arweave
   - Updates ArNS record
   - Returns ArNS URL

10. **`archive-upload.js`** (handles `/api/archive-upload`, `/api/archive-status`, `/api/archive-manifest`)
    - Downloads files from Firebase Storage
    - Uploads to Arweave via Turbo SDK
    - Updates archive manifest

#### Utility

11. **`upload.js`**
    - General file upload handler
    - Handles artist images, media files

12. **`migrate-image-urls.js`**
    - Migrates image URLs in Firestore
    - Updates artist images to Arweave URLs

### Worker Layer (`worker/`)

#### Entry Point

**`processor.js`** (GitHub Actions entry point):
- Polls Firestore for pending jobs (every minute)
- Processes one job at a time
- Calls `ArweaveVideoGenerator.generateVideoWithAudio()`
- Uploads result to Firebase Storage
- Updates Firestore status
- Generates signed URLs (1 year expiry)

#### Core Libraries (`worker/lib/`)

1. **`ArweaveVideoGenerator.js`** (Main Orchestrator)
   - Coordinates entire video generation pipeline
   - Handles MIXES and TRACKS modes
   - Manages video loading, segment composition, overlays
   - **Key Method**: `generateVideoWithAudio(options)`

2. **`VideoLoader.js`** (Video Loading & Discovery)
   - **`loadTrackVideoReferences(returnGrouped, selectedFolders)`**: Returns file references (for TRACKS/MIXES)
   - **`loadAllSkylineVideos(returnGrouped, selectedFolders)`**: Downloads and caches videos (for MIXES)
   - **Dynamic folder discovery**: Discovers all folders from Firebase Storage
   - Caches videos locally for reuse
   - Returns grouped structure: `{ folder1: [...], folder2: [...] }`

3. **`VideoSegmentCompositor.js`** (Segment Extraction & Concatenation)
   - Extracts 5-second segments from videos
   - **Supports dynamic folder keys** (not just hardcoded folders)
   - Distributes segments across selected folders
   - Concatenates segments into final background video
   - Uses FFmpeg `filter_complex` for robust concatenation
   - **Key Method**: `createVideoFromSegments(videoPaths, targetDuration, segmentDuration, audioPath)`

4. **`VideoCompositor.js`** (Final Video Composition)
   - Overlays paper texture background
   - Adds logo images
   - Adds text layers (artist name, mix title, website URL)
   - Applies video filters
   - Combines with audio track
   - Uses FFmpeg `filter_complex` for multi-layer composition

5. **`ArweaveAudioClient.js`** (Audio Generation)
   - Fetches audio from Arweave
   - Supports both MIXES and TRACKS modes
   - Extracts segments of specified duration
   - Returns audio file path and metadata
   - Uses system FFmpeg in GitHub Actions

6. **`DALLEImageGenerator.js`** (AI Background Generation)
   - Generates background images using OpenAI DALL-E 3
   - Fallback when video backgrounds aren't available
   - Caches generated images

7. **`ImageLoader.js`** (Image Loading & Caching)
   - Loads images from URLs
   - Loads images from Firebase Storage
   - Caches images locally

8. **`VideoFilters.js`** (Video Filter Definitions)
   - Defines video filter presets
   - Applies filter intensity scaling
   - Returns FFmpeg filter strings

9. **`VideoOptimizer.js`** (Video Optimization)
   - Optimizes video files
   - Handles compression and encoding

### Shared Libraries (`lib/`)

1. **`firebase-admin.js`**
   - Initializes Firebase Admin SDK
   - Provides `getFirestore()`, `getStorage()` helpers
   - Used by both API and worker layers

2. **`ArNSUpdater.js`**
   - Updates ArNS records using `@ar.io/sdk`
   - Parses wallet JWK from environment
   - Returns ArNS URL on success

3. **`WebsiteDeployer.js`**
   - Deploys website files to Arweave
   - Uses ArDrive Turbo SDK
   - Creates and uploads manifest

4. **`WebsiteSync.js`**
   - Syncs Firebase artists to `website/artists.json`
   - Handles artist metadata transformation

5. **`WebsitePageGenerator.js`** / **`WebsitePageGenerator.cjs`**
   - Generates HTML pages for each artist
   - Updates index.html with artist grid

6. **`DeploymentTracker.js`**
   - Tracks file changes between deployments
   - Only uploads changed files to Arweave

7. **`ArweaveUploader.js`**
   - Handles Arweave uploads via Turbo SDK
   - Manages wallet authentication

8. **`ArweaveCostCalculator.js`**
   - Calculates Arweave upload costs

---

## 📡 API Reference

### Video Generation

#### `POST /api/generate-video`

Creates a video generation job.

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

**Response**:
```json
{
  "success": true,
  "jobId": "uuid-here",
  "status": "pending",
  "message": "Video generation job created. Processing will begin shortly.",
  "estimatedTime": "10-20 seconds"
}
```

**Validation**:
- `selectedFolders` must be an array with at least one folder
- Folder names must be valid (lowercase, alphanumeric, hyphens, underscores, slashes)
- Excludes: `logos`, `paper_backgrounds`, `mixes`, `mixes/baiee`, `mixes/bai-ee`

### Video Status & List

#### `GET /api/videos`

Lists all generated videos.

**Response**:
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
      "createdAt": "2025-12-13T...",
      "completedAt": "2025-12-13T..."
    }
  ],
  "count": 15
}
```

#### `GET /api/video-status?jobId={jobId}`

Gets status of a specific video job.

**Response**:
```json
{
  "success": true,
  "jobId": "job-id",
  "status": "processing",
  "videoUrl": null,
  "createdAt": "2025-12-13T...",
  "completedAt": null
}
```

### Folder Management

#### `GET /api/video-folders`

Lists all available folders (dynamically discovered).

**Response**:
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
    }
  ]
}
```

#### `GET /api/video-folders?folder={folderName}`

Lists files in a specific folder.

**Response**:
```json
{
  "success": true,
  "folder": "rositas",
  "videos": [
    {
      "name": "user_upload_1765661962768_0_IMG_5176.mov",
      "fullPath": "rositas/user_upload_1765661962768_0_IMG_5176.mov",
      "publicUrl": "https://storage.googleapis.com/...",
      "size": 12345678
    }
  ],
  "count": 2
}
```

### Usage Tracking

#### `GET /api/usage?type=storage`

Gets Firebase Storage usage and cost estimate.

**Response**:
```json
{
  "success": true,
  "storage": {
    "usedMB": 6469,
    "limitMB": 1024,
    "estimatedStorageCost": 0.14,
    "formatted": {
      "display": "6469/1024MB",
      "cost": "$0.14"
    },
    "percentage": 631.35
  }
}
```

#### `GET /api/usage?type=firestore`

Gets Firestore usage and cost estimate.

**Response**:
```json
{
  "success": true,
  "firestore": {
    "estimatedDailyReads": 1000,
    "freeTierReadsPerDay": 50000,
    "estimatedTotalCost": 0.00,
    "formatted": {
      "readsDisplay": "1.0K/50.0K",
      "cost": "$0.00"
    },
    "readsPercentage": 2.0
  }
}
```

### Website Deployment

#### `POST /api/deploy-website`

Deploys website to Arweave and updates ArNS.

**Response**:
```json
{
  "success": true,
  "manifestId": "arweave-tx-id",
  "manifestUrl": "https://arweave.net/.../manifest.json",
  "websiteUrl": "https://arweave.net/.../index.html",
  "arnsUrl": "https://undergroundexistence.ar.io",
  "filesUploaded": 56,
  "filesUnchanged": 0,
  "totalFiles": 56,
  "costEstimate": 0.001
}
```

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

**Response**:
```json
{
  "success": true,
  "transactionId": "arweave-tx-id",
  "arweaveUrl": "https://arweave.net/...",
  "turboUrl": "https://turbo.ardrive.io/...",
  "cost": 0.0001
}
```

---

## 🔧 Development Workflow

### Local Development

1. **Setup Environment**:
   ```bash
   cd worker
   node setup-firebase-env.js
   # Paste Firebase service account JSON
   ```

2. **Test Video Generation**:
   ```bash
   cd worker
   node test-local.js
   ```

3. **Test Specific Features**:
   ```bash
   # Test folder combinations
   node test-multiple-folder-combinations.js
   
   # Test artist image feature
   cd worker && node test-artist-image.js
   
   # Test ArNS
   node test-arns.js
   
   # Check ArNS record
   node check-arns-record.js
   ```

4. **Update Artist Images from Manifest**:
   ```bash
   # Extract Arweave URLs from deployment manifest and update artist JSON
   node update-artist-images-from-manifest.js
   ```
   - Loads manifest from Firebase (`system/deployment-manifest`)
   - Maps `img/artists/*` paths to artist names
   - Constructs Arweave URLs from transaction IDs
   - Updates `artistThumbnails` arrays in artist JSON
   - Syncs updates to Firebase

### Code Structure Guidelines

#### Adding New API Endpoints

**⚠️ CRITICAL**: Vercel Hobby plan limit is **12 serverless functions**. We're currently at 12.

**If you need a new endpoint**:
1. **Option 1**: Combine with existing endpoint (e.g., `usage.js` handles multiple routes)
2. **Option 2**: Upgrade to Vercel Pro plan
3. **Option 3**: Remove an unused endpoint

**Example - Combined Endpoint**:
```javascript
// api/usage.js handles multiple routes via vercel.json:
// /api/usage
// /api/storage-usage  
// /api/firestore-usage

export default async function handler(req, res) {
  const { type } = req.query || {};
  const includeStorage = !type || type === 'storage' || type === 'both';
  const includeFirestore = !type || type === 'firestore' || type === 'both';
  // ... handle both
}
```

#### Adding New Folders

**✅ No Code Changes Needed**:
- System automatically discovers new folders
- Users can create folders during upload
- Folders automatically appear in selection UI
- VideoLoader supports any folder dynamically

**Only Exclusions**:
- `logos`, `paper_backgrounds` (image-only folders)
- `mixes/Baiee`, `mixes/bai-ee` (exact matches only)

#### Modifying Video Generation Pipeline

**⚠️ CRITICAL**: The pipeline order is important:

1. **Audio Generation** (ArweaveAudioClient)
2. **Video Loading** (VideoLoader - dynamic discovery)
3. **Segment Composition** (VideoSegmentCompositor - supports dynamic folders)
4. **Final Composition** (VideoCompositor - overlays, filters)
5. **Upload** (Firebase Storage)

**Don't change the order without understanding dependencies.**

#### Adding New Video Filters

1. **Add to `VideoFilters.js`**:
   ```javascript
   export const VIDEO_FILTERS = {
     'new_filter': {
       name: 'New Filter',
       baseFilter: 'scale=720:720...',
       getFilter: (intensity) => applyFilterIntensity(baseFilter, intensity)
     }
   };
   ```

2. **Update Frontend** (if exposing to users):
   - Add option to filter select dropdown
   - Update `updateFilterSelection()` function

3. **Test Locally**:
   ```bash
   cd worker
   node test-local.js
   ```

---

## 🔐 Environment Setup

### Required Environment Variables

#### Vercel (Production)

Set in Vercel Dashboard → Project → Settings → Environment Variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Full Firebase service account JSON (stringified) | `{"type":"service_account",...}` |
| `FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket name | `editvideos-63486.firebasestorage.app` |
| `GITHUB_TOKEN` | GitHub personal access token (for webhook triggers) | `ghp_...` |
| `GITHUB_REPO` | GitHub repository (owner/repo) | `Bai-ee/arweave-video-generator` |
| `ARWEAVE_WALLET_JWK` | Arweave wallet JSON (stringified) | `{"kty":"RSA",...}` |
| `ARNS_ANT_PROCESS_ID` | ArNS ANT process ID | `tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw` |
| `ARNS_NAME` | ArNS domain name | `undergroundexistence` |
| `OPENAI_API_KEY` | OpenAI API key (for DALL-E fallback) | `sk-proj-...` |

#### GitHub Actions (Video Processing)

Set in GitHub → Repository → Settings → Secrets and variables → Actions:

| Variable | Description |
|----------|-------------|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Same as Vercel |
| `FIREBASE_STORAGE_BUCKET` | Same as Vercel |
| `OPENAI_API_KEY` | Same as Vercel |

**Note**: `GITHUB_ACTIONS` is automatically set to `'true'` in the workflow.

### Firebase Setup

1. **Create Firebase Project**:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create new project: `editvideos-63486`
   - Enable Firestore and Storage

2. **Get Service Account Key**:
   - Project Settings → Service Accounts
   - Generate new private key
   - Copy entire JSON, stringify for environment variable

3. **Deploy Storage Rules**:
   - Storage → Rules
   - Copy contents of `storage.rules`
   - Paste and Publish

4. **Initialize Firestore Collections**:
   - Firestore → Create Collection
   - Collections: `videoJobs`, `videos`, `artists`, `archiveJobs`, `archiveManifest`

### Arweave Setup

1. **Create Arweave Wallet**:
   - Use [Arweave Wallet](https://arweave.app/) or generate programmatically
   - Fund wallet with AR tokens

2. **Get Wallet JWK**:
   - Export wallet as JSON
   - Stringify for `ARWEAVE_WALLET_JWK` environment variable

3. **Register ArNS Domain** (if needed):
   - Go to [arns.app](https://arns.app/)
   - Register domain: `undergroundexistence`
   - Get ANT Process ID for `ARNS_ANT_PROCESS_ID`

---

## 🚀 Deployment

### Vercel Deployment

**Automatic** (on git push to main):
```bash
git push origin main
# Vercel automatically deploys
```

**Manual**:
```bash
vercel --prod
```

### GitHub Actions

**Automatic** (runs every minute):
- Workflow: `.github/workflows/process-videos.yml`
- Triggers: Cron schedule (`*/1 * * * *`)
- Also supports: Manual trigger, webhook trigger

**Manual Trigger**:
- GitHub → Actions → "Process Video Jobs" → Run workflow

### Firebase Storage Rules

**Deploy Rules**:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Storage → Rules
3. Copy contents of `storage.rules`
4. Paste and Publish

**Current Rules**:
- Allow public read access to all files
- Allow public write to specific folders (with size/type validation)
- Allow dynamic folder creation (excludes `logos`, `paper_backgrounds`, `assets`)

---

## 🛡️ Future-Proofing Guidelines

### ⚠️ CRITICAL: Don't Break These

1. **Dynamic Folder Discovery**
   - ✅ **DO**: Use `VideoLoader.discoverFolders()` or `api/video-folders.js` discovery
   - ❌ **DON'T**: Hardcode folder lists
   - **Why**: Users can create new folders; system must support them automatically

2. **VideoLoader Methods**
   - ✅ **DO**: Both `loadTrackVideoReferences()` and `loadAllSkylineVideos()` use dynamic discovery
   - ❌ **DON'T**: Add hardcoded `folderMap` objects
   - **Why**: New folders won't work if you hardcode folder lists

3. **VideoSegmentCompositor Folder Keys**
   - ✅ **DO**: Check all keys in `videoPaths` object, not just known folders
   - ❌ **DON'T**: Only check `['equipment', 'decks', 'skyline', ...]`
   - **Why**: New folders like 'rositas' won't be processed if you only check known keys

4. **API Function Count**
   - ✅ **DO**: Combine related endpoints (e.g., `usage.js` handles multiple routes)
   - ❌ **DON'T**: Create new API files without removing old ones
   - **Why**: Vercel Hobby plan limit is 12 functions (we're at the limit)

5. **Folder Name Validation**
   - ✅ **DO**: Only exclude exact matches (`mixes/baiee`, not `mixes/*`)
   - ❌ **DON'T**: Use broad exclusions that block valid folders
   - **Why**: Folders like `retro_dust`, `noise`, `grit` should work

### ✅ Safe Extension Patterns

#### Adding New Features

1. **New Video Filter**:
   - Add to `VideoFilters.js` ✅
   - Update frontend filter select ✅
   - Test locally ✅
   - **Safe**: Doesn't break existing functionality

2. **New Overlay Type**:
   - Add to `VideoCompositor.js` ✅
   - Add layer configuration ✅
   - **Safe**: Extends existing overlay system

3. **New API Endpoint**:
   - **⚠️ Check function count first**
   - Combine with existing endpoint if possible ✅
   - Or remove unused endpoint ✅

4. **New Folder Type**:
   - **No code changes needed** ✅
   - System automatically discovers it ✅
   - **Safe**: Dynamic discovery handles it

#### Modifying Existing Features

1. **Changing Video Generation Pipeline**:
   - ⚠️ **Test thoroughly** - pipeline order matters
   - ⚠️ **Don't remove steps** - each step has dependencies
   - ✅ **Add new steps** - safe if you understand dependencies

2. **Modifying Folder Selection**:
   - ✅ **Safe**: Add UI improvements
   - ⚠️ **Don't change** `selectedFolders` array format
   - ⚠️ **Don't change** folder name normalization logic

3. **Updating VideoLoader**:
   - ✅ **Safe**: Improve discovery logic
   - ❌ **Don't**: Add hardcoded folder lists
   - ✅ **Safe**: Add better error handling

### 🔒 Immutable Contracts

These are **contracts** that other parts of the system depend on. **Don't change** without updating all dependents:

1. **Firestore Schema**:
   - `videoJobs` collection structure
   - `videos` collection structure
   - Status values: `'pending' | 'processing' | 'completed' | 'failed'`

2. **API Response Formats**:
   - `/api/generate-video` response structure
   - `/api/videos` response structure
   - `/api/video-folders` response structure

3. **VideoLoader Return Format**:
   - Grouped structure: `{ folder1: [...], folder2: [...] }`
   - File references (for `loadTrackVideoReferences`)
   - Cached paths (for `loadAllSkylineVideos`)

4. **VideoSegmentCompositor Input**:
   - Accepts grouped structure: `{ folder1: [...], folder2: [...] }`
   - Supports dynamic folder keys (not just known folders)

---

## 🐛 Troubleshooting

### Video Generation Fails

**Symptoms**: Job stuck in 'processing' or status 'failed'

**Check**:
1. GitHub Actions logs: https://github.com/Bai-ee/arweave-video-generator/actions
2. Look for FFmpeg errors
3. Check if videos exist in selected folders
4. Verify folder names match exactly (case-insensitive)

**Common Issues**:
- **"No video paths provided"**: Folder not found or empty
  - **Fix**: Check `VideoSegmentCompositor` supports dynamic folder keys
  - **Fix**: Verify folder exists in Firebase Storage
- **"Invalid folder names"**: Folder excluded by validation
  - **Fix**: Check `api/generate-video.js` exclusion list
  - **Fix**: Verify folder name format (lowercase, alphanumeric, hyphens)

### ArNS Not Resolving

**Symptoms**: `undergroundexistence.ar.io` shows placeholder or doesn't resolve

**Check**:
1. Vercel logs for ArNS update success message
2. ArNS transaction on Arweave: `https://viewblock.io/arweave/tx/{txId}`
3. ArNS dashboard: https://arns.app/

**Common Issues**:
- **Propagation delay**: ArNS updates take 5-60 minutes
  - **Fix**: Wait, then check again
- **Transaction not confirmed**: Check transaction status on Arweave
  - **Fix**: Verify transaction is confirmed
- **Wrong manifest ID**: Check ArNS record points to correct manifest
  - **Fix**: Manually update in ArNS dashboard if needed

### New Folders Not Appearing

**Symptoms**: Created folder doesn't show in selection UI

**Check**:
1. Folder exists in Firebase Storage
2. Folder has at least one video file
3. Folder name is valid (not excluded)

**Common Issues**:
- **Folder excluded**: Check exclusion list in `api/generate-video.js` and `api/video-folders.js`
  - **Fix**: Verify folder name doesn't match excluded patterns
- **No files in folder**: Empty folders won't appear
  - **Fix**: Upload at least one video to the folder

### Firebase Storage Permission Errors

**Symptoms**: "User does not have permission" when uploading

**Check**:
1. Firebase Storage rules are deployed
2. Folder name is allowed by rules
3. File size is under limit (500MB videos, 50MB images)

**Fix**:
- Deploy updated `storage.rules` to Firebase Console
- Verify rules allow dynamic folder creation

---

## 📚 Additional Documentation

- **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)**: Detailed architecture documentation
- **[FEATURES.md](./FEATURES.md)**: Complete feature list and verification status
- **[DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)**: Development best practices and patterns
- **[DEPLOYMENT.md](./DEPLOYMENT.md)**: Deployment procedures
- **[ARNS_SETUP.md](./ARNS_SETUP.md)**: ArNS integration setup
- **[FIREBASE_STORAGE_RULES.md](./FIREBASE_STORAGE_RULES.md)**: Storage rules documentation

---

## 📝 Version History

### v1.1.0 (December 2025) - Artist Thumbnails Update

**New Features**:
- ✅ Multiple artist thumbnails support (Arweave URLs stored in `artistThumbnails` array)
- ✅ Artist thumbnail toggle in video generation UI (step 9)
- ✅ Artist image update script (`update-artist-images-from-manifest.js`)
- ✅ Artist thumbnails used as last 2 video segments (5th & 6th, last 10 seconds) when enabled
- ✅ Mix selection dropdown (populated based on selected artist)

**Technical Changes**:
- Updated `api/upload.js` to store artist thumbnails as Arweave URLs only
- Added `useArtistImage` parameter to video generation API (default: true)
- Modified `ArweaveVideoGenerator.js` to conditionally use artist image based on toggle
- Created `update-artist-images-from-manifest.js` script for bulk artist image updates
- Updated `VideoSegmentCompositor.js` to create image video segments from Arweave URLs

### v1.0.0 (December 2025) - Production MVP

**Core Features**:
- ✅ Video generation with dynamic folder selection
- ✅ ArNS integration (automatic domain updates)
- ✅ Website deployment to Arweave
- ✅ Firebase usage indicators
- ✅ New folder creation during upload
- ✅ Archive upload to Arweave
- ✅ Dynamic folder discovery (no hardcoded lists)

**Recent Improvements**:
- Dynamic folder discovery in VideoLoader
- Support for user-created folders (rositas, retro_dust, etc.)
- Combined API endpoints to fit Vercel Hobby plan (12 function limit)
- Enhanced folder matching logic
- Improved error handling and logging

---

**Last Updated**: December 2025  
**Maintained By**: Development Team  
**Status**: ✅ Production Ready MVP








