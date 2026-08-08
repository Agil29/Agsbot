#!/bin/bash
# Script untuk membuat backup branch dari kondisi saat ini
# Usage: ./create-backup.sh

set -e

# Generate backup branch name dengan timestamp
BACKUP_BRANCH="backup-$(date +%Y%m%d-%H%M%S)"
CURRENT_BRANCH=$(git branch --show-current)

echo "🔄 Membuat backup dari branch: $CURRENT_BRANCH"

# Commit semua perubahan yang ada (jika ada)
if [[ -n $(git status -s) ]]; then
    echo "📝 Ada perubahan yang belum di-commit, commit otomatis..."
    git add -A
    git commit -m "Auto-commit sebelum backup: $(date +%Y-%m-%d\ %H:%M:%S)" || true
fi

# Buat backup branch
echo "💾 Membuat backup branch: $BACKUP_BRANCH"
git branch $BACKUP_BRANCH

# Push backup ke remote
echo "☁️ Push backup ke GitHub..."
git push origin $BACKUP_BRANCH

echo ""
echo "✅ BACKUP BERHASIL DIBUAT!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📌 Backup Branch: $BACKUP_BRANCH"
echo "📌 Current Branch: $CURRENT_BRANCH"
echo ""
echo "Untuk restore backup ini, jalankan:"
echo "  ./restore-backup.sh $BACKUP_BRANCH"
echo ""
echo "Atau manual:"
echo "  git checkout $BACKUP_BRANCH"
echo "  git checkout -b main-restored"
echo "  git push -f origin main"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
