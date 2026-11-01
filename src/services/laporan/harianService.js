const db = require("../../config/database");
const penjualanService = require("../transaksi/penjualanService");
const penerimaanLainService = require("../accounting/penerimaanLainService");
const pembayaranLainService = require("../accounting/pembayaranLainService");
const bayarCustomerService = require("../transaksi/bayarCustomerService");

// ── Helper: klasifikasi metode bayar dari akun kas/bank ───────────────
// 11.% = Kas (tunai), 12.% = Bank (transfer/kartu), lainnya = deposit/UM
const metodeOf = (rekKode) => {
  const kode = String(rekKode || "").trim();
  if (kode.startsWith("11.")) return "CASH";
  if (kode.startsWith("12.")) return "TRANSFER";
  return "LAIN";
};

const isRekKasBank = (rekKode) => {
  const kode = String(rekKode || "").trim();
  return kode.startsWith("11.") || kode.startsWith("12.") || kode === "19.001";
};

// ── Browse 4 transaksi untuk satu tanggal ─────────────────────────────
const getBrowse = async (tanggal, cabang) => {
  const [penjualan, penerimaanLain, pembayaranLain, bayarCustomer] =
    await Promise.all([
      penjualanService.getBrowse(tanggal, tanggal, cabang),
      penerimaanLainService.getBrowse(tanggal, tanggal, cabang),
      pembayaranLainService.getBrowse(tanggal, tanggal, cabang),
      bayarCustomerService.getAllHistory(tanggal, tanggal, cabang),
    ]);
  return { penjualan, penerimaanLain, pembayaranLain, bayarCustomer };
};

// ── Ambil baris kas/bank (jurd_nourut=0) untuk Penerimaan/Pembayaran Lain
// Paritas form: Penerimaan Lain header DEBET kas/bank,
//               Pembayaran Lain header KREDIT kas/bank.
const getKasBankLainRows = async (tanggal, cabang) => {
  let sql = `
    SELECT
      j.jur_no AS nomor,
      j.jur_tipetransaksi AS tipe,
      d.jurd_rek_kode AS rekKode,
      IFNULL(r.rek_nama, '') AS rekNama,
      SUM(d.jurd_debet) AS debet,
      SUM(d.jurd_kredit) AS kredit
    FROM tjurnal j
    INNER JOIN tjurnalitem l ON l.jurd_jur_no = j.jur_no AND l.jurd_nourut = 0
    INNER JOIN tjurnalitem d ON d.jurd_jur_no = j.jur_no AND d.jurd_nourut = 0
    LEFT JOIN trekening r ON r.rek_kode = d.jurd_rek_kode
    WHERE j.jur_tipetransaksi IN ('Penerimaan Lain', 'Pembayaran Lain')
      AND DATE(j.jur_tanggal) = DATE(?)`;
  const params = [tanggal];
  if (cabang && String(cabang) !== "00") {
    sql += ` AND j.jur_no LIKE ?`;
    params.push(`${cabang}-%`);
  }
  sql += ` GROUP BY j.jur_no, j.jur_tipetransaksi, d.jurd_rek_kode`;
  const [rows] = await db.query(sql, params);
  return rows;
};

// ── Cetak: ringkasan Cash vs Transfer + rincian 4 transaksi ───────────
const getPrintData = async (tanggal, cabang) => {
  const browse = await getBrowse(tanggal, cabang);
  const kasBankRows = await getKasBankLainRows(tanggal, cabang);

  const mapTerima = new Map();  // nomor Penerimaan Lain  -> {rek, nilai}
  const mapBayar = new Map();   // nomor Pembayaran Lain   -> {rek, nilai}
  for (const r of kasBankRows) {
    const nilai = r.tipe === "Penerimaan Lain"
      ? (Number(r.debet) || 0)
      : (Number(r.kredit) || 0);
    const m = { rekKode: r.rekKode, rekNama: r.rekNama, metode: metodeOf(r.rekKode), nilai };
    if (r.tipe === "Penerimaan Lain") mapTerima.set(r.nomor, m);
    else mapBayar.set(r.nomor, m);
  }

  // ── Rincian Penerimaan Lain (masuk) ──
  const penerimaanLain = browse.penerimaanLain.map((x) => ({
    nomor: x.Nomor,
    tanggal: String(x.Tanggal),
    keterangan: x.Keterangan,
    nilai: Number(x.Nilai) || 0,
    rekKode: mapTerima.get(x.Nomor)?.rekKode || "",
    rekNama: mapTerima.get(x.Nomor)?.rekNama || "",
    metode: mapTerima.get(x.Nomor)?.metode || "LAIN",
  }));

  // ── Rincian Pembayaran Lain (keluar) ──
  const pembayaranLain = browse.pembayaranLain.map((x) => ({
    nomor: x.Nomor,
    tanggal: String(x.Tanggal),
    keterangan: x.Keterangan,
    nilai: Number(x.Nilai) || 0,
    rekKode: mapBayar.get(x.Nomor)?.rekKode || "",
    rekNama: mapBayar.get(x.Nomor)?.rekNama || "",
    metode: mapBayar.get(x.Nomor)?.metode || "LAIN",
  }));

  // ── Rincian Pembayaran Customer (metode per byc_rek_kode) ──
  const bayarCustomer = browse.bayarCustomer.map((x) => ({
    nomor: x.NOMOR,
    tanggal: String(x.TANGGAL),
    customer: x.CUS_NAMA || x.CUS_KODE || "",
    rekKode: x.REK_KODE || "",
    rekNama: x.REK_NAMA || "",
    metode: metodeOf(x.REK_KODE),
    nilai: Number(x.TOTAL_BAYAR) || 0,
  }));

  // ── Rincian Penjualan (cash=so_dp, transfer=so_card; voucher/piutang di luar setoran) ──
  const penjualanDetail = browse.penjualan.map((x) => ({
    nomor: x.Nomor,
    tanggal: String(x.Tanggal),
    customer: x.Customer || "",
    cash: Number(x.Cash) || 0,
    transfer: Number(x.Card) || 0,
    voucher: Number(x.Voucher) || 0,
    piutang: Number(x.Piutang) || 0,
    total: Number(x.Total) || 0,
  }));

  const tot = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);

  // ── Ringkasan Cash vs Transfer ──
  const summary = {
    // UANG MASUK
    masukCash:
      tot(penjualanDetail, (x) => x.cash) +
      tot(penerimaanLain.filter((x) => x.metode === "CASH"), (x) => x.nilai) +
      tot(bayarCustomer.filter((x) => x.metode === "CASH"), (x) => x.nilai),
    masukTransfer:
      tot(penjualanDetail, (x) => x.transfer) +
      tot(penerimaanLain.filter((x) => x.metode === "TRANSFER"), (x) => x.nilai) +
      tot(bayarCustomer.filter((x) => x.metode === "TRANSFER"), (x) => x.nilai),
    masukLain:
      tot(penerimaanLain.filter((x) => x.metode === "LAIN"), (x) => x.nilai) +
      tot(bayarCustomer.filter((x) => x.metode === "LAIN"), (x) => x.nilai),
    voucher: tot(penjualanDetail, (x) => x.voucher),
    piutang: tot(penjualanDetail, (x) => x.piutang),
    // KELUAR (Pembayaran Lain)
    keluarCash:
      tot(pembayaranLain.filter((x) => x.metode === "CASH"), (x) => x.nilai),
    keluarTransfer:
      tot(pembayaranLain.filter((x) => x.metode === "TRANSFER"), (x) => x.nilai),
    keluarLain:
      tot(pembayaranLain.filter((x) => x.metode === "LAIN"), (x) => x.nilai),
  };
  summary.totalMasukCash = summary.masukCash;
  summary.totalMasukTransfer = summary.masukTransfer;
  summary.setoranKas = summary.masukCash - summary.keluarCash; // uang fisik disetor
  summary.sisaTransfer = summary.masukTransfer - summary.keluarTransfer;

  // ── Header perusahaan & nama cabang ──
  let [[perusahaan]] = await db.query(
    `SELECT perush_nama, perush_alamat, perush_kota, perush_notelp FROM tperusahaan LIMIT 1`
  );
  perusahaan = perusahaan || {};
  let namaCabang = "Semua Cabang";
  if (cabang && String(cabang) !== "00") {
    const [[c]] = await db.query(
      `SELECT cbg_nama AS nama FROM tcabang WHERE cbg_kode = ?`, [cabang]
    );
    namaCabang = c?.nama || cabang;
  }

  // ── Header cetak: NAMA + ALAMAT CABANG (dari tcabang) ──
  // Fallback ke tperusahaan bila data header cabang kosong / user pusat.
  let perusahaanInfo;
  if (cabang && String(cabang) !== "00") {
    const [[c]] = await db.query(
      `SELECT cbg_nama, cbg_alamat, cbg_kota, cbg_headerNama, cbg_headerAlamat, cbg_headerTelp
         FROM tcabang WHERE cbg_kode = ?`, [cabang]
    );
    // Prioritas: cbg_headerNama/Alamat/Telp (dipakai faktur) → data cabang → tperusahaan
    if (c && (c.cbg_headerNama || c.cbg_headerAlamat || c.cbg_headerTelp)) {
      perusahaanInfo = {
        nama: c.cbg_headerNama || c.cbg_nama || "",
        alamat: c.cbg_headerAlamat || c.cbg_alamat || "",
        kota: "",
        notelp: c.cbg_headerTelp || "",
      };
    } else if (c && (c.cbg_nama || c.cbg_alamat)) {
      perusahaanInfo = {
        nama: c.cbg_nama || "",
        alamat: [c.cbg_alamat, c.cbg_kota].filter(Boolean).join(", "),
        kota: "",
        notelp: perusahaan.perush_notelp || "",
      };
    } else {
      perusahaanInfo = {
        nama: perusahaan.perush_nama || "",
        alamat: perusahaan.perush_alamat || "",
        kota: "",
        notelp: perusahaan.perush_notelp || "",
      };
    }
  } else {
    perusahaanInfo = {
      nama: perusahaan.perush_nama || "",
      alamat: perusahaan.perush_alamat || "",
      kota: "",
      notelp: perusahaan.perush_notelp || "",
    };
  }

  return {
    tanggal: String(tanggal),
    cabang: cabang || "00",
    namaCabang,
    perusahaan: {
      nama: perusahaanInfo.nama,
      alamat: perusahaanInfo.alamat,
      kota: perusahaanInfo.kota,
      notelp: perusahaanInfo.notelp,
    },
    summary,
    penjualanDetail,
    penerimaanLain,
    pembayaranLain,
    bayarCustomer,
  };
};

module.exports = { getBrowse, getPrintData, metodeOf, isRekKasBank };
