# Features Documentation

This document describes all features of the Arweave Video Generator system, their verification status, and usage instructions.

**Last Updated**: December 2025  
**Version**: 1.1.0

## Feature Verification Status

✅ **All features verified and working in live environment**

## Core Features

### 1. Video Generation with Folder Selection ✅

**Status**: Verified and working

**Description**: Generate music videos by combining audio from Arweave with video segments from selected Firebase Storage folders.

**How It Works**:
1. User selects audio source (MIXES or TRACKS)
2. User selects one or more video folders (checkboxes)
3. System extracts 5-second segments from videos in selected folders
4. Segments are concatenated into a background video
5. Overlays (paper texture, logos, text) are applied
6. Audio track is combined with video
7. Final video is uploaded to Firebase Storage

**Usage**:
1. Navigate to main page (`index.html`)
2. Select audio source: **DJ MIXES** or **ORIGINAL TRACKS**
3. (For MIXES) Select an artist or choose "Random Artist"
4. Select one or more video folders:
   - Equipment
   - Decks
   - Skyline
   - Chicago Skyline
   - Neighborhood
   - Artist
   - Family
5. Click **GENERATE VIDEO**
6. Wait for processing (10-20 seconds)
7. Video appears in the table when complete

**Technical Details**:
- **API Endpoint**: `POST /api/generate-video`
- **Parameters**:
  - `selectedFolders`: Array of folder names (required)
  - `useTrax`: Boolean (true for tracks, false for mixes)
  - `artist`: String (artist name or 'random')
  - `duration`: Number (default: 30 seconds)
  - `videoFilter`: String (filter key, default: 'look_hard_bw_street_doc')
  - `filterIntensity`: Number (0.0-1.0, default: 0.8)
  - `topLogo`: String (logo filename or null for default)
  - `endLogo`: String (logo filename or null for default)
  - `overlayEffect`: String (overlay effect name or null for random)
  - `enableOverlay`: Boolean (enable/disable overlay effects)
- **Processing**: GitHub Actions workflow runs every minute
- **Output**: Video stored in `videos/` folder in Firebase Storage
- **URL Format**: Signed URL (1 year expiry, CORS-compliant)

**Verification**:
- ✅ Job creation in Firestore with `selectedFolders` array
- ✅ GitHub Actions workflow triggers correctly
- ✅ Video generation uses selected folders
- ✅ Video segments extracted and concatenated correctly
- ✅ Final video uploaded with signed URLs
- ✅ Status updates in Firestore work correctly

### 2. Folder Selection ✅

**Status**: Verified and working

**Description**: Users can select which video folders to use when generating videos.

**How It Works**:
1. Frontend loads available folders from `/api/video-folders`
2. Checkboxes are displayed for each folder
3. User can select/deselect folders
4. Selected folders are passed to video generation API
5. At least one folder must be selected (validation)

**Usage**:
- Folders appear as checkboxes after selecting audio source
- All folders are selected by default
- Uncheck folders to exclude them
- At least one folder must remain selected

**Technical Details**:
- **API Endpoint**: `GET /api/video-folders`
- **Response**: Array of folder objects with `name`, `count`, `displayName`, `type`
- **Frontend**: `selectedFolders` Set tracks selected folder names
- **Validation**: Frontend checks `selectedFolders.size > 0` before submission

**Available Folders** (Dynamically Discovered):
- System automatically discovers **all folders** in Firebase Storage
- Supports **any user-created folder** (e.g., 'rositas', 'retro_dust', 'noise', 'grit')
- Common folders: `skyline`, `artist`, `decks`, `equipment`, `family`, `neighborhood`, `assets/chicago-skyline-videos`
- Excluded folders: `logos`, `paper_backgrounds`, `mixes/Baiee` (exact matches only)
- **Default auto-selected**: `chicago-skyline-videos`, `skyline`, `neighborhood`

**Verification**:
- ✅ Folders load from API endpoint
- ✅ Checkboxes populate correctly for both MIXES and TRACKS modes
- ✅ Selected folders passed to `/api/generate-video` as array
- ✅ Validation requires at least one folder
- ✅ Folder names match between frontend and backend

### 3. Video Upload to Folders ✅

**Status**: Verified and working

**Description**: Users can upload videos directly to Firebase Storage folders for use in video generation.

**How It Works**:
1. User clicks "UPLOAD VIDEO" button
2. Modal opens with file input and folder selector
3. User selects files and destination folder
4. Files upload directly to Firebase Storage (bypasses Vercel 10MB limit)
5. Progress is shown for each file
6. Files are automatically made public
7. Uploaded files appear in folder preview

**Usage**:
1. Click **UPLOAD VIDEO** button
2. Select video files (.mov, .mp4, .m4v, etc.) - multiple files supported
3. Select orientation (auto-detect, square, portrait, landscape)
4. Select destination folder from dropdown
5. Click **Upload**
6. Monitor progress for each file
7. Wait for completion message

**Technical Details**:
- **Upload Method**: Direct to Firebase Storage using Firebase SDK
- **File Size Limit**: 500MB per file (videos), 50MB (images)
- **Supported Formats**: 
  - Videos: .mov, .mp4, .m4v, .avi, .mkv, .webm
  - Images: .png, .jpg, .jpeg, .gif, .svg, .webp
- **Storage Path**: `{folder}/{timestamp}_{index}_{filename}`
- **Special Case**: `chicago-skyline-videos` folder uses `assets/chicago-skyline-videos/` path
- **File Visibility**: Files are automatically public after upload

**Verification**:
- ✅ Upload modal opens correctly
- ✅ Folder dropdown populates from `/api/video-folders`
- ✅ Files upload directly to Firebase Storage
- ✅ Upload path respects folder selection (including special case)
- ✅ Progress tracking works for multiple files
- ✅ Files are made public after upload

### 4. Arweave Archive Upload ✅

**Status**: Verified and working

**Description**: Users can archive videos from Firebase Storage to Arweave for permanent, decentralized storage.

**How It Works**:
1. User navigates to archive page (`archive.html`)
2. User selects a folder
3. User selects files from that folder
4. System downloads files from Firebase Storage
5. System uploads files to Arweave via Turbo SDK
6. Transaction IDs and URLs are returned
7. Archive manifest is updated in Firestore

**Usage**:
1. Navigate to **ARCHIVE** page (link in header)
2. Select a folder from the grid
3. Select files to archive (checkboxes)
4. Click **Archive X File(s) to Arweave**
5. Monitor upload progress
6. Wait for blockchain confirmation (2-10 minutes)
7. View Arweave URLs when complete

**Technical Details**:
- **API Endpoint**: `POST /api/archive-upload`
- **Parameters**:
  - `folder`: String (folder name)
  - `fileName`: String (file name)
- **Processing**: 
  - Downloads file from Firebase Storage
  - Uploads to Arweave via Turbo SDK
  - Creates job in `archiveJobs` collection
  - Updates `archiveManifest` collection
- **Response**: 
  - `transactionId`: Arweave transaction ID
  - `arweaveUrl`: `https://arweave.net/{transactionId}`
  - `turboUrl`: `https://turbo.ardrive.io/{transactionId}`
- **Confirmation Time**: 2-10 minutes (blockchain confirmation)

**Important Notes**:
- Files are not immediately viewable (must wait for blockchain confirmation)
- Uploading to Arweave has minimal costs (typically < $0.01 per file)
- Costs are paid from configured Arweave wallet
- Once confirmed, files are permanently stored on Arweave

**Verification**:
- ✅ Folder selection works
- ✅ File selection works
- ✅ `/api/archive-upload` downloads from Firebase correctly
- ✅ Upload to Arweave via Turbo SDK works
- ✅ Transaction IDs and URLs returned correctly
- ✅ Archive manifest updates in Firestore

### 5. Audio Source Selection ✅

**Status**: Verified and working

**Description**: Users can choose between DJ MIXES and ORIGINAL TRACKS as audio source.

**How It Works**:
- **MIXES**: Uses DJ mix audio from Arweave, requires artist selection
- **TRACKS**: Uses original track audio from Arweave, always uses random artist

**Usage**:
- Click **DJ MIXES** or **ORIGINAL TRACKS** button
- For MIXES: Select artist from dropdown
- For TRACKS: Artist selection is hidden (always random)

**Technical Details**:
- **Frontend**: `selectedAudioSource` variable tracks selection
- **API Parameter**: `useTrax` (true for tracks, false for mixes)
- **Backend**: `ArweaveAudioClient` handles both modes
- **Video Loading**: Both modes use same folder selection system

### 6. Video List and Status Polling ✅

**Status**: Verified and working

**Description**: Generated videos are displayed in a table with real-time status updates.

**How It Works**:
1. Frontend loads videos from `/api/videos`
2. Videos are displayed in a table
3. For pending/processing jobs, frontend polls `/api/video-status`
4. Status updates automatically when job completes
5. Completed videos show VIEW and DOWNLOAD buttons

**Usage**:
- Videos appear automatically in the table
- Status shows: ⏳ Pending, 🔄 Processing, ✅ Ready, ❌ Failed
- Click **VIEW** to open video in new tab
- Click **DOWNLOAD** to download video file
- Click **REFRESH** to manually reload video list

**Technical Details**:
- **API Endpoint**: `GET /api/videos`
- **Polling Endpoint**: `GET /api/video-status?jobId={jobId}`
- **Polling Interval**: Every 2 seconds for active jobs
- **Auto-refresh**: Every 30 seconds for all videos
- **Status Values**: 'pending', 'processing', 'completed', 'failed'

## Additional Features

### 7. Dynamic Folder Discovery ✅

**Status**: ✅ Production Ready

**Description**: System automatically discovers all folders in Firebase Storage - no hardcoded folder lists.

**How It Works**:
- Lists all files in Firebase Storage bucket
- Extracts unique folder names from file paths
- Supports nested folders (e.g., `assets/chicago-skyline-videos`)
- Excludes only specific folders (exact matches): `logos`, `paper_backgrounds`, `mixes/Baiee`

**Key Benefit**: Users can create new folders (e.g., 'rositas', 'retro_dust') and they automatically work without code changes.

**Technical Details**:
- **API**: `api/video-folders.js` - `discoverFolders()` function
- **Worker**: `worker/lib/VideoLoader.js` - Both methods use dynamic discovery
- **Compositor**: `worker/lib/VideoSegmentCompositor.js` - Supports any folder key

### 8. New Folder Creation During Upload ✅

**Status**: ✅ Production Ready

**Description**: Users can create new folders when uploading videos/images.

**How It Works**:
- Radio buttons: "Existing Folder" or "New Folder"
- New folder name is sanitized (lowercase, hyphens for spaces)
- Folder automatically appears in selection UI after creation
- Firebase Storage rules allow dynamic folder creation

**Usage**:
1. Click "UPLOAD VIDEO" button
2. Select "New Folder" radio button
3. Enter folder name (e.g., "my-videos")
4. Select files and upload
5. New folder appears in folder selection UI automatically

**Technical Details**:
- **Storage Rules**: Allow writes to any new folder (excluding `logos`, `paper_backgrounds`, `assets`)
- **Frontend**: `handleVideoUpload()` handles new folder creation
- **API**: No API call needed - direct Firebase Storage upload

### 9. ArNS Integration ✅

**Status**: ✅ Production Ready

**Description**: Automatic ArNS (Arweave Name System) domain updates after website deployment.

**How It Works**:
- After successful website deployment, automatically updates ArNS record
- Points `undergroundexistence.ar.io` to new manifest ID
- Uses `@ar.io/sdk` ANT (Arweave Name Token) SDK
- Non-blocking: deployment succeeds even if ArNS update fails

**Usage**:
- Automatic after website deployment
- ArNS URL displayed in deployment success modal
- Propagation time: 5-60 minutes

**Technical Details**:
- **Module**: `lib/ArNSUpdater.js`
- **API Integration**: `api/deploy-website.js` calls `updateArNSRecord()`
- **Environment Variables**: `ARNS_ANT_PROCESS_ID`, `ARNS_NAME`, `ARWEAVE_WALLET_JWK`
- **Response**: Returns ArNS URL (`https://undergroundexistence.ar.io`)

### 10. Firebase Usage Indicators ✅

**Status**: ✅ Production Ready

**Description**: Real-time Firebase Storage and Firestore usage tracking with cost estimates.

**Features**:
- **Storage Usage**: Shows `6.4GB/1.0GB` format (auto-converts to GB when >1GB)
- **Firestore Usage**: Shows `1.0K/50.0K` format (reads per day)
- **Status Dots**: Color-coded (red ≥90%, orange ≥75%, green <75%)
- **Cost Estimates**: Monthly cost estimates for Blaze plan
- **Auto-refresh**: Updates every 30 seconds

**Usage**:
- Displayed in header (right side, below refresh button)
- Updates automatically
- Shows usage and estimated monthly costs

**Technical Details**:
- **API Endpoint**: `GET /api/usage?type=storage|firestore|both`
- **Storage Limit**: 1GB (Blaze plan free tier)
- **Firestore Limit**: 50K reads/day (free tier)
- **Cost Calculation**: Based on usage patterns and free tier limits

### 11. Website Deployment to Arweave ✅

**Status**: ✅ Production Ready

**Description**: Deploys generated website to Arweave and updates ArNS automatically.

**How It Works**:
- Syncs Firebase artists to `website/artists.json`
- Generates HTML pages for each artist
- Uploads website files to Arweave (via ArDrive Turbo SDK)
- Creates manifest and uploads manifest
- Updates ArNS record automatically
- Returns ArNS URL and direct Arweave URL

**Usage**:
1. Click "Deploy Website" button
2. Wait for deployment (1-2 minutes)
3. View ArNS URL in success modal
4. Access website at `https://undergroundexistence.ar.io`

**Technical Details**:
- **API Endpoint**: `POST /api/deploy-website`
- **Modules**: `lib/WebsiteSync.js`, `lib/WebsiteDeployer.js`, `lib/ArNSUpdater.js`
- **Output**: ArNS URL and direct Arweave URL

### 12. Video Filter Application ✅

**Status**: Verified and working

**Description**: Users can select video filters from a dropdown menu. Default filter is "Hard B&W Street Doc" at 80% intensity.

**Usage**:
1. After selecting audio source, filter dropdown appears
2. Select filter from dropdown (default: Hard B&W Street Doc)
3. Options include all available filters plus "Random"
4. Filter intensity is fixed at 80%

**Available Filters**:
- Hard B&W Street Doc (default)
- Pixel Grit Vertical
- Faded 90s Tape
- Gritty Neon Club
- And more (dynamically loaded)

**Technical Details**:
- Filter is applied in `VideoCompositor`
- Filter key: Selected from `VIDEO_FILTERS` object
- Intensity: 0.8 (80% - fixed)
- Applied via FFmpeg filter_complex
- Random option selects a random filter from available options

### 13. Folder Preview ✅

**Status**: Verified and working

**Description**: Users can preview videos in folders before generating videos.

**Usage**:
1. Click **📂 Uploaded Videos Preview** tab
2. Click on a folder card
3. View videos in that folder
4. Click video to view/download

**Technical Details**:
- Uses `/api/video-folders?folder={folderName}` endpoint
- Returns signed URLs for video access
- Videos displayed in grid layout

### 14. Logo Selection (Top and End Logos) ✅

**Status**: Verified and working

**Description**: Users can select custom logos for the top and end of generated videos. Logos are loaded from the `logos/` folder in Firebase Storage.

**How It Works**:
1. **Top Logo**: 
   - Always appears at the top of the composition
   - Runs the entire length of the video
   - Fades out at the end with everything else
   - Default: `ue_barcode_black.png`
   - Full width (100% canvas width), centered vertically
   - Z-index: 10 (above video background)

2. **End Logo**:
   - Appears at the end only (25 seconds for 30s video)
   - Fades in after other elements have faded out
   - Default: `ue_square.png`
   - 35% width, centered horizontally and vertically
   - Z-index: 300 (highest, above everything)
   - Processed after fade-to-black (22-25s) so it appears clearly

**Usage**:
1. After selecting audio source, logo selection dropdowns appear
2. **Top Logo**: Select from dropdown (default: UE Barcode Black)
3. **End Logo**: Select from dropdown (default: UE Square)
4. Options include:
   - Default logo (top: `ue_barcode_black.png`, end: `ue_square.png`)
   - Any logo from the `logos/` folder
   - "Random" option for both
5. Logos are dynamically loaded from Firebase Storage

**Technical Details**:
- **Logo Source**: `logos/` folder in Firebase Storage
- **Download Method**: Firebase Admin SDK `file.download()` (works with private files)
- **Top Logo Default**: `ue_barcode_black.png`
- **End Logo Default**: `ue_square.png`
- **Frontend Variables**: `selectedTopLogo`, `selectedEndLogo`
- **API Parameters**: `topLogo`, `endLogo` (filename or null for default/random)
- **Backend Processing**: `worker/lib/ArweaveVideoGenerator.js`
  - Step 3: Loads top logo (custom or default)
  - Step 6: Loads end logo (custom or default, appears at 25s)
- **End Logo Timing**: Appears at `duration - 5` seconds (25s for 30s video)
- **End Logo Processing**: Marked with `addAfterFade = true` to appear after fade-to-black

**Logo Behavior**:
- **Top Logo**: Replaces default if custom selected, otherwise uses `ue_barcode_black.png`
- **End Logo**: Uses custom selection or defaults to `ue_square.png`, appears after fade
- Both logos support case-insensitive filename matching
- Logos are cached locally during video generation

**Verification**:
- ✅ Logo dropdowns populate from Firebase Storage
- ✅ Default logos load correctly when no selection made
- ✅ Custom logo selection works
- ✅ Top logo appears from start, full width
- ✅ End logo appears at 25s, after fade
- ✅ Logos download using Firebase Admin SDK (no 403 errors)

## Feature Dependencies

- **Video Generation** requires:
  - At least one folder with videos
  - Valid audio source (MIXES or TRACKS)
  - Firebase Storage access
  - GitHub Actions workflow running

- **Video Upload** requires:
  - Firebase Storage access
  - Valid file format and size
  - Folder selection

- **Arweave Archive** requires:
  - Arweave wallet configured
  - Files in Firebase Storage
  - Turbo SDK access

## Known Limitations

1. **Video Generation**:
   - Processes one job at a time
   - Maximum duration: 30 seconds (configurable)
   - Requires at least one video in selected folders

2. **Video Upload**:
   - Maximum file size: 500MB per file
   - Files must be valid video/image formats
   - Upload speed depends on file size and connection

3. **Arweave Archive**:
   - Blockchain confirmation takes 2-10 minutes
   - Costs money (typically < $0.01 per file)
   - Requires Arweave wallet with funds

### 15. Overlay Effects Selection ✅

**Status**: Verified and working

**Description**: Users can select overlay effects to apply to generated videos. Overlays switch every 10 seconds during the video.

**Usage**:
1. After selecting audio source, overlay dropdown appears
2. Select overlay effect from dropdown
3. Options: "None (Default)", "Analog Film", "Gritt", "Noise", "Retro Dust", "Random"
4. Overlay videos are loaded from `assets/{effect_name}/` folder

**Available Overlays**:
- None (Default) - No overlay effect
- Analog Film - Film grain overlay
- Gritt - Gritty texture overlay
- Noise - Noise texture overlay
- Retro Dust - Retro dust particles overlay
- Random - Randomly selects an overlay effect

**Technical Details**:
- Overlay videos switch every 10 seconds
- Overlay opacity: 50% (configurable)
- Overlay blend mode: overlay
- Z-index: 250 (above images, below text and end logo)
- Overlay videos loaded from `assets/{effect_name}/` folder in Firebase Storage
- Overlay feature can be disabled (default: enabled)

**Verification**:
- ✅ Overlay dropdown populates correctly
- ✅ Overlay effects load from Firebase Storage
- ✅ Overlays switch every 10 seconds
- ✅ Overlay opacity and blend mode work correctly
- ✅ Random overlay selection works

### 16. Artist Thumbnail Images ✅

**Status**: Verified and working

**Description**: Artists can have multiple thumbnail images stored as Arweave URLs. When enabled, artist thumbnails are used as the last 2 video segments (5th & 6th segments, last 10 seconds).

**How It Works**:
1. Artist thumbnails are uploaded to Arweave and stored in `artistThumbnails` array in artist JSON
2. Each artist can have multiple thumbnails (array of Arweave URLs)
3. When generating videos, system randomly selects one thumbnail from available thumbnails
4. Thumbnail is downloaded from Arweave and converted to a 5-second video segment
5. Two identical segments are created (5th and 6th segments = last 10 seconds)
6. Image is scaled to 90% canvas width, square aspect ratio, centered on black background

**Usage**:
1. Upload artist thumbnail via "Upload" section → "Artist Thumbnail" option
2. Image is uploaded to Arweave and URL is added to `artistThumbnails` array
3. In video generation, toggle appears in step 9: "Artist thumbnail"
4. Toggle is enabled by default (checked)
5. When enabled: Uses 4 video segments (20s) + 2 artist image segments (10s) = 30s total
6. When disabled: Uses 6 video segments (30s) total, no artist image

**Technical Details**:
- **Storage**: `artistThumbnails` array in artist JSON (Firestore `system/artists`)
- **Format**: Arweave URLs only (e.g., `https://arweave.net/{transactionId}`)
- **Backward Compatibility**: `artistImageFilename` field maintained (set to first thumbnail)
- **Image Processing**: 
  - Downloads image from Arweave URL
  - Scales to 90% canvas width (648px for 720x720 canvas)
  - Square aspect ratio (648x648px)
  - Centered on black background (720x720px)
  - Creates 5-second video loop
- **Video Generation**: 
  - When enabled: Creates 4 video segments + 2 artist image segments
  - When disabled: Creates 6 video segments
- **API Parameter**: `useArtistImage` (boolean, default: true)
- **Frontend Toggle**: Step 9 checkbox in generate video UI

**Update Script**:
- `update-artist-images-from-manifest.js` - Extracts Arweave URLs from deployment manifest and updates artist JSON
- Run: `node update-artist-images-from-manifest.js`
- Loads manifest from Firebase (`system/deployment-manifest`)
- Maps `img/artists/*` paths to artist names
- Constructs Arweave URLs from transaction IDs
- Updates `artistThumbnails` arrays

**Verification**:
- ✅ Artist thumbnails stored as Arweave URLs in `artistThumbnails` array
- ✅ Multiple thumbnails per artist supported
- ✅ Random thumbnail selection works
- ✅ Toggle enables/disables artist image usage
- ✅ Image download from Arweave works
- ✅ Image-to-video conversion works (5-second segments)
- ✅ Two segments created correctly (5th & 6th)
- ✅ When disabled, uses 6 video segments as normal

## Future Enhancements

Potential improvements (not yet implemented):
- Batch video generation
- Custom video durations
- More video filters
- Video editing capabilities
- Real-time collaboration
- Video analytics


