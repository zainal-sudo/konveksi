const db = require("../../config/database");

const getAll = async () => {
  const [rows] = await db.query(`SELECT cbg_kode AS kode, cbg_nama AS nama, cbg_alamat AS alamat, cbg_kota AS kota FROM tcabang ORDER BY cbg_kode`);
  return rows;
};

const saveData = async (payload) => {
  const { isEdit, kode, nama, alamat, kota } = payload;
  if (isEdit) {
    await db.query(`UPDATE tcabang SET cbg_nama = ?, cbg_alamat = ?, cbg_kota = ? WHERE cbg_kode = ?`, 
      [nama, alamat, kota, kode]);
  } else {
    await db.query(`INSERT INTO tcabang (cbg_kode, cbg_nama, cbg_alamat, cbg_kota) VALUES (?, ?, ?, ?)`, 
      [kode, nama, alamat, kota]);
  }
  return { kode };
};

const deleteData = async (kode) => {
  await db.query(`DELETE FROM tcabang WHERE cbg_kode = ?`, [kode]);
};

module.exports = { getAll, saveData, deleteData };