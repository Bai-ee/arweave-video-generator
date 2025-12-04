# GitHub Actions Webhook Setup

The frontend can trigger GitHub Actions workflows immediately when a video job is created, instead of waiting for the scheduled run (every minute).

## How It Works

When a video is generated from the frontend:
1. Job is created in Firestore
2. API endpoint (`/api/generate-video`) attempts to trigger GitHub Actions via webhook
3. If webhook succeeds, workflow runs immediately
4. If webhook fails, workflow will pick up the job on the next scheduled run (within 1 minute)

## Setup Instructions

### 1. Create GitHub Personal Access Token

1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Give it a name: "Vercel Webhook Trigger"
4. Select scopes:
   - ✅ `repo` (Full control of private repositories)
5. Click "Generate token"
6. **Copy the token immediately** (you won't see it again)

### 2. Set Vercel Environment Variables

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add the following variables:

   **Variable 1:**
   - Name: `GITHUB_TOKEN`
   - Value: `[Your GitHub Personal Access Token]`
   - Environment: Production, Preview, Development (select all)

   **Variable 2:**
   - Name: `GITHUB_REPO`
   - Value: `Bai-ee/arweave-video-generator` (or your repo format: `owner/repo`)
   - Environment: Production, Preview, Development (select all)

3. Click "Save"

### 3. Verify Webhook is Working

1. Generate a video from the frontend
2. Check Vercel function logs:
   - Go to Vercel Dashboard → Your Project → Functions
   - Click on `generate-video` function
   - Look for log: `[Generate Video] GitHub Actions workflow triggered for job: {jobId}`
3. Check GitHub Actions:
   - Go to https://github.com/Bai-ee/arweave-video-generator/actions
   - You should see a workflow run triggered by "repository_dispatch" event
   - It should appear within seconds of generating the video

## Troubleshooting

### Webhook Not Triggering

**Check Vercel Logs:**
- Look for: `[Generate Video] GitHub token not configured - workflow will run on schedule`
- This means `GITHUB_TOKEN` or `GITHUB_REPO` is not set

**Check for Errors:**
- Look for: `[Generate Video] Failed to trigger webhook (will use scheduled run): {error}`
- Common errors:
  - `401 Unauthorized` → Token is invalid or expired
  - `403 Forbidden` → Token doesn't have `repo` scope
  - `404 Not Found` → `GITHUB_REPO` format is wrong (should be `owner/repo`)

### Fallback Behavior

If the webhook fails, **the system still works**:
- The job is created in Firestore
- The scheduled workflow (runs every minute) will pick it up
- Video will be processed within 1 minute instead of immediately

### Token Permissions

The token needs the `repo` scope to trigger `repository_dispatch` events. If you're using a fine-grained token:
- Go to token settings
- Under "Repository access", select your repository
- Under "Permissions", enable:
  - Actions: Read and write
  - Metadata: Read-only

## Testing

To test the webhook manually:

```bash
curl -X POST https://api.github.com/repos/Bai-ee/arweave-video-generator/dispatches \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d '{"event_type":"process-video-job","client_payload":{"jobId":"test-123","timestamp":"2024-12-04T20:00:00Z"}}'
```

## Current Status

The webhook code is in `api/generate-video.js` (lines 74-101). It will:
- ✅ Trigger immediately if `GITHUB_TOKEN` and `GITHUB_REPO` are set
- ✅ Fall back to scheduled run if webhook fails
- ✅ Never fail the video generation request (webhook errors are caught)

