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
- **Dynamically discovers** all folders in Firebase Storage (no hardcoded list)
- Returns folder counts and file lists
- Generates signed URLs for video access (CORS-compliant)
- Supports any user-created folders (e.g., 'rositas', 'retro_dust', 'noise')
- Excludes only: `logos`, `paper_backgrounds`, `mixes/Baiee` (exact matches)

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
**Video Loading and Dynamic Discovery**:
- `loadAllSkylineVideos(returnGrouped, selectedFolders)` - For MIXES (downloads and caches)
- `loadTrackVideoReferences(returnGrouped, selectedFolders)` - For TRACKS/MIXES (returns file references)
- **Dynamically discovers folders** from Firebase Storage (no hardcoded folderMap)
- Supports any user-created folders automatically
- Downloads videos from Firebase Storage (for MIXES mode)
- Caches videos locally for reuse
- Returns grouped structure: `{ folder1: [...], folder2: [...] }`
- **Key Feature**: Works with new folders like 'rositas' without code changes

#### `lib/VideoSegmentCompositor.js`
**Segment Extraction and Concatenation**:
- Extracts 5-second segments from videos
- **Supports dynamic folder keys** (not just hardcoded folders like 'equipment', 'decks')
- Distributes segments across selected folders
- Concatenates segments into final background video
- Uses FFmpeg `filter_complex` for robust concatenation
- Validates segments (skips corrupted/empty files)
- **Key Feature**: Processes any folder in `videoPaths` object, not just known folders

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

#### `lib/ArNSUpdater.js`
**ArNS (Arweave Name System) Integration**:
- Updates ArNS records to point to deployment manifest IDs
- Uses `@ar.io/sdk` ANT (Arweave Name Token) SDK
- Parses wallet JWK from environment variables
- Returns ArNS URL (e.g., `https://undergroundexistence.ar.io`)
- Non-blocking: deployment succeeds even if ArNS update fails

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

**Important**: Folder structure is **dynamically discovered**. The system supports **any folder** created by users.

```
Firebase Storage:
├── videos/                 # Generated videos
│   └── {jobId}.mp4
├── skyline/                # Skyline video clips (user uploads)
├── decks/                  # DJ decks video clips (user uploads)
├── equipment/              # Equipment video clips (user uploads)
├── neighborhood/           # Neighborhood video clips (user uploads)
├── artist/                 # Artist video clips (user uploads)
├── family/                 # Family video clips (user uploads)
├── assets/
│   ├── chicago-skyline-videos/  # Chicago skyline videos (pre-generated)
│   ├── analog_film/        # Overlay videos
│   ├── gritt/              # Overlay videos
│   ├── noise/              # Overlay videos
│   └── retro_dust/         # Overlay videos
├── logos/                  # Logo images (excluded from video selection)
├── paper_backgrounds/      # Paper texture images (excluded from video selection)
└── {any-new-folder}/       # User-created folders (dynamically discovered)
    └── user_upload_*.mov   # User-uploaded videos
```

**Dynamic Discovery**:
- System automatically finds all folders by listing files
- No hardcoded folder lists in code
- New folders appear automatically in selection UI
- Only excludes: `logos`, `paper_backgrounds`, `mixes/Baiee` (exact matches)

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
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Firebase service account JSON (stringified, required)
- `FIREBASE_STORAGE_BUCKET`: Firebase Storage bucket name (required)
- `GITHUB_TOKEN`: GitHub personal access token (for webhook triggers, optional)
- `GITHUB_REPO`: GitHub repository (owner/repo format, optional)
- `ARWEAVE_WALLET_JWK`: Arweave wallet JSON (stringified, required for ArNS and archive)
- `ARNS_ANT_PROCESS_ID`: ArNS ANT process ID (required for ArNS updates)
- `ARNS_NAME`: ArNS domain name (default: 'undergroundexistence', optional)
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
- **Usage Indicators**: Real-time Firebase Storage and Firestore usage displayed in UI

## Key Architectural Decisions

### 1. Dynamic Folder Discovery
**Decision**: System discovers folders dynamically instead of hardcoding folder lists.

**Why**: 
- Users can create new folders on-the-fly
- No code changes needed for new folders
- Future-proof and scalable

**Implementation**:
- `api/video-folders.js`: Lists all files, extracts unique folder names
- `worker/lib/VideoLoader.js`: Uses dynamic discovery in both `loadTrackVideoReferences()` and `loadAllSkylineVideos()`
- `worker/lib/VideoSegmentCompositor.js`: Processes any folder key in `videoPaths` object

**⚠️ CRITICAL**: Never add hardcoded folder lists. Always use dynamic discovery.

### 2. Combined API Endpoints
**Decision**: Combined related endpoints to fit Vercel Hobby plan (12 function limit).

**Why**:
- Vercel Hobby plan allows only 12 serverless functions
- We're at the limit, so new endpoints must be combined

**Examples**:
- `usage.js` handles `/api/usage`, `/api/storage-usage`, `/api/firestore-usage`
- `videos.js` handles `/api/videos` and `/api/video-status`
- `deploy-website.js` handles `/api/deploy-website` and `/api/update-website`

**⚠️ CRITICAL**: Before adding new API endpoint, check function count and combine if possible.

### 3. Non-Blocking ArNS Updates
**Decision**: ArNS updates are non-blocking - deployment succeeds even if ArNS update fails.

**Why**:
- ArNS updates may take time to propagate
- Should not block website deployment
- User can manually update if needed

**Implementation**:
- `lib/ArNSUpdater.js` catches errors and returns success/failure
- `api/deploy-website.js` logs warning but doesn't throw error

### 4. System FFmpeg in GitHub Actions
**Decision**: Use system FFmpeg (apt-get install) instead of ffmpeg-static package.

**Why**:
- `ffmpeg-static` has limited filters (missing `drawtext`)
- System FFmpeg has all filters
- More reliable for production

**Implementation**:
- GitHub Actions workflow installs FFmpeg via `apt-get`
- Code detects `GITHUB_ACTIONS` environment and uses system FFmpeg


