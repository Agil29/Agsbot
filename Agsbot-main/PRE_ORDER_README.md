# 📋 Pre-Order System - Dokumentasi

## 🎯 Fitur yang Sudah Diimplementasikan

### ✅ Bot Telegram
1. **Button "PRE ORDER ⏳"** di menu kategori (di atas CIRCLE)
2. **Flow Pre-Order Lengkap:**
   - User pilih paket dari kategori Pre Order (menggunakan produk KHFY/AKRAB V2)
   - User input nomor tujuan
   - Validasi duplikat pre-order (1 nomor hanya bisa 1 pre-order aktif per SKU)
   - Pilih metode pembayaran: SALDO atau QRIS
   - Pembayaran via saldo: langsung potong saldo
   - Pembayaran via QRIS: generate QR code, user scan & bayar
3. **Auto-Processing:**
   - Bot check stok KHFY setiap **3 menit**
   - Jika stok tersedia, otomatis kirim order ke KHFY
   - User dapat notifikasi otomatis saat pre-order berhasil diproses

### ✅ Dashboard Admin
1. **Halaman Pre Order** (sudah ada di `/admin/pre-orders`)
2. **Fitur Dashboard:**
   - List semua pre-order dengan status: Pending, Processing, Done, Cancelled
   - Filter berdasarkan status
   - Search by ID, nomor, paket, user
   - Summary cards untuk setiap status
   - **Button Cancel** untuk pre-order yang masih Pending/Processing
   - Auto refund saldo ke user saat cancel (untuk pembayaran via saldo)
   - Input note/alasan cancel (opsional)
   - Warning untuk pembayaran QRIS (perlu refund manual)

### ✅ Backend API
1. **GET** `/admin/pre-orders` - List semua pre-order
2. **PUT** `/admin/pre-orders/:id/cancel` - Cancel pre-order & refund

### ✅ Database
- Table `pre_orders` sudah ada dengan kolom:
  - id, user_id, user_name, user_username
  - package_id, package_name, sku
  - price, baseprice
  - nomor_tujuan
  - payment_method (saldo/qris)
  - status (pending/processing/done/cancelled)
  - note (alasan cancel)
  - reff_id (dari KHFY saat berhasil)
  - sn (serial number jika ada)
  - created_at, updated_at

---

## 🚀 Cara Deploy di VPS

### 1. Pull & Install
```bash
cd /home/Agil29/Agsbot
git pull origin main
cd Agsbot-main
pnpm install
pnpm run build
```

### 2. Restart Service
```bash
pm2 restart all
# atau
pm2 restart agsbot
```

### 3. Verifikasi
```bash
pm2 logs agsbot
```

Pastikan log menunjukkan:
- ✅ "Starting pre-order polling..."
- ✅ "Pre-order polling started"

---

## 📊 Cara Kerja Pre-Order

### Flow User:
1. User buka bot → klik **📦 ORDER**
2. Pilih kategori **"PRE ORDER ⏳"**
3. Pilih paket yang diinginkan (produk KHFY/AKRAB V2)
4. Masukkan nomor tujuan
5. Pilih metode bayar:
   - **💳 PAKAI SALDO** → saldo langsung dipotong
   - **📱 BAYAR LANGSUNG (QRIS)** → scan QR code
6. Pre-order dibuat dengan status **Pending**
7. Bot otomatis cek stok KHFY setiap 3 menit
8. Saat stok tersedia → order dikirim → status jadi **Done** → user dapat notif

### Flow Admin Cancel:
1. Buka dashboard admin
2. Menu **Pre Order**
3. Klik button **Cancel** di baris pre-order yang ingin dibatalkan
4. Isi note/alasan (opsional)
5. Klik **Batalkan & Refund**
6. Sistem otomatis:
   - Update status jadi **Cancelled**
   - Refund saldo ke user (jika bayar via saldo)
   - Kirim notif ke user via bot

---

## ⚙️ Konfigurasi

### Interval Auto-Processing
Ubah di file: `artifacts/api-server/src/bot/preOrderPoller.ts`

```typescript
const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 menit
```

Ubah nilai `3` untuk mengatur interval (dalam menit).

### Environment Variables
Pastikan sudah set di VPS:
```bash
TELEGRAM_BOT_TOKEN=xxx
ENABLE_BOT=true
DATABASE_URL=postgresql://...
# KHFY API credentials
CEK_PAKET_URL=xxx
API2_BASE_URL=xxx
```

---

## 🔍 Troubleshooting

### Pre-Order Tidak Diproses Otomatis
1. Cek log bot:
   ```bash
   pm2 logs agsbot | grep "pre-order"
   ```
2. Pastikan ada log: `"Checking pending pre-orders"`
3. Jika tidak ada, restart bot:
   ```bash
   pm2 restart agsbot
   ```

### Refund Saldo Tidak Masuk
1. Cek dashboard admin → **Saldo Logs**
2. Cari transaksi dengan type `preorder_refund`
3. Jika tidak ada, coba cancel ulang dari dashboard

### QRIS Tidak Generate
1. Cek environment variable `PAKASIR_*` sudah benar
2. Cek log error:
   ```bash
   pm2 logs agsbot --err
   ```

---

## 📱 Testing Pre-Order

### Test Flow Lengkap:
1. **Buat Pre-Order:**
   - Buka bot
   - Pilih ORDER → PRE ORDER ⏳
   - Pilih paket random
   - Input nomor: `081234567890`
   - Bayar via SALDO
   
2. **Verifikasi di Dashboard:**
   - Login admin dashboard
   - Menu Pre Order
   - Lihat pre-order baru dengan status **Pending**

3. **Test Cancel:**
   - Klik button **Cancel**
   - Isi note: "Testing cancel"
   - Confirm
   - Cek user dapat notif refund di bot

4. **Test Auto-Processing:**
   - Tunggu 3 menit
   - Cek log: `pm2 logs agsbot | grep "Attempting to process"`
   - Jika stok tersedia, pre-order akan otomatis done

---

## 📄 File yang Diubah/Dibuat

### Bot Handlers
- ✅ `artifacts/api-server/src/bot/handlers.ts`
  - Handler `cat_preorder` - show paket list
  - Handler `preorder_pkg_*` - pilih paket
  - Handler `preorder_confirm_*` - konfirmasi
  - Handler `preorder_paysaldo` - bayar via saldo
  - Handler `preorder_payqris` - bayar via QRIS
  - Handler `preorder_waiting_nomor` - input nomor

### Auto-Processor (BARU)
- ✅ `artifacts/api-server/src/bot/preOrderPoller.ts`
  - Check pending pre-orders setiap 3 menit
  - Kirim order ke KHFY jika stok ready
  - Update status & notify user

### Pre-Order Logic
- ✅ `artifacts/api-server/src/bot/preOrders.ts` (sudah ada)
  - Create, read, update pre-order
  - Validasi duplikat

### Keyboards
- ✅ `artifacts/api-server/src/bot/keyboards.ts`
  - `categoryInlineKeyboard()` - sudah ada button PRE ORDER
  - `preOrderPackageKeyboard()` - keyboard paket
  - `preOrderConfirmKeyboard()` - keyboard konfirmasi
  - `preOrderPaymentKeyboard()` - keyboard payment

### Admin Dashboard
- ✅ `artifacts/admin-dashboard/src/pages/PreOrder.tsx` (sudah ada)
  - List, filter, search pre-orders
  - Cancel button + refund logic

### API Routes
- ✅ `artifacts/api-server/src/routes/admin/preOrders.ts` (sudah ada)
  - GET `/admin/pre-orders`
  - PUT `/admin/pre-orders/:id/cancel`

---

## 🎉 Fitur Pre-Order Sudah Lengkap!

**Yang Sudah Berfungsi:**
- ✅ Button PRE ORDER di bot
- ✅ Flow order lengkap (pilih paket → input nomor → bayar)
- ✅ Payment via SALDO & QRIS
- ✅ Validasi duplikat pre-order
- ✅ Auto-processing setiap 3 menit
- ✅ Dashboard admin untuk manage
- ✅ Cancel + auto refund saldo
- ✅ Notifikasi ke user (berhasil/cancel)
- ✅ Dana tertahan sampai berhasil/cancel

**Tinggal Deploy:**
```bash
cd /home/Agil29/Agsbot
git pull origin main
cd Agsbot-main
pnpm run build
pm2 restart all
```

Selesai! 🚀
