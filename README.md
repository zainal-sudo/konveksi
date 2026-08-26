# FINANCE Backend — Express.js

Backend API untuk modul Finance, migrasi dari Delphi desktop ke web-based.

---

## Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MySQL (mysql2/promise — pool)
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **Port default**: `3089`

---

## Struktur Direktori

```
finance-backend/
├── src/
│   ├── config/
│   │   └── database.js           # MySQL connection pool
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── lookupController.js
│   │   └── <modul>/              # Contoh: kasbank/, piutang/
│   ├── middleware/
│   │   └── authMiddleware.js     # verifyToken + checkPermission
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── lookupRoutes.js
│   │   └── <modul>/              # Satu folder per modul
│   ├── services/
│   │   ├── authService.js
│   │   ├── lookupService.js
│   │   ├── tutupBukuService.js   # Shared — cek periode tutup buku
│   │   └── <modul>/              # Business logic per modul
│   └── index.js                  # Entry point
├── .env.example
├── .gitignore
└── package.json
```

---

## Setup

```bash
# 1. Clone / copy project
cd finance-backend

# 2. Install dependencies
npm install

# 3. Konfigurasi environment
cp .env.example .env
# Edit .env sesuai koneksi DB & JWT secret

# 4. Jalankan development
npm run dev

# 5. Jalankan production
npm start
```

---

## Konvensi API Route

```
GET    /api/<modul>/<submodul>              → list / browse
GET    /api/<modul>/<submodul>/form/detail/:nomor  → detail untuk edit form
POST   /api/<modul>/<submodul>/form/save    → simpan (insert/update)
DELETE /api/<modul>/<submodul>/form/:nomor  → hapus
GET    /api/<modul>/<submodul>/form/<lookup>/:id  → lookup data referensi
```

**Contoh nyata (mengacu ke garmen):**
```
GET    /api/kasbank/kas
GET    /api/kasbank/kas/form/detail/:nomor
POST   /api/kasbank/kas/form/save
```

---

## Konvensi Controller

Setiap controller hanya berisi thin wrapper — validasi input minimal,
panggil service, kembalikan response. Tidak ada business logic di controller.

```js
const getDetailForm = async (req, res) => {
  try {
    const data = await someService.getDetailForm(req.params.nomor);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};
```

---

## Konvensi Service

Business logic sepenuhnya di service. Gunakan `conn` dari pool untuk transaksi:

```js
const saveData = async (payload, user) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // ... query ...
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};
```

---

## Konvensi Routes

```js
const menuId = 101; // ID menu di tabel tuser_menu

router.get("/",          verifyToken, checkPermission(menuId, "view"),   controller.getList);
router.get("/form/detail/:nomor", verifyToken, checkPermission(menuId, "view"),   controller.getDetailForm);
router.post("/form/save", verifyToken, checkPermission(menuId, "insert"), controller.saveData);
router.delete("/form/:nomor", verifyToken, checkPermission(menuId, "delete"), controller.deleteData);
```

---

## Tambah Modul Baru

Ikuti langkah ini untuk setiap modul Finance baru (contoh: Kas Masuk):

1. **Buat service**: `src/services/kasbank/kasMasukFormService.js`
2. **Buat controller**: `src/controllers/kasbank/kasMasukFormController.js`
3. **Buat routes**: `src/routes/kasbank/kasMasukFormRoutes.js`
4. **Daftarkan di `src/index.js`**:
   ```js
   const kasMasukFormRoutes = require("./routes/kasbank/kasMasukFormRoutes");
   app.use("/api/kasbank/kas-masuk/form", kasMasukFormRoutes);
   ```

---

## Auth

- Token dikirim via header: `Authorization: Bearer <token>`
- Payload JWT berisi: `{ kode, nama, level, cabang }`
- Level `ADMIN` bypass semua cek permission
- Token expire: 8 jam (konfigurasi di `.env` → `JWT_EXPIRES_IN`)

---

## Environment Variables

| Variable        | Keterangan                     | Default  |
|-----------------|-------------------------------|----------|
| `PORT`          | Port server                    | `3089`   |
| `DB_HOST`       | Host MySQL                     | localhost |
| `DB_PORT`       | Port MySQL                     | 3306     |
| `DB_USER`       | User MySQL                     | —        |
| `DB_PASSWORD`   | Password MySQL                 | —        |
| `DB_NAME`       | Nama database                  | —        |
| `JWT_SECRET`    | Secret key JWT                 | —        |
| `JWT_EXPIRES_IN`| Durasi token                  | `8h`     |
