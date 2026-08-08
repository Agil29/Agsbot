#!/bin/bash
# Script untuk melihat daftar backup yang tersedia
# Usage: ./list-backups.sh

echo "📋 DAFTAR BACKUP BRANCHES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Fetch latest dari remote
git fetch origin --prune 2>/dev/null

# Tampilkan local backups
echo "📁 Local Backups:"
LOCAL_BACKUPS=$(git branch | grep backup- | sed 's/^[ *]*//' | sort -r)
if [ -z "$LOCAL_BACKUPS" ]; then
    echo "  (tidak ada)"
else
    echo "$LOCAL_BACKUPS" | while read branch; do
        COMMIT_DATE=$(git log -1 --format=%cd --date=format:'%Y-%m-%d %H:%M:%S' $branch)
        COMMIT_MSG=$(git log -1 --format=%s $branch | head -c 60)
        echo "  • $branch"
        echo "    └─ $COMMIT_DATE - $COMMIT_MSG"
    done
fi

echo ""
echo "☁️  Remote Backups (GitHub):"
REMOTE_BACKUPS=$(git branch -r | grep origin/backup- | sed 's/.*origin\///' | sort -r)
if [ -z "$REMOTE_BACKUPS" ]; then
    echo "  (tidak ada)"
else
    echo "$REMOTE_BACKUPS" | while read branch; do
        COMMIT_DATE=$(git log -1 --format=%cd --date=format:'%Y-%m-%d %H:%M:%S' origin/$branch 2>/dev/null || echo "N/A")
        COMMIT_MSG=$(git log -1 --format=%s origin/$branch 2>/dev/null | head -c 60 || echo "")
        echo "  • $branch"
        if [ "$COMMIT_DATE" != "N/A" ]; then
            echo "    └─ $COMMIT_DATE - $COMMIT_MSG"
        fi
    done
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Untuk restore backup, jalankan:"
echo "  ./restore-backup.sh <nama-backup>"
echo ""
echo "Contoh:"
echo "  ./restore-backup.sh backup-20260809-143000"
