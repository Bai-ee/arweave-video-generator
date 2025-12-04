#!/bin/bash
echo "🔑 OpenAI API Key Setup"
echo "======================"
echo ""
echo "Enter your OpenAI API key (starts with sk-):"
read -s OPENAI_KEY
echo ""
if [ -z "$OPENAI_KEY" ]; then
    echo "❌ No key provided"
    exit 1
fi
echo "OPENAI_API_KEY=$OPENAI_KEY" > .env
echo "✅ .env file created with OPENAI_API_KEY"
echo ""
echo "You can now run: node test-local.js"
