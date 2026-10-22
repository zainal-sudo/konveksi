const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");
const { acquireLock, releaseLock } = require("../../utils/nomorLock");
const { createAutoJurnalMutasiOut, getHppBarang } = require("../../utils/jurnalMutasiCabang");

// ── Generate Nomor Otomatis ──────────────────────────────────────────
const getMaxNomor = async (tanggal, cabang) => {
  const d = new Date(tanggal);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const prefix = `${cabang}-MTC.${yy}${mm}.`;

  const [[row]] = await db.query(
    `SELECT IFNULL(MAX(CAST(RIGHT(mutc_nomor, 4) AS UNSIGNED)), 0) AS max_val
      FROM tmutcab_hdr
      WHERE mutc_nomor LIKE ?`,
    [`${prefix}%`]
  );
  const nextNum = 10000 + Number(row.max_val) + 1;
  return `${prefix}${String(nextNum).slice(-4)}`;
};

// ── Lookup Cabang ────────────────────────────────────────────────────
const getCabang = async () => {
  const [rows] = await db.query(
    `SELECT cbg_kode AS kode, cbg_nama AS nama FROM tcabang ORDER BY cbg_kode`
  );
  return rows;
};

// ── Lookup Gudang milik satu cabang ──────────────────────────────────
const getGudang = async (cabangKode) => {
  if (!cabangKode) return [];
  const [rows] = await db.query(
    `SELECT gdg_kode AS kode, gdg_nama AS nama
       FROM tgudang
      WHERE gdg_cbg_kode = ?
      ORDER BY gdg_nama`,
    [cabangKode]
  );
  return rows;
};

// ── Search SKU (stok per gudang asal + HPP dibawa) ────────────────────
const searchSKU = async (gudang, search = "") => {
  const [rows] = await db.query(
    `SELECT
       b.brg_kode AS sku,
       DATE_FORMAT(m.mst_expired_date, '%Y-%m-%d') AS expired,
       b.brg_nama AS namaBarang,
       b.brg_satuan AS satuan,
       IFNULL(SUM(m.mst_stok_in - m.mst_stok_out), 0) AS stok,
       IFNULL(
         (SELECT mst_avgcost FROM tmasterstok
           WHERE mst_brg_kode = b.brg_kode AND mst_gdg_kode = ? AND mst_avgcost > 0
           ORDER BY mst_tanggal DESC, mst_id DESC LIMIT 1),
         IFNULL(
           (SELECT mst_hargabeli FROM tmasterstok
             WHERE mst_brg_kode = b.brg_kode AND mst_hargabeli > 1
               AND mst_noreferensi LIKE '%MTCI%'
             ORDER BY mst_tanggal DESC, mst_id DESC LIMIT 1),
           b.brg_hrgbeli)) AS harga
     FROM tbarang b
     INNER JOIN tmasterstok m
       ON m.mst_brg_kode = b.brg_kode
      AND m.mst_gdg_kode = ?
     WHERE b.brg_nama LIKE ? OR CAST(b.brg_kode AS CHAR) LIKE ?
     GROUP BY b.brg_kode, b.brg_nama, b.brg_satuan, m.mst_expired_date
     ORDER BY b.brg_kode
     LIMIT 100`,
    [gudang, gudang, `%${search}%`, `%${search}%`]
  );
  return rows;
};

// ── Load Form Edit ───────────────────────────────────────────────────
const getDetailForm = async (nomor) => {
  const [[header]] = await db.query(
    `SELECT
       mutc_nomor AS nomor,
       DATE_FORMAT(mutc_tanggal, '%Y-%m-%d') AS tanggal,
       mutc_cbg_asal AS cabangAsal,
       mutc_cbg_tujuan AS cabangTujuan,
       mutc_gdg_kode AS gudang,
       IFNULL(mutc_keterangan, '') AS keterangan,
       mutc_status AS status
     FROM tmutcab_hdr
     WHERE mutc_nomor = ?`,
    [nomor]
  );

  if (!header) throw new Error("Mutasi cabang tidak ditemukan.");

  const [detailRows] = await db.query(
    `SELECT
       d.mutcd_brg_kode AS sku,
       b.brg_nama AS namaBarang,
       b.brg_satuan AS satuan,
       d.mutcd_qty AS qty,
       DATE_FORMAT(d.mutcd_expired, '%Y-%m-%d') AS expired,
       IFNULL(d.mutcd_keterangan, '') AS keterangan,
       d.mutcd_harga AS harga,
       d.mutcd_gdg_kode AS gudang
     FROM tmutcab_dtl d
     INNER JOIN tbarang b ON b.brg_kode = d.mutcd_brg_kode
     WHERE d.mutcd_mutc_nomor = ?
     ORDER BY d.mutcd_nourut`,
    [nomor]
  );

  return {
    ...header,
    detail: detailRows.map((d, i) => ({ no: i + 1, ...d })),
  };
};

// ── Save Data ────────────────────────────────────────────────────────
const saveData = async (payload, user) => {
  const {
    isEdit, nomor, tanggal, cabangAsal, cabangTujuan, gudang, keterangan, detail,
  } = payload;

  const cabangLogin = String(user?.cabang || "00");
  let lockKey = null;
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    // ── Validasi ─────────────────────────────────────────────────────
    if (await cekTutupPeriode(tanggal)) {
      throw new Error("Periode ini sudah di tutup.");
    }
    if (!gudang) throw new Error("Gudang belum di pilih.");
    if (!cabangAsal || !cabangTujuan) throw new Error("Cabang belum di pilih.");
    if (cabangAsal === cabangTujuan)
      throw new Error("Cabang Asal tidak boleh sama dengan Cabang Tujuan.");

    // User cabang hanya boleh kirim dari cabangnya sendiri
    if (cabangLogin !== "00" && cabangAsal !== cabangLogin) {
      throw new Error("Cabang asal harus sama dengan cabang user yang login.");
    }

    // Gudang asal wajib milik cabang asal
    const [[gdg]] = await conn.query(
      `SELECT gdg_cbg_kode FROM tgudang WHERE gdg_kode = ?`, [gudang]
    );
    if (!gdg) throw new Error(`Gudang ${gudang} tidak ditemukan.`);
    if ((gdg.gdg_cbg_kode || "00") !== cabangAsal) {
      throw new Error("Gudang asal tidak sesuai dengan cabang asal.");
    }

    const validDetail = (detail || []).filter(
      (d) => Number(d.qty) > 0 && d.sku && String(d.sku) !== "0"
    );
    if (validDetail.length === 0)
      throw new Error("Detail mutasi kosong. Isi minimal satu baris barang.");

    let actualNomor = nomor;

    if (isEdit) {
      // Mutasi yang sudah diterima cabang tujuan tidak bisa diedit
      const [[hdr]] = await conn.query(
        `SELECT mutc_status FROM tmutcab_hdr WHERE mutc_nomor = ? FOR UPDATE`,
        [nomor]
      );
      if (!hdr) throw new Error("Data mutasi cabang tidak ditemukan.");
      if (Number(hdr.mutc_status) === 1)
        throw new Error("Transaksi ini sudah Diterima cabang tujuan, tidak dapat diedit.");

      await conn.query(
        `UPDATE tmutcab_hdr SET
           mutc_tanggal = ?, mutc_keterangan = ?, mutc_gdg_kode = ?,
           mutc_cbg_asal = ?, mutc_cbg_tujuan = ?,
           date_modified = NOW(), user_modified = ?
         WHERE mutc_nomor = ?`,
        [tanggal, keterangan, gudang, cabangAsal, cabangTujuan, user.kode, nomor]
      );

      // detail lama dihapus → trigger membalikkan stok gudang asal
      await conn.query(
        `DELETE FROM tmutcab_dtl WHERE mutcd_mutc_nomor = ?`, [actualNomor]
      );
    } else {
      const d = new Date(tanggal);
      lockKey = `nomor_mtc_${cabangAsal}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
      await acquireLock(conn, lockKey);
      actualNomor = await getMaxNomor(tanggal, cabangAsal);
      await conn.query(
        `INSERT INTO tmutcab_hdr
           (mutc_nomor, mutc_tanggal, mutc_cbg_asal, mutc_cbg_tujuan,
            mutc_gdg_kode, mutc_keterangan, date_create, user_create, mutc_status)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, 0)`,
        [actualNomor, tanggal, cabangAsal, cabangTujuan, gudang, keterangan || "", user.kode]
      );
    }

    // Insert detail baru (trigger menurunkan stok gudang asal;
    // trigger menulis mst_hargabeli & mst_avgcost = harga mutasi/HPP)
    let nourut = 1;
    for (const dr of validDetail) {
      // HPP dibawa ke cabang tujuan: pakai harga form, kalau kosong ambil
      // avgcost terakhir barang di gudang asal, fallback harga beli barang
      const harga = Number(dr.harga) > 0
        ? Number(dr.harga)
        : await getHppBarang(conn, dr.sku, gudang);
      await conn.query(
        `INSERT INTO tmutcab_dtl
           (mutcd_mutc_nomor, mutcd_brg_kode, mutcd_qty, mutcd_harga,
            mutcd_keterangan, mutcd_expired, mutcd_gdg_kode, mutcd_nourut, mutcd_pb_nomor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '')`,
        [
          actualNomor, dr.sku, dr.qty, harga,
          dr.keterangan || "", dr.expired || "0000-00-00", gudang, nourut,
        ]
      );
      nourut++;
    }

    // Jurnal mutasi OUT: Dr Persediaan Intransit vs Cr Persediaan asal pusat
    await createAutoJurnalMutasiOut(conn, { nomor: actualNomor, user: user.kode });

    await conn.commit();
    return { nomor: actualNomor };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    if (lockKey) { try { await releaseLock(conn, lockKey); } catch { /* noop */ } }
    conn.release();
  }
};

module.exports = {
  getMaxNomor,
  getCabang,
  getGudang,
  searchSKU,
  getDetailForm,
  saveData,
};
