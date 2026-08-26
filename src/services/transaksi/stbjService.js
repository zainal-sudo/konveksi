const db = require("../../config/database");

const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       h.stbj_nomor    AS Nomor,
       DATE_FORMAT(h.stbj_tanggal, '%Y-%m-%d') AS Tanggal,
       g.gdg_nama      AS Gudang,
       gp.gdg_nama    AS GudangBagian,
       h.stbj_keterangan AS Memo,
       COUNT(d.stbjd_brg_kode) AS JumlahItem
     FROM tstbj_hdr h
     LEFT JOIN tgudang g ON h.stbj_gdg_kode = g.gdg_kode
     LEFT JOIN tgudang gp ON h.stbj_gdgp_kode = gp.gdg_kode
     LEFT JOIN tstbj_dtl d ON h.stbj_nomor = d.stbjd_stbj_nomor
     WHERE h.stbj_tanggal BETWEEN ? AND ?
     GROUP BY h.stbj_nomor, h.stbj_tanggal, g.gdg_nama, gp.gdg_nama, h.stbj_keterangan
     ORDER BY h.stbj_nomor DESC`,
    [startDate, endDate]
  );
  return rows;
};

const getDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
       d.stbjd_brg_kode     AS Barcode,
       b.brg_nama           AS NamaBarang,
       d.stbjd_jumlah       AS Jumlah,
       d.stbjd_koli         AS Koli,
       d.stbjd_keterangan   AS Keterangan
     FROM tstbj_dtl d
     LEFT JOIN tbarang b ON d.stbjd_brg_kode = b.brg_kode
     WHERE d.stbjd_stbj_nomor = ?
     ORDER BY d.stbjd_stbj_nomor ASC`,
    [nomor]
  );
  return rows;
};

const deleteData = async (nomor) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    // Hapus detail lalu header (tambahkan logika stok/rollback jika diperlukan di sini)
    await conn.query(`DELETE FROM tstbj_dtl WHERE stbjd_stbj_nomor = ?`, [nomor]);
    await conn.query(`DELETE FROM tstbj_hdr WHERE stbj_nomor = ?`, [nomor]);

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = { getBrowse, getDetail, deleteData };