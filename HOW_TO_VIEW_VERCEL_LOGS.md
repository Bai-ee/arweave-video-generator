# How to View Vercel Logs for Troubleshooting

## Method 1: Vercel CLI (Recommended for Real-time)

```bash
# View logs for the latest deployment
vercel logs arweave-video-generator-1l9add1v8-baiees-projects.vercel.app

# View logs and filter for specific endpoint
vercel logs arweave-video-generator-1l9add1v8-baiees-projects.vercel.app | grep -i "upload\|error\|POST"

# View logs for a specific function
vercel logs arweave-video-generator-1l9add1v8-baiees-projects.vercel.app | grep "/api/upload"
```

## Method 2: Vercel Dashboard

1. Go to https://vercel.com/baiees-projects/arweave-video-generator
2. Click on the latest deployment
3. Click on the "Functions" tab
4. Click on the specific function (e.g., `/api/upload`)
5. View the "Logs" section

## Method 3: Real-time Logs via Dashboard

1. Go to https://vercel.com/baiees-projects/arweave-video-generator
2. Click on "Logs" in the left sidebar
3. Filter by function name (e.g., `api/upload`)
4. Watch logs in real-time

## What to Look For

When troubleshooting the "Forbidden" error:

1. **Check for POST requests to `/api/upload`** - If you don't see any, the error is happening client-side
2. **Look for error messages** containing:
   - "Forbidden"
   - "403"
   - "ARWEAVE_WALLET_JWK"
   - "Turbo upload"
   - "Failed to upload"
3. **Check the request headers** - Make sure `Content-Type` is `multipart/form-data`
4. **Look for form parsing errors** - Check if `formidable` is failing to parse the request

## Quick Debug Command

```bash
# Get the last 50 lines of logs filtered for upload errors
vercel logs arweave-video-generator-1l9add1v8-baiees-projects.vercel.app | grep -A 10 -B 5 "upload\|Upload\|UPLOAD\|Error\|error\|ERROR" | tail -50
```

