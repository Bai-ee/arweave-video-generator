# 🚀 Instant Webhook Setup (Better UX!)

This enables **instant video processing** - when a user clicks "GENERATE VIDEO", GitHub Actions starts processing immediately instead of waiting up to 1 minute.

## ⚡ How It Works

1. User clicks "GENERATE VIDEO" on frontend
2. Vercel API creates job in Firestore
3. **Vercel API immediately triggers GitHub Actions via webhook** ⚡
4. GitHub Actions processes video within seconds
5. Video appears in frontend when complete

## 💰 Cost

**Completely FREE!** 
- GitHub Actions: **2000 minutes/month free** for public repos
- Each video takes ~30-60 seconds to process
- That's **~2000 videos/month free** (way more than MVP needs!)

## 🔧 Setup Steps (5 minutes)

### Step 1: Create GitHub Personal Access Token

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. **Name:** `arweave-video-generator-webhook`
4. **Expiration:** Choose your preference (90 days, 1 year, or no expiration)
5. **Scopes:** Check ✅ **`repo`** (full control of private repositories)
6. Click **"Generate token"**
7. **COPY THE TOKEN** (you won't see it again!)

### Step 2: Add to Vercel Environment Variables

1. Go to your Vercel project: https://vercel.com/baiees-projects/arweave-video-generator/settings/environment-variables
2. Add these two variables:

   **Variable 1:**
   - **Name:** `GITHUB_TOKEN`
   - **Value:** Paste your GitHub token from Step 1
   - **Environment:** Production, Preview, Development (check all)
   - Click **Save**

   **Variable 2:**
   - **Name:** `GITHUB_REPO`
   - **Value:** `Bai-ee/arweave-video-generator`
   - **Environment:** Production, Preview, Development (check all)
   - Click **Save**

### Step 3: Redeploy Vercel

```bash
cd "/Users/bballi/Documents/Repos/Agent Tools/arweave-video-generator"
vercel --prod
```

### Step 4: Test It!

1. Visit your Vercel site
2. Click **"GENERATE VIDEO"**
3. Check GitHub Actions - it should start processing **immediately** (within 1-2 seconds)!
4. Video should appear in ~30-60 seconds

## ✅ Verification

After setup, when you click "GENERATE VIDEO", check:

1. **Vercel logs** - Should see: `[Generate Video] GitHub Actions workflow triggered for job: [jobId]`
2. **GitHub Actions** - Should see a new workflow run starting within 1-2 seconds
3. **No more waiting** - Video processes immediately instead of waiting up to 1 minute!

## 🔄 Fallback

If the webhook fails for any reason:
- The scheduled run (every 1 minute) will still pick up the job
- No videos will be lost
- Just might take up to 1 minute instead of instant

## 🛡️ Security

- GitHub token is stored as a Vercel secret (encrypted)
- Token only has `repo` scope (can trigger workflows)
- Token can be revoked anytime from GitHub settings

## 📊 Usage Tracking

Monitor your GitHub Actions usage:
- Go to: https://github.com/settings/billing
- See "Actions & Packages" usage
- Free tier: 2000 minutes/month
- Each video: ~30-60 seconds
- **~2000 videos/month free!**

