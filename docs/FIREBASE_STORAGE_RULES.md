# Firebase Storage Security Rules

## Current Rules

The storage rules allow:
- **Public read access** to all files
- **Public write access** to specific folders with restrictions:
  - File size limit: 500MB
  - Content type: video/* for standard video folders
  - Content type: audio/* or image/* for mixes
  - Content type: video/* or image/* for dynamically created folders (excluding restricted folders)

## Allowed Upload Folders

- `skyline/`
- `artist/`
- `decks/`
- `equipment/`
- `family/`
- `neighborhood/`
- `user-uploads/` (legacy)
- `chicago-skyline-videos/` (for video generator)
- `mixes/{artistName}/` (audio/* and image/* for mix assets)
- `{folderName}/` (dynamic folders for video/* or image/*, excluding `logos`, `paper_backgrounds`, `assets`)

## Deploying Rules

### Option 1: Firebase Console (Recommended)
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `editvideos-63486`
3. Navigate to **Storage** → **Rules**
4. Copy the contents of `storage.rules`
5. Paste into the rules editor
6. Click **Publish**

### Option 2: Firebase CLI
```bash
# Install Firebase CLI if not already installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy storage rules
firebase deploy --only storage
```

## Security Notes

- Rules allow public writes to specific folders and to dynamically created folders
- File size is limited to 500MB for all allowed uploads
- Video folders allow `video/*`; mixes allow `audio/*` and `image/*`; dynamic folders allow `video/*` and `image/*`
- Writes to `assets/**` are explicitly denied
- All files are publicly readable (for easy sharing)

If you need more security, consider:
- Adding authentication requirements
- Adding file name validation
- Adding rate limiting
- Restricting by IP or domain


