# 🚀 Deploy Pre-Order ke VPS - Quick Guide

## ❌ ERROR yang Terjadi:
```
fatal: not a git repository (or any of the parent directories): .git
-bash: cd: Agsbot-main: No such file or directory
The supplied package.yaml [package.json] or package.json5 was found
```

**Penyebab:** Command dijalankan dari directory yang salah.

---

## ✅ SOLUSI - Step by Step:

### 1️⃣ Masuk ke Directory yang Benar
```bash
cd /home/Agil29/Agsbot

# Cek struktur directory
ls -la
# Harus ada folder: Agsbot-main/
```

### 2️⃣ Masuk ke Folder Agsbot-main
```bash
cd Agsbot-main

# Verifikasi sudah benar
pwd
# Output harus: /home/Agil29/Agsbot/Agsbot-main

# Cek file pnpm-workspace.yaml ada
ls -la pnpm-workspace.yaml
```

### 3️⃣ Pull Latest Code
```bash
git pull origin main
```

### 4️⃣ Build Project
```bash
pnpm run build
```

**ATAU gunakan script deploy:**
```bash
chmod +x deploy-fix.sh
./deploy-fix.sh
```

### 5️⃣ Restart PM2
```bash
pm2 restart all

# Atau restart specific app
pm2 restart agsbot
```

### 6️⃣ Verifikasi Bot Jalan
```bash
pm2 logs agsbot --lines 50

# Cek pre-order poller
pm2 logs agsbot | grep "pre-order"
```

**Harus muncul:**
- ✅ `"Starting pre-order polling..."`
- ✅ `"Telegram bot started with polling"`

---

## 🔍 Jika Masih Error

### Error: `ENABLE_BOT is not 'true'`
```bash
# Set environment variable
pm2 set agsbot ENABLE_BOT true
pm2 restart agsbot
```

### Error: Database Connection
```bash
# Cek DATABASE_URL
pm2 env agsbot | grep DATABASE_URL

# Jika tidak ada, set:
pm2 set agsbot DATABASE_URL "postgresql://user:pass@host:5432/dbname"
pm2 restart agsbot
```

### Error: `TELEGRAM_BOT_TOKEN not set`
```bash
# Set bot token
pm2 set agsbot TELEGRAM_BOT_TOKEN "your_bot_token_here"
pm2 restart agsbot
```

---

## 📊 Monitoring

### Cek Status Bot
```bash
pm2 status
```

### Cek Logs Real-time
```bash
pm2 logs agsbot
```

### Cek Error Logs
```bash
pm2 logs agsbot --err
```

### Cek Pre-Order Polling
```bash
pm2 logs agsbot | grep "Checking pending pre-orders"
```

---

## 🧪 Test Pre-Order

1. **Buka Bot Telegram**
2. Klik **📦 ORDER**
3. Pilih **"PRE ORDER ⏳"**
4. Pilih paket random
5. Input nomor: `081234567890`
6. Bayar via SALDO
7. **Verifikasi:**
   - User dapat konfirmasi pre-order berhasil dibuat
   - Cek dashboard admin → Menu Pre Order
   - Lihat pre-order dengan status **Pending**

---

## 🎯 Struktur Directory di VPS

```
/home/Agil29/Agsbot/
├── .git/                    ← Git repository root
└── Agsbot-main/             ← Project root (HARUS MASUK KE SINI)
    ├── pnpm-workspace.yaml  ← File penting untuk build
    ├── package.json
    ├── artifacts/
    │   ├── api-server/
    │   ├── admin-dashboard/
    │   └── mockup-sandbox/
    ├── deploy-fix.sh        ← Script deploy otomatis
    ├── PRE_ORDER_README.md  ← Dokumentasi lengkap
    └── DEPLOY_VPS.md        ← File ini
```

**⚠️ PENTING:** Semua command **HARUS** dijalankan dari `/home/Agil29/Agsbot/Agsbot-main/`

---

## 📞 Quick Commands Reference

```bash
# Full deploy sequence
cd /home/Agil29/Agsbot/Agsbot-main
git pull origin main
pnpm run build
pm2 restart all
pm2 logs agsbot

# Check bot status
pm2 status
pm2 logs agsbot --lines 100

# Check pre-order polling
pm2 logs agsbot | grep "pre-order"

# Restart if needed
pm2 restart agsbot
pm2 reload agsbot
```

---

## ✅ Success Indicators

Setelah deploy berhasil, Anda harus melihat di logs:

```
✅ Telegram bot started with polling
✅ Starting pre-order polling...
✅ Loaded pre_orders from DB
✅ Pre-order polling started
```

Dan di bot telegram harus ada button **"PRE ORDER ⏳"** saat klik ORDER.

---

Jika masih ada error, kirim screenshot ke saya! 🚀
