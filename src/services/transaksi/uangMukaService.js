const db = require("../../config/database");

const getBrowse = async (startDate, endDate, cabang) => {
  let sql = `
    SELECT
      b.bon_nomor        AS Nomor,
      DATE_FORMAT(b.bon_tanggal, '%Y-%m-%d') AS Tanggal,
      IF(b.bon_jenis=0,'KAS','BANK') AS Jenis,
      r.rek_nama         AS NamaAccount,
      b.bon_pjh_nomor    AS Pjh,
      b.bon_nota         AS Nota,
      b.bon_penerima     AS Penerima,
      b.bon_nominal      AS Nominal,
      IF(b.bon_jur_no='', 0,
        IFNULL((
          SELECT SUM(d.jurd_kredit)
          FROM tjurnalitem d
          WHERE d.jurd_jur_no = b.bon_jur_no
        ), 0)
      ) AS Terpakai,
      (b.bon_nominal - IF(b.bon_jur_no='', 0,
        IFNULL((
          SELECT SUM(d.jurd_kredit)
          FROM tjurnalitem d
          WHERE d.jurd_jur_no = b.bon_jur_no
        ), 0)
      )) AS Sisa,
      b.bon_keterangan   AS Keterangan,
      b.bon_jur_no       AS NoBukti,
      IF(b.bon_selesai=0,'Belum','Sudah') AS Selesai,
      IF(IFNULL((
        SELECT h.jur_isclosed FROM tjurnal h WHERE h.jur_no = b.bon_jur_no
      ), 0)=0,'Belum','Sudah') AS Closed
    FROM tkasbon b
    LEFT JOIN trekening r ON r.rek_kode = b.bon_rek_kode
    WHERE b.bon_tanggal BETWEEN ? AND ?
  `;

  const params = [startDate, endDate];

  if (cabang && cabang !== "P01" && cabang !== "ALL") {
    sql += ` AND b.bon_cabang = ?`;
    params.push(cabang);
  }

  sql += ` ORDER BY b.bon_nomor`;

  const [rows] = await db.query(sql, params);
  return rows;
};

const deleteData = async (nomor, cabang) => {
  // Validasi: cek apakah sudah ada penyelesaian
  const [[bon]] = await db.query(
    `SELECT bon_selesai, bon_pjh_nomor FROM tkasbon WHERE bon_nomor = ?`,
    [nomor],
  );
  if (!bon) throw new Error("Data tidak ditemukan.");
  if (bon.bon_selesai !== 0 && bon.bon_selesai !== "0")
    throw new Error("Sudah ada penyelesaian. Tidak bisa dihapus.");

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // Reset tpermintaan_hdr di DB ga2 (cross-DB)
    if (bon.bon_pjh_nomor) {
      await conn.query(
        `UPDATE ga2.tpermintaan_hdr SET pmt_approval = 0
         WHERE pmt_pjh_nomor = ?`,
        [bon.bon_pjh_nomor],
      );
      await conn.query(
        `UPDATE ga2.tpermintaan_dtl SET
           pmd_tanggal_approved = NULL, pmd_user_approved = '',
           pmd_bon = '', pmd_dana_approved = 0,
           pmd_user_reject = '', pmd_tanggal_reject = NULL,
           pmd_kode_reject = 0
         WHERE pmd_bon = ?`,
        [nomor],
      );
    }

    await conn.query(`DELETE FROM tkasbon WHERE bon_nomor = ?`, [nomor]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

const getBrowsePendingAll = async () => {
  const [rows] = await db.query(
    `SELECT
       b.bon_nomor        AS Nomor,
       DATE_FORMAT(b.bon_tanggal, '%Y-%m-%d') AS Tanggal,
       IF(b.bon_jenis=0,'KAS','BANK') AS Jenis,
       r.rek_nama         AS NamaAccount,
       b.bon_pjh_nomor    AS Pjh,
       b.bon_nota         AS Nota,
       b.bon_penerima     AS Penerima,
       b.bon_nominal      AS Nominal,
       IF(b.bon_jur_no='', 0,
         IFNULL((
           SELECT SUM(d.jurd_kredit)
           FROM tjurnalitem d
           WHERE d.jurd_jur_no = b.bon_jur_no
         ), 0)
       ) AS Terpakai,
       (b.bon_nominal - IF(b.bon_jur_no='', 0,
         IFNULL((
           SELECT SUM(d.jurd_kredit)
           FROM tjurnalitem d
           WHERE d.jurd_jur_no = b.bon_jur_no
         ), 0)
       )) AS Sisa,
       b.bon_keterangan   AS Keterangan,
       b.bon_jur_no       AS NoBukti,
       IF(b.bon_selesai=0,'Belum','Sudah') AS Selesai,
       IF(IFNULL((
         SELECT h.jur_isclosed FROM tjurnal h WHERE h.jur_no = b.bon_jur_no
       ), 0)=0,'Belum','Sudah') AS Closed
     FROM tkasbon b
     LEFT JOIN trekening r ON r.rek_kode = b.bon_rek_kode
     WHERE b.bon_selesai = 0
     ORDER BY b.bon_tanggal`,
  );
  return rows;
};

module.exports = { getBrowse, deleteData, getBrowsePendingAll };
