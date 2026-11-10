const db = require("../../config/database");

/**
 * Buku Pembantu Uang Muka Penjualan — ledger per customer dari
 * uang muka (Penerimaan Lain-Lain) yang dipakai di nota penjualan.
 *
 * MASUK : kredit akun Uang Muka (tcabang.cbg_rek_umpenjualan / 19.001)
 *         pada jurnal jur_tipetransaksi = 'Penerimaan Lain' ber-customer.
 * PAKAI : tso_hdr.so_umpenjualan (nota yang memakai uang muka, so_um_nomor).
 *
 * Saldo awal customer = total MASUK sebelum startDate dikurangi
 * total PAKAI sebelum startDate. User pusat ("00") melihat semua cabang;
 * user cabang hanya prefix nomor miliknya.
 */
const REK_UMPENJUALAN = "19.001";

const getRekUmCabang = async (cabang) => {
  const [[cbg]] = await db.query(
    `SELECT cbg_rek_umpenjualan FROM tcabang WHERE cbg_kode = ?`,
    [cabang || "00"],
  );
  return String(cbg?.cbg_rek_umpenjualan || "").trim() || REK_UMPENJUALAN;
};

// Prefix nomor nota SO: SO. = pusat, SO01./SO02. = cabang 01/02
const soPrefixCabang = (cabang) => {
  const digits = (String(cabang || "00").match(/\d+/) || ["0"])[0];
  return `SO${Number(digits)}.`;
};

const getData = async ({ startDate, endDate, cusKode, cabang }) => {
  const rekUm = await getRekUmCabang(cabang);
  const cusFilter = String(cusKode || "").trim();
  const cabangFilter = String(cabang || "00").trim();

  // ── MASUK: deposit uang muka per customer ──
  let depSql = `
    SELECT
      DATE_FORMAT(j.jur_tanggal, '%Y-%m-%d') AS tanggal,
      j.jur_no AS nomor,
      IFNULL(j.jur_keterangan, '') AS keterangan,
      d.jurd_kredit AS nilai,
      d.jurd_cus_kode AS cusKode,
      (SELECT c.Cus_nama FROM tcustomer c
        WHERE c.Cus_kode = d.jurd_cus_kode LIMIT 1) AS cusNama
    FROM tjurnal j
    INNER JOIN tjurnalitem d ON d.jurd_jur_no = j.jur_no
    WHERE j.jur_tipetransaksi = 'Penerimaan Lain'
      AND d.jurd_kredit > 0
      AND d.jurd_rek_kode = ?
      AND IFNULL(d.jurd_cus_kode, '') <> ''`;
  const depParams = [rekUm];
  if (cusFilter) {
    depSql += ` AND d.jurd_cus_kode = ?`;
    depParams.push(cusFilter);
  }
  if (cabangFilter && cabangFilter !== "00") {
    depSql += ` AND j.jur_no LIKE ?`;
    depParams.push(`${cabangFilter}-%`);
  }
  depSql += ` ORDER BY j.jur_tanggal, j.jur_no`;

  // ── PAKAI: pemakaian uang muka pada nota penjualan ──
  let usoSql = `
    SELECT
      DATE_FORMAT(so_tanggal, '%Y-%m-%d') AS tanggal,
      so_nomor AS nomor,
      CONCAT('Pakai Uang Muka ', so_um_nomor,
        IF(IFNULL(so_memo, '') <> '', CONCAT(' — ', so_memo), '')) AS keterangan,
      so_umpenjualan AS nilai,
      so_cus_kode AS cusKode,
      (SELECT c.Cus_nama FROM tcustomer c
        WHERE c.Cus_kode = so_cus_kode LIMIT 1) AS cusNama
    FROM tso_hdr
    WHERE IFNULL(so_umpenjualan, 0) > 0
      AND IFNULL(so_um_nomor, '') <> ''`;
  const usoParams = [];
  if (cusFilter) {
    usoSql += ` AND so_cus_kode = ?`;
    usoParams.push(cusFilter);
  }
  if (cabangFilter && cabangFilter !== "00") {
    usoSql += ` AND so_nomor LIKE ?`;
    usoParams.push(`${soPrefixCabang(cabangFilter)}%`);
  }
  usoSql += ` ORDER BY so_tanggal, so_nomor`;

  const [[depRows], [usoRows]] = await Promise.all([
    db.query(depSql, depParams),
    db.query(usoSql, usoParams),
  ]);

  // ── Nama customer untuk semua yang terlibat ──
  const cusNamaMap = new Map();
  for (const r of [...depRows, ...usoRows]) {
    if (!r.cusKode) continue;
    if (!cusNamaMap.has(r.cusKode)) cusNamaMap.set(r.cusKode, r.cusNama || "");
  }

  // ── Susun event per customer ──
  const evMap = new Map(); // cusKode -> [event]
  const push = (cus, ev) => {
    if (!cus) return;
    if (!evMap.has(cus)) evMap.set(cus, []);
    evMap.get(cus).push(ev);
  };

  for (const r of depRows) {
    push(r.cusKode, {
      tanggal: r.tanggal,
      nomor: r.nomor || "",
      jenis: "MASUK",
      keterangan: r.keterangan || `Terima uang muka ${r.nomor || ""}`.trim(),
      masuk: Number(r.nilai) || 0,
      pakai: 0,
    });
  }
  for (const r of usoRows) {
    push(r.cusKode, {
      tanggal: r.tanggal,
      nomor: r.nomor || "",
      jenis: "PAKAI",
      keterangan: r.keterangan || "Pakai uang muka",
      masuk: 0,
      pakai: Number(r.nilai) || 0,
    });
  }

  for (const list of evMap.values()) {
    list.sort(
      (a, b) =>
        String(a.tanggal).localeCompare(String(b.tanggal)) ||
        String(a.nomor).localeCompare(String(b.nomor)),
    );
  }

  // ── Saldo awal, baris periode, saldo akhir per customer ──
  const rows = [];
  const summary = [];
  const total = { saldoAwal: 0, masuk: 0, pakai: 0, saldoAkhir: 0 };

  for (const [cus, list] of evMap) {
    let saldo = 0;
    let masuk = 0;
    let pakai = 0;

    for (const ev of list) {
      if (String(ev.tanggal) < String(startDate)) {
        saldo += ev.masuk - ev.pakai;
      }
    }
    const saldoAwal = saldo;

    for (const ev of list) {
      const tgl = String(ev.tanggal);
      if (tgl < String(startDate) || tgl > String(endDate)) continue;
      saldo += ev.masuk - ev.pakai;
      masuk += ev.masuk;
      pakai += ev.pakai;
      rows.push({
        cusKode: cus,
        cusNama: cusNamaMap.get(cus) || "",
        tanggal: ev.tanggal,
        jenis: ev.jenis,
        nomor: ev.nomor,
        keterangan: ev.keterangan,
        masuk: ev.masuk,
        pakai: ev.pakai,
        saldo,
      });
    }

    summary.push({
      cusKode: cus,
      cusNama: cusNamaMap.get(cus) || "",
      saldoAwal,
      masuk,
      pakai,
      saldoAkhir: saldo,
    });

    total.saldoAwal += saldoAwal;
    total.masuk += masuk;
    total.pakai += pakai;
    total.saldoAkhir += saldo;
  }

  const bynama = (a, b) =>
    String(a.cusNama || a.cusKode).localeCompare(
      String(b.cusNama || b.cusKode),
      "id",
      { sensitivity: "base" },
    ) || String(a.cusKode).localeCompare(String(b.cusKode));

  summary.sort(bynama);
  rows.sort(
    (a, b) =>
      bynama(a, b) ||
      String(a.tanggal).localeCompare(String(b.tanggal)) ||
      String(a.nomor).localeCompare(String(b.nomor)),
  );

  return { rekUm, startDate, endDate, cusKode: cusFilter, rows, summary, total };
};

module.exports = { getData, REK_UMPENJUALAN };
