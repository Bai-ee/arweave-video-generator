# 🎯 Arweave Video Generator - Single File Context

**Purpose**: This is the **single file to use as context** when starting a new chat thread. It provides complete system overview and points to all other documentation.

**Last Updated**: December 2025  
**Status**: ✅ Production Ready MVP

---

## 🚀 Quick System Overview

**What It Is**: Production-ready MVP that generates branded music videos by combining:
- Audio from Arweave (DJ mixes or original tracks)
- Video segments from Firebase Storage (dynamically discovered folders)
- AI-generated backgrounds (DALL-E 3 fallback)
- Branded overlays (logos, text, paper textures)

**Key Technologies**:
- Frontend: Single-page HTML/JavaScript (`public/index.html`)
- Backend: Vercel Serverless Functions (12 functions - Hobby plan limit)
- Processing: GitHub Actions (FFmpeg on Ubuntu, runs every minute)
- Storage: Firebase Storage + Firestore
- Archive: Arweave via ArDrive Turbo SDK
- Domain: ArNS (`undergroundexistence.ar.io`)

---

## ⚠️ CRITICAL: Must-Know Before Making Changes

### 1. Dynamic Folder Discovery (DO NOT BREAK)
- System **automatically discovers** all folders in Firebase Storage
- **No hardcoded folder lists** - supports any user-created folder
- Files: `api/video-folders.js`, `worker/lib/VideoLoader.js`, `worker/lib/VideoSegmentCompositor.js`
- **Why Critical**: Users can create folders (e.g., 'rositas', 'retro_dust') that must work without code changes

### 2. API Function Limit (12 Functions)
- Vercel Hobby plan allows only **12 serverless functions**
- We're at the limit - new endpoints must be combined with existing ones
- Current functions: `generate-video.js`, `videos.js`, `video-folders.js`, `upload-video.js`, `delete-video.js`, `usage.js`, `artists.js`, `manage-artists.js`, `deploy-website.js`, `archive-upload.js`, `upload.js`, `migrate-image-urls.js`

### 3. Folder Validation (Exact Match Only)
- Only excludes exact matches: `logos`, `paper_backgrounds`, `mixes`, `mixes/baiee`, `mixes/bai-ee`
- **Allows**: Any other folder including `retro_dust`, `noise`, `grit`, and user-created folders
- File: `api/generate-video.js`

### 4. VideoLoader Methods (Support Dynamic Folders)
- `loadTrackVideoReferences()` and `loadAllSkylineVideos()` both use dynamic discovery
- Must support any folder, not just known folders
- File: `worker/lib/VideoLoader.js`

### 5. VideoSegmentCompositor (Process All Folder Keys)
- Must check all keys in `videoPaths` object, not just known folders
- File: `worker/lib/VideoSegmentCompositor.js`

**📖 Read [FUTURE_PROOFING.md](./FUTURE_PROOFING.md) before making any changes!**

---

## 📁 Key Files & Directories

### Frontend
- `public/index.html` - Single-page application (4470 lines)
  - Upload section, Generate section, Deploy section, Archive section
  - Real-time status polling, Firebase SDK integration

### API Layer (`api/`)
- `generate-video.js` - Creates video jobs (validates folders, creates Firestore job)
- `videos.js` - Lists videos + handles `/api/video-status`
- `video-folders.js` - **Dynamic folder discovery** (lists all folders)
- `usage.js` - Handles `/api/usage`, `/api/storage-usage`, `/api/firestore-usage`
- `deploy-website.js` - Deploys website to Arweave + updates ArNS
- `archive-upload.js` - Archives files to Arweave
- `upload-video.js`, `delete-video.js`, `artists.js`, `manage-artists.js`, `upload.js`, `migrate-image-urls.js`

### Worker Layer (`worker/`)
- `processor.js` - GitHub Actions entry point (polls Firestore, processes jobs)
- `lib/ArweaveVideoGenerator.js` - Main orchestrator
- `lib/VideoLoader.js` - **Dynamic folder discovery** + video loading
- `lib/VideoSegmentCompositor.js` - Extracts 5s segments, concatenates to 30s
- `lib/VideoCompositor.js` - Final composition (overlays, filters, audio)
- `lib/ArweaveAudioClient.js` - Fetches audio from Arweave
- `lib/DALLEImageGenerator.js` - AI background generation (fallback)

### Shared Libraries (`lib/`)
- `firebase-admin.js` - Firebase initialization
- `ArNSUpdater.js` - Updates ArNS records
- `WebsiteDeployer.js` - Deploys website to Arweave
- `WebsiteSync.js` - Syncs Firebase to website/artists.json

### Configuration
- `vercel.json` - Vercel routes and function config (12 functions)
- `.github/workflows/process-videos.yml` - GitHub Actions workflow (runs every minute)
- `storage.rules` - Firebase Storage rules (allows dynamic folder creation)

---

## 🔄 Key Data Flows

### Video Generation Flow
1. User selects folders → POST `/api/generate-video`
2. API validates folders → Creates job in Firestore (`videoJobs` collection, status: 'pending')
3. GitHub Actions (runs every minute) → Finds pending job
4. Worker: Updates status to 'processing' → **Dynamically discovers folders** → Loads videos → Extracts 5s segments → Concatenates to 30s → Applies filters/overlays → Combines audio → Uploads to Firebase Storage → Updates Firestore (status: 'completed', videoUrl)
5. Frontend polls `/api/videos` → Displays video when ready

### Website Deployment Flow
1. User clicks "Deploy Website" → POST `/api/deploy-website`
2. API: Syncs Firebase artists → Generates HTML pages → Uploads to Arweave → Creates manifest → **Updates ArNS record** → Returns ArNS URL
3. Frontend displays ArNS URL (`https://undergroundexistence.ar.io`)

---

## 📊 Firestore Collections

- `videoJobs` - Job tracking (status: 'pending' | 'processing' | 'completed' | 'failed')
- `videos` - Completed videos (duplicate of videoJobs for easier querying)
- `artists` - Artist/mix metadata
- `archiveJobs` - Archive job tracking
- `archiveManifest` - Archive index

**⚠️ Schema is immutable** - don't change required field names without updating all dependents.

---

## 🔐 Environment Variables

### Vercel (Required)
- `FIREBASE_SERVICE_ACCOUNT_KEY` - Full JSON string
- `FIREBASE_STORAGE_BUCKET` - `editvideos-63486.firebasestorage.app`
- `ARWEAVE_WALLET_JWK` - Arweave wallet JSON string
- `ARNS_ANT_PROCESS_ID` - `tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw`
- `ARNS_NAME` - `undergroundexistence`
- `OPENAI_API_KEY` - For DALL-E fallback (optional)

### GitHub Actions (Required)
- `FIREBASE_SERVICE_ACCOUNT_KEY` - Same as Vercel
- `FIREBASE_STORAGE_BUCKET` - Same as Vercel
- `OPENAI_API_KEY` - Same as Vercel

---

## ✅ MVP Features (13 Features)

1. **Video Generation** - 30s videos from 5s segments, dynamic folder selection
2. **Dynamic Folder Discovery** - Automatically finds all folders (no hardcoded lists)
3. **New Folder Creation** - Users can create folders during upload
4. **ArNS Integration** - Automatic domain updates after website deployment
5. **Firebase Usage Indicators** - Real-time storage and Firestore usage tracking
6. **Website Deployment** - Deploys website to Arweave with ArNS update
7. **Archive Upload** - Archives files to Arweave for permanent storage
8. **Video Upload** - Direct upload to Firebase Storage (bypasses Vercel 10MB limit)
9. **Audio Source Selection** - DJ MIXES or ORIGINAL TRACKS
10. **Video List & Polling** - Real-time status updates
11. **Video Filter Application** - Hard B&W Street Doc @ 80% (hardcoded)
12. **Folder Preview** - Preview videos in folders before generation
13. **Artist Management** - Create/update artists in Firestore

**📖 See [FEATURES.md](./FEATURES.md) for complete feature documentation.**

---

## 🛡️ Future-Proofing Checklist

Before making any changes, verify:
- [ ] **Dynamic Folder Discovery**: New folders still work automatically
- [ ] **API Function Count**: Still ≤ 12 functions (or upgraded plan)
- [ ] **Firestore Schema**: No breaking changes to required fields
- [ ] **API Response Formats**: No breaking changes to required fields
- [ ] **VideoLoader Methods**: Still support dynamic folders
- [ ] **VideoSegmentCompositor**: Still processes all folder keys
- [ ] **Folder Validation**: Still allows new folders (exact match exclusion only)
- [ ] **Test Locally**: `cd worker && node test-local.js` succeeds
- [ ] **Test New Folders**: Create new folder, generate video, verify success

**📖 See [FUTURE_PROOFING.md](./FUTURE_PROOFING.md) for complete guidelines.**

---

## 📚 Complete Documentation Map

### Core Documentation
- **[README.md](./README.md)** - This file (complete system overview)
- **[DOCUMENTATION_INDEX.md](./DOCUMENTATION_INDEX.md)** - Navigation guide to all documentation
- **[FUTURE_PROOFING.md](./FUTURE_PROOFING.md)** - ⚠️ **CRITICAL**: Read before making changes
- **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)** - Detailed architecture
- **[FEATURES.md](./FEATURES.md)** - All MVP features
- **[API_REFERENCE.md](./API_REFERENCE.md)** - Complete API documentation
- **[DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)** - Best practices and patterns

### Setup & Configuration
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment procedures
- **[ARWEAVE_ENV_SETUP.md](./ARWEAVE_ENV_SETUP.md)** - Arweave setup
- **[FIREBASE_STORAGE_RULES.md](./FIREBASE_STORAGE_RULES.md)** - Storage rules
- **[GITHUB_SECRETS_SETUP.md](./GITHUB_SECRETS_SETUP.md)** - GitHub Actions secrets

### Troubleshooting
- **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** - Common issues and solutions
- **[ARNS_TROUBLESHOOTING.md](./ARNS_TROUBLESHOOTING.md)** - ArNS-specific issues
- **[HOW_TO_VIEW_VERCEL_LOGS.md](./HOW_TO_VIEW_VERCEL_LOGS.md)** - Log access

### Workflow
- **[WORKFLOW_AND_BEST_PRACTICES.md](./WORKFLOW_AND_BEST_PRACTICES.md)** - Development workflow
- **[BEST_PRACTICES.md](./BEST_PRACTICES.md)** - Code quality guidelines

### Specialized
- **[UPDATE_FIREBASE_ARTISTS.md](./UPDATE_FIREBASE_ARTISTS.md)** - Artist data updates
- **[GITHUB_WEBHOOK_SETUP.md](./GITHUB_WEBHOOK_SETUP.md)** - Webhook configuration
- **[VERCEL_JWK_FORMAT.md](./VERCEL_JWK_FORMAT.md)** - Arweave wallet format

---

## 🎯 Quick Reference

### For New Developers
1. Read this file (CONTEXT.md) - System overview
2. Read [FUTURE_PROOFING.md](./FUTURE_PROOFING.md) - Critical guidelines
3. Read [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) - Best practices
4. Read [API_REFERENCE.md](./API_REFERENCE.md) - API integration

### For Adding Features
1. Read [FUTURE_PROOFING.md](./FUTURE_PROOFING.md) - **BEFORE making changes**
2. Read [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md) - Patterns
3. Read [FEATURES.md](./FEATURES.md) - Existing features
4. Read [API_REFERENCE.md](./API_REFERENCE.md) - API structure

### For Debugging
1. Read [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues
2. Read [HOW_TO_VIEW_VERCEL_LOGS.md](./HOW_TO_VIEW_VERCEL_LOGS.md) - Log access
3. Check GitHub Actions logs: https://github.com/Bai-ee/arweave-video-generator/actions

### For Deployment
1. Read [DEPLOYMENT.md](./DEPLOYMENT.md) - Procedures
2. Read [GITHUB_SECRETS_SETUP.md](./GITHUB_SECRETS_SETUP.md) - Secrets
3. Read [ARWEAVE_ENV_SETUP.md](./ARWEAVE_ENV_SETUP.md) - Arweave setup

---

## 🔍 Key Code Patterns

### Dynamic Folder Discovery
```javascript
// ✅ GOOD: Dynamic discovery
async discoverFolders() {
  const [files] = await bucket.getFiles();
  const folderSet = new Set();
  files.forEach(file => {
    const folderName = file.name.split('/')[0];
    if (folderName && !this.isExcluded(folderName)) {
      folderSet.add(folderName);
    }
  });
  return Array.from(folderSet);
}

// ❌ BAD: Hardcoded list
const validFolders = ['equipment', 'decks', 'skyline'];
```

### VideoSegmentCompositor Dynamic Support
```javascript
// ✅ GOOD: Check all keys
for (const key of Object.keys(videoPaths)) {
  if (!knownFolderKeys.includes(key) && Array.isArray(videoPaths[key])) {
    folderMap[key] = videoPaths[key]; // Add dynamic folders
  }
}

// ❌ BAD: Only known folders
for (const key of knownFolders) {
  if (videoPaths[key]) {
    folderMap[key] = videoPaths[key];
  }
}
```

---

## 📝 Version History

### v1.0.0 (December 2025) - Production MVP
- ✅ Dynamic folder discovery
- ✅ ArNS integration
- ✅ Website deployment
- ✅ Usage indicators
- ✅ New folder creation
- ✅ Archive upload

---

**Last Updated**: December 2025  
**Maintained By**: Development Team  
**Status**: ✅ Production Ready MVP

**Use this file as context when starting new chat threads!**
