# Video Generation Process Documentation

## Overview

The video generation system creates music videos by combining:
- Audio tracks from Arweave (mixes or tracks)
- Video segments from selected Firebase Storage folders
- Overlays (logos, text, paper textures)

## Complete Flow

### 1. Frontend (public/index.html)

**User Selection:**
- Select audio source: MIXES or TRACKS
- Select artist (for mixes) or use random
- Select video folders (checkboxes)
- Click "GENERATE VIDEO"

**Frontend Processing:**
- Normalizes folder names (removes `assets/` prefix)
- Sends request to `/api/generate-video` with:
  - `selectedFolders`: Array of normalized folder names (e.g., `['skyline', 'chicago-skyline-videos']`)
  - `useTrax`: Boolean (true for tracks, false for mixes)
  - `artist`: Artist name or 'random'
  - `duration`: 30 seconds (default)
  - `videoFilter`: Filter key (default: 'look_hard_bw_street_doc')
  - `filterIntensity`: 0.8 (80%)

### 2. API Endpoint (api/generate-video.js)

**Job Creation:**
- Validates `selectedFolders` array
- Validates folder names against allowed list
- Creates Firestore document in `videoJobs` collection
- Sets status to 'pending'
- Triggers GitHub Actions workflow via webhook
- Returns job ID immediately (async processing)

**Validation:**
- `selectedFolders` must be an array
- At least one folder must be selected
- Folder names must be valid: `['equipment', 'decks', 'skyline', 'neighborhood', 'artist', 'family', 'chicago-skyline-videos']`

### 3. GitHub Actions Workflow (.github/workflows/process-videos.yml)

**Execution:**
- Runs every minute (scheduled) or triggered via webhook
- Installs FFmpeg and ImageMagick
- Runs `worker/processor.js`

**Timeout:**
- Overall: 20 minutes
- Dependency installation: 12 minutes (separate timeout)

### 4. Worker Processor (worker/processor.js)

**Job Processing:**
- Queries Firestore for pending jobs
- Updates status to 'processing'
- Calls `ArweaveVideoGenerator.generateVideoWithAudio()`
- Uploads result to Firebase Storage
- Updates status to 'completed' or 'failed'

### 5. Video Generator (worker/lib/ArweaveVideoGenerator.js)

**Audio Loading:**
- Downloads audio from Arweave URL
- Converts to M4A format
- Detects BPM for beat synchronization

**Video Loading:**
- Calls `VideoLoader.loadTrackVideoReferences()` with normalized folder names
- Receives grouped file references (not downloaded yet)
- Maps normalized names to Firebase Storage paths:
  - `chicago-skyline-videos` → `assets/chicago-skyline-videos/`
  - Other folders use folder name directly

**Video Segment Creation:**
- Calls `VideoSegmentCompositor.createVideoFromSegments()`
- Downloads videos on-demand as needed
- Extracts 5-second segments from each video
- Concatenates segments with transitions

**Composition:**
- Adds overlays (logos, text)
- Applies video filter
- Combines with audio
- Outputs final MP4

### 6. Video Loader (worker/lib/VideoLoader.js)

**Folder Mapping:**
```javascript
const folderMap = {
  'equipment': 'equipment',
  'decks': 'decks',
  'skyline': 'skyline',
  'neighborhood': 'neighborhood',
  'artist': 'artist',
  'family': 'family',
  'chicago-skyline-videos': 'assets/chicago-skyline-videos' // Special case
};
```

**Process:**
- Receives normalized folder names from frontend
- Maps to Firebase Storage paths using `folderMap`
- Lists video files in each selected folder
- Returns grouped file references (metadata only)
- Videos are downloaded on-demand during segment extraction

### 7. Video Segment Compositor (worker/lib/VideoSegmentCompositor.js)

**Segment Extraction:**
- Downloads video file from Firebase Storage
- Validates video has valid streams (using ffprobe)
- Extracts 5-second segment
- Validates segment size (minimum 10KB)
- Aligns to beat positions if available

**Concatenation:**
- Validates all segments before concatenation
- Uses filter_complex with xfade for fades
- Falls back to simple concat demuxer if complex fails
- Validates output file:
  - Minimum size: 2MB (was 5MB, too strict)
  - Validates video streams using ffprobe
  - Accepts if size is 70% of minimum but has valid streams

**Error Handling:**
- Retries with different videos if segment extraction fails
- Logs full FFmpeg commands for debugging
- Provides actionable error messages

### 8. Video Compositor (worker/lib/VideoCompositor.js)

**Composition:**
- Loads base video/image
- Adds image layers (logos)
- Adds text layers (artist/mix title)
- Applies video filter
- Adds audio with fade out
- Outputs final video

**Text Layer Fix:**
- Uses static alpha instead of complex expressions
- Controls visibility with `enable` parameter
- Prevents FFmpeg parsing errors

## Folder Selection System

### Normalized Names

Frontend sends folder names without `assets/` prefix:
- `chicago-skyline-videos` (not `assets/chicago-skyline-videos`)
- `skyline`
- `equipment`
- etc.

### Backend Mapping

Backend maps normalized names to Firebase Storage paths:
- `chicago-skyline-videos` → `assets/chicago-skyline-videos/`
- Other folders use folder name directly

### Matching Logic

Simple exact match after normalization:
1. Normalize both selected folders and available folders (lowercase, trim, remove `assets/` prefix)
2. Check if normalized folder name is in normalized selected folders array
3. Map to correct Firebase Storage path using `folderMap`

## Validation and Error Handling

### File Size Validation

**Before Fix:**
- Required 5MB minimum for 30-second videos
- Caused false failures (valid videos can be 3-4MB)

**After Fix:**
- Requires 2MB minimum (more realistic)
- Validates video streams using ffprobe
- Accepts videos with valid streams even if slightly below size threshold (70% of minimum)

### Input Validation

**Segments:**
- Validates file exists and size > 1KB
- Validates video streams using ffprobe
- Checks codec, width, height
- Skips invalid segments with warning

**Output:**
- Validates file size
- Validates video streams
- Checks duration if possible

### Error Messages

**Improved Logging:**
- Full FFmpeg commands logged
- Filter complex logged (first 500 chars)
- Relevant error lines extracted
- Actionable error messages

## Common Issues and Solutions

### Issue: Video falls back to static image

**Causes:**
1. No videos found in selected folders
2. All segments failed validation
3. Concatenation failed
4. File size validation too strict (fixed)

**Solutions:**
- Check folder names match exactly (case-insensitive)
- Verify videos exist in Firebase Storage
- Check video formats are supported (.mp4, .mov, .m4v, .avi, .mkv, .webm)
- Review logs for specific error messages

### Issue: FFmpeg output file too small

**Causes:**
1. FFmpeg command failed silently
2. Input segments corrupted
3. Codec incompatibility
4. File size validation too strict (fixed)

**Solutions:**
- Check FFmpeg error output in logs
- Validate input segments before concatenation
- Check video codecs are compatible
- Review file size validation (now 2MB minimum with stream validation)

### Issue: drawtext filter error

**Causes:**
1. Complex alpha expressions cause parsing errors
2. Filter string too long
3. Escaping issues

**Solutions:**
- Use static alpha instead of complex expressions (fixed)
- Control visibility with `enable` parameter
- Simplify filter expressions

### Issue: Concatenation fails

**Causes:**
1. Input segments have incompatible formats
2. FFmpeg filter_complex too complex
3. Missing timebase normalization

**Solutions:**
- Validate segments before concatenation (added)
- Normalize timebase and framerate (already done)
- Fallback to simple concat if complex fails (already done)
- Check logs for specific FFmpeg errors

## Testing

### Test Cases

1. **All folders selected** - Should work
2. **Single folder selected** - Should work
3. **Random combinations** - Should work
4. **Chicago skyline only** - Should work (special nested path)
5. **Empty folders** - Should fail gracefully with clear error

### Monitoring

- Check GitHub Actions logs for FFmpeg errors
- Monitor Firestore for failed jobs
- Review error messages for patterns
- Check video file sizes (should be 2-10MB for 30s videos)

## Future Enhancements

### Planned Features

1. **Select specific videos from folders**
   - UI to browse videos in each folder
   - Select specific videos instead of random
   - Folder structure already supports this

2. **Better error recovery**
   - Automatic retry with different videos
   - Fallback to simpler encoding if complex fails
   - Progressive degradation (fewer segments if needed)

3. **Performance optimization**
   - Cache video segments
   - Parallel segment extraction
   - Optimize FFmpeg encoding settings

## Critical Features (Do Not Break)

1. **Music Mix Upload to Arweave** (`api/upload.js`)
   - Uploads audio files to Arweave
   - Updates artists.json in Firebase
   - Must remain functional

2. **Website Deployment to Arweave** (`api/deploy-website.js`)
   - Generates HTML pages from artists.json
   - Uploads website to Arweave
   - Creates manifest
   - Must remain functional

3. **Folder Selection**
   - Normalized folder names
   - Reliable matching logic
   - Support for nested folders (chicago-skyline-videos)
