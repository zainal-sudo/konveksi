const db = require("../../config/database");

// ── Klasifikasi akun ke bagian laporan ────────────────────────────────
// Khusus (opsi rekening yang kelompoknya menyimpang dari prefix kodenya)
const REMAP = {
  "12.999": "EKUITAS", // SALDO AWAL masuk ekuitas
  "19.006": "AKTIVA_PAJAK", // PPH 22 (prepaid pajak)
  "19.011": "AKTIVA_PAJAK", // PPH 21
  "19.012": "AKTIVA_PAJAK", // PPH 25/29
  "23.001": "HPP", // BIAYA PRODUKSI
  "23.028": "HPP", // TENAGA KERJA LANGSUNG
  "26.001": "HPP", // BPP
  "26.002": "HPP", // SUB PRODUKSI
  "99.001": "EXCLUDE", // IKHITISAR LR
};

const sectionOf = (kode) => {
  const k = String(kode);
  if (REMAP[k]) return REMAP[k];
  switch (k.slice(0, 2)) {
    case "11":
    case "12":
    case "13":
      return "AKTIVA_KAS";
    case "14":
      return "AKTIVA_PIUTANG";
    case "15":
      return "AKTIVA_DIMUKA";
    case "16":
      return "AKTIVA_PAJAK";
    case "17":
      return "AKTIVA_PERSEDIAAN";
    case "18":
      if (k.startsWith("18.005") || k.startsWith("18.006") || k.startsWith("18.007") || k.startsWith("18.009"))
        return "AKUM_PENYUSUTAN";
      return "AKTIVA_TETAP";
    case "19":
      return "KEWAJIBAN";
    case "20":
      return "EKUITAS";
    case "21":
      return "PENDAPATAN_PENJUALAN";
    case "22":
      return "PENDAPATAN_LAIN";
    case "23":
      return "BEBAN_OPERASIONAL";
    case "24":
      return "BEBAN_OPERASIONAL";
    case "25":
      return "BEBAN_NONOPERASIONAL";
    case "26":
      return "BEBAN_OPERASIONAL";
    default:
      return "EXCLUDE";
  }
};

// Karakter saldo akun: "D" = saldo normal debet (aktiva/beban),
// "K" = saldo normal kredit (kewajiban/ekuitas/pendapatan)
const normalSaldoOf = (section) => {
  if (section.startsWith("AKTIVA") || section === "BEBAN_OPERASIONAL" ||
    section === "BEBAN_NONOPERASIONAL" || section === "HPP")
    return "D";
  return "K";
};

// ── Saldo per rekening ─────────────────────────────────────────────────
// cum = saldo kumulatif 0 .. endDate (debet − kredit)
// mut = saldo periode startDate .. endDate (debet − kredit)
// cabang: "all" | kode cabang ("00","01",...) — atribusi jurnal ke cabang:
//   - nomor bukti "<cabang>-XX.yymm.nnnn" (MTC, MTCI, CR, KM, KK, JUR,
//     STBJ nomor besar) → prefix kode cabang
//   - nomor SO "SO." = pusat, "SO1."/"SO2." = cabang 01/02
//   - INV → tinv_hdr.inv_cabang
//   - STBJ / RET → gudang transaksi → tgudang.gdg_cbg_kode
const getCabangFilter = () => `
    (
      (j.jur_no REGEXP '^[0-9]{2}-' AND SUBSTRING_INDEX(j.jur_no, '-', 1) = ?)
      OR (j.jur_no REGEXP '^SO[0-9]+[.]' AND LPAD(SUBSTRING_INDEX(SUBSTRING(j.jur_no, 3), '.', 1), 2, '0') = ?)
      OR (j.jur_no LIKE 'SO.%' AND ? = '00')
      OR (j.jur_no LIKE 'INV.%' AND IFNULL(NULLIF(iv.inv_cabang, ''), '00') = ?)
      OR (j.jur_no LIKE 'STBJ.%' AND IFNULL(g.gdg_cbg_kode, '00') = ?)
      OR (j.jur_no LIKE 'RET.%' AND IFNULL(g2.gdg_cbg_kode, '00') = ?)
    )`.trim();

const getSaldoPerRekening = async (startDate, endDate, cabang = "all") => {
  const cab = String(cabang || "all").trim();
  const useCabang = cab && cab !== "all";

  const [rows] = await db.query(
    `SELECT
       d.jurd_rek_kode AS kode,
       IFNULL(r.REK_NAMA, d.jurd_rek_kode) AS nama,
       SUM(CASE WHEN j.jur_tanggal <= ? THEN d.jurd_debet ELSE 0 END) AS debetCum,
       SUM(CASE WHEN j.jur_tanggal <= ? THEN d.jurd_kredit ELSE 0 END) AS kreditCum,
       SUM(CASE WHEN j.jur_tanggal BETWEEN ? AND ? THEN d.jurd_debet ELSE 0 END) AS debetMut,
       SUM(CASE WHEN j.jur_tanggal BETWEEN ? AND ? THEN d.jurd_kredit ELSE 0 END) AS kreditMut
     FROM tjurnalitem d
     INNER JOIN tjurnal j ON j.jur_no = d.jurd_jur_no
     LEFT JOIN trekening r ON r.REK_KODE = d.jurd_rek_kode
     LEFT JOIN tinv_hdr iv ON iv.inv_nomor = j.jur_no
     LEFT JOIN tstbj_hdr s ON s.stbj_nomor = j.jur_no
       LEFT JOIN tgudang g ON g.gdg_kode = s.stbj_gdg_kode
     LEFT JOIN tret_hdr rt ON rt.ret_nomor = j.jur_no
       LEFT JOIN tgudang g2 ON g2.gdg_kode = rt.ret_gdg_kode
     WHERE (d.jurd_nourut <> 0
        OR d.jurd_rek_kode LIKE '11.%'
        OR d.jurd_rek_kode LIKE '12.%'
        OR d.jurd_rek_kode LIKE '13.%')
       ${useCabang ? `AND ${getCabangFilter()}` : ""}
     GROUP BY d.jurd_rek_kode, r.REK_NAMA
     ORDER BY d.jurd_rek_kode`,
    useCabang
      ? [
          endDate, endDate, startDate, endDate, startDate, endDate,
          cab, cab, cab, cab, cab, cab,
        ]
      : [endDate, endDate, startDate, endDate, startDate, endDate]
  );

  return rows.map((r) => {
    const cum = Number(r.debetCum) - Number(r.kreditCum);
    const mut = Number(r.debetMut) - Number(r.kreditMut);
    const section = sectionOf(r.kode);
    const normal = normalSaldoOf(section);
    return {
      kode: r.kode,
      nama: r.nama,
      section,
      // saldo utk pendapatan/kewajiban/ekuitas = kredit − debet
      saldoCum: normal === "D" ? cum : -cum,
      saldoMut: normal === "D" ? mut : -mut,
    };
  });
};

const groupRows = (recs, seluruh, pickSaldo) => {
  const groups = [];
  for (const g of seluruh) {
    const accounts = recs
      .filter((r) => r.section === g.key)
      .map((r) => ({
        kode: r.kode,
        nama: r.nama,
        saldo: pickSaldo(r),
      }));
    groups.push({
      key: g.key,
      label: g.label,
      accounts,
      total: accounts.reduce((s, a) => s + a.saldo, 0),
    });
  }
  return groups;
};

// ── NERACA (saldo kumulatif s/d endDate) ───────────────────────────────
const getNeraca = async (endDate) => {
  const recs = await getSaldoPerRekening("0000-01-01", endDate, "all");
  const recsCum = recs.filter((r) => r.section !== "EXCLUDE");

  const aktivaSections = [
    { key: "AKTIVA_KAS", label: "KAS & SETARA KAS" },
    { key: "AKTIVA_PIUTANG", label: "PIUTANG" },
    { key: "AKTIVA_PERSEDIAAN", label: "PERSEDIAAN" },
    { key: "AKTIVA_DIMUKA", label: "BIAYA DIBAYAR DIMUKA" },
    { key: "AKTIVA_PAJAK", label: "PAJAK DIBAYAR DIMUKA" },
    { key: "AKTIVA_TETAP", label: "ASET TETAP" },
    { key: "AKUM_PENYUSUTAN", label: "AKUMULASI PENYUSUTAN" },
  ];
  const totalAkum = recsCum
    .filter((r) => r.section === "AKUM_PENYUSUTAN")
    .reduce((s, r) => s + (-r.saldoCum), 0); // akum = kredit → tampil negatif

  const aktiva = groupRows(recsCum, aktivaSections, (r) => r.saldoCum);

  const pasivaSections = [
    { key: "KEWAJIBAN", label: "KEWAJIBAN (HUTANG)" },
    { key: "EKUITAS", label: "MODAL & EKUITAS" },
  ];
  const pasiva = groupRows(recsCum, pasivaSections, (r) => r.saldoCum);

  // LABA (RUGI) TAHUN BERJALAN: pendapatan − HPP − beban, kumulatif s/d endDate
  const labaRugi = recsCum.reduce((acc, r) => {
    if (r.section.startsWith("PENDAPATAN")) return acc + r.saldoCum;
    if (r.section === "HPP" || r.section.startsWith("BEBAN")) return acc - r.saldoCum;
    return acc;
  }, 0);

  const totalAktiva = aktiva.reduce((s, g) => s + g.total, 0);
  const totalKewajiban = pasiva.find((g) => g.key === "KEWAJIBAN")?.total ?? 0;
  const totalEkuitasRekening =
    pasiva.find((g) => g.key === "EKUITAS")?.total ?? 0;
  const totalEkuitas = totalEkuitasRekening + labaRugi;
  const selisih = totalAktiva - (totalKewajiban + totalEkuitas);

  // baris sinetik "LABA (RUGI) TAHUN BERJALAN" → tempel di group EKUITAS
  const ekuitasGroup = pasiva.find((g) => g.key === "EKUITAS");
  if (ekuitasGroup)
    ekuitasGroup.accounts.push({
      kode: "0.000",
      nama: "LABA (RUGI) TAHUN BERJALAN",
      saldo: labaRugi,
    });

  return {
    tanggal: endDate,
    aktiva,
    pasiva,
    labaRugi,
    total: {
      aktiva: totalAktiva,
      akumulasiPenyusutan: totalAkum,
      kewajiban: totalKewajiban,
      ekuitas: totalEkuitas,
      selisih,
      balanced: Math.abs(selisih) < 0.01,
    },
  };
};

// ── LABA RUGI (mutasi periode) ─────────────────────────────────────────
const getLabaRugi = async (startDate, endDate, cabang = "all") => {
  const recs = await getSaldoPerRekening(startDate, endDate, cabang);
  const recsMut = recs.filter((r) => r.section !== "EXCLUDE");

  const sections = [
    { key: "PENDAPATAN_PENJUALAN", label: "PENDAPATAN PENJUALAN" },
    { key: "HPP", label: "BIAYA PRODUKSI (HPP)" },
    { key: "BEBAN_OPERASIONAL", label: "BEBAN OPERASIONAL" },
    { key: "PENDAPATAN_LAIN", label: "PENDAPATAN LAIN-LAIN" },
    { key: "BEBAN_NONOPERASIONAL", label: "BEBAN NON-OPERASIONAL" },
  ];
  const groups = groupRows(recsMut, sections, (r) => r.saldoMut);

  const pendapatanPenjualan =
    groups.find((g) => g.key === "PENDAPATAN_PENJUALAN")?.total ?? 0;
  const hpp = groups.find((g) => g.key === "HPP")?.total ?? 0;
  const bebanOperasional =
    groups.find((g) => g.key === "BEBAN_OPERASIONAL")?.total ?? 0;
  const pendapatanLain =
    groups.find((g) => g.key === "PENDAPATAN_LAIN")?.total ?? 0;
  const bebanNonOperasional =
    groups.find((g) => g.key === "BEBAN_NONOPERASIONAL")?.total ?? 0;

  const labaKotor = pendapatanPenjualan - hpp;
  const labaOperasional = labaKotor - bebanOperasional;
  const labaBersih =
    labaOperasional + pendapatanLain - bebanNonOperasional;

  return {
    periode: { start: startDate, end: endDate },
    cabang: String(cabang || "all"),
    groups,
    total: {
      pendapatanPenjualan,
      hpp,
      labaKotor,
      bebanOperasional,
      labaOperasional,
      pendapatanLain,
      bebanNonOperasional,
      labaBersih,
    },
  };
};

module.exports = { getNeraca, getLabaRugi, sectionOf };
