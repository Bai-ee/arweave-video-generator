# Troubleshooting Guide

## GitHub Actions Workflow Failed

### Step 1: Check the Error
1. Go to: https://github.com/Bai-ee/arweave-video-generator/actions
2. Click on the failed workflow run (red X)
3. Click on "process-videos" job
4. Expand the "Process video jobs" step
5. Look for the error message

### Common Errors:

#### Error: "FIREBASE_SERVICE_ACCOUNT_KEY is not set"
**Fix:**
1. Go to: https://github.com/Bai-ee/arweave-video-generator/settings/secrets/actions
2. Click "New repository secret"
3. Name: `FIREBASE_SERVICE_ACCOUNT_KEY`
4. Value: Copy the entire JSON string from `FIREBASE_CREDENTIALS.md` (line 16)
5. Click "Add secret"
6. Re-run the workflow

#### Error: "Firebase Admin initialization failed"
**Fix:**
- Check that the secret value is the complete JSON string (no line breaks)
- Make sure it starts with `{"type":"service_account"...` and ends with `...}`

#### Error: "Cannot find module"
**Fix:**
- The workflow should install dependencies automatically
- Check that `worker/package.json` exists and has all dependencies

#### Error: "FFmpeg not found"
**Fix:**
- The workflow installs FFmpeg automatically
- If it still fails, check the "Install FFmpeg" step logs

## Frontend Error: "Failed to load videos"

### Check Vercel Logs:
1. Go to: https://vercel.com/baiees-projects/arweave-video-generator
2. Click on the latest deployment
3. Go to "Functions" tab
4. Check `/api/videos` function logs

### Common Issues:
- Firebase not initialized (check environment variables in Vercel)
- Firestore query failing (check Firestore rules)
- Empty collections (this is normal if no videos exist yet)

## Test the Full Flow

1. **Create a job:**
   - Visit: https://arweave-video-generator-cqdptaqg4-baiees-projects.vercel.app
   - Click "GENERATE VIDEO"
   - Should see "Video generation started!"

2. **Check Firestore:**
   - Go to Firebase Console → Firestore Database
   - Check `videoJobs` collection
   - Should see a document with status "pending"

3. **Run GitHub Actions:**
   - Go to: https://github.com/Bai-ee/arweave-video-generator/actions
   - Click "Process Video Jobs" → "Run workflow"
   - Watch the logs

4. **Check results:**
   - Firestore: Job status should change to "completed"
   - Firebase Storage: Should see video file in `videos/` folder
   - Frontend: Refresh page, video should appear

