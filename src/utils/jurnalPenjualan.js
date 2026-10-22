const db = require("../config/database");

/**
 * Jurnal otomatis Penjualan (SO) - penjualan langsung / kasir multi-metode.
 *
 * Skema per nota (nomor jurnal = nomor SO; idempotent, regenerasi saat edit):
 *
 *   Dr 11.002 KAS BESAR          = so_dp     (cash diterima - kembalian)
 *   Dr 12.001 BANK               = so_card   (card / debit)
 *   Dr 14.001 PIUTANG DAGANG     = so_piutang
 *   Dr 21.004 POTONGAN PENJULAN  = diskon faktur + voucher
 *   Dr 23.001 BIAYA PRODUKSI     = Σ (qty keluar x HPP barang)   [HPP penjualan]
 *   Cr 21.001 PENJUALAN BARANG   = bruto barang (Σ qty x harga x disc item)
 *   Cr 17.00x PERSEDIAAN         = Σ (qty keluar x HPP barang), rekening
 *                                  grup barang (tgroup.gr_rek_kode)
 *   Cr 23.018 BY KIRIM           = so_ongkir (ongkir ditagih ke customer => kredit/minus biaya)
 *   Cr 19.005 PPN KELUARAN       = so_taxamount (bila pajak)
 *
 * Balance terjamin dari angka sebenarnya:
 *   kas+bank+piutang = (amount+ongkir) - voucher   (=enforcer saveData)
 *   potongan         = (bruto - (amount - tax)) + voucher
 *   hpp              = persediaan keluar (sumber sama, Dr 26.001 vs Cr 17.00x)
 *   => debit total   = amount+ongkir-voucher + bruto-amount+tax + voucher + hpp = bruto + ongkir + tax + hpp
 *   => kredit total  = bruto + ongkir + tax + hpp
 */

const REK_KAS = "11.002"; // KAS BESAR
const REK_BANK = "12.001"; // BANK
const REK_PIUTANG = "14.001"; // PIUTANG DAGANG
const REK_POTONGAN = "21.004"; // POTONGAN PENJUALAN
const REK_PENJUALAN = "21.001"; // PENJUALAN BARANG
const REK_HPP = "26.001"; // BPP (= HPP penjualan)
const REK_PERSEDIAAN_FALLBACK = "17.004"; // PERSEDIAAN BARANG JADI
const REK_ONGKIR = "23.018"; // BY KIRIM
const REK_PPN = "19.005"; // PPN KELUARAN

const TIPE = "SO";

const deleteAutoJurnalPenjualan = async (conn, nomor) => {
  await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [nomor]);
  await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [nomor]);
};

// ── Tulis jurnal + assert balance ─────────────────────────────────────
const writeJurnal = async (conn, { jurNo, tanggal, tipe, keterangan, user, debets, kredits }) => {
  const dts = debets.filter((r) => r.nilai > 0);
  const crs = kredits.filter((r) => r.nilai > 0);
  if (dts.length === 0 && crs.length === 0) return null;

  const totalDebet = dts.reduce((s, r) => s + r.nilai, 0);
  const totalKredit = crs.reduce((s, r) => s + r.nilai, 0);
  if (Math.round(totalDebet) !== Math.round(totalKredit)) {
    throw new Error(
      `Jurnal penjualan ${jurNo} tidak balance (D:${Math.round(totalDebet)} K:${Math.round(totalKredit)}).`
    );
  }
  if (totalDebet <= 0) return null;

  await conn.query(
    `INSERT INTO tjurnal
       (jur_no, jur_tanggal, jur_tipetransaksi, jur_keterangan,
        jur_isclosed, date_create, user_create)
     VALUES (?, ?, ?, ?, 0, NOW(), ?)`,
    [jurNo, tanggal, tipe || TIPE, keterangan || (tipe || TIPE), user || "SYSTEM"]
  );

  let nourut = 0;
  for (const r of dts) {
    nourut++;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [jurNo, r.rek, nourut, r.ket.slice(0, 250), r.nilai]
    );
  }
  for (const r of crs) {
    nourut++;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [jurNo, r.rek, nourut, r.ket.slice(0, 250), r.nilai]
    );
  }
  return jurNo;
};

// ── Akun persediaan barang cabang (master cabang → fallback tgroup) ────
const getCabangRek = async (conn, cabangKode) => {
  const [[c]] = await conn.query(
    `SELECT cbg_rek_persediaan FROM tcabang WHERE cbg_kode = ?`,
    [cabangKode]
  );
  const rek = String(c?.cbg_rek_persediaan || "").trim();
  return rek || null;
};

// ── Jurnal Penjualan: dibaca dari tso_hdr/tso_dtl yang sudah ter-insert ──
// data: { nomor, user, cabang }
const createAutoJurnalPenjualan = async (conn, data) => {
  const { nomor, user, cabang } = data;

  await deleteAutoJurnalPenjualan(conn, nomor);

  const [[h]] = await conn.query(
    `SELECT so_tanggal, so_cus_kode, so_memo,
            so_amount, so_taxamount, so_ongkir,
            so_dp, so_voucher, so_no_voucher, so_card, so_piutang
        FROM tso_hdr WHERE so_nomor = ?`,
    [nomor]
  );
  if (!h) return null;

  const amount = Math.round(Number(h.so_amount) || 0);
  const tax = Math.round(Number(h.so_taxamount) || 0);
  const ongkir = Math.round(Number(h.so_ongkir) || 0);
  const kas = Math.round(Number(h.so_dp) || 0);
  const bank = Math.round(Number(h.so_card) || 0);
  const piutang = Math.round(Number(h.so_piutang) || 0);
  const voucher = Math.round(Number(h.so_voucher) || 0);

  // Bruto barang = nilai barang sebelum diskon faktur (uang muka a.k.a. potongan)
  const [[dt]] = await conn.query(
    `SELECT ROUND(COALESCE(SUM(sod_qty * (sod_harga * (100 - IFNULL(sod_discpr, 0)) / 100)), 0)) AS bruto
        FROM tso_dtl WHERE sod_so_nomor = ?`,
    [nomor]
  );
  const bruto = Math.round(Number(dt?.bruto) || 0);
  if (bruto <= 0 && kas <= 0 && bank <= 0 && piutang <= 0) return null;

  // Diskon faktur yang benar-benar diterapkan = bruto - (amount setelah pajak dipisah)
  const potongan = Math.max(0, bruto - Math.max(0, amount - tax)) + voucher;

  const [[cus]] = await conn.query(`SELECT cus_nama FROM tcustomer WHERE cus_kode = ?`, [h.so_cus_kode]);
  const cusNama = cus?.cus_nama || String(h.so_cus_kode || "");

  // Tentukan rekening persediaan cabang (misal cabang '01' / AA -> cbg_rek_persediaan atau fallback grup/default)
  const cabangAktif = cabang || "00";
  const rekPersediaanCabang = await getCabangRek(conn, cabangAktif);

  // ── HPP penjualan: dari baris stok-keluar milik nota ini ──
  const [hppRows] = await conn.query(
    `SELECT ms.mst_brg_kode AS brgKode, ms.mst_stok_out AS stokOut, ms.mst_avgcost AS avgcost,
            IFNULL(g.gr_rek_kode, '') AS rek
       FROM tmasterstok ms
       LEFT JOIN tbarang b ON b.brg_kode = ms.mst_brg_kode
       LEFT JOIN tgroup g ON g.gr_kode = b.brg_gr_kode
      WHERE ms.mst_noreferensi = ? AND ms.mst_stok_out > 0`,
    [nomor]
  );
  const persediaanMap = {}; // rek → { nama, nilai }
  let totalHpp = 0;
  for (const r of hppRows || []) {
    const nilai = (Number(r.stokOut) || 0) * (Number(r.avgcost) || 0);
    if (nilai <= 0) continue;
    // Jika ada setting akun persediaan khusus cabang (misal AA), gunakan itu, jika tidak pakai grup barang / fallback
    const rek = rekPersediaanCabang || r.rek || REK_PERSEDIAAN_FALLBACK;
    if (!persediaanMap[rek]) persediaanMap[rek] = { nama: r.brgKode, nilai: 0 };
    else persediaanMap[rek].nama += ` + ${r.brgKode}`;
    persediaanMap[rek].nilai += nilai;
    totalHpp += nilai;
  }

  const debets = [
    { rek: REK_KAS, ket: `Kas tunai penjualan ${nomor} - ${cusNama}`, nilai: kas },
    { rek: REK_BANK, ket: `Card pembayaran ${nomor}`, nilai: bank },
    { rek: REK_PIUTANG, ket: `Piutang penjualan ${nomor} - ${cusNama}`, nilai: piutang },
    {
      rek: REK_POTONGAN,
      ket: `Potongan penjualan ${nomor}${voucher ? ` (voucher ${h.so_no_voucher || ""})` : ""}`,
      nilai: potongan,
    },
    { rek: REK_HPP, ket: `HPP penjualan ${nomor} - ${cusNama}`, nilai: Math.round(totalHpp) },
  ];
  const kredits = [
    { rek: REK_PENJUALAN, ket: `Penjualan barang ${nomor} - ${cusNama}`, nilai: bruto },
    { rek: REK_ONGKIR, ket: `Ongkir ditagih penjualan ${nomor}`, nilai: ongkir },
    { rek: REK_PPN, ket: `PPN keluaran ${nomor}`, nilai: tax },
  ];
  for (const [rek, v] of Object.entries(persediaanMap)) {
    kredits.push({
      rek,
      ket: `Persediaan keluar ${nomor} (${v.nama})`,
      nilai: Math.round(v.nilai),
    });
  }

  return writeJurnal(conn, {
    jurNo: nomor,
    tanggal: h.so_tanggal,
    keterangan: `Penjualan langsung ${nomor} - ${cusNama}${h.so_memo ? ` - ${h.so_memo}` : ""}`,
    user,
    debets,
    kredits,
  });
};

module.exports = {
  TIPE,
  REK_KAS,
  REK_BANK,
  REK_PIUTANG,
  REK_POTONGAN,
  REK_PENJUALAN,
  REK_ONGKIR,
  REK_PPN,
  createAutoJurnalPenjualan,
  deleteAutoJurnalPenjualan,
};
