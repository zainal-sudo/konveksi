const db = require("../../config/database");

const getAll = async () => {
  const [rows] = await db.query(
    `SELECT r.REK_KODE AS kode, r.REK_NAMA AS nama, r.REK_KOL_ID AS kelompokId, 
            k.kol_nama AS kelompokNama, r.REK_ISAKTIF AS isAktif, r.rek_urutan AS urutan
     FROM trekening r
     LEFT JOIN tkelompok k ON r.REK_KOL_ID = k.kol_id
     ORDER BY r.REK_KODE`
  );
  return rows;
};

const getById = async (kode) => {
  const [[row]] = await db.query(
    `SELECT REK_KODE AS kode, REK_NAMA AS nama, REK_KOL_ID AS kelompokId, 
            REK_ISAKTIF AS isAktif, rek_urutan AS urutan
     FROM trekening WHERE REK_KODE = ?`,
    [kode]
  );
  if (!row) throw new Error("Rekening tidak ditemukan.");
  return row;
};

const saveData = async (payload) => {
  const { isEdit, kode, nama, kelompokId, isAktif, urutan } = payload;

  if (isEdit) {
    await db.query(
      `UPDATE trekening 
       SET REK_NAMA = ?, REK_KOL_ID = ?, REK_ISAKTIF = ?, rek_urutan = ? 
       WHERE REK_KODE = ?`,
      [nama, kelompokId, isAktif ? 1 : 0, urutan || 0, kode]
    );
  } else {
    const [[cek]] = await db.query(
      `SELECT COUNT(*) AS c FROM trekening WHERE REK_KODE = ?`,
      [kode]
    );
    if (cek.c > 0) throw new Error(`Kode rekening "${kode}" sudah ada.`);

    await db.query(
      `INSERT INTO trekening (REK_KODE, REK_NAMA, REK_KOL_ID, REK_ISAKTIF, rek_urutan) 
       VALUES (?, ?, ?, ?, ?)`,
      [kode, nama, kelompokId, isAktif ? 1 : 0, urutan || 0]
    );
  }
  return { kode };
};

const deleteData = async (kode) => {
  await db.query(`DELETE FROM trekening WHERE REK_KODE = ?`, [kode]);
  return true;
};

module.exports = {
  getAll,
  getById,
  saveData,
  deleteData
};