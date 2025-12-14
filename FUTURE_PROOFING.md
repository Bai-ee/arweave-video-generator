# Future-Proofing Guidelines

**Last Updated**: December 2025  
**Status**: ✅ Production Ready MVP

## Overview

This document provides guidelines for extending the Arweave Video Generator without breaking existing functionality. **Follow these guidelines to ensure future changes don't break the MVP.**

---

## ⚠️ CRITICAL: Don't Break These

### 1. Dynamic Folder Discovery

**Status**: ✅ Core MVP Feature

**What It Is**:
- System automatically discovers all folders in Firebase Storage
- No hardcoded folder lists in code
- Supports any user-created folder automatically

**Why It's Critical**:
- Users can create new folders (e.g., 'rositas', 'retro_dust')
- These folders must work without code changes
- Breaking this breaks the entire folder selection system

**✅ DO**:
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
```

**❌ DON'T**:
```javascript
// ❌ BAD: Hardcoded folder list
const validFolders = ['equipment', 'decks', 'skyline', 'neighborhood'];
// This breaks when users create new folders!
```

**Files to Check**:
- `api/video-folders.js`: `discoverFolders()` function
- `worker/lib/VideoLoader.js`: Both `loadTrackVideoReferences()` and `loadAllSkylineVideos()` methods
- `worker/lib/VideoSegmentCompositor.js`: `createVideoFromSegments()` method

**How to Verify**:
1. Create a new folder in Firebase Storage (e.g., 'test-folder')
2. Upload a video to that folder
3. Check if folder appears in selection UI
4. Generate video using that folder
5. Verify video generation succeeds

---

### 2. VideoLoader Methods

**Status**: ✅ Core MVP Feature

**What It Is**:
- `loadTrackVideoReferences()`: Returns file references (for TRACKS/MIXES)
- `loadAllSkylineVideos()`: Downloads and caches videos (for MIXES)
- Both methods use dynamic folder discovery

**Why It's Critical**:
- These methods are called by `ArweaveVideoGenerator`
- They must support any folder, not just known folders
- Breaking this breaks video generation for new folders

**✅ DO**:
```javascript
// ✅ GOOD: Dynamic folder discovery
async loadAllSkylineVideos(returnGrouped, selectedFolders) {
  const discoveredFolders = await this.discoverFolders();
  const groupedVideos = {};
  
  for (const folderName of discoveredFolders) {
    if (!this.shouldIncludeFolder(folderName, selectedFolders)) {
      continue;
    }
    // Load videos from folder...
    groupedVideos[normalizedFolderName] = videos;
  }
  
  return returnGrouped ? groupedVideos : Object.values(groupedVideos).flat();
}
```

**❌ DON'T**:
```javascript
// ❌ BAD: Hardcoded folderMap
const folderMap = {
  'equipment': 'equipment',
  'decks': 'decks',
  'skyline': 'skyline',
  // Missing new folders like 'rositas'!
};
```

**Files to Check**:
- `worker/lib/VideoLoader.js`: Both methods must use dynamic discovery

**How to Verify**:
1. Create new folder with videos
2. Generate video using that folder
3. Check logs: Should see folder discovered and videos loaded
4. Verify video generation succeeds

---

### 3. VideoSegmentCompositor Folder Keys

**Status**: ✅ Core MVP Feature

**What It Is**:
- `createVideoFromSegments()` processes videos from multiple folders
- Must support any folder key in `videoPaths` object
- Not just hardcoded known folders

**Why It's Critical**:
- New folders like 'rositas' won't work if you only check known folders
- This is the final step before video composition
- Breaking this causes "No video paths provided" error

**✅ DO**:
```javascript
// ✅ GOOD: Check all keys in videoPaths
if (videoPaths && typeof videoPaths === 'object' && !Array.isArray(videoPaths)) {
  folderMap = {};
  const knownFolderKeys = ['equipment', 'decks', 'skyline', ...];
  
  // First, populate known folders
  for (const key of knownFolderKeys) {
    if (videoPaths[key]) {
      folderMap[key] = videoPaths[key];
    }
  }
  
  // Then, add any other dynamic folders
  for (const key of Object.keys(videoPaths)) {
    if (!knownFolderKeys.includes(key) && Array.isArray(videoPaths[key]) && videoPaths[key].length > 0) {
      folderMap[key] = videoPaths[key]; // Add dynamic folders
    }
  }
}
```

**❌ DON'T**:
```javascript
// ❌ BAD: Only check known folders
const knownFolders = ['equipment', 'decks', 'skyline'];
for (const key of knownFolders) {
  if (videoPaths[key]) {
    folderMap[key] = videoPaths[key];
  }
}
// Missing 'rositas' and other new folders!
```

**Files to Check**:
- `worker/lib/VideoSegmentCompositor.js`: `createVideoFromSegments()` method

**How to Verify**:
1. Generate video using new folder (e.g., 'rositas')
2. Check logs: Should see folder key in folderMap
3. Verify segments are extracted from that folder
4. Verify video generation succeeds

---

### 4. API Function Count

**Status**: ⚠️ Vercel Hobby Plan Limit

**What It Is**:
- Vercel Hobby plan allows only **12 serverless functions**
- We're currently at the limit (12 functions)

**Why It's Critical**:
- Adding a new function file will cause deployment to fail
- Must combine endpoints or upgrade to Pro plan

**✅ DO**:
```javascript
// ✅ GOOD: Combine related endpoints
// api/usage.js handles multiple routes:
// - /api/usage
// - /api/storage-usage
// - /api/firestore-usage

export default async function handler(req, res) {
  const { type } = req.query || {};
  const includeStorage = !type || type === 'storage' || type === 'both';
  const includeFirestore = !type || type === 'firestore' || type === 'both';
  // ... handle both
}
```

**❌ DON'T**:
```javascript
// ❌ BAD: Create new function file
// api/new-endpoint.js
// This will exceed the 12 function limit!
```

**How to Check**:
1. Count files in `api/` directory (excluding `lib/` if present)
2. Check `vercel.json` functions section
3. Must be ≤ 12 functions

**Current Functions** (12):
1. `generate-video.js`
2. `videos.js` (handles `/api/videos` and `/api/video-status`)
3. `video-folders.js`
4. `upload-video.js`
5. `delete-video.js`
6. `usage.js` (handles `/api/usage`, `/api/storage-usage`, `/api/firestore-usage`)
7. `artists.js`
8. `manage-artists.js`
9. `deploy-website.js` (handles `/api/deploy-website` and `/api/update-website`)
10. `archive-upload.js` (handles `/api/archive-upload`, `/api/archive-status`, `/api/archive-manifest`)
11. `upload.js`
12. `migrate-image-urls.js`

**If You Need a New Endpoint**:
1. **Option 1**: Combine with existing endpoint (recommended)
2. **Option 2**: Remove unused endpoint
3. **Option 3**: Upgrade to Vercel Pro plan

---

### 5. Folder Name Validation

**Status**: ✅ Core MVP Feature

**What It Is**:
- `api/generate-video.js` validates folder names
- Only excludes exact matches (not partial matches)
- Allows folders like 'retro_dust', 'noise', 'grit'

**Why It's Critical**:
- Broad exclusions would block valid folders
- Exact match exclusion allows new folders to work

**✅ DO**:
```javascript
// ✅ GOOD: Exact match exclusion only
const excludedExactMatches = [
  'logos',
  'paper_backgrounds',
  'mixes',
  'mixes/baiee',
  'mixes/bai-ee',
];

const invalidFolders = normalizedFolders.filter(f => {
  const folderLower = f.toLowerCase().trim();
  return excludedExactMatches.some(excluded => {
    const excludedLower = excluded.toLowerCase();
    if (folderLower === excludedLower) { // Exact match only
      return true;
    }
    return false;
  });
});
```

**❌ DON'T**:
```javascript
// ❌ BAD: Broad exclusion
if (folderName.includes('mixes')) {
  return false; // Blocks 'mixes/retro_dust', 'mixes/noise', etc.!
}
```

**Files to Check**:
- `api/generate-video.js`: Folder validation logic
- `api/video-folders.js`: Folder filtering logic

**How to Verify**:
1. Try to generate video with 'retro_dust' folder
2. Should succeed (not blocked)
3. Try to generate video with 'mixes/baiee' folder
4. Should fail (blocked)

---

### 6. Firestore Schema

**Status**: ⚠️ Immutable Contract

**What It Is**:
- `videoJobs` collection structure
- `videos` collection structure
- Status values: `'pending' | 'processing' | 'completed' | 'failed'`

**Why It's Critical**:
- Frontend and worker depend on this structure
- Changing it breaks existing functionality

**✅ DO**:
```javascript
// ✅ GOOD: Add new optional fields
await db.collection('videoJobs').doc(jobId).set({
  jobId,
  status: 'pending',
  artist,
  duration,
  selectedFolders,
  useTrax,
  // New optional field
  newField: 'optional value',
  createdAt: admin.firestore.FieldValue.serverTimestamp()
});
```

**❌ DON'T**:
```javascript
// ❌ BAD: Change required field names
await db.collection('videoJobs').doc(jobId).set({
  jobId,
  status: 'pending',
  artistName: artist, // Changed from 'artist' - breaks frontend!
  duration,
  // ...
});
```

**Required Fields** (Don't Change):
- `jobId`: String
- `status`: String ('pending' | 'processing' | 'completed' | 'failed')
- `artist`: String
- `duration`: Number
- `selectedFolders`: Array of strings
- `useTrax`: Boolean
- `createdAt`: Timestamp
- `videoUrl`: String (when completed)

**How to Verify**:
1. Generate a video
2. Check Firestore document structure
3. Verify frontend can read all fields
4. Verify worker can update status correctly

---

### 7. API Response Formats

**Status**: ⚠️ Immutable Contract

**What It Is**:
- Response structure for all API endpoints
- Frontend depends on these formats

**Why It's Critical**:
- Changing response structure breaks frontend
- Must maintain backward compatibility

**✅ DO**:
```javascript
// ✅ GOOD: Add new optional fields
res.json({
  success: true,
  jobId: jobId,
  status: 'pending',
  // New optional field
  newField: 'optional value'
});
```

**❌ DON'T**:
```javascript
// ❌ BAD: Change required field names
res.json({
  success: true,
  jobIdentifier: jobId, // Changed from 'jobId' - breaks frontend!
  jobStatus: 'pending', // Changed from 'status' - breaks frontend!
});
```

**Required Response Fields**:
- `/api/generate-video`: `success`, `jobId`, `status`
- `/api/videos`: `success`, `videos` (array), `count`
- `/api/video-folders`: `success`, `folders` (array)

**How to Verify**:
1. Test API endpoint
2. Check response structure matches documentation
3. Verify frontend can parse response correctly

---

## ✅ Safe Extension Patterns

### Adding New Video Filters

**✅ Safe**: Doesn't break existing functionality

**Steps**:
1. Add filter definition to `worker/lib/VideoFilters.js`:
   ```javascript
   export const VIDEO_FILTERS = {
     'new_filter': {
       name: 'New Filter',
       baseFilter: 'scale=720:720...',
       getFilter: (intensity) => applyFilterIntensity(baseFilter, intensity)
     }
   };
   ```

2. Update frontend filter select (if exposing to users):
   ```javascript
   // Add option to dropdown
   const filterSelect = document.getElementById('filterSelect');
   const option = document.createElement('option');
   option.value = 'new_filter';
   option.textContent = 'New Filter';
   filterSelect.appendChild(option);
   ```

3. Test locally:
   ```bash
   cd worker
   node test-local.js
   ```

**Verification**:
- Existing filters still work
- New filter appears in select (if exposed)
- Video generation succeeds with new filter

---

### Adding New Overlay Types

**✅ Safe**: Extends existing overlay system

**Steps**:
1. Add overlay configuration to `VideoCompositor`:
   ```javascript
   // In VideoCompositor.js
   if (layer.type === 'new_overlay') {
     // Handle new overlay type
   }
   ```

2. Add layer in `ArweaveVideoGenerator`:
   ```javascript
   // In ArweaveVideoGenerator.js
   layers.push(new LayerConfig({
     type: 'new_overlay',
     source: overlayPath,
     position: { x: 100, y: 100 },
     size: { width: 200, height: 200 },
     opacity: 0.8
   }));
   ```

3. Test locally

**Verification**:
- Existing overlays still work
- New overlay appears in video
- Video generation succeeds

---

### Adding New Folders

**✅ Safe**: No code changes needed!

**Steps**:
1. Create folder in Firebase Storage (via UI or API)
2. Upload videos to that folder
3. Folder automatically appears in selection UI
4. Generate video using that folder

**Verification**:
- Folder appears in selection UI
- Video generation succeeds
- Segments extracted from new folder

**Why It's Safe**:
- Dynamic folder discovery handles it automatically
- No code changes needed
- Works with any folder name (except excluded ones)

---

### Modifying Video Generation Pipeline

**⚠️ Use Caution**: Pipeline order matters

**Steps**:
1. Understand dependencies:
   - Audio generation → Video loading → Segment composition → Final composition
   - Each step depends on previous steps

2. Add new step (if needed):
   ```javascript
   // In ArweaveVideoGenerator.generateVideoWithAudio()
   // Step 1: Audio generation
   const audioResult = await this.audioClient.generateAudioClip(...);
   
   // NEW STEP: Add here
   const newStepResult = await this.newStep(...);
   
   // Step 2: Video loading
   const videoResult = await this.videoLoader.loadAllSkylineVideos(...);
   ```

3. Test thoroughly:
   ```bash
   cd worker
   node test-local.js
   ```

**Verification**:
- Existing pipeline still works
- New step doesn't break dependencies
- Video generation succeeds

**⚠️ Don't**:
- Remove steps without understanding dependencies
- Change step order without testing
- Modify step inputs/outputs without updating dependents

---

## 🔒 Immutable Contracts

These are **contracts** that other parts of the system depend on. **Don't change** without updating all dependents:

### 1. Firestore Schema
- `videoJobs` collection structure
- `videos` collection structure
- Status values: `'pending' | 'processing' | 'completed' | 'failed'`

### 2. API Response Formats
- `/api/generate-video` response structure
- `/api/videos` response structure
- `/api/video-folders` response structure

### 3. VideoLoader Return Format
- Grouped structure: `{ folder1: [...], folder2: [...] }`
- File references (for `loadTrackVideoReferences`)
- Cached paths (for `loadAllSkylineVideos`)

### 4. VideoSegmentCompositor Input
- Accepts grouped structure: `{ folder1: [...], folder2: [...] }`
- Supports dynamic folder keys (not just known folders)

---

## 📋 Checklist Before Making Changes

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
- [ ] **Test Existing Features**: All existing features still work

---

## 🚨 Red Flags

If you see these, **STOP** and reconsider:

1. **Hardcoded folder lists**: Should use dynamic discovery
2. **New API function file**: Should combine with existing endpoint
3. **Changed Firestore field names**: Should add new fields, not rename
4. **Changed API response field names**: Should add new fields, not rename
5. **Only checking known folders**: Should check all keys in object
6. **Broad folder exclusions**: Should use exact match exclusion only

---

## 📚 Related Documentation

- **[README.md](./README.md)**: Complete system overview
- **[SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)**: Architecture details
- **[API_REFERENCE.md](./API_REFERENCE.md)**: API endpoint documentation
- **[DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)**: Development best practices

---

**Last Updated**: December 2025  
**Maintained By**: Development Team  
**Status**: ✅ Production Ready MVP
