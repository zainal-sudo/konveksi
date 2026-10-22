const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");

// ── Browse ────────────────────────────────────────────────────────────
const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `
    SELECT
      h.jur_no           AS Nomor,
      h.jur_tipetransaksi AS Tipe,
      DATE_FORMAT(h.jur_tanggal,'%Y-%m-%d') AS Tanggal,
      IFNULL((
        SELECT SUM(d.jurd_debet) FROM tjurnalitem d WHERE d.jurd_jur_no = h.jur_no
      ), 0) AS Debet,
      IFNULL((
        SELECT SUM(d.jurd_kredit) FROM tjurnalitem d WHERE d.jurd_jur_no = h.jur_no
      ), 0) AS Kredit,
      h.jur_keterangan   AS Keterangan,
      IF(h.jur_isclosed=0,'Belum','Sudah') AS Closed
    FROM tjurnal h

    WHERE h.jur_tipetransaksi = 'JUR'
      AND h.jur_tanggal BETWEEN ? AND ?
    ORDER BY h.jur_no
  `,
    [startDate, endDate],
  );
  return rows;
};

// ── Browse Detail ─────────────────────────────────────────────────────
const getBrowseDetail = async (startDate, endDate) => {
  const [rows] = await db.query(
    `
    SELECT
      d.jurd_jur_no   AS Nomor,
      d.jurd_rek_kode AS Account,
      IFNULL(r.rek_nama,'') AS NamaAccount,
      d.jurd_cc_kode   AS DetailCC,
      d.jurd_debet    AS Debet,
      d.jurd_kredit   AS Kredit,
      d.jurd_keterangan   AS Uraian
    FROM tjurnal h
    LEFT JOIN tjurnalitem d ON d.jurd_jur_no = h.jur_no
    LEFT JOIN trekening r ON r.rek_kode = d.jurd_rek_kode
    WHERE h.jur_tipetransaksi = 'JUR'
      AND h.jur_tanggal BETWEEN ? AND ?
    ORDER BY d.jurd_jur_no, d.jurd_nourut
  `,
    [startDate, endDate],
  );
  return rows;
};

// ── Delete ────────────────────────────────────────────────────────────
const deleteData = async (nomor) => {
  const [[jurnal]] = await db.query(
    `
    SELECT jur_tanggal, jur_isclosed
    FROM tjurnal WHERE jur_no = ?
  `,
    [nomor],
  );

  if (!jurnal) throw new Error("Data tidak ditemukan.");

  // Delphi: sudah diclose tidak bisa dihapus
  if (Number(jurnal.jur_isclosed) !== 0)
    throw new Error("Transaksi sudah diclose. Tidak bisa dihapus.");

  // Cek tutup periode
  const tutup = await cekTutupPeriode(jurnal.jur_tanggal);
  if (tutup) throw new Error("Periode sudah ditutup. Tidak bisa dihapus.");

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // Delphi: hanya delete tjurnal utama, tidak ada delete jurnal otomatis
    await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [nomor]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

// ── Data cetak Jurnal Umum (paritas JURNALUMUM.fr3 di web bsmcabang) ──
const getPrintData = async (nomor) => {
  const [headers] = await db.query(
    `
    SELECT
      a.jur_no           AS nomor,
      DATE_FORMAT(a.jur_tanggal, '%d/%m/%Y') AS tanggal,
      IFNULL(a.jur_keterangan, '') AS keterangan,
      r.rek_nama         AS rekkredit,
      (SELECT SUM(jurd_kredit) FROM tjurnalitem WHERE jurd_jur_no = a.jur_no) AS kredit,
      terbilang((SELECT SUM(jurd_kredit) FROM tjurnalitem WHERE jurd_jur_no = a.jur_no)) AS bilang
    FROM tjurnal a
    INNER JOIN tjurnalitem b ON a.jur_no = b.jurd_jur_no
    INNER JOIN trekening r ON r.rek_kode = b.jurd_rek_kode
    WHERE a.jur_tipetransaksi = 'JUR'
      AND a.jur_no = ?
      AND b.jurd_debet > 0
    LIMIT 1
  `,
    [nomor],
  );

  if (headers.length === 0) throw new Error("Data tidak ditemukan.");
  const h = headers[0];

  const [detail] = await db.query(
    `
    SELECT
      b.jurd_rek_kode AS account,
      r.rek_nama      AS accountName,
      b.jurd_debet    AS debet,
      IFNULL(d.cc_nama, '') AS costCenter
    FROM tjurnalitem b
    INNER JOIN trekening r ON r.rek_kode = b.jurd_rek_kode
    LEFT JOIN tcostcenter d ON d.cc_kode = b.jurd_cc_kode
    WHERE b.jurd_jur_no = ?
      AND b.jurd_debet > 0
    ORDER BY b.jurd_nourut
  `,
    [nomor],
  );

  const [[perusahaan]] = await db.query(
    `SELECT perush_nama AS nama, perush_alamat AS alamat, perush_kota AS kota, perush_notelp AS notelp
     FROM tperusahaan LIMIT 1`,
  );

  return {
    nomor: h.nomor,
    tanggal: h.tanggal,
    keterangan: h.keterangan,
    rekkredit: h.rekkredit,
    kredit: Number(h.kredit || 0),
    terbilang: h.bilang || "",
    perusahaan: perusahaan || { nama: "", alamat: "", kota: "", notelp: "" },
    detail,
  };
};

module.exports = { getBrowse, getBrowseDetail, deleteData, getPrintData };
