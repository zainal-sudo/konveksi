const db = require("../../config/database");

const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT 
      h.ret_nomor AS Nomor,
      DATE_FORMAT(h.ret_tanggal, '%Y-%m-%d') AS Tanggal,
      h.ret_inv_nomor AS NomorInvoice,
      s.sup_nama AS Supplier,
      h.ret_memo AS Memo,
      IF(h.ret_istax=1, 'Ya', 'Tidak') AS Pajak,
      h.ret_amount AS Total,
      IFNULL(i.inv_bayar, 0) AS InvoiceSudahDibayar,
      IFNULL(retAll.totalRetur, 0) AS InvoiceTotalRetur
     FROM tret_hdr h
     LEFT JOIN tsupplier s ON h.ret_sup_kode = s.sup_kode
     LEFT JOIN tinv_hdr i ON h.ret_inv_nomor = i.inv_nomor
     LEFT JOIN (
       SELECT ret_inv_nomor, SUM(ret_amount) AS totalRetur
       FROM tret_hdr GROUP BY ret_inv_nomor
     ) retAll ON retAll.ret_inv_nomor = h.ret_inv_nomor
     WHERE h.ret_tanggal BETWEEN ? AND ?
     ORDER BY h.ret_nomor DESC`,
    [startDate, endDate]
  );
  return rows;
};

const getBrowseDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT 
      d.retd_ret_nomor AS Nomor,
      d.retd_nourut AS NoUrut,
      b.brg_nama AS NamaBarang,
      d.retd_brg_satuan AS Satuan,
      d.retd_qty AS Qty,
      d.retd_harga AS Harga,
      d.retd_discpr AS DiscPr,
      ((d.retd_qty * d.retd_harga) * (1 - (IFNULL(d.retd_discpr, 0) / 100))) AS Subtotal
     FROM tret_dtl d
     LEFT JOIN tret_hdr h ON d.retd_ret_nomor = h.ret_nomor
     LEFT JOIN tbarang b ON d.retd_brg_kode = b.brg_kode
     WHERE d.retd_ret_nomor = ?
     ORDER BY d.retd_nourut ASC`,
    [nomor]
  );
  return rows;
};

const deleteData = async (nomor) => {
  const [[retur]] = await db.query(`SELECT ret_nomor FROM tret_hdr WHERE ret_nomor = ?`, [nomor]);
  if (!retur) throw new Error("Data Retur tidak ditemukan.");

  const conn = await db.getConnection();
  await conn.beginTransaction();
  try {
    await conn.query(`DELETE FROM tret_dtl WHERE retd_ret_nomor = ?`, [nomor]);
    await conn.query(`DELETE FROM tret_hdr WHERE ret_nomor = ?`, [nomor]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
};

module.exports = { getBrowse, getBrowseDetail, deleteData };