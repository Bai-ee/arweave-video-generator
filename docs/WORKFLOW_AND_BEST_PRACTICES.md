# Development Workflow & Best Practices

This document defines the exact workflow and expectations for feature development, testing, and deployment.

## 🎯 Core Workflow

### Feature Completion Checklist

When completing any feature or fix, follow these steps **in order**:

1. **✅ Code Changes Complete**
   - All code changes implemented
   - Linter errors resolved
   - Code follows project conventions

2. **🧪 Local Testing (REQUIRED)**
   - Run local test to verify feature works
   - For video generation features: Run test script that generates a video
   - **CRITICAL: Validate test actually PASSED, not just ran**
   - Check that expected output was created (e.g., video file with actual video content, not fallback to image)
   - Verify output matches expectations
   - Check logs for any errors or warnings
   - **If test fails, fix the issue before asking for approval**

3. **👀 User Approval**
   - Share test results with user
   - Wait for explicit approval before proceeding
   - **DO NOT** push to GitHub or deploy until approved

4. **📤 Git Commit & Push**
   - Commit changes with descriptive message
   - Push to GitHub repository
   - Verify push was successful

5. **🚀 Deploy to Vercel**
   - Deploy via Vercel CLI: `vercel --prod`
   - Wait for deployment to complete
   - Verify deployment status

6. **🔗 Provide Results with Links**
   - Always provide the live Vercel URL after deployment
   - Format: `https://[project-name].vercel.app`
   - Include any relevant paths if applicable
   - **For test outputs (videos, files):**
     - Provide filename only (copy-paste friendly): `FILENAME.mp4`
     - Provide Cursor file viewer link: `arweave-video-generator/worker/outputs/videos/FILENAME.mp4`
     - Provide full path for reference: `/full/absolute/path/to/file`

---

## 📋 Standard Commands

### Local Testing
```bash
cd arweave-video-generator/worker
node test-[feature-name].js
```

### Git Workflow
```bash
# From arweave-video-generator directory (or project root)
cd arweave-video-generator
git add .
git commit -m "Description of changes"
git push origin main
```

### Vercel Deployment
```bash
# From arweave-video-generator directory
cd arweave-video-generator
vercel --prod

# Or from project root if already in workspace
vercel --prod --cwd arweave-video-generator
```

---

## 🐛 Pitfalls & Solutions

### Pitfall 1: Forgetting to Test Locally
**Problem:** Changes pushed without local testing, causing production issues.

**Solution:** 
- Always run local test script before asking for approval
- Verify test output (video file, logs, etc.)
- Document test results in commit message

**Status:** ✅ Documented

---

### Pitfall 2: Pushing Before Approval
**Problem:** Changes pushed to GitHub before user approves, causing confusion.

**Solution:**
- Wait for explicit user approval before any git push
- Use phrases like "Ready for your approval" or "Please review and approve"
- Only proceed after user says "approved", "looks good", "go ahead", etc.

**Status:** ✅ Documented

---

### Pitfall 3: Missing Vercel URL
**Problem:** Deployment completed but no URL provided, user has to find it manually.

**Solution:**
- Always include Vercel URL in response after deployment
- Format: `✅ Deployed to: https://[project].vercel.app`
- Include relevant paths if applicable

**Status:** ✅ Documented

---

### Pitfall 4: Folder Selection Issues
**Problem:** Video generation falls back to image when specific folders selected.

**Root Cause:** 
- Some videos in folders are corrupted or too short
- Segment extraction fails for multiple videos
- No minimum threshold check before fallback

**Solution:**
- Improved folder matching logic (case-insensitive, better normalization)
- Better error diagnostics in logs
- Minimum segment threshold (50% of target duration)
- Enhanced logging to identify problematic videos

**Status:** ✅ Fixed (2024-12-XX)

**Test Script:** `worker/test-skyline-neighborhood.js`

---

### Pitfall 5: Missing Test Scripts
**Problem:** No test script for specific feature, hard to verify changes.

**Solution:**
- Create test script for each major feature
- Name format: `test-[feature-name].js`
- Include in test script:
  - Clear console output showing what's being tested
  - Configuration details
  - Success/failure indicators
  - File paths for output

**Status:** ✅ Documented

---

### Pitfall 6: Not Validating Test Results
**Problem:** Test runs but doesn't actually work (e.g., falls back to image instead of generating video).

**Solution:**
- **ALWAYS verify test actually PASSED, not just that it ran**
- For video generation: Check that actual video was created (not fallback to image)
- Check logs for errors or warnings
- Verify output file exists and is valid
- **If test fails, fix the issue - don't ask for approval on broken code**

**Status:** ✅ Documented

---

### Pitfall 7: Missing File Links in Results
**Problem:** User has to manually find test output files.

**Solution:**
- Always provide three types of links:
  1. **Filename only** (copy-paste friendly): `FILENAME.mp4`
  2. **Cursor file viewer link** (relative path): `arweave-video-generator/worker/outputs/videos/FILENAME.mp4`
  3. **Full absolute path** (for reference): `/full/absolute/path/to/file`
- Make it easy for user to access files

**Status:** ✅ Documented

---

## 📝 Best Practices

### 1. Test Script Naming
- Use descriptive names: `test-skyline-neighborhood.js`, `test-video-filters.js`
- Place in `worker/` directory
- Include clear console output

### 2. Commit Messages
- Be descriptive: "Fix folder selection for skyline and neighborhood folders"
- Include context: "Add improved error handling for segment extraction failures"
- Reference issues if applicable

### 3. Logging
- Use consistent prefixes: `[ComponentName]` for all logs
- Include emoji indicators: ✅ success, ⚠️ warning, ❌ error, 🔍 debug
- Log folder matching details when troubleshooting

### 4. Error Messages
- Provide actionable error messages
- Include troubleshooting tips in logs
- Reference this document when applicable

### 5. Documentation
- Update this document when discovering new pitfalls
- Document solutions, not just problems
- Include test scripts and commands

---

## 🔄 Feature-Specific Workflows

### Video Generation Features
1. Create/update test script
2. Run test: `node test-[feature].js`
3. Verify video output exists and is valid
4. Check logs for errors
5. Get user approval
6. Commit, push, deploy
7. Provide Vercel URL

### Folder Selection Features
1. Test with specific folder combinations
2. Verify folder matching logs
3. Check that videos are found in selected folders
4. Verify no fallback to image occurs
5. Get user approval
6. Commit, push, deploy
7. Provide Vercel URL

### API Endpoint Changes
1. Test endpoint locally (if possible)
2. Verify request/response format
3. Check error handling
4. Get user approval
5. Commit, push, deploy
6. Provide Vercel URL and endpoint path

---

## 📊 Tracking

### Last Updated
- **Date:** 2024-12-XX
- **Feature:** Folder selection improvements
- **Test Script:** `test-skyline-neighborhood.js`

### Recent Changes
- ✅ Added folder matching improvements
- ✅ Enhanced error diagnostics
- ✅ Created workflow documentation

### Known Issues
- Some videos in skyline/neighborhood folders may be corrupted (monitoring)
- FFprobe not found warnings (non-critical, using fallback)

---

## 🎯 Quick Reference

**Before pushing to GitHub:**
- [ ] Code changes complete
- [ ] Local test passed
- [ ] User approved
- [ ] Commit message written

**After deployment:**
- [ ] Vercel URL provided
- [ ] Deployment status verified
- [ ] Any relevant paths included

---

## 📞 Communication Template

When completing a feature:

```
✅ Feature complete: [Feature Name]

🧪 Local Test Results:
- Test script: test-[name].js
- Output: [describe output]
- Status: ✅ Success / ❌ Failed
- **Validation: [Confirm test actually passed - e.g., "Video generated with segments, not fallback to image"]**

[If video generation:]
- Filename: FILENAME.mp4
- Cursor link: arweave-video-generator/worker/outputs/videos/FILENAME.mp4
- Full path: /full/absolute/path/to/FILENAME.mp4
- Size: [size]
- Duration: [duration]

Ready for your approval. Once approved, I'll push to GitHub and deploy to Vercel.
```

**IMPORTANT:** If test failed, fix the issue first before asking for approval!

After approval and deployment:

```
✅ Changes deployed!

📤 GitHub: Pushed commit "[commit message]"
🚀 Vercel: https://[project-name].vercel.app
📁 Project: arweave-video-generator

[Any additional notes, paths, or endpoints]
```

**Note:** Replace `[project-name]` with actual Vercel project name (check via `vercel ls` or Vercel dashboard)

---

*This is a living document. Update as we discover new pitfalls and best practices.*

