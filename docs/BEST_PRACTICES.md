# Best Practices for Arweave Video Generator

This document outlines best practices for developing, deploying, and maintaining the Arweave Video Generator codebase.

## Development Guidelines

### Code Structure

1. **Separation of Concerns**:
   - Frontend code in `public/` directory
   - API endpoints in `api/` directory
   - Worker code in `worker/` directory
   - Shared libraries in `lib/` directory

2. **File Naming**:
   - Use kebab-case for file names: `video-loader.js`
   - Use PascalCase for class names: `VideoLoader`
   - Use camelCase for function/variable names: `loadVideos()`

3. **Error Handling**:
   - Always use try-catch blocks for async operations
   - Log errors with context: `console.error('[Component] Error:', error.message)`
   - Update Firestore job status to 'failed' on errors
   - Provide user-friendly error messages in frontend

4. **Logging**:
   - Use consistent log format: `[ComponentName] Message`
   - Log important steps: job creation, processing start, completion
   - Include relevant data: jobId, file paths, counts
   - Use emoji for visual scanning: ✅ ❌ ⚠️ 📝 🔄

### Firebase Usage

**CRITICAL**: Use **Firebase Admin SDK only** - no Google Cloud Console configuration needed.

1. **Initialization**:
   ```javascript
   import { initializeFirebaseAdmin, getFirestore, getStorage } from '../lib/firebase-admin.js';
   
   // Always initialize before use
   initializeFirebaseAdmin();
   const db = getFirestore();
   const storage = getStorage();
   ```

2. **URL Generation**:
   - **Always use signed URLs** for video access (CORS compliance)
   - Never use public URLs directly (except for internal operations)
   - Signed URLs work automatically - no CORS configuration needed
   
   ```javascript
   // ✅ CORRECT: Use signed URLs
   const [signedUrl] = await file.getSignedUrl({
     action: 'read',
     expires: Date.now() + 365 * 24 * 60 * 60 * 1000 // 1 year
   });
   
   // ❌ WRONG: Don't use public URLs for client access
   const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
   ```

3. **File Operations**:
   - Make files public after upload: `await file.makePublic()`
   - Use signed URLs for client access
   - Handle errors gracefully

### CORS Handling

**Key Principle**: Use signed URLs everywhere - they work with CORS automatically.

1. **Video URLs**: Always use `getSignedUrl()` for videos returned to clients
2. **No CORS Configuration**: Signed URLs bypass CORS issues
3. **Expiry Times**:
   - Generated videos: 1 year (long-term access)
   - Folder previews: 1 hour (temporary access)
   - Upload results: 1 year (consistent with generated videos)

### Environment Variables

1. **Never commit** `.env` files or sensitive data
2. **Use Vercel Secrets** for production environment variables
3. **Use GitHub Secrets** for GitHub Actions environment variables
4. **Document** required environment variables in code comments

**Required Variables**:
- `FIREBASE_SERVICE_ACCOUNT_KEY`: Firebase service account JSON (stringified)
- `FIREBASE_STORAGE_BUCKET`: Firebase Storage bucket name
- `ARWEAVE_WALLET_JWK`: Arweave wallet JSON (stringified)
- `ARWEAVE_WALLET_ADDRESS`: Arweave wallet address
- `OPENAI_API_KEY`: OpenAI API key (optional, for DALL-E fallback)

### API Endpoint Best Practices

1. **CORS Headers**: Always set CORS headers:
   ```javascript
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
   ```

2. **Error Responses**: Return consistent error format:
   ```javascript
   return res.status(500).json({
     success: false,
     error: error.message || 'Operation failed'
   });
   ```

3. **Success Responses**: Return consistent success format:
   ```javascript
   return res.status(200).json({
     success: true,
     data: result
   });
   ```

4. **Input Validation**: Validate all inputs:
   ```javascript
   if (!folder || !fileName) {
     return res.status(400).json({
       success: false,
       error: 'Folder and fileName are required'
     });
   }
   ```

## Deployment Process

### Automated Deployment

**Always use `./deploy.sh`** to ensure both Vercel and GitHub are updated together.

```bash
./deploy.sh
```

This script:
1. Stages and commits changes
2. Pushes to GitHub (updates GitHub Actions worker code)
3. Deploys to Vercel (updates frontend/API)

### Manual Deployment

If automated script fails, deploy manually:

1. **Commit and Push to GitHub**:
   ```bash
   git add .
   git commit -m "feat: Description of changes"
   git push
   ```

2. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

**Important**: Both must be updated together to avoid mismatches.

### Pre-Deployment Checklist

- [ ] Code changes tested locally (if possible)
- [ ] No sensitive data in committed files
- [ ] Both frontend and backend changes included
- [ ] Environment variables set in Vercel and GitHub
- [ ] `.vercelignore` excludes unnecessary files
- [ ] No console.log statements with sensitive data

### Deployment Verification

After deployment:

1. **Check Vercel Deployment**:
   - Visit Vercel dashboard
   - Verify deployment succeeded
   - Check function logs for errors

2. **Check GitHub Actions**:
   - Visit GitHub Actions tab
   - Verify workflow runs successfully
   - Check workflow logs for errors

3. **Test Features**:
   - Generate a test video
   - Upload a test file
   - Verify URLs work (no CORS errors)

## Testing Procedures

### Local Testing

1. **Test Video Generation**:
   ```bash
   cd worker
   node test-mix-archive.js
   ```

2. **Test API Endpoints**:
   - Use `vercel dev` to run locally
   - Test endpoints with curl or Postman

3. **Test Frontend**:
   - Open `public/index.html` in browser
   - Test all user interactions

### Production Testing

1. **Smoke Tests**:
   - Generate a video with folder selection
   - Upload a video to a folder
   - Archive a video to Arweave
   - Verify all URLs work

2. **Error Testing**:
   - Test with invalid inputs
   - Test with missing folders
   - Test with large files
   - Verify error messages are clear

## Code Standards

### JavaScript/Node.js

1. **ES Modules**: Use ES6 import/export syntax
2. **Async/Await**: Prefer async/await over promises
3. **Error Handling**: Always handle errors
4. **Type Safety**: Use JSDoc comments for type hints

### FFmpeg Commands

1. **Use filter_complex**: For complex operations (concatenation, overlays)
2. **Validate Inputs**: Check file existence before processing
3. **Error Handling**: Check FFmpeg exit codes
4. **Logging**: Log FFmpeg commands for debugging

### Firestore Operations

1. **Use Server Timestamps**: `admin.firestore.FieldValue.serverTimestamp()`
2. **Status at Root Level**: Keep `status` at document root (not in metadata)
3. **Document IDs**: Use jobId as document ID for consistency
4. **Updates**: Use `update()` for partial updates, `set()` for full documents

## Error Handling Patterns

### API Endpoints

```javascript
export default async function handler(req, res) {
  try {
    // Validate input
    if (!req.body.requiredField) {
      return res.status(400).json({
        success: false,
        error: 'requiredField is required'
      });
    }
    
    // Process request
    const result = await processRequest(req.body);
    
    // Return success
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[EndpointName] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Operation failed'
    });
  }
}
```

### Worker Functions

```javascript
async function processJob(jobId, jobData) {
  try {
    // Update status
    await updateStatus(jobId, 'processing');
    
    // Process job
    const result = await processVideo(jobData);
    
    // Update status
    await updateStatus(jobId, 'completed', result);
  } catch (error) {
    console.error(`[Worker] Error processing job ${jobId}:`, error.message);
    await updateStatus(jobId, 'failed', { error: error.message });
  }
}
```

## Performance Optimization

1. **Video Caching**: Videos are cached locally in `outputs/video-cache/`
2. **Parallel Processing**: Use `Promise.all()` for independent operations
3. **File Cleanup**: Clean up temporary files after processing
4. **Database Queries**: Use indexes for Firestore queries

## Security Best Practices

1. **Environment Variables**: Never commit secrets
2. **Signed URLs**: Use signed URLs for file access (better security)
3. **Input Validation**: Validate all user inputs
4. **Error Messages**: Don't expose sensitive information in errors
5. **CORS**: Use signed URLs (no CORS configuration needed)

## Troubleshooting

### Common Issues

1. **CORS Errors**: Use signed URLs instead of public URLs
2. **Video Generation Fails**: Check GitHub Actions logs
3. **Upload Fails**: Check file size and format
4. **Arweave Upload Fails**: Check wallet configuration

See `TROUBLESHOOTING.md` for detailed solutions.

## Maintenance

### Regular Tasks

1. **Monitor Logs**: Check Vercel and GitHub Actions logs weekly
2. **Update Dependencies**: Update npm packages monthly
3. **Clean Up**: Remove old test files and temporary outputs
4. **Backup**: Firestore data is automatically backed up by Firebase

### Code Review

Before merging changes:
- [ ] Code follows style guidelines
- [ ] Error handling is proper
- [ ] Logging is adequate
- [ ] No sensitive data exposed
- [ ] Tests pass (if applicable)

## Documentation

1. **Code Comments**: Document complex logic
2. **README Updates**: Update README when adding features
3. **API Documentation**: Document new endpoints
4. **Changelog**: Keep changelog for major changes

## Support

For issues or questions:
1. Check `TROUBLESHOOTING.md`
2. Review logs in Vercel and GitHub Actions
3. Check Firebase Console for storage/database issues
4. Review code comments and documentation


