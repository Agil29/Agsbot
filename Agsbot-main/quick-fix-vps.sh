#!/bin/bash
set -e

echo "🔧 QUICK FIX - Build hanya api-server, skip dashboard"

# 1. Pastikan di directory yang benar
cd /home/Agil\ r29/Agsbot/Agsbot-main

# 2. Pull latest
echo "📥 Pulling latest code..."
git pull origin main

# 3. Install dependencies
echo "📦 Installing dependencies..."
pnpm install --no-frozen-lockfile

# 4. Build HANYA api-server (skip dashboard yang error)
echo "🔨 Building api-server only..."
cd artifacts/api-server
pnpm run build

# 5. Check if build success
if [ -f "dist/index.js" ]; then
    echo "✅ Build SUCCESS! File dist/index.js ada"
else
    echo "❌ Build FAILED! File dist/index.js tidak ada"
    exit 1
fi

# 6. Kembali ke root
cd /home/Agil\ r29/Agsbot/Agsbot-main

# 7. Start/Restart PM2
echo "🚀 Starting bot with PM2..."

# Delete process lama jika ada
pm2 delete agsbot 2>/dev/null || true

# Start dengan environment variables
pm2 start artifacts/api-server/dist/index.js --name agsbot --env production

# 8. Show logs
echo ""
echo "✅ DONE! Checking logs..."
sleep 2
pm2 logs agsbot --lines 30 --nostream

echo ""
echo "Bot sudah jalan! Dashboard admin mungkin belum bisa (ada error TypeScript)"
echo "Tapi BOT TELEGRAM sudah aktif dan bisa digunakan"
