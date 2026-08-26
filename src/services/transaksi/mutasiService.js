const db = require("../../config/database");

const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
       h.mut_nomor      AS Nomor,
       DATE_FORMAT(h.mut_tanggal, '%Y-%m-%d') AS Tanggal,
       g1.gdg_nama      AS GudangAsal,
       g2.gdg_nama      AS GudangTujuan,
       h.mut_keterangan AS Memo,
       mut_status_realisasi as Status,
       COUNT(d.mutd_brg_kode) AS JumlahItem
     FROM tmutasi_hdr h
     LEFT JOIN tgudang g1 ON h.mut_gdg_asal = g1.gdg_kode
     LEFT JOIN tgudang g2 ON h.mut_gdg_tujuan = g2.gdg_kode
     LEFT JOIN tmutasi_dtl d ON h.mut_nomor = d.mutd_mut_nomor
     WHERE h.mut_tanggal BETWEEN ? AND ?
     GROUP BY h.mut_nomor, h.mut_tanggal, g1.gdg_nama, g2.gdg_nama, h.mut_keterangan
     ORDER BY h.mut_nomor DESC`,
    [startDate, endDate]
  );
  return rows;
};

const getDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
       d.mutd_brg_kode     AS Barcode,
       b.brg_nama           AS NamaBarang,
       d.mutd_qty           AS Qty,
       d.mutd_expired       AS Expired,
       d.mutd_keterangan    AS Keterangan
     FROM tmutasi_dtl d
     LEFT JOIN tbarang b ON d.mutd_brg_kode = b.brg_kode
     WHERE d.mutd_mut_nomor = ?
     ORDER BY d.mutd_nourut ASC`,
    [nomor]
  );
  return rows;
};

const deleteData = async (nomor) => {
  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(`DELETE FROM tmutasi_dtl WHERE mutd_mut_nomor = ?`, [nomor]);
    await conn.query(`DELETE FROM tmutasi_hdr WHERE mut_nomor = ?`, [nomor]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};
const realisasiData = async (nomor, user) => {
  const [result] = await db.query(
    `UPDATE tmutasi_hdr SET mut_status_realisasi = 1, user_modified = ? WHERE mut_nomor = ? AND mut_status_realisasi = 0`,
    [user?.username || "ADMIN", nomor]
  );
  if (result.affectedRows === 0) {
    throw new Error("Mutasi sudah direalisasi atau tidak ditemukan.");
  }
  return true;
};
module.exports = { getBrowse, getDetail, deleteData ,realisasiData};