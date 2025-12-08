# Update Firebase Artists JSON

The Firebase artists collection currently only has the new Bai-ee mix you uploaded. This guide will help you restore all 14 original artists while preserving your new upload.

## Option 1: Quick Manual Update (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Navigate to: **Firestore Database** > **system** > **artists**
3. Click on the `artists` document
4. Replace the entire `artists` array with the content from:
   - `worker/data/sample-artists.json`
5. **Important**: If you uploaded a new mix for Bai-ee, make sure to add it to the Bai-ee artist's `mixes` array in the JSON before saving

## Option 2: Use Migration Script (When Deployed)

The script at `worker/migrate-artists-to-firebase.js` will:
- Load all 14 original artists from `sample-artists.json`
- Merge with existing Firebase data (preserving your new Bai-ee mix)
- Update Firebase automatically

**To run it:**
1. Deploy to Vercel (credentials work there)
2. Use Vercel CLI: `vercel dev` or run it through a temporary API endpoint

## Current Artists (14 total):

1. ACIDMAN (3 mixes)
2. AKILA (2 mixes)
3. ANDREW EMIL (2 mixes)
4. BAI-EE (5 mixes, 17 tracks) ← **Your new mix should be added here**
5. BLUE JAY (AKA Josh Zeitler) (2 mixes)
6. CESAR RAMIREZ (1 mix)
7. JOHN SIMMONS (1 mix)
8. RED EYE (1 mix)
9. DJ RELEASE AKA IKE (1 mix)
10. SASSMOUTH (1 mix)
11. SEAN SMITH (1 mix)
12. STAR TRAXX (1 mix)
13. TYREL WILLIAMS (1 mix)
14. VIVA ACID (4 mixes)

After updating, the dropdown on all pages will show all 14 artists.

