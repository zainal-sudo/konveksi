const db = require("../../config/database");

/**
 * Browse Mutasi Cabang Out (paritas lama bsmcabang, satu DB sentral).
 * - User cabang: hanya data mutasi cabangnya sendiri (asal).
 * - Pusat ('00'): boleh filter per cabang (param cab) atau lihat semua.
 */
const getBrowse = async (startDate, endDate, cabang) => {
  const params = [startDate, endDate];
  let where = "WHERE a.mutc_tanggal BETWEEN ? AND ?";
  if (cabang && cabang !== "ALL") {
    where += " AND a.mutc_cbg_asal = ?";
    params.push(cabang);
  }

  const [rows] = await db.query(
    `SELECT
       a.mutc_nomor AS Nomor,
       DATE_FORMAT(a.mutc_tanggal, '%Y-%m-%d') AS Tanggal,
       c.cbg_nama AS Asal,
       b.cbg_nama AS Tujuan,
       d.gdg_nama AS Gudang,
       IFNULL(a.mutc_keterangan, '') AS Keterangan,
       IF(a.mutc_status = 1, 'Sudah Diterima', 'Belum') AS Realisasi
     FROM tmutcab_hdr a
     INNER JOIN tcabang b ON b.cbg_kode = a.mutc_cbg_tujuan
     INNER JOIN tcabang c ON c.cbg_kode = a.mutc_cbg_asal
     INNER JOIN tgudang d ON d.gdg_kode = a.mutc_gdg_kode
     ${where}
     GROUP BY a.mutc_nomor, a.mutc_tanggal, a.mutc_keterangan
     ORDER BY a.mutc_nomor DESC`,
    params
  );
  return rows;
};

const getBrowseDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
       h.mutc_nomor AS Nomor,
       d.mutcd_brg_kode AS Kode,
       b.brg_nama AS Nama,
       d.mutcd_qty AS Jumlah,
       DATE_FORMAT(d.mutcd_expired, '%Y-%m-%d') AS Expired,
       IFNULL(d.mutcd_keterangan, '') AS Keterangan,
       g.gdg_nama AS Gudang
     FROM tmutcab_dtl d
     INNER JOIN tmutcab_hdr h ON h.mutc_nomor = d.mutcd_mutc_nomor
     INNER JOIN tbarang b ON b.brg_kode = d.mutcd_brg_kode
     INNER JOIN tgudang g ON g.gdg_kode = d.mutcd_gdg_kode
     WHERE d.mutcd_mutc_nomor = ?
     ORDER BY d.mutcd_nourut`,
    [nomor]
  );
  return rows;
};

module.exports = { getBrowse, getBrowseDetail };
