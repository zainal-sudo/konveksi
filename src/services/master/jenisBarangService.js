const db = require("../../config/database");

const SELECT_BASE = `
  SELECT
    g.gr_kode      AS kode,
    g.gr_nama      AS nama,
    g.gr_rek_kode  AS rekKode,
    r.REK_NAMA     AS rekNama
  FROM tgroup g
  LEFT JOIN trekening r ON r.REK_KODE = g.gr_rek_kode
`;

const getAll = async () => {
  const [rows] = await db.query(`${SELECT_BASE} ORDER BY g.gr_kode`);
  return rows;
};

const getById = async (kode) => {
  const [[row]] = await db.query(`${SELECT_BASE} WHERE g.gr_kode = ?`, [kode]);
  if (!row) throw new Error("Jenis Barang tidak ditemukan.");
  return row;
};

const getNextKode = async (conn) => {
  const [[row]] = await conn.query(`SELECT MAX(gr_kode) AS maxKode FROM tgroup FOR UPDATE`);
  return (row.maxKode || 0) + 1;
};

const saveData = async (payload) => {
  const { isEdit, kode, nama, rekKode } = payload;

  if (!nama || !nama.trim()) throw new Error("Nama jenis barang wajib diisi.");
  if (!rekKode) throw new Error("Rekening wajib dipilih.");

  const [[rek]] = await db.query(`SELECT REK_KODE FROM trekening WHERE REK_KODE = ?`, [rekKode]);
  if (!rek) throw new Error("Rekening yang dipilih tidak valid.");

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (isEdit) {
      if (!kode) throw new Error("Kode jenis barang tidak valid.");

      const [[existing]] = await conn.query(`SELECT gr_kode FROM tgroup WHERE gr_kode = ?`, [kode]);
      if (!existing) throw new Error("Jenis Barang tidak ditemukan.");

      await conn.query(
        `UPDATE tgroup SET gr_nama = ?, gr_rek_kode = ? WHERE gr_kode = ?`,
        [nama.trim(), rekKode, kode]
      );

      await conn.commit();
      return { kode };
    }

    const newKode = await getNextKode(conn);
    await conn.query(
      `INSERT INTO tgroup (gr_kode, gr_nama, gr_rek_kode) VALUES (?, ?, ?)`,
      [newKode, nama.trim(), rekKode]
    );

    await conn.commit();
    return { kode: newKode };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

const deleteData = async (kode) => {
  const [[cek]] = await db.query(`SELECT COUNT(*) AS c FROM tbarang WHERE brg_gr_kode = ?`, [kode]);
  if (cek.c > 0) throw new Error("Jenis Barang ini masih dipakai di data Barang. Tidak bisa dihapus.");
  await db.query(`DELETE FROM tgroup WHERE gr_kode = ?`, [kode]);
};

module.exports = { getAll, getById, saveData, deleteData };