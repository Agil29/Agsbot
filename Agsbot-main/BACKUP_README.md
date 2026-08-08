# 🛡️ Backup & Restore System

Sistem backup otomatis untuk menjaga keamanan kode sebelum melakukan update atau perubahan besar.

---

## 📋 Cara Penggunaan

### 1️⃣ Membuat Backup (Sebelum Update)

**Di Lokal (Windows/PowerShell):**
```bash
bash create-backup.sh
```

**Di VPS (Linux):**
```bash
cd /home/Agilr29/Agsbot
bash create-backup.sh
```

Script ini akan:
- ✅ Auto-commit semua perubahan yang ada
- ✅ Membuat backup branch dengan timestamp (contoh: `backup-20260809-143052`)
- ✅ Push backup ke GitHub
- ✅ Menampilkan instruksi restore

---

### 2️⃣ Melihat Daftar Backup

```bash
bash list-backups.sh
```

Output contoh:
```
📋 DAFTAR BACKUP BRANCHES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 Local Backups:
  • backup-20260809-143052
    └─ 2026-08-09 14:30:52 - Auto-commit sebelum backup

☁️  Remote Backups (GitHub):
  • backup-20260809-143052
    └─ 2026-08-09 14:30:52 - Auto-commit sebelum backup
  • backup-20260808-100521
    └─ 2026-08-08 10:05:21 - Backup sebelum update fitur
```

---

### 3️⃣ Restore Backup (Jika Ada Error)

**Di Lokal:**
```bash
bash restore-backup.sh backup-20260809-143052
```

**Di VPS:**
```bash
cd /home/Agilr29/Agsbot
bash restore-backup.sh backup-20260809-143052
git push -f origin main
cd artifacts/api-server
pnpm run build
pm2 restart agsbot
```

Script restore akan:
- ✅ Menyimpan state saat ini ke temporary branch (jaga-jaga)
- ✅ Reset kode ke kondisi backup
- ✅ Menampilkan instruksi untuk push ke remote

---

## 🚀 Workflow Update Fitur (Recommended)

### Step 1: Buat Backup
```bash
bash create-backup.sh
```

### Step 2: Lakukan Update/Perubahan
Edit kode, test, dll...

### Step 3A: Jika Berhasil
```bash
git add .
git commit -m "Update fitur XYZ berhasil"
git push origin main
```

### Step 3B: Jika Ada Error/Ingin Batalkan
```bash
# Lokal
bash restore-backup.sh backup-20260809-143052

# VPS
cd /home/Agilr29/Agsbot
git fetch origin
git reset --hard origin/backup-20260809-143052
pnpm install
cd artifacts/api-server
pnpm run build
pm2 restart agsbot
```

---

## 🔥 Emergency Restore (Satu Command)

Jika bot error di VPS dan perlu rollback cepat:

```bash
cd /home/Agilr29/Agsbot && \
git fetch origin && \
git reset --hard origin/backup-20260809-143052 && \
cd artifacts/api-server && \
pnpm run build && \
pm2 restart agsbot && \
pm2 logs agsbot --lines 20
```

**PENTING:** Ganti `backup-20260809-143052` dengan nama backup yang benar dari `list-backups.sh`

---

## 📌 Tips

1. **Selalu buat backup sebelum update besar** — Jalankan `create-backup.sh` dulu
2. **Backup otomatis punya timestamp** — Mudah dikenali kapan dibuat
3. **Backup disimpan di GitHub** — Aman meski VPS atau lokal hilang
4. **Restore tidak menghapus backup** — Bisa restore berkali-kali
5. **Previous state disimpan saat restore** — Bisa undo restore jika perlu

---

## ⚠️ Catatan Penting

- Script ini menggunakan Git branches untuk backup
- Backup **TIDAK** termasuk `.env` file (karena di `.gitignore`)
- Backup **TIDAK** termasuk `node_modules` (auto-generate)
- Setelah restore di VPS, **HARUS build ulang** dengan `pnpm run build`
- Backup branch bisa dihapus manual jika sudah tidak diperlukan:
  ```bash
  git branch -D backup-20260809-143052
  git push origin --delete backup-20260809-143052
  ```

---

## 🆘 Troubleshooting

### Error: "backup branch not found"
```bash
git fetch origin
bash list-backups.sh
# Gunakan nama backup yang benar dari daftar
```

### Error: "conflicts" saat restore
```bash
# Force reset (hati-hati, akan buang semua perubahan lokal)
git reset --hard HEAD
bash restore-backup.sh <backup-name>
```

### Ingin batalkan restore
```bash
# Gunakan temporary branch yang dibuat saat restore
git reset --hard temp-before-restore-20260809-143500
```

---

## 📞 Support

Jika ada masalah dengan backup/restore system, cek:
1. `git status` — lihat kondisi repo
2. `git log --oneline -10` — lihat history commit
3. `git branch -a` — lihat semua branches (local + remote)

Atau hubungi developer bot.
