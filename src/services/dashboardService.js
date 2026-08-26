const db = require("../config/database");

const getSummary = async (cabang) => {
  // 1. Kasbon belum selesai
  let kasbonSql = `
    SELECT COUNT(*) AS count, IFNULL(SUM(bon_nominal), 0) AS total
    FROM tkasbon
    WHERE bon_selesai = 0
  `;
  const kasbonParams = [];
  if (cabang && cabang !== "P01" && cabang !== "ALL") {
    kasbonSql += ` AND bon_cabang = ?`;
    kasbonParams.push(cabang);
  }
  const [[kasbonRow]] = await db.query(kasbonSql, kasbonParams);

  // 2. Pengajuan transfer menunggu realisasi
  const [[pjtRow]] = await db.query(`
    SELECT COUNT(*) AS count, IFNULL(SUM(ptd_nominal), 0) AS total
    FROM tpengajuan_transfer_dtl
    WHERE (ptd_jur_no = '' OR ptd_jur_no IS NULL)
      AND (ptd_batal = '' OR ptd_batal IS NULL)
  `);

  // 3. Terima setoran belum verifikasi (fsk_userv kosong)
  // Filter LEFT(fsk_nomor,3) jika bukan pusat
  let setoranSql = `
    SELECT COUNT(*) AS count
    FROM retail.tform_setorkasir_hdr
    WHERE (fsk_userv = '' OR fsk_userv IS NULL)
  `;
  const setoranParams = [];
  if (cabang && cabang !== "P01" && cabang !== "ALL") {
    setoranSql += ` AND LEFT(fsk_nomor, 3) = ?`;
    setoranParams.push(cabang);
  }
  const [[setoranRow]] = await db.query(setoranSql, setoranParams);

  // 4. Server date
  const [[dateRow]] = await db.query(
    `SELECT DATE_FORMAT(NOW(),'%Y-%m-%d') AS serverDate`,
  );

  // 5. Buku Besar — saldo account default cabang
  const defaultAccount =
    cabang === "P01"
      ? "A-111101"
      : cabang === "P02"
        ? "A-111102"
        : cabang === "P04"
          ? "A-111103"
          : "A-111101";

  const [[saldoRow]] = await db.query(
    `SELECT IFNULL(SUM(d.jurd_kredit - d.jurd_debet), 0) AS saldo
     FROM tjurnalitem d
     INNER JOIN tjurnal j ON j.jur_no = d.jurd_jur_no
     WHERE d.jurd_nourut <> 0
       AND j.jur_rek_kode = ?
       AND j.jur_tanggal <= CURDATE()`,
    [defaultAccount],
  );

  // 6. Rekonsiliasi — jumlah yang selisih ≠ 0 bulan ini
  const [[rekonRow]] = await db.query(
    `SELECT COUNT(*) AS count
     FROM (
       SELECT v.rkv_rek_kode,
         (v.rkv_koran  + IFNULL(SUM(b.rk_nominal),0) - IFNULL(SUM(d.rk_nominal),0))
         - (v.rkv_saldo + IFNULL(SUM(a.rk_nominal),0) - IFNULL(SUM(c.rk_nominal),0)) AS selisih
       FROM trekon_valid v
       LEFT JOIN trekon_det  a ON a.rk_rek_kode=v.rkv_rek_kode AND a.rk_tanggal=v.rkv_tanggal
       LEFT JOIN trekon_det3 c ON c.rk_rek_kode=v.rkv_rek_kode AND c.rk_tanggal=v.rkv_tanggal
       LEFT JOIN trekon_det2 b ON b.rk_rek_kode=v.rkv_rek_kode AND b.rk_tanggal=v.rkv_tanggal
       LEFT JOIN trekon_det4 d ON d.rk_rek_kode=v.rkv_rek_kode AND d.rk_tanggal=v.rkv_tanggal
       WHERE YEAR(v.rkv_tanggal)  = YEAR(CURDATE())
         AND MONTH(v.rkv_tanggal) = MONTH(CURDATE())
       GROUP BY v.rkv_rek_kode, v.rkv_tanggal
     ) x
     WHERE x.selisih <> 0`,
  );

  // 7. Stok Finance — jumlah item REAL negatif di cabang
  const [[stokRow]] = await db.query(
    `SELECT COUNT(*) AS count
     FROM (
       SELECT mst_brg_kode,
         SUM(mst_stok_in - mst_stok_out) AS stk
       FROM finance.tmasterstok_finance
       WHERE mst_aktif = 'Y' AND mst_cab = ?
       GROUP BY mst_brg_kode
     ) x
     LEFT JOIN (
       SELECT msod_brg_kode,
         IFNULL(SUM(msod_jumlah), 0) AS mutasi
       FROM kencanaprint.tgarmenmso_hdr h
       INNER JOIN kencanaprint.tgarmenmso_dtl d ON d.msod_nomor = h.mso_nomor
       WHERE h.mso_msi_nomor = '' AND h.mso_cab = ? AND h.mso_bagian = 'FINANCE'
       GROUP BY msod_brg_kode
     ) m ON m.msod_brg_kode = x.mst_brg_kode
     WHERE (x.stk - IFNULL(m.mutasi, 0)) < 0`,
    [cabang, cabang],
  );

  // 8. Voucher Pembayaran belum diinputkan ke Pengajuan Transfer
  const [[voucherPtRow]] = await db.query(
    `SELECT COUNT(*) AS count, IFNULL(SUM(vou_total - IFNULL(vou_disc,0)), 0) AS total
      FROM kencanaprint.tvoucher_hdr h
      WHERE NOT EXISTS (
        SELECT 1
        FROM finance.tpengajuan_transfer_dtl d
        WHERE d.ptd_trs = h.vou_nomor
      )`,
  );

  // 9. Daftar Hutang — Berbagai jenis BPB/Nota yang belum terbayar lunas (Sisa > 0)
  const [[hutangRow]] = await db.query(
    `SELECT
        COUNT(*) AS count,
        IFNULL(SUM(x.Sisa), 0) AS total
      FROM (
        -- 1. PBG (BPB dari PO)
        SELECT h.bpb_nomor AS Nomor,
          ROUND(SUM(
            (d.bpbd_harga * (100 - d.bpbd_disc) / 100) * d.bpbd_jumlah *
            IF(p.po_status_ppn = 1, (100 + p.po_ppn) / 100, 1)
          ), 2) - IFNULL((SELECT SUM(voud_total) FROM kencanaprint.tvoucher_dtl WHERE voud_nota = h.bpb_nomor), 0) AS Sisa
        FROM kencanaprint.tbpb_hdr h
        INNER JOIN kencanaprint.tbpb_dtl d ON d.bpbd_bpb_nomor = h.bpb_nomor
        INNER JOIN kencanaprint.tpo_hdr p ON p.po_nomor = h.bpb_po_nomor
        GROUP BY h.bpb_nomor
        HAVING Sisa > 0

        UNION ALL

        -- 2. BJG (BPJ dari PO Jasa)
        SELECT h.bpj_nomor AS Nomor,
          ROUND(
            p.pojh_tarif * h.bpj_jumlah *
            IF(p.pojh_status_ppn = 1, ((100 + p.pojh_ppn) / 100), 1)
          , 2) - IFNULL((SELECT SUM(voud_total) FROM kencanaprint.tvoucher_dtl WHERE voud_nota = h.bpj_nomor), 0) AS Sisa
        FROM kencanaprint.tbpj_hdr h
        INNER JOIN kencanaprint.tpojasa_hdr p ON p.pojh_nomor = h.bpj_po_nomor
        GROUP BY h.bpj_nomor
        HAVING Sisa > 0

        UNION ALL

        -- 3. POE (PO External)
        SELECT h.poe_nomor AS Nomor,
          (h.poe_total - IFNULL((SELECT SUM(c.poed2_nominal) FROM kencanaprint.tpoexternal_dtl2 c WHERE c.poed2_nomor = h.poe_nomor), 0))
          - IFNULL((SELECT SUM(voud_total) FROM kencanaprint.tvoucher_dtl WHERE voud_nota = h.poe_nomor), 0) AS Sisa
        FROM kencanaprint.tpoexternal_hdr h
        GROUP BY h.poe_nomor
        HAVING Sisa > 0

        UNION ALL

        -- 4. MMT (Penerimaan Mutasi)
        SELECT h.rec_nomor AS Nomor,
          IFNULL((
            SELECT SUM(IF(d.recd_harga < 200000, d.recd_harga * d.recd_qty_terima, d.recd_harga))
            FROM kencanaprint.trec_mmt_dtl d
            WHERE d.recd_rec_nomor = h.rec_nomor
          ), 0) - IFNULL((SELECT SUM(voud_total) FROM kencanaprint.tvoucher_dtl WHERE voud_nota = h.rec_nomor), 0) AS Sisa
        FROM kencanaprint.trec_mmt_hdr h
        GROUP BY h.rec_nomor
        HAVING Sisa > 0

        UNION ALL

        -- 5. BPE (BPB PO External)
        SELECT h.bpe_nomor AS Nomor,
          IFNULL(poe.poe_total, 0) - IFNULL((SELECT SUM(voud_total) FROM kencanaprint.tvoucher_dtl WHERE voud_nota = h.bpe_nomor), 0) AS Sisa
        FROM kencanaprint.tbpbpoexternal_hdr h
        LEFT JOIN kencanaprint.tpoexternal_hdr poe ON poe.poe_nomor = h.bpe_po
        GROUP BY h.bpe_nomor
        HAVING Sisa > 0

        UNION ALL

        -- 6. BPG (Garmen BPB)
        SELECT h.bpb_nomor AS Nomor,
          IFNULL((
            SELECT SUM(d.bpbd_jumlah * d.bpbd_harga)
            FROM kencanaprint.tgarmenbpb_dtl d
            WHERE d.bpbd_nomor = h.bpb_nomor
          ), 0) - IFNULL((SELECT SUM(voud_total) FROM kencanaprint.tvoucher_dtl WHERE voud_nota = h.bpb_nomor), 0) AS Sisa
        FROM kencanaprint.tgarmenbpb_hdr h
        GROUP BY h.bpb_nomor
        HAVING Sisa > 0
      ) x`,
  );

  return {
    kasbon: { count: Number(kasbonRow.count), total: Number(kasbonRow.total) },
    transfer: { count: Number(pjtRow.count), total: Number(pjtRow.total) },
    setoran: { count: Number(setoranRow.count) },
    serverDate: dateRow.serverDate,
    // Tambahan baru:
    saldoKas: { account: defaultAccount, saldo: Number(saldoRow.saldo) },
    rekon: { selisihCount: Number(rekonRow.count) },
    stok: { negativeCount: Number(stokRow.count) },
    voucherPt: {
      count: Number(voucherPtRow.count),
      total: Number(voucherPtRow.total),
    },
    hutang: { count: Number(hutangRow.count), total: Number(hutangRow.total) },
  };
};

module.exports = { getSummary };
