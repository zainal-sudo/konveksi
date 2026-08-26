const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");

// ── Browse master ─────────────────────────────────────────────────────
// Delphi: tjurnal WHERE jur_tipetransaksi="PBC" AND jur_otomatis=2
// Nominal = SUM(jurd_kredit) dari tjurnalitem
// Closed: jur_close=0 → "Belum", else → "Sudah"
const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       h.jur_no                                AS Nomor,
       h.jur_tipetransaksi                     AS Tipe,
       h.jur_rek_kode                          AS Account,
       IFNULL(r.rek_nama, '')                  AS NamaAccount,
       IFNULL(r.rek_rekening, '')              AS Rekening,
       DATE_FORMAT(h.jur_tanggal,'%Y-%m-%d')  AS Tanggal,
       IFNULL(h.jur_penerima, '')             AS DiterimaDari,
       IFNULL(h.jur_nota, '')                 AS Nota,
       IFNULL(h.jur_keterangan, '')           AS Keterangan,
       IFNULL((
         SELECT SUM(d.jurd_kredit)
         FROM tjurnalitem d
         WHERE d.jurd_jur_no = h.jur_no
       ), 0)                                   AS Nominal,
       h.jur_cabang                            AS Cabang,
       IF(h.jur_close = 0, 'Belum', 'Sudah')  AS Closed
     FROM tjurnal h
     LEFT JOIN trekening r ON r.rek_kode = h.jur_rek_kode
     WHERE h.jur_tipetransaksi = 'PBC'
       AND h.jur_otomatis = 2
       AND h.jur_tanggal >= ?
       AND h.jur_tanggal <= ?
     ORDER BY h.jur_no`,
    [startDate, endDate],
  );
  return rows;
};

// ── Browse detail ─────────────────────────────────────────────────────
// Delphi: tjurnalitem WHERE jurd_trs <> "" (hanya baris berisi transaksi)
const getBrowseDetail = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       d.jurd_jur_no                   AS Nomor,
       d.jurd_nourut                   AS No,
       IFNULL(d.jurd_uraian, '')       AS Uraian,
       d.jurd_kredit                   AS Nominal,
       d.jurd_rek_kode                 AS Account,
       IFNULL(r.rek_nama, '')          AS NamaAccount,
       IFNULL(d.jurd_dcnama, '')       AS DetailCC
     FROM tjurnal h
     INNER JOIN tjurnalitem d ON d.jurd_jur_no = h.jur_no
     LEFT JOIN trekening r ON r.rek_kode = d.jurd_rek_kode
     WHERE h.jur_tipetransaksi = 'PBC'
       AND h.jur_otomatis = 2
       AND d.jurd_trs <> ''
       AND h.jur_tanggal >= ?
       AND h.jur_tanggal <= ?
     ORDER BY d.jurd_jur_no, d.jurd_nourut`,
    [startDate, endDate],
  );
  return rows;
};

// ── Delete ────────────────────────────────────────────────────────────
// Delphi cxButton4Click:
//   - cek Closed = "Sudah" → tolak
//   - DELETE FROM tjurnal WHERE jur_no = ?
//   - (tjurnalitem di-delete manual juga untuk safety)
const deleteData = async (nomor) => {
  const [[hdr]] = await db.query(
    `SELECT jur_close, jur_tanggal FROM tjurnal WHERE jur_no = ?`,
    [nomor],
  );
  if (!hdr) throw new Error("Data tidak ditemukan.");
  if (hdr.jur_close !== 0)
    throw new Error("Transaksi tersebut sudah diclose. Tidak bisa dihapus.");

  const tutup = await cekTutupPeriode(hdr.jur_tanggal);
  if (tutup) throw new Error("Periode sudah ditutup. Tidak bisa dihapus.");

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [nomor]);
    await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [nomor]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = { getBrowse, getBrowseDetail, deleteData };
