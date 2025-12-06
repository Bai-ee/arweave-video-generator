# Features Documentation

This document describes all features of the Arweave Video Generator system, their verification status, and usage instructions.

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

**Available Folders**:
- `skyline` - Skyline video clips
- `artist` - Artist video clips
- `decks` - DJ decks video clips
- `equipment` - Equipment video clips
- `family` - Family video clips
- `neighborhood` - Neighborhood video clips
- `assets/chicago-skyline-videos` - Chicago skyline videos
- `logos` - Logo images (for overlays)
- `paper_backgrounds` - Paper texture images (for overlays)

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

### Video Filter Application ✅

**Status**: Verified and working (hardcoded to Hard B&W Street Doc @ 80%)

**Description**: Videos are automatically filtered with "Hard B&W Street Doc" filter at 80% intensity.

**Technical Details**:
- Filter is applied in `VideoCompositor`
- Filter key: `look_hard_bw_street_doc`
- Intensity: 0.8 (80%)
- Applied via FFmpeg filter_complex

### Folder Preview ✅

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

## Future Enhancements

Potential improvements (not yet implemented):
- Batch video generation
- Custom video durations
- More video filters
- Video editing capabilities
- Real-time collaboration
- Video analytics


