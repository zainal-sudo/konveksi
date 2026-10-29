const db = require("../../config/database");

// ── Laporan Hutang (Invoice Outstanding Supplier) ──────────────────────
// Merujuk ke ufrmListIOS (ATK Pusat):
// Sisa hutang = inv_amount - inv_bayar - retur (invoice belum lunas),
// Overdue = selisih hari (per tanggal laporan) terhadap inv_jthtempo,
// diklasifikasikan ke bucket aging: Belum / 0-30 / 31-60 / 61-90 / 91-120 / > 120.
// Supplier diambil lewat Invoice -> BPB -> PO (kolom inv_sup_kode tidak terisi).
const getHutang = async (tanggal) => {
  const [rows] = await db.query(
    `SELECT
      x.Nomor,
      x.Tanggal,
      x.JthTempo,
      x.SupKode,
      x.Supplier,
      x.Tax,
      x.NoBukti,
      x.Total,
      x.Retur,
      x.Bayar,
      x.SisaHutang,
      DATEDIFF(?, x.JthTempo) AS Overdue,
      CASE
        WHEN DATEDIFF(?, x.JthTempo) < 0 THEN 'Belum'
        WHEN DATEDIFF(?, x.JthTempo) <= 30 THEN '0 s/d 30'
        WHEN DATEDIFF(?, x.JthTempo) <= 60 THEN '31 s/d 60'
        WHEN DATEDIFF(?, x.JthTempo) <= 90 THEN '61 s/d 90'
        WHEN DATEDIFF(?, x.JthTempo) <= 120 THEN '91 s/d 120'
        ELSE '> 120'
      END AS RangeOverdue,
      x.Cabang
    FROM (
      SELECT
        i.inv_nomor AS Nomor,
        DATE_FORMAT(i.inv_tanggal, '%Y-%m-%d') AS Tanggal,
        DATE_FORMAT(i.inv_jthtempo, '%Y-%m-%d') AS JthTempo,
        s.sup_kode AS SupKode,
        s.sup_nama AS Supplier,
        IF(i.inv_istax = 1, 'PPN', 'Non PPN') AS Tax,
        i.inv_nobukti AS NoBukti,
        i.inv_amount AS Total,
        IFNULL(r.totalRetur, 0) AS Retur,
        IFNULL(i.inv_bayar, 0) AS Bayar,
        i.inv_amount - IFNULL(i.inv_bayar, 0) - IFNULL(r.totalRetur, 0) AS SisaHutang,
        i.inv_cabang AS Cabang
      FROM tinv_hdr i
      LEFT JOIN tbpb_hdr h ON i.inv_bpb_nomor = h.bpb_nomor
      LEFT JOIN tpo_hdr p ON h.bpb_po_nomor = p.po_nomor
      LEFT JOIN tsupplier s ON p.po_sup_kode = s.sup_kode
      LEFT JOIN (
        SELECT ret_inv_nomor, SUM(ret_amount) AS totalRetur
        FROM tret_hdr
        GROUP BY ret_inv_nomor
      ) r ON r.ret_inv_nomor = i.inv_nomor
      WHERE i.inv_tanggal <= ?
    ) x
    WHERE x.SisaHutang > 0
    ORDER BY x.Tanggal ASC, x.Nomor ASC`,
    [tanggal, tanggal, tanggal, tanggal, tanggal, tanggal, tanggal, tanggal],
  );
  return rows;
};

module.exports = { getHutang };
