const db = require("../config/database");

/**
 * Jurnal otomatis Pembayaran Supplier (tipetransaksi 'Pembayaran Supplier').
 *
 * Semula dibuat oleh trigger DB (tbayarsup_hdr_after_insert / after_update)
 * dan dipindah ke sini agar jalur & penghapusan jurnal bisa diuji dan
 * dibersihkan dari satu tempat (service).
 *
 * Pola (identik perilaku trigger lama):
 *   Dr Hutang Dagang (19.002)           -> total pembayaran
 *   Cr Rekening kas/bank DIPILIH FORM   -> total pembayaran
 *      (jika kelompok rekening 12/13, barisnya diberi cost center F0001)
 *
 * Untuk giro, tanggal jurnal = tgl cair (perilaku trigger after_update lama).
 * Nomor jurnal = nomor nota bayar (idempotent, hapus+buat ulang saat edit).
 */

const REK_HUTANG = "19.002"; // HUTANG DAGANG
const AUTO_TIPE = "Pembayaran Supplier";

const CC_GUDANG = "F0001";

const jurNoOf = (bysNomor) => bysNomor;

// ── Buat/Perbarui jurnal otomatis pembayaran ──────────────────────────
// data: { nomor, tanggal, rekKode, total, noGiro, tglCair, supNama, user }
const createAutoJurnalPembayaran = async (conn, data) => {
  const { nomor, tanggal, rekKode, total, noGiro, tglCair, supNama, user } = data;

  await deleteAutoJurnalPembayaran(conn, nomor);

  const nilai = Math.round(Number(total) || 0);
  if (nilai <= 0) return null;

  // Kolom kelompok rekening dipilih (mengikuti logika trigger lama)
  const [[rek]] = await conn.query(
    `SELECT rek_kol_id FROM trekening WHERE rek_kode = ? LIMIT 1`,
    [rekKode]
  );

  // Tanggal jurnal: giro pakai tgl cair, non-giro pakai tanggal bayar
  const jurTanggal = noGiro ? tglCair || tanggal : tanggal;

  const jurNo = jurNoOf(nomor);

  await conn.query(
    `INSERT INTO tjurnal
       (jur_no, jur_tanggal, jur_tipetransaksi, jur_keterangan,
        jur_isclosed, date_create, user_create)
     VALUES (?, ?, ?, ?, 0, NOW(), ?)`,
    [
      jurNo,
      jurTanggal,
      AUTO_TIPE,
      `Pembayaran Supplier ${supNama || ""}`.trim(),
      user || "SYSTEM",
    ]
  );

  let totalDebet = 0;
  let totalKredit = 0;

  await conn.query(
    `INSERT INTO tjurnalitem
       (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
     VALUES (?, ?, 1, ?, ?, 0)`,
    [jurNo, REK_HUTANG, `Hutang dibayar ${nomor}`.slice(0, 250), nilai]
  );
  totalDebet += nilai;

  const pakaiCc = rek && [12, 13].includes(Number(rek.rek_kol_id));
  await conn.query(
    pakaiCc
      ? `INSERT INTO tjurnalitem
           (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit, jurd_cc_kode)
         VALUES (?, ?, 2, ?, 0, ?, ?)`
      : `INSERT INTO tjurnalitem
           (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
         VALUES (?, ?, 2, ?, 0, ?)`,
    pakaiCc ? [jurNo, rekKode, `Bayar via ${rekKode}`.slice(0, 250), nilai, CC_GUDANG] : [jurNo, rekKode, `Bayar via ${rekKode}`.slice(0, 250), nilai]
  );
  totalKredit += nilai;

  if (totalDebet !== totalKredit) {
    throw new Error(
      `Jurnal Pembayaran tidak balance (D:${totalDebet} K:${totalKredit}) untuk ${nomor}.`
    );
  }

  return jurNo;
};

// ── Hapus jurnal otomatis pembayaran (dipakai juga saat edit → regenerasi) ─
const deleteAutoJurnalPembayaran = async (conn, nomor) => {
  const jurNo = jurNoOf(nomor);
  await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [jurNo]);
  await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [jurNo]);
};

// ── Validasi rekening hutangnya ada (dipanggil saat service init/test) ─
const cekRekeningJurnal = async () => {
  const [rows] = await db.query(
    `SELECT REK_KODE, REK_NAMA FROM trekening WHERE REK_KODE = ?`,
    [REK_HUTANG]
  );
  return rows;
};

module.exports = {
  REK_HUTANG,
  AUTO_TIPE,
  jurNoOf,
  createAutoJurnalPembayaran,
  deleteAutoJurnalPembayaran,
  cekRekeningJurnal,
};
