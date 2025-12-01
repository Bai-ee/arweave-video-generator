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
**Role**: Downloads and caches videos from Firebase Storage

**Key Methods**:
- `loadFromURL(url)` - Downloads from Firebase Storage URL
- `loadRandomFromFolder(folderPath)` - Random selection from local folder

**Caching**: Videos cached in `outputs/video-cache/` to avoid re-downloads

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

---

## 🚀 Adding New Features

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

### How to Add a New Background Type

1. **Add Detection Logic**
```javascript
// worker/lib/ArweaveVideoGenerator.js
// In generateVideoWithAudio(), Step 2:
if (prompt && prompt.toLowerCase().includes('ocean')) {
    // Try to load ocean video background
    const oceanVideo = await this.videoLoader.loadRandomVideoFromFolder(
        path.join(process.cwd(), 'assets', 'ocean-videos')
    );
    if (oceanVideo) {
        backgroundPath = oceanVideo.path;
    }
}
```

2. **Upload Videos to Firebase**
```bash
# Create upload script
node scripts/upload-ocean-videos.js
```

3. **Update VideoLoader**
```javascript
// worker/lib/VideoLoader.js
async loadRandomVideoFromFolder(folderPath) {
    // Works for any folder - no changes needed!
}
```

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

---

## 🤝 Contributing

When making changes:

1. **Test Locally First**: Always run `node test-local.js` before pushing
2. **Check FFmpeg Syntax**: Verify filter strings manually if modifying VideoCompositor
3. **Update This Guide**: Document new features and patterns
4. **Follow Error Handling**: Always have fallbacks for external APIs
5. **Cache Everything**: Don't re-download or re-generate unnecessarily

---

**Last Updated**: 2025-01-30
**Maintained By**: Development Team
**Status**: ✅ Production Ready

