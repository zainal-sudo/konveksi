// ─────────────────────────────────────────────────────────────────────
// Kunci atomik untuk generate nomor dokumen (PO, BPB, INV, RET, SPK, dst).
//
// MASALAH SEBELUMNYA: semua service generate nomor dengan pola
//   SELECT MAX(nomor) ... -> hitung next -> INSERT
// tanpa lock. Kalau 2 request datang nyaris bersamaan (double klik,
// race antar tab, dsb), keduanya bisa baca MAX yang sama dan dapat
// nomor yang SAMA -> tabrakan / data saling menimpa.
//
// FIX: pakai MySQL named lock (GET_LOCK/RELEASE_LOCK) yang di-scope per
// (jenis dokumen + periode, mis. "nomor_po_2608"), dipegang oleh
// connection yang sama dengan transaksi INSERT-nya, dan dilepas begitu
// transaksi commit/rollback. Ini tidak butuh perubahan skema tabel.
// ─────────────────────────────────────────────────────────────────────

/**
 * Ambil named lock. Lempar error kalau gagal dalam waktu timeoutSec
 * (mis. karena request lain sedang generate nomor yang sama).
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} key - nama lock, mis. "nomor_po_2608"
 * @param {number} timeoutSec
 */
const acquireLock = async (conn, key, timeoutSec = 10) => {
  const [[row]] = await conn.query(`SELECT GET_LOCK(?, ?) AS locked`, [key, timeoutSec]);
  if (!row || Number(row.locked) !== 1) {
    throw new Error("Sistem sedang memproses transaksi lain dengan nomor yang sama. Silakan coba lagi.");
  }
};

/**
 * Lepas named lock. Dipanggil di finally, aman dipanggil walau lock
 * tidak pernah didapat (RELEASE_LOCK akan return 0/NULL saja).
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {string} key
 */
const releaseLock = async (conn, key) => {
  try {
    await conn.query(`SELECT RELEASE_LOCK(?)`, [key]);
  } catch (_) {
    // Jangan sampai error saat release lock menutupi error asli.
  }
};

module.exports = { acquireLock, releaseLock };
