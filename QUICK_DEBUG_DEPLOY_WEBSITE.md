# Quick Debug Guide - Deploy Website 500 Error

## 🚨 IMMEDIATE ACTION - Get Error Logs

### Option 1: Vercel CLI (Fastest - Run This Now)

```bash
# Get logs for deploy-website function specifically
vercel logs arweave-video-generator-1wh1oaejh-baiees-projects.vercel.app | grep -A 20 "deploy-website\|Deploy Website\|WebsiteDeployer"

# Or get ALL recent errors
vercel logs arweave-video-generator-1wh1oaejh-baiees-projects.vercel.app | grep -A 10 -B 5 "Error\|error\|ERROR\|Failed\|500"

# Get last 100 lines filtered for deployment
vercel logs arweave-video-generator-1wh1oaejh-baiees-projects.vercel.app | grep -i "deploy\|website\|manifest" | tail -100
```

### Option 2: Vercel Dashboard (Visual)

1. **Go to**: https://vercel.com/baiees-projects/arweave-video-generator
2. **Click**: "Deployments" tab
3. **Click**: Latest deployment (the one that just failed)
4. **Click**: "Functions" tab
5. **Click**: `/api/deploy-website` function
6. **Click**: "Logs" section
7. **Look for**: Red error messages with stack traces

## 🔍 What to Look For in Logs

Based on the fixes we just made, look for these specific error patterns:

### 1. Manifest Format Errors
```
❌ Look for:
- "manifest"
- "index"
- "paths"
- "Invalid manifest"
```

### 2. File Collection Errors
```
❌ Look for:
- "Website directory not found"
- "No files found"
- "index.html not found"
- "artists.json not found"
```

### 3. Path Normalization Errors
```
❌ Look for:
- "path"
- "normalize"
- "DeploymentTracker"
- "Resolved website path"
```

### 4. Upload Errors
```
❌ Look for:
- "Failed to upload"
- "Upload failed"
- "Arweave upload"
- "Turbo upload"
```

### 5. Firebase Errors
```
❌ Look for:
- "Firebase"
- "Firestore"
- "deployment-manifest"
- "system/artists"
```

## 📋 Specific Log Messages We Added

With the new logging, you should see:

### File Collection:
```
[WebsiteDeployer] Starting file collection from: website
[WebsiteDeployer] File collection complete:
  - Collected: X files
  - Ignored: Y files
[WebsiteDeployer] ✅ Found index.html
[WebsiteDeployer] ✅ Found artists.json
```

### Manifest Creation:
```
[WebsiteDeployer] Creating manifest...
[WebsiteDeployer] ✅ Found index.html, setting as manifest index
[WebsiteDeployer] Manifest to upload:
{...full manifest JSON...}
[WebsiteDeployer] Total paths: X
[WebsiteDeployer] Index: {"path":"index.html"}
```

### Error Context (if error occurs):
```
[WebsiteDeployer] ❌ Error deploying website: [error message]
[WebsiteDeployer] Error context: {
  websiteDir: "...",
  hasDb: true/false,
  errorType: "...",
  errorMessage: "..."
}
```

## 🎯 Most Likely Issues

### 1. Missing index.html in Upload Results
**Look for**: "No HTML files found in upload results"
**Fix**: Check if index.html is being collected and uploaded

### 2. Manifest Format Error
**Look for**: Any error mentioning "manifest" or "index"
**Fix**: Should be fixed with our changes, but verify format

### 3. File Path Issues
**Look for**: "Error processing" or path-related errors
**Fix**: Check path normalization in logs

### 4. Firebase Connection
**Look for**: "Firebase" or "Firestore" errors
**Fix**: Check FIREBASE_SERVICE_ACCOUNT_KEY environment variable

## 🚀 Quick Fix Commands

```bash
# 1. Get the exact error
vercel logs arweave-video-generator-1wh1oaejh-baiees-projects.vercel.app --follow | grep -A 30 "Deploy Website"

# 2. Check if function is being called
vercel logs arweave-video-generator-1wh1oaejh-baiees-projects.vercel.app | grep "POST.*deploy-website"

# 3. Get full error stack
vercel logs arweave-video-generator-1wh1oaejh-baiees-projects.vercel.app | grep -B 5 -A 50 "Error\|Failed"
```

## 📸 What to Share

If you need help, share:
1. **Screenshot** of Vercel function logs for `/api/deploy-website`
2. **Last 50 lines** of logs (use command above)
3. **Any red error messages** with stack traces

## ⚡ Quick Test

After checking logs, try deploying again and watch logs in real-time:

```bash
# Terminal 1: Watch logs
vercel logs arweave-video-generator-1wh1oaejh-baiees-projects.vercel.app --follow

# Terminal 2: Trigger deployment from browser
# (Click "Deploy Website" button)
```

This will show you the exact error as it happens.
