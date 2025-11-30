#!/bin/bash

# Quick Deployment Script for Arweave Video Generator
# Run this after creating your GitHub repository

echo "🚀 Arweave Video Generator - Quick Deploy"
echo "=========================================="
echo ""

# Check if GitHub remote is set
if ! git remote get-url origin &>/dev/null; then
    echo "❌ GitHub remote not set!"
    echo ""
    echo "1. Create a GitHub repository at https://github.com/new"
    echo "2. Then run:"
    echo "   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git"
    echo "   git push -u origin main"
    echo ""
    exit 1
fi

echo "✅ Git repository ready"
echo ""

# Check Vercel login
if ! vercel whoami &>/dev/null; then
    echo "⚠️  Not logged in to Vercel"
    echo "   Run: vercel login"
    echo ""
    exit 1
fi

echo "✅ Logged in to Vercel"
echo ""

# Check if already linked
if [ -f ".vercel/project.json" ]; then
    echo "✅ Already linked to Vercel project"
    echo ""
    read -p "Deploy to production? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "🚀 Deploying to production..."
        vercel --prod
    fi
else
    echo "📦 Setting up Vercel project..."
    echo ""
    echo "When prompted:"
    echo "  - Set up and deploy? → Yes"
    echo "  - Link to existing project? → No"
    echo "  - Project name? → arweave-video-generator"
    echo "  - Directory? → ./"
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        vercel link
        echo ""
        echo "📝 Adding environment variable..."
        echo "   (Paste the JSON string from FIREBASE_CREDENTIALS.md when prompted)"
        vercel env add FIREBASE_SERVICE_ACCOUNT_KEY
        echo ""
        echo "🚀 Deploying..."
        vercel --prod
    fi
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Deploy Railway worker (see DEPLOYMENT.md)"
echo "2. Test the frontend at your Vercel URL"
echo "3. Check Railway logs for video processing"

