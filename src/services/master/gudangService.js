const db = require("../../config/database");

const getAll = async () => {
  const [rows] = await db.query(`SELECT gdg_kode AS kode, gdg_nama AS nama, gdg_penanggungjawab AS penanggungjawab, gdg_keterangan AS keterangan FROM tgudang ORDER BY gdg_kode`);
  return rows;
};

const saveData = async (payload) => {
  const { isEdit, kode, nama, penanggungjawab, keterangan } = payload;
  if (isEdit) {
    await db.query(`UPDATE tgudang SET gdg_nama = ?, gdg_penanggungjawab = ?, gdg_keterangan = ? WHERE gdg_kode = ?`, 
      [nama, penanggungjawab, keterangan, kode]);
  } else {
    await db.query(`INSERT INTO tgudang (gdg_kode, gdg_nama, gdg_penanggungjawab, gdg_keterangan) VALUES (?, ?, ?, ?)`, 
      [kode, nama, penanggungjawab, keterangan]);
  }
  return { kode };
};

const deleteData = async (kode) => {
  await db.query(`DELETE FROM tgudang WHERE gdg_kode = ?`, [kode]);
};

module.exports = { getAll, saveData, deleteData };