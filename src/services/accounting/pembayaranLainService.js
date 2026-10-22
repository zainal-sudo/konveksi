const db = require("../../config/database");

/**
 * Browse Pembayaran Lain-Lain — sesuai SQLMaster Delphi
 */
const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       j.jur_no AS Nomor,
       DATE_FORMAT(j.jur_tanggal, '%Y-%m-%d') AS Tanggal,
       IFNULL(j.jur_keterangan, '') AS Keterangan,
       IF(j.jur_isclosed = 1, 'Sudah', 'Belum') AS IsClosed,
       SUM(d.jurd_debet) AS Nilai
      FROM tjurnal j
      INNER JOIN tjurnalitem d ON d.jurd_jur_no = j.jur_no
      WHERE j.jur_tipetransaksi = 'Pembayaran Lain'
        AND j.jur_tanggal BETWEEN ? AND ?
      GROUP BY j.jur_no
      ORDER BY j.jur_no`,
    [startDate, endDate]
  );
  return rows;
};

/**
 * Browse Detail Pembayaran Lain-Lain — sesuai SQLDetail Delphi
 */
const getBrowseDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
       j.jur_no AS Nomor,
       d.jurd_rek_kode AS Account,
       r.rek_nama AS AccountName,
       d.jurd_debet AS Debet,
       d.jurd_kredit AS Kredit,
       IFNULL(d.jurd_keterangan, '') AS Keterangan,
       IFNULL(c.cc_nama, '') AS CostCenter
     FROM tjurnal j
     INNER JOIN tjurnalitem d ON j.jur_no = d.jurd_jur_no
     INNER JOIN trekening r ON r.rek_kode = d.jurd_rek_kode
     LEFT JOIN tcostcenter c ON c.cc_kode = d.jurd_cc_kode
     WHERE j.jur_no = ?
     ORDER BY j.jur_no, d.jurd_nourut`,
    [nomor]
  );
  return rows;
};

// ── Hapus ─────────────────────────────────────────────────────────────
const deleteData = async (nomor) => {
  const [[header]] = await db.query(
    `SELECT jur_no FROM tjurnal WHERE jur_no = ?`, [nomor]
  );
  if (!header) throw new Error("Data tidak ditemukan.");

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [nomor]);
    await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [nomor]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; }
  finally { conn.release(); }
};

// ── Data cetak Pembayaran Lain (paritas doslipmutasi + report pembayaranlain.fr3) ──
// Cetak via browser (A5), BUKAN dot matrix. Tanpa tabel "tampung" (mekanisme FastReport).
// Kebalikan Penerimaan Lain: header kredit (kas/bank), detail debet (biaya).
const getPrintData = async (nomor) => {
  const [[header]] = await db.query(
    `
    SELECT
      j.jur_no AS nomor,
      DATE_FORMAT(j.jur_tanggal, '%m/%d/%Y') AS tanggal,
      IFNULL(j.jur_keterangan, '') AS keterangan,
      (SELECT r.rek_nama FROM tjurnalitem a
       INNER JOIN trekening r ON r.rek_kode = a.jurd_rek_kode
       WHERE a.jurd_jur_no = j.jur_no AND a.jurd_kredit > 0 LIMIT 1) AS rekkredit,
      (SELECT SUM(a.jurd_kredit) FROM tjurnalitem a WHERE a.jurd_jur_no = j.jur_no) AS kredit,
      terbilang((SELECT SUM(a.jurd_kredit) FROM tjurnalitem a WHERE a.jurd_jur_no = j.jur_no)) AS terbilang
    FROM tjurnal j
    WHERE j.jur_no = ?
    LIMIT 1
    `,
    [nomor]
  );
  if (!header) throw new Error("Data tidak ditemukan.");

  const [detail] = await db.query(
    `
    SELECT
      b.jurd_rek_kode AS account,
      IFNULL(r.rek_nama, '') AS accountName,
      b.jurd_debet AS debet,
      IFNULL(c.cc_nama, '') AS costCenter
    FROM tjurnalitem b
    INNER JOIN trekening r ON r.rek_kode = b.jurd_rek_kode
    LEFT JOIN tcostcenter c ON c.cc_kode = b.jurd_cc_kode
    WHERE b.jurd_jur_no = ?
      AND b.jurd_debet > 0
    ORDER BY b.jurd_nourut
    `,
    [nomor]
  );

  const [[perusahaan]] = await db.query(
    `SELECT perush_nama, perush_alamat, perush_kota, perush_notelp FROM tperusahaan LIMIT 1`
  );

  return {
    nomor: header.nomor,
    tanggal: header.tanggal,
    keterangan: header.keterangan,
    rekkredit: header.rekkredit || "",
    kredit: Number(header.kredit) || 0,
    terbilang: header.terbilang || "",
    perusahaan: perusahaan ? {
      nama: perusahaan.perush_nama,
      alamat: perusahaan.perush_alamat,
      kota: perusahaan.perush_kota,
      notelp: perusahaan.perush_notelp,
    } : { nama: "", alamat: "", kota: "", notelp: "" },
    detail: detail.map((d) => ({
      account: d.account,
      accountName: d.accountName,
      debet: Number(d.debet) || 0,
      costCenter: d.costCenter,
    })),
  };
};

module.exports = { getBrowse, getBrowseDetail, deleteData, getPrintData };