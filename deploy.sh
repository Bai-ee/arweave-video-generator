#!/bin/bash

# Deployment script for Arweave Video Generator
# This ensures both Vercel (frontend/API) and GitHub (worker code) are updated together

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
    echo "⚠️  No changes to commit. Proceeding with Vercel deployment only..."
    echo ""
else
    echo "📝 Staging changes..."
    
    # Stage important files (exclude .env files and node_modules)
    git add worker/lib/*.js worker/processor.js api/*.js public/*.html .gitignore 2>/dev/null || true
    git add worker/test-*.js worker/upload-*.js scripts/*.js 2>/dev/null || true
    
    # Check if there are actually changes to commit
    if [ -z "$(git diff --cached --name-only)" ]; then
        echo "⚠️  No relevant changes staged. Skipping commit."
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
        
        echo "✅ Code pushed to GitHub (GitHub Actions will use updated worker code)"
        echo ""
    fi
fi

# Deploy to Vercel
echo "🌐 Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Summary:"
echo "  - GitHub: Worker code updated (for GitHub Actions)"
echo "  - Vercel: Frontend/API deployed"
echo ""
echo "💡 Next video generation will use the latest code from both sources."

