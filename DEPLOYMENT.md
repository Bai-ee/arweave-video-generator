# Deployment Guide

## Step 1: Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `arweave-video-generator` (or your preferred name)
3. Description: "One-click Arweave video generation with async processing"
4. Choose **Public** or **Private**
5. **DO NOT** initialize with README, .gitignore, or license (we already have these)
6. Click **Create repository**

## Step 2: Push to GitHub

After creating the repo, GitHub will show you commands. Run these in your terminal:

```bash
cd "/Users/bballi/Documents/Repos/Agent Tools/arweave-video-generator"

# Add the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/arweave-video-generator.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 3: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)

1. **Install Vercel CLI** (if not already installed):
```bash
npm i -g vercel
```

2. **Login to Vercel**:
```bash
vercel login
```

3. **Navigate to project**:
```bash
cd "/Users/bballi/Documents/Repos/Agent Tools/arweave-video-generator"
```

4. **Link to Vercel project**:
```bash
vercel link
```
   - Follow prompts:
     - Set up and deploy? **Yes**
     - Which scope? (choose your account)
     - Link to existing project? **No**
     - What's your project's name? `arweave-video-generator`
     - In which directory is your code located? `./`

5. **Add environment variable**:
```bash
vercel env add FIREBASE_SERVICE_ACCOUNT_KEY
```
   - When prompted, paste the entire JSON string from `FIREBASE_CREDENTIALS.md`
   - Select environments: **Production, Preview, Development** (all three)

6. **Deploy**:
```bash
vercel --prod
```

### Option B: Using Vercel Dashboard

1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: (leave empty)
   - **Output Directory**: (leave empty)
4. Add environment variable:
   - **Name**: `FIREBASE_SERVICE_ACCOUNT_KEY`
   - **Value**: Copy from `FIREBASE_CREDENTIALS.md` (entire JSON string)
   - **Environments**: Production, Preview, Development
5. Click **Deploy**

## Step 4: Verify Deployment

After deployment:

1. **Check Vercel logs**:
   - Go to your project dashboard
   - Click on the deployment
   - Check "Functions" tab for any errors

2. **Test the API**:
   - Visit: `https://your-project.vercel.app/api/generate-video`
   - Should return CORS headers (OPTIONS request)

3. **Test the frontend**:
   - Visit: `https://your-project.vercel.app`
   - Should see the video generation interface

## Step 5: Deploy Railway Worker

1. Go to https://railway.app/new
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. Choose your `arweave-video-generator` repository
5. **Configure**:
   - **Root Directory**: `worker`
   - **Start Command**: `node processor.js`
6. **Add environment variable**:
   - Go to **Variables** tab
   - Add: `FIREBASE_SERVICE_ACCOUNT_KEY`
   - Value: Same JSON string as Vercel
7. **Deploy**: Railway will auto-deploy

## Troubleshooting

### Vercel Deployment Issues

**Error: "Cannot find module"**
- Make sure `package.json` has all dependencies
- Check that `node_modules` is not in `.gitignore` (it shouldn't be committed, but Vercel needs to install it)

**Error: "Firebase Admin initialization failed"**
- Verify `FIREBASE_SERVICE_ACCOUNT_KEY` is set correctly
- Check that the JSON string is valid (no line breaks, proper escaping)

**CORS errors**
- Check that API endpoints have CORS headers (they should)

### Railway Worker Issues

**Worker not processing jobs**
- Check Railway logs for errors
- Verify `FIREBASE_SERVICE_ACCOUNT_KEY` is set
- Make sure Firestore has `videoJobs` collection

**"FFmpeg not found"**
- Railway needs `ffmpeg-static` in package.json (it's already there)
- Check worker logs for FFmpeg initialization

## Next Steps After Deployment

1. ✅ Test video generation from frontend
2. ✅ Check Firestore for job creation
3. ✅ Check Railway logs for processing
4. ✅ Verify videos appear in Firebase Storage
5. ✅ Test video download from frontend

