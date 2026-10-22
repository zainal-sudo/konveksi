const db = require("../config/database");

/**
 * Jurnal otomatis STBJ (Surat Tanda Bukti Jadi) — produksi barang jadi.
 *
 * Barang jadi terbentuk dari komposisi (tbarangkomposisi) dan biaya non
 * bahan baku (tbarang_nbb). Stok sudah diurus trigger DB
 * (trg_after_insert_tstbj_dtl / trg_before_delete_tstbj_dtl); jurnal di sini
 * hanya mencatat nilai:
 *
 *   Dr Persediaan Barang Jadi (rekening jenis barang BJ)  = HPP batch
 *   Cr Persediaan Bahan       (rekening jenis barang bahan) = bahan keluar
 *   Cr Biaya Produksi (23.001)                             = biaya non bahan
 *
 * Rumus (sejalan dengan cara trigger membanduh HPP):
 *   nilai bahan batch = Σ(bk_qty x avg_cost_bahan) x jumlah
 *   avg_cost_bahan    = avgcost terakhir bahan di GB-01, fallback brg_hrgbeli
 *   nilai nbb         = Σ(tbarang_nbb.nbb_jumlah) x jumlah  (biaya per unit)
 *   HPP batch         = nilai bahan batch + nilai nbb
 *   => Pj Barang Jadi = Pj Bahan + Biaya Produksi (selalu balance)
 *
 * Nomor jurnal = nomor STBJ (idempotent, regenerasi saat edit).
 */

const REK_HUTANG_UPAH = "19.004"; // HUTANG UPAH / GAJI
const REK_BJ_FALLBACK = "17.004"; // PERSEDIAAN BARANG JADI
const REK_BAHAN_FALLBACK = "17.005"; // PERSEDIAAN BAHAN

const AUTO_TIPE = "STBJ";

const jurNoOf = (stbjNomor) => stbjNomor;

// ── Harga pokok bahan per unit (mengikuti cara trigger memilih avg cost) ─
const getAvgCostBahan = async (conn, bhnKode) => {
  const [[ms]] = await conn.query(
    `SELECT mst_avgcost FROM tmasterstok
      WHERE mst_brg_kode = ? AND mst_gdg_kode = 'GB-01' AND mst_avgcost > 0
      ORDER BY mst_tanggal DESC, mst_id DESC LIMIT 1`,
    [bhnKode]
  );
  if (ms && ms.mst_avgcost > 0) return Number(ms.mst_avgcost);

  const [[b]] = await conn.query(
    `SELECT brg_hrgbeli FROM tbarang WHERE brg_kode = ?`,
    [bhnKode]
  );
  return Number(b?.brg_hrgbeli) || 0;
};

// ── Buat/Perbarui jurnal otomatis STBJ ─────────────────────────────────
// data: { nomor, tanggal, keterangan, user }
// Detail stbj dibaca langsung dari DB (stbjd sudah ter-insert saat ini dipanggil).
const createAutoJurnalStbj = async (conn, data) => {
  const { nomor, tanggal, keterangan, user } = data;

  await deleteAutoJurnalStbj(conn, nomor);

  const [details] = await conn.query(
    `SELECT stbjd_brg_kode, stbjd_jumlah FROM tstbj_dtl
      WHERE stbjd_stbj_nomor = ? AND stbjd_jumlah > 0`,
    [nomor]
  );
  if (!details.length) return null;

  const bjKodes = details.map((d) => d.stbjd_brg_kode);
  const placeholders = bjKodes.map(() => "?").join(",");

  // Rekening persediaan tiap barang jadi
  const [bjRek] = await conn.query(
    `SELECT b.brg_kode AS kode, b.brg_nama AS nama, g.gr_rek_kode AS rek
       FROM tbarang b LEFT JOIN tgroup g ON g.gr_kode = b.brg_gr_kode
      WHERE b.brg_kode IN (${placeholders})`,
    bjKodes
  );
  const bjRekMap = {};
  bjRek.forEach((r) => (bjRekMap[r.kode] = r));

  // Komposisi bahan semua BJ dalam STBJ ini
  const [komposisi] = await conn.query(
    `SELECT bk_brg_kode, bk_bhn_kode, bk_qty
       FROM tbarangkomposisi
      WHERE bk_brg_kode IN (${placeholders})
      ORDER BY bk_brg_kode, bk_nourut`,
    bjKodes
  );
  const komMap = {};
  komposisi.forEach((k) => {
    if (!komMap[k.bk_brg_kode]) komMap[k.bk_brg_kode] = [];
    komMap[k.bk_brg_kode].push(k);
  });

  // Biaya non bahan baku per barang jadi (biaya per unit produksi)
  const [nbbRows] = await conn.query(
    `SELECT nbb_brg_kode, IFNULL(SUM(nbb_jumlah), 0) AS total
       FROM tbarang_nbb
      WHERE nbb_brg_kode IN (${placeholders})
      GROUP BY nbb_brg_kode`,
    bjKodes
  );
  const nbbMap = {};
  nbbRows.forEach((n) => (nbbMap[n.nbb_brg_kode] = Number(n.total) || 0));

  // Kumpulkan semua kode bahan, lalu rekening + avg cost masing-masing
  const bhnKodes = [...new Set(komposisi.map((k) => k.bk_bhn_kode))];
  const bhnMap = {};
  for (const bhn of bhnKodes) {
    const [[br]] = await conn.query(
      `SELECT b.brg_nama AS nama, g.gr_rek_kode AS rek
         FROM tbarang b LEFT JOIN tgroup g ON g.gr_kode = b.brg_gr_kode
        WHERE b.brg_kode = ?`,
      [bhn]
    );
    bhnMap[bhn] = {
      nama: br?.nama || "",
      rek: br?.rek || REK_BAHAN_FALLBACK,
      avgCost: await getAvgCostBahan(conn, bhn),
    };
  }

  // ── Susun baris: Dr barang jadi vs Cr bahan + Cr biaya produksi ──────
  const debit = []; // { rek, nama, ket, nilai }
  const kredit = []; // { rek, nama, ket, nilai }
  let totalDebet = 0;
  let totalKredit = 0;

  for (const d of details) {
    const jumlah = Number(d.stbjd_jumlah) || 0;
    if (jumlah <= 0) continue;

    const bj = bjRekMap[d.stbjd_brg_kode] || {};
    const lst = komMap[d.stbjd_brg_kode] || [];

    // Cr bahan: nilai bahan yang keluar dari komposisi x jumlah produksi
    for (const k of lst) {
      const bhn = bhnMap[k.bk_bhn_kode];
      if (!bhn) continue;
      const nilai = (Number(k.bk_qty) || 0) * bhn.avgCost * jumlah;
      if (nilai === 0) continue;
      const idx = kredit.findIndex((r) => r.rek === bhn.rek);
      if (idx >= 0) {
        kredit[idx].nilai += nilai;
        kredit[idx].nama += ` + ${bhn.nama}`;
      } else {
        kredit.push({ rek: bhn.rek, nama: bhn.nama, ket: `Bahan produksi ${nomor}`, nilai });
      }
      totalKredit += nilai;
    }

    // Cr hutang upah: biaya non bahan baku x qty produksi (per unit)
    const nbbPerUnit = nbbMap[d.stbjd_brg_kode] || 0;
    const nbb = nbbPerUnit > 0 ? nbbPerUnit * jumlah : 0;
    if (nbb > 0) {
      const idx = kredit.findIndex((r) => r.rek === REK_HUTANG_UPAH);
      if (idx >= 0) kredit[idx].nilai += nbb;
      else kredit.push({ rek: REK_HUTANG_UPAH, nama: "HUTANG UPAH", ket: `Hutang upah produksi ${nomor}`, nilai: nbb });
      totalKredit += nbb;
    }

    // Dr barang jadi: HPP = bahan + biaya produksi (otomatis balance)
    const bahanBatch = lst.reduce(
      (s, k) => s + (Number(k.bk_qty) || 0) * (bhnMap[k.bk_bhn_kode]?.avgCost || 0) * jumlah,
      0
    );
    const nilai = bahanBatch + nbb;
    const idx = debit.findIndex((r) => r.rek === (bj.rek || REK_BJ_FALLBACK));
    if (idx >= 0) {
      debit[idx].nilai += nilai;
      debit[idx].nama += ` + ${bj.nama || ""}`;
    } else {
      debit.push({
        rek: bj.rek || REK_BJ_FALLBACK,
        nama: bj.nama || "",
        ket: `Produksi ${d.stbjd_brg_kode}`,
        nilai,
      });
    }
    totalDebet += nilai;
  }

  if (totalDebet <= 0) return null;

  const jurNo = jurNoOf(nomor);

  await conn.query(
    `INSERT INTO tjurnal
       (jur_no, jur_tanggal, jur_tipetransaksi, jur_keterangan,
        jur_isclosed, date_create, user_create)
     VALUES (?, ?, ?, ?, 0, NOW(), ?)`,
    [
      jurNo,
      tanggal,
      AUTO_TIPE,
      keterangan || "Produksi Barang Jadi",
      user || "SYSTEM",
    ]
  );

  let nourut = 0;
  for (const r of debit) {
    nourut++;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [jurNo, r.rek, nourut, r.nama ? `Produksi ${r.nama}`.slice(0, 250) : r.ket, Math.round(r.nilai)]
    );
  }
  for (const r of kredit) {
    nourut++;
    await conn.query(
      `INSERT INTO tjurnalitem
         (jurd_jur_no, jurd_rek_kode, jurd_nourut, jurd_keterangan, jurd_debet, jurd_kredit)
       VALUES (?, ?, ?, ?, 0, ?)`,
      [jurNo, r.rek, nourut, r.ket, Math.round(r.nilai)]
    );
  }

  if (Math.round(totalDebet) !== Math.round(totalKredit)) {
    throw new Error(
      `Jurnal STBJ tidak balance (D:${Math.round(totalDebet)} K:${Math.round(totalKredit)}) untuk ${nomor}.`
    );
  }

  return jurNo;
};

// ── Hapus jurnal otomatis STBJ (dipakai juga saat edit → regenerasi) ───
const deleteAutoJurnalStbj = async (conn, nomor) => {
  const jurNo = jurNoOf(nomor);
  await conn.query(`DELETE FROM tjurnalitem WHERE jurd_jur_no = ?`, [jurNo]);
  await conn.query(`DELETE FROM tjurnal WHERE jur_no = ?`, [jurNo]);
};

// ── Validasi rekening masternya ada (dipanggil saat service init/test) ─
const cekRekeningJurnal = async () => {
  const [rows] = await db.query(
    `SELECT REK_KODE, REK_NAMA FROM trekening WHERE REK_KODE IN (?, ?, ?) ORDER BY REK_KODE`,
    [REK_HUTANG_UPAH, REK_BJ_FALLBACK, REK_BAHAN_FALLBACK]
  );
  return rows;
};

module.exports = {
  REK_HUTANG_UPAH,
  REK_BJ_FALLBACK,
  REK_BAHAN_FALLBACK,
  AUTO_TIPE,
  jurNoOf,
  createAutoJurnalStbj,
  deleteAutoJurnalStbj,
  cekRekeningJurnal,
};
