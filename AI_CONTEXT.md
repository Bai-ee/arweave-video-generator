# AI Context - Arweave Video Generator

## What This Repo Is

**Arweave Video Generator** is a production-ready MVP that generates branded music videos by combining audio from Arweave with video segments from Firebase Storage. Features include dynamic folder discovery, ArNS integration for persistent domains, GitHub Actions-based video processing, and permanent website deployment to Arweave.

**For Music Artists/DJs** to create branded content permanently stored on Arweave.

---

## Mandatory Workflow for AI Agents

```
AI Agent Prompt
    ↓
AI_CONTEXT.md (you are here)
    ↓
AI_INDEX.md (routing index - check for subject-specific docs)
    ↓
Relevant docs in /docs/ (ONLY if your task matches a subject)
    ↓
Code
```

### Rules

1. **Never read all docs/** - Only read docs/ folder files when your task matches a subject
2. **Check AI_INDEX.md first** - It routes you to the right doc for your task
3. **Update docs when changing code** - If your code change affects a doc's content, update that doc
4. **Warn if docs out of sync** - If docs don't match code behavior, explicitly warn

---

## System Overview

### Core Stack
- **Frontend**: Single-page HTML/JavaScript (`public/index.html`)
- **API**: Vercel Serverless Functions (12 endpoints)
- **Database**: Firestore (jobs, metadata, artists)
- **Storage**: Firebase Storage (videos, images, assets)
- **Processing**: GitHub Actions + FFmpeg (`worker/lib/`)
- **Permanent Storage**: Arweave + ArDrive Turbo SDK
- **Domain**: ArNS (`undergroundexistence.ar.io`)

### Data Flow
```
User Browser → Vercel API → Firebase (job created)
    ↓
GitHub Actions (polls every 1 min) → Worker (FFmpeg) → Firebase (video)
    ↓
Optional: Arweave (archive/website) → ArNS (domain update)
```

### Key Constraints
- **Vercel limit**: 12 serverless functions (at capacity)
- **Video duration**: 30 seconds max
- **Processing**: Sequential (one job at a time)
- **ArNS propagation**: 5-60 minutes

---

## Critical "Do NOT Break" Features

These must remain functional:

1. **Dynamic Folder Discovery** - No hardcoded folder lists
2. **VideoLoader Methods** - Both `loadTrackVideoReferences()` and `loadAllSkylineVideos()` use dynamic discovery
3. **VideoSegmentCompositor** - Supports ANY folder key, not just known folders
4. **API Function Count** - Cannot add new API files (12/12 limit)
5. **Firestore Schemas** - `videoJobs` and `videos` collection structures
6. **ArNS Integration** - Domain updates depend on `lib/ArNSUpdater.js`

---

## Quick Reference

### Core Directories
| Directory | Purpose |
|-----------|---------|
| `api/` | Vercel serverless functions |
| `worker/lib/` | Video generation pipeline |
| `worker/processor.js` | GitHub Actions entrypoint |
| `lib/` | Shared utilities |
| `public/` | Frontend UI |
| `website/` | Static site (Arweave) |
| `docs/` | Documentation (read selectively) |

### Essential Commands
```bash
npm run dev          # Local dev (port 3003)
vercel --prod        # Deploy to Vercel
./deploy.sh          # Commit + push + deploy
cd worker && node test-local.js  # Test video gen
```

### Essential Env Vars
| Variable | Purpose |
|----------|---------|
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase admin access |
| `FIREBASE_STORAGE_BUCKET` | Firebase bucket name |
| `ARWEAVE_WALLET_JWK` | Arweave wallet for signing |
| `GITHUB_TOKEN` | GitHub Actions API |
| `OPENAI_API_KEY` | DALL-E fallback |

---

## Next: Check AI_INDEX.md

Before making code changes, open `AI_INDEX.md` to:
- See if there's a doc for your specific task
- Find safe/dangerous areas to edit
- Get file references for your task

---

**Last Updated**: January 2026
**Canon**: docs/README.md (merged into this file)
