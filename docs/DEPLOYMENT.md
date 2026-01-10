# Deployment Guide

## Quick Deployment

Use the automated deployment script:

```bash
./deploy.sh
```

This script will:
1. ✅ Stage and commit your changes
2. ✅ Push to GitHub (updates GitHub Actions worker code)
3. ✅ Deploy to Vercel (updates frontend/API)

## Why Both Are Needed

- **GitHub**: The worker code (video generation) runs in GitHub Actions
- **Vercel**: The frontend UI and API endpoints run on Vercel

**Important**: Both must be updated together to avoid mismatches where:
- Frontend has new features but worker doesn't support them
- Worker has new logic but frontend doesn't send the right data

## Manual Deployment

If you need to deploy manually:

### 1. Commit and Push to GitHub
```bash
git add worker/lib/*.js worker/processor.js api/*.js public/*.html
git commit -m "feat: Your change description"
git push
```

### 2. Deploy to Vercel
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

## Troubleshooting

### Issue: Frontend updated but videos still use old template
**Solution**: Worker code wasn't pushed to GitHub. Run `git push` to update GitHub Actions.

### Issue: Worker code updated but frontend doesn't show new features
**Solution**: Frontend wasn't deployed to Vercel. Run `vercel --prod`.

### Issue: Changes not reflected after deployment
**Solution**: 
1. Check GitHub Actions logs to see if worker is using new code
2. Check Vercel deployment logs for frontend errors
3. Clear browser cache and hard refresh (Cmd+Shift+R / Ctrl+Shift+R)

## Best Practices

1. **Always use `./deploy.sh`** to ensure both are updated together
2. **Test locally first** when possible (use `worker/test-mix-archive.js`)
3. **Check logs** after deployment to verify changes are active
4. **Commit frequently** with clear messages
5. **Never commit** `.env` files or sensitive credentials



