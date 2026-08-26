const db = require("../../config/database");
const detailSvc = require("./spkDetailService");

const getBrowse = async (startDate, endDate) => {
  const [rows] = await db.query(
    `SELECT
      h.spk_nomor        AS Nomor,
      h.spk_nama         AS Nama,
      DATE_FORMAT(h.spk_tanggal, '%Y-%m-%d')  AS Tanggal,
      DATE_FORMAT(h.spk_dateline, '%Y-%m-%d') AS DateLine,
      b.brg_nama         AS Barang,
      c.cus_nama         AS Customer,
      h.spk_idbatch       AS IdBatch,
      h.spk_jumlah        AS Jumlah,
      h.spk_jumlah_jadi    AS JumlahJadi,
      h.spk_jumlah_kirim   AS JumlahKirim
     FROM tspk h
     LEFT JOIN tbarang b ON h.spk_brg_kode = b.brg_kode
     LEFT JOIN tcustomer c ON h.spk_cus_kode = c.cus_kode
     WHERE h.spk_tanggal BETWEEN ? AND ?
     ORDER BY h.spk_nomor DESC`,
    [startDate, endDate]
  );
  return rows;
};

const getBrowseDetail = async (nomor) => {
  const cleanNomor = String(nomor || "").trim();
  const [[row]] = await db.query(
    `SELECT
       h.spk_nomor      AS Nomor,
       h.spk_keterangan AS Keterangan,
       h.spk_harga      AS Harga,
       b.brg_satuan     AS Satuan
     FROM tspk h
     LEFT JOIN tbarang b ON h.spk_brg_kode = b.brg_kode
     WHERE TRIM(h.spk_nomor) = TRIM(?)`,
    [cleanNomor]
  );
  return row || null;
};

const deleteData = async (nomor) => {
  const [[spk]] = await db.query(`SELECT spk_nomor FROM tspk WHERE spk_nomor = ?`, [nomor]);
  if (!spk) throw new Error("Data SPK tidak ditemukan.");
  await detailSvc.deleteDetailBySpk(nomor);
  await db.query(`DELETE FROM tspk WHERE spk_nomor = ?`, [nomor]);
};

module.exports = { getBrowse, getBrowseDetail, deleteData };