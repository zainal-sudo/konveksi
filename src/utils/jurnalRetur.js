const {
  REK_HUTANG, REK_POT, REK_PPN_MASUKAN, REK_PERSEDIAAN_DEFAULT,
  lineGrossOf, hitungPersediaanTotal, alokasiPerItem,
} = require("./jurnalInv");

/**
 * Jurnal otomatis Retur Pembelian (tipetransaksi 'RET').
 *
 * Kebalikan polaritas jurnal invoice — retur mengembalikan barang ke supplier,
 * jadi persediaan & PPN masukan yang kemudian naik, hutang menurun:
 *   Cr  Persediaan per item  -> rekening jenis barang (tgroup.gr_rek_kode)
 *   Cr  PPN Masukan (16.001) -> ret_taxamount (jika bertax)
 *   Dr  Pot. Pembelian (21.005) -> total disc faktur retur (balik potongan)
 *   Dr  Hutang Dagang (19.002)  -> ret_amount
 *
 * Nomor jurnal = nomor retur (idempotent, regenerasi saat edit).
 * Balance untuk semua istax (cermin jurnal invoice):
 *   istax = 0 : Cr bruto == Dr disc + Dr amount
 *   istax = 1 : Cr (bruto - tax) + Cr tax == Dr disc + Dr amount
 *   istax = 2 : Cr bruto + Cr tax == Dr disc + Dr amount
 */

const RETUR_TIPE = "RET";

const jurNoReturOf = (retNomor) => retNomor;

// ── Buat/Perbarui jurnal otomatis retur ───────────────────────────────
// data: { nomor, tanggal, isTax, taxAmount, discTotal, amount, detail, supNama, user }
const createAutoJurnalRetur = async (conn, data) => {
  const {
    nomor, tanggal, isTax, taxAmount,
    discTotal, amount, detail, supNama, user,
  } = data;

  await deleteAutoJurnalRetur(conn, nomor);

  const bruto = detail.reduce((s, d) => s + lineGrossOf(d), 0);
  if (bruto <= 0) return null; // tidak ada nilai, tidak perlu jurnal

  const tax = Math.max(Math.round(Number(taxAmount) || 0), 0);
  const diskonFaktur = Math.max(Math.round(Number(discTotal) || 0), 0);
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

  const jurNo = jurNoReturOf(nomor);

  // Header
  await conn.query(
    `INSERT INTO tjurnal
       (jur_no, jur_tanggal, jur_tipetransaksi, jur_keterangan,
        jur_isclosed, date_create, user_create)
     VALUES (?, ?, ?, ?, 0, NOW(), ?)`,
    [
      jurNo,
      tanggal,
      RETUR_TIPE,
      `Retur Pembelian ${supNama || ""}`.trim(),
      user || "SYSTEM",
    ]
  );

  // Detail — kredit dulu (Persediaan/PPN), lalu debet (Pot. Pembelian/Hutang)
  const items = alokasiPerItem({ detail, isTax, persediaanTotal });
  let nourut = 0;
  let totalDebet = 0;
  let totalKredit = 0;

  for (const it of items) {
    const rek = rekMap[it.brgKode]?.rek || REK_PERSEDIAAN_DEFAULT;
    const nama = rekMap[it.brgKode]?.brgNama || it.brgNama;
    nourut++;
    totalKredit += it.nilai;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [jurNo, rek, nourut, `Retur ${nama}`.slice(0, 250), it.nilai]
    );
  }

  if (tax > 0) {
    nourut++;
    totalKredit += tax;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [jurNo, REK_PPN_MASUKAN, nourut, `PPN Masukan Dikutip Retur ${nomor}`, tax]
    );
  }

  if (diskonFaktur > 0) {
    nourut++;
    totalDebet += diskonFaktur;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [jurNo, REK_POT, nourut, `Balik Potongan Retur ${nomor}`, diskonFaktur]
    );
  }

  const hutang = Math.round(amount);
  nourut++;
  totalDebet += hutang;
  await conn.query(
    `INSERT INTO tjurnalitem
       (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [jurNo, REK_HUTANG, nourut, `Kurangi Hutang Retur ${nomor} - ${supNama || ""}`.trim().slice(0, 250), hutang]
  );

  // Harus balance: kebalikan asersi jurnal invoice
  if (totalDebet !== totalKredit) {
    throw new Error(
      `Jurnal RET tidak balance (D:${totalDebet} K:${totalKredit}) untuk ${nomor}.`
    );
  }

  return jurNo;
};

// ── Hapus jurnal otomatis retur (dipakai juga saat edit → regenerasi) ──
const deleteAutoJurnalRetur = async (conn, nomor) => {
  const jurNo = jurNoReturOf(nomor);
  await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [jurNo]);
  await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [jurNo]);
};

module.exports = {
  RETUR_TIPE,
  createAutoJurnalRetur,
  deleteAutoJurnalRetur,
};
