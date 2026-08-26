const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");

// ── Browse ────────────────────────────────────────────────────────────
const getBrowse = async (startDate, endDate, cabang) => {
  let sql = `
    SELECT
      h.jur_no          AS Nomor,
      h.jur_tipetransaksi AS Tipe,
      r.rek_nama        AS Account,
      DATE_FORMAT(h.jur_tanggal,'%Y-%m-%d') AS Tanggal,
      h.jur_penerima    AS Penerima,
      h.jur_nota        AS Nota,
      h.jur_keterangan  AS Keterangan,
      IFNULL((
        SELECT SUM(d.jurd_debet) FROM tjurnalitem d WHERE d.jurd_jur_no = h.jur_no
      ), 0) AS Nominal,
      IFNULL(k.bon_nomor,'') AS Kasbon,
      IF(h.jur_close=0,'Belum','Sudah') AS Closed
    FROM tjurnal h
    LEFT JOIN trekening r ON r.rek_kode = h.jur_rek_kode
    LEFT JOIN tkasbon k ON k.bon_jur_no = h.jur_no
    WHERE h.jur_tipetransaksi = 'BKK'
      AND h.jur_otomatis = 0
      AND h.jur_tanggal BETWEEN ? AND ?
  `;
  const params = [startDate, endDate];

  if (cabang && cabang !== "P01" && cabang !== "ALL") {
    sql += ` AND h.jur_cabang = ?`;
    params.push(cabang);
  }
  sql += ` ORDER BY h.jur_no`;

  const [rows] = await db.query(sql, params);
  return rows;
};

// ── Browse Detail ─────────────────────────────────────────────────────
const getBrowseDetail = async (startDate, endDate, cabang) => {
  let sql = `
    SELECT
      d.jurd_jur_no   AS Nomor,
      d.jurd_nourut   AS No,
      d.jurd_uraian   AS Uraian,
      d.jurd_debet    AS Nominal,
      d.jurd_rek_kode AS Account,
      IFNULL(r.rek_nama,'') AS NamaAccount,
      d.jurd_dcnama   AS DetailCC
    FROM tjurnal h
    INNER JOIN tjurnalitem d ON d.jurd_jur_no = h.jur_no
    LEFT JOIN trekening r ON r.rek_kode = d.jurd_rek_kode
    WHERE h.jur_tipetransaksi = 'BKK'
      AND h.jur_otomatis = 0
      AND d.jurd_trs <> ''
      AND h.jur_tanggal BETWEEN ? AND ?
  `;
  const params = [startDate, endDate];

  if (cabang && cabang !== "P01" && cabang !== "ALL") {
    sql += ` AND h.jur_cabang = ?`;
    params.push(cabang);
  }
  sql += ` ORDER BY d.jurd_jur_no, d.jurd_nourut`;

  const [rows] = await db.query(sql, params);
  return rows;
};

// ── Delete ────────────────────────────────────────────────────────────
const deleteData = async (nomor) => {
  // Validasi: cek apakah dari kasbon
  const [[jurnal]] = await db.query(
    `SELECT h.jur_tanggal, h.jur_close, IFNULL(k.bon_nomor,'') AS kasbon
     FROM tjurnal h
     LEFT JOIN tkasbon k ON k.bon_jur_no = h.jur_no
     WHERE h.jur_no = ?`,
    [nomor],
  );
  if (!jurnal) throw new Error("Data tidak ditemukan.");

  // Delphi: BKK dari kasbon tidak bisa dihapus
  if (jurnal.kasbon)
    throw new Error(`BKK terbentuk otomatis dari kasbon. Tidak bisa dihapus.`);

  // Delphi: sudah diclose tidak bisa dihapus
  if (Number(jurnal.jur_close) !== 0)
    throw new Error("Transaksi sudah diclose. Tidak bisa dihapus.");

  // Cek tutup periode
  const tutup = await cekTutupPeriode(jurnal.jur_tanggal);
  if (tutup) throw new Error("Periode sudah ditutup. Tidak bisa dihapus.");

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // Delphi: hapus tjurnal utama
    await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [nomor]);
    // Delphi: hapus jurnal otomatis yang terkait (mid(jur_no,3,18))
    await conn.query(
      `DELETE FROM tjurnal WHERE jur_otomatis = 1 AND MID(jur_no,3,18) = ?`,
      [nomor],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = { getBrowse, getBrowseDetail, deleteData };
