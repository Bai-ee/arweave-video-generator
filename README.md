# Arweave Video Generator

One-click video generation with Arweave audio, using async processing to handle Vercel's timeout limits.

## Architecture

- **Frontend**: Vercel-hosted static site with simplified UI
- **API**: Vercel serverless functions (job creation, status polling)
- **Worker**: Railway service for async video processing
- **Storage**: Firebase Firestore (job queue) + Firebase Storage (video files)

## Setup

### 1. Firebase Configuration

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Firestore Database
3. Enable Storage
4. Create a service account (Project Settings > Service Accounts > Generate New Private Key)
5. Update `.env.example` with your Firebase credentials

### 2. Vercel Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Navigate to project root: `cd arweave-video-generator`
3. Deploy: `vercel`
4. Add environment variables in Vercel dashboard:
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string)
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_PROJECT_ID` (if not using service account key)

### 3. Railway Worker Deployment

1. Create a new Railway project
2. Connect your GitHub repo or deploy from local
3. Set root directory to `worker/`
4. Add environment variables:
   - `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON string)
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_PROJECT_ID` (if not using service account key)
5. Deploy

### 4. Frontend Firebase Config

Update `public/index.html` with your Firebase client SDK config:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## Usage

1. Open the deployed frontend URL
2. Click "GENERATE VIDEO" button
3. Wait 10-20 seconds for processing
4. Video will appear in the table when ready
5. Click "VIEW" to watch or "DOWNLOAD" to save

## File Structure

```
arweave-video-generator/
├── api/                    # Vercel serverless functions
│   ├── generate-video.js  # Creates job, returns immediately
│   ├── video-status.js    # Polls job status
│   └── videos.js          # Lists all videos
├── worker/                # Railway worker service
│   ├── processor.js       # Video processing logic
│   ├── firebase-admin.js  # Firebase admin setup
│   ├── lib/               # Video generation libraries
│   └── data/              # Artist JSON data
├── src/lib/               # Shared video generation code
├── public/                # Frontend (simplified UI)
│   └── index.html         # Main interface
├── vercel.json            # Vercel configuration
└── package.json           # Dependencies
```

## How It Works

1. **User clicks "Generate Video"**
   - Frontend calls `/api/generate-video`
   - API creates job in Firestore with status "pending"
   - Returns jobId immediately (< 1 second)

2. **Railway Worker**
   - Polls Firestore every 3 seconds for "pending" jobs
   - Processes video using ArweaveVideoGenerator
   - Uploads to Firebase Storage
   - Updates job status to "completed"

3. **Frontend Polling**
   - Polls `/api/video-status` every 2 seconds
   - Updates UI when status changes
   - Shows video when completed

## Firebase Collections

### `videoJobs`
- `jobId`: Unique identifier
- `status`: "pending" | "processing" | "completed" | "failed"
- `artist`: Artist name
- `duration`: Video duration in seconds
- `videoUrl`: Firebase Storage URL (when completed)
- `createdAt`: Timestamp
- `completedAt`: Timestamp

### `videos`
- `videoId`: Unique identifier
- `jobId`: Reference to videoJobs
- `artist`: Artist name
- `duration`: Video duration
- `videoUrl`: Firebase Storage URL
- `createdAt`: Timestamp

## Notes

- Videos are always 30 seconds (MVP simplification)
- Artist is always random (MVP simplification)
- Railway worker processes one job at a time
- All videos stored in Firebase Storage (CDN URLs)

