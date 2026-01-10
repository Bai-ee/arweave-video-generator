# GitHub Actions Secrets Setup Guide

## How to Check and Set FIREBASE_SERVICE_ACCOUNT_KEY Secret

### Step 1: Navigate to Repository Settings

1. Go to your GitHub repository: **https://github.com/Bai-ee/arweave-video-generator**
2. Click on the **"Settings"** tab (top navigation bar, next to "Insights")
3. In the left sidebar, scroll down to **"Secrets and variables"**
4. Click on **"Actions"** (under "Secrets and variables")

### Step 2: Check Existing Secrets

You should see a list of repository secrets. Look for:
- **`FIREBASE_SERVICE_ACCOUNT_KEY`** - This should contain your Firebase service account JSON

### Step 3: Add or Update the Secret

If the secret doesn't exist or needs to be updated:

1. Click **"New repository secret"** (top right button)
2. **Name:** `FIREBASE_SERVICE_ACCOUNT_KEY`
3. **Secret:** Paste your **entire Firebase service account JSON** as a single string

   **Important:** The value should be the complete JSON object from your Firebase service account.
   
   **⚠️ SECURITY NOTE:** Never commit the service account key to your repository. Only add it as a GitHub Secret.

4. Click **"Add secret"**

### Step 4: Verify the Secret is Set

After adding, you should see:
- ✅ The secret name `FIREBASE_SERVICE_ACCOUNT_KEY` in the list
- ⚠️ The value will be hidden (shown as dots) for security
- You can click on it to update or delete it

### Step 5: Test the Workflow

1. Go to **"Actions"** tab in your repository
2. Click on **"Process Video Jobs"** workflow
3. Check if recent runs are successful
4. If there are errors about Firebase initialization, the secret might be missing or incorrect

## Quick Links

- **Repository Settings:** https://github.com/Bai-ee/arweave-video-generator/settings
- **Secrets Page:** https://github.com/Bai-ee/arweave-video-generator/settings/secrets/actions
- **Actions Workflow:** https://github.com/Bai-ee/arweave-video-generator/actions/workflows/process-videos.yml

## Troubleshooting

### Secret Not Found Error
If you see: `Firebase credentials not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY`
- The secret is missing or incorrectly named
- Make sure it's exactly: `FIREBASE_SERVICE_ACCOUNT_KEY` (case-sensitive)

### Firebase Initialization Failed
If you see: `Firebase Admin initialization failed`
- The JSON might be malformed
- Make sure you're pasting the **entire JSON object** as a single string
- No line breaks or extra spaces

### Workflow Not Running
- Check if the workflow file exists: `.github/workflows/process-videos.yml`
- Make sure it's committed to the `main` branch
- The workflow runs every minute automatically, or can be triggered manually

