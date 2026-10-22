const db = require("../config/database");

/**
 * Jurnal otomatis Invoice Pembelian (tipetransaksi 'INV').
 *
 * Pola:
 *   Dr  Persediaan per item  -> rekening dari jenis barang (tgroup.gr_rek_kode)
 *   Dr  PPN Masukan (16.001) -> inv_taxamount (jika bertax)
 *   Cr  Pot. Pembelian (21.005) -> total disc faktur (dari persen + nominal)
 *   Cr  Hutang Dagang (19.002)  -> inv_amount
 *
 * Nomor jurnal = nomor invoice ⇒ hapus/ganti cukup dengan jur_no yang sama
 * (idempotent), tidak butuh kolom tambahan seperti jur_otomatis.
 *
 * Skema nilai (harus balance):
 *   istax = 0 : persediaan = bruto          ; kredit  = disc + amount(= bruto - disc)
 *   istax = 1 : persediaan = bruto - tax    ; kredit  = disc + amount(= basis, PPN incl)
 *   istax = 2 : persediaan = bruto          ; kredit  = disc + amount(= basis + tax)
 *
 * Disc faktur selalu tampil via Cr Pot. Pembelian, jadi pas laidanya:
 * Dr Persediaan (bruto, net of PPN-if-incl) == Cr Pot. Pembelian + Cr Hutang. ✓
 */

const REK_HUTANG = "19.002"; // HUTANG DAGANG
const REK_POT = "21.005"; // POTONGAN PEMBELIAN
const REK_PPN_MASUKAN = "16.001"; // PPN MASUKAN
const REK_PERSEDIAAN_DEFAULT = "17.001"; // PERSEDIAAN BARANG

const AUTO_TIPE = "INV";

// Nilai kotor sebuah baris (qty x harga dikurangi disc per baris)
const lineGrossOf = (d) => {
  const gross = (Number(d.qty) || 0) * (Number(d.harga) || 0);
  return gross - (gross * (Number(d.discPr) || 0)) / 100;
};

const jurNoOf = (invNomor) => invNomor;

// ── Total nilai persediaan yang akan di-debit ────────────────────────
// bruto = Σ(qty x harga x (1 - disc per baris)). Disc faktur TIDAK mengurangi
// debet persediaan karena sudah dipisahkan lewat Cr Pot. Pembelian.
// PPN yang termasuk harga (istax=1) tidak boleh masuk biaya persediaan.
const hitungPersediaanTotal = ({ isTax, bruto, taxAmount }) => {
  const potonganPpn = Number(isTax) === 1 ? Math.max(Math.round(taxAmount), 0) : 0;
  return Math.max(bruto - potonganPpn, 0);
};

// ── Rincian debet per item dengan alokasi merata + residual di baris akhir ─
const alokasiPerItem = ({ detail, isTax, persediaanTotal }) => {
  const bruto = detail.reduce((s, d) => s + lineGrossOf(d), 0);
  const factor = bruto > 0 ? persediaanTotal / bruto : 0;

  const rows = [];
  let sisaPersediaan = Math.round(persediaanTotal);

  detail
    .slice()
    .sort((a, b) => (a.nourut || 0) - (b.nourut || 0))
    .forEach((d, i, arr) => {
      let nilai;
      if (i === arr.length - 1) {
        // baris akhir menyerap selisih pembulatan supaya total persis
        nilai = sisaPersediaan;
      } else {
        nilai = Math.round(lineGrossOf(d) * factor);
        sisaPersediaan -= nilai;
      }
      if (nilai !== 0) {
        rows.push({ brgKode: d.brgKode, brgNama: d.brgNama || "", nilai, satuan: d.satuan || "" });
      }
    });

  return rows;
};

// ── Buat/Perbarui jurnal otomatis invoice ─────────────────────────────
// data: { nomor, tanggal, keterangan, isTax, taxAmount, discTotal, amount, detail, supNama, user }
const createAutoJurnalInv = async (conn, data) => {
  const {
    nomor, tanggal, keterangan, isTax, taxAmount,
    discTotal, amount, detail, supNama, user,
  } = data;

  await deleteAutoJurnalInv(conn, nomor);

  const bruto = detail.reduce((s, d) => s + lineGrossOf(d), 0);
  if (bruto <= 0) return null; // tidak ada nilai, tidak perlu jurnal

  const tax = Math.round(taxAmount) || 0;
  const diskonFaktur = Math.round(discTotal) || 0;
  const persediaanTotal = hitungPersediaanTotal({ isTax, bruto, taxAmount: tax });

  // Rekening persediaan tiap barang (bulk)
  const brgKodes = detail.map((d) => d.brgKode).filter(Boolean);
  const rekMap = {};
  if (brgKodes.length) {
    const placeholders = brgKodes.map(() => "?").join(",");
    const [rows] = await conn.query(
      `SELECT b.brg_kode AS kode, b.brg_nama AS brgNama,
              g.gr_rek_kode AS rek, r.REK_NAMA AS rekNama
       FROM tbarang b
       LEFT JOIN tgroup g ON b.brg_gr_kode = g.gr_kode
       LEFT JOIN trekening r ON r.REK_KODE = g.gr_rek_kode
       WHERE b.brg_kode IN (${placeholders})`,
      brgKodes
    );
    rows.forEach((r) => (rekMap[r.kode] = r));
  }

  const jurNo = jurNoOf(nomor);

  // Header
  await conn.query(
    `INSERT INTO tjurnal
       (jur_no, jur_tanggal, jur_tipetransaksi, jur_keterangan,
        jur_isclosed, date_create, user_create)
     VALUES (?, ?, ?, ?, 0, NOW(), ?)`,
    [
      jurNo,
      tanggal,
      AUTO_TIPE,
      keterangan || `Pembelian Per Faktur ${supNama || ""}`.trim(),
      user || "SYSTEM",
    ]
  );

  // Detail — debet dulu, lalu kredit
  const items = alokasiPerItem({ detail, isTax, persediaanTotal });
  let nourut = 0;
  let totalDebet = 0;
  let totalKredit = 0;

  for (const it of items) {
    const rek = rekMap[it.brgKode]?.rek || REK_PERSEDIAAN_DEFAULT;
    const nama = rekMap[it.brgKode]?.brgNama || it.brgNama;
    nourut++;
    totalDebet += it.nilai;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [jurNo, rek, nourut, `Pembelian ${nama}`.slice(0, 250), it.nilai]
    );
  }

  if (tax > 0) {
    nourut++;
    totalDebet += tax;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [jurNo, REK_PPN_MASUKAN, nourut, `PPN Masukan ${nomor}`, tax]
    );
  }

  if (diskonFaktur > 0) {
    nourut++;
    totalKredit += diskonFaktur;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [jurNo, REK_POT, nourut, `Potongan Pembelian ${nomor}`, diskonFaktur]
    );
  }

  const hutang = Math.round(amount);
  nourut++;
  totalKredit += hutang;
  await conn.query(
    `INSERT INTO tjurnalitem
       (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
     VALUES (?, ?, ?, ?, 0, ?)`,
    [jurNo, REK_HUTANG, nourut, `Hutang ${nomor} - ${supNama || ""}`.trim().slice(0, 250), hutang]
  );

  // Setelahnya harus balance: debet(persediaan+ppn) == kredit(potongan+hutang)
  if (totalDebet !== totalKredit) {
    throw new Error(
      `Jurnal INV tidak balance (D:${totalDebet} K:${totalKredit}) untuk ${nomor}.`
    );
  }

  return jurNo;
};

// ── Hapus jurnal otomatis invoice (dipakai juga saat edit → regenerasi) ─
const deleteAutoJurnalInv = async (conn, nomor) => {
  const jurNo = jurNoOf(nomor);
  await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [jurNo]);
  await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [jurNo]);
};

// ── Validasi rekening masternya ada (dipanggil saat service init/test) ─
const cekRekeningJurnal = async () => {
  const [rows] = await db.query(
    `SELECT REK_KODE, REK_NAMA FROM trekening
      WHERE REK_KODE IN (?, ?, ?, ?) ORDER BY REK_KODE`,
    [REK_HUTANG, REK_POT, REK_PPN_MASUKAN, REK_PERSEDIAAN_DEFAULT]
  );
  return rows;
};

module.exports = {
  REK_HUTANG,
  REK_POT,
  REK_PPN_MASUKAN,
  REK_PERSEDIAAN_DEFAULT,
  AUTO_TIPE,
  jurNoOf,
  lineGrossOf,
  hitungPersediaanTotal,
  alokasiPerItem,
  createAutoJurnalInv,
  deleteAutoJurnalInv,
  cekRekeningJurnal,
};
