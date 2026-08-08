#!/bin/bash
set -e
BACKUP_BRANCH="backup-$(date +%Y%m%d-%H%M%S)"
CURRENT_BRANCH=$(git branch --show-current)
echo "🔄 Membuat backup dari branch: $CURRENT_BRANCH"
if [[ -n $(git status -s) ]]; then
    echo "📝 Commit otomatis..."
    git add -A
    git commit -m "Auto-commit sebelum backup: $(date +%Y-%m-%d\ %H:%M:%S)" || true
fi
echo "💾 Membuat backup branch: $BACKUP_BRANCH"
git branch $BACKUP_BRANCH
echo "☁️ Push backup ke GitHub..."
git push origin $BACKUP_BRANCH
echo ""
echo "✅ BACKUP BERHASIL!"
echo "📌 Backup Branch: $BACKUP_BRANCH"
echo ""
echo "Untuk restore:"
echo "  git reset --hard $BACKUP_BRANCH"
