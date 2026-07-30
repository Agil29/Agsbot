#!/bin/bash
set -e

echo "📍 Current directory: $(pwd)"

# Pastikan di directory root yang benar
if [ ! -f "pnpm-workspace.yaml" ]; then
  echo "❌ Error: pnpm-workspace.yaml not found!"
  echo "Please run this script from /home/Agil29/Agsbot/Agsbot-main"
  exit 1
fi

echo "🔄 Pulling latest changes from GitHub..."
git pull origin main

echo "📦 Installing dependencies..."
pnpm install --no-frozen-lockfile

echo "🔨 Building workspace..."
pnpm run build

echo "✅ Build completed!"
echo ""
echo "Now restart your services:"
echo "  pm2 restart all"
echo "  # or"
echo "  pm2 restart agsbot"
