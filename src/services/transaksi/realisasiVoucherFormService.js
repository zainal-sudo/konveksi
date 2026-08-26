const db = require("../../config/database");

// ── Auto nomor: BYR/KODE/YY/NNNNN ─────────────────────────────────────
const getMaxNomor = async (kode, tanggal) => {
  const yy = new Date(tanggal).getFullYear().toString().slice(-2);
  const prefix = `BYR/${kode}/${yy}`;
  const [[row]] = await db.query(
    `SELECT IFNULL(MAX(RIGHT(nomor,5)),'00000') AS mx
     FROM kencanaprint.bayar_debet
     WHERE LEFT(nomor,?) = ?`,
    [prefix.length, prefix],
  );
  const next = Number(row.mx) + 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
};

// ── Kode Bayar ─────────────────────────────────────────────────────────
const searchKodeBayar = async (q) => {
  const like = `%${q}%`;
  const [rows] = await db.query(
    `SELECT kb_kode AS kode, kb_nama AS nama FROM kencanaprint.tkodebayar
     ${q ? "WHERE kb_kode LIKE ? OR kb_nama LIKE ?" : ""}
     ORDER BY kb_kode`,
    q ? [like, like] : [],
  );
  return rows;
};

const getKodeBayar = async (kode) => {
  const [[row]] = await db.query(
    `SELECT kb_kode AS kode, kb_nama AS nama FROM kencanaprint.tkodebayar WHERE kb_kode = ?`,
    [kode],
  );
  if (!row) throw new Error("Kode bayar tidak ditemukan.");
  return row;
};

// ── Account (tperusahaan_dtl) ──────────────────────────────────────────
const searchAccount = async (q) => {
  const like = `%${q}%`;
  const [rows] = await db.query(
    `SELECT d.perushd_rekening AS rekening, d.perushd_bank AS bank,
            d.perushd_atasnama AS atasnama, d.perushd_cabang AS cabang
     FROM kencanaprint.tperusahaan_dtl d
     INNER JOIN kencanaprint.tperusahaan p
       ON p.perush_kode = d.perushd_perush_kode AND p.perush_status_utama = 1
     ${q ? "WHERE d.perushd_rekening LIKE ? OR d.perushd_bank LIKE ? OR d.perushd_atasnama LIKE ?" : ""}
     ORDER BY d.perushd_rekening`,
    q ? [like, like, like] : [],
  );
  return rows;
};

const getAccount = async (rekening) => {
  const [[row]] = await db.query(
    `SELECT d.perushd_rekening AS rekening, d.perushd_bank AS bank
     FROM kencanaprint.tperusahaan_dtl d
     INNER JOIN kencanaprint.tperusahaan p
       ON p.perush_kode = d.perushd_perush_kode AND p.perush_status_utama = 1
     WHERE d.perushd_rekening = ? LIMIT 1`,
    [rekening],
  );
  if (!row) throw new Error("Account tidak ditemukan.");
  return row;
};

// ── Search Voucher (belum direalisasi) ─────────────────────────────────
const searchVoucher = async (q, excludeNomor = "") => {
  const like = `%${q}%`;
  const [rows] = await db.query(
    `SELECT h.vou_nomor AS Nomor,
            DATE_FORMAT(h.vou_tanggal, '%Y-%m-%d') AS Tanggal,
            s.sup_nama AS Supplier,
            (h.vou_total - h.vou_disc) AS Total
     FROM kencanaprint.tvoucher_hdr h
     INNER JOIN kencanaprint.tsupplier s ON s.sup_kode = h.vou_sup_kode
     WHERE h.vou_nomor NOT IN (
       SELECT b.vou_nomor FROM kencanaprint.bayar_debet_detail b
       ${excludeNomor ? "WHERE b.nomor != ?" : ""}
     )
     ${q ? "AND (h.vou_nomor LIKE ? OR s.sup_nama LIKE ?)" : ""}
     ORDER BY h.vou_nomor DESC LIMIT 100`,
    [...(excludeNomor ? [excludeNomor] : []), ...(q ? [like, like] : [])],
  );
  return rows;
};

// ── Load voucher detail satu baris ─────────────────────────────────────
const loadVoucherDetail = async (vouNomor, currentNomor = "") => {
  const [[row]] = await db.query(
    `SELECT h.vou_nomor AS vouNomor, s.sup_nama AS supplier,
            DATE_FORMAT(h.vou_tanggal, '%Y-%m-%d') AS tanggalVou,
            (h.vou_total - h.vou_disc) AS nilai,
            h.vou_status_realisasi AS statusReal
     FROM kencanaprint.tvoucher_hdr h
     INNER JOIN kencanaprint.tsupplier s ON s.sup_kode = h.vou_sup_kode
     WHERE h.vou_nomor = ?`,
    [vouNomor],
  );
  if (!row) throw new Error("Voucher tidak ditemukan.");
  // Sudah direalisasi — kecuali milik realisasi yang sedang diedit
  if (Number(row.statusReal) === 1) {
    if (currentNomor) {
      const [[own]] = await db.query(
        `SELECT 1 FROM kencanaprint.bayar_debet_detail WHERE nomor = ? AND vou_nomor = ?`,
        [currentNomor, vouNomor],
      );
      if (!own) throw new Error("Voucher ini sudah direalisasi.");
    } else {
      throw new Error("Voucher ini sudah direalisasi.");
    }
  }
  return {
    vouNomor: row.vouNomor,
    supplier: row.supplier,
    tanggalVou: row.tanggalVou,
    nilai: Number(row.nilai),
  };
};

// ── Get detail form (edit mode) ────────────────────────────────────────
const getDetailForm = async (nomor) => {
  const [rows] = await db.query(
    `SELECT a.nomor, a.kode AS kodeBayar, kb.kb_nama AS namaBayar,
            DATE_FORMAT(a.tanggal, '%Y-%m-%d') AS tanggal,
            DATE_FORMAT(a.tanggal_tempo, '%Y-%m-%d') AS tanggalTempo,
            a.account, IFNULL(d.perushd_bank, '') AS namaAccount,
            b.vou_nomor AS vouNomor, s.sup_nama AS supplier,
            DATE_FORMAT(h.vou_tanggal, '%Y-%m-%d') AS tanggalVou,
            (h.vou_total - h.vou_disc) AS nilai
     FROM kencanaprint.bayar_debet a
     INNER JOIN kencanaprint.tkodebayar kb ON kb.kb_kode = a.kode
     INNER JOIN kencanaprint.bayar_debet_detail b ON b.nomor = a.nomor
     INNER JOIN kencanaprint.tvoucher_hdr h ON h.vou_nomor = b.vou_nomor
     INNER JOIN kencanaprint.tsupplier s ON s.sup_kode = h.vou_sup_kode
     LEFT JOIN kencanaprint.tperusahaan_dtl d ON d.perushd_rekening = a.account
     LEFT JOIN kencanaprint.tperusahaan p
       ON p.perush_kode = d.perushd_perush_kode AND p.perush_status_utama = 1
     WHERE a.nomor = ?`,
    [nomor],
  );
  if (!rows.length) throw new Error("Data tidak ditemukan.");
  const h = rows[0];
  return {
    nomor: h.nomor,
    kodeBayar: h.kodeBayar,
    namaBayar: h.namaBayar,
    tanggal: h.tanggal,
    tanggalTempo: h.tanggalTempo,
    account: h.account,
    namaAccount: h.namaAccount,
    detail: rows.map((r) => ({
      vouNomor: r.vouNomor,
      supplier: r.supplier,
      tanggalVou: r.tanggalVou,
      nilai: Number(r.nilai),
    })),
  };
};

// ── Save ───────────────────────────────────────────────────────────────
const save = async (payload, userKode) => {
  const { isEdit, nomor, kodeBayar, account, tanggal, tanggalTempo, detail } =
    payload;
  const total = detail.reduce((s, d) => s + Number(d.nilai), 0);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let finalNomor = nomor;

    if (!isEdit) {
      if (kodeBayar !== "BG")
        finalNomor = await getMaxNomor(kodeBayar, tanggal);
      await conn.query(
        `INSERT INTO kencanaprint.bayar_debet
         (nomor, kode, account, tanggal, tanggal_tempo, total, kodeuser)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          finalNomor,
          kodeBayar,
          account,
          tanggal,
          tanggalTempo,
          total,
          userKode,
        ],
      );
    } else {
      await conn.query(
        `UPDATE kencanaprint.bayar_debet
         SET tanggal=?, tanggal_tempo=?, account=?, total=?
         WHERE nomor=?`,
        [tanggal, tanggalTempo, account, total, nomor],
      );
      // Reset status realisasi voucher lama sebelum re-insert
      await conn.query(
        `UPDATE kencanaprint.tvoucher_hdr h
         INNER JOIN kencanaprint.bayar_debet_detail d ON d.vou_nomor = h.vou_nomor
         SET h.vou_status_realisasi = 0
         WHERE d.nomor = ?`,
        [nomor],
      );
    }

    // DELETE + INSERT detail
    await conn.query(
      `DELETE FROM kencanaprint.bayar_debet_detail WHERE nomor = ?`,
      [finalNomor],
    );
    for (const d of detail) {
      await conn.query(
        `INSERT INTO kencanaprint.bayar_debet_detail (nomor, vou_nomor, nilai)
         VALUES (?, ?, ?)`,
        [finalNomor, d.vouNomor, d.nilai],
      );
      // Set voucher sebagai sudah direalisasi
      await conn.query(
        `UPDATE kencanaprint.tvoucher_hdr SET vou_status_realisasi = 1
         WHERE vou_nomor = ?`,
        [d.vouNomor],
      );
    }

    await conn.commit();
    return { nomor: finalNomor };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// ── Hapus ──────────────────────────────────────────────────────────────
const hapus = async (nomor) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE kencanaprint.tvoucher_hdr h
       INNER JOIN kencanaprint.bayar_debet_detail d ON d.vou_nomor = h.vou_nomor
       SET h.vou_status_realisasi = 0 WHERE d.nomor = ?`,
      [nomor],
    );
    await conn.query(
      `DELETE FROM kencanaprint.bayar_debet_detail WHERE nomor = ?`,
      [nomor],
    );
    await conn.query(`DELETE FROM kencanaprint.bayar_debet WHERE nomor = ?`, [
      nomor,
    ]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = {
  getMaxNomor,
  searchKodeBayar,
  getKodeBayar,
  searchAccount,
  getAccount,
  searchVoucher,
  loadVoucherDetail,
  getDetailForm,
  save,
  hapus,
};
