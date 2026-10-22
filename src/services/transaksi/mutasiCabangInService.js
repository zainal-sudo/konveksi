const db = require("../../config/database");

/**
 * Browse Mutasi Cabang In.
 * - User cabang: data mutasi dengan tujuan cabangnya.
 * - Pusat ('00'): semua (param cab = 'ALL') / filter per cabang tujuan.
 */
const getBrowse = async (startDate, endDate, cabang) => {
  const params = [startDate, endDate];
  let where = "WHERE a.mutci_tanggal BETWEEN ? AND ?";
  if (cabang && cabang !== "ALL") {
    where += " AND a.mutci_cbg_tujuan = ?";
    params.push(cabang);
  }

  const [rows] = await db.query(
    `SELECT
       a.mutci_nomor AS Nomor,
       DATE_FORMAT(a.mutci_tanggal, '%Y-%m-%d') AS Tanggal,
       c.cbg_nama AS Asal,
       b.cbg_nama AS Tujuan,
       d.gdg_nama AS Gudang,
       a.mutci_nomormutasi AS NoMutasiOut
     FROM tmutcabin_hdr a
     INNER JOIN tcabang b ON b.cbg_kode = a.mutci_cbg_tujuan
     INNER JOIN tcabang c ON c.cbg_kode = a.mutci_cbg_asal
     INNER JOIN tgudang d ON d.gdg_kode = a.mutci_gdg_kode
     ${where}
     ORDER BY a.mutci_nomor DESC`,
    params
  );
  return rows;
};

const getBrowseDetail = async (nomor) => {
  const [rows] = await db.query(
    `SELECT
       h.mutci_nomor AS Nomor,
       d.mutcid_brg_kode AS Kode,
       b.brg_nama AS Nama,
       d.mutcid_qty AS Jumlah,
       DATE_FORMAT(d.mutcid_expired, '%Y-%m-%d') AS Expired,
       IFNULL(d.mutcid_keterangan, '') AS Keterangan,
       g.gdg_nama AS Gudang
     FROM tmutcabin_dtl d
     INNER JOIN tmutcabin_hdr h ON h.mutci_nomor = d.mutcid_mutci_nomor
     INNER JOIN tbarang b ON b.brg_kode = d.mutcid_brg_kode
     LEFT JOIN tgudang g ON g.gdg_kode = h.mutci_gdg_kode
     WHERE d.mutcid_mutci_nomor = ?
     ORDER BY d.mutcid_nourut`,
    [nomor]
  );
  return rows;
};

module.exports = { getBrowse, getBrowseDetail };
