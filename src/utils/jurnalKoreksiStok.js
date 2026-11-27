const db = require("../config/database");

/**
 * Jurnal otomatis Koreksi Stok (tkor_hdr / tkor_dtl).
 *
 * Penyesuaian stok bisa bernilai POSITIF (selisih bertambah, fisik > sistem)
 * atau NEGATIF (selisih berkurang, fisik < sistem).
 *
 * Aturan Penjurnalan:
 * 1. Koreksi POSITIF (Qty > 0):
 *    Dr. Akun Persediaan gudang vs Cr. 23.016 BY PENYESUAIAN STOK
 * 2. Koreksi NEGATIF (Qty < 0):
 *    Dr. 23.016 BY PENYESUAIAN STOK vs Cr. Akun Persediaan gudang
 *
 * Akun persediaan diambil dari gudang transaksi (tgudang.gdg_rek_persediaan).
 * Kalau gudang belum diset, fallback ke akun persediaan cabang gudang
 * (tcabang.cbg_rek_persediaan), lalu ke akun jenis barang (tgroup.gr_rek_kode),
 * lalu 17.004. Jadi koreksi di gudang cabang AA (17.006) / CC (17.007) tidak
 * lagi menumpuk ke persediaan pusat (17.004).
 */

const REK_SELISIH = "23.016"; // BY PENYESUAIAN STOK
const REK_DEFAULT_PERSEDIAAN = "17.004"; // Fallback persediaan (pusat)

const jurNoOf = (nomor) => nomor;

// ── Akun persediaan untuk satu gudang ─────────────────────────────────
// Urutan: setting gudang → akun persediaan cabang gudang → null (nanti
// fallback ke akun jenis barang per item).
const getGudangRek = async (conn, gdgKode) => {
  if (!gdgKode) return null;
  const [[g]] = await conn.query(
    `SELECT gdg_cbg_kode, gdg_rek_persediaan FROM tgudang WHERE gdg_kode = ?`,
    [gdgKode]
  );
  const rekGdg = String(g?.gdg_rek_persediaan || "").trim();
  if (rekGdg) return rekGdg;
  if (g?.gdg_cbg_kode) {
    const [[c]] = await conn.query(
      `SELECT cbg_rek_persediaan FROM tcabang WHERE cbg_kode = ?`,
      [g.gdg_cbg_kode]
    );
    const rekCbg = String(c?.cbg_rek_persediaan || "").trim();
    if (rekCbg) return rekCbg;
  }
  return null;
};

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

  // Akun persediaan utama = gudang transaksi (fallback per barang di bawah)
  const rekGudang = await getGudangRek(conn, hdr.korh_gdg_kode);
  const brgKodes = details.map((d) => d.kord_brg_kode);
  const brgRekMap = await getBarangRek(conn, brgKodes);

  // Qty > 0: Penambahan persediaan (Dr. Persediaan, Cr. Selisih Persediaan)
  // Qty < 0: Pengurangan persediaan (Dr. Selisih Persediaan, Cr. Persediaan)
  // Dihitung net per akun supaya nota campuran (ada + dan -) tidak gross-up.
  let netMap = {};

  for (const d of details) {
    const qty = Number(d.kord_qty) || 0;
    const nilai = Math.abs(Number(d.kord_nilai) || (qty * (Number(d.kord_harga) || 0)));
    if (nilai <= 0) continue;

    const rekBarang = rekGudang || brgRekMap[d.kord_brg_kode] || REK_DEFAULT_PERSEDIAAN;

    if (qty > 0) {
      // Tambah stok: Dr. Persediaan, Cr. Selisih Persediaan
      netMap[rekBarang] = (netMap[rekBarang] || 0) + nilai;
      netMap[REK_SELISIH] = (netMap[REK_SELISIH] || 0) - nilai;
    } else {
      // Kurang stok: Dr. Selisih Persediaan, Cr. Persediaan
      netMap[REK_SELISIH] = (netMap[REK_SELISIH] || 0) + nilai;
      netMap[rekBarang] = (netMap[rekBarang] || 0) - nilai;
    }
  }

  const ket = hdr.korh_notes || `Penyesuaian Stok ${nomor}`;
  const debets = [];
  const kredits = [];
  for (const rek of Object.keys(netMap)) {
    const v = Math.round(netMap[rek]);
    if (v > 0) debets.push({ rek, ket, nilai: v });
    else if (v < 0) kredits.push({ rek, ket, nilai: -v });
  }

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
