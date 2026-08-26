const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");

// ── Helper: cekstore ──────────────────────────────────────────────────
// Delphi cekstore: gdg_kode NOT IN ("K01") AND gdg_kode=? AND gdg_dc=0
const cekStore = async (kabang) => {
  const [[row]] = await db.query(
    `SELECT gdg_dc FROM retail.tgudang
     WHERE gdg_kode NOT IN ('K01')
       AND gdg_kode = ?`,
    [kabang],
  );
  if (!row) return false;
  return Number(row.gdg_dc) === 0;
};

// ── Browse master ─────────────────────────────────────────────────────
// Delphi: tjurnal WHERE jur_tipetransaksi="PBK" AND jur_otomatis=2
// Kolom tambahan vs PBC: TglTransfer, Customer, trs
const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       h.jur_no                                        AS Nomor,
       h.jur_tipetransaksi                             AS Tipe,
       h.jur_rek_kode                                  AS Account,
       IFNULL(r.rek_nama, '')                          AS NamaAccount,
       IFNULL(r.rek_rekening, '')                      AS Rekening,
       DATE_FORMAT(h.jur_tanggal, '%Y-%m-%d')         AS Tanggal,
       DATE_FORMAT(s.sh_tgltransfer, '%Y-%m-%d')      AS TglTransfer,
       IFNULL(h.jur_penerima, '')                     AS DiterimaDari,
       IFNULL(h.jur_nota, '')                         AS Nota,
       IFNULL(h.jur_keterangan, '')                   AS Keterangan,
       IFNULL((
         SELECT SUM(d.jurd_kredit)
         FROM tjurnalitem d
         WHERE d.jurd_jur_no = h.jur_no
       ), 0)                                           AS Nominal,
       h.jur_cabang                                   AS Cabang,
       IFNULL(c.cus_nama, IFNULL(cc.cus_nama, ''))   AS Customer,
       IF(
         i.inv_cus_kode IS NOT NULL,
         'TUNAI',
         IF(s.sh_jenis = 0, 'TUNAI',
           IF(s.sh_jenis = 1, 'TRANSFER', 'GIRO'))
       )                                               AS Trs,
       IF(h.jur_close = 0, 'Belum', 'Sudah')          AS Closed
     FROM tjurnal h
     LEFT JOIN trekening r ON r.rek_kode = h.jur_rek_kode
     LEFT JOIN retail.tsetor_hdr s ON s.sh_nomor = h.jur_nomor
     LEFT JOIN retail.tinv_hdr i ON i.inv_nomor = h.jur_nomor
     LEFT JOIN retail.tcustomer c ON c.cus_kode = s.sh_cus_kode
     LEFT JOIN retail.tcustomer cc ON cc.cus_kode = i.inv_cus_kode
     WHERE h.jur_tipetransaksi = 'PBK'
       AND h.jur_otomatis = 2
       AND h.jur_tanggal >= ?
       AND h.jur_tanggal <= ?
     ORDER BY h.jur_no`,
    [startDate, endDate],
  );
  return rows;
};

// ── Browse detail ─────────────────────────────────────────────────────
// Delphi: sama persis dengan PBC, hanya filter PBK
const getBrowseDetail = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       d.jurd_jur_no               AS Nomor,
       d.jurd_nourut               AS No,
       IFNULL(d.jurd_uraian, '')   AS Uraian,
       d.jurd_kredit               AS Nominal,
       d.jurd_rek_kode             AS Account,
       IFNULL(r.rek_nama, '')      AS NamaAccount,
       IFNULL(d.jurd_dcnama, '')   AS DetailCC
     FROM tjurnal h
     INNER JOIN tjurnalitem d ON d.jurd_jur_no = h.jur_no
     LEFT JOIN trekening r ON r.rek_kode = d.jurd_rek_kode
     WHERE h.jur_tipetransaksi = 'PBK'
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
//   - cek Closed="Sudah" → tolak
//   - DELETE finance.tjurnal WHERE jur_no=?
//   - jika cekstore(Cabang) → INSERT kencanaprint.tlog_sync
//   - ShellExecute syncho → skip di web
const deleteData = async (nomor) => {
  const [[hdr]] = await db.query(
    `SELECT jur_close, jur_tanggal, jur_cabang
     FROM tjurnal WHERE jur_no = ?`,
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
    // Delphi: DELETE FROM finance.tjurnal (prefix eksplisit di Delphi)
    await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [nomor]);
    await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [nomor]);

    // Delphi: cekstore → INSERT tlog_sync
    const perluSync = await cekStore(hdr.jur_cabang);
    if (perluSync) {
      await conn.query(
        `INSERT INTO kencanaprint.tlog_sync
           (log_tabel, log_nomor, log_cab, log_task, log_sync)
         VALUES ('tjurnal', ?, ?, 'DELETE', 'Y')
         ON DUPLICATE KEY UPDATE log_sync = 'Y'`,
        [nomor, hdr.jur_cabang],
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = { getBrowse, getBrowseDetail, deleteData };
