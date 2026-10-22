const db = require("../config/database");

/**
 * Jurnal otomatis Mutasi Antar Cabang (tmutcab / tmutcabin).
 *
 * Stok & HPP diurus trigger DB (tmutcab_dtl / tmutcabin_dtl after_insert):
 * baris kartu stok tmasterstok disimpan dengan mst_hargabeli & mst_avgcost
 * = harga mutasi (HPP yang dibawa ke cabang tujuan). Jurnal di sini
 * menutup siklus nilai persediaan antar lokasi:
 *
 *  - Mutasi Cabang OUT (kirim asal, mis. pusat):
 *      Dr Persediaan Intransit (17.002)              = Σ qty x HPP
 *      Cr Persediaan barang cabang asal              = Σ qty x HPP
 *  - Mutasi Cabang IN (terima, mis. cabang AA):
 *      Dr Persediaan barang cabang tujuan            = Σ qty x HPP
 *      Cr Persediaan Intransit (17.002)              = Σ qty x HPP
 *
 * Akun persediaan tiap cabang diambil dari tcabang.cbg_rek_persediaan
 * (ditempel di master cabang). Kalau cabang belum diisi, fallback ke
 * rekening jenis barang (tgroup.gr_rek_kode), lalu ke 17.004
 * PERSEDIAAN BARANG JADI PUSAT.
 *
 * Nomor jurnal = nomor dokumen (idempotent; regenerasi saat simpan ulang).
 * HPP per baris: harga detail > 0 ? harga detail : avgcost terakhir barang
 * di gudang transaksi, fallback brg_hrgbeli.
 */

const REK_INTRANSIT = "17.002"; // PERSEDIAN INTRANSIT
const REK_PERS_FALLBACK = "17.004"; // PERSEDIAAN BARANG JADI PUSAT

const TIPE_OUT = "MTC-OUT";
const TIPE_IN = "MTC-IN";

const jurNoOf = (nomor) => nomor;

// ── HPP barang: avgcost terakhir di gudang tsb, fallback brg_hrgbeli ───
const getHppBarang = async (conn, brgKode, gudang) => {
  if (gudang) {
    const [[ms]] = await conn.query(
      `SELECT mst_avgcost FROM tmasterstok
        WHERE mst_brg_kode = ? AND mst_gdg_kode = ? AND mst_avgcost > 0
        ORDER BY mst_tanggal DESC, mst_id DESC LIMIT 1`,
      [brgKode, gudang]
    );
    if (ms && ms.mst_avgcost > 0) return Number(ms.mst_avgcost);
  }
  const [[b]] = await conn.query(
    `SELECT brg_hrgbeli FROM tbarang WHERE brg_kode = ?`,
    [brgKode]
  );
  return Number(b?.brg_hrgbeli) || 0;
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

// ── Rekening persediaan per barang (fallback tgroup) ──────────────────
const getBarangRek = async (conn, brgKodes) => {
  const placeholders = brgKodes.map(() => "?").join(",");
  const [rows] = await conn.query(
    `SELECT b.brg_kode AS kode, b.brg_nama AS nama, g.gr_rek_kode AS rek
       FROM tbarang b LEFT JOIN tgroup g ON g.gr_kode = b.brg_gr_kode
      WHERE b.brg_kode IN (${placeholders})`,
    brgKodes
  );
  const map = {};
  rows.forEach((r) => (map[r.kode] = r));
  return map;
};

// ── Tulis jurnal + assert balance ─────────────────────────────────────
// debets/kredits: { rek, ket, nilai }
const writeJurnal = async (conn, { jurNo, tanggal, tipe, keterangan, user, debets, kredits }) => {
  const totalDebet = debets.reduce((s, r) => s + r.nilai, 0);
  const totalKredit = kredits.reduce((s, r) => s + r.nilai, 0);
  if (totalDebet <= 0) return null;

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
      [jurNo, r.rek, nourut, r.ket.slice(0, 250), r.nilai]
    );
  }
  for (const r of kredits) {
    nourut++;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [jurNo, r.rek, nourut, r.ket.slice(0, 250), r.nilai]
    );
  }

  if (Math.round(totalDebet) !== Math.round(totalKredit)) {
    throw new Error(
      `Jurnal mutasi cabang ${jurNo} tidak balance (D:${totalDebet} K:${totalKredit}).`
    );
  }
  return jurNo;
};

// ── Jurnal Mutasi Cabang OUT: Dr Intransit vs Cr Persediaan asal ──────
// data: { nomor, user } — dibaca dari tmutcab_* yang sudah ter-insert.
const createAutoJurnalMutasiOut = async (conn, data) => {
  const { nomor, user } = data;

  await deleteAutoJurnalMutasiCabang(conn, nomor);

  const [[hdr]] = await conn.query(
    `SELECT mutc_tanggal, mutc_keterangan, mutc_cbg_asal, mutc_gdg_kode
       FROM tmutcab_hdr WHERE mutc_nomor = ?`,
    [nomor]
  );
  if (!hdr) throw new Error(`Mutasi cabang OUT ${nomor} tidak ditemukan.`);

  const [details] = await conn.query(
    `SELECT mutcd_brg_kode, mutcd_qty, mutcd_harga
       FROM tmutcab_dtl WHERE mutcd_mutc_nomor = ? AND mutcd_qty > 0`,
    [nomor]
  );
  if (!details.length) return null;

  const brgRekMap = await getBarangRek(conn, details.map((d) => d.mutcd_brg_kode));
  const rekCabang = await getCabangRek(conn, hdr.mutc_cbg_asal);

  // Kredit dikelompokkan per rekening persediaan cabang asal
  const kredits = [];
  let total = 0;
  for (const d of details) {
    const qty = Number(d.mutcd_qty) || 0;
    if (qty <= 0) continue;
    const harga = Number(d.mutcd_harga) > 0
      ? Number(d.mutcd_harga)
      : await getHppBarang(conn, d.mutcd_brg_kode, hdr.mutc_gdg_kode);
    if (harga <= 0) continue;
    const brg = brgRekMap[d.mutcd_brg_kode] || {};
    const rek = rekCabang || brg.rek || REK_PERS_FALLBACK;
    const nilai = Math.round(qty * harga);
    total += nilai;

    const idx = kredits.findIndex((r) => r.rek === rek);
    if (idx >= 0) kredits[idx].ket += ` + ${brg.nama || d.mutcd_brg_kode}`;
    else kredits.push({ rek, ket: brg.nama || String(d.mutcd_brg_kode), nilai });
  }
  if (total <= 0) return null;

  return writeJurnal(conn, {
    jurNo: jurNoOf(nomor),
    tanggal: hdr.mutc_tanggal,
    tipe: TIPE_OUT,
    keterangan: `Mutasi Cabang Out ${nomor}${hdr.mutc_keterangan ? ` - ${hdr.mutc_keterangan}` : ""}`,
    user,
    debets: [{ rek: REK_INTRANSIT, ket: `Persediaan Intransit ${nomor}`, nilai: total }],
    kredits,
  });
};

// ── Jurnal Mutasi Cabang IN: Dr Persediaan tujuan vs Cr Intransit ─────
// data: { nomor, user } — dibaca dari tmutcabin_* yang sudah ter-insert.
const createAutoJurnalMutasiIn = async (conn, data) => {
  const { nomor, user } = data;

  await deleteAutoJurnalMutasiCabang(conn, nomor);

  const [[hdr]] = await conn.query(
    `SELECT mutci_tanggal, mutci_nomormutasi, mutci_cbg_tujuan, mutci_gdg_kode
       FROM tmutcabin_hdr WHERE mutci_nomor = ?`,
    [nomor]
  );
  if (!hdr) throw new Error(`Mutasi cabang IN ${nomor} tidak ditemukan.`);

  const [details] = await conn.query(
    `SELECT mutcid_brg_kode, mutcid_qty, mutcid_harga
       FROM tmutcabin_dtl WHERE mutcid_mutci_nomor = ? AND mutcid_qty > 0`,
    [nomor]
  );
  if (!details.length) return null;

  const brgRekMap = await getBarangRek(conn, details.map((d) => d.mutcid_brg_kode));
  const rekCabang = await getCabangRek(conn, hdr.mutci_cbg_tujuan);

  // HPP mutasi out masangan (gudang asal) untuk fallback harga
  const outMap = {};
  if (hdr.mutci_nomormutasi) {
    const [outs] = await conn.query(
      `SELECT mutcd_nourut, mutcd_gdg_kode FROM tmutcab_dtl WHERE mutcd_mutc_nomor = ?`,
      [hdr.mutci_nomormutasi]
    );
    outs.forEach((o) => (outMap[o.mutcd_nourut] = o.mutcd_gdg_kode));
  }

  // Debit dikelompokkan per rekening persediaan cabang tujuan
  const debets = [];
  let total = 0;
  let nourutDtl = 1;
  for (const d of details) {
    const qty = Number(d.mutcid_qty) || 0;
    if (qty <= 0) { nourutDtl++; continue; }
    const harga = Number(d.mutcid_harga) > 0
      ? Number(d.mutcid_harga)
      : await getHppBarang(conn, d.mutcid_brg_kode, outMap[nourutDtl]);
    nourutDtl++;
    if (harga <= 0) continue;
    const brg = brgRekMap[d.mutcid_brg_kode] || {};
    const rek = rekCabang || brg.rek || REK_PERS_FALLBACK;
    const nilai = Math.round(qty * harga);
    total += nilai;

    const idx = debets.findIndex((r) => r.rek === rek);
    if (idx >= 0) debets[idx].ket += ` + ${brg.nama || d.mutcid_brg_kode}`;
    else debets.push({ rek, ket: brg.nama || String(d.mutcid_brg_kode), nilai });
  }
  if (total <= 0) return null;

  return writeJurnal(conn, {
    jurNo: jurNoOf(nomor),
    tanggal: hdr.mutci_tanggal,
    tipe: TIPE_IN,
    keterangan: `Mutasi Cabang In ${nomor}${hdr.mutci_nomormutasi ? ` (${hdr.mutci_nomormutasi})` : ""}`,
    user,
    debets,
    kredits: [{ rek: REK_INTRANSIT, ket: `Persediaan Intransit ${nomor}`, nilai: total }],
  });
};

// ── Hapus jurnal otomatis mutasi cabang (regenerasi saat edit) ─────────
const deleteAutoJurnalMutasiCabang = async (conn, nomor) => {
  const jurNo = jurNoOf(nomor);
  await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [jurNo]);
  await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [jurNo]);
};

// ── Validasi rekening master (cek developer) ──────────────────────────
const cekRekeningJurnal = async () => {
  const [rows] = await db.query(
    `SELECT REK_KODE, REK_NAMA FROM trekening WHERE REK_KODE = ?`,
    [REK_INTRANSIT]
  );
  return rows;
};

module.exports = {
  REK_INTRANSIT,
  REK_PERS_FALLBACK,
  TIPE_OUT,
  TIPE_IN,
  jurNoOf,
  getHppBarang,
  createAutoJurnalMutasiOut,
  createAutoJurnalMutasiIn,
  deleteAutoJurnalMutasiCabang,
  cekRekeningJurnal,
};
