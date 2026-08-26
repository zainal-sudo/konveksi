const db = require("../../config/database");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");

// ── List gudang untuk SearchModal ────────────────────────────────────────
const getGudang = async (search = "") => {
  const [rows] = await db.query(
    `SELECT gdg_kode AS kode, gdg_nama AS nama, gdg_penanggungjawab AS pj
     FROM tgudang
     WHERE gdg_nama LIKE ? OR gdg_kode LIKE ?
     ORDER BY gdg_kode ASC
     LIMIT 20`,
    [`%${search}%`, `%${search}%`]
  );
  return rows;
};

// ── "Load Data All": ambil seluruh barang milik gudang terpilih beserta
//    stok sistem terkini, untuk diisi kolom Fisik oleh user ─────────────
// Stok sistem dihitung dari tmasterstok (SUM stok_in - stok_out) khusus
// untuk gudang yang dipilih, konsisten dengan trigger tkor_dtl_after_insert
// / tkor_dtl_after_delete yang menghitung ulang brg_stok.
//
// FIX: sebelumnya kolom `expired` TIDAK pernah diambil dari database sama
// sekali, sehingga di frontend selalu di-hardcode "" — makanya Expired
// terlihat "tidak ke-load". Sekarang diambil dari tanggal expired terakhir
// yang pernah dipakai barang tsb pada transaksi koreksi di gudang yang
// sama (tkor_dtl join tkor_hdr), mirip cara stokSystem diturunkan.
// FIX: sebelumnya GROUP BY mst_brg_kode meratakan SEMUA batch (tiap
// batch = satu baris tmasterstok dengan expired berbeda-beda) jadi
// satu baris per barang saja, pakai SUM total dan MAX(expired).
// Padahal program lama menampilkan SATU BARIS PER BATCH — barang yang
// sama bisa muncul berkali-kali dengan expired berbeda tiap baris,
// masing-masing dengan stok sistem miliknya sendiri (bukan gabungan).
//
// Sekarang GROUP BY diubah jadi per (brg_kode, expired) — supaya tiap
// batch/varian expired tampil sebagai baris terpisah, konsisten dengan
// tampilan program lama.
const getBarangByGudang = async (gdgKode, search = "") => {
  const [rows] = await db.query(
    `SELECT
       b.brg_kode      AS brgKode,
       b.brg_nama      AS brgNama,
       b.brg_satuan    AS satuan,
       ifnull(ms.stokSystem,0)   AS stokSystem,
       b.brg_hrgbeli   AS harga,
       ms.expired      AS expired
     FROM tbarang b
     left JOIN (
       SELECT
         mst_brg_kode,
         -- Baris tanpa expired asli (NULL / '0000-00-00' / '1899-12-30')
         -- semua dikelompokkan jadi SATU baris "tanpa expired" per
         -- barang (biar tidak numpuk ribuan baris kosong kayak sebelum
         -- fix expired dulu) — sedangkan baris yang punya expired asli
         -- dipisah per tanggal.
         CASE
           WHEN mst_expired_date IS NULL
                OR mst_expired_date IN ('0000-00-00', '1899-12-30')
           THEN NULL
           ELSE DATE_FORMAT(mst_expired_date, '%Y-%m-%d')
         END AS expired,
         SUM(mst_stok_in - mst_stok_out) AS stokSystem
       FROM tmasterstok
       WHERE mst_gdg_kode = ?
       GROUP BY
         mst_brg_kode,
         CASE
           WHEN mst_expired_date IS NULL
                OR mst_expired_date IN ('0000-00-00', '1899-12-30')
           THEN NULL
           ELSE mst_expired_date
         END
     ) ms ON ms.mst_brg_kode = b.brg_kode
     WHERE b.brg_gdg_default = ?
       AND b.brg_isaktif = 1
       AND (b.brg_nama LIKE ? OR b.brg_kode = ?)
     ORDER BY b.brg_nama ASC, ms.expired ASC`,
    [gdgKode, gdgKode, `%${search}%`, search || 0]
  );
  return rows;
};

// ── Load form untuk mode edit ─────────────────────────────────────────────
const getDetailForm = async (nomor) => {
  const [[h]] = await db.query(
    `SELECT
       korh_nomor    AS nomor,
       DATE_FORMAT(korh_tanggal, '%Y-%m-%d') AS tanggal,
       korh_gdg_kode AS gdgKode,
       korh_notes    AS keterangan,
       korh_idbatch  AS idbatch,
       CASE WHEN korh_expired IS NULL OR korh_expired = '0000-00-00' THEN ''
            ELSE DATE_FORMAT(korh_expired, '%Y-%m-%d')
       END AS expired,
       korh_produksi AS produksi,
       korh_memo     AS memo
     FROM tkor_hdr WHERE korh_nomor = ?`,
    [nomor]
  );
  if (!h) throw new Error("Data Penyesuaian Stok tidak ditemukan.");

  const [[g]] = await db.query(
    `SELECT gdg_nama AS nama FROM tgudang WHERE gdg_kode = ?`,
    [h.gdgKode]
  );
  h.gdgNama = g?.nama || "";

  const [detail] = await db.query(
    `SELECT
       d.kord_nourut  AS nourut,
       d.kord_brg_kode AS brgKode,
       b.brg_nama     AS brgNama,
       b.brg_kode     AS barcode,
       d.kord_satuan  AS satuan,
       CASE WHEN d.kord_expired IS NULL OR d.kord_expired = '0000-00-00' THEN ''
            ELSE DATE_FORMAT(d.kord_expired, '%Y-%m-%d')
       END AS expired,
       d.kord_stok    AS stokSystem,
       (d.kord_stok + d.kord_qty) AS fisik,
       d.kord_qty     AS qty,
       d.kord_harga   AS harga,
       d.kord_nilai   AS nilai
     FROM tkor_dtl d
     LEFT JOIN tbarang b ON d.kord_brg_kode = b.brg_kode
     WHERE d.kord_korh_nomor = ?
     ORDER BY d.kord_nourut ASC`,
    [nomor]
  );

  h.detail = detail;
  return h;
};

// ── Simpan (Baru / Ubah) ──────────────────────────────────────────────────
const saveData = async (payload, user) => {
  const {
    isEdit, nomor, tanggal, gdgKode, keterangan,
    idbatch, expired, produksi, memo, detail,
  } = payload;

  if (!gdgKode) throw new Error("Gudang wajib dipilih.");
  if (!Array.isArray(detail) || detail.length === 0) {
    throw new Error("Detail barang tidak boleh kosong.");
  }

  const conn = await db.getConnection();
  await conn.beginTransaction();
  let lockKey = null;

  try {
    const now = new Date();
    const username = user?.username || user?.kode || "ADMIN";
    let actualNomor = nomor;

    const rows = detail
      .map((d, idx) => {
        if (d.fisik === null || d.fisik === undefined || d.fisik === "") {
          return null;
        }
        const fisik = Number(d.fisik);
        if (Number.isNaN(fisik)) return null;

        const stokSystem = Number(d.stokSystem) || 0;
        const qty = fisik - stokSystem;
        const harga = Number(d.harga) || 0;
        return {
          nourut: idx + 1,
          brgKode: d.brgKode,
          satuan: d.satuan,
          expired: d.expired && d.expired !== "" ? d.expired : "0000-00-00",
          stokSystem,
          qty,
          harga,
          nilai: qty * harga,
        };
      })
      .filter((d) => d !== null && d.qty !== 0);

    if (rows.length === 0) {
      throw new Error("Tidak ada perubahan qty. Minimal satu barang harus diisi Fisik-nya dan berbeda dari stok sistem.");
    }

    const total = rows.reduce((s, r) => s + r.nilai, 0);
    const expiredVal = expired && expired !== "" ? expired : "0000-00-00";

    if (isEdit) {
      await conn.query(`DELETE FROM tkor_dtl WHERE kord_korh_nomor = ?`, [actualNomor]);

      await conn.query(
        `UPDATE tkor_hdr
         SET korh_tanggal=?, korh_notes=?, korh_total=?, korh_gdg_kode=?,
             korh_idbatch=?, korh_expired=?, korh_produksi=?, korh_memo=?,
             date_modified=?, user_modified=?
         WHERE korh_nomor=?`,
        [tanggal, keterangan || "", total, gdgKode, idbatch || "", expiredVal,
         produksi || "", memo || "", now, username, actualNomor]
      );
    } else {
      const d = new Date(tanggal);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const prefix = `KOR.${yy}${mm}.`;

      lockKey = `nomor_kor_${yy}${mm}`;
      await acquireLock(conn, lockKey);

      const [[maxRow]] = await conn.query(
        `SELECT korh_nomor FROM tkor_hdr WHERE korh_nomor LIKE ? ORDER BY korh_nomor DESC LIMIT 1`,
        [`${prefix}%`]
      );
      let nextNum = 1;
      if (maxRow?.korh_nomor) {
        const parts = maxRow.korh_nomor.split(".");
        nextNum = parseInt(parts[2], 10) + 1;
      }
      actualNomor = `${prefix}${String(nextNum).padStart(4, "0")}`;

      await conn.query(
        `INSERT INTO tkor_hdr
           (korh_nomor, korh_tanggal, korh_notes, korh_total, korh_gdg_kode,
            korh_idbatch, korh_expired, korh_produksi, korh_memo,
            date_create, user_create)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [actualNomor, tanggal, keterangan || "", total, gdgKode,
         idbatch || "", expiredVal, produksi || "", memo || "", now, username]
      );
    }

    let seq = 1;
    for (const r of rows) {
      const [[current]] = await conn.query(
        `SELECT COALESCE(SUM(mst_stok_in - mst_stok_out), 0) AS stok
         FROM tmasterstok
         WHERE mst_brg_kode = ? AND mst_gdg_kode = ?
         FOR UPDATE`,
        [r.brgKode, gdgKode]
      );
      const stokTerkini = current ? Number(current.stok) || 0 : r.stokSystem;

      await conn.query(
        `INSERT INTO tkor_dtl
           (kord_korh_nomor, kord_brg_kode, kord_expired, kord_qty, kord_harga,
            kord_nilai, kord_satuan, kord_stok, kord_nourut, kord_gdg_kode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [actualNomor, r.brgKode, r.expired, r.qty, r.harga, r.nilai,
         r.satuan, stokTerkini, seq, gdgKode]
      );

      seq++;
    }

    await conn.commit();
    return { nomor: actualNomor };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    if (lockKey) await releaseLock(conn, lockKey);
    conn.release();
  }
};

module.exports = { getGudang, getBarangByGudang, getDetailForm, saveData };