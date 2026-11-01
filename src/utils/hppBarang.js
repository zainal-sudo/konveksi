/**
 * Hitung ulang harga beli (HPP) barang jadi dari komposisi + biaya non bahan.
 *
 *   brg_hrgbeli = Σ(bk_qty x harga_beli_bahan) + Σ(tbarang_nbb.nbb_jumlah)
 *
 * - Komposisi: tbarangkomposisi (bk_brg_kode = barang jadi, bk_bhn_kode bahan).
 * - Harga bahan dipilih prioritas: tbarang.brg_hrgbeli → avgcost terakhir
 *   bahan di gudang bahan GB-01 (dipakai jurnal STBJ).
 * - Non bahan: tbarang_nbb.nbb_jumlah dianggap biaya PER UNIT produksi
 *   (konsisten dengan cara jurnal STBJ memperhitungkannya).
 *
 * Barang tanpa komposisi & tanpa biaya non bahan TIDAK diupdate (harga
 * belinya tetap manual). Dipanggil di dalam transaksi yang sama dengan save.
 */
const updateHppBarang = async (conn, brgKode) => {
  // 1) komposisi bahan
  const [kom] = await conn.query(
    `SELECT bk_bhn_kode, bk_qty FROM tbarangkomposisi WHERE bk_brg_kode = ?`,
    [brgKode]
  );

  // 2) biaya non bahan baku (per unit)
  const [[nbb]] = await conn.query(
    `SELECT IFNULL(SUM(nbb_jumlah), 0) AS total FROM tbarang_nbb WHERE nbb_brg_kode = ?`,
    [brgKode]
  );

  const nbbTotal = Number(nbb?.total) || 0;
  if (kom.length === 0 && nbbTotal === 0) return null; // biarkan manual

  let bahanTotal = 0;
  for (const k of kom) {
    const qty = Number(k.bk_qty) || 0;
    if (qty <= 0) continue;

    const [[bhnRow]] = await conn.query(
      `SELECT b.brg_hrgbeli AS tbrg
         FROM tbarangkomposisi bk
         LEFT JOIN tbarang b ON b.brg_kode = bk.bk_bhn_kode
        WHERE bk.bk_brg_kode = ? AND bk.bk_bhn_kode = ?`,
      [brgKode, k.bk_bhn_kode]
    );

    let harga = Number(bhnRow?.tbrg) || 0;
    if (harga <= 0) {
      const [[ms]] = await conn.query(
        `SELECT mst_avgcost FROM tmasterstok
          WHERE mst_brg_kode = ? AND mst_gdg_kode = 'GB-01' AND mst_avgcost > 0
          ORDER BY mst_tanggal DESC, mst_id DESC LIMIT 1`,
        [k.bk_bhn_kode]
      );
      harga = Number(ms?.mst_avgcost) || 0;
    }

    bahanTotal += qty * harga;
  }

  const hpp = Math.round((bahanTotal + nbbTotal) * 100) / 100;
  await conn.query(`UPDATE tbarang SET brg_hrgbeli = ? WHERE brg_kode = ?`, [
    hpp,
    brgKode,
  ]);
  return hpp;
};

module.exports = { updateHppBarang };
