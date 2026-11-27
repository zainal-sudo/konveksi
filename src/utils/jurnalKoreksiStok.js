const db = require("../config/database");

/**
 * Jurnal otomatis Koreksi Stok (tkor_hdr / tkor_dtl).
 *
 * Penyesuaian stok bisa bernilai POSITIF (selisih bertambah, fisik > sistem)
 * atau NEGATIF (selisih berkurang, fisik < sistem).
 *
 * Aturan Penjurnalan:
 * 1. Koreksi POSITIF (Qty > 0):
 *    Dr. Akun Persediaan (diambil dari tgroup.gr_rek_kode / tcabang / fallback)
 *    Cr. Akun Selisih Persediaan / Pendapatan Lain-lain / Beban Penyesuaian (bisa dikonfigurasi, default '71.002' / '1.7.02' atau akun selisih persediaan).
 *
 * 2. Koreksi NEGATIF (Qty < 0):
 *    Dr. Akun Selisih Persediaan / Beban Penyesuaian Stok (default '71.002' atau sejenisnya)
 *    Cr. Akun Persediaan
 *
 * Karena penyesuaian stok dalam 1 nota koreksi bisa berisi banyak barang
 * dengan akun persediaan berbeda, nilai diakumulasikan per akun persediaan.
 */

const REK_DEFAULT_SELISIH = "71.002"; // Akun selisih persediaan / beban penyesuaian default
const REK_DEFAULT_PERSEDIAAN = "17.004"; // Fallback persediaan

const jurNoOf = (nomor) => nomor;

// ── Ambil rekening persediaan per barang (lewat tgroup) ────────────────
const getBarangRek = async (conn, brgKodes) => {
  if (!brgKodes.length) return {};
  const placeholders = brgKodes.map(() => "?").join(",");
  const [rows] = await conn.query(
    `SELECT b.brg_kode AS kode, g.gr_rek_kode AS rek
       FROM tbarang b LEFT JOIN tgroup g ON g.gr_kode = b.brg_gr_kode
      WHERE b.brg_kode IN (${placeholders})`,
    brgKodes
  );
  const map = {};
  rows.forEach((r) => {
    map[r.kode] = String(r.rek || "").trim() || REK_DEFAULT_PERSEDIAAN;
  });
  return map;
};

// ── Tulis jurnal + assert balance ─────────────────────────────────────
const writeJurnal = async (conn, { jurNo, tanggal, tipe, keterangan, user, debets, kredits }) => {
  const totalDebet = debets.reduce((s, r) => s + r.nilai, 0);
  const totalKredit = kredits.reduce((s, r) => s + r.nilai, 0);
  if (totalDebet <= 0 || totalKredit <= 0) return null;

  await conn.query(
    `INSERT INTO tjurnal
       (jur_no, jur_tanggal, jur_tipetransaksi, jur_keterangan,
        jur_isclosed, date_create, user_create)
     VALUES (?, ?, ?, ?, 0, NOW(), ?)`,
    [jurNo, tanggal, tipe, keterangan || tipe, user || "SYSTEM"]
  );

  let nourut = 0;
  for (const r of debets) {
    nourut++;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [jurNo, r.rek, nourut, (r.ket || tipe).slice(0, 250), r.nilai]
    );
  }
  for (const r of kredits) {
    nourut++;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [jurNo, r.rek, nourut, (r.ket || tipe).slice(0, 250), r.nilai]
    );
  }

  if (Math.round(totalDebet) !== Math.round(totalKredit)) {
    throw new Error(
      `Jurnal koreksi stok ${jurNo} tidak balance (D:${totalDebet} K:${totalKredit}).`
    );
  }
  return jurNo;
};

// ── Buat/Perbarui jurnal otomatis koreksi stok ─────────────────────────
const createAutoJurnalKoreksiStok = async (conn, data) => {
  const { nomor, user } = data;

  await deleteAutoJurnalKoreksiStok(conn, nomor);

  const [[hdr]] = await conn.query(
    `SELECT korh_tanggal, korh_notes, korh_gdg_kode
       FROM tkor_hdr WHERE korh_nomor = ?`,
    [nomor]
  );
  if (!hdr) throw new Error(`Koreksi stok ${nomor} tidak ditemukan.`);

  const [details] = await conn.query(
    `SELECT kord_brg_kode, kord_qty, kord_harga, kord_nilai, kord_satuan
       FROM tkor_dtl WHERE kord_korh_nomor = ? AND kord_qty <> 0`,
    [nomor]
  );
  if (!details.length) return null;

  const brgKodes = details.map((d) => d.kord_brg_kode);
  const brgRekMap = await getBarangRek(conn, brgKodes);

  // Pisahkan antara koreksi positif (qty > 0) dan negatif (qty < 0) atau kelompokkan per akun
  // Qty > 0: Penambahan persediaan (Dr. Persediaan, Cr. Selisih Persediaan)
  // Qty < 0: Pengurangan persediaan (Dr. Selisih Persediaan, Cr. Persediaan)
  
  let debetsMap = {};
  let kreditsMap = {};

  for (const d of details) {
    const qty = Number(d.kord_qty) || 0;
    const nilai = Math.abs(Number(d.kord_nilai) || (qty * (Number(d.kord_harga) || 0)));
    if (nilai <= 0) continue;

    const rekBarang = brgRekMap[d.kord_brg_kode] || REK_DEFAULT_PERSEDIAAN;
    const ketItem = `Koreksi stok ${nomor} - Brg: ${d.kord_brg_kode} (${qty} ${d.kord_satuan || ''})`;

    if (qty > 0) {
      // Tambah stok: Dr. Persediaan, Cr. Selisih Persediaan
      debetsMap[rekBarang] = (debetsMap[rekBarang] || 0) + nilai;
      kreditsMap[REK_DEFAULT_SELISIH] = (kreditsMap[REK_DEFAULT_SELISIH] || 0) + nilai;
    } else {
      // Kurang stok: Dr. Selisih Persediaan, Cr. Persediaan
      debetsMap[REK_DEFAULT_SELISIH] = (debetsMap[REK_DEFAULT_SELISIH] || 0) + nilai;
      kreditsMap[rekBarang] = (kreditsMap[rekBarang] || 0) + nilai;
    }
  }

  const debets = Object.keys(debetsMap).map((rek) => ({
    rek,
    ket: hdr.korh_notes || `Penyesuaian Stok ${nomor}`,
    nilai: debetsMap[rek],
  }));

  const kredits = Object.keys(kreditsMap).map((rek) => ({
    rek,
    ket: hdr.korh_notes || `Penyesuaian Stok ${nomor}`,
    nilai: kreditsMap[rek],
  }));

  if (!debets.length || !kredits.length) return null;

  const jurNo = jurNoOf(nomor);
  return await writeJurnal(conn, {
    jurNo,
    tanggal: hdr.korh_tanggal,
    tipe: "KOR",
    keterangan: hdr.korh_notes || `Penyesuaian Stok ${nomor}`,
    user,
    debets,
    kredits,
  });
};

// ── Hapus jurnal otomatis koreksi stok ─────────────────────────────────
const deleteAutoJurnalKoreksiStok = async (conn, nomor) => {
  const jurNo = jurNoOf(nomor);
  await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [jurNo]);
  await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [jurNo]);
};

module.exports = {
  createAutoJurnalKoreksiStok,
  deleteAutoJurnalKoreksiStok,
};
