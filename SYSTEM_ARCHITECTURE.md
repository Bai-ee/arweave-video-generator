# System Architecture Documentation

## Overview

The Arweave Video Generator is a production-ready system that creates branded music videos by combining audio from Arweave decentralized storage with video segments from Firebase Storage. The system uses a serverless architecture with Firebase, Vercel, and GitHub Actions.

## Technology Stack

- **Frontend**: HTML/JavaScript (single-page application)
- **Backend API**: Vercel Serverless Functions (Node.js)
- **Video Processing**: GitHub Actions (runs FFmpeg)
- **Storage**: Firebase Storage (videos, images, assets)
- **Database**: Firestore (job tracking, metadata)
- **Audio Source**: Arweave decentralized storage
- **Archive Storage**: Arweave (via ArDrive Turbo SDK)
- **Video Processing**: FFmpeg (segment extraction, concatenation, composition)

**Important**: This system uses **Firebase only** - no Google Cloud Console configuration is required. All operations use Firebase Admin SDK.

## High-Level Architecture

```
┌─────────────────┐
│   User Browser  │
└────────┬────────┘
         │
         │ HTTP Requests
         ▼
┌─────────────────────────────────────┐
│         Vercel (Frontend + API)      │
│  ┌─────────────────────────────────┐ │
│  │  Static HTML/JS (index.html)   │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │  API Endpoints:                  │ │
│  │  - /api/generate-video          │ │
│  │  - /api/video-status            │ │
│  │  - /api/videos                  │ │
│  │  - /api/video-folders           │ │
│  │  - /api/upload-video             │ │
│  │  - /api/archive-upload           │ │
│  └─────────────────────────────────┘ │
└────────┬─────────────────────────────┘
         │
         │ Firebase Admin SDK
         ▼
┌─────────────────────────────────────┐
│         Firebase Services          │
│  ┌───────────────────────────────┐ │
│  │     Firestore (Database)      │ │
│  │  - videoJobs collection        │ │
│  │  - videos collection           │ │
│  │  - archiveJobs collection      │ │
│  │  - archiveManifest collection   │ │
│  └───────────────────────────────┘ │
│  ┌───────────────────────────────┐ │
│  │  Firebase Storage (Files)     │ │
│  │  - videos/ (generated videos)  │ │
│  │  - skyline/, decks/, etc.      │ │
│  │  - assets/chicago-skyline-...  │ │
│  └───────────────────────────────┘ │
└────────┬─────────────────────────────┘
         │
         │ Webhook Trigger
         ▼
┌─────────────────────────────────────┐
│      GitHub Actions Workflow        │
│  ┌─────────────────────────────────┐ │
│  │  Runs every minute (cron)       │ │
│  │  - Checks for pending jobs      │ │
│  │  - Processes video generation   │ │
│  │  - Uses FFmpeg for processing   │ │
│  └─────────────────────────────────┘ │
└────────┬─────────────────────────────┘
         │
         │ Uploads result
         ▼
┌─────────────────────────────────────┐
│      Firebase Storage              │
│  (Generated videos stored here)    │
└─────────────────────────────────────┘
```

## Component Architecture

### 1. Frontend (`public/index.html`)

**Responsibilities**:
- User interface for video generation
- Folder selection (checkboxes)
- Video upload interface
- Video list display with polling
- Archive interface (`archive.html`)

**Key Features**:
- Audio source selection (MIXES vs TRACKS)
- Folder selection for video sources
- Real-time job status polling
- Direct Firebase Storage uploads (bypasses Vercel 10MB limit)

### 2. API Layer (`api/`)

#### `generate-video.js`
- Creates video generation jobs in Firestore
- Accepts: duration, artist, selectedFolders, useTrax, videoFilter
- Triggers GitHub Actions workflow via webhook (optional)
- Returns job ID immediately (async processing)

#### `video-status.js`
- Polls job status from Firestore
- Returns current status (pending/processing/completed/failed)

#### `videos.js`
- Lists all generated videos
- Aggregates data from `videoJobs` and `videos` collections

#### `video-folders.js`
- Lists available folders in Firebase Storage
- Returns folder counts and file lists
- Generates signed URLs for video access (CORS-compliant)

#### `upload-video.js`
- Optimizes videos uploaded to Firebase Storage
- Handles orientation, compression
- Returns optimized video URL

#### `archive-upload.js`
- Downloads files from Firebase Storage
- Uploads to Arweave via Turbo SDK
- Updates archive manifest in Firestore

### 3. Worker Layer (`worker/`)

#### `processor.js` (GitHub Actions Entry Point)
- Polls Firestore for pending jobs
- Processes one job at a time
- Calls `ArweaveVideoGenerator` to create video
- Uploads result to Firebase Storage
- Updates job status in Firestore
- Uses signed URLs for video access (CORS-compliant)

#### `lib/ArweaveVideoGenerator.js`
**Main Orchestrator**:
- Coordinates audio generation
- Loads video segments from selected folders
- Creates video background from segments
- Applies overlays (paper texture, logos, text)
- Composes final video with audio

**Key Methods**:
- `generateVideoWithAudio(options)` - Main entry point
- Handles both MIXES and TRACKS modes
- Uses `VideoLoader` to get videos from selected folders
- Uses `VideoSegmentCompositor` to create background video
- Uses `VideoCompositor` to add overlays

#### `lib/VideoLoader.js`
**Video Loading and Caching**:
- `loadAllSkylineVideos(returnGrouped, selectedFolders)` - For MIXES
- `loadTrackVideoReferences(returnGrouped, selectedFolders)` - For TRACKS
- Downloads videos from Firebase Storage
- Caches videos locally for reuse
- Returns grouped structure: `{ folder1: [...], folder2: [...] }`

#### `lib/VideoSegmentCompositor.js`
**Segment Extraction and Concatenation**:
- Extracts 5-second segments from videos
- Distributes segments across selected folders
- Concatenates segments into final background video
- Uses FFmpeg `filter_complex` for robust concatenation
- Validates segments (skips corrupted/empty files)

#### `lib/VideoCompositor.js`
**Final Video Composition**:
- Overlays paper texture background
- Adds logo images
- Adds text layers ("Mix Archive")
- Applies video filters
- Combines with audio track

#### `lib/ArweaveAudioClient.js`
**Audio Generation**:
- Fetches audio from Arweave
- Supports both MIXES and TRACKS
- Extracts segments of specified duration
- Returns audio file path and metadata

#### `lib/ArweaveUploader.js`
**Arweave Integration**:
- Uploads files to Arweave via Turbo SDK
- Handles wallet authentication
- Returns transaction IDs and URLs
- Supports metadata tagging

## Data Flow

### Video Generation Flow

1. **User Action**: User selects audio source, folders, and clicks "Generate Video"
2. **Frontend**: Sends POST to `/api/generate-video` with:
   - `selectedFolders`: Array of folder names
   - `useTrax`: Boolean (true for tracks, false for mixes)
   - `artist`: Artist name or 'random'
   - `duration`: Video duration (default 30s)
3. **API**: Creates job in Firestore `videoJobs` collection with status 'pending'
4. **GitHub Actions**: Workflow runs every minute, finds pending job
5. **Worker**: 
   - Updates status to 'processing'
   - Loads videos from selected folders
   - Extracts 5-second segments
   - Concatenates segments into background video
   - Applies overlays and audio
   - Uploads to Firebase Storage
   - Generates signed URL (1 year expiry)
   - Updates Firestore with status 'completed' and videoUrl
6. **Frontend**: Polls `/api/video-status` until completed, displays video

### Video Upload Flow

1. **User Action**: User clicks "Upload Video", selects files and folder
2. **Frontend**: Uploads directly to Firebase Storage using Firebase SDK
   - Bypasses Vercel 10MB limit
   - Shows progress for each file
   - Files stored in selected folder path
3. **Storage**: Files are automatically public after upload
4. **Frontend**: Displays success message, refreshes folder view

### Arweave Archive Flow

1. **User Action**: User navigates to archive page, selects folder and files
2. **Frontend**: Sends POST to `/api/archive-upload` for each file
3. **API**: 
   - Downloads file from Firebase Storage
   - Uploads to Arweave via Turbo SDK
   - Creates job in `archiveJobs` collection
   - Updates `archiveManifest` collection
4. **Response**: Returns transaction ID and Arweave URLs
5. **Frontend**: Displays upload status, links to Arweave URLs

## Folder Structure

```
arweave-video-generator/
├── api/                    # Vercel serverless functions
│   ├── generate-video.js
│   ├── video-status.js
│   ├── videos.js
│   ├── video-folders.js
│   ├── upload-video.js
│   ├── archive-upload.js
│   └── ...
├── worker/                 # GitHub Actions worker code
│   ├── processor.js        # Main entry point
│   ├── lib/
│   │   ├── ArweaveVideoGenerator.js
│   │   ├── VideoLoader.js
│   │   ├── VideoSegmentCompositor.js
│   │   ├── VideoCompositor.js
│   │   ├── ArweaveAudioClient.js
│   │   └── ...
│   └── data/              # Artist data
├── lib/                    # Shared libraries
│   ├── firebase-admin.js
│   └── ArweaveUploader.js
├── public/                 # Frontend files
│   ├── index.html
│   ├── archive.html
│   └── ...
├── .github/workflows/     # GitHub Actions
│   └── process-videos.yml
└── vercel.json             # Vercel configuration
```

## Firebase Storage Structure

```
Firebase Storage:
├── videos/                 # Generated videos
│   └── {jobId}.mp4
├── skyline/                # Skyline video clips
├── decks/                  # DJ decks video clips
├── equipment/              # Equipment video clips
├── neighborhood/           # Neighborhood video clips
├── artist/                 # Artist video clips
├── family/                 # Family video clips
├── assets/
│   └── chicago-skyline-videos/  # Chicago skyline videos
├── logos/                  # Logo images
└── paper_backgrounds/       # Paper texture images
```

## Firestore Collections

### `videoJobs`
- **Document ID**: Job ID (UUID)
- **Fields**:
  - `jobId`: String
  - `status`: String ('pending' | 'processing' | 'completed' | 'failed')
  - `artist`: String
  - `duration`: Number
  - `selectedFolders`: Array of strings
  - `useTrax`: Boolean
  - `videoUrl`: String (signed URL)
  - `createdAt`: Timestamp
  - `completedAt`: Timestamp
  - `metadata`: Object (fileName, fileSize, mixTitle)

### `videos`
- **Document ID**: Job ID
- **Fields**: Similar to videoJobs, used for easier querying

### `archiveJobs`
- **Document ID**: Archive job ID
- **Fields**:
  - `folder`: String
  - `fileName`: String
  - `status`: String
  - `transactionId`: String
  - `arweaveUrl`: String
  - `turboUrl`: String

### `archiveManifest`
- **Document ID**: 'main'
- **Fields**:
  - `version`: String
  - `lastUpdated`: Timestamp
  - `folders`: Object (folder name -> files array)

## CORS and URL Generation

**All video URLs use signed URLs** for CORS compliance:
- `worker/processor.js`: Uses `getSignedUrl()` (1 year expiry)
- `api/video-folders.js`: Uses `getSignedUrl()` (1 hour expiry, fallback to public)
- `api/upload-video.js`: Uses `getSignedUrl()` (1 year expiry)

**No Google Cloud Console configuration required** - signed URLs work automatically with Firebase Admin SDK.

## Environment Variables

### Vercel
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Firebase service account JSON (stringified)
- `FIREBASE_STORAGE_BUCKET`: Firebase Storage bucket name
- `GITHUB_TOKEN`: GitHub personal access token (for webhook triggers)
- `GITHUB_REPO`: GitHub repository (owner/repo format)
- `ARWEAVE_WALLET_JWK`: Arweave wallet JSON (stringified)
- `ARWEAVE_WALLET_ADDRESS`: Arweave wallet address
- `ARWEAVE_DRIVE_ID`: ArDrive drive ID (optional)
- `ARWEAVE_FOLDER_ID`: ArDrive folder ID (optional)
- `OPENAI_API_KEY`: OpenAI API key (for DALL-E fallback, optional)

### GitHub Actions
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Same as Vercel
- `FIREBASE_STORAGE_BUCKET`: Same as Vercel
- `OPENAI_API_KEY`: Same as Vercel
- `GITHUB_ACTIONS`: Set to 'true' (indicates running in GitHub Actions)

## Deployment Architecture

### Frontend and API (Vercel)
- Deployed automatically on git push
- Serverless functions handle API requests
- Static files served from `public/` directory
- Function timeout: 10-120 seconds (varies by endpoint)

### Video Processing (GitHub Actions)
- Runs on schedule (every minute)
- Can be triggered manually or via webhook
- Uses Ubuntu runner with FFmpeg installed
- Processes one job at a time
- Timeout: 5 minutes

## Security Considerations

1. **CORS**: All video URLs use signed URLs (no CORS configuration needed)
2. **Authentication**: Firebase Admin SDK uses service account (server-side only)
3. **File Access**: Files are made public after upload, but signed URLs provide better security
4. **Environment Variables**: Stored securely in Vercel and GitHub Secrets
5. **No Google Cloud Console**: All operations use Firebase Admin SDK only

## Scalability

- **Horizontal Scaling**: Vercel functions scale automatically
- **Job Processing**: Currently processes one job at a time (can be increased)
- **Video Storage**: Firebase Storage scales automatically
- **Database**: Firestore scales automatically
- **Rate Limits**: Vercel has function execution limits (Hobby plan: 100GB-hours/month)

## Monitoring and Logging

- **Vercel**: Function logs available in Vercel dashboard
- **GitHub Actions**: Workflow logs available in Actions tab
- **Firebase**: Firestore and Storage operations logged in Firebase Console
- **Error Handling**: Errors logged to console, job status updated in Firestore


