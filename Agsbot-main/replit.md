# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Telegram Bot**: node-telegram-bot-api (polling mode)
- **HTTP Client**: axios (untuk fetch paket dari API eksternal)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Telegram Bot

Bot Telegram untuk jualan paket data "Ags Store | Paket Akrab".

### Fitur
- 3 kategori paket: **AKRAB 1**, **AKRAB 2**, **CIRCLE**
- AKRAB 1 & CIRCLE terintegrasi dari API 1 (`API1_BASE_URL`)
- AKRAB 2 terintegrasi dari API 2 (`API2_BASE_URL`)
- Stok AKRAB 2 diambil dari endpoint terpisah `cek_stock_akrab` (lihat catatan di bawah)
- Paket manual dapat ditambah/edit/hapus via Admin API
- Inline keyboard dinamis untuk memilih paket
- Main keyboard menu: ORDER, TOPUP, RIWAYAT TRANSAKSI, CEK STOK, CEK PAKET, CEK LOKASI

### Environment Variables yang Dibutuhkan

| Variable | Keterangan |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token bot dari @BotFather (secret) |
| `API1_BASE_URL` | Base URL API untuk Akrab 1 & Circle |
| `API1_KEY` | API key untuk API 1 |
| `API2_BASE_URL` | Base URL API untuk Akrab 2 |
| `API2_KEY` | API key untuk API 2 |
| `API2_STOCK_URL` | Opsional. Override URL endpoint stok akrab KHFY. Default diturunkan dari `API2_BASE_URL` dengan menukar `api_vN` → `api_v3` lalu menambah `/cek_stock_akrab` |
| `ADMIN_API_KEY` | Kunci untuk Admin API (default: admin123) |

### Admin API Endpoints

Semua endpoint admin memerlukan header `x-admin-key: <ADMIN_API_KEY>`

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/admin/packages` | Lihat semua paket manual |
| GET | `/api/admin/packages/:category` | Lihat paket per kategori (akrab1/akrab2/circle) |
| POST | `/api/admin/packages/:category` | Tambah paket manual |
| PUT | `/api/admin/packages/:category/:id` | Update paket manual |
| DELETE | `/api/admin/packages/:category/:id` | Hapus paket manual |
| POST | `/api/admin/refresh` | Refresh paket dari API eksternal |

### Contoh Tambah Paket Manual

```bash
curl -X POST https://<domain>/api/admin/packages/akrab1 \
  -H "Content-Type: application/json" \
  -H "x-admin-key: admin123" \
  -d '{"name":"Akrab 5GB","price":15000,"quota":"5GB","validity":"7 Hari","description":"Paket internet 5GB"}'
```

### Daftar SKU AKRAB 2

Allowlist SKU ada di `AKRAB2_ALLOWED_SKUS` (`bot/apiService.ts`) dan harus disamakan
dengan `ALLOWED` di endpoint `/khfy-debug` (`routes/index.ts`):

| SKU | Nama di KHFY |
|---|---|
| XLA14 | SuperMini |
| XLA32 | Mini |
| XLA39 | Big |
| XLA48 | Big V2 |
| XLA55 | Jumbo V2 |
| XLA65 | JUMBO |
| XLA77 | Megabig V2 |
| XLA89 | MegaBig |

KHFY juga menyediakan **XLA20** (SuperMini V2) dan **XLA64** (Jumbo V3) yang belum
diaktifkan di bot. Tambahkan SKU-nya ke kedua daftar di atas jika ingin dijual.

Paket yang muncul di dashboard admin (menu Paket AKRAB 2) mengikuti allowlist ini —
dashboard membaca dari `GET /api/admin/packages/akrab2`, jadi tidak ada daftar SKU
terpisah yang perlu diubah di sisi frontend.

### Stok AKRAB 2 (KHFY)

Harga dan daftar produk berasal dari `GET {API2_BASE_URL}/list_product`, tetapi endpoint
tersebut **tidak memuat informasi stok**. Sisa slot per produk hanya tersedia di
`GET https://panel.khfy-store.com/api_v3/cek_stock_akrab` (tanpa `api_key`), dengan bentuk:

```json
{ "ok": true, "data": [ { "type": "XLA32", "nama": "Mini", "sisa_slot": 829 } ] }
```

Pemetaannya: `type` = kode produk (SKU), `sisa_slot` = jumlah slot tersisa
(`0` berarti habis). Nilai ini di-inject ke `PackageItem.stock` oleh
`fetchAkrabStock()` di `bot/apiService.ts`.

Perilakunya **fail-safe**: jika endpoint stok tidak bisa dijangkau atau responsnya
tidak bisa diparse, semua paket AKRAB 2 ditandai stok `0` (silang merah) alih-alih
dianggap tersedia. Ini mencegah user memesan paket yang slotnya sudah habis.

Untuk memeriksa kondisi stok yang dilihat bot, gunakan endpoint debug
`GET /api/khfy-debug` yang menampilkan produk mentah dari `list_product` beserta
`stock_slots` hasil parsing.

### Struktur File Bot

```
artifacts/api-server/src/bot/
├── index.ts        — Entry point bot (startBot)
├── handlers.ts     — Handler pesan & callback query
├── keyboards.ts    — Definisi inline keyboard & reply keyboard
├── sessions.ts     — Manajemen state sesi per user
├── store.ts        — In-memory store paket (manual + API)
└── apiService.ts   — Fetch paket dari API eksternal
```

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
