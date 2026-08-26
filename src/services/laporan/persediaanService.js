const db = require("../../config/database"); // Sesuaikan path database Anda

const getLaporanPersediaan = async (gdgKode = "") => {
  let query = `
    SELECT 
      gdg_kode,
      gdg_nama,
      brg_kode,
      brg_nama,
      brg_satuan,
      SUM(mst_stok_in - mst_stok_out) AS stok,
      SUM((mst_stok_in - mst_stok_out) * mst_avgcost) AS nilai
    FROM tbarang 
    INNER JOIN tmasterstok ON mst_brg_kode = brg_kode
    INNER JOIN tgudang ON gdg_kode = mst_gdg_kode
  `;
  
  const params = [];
  if (gdgKode) {
    query += ` WHERE mst_gdg_kode = ?`;
    params.push(gdgKode);
  }

  query += ` GROUP BY mst_gdg_kode, brg_kode, gdg_nama, brg_nama, brg_satuan ORDER BY gdg_nama, brg_nama`;

  const [rows] = await db.query(query, params);
  return rows;
};

module.exports = { getLaporanPersediaan };