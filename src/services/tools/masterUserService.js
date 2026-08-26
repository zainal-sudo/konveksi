const db = require("../../config/database");

const getBrowse = async () => {
  const [rows] = await db.query(
    `SELECT
       u.user_kode                              AS Kode,
       u.user_nama                              AS Nama,
       c.cbg_nama                            AS Cabang,
       IF(u.user_aktif = 0, 'YA', 'TIDAK')     AS Aktif
     FROM tuser u
     LEFT JOIN tcabang c ON u.user_cabang = c.cbg_kode
     ORDER BY u.user_nama`,
  );
  return rows;
};
const deleteUser = async (kode) => {
  await db.query(`DELETE FROM thakuser WHERE hak_user_kode = ?`, [kode]);
  const [result] = await db.query(`DELETE FROM tuser WHERE user_kode = ?`, [
    kode,
  ]);
  if (result.affectedRows === 0) throw new Error("User tidak ditemukan.");
  return { kode };
};

module.exports = { getBrowse, deleteUser };
