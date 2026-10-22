const db = require("../config/database");

const pad2 = (n) => String(n).padStart(2, "0");

// ── Filter nomor SO per scope ──
// SO.<...> = pusat (00), SO1./SO01. = cabang 01, SO2./SO02. = cabang 02
const cabangSoFilter = (scope) => {
  if (scope === "ALL") {
    // Semua cabang (SO. + SO1./SO01. + ...)
    return {
      sql: ` AND (h.so_nomor LIKE 'SO.%' OR h.so_nomor REGEXP '^SO[0-9]+\\.')`,
      params: [],
    };
  }
  if (String(scope) === "00") {
    // Hanya penjualan pusat
    return { sql: ` AND h.so_nomor LIKE 'SO.%'`, params: [] };
  }
  // Scope satu cabang
  const pfx = `SO${Number(scope)}.%`;
  return {
    sql: ` AND (h.so_nomor LIKE ? OR h.so_nomor LIKE ?)`,
    params: [pfx, `SO${pad2(Number(scope))}.%`],
  };
};

const soCabangExpr =
  "CASE WHEN SUBSTRING_INDEX(SUBSTRING(h.so_nomor, 3), '.', 1) = '' THEN '00' " +
  "ELSE LPAD(SUBSTRING_INDEX(SUBSTRING(h.so_nomor, 3), '.', 1), 2, '0') END";

const getSales = async (user = {}, cabangQuery) => {
  const userCabang = String(user?.cabang || "00");
  // Default pusat: semua cabang; pilihan scope boleh diubah oleh user pusat
  let scope = userCabang === "00" ? "ALL" : userCabang;
  if (userCabang === "00" && cabangQuery) {
    if (String(cabangQuery) === "ALL") scope = "ALL";
    else if (/^\d{2}$/.test(String(cabangQuery))) scope = String(cabangQuery);
  }
  const isPusat = scope === "ALL" || scope === "00";
  const filter = cabangSoFilter(scope);

  const now = new Date();
  const moStart = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const nextStart = `${now.getFullYear()}-${pad2(now.getMonth() + 2)}-01`;
  const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevStart = `${prevD.getFullYear()}-${pad2(prevD.getMonth() + 1)}-01`;

  // 1) KPI bulan berjalan vs bulan lalu
  const [[kpi]] = await db.query(
    `SELECT
       IFNULL(SUM(IF(h.so_tanggal >= ?, so_amount + IFNULL(h.so_ongkir,0), 0)), 0) AS penjualanBulanIni,
       IFNULL(SUM(IF(h.so_tanggal >= ? AND h.so_tanggal < ?, so_amount + IFNULL(h.so_ongkir,0), 0)), 0) AS penjualanBulanLalu,
       COUNT(IF(h.so_tanggal >= ?, 1, NULL)) AS notaBulanIni,
       COUNT(IF(h.so_tanggal >= ? AND h.so_tanggal < ?, 1, NULL)) AS notaBulanLalu,
       IFNULL(SUM(IF(h.so_tanggal >= ?, IFNULL(h.so_dp,0) + IFNULL(h.so_card,0) + IFNULL(h.so_voucher,0), 0)), 0) AS cashBulanIni,
       IFNULL(SUM(IF(h.so_tanggal >= ?, IFNULL(h.so_piutang,0), 0)), 0) AS piutangBaruBulanIni
     FROM tso_hdr h
     WHERE h.so_tanggal < ? ${filter.sql}`,
    [
      moStart,
      prevStart,
      moStart,
      moStart,
      prevStart,
      moStart,
      moStart,
      moStart,
      nextStart,
      ...filter.params,
    ],
  );

  // 2) Grafik harian bulan berjalan
  const [harian] = await db.query(
    `SELECT DATE_FORMAT(h.so_tanggal, "%Y-%m-%d") AS tanggal,
            IFNULL(SUM(h.so_amount + IFNULL(h.so_ongkir, 0)), 0) AS nilai,
            COUNT(*) AS nota
     FROM tso_hdr h
     WHERE h.so_tanggal >= ? AND h.so_tanggal < ? ${filter.sql}
     GROUP BY tanggal
     ORDER BY tanggal`,
    [moStart, nextStart, ...filter.params],
  );

  // 3) Per cabang (untuk pusat) — nama dari tcabang
  let cabangRows = [];
  if (isPusat) {
    [cabangRows] = await db.query(
      `SELECT ${soCabangExpr} AS cab,
              IFNULL(SUM(IF(h.so_tanggal >= ?, h.so_amount + IFNULL(h.so_ongkir,0), 0)), 0) AS bulanIni,
              IFNULL(SUM(IF(h.so_tanggal >= ? AND h.so_tanggal < ?, h.so_amount + IFNULL(h.so_ongkir,0), 0)), 0) AS bulanLalu,
              COUNT(IF(h.so_tanggal >= ?, 1, NULL)) AS nota
       FROM tso_hdr h
       WHERE h.so_tanggal < ? ${filter.sql}
       GROUP BY cab
       ORDER BY cab`,
      [moStart, prevStart, moStart, moStart, nextStart],
    );
  } else {
    [cabangRows] = await db.query(
      `SELECT ? AS cab,
              IFNULL(SUM(IF(h.so_tanggal >= ?, h.so_amount + IFNULL(h.so_ongkir,0), 0)), 0) AS bulanIni,
              IFNULL(SUM(IF(h.so_tanggal >= ? AND h.so_tanggal < ?, h.so_amount + IFNULL(h.so_ongkir,0), 0)), 0) AS bulanLalu,
              COUNT(IF(h.so_tanggal >= ?, 1, NULL)) AS nota
       FROM tso_hdr h
       WHERE h.so_tanggal < ? ${filter.sql}`,
      [scope, moStart, prevStart, moStart, moStart, nextStart, ...filter.params],
    );
  }
  const [cabangs] = await db.query(
    `SELECT cbg_kode AS kode, cbg_nama AS nama FROM tcabang`,
  );
  const cabNama = Object.fromEntries(cabangs.map((c) => [c.kode, c.nama]));
  const perCabang = cabangRows.map((r) => ({
    cabang: r.cab,
    nama: cabNama[r.cab] || r.cab,
    bulanIni: Number(r.bulanIni),
    bulanLalu: Number(r.bulanLalu),
    nota: Number(r.nota),
  }));

  // 4) Komposisi cara bayar bulan berjalan
  const [[komp]] = await db.query(
    `SELECT IFNULL(SUM(h.so_dp),0) AS dp,
            IFNULL(SUM(h.so_card),0) AS card,
            IFNULL(SUM(h.so_voucher),0) AS voucher,
            IFNULL(SUM(h.so_piutang),0) AS piutang
     FROM tso_hdr h
     WHERE h.so_tanggal >= ? AND h.so_tanggal < ? ${filter.sql}`,
    [moStart, nextStart, ...filter.params],
  );

  // 5) Piutang belum lunas (kumulatif, semua waktu)
  const [piutangTop] = await db.query(
    `SELECT h.so_nomor AS nomor,
            DATE_FORMAT(h.so_tanggal, "%Y-%m-%d") AS tanggal,
            c.cus_nama AS customer,
            (IFNULL(h.so_piutang,0) - IFNULL(h.so_bayar,0)) AS sisa
     FROM tso_hdr h
     LEFT JOIN tcustomer c ON c.cus_kode = h.so_cus_kode
     WHERE IFNULL(h.so_piutang,0) - IFNULL(h.so_bayar,0) > 0 ${filter.sql}
     ORDER BY sisa DESC
     LIMIT 5`,
    filter.params,
  );
  const [[piutAgg]] = await db.query(
    `SELECT COUNT(*) AS nota, IFNULL(SUM(sisa),0) AS total
     FROM (
       SELECT h.so_nomor,
              (IFNULL(h.so_piutang,0) - IFNULL(h.so_bayar,0)) AS sisa
       FROM tso_hdr h
       WHERE IFNULL(h.so_piutang,0) - IFNULL(h.so_bayar,0) > 0 ${filter.sql}
     ) x`,
    filter.params,
  );

  // 6) Top customer bulan berjalan
  const [topCustomer] = await db.query(
    `SELECT c.cus_nama AS nama,
            IFNULL(SUM(h.so_amount + IFNULL(h.so_ongkir,0)),0) AS nilai,
            COUNT(*) AS nota
     FROM tso_hdr h
     LEFT JOIN tcustomer c ON c.cus_kode = h.so_cus_kode
     WHERE h.so_tanggal >= ? AND h.so_tanggal < ? ${filter.sql}
     GROUP BY h.so_cus_kode, c.cus_nama
     ORDER BY nilai DESC
     LIMIT 5`,
    [moStart, nextStart, ...filter.params],
  );

  // 7) Nota terbaru
  const [terbaru] = await db.query(
    `SELECT h.so_nomor AS nomor,
            DATE_FORMAT(h.so_tanggal, "%Y-%m-%d") AS tanggal,
            c.cus_nama AS customer,
            h.so_amount + IFNULL(h.so_ongkir,0) AS total,
            GREATEST(IFNULL(h.so_piutang,0) - IFNULL(h.so_bayar,0), 0) AS sisaPiutang,
            h.so_isclosed AS closed
     FROM tso_hdr h
     LEFT JOIN tcustomer c ON c.cus_kode = h.so_cus_kode
     WHERE 1 = 1 ${filter.sql}
     ORDER BY h.so_tanggal DESC, h.so_nomor DESC
     LIMIT 8`,
    filter.params,
  );

  const penjualanBulanIni = Number(kpi.penjualanBulanIni);
  const penjualanBulanLalu = Number(kpi.penjualanBulanLalu);

  return {
    isPusat,
    userPusat: String(user?.cabang || "00") === "00",
    scopeCabang: scope,
    daftarCabang:
      String(user?.cabang || "00") === "00"
        ? [{ kode: "ALL", nama: "Semua Cabang" }, ...cabangs.map((c) => ({ kode: c.kode, nama: c.nama }))]
        : [],
    cabang: scope,
    bulan: {
      penjualan: penjualanBulanIni,
      penjualanPrev: penjualanBulanLalu,
      deltaPct:
        penjualanBulanLalu > 0
          ? ((penjualanBulanIni - penjualanBulanLalu) / penjualanBulanLalu) * 100
          : null,
      nota: Number(kpi.notaBulanIni),
      notaPrev: Number(kpi.notaBulanLalu),
      cash: Number(kpi.cashBulanIni),
      piutangBaru: Number(kpi.piutangBaruBulanIni),
    },
    harian: harian.map((r) => ({
      tanggal: r.tanggal,
      nilai: Number(r.nilai),
      nota: Number(r.nota),
    })),
    perCabang,
    komposisi: {
      dp: Number(komp.dp),
      card: Number(komp.card),
      voucher: Number(komp.voucher),
      piutang: Number(komp.piutang),
    },
    piutang: {
      nota: Number(piutAgg.nota),
      total: Number(piutAgg.total),
      top: piutangTop.map((r) => ({
        nomor: r.nomor,
        tanggal: r.tanggal,
        customer: r.customer || "",
        sisa: Number(r.sisa),
      })),
    },
    topCustomer: topCustomer.map((r) => ({
      nama: r.nama || "(Lainnya)",
      nilai: Number(r.nilai),
      nota: Number(r.nota),
    })),
    terbaru: terbaru.map((r) => ({
      nomor: r.nomor,
      tanggal: r.tanggal,
      customer: r.customer || "",
      total: Number(r.total),
      sisaPiutang: Number(r.sisaPiutang),
      closed: Number(r.closed) === 1,
    })),
  };
};

const getSummary = async (cabang) => {
  // 1. Kasbon belum selesai
  let kasbonRow = { count: 0, total: 0 };
  try {
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
    [kasbonRow] = await db.query(kasbonSql, kasbonParams);
  } catch (e) {
    console.error("[dashboard] kasbon:", e.message);
  }

  // 2. Pengajuan transfer menunggu realisasi
  let pjtRow = { count: 0, total: 0 };
  try {
    [pjtRow] = await db.query(`
      SELECT COUNT(*) AS count, IFNULL(SUM(ptd_nominal), 0) AS total
      FROM tpengajuan_transfer_dtl
      WHERE (ptd_jur_no = '' OR ptd_jur_no IS NULL)
        AND (ptd_batal = '' OR ptd_batal IS NULL)
    `);
  } catch (e) {
    console.error("[dashboard] pengajuanTransfer:", e.message);
  }

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
  let setoranRow = { count: 0 };
  try {
    [setoranRow] = await db.query(setoranSql, setoranParams);
  } catch (e) {
    console.error("[dashboard] setoran:", e.message);
  }

  // 4. Server date
  const [[dateRow]] = await db.query(
    `SELECT DATE_FORMAT(NOW(),'%Y-%m-%d') AS serverDate`,
  );

  // 5. Saldo kas & bank (kumulatif s/d hari ini, akun 11./12./13.)
  const [[saldoRow]] = await db.query(
    `SELECT IFNULL(SUM(d.jurd_debet - d.jurd_kredit), 0) AS saldo
     FROM tjurnalitem d
     INNER JOIN tjurnal j ON j.jur_no = d.jurd_jur_no
     WHERE (d.jurd_rek_kode LIKE '11.%' OR d.jurd_rek_kode LIKE '12.%' OR d.jurd_rek_kode LIKE '13.%')
       AND COALESCE(j.jur_tanggal, '1000-01-01') <= CURDATE()`,
  );
  const saldoKas = {
    account: "KAS & BANK",
    saldo: Number(saldoRow.saldo),
  };

  // 6. Rekonsiliasi — jumlah yang selisih ≠ 0 bulan ini
  let rekonRow;
  try {
    [rekonRow] = await db.query(
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
  } catch (e) {
    console.error("[dashboard] rekon:", e.message);
    rekonRow = [{ count: 0 }];
  }

  // 7. Stok Finance — jumlah item REAL negatif di cabang
  let stokRow = { count: 0 };
  try {
    [stokRow] = await db.query(
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
  } catch (e) {
    console.error("[dashboard] stok:", e.message);
  }

  // 8. Voucher Pembayaran belum diinputkan ke Pengajuan Transfer
  let voucherPtRow = { count: 0, total: 0 };
  try {
    [voucherPtRow] = await db.query(
    `SELECT COUNT(*) AS count, IFNULL(SUM(vou_total - IFNULL(vou_disc,0)), 0) AS total
      FROM kencanaprint.tvoucher_hdr h
      WHERE NOT EXISTS (
        SELECT 1
        FROM finance.tpengajuan_transfer_dtl d
        WHERE d.ptd_trs = h.vou_nomor
      )`,
  );
  } catch (e) {
    console.error("[dashboard] voucherPt:", e.message);
  }

  // 9. Daftar Hutang — Berbagai jenis BPB/Nota yang belum terbayar lunas (Sisa > 0)
  let hutangRow = { count: 0, total: 0 };
  try {
    [hutangRow] = await db.query(
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
  } catch (e) {
    console.error("[dashboard] hutang:", e.message);
  }

  return {
    kasbon: { count: Number(kasbonRow.count), total: Number(kasbonRow.total) },
    transfer: { count: Number(pjtRow.count), total: Number(pjtRow.total) },
    setoran: { count: Number(setoranRow.count) },
    serverDate: dateRow.serverDate,
    // Tambahan baru:
    saldoKas,
    rekon: { selisihCount: Number(rekonRow.count) },
    stok: { negativeCount: Number(stokRow.count) },
    voucherPt: {
      count: Number(voucherPtRow.count),
      total: Number(voucherPtRow.total),
    },
    hutang: { count: Number(hutangRow.count), total: Number(hutangRow.total) },
  };
};

module.exports = { getSummary, getSales };
