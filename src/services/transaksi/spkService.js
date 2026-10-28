const db = require("../../config/database");

// ═══════════════════════════════════════════════════════════════════════
// SPK - MODUL MURNI (TANPA LHK)
// Versi konveksi: SPK hanya dokumen "buat barang jadi dengan jumlah
// tertentu". Kebutuhan bahan dihitung dari BOM tbarangkomposisi.
// Status 'Selesai'/'Proses' di-derive dari tahapan (tspk_dtl), bukan LHK.
// ═══════════════════════════════════════════════════════════════════════

// Status: SPK dianggap 'Selesai' kalau punya tahapan dan SEMUA tahapannya
// sudah tercapai (dtl_selesai >= dtl_target, target > 0). SPK tanpa tahap
// (SPK lama tanpa master proses) tetap 'Proses'.
const _exprStatus = () => `
  IF(
    NOT EXISTS(
      SELECT 1 FROM tspk_dtl d0
       WHERE TRIM(d0.dtl_spk_nomor) = TRIM(h.spk_nomor)
    ),
    'Proses',
    IF(
      EXISTS(
        SELECT 1 FROM tspk_dtl d1
         WHERE TRIM(d1.dtl_spk_nomor) = TRIM(h.spk_nomor)
           AND (IFNULL(d1.dtl_selesai, 0) < IFNULL(d1.dtl_target, 0)
                OR IFNULL(d1.dtl_target, 0) <= 0)
      ),
      'Proses',
      'Selesai'
    )
  )`;

const getBrowse = async (startDate, endDate, opts = {}) => {
  const excludeSelesai = !!opts.excludeSelesai;
  const excludeClosed = !!opts.excludeClosed;
  const [rows] = await db.query(
    `SELECT
      h.spk_nomor        AS Nomor,
      h.spk_nama         AS Nama,
      DATE_FORMAT(h.spk_tanggal, '%Y-%m-%d')  AS Tanggal,
      DATE_FORMAT(h.spk_tanggal_produksi, '%Y-%m-%d') AS TanggalProduksi,
      IFNULL(h.spk_shift, 1) AS Shift,
      h.spk_no_po       AS NoPo,
      DATE_FORMAT(h.spk_tanggal_po, '%Y-%m-%d') AS TanggalPo,
      IFNULL(h.spk_is_closed, 0) AS IsClosed,
      h.spk_memo_close  AS MemoClose,
      DATE_FORMAT(h.spk_dateline, '%Y-%m-%d') AS DateLine,
      b.brg_kode         AS KodeBarang,
      b.brg_nama         AS Barang,
      b.brg_satuan       AS Satuan,
      (SELECT prs_nama FROM tmaster_proses WHERE prs_kode = h.spk_prs_kode) AS MasterProses,
      c.cus_nama         AS Customer,
      h.spk_user_create   AS UserCreate,
      h.spk_user_modified AS UserModified,
      DATE_FORMAT(h.spk_date_create,   '%Y-%m-%d %H:%i') AS DateCreate,
      DATE_FORMAT(h.spk_date_modified, '%Y-%m-%d %H:%i') AS DateModified,
      h.spk_idbatch       AS IdBatch,
      h.spk_jumlah        AS Jumlah,
      h.spk_jumlah_jadi   AS JumlahJadi,
      ${_exprStatus()} AS Status
     FROM tspk h
     LEFT JOIN tbarang b ON h.spk_brg_kode = b.brg_kode
     LEFT JOIN tcustomer c ON h.spk_cus_kode = c.cus_kode
     WHERE h.spk_tanggal BETWEEN ? AND ?
       ${
         excludeSelesai
           ? `AND ${_exprStatus()} = 'Proses'`
           : ""
       }
       ${excludeClosed ? `AND IFNULL(h.spk_is_closed, 0) = 0` : ""}
     ORDER BY h.spk_nomor ASC`,
    [startDate, endDate]
  );
  return rows;
};

const getBrowseDetail = async (nomor) => {
  const cleanNomor = String(nomor || "").trim();
  const [[row]] = await db.query(
    `SELECT
       h.spk_nomor      AS Nomor,
       h.spk_keterangan AS Keterangan,
       b.brg_satuan     AS Satuan,
       DATE_FORMAT(h.spk_tanggal_produksi, '%Y-%m-%d') AS TanggalProduksi,
       IFNULL(h.spk_shift, 1) AS Shift,
       h.spk_no_po       AS NoPo,
       DATE_FORMAT(h.spk_tanggal_po, '%Y-%m-%d') AS TanggalPo,
       IFNULL(h.spk_is_closed, 0) AS IsClosed,
       h.spk_memo_close  AS MemoClose,
       DATE_FORMAT(h.spk_close_date, '%Y-%m-%d %H:%i') AS CloseDate,
       h.spk_close_user  AS CloseUser
     FROM tspk h
     LEFT JOIN tbarang b ON h.spk_brg_kode = b.brg_kode
     WHERE TRIM(h.spk_nomor) = TRIM(?)`,
    [cleanNomor]
  );
  return row || null;
};

// ── KEBUTUHAN BAHAN ────────────────────────────────────────────────────
// Dari SPK (nomor) hitung: bahan apa saja & berapa yang dibutuhkan untuk
// memproduksi barang jadi sesuai spk_jumlah.
// Rumus: totalBahan = qty_per_unit (tbarangkomposisi.bk_qty) x spk_jumlah.
const getKebutuhanBahan = async (nomor) => {
  const cleanNomor = String(nomor || "").trim();
  const [[spk]] = await db.query(
    `SELECT TRIM(spk_nomor) AS nomor, spk_jumlah AS jumlah,
            b.brg_kode AS brgKode, b.brg_nama AS brgNama, b.brg_satuan AS satuan
       FROM tspk h
       LEFT JOIN tbarang b ON h.spk_brg_kode = b.brg_kode
      WHERE TRIM(h.spk_nomor) = TRIM(?)`,
    [cleanNomor]
  );
  if (!spk) throw new Error("SPK tidak ditemukan.");
  if (!spk.brgKode) {
    throw new Error(
      "SPK ini belum memiliki barang jadi (kode barang kosong). Isi dahulu di form SPK."
    );
  }

  const [rows] = await db.query(
    `SELECT
        bk.bk_bhn_kode     AS bahanKode,
        b.brg_nama         AS bahanNama,
        b.brg_satuan       AS satuanBahan,
        bk.bk_qty          AS qtyPerUnit,
        bk.bk_satuan       AS satuan,
        bk.bk_nourut       AS urutan,
        bk.bk_spesifikasi  AS spesifikasi,
        ROUND(bk.bk_qty * ?, 2) AS totalDibutuhkan
     FROM tbarangkomposisi bk
     INNER JOIN tbarang b ON b.brg_kode = bk.bk_bhn_kode
     WHERE TRIM(bk.bk_brg_kode) = TRIM(?)
     ORDER BY bk.bk_nourut ASC`,
    [Number(spk.jumlah) || 0, spk.brgKode]
  );

  return { ...spk, jumlah: Number(spk.jumlah) || 0, bahan: rows };
};

// ── Hapus SPK dalam SATU transaksi ────────────────────────────────────
const deleteData = async (nomor) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    const [[spk]] = await conn.query(
      `SELECT spk_nomor FROM tspk WHERE spk_nomor = ?`,
      [nomor]
    );
    if (!spk) throw new Error("Data SPK tidak ditemukan.");

    await conn.query(
      `DELETE FROM tspk_dtl WHERE TRIM(dtl_spk_nomor) = TRIM(?)`,
      [nomor]
    );
    await conn.query(`DELETE FROM tspk WHERE spk_nomor = ?`, [nomor]);

    await conn.commit();
    return { deleted: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// ── Close / Update status SPK ──────────────────────────────────────────
// Versi konveksi: syarat close = SEMUA tahapan selesai (tidak ada LHK).
// Memo opsional — catatan hasil produksi.
const closeStatus = async (nomor, payload, user) => {
  const memo = String(payload?.memo ?? "").trim();
  if (memo.length > 500) {
    throw new Error("Memo close maksimal 500 karakter.");
  }

  const [[spk]] = await db.query(
    `SELECT spk_nomor, spk_jumlah, spk_jumlah_jadi, IFNULL(spk_is_closed, 0) AS isClosed
       FROM tspk WHERE TRIM(spk_nomor) = TRIM(?)`,
    [nomor]
  );
  if (!spk) throw new Error("SPK tidak ditemukan.");
  if (Number(spk.isClosed) === 1) {
    throw new Error("SPK ini sudah di-close sebelumnya.");
  }

  if (memo) {
    await db.query(
      `UPDATE tspk
          SET spk_is_closed = 1, spk_memo_close = ?, spk_close_date = NOW(), spk_close_user = ?
        WHERE TRIM(spk_nomor) = TRIM(?) AND IFNULL(spk_is_closed, 0) = 0`,
      [memo, user?.kode || "ADMIN", nomor]
    );
  } else {
    await db.query(
      `UPDATE tspk
          SET spk_is_closed = 1, spk_close_date = NOW(), spk_close_user = ?
        WHERE TRIM(spk_nomor) = TRIM(?) AND IFNULL(spk_is_closed, 0) = 0`,
      [user?.kode || "ADMIN", nomor]
    );
  }

  const [[snap]] = await db.query(
    `SELECT DATE_FORMAT(spk_close_date, '%Y-%m-%d %H:%i') AS closeDate
       FROM tspk WHERE TRIM(spk_nomor) = TRIM(?)`,
    [nomor]
  );

  return {
    nomor: spk.spk_nomor,
    isClosed: 1,
    memoClose: memo || null,
    closeUser: user?.kode || "ADMIN",
    closeDate: snap?.closeDate || null,
    target: Number(spk.spk_jumlah || 0),
    jadi: Number(spk.spk_jumlah_jadi || 0),
  };
};

// ── Simpan Memo status SPK ─────────────────────────────────────────────
// Memo = catatan bebas, contoh: "target 100 jadi 75, mesin macet".
const updateMemo = async (nomor, payload) => {
  const memo = String(payload?.memo ?? "").trim();
  if (memo.length > 500) {
    throw new Error("Memo maksimal 500 karakter.");
  }

  const [[spk]] = await db.query(
    `SELECT spk_nomor, spk_jumlah, spk_jumlah_jadi,
            IFNULL(spk_is_closed, 0) AS isClosed, spk_memo_close
       FROM tspk WHERE TRIM(spk_nomor) = TRIM(?)`,
    [nomor]
  );
  if (!spk) throw new Error("SPK tidak ditemukan.");
  if (Number(spk.isClosed) !== 1) {
    throw new Error(
      "Memo baru bisa diisi setelah status SPK di-update menjadi CLOSED."
    );
  }

  await db.query(
    `UPDATE tspk SET spk_memo_close = ? WHERE TRIM(spk_nomor) = TRIM(?)`,
    [memo || null, nomor]
  );

  return {
    nomor: spk.spk_nomor,
    isClosed: 1,
    memoClose: memo || null,
    closeUser: spk.spk_close_user ?? null,
    target: Number(spk.spk_jumlah || 0),
    jadi: Number(spk.spk_jumlah_jadi || 0),
  };
};

// ── Bahan Baku & Kemasan (BOM) untuk cetak SPK ──────────────────────
const getKomposisiByBarang = async (brgKode) => {
  const [rows] = await db.query(
    `SELECT
        bk.bk_bhn_kode     AS bahanKode,
        b.brg_nama         AS bahanNama,
        bk.bk_qty          AS qtyPerUnit,
        bk.bk_satuan       AS satuan,
        bk.bk_nourut       AS urutan,
        bk.bk_spesifikasi  AS spesifikasi
     FROM tbarangkomposisi bk
     INNER JOIN tbarang b ON b.brg_kode = bk.bk_bhn_kode
     WHERE TRIM(bk.bk_brg_kode) = TRIM(?)
     ORDER BY bk.bk_nourut ASC`,
    [brgKode]
  );
  return rows;
};

// ── Master + tahap flatten (1 baris = 1 tahap), dipakai "Export Detail" ──
const getBrowseDetailAll = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       h.spk_nomor        AS Nomor,
       h.spk_nama         AS Nama,
       DATE_FORMAT(h.spk_tanggal, '%Y-%m-%d')  AS Tanggal,
       DATE_FORMAT(h.spk_dateline, '%Y-%m-%d') AS DateLine,
       b.brg_kode         AS KodeBarang,
       b.brg_nama         AS Barang,
       c.cus_nama         AS Customer,
       h.spk_idbatch       AS IdBatch,
       h.spk_jumlah        AS Target,
       h.spk_jumlah_jadi   AS Jadi,
       ${_exprStatus()} AS Status,
       d.dtl_urutan       AS Urutan,
       d.dtl_nama         AS Tahap,
       IFNULL(d.dtl_target, 0)  AS TargetTahap,
       IFNULL(d.dtl_selesai, 0) AS Selesai,
       IF(d.dtl_finalisasi = 1, 'Ya', 'Tidak') AS Finalisasi
     FROM tspk h
     JOIN tspk_dtl d ON TRIM(d.dtl_spk_nomor) = TRIM(h.spk_nomor)
     LEFT JOIN tbarang b ON h.spk_brg_kode = b.brg_kode
     LEFT JOIN tcustomer c ON h.spk_cus_kode = c.cus_kode
     WHERE h.spk_tanggal BETWEEN ? AND ?
     ORDER BY h.spk_nomor ASC, d.dtl_urutan ASC`,
    [startDate, endDate]
  );
  return rows;
};

module.exports = {
  getBrowse,
  getBrowseDetail,
  getBrowseDetailAll,
  deleteData,
  closeStatus,
  updateMemo,
  getKomposisiByBarang,
  getKebutuhanBahan,
};
