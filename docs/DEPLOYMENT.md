# Deployment Guide

## ⚠️ CRITICAL: Firebase Secret Key Handling

**DO NOT modify or "optimize" Firebase service account keys.**

The code in `lib/firebase-admin.js` uses simple `JSON.parse()` - it expects valid JSON exactly as provided by Firebase Console.

**NEVER**:
- ❌ Add cleanup/optimization logic to `lib/firebase-admin.js`
- ❌ Convert `\n` to literal newlines or vice versa
- ❌ Add try-catch with "robust parsing" that modifies the key
- ❌ Remove quotes, unescape characters, or normalize the secret
- ❌ Copy cleanup logic from other files (like `upload-artists-json.js`)

**ALWAYS**:
- ✅ Use `JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)` directly
- ✅ Keep `lib/firebase-admin.js` matching `worker/firebase-admin.js` (simple version)
- ✅ If parsing fails, the secret format is wrong - fix the secret, not the code

**Reference**: Main branch works with simple parsing. Any "optimization" breaks it.

## Quick Deployment

**If Vercel auto-deploys on git push (default):**

```bash
git add .
git commit -m "feat: Your change description"
git push
# Vercel will auto-deploy automatically
```

**If Vercel auto-deploy is disabled:**

Use the automated deployment script:

```bash
./deploy.sh
```

This script will:
1. ✅ Stage and commit your changes
2. ✅ Push to GitHub (updates GitHub Actions worker code)
3. ✅ Deploy to Vercel manually (only if auto-deploy is disabled)

## Why Both Are Needed

- **GitHub**: The worker code (video generation) runs in GitHub Actions
- **Vercel**: The frontend UI and API endpoints run on Vercel

**Important**: Both must be updated together to avoid mismatches where:
- Frontend has new features but worker doesn't support them
- Worker has new logic but frontend doesn't send the right data

## Environment Variables

**⚠️ CRITICAL**: Environment variables must be set **before** deployment and **never modified by code**.

**Firebase Service Account Key**:
- Download directly from Firebase Console → Project Settings → Service Accounts
- Copy the entire JSON exactly as provided
- Paste into Vercel/GitHub Secrets without any modification
- The secret should be valid JSON with escaped newlines (`\n` in `private_key`)
- **Do NOT** add cleanup logic to parse it - use `JSON.parse()` directly

**Setup Guides**:
- See [GITHUB_SECRETS_SETUP.md](./GITHUB_SECRETS_SETUP.md) for GitHub Secrets
- See [ARWEAVE_ENV_SETUP.md](./ARWEAVE_ENV_SETUP.md) for Vercel environment variables
- See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#firebase-connection-issues) for Firebase issues

## Manual Deployment

If you need to deploy manually:

### 1. Commit and Push to GitHub
```bash
git add worker/lib/*.js worker/processor.js api/*.js public/*.html
git commit -m "feat: Your change description"
git push
```

### 2. Deploy to Vercel (only if auto-deploy is disabled)
```bash
vercel --prod
```

## Deployment Checklist

Before deploying, ensure:
- [ ] Code changes are tested locally (if possible)
- [ ] No sensitive data in committed files (.env files should be gitignored)
- [ ] Both frontend and backend changes are included
- [ ] Filter definitions are updated if adding new filters
- [ ] Video generation configuration matches frontend expectations
- [ ] **Environment variables are already set** (don't update them during deployment)
- [ ] **`lib/firebase-admin.js` uses simple `JSON.parse()`** (no cleanup logic)

## Troubleshooting

### Issue: Frontend updated but videos still use old template
**Solution**: Worker code wasn't pushed to GitHub. Run `git push` to update GitHub Actions.

### Issue: Worker code updated but frontend doesn't show new features
**Solution**: If Vercel auto-deploy is enabled, wait a few seconds. Otherwise run `vercel --prod`.

### Issue: Changes not reflected after deployment
**Solution**: 
1. Check GitHub Actions logs to see if worker is using new code
2. Check Vercel deployment logs for frontend errors
3. Clear browser cache and hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

### Issue: "Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY" or "bad control character"
**Solution**: 
1. **DO NOT add cleanup logic** - this breaks valid secrets
2. Re-download the service account JSON from Firebase Console
3. Copy the entire JSON exactly as provided (should have `\n` in `private_key`, not literal newlines)
4. Update the secret in both GitHub Secrets and Vercel Environment Variables
5. Ensure `lib/firebase-admin.js` uses simple `JSON.parse()` (match `worker/firebase-admin.js`)

**See**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md#firebase-connection-issues) for more details

## Best Practices

1. **Use `git push`** if Vercel auto-deploy is enabled (simpler, avoids double deployment)
2. **Use `./deploy.sh`** only if Vercel auto-deploy is disabled
3. **Test locally first** when possible (use `worker/test-mix-archive.js`)
4. **Check logs** after deployment to verify changes are active
5. **Commit frequently** with clear messages
6. **Never commit** `.env` files or sensitive credentials
7. **Never modify** Firebase secret format - use it exactly as provided
8. **Never add** cleanup/optimization logic to `lib/firebase-admin.js` - keep it simple



