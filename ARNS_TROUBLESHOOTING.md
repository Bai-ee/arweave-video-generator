# ArNS Troubleshooting Guide

## Quick Checks

### 1. Check Vercel Logs (Most Important)

**Via Dashboard:**
1. Go to https://vercel.com/baiees-projects/arweave-video-generator
2. Click on the latest deployment
3. Click "Functions" tab
4. Click `/api/deploy-website`
5. Click "Logs" tab
6. Look for:
   - `[Deploy Website] Updating ArNS record...`
   - `[ArNSUpdater] ✅ ArNS record updated successfully`
   - `[Deploy Website] ✅ ArNS record updated: https://undergroundexistence.ar.io`
   - OR error messages like `⚠️ ArNS update failed`

**Via CLI:**
```bash
# Get deployment URL first
vercel ls

# Then check logs (replace with your deployment URL)
vercel logs arweave-video-generator-XXXXX-baiees-projects.vercel.app | grep -i "ArNS\|deploy"
```

### 2. Check Deployment Response

When you deploy via the frontend, check the browser console:
1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for the deployment response
4. Check if `data.arnsUrl` is present in the response

### 3. Verify ArNS Record

**Option A: Check via Script (Local)**
```bash
# Make sure ARNS_ANT_PROCESS_ID is in .env.local
node check-arns-record.js
```

**Option B: Check via ArNS App**
1. Visit https://arns.app
2. Connect your Arweave wallet
3. Click "Manage Assets"
4. Find "undergroundexistence"
5. Check the current record

**Option C: Direct Check**
Visit: `https://undergroundexistence.ar.io`
- If it shows your site → ArNS is working ✅
- If it shows placeholder → ArNS record may not be set or expired

### 4. Common Issues

#### Issue: ArNS URL shows placeholder
**Possible Causes:**
1. ArNS update failed during deployment (check logs)
2. ArNS record expired (TTL is 15 minutes)
3. ArNS propagation delay (can take 2-5 minutes)
4. Environment variable not set in Vercel

**Solutions:**
1. Check Vercel logs for ArNS update errors
2. Verify `ARNS_ANT_PROCESS_ID` is set in Vercel environment variables
3. Verify `ARWEAVE_WALLET_JWK` is set in Vercel
4. Wait 5-10 minutes and check again
5. Redeploy the website to update ArNS record

#### Issue: ArNS update failed silently
**Check:**
- Vercel logs will show: `⚠️ ArNS update failed (non-blocking): [error message]`
- Common errors:
  - `ARNS_ANT_PROCESS_ID environment variable not set`
  - `ARWEAVE_WALLET_JWK environment variable not set`
  - `Failed to parse ARWEAVE_WALLET_JWK`
  - Wallet balance insufficient
  - Network timeout

#### Issue: ArNS URL not showing in deployment modal
**Solution:**
- The frontend now displays ArNS URL if available
- If ArNS update failed, it will show a warning message
- Check browser console for the full response

### 5. Verify Environment Variables in Vercel

1. Go to https://vercel.com/baiees-projects/arweave-video-generator
2. Click "Settings"
3. Click "Environment Variables"
4. Verify these are set:
   - `ARNS_ANT_PROCESS_ID` = `tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw`
   - `ARWEAVE_WALLET_JWK` = (your wallet JSON)
   - Both should be set for **Production**, **Preview**, and **Development**

### 6. Manual ArNS Update (If Needed)

If ArNS update failed, you can manually update it:

```bash
# Use the test script
node test-arns.js

# Or create a manual update script with your manifest ID
```

### 7. ArNS Propagation Time

- ArNS updates can take **2-5 minutes** to propagate
- TTL is set to **15 minutes** (900 seconds)
- If you don't see changes immediately, wait a few minutes

### 8. Next Steps After Deployment

1. ✅ Check Vercel logs for ArNS update status
2. ✅ Check deployment modal for ArNS URL
3. ✅ Wait 2-5 minutes for propagation
4. ✅ Visit `https://undergroundexistence.ar.io` to verify
5. ✅ If still showing placeholder, check logs for errors

## Quick Debug Commands

```bash
# Check ArNS record locally
node check-arns-record.js

# Test ArNS configuration
node test-arns.js

# View recent Vercel logs
vercel logs [deployment-url] | grep -i "ArNS"
```

## Getting Help

If ArNS is still not working:
1. Screenshot Vercel logs showing the error
2. Check browser console for deployment response
3. Verify environment variables are set correctly
4. Check wallet has sufficient AR balance for ArNS updates
