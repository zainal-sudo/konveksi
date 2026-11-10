const db = require("../../config/database");

const getAll = async () => {
  const [rows] = await db.query(
    `SELECT cbg_kode AS kode, cbg_nama AS nama, cbg_alamat AS alamat, cbg_kota AS kota,
            cbg_headerNama AS headerNama,
            cbg_headerAlamat AS headerAlamat,
            cbg_headerTelp AS headerTelp,
            cbg_rek_persediaan AS rekPersediaan,
            cbg_rek_kas AS rekKas,
            cbg_rek_penjualan AS rekPenjualan,
            cbg_rek_piutang AS rekPiutang,
            cbg_rek_umpenjualan AS rekUmPenjualan
        FROM tcabang ORDER BY cbg_kode`
  );
  return rows;
};

const saveData = async (payload) => {
  const {
    isEdit, kode, nama, alamat, kota,
    headerNama, headerAlamat, headerTelp,
    rekPersediaan, rekKas, rekPenjualan, rekPiutang, rekUmPenjualan,
  } = payload;
  const rek = String(rekPersediaan || "").trim() || null;
  const rekKasVal = String(rekKas || "").trim() || null;
  const rekPenjVal = String(rekPenjualan || "").trim() || null;
  const rekPiuVal = String(rekPiutang || "").trim() || null;
  const rekUmVal = String(rekUmPenjualan || "").trim() || null;
  const hdrNama = String(headerNama || "").trim() || null;
  const hdrAlamat = String(headerAlamat || "").trim() || null;
  const hdrTelp = String(headerTelp || "").trim() || null;
  if (isEdit) {
    await db.query(
      `UPDATE tcabang
          SET cbg_nama = ?, cbg_alamat = ?, cbg_kota = ?,
              cbg_headerNama = ?, cbg_headerAlamat = ?, cbg_headerTelp = ?,
              cbg_rek_persediaan = ?, cbg_rek_kas = ?,
              cbg_rek_penjualan = ?, cbg_rek_piutang = ?, cbg_rek_umpenjualan = ?
        WHERE cbg_kode = ?`,
      [nama, alamat, kota, hdrNama, hdrAlamat, hdrTelp,
       rek, rekKasVal, rekPenjVal, rekPiuVal, rekUmVal, kode]
    );
  } else {
    await db.query(
      `INSERT INTO tcabang
         (cbg_kode, cbg_nama, cbg_alamat, cbg_kota,
          cbg_headerNama, cbg_headerAlamat, cbg_headerTelp,
          cbg_rek_persediaan, cbg_rek_kas, cbg_rek_penjualan, cbg_rek_piutang, cbg_rek_umpenjualan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [kode, nama, alamat, kota, hdrNama, hdrAlamat, hdrTelp,
       rek, rekKasVal, rekPenjVal, rekPiuVal, rekUmVal]
    );
  }
  return { kode };
};

const deleteData = async (kode) => {
  await db.query(`DELETE FROM tcabang WHERE cbg_kode = ?`, [kode]);
};

module.exports = { getAll, saveData, deleteData };
