const db = require("../../config/database");

// ── 1. BROWSE HEADER ──────────────────────────────────────────────────
// Tanggal & Expired sengaja dikirim mentah 'YYYY-MM-DD' (bukan '-' atau
// format lain) — frontend yang memformat ke gaya M/D/YYYY / 12/30/1899
// via fmtOldDate, supaya konsisten satu tempat.
const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       h.korh_nomor    AS Nomor,
       DATE_FORMAT(h.korh_tanggal, '%Y-%m-%d') AS Tanggal,
       h.korh_gdg_kode AS GdgKode,
       g.gdg_nama      AS Gudang,
       h.korh_notes    AS Keterangan,
       COALESCE(dtlSum.total, 0) AS Total,
       h.korh_idbatch  AS Idbatch,
       CASE WHEN h.korh_expired IS NULL OR h.korh_expired = '0000-00-00' THEN NULL
            ELSE DATE_FORMAT(h.korh_expired, '%Y-%m-%d')
       END AS Expired,
       h.korh_produksi AS Produksi,
       h.korh_memo     AS Memo,
       dtlFirst.satuan AS Satuan,
       dtlFirst.qty    AS QtyProduksi,
       h.user_create   AS UserCreate,
       DATE_FORMAT(h.date_create, '%Y-%m-%d %H:%i:%s') AS DateCreate,
       COALESCE(dtlSum.jml, 0) AS JumlahItem
     FROM tkor_hdr h
     LEFT JOIN tgudang g ON h.korh_gdg_kode = g.gdg_kode
     LEFT JOIN (
       SELECT kord_korh_nomor, SUM(kord_nilai) AS total, COUNT(*) AS jml
       FROM tkor_dtl
       GROUP BY kord_korh_nomor
     ) dtlSum ON dtlSum.kord_korh_nomor = h.korh_nomor
     LEFT JOIN (
       SELECT t1.kord_korh_nomor, t1.kord_satuan AS satuan, t1.kord_qty AS qty
       FROM tkor_dtl t1
       INNER JOIN (
         SELECT kord_korh_nomor, MIN(kord_nourut) AS min_urut
         FROM tkor_dtl GROUP BY kord_korh_nomor
       ) t2 ON t2.kord_korh_nomor = t1.kord_korh_nomor AND t2.min_urut = t1.kord_nourut
     ) dtlFirst ON dtlFirst.kord_korh_nomor = h.korh_nomor
     WHERE h.korh_tanggal BETWEEN ? AND ?
     ORDER BY h.korh_nomor DESC`,
    [startDate, endDate]
  );
  return rows;
};

// ── 2. BROWSE DETAIL ──────────────────────────────────────────────────
// Hanya kolom yang diminta: Nomor, Kode, Nama, Expired, Satuan, Qty
// (StokSystem/Harga/Nilai sengaja tidak ditampilkan di sini).
const getBrowseDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
       d.kord_nourut     AS NoUrut,
       d.kord_korh_nomor AS Nomor,
       b.brg_kode        AS Kode,
       b.brg_nama        AS Nama,
       CASE WHEN d.kord_expired IS NULL OR d.kord_expired = '0000-00-00' THEN NULL
            ELSE DATE_FORMAT(d.kord_expired, '%Y-%m-%d')
       END AS Expired,
       d.kord_satuan     AS Satuan,
       d.kord_qty        AS QtyKorksi
     FROM tkor_dtl d
     LEFT JOIN tbarang b ON d.kord_brg_kode = b.brg_kode
     WHERE d.kord_korh_nomor = ?
     ORDER BY d.kord_nourut ASC`,
    [nomor]
  );
  return rows;
};

// ── 3. HAPUS TRANSAKSI ────────────────────────────────────────────────────
const deleteData = async (nomor) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    const [[h]] = await conn.query(
      `SELECT korh_nomor FROM tkor_hdr WHERE korh_nomor = ? FOR UPDATE`,
      [nomor]
    );
    if (!h) throw new Error("Data Penyesuaian Stok tidak ditemukan.");

    await conn.query(`DELETE FROM tkor_dtl WHERE kord_korh_nomor = ?`, [nomor]);
    await conn.query(`DELETE FROM tkor_hdr WHERE korh_nomor = ?`, [nomor]);

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = { getBrowse, getBrowseDetail, deleteData };