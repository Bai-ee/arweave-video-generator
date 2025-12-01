# 🔍 Webhook Troubleshooting Guide

## Issue: Jobs created but GitHub Actions not triggering

### Step 1: Use the Latest Deployment URL

You're currently using: `https://arweave-video-generator-ln44cuv80-baiees-projects.vercel.app/`

**Use the latest deployment:**
- Go to: https://vercel.com/baiees-projects/arweave-video-generator/deployments
- Find the **most recent** deployment (should be from just now)
- Use that URL instead

**Or use the production domain:**
- Check if you have a custom domain configured
- Or use the latest deployment URL from the CLI output

### Step 2: Check Vercel Function Logs

1. Go to: https://vercel.com/baiees-projects/arweave-video-generator/functions
2. Click on `api/generate-video.js`
3. Click "View Logs"
4. Generate a new video
5. Look for these log messages:

**✅ Success:**
```
[Generate Video] Job created: [jobId]
[Generate Video] GitHub Actions workflow triggered for job: [jobId]
```

**❌ Missing env vars:**
```
[Generate Video] GitHub token not configured - workflow will run on schedule
```

**❌ Webhook error:**
```
[Generate Video] Failed to trigger webhook (will use scheduled run): [error message]
```

### Step 3: Verify Environment Variables

1. Go to: https://vercel.com/baiees-projects/arweave-video-generator/settings/environment-variables
2. Verify both variables exist:
   - `GITHUB_TOKEN` - Should show dots (hidden)
   - `GITHUB_REPO` - Should show `Bai-ee/arweave-video-generator`
3. Check that they're set for **Production** environment
4. If missing, add them and **redeploy**

### Step 4: Test the Webhook Manually

Test if the GitHub API call works:

```bash
# Replace YOUR_TOKEN with your actual GitHub token
curl -X POST https://api.github.com/repos/Bai-ee/arweave-video-generator/dispatches \
  -H "Authorization: token YOUR_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "process-video-job",
    "client_payload": {
      "jobId": "test-123",
      "timestamp": "2025-11-30T21:00:00Z"
    }
  }'
```

**Expected response:** `204 No Content` (success)
**If error:** Check token permissions

### Step 5: Check GitHub Actions Workflow

1. Go to: https://github.com/Bai-ee/arweave-video-generator/actions
2. Check if workflow has `repository_dispatch` trigger:
   - Click "Process Video Jobs"
   - Click on `process-videos.yml`
   - Should see: `repository_dispatch: types: [process-video-job]`

### Step 6: Verify GitHub Token Permissions

1. Go to: https://github.com/settings/tokens
2. Find your token
3. Verify it has **`repo`** scope checked
4. If not, create a new token with `repo` scope

### Step 7: Check Browser Console

1. Open your Vercel site
2. Open browser DevTools (F12)
3. Go to "Console" tab
4. Click "GENERATE VIDEO"
5. Look for any errors in the console

### Step 8: Check Network Tab

1. Open browser DevTools (F12)
2. Go to "Network" tab
3. Click "GENERATE VIDEO"
4. Find the request to `/api/generate-video`
5. Check the response - should show `success: true`
6. Check if there are any errors

## Common Issues

### Issue: "GitHub token not configured"
**Solution:** Environment variables not set or not deployed
- Add variables in Vercel
- Redeploy: `vercel --prod`

### Issue: "Failed to trigger webhook"
**Solution:** Check token permissions or API error
- Verify token has `repo` scope
- Check Vercel logs for specific error message
- Test manually with curl (Step 4)

### Issue: Workflow not showing `repository_dispatch` runs
**Solution:** Workflow file not updated
- Check `.github/workflows/process-videos.yml`
- Should have `repository_dispatch` in `on:` section
- Push latest code to GitHub

### Issue: Using old deployment URL
**Solution:** Use latest deployment
- Check Vercel dashboard for latest URL
- Or use production domain if configured

## Quick Fix Checklist

- [ ] Using latest deployment URL
- [ ] `GITHUB_TOKEN` set in Vercel (Production)
- [ ] `GITHUB_REPO` set in Vercel (Production)
- [ ] Redeployed after adding variables: `vercel --prod`
- [ ] GitHub token has `repo` scope
- [ ] Workflow has `repository_dispatch` trigger
- [ ] Checked Vercel function logs for errors

## Still Not Working?

1. **Check Vercel logs** - Most important step!
2. **Share the error message** from logs
3. **Test manually** with curl (Step 4)
4. **Verify token** has correct permissions

