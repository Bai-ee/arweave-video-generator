# Troubleshooting Guide

This document provides solutions to common issues encountered when working with the Arweave Video Generator.

## Table of Contents

1. [CORS Errors](#cors-errors)
2. [Video Generation Failures](#video-generation-failures)
3. [Upload Failures](#upload-failures)
4. [Arweave Upload Issues](#arweave-upload-issues)
5. [Firebase Connection Issues](#firebase-connection-issues)
6. [GitHub Actions Issues](#github-actions-issues)
7. [Vercel Deployment Issues](#vercel-deployment-issues)
8. [General Debugging](#general-debugging)

## CORS Errors

### Symptom
Browser console shows CORS errors when trying to load videos:
```
Access to fetch at 'https://storage.googleapis.com/...' from origin '...' has been blocked by CORS policy
```

### Solution
**Use signed URLs instead of public URLs**. Signed URLs work with CORS automatically.

**Check these files**:
- `worker/processor.js` - Should use `getSignedUrl()`
- `api/video-folders.js` - Should use `getSignedUrl()`
- `api/upload-video.js` - Should use `getSignedUrl()`

**Example fix**:
```javascript
// ❌ WRONG: Public URL (CORS issues)
const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;

// ✅ CORRECT: Signed URL (CORS-compliant)
const [signedUrl] = await file.getSignedUrl({
  action: 'read',
  expires: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
});
```

**Important**: No Google Cloud Console CORS configuration is needed. Signed URLs work automatically with Firebase Admin SDK.

## Video Generation Failures

### Symptom
Video generation job fails with status 'failed' in Firestore.

### Debugging Steps

1. **Check GitHub Actions Logs**:
   - Go to GitHub repository → Actions tab
   - Find the workflow run for the job
   - Check logs for error messages

2. **Check Firestore**:
   - Go to Firebase Console → Firestore
   - Find the job document in `videoJobs` collection
   - Check `error` field for error message

3. **Common Issues**:
   - **No videos in selected folders**: Ensure folders have video files
   - **FFmpeg errors**: Check segment extraction/concatenation logs
   - **Audio generation fails**: Check Arweave audio availability
   - **Storage upload fails**: Check Firebase Storage permissions

### Solutions

**Issue: "No valid segments to concatenate"**
- **Cause**: All video segments are corrupted or too small
- **Solution**: Check videos in selected folders, ensure they're valid video files

**Issue: "Video file does not exist"**
- **Cause**: Video generation failed but job continued
- **Solution**: Check FFmpeg logs for generation errors

**Issue: "Status update failed"**
- **Cause**: Firestore update error
- **Solution**: Check Firestore permissions and network connectivity

## Upload Failures

### Symptom
Video upload fails or shows error message.

### Debugging Steps

1. **Check Browser Console**:
   - Open browser developer tools
   - Check Console tab for errors
   - Check Network tab for failed requests

2. **Check File**:
   - Verify file format is supported (.mp4, .mov, .m4v, etc.)
   - Verify file size is under 500MB
   - Try uploading a smaller test file

3. **Check Firebase Storage**:
   - Go to Firebase Console → Storage
   - Verify files are being uploaded
   - Check storage rules for permissions

### Solutions

**Issue: "Upload failed: Network error"**
- **Cause**: Network connectivity issue
- **Solution**: Check internet connection, try again

**Issue: "File size exceeds limit"**
- **Cause**: File is larger than 500MB
- **Solution**: Compress file or split into smaller files

**Issue: "Invalid file type"**
- **Cause**: File format not supported
- **Solution**: Convert to supported format (.mp4, .mov, .m4v)

**Issue: "Upload progress stuck"**
- **Cause**: Large file or slow connection
- **Solution**: Wait longer, check network speed

## Arweave Upload Issues

### Symptom
Arweave archive upload fails or doesn't complete.

### Debugging Steps

1. **Check API Response**:
   - Check browser console for API errors
   - Verify response contains transaction ID

2. **Check Arweave Wallet**:
   - Verify `ARWEAVE_WALLET_JWK` is set correctly
   - Verify wallet has funds (for upload costs)
   - Check wallet address matches configuration

3. **Check Turbo SDK**:
   - Verify Turbo service is accessible
   - Check for rate limiting errors

### Solutions

**Issue: "ARWEAVE_WALLET_JWK is required"**
- **Cause**: Environment variable not set
- **Solution**: Set `ARWEAVE_WALLET_JWK` in Vercel environment variables

**Issue: "Failed to parse ARWEAVE_WALLET_JWK"**
- **Cause**: JWK is not valid JSON or has formatting issues
- **Solution**: Ensure JWK is properly stringified JSON in environment variable

**Issue: "Upload failed: Insufficient funds"**
- **Cause**: Arweave wallet doesn't have enough AR tokens
- **Solution**: Add AR tokens to wallet

**Issue: "Transaction not confirmed"**
- **Cause**: Blockchain confirmation takes 2-10 minutes
- **Solution**: Wait for confirmation, check transaction on arweave.net

## Firebase Connection Issues

### Symptom
Cannot connect to Firebase or operations fail.

### Debugging Steps

1. **Check Environment Variables**:
   - Verify `FIREBASE_SERVICE_ACCOUNT_KEY` is set
   - Verify `FIREBASE_STORAGE_BUCKET` is set
   - Check JSON format is correct (stringified)

2. **Check Firebase Console**:
   - Verify project is active
   - Check service account permissions
   - Verify storage bucket exists

3. **Check Network**:
   - Verify internet connectivity
   - Check firewall settings
   - Test Firebase connection from different network

### Solutions

**Issue: "Firebase credentials not configured"**
- **Cause**: `FIREBASE_SERVICE_ACCOUNT_KEY` not set
- **Solution**: Set environment variable in Vercel and GitHub Secrets

**Issue: "Permission denied"**
- **Cause**: Service account doesn't have required permissions
- **Solution**: Grant Storage Admin and Firestore Admin roles to service account

**Issue: "Bucket not found"**
- **Cause**: `FIREBASE_STORAGE_BUCKET` is incorrect
- **Solution**: Verify bucket name matches Firebase Console

## GitHub Actions Issues

### Symptom
GitHub Actions workflow fails or doesn't run.

### Debugging Steps

1. **Check Workflow File**:
   - Verify `.github/workflows/process-videos.yml` exists
   - Check workflow syntax is correct
   - Verify triggers are set correctly

2. **Check Secrets**:
   - Verify GitHub Secrets are set
   - Check secret names match workflow file
   - Verify secret values are correct

3. **Check Workflow Logs**:
   - Go to Actions tab → Select workflow run
   - Check each step for errors
   - Look for specific error messages

### Solutions

**Issue: "Workflow not running"**
- **Cause**: Cron schedule or triggers not configured
- **Solution**: Check workflow file for `on:` section, verify cron schedule

**Issue: "Secret not found"**
- **Cause**: GitHub Secret not set or name mismatch
- **Solution**: Set secret in repository Settings → Secrets and variables → Actions

**Issue: "FFmpeg not found"**
- **Cause**: FFmpeg not installed in workflow
- **Solution**: Verify `apt-get install ffmpeg` step in workflow

**Issue: "Node modules install failed"**
- **Cause**: Package.json or dependency issue
- **Solution**: Check `package.json`, verify dependencies are correct

## Vercel Deployment Issues

### Symptom
Vercel deployment fails or functions don't work.

### Debugging Steps

1. **Check Deployment Logs**:
   - Go to Vercel dashboard → Deployments
   - Select deployment → Check build logs
   - Look for error messages

2. **Check Function Logs**:
   - Go to Vercel dashboard → Functions
   - Check function logs for errors
   - Look for runtime errors

3. **Check Environment Variables**:
   - Go to Vercel dashboard → Settings → Environment Variables
   - Verify all required variables are set
   - Check variable values are correct

### Solutions

**Issue: "Build failed"**
- **Cause**: Build error or dependency issue
- **Solution**: Check build logs, verify `package.json` and dependencies

**Issue: "Function timeout"**
- **Cause**: Function execution exceeds timeout limit
- **Solution**: Increase timeout in `vercel.json` or optimize function

**Issue: "Environment variable not found"**
- **Cause**: Environment variable not set in Vercel
- **Solution**: Set variable in Vercel dashboard → Settings → Environment Variables

**Issue: "Deployment size too large"**
- **Cause**: Including unnecessary files (node_modules, outputs, etc.)
- **Solution**: Update `.vercelignore` to exclude large files

## General Debugging

### Logging

**Check logs in order**:
1. Browser console (frontend errors)
2. Vercel function logs (API errors)
3. GitHub Actions logs (worker errors)
4. Firebase Console (database/storage errors)

### Common Debugging Commands

**Test API endpoint locally**:
```bash
vercel dev
```

**Test worker locally**:
```bash
cd worker
node processor.js
```

**Check Firestore data**:
- Go to Firebase Console → Firestore
- Check `videoJobs` collection for job status
- Check `videos` collection for completed videos

**Check Firebase Storage**:
- Go to Firebase Console → Storage
- Verify files are uploaded
- Check file permissions

### Getting Help

1. **Check Documentation**:
   - `SYSTEM_ARCHITECTURE.md` - System overview
   - `FEATURES.md` - Feature documentation
   - `BEST_PRACTICES.md` - Development guidelines

2. **Review Logs**:
   - Collect relevant log entries
   - Include error messages and stack traces
   - Note when issue occurred

3. **Reproduce Issue**:
   - Document steps to reproduce
   - Note environment (local vs production)
   - Include relevant data (job IDs, file names, etc.)

### Prevention

**Best practices to prevent issues**:
1. Always use signed URLs for video access
2. Validate all inputs before processing
3. Handle errors gracefully with try-catch
4. Log important operations for debugging
5. Test changes locally before deploying
6. Monitor logs regularly
7. Keep dependencies updated
8. Follow deployment checklist

## Quick Reference

### Check Video Generation Status
```javascript
// Firestore query
db.collection('videoJobs')
  .where('status', '==', 'pending')
  .get()
```

### Check Video URL
```javascript
// Verify signed URL format
const url = videoUrl; // Should start with https://storage.googleapis.com/...&signature=...
```

### Test Firebase Connection
```javascript
const storage = getStorage();
const bucket = storage.bucket();
const [files] = await bucket.getFiles({ prefix: 'videos/' });
console.log(`Found ${files.length} videos`);
```

### Test Arweave Connection
```javascript
// Check wallet configuration
console.log('Wallet address:', process.env.ARWEAVE_WALLET_ADDRESS);
console.log('Drive ID:', process.env.ARWEAVE_DRIVE_ID);
```


