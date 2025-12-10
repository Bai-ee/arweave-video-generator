# GitHub Actions Workflow Setup

## Overview

The GitHub Actions workflow processes video generation jobs asynchronously. Jobs are created in Firestore and processed by the workflow running every minute.

## Workflow File

**Location:** `.github/workflows/process-videos.yml`

**Triggers:**
- Scheduled: Every minute (`*/1 * * * *`)
- Manual: `workflow_dispatch`
- Webhook: `repository_dispatch` (triggered by API)

## Workflow Steps

### 1. Checkout Code
- Checks out repository code

### 2. Setup Node.js
- Installs Node.js 18

### 3. Install FFmpeg and ImageMagick
- Updates apt package lists
- Installs FFmpeg and ImageMagick
- Verifies installation

**Timeout:** 12 minutes (separate from overall timeout)

**Optimization:**
- Uses `--no-install-recommends` to reduce package count
- Uses `DEBIAN_FRONTEND=noninteractive` for faster execution
- Verifies installation with version commands

### 4. Install Dependencies
- Runs `npm install` in `./worker` directory

### 5. Process Video Jobs
- Runs `node processor.js`
- Processes pending jobs from Firestore

**Environment Variables:**
- `FIREBASE_SERVICE_ACCOUNT_KEY` - Firebase service account JSON
- `FIREBASE_STORAGE_BUCKET` - Firebase Storage bucket name
- `OPENAI_API_KEY` - OpenAI API key (for DALL-E fallback)
- `GITHUB_ACTIONS` - Set to 'true' to indicate GitHub Actions environment

## Timeouts

**Overall Timeout:** 20 minutes
- Increased from 15 minutes to account for dependency installation

**Dependency Installation Timeout:** 12 minutes
- Separate timeout for apt-get install step
- Prevents workflow from timing out during slow package installation

## Performance Considerations

### Dependency Installation

**Current Time:** 5-10 minutes (can vary)

**Optimization Strategies:**
1. Use `--no-install-recommends` (already done)
2. Cache apt packages (not yet implemented)
3. Use pre-built Docker image with FFmpeg (future enhancement)

### Video Processing

**Expected Time:** 2-5 minutes per video
- Segment extraction: 30-60 seconds
- Concatenation: 30-60 seconds
- Composition: 60-120 seconds
- Upload: 30-60 seconds

**Total:** ~3-5 minutes for 30-second video

## Error Handling

### Job Status Updates

**Statuses:**
- `pending` - Job created, waiting for processing
- `processing` - Currently being processed
- `completed` - Successfully completed
- `failed` - Failed with error

**Error Storage:**
- Error message stored in `error` field
- Full error details in logs

### Retry Logic

**Current:** No automatic retry
- Failed jobs remain in Firestore with `failed` status
- Can be manually retried by creating new job

**Future:** Add retry logic for transient failures

## Monitoring

### Logs

**View Logs:**
1. Go to GitHub Actions tab
2. Click on workflow run
3. Click on "Process video jobs" job
4. View logs for each step

**Key Logs:**
- FFmpeg commands and output
- Video segment extraction
- Concatenation progress
- Error messages

### Firestore

**Query Pending Jobs:**
```javascript
db.collection('videoJobs')
  .where('status', '==', 'pending')
  .orderBy('createdAt', 'asc')
  .get()
```

**Check Job Status:**
- Query by `jobId` or document ID
- Check `status` field
- Review `error` field if failed

## Troubleshooting

### Issue: Workflow times out

**Symptoms:**
- Workflow cancelled after 20 minutes
- Job remains in `pending` or `processing` status

**Causes:**
1. Dependency installation too slow (10+ minutes)
2. Video processing too slow
3. FFmpeg command hanging

**Solutions:**
- Check dependency installation logs
- Review video processing logs for slow steps
- Check for FFmpeg errors or hangs
- Consider increasing timeout if needed

### Issue: FFmpeg installation fails

**Symptoms:**
- "Install FFmpeg and ImageMagick" step fails
- Error: "The operation was canceled"

**Causes:**
1. Network issues
2. Package repository slow
3. Timeout too short

**Solutions:**
- Check network connectivity
- Review apt-get error messages
- Increase dependency installation timeout
- Consider using cached packages

### Issue: Video generation fails

**Symptoms:**
- Job status: `failed`
- Error message in Firestore

**Causes:**
1. FFmpeg command errors
2. Invalid input files
3. Codec incompatibility
4. File size validation (now fixed)

**Solutions:**
- Review error message in Firestore
- Check GitHub Actions logs for FFmpeg errors
- Validate input videos
- Check file size validation settings

## Optimization Strategies

### Current Optimizations

1. **Separate timeout for dependencies** - Prevents workflow timeout during slow installation
2. **Minimal package installation** - Uses `--no-install-recommends`
3. **Non-interactive installation** - Uses `DEBIAN_FRONTEND=noninteractive`

### Future Optimizations

1. **Package Caching**
   - Cache `/var/cache/apt` between runs
   - Reduces installation time on subsequent runs

2. **Docker Image**
   - Pre-built image with FFmpeg and ImageMagick
   - Eliminates installation step entirely

3. **Parallel Processing**
   - Process multiple jobs in parallel
   - Use matrix strategy for concurrent jobs

4. **Selective Installation**
   - Only install required FFmpeg codecs
   - Reduce package count

## Environment Variables

### Required Secrets

**FIREBASE_SERVICE_ACCOUNT_KEY**
- Firebase service account JSON
- Used for Firestore and Storage access

**FIREBASE_STORAGE_BUCKET**
- Firebase Storage bucket name
- Format: `{project-id}.firebasestorage.app`

**OPENAI_API_KEY**
- OpenAI API key
- Used for DALL-E background generation (fallback)

**GITHUB_TOKEN**
- GitHub personal access token
- Used to trigger workflow via webhook
- Requires `repo` scope

**GITHUB_REPO**
- Repository in format `owner/repo`
- Used for webhook trigger

### Setting Secrets

1. Go to repository Settings
2. Click "Secrets and variables" → "Actions"
3. Add new secret
4. Enter name and value
5. Save

## Workflow Triggers

### Scheduled Trigger

**Cron:** `*/1 * * * *` (every minute)

**Purpose:**
- Processes pending jobs
- Backup if webhook fails

### Webhook Trigger

**Event Type:** `process-video-job`

**Triggered By:**
- `api/generate-video.js` after creating job
- Sends job ID in payload

**Purpose:**
- Immediate processing
- Faster than waiting for schedule

### Manual Trigger

**Method:** `workflow_dispatch`

**Purpose:**
- Manual testing
- Debugging
- Processing specific jobs

## Best Practices

1. **Monitor Logs Regularly**
   - Check for errors or warnings
   - Identify patterns in failures

2. **Keep Timeouts Realistic**
   - Don't set too low (causes false failures)
   - Don't set too high (wastes resources)

3. **Optimize Dependency Installation**
   - Use caching when possible
   - Minimize package count

4. **Error Handling**
   - Store clear error messages
   - Log full context for debugging

5. **Resource Management**
   - Process one job at a time (current)
   - Consider parallel processing for scale
