#!/bin/bash
# Script untuk restore dari backup branch
# Usage: ./restore-backup.sh <backup-branch-name>

set -e

if [ -z "$1" ]; then
    echo "❌ Error: Nama backup branch harus diberikan"
    echo ""
    echo "Usage: ./restore-backup.sh <backup-branch-name>"
    echo ""
    echo "Daftar backup branches yang tersedia:"
    git branch -a | grep backup- | sed 's/remotes\/origin\///' | sort -u
    exit 1
fi

BACKUP_BRANCH=$1
CURRENT_BRANCH=$(git branch --show-current)

echo "⚠️  RESTORE BACKUP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Dari backup: $BACKUP_BRANCH"
echo "Ke branch: $CURRENT_BRANCH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "⚠️  Ini akan MENIMPA semua perubahan saat ini. Lanjutkan? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Restore dibatalkan"
    exit 1
fi

# Fetch latest
echo "📥 Fetch dari remote..."
git fetch origin

# Cek apakah backup branch ada
if ! git rev-parse --verify $BACKUP_BRANCH >/dev/null 2>&1; then
    if git rev-parse --verify origin/$BACKUP_BRANCH >/dev/null 2>&1; then
        echo "📥 Checkout backup branch dari remote..."
        git checkout -b $BACKUP_BRANCH origin/$BACKUP_BRANCH
    else
        echo "❌ Error: Backup branch '$BACKUP_BRANCH' tidak ditemukan"
        echo ""
        echo "Daftar backup branches yang tersedia:"
        git branch -a | grep backup- | sed 's/remotes\/origin\///' | sort -u
        exit 1
    fi
fi

# Simpan current state ke temporary branch (just in case)
TEMP_BRANCH="temp-before-restore-$(date +%Y%m%d-%H%M%S)"
echo "💾 Menyimpan state saat ini ke: $TEMP_BRANCH"
git branch $TEMP_BRANCH

# Reset ke backup
echo "🔄 Restore dari backup..."
git checkout $CURRENT_BRANCH
git reset --hard $BACKUP_BRANCH

echo ""
echo "✅ RESTORE BERHASIL!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📌 Restored from: $BACKUP_BRANCH"
echo "📌 Current branch: $CURRENT_BRANCH"
echo "📌 Previous state saved to: $TEMP_BRANCH"
echo ""
echo "Push ke remote dengan:"
echo "  git push -f origin $CURRENT_BRANCH"
echo ""
echo "Jika ada masalah, kembalikan dengan:"
echo "  git reset --hard $TEMP_BRANCH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
