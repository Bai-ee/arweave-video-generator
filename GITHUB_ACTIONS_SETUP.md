# GitHub Actions Setup Guide

The video worker now runs as a scheduled GitHub Action instead of a continuous service. This is **completely free** and works great for MVP!

## How It Works

- GitHub Actions runs every **1 minute**
- Checks Firestore for pending video jobs
- Processes any pending jobs
- Uploads videos to Firebase Storage
- Exits (no continuous running needed)

## Setup Steps

### 1. Add GitHub Secret

1. Go to your repository: https://github.com/Bai-ee/arweave-video-generator
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. **Name:** `FIREBASE_SERVICE_ACCOUNT_KEY`
5. **Value:** Copy the entire JSON string from `FIREBASE_CREDENTIALS.md` (the long single-line JSON)
6. Click **Add secret**

### 2. Enable GitHub Actions

1. Go to **Settings** → **Actions** → **General**
2. Under "Workflow permissions", select:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**
3. Click **Save**

### 3. Test the Workflow

1. Go to **Actions** tab in your repository
2. You should see "Process Video Jobs" workflow
3. It will run automatically every minute
4. You can also trigger it manually:
   - Click on "Process Video Jobs"
   - Click "Run workflow" → "Run workflow"

### 4. Monitor Jobs

- Go to **Actions** tab to see workflow runs
- Click on a run to see logs
- Check Firebase Firestore to see job status updates

## How to Test

1. Visit your Vercel frontend: https://arweave-video-generator-cqdptaqg4-baiees-projects.vercel.app
2. Click "GENERATE VIDEO"
3. Wait up to 1 minute (for the next scheduled run)
4. Check the **Actions** tab to see the workflow processing
5. Video should appear in the frontend table when complete

## Manual Trigger

To process jobs immediately without waiting:

1. Go to **Actions** tab
2. Click "Process Video Jobs"
3. Click "Run workflow" button
4. Select branch: `main`
5. Click "Run workflow"

## Advantages

✅ **Completely free** (GitHub Actions free tier: 2000 minutes/month)  
✅ **No spin-down issues** (runs on schedule)  
✅ **Reliable** (GitHub's infrastructure)  
✅ **Easy to monitor** (Actions tab shows all runs)  
✅ **Manual trigger** (can process jobs on-demand)

## Cost Estimate

- Processing 1 video ≈ 2-3 minutes
- Free tier: 2000 minutes/month
- **≈ 600-1000 videos/month for free!**

## Troubleshooting

### Workflow not running
- Check **Settings** → **Actions** → **General** → Workflow permissions enabled
- Check that the secret `FIREBASE_SERVICE_ACCOUNT_KEY` is set

### Jobs not processing
- Check workflow logs in **Actions** tab
- Verify Firebase credentials are correct
- Check Firestore has pending jobs

### FFmpeg errors
- GitHub Actions includes FFmpeg by default
- If issues occur, check the workflow logs

