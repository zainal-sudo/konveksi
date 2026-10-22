const db = require("../../config/database");

const getAll = async () => {
  const [rows] = await db.query(
    `SELECT g.gdg_kode AS kode, g.gdg_nama AS nama, g.gdg_penanggungjawab AS penanggungjawab,
            g.gdg_keterangan AS keterangan, g.gdg_cbg_kode AS cabang,
            c.cbg_nama AS cabangNama
       FROM tgudang g
       LEFT JOIN tcabang c ON c.cbg_kode = g.gdg_cbg_kode
      ORDER BY g.gdg_kode`
  );
  return rows;
};

const getCabang = async () => {
  const [rows] = await db.query(
    `SELECT cbg_kode AS kode, cbg_nama AS nama FROM tcabang ORDER BY cbg_kode`
  );
  return rows;
};

const saveData = async (payload) => {
  const { isEdit, kode, nama, penanggungjawab, keterangan, cabang } = payload;
  const cbg = (cabang || "00").toUpperCase().slice(0, 2);
  // Cabang wajib terdaftar
  const [[cab]] = await db.query(`SELECT cbg_kode FROM tcabang WHERE cbg_kode = ?`, [cbg]);
  if (!cab) throw new Error(`Cabang '${cbg}' tidak terdaftar di master cabang.`);

  if (isEdit) {
    // Cegah pindah cabang bila gudang masih menyimpan stok
    const [[pakai]] = await db.query(
      `SELECT 1 AS x FROM tmasterstok WHERE mst_gdg_kode = ? LIMIT 1`, [kode]
    );
    const [[lama]] = await db.query(
      `SELECT gdg_cbg_kode AS c FROM tgudang WHERE gdg_kode = ?`, [kode]
    );
    if (lama && (lama.c || "00") !== cbg && pakai) {
      throw new Error("Gudang masih memiliki stok, cabang tidak boleh diubah.");
    }

    await db.query(
      `UPDATE tgudang
          SET gdg_nama = ?, gdg_penanggungjawab = ?, gdg_keterangan = ?, gdg_cbg_kode = ?
        WHERE gdg_kode = ?`,
      [nama, penanggungjawab, keterangan, cbg, kode]
    );
  } else {
    const [[dupe]] = await db.query(
      `SELECT 1 AS x FROM tgudang WHERE gdg_kode = ?`, [kode]
    );
    if (dupe) throw new Error(`Kode gudang '${kode}' sudah ada.`);
    await db.query(
      `INSERT INTO tgudang (gdg_kode, gdg_nama, gdg_penanggungjawab, gdg_keterangan, gdg_cbg_kode)
       VALUES (?, ?, ?, ?, ?)`,
      [kode, nama, penanggungjawab, keterangan, cbg]
    );
  }
  return { kode };
};

const deleteData = async (kode) => {
  // Gudang yang masih menyimpan stok tidak boleh dihapus
  const [[pakai]] = await db.query(
    `SELECT 1 AS x FROM tmasterstok WHERE mst_gdg_kode = ? LIMIT 1`, [kode]
  );
  if (pakai) throw new Error("Gudang masih memiliki stok, tidak dapat dihapus.");
  await db.query(`DELETE FROM tgudang WHERE gdg_kode = ?`, [kode]);
};

module.exports = { getAll, getCabang, saveData, deleteData };
