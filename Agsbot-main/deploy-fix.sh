#!/bin/bash
set -e

echo "🔄 Pulling latest changes from GitHub..."
git pull origin main

echo "📦 Installing dependencies (downgrading input-otp)..."
pnpm install --no-frozen-lockfile

echo "🔨 Building workspace..."
pnpm run build

echo "✅ Build completed. Now restart your services (pm2 restart all or systemctl restart your-service)"
