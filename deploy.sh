#!/bin/bash

# Deployment script for Arweave Video Generator
# This ensures both Vercel (frontend/API) and GitHub (worker code) are updated together
# 
# NOTE: Vercel is configured to auto-deploy on git push, so we skip manual deployment
# to avoid double deployment which causes 500 errors and API downtime.

set -e  # Exit on error

echo "🚀 Starting deployment process..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "worker" ]; then
    echo "❌ Error: Must run from arweave-video-generator root directory"
    exit 1
fi

# Check for uncommitted changes
if [ -z "$(git status --porcelain)" ]; then
    echo "⚠️  No changes to commit."
    echo "💡 If Vercel auto-deploy is enabled, it will deploy on git push."
    echo "💡 If you need to redeploy manually, run: vercel --prod"
    echo ""
    exit 0
else
    echo "📝 Staging changes..."
    
    # Stage important files (exclude .env files and node_modules)
    git add worker/lib/*.js worker/processor.js api/*.js public/*.html .gitignore 2>/dev/null || true
    git add worker/test-*.js worker/upload-*.js scripts/*.js 2>/dev/null || true
    
    # Check if there are actually changes to commit
    if [ -z "$(git diff --cached --name-only)" ]; then
        echo "⚠️  No relevant changes staged. Skipping commit."
        exit 0
    else
        echo "💾 Committing changes..."
        git commit -m "feat: Update video generation configuration

- Update Mix Archive video template
- Update filter support
- Update frontend UI
- Update worker processing logic

[Auto-deployed via deploy.sh]"
        
        echo "📤 Pushing to GitHub..."
        git push
        
        echo ""
        echo "✅ Deployment complete!"
        echo ""
        echo "📊 Summary:"
        echo "  - GitHub: Worker code updated (GitHub Actions will use new code)"
        echo "  - Vercel: Auto-deploying from git push (check Vercel dashboard)"
        echo ""
        echo "💡 If Vercel auto-deploy is disabled, run 'vercel --prod' manually"
        echo "💡 Next video generation will use the latest code from both sources."
    fi
fi



