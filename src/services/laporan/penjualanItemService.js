const db = require("../../config/database");

// nomor SO membawa kode cabang: "SO." untuk pusat, "SO1."/"SO2." untuk cabang
const nomorPrefixCabang = (cabang) =>
  cabang && String(cabang) !== "00" ? `SO${Number(cabang)}.` : "SO.";

// Laporan Penjualan per Item:
// - Pusat (cabang "00"/kosong): bisa memilih all cabang (default), pusat saja,
//   atau cabang tertentu lewat parameter cabangFilter
// - Cabang (mis. "01"/"02"): dipaksa hanya melihat penjualan cabangnya sendiri
const getPenjualanItem = async (
  startDate,
  endDate,
  cabangUser = "00",
  cabangFilter = "all"
) => {
  const isPusat = !cabangUser || String(cabangUser) === "00";
  const filter = isPusat ? String(cabangFilter || "all") : "self";
  const prefix = nomorPrefixCabang(cabangUser);

  let condNomor = "";
  const params = [startDate, endDate];
  if (filter === "self") {
    condNomor = "h.so_nomor LIKE ?";
    prefix && params.push(`${prefix}%`);
  } else if (filter === "all") {
    // mencakup pusat ("SO.") dan semua cabang ("SO1.", "SO12.", dst)
    condNomor = "TRIM(h.so_nomor) REGEXP '^SO[0-9]*\\\\.'";
  } else {
    condNomor = "h.so_nomor LIKE ?";
    params.push(`${nomorPrefixCabang(filter)}%`);
  }

  const [rows] = await db.query(
    `SELECT
       t.Bulan, t.Tahun, t.Nota, t.Tanggal, t.Customer, t.Cabang,
       t.Kode, t.Nama, t.Satuan, t.Kategori,
       t.Qty, t.Nilai, t.Disc, t.Hpp,
       (t.Nilai - t.Hpp) AS Margin
     FROM (
       SELECT
         MONTH(h.so_tanggal)                   AS Bulan,
         YEAR(h.so_tanggal)                    AS Tahun,
         h.so_nomor                            AS Nota,
         DATE_FORMAT(h.so_tanggal, '%Y-%m-%d') AS Tanggal,
         IFNULL(c.cus_nama, '')                AS Customer,
         IFNULL(NULLIF(cx.cbg_nama, ''),
                IF(TRIM(h.so_nomor) LIKE 'SO.%', 'PUSAT',
                   CONCAT('CABANG ', SUBSTRING_INDEX(SUBSTRING(TRIM(h.so_nomor), 3), '.', 1))
                )                              ) AS Cabang,
         d.sod_brg_kode                        AS Kode,
         b.brg_nama                            AS Nama,
         d.sod_brg_satuan                      AS Satuan,
         k.ktg_nama                            AS Kategori,
         d.sod_qty                             AS Qty,
         (d.sod_qty * (d.sod_harga * (100 - IFNULL(d.sod_discpr, 0)) / 100)) AS Nilai,
         (d.sod_qty * d.sod_harga * IFNULL(d.sod_discpr, 0) / 100)           AS Disc,
         (d.sod_qty * IFNULL(
            (SELECT s.mst_avgcost FROM tmasterstok s
              WHERE s.mst_brg_kode = d.sod_brg_kode AND s.mst_avgcost > 0
              ORDER BY s.mst_tanggal DESC, s.mst_id DESC LIMIT 1),
            IFNULL(b.brg_hrgbeli, 0)))         AS Hpp
       FROM tso_dtl d
       INNER JOIN tso_hdr h ON h.so_nomor = TRIM(d.sod_so_nomor)
       INNER JOIN tbarang b ON b.brg_kode = d.sod_brg_kode
       LEFT JOIN tcustomer c ON c.cus_kode = h.so_cus_kode
       LEFT JOIN tkategori k ON k.ktg_kode = b.brg_ktg_kode
       LEFT JOIN tcabang cx ON cx.cbg_kode = IF(TRIM(h.so_nomor) LIKE 'SO.%', '00',
            LPAD(SUBSTRING_INDEX(SUBSTRING(TRIM(h.so_nomor), 3), '.', 1), 2, '0'))
       WHERE h.so_tanggal BETWEEN ? AND ? AND ${condNomor}
     ) t
     ORDER BY t.Tanggal, t.Nota, t.Kode`,
    params
  );

  return rows;
};

module.exports = { getPenjualanItem };
