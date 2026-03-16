# OTP Control Room

Backend Node.js untuk menerima OTP dari MacroDroid webhook, mengenali asal nomor lewat `number_key`, lalu mengirim OTP hanya ke user Telegram yang diizinkan.

## Fitur

- Panel admin web
- Database SQLite
- Mapping `nomor -> user Telegram`
- OTP dikirim berdasarkan access, bukan broadcast
- Webhook bisa memakai `number_key`
- Fallback pencocokan lewat `sender`
- Log OTP tersimpan di SQLite

## Kebutuhan

- Node.js 22 atau lebih baru
- Telegram bot token
- User Telegram harus pernah chat ke bot minimal sekali

## Konfigurasi

Copy [`.env.example`](/C:/Users/Administrator/Documents/bot/whatsapp%20otp/.env.example) ke `.env`, lalu isi:

```env
TELEGRAM_BOT_TOKEN=isi_token_bot
PORT=3200
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ganti_password
ADMIN_TELEGRAM_IDS=123456789
WEBHOOK_SECRET=rahasia_webhook
```

Keterangan:

- `ADMIN_USERNAME` dan `ADMIN_PASSWORD` dipakai untuk login panel web
- `ADMIN_TELEGRAM_IDS` opsional, untuk menandai chat ID Telegram admin
- `WEBHOOK_SECRET` dipakai untuk mengamankan request webhook

## Menjalankan

```bash
npm start
```

Lalu buka:

- Panel admin: `http://localhost:3200/admin/login`
- Health check: `http://localhost:3200/`

## Struktur data

Database SQLite ada di:

- [`data/app.db`](/C:/Users/Administrator/Documents/bot/whatsapp%20otp/data/app.db)

Data utama:

- `users`: user Telegram
- `numbers`: daftar nomor/logical slot OTP
- `access_entries`: relasi user ke nomor
- `otp_logs`: riwayat OTP masuk

## Cara pakai

### 1. Tambah user Telegram

Masuk ke halaman `Users`, lalu isi:

- `Telegram Chat ID`
- `Username Telegram`
- status active/inactive

Catatan:

- Username isi tanpa `@`
- Kalau user sudah pernah kirim `/start` ke bot, username biasanya akan ikut tersimpan otomatis

### 2. Tambah nomor OTP

Masuk ke halaman `Numbers`, lalu isi:

- `Label`: nama bebas, misalnya `Shopee-01`
- `Number key`: identitas unik nomor/device dari MacroDroid
- `Sender fallback`: opsional, dipakai kalau `number_key` tidak ada
- `Description`: opsional
- checklist user yang boleh menerima OTP

Contoh:

- Label: `WA Slot 1`
- Number key: `wa-01`
- Sender fallback: `Shopee`

### 3. Minta user chat ke bot

User harus kirim:

```text
/start
```

ke bot Telegram supaya chat ID-nya valid dan bot bisa mengirim pesan balik.

### 4. Hubungkan MacroDroid ke webhook

Method:

```text
POST
```

URL:

```text
http://IP_SERVER:3200/webhook
```

Header:

```text
x-webhook-secret: WEBHOOK_SECRET_KAMU
```

Body JSON minimal yang disarankan:

```json
{
  "number_key": "wa-01",
  "sender": "Shopee",
  "text": "Kode OTP kamu adalah 123456"
}
```

Field penting:

- `number_key`: identitas nomor/device/slot yang menerima SMS/WhatsApp
- `sender`: nama atau nomor pengirim pesan
- `text`: isi pesan

Field alternatif yang juga dikenali backend:

- `numberKey`
- `receiver_number`
- `device_id`
- `sim_label`

## Cara identifikasi nomor

Backend akan mencari nomor dengan urutan ini:

1. Cocokkan `number_key` dari webhook ke `number_key` di panel
2. Jika tidak ada, fallback ke `sender` dan cocokkan ke `sender fallback`

Jadi untuk multi nomor, yang paling aman adalah **selalu kirim `number_key` dari MacroDroid**.

## Contoh mapping

Contoh data:

- Number `wa-01` -> user `@andi`
- Number `wa-02` -> user `@budi`
- Number `wa-03` -> user `@andi` dan `@citra`

Kalau webhook masuk:

```json
{
  "number_key": "wa-02",
  "sender": "Tokopedia",
  "text": "OTP kamu 778899"
}
```

maka OTP hanya dikirim ke user yang punya akses ke `wa-02`.

## Endpoint

### `POST /webhook`

Endpoint utama untuk MacroDroid.

### `GET /forward`

Alternatif untuk testing cepat via query string.

Contoh:

```text
http://localhost:3200/forward?secret=WEBHOOK_SECRET_KAMU&number_key=wa-01&sender=Shopee&text=Kode%20OTP%20kamu%20123456
```

### `GET /logs`

Log OTP terbaru, hanya bisa diakses saat login admin.

## Perilaku bot Telegram

Command yang didukung:

- `/start`
- `/status`
- `/stop`

`/start`:

- kalau user aktif, bot memberi tahu nomor mana saja yang bisa dia terima
- kalau user belum aktif, bot memberi tahu bahwa admin perlu mengaktifkan akses dulu

## Catatan penting

- Panel admin saat ini memakai session in-memory
- Database memakai SQLite bawaan Node 22 (`node:sqlite`)
- Jika `number_key` tidak konsisten dari MacroDroid, routing OTP bisa salah
- Untuk produksi, gunakan password admin yang kuat dan `WEBHOOK_SECRET` yang acak

## Saran MacroDroid

Kalau kamu punya banyak nomor, jangan kirim nomor hanya dari `sender`.

Lebih baik setiap device / SIM / slot kirim `number_key` tetap, misalnya:

- `wa-01`
- `wa-02`
- `wa-03`

Lalu mapping-nya di panel web.
