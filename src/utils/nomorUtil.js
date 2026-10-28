// ─────────────────────────────────────────────────────────────────────
// Cari nomor bebas (isi-celah) yang konsisten untuk semua modul transaksi.
// Dipakai HANYA untuk PREVIEW di getInitData — polanya PERSIS sama dengan
// fungsi simpan masing-masing (MAX + gap-fill dalam rentang), jadi angka
// preview == nomor yang akan dipakai saat simpan, selama tidak ada transaksi
// lain yang menyelip di antara buka-form dan simpan.
//
// `runner`: koneksi (conn) di dalam transaksi/lock, atau pool `db`.
// `rangeStart`/`rangeEnd`: batas bawah/atas nomor (PO Pajak 1..4999,
// Non-Pajak 5001..9999). `digit`: lebar suffix (default 4; SPK = 3).
// ─────────────────────────────────────────────────────────────────────
const AMAN = /^[A-Za-z0-9_]+$/;

const cariNomorBebas = async (
  runner,
  { tabel, kolom, prefix, rangeStart = 1, rangeEnd = 9999, digit = 4, pesanKuota }
) => {
  if (!AMAN.test(tabel) || !AMAN.test(kolom)) {
    throw new Error("Konfigurasi cariNomorBebas tidak valid.");
  }

  const [[maxRow]] = await runner.query(
    `SELECT ${kolom} AS nomor
       FROM ${tabel}
      WHERE ${kolom} LIKE ?
        AND CAST(SUBSTRING_INDEX(${kolom}, '.', -1) AS UNSIGNED) BETWEEN ? AND ?
      ORDER BY ${kolom} DESC
      LIMIT 1`,
    [`${prefix}%`, rangeStart, rangeEnd]
  );

  let nextNum = rangeStart;
  if (maxRow && maxRow.nomor) {
    const parts = String(maxRow.nomor).split(".");
    nextNum = parseInt(parts[parts.length - 1], 10) + 1;
  }

  // Isi celah di antara MAX+1 .. rangeEnd (sisa header dari save gagal /
  // entri manual) — sama seperti di fungsi simpan masing-masing modul.
  let nomorBebas = null;
  while (nextNum <= rangeEnd) {
    const kandidat = `${prefix}${String(nextNum).padStart(digit, "0")}`;
    const [[ada]] = await runner.query(
      `SELECT ${kolom} FROM ${tabel} WHERE ${kolom} = ?`,
      [kandidat]
    );
    if (!ada) {
      nomorBebas = kandidat;
      break;
    }
    nextNum++;
  }

  if (!nomorBebas) {
    throw new Error(pesanKuota || `Kuota nomor untuk periode sudah habis.`);
  }
  return nomorBebas;
};

module.exports = { cariNomorBebas };