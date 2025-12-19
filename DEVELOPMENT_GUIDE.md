# 🎬 Arweave Video Generator - Development Guide

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [How It Works](#how-it-works)
5. [Best Practices](#best-practices)
6. [Common Mistakes & Solutions](#common-mistakes--solutions)
7. [Adding New Features](#adding-new-features)
8. [Testing](#testing)
9. [Environment Setup](#environment-setup)
10. [Troubleshooting](#troubleshooting)

---

## 🎯 System Overview

The Arweave Video Generator is a production-ready system that creates branded music videos by:
1. **Fetching audio** from Arweave decentralized storage
2. **Generating AI images** using DALL-E 3
3. **Loading video backgrounds** from Firebase Storage
4. **Composing multi-layer videos** with FFmpeg
5. **Uploading results** to Firebase Storage and Firestore

### Key Technologies
- **Node.js** (ES Modules)
- **FFmpeg** (video/audio processing)
- **OpenAI DALL-E 3** (image generation)
- **Firebase Admin SDK** (storage & database)
- **GitHub Actions** (CI/CD processing)

---

## 🏗️ Architecture

### High-Level Flow
```
User Request → API Endpoint → Firestore Job Creation
    ↓
GitHub Actions Workflow (runs every minute)
    ↓
Worker Process → Video Generation Pipeline
    ↓
Firebase Storage Upload → Firestore Status Update
    ↓
Frontend Polling → Video Display
```

### Directory Structure
```
arweave-video-generator/
├── api/                    # Vercel API endpoints
│   ├── generate-video.js   # Creates video jobs
│   └── videos.js           # Lists videos
├── worker/                 # Video processing worker
│   ├── lib/                # Core libraries
│   │   ├── ArweaveVideoGenerator.js    # Main orchestrator
│   │   ├── ArweaveAudioClient.js       # Audio fetching
│   │   ├── DALLEImageGenerator.js      # DALL-E integration
│   │   ├── ImageLoader.js              # Image loading/caching
│   │   ├── VideoLoader.js              # Video loading/caching
│   │   └── VideoCompositor.js          # FFmpeg composition
│   ├── processor.js        # GitHub Actions entry point
│   ├── test-local.js       # Local testing script
│   └── data/               # Artist JSON data
├── .github/workflows/      # GitHub Actions workflows
└── assets/                # Static assets (Chicago videos)
```

---

## 🔧 Core Components

### 1. ArweaveVideoGenerator (`worker/lib/ArweaveVideoGenerator.js`)
**Role**: Main orchestrator that coordinates all components

**Key Methods**:
- `generateVideoWithAudio(config)` - Main entry point
- `generateBackgroundImage()` - Fallback background generation
- `generateTextLayers()` - Creates text overlay configurations

**⚠️ CRITICAL**: This is the central coordinator. Don't modify the step order without understanding dependencies.

### 2. ArweaveAudioClient (`worker/lib/ArweaveAudioClient.js`)
**Role**: Fetches and processes audio from Arweave

**Key Methods**:
- `generateAudioClip(duration, options)` - Downloads audio segment
- `selectRandomArtist()` - Artist selection logic

**Data Source**: `worker/data/sample-artists.json`

### 3. DALLEImageGenerator (`worker/lib/DALLEImageGenerator.js`)
**Role**: Generates images using OpenAI DALL-E 3

**Key Methods**:
- `generateBackgroundImage(artistName, prompt, width, height)`
- `generateRandomImages(artistName, count, width, height)`

**⚠️ IMPORTANT**: Requires `OPENAI_API_KEY` environment variable

### 4. ImageLoader (`worker/lib/ImageLoader.js`)
**Role**: Loads and caches images from various sources

**Key Methods**:
- `loadFromArtistJSON(artistData, mixData)` - Loads from JSON
- `loadFromURL(url)` - Downloads and caches from URLs
- `loadRandomFromFolder(folderPath)` - Random selection

**Caching**: Images cached in `outputs/image-cache/` to avoid re-downloads

### 5. VideoLoader (`worker/lib/VideoLoader.js`)
**Role**: Downloads and caches videos from Firebase Storage with **dynamic folder discovery**

**Key Methods**:
- `loadTrackVideoReferences(returnGrouped, selectedFolders)` - Returns file references (for TRACKS/MIXES)
- `loadAllSkylineVideos(returnGrouped, selectedFolders)` - Downloads and caches videos (for MIXES)
- **Dynamic folder discovery**: Discovers all folders from Firebase Storage (no hardcoded folderMap)

**⚠️ CRITICAL**: Both methods use dynamic folder discovery. Never add hardcoded folder lists.

**Caching**: Videos cached in `outputs/video-cache/` to avoid re-downloads

**Returns**: Grouped structure `{ folder1: [...], folder2: [...] }` or flat array

### 6. VideoCompositor (`worker/lib/VideoCompositor.js`)
**Role**: Composes final video using FFmpeg filter_complex

**Key Methods**:
- `composeVideo(config)` - Main composition method
- `buildFilterComplex(config)` - Builds FFmpeg filter string
- `buildFFmpegCommand(config, filterComplex)` - Builds command array
- `executeFFmpeg(command, outputPath)` - Executes FFmpeg

**⚠️ CRITICAL**: This is where most bugs occur. See [FFmpeg Gotchas](#ffmpeg-gotchas) below.

---

## 🔄 How It Works

### Video Generation Pipeline

#### Step 1: Audio Generation
```javascript
// ArweaveVideoGenerator.generateVideoWithAudio()
const audioResult = await this.audioClient.generateAudioClip(duration, { artist, prompt });
```
- Selects random artist from JSON
- Downloads 30-second audio segment from Arweave
- Applies fade in/out effects
- Returns audio file path

#### Step 2: Background Selection
```javascript
// Checks if prompt suggests Chicago skyline
if (prompt.includes('chicago') || prompt.includes('skyline')) {
    // Try to load video background from Firebase
    backgroundPath = await this.videoLoader.loadRandomVideoFromFolder(...);
}
// Fallback to DALL-E background
if (!backgroundPath) {
    backgroundPath = await this.dalleGenerator.generateBackgroundImage(...);
}
```
- **Priority 1**: Video backgrounds from Firebase (if prompt matches)
- **Priority 2**: DALL-E generated background
- **Priority 3**: Simple solid color fallback

#### Step 3: Image Layer Collection
```javascript
// Generate DALL-E overlay images
const dalleOverlays = await this.dalleGenerator.generateRandomImages(artist, 2, width, height);

// Load images from artist JSON
const artistImages = await this.imageLoader.loadFromArtistJSON(artistData, mixData);
```
- Generates 1-3 random DALL-E overlay images
- Loads artist/mix images from JSON data
- All images are cached locally

#### Step 4: Text Layer Generation
```javascript
const textLayers = this.generateTextLayers(artist, mixTitle, width, height);
```
- Creates text overlay configurations
- Positions: Artist name (top), Mix title (bottom)
- Styling: White text, black border, centered

#### Step 5: Video Composition
```javascript
const compositionConfig = new CompositionConfig(
    backgroundPath,    // Base video/image
    audioFilePath,    // Audio track
    layers,           // All image + text layers
    outputPath,       // Final video path
    duration,         // Video duration
    width, height      // Canvas size
);
await this.videoCompositor.composeVideo(compositionConfig);
```

**FFmpeg Filter Complex Structure**:
```
[0:v]scale=720:720:force_original_aspect_ratio=increase,crop=720:720[base_scaled];
[2:v]scale=216:216:force_original_aspect_ratio=decrease[scaled0];
[scaled0]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*0.8'[scaled0_alpha];
[base_scaled][scaled0_alpha]overlay=100:100[layer0];
[layer0]drawtext=text='ARTIST':fontsize=50:fontcolor=0xFFFFFF:borderw=2:bordercolor=0x000000:x=(w-text_w)/2:y=50:alpha=255[text_layer0];
```

#### Step 6: Upload & Status Update
```javascript
// Upload to Firebase Storage
const videoUrl = await uploadToFirebaseStorage(videoPath);

// Update Firestore
await updateFirestore(jobId, { status: 'completed', videoUrl, ... });
```

---

## ✅ Best Practices

### 1. **Always Test Locally First**
```bash
cd worker
node test-local.js
```
- Catches FFmpeg syntax errors immediately
- Faster iteration than GitHub Actions
- Easier debugging

### 2. **Use Environment Variables for Secrets**
```javascript
// ✅ GOOD
const apiKey = process.env.OPENAI_API_KEY;

// ❌ BAD
const apiKey = 'sk-proj-...';
```

### 3. **Handle Errors Gracefully**
```javascript
// ✅ GOOD
try {
    const image = await dalleGenerator.generateBackgroundImage(...);
    if (!image) {
        console.log('DALL-E failed, using fallback...');
        image = await generateFallbackBackground();
    }
} catch (error) {
    console.error('Background generation failed:', error);
    // Always have a fallback
    image = await generateFallbackBackground();
}
```

### 4. **Cache Everything**
- Images from URLs → `outputs/image-cache/`
- Videos from Firebase → `outputs/video-cache/`
- DALL-E images → `outputs/dalle-images/`
- **Why**: Avoids re-downloading, saves API costs, faster processing

### 5. **Clean Up Temporary Files**
```javascript
// After video generation
try {
    // Clean up DALL-E images (they're uploaded, no longer needed)
    await fs.remove(dalleImagePath);
} catch (error) {
    console.warn('Cleanup failed (non-critical):', error);
}
```

### 6. **Use Consistent Layer Ordering**
```javascript
// ✅ GOOD: Consistent order
const layers = [
    ...backgroundLayers,  // First
    ...imageOverlays,     // Middle
    ...textLayers         // Last (on top)
];
```

### 7. **Log Everything**
```javascript
// ✅ GOOD: Detailed logging
console.log('[ComponentName] Step description: value');
console.log(`[ComponentName] Processing: ${itemName}`);

// ❌ BAD: Silent failures
// (no logging)
```

---

## ⚠️ Common Mistakes & Solutions

### 1. **FFmpeg Filter Syntax Errors**

#### Problem: Output Label Parsed as Parameter Value
```javascript
// ❌ BAD: FFmpeg parses 'black[text_layer1]' as color
textFilter = `drawtext=...bordercolor=black[text_layer1]`;
// Error: Cannot find color 'black[text_layer1]'
```

#### Solution: Put Border Parameters Earlier
```javascript
// ✅ GOOD: Border params in middle, alpha last
const drawtextParams = [
    `text='${text}'`,
    `fontsize=${size}`,
    `fontcolor=0xFFFFFF`,
    `borderw=2`,              // ← Border params early
    `bordercolor=0x000000`,   // ← Before position params
    `x=${xPos}`,             // ← Position params
    `y=${yPos}`,
    `alpha=${opacity}`       // ← Simple numeric value last
].join(':');
textFilter = `${input}drawtext=${drawtextParams}${outputLabel}`;
```

**Why This Works**: FFmpeg parses parameters left-to-right. When the output label comes after a simple numeric value (like `alpha=255`), it's clearly separated. When it comes after a color value, FFmpeg tries to parse it as part of the color.

#### Problem: Color Format Issues
```javascript
// ❌ BAD: Named colors can cause parsing issues
bordercolor=black[output]

// ✅ GOOD: Use hex format
bordercolor=0x000000[output]
```

### 2. **FFmpeg Path Issues**

#### Problem: `ffmpeg-static` Doesn't Have `drawtext` Filter
```javascript
// ❌ BAD: Uses ffmpeg-static by default
import ffmpegStatic from 'ffmpeg-static';
ffmpeg.setFfmpegPath(ffmpegStatic);
```

#### Solution: Use System FFmpeg in GitHub Actions
```javascript
// ✅ GOOD: Detect environment and use appropriate FFmpeg
let ffmpegPath = 'ffmpeg'; // Default to system FFmpeg

if (process.env.GITHUB_ACTIONS !== 'true' && ffmpegStatic) {
    // Use ffmpeg-static locally (faster, but limited filters)
    ffmpegPath = ffmpegStatic;
} else {
    // Use system FFmpeg in GitHub Actions (has all filters)
    ffmpegPath = 'ffmpeg';
}
```

### 3. **Firebase Credentials Not Set**

#### Problem: Missing Service Account Key
```javascript
// Error: Firebase credentials not configured
```

#### Solution: Use Setup Script
```bash
cd worker
node setup-firebase-env.js
# Follow prompts to paste Firebase service account JSON
```

**GitHub Actions**: Set `FIREBASE_SERVICE_ACCOUNT_KEY` secret in repository settings.

### 4. **DALL-E API Key Not Set**

#### Problem: DALL-E Generation Fails Silently
```javascript
// No error, but no images generated
```

#### Solution: Check Environment Variable
```javascript
// ✅ GOOD: Check and warn
if (!process.env.OPENAI_API_KEY) {
    console.warn('[DALLEImageGenerator] OPENAI_API_KEY not set');
    return null; // Graceful fallback
}
```

### 5. **Video Background Not Loading**

#### Problem: Chicago skyline videos not found
```javascript
// Error: Cannot find video in Firebase Storage
```

#### Solution: Check Firebase Storage Path
```javascript
// ✅ GOOD: Verify path exists
const videoPath = path.join(process.cwd(), 'assets', 'chicago-skyline-videos');
if (!fs.existsSync(videoPath)) {
    console.log('Local videos not found, downloading from Firebase...');
    // Fallback to Firebase download
}
```

### 6. **Layer Ordering Issues**

#### Problem: Text Appears Behind Images
```javascript
// ❌ BAD: Text layers added before image layers
layers.push(...textLayers);
layers.push(...imageLayers);
```

#### Solution: Add Text Layers Last
```javascript
// ✅ GOOD: Text on top
layers.push(...imageLayers);
layers.push(...textLayers); // Last = on top
```

### 7. **Memory Issues with Large Videos**

#### Problem: Out of memory during composition
```javascript
// Error: spawn ENOBUFS (buffer overflow)
```

#### Solution: Process in Chunks or Reduce Quality
```javascript
// ✅ GOOD: Reduce resolution for long videos
const width = duration > 60 ? 480 : 720;
const height = duration > 60 ? 480 : 720;
```

### 8. **Video Concatenation Failures**

#### Problem: "Output file does not contain any stream" or "Invalid argument"
```javascript
// ❌ BAD: Using -c copy with incompatible video segments
await executeFFmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',  // ← Fails if segments have different codecs
    outputPath
]);
```

#### Solution: Re-encode Segments for Compatibility
```javascript
// ✅ GOOD: Re-encode segments to ensure compatibility
await executeFFmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c:v', 'libx264',  // ← Re-encode video
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',      // ← Re-encode audio
    '-b:a', '128k',
    outputPath
]);
```

**Why This Works**: Video segments from different sources may have different codecs, frame rates, or pixel formats. Using `-c copy` (stream copy) only works when all segments are identical. Re-encoding normalizes everything.

**Performance Note**: Re-encoding is slower but ensures compatibility. For production, this is the safe approach.

### 9. **Video Segment Extraction Issues**

#### Problem: Segments extracted with `-c copy` fail during concatenation
```javascript
// ❌ BAD: Copy codec during extraction
await executeFFmpeg([
    '-i', videoPath,
    '-ss', startTime,
    '-t', duration,
    '-c', 'copy',  // ← May create incompatible segments
    segmentPath
]);
```

#### Solution: Re-encode During Extraction
```javascript
// ✅ GOOD: Re-encode during extraction
await executeFFmpeg([
    '-i', videoPath,
    '-ss', startTime,
    '-t', duration,
    '-c:v', 'libx264',  // ← Re-encode for compatibility
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    segmentPath
]);
```

**Best Practice**: Always re-encode segments that will be concatenated, even if it's slower. This prevents mysterious concatenation failures.

### 10. **Filter Complex Output Label Mapping Errors**

#### Problem: "Output with label 'text_layer1' does not exist in any defined filter graph"
```javascript
// ❌ BAD: Trying to map output label that doesn't exist
const finalOutput = `[text_layer${textLayers.length - 1}]`;
command.push('-map', finalOutput);
// Error if textLayers.length is 0 or filter chain is broken
```

#### Solution: Validate Output Label Before Mapping
```javascript
// ✅ GOOD: Verify output label exists in filter complex
const textLayers = config.layers.filter(layer => layer.type === 'text');
let finalOutput;

if (textLayers.length > 0) {
    finalOutput = `[text_layer${textLayers.length - 1}]`;
} else if (imageLayers.length > 0) {
    finalOutput = `[layer${imageLayers.length - 1}]`;
} else {
    finalOutput = '[base_scaled]';
}

// Validate the label exists in filter complex
if (!filterComplex.includes(finalOutput)) {
    console.error(`⚠️ Output label ${finalOutput} not found in filter complex!`);
    // Fallback to base_scaled
    finalOutput = '[base_scaled]';
}

command.push('-map', finalOutput);
```

**Why This Happens**: If the filter chain fails to create a text layer (e.g., due to a syntax error), the output label won't exist. Always validate before mapping.

### 11. **Duplicate Variable Declarations**

#### Problem: "Identifier 'textLayers' has already been declared"
```javascript
// ❌ BAD: Declaring same variable twice in same scope
buildFilterComplex(config) {
    const textLayers = config.layers.filter(...);  // Line 144
    // ... processing ...
    const textLayers = config.layers.filter(...);  // Line 230 - ERROR!
}
```

#### Solution: Reuse Existing Variables
```javascript
// ✅ GOOD: Declare once, reuse everywhere
buildFilterComplex(config) {
    const textLayers = config.layers.filter(...);  // Declare once
    const imageLayers = config.layers.filter(...);
    
    // ... processing ...
    
    // Reuse existing variables (don't redeclare)
    if (textLayers.length > 0) {
        console.log(`Text layers: ${textLayers.length}`);
    }
}
```

**Common Mistake**: Adding debug logging and accidentally redeclaring variables. Always check if a variable already exists before declaring it.

### 12. **Dynamic Folder Discovery**

#### Problem: New folders created by users don't work
```javascript
// ❌ BAD: Hardcoded folder list
const folderMap = {
  'equipment': 'equipment',
  'decks': 'decks',
  'skyline': 'skyline',
  // Missing new folders like 'rositas'!
};
```

#### Solution: Use Dynamic Folder Discovery
```javascript
// ✅ GOOD: Discover folders dynamically
async discoverFolders() {
  const [files] = await bucket.getFiles();
  const folderSet = new Set();
  
  files.forEach(file => {
    const parts = file.name.split('/');
    if (parts.length > 1) {
      const folderName = parts[0];
      if (folderName && !this.isExcluded(folderName)) {
        folderSet.add(folderName);
      }
    }
  });
  
  return Array.from(folderSet);
}
```

**Best Practice**: Always use dynamic folder discovery:
1. List all files in Firebase Storage
2. Extract unique folder names
3. Filter excluded folders (exact matches only)
4. Return discovered folders

**⚠️ CRITICAL**: Never add hardcoded folder lists. System must support any user-created folder.

### 13. **VideoSegmentCompositor Dynamic Folder Support**

#### Problem: New folders not processed during video generation
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

#### Solution: Check All Keys in videoPaths Object
```javascript
// ✅ GOOD: Process all folder keys
if (videoPaths && typeof videoPaths === 'object' && !Array.isArray(videoPaths)) {
  folderMap = {};
  const knownFolderKeys = ['equipment', 'decks', 'skyline', ...];
  
  // First, populate known folders (for backward compatibility)
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

**Best Practice**: Always check all keys in `videoPaths` object, not just known folders.

### 14. **Firebase Storage Folder Structure**

**Important**: Folder structure is **dynamically discovered**. System supports **any folder** created by users.

**Common Folders** (automatically discovered):
- `skyline/` - User-uploaded skyline videos
- `artist/` - Artist-related videos
- `decks/` - DJ equipment videos
- `equipment/` - Music equipment videos
- `family/` - Personal/family videos
- `neighborhood/` - Neighborhood/community videos
- `assets/chicago-skyline-videos/` - Pre-generated Chicago skyline videos
- `{any-new-folder}/` - User-created folders (e.g., 'rositas', 'retro_dust', 'noise')

**Security**: Firebase Storage rules allow dynamic folder creation (excluding `logos`, `paper_backgrounds`, `assets`).

---

## 🚀 Adding New Features

### ⚠️ CRITICAL: Before Adding Features

1. **Check API Function Count**: Must be ≤ 12 (Vercel Hobby plan limit)
2. **Verify Dynamic Folder Discovery**: New features must support dynamic folders
3. **Test Locally**: Always test before pushing
4. **Read FUTURE_PROOFING.md**: Follow guidelines to avoid breaking existing features

### How to Add a New Image Source

1. **Add Method to ImageLoader**
```javascript
// worker/lib/ImageLoader.js
async loadFromNewSource(config) {
    const cacheKey = this.getCacheKey(config);
    const cachedPath = path.join(this.cacheDir, cacheKey);
    
    if (await fs.pathExists(cachedPath)) {
        return cachedPath; // Use cache
    }
    
    // Download/generate image
    const image = await this.fetchFromNewSource(config);
    
    // Save to cache
    await fs.writeFile(cachedPath, image);
    return cachedPath;
}
```

2. **Integrate into ArweaveVideoGenerator**
```javascript
// worker/lib/ArweaveVideoGenerator.js
// In generateVideoWithAudio(), Step 3:
const newSourceImages = await this.imageLoader.loadFromNewSource(config);
if (newSourceImages) {
    layers.push(new LayerConfig({
        type: 'image',
        source: newSourceImages,
        position: { x: 100, y: 100 },
        size: { width: 200, height: 200 },
        opacity: 0.8
    }));
}
```

3. **Test Locally**
```bash
cd worker
node test-local.js
```

### How to Add a New Text Layer

1. **Add to generateTextLayers()**
```javascript
// worker/lib/ArweaveVideoGenerator.js
generateTextLayers(artist, mixTitle, width, height) {
    const layers = [];
    
    // Existing layers...
    layers.push(/* artist name */);
    layers.push(/* mix title */);
    
    // NEW: Add custom text layer
    layers.push(new LayerConfig({
        type: 'text',
        source: 'Custom Text',
        position: { x: width / 2, y: height / 2 }, // Centered
        size: { width: 400, height: 60 },
        opacity: 1.0
    }));
    
    return layers;
}
```

2. **VideoCompositor Handles It Automatically**
- Text layers are automatically processed in `buildFilterComplex()`
- No changes needed to VideoCompositor

### How to Update Artist Images from Deployment Manifest

**Purpose**: Extract Arweave URLs for artist images from the last deployed website manifest and update the artist JSON.

**Usage**:
```bash
node update-artist-images-from-manifest.js
```

**What It Does**:
1. Loads deployment manifest from Firebase (`system/deployment-manifest`)
2. Finds all `img/artists/*` files in the manifest
3. Maps them to artists by matching paths
4. Constructs Arweave URLs from transaction IDs (`https://arweave.net/{transactionId}`)
5. Updates `artistThumbnails` array for each artist
6. Updates `artistImageFilename` for backward compatibility
7. Saves updated JSON and syncs to Firebase

**Prerequisites**:
- Website must be deployed at least once (manifest must exist in Firebase)
- Firebase credentials configured (`FIREBASE_SERVICE_ACCOUNT_KEY`)
- Artist JSON must have `artistImageFilename` fields with `img/artists/` paths

**Output**:
- Updates `COMPLETE_ARTISTS_JSON.json` locally
- Updates Firebase `system/artists` collection
- Logs which artists were updated and their Arweave URLs

### How to Add a New Background Type

**✅ No Code Changes Needed for New Folders!**

1. **Upload Videos to Firebase Storage**
   - Create new folder (e.g., 'ocean-videos')
   - Upload videos to that folder
   - Folder automatically appears in selection UI

2. **Use Dynamic Folder Discovery**
   - System automatically discovers new folder
   - No code changes needed
   - Works with any folder name

**If You Need Custom Detection Logic**:
```javascript
// worker/lib/ArweaveVideoGenerator.js
// In generateVideoWithAudio(), Step 2:
if (prompt && prompt.toLowerCase().includes('ocean')) {
    // Try to load ocean video background from Firebase
    // VideoLoader automatically discovers 'ocean-videos' folder
    const oceanVideos = await this.videoLoader.loadAllSkylineVideos(
        true, // returnGrouped
        ['ocean-videos'] // selectedFolders
    );
    if (oceanVideos && oceanVideos['ocean-videos'] && oceanVideos['ocean-videos'].length > 0) {
        // Use ocean videos
    }
}
```

**⚠️ Important**: Don't add hardcoded folder paths. Use dynamic folder discovery instead.

### How to Modify FFmpeg Filters

⚠️ **CRITICAL**: FFmpeg filter syntax is very sensitive. Follow these rules:

1. **Test Filter String Manually First**
```bash
# Build the filter string
ffmpeg -i input.mp4 -filter_complex "[0:v]scale=720:720[scaled]" output.mp4
```

2. **Use Parameter Arrays**
```javascript
// ✅ GOOD: Easy to modify
const params = [
    `text='${text}'`,
    `fontsize=${size}`,
    // Add new params here
].join(':');
```

3. **Never Put Output Label After Color Values**
```javascript
// ❌ BAD
`bordercolor=black[output]`

// ✅ GOOD
`bordercolor=0x000000` // ... other params ... `alpha=255[output]`
```

4. **Escape Special Characters**
```javascript
// ✅ GOOD: Escape text properly
const escapedText = text
    .replace(/'/g, "\\'")  // Escape single quotes
    .replace(/:/g, "\\:"); // Escape colons
```

---

## 🧪 Testing

### Local Testing
```bash
cd worker
node test-local.js
```

**What It Tests**:
- Audio generation from Arweave
- DALL-E image generation
- Video background loading
- Image layer composition
- Text overlay rendering
- Final video output

**Output Location**: `worker/test-output/videos/`

### GitHub Actions Testing
1. Push code to `main` branch
2. Create a video job via API
3. Check GitHub Actions logs: https://github.com/Bai-ee/arweave-video-generator/actions

### Testing Checklist
- [ ] Audio downloads successfully
- [ ] DALL-E images generate (check API key)
- [ ] Video backgrounds load from Firebase
- [ ] All layers compose correctly
- [ ] Text overlays render properly
- [ ] Artist thumbnails download from Arweave (if enabled)
- [ ] Artist image segments created correctly (5th & 6th segments)
- [ ] Toggle enables/disables artist image usage
- [ ] Final video uploads to Firebase Storage
- [ ] Firestore status updates correctly
- [ ] Frontend displays video

---

## 🔐 Environment Setup

### Required Environment Variables

#### Local Development (`worker/.env`)
```bash
OPENAI_API_KEY=sk-proj-...
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
FIREBASE_STORAGE_BUCKET=editvideos-63486.firebasestorage.app
```

#### GitHub Actions (Repository Secrets)
- `OPENAI_API_KEY`
- `FIREBASE_SERVICE_ACCOUNT_KEY` (full JSON as string)
- `FIREBASE_STORAGE_BUCKET` (set in workflow file)

### Setup Scripts

#### Firebase Credentials
```bash
cd worker
node setup-firebase-env.js
# Paste Firebase service account JSON when prompted
```

#### Upload Chicago Videos
```bash
cd worker
node upload-chicago-videos.js
# Uploads videos from assets/ to Firebase Storage
```

---

## 🔍 Troubleshooting

### Video Generation Fails

1. **Check FFmpeg Syntax**
   - Look for "Invalid argument" or "Cannot find color" errors
   - Verify filter_complex string format
   - Test filter manually with FFmpeg CLI

2. **Check File Paths**
   - Verify all input files exist
   - Check file permissions
   - Ensure output directory is writable

3. **Check Environment Variables**
   - Verify `OPENAI_API_KEY` is set
   - Verify `FIREBASE_SERVICE_ACCOUNT_KEY` is valid JSON
   - Check GitHub Actions secrets are set

### DALL-E Images Not Generating

1. **Check API Key**
   ```bash
   echo $OPENAI_API_KEY
   # Should start with 'sk-proj-...'
   ```

2. **Check API Quota**
   - DALL-E 3 has rate limits
   - Check OpenAI dashboard for usage

3. **Check Error Messages**
   ```javascript
   // DALLEImageGenerator.js logs errors
   console.error('[DALLEImageGenerator] Error:', error);
   ```

### Firebase Upload Fails

1. **Check Service Account Key**
   ```javascript
   // Should be valid JSON
   const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
   ```

2. **Check Storage Bucket Name**
   ```javascript
   // Should match Firebase project
   const bucket = getStorage().bucket('editvideos-63486.firebasestorage.app');
   ```

3. **Check File Size**
   - Firebase Storage has size limits
   - Large videos may need compression

### Frontend Not Updating

1. **Check Firestore Updates**
   - Verify job status changes to 'completed'
   - Check `videoUrl` field is set

2. **Check API Response**
   ```javascript
   // api/videos.js should merge data from both collections
   const videos = await mergeVideoData(videoJobs, videosCollection);
   ```

3. **Check Frontend Polling**
   - Frontend should poll `/api/videos` every few seconds
   - Check browser console for errors

---

## 📚 Key Learnings

### FFmpeg Filter Complex Syntax
- **Format**: `[input]filter=param1=value1:param2=value2[output]`
- **Multiple Filters**: Separate with `;`
- **Output Labels**: Must come after simple numeric values, not color values
- **Escaping**: Escape single quotes and colons in text

### Firebase Integration
- **Service Account**: Required for server-side access
- **Storage**: Public URLs for video access
- **Firestore**: Real-time status updates
- **Caching**: Always cache downloads locally

### DALL-E Integration
- **Rate Limits**: Be aware of API quotas
- **Fallbacks**: Always have fallback image generation
- **Caching**: Cache generated images
- **Error Handling**: Gracefully handle API failures

### Video Composition
- **Layer Order**: Background → Images → Text (bottom to top)
- **Scaling**: Use `force_original_aspect_ratio` to maintain aspect
- **Opacity**: Use `format=rgba` and `geq` for alpha channel manipulation
- **Text Positioning**: Use FFmpeg expressions for centering: `x=(w-text_w)/2`
- **Segment Concatenation**: Always re-encode segments (never use `-c copy`) for compatibility
- **Output Label Validation**: Always verify filter output labels exist before mapping

### Video Segment Processing
- **Extraction**: Re-encode during extraction (libx264/aac) for compatibility
- **Concatenation**: Use `-f concat` with re-encoding, never stream copy
- **Multiple Sources**: Load from multiple Firebase folders and combine
- **Random Selection**: Use random segments from available videos for variety
- **Duration Control**: Use `-t` flag to ensure exact target duration
- **Artist Image Segments**: Download from Arweave, convert to 5-second video, create two identical segments (5th & 6th)

### Artist Thumbnail Management
- **Storage**: `artistThumbnails` array in artist JSON (Firestore `system/artists`)
- **Format**: Arweave URLs only (`https://arweave.net/{transactionId}`)
- **Multiple Thumbnails**: Artists can have multiple thumbnails (array)
- **Random Selection**: System randomly selects one thumbnail per video generation
- **Update Script**: `update-artist-images-from-manifest.js` extracts URLs from deployment manifest
- **Image Processing**: 90% canvas width, square aspect ratio, centered on black background

---

## 🎯 Quick Reference

### File Locations
- **Main Generator**: `worker/lib/ArweaveVideoGenerator.js`
- **FFmpeg Composition**: `worker/lib/VideoCompositor.js`
- **Local Test**: `worker/test-local.js`
- **GitHub Actions**: `.github/workflows/process-videos.yml`

### Key Commands
```bash
# Local test
cd worker && node test-local.js

# Setup Firebase
cd worker && node setup-firebase-env.js

# Upload videos
cd worker && node upload-chicago-videos.js

# Check logs
# GitHub Actions: https://github.com/Bai-ee/arweave-video-generator/actions
```

### Common Patterns
```javascript
// Layer configuration
new LayerConfig({
    type: 'image' | 'text',
    source: 'path or text',
    position: { x: number, y: number },
    size: { width: number, height: number },
    opacity: 0.0-1.0,
    scale: 0.0-1.0  // Optional
})

// Composition configuration
new CompositionConfig(
    baseVideo,      // Background video/image path
    audio,          // Audio file path
    layers,         // Array of LayerConfig
    outputPath,     // Final video path
    duration,       // Video duration in seconds
    width, height   // Canvas dimensions
)
```

---

## 📝 Version History

### Current Version (Latest)
- ✅ Fixed FFmpeg drawtext bordercolor parsing
- ✅ Added Chicago skyline video support
- ✅ Integrated DALL-E image generation
- ✅ Added VideoLoader for Firebase video backgrounds
- ✅ Multi-layer video composition
- ✅ Text overlay system
- ✅ Local testing script
- ✅ Video segment composition (5-second segments → 30-second videos)
- ✅ Video concatenation with re-encoding for compatibility
- ✅ Filter complex output label validation
- ✅ Firebase Storage folder organization
- ✅ Client-side video upload with optimization
- ✅ Video segment extraction and composition from multiple sources
- ✅ Multiple artist thumbnails support (Arweave URLs stored in `artistThumbnails` array)
- ✅ Artist thumbnail toggle in video generation (enable/disable artist image as last 2 segments)
- ✅ Artist image update script (`update-artist-images-from-manifest.js`)
- ✅ Artist image as video segments (5th & 6th segments, last 10 seconds)

### Recent Fixes (2025-01-30)
- **Video Concatenation**: Changed from `-c copy` to re-encoding (libx264/aac) to ensure compatibility
- **Segment Extraction**: Re-encode segments during extraction for concatenation compatibility
- **Text Layer Mapping**: Added validation to check if output label exists before mapping
- **Duplicate Declarations**: Fixed duplicate `textLayers` variable declaration in `buildFilterComplex()`
- **Video Loading**: Enhanced `VideoLoader` to load from multiple Firebase Storage folders
- **Error Handling**: Improved error messages and fallback logic for video composition

---

## 🤝 Contributing

When making changes:

1. **Test Locally First**: Always run `node test-local.js` before pushing
2. **Check FFmpeg Syntax**: Verify filter strings manually if modifying VideoCompositor
3. **Update This Guide**: Document new features and patterns
4. **Follow Error Handling**: Always have fallbacks for external APIs
5. **Cache Everything**: Don't re-download or re-generate unnecessarily

---

**Last Updated**: December 2025
**Maintained By**: Development Team
**Status**: ✅ Production Ready

### Recent Updates (December 2025)
- **Artist Thumbnails**: Added support for multiple Arweave-hosted thumbnails per artist
- **Artist Image Toggle**: Added UI toggle to enable/disable artist thumbnail usage in video generation
- **Update Script**: Created `update-artist-images-from-manifest.js` to extract Arweave URLs from deployment manifest
- **Image Segments**: Artist thumbnails used as 5th & 6th video segments (last 10 seconds) when enabled

