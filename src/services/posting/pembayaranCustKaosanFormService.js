const db = require("../../config/database");
const { cekTutupPeriode } = require("../tutupBukuService");

// ── Get data untuk posting ────────────────────────────────────────────
// Delphi btnRefreshClick — DUA query digabung:
//   1. retail.tsetor_hdr (setoran kasir) — sh_jenis 0=TUNAI, 1=TRANSFER
//   2. retail.tinv_hdr (invoice tunai) — inv_rptunai <> 0
// Filter cabang: LEFT(nomor,3) jika bukan 'ALL'
// Status: cek apakah sudah ada di tjurnal (jur_otomatis=2 AND jur_cab=cab AND jur_nomor=nomor)
const getDataPosting = async (startDate, endDate, cabang) => {
  const cabFilter = cabang && cabang !== "ALL";

  // Satu query — semua setoran dari tsetor_hdr
  // Delphi: sh_jenis IN (0,1) — TUNAI & TRANSFER
  // sh_otomatis='Y' adalah setoran dari kasir (tunai/transfer/qris)
  // uraian: subquery dari tsetor_dtl JOIN tpiutang_dtl → RIGHT(pd_ph_nomor,17)
  // rekkode: TUNAI→gdg_akun, TRANSFER→sh_akun
  let sql = `
    SELECT
      DATE_FORMAT(h.sh_tanggal, '%Y-%m-%d')      AS Tanggal,
      h.sh_nomor                                  AS Nomor,
      IF(h.sh_jenis = 0, g.gdg_akun, h.sh_akun)  AS RekKode,
      IF(h.sh_jenis = 0,
        IFNULL(t.rek_nama, ''),
        IFNULL(r.rek_nama, '')
      )                                            AS RekNama,
      h.sh_nominal                                AS Nominal,
      IFNULL((
        SELECT RIGHT(p.pd_ph_nomor, 17)
        FROM retail.tsetor_dtl d
        LEFT JOIN retail.tpiutang_dtl p ON p.pd_sd_angsur = d.sd_angsur
        WHERE d.sd_sh_nomor = h.sh_nomor
          AND p.pd_ph_nomor IS NOT NULL
          AND p.pd_ph_nomor <> ''
        LIMIT 1
      ), NULLIF(TRIM(CONCAT('', IFNULL((
        SELECT d2.sd_inv FROM retail.tsetor_dtl d2
        WHERE d2.sd_sh_nomor = h.sh_nomor
          AND d2.sd_inv IS NOT NULL
          AND d2.sd_inv <> ''
        LIMIT 1
      ), ''))), ''))                               AS Uraian,
      IFNULL(c.cus_nama, '')                      AS Customer,
      IF(h.sh_jenis = 0, 'TUNAI',
        IF(h.sh_jenis = 1, 'TRANSFER', 'GIRO'))   AS Trs,
      DATE_FORMAT(h.sh_tgltransfer, '%Y-%m-%d')   AS TglTransfer,
      LEFT(h.sh_nomor, 3)                         AS Cab,
      IF(
        EXISTS(
          SELECT 1 FROM tjurnal j
          WHERE j.jur_otomatis = 2
            AND j.jur_cabang = LEFT(h.sh_nomor, 3)
            AND j.jur_nomor = h.sh_nomor
        ), 'Sudah', ''
      )                                            AS Status
    FROM retail.tsetor_hdr h
    LEFT JOIN retail.tcustomer c ON c.cus_kode = h.sh_cus_kode
    LEFT JOIN finance.trekening r ON r.rek_kode = h.sh_akun
    LEFT JOIN retail.tgudang g ON g.gdg_kode = LEFT(h.sh_nomor, 3)
    LEFT JOIN finance.trekening t ON t.rek_kode = g.gdg_akun
    WHERE (h.sh_jenis = 0 OR h.sh_jenis = 1)
  `;

  const params = [];
  if (cabFilter) {
    sql += ` AND LEFT(h.sh_nomor, 3) = ?`;
    params.push(cabang);
  }
  sql += ` AND h.sh_tanggal BETWEEN ? AND ? ORDER BY h.sh_tanggal, h.sh_nomor`;
  params.push(startDate, endDate);

  const [rows] = await db.query(sql, params);
  return rows;
};

// ── Get daftar cabang ─────────────────────────────────────────────────
// Delphi FormCreate: SELECT gdg_kode FROM retail.tgudang + item 'ALL'
const getCabang = async () => {
  const [rows] = await db.query(
    `SELECT gdg_kode AS kode, gdg_nama AS nama
     FROM retail.tgudang
     ORDER BY gdg_kode`,
  );
  return rows;
};

// ── Posting ────────────────────────────────────────────────────────────
// Delphi btnPostingClick — perbedaan vs PBC:
//   - ckredit = hardcode 'A-121101' untuk SEMUA baris
//   - jur_tipetransaksi = 'PBK'
//   - jur_cabang = cab (dari data, bukan hardcode P01)
//   - DELETE pakai: jur_otomatis=2 AND jur_cabang=cab AND jur_nomor=nomor
const doPosting = async (items, userLogin) => {
  if (!items || items.length === 0)
    throw new Error("Tidak ada data yang akan di posting.");

  const pending = items.filter((d) => (d.Status || "") === "");
  if (pending.length === 0) throw new Error("Semua data sudah diposting.");

  const results = [];
  const conn = await db.getConnection();
  await conn.beginTransaction();

  try {
    for (const row of pending) {
      const { Tanggal, Nomor, RekKode, Nominal, Uraian, Cab } = row;

      // Safety check tutup periode
      const tutup = await cekTutupPeriode(Tanggal);
      if (tutup) {
        results.push({
          nomor: Nomor,
          status: "Skip",
          message: "Periode sudah ditutup.",
        });
        continue;
      }

      // Delphi: ckredit hardcode A-121101 untuk semua baris PBK
      const ckredit = "A-121101";

      // Delphi: DELETE WHERE jur_otomatis=2 AND jur_cabang=cab AND jur_nomor=nomor
      await conn.query(
        `DELETE FROM tjurnal
         WHERE jur_otomatis = 2
           AND jur_cabang = ?
           AND jur_nomor = ?`,
        [Cab, Nomor],
      );

      // INSERT tjurnal header
      // Delphi: jur_cabang = cab (bukan hardcode P01)
      await conn.query(
        `INSERT INTO tjurnal
           (jur_no, jur_nomor, jur_tanggal, jur_tipetransaksi, jur_cabang,
            jur_otomatis, jur_keterangan, jur_rek_kode, date_create, user_create)
         VALUES (?, ?, ?, 'PBK', ?, 2, ?, ?, NOW(), ?)`,
        [Nomor, Nomor, Tanggal, Cab, Uraian, RekKode, userLogin],
      );

      // INSERT tjurnalitem — baris debet (tidak ada jurd_trs)
      await conn.query(
        `INSERT INTO tjurnalitem
           (jurd_jur_no, jurd_rek_kode, jurd_debet, jurd_uraian)
         VALUES (?, ?, ?, ?)`,
        [Nomor, RekKode, Number(Nominal), Uraian],
      );

      // INSERT tjurnalitem — baris kredit (jurd_trs='PBK', nourut=1)
      await conn.query(
        `INSERT INTO tjurnalitem
           (jurd_jur_no, jurd_trs, jurd_nourut, jurd_uraian, jurd_kredit, jurd_rek_kode)
         VALUES (?, 'PBK', 1, ?, ?, ?)`,
        [Nomor, Uraian, Number(Nominal), ckredit],
      );

      results.push({ nomor: Nomor, status: "Sukses", message: "" });
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  return results;
};

module.exports = { getDataPosting, getCabang, doPosting };
