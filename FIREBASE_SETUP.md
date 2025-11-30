# Firebase Setup Guide

Follow these steps to configure Firebase for the Arweave Video Generator.

## Step 1: Enable Required Services

### 1.1 Enable Firestore Database
1. Go to your Firebase project: https://console.firebase.google.com
2. Click **Firestore Database** in the left sidebar
3. Click **Create database**
4. Choose **Start in test mode** (we'll update security rules later)
5. Select a location (choose closest to your users)
6. Click **Enable**

### 1.2 Enable Storage
1. Click **Storage** in the left sidebar
2. Click **Get started**
3. Start in **test mode** (we'll update security rules later)
4. Use the same location as Firestore
5. Click **Done**

## Step 2: Get Service Account Key (for Railway Worker & Vercel API)

This is needed for the backend services to access Firebase.

1. Click the **gear icon** (⚙️) next to "Project Overview" in the left sidebar
2. Click **Project settings**
3. Go to the **Service accounts** tab
4. Click **Generate new private key**
5. Click **Generate key** in the confirmation dialog
6. A JSON file will download - **SAVE THIS FILE SECURELY**
   - This file contains sensitive credentials
   - Never commit it to git
   - We'll use this for Railway and Vercel

**The downloaded file looks like:**
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

## Step 3: Get Client SDK Config (for Frontend)

This is needed for the frontend to connect to Firebase.

1. Still in **Project settings**
2. Scroll down to **Your apps** section
3. If you don't have a web app yet:
   - Click the **</>** (web) icon
   - Register app with a nickname (e.g., "Arweave Video Generator")
   - Click **Register app**
4. Copy the `firebaseConfig` object that appears:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
```

## Step 4: Configure Security Rules

### 4.1 Firestore Rules
1. Go to **Firestore Database** > **Rules** tab
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write to videoJobs (for MVP - can restrict later)
    match /videoJobs/{jobId} {
      allow read, write: if true;
    }
    
    // Allow read/write to videos collection
    match /videos/{videoId} {
      allow read, write: if true;
    }
  }
}
```

3. Click **Publish**

### 4.2 Storage Rules
1. Go to **Storage** > **Rules** tab
2. Replace the rules with:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Allow public read access to videos
    match /videos/{videoId} {
      allow read: if true;
      allow write: if request.auth != null; // Only authenticated users can write (or change to true for MVP)
    }
  }
}
```

3. Click **Publish**

## Step 5: Configure Your Application

### 5.1 Update Frontend (public/index.html)

Open `arweave-video-generator/public/index.html` and find the Firebase config (around line 20-27):

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

Replace with your actual values from Step 3.

### 5.2 Configure Vercel Environment Variables

When deploying to Vercel, add these environment variables:

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add:

**Option A: Service Account Key (Recommended)**
- **Name**: `FIREBASE_SERVICE_ACCOUNT_KEY`
- **Value**: Copy the ENTIRE contents of the JSON file from Step 2 (as a single-line string)
  - You can use: `cat service-account-key.json | jq -c` to convert to single line
  - Or manually copy the entire JSON object

**Option B: Individual Variables (Alternative)**
- **Name**: `FIREBASE_PROJECT_ID`
- **Value**: Your project ID (from the service account JSON)

- **Name**: `FIREBASE_STORAGE_BUCKET`
- **Value**: Your storage bucket (usually `your-project-id.appspot.com`)

### 5.3 Configure Railway Environment Variables

1. Go to your Railway project settings
2. Navigate to **Variables**
3. Add the same variables as Vercel:

**Option A: Service Account Key (Recommended)**
- **Name**: `FIREBASE_SERVICE_ACCOUNT_KEY`
- **Value**: Same JSON string as Vercel

**Option B: Individual Variables**
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`

## Step 6: Verify Setup

### Test Firestore Connection
1. Go to **Firestore Database** > **Data** tab
2. You should see empty collections
3. After running the app, you should see:
   - `videoJobs` collection (with job documents)
   - `videos` collection (with completed videos)

### Test Storage
1. Go to **Storage** > **Files** tab
2. After a video is generated, you should see:
   - `videos/` folder with MP4 files

## Quick Reference

### What Goes Where:

| Component | Needs | Source |
|-----------|-------|--------|
| **Frontend** | Client SDK config | Project Settings > Your apps > Web app config |
| **Vercel API** | Service Account Key | Project Settings > Service accounts > Generate key |
| **Railway Worker** | Service Account Key | Same as Vercel |

### Environment Variables Summary:

**For Vercel & Railway:**
```
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}  # Full JSON as string
# OR
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

**For Frontend (in index.html):**
```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

## Troubleshooting

### "Firebase Admin initialization failed"
- Check that `FIREBASE_SERVICE_ACCOUNT_KEY` is a valid JSON string
- Make sure it's the entire JSON object, not just a field
- Try using individual variables instead

### "Permission denied" in Firestore
- Check Firestore security rules are published
- Verify rules allow read/write (for MVP)

### "Storage permission denied"
- Check Storage security rules are published
- Verify rules allow read access

### Frontend can't connect
- Verify Firebase config in `index.html` matches your project
- Check browser console for errors
- Ensure Firestore and Storage are enabled

## Security Notes (for Production)

For MVP, we're using open rules. For production, you should:

1. **Firestore Rules**: Add authentication checks
2. **Storage Rules**: Restrict write access to authenticated users or service accounts only
3. **API Keys**: Consider restricting API keys to specific domains
4. **Service Account**: Rotate keys periodically

