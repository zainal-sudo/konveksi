const db = require("../../config/database");

const getAll = async () => {
  const [rows] = await db.query(`SELECT cbg_kode AS kode, cbg_nama AS nama, cbg_alamat AS alamat, cbg_kota AS kota, cbg_rek_persediaan AS rekPersediaan FROM tcabang ORDER BY cbg_kode`);
  return rows;
};

const saveData = async (payload) => {
  const { isEdit, kode, nama, alamat, kota, rekPersediaan } = payload;
  const rek = String(rekPersediaan || "").trim() || null;
  if (isEdit) {
    await db.query(`UPDATE tcabang SET cbg_nama = ?, cbg_alamat = ?, cbg_kota = ?, cbg_rek_persediaan = ? WHERE cbg_kode = ?`,
      [nama, alamat, kota, rek, kode]);
  } else {
    await db.query(`INSERT INTO tcabang (cbg_kode, cbg_nama, cbg_alamat, cbg_kota, cbg_rek_persediaan) VALUES (?, ?, ?, ?, ?)`,
      [kode, nama, alamat, kota, rek]);
  }
  return { kode };
};

const deleteData = async (kode) => {
  await db.query(`DELETE FROM tcabang WHERE cbg_kode = ?`, [kode]);
};

module.exports = { getAll, saveData, deleteData };