# Folder Selection System Documentation

## Overview

The folder selection system allows users to choose which video folders to use when generating videos. The system normalizes folder names to handle the special case of nested folders (like `assets/chicago-skyline-videos`).

## Folder Naming Conventions

### Available Folders

1. `equipment` - Equipment video clips
2. `decks` - DJ decks video clips
3. `skyline` - Skyline video clips
4. `neighborhood` - Neighborhood video clips
5. `artist` - Artist video clips
6. `family` - Family video clips
7. `chicago-skyline-videos` - Chicago skyline videos (nested under `assets/` in Firebase Storage)

### Firebase Storage Paths

- Most folders: `{folderName}/` (e.g., `equipment/`, `skyline/`)
- Chicago skyline: `assets/chicago-skyline-videos/` (special case)

## Normalization Process

### Frontend (public/index.html)

**Before Sending to API:**
```javascript
const normalizedFolders = Array.from(selectedFolders).map(folder => {
  return folder.replace(/^assets\//, ''); // Remove assets/ prefix
});
```

**Example:**
- Input: `['assets/chicago-skyline-videos', 'skyline']`
- Output: `['chicago-skyline-videos', 'skyline']`

### Backend (worker/lib/VideoLoader.js)

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

**Matching Logic:**
1. Normalize selected folders: lowercase, trim, remove `assets/` prefix
2. For each folder in `folderMap`:
   - Check if normalized name matches any selected folder
   - If match, use Firebase Storage path from `folderMap`
   - Load videos from that path

## Implementation Details

### VideoLoader.loadTrackVideoReferences()

**Input:**
- `selectedFolders`: Array of normalized folder names (e.g., `['skyline', 'chicago-skyline-videos']`)

**Process:**
1. Normalize selected folders
2. Iterate through `folderMap`
3. Check if folder matches selected folders (exact match after normalization)
4. Get Firebase Storage prefix path from `folderMap`
5. List video files in that path
6. Return grouped file references

**Output:**
```javascript
{
  equipment: [FileRef, FileRef, ...],
  decks: [FileRef, ...],
  skyline: [FileRef, ...],
  chicago: [FileRef, ...], // Note: key is 'chicago', not 'chicago-skyline-videos'
  neighborhood: [FileRef, ...],
  artist: [FileRef, ...],
  family: [FileRef, ...]
}
```

### ArweaveVideoGenerator

**Default Folders (if none selected):**
- MIXES mode: `['skyline', 'chicago-skyline-videos']`
- TRACKS mode: Uses all folders

**Usage:**
```javascript
const groupedVideos = await this.videoLoader.loadTrackVideoReferences(
  true, // returnGrouped
  selectedFolders // normalized folder names
);
```

## Validation

### API Validation (api/generate-video.js)

**Valid Folder Names:**
```javascript
const validFolders = [
  'equipment',
  'decks',
  'skyline',
  'neighborhood',
  'artist',
  'family',
  'chicago-skyline-videos'
];
```

**Validation Steps:**
1. Check `selectedFolders` is an array
2. Check at least one folder is selected
3. Normalize folder names (lowercase, trim, remove `assets/` prefix)
4. Check all normalized names are in `validFolders` list
5. Reject with clear error if invalid

## Common Issues

### Issue: Folder not found

**Symptoms:**
- Log shows "No videos found in selected folders"
- Video falls back to static image

**Causes:**
1. Folder name mismatch (typo, case sensitivity)
2. Folder doesn't exist in Firebase Storage
3. Folder has no video files

**Solutions:**
- Check folder name matches exactly (case-insensitive)
- Verify folder exists in Firebase Storage
- Check folder has video files with supported extensions

### Issue: Chicago skyline folder not working

**Symptoms:**
- Selecting "Chicago Skyline" doesn't include videos
- Log shows folder skipped

**Causes:**
1. Frontend sending `assets/chicago-skyline-videos` instead of `chicago-skyline-videos`
2. Backend not mapping correctly

**Solutions:**
- Frontend should normalize (remove `assets/` prefix) - already done
- Backend should map `chicago-skyline-videos` to `assets/chicago-skyline-videos/` - already done
- Check logs for folder matching messages

## Testing

### Test Cases

1. **All folders selected**
   - Should load videos from all 7 folders
   - Should work consistently

2. **Single folder selected**
   - Should load videos from only that folder
   - Should work for any folder including chicago-skyline-videos

3. **Random combinations**
   - Should work for any combination
   - Should not fall back to static images

4. **Chicago skyline only**
   - Should map `chicago-skyline-videos` to `assets/chicago-skyline-videos/`
   - Should load videos correctly

5. **Empty selection**
   - Should be rejected by API validation
   - Should show clear error message

## Future Enhancements

### Select Specific Videos

**Planned Feature:**
- Browse videos in each folder
- Select specific videos instead of random
- Pass selected video IDs to backend

**Implementation Notes:**
- Folder structure already supports this
- Need to modify `VideoSegmentCompositor` to accept specific video IDs
- Need UI to browse and select videos

## Code Locations

### Frontend
- `public/index.html` - Folder selection UI and normalization

### Backend
- `api/generate-video.js` - Folder validation
- `worker/lib/VideoLoader.js` - Folder matching and video loading
- `worker/lib/ArweaveVideoGenerator.js` - Folder usage in video generation
